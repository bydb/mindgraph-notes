// Shell des Notiz-Agenten. Ein ShellState entsteht ausschließlich nach der nativen
// Freigabe für genau diesen Lauf UND nach bestandenem Selbsttest der Sandbox.
// Die Schutzgrenzen (shellSandbox.ts) erzwingt das Betriebssystem für jeden Befehl,
// jeden Interpreter und jeden Unterprozess — nicht der Prompt.
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import type { AgentRun } from './runRegistry'
import { DEFAULT_SHELL_GUARDRAILS, type ShellGuardrails } from '../../shared/shellGuardrails'
import { buildSandboxProfile, sandboxAvailability, sandboxedCommand, verifySandbox } from './shellSandbox'

export const MAX_SHELL_COMMAND_CHARS = 16_000
// 8 KB statt 24 KB: ein einziger Zellen-Dump füllte sonst den Modellkontext (real, 12.09.2026).
export const MAX_SHELL_OUTPUT_BYTES = 8_000
export const MAX_SHELL_TIMEOUT_MS = 120_000
const MAX_COMMANDS_PER_RUN = 20

export interface ShellState {
  cwd: string
  commands: number
  guardrails: ShellGuardrails
  // Liegt AUSSERHALB des Arbeitsordners (dort nicht schreibbar): jeder Befehl startet
  // einen neuen sandbox-exec, der das Profil frisch liest — ein beschreibbares Profil
  // wäre nach dem ersten Befehl kein Schutz mehr.
  profilePath: string
  // Eigener Temp-Ordner im Arbeitsordner; die System-Temp-Orte sind gesperrt.
  tmpDir: string
  // Einmal beim Start ermittelt (probeShellEnvironment) und in den Prompt gesetzt —
  // sonst verbraucht das Modell mehrere Iterationen mit „welches Python, welche Bibliotheken".
  environment?: string
}

export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  truncated: boolean
}

export interface ShellAuthorizeOptions {
  guardrails?: ShellGuardrails
  /** Absolute Pfade, die zusätzlich lesbar sind (Anhänge bzw. Vault). */
  readPaths?: string[]
  /** Nur Tests: Interpreter außerhalb der Systempfade. */
  extraReadPaths?: string[]
}

/**
 * Der Renderer kann nur anfragen. Ohne echte Bestätigung bleibt run.shell leer — und
 * ohne bestandenen Sandbox-Selbsttest ebenfalls: kein stiller Rückfall auf freie Rechte.
 */
export async function authorizeShell(
  run: AgentRun,
  confirm: () => Promise<boolean>,
  prepare: () => Promise<string>,
  options: ShellAuthorizeOptions = {}
): Promise<void> {
  assertActive(run)
  if (run.web) throw new Error('Shell-Zugriff und Webrecherche-Modus sind getrennte Laufarten.')
  const avail = sandboxAvailability()
  if (!avail.ok) throw new Error(avail.reason)
  if (!await confirm()) throw new Error('Shell-Zugriff wurde nicht erlaubt. Der Lauf wurde nicht ausgeführt.')
  assertActive(run)
  const cwd = await fs.realpath(await prepare())
  assertActive(run)
  const guardrails = options.guardrails ?? DEFAULT_SHELL_GUARDRAILS
  const readPaths: string[] = []
  for (const p of options.readPaths ?? []) readPaths.push(await fs.realpath(p))
  const tmpDir = path.join(cwd, 'tmp')
  await fs.mkdir(tmpDir, { recursive: true })
  const profilePath = path.join(path.dirname(cwd), `sandbox-${run.runId}.sb`)
  await fs.writeFile(profilePath, buildSandboxProfile({
    workDir: cwd, vaultPath: run.vaultPath, readPaths, network: guardrails.network, extraReadPaths: options.extraReadPaths
  }), { mode: 0o600 })
  await verifySandbox(profilePath, cwd)
  assertActive(run)
  run.shell = { cwd, commands: 0, guardrails, profilePath, tmpDir }
}

function assertActive(run: AgentRun): void {
  if (run.abort.signal.aborted || run.status !== 'running') throw new Error('Abgebrochen')
}

export function requireShell(run: AgentRun): ShellState {
  assertActive(run)
  if (!run.shell || run.web) throw new Error('Shell-Zugriff ist für diesen Lauf nicht freigegeben.')
  return run.shell
}

