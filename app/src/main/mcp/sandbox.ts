// Schutzgrenzen für lokale MCP-Programme (stdio), vom Betriebssystem erzwungen — E20/E21 in
// docs/codex-collab/mcp-anbindung.md. Bewusst ein EIGENES Profil und nicht
// `buildSandboxProfile` der Agent-Shell mit anderen Parametern: die Shell gibt pauschal
// Werkzeugketten unter ~ frei (.nvm, .pyenv, …) — ein fremdes Programm soll das nicht (F13).
//
// Gemessen am 14.11.2026 (Abschnitt 0a, macOS 26.6): Der Vault-Server (Node + jsdom, 19 Werkzeuge)
// startet in diesem Profil in 360–510 ms; Vault lesen geht, `.mindgraph`, `~/.zshrc`, Netz und
// Schreiben im Vault scheitern mit EPERM bzw. „fetch failed".
import { promises as fs } from 'fs'
import * as path from 'path'
import * as net from 'net'
import { homedir, tmpdir } from 'os'
import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { SANDBOX_EXEC, sandboxAvailability } from '../noteAgent/shellSandbox'

export { sandboxAvailability as mcpSandboxAvailability }

export interface McpSandboxSpec {
  /** Einziger Schreibort des Prozesses. Absolut, real. Darf nicht im Programmordner liegen. */
  workDir: string
  /** Programmordner: lesbar, nie beschreibbar (E22). */
  programDir: string
  /** Ausführbare Datei (real). Liegt sie unter ~, wird ihre Installation lesbar (siehe unten). */
  command: string
  /** Einstiegsskript (real), falls vorhanden. */
  script?: string
  /** Weitere vom Nutzer bestätigte Lesepfade (real). */
  extraReadPaths: string[]
  /**
   * Der geöffnete Vault — IMMER übergeben, wenn einer offen ist, auch ohne Lesefreigabe: er wird
   * dann ausdrücklich gesperrt. Liegt er außerhalb des Benutzerordners (z.B. /opt/notizen),
   * würde `(allow default)` ihn sonst samt .mindgraph lesbar lassen (Codex F03 der Code-Prüfung).
   */
  vaultPath?: string
  /** Darf der Server den Vault lesen (E20)? `.mindgraph` bleibt in jedem Fall gesperrt. */
  vaultRead?: boolean
  /**
   * Alle Vaults, die der Main kennt (approvedVaultRoots) — immer gesperrt samt .mindgraph, auch
   * wenn kein `vaultPath` übergeben wird (Codex F10 der Code-Prüfung). Der Renderer kann den
   * Schutz so nicht durch Weglassen des Vault-Pfads aushebeln.
   */
  knownVaults?: string[]
  network: boolean
  home?: string
}

