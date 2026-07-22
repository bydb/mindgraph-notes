// Tests für den Telegram-Scheduler. Schwerpunkt sind die Zustandskohärenz-Fixes:
//   #1 enabled wird persistiert → Resume nach (Bot-)Neustart, stop() kippt das nicht
//   #2 setConfig armiert NUR bei enabled (bloßes Speichern startet sonst Timer)
//   #3 isRunning() = echter Laufzeit-Zustand (nicht Objekt-Existenz)
// msUntilNextRun ist pur (injizierbares now); die Config-Funktionen nutzen echtes
// fs in einem temporären Verzeichnis (kein Mock). Die Service-Tests verwenden
// Regeln, die frühestens in Stunden feuern → Timer feuern im Test nie, werden in
// afterEach abgebaut.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import {
  msUntilNextRun,
  loadScheduleConfig,
  saveScheduleConfig,
  generateRuleId,
  SchedulerService,
  type ScheduleRule,
  type ScheduleConfig,
  type SchedulerDeps
} from './scheduler'

function rule(overrides: Partial<ScheduleRule> = {}): ScheduleRule {
  return { id: 'r1', enabled: true, action: 'briefing', hour: 23, minute: 59, weekdays: [], ...overrides }
}

describe('msUntilNextRun', () => {
  // Mi, 24.06.2026, 12:00 mittags (getDay() === 3)
  const now = new Date(2026, 5, 24, 12, 0, 0)

  it('deaktivierte Regel → null', () => {
    expect(msUntilNextRun(rule({ enabled: false, hour: 18, minute: 0 }), now)).toBeNull()
  })

  it('Zeit liegt heute noch in der Zukunft → Delta bis heute', () => {
    const ms = msUntilNextRun(rule({ hour: 14, minute: 0, weekdays: [] }), now)
    expect(ms).toBe(2 * 60 * 60 * 1000) // 2 Stunden
  })

  it('Zeit ist heute schon vorbei → morgen', () => {
    const ms = msUntilNextRun(rule({ hour: 9, minute: 0, weekdays: [] }), now)
    // morgen 09:00 = 21 h ab jetzt
    expect(ms).toBe(21 * 60 * 60 * 1000)
  })

  it('mit weekdays → nächster passender Wochentag', () => {
    // Heute ist Mi (3). Regel nur freitags (5), 09:00 → übermorgen.
    const ms = msUntilNextRun(rule({ hour: 9, minute: 0, weekdays: [5] }), now)
    // morgen früh wird zuerst auf Do(4) gesetzt (Zeit heute vorbei), dann +1 → Fr(5)
    // = 2 Tage später 09:00 = 45 h
    expect(ms).toBe(45 * 60 * 60 * 1000)
  })

  it('heute ist ein passender Wochentag und Zeit noch nicht vorbei → heute', () => {
    // Mi (3) ist in weekdays, 14:00 noch nicht vorbei
    const ms = msUntilNextRun(rule({ hour: 14, minute: 0, weekdays: [3] }), now)
    expect(ms).toBe(2 * 60 * 60 * 1000)
  })

  it('kein gültiger Wochentag in einer Woche → null', () => {
    // 9 ist kein gültiger getDay()-Wert → findet nie einen Treffer
    expect(msUntilNextRun(rule({ hour: 9, minute: 0, weekdays: [9] }), now)).toBeNull()
  })
})

describe('generateRuleId', () => {
  it('liefert das sched_-Format und eindeutige IDs', () => {
    const a = generateRuleId()
    const b = generateRuleId()
    expect(a).toMatch(/^sched_/)
    expect(a).not.toBe(b)
  })
})