// Kein Vererben von API-Keys aus der App-Umgebung. Das begrenzt versehentliche
// Weitergabe, ist aber KEINE Geheimnis-Isolation gegenüber freiem Dateizugriff.
function shellEnvironment(run: AgentRun): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['HOME', 'USER', 'LOGNAME', 'USERPROFILE', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'LANG', 'LC_ALL', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  // System-Temp ist in der Sandbox gesperrt; Interpreter (tempfile, Excel-Writer) brauchen einen.
  env.TMPDIR = run.shell!.tmpDir
  env.TMP = run.shell!.tmpDir
  env.TEMP = run.shell!.tmpDir
  const extra = process.platform === 'win32'
    ? [path.join(homedir(), 'AppData', 'Roaming', 'npm'), path.join(homedir(), '.local', 'bin')]
    : ['/opt/homebrew/bin', '/usr/local/bin', path.join(homedir(), '.local', 'bin'), '/usr/bin', '/bin']
  env.PATH = [...extra, process.env.PATH || ''].join(path.delimiter)
  env.MINDGRAPH_VAULT = run.vaultPath
  env.MINDGRAPH_AGENT_OUTPUT_DIR = run.shell!.cwd
  return env
}

// Auch bei App-Ende aufräumen. POSIX: eigene Prozessgruppe; Windows: taskkill /T.
// Bewusst abgekoppelte Daemons können sich entziehen — dies ist keine Sandbox.
const activeStops = new Set<() => void>()
export function stopAgentShellProcesses(): void {
  for (const stop of activeStops) stop()
}

export async function executeShell(run: AgentRun, command: unknown, timeoutMs?: unknown): Promise<ShellResult> {
  const shell = requireShell(run)
  if (typeof command !== 'string' || !command.trim() || command.length > MAX_SHELL_COMMAND_CHARS || command.includes('\0')) {
    throw new Error(`command muss ein nicht leerer Shell-Befehl mit höchstens ${MAX_SHELL_COMMAND_CHARS} Zeichen sein.`)
  }
  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_SHELL_TIMEOUT_MS)) {
    throw new Error(`timeout_ms muss zwischen 1 und ${MAX_SHELL_TIMEOUT_MS} liegen.`)
  }
  if (shell.commands >= MAX_COMMANDS_PER_RUN) throw new Error('Shell-Budget erreicht: höchstens 20 Befehle pro Lauf.')
  shell.commands += 1
  return runShellProcess(run, shell, command, typeof timeoutMs === 'number' ? timeoutMs : 30_000)
}

// Kompakter Umgebungsüberblick für den System-Prompt: Interpreter mit Pfad und die
// Python-Bibliotheken, die sich in diesem Python TATSÄCHLICH LADEN lassen (echter Import,
// nicht find_spec — auffindbar heißt nicht lauffähig: fehlende Abhängigkeit, kaputte
// Binärdatei). Zählt nicht gegen das Befehlsbudget. Fehler → 'unbekannt' (der Lauf
// darf daran nicht scheitern). Bricht die Probe ab (Zeit/Ausgabe), wird das Ergebnis
// als unvollständig markiert — der Prompt sagt dem Modell sonst „nicht erneut prüfen".
const PYTHON_LIBS = ['pandas', 'openpyxl', 'xlrd', 'matplotlib', 'numpy', 'reportlab', 'docx', 'pptx', 'PIL']
const PROBE_TIMEOUT_MS = 15_000
export const PROBE_INCOMPLETE_MARK = '(unvollständig: Probe abgebrochen — Fehlendes bei Bedarf gezielt nachprüfen)'
// argv[1] = Pfad, unter dem der Interpreter gefunden wurde (so nennt der Prompt den Aufrufweg).
const PYTHON_PROBE = `import importlib, sys
def ok(m):
    try:
        importlib.import_module(m)
        return True
    except Exception:
        return False
libs = [m for m in ${JSON.stringify(PYTHON_LIBS)} if ok(m)]
print('python3=' + sys.argv[1] + ' ' + sys.version.split()[0] + ' libs: ' + (', '.join(libs) or 'keine'))`

export function summarizeProbe(res: ShellResult): string {
  const text = res.stdout.trim().replace(/\s+\n/g, '\n')
  const lines = text ? text.split('\n').slice(0, 12).join(' · ') : ''
  const incomplete = res.timedOut || res.truncated
  if (!lines) return incomplete ? `unbekannt ${PROBE_INCOMPLETE_MARK}` : 'unbekannt'
  return incomplete ? `${lines} ${PROBE_INCOMPLETE_MARK}` : lines
}

