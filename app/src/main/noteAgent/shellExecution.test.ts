import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'
import { authorizeShell, executeShell, probeShellEnvironment, summarizeProbe, PROBE_INCOMPLETE_MARK, MAX_SHELL_OUTPUT_BYTES, stopAgentShellProcesses } from './shellExecution'
import { startRun, finishRun, type AgentRun } from './runRegistry'

let root: string
let run: AgentRun
let senderId = 700_000
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'mindgraph-shell-test-'))
  run = startRun({ senderId: senderId++, noteId: 'test', vaultPath: root, targetFolderRel: '.', targetFolderAbs: root, attachmentIds: [], instruction: 'Test', model: 'test' })!
})
afterEach(async () => {
  run.abort.abort()
  stopAgentShellProcesses()
  finishRun(run, 'cancelled')
  vi.unstubAllEnvs()
  await fs.rm(root, { recursive: true, force: true })
})

async function commandFor(code: string, name = 'test.cjs'): Promise<string> {
  const file = path.join(root, name)
  await fs.writeFile(file, code)
  const quote = (s: string) => process.platform === 'win32' ? `'${s.replace(/'/g, "''")}'` : `'${s.replace(/'/g, "'\\''")}'`
  return `${process.platform === 'win32' ? '& ' : ''}${quote(process.execPath)} ${quote(file)}`
}
// Node liegt auf Entwicklerrechnern oft unter ~ (nvm o.ä.) — in der Sandbox ist ~ gesperrt.
const nodeDir = path.dirname(process.execPath)
const opts = { extraReadPaths: [nodeDir] }
async function allow(): Promise<void> {
  await authorizeShell(run, async () => true, async () => root, opts)
}
// Der Schutz wird derzeit nur auf macOS erzwungen; woanders lehnt authorizeShell ab
// (fail-closed) — das prüft der erste Block, alles Weitere braucht die Sandbox.
const sandboxed = process.platform === 'darwin'