function sbString(p: string): string {
  if (/[\n\r\0]/.test(p)) throw new Error('Pfad mit Zeilenumbruch oder NUL ist im Sandbox-Profil nicht erlaubt')
  return `"${p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
const subpaths = (paths: string[]) => paths.map(p => `(subpath ${sbString(p)})`).join(' ')
const literal = (p: string) => `(literal ${sbString(p)})`

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Lesbare Orte des Programms selbst — genau das, was der Freigabedialog anzeigt.
 * Liegt der Interpreter unter ~ (z.B. ~/.nvm/versions/node/v22/bin/node), wird seine
 * Installation (zwei Ebenen über der Datei) lesbar, nicht die ganze Werkzeugkette.
 */
export function programReadPaths(spec: Pick<McpSandboxSpec, 'command' | 'script' | 'programDir' | 'extraReadPaths' | 'home'>): string[] {
  const home = spec.home ?? homedir()
  const out = new Set<string>([spec.programDir, ...spec.extraReadPaths])
  if (isInside(spec.command, home)) out.add(path.dirname(path.dirname(spec.command)))
  if (spec.script && !isInside(spec.script, spec.programDir)) out.add(spec.script)
  return [...out]
}

/**
 * SBPL-Profil. Reihenfolge = Vorrang (spätere Regel gewinnt):
 * 1. alles erlauben (Prozessstart, dyld, Mach-Dienste) — `(deny default)` bricht jeden Start ab
 * 2. Netz verbieten (sofern nicht je Server freigegeben)
 * 3. Schreiben verbieten, nur Arbeitsordner + /dev/null erlauben
 * 4. Lesen verbieten: Home, Volumes, Temp-Orte, Vault
 * 5. Lesen erlauben: Programm (Interpreter-Installation unter ~, Programmordner, Skript),
 *    bestätigte Zusatzpfade
 * 6. Vaults: alle nicht freigegebenen ERNEUT verbieten (ein Programm- oder Zusatzpfad, der
 *    einen Vault umfasst, darf ihn nicht wieder öffnen), dann den freigegebenen erlauben, dann
 *    andere Vaults, die IN ihm liegen, wieder verbieten
 * 7. Lesen verbieten: <Vault>/.mindgraph — immer, auch bei Vault-Freigabe
 * 8. Lesen erlauben: Arbeitsordner
 * 9. Metadaten (stat) überall — sonst scheitern Pfadauflösung und Modul-Suche
 */
export function buildMcpSandboxProfile(spec: McpSandboxSpec): string {
  const home = spec.home ?? homedir()
  for (const p of [spec.workDir, spec.programDir, spec.command, ...(spec.script ? [spec.script] : []), ...spec.extraReadPaths, ...(spec.vaultPath ? [spec.vaultPath] : [])]) {
    if (!path.isAbsolute(p)) throw new Error(`Sandbox-Profil braucht absolute Pfade: ${p}`)
  }
  if (isInside(spec.workDir, spec.programDir)) throw new Error('Der Arbeitsordner darf nicht im Programmordner liegen.')
  const vaults = [...new Set([...(spec.knownVaults ?? []), ...(spec.vaultPath ? [spec.vaultPath] : [])])]
  for (const p of vaults) if (!path.isAbsolute(p)) throw new Error(`Sandbox-Profil braucht absolute Pfade: ${p}`)
  const inVault = vaults.find(v => isInside(spec.programDir, v) || (spec.script ? isInside(spec.script, v) : false))
  if (inVault) throw new Error(programInVaultMessage(inVault))
  const openVault = spec.vaultRead && spec.vaultPath ? spec.vaultPath : null
  const closedVaults = vaults.filter(v => v !== openVault)
  // Andere Vaults INNERHALB des geöffneten werden nach dessen Freigabe erneut gesperrt (Codex F16):
  // sonst öffnete die spätere Erlaubnis des Ober-Vaults den Unter-Vault wieder.
  const closedInsideOpen = openVault ? closedVaults.filter(v => isInside(v, openVault)) : []
  const denyRead = [home, '/Volumes', '/private/tmp', '/tmp', '/private/var/folders', '/var/folders', ...vaults]
  const allowRead = programReadPaths(spec)
  const lines = [
    '(version 1)',
    '(allow default)',
    spec.network ? '' : '(deny network*)',
    '(deny file-write*)',
    `(allow file-write* ${subpaths([spec.workDir])} ${literal('/dev/null')})`,
    `(deny file-read* ${subpaths(denyRead)})`,
    `(allow file-read* ${subpaths(allowRead)})`,
    closedVaults.length ? `(deny file-read* ${subpaths(closedVaults)})` : '',
    openVault ? `(allow file-read* ${subpaths([openVault])})` : '',
    closedInsideOpen.length ? `(deny file-read* ${subpaths(closedInsideOpen)})` : '',
    vaults.length ? `(deny file-read* ${subpaths(vaults.map(v => path.join(v, '.mindgraph')))})` : '',
    `(allow file-read* ${subpaths([spec.workDir])})`,
    '(allow file-read-metadata)'
  ]
  return lines.filter(Boolean).join('\n') + '\n'
}

export function programInVaultMessage(vault: string): string {
  return `Das Programm liegt im Vault ${vault}. Legen Sie es außerhalb jedes Vaults ab — sonst wäre der Vault für das Programm lesbar, bzw. das Programm selbst gesperrt.`
}

/** Liegt das Programm (Ordner oder Skript) in einem der Vaults? Reine Pfadprüfung, nichts wird gestartet. */
export function programVault(spec: { programDir: string; script?: string }, vaults: string[]): string | null {
  return vaults.find(v => isInside(spec.programDir, v) || (spec.script ? isInside(spec.script, v) : false)) ?? null
}

export function mcpSandboxedCommand(profilePath: string, command: string, args: string[]): { command: string; args: string[] } {
  const avail = sandboxAvailability()
  if (!avail.ok) throw new Error(avail.reason)
  return { command: SANDBOX_EXEC, args: ['-f', profilePath, command, ...args] }
}

/** Ein Loopback-Lauscher, der jede Verbindung zählt — Gegenprobe für „Netz aus“. */
async function withListener<T>(fn: (port: number, connections: () => number) => Promise<T>): Promise<T> {
  let count = 0
  const server = net.createServer(s => { count++; s.destroy() })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()) })
  try {
    return await fn((server.address() as net.AddressInfo).port, () => count)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

/**
 * Selbsttest mit dem TATSÄCHLICH erzeugten Profil (E21, F14) — vor der Freigabe und vor jedem
 * Start. Prüft, was das Profil verspricht:
 * - Datei außerhalb (System-Temp) lesen → muss scheitern
 * - Datei im Home lesen → muss scheitern
 * - `<Vault>/.mindgraph` lesen → muss scheitern (nur bei Vault-Freigabe)
 * - Programmordner beschreiben → muss scheitern
 * - Arbeitsordner beschreiben → muss gehen
 * - Netz zu einem eigenen Loopback-Lauscher → muss scheitern (nur bei „Netz aus“); geprüft
 *   wird zusätzlich auf Lauscherseite, dass keine Verbindung ankam.
 * Dass das Programm selbst im Profil startet, beweist danach der MCP-Handshake.
 * Jede Abweichung wirft — kein Start, kein Rückfall.
 */
export async function verifyMcpSandbox(profilePath: string, spec: McpSandboxSpec): Promise<void> {
  const canaryDir = await fs.mkdtemp(path.join(tmpdir(), 'mindgraph-mcp-canary-'))
  const tag = randomBytes(6).toString('hex')
  const canary = path.join(canaryDir, `canary-${tag}.txt`)
  await fs.writeFile(canary, 'darf nicht lesbar sein')
  let mgCanary: string | null = null
  let vaultCanary: string | null = null
  if (spec.vaultPath && !spec.vaultRead) {
    vaultCanary = path.join(spec.vaultPath, `.mcp-canary-${tag}.txt`)
    await fs.writeFile(vaultCanary, 'darf nicht lesbar sein')
  }
  if (spec.vaultPath) {
    const mgDir = path.join(spec.vaultPath, '.mindgraph')
    await fs.mkdir(mgDir, { recursive: true })
    mgCanary = path.join(mgDir, `mcp-canary-${tag}.txt`)
    await fs.writeFile(mgCanary, 'darf nicht lesbar sein')
  }
  const homeProbe = path.join(spec.home ?? homedir(), '.zshrc')
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
  try {
    await withListener(async (port, connections) => {
      const script = [
        `r=denied; cat ${q(canary)} >/dev/null 2>&1 && r=ALLOWED`,
        `h=denied; if [ -e ${q(homeProbe)} ]; then cat ${q(homeProbe)} >/dev/null 2>&1 && h=ALLOWED; fi`,
        mgCanary ? `m=denied; cat ${q(mgCanary)} >/dev/null 2>&1 && m=ALLOWED` : 'm=denied',
        vaultCanary ? `v=denied; cat ${q(vaultCanary)} >/dev/null 2>&1 && v=ALLOWED` : 'v=denied',
        `p=denied; echo x > ${q(path.join(spec.programDir, `.mcp-selftest-${tag}`))} 2>/dev/null && p=ALLOWED`,
        `w=failed; echo ok > ${q(path.join(spec.workDir, '.mcp-selftest'))} 2>/dev/null && w=ok`,
        spec.network ? 'n=skipped' : `n=denied; (exec 3<>/dev/tcp/127.0.0.1/${port}) 2>/dev/null && n=ALLOWED`,
        'echo "read=$r home=$h mindgraph=$m vault=$v program=$p write=$w net=$n"'
      ].join('\n')
      const { command, args } = mcpSandboxedCommand(profilePath, '/bin/bash', ['--noprofile', '--norc', '-c', script])
      const out = await new Promise<string>((resolve, reject) => {
        const child = spawn(command, args, { cwd: spec.workDir, stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Selbsttest der Sandbox hat nicht geantwortet')) }, 10_000)
        child.stdout.on('data', d => { stdout += d })
        child.stderr.on('data', d => { stderr += d })
        child.on('error', e => { clearTimeout(timer); reject(e) })
        child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`Selbsttest der Sandbox endete mit Exit ${code}: ${stderr.trim()}`)) })
      })
      const expected = `read=denied home=denied mindgraph=denied vault=denied program=denied write=ok net=${spec.network ? 'skipped' : 'denied'}`
      const line = out.trim()
      if (line !== expected) throw new Error(`Selbsttest der Sandbox fehlgeschlagen (${line || 'keine Ausgabe'})`)
      if (!spec.network && connections() > 0) throw new Error('Selbsttest der Sandbox fehlgeschlagen (Netzverbindung kam an)')
    })
  } finally {
    await fs.rm(canaryDir, { recursive: true, force: true }).catch(() => undefined)
    if (mgCanary) await fs.rm(mgCanary, { force: true }).catch(() => undefined)
    if (vaultCanary) await fs.rm(vaultCanary, { force: true }).catch(() => undefined)
    await fs.rm(path.join(spec.workDir, '.mcp-selftest'), { force: true }).catch(() => undefined)
    await fs.rm(path.join(spec.programDir, `.mcp-selftest-${tag}`), { force: true }).catch(() => undefined)
  }
}

/** Interpreter, die eine harmlose Versionsabfrage kennen (E21). Andere Programme: keine Probe. */
const VERSION_PROBE = new Set(['node', 'python', 'python3', 'bun', 'deno', 'ruby', 'php', 'java'])

/**
 * Startet den ECHTEN Interpreter im Profil mit einer Versionsabfrage (E21, Codex F06 der
 * Code-Prüfung). `profilePath` null = volle Rechte, ohne Sandbox. Liefert 'skipped' für
 * Programme ohne bekannte Versionsabfrage — dort beweist erst der MCP-Handshake den Start.
 */
export async function probeInterpreter(profilePath: string | null, command: string, cwd: string): Promise<'ok' | 'skipped'> {
  const base = path.basename(command).toLowerCase()
  // python3.12 → python3 bzw. python: Versionsanhang im Dateinamen zählt nicht.
  if (!VERSION_PROBE.has(base) && !VERSION_PROBE.has(base.replace(/[\d.]+$/, ''))) return 'skipped'
  const run = profilePath ? mcpSandboxedCommand(profilePath, command, ['--version']) : { command, args: ['--version'] }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(run.command, run.args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Das Programm hat auf die Versionsabfrage nicht geantwortet.')) }, 10_000)
    child.stderr.on('data', d => { err = (err + d).slice(-400) })
    child.on('error', e => { clearTimeout(timer); reject(e) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Das Programm startet ${profilePath ? 'in der Sandbox ' : ''}nicht (Exit ${code}${err.trim() ? `: ${err.trim()}` : ''}).`)) })
  })
  return 'ok'
}