export async function probeShellEnvironment(run: AgentRun): Promise<string> {
  const shell = requireShell(run)
  const windows = process.platform === 'win32'
  const script = windows
    ? `foreach ($t in 'node','pandoc','soffice') { $c = Get-Command $t -ErrorAction SilentlyContinue; if ($c) { Write-Output ("$t=" + $c.Source) } }
$py = @'
${PYTHON_PROBE}
'@
$seen = @{}
foreach ($p in 'python','python3','py') { $c = Get-Command $p -ErrorAction SilentlyContinue; if (-not $c) { continue }; if ($seen[$c.Source]) { continue }; $seen[$c.Source] = 1; & $c.Source -c $py $c.Source 2>$null }`
    : `for t in node pandoc soffice qpdf gs; do command -v "$t" >/dev/null 2>&1 && printf '%s=%s\n' "$t" "$(command -v "$t")"; done
py=${shellQuote(PYTHON_PROBE)}
seen=""
for p in "$(command -v python3 2>/dev/null)" /usr/local/bin/python3 /opt/homebrew/bin/python3 /usr/bin/python3; do
  [ -n "$p" ] && [ -x "$p" ] || continue
  r=$(cd / && "$p" -c 'import os,sys;print(os.path.realpath(sys.executable))' 2>/dev/null) || continue
  case " $seen " in *" $r "*) continue;; esac
  seen="$seen $r"
  "$p" -c "$py" "$p" 2>/dev/null
done`
  try {
    const res = await runShellProcess(run, shell, script, PROBE_TIMEOUT_MS)
    shell.environment = summarizeProbe(res)
  } catch {
    shell.environment = 'unbekannt'
  }
  return shell.environment
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

async function runShellProcess(run: AgentRun, shell: ShellState, command: string, timeout: number): Promise<ShellResult> {
  const windows = process.platform === 'win32'
  // Bekannte Syntax, kein interaktives Profil und kein impliziter Paket-Install.
  const baseExecutable = windows ? 'powershell.exe' : '/bin/bash'
  const baseArgs = windows
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')]
    : ['--noprofile', '--norc', '-c', command]
  // Jeder Befehl läuft in der Sandbox — auch die Umgebungsprobe. Wirft, wenn es auf
  // dieser Plattform keinen Schutz gibt (dann hätte authorizeShell schon abgelehnt).
  const { executable, args } = sandboxedCommand(shell.profilePath, baseExecutable, baseArgs)

  return new Promise<ShellResult>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: shell.cwd, env: shellEnvironment(run), stdio: ['ignore', 'pipe', 'pipe'],
      detached: !windows, windowsHide: true
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let stored = 0
    let truncated = false
    let timedOut = false
    let settled = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const capture = (chunks: Buffer[], data: Buffer) => {
      const remaining = MAX_SHELL_OUTPUT_BYTES - stored
      if (data.length > remaining) truncated = true
      if (remaining > 0) {
        const kept = data.subarray(0, remaining)
        chunks.push(kept)
        stored += kept.length
      }
    }
    const killTree = () => {
      if (!child.pid) return
      if (windows) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => { child.kill('SIGKILL') })
      } else {
        try { process.kill(-child.pid, 'SIGKILL') } catch { /* schon beendet */ }
      }
    }
    const finish = (error?: Error, code: number | null = null, signal: string | null = null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (watchdog) clearTimeout(watchdog)
      run.abort.signal.removeEventListener('abort', stop)
      activeStops.delete(stop)
      killTree()
      child.stdout.destroy()
      child.stderr.destroy()
      if (error) reject(error)
      else if (run.abort.signal.aborted) reject(new Error('Abgebrochen'))
      else resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode: code, signal, timedOut, truncated })
    }
    const stop = () => {
      killTree()
      // Keine unendliche Wartezeit auf geerbte Pipes eines abgekoppelten Prozesses.
      if (!watchdog) watchdog = setTimeout(() => finish(), 2_000)
    }
    const timer = setTimeout(() => { timedOut = true; stop() }, timeout)
    activeStops.add(stop)
    run.abort.signal.addEventListener('abort', stop, { once: true })
    child.stdout.on('data', (data: Buffer) => capture(stdout, data))
    child.stderr.on('data', (data: Buffer) => capture(stderr, data))
    child.on('error', error => finish(error))
    // Wenn die Shell endet, auch Hintergrundkinder stoppen, die ihre Pipes halten.
    child.on('exit', () => { killTree(); if (!watchdog) watchdog = setTimeout(() => finish(), 2_000) })
    child.on('close', (code, signal) => finish(undefined, code, signal))
    if (run.abort.signal.aborted) stop()
  })
}