describe('Shell-Freigabe', () => {
  it('ist standardmäßig aus, auch bei direktem Werkzeugaufruf', async () => {
    expect(run.shell).toBeUndefined()
    await expect(executeShell(run, 'echo forbidden')).rejects.toThrow(/nicht freigegeben/)
  })
  it.skipIf(sandboxed)('startet ohne erzwingbaren Schutz gar nicht — auch nicht nach Zustimmung', async () => {
    const confirm = vi.fn(async () => true)
    await expect(authorizeShell(run, confirm, async () => root, opts)).rejects.toThrow(/Schutz/)
    expect(confirm).not.toHaveBeenCalled()
    expect(run.shell).toBeUndefined()
  })
  it.skipIf(!sandboxed)('bereitet bei Ablehnung nichts vor', async () => {
    const prepare = vi.fn(async () => root)
    await expect(authorizeShell(run, async () => false, prepare)).rejects.toThrow(/nicht erlaubt/)
    expect(prepare).not.toHaveBeenCalled()
    expect(run.shell).toBeUndefined()
  })
  it.skipIf(!sandboxed)('verspätete Zustimmung nach Abbruch erteilt keine Freigabe', async () => {
    const prepare = vi.fn(async () => root)
    await expect(authorizeShell(run, async () => { run.abort.abort(); return true }, prepare)).rejects.toThrow(/Abgebrochen/)
    expect(prepare).not.toHaveBeenCalled()
    expect(run.shell).toBeUndefined()
  })
  it.skipIf(!sandboxed)('prüft Abbruch auch nach der Verzeichnisvorbereitung', async () => {
    await expect(authorizeShell(run, async () => true, async () => { run.abort.abort(); return root })).rejects.toThrow(/Abgebrochen/)
    expect(run.shell).toBeUndefined()
  })
  it('erlaubt keine Shell im Webrecherche-Modus', async () => {
    run.web = {} as NonNullable<AgentRun['web']>
    const confirm = vi.fn(async () => true)
    await expect(authorizeShell(run, confirm, async () => root)).rejects.toThrow(/getrennte/)
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe.skipIf(!sandboxed)('Umgebungsprobe', () => {
  it('braucht eine Freigabe', async () => {
    await expect(probeShellEnvironment(run)).rejects.toThrow(/nicht freigegeben/)
  })
  it('nennt Interpreter mit Pfad, zählt nicht gegen das Budget und landet im ShellState', async () => {
    await allow()
    const env = await probeShellEnvironment(run)
    expect(run.shell?.environment).toBe(env)
    expect(run.shell?.commands).toBe(0)
    // Auf dem Testrechner ist mindestens Node vorhanden (wir laufen darin); der
    // Eintrag muss ein Pfad sein, keine Vermutung.
    expect(env).toMatch(/node=\S+/)
    expect(env.length).toBeLessThan(2000)
    // Vollständige Probe trägt keinen Unvollständig-Marker.
    expect(env).not.toContain(PROBE_INCOMPLETE_MARK)
  })
  it.skipIf(process.platform === 'win32')('meldet je Python nur Bibliotheken, die sich wirklich laden lassen', async () => {
    await allow()
    const env = await probeShellEnvironment(run)
    // Auf einem Rechner mit Python: jede Python-Zeile hat Pfad, Version und libs-Liste.
    // Ohne Python: keine Python-Zeile — aber nie eine erfundene.
    for (const line of env.split(' · ').filter(l => l.startsWith('python3='))) {
      expect(line).toMatch(/^python3=\S+ \d+\.\d+(\.\d+)? libs: (keine|[\w., ]+)$/)
    }
  })
  it('kennzeichnet eine abgebrochene oder gekürzte Probe als unvollständig', () => {
    const base = { stdout: 'node=/usr/bin/node\npython3=/usr/bin/python3 3.12.1 libs: keine\n', stderr: '', exitCode: null, signal: 'SIGKILL', truncated: false }
    expect(summarizeProbe({ ...base, timedOut: false, exitCode: 0, signal: null })).toBe('node=/usr/bin/node · python3=/usr/bin/python3 3.12.1 libs: keine')
    expect(summarizeProbe({ ...base, timedOut: true })).toBe(`node=/usr/bin/node · python3=/usr/bin/python3 3.12.1 libs: keine ${PROBE_INCOMPLETE_MARK}`)
    expect(summarizeProbe({ ...base, timedOut: false, truncated: true })).toContain(PROBE_INCOMPLETE_MARK)
    // Gar keine Ausgabe nach Timeout: „unbekannt" UND markiert — sonst liest das Modell
    // „unbekannt" als „nichts installiert".
    expect(summarizeProbe({ stdout: '', stderr: '', exitCode: null, signal: 'SIGKILL', timedOut: true, truncated: false })).toBe(`unbekannt ${PROBE_INCOMPLETE_MARK}`)
    expect(summarizeProbe({ stdout: '', stderr: '', exitCode: 0, signal: null, timedOut: false, truncated: false })).toBe('unbekannt')
  })
})

describe.skipIf(!sandboxed)('Echte Shell-Prozesse (in der Sandbox)', () => {
  it('führt ein Skript aus, liefert stdout/stderr/Exit-Code und begrenzt die Umgebung', async () => {
    await allow()
    vi.stubEnv('MINDGRAPH_TEST_SECRET', 'darf-nicht-geerbt-werden')
    const command = await commandFor(`console.log(JSON.stringify({ cwd: process.cwd(), vault: process.env.MINDGRAPH_VAULT, secretPresent: !!process.env.MINDGRAPH_TEST_SECRET })); console.error('Fehlertext'); process.exitCode = 7`)
    const result = await executeShell(run, command)
    expect(JSON.parse(result.stdout)).toEqual({ cwd: await fs.realpath(root), vault: root, secretPresent: false })
    expect(run.shell?.cwd).toBe(await fs.realpath(root))
    expect(result.stderr).toContain('Fehlertext')
    expect(result.exitCode).toBe(7)
    expect(result.timedOut).toBe(false)
  })
  it('begrenzt stdout und stderr zusammen und meldet die Kürzung', async () => {
    await allow()
    const result = await executeShell(run, await commandFor(`process.stdout.write('x'.repeat(100000)); process.stderr.write('y'.repeat(100000))`))
    expect(Buffer.byteLength(result.stdout + result.stderr)).toBe(MAX_SHELL_OUTPUT_BYTES)
    expect(result.truncated).toBe(true)
    expect(result.exitCode).toBe(0)
  })
  it('bricht laufende Prozesse ab', async () => {
    await allow()
    const command = await commandFor('setInterval(() => {}, 1000)')
    const pending = executeShell(run, command)
    setTimeout(() => run.abort.abort(), 100)
    await expect(pending).rejects.toThrow('Abgebrochen')
  })
  it('meldet Zeitüberschreitung statt Erfolg', async () => {
    await allow()
    const result = await executeShell(run, await commandFor('setInterval(() => {}, 1000)'), 100)
    expect(result.timedOut).toBe(true)
    expect(result.exitCode).not.toBe(0)
  })
  it('weist ungültige Grenzen zurück und startet in beendeten Läufen nichts', async () => {
    await allow()
    await expect(executeShell(run, 'echo test', 120001)).rejects.toThrow(/timeout_ms/)
    await expect(executeShell(run, 'echo test', NaN)).rejects.toThrow(/timeout_ms/)
    await expect(executeShell(run, 'x'.repeat(16001))).rejects.toThrow(/command/)
    finishRun(run, 'done')
    await expect(executeShell(run, 'echo test')).rejects.toThrow(/Abgebrochen/)
  })
  it.skipIf(process.platform === 'win32')('beendet auch ein Hintergrundkind nach normalem Shell-Ende', async () => {
    await allow()
    const childFile = path.join(root, 'child.pid')
    const command = await commandFor(`require('fs').writeFileSync(${JSON.stringify(childFile)}, String(process.pid)); setInterval(() => {}, 1000)`, 'child.cjs')
    const result = await executeShell(run, `${command} &\nwhile [ ! -f '${childFile}' ]; do sleep 0.02; done\necho fertig`, 3000)
    expect(result.stdout).toContain('fertig')
    const pid = Number(await fs.readFile(childFile, 'utf8'))
    // Ein kurzzeitiger Zombie ist kein laufender Prozess; kill(0) ist dafür nicht
    // ausreichend. Das Kind muss seine Pipes schließen, ohne das Limit zu erreichen.
    expect(pid).toBeGreaterThan(0)
    expect(result.timedOut).toBe(false)
    expect(result.exitCode).toBe(0)
  })
})