describe('loadScheduleConfig / saveScheduleConfig', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-sched-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('Roundtrip erhält enabled und Regeln', async () => {
    const config: ScheduleConfig = { enabled: true, rules: [rule({ id: 'x', hour: 7, minute: 30 })] }
    await saveScheduleConfig(dir, config)
    const loaded = await loadScheduleConfig(dir)
    expect(loaded).toEqual(config)
  })

  it('fehlende Datei → Default (enabled false, keine Regeln)', async () => {
    const loaded = await loadScheduleConfig(dir)
    expect(loaded).toEqual({ enabled: false, rules: [] })
  })

  it('REGRESSION: altes Config ohne enabled-Feld → enabled defaultet auf false', async () => {
    // Rückwärtskompatibilität: scheduler-config.json aus der Zeit vor dem Master-
    // Schalter hat kein enabled → darf nicht als "an" interpretiert werden.
    await fs.writeFile(
      path.join(dir, 'scheduler-config.json'),
      JSON.stringify({ rules: [rule()] }),
      'utf-8'
    )
    const loaded = await loadScheduleConfig(dir)
    expect(loaded.enabled).toBe(false)
    expect(loaded.rules).toHaveLength(1)
  })

  it('filtert ungültige Regeln heraus', async () => {
    await fs.writeFile(
      path.join(dir, 'scheduler-config.json'),
      JSON.stringify({ enabled: true, rules: [rule({ id: 'ok' }), { id: 'kaputt' }, null, { foo: 1 }] }),
      'utf-8'
    )
    const loaded = await loadScheduleConfig(dir)
    expect(loaded.rules.map(r => r.id)).toEqual(['ok'])
  })

  it('kaputtes JSON → Default', async () => {
    await fs.writeFile(path.join(dir, 'scheduler-config.json'), '{ nicht valide', 'utf-8')
    expect(await loadScheduleConfig(dir)).toEqual({ enabled: false, rules: [] })
  })
})

