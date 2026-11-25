import { afterEach, describe, expect, it, vi } from 'vitest'

// Prüfung agy F01/F02/F14 (docs/codex-collab/speicherbild.md): was der Main beim Beenden und
// Wiederöffnen erzwingt. Kein echter Prozess wird gestartet — der Prozessstarter ist ersetzt.

const dialogAnswer = { response: 0 }
const dialogCalls: Array<{ detail: string }> = []
vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showMessageBox: async (options: { detail: string }) => { dialogCalls.push(options); return dialogAnswer } }
}))

const { QUIT_SCRIPT, bundleIdentity, offerAppsForRelief, quitAppsForRelief, reopenAppsAfterRelief, reopenableApps, resetReliefStateForTests, setReliefRunnerForTests } = await import('./memoryRelief')

const CALC = '/System/Applications/Calculator.app'
const NOPE = '/Applications/Gibt-Es-Nicht-12345.app'
const psLine = (pid: number, bundle: string, name: string): string => `${pid} 204800 ${bundle}/Contents/MacOS/${name}`

/** Prozessstarter, der `ps` aus einer veränderlichen Liste beantwortet und alle Aufrufe mitschreibt. */
function fakeSystem(initial: string[]) {
  const state = { ps: initial, calls: [] as Array<{ file: string; args: string[] }>, quitWorks: true }
  setReliefRunnerForTests(async (file, args) => {
    state.calls.push({ file, args })
    if (file === '/bin/ps') return { ok: true, out: state.ps.join('\n') }
    if (file === '/usr/bin/osascript' && state.quitWorks) state.ps = state.ps.filter(l => !l.includes(args[args.length - 1]))
    return { ok: true, out: '' }
  }, 600)
  return state
}

afterEach(() => { setReliefRunnerForTests(null); resetReliefStateForTests(); dialogCalls.length = 0; dialogAnswer.response = 0 })

