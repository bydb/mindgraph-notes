// Schutzgrenzen der Agent-Shell, vom Betriebssystem erzwungen — nicht vom Prompt und
// nicht von einer Befehls-Sperrliste (Python löscht dieselbe Datei ohne `rm`).
//
// macOS: `sandbox-exec` mit einem SBPL-Profil. Empirisch geprüft (13.09.2026, macOS 26.6):
// „(deny default)" bricht jeden Prozess beim Start ab (Exit 134); tragfähig ist
// „(allow default)" plus gezielte Verbote. Die letzte passende Regel gewinnt — die
// Reihenfolge im Profil ist deshalb Teil der Sicherheit.
//
// Andere Plattformen: KEIN Schutz verfügbar → die Shell startet nicht (fail-closed).
// Linux via bubblewrap ist der nächste Schritt, aber ungetestet ist kein Schutz.
import { promises as fs, existsSync } from 'fs'
import * as path from 'path'
import { homedir, tmpdir } from 'os'
import { spawn } from 'child_process'
import { randomBytes } from 'crypto'

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec'

export interface SandboxSpec {
  /** Einziger Schreibort (Temp-Ordner liegt darin). Muss ein absoluter, realer Pfad sein. */
  workDir: string
  vaultPath: string
  /** Zusätzlich lesbare Pfade: Anhänge des Laufs oder der Vault. */
  readPaths: string[]
  network: boolean
  home?: string
  /** Für Tests: Interpreter, die außerhalb der Systempfade liegen (z.B. node unter ~). */
  extraReadPaths?: string[]
}

export function sandboxAvailability(): { ok: true } | { ok: false; reason: string } {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'Die Schutzgrenzen der Shell werden derzeit nur auf macOS erzwungen (sandbox-exec). Ohne erzwungenen Schutz startet die Shell nicht.' }
  }
  if (!existsSync(SANDBOX_EXEC)) {
    return { ok: false, reason: `${SANDBOX_EXEC} fehlt — ohne erzwungenen Schutz startet die Shell nicht.` }
  }
  return { ok: true }
}

function sbString(p: string): string {
  if (/[\n\r\0]/.test(p)) throw new Error('Pfad mit Zeilenumbruch oder NUL ist im Sandbox-Profil nicht erlaubt')
  return `"${p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
const subpaths = (paths: string[]) => paths.map(p => `(subpath ${sbString(p)})`).join(' ')

/**
 * SBPL-Profil. Reihenfolge = Vorrang (spätere Regel gewinnt):
 * 1. alles erlauben (Prozessstart, dyld, Mach-Dienste)
 * 2. Netz verbieten (sofern nicht freigegeben)
 * 3. Schreiben verbieten, dann nur Arbeitsordner + /dev/null + tty erlauben
 * 4. Lesen verbieten: Home, Volumes, Temp-Orte, Vault
 * 5. Lesen erlauben: Werkzeugketten in Home (nvm/pyenv/pip-user), Anhänge bzw. Vault
 * 6. Lesen verbieten: <Vault>/.mindgraph (E-Mails, Kontakte, Sync-Manifeste) — auch bei Vault-Freigabe
 * 7. Lesen erlauben: Arbeitsordner (liegt in .mindgraph, darum zuletzt)
 * 8. Metadaten (stat) überall — sonst scheitern Pfadauflösung und Python-Importe
 */
export function buildSandboxProfile(spec: SandboxSpec): string {
  const home = spec.home ?? homedir()
  for (const p of [spec.workDir, spec.vaultPath, ...spec.readPaths, ...(spec.extraReadPaths ?? [])]) {
    if (!path.isAbsolute(p)) throw new Error(`Sandbox-Profil braucht absolute Pfade: ${p}`)
  }
  const toolchains = ['.local/bin', '.nvm', '.pyenv', 'Library/Python'].map(d => path.join(home, d))
  const lines = [
    '(version 1)',
    '(allow default)',
    spec.network ? '' : '(deny network*)',
    '(deny file-write*)',
    `(allow file-write* ${subpaths([spec.workDir])} (literal "/dev/null") (regex #"^/dev/tty"))`,
    `(deny file-read* ${subpaths([home, '/Volumes', '/private/tmp', '/tmp', '/private/var/folders', '/var/folders', spec.vaultPath])})`,
    `(allow file-read* ${subpaths([...toolchains, ...spec.readPaths, ...(spec.extraReadPaths ?? [])])})`,
    `(deny file-read* ${subpaths([path.join(spec.vaultPath, '.mindgraph')])})`,
    `(allow file-read* ${subpaths([spec.workDir])})`,
    '(allow file-read-metadata)'
  ]
  return lines.filter(Boolean).join('\n') + '\n'
}

export function sandboxedCommand(profilePath: string, executable: string, args: string[]): { executable: string; args: string[] } {
  const avail = sandboxAvailability()
  if (!avail.ok) throw new Error(avail.reason)
  return { executable: SANDBOX_EXEC, args: ['-f', profilePath, executable, ...args] }
}

/**
 * Selbsttest VOR der Freigabe: eine Kanarien-Datei außerhalb des erlaubten Bereichs darf
 * nicht lesbar sein, der Arbeitsordner muss beschreibbar sein, daneben nicht. Schlägt das
 * fehl, gibt es keinen Shell-Lauf — ein Profil, das still nicht greift, wäre der
 * schlimmste Fall („geschützt" im Dialog, frei in Wirklichkeit).
 */
export async function verifySandbox(profilePath: string, workDir: string): Promise<void> {
  const canaryDir = await fs.mkdtemp(path.join(tmpdir(), 'mindgraph-sandbox-canary-'))
  const canary = path.join(canaryDir, `canary-${randomBytes(6).toString('hex')}.txt`)
  await fs.writeFile(canary, 'darf nicht lesbar sein')
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
  const script = [
    `r=denied; cat ${q(canary)} >/dev/null 2>&1 && r=ALLOWED`,
    `w=failed; echo ok > ${q(path.join(workDir, '.sandbox-selftest'))} 2>/dev/null && w=ok`,
    `o=denied; echo x > ${q(path.join(canaryDir, 'leak'))} 2>/dev/null && o=ALLOWED`,
    'echo "read=$r write=$w outside=$o"'
  ].join('\n')
  try {
    const { executable, args } = sandboxedCommand(profilePath, '/bin/bash', ['--noprofile', '--norc', '-c', script])
    const out = await new Promise<string>((resolve, reject) => {
      const child = spawn(executable, args, { cwd: workDir, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Selbsttest der Sandbox hat nicht geantwortet')) }, 10_000)
      child.stdout.on('data', d => { stdout += d })
      child.stderr.on('data', d => { stderr += d })
      child.on('error', e => { clearTimeout(timer); reject(e) })
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`Selbsttest der Sandbox endete mit Exit ${code}: ${stderr.trim()}`)) })
    })
    const line = out.trim()
    if (line !== 'read=denied write=ok outside=denied') {
      throw new Error(`Selbsttest der Sandbox fehlgeschlagen (${line || 'keine Ausgabe'})`)
    }
  } finally {
    await fs.rm(canaryDir, { recursive: true, force: true })
    await fs.rm(path.join(workDir, '.sandbox-selftest'), { force: true })
  }
}