describe('SchedulerService — Zustandskohärenz', () => {
  let dir: string
  let svc: SchedulerService

  const deps: SchedulerDeps = {
    getVaultPath: () => '/vault',
    getExcludedFolders: () => [],
    getOllamaModel: () => 'm',
    getBriefingIncludeEmails: () => false,
    getBriefingIncludeOverdue: () => false,
    getBrainFolderPath: () => 'brain',
    sendTelegramMessage: async () => {},
    generateBriefing: async () => 'briefing',
    loadOverdueTasks: async () => []
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-sched-svc-'))
    svc = new SchedulerService(deps, dir)
  })
  afterEach(async () => {
    svc.stop() // Timer abbauen
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('frischer Service läuft nicht', () => {
    expect(svc.isRunning()).toBe(false)
  })

  it('#2: setConfig mit enabled=false armiert NICHT (Speichern ≠ Starten)', async () => {
    await svc.setConfig({ enabled: false, rules: [rule()] })
    expect(svc.isRunning()).toBe(false)
  })

  it('setConfig mit enabled=true armiert', async () => {
    await svc.setConfig({ enabled: true, rules: [rule()] })
    expect(svc.isRunning()).toBe(true)
  })

  it('#1: start() läuft und persistiert enabled=true (Basis für Resume)', async () => {
    await svc.setConfig({ enabled: false, rules: [rule()] })
    await svc.start()
    expect(svc.isRunning()).toBe(true)
    expect((await loadScheduleConfig(dir)).enabled).toBe(true)
  })

  it('#1: stop() ist reiner Laufzeit-Stopp — persistiert enabled NICHT', async () => {
    await svc.start() // enabled=true auf Disk
    svc.stop()
    expect(svc.isRunning()).toBe(false)
    // Entscheidend: Disk bleibt enabled=true → nächster Bot-Start setzt wieder auf
    expect((await loadScheduleConfig(dir)).enabled).toBe(true)
  })

  it('disable() stoppt UND persistiert enabled=false', async () => {
    await svc.start()
    await svc.disable()
    expect(svc.isRunning()).toBe(false)
    expect((await loadScheduleConfig(dir)).enabled).toBe(false)
  })

  it('Resume-Szenario: neuer Service nach Neustart übernimmt enabled von Disk', async () => {
    await svc.start()           // persistiert enabled=true
    svc.stop()                  // App-Shutdown (Laufzeit weg, Disk bleibt)
    // Neue Instanz wie nach App-Neustart:
    const fresh = new SchedulerService(deps, dir)
    expect(fresh.isRunning()).toBe(false)   // noch nicht gestartet
    await fresh.start()                      // Bot-Start-Resume
    expect(fresh.isRunning()).toBe(true)
    fresh.stop()
  })
})

describe('SchedulerService — Reconfiguration-Race (Generation)', () => {
  // Szenario: ein Timer-Callback läuft (executeRule in-flight), währenddessen
  // ändert der Nutzer die Config. Der alte Callback darf sich danach NICHT mehr
  // neu einplanen — sonst re-armiert er eine gelöschte Regel oder überschreibt
  // via timers.set() den frisch geplanten Timer der geänderten Regel.
  // Fake-Timer + gated generateBriefing halten die Ausführung kontrolliert offen.
  let dir: string
  let svc: SchedulerService
  let releaseBriefing: () => void
  let briefingCalls: number

  function makeDeps(): SchedulerDeps {
    briefingCalls = 0
    const gate = new Promise<void>(resolve => { releaseBriefing = resolve })
    return {
      getVaultPath: () => '/vault',
      getExcludedFolders: () => [],
      getOllamaModel: () => 'm',
      getBriefingIncludeEmails: () => false,
      getBriefingIncludeOverdue: () => false,
      getBrainFolderPath: () => 'brain',
      sendTelegramMessage: async () => {},
      generateBriefing: async () => {
        briefingCalls += 1
        if (briefingCalls === 1) await gate // erster Lauf hängt, bis der Test ihn freigibt
        return 'briefing'
      },
      loadOverdueTasks: async () => []
    }
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    // Mi, 24.06.2026, 12:00 — Regeln feuern deterministisch relativ dazu
    vi.setSystemTime(new Date(2026, 5, 24, 12, 0, 0))
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-sched-race-'))
    svc = new SchedulerService(makeDeps(), dir)
  })

  afterEach(async () => {
    svc.stop()
    vi.useRealTimers()
    await fs.rm(dir, { recursive: true, force: true })
  })

  async function flushMicrotasks(): Promise<void> {
    // Promise-Ketten des Timer-Callbacks abarbeiten lassen (kein Timer nötig)
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }

  it('REGRESSION: während der Ausführung gelöschte Regel wird nicht re-armiert', async () => {
    await svc.setConfig({ enabled: true, rules: [rule({ hour: 12, minute: 1 })] })
    expect(vi.getTimerCount()).toBe(1)

    // Timer feuert, executeRule hängt im gated Briefing
    await vi.advanceTimersByTimeAsync(60_000)
    expect(briefingCalls).toBe(1)

    // Nutzer löscht die Regel, während sie noch läuft
    await svc.setConfig({ enabled: true, rules: [] })
    expect(vi.getTimerCount()).toBe(0)

    // Briefing wird fertig — der alte Callback darf sich NICHT neu einplanen
    releaseBriefing()
    await flushMicrotasks()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('REGRESSION: während der Ausführung geänderte Regel behält den NEUEN Zeitplan', async () => {
    await svc.setConfig({ enabled: true, rules: [rule({ hour: 12, minute: 1 })] })
    await vi.advanceTimersByTimeAsync(60_000) // feuert 12:01, hängt im Briefing

    // Nutzer verschiebt dieselbe Regel (gleiche ID) auf 18:00
    await svc.setConfig({ enabled: true, rules: [rule({ hour: 18, minute: 0 })] })
    expect(vi.getTimerCount()).toBe(1)

    releaseBriefing()
    await flushMicrotasks()
    // Der alte Callback darf den neuen Timer nicht durch die alte Regel ersetzen
    expect(vi.getTimerCount()).toBe(1)

    // Beweis, dass der verbleibende Timer der NEUE ist: er feuert um 18:00
    // (die alte Regel würde erst morgen 12:01 feuern → briefingCalls bliebe 1)
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000) // 12:01 → 18:01
    expect(briefingCalls).toBe(2)
  })

  it('stop() während laufender Ausführung verhindert Re-Arm ebenfalls', async () => {
    await svc.setConfig({ enabled: true, rules: [rule({ hour: 12, minute: 1 })] })
    await vi.advanceTimersByTimeAsync(60_000)
    svc.stop()
    releaseBriefing()
    await flushMicrotasks()
    expect(vi.getTimerCount()).toBe(0)
  })
})