describe.skipIf(process.platform !== 'darwin')('Platz schaffen: Beenden und Wiederöffnen', () => {
  it('beendet nichts, was der Main nicht selbst angeboten hat — auch wenn es läuft', async () => {
    const sys = fakeSystem([psLine(11, CALC, 'Calculator')])
    expect(await quitAppsForRelief([CALC], null, false)).toEqual({ closed: [], failed: [], stale: true })
    expect(dialogCalls).toHaveLength(0)
    expect(sys.calls.some(c => c.file === '/usr/bin/osascript')).toBe(false)
  })

  it('angeboten, aber kein echtes Bündel am Pfad: kein Ziel', async () => {
    const sys = fakeSystem([psLine(12, NOPE, 'Nope')])
    offerAppsForRelief([{ name: 'Gibt-Es-Nicht-12345', bytes: 1, path: NOPE }])
    expect(await quitAppsForRelief([NOPE], null, false)).toEqual({ closed: [], failed: [], stale: true })
    expect(sys.calls.some(c => c.file === '/usr/bin/osascript')).toBe(false)
  })

  it('Abbruch im Dialog: kein Befehl geht hinaus', async () => {
    const sys = fakeSystem([psLine(11, CALC, 'Calculator')])
    offerAppsForRelief([{ name: 'Calculator', bytes: 1, path: CALC }])
    dialogAnswer.response = 1
    expect(await quitAppsForRelief([CALC], null, false)).toMatchObject({ cancelled: true, closed: [] })
    expect(sys.calls.some(c => c.file === '/usr/bin/osascript')).toBe(false)
  })

  it('beendet einmal je Ziel mit festem Skript und Pfad als Argument; danach wieder zu öffnen', async () => {
    const sys = fakeSystem([psLine(11, CALC, 'Calculator')])
    offerAppsForRelief([{ name: 'Calculator', bytes: 1, path: CALC }])
    const res = await quitAppsForRelief([CALC, CALC, CALC, 17, '/usr/bin/true'], null, false)
    expect(res).toEqual({ closed: ['Calculator'], failed: [] })
    const quits = sys.calls.filter(c => c.file === '/usr/bin/osascript')
    expect(quits).toHaveLength(1)
    expect(quits[0].args).toEqual([...QUIT_SCRIPT, CALC])
    // Nur wenn es läuft: ein inzwischen geschlossenes Programm wird durch „quit“ nicht gestartet.
    expect(QUIT_SCRIPT.join(' ')).toContain('is running then tell application (item 1 of argv) to quit')
    expect(dialogCalls[0].detail.startsWith('Calculator\n')).toBe(true)
    expect(reopenableApps()).toEqual(['Calculator'])

    expect(await reopenAppsAfterRelief(null, false)).toEqual({ reopened: ['Calculator'], skipped: [], failed: [] })
    // Vor dem Start fragt der Main selbst nach und nennt den Ort.
    expect(dialogCalls[1].detail).toBe(`Calculator — ${CALC}`)
    expect(sys.calls.filter(c => c.file === '/usr/bin/open').map(c => c.args)).toEqual([['-g', '-a', CALC]])
    expect(reopenableApps()).toEqual([])
  })

  it('läuft das Programm nach „quit“ weiter, gilt es nicht als beendet', async () => {
    const sys = fakeSystem([psLine(11, CALC, 'Calculator')])
    sys.quitWorks = false
    offerAppsForRelief([{ name: 'Calculator', bytes: 1, path: CALC }])
    expect(await quitAppsForRelief([CALC], null, false)).toEqual({ closed: [], failed: ['Calculator'] })
    expect(reopenableApps()).toEqual([])
  })

  it('von Hand wieder gestartet: nichts wird doppelt geöffnet', async () => {
    const sys = fakeSystem([psLine(11, CALC, 'Calculator')])
    offerAppsForRelief([{ name: 'Calculator', bytes: 1, path: CALC }])
    await quitAppsForRelief([CALC], null, false)
    sys.ps = [psLine(31, CALC, 'Calculator')]
    expect(await reopenAppsAfterRelief(null, false)).toEqual({ reopened: [], skipped: [], failed: [] })
    expect(sys.calls.some(c => c.file === '/usr/bin/open')).toBe(false)
  })

  it('Wiederöffnen: abgelehnt startet nichts und behält die Liste; ein fehlgeschlagener Start wird gemeldet (agy F16)', async () => {
    const sys = fakeSystem([psLine(11, CALC, 'Calculator')])
    offerAppsForRelief([{ name: 'Calculator', bytes: 1, path: CALC }])
    await quitAppsForRelief([CALC], null, false)
    dialogAnswer.response = 1
    expect(await reopenAppsAfterRelief(null, false)).toEqual({ reopened: [], skipped: [], failed: [], cancelled: true })
    expect(sys.calls.some(c => c.file === '/usr/bin/open')).toBe(false)
    expect(reopenableApps()).toEqual(['Calculator'])
    dialogAnswer.response = 0
    setReliefRunnerForTests(async file => file === '/bin/ps' ? { ok: true, out: '' } : { ok: false, out: 'nein' }, 600)
    expect(await reopenAppsAfterRelief(null, false)).toEqual({ reopened: [], skipped: [], failed: ['Calculator'] })
    expect(reopenableApps()).toEqual(['Calculator'])
  })

  it('eine spätere, kürzere Messung nimmt der offenen Karte die Programme nicht weg; Veraltetes wird gemeldet (agy F19)', async () => {
    const sys = fakeSystem([psLine(11, CALC, 'Calculator')])
    offerAppsForRelief([{ name: 'Calculator', bytes: 1, path: CALC }])
    offerAppsForRelief([])
    expect(await quitAppsForRelief([CALC], null, false)).toEqual({ closed: ['Calculator'], failed: [] })
    // Jetzt läuft es nicht mehr: die Auswahl ist veraltet, und das kommt zurück statt Schweigen.
    expect(await quitAppsForRelief([CALC], null, false)).toEqual({ closed: [], failed: [], stale: true })
    expect(await quitAppsForRelief([], null, false)).toEqual({ closed: [], failed: [] })
    expect(sys.calls.filter(c => c.file === '/usr/bin/osascript')).toHaveLength(1)
  })

  it('Kennung nur für ein echtes Bündel: kein Symlink, kein Ordner ohne Info.plist', async () => {
    const { mkdtemp, mkdir, writeFile, symlink, realpath, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const dir = await realpath(await mkdtemp(`${tmpdir()}/mg-relief-`))
    try {
      await mkdir(`${dir}/Echt.app/Contents`, { recursive: true })
      await writeFile(`${dir}/Echt.app/Contents/Info.plist`, '<plist/>')
      await mkdir(`${dir}/Leer.app/Contents`, { recursive: true })
      await symlink(`${dir}/Echt.app`, `${dir}/Link.app`)
      const real = await bundleIdentity(`${dir}/Echt.app`)
      expect(real).not.toBeNull()
      expect(await bundleIdentity(`${dir}/Leer.app`)).toBeNull()
      expect(await bundleIdentity(`${dir}/Link.app`)).toBeNull()
      // Ordner getauscht: die Kennung ist eine andere.
      await rm(`${dir}/Echt.app`, { recursive: true })
      await mkdir(`${dir}/Echt.app/Contents`, { recursive: true })
      await writeFile(`${dir}/Echt.app/Contents/Info.plist`, '<plist/>')
      expect(await bundleIdentity(`${dir}/Echt.app`)).not.toEqual(real)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
