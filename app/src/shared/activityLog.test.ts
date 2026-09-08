import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_MAX_EVENTS,
  ACTIVITY_RETENTION_DAYS,
  impactBadge,
  deriveActivityType,
  estimateSavedMinutes,
  isActivityEvent,
  localDayRange,
  isCorrectionTargetKnown,
  MAX_CORRECTION_MS,
  pluginActivityEvent,
  pruneActivityEvents,
  stableJobId,
  summarizeActivity,
  type ActivityEvent,
  type ActivityEventKind
} from './activityLog'

const DAY = 86_400_000
const NOW = new Date('2026-08-25T12:00:00').getTime()

function runFinished(over: Partial<Extract<ActivityEvent, { kind: 'agent-run-finished' }>> = {}): ActivityEvent {
  return {
    at: NOW,
    kind: 'agent-run-finished',
    runId: 'run-1',
    durationMs: 60_000,
    instructionMs: 2 * 60_000,
    activityType: 'table-merge',
    resultCount: 1,
    status: 'ok',
    ...over
  }
}

/** Übernahme mit gemessener Prüfzeit — ohne sie bleibt ein Lauf unbewertet. */
function accepted(over: Partial<Extract<ActivityEvent, { kind: 'agent-result-accepted' }>> = {}): ActivityEvent {
  return { at: NOW, kind: 'agent-result-accepted', runId: 'run-1', format: 'xlsx', reviewMs: 3 * 60_000, ...over }
}

describe('deriveActivityType', () => {
  it('erkennt die Tabellen-Auswertung am kennzeichnenden Werkzeug', () => {
    expect(deriveActivityType(['list_context_folder', 'collect_table', 'write_xlsx'])).toBe('table-merge')
  })

  it('stuft einen Web-Lauf als Recherche ein, obwohl er am Ende eine Notiz schreibt', () => {
    expect(deriveActivityType(['web_search', 'web_fetch', 'write_note'])).toBe('web-research')
  })

  it('trennt Dokument von Zusammenfassung', () => {
    expect(deriveActivityType(['write_docx'])).toBe('document')
    expect(deriveActivityType(['note_read', 'write_note'])).toBe('summary')
  })

  it('fällt auf other zurück statt zu raten', () => {
    expect(deriveActivityType(['note_search'])).toBe('other')
    expect(deriveActivityType([])).toBe('other')
  })
})

describe('pruneActivityEvents', () => {
  it('wirft Einträge älter als ein Jahr weg — so lange wie das Telemetrie-Logbuch', () => {
    expect(ACTIVITY_RETENTION_DAYS).toBe(365)
    const events: ActivityEvent[] = [
      { at: NOW - 366 * DAY, kind: 'task-created', count: 1 },
      { at: NOW - 364 * DAY, kind: 'task-created', count: 1 }
    ]
    expect(pruneActivityEvents(events, NOW)).toHaveLength(1)
  })

  it('behält bei Überlauf die jüngsten Einträge', () => {
    const events: ActivityEvent[] = Array.from({ length: ACTIVITY_MAX_EVENTS + 10 }, (_, i) => ({
      at: NOW - (ACTIVITY_MAX_EVENTS + 10 - i) * 1000,
      kind: 'task-created' as const,
      count: i
    }))
    const kept = pruneActivityEvents(events, NOW)
    expect(kept).toHaveLength(ACTIVITY_MAX_EVENTS)
    expect((kept[kept.length - 1] as { count: number }).count).toBe(ACTIVITY_MAX_EVENTS + 9)
  })
})

describe('isActivityEvent', () => {
  // Ein gültiges Beispiel je Art. Der Typ erzwingt Vollständigkeit: Wer eine neue Art in
  // ActivityEvent aufnimmt, muss sie hier eintragen — und der Test fällt, solange sie
  // in KNOWN_KINDS fehlt. Genau so ging `reference-changed` verloren (0.11.3–0.11.4).
  const SAMPLES: { [K in ActivityEventKind]: Extract<ActivityEvent, { kind: K }> } = {
    'agent-run-finished': { at: NOW, kind: 'agent-run-finished', runId: 'r', durationMs: 1, activityType: 'other', resultCount: 0, status: 'ok' },
    'agent-result-accepted': { at: NOW, kind: 'agent-result-accepted', runId: 'r', format: 'md' },
    'agent-result-discarded': { at: NOW, kind: 'agent-result-discarded', runId: 'r', format: 'md' },
    'email-tasks-extracted': { at: NOW, kind: 'email-tasks-extracted', id: 'm', emails: 1, tasks: 1, durationMs: 1 },
    'task-created': { at: NOW, kind: 'task-created', count: 1 },
    'reference-changed': { at: NOW, kind: 'reference-changed', activityType: 'document', fromMinutes: 20, toMinutes: 30 },
    'job-started': { at: NOW, kind: 'job-started', jobId: 'mk-1', jobKind: 'marketing', pluginId: 'edoobox' },
    'job-outcome': { at: NOW, kind: 'job-outcome', jobId: 'mk-1', jobType: 'wp-post', outcome: 'draft', pluginId: 'wordpress', activeMs: 1000 },
    'job-abandoned': { at: NOW, kind: 'job-abandoned', jobId: 'mk-1', pluginId: 'edoobox', activeMs: 1000 },
    'time-correction': { at: NOW, kind: 'time-correction', targetId: 'run-1', extraMs: 5 * 60_000, source: 'manual' },
    'voice-command': { at: NOW, kind: 'voice-command', actionId: null, status: 'rejected' }
  }

  it('kennt jede Art, die der Typ kennt — auch nach dem Umweg über die Datei', () => {
    for (const sample of Object.values(SAMPLES)) {
      const ausDatei: unknown = JSON.parse(JSON.stringify(sample))
      expect(isActivityEvent(ausDatei), sample.kind).toBe(true)
    }
  })

  it('überlebt als Referenzänderung Lesen, Verdichten und Auswerten', () => {
    // So arbeitet der Ledger: lesen (filter isActivityEvent) → anhängen → verdichten → schreiben.
    const gespeichert: unknown[] = JSON.parse(JSON.stringify([
      SAMPLES['reference-changed'],
      { at: NOW, kind: 'reference-changed', activityType: 'summary', fromMinutes: null, toMinutes: 15 }
    ]))
    const gelesen = pruneActivityEvents(gespeichert.filter(isActivityEvent), NOW)
    expect(gelesen).toHaveLength(2)
    expect(gelesen.map(e => e.kind)).toEqual(['reference-changed', 'reference-changed'])
  })

  it('lehnt eine Referenzänderung mit negativer Minute ab', () => {
    expect(isActivityEvent({ at: NOW, kind: 'reference-changed', activityType: 'document', fromMinutes: -1, toMinutes: 10 })).toBe(false)
  })

  it('lehnt kaputte Zeilen ab, statt die Bilanz zu sprengen', () => {
    expect(isActivityEvent(null)).toBe(false)
    expect(isActivityEvent({ kind: 'task-created', count: 1 })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'was-anderes' })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'task-created', count: 3 })).toBe(true)
  })

  it('prüft den Verbrauch eines Laufs mit — eine NaN-Summe darf nicht in die Bilanz', () => {
    const basis = { at: NOW, kind: 'agent-run-finished', runId: 'r', durationMs: 1000, activityType: 'summary', resultCount: 1, status: 'ok' }
    expect(isActivityEvent(basis)).toBe(true)
    expect(isActivityEvent({ ...basis, llm: { calls: 3, callsWithoutTokens: 0, cloudCalls: 0, promptTokens: 900, computeMs: 4200 } })).toBe(true)
    expect(isActivityEvent({ ...basis, llm: { calls: 'drei' } })).toBe(false)
    expect(isActivityEvent({ ...basis, llm: { calls: 3, callsWithoutTokens: 0, cloudCalls: 1, costReportedUsd: NaN } })).toBe(false)
    const mail = { at: NOW, kind: 'email-tasks-extracted', id: 'm', emails: 2, tasks: 1, durationMs: 500 }
    expect(isActivityEvent({ ...mail, llm: { calls: 2, callsWithoutTokens: 0, cloudCalls: 0 } })).toBe(true)
    expect(isActivityEvent({ ...mail, llm: { calls: -1, callsWithoutTokens: 0, cloudCalls: 0 } })).toBe(false)
  })
})

describe('summarizeActivity', () => {
  const range = localDayRange(NOW)

  it('zählt nur, was im Zeitraum liegt', () => {
    const events: ActivityEvent[] = [
      { at: NOW - 3 * DAY, kind: 'task-created', count: 5 },
      { at: NOW, kind: 'task-created', count: 2 }
    ]
    expect(summarizeActivity(events, range).tasksCreated).toBe(2)
  })

  it('bewertet nur Läufe mit übernommenem Ergebnis', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a' }),
      runFinished({ runId: 'run-b', activityType: 'document' }),
      accepted({ runId: 'run-a', format: 'xlsx' }),
      { at: NOW, kind: 'agent-result-discarded', runId: 'run-b', format: 'docx' }
    ]
    const summary = summarizeActivity(events, range)
    expect(summary.runsFinished).toBe(2)
    expect(summary.acceptedTotal).toBe(1)
    expect(summary.discardedTotal).toBe(1)
    expect(summary.acceptedRuns.map(r => r.runId)).toEqual(['run-a'])
  })

  it('findet die Laufzeit auch, wenn der Lauf vor Mitternacht endete und die Übernahme danach kam', () => {
    const beforeMidnight = range.from - 2 * 60_000
    const events: ActivityEvent[] = [
      runFinished({ at: beforeMidnight, runId: 'run-nacht', durationMs: 300_000 }),
      accepted({ at: range.from + 60_000, runId: 'run-nacht', format: 'xlsx' })
    ]
    const summary = summarizeActivity(events, range)
    // Der Lauf selbst zählt zum Vortag, die Übernahme zu heute — die Dauer wird trotzdem gefunden.
    expect(summary.runsFinished).toBe(0)
    expect(summary.acceptedRuns).toEqual([
      expect.objectContaining({ runId: 'run-nacht', activityType: 'table-merge', durationMs: 300_000, accepted: 1 })
    ])
  })

  it('zählt einen Lauf mit zwei übernommenen Ergebnissen EINMAL', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-x' }),
      accepted({ runId: 'run-x', format: 'xlsx' }),
      accepted({ runId: 'run-x', format: 'md' })
    ]
    const summary = summarizeActivity(events, range)
    expect(summary.acceptedTotal).toBe(2)
    expect(summary.acceptedRuns).toHaveLength(1)
    expect(summary.acceptedRuns[0].accepted).toBe(2)
  })

  it('schreibt einen Lauf nur EINMAL gut, auch wenn sein zweites Ergebnis am Folgetag übernommen wird', () => {
    // Ein Lauf darf zwei Ergebnisse liefern (Tabelle plus Notiz). Werden die an zwei
    // Tagen übernommen, bekäme sonst jeder Tag die volle Referenzzeit für dieselbe
    // Arbeit — die Tagessumme wäre doppelt so hoch wie die tatsächliche Ersparnis.
    const gestern = range.from - 6 * 3_600_000
    const events: ActivityEvent[] = [
      runFinished({ at: gestern, runId: 'run-zwei', durationMs: 10 * 60_000 }),
      accepted({ at: gestern + 60_000, runId: 'run-zwei', format: 'xlsx' }),
      accepted({ runId: 'run-zwei', format: 'md' })
    ]
    const heute = summarizeActivity(events, range)
    // Heute wurde ein Ergebnis übernommen — aber die Arbeit war gestern gutgeschrieben.
    expect(heute.acceptedTotal).toBe(1)
    expect(heute.acceptedRuns).toEqual([])
    expect(estimateSavedMinutes(heute, { 'table-merge': 45 }).totalMinutes).toBe(0)

    const gesternRange = { from: range.from - 86_400_000, to: range.from }
    const vortag = summarizeActivity(events, gesternRange)
    expect(vortag.acceptedRuns).toHaveLength(1)
    // 2 min Auftrag + 2 × 3 min Prüfung = 8 min aktive Arbeit, abgezogen von 45.
    expect(estimateSavedMinutes(vortag, { 'table-merge': 45 }).totalMinutes).toBe(37)
  })

  it('erfindet keine Dauer, wenn der zugehörige Lauf fehlt', () => {
    const events: ActivityEvent[] = [accepted({ runId: 'weg', format: 'md' })]
    const summary = summarizeActivity(events, range)
    expect(summary.acceptedTotal).toBe(1)
    expect(summary.acceptedRuns).toEqual([])
  })

  it('zählt nur ausgeführte Sprachbefehle', () => {
    const events: ActivityEvent[] = [
      { at: NOW, kind: 'voice-command', actionId: 'tasks.today', status: 'ok' },
      { at: NOW, kind: 'voice-command', actionId: null, status: 'rejected' }
    ]
    expect(summarizeActivity(events, range).voiceCommands).toBe(1)
  })
})

describe('Fehlversuche', () => {
  const range = { from: NOW - DAY, to: NOW + DAY }

  it('führt Läufe ohne übernommenes Ergebnis mit ihrer aktiven Zeit', () => {
    const events: ActivityEvent[] = [
      // verworfen: 2 min Auftrag + 3 min Prüfung
      runFinished({ runId: 'weg' }),
      { at: NOW + 1, kind: 'agent-result-discarded', runId: 'weg', format: 'xlsx', reviewMs: 3 * 60_000 },
      // gescheitert: nur der Auftrag
      runFinished({ runId: 'kaputt', status: 'failed', instructionMs: 60_000 }),
      // nie entschieden, ohne jede Messung
      runFinished({ runId: 'offen', instructionMs: undefined }),
      // übernommen — kein Fehlversuch
      runFinished({ runId: 'gut' }),
      accepted({ runId: 'gut' })
    ]
    const summary = summarizeActivity(events, range)
    expect(summary.acceptedRuns.map(r => r.runId)).toEqual(['gut'])
    expect(summary.discardedRuns).toEqual([
      { runId: 'weg', at: NOW, activityType: 'table-merge', model: undefined, activeMs: 5 * 60_000, reason: 'discarded' },
      { runId: 'kaputt', at: NOW, activityType: 'table-merge', model: undefined, activeMs: 60_000, reason: 'failed' },
      { runId: 'offen', at: NOW, activityType: 'table-merge', model: undefined, activeMs: null, reason: 'discarded' }
    ])
  })

  it('macht aus einer Übernahme am Folgetag keinen Fehlversuch', () => {
    const events: ActivityEvent[] = [runFinished(), accepted({ at: NOW + DAY + 60_000 })]
    expect(summarizeActivity(events, range).discardedRuns).toHaveLength(0)
  })

  it('zieht den Aufwand eines verworfenen Versuchs vom Gewinn des geglückten ab', () => {
    // Gegenprobe aus dem Codex-Review: 10 min Referenz, 3 min aktiv übernommen, plus ein
    // vollständig verworfener Versuch mit 3 min aktiv. Vorher standen hier 7 min.
    const events: ActivityEvent[] = [
      runFinished({ runId: 'gut', instructionMs: 60_000 }),
      accepted({ runId: 'gut', reviewMs: 2 * 60_000 }),
      runFinished({ runId: 'weg', instructionMs: 60_000 }),
      { at: NOW + 1, kind: 'agent-result-discarded', runId: 'weg', format: 'xlsx', reviewMs: 2 * 60_000 }
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 10 })
    expect(saved.totalMinutes).toBe(4)
    expect(saved.wastedRuns).toBe(1)
    expect(saved.lines[0]).toMatchObject({ runs: 1, wastedRuns: 1, wastedMinutes: 3, savedMinutes: 4 })
  })

  it('zeigt eine Art mit ausschließlich Fehlversuchen als Verlust, nicht als nichts', () => {
    const events: ActivityEvent[] = [runFinished({ runId: 'weg', instructionMs: 4 * 60_000 })]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 30 })
    expect(saved.lines).toHaveLength(1)
    expect(saved.lines[0]).toMatchObject({ runs: 0, wastedRuns: 1, savedMinutes: -4 })
    expect(saved.totalMinutes).toBe(-4)
    expect(impactBadge(summarizeActivity(events, range), saved)).toEqual({ kind: 'minutes', minutes: -4 })
  })

  it('bewertet Fehlversuche ohne Referenz nicht — die Art bleibt „nicht bewertbar"', () => {
    const events: ActivityEvent[] = [runFinished({ runId: 'weg', activityType: 'document' })]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 30 })
    expect(saved.lines).toHaveLength(0)
    expect(saved.unpricedTypes).toEqual(['document'])
    expect(saved.totalMinutes).toBe(0)
  })

  it('zählt einen Fehlversuch ohne Messung als nicht gemessen, statt ihn zu verschweigen', () => {
    const events: ActivityEvent[] = [runFinished({ runId: 'weg', instructionMs: undefined })]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 30 })
    expect(saved.unmeasuredRuns).toBe(1)
    expect(saved.totalMinutes).toBe(0)
  })
})

describe('estimateSavedMinutes', () => {
  const range = localDayRange(NOW)

  it('sagt ohne Referenzzeit nichts über Minuten', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a' }),
      accepted({ runId: 'run-a', format: 'xlsx' })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), {})
    expect(saved.totalMinutes).toBe(0)
    expect(saved.lines).toEqual([])
    expect(saved.unpricedTypes).toEqual(['table-merge'])
  })

  it('zieht die AKTIVE Arbeitszeit ab, nicht die Laufzeit des Agenten', () => {
    // Der Kern der Wirkungsbilanz: Der Agent rechnet 14 Minuten, der Mensch hat davon
    // 2 Minuten formuliert und 3 Minuten geprüft. Abgezogen werden 5, nicht 14 — wer
    // während des Laufs anderes erledigt, hat diese Zeit nicht aufgewendet.
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 14 * 60_000, instructionMs: 2 * 60_000 }),
      accepted({ runId: 'run-a', reviewMs: 3 * 60_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.totalMinutes).toBe(40)
    expect(saved.lines[0]).toMatchObject({
      runs: 1, referenceMinutes: 45, activeMinutes: 5, runtimeMinutes: 14, savedMinutes: 40
    })
  })

  it('behält den Rohwert, damit ein kurzer Vorgang nicht als „0 min aktiv" erscheint', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 15_000, instructionMs: 8_000 }),
      accepted({ runId: 'run-a', reviewMs: 7_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 30 })
    expect(saved.lines[0].activeMinutes).toBe(0)
    expect(saved.lines[0].activeMs).toBe(15_000)
    // Auch die Kontextzeile braucht den Rohwert — ein 15-Sekunden-Lauf ist nicht „0 min".
    expect(saved.lines[0].runtimeMinutes).toBe(0)
    expect(saved.lines[0].runtimeMs).toBe(15_000)
  })

  it('bewertet einen Lauf ohne gemessene Arbeitszeit NICHT, sondern meldet ihn', () => {
    // Alte Läufe tragen keine Messung. Eine 0 anzunehmen hieße, die volle Referenzzeit
    // als Ersparnis auszuweisen — die unehrlichste aller Möglichkeiten.
    const events: ActivityEvent[] = [
      { at: NOW, kind: 'agent-run-finished', runId: 'alt', durationMs: 60_000, activityType: 'table-merge', resultCount: 1, status: 'ok' },
      { at: NOW, kind: 'agent-result-accepted', runId: 'alt', format: 'xlsx' }
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.totalMinutes).toBe(0)
    expect(saved.lines).toEqual([])
    expect(saved.unmeasuredRuns).toBe(1)
  })

  it('summiert die Prüfzeit über mehrere Ergebnisse desselben Laufs', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', instructionMs: 60_000 }),
      accepted({ runId: 'run-a', format: 'xlsx', reviewMs: 60_000 }),
      accepted({ runId: 'run-a', format: 'md', reviewMs: 120_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.lines[0].activeMinutes).toBe(4)
    expect(saved.totalMinutes).toBe(41)
  })

  it('weist Mehraufwand als Minus aus, statt ihn zu verschweigen', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', instructionMs: 40 * 60_000 }),
      accepted({ runId: 'run-a', reviewMs: 20 * 60_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    // 60 min aktiv gegen 45 min von Hand — das sind 15 Minuten Verlust, keine Null.
    expect(saved.totalMinutes).toBe(-15)
  })

  it('summiert mehrere Vorgänge derselben Art korrekt', () => {
    // Die Referenzzeit gilt JE Vorgang. Bei zwei Läufen stehen 2 × 30 min Handarbeit
    // gegen die Summe der aktiven Zeit — sonst liest sich die Zeile wie ein Rechenfehler.
    const events: ActivityEvent[] = [
      runFinished({ runId: 'a', instructionMs: 60_000 }),
      accepted({ runId: 'a', reviewMs: 60_000 }),
      runFinished({ runId: 'b', instructionMs: 60_000 }),
      accepted({ runId: 'b', reviewMs: 60_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 30 })
    expect(saved.lines[0].runs).toBe(2)
    expect(saved.lines[0].activeMinutes).toBe(4)
    expect(saved.totalMinutes).toBe(56)   // 2 × (30 − 2)
  })

  it('bewertet nur bepreiste Arten und meldet die anderen getrennt', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 5 * 60_000 }),
      runFinished({ runId: 'run-b', activityType: 'document', durationMs: 5 * 60_000 }),
      accepted({ runId: 'run-a', format: 'xlsx' }),
      accepted({ runId: 'run-b', format: 'docx' })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.totalMinutes).toBe(40)
    expect(saved.lines).toHaveLength(1)
    expect(saved.unpricedTypes).toEqual(['document'])
  })

  it('ignoriert eine Referenzzeit von 0 — sie ist keine Angabe', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a' }),
      accepted({ runId: 'run-a', format: 'xlsx' })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 0 })
    expect(saved.lines).toEqual([])
    expect(saved.unpricedTypes).toEqual(['table-merge'])
  })
})

describe('Wartezeit und Modellvergleich', () => {
  const range = localDayRange(NOW)

  it('zählt die Wartezeit am Bildschirm zur aktiven Zeit', () => {
    // Genau hier wird die Modellwahl sichtbar: Wer vierzehn Minuten vor dem Schirm
    // wartet, hat diese Zeit verloren — wer wegklickt, nicht.
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 14 * 60_000, instructionMs: 2 * 60_000, model: 'qwen3.8:27b-mlx' }),
      accepted({ runId: 'run-a', reviewMs: 3 * 60_000, waitingMs: 10 * 60_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.lines[0].activeMinutes).toBe(15)   // 2 + 3 + 10
    expect(saved.totalMinutes).toBe(30)
    expect(saved.lines[0].models).toEqual(['qwen3.8:27b-mlx'])
  })

  it('zählt die Wartezeit nur EINMAL je Lauf, auch bei zwei Ergebnissen', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', instructionMs: 0 }),
      accepted({ runId: 'run-a', format: 'xlsx', reviewMs: 60_000, waitingMs: 5 * 60_000 }),
      accepted({ runId: 'run-a', format: 'md', reviewMs: 60_000, waitingMs: 5 * 60_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    // 5 min Warten + 2 × 1 min Prüfen — nicht 10 min Warten.
    expect(saved.lines[0].activeMinutes).toBe(7)
  })

  it('macht den Unterschied zwischen zwei Modellen sichtbar', () => {
    const langsam: ActivityEvent[] = [
      runFinished({ runId: 'lokal', durationMs: 14 * 60_000, instructionMs: 2 * 60_000, model: 'qwen3.8:27b-mlx' }),
      accepted({ runId: 'lokal', reviewMs: 6 * 60_000, waitingMs: 4 * 60_000 })
    ]
    const schnell: ActivityEvent[] = [
      runFinished({ runId: 'cloud', durationMs: 60_000, instructionMs: 2 * 60_000, model: 'llmbase/deepseek-flash-v4' }),
      accepted({ runId: 'cloud', reviewMs: 6 * 60_000, waitingMs: 60_000 })
    ]
    const a = estimateSavedMinutes(summarizeActivity(langsam, range), { 'table-merge': 45 })
    const b = estimateSavedMinutes(summarizeActivity(schnell, range), { 'table-merge': 45 })
    expect(a.totalMinutes).toBe(33)
    expect(b.totalMinutes).toBe(36)
    expect(b.lines[0].models).toEqual(['llmbase/deepseek-flash-v4'])
  })

  it('führt Mail-Extraktion als eigenen Vorgang mit Wartezeit', () => {
    const events: ActivityEvent[] = [
      { at: NOW, kind: 'email-tasks-extracted', id: 'mail-1', emails: 23, tasks: 7, durationMs: 4 * 60_000, model: 'llmbase/deepseek-flash-v4', waitingMs: 2 * 60_000 }
    ]
    const summary = summarizeActivity(events, range)
    expect(summary.emailTasks).toBe(7)
    expect(summary.emailsAnalyzed).toBe(23)
    expect(summary.acceptedRuns).toHaveLength(1)
    const saved = estimateSavedMinutes(summary, { 'email-tasks': 20 })
    expect(saved.totalMinutes).toBe(18)
  })

  it('bewertet einen Mail-Durchgang ohne Fund NICHT', () => {
    // Ein Lauf, der nichts findet, kostet Zeit und ersetzt keine Handarbeit.
    const events: ActivityEvent[] = [
      { at: NOW, kind: 'email-tasks-extracted', id: 'mail-2', emails: 12, tasks: 0, durationMs: 60_000, waitingMs: 30_000 }
    ]
    const summary = summarizeActivity(events, range)
    expect(summary.emailRuns).toBe(1)
    expect(summary.acceptedRuns).toEqual([])
    expect(estimateSavedMinutes(summary, { 'email-tasks': 20 }).totalMinutes).toBe(0)
  })
})

describe('Nachbesserungen aus der zweiten Durchsicht', () => {
  const range = localDayRange(NOW)

  it('verliert keine Zeit, wenn erst verworfen und dann übernommen wird', () => {
    // Die Zeiten hängen an der ERSTEN Entscheidung. Zählte die Bilanz nur Übernahmen,
    // stünde der übernommene Lauf ohne Prüf- und Vordergrundzeit da — also zu günstig.
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', instructionMs: 60_000 }),
      { at: NOW, kind: 'agent-result-discarded', runId: 'run-a', format: 'md', reviewMs: 4 * 60_000, waitingMs: 5 * 60_000 },
      accepted({ runId: 'run-a', format: 'xlsx', reviewMs: 2 * 60_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    // 1 min Auftrag + (4 + 2) min Prüfen + 5 min Vordergrund = 12 min
    expect(saved.lines[0].activeMinutes).toBe(12)
    expect(saved.totalMinutes).toBe(33)
  })

  it('zeigt einen Zeitverlust als Minus, statt ihn auf null zu kappen', () => {
    // Eine Kennzahl, die nur gewinnen kann, ist als Nachweis wertlos.
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', instructionMs: 20 * 60_000 }),
      accepted({ runId: 'run-a', reviewMs: 30 * 60_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.totalMinutes).toBe(-5)
    expect(impactBadge(summarizeActivity(events, range), saved)).toEqual({ kind: 'minutes', minutes: -5 })
  })

  it('weist eine beschädigte Mail-Zeile ab, statt NaN zu erzeugen', () => {
    expect(isActivityEvent({ at: NOW, kind: 'email-tasks-extracted', id: 'x', tasks: 3, durationMs: 100 })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'email-tasks-extracted', id: 'x', emails: 5, tasks: 3, durationMs: 100 })).toBe(true)
    expect(isActivityEvent({ at: NOW, kind: 'email-tasks-extracted', emails: 5, tasks: 3, durationMs: 100 })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'email-tasks-extracted', id: 'x', emails: 5, tasks: -1, durationMs: 100 })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'email-tasks-extracted', id: 'x', emails: 5, tasks: 3, durationMs: 100, waitingMs: 'viel' })).toBe(false)
  })
})

describe('Modellvergleich', () => {
  const range = localDayRange(NOW)

  it('trennt zwei Modelle derselben Tätigkeitsart mit Anzahl und Median', () => {
    // Zusammengefasst mit beiden Namen ließ sich nichts vergleichen — genau das war
    // der Befund. Jetzt steht je Modell eine Zeile.
    const events: ActivityEvent[] = [
      runFinished({ runId: 'q1', model: 'qwen3.8:27b-mlx', durationMs: 14 * 60_000, instructionMs: 60_000 }),
      accepted({ runId: 'q1', reviewMs: 60_000, waitingMs: 8 * 60_000 }),
      runFinished({ runId: 'q2', model: 'qwen3.8:27b-mlx', durationMs: 12 * 60_000, instructionMs: 60_000 }),
      accepted({ runId: 'q2', reviewMs: 60_000, waitingMs: 6 * 60_000 }),
      runFinished({ runId: 'd1', model: 'llmbase/deepseek-flash-v4', durationMs: 60_000, instructionMs: 60_000 }),
      accepted({ runId: 'd1', reviewMs: 60_000, waitingMs: 60_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.byModel).toHaveLength(2)
    const qwen = saved.byModel.find(r => r.model.startsWith('qwen'))!
    const deep = saved.byModel.find(r => r.model.startsWith('llmbase'))!
    expect(qwen.runs).toBe(2)
    expect(qwen.medianActiveMinutes).toBe(9)      // Median aus 10 und 8
    expect(qwen.medianRuntimeMinutes).toBe(13)
    expect(deep.runs).toBe(1)
    expect(deep.medianActiveMinutes).toBe(3)
  })

  it('nimmt den Median, nicht den Mittelwert, damit ein Ausreißer nicht regiert', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'a', model: 'm', instructionMs: 60_000 }),
      accepted({ runId: 'a', reviewMs: 0, waitingMs: 0 }),
      runFinished({ runId: 'b', model: 'm', instructionMs: 60_000 }),
      accepted({ runId: 'b', reviewMs: 0, waitingMs: 0 }),
      runFinished({ runId: 'c', model: 'm', instructionMs: 60 * 60_000 }),
      accepted({ runId: 'c', reviewMs: 0, waitingMs: 0 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    const zeile = saved.byModel[0]
    expect(zeile.medianActiveMinutes).toBe(1)     // 1, 1, 60 → Median 1
    expect(zeile.meanActiveMinutes).toBe(21)      // Mittelwert wäre irreführend
  })
})

describe('Dritte Durchsicht', () => {
  const range = localDayRange(NOW)

  it('zeigt einen Tag mit ausschließlich Mail-Aufgaben statt zu verstummen', () => {
    // Ohne Referenzzeit gibt es keine Minuten — aber der Tag ist nicht leer, und genau
    // dieser Fall ist der häufigste.
    const events: ActivityEvent[] = [
      { at: NOW, kind: 'email-tasks-extracted', id: 'm1', emails: 18, tasks: 5, durationMs: 60_000, waitingMs: 30_000 }
    ]
    const summary = summarizeActivity(events, range)
    expect(impactBadge(summary, estimateSavedMinutes(summary, {}))).toEqual({ kind: 'email-tasks', count: 5 })
  })

  it('zeigt Mail-Aufgaben auch bei exakt ausgeglichener Bilanz', () => {
    const events: ActivityEvent[] = [
      { at: NOW, kind: 'email-tasks-extracted', id: 'm1', emails: 4, tasks: 3, durationMs: 60_000, waitingMs: 20 * 60_000 }
    ]
    const summary = summarizeActivity(events, range)
    // 20 min Vordergrund gegen 20 min Referenz: null Unterschied, aber drei Aufgaben.
    const saved = estimateSavedMinutes(summary, { 'email-tasks': 20 })
    expect(saved.totalMinutes).toBe(0)
    expect(impactBadge(summary, saved)).toEqual({ kind: 'email-tasks', count: 3 })
  })
})

describe('impactBadge', () => {
  const range = localDayRange(NOW)

  function badgeFor(events: ActivityEvent[], reference = {}) {
    const summary = summarizeActivity(events, range)
    return impactBadge(summary, estimateSavedMinutes(summary, reference))
  }

  it('schweigt an einem Tag ohne Ergebnis — eine Null wäre eine Aussage', () => {
    expect(badgeFor([])).toEqual({ kind: 'none' })
  })

  it('zeigt Minuten, sobald eine Referenzzeit greift', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 5 * 60_000 }),
      accepted({ runId: 'run-a', format: 'xlsx' })
    ]
    expect(badgeFor(events, { 'table-merge': 45 })).toEqual({ kind: 'minutes', minutes: 40 })
  })

  it('fällt ohne Referenzzeit auf die Übernahmen zurück', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a' }),
      accepted({ runId: 'run-a', format: 'xlsx' })
    ]
    expect(badgeFor(events)).toEqual({ kind: 'accepted', count: 1 })
  })

  it('zeigt Aufgaben, wenn sonst nichts vorliegt', () => {
    expect(badgeFor([{ at: NOW, kind: 'task-created', count: 4 }])).toEqual({ kind: 'tasks', count: 4 })
  })

  it('zeigt bei exakt ausgeglichener Bilanz die Übernahmen statt einer Null', () => {
    const events: ActivityEvent[] = [
      // 20 + 25 min aktiv gegen 45 min von Hand: exakt null Unterschied.
      runFinished({ runId: 'run-a', instructionMs: 20 * 60_000 }),
      accepted({ runId: 'run-a', format: 'xlsx', reviewMs: 25 * 60_000 })
    ]
    // Genau null ist keine Aussage über den Tag — dann steht da, was passiert ist.
    expect(badgeFor(events, { 'table-merge': 45 })).toEqual({ kind: 'accepted', count: 1 })
  })
})

describe('localDayRange', () => {
  it('umfasst genau einen Tag ab Mitternacht lokaler Zeit', () => {
    const range = localDayRange(NOW)
    expect(new Date(range.from).getHours()).toBe(0)
    expect(range.to - range.from).toBeGreaterThanOrEqual(23 * 3_600_000)
    expect(range.to - range.from).toBeLessThanOrEqual(25 * 3_600_000)
    expect(NOW).toBeGreaterThanOrEqual(range.from)
    expect(NOW).toBeLessThan(range.to)
  })
})

describe('Plugin-Vorgänge (Paket 2)', () => {
  const range = { from: NOW - DAY, to: NOW + DAY }
  const M = 60_000
  const start = (jobId: string, at = NOW, model?: string): ActivityEvent =>
    ({ at, kind: 'job-started', jobId, jobKind: 'marketing', pluginId: 'edoobox', model })
  const outcome = (jobId: string, jobType: 'wp-post' | 'ig-caption' | 'attendance-list', out: 'draft' | 'published' | 'used' | 'saved', at = NOW, activeMs?: number): ActivityEvent =>
    ({ at, kind: 'job-outcome', jobId, jobType, outcome: out, pluginId: 'p', activeMs })
  const abandoned = (jobId: string, at = NOW, activeMs?: number): ActivityEvent =>
    ({ at, kind: 'job-abandoned', jobId, pluginId: 'edoobox', activeMs })

  it('schreibt einen Vorgang je (jobId, Kanal) genau einmal gut — Entwurf → veröffentlicht ändert nur das Etikett', () => {
    const events = [start('mk-1'), outcome('mk-1', 'wp-post', 'draft', NOW, 4 * M), outcome('mk-1', 'wp-post', 'published', NOW + M, 6 * M)]
    const s = summarizeActivity(events, range)
    expect(s.jobs.completedTotal).toBe(1)
    expect(s.jobs.completed['wp-post']).toEqual({ published: 1 })
    expect(s.jobRuns).toEqual([expect.objectContaining({ jobId: 'mk-1', channels: ['wp-post'], activeMs: 6 * M, abandoned: false })])
    expect(s.acceptedRuns).toHaveLength(0)
  })

  it('zieht die gemeinsame Vorbereitung EINMAL ab, auf Vorgangsebene', () => {
    const events = [start('mk-1', NOW, 'qwen3:8b'), outcome('mk-1', 'wp-post', 'draft', NOW, 5 * M), outcome('mk-1', 'ig-caption', 'used', NOW + M, 5 * M)]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'wp-post': 20, 'ig-caption': 10 })
    // 20 + 10 − 5 = 25, nicht 20 − 5 + 10 − 5 = 20
    expect(saved.totalMinutes).toBe(25)
    expect(saved.lines.map(l => [l.activityType, l.runs, l.savedMinutes])).toEqual([['wp-post', 1, 15], ['ig-caption', 1, 10]])
    expect(saved.byModel[0]).toMatchObject({ activityType: 'wp-post', model: 'qwen3:8b', runs: 1 })
  })

  it('F10: fehlt die Referenz des ersten Kanals, wird die Zeit gegen den zweiten gerechnet — nicht verschluckt', () => {
    // WordPress zuerst (3 min kumulativ), Instagram danach (5 min), nur Instagram-Referenz 10 min.
    const events = [start('mk-1'), outcome('mk-1', 'wp-post', 'draft', NOW, 3 * M), outcome('mk-1', 'ig-caption', 'used', NOW + M, 5 * M)]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'ig-caption': 10 })
    expect(saved.totalMinutes).toBe(5)
    expect(saved.lines).toEqual([expect.objectContaining({ activityType: 'ig-caption', runs: 1, activeMs: 5 * M, savedMinutes: 5 })])
    expect(saved.unpricedTypes).toEqual([])
  })

  it('lässt einen Vorgang ohne jede Referenz unbewertet — und nennt seine Kanäle', () => {
    const events = [start('mk-1'), outcome('mk-1', 'wp-post', 'draft', NOW, 3 * M)]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 30 })
    expect(saved.totalMinutes).toBe(0)
    expect(saved.unpricedTypes).toEqual(['wp-post'])
  })

  it('bewertet Vorgänge ohne gemessene Zeit nicht, sondern zählt sie', () => {
    const events = [start('mk-2'), outcome('mk-2', 'wp-post', 'draft'), outcome('mk-2', 'ig-caption', 'used')]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'wp-post': 20, 'ig-caption': 10 })
    expect(saved.unmeasuredRuns).toBe(1)
    expect(saved.totalMinutes).toBe(0)
  })

  it('zählt Vorbereitungen ohne Abschluss getrennt — Generieren ist kein Ergebnis', () => {
    const s = summarizeActivity([start('mk-3'), start('mk-4'), outcome('mk-4', 'wp-post', 'draft')], range)
    expect(s.jobs.prepared).toBe(1)
    expect(s.jobs.completedTotal).toBe(1)
  })

  it('F9: eine aufgegebene Vorbereitung zieht ihre Zeit ab wie ein Fehlversuch', () => {
    const events = [start('mk-alt', NOW, 'qwen3:8b'), abandoned('mk-alt', NOW + M, 4 * M), start('mk-neu'), outcome('mk-neu', 'wp-post', 'draft', NOW + 2 * M, 6 * M)]
    const s = summarizeActivity(events, range)
    expect(s.jobs.abandoned).toBe(1)
    expect(s.jobs.prepared).toBe(0)
    const saved = estimateSavedMinutes(s, { 'wp-post': 20 })
    // 20 − 6 − 4 = 10
    expect(saved.totalMinutes).toBe(10)
    expect(saved.lines[0]).toMatchObject({ activityType: 'wp-post', runs: 1, wastedRuns: 1, wastedMinutes: 4 })
  })

  it('F16: Aufgeben nach Teilerfolg ist kein zweiter Fehlversuch, hebt aber die Zeit des Vorgangs an', () => {
    // WordPress nach 5 min fertig, danach 4 min erfolglos an Instagram, dann neu generiert (9 min kumulativ).
    const events = [start('mk-1'), outcome('mk-1', 'wp-post', 'draft', NOW, 5 * M), abandoned('mk-1', NOW + M, 9 * M)]
    const s = summarizeActivity(events, range)
    expect(s.jobs.abandoned).toBe(0)
    expect(s.jobRuns).toEqual([expect.objectContaining({ jobId: 'mk-1', channels: ['wp-post'], activeMs: 9 * M, abandoned: false })])
    expect(estimateSavedMinutes(s, { 'wp-post': 20 }).totalMinutes).toBe(11)
  })

  it('F12: die Summe der Abschnitte stimmt mit dem Gesamtzeitraum überein, auch ohne Referenz des ersten Kanals', () => {
    // WordPress Tag 1 (3 min kumulativ) ohne Referenz, Instagram Tag 2 (5 min) mit Referenz 10.
    const tag1 = { from: NOW - 2 * DAY, to: NOW - DAY }
    const tag2 = { from: NOW - DAY, to: NOW }
    const events = [start('mk-1', NOW - 2 * DAY), outcome('mk-1', 'wp-post', 'draft', NOW - 2 * DAY + M, 3 * M), outcome('mk-1', 'ig-caption', 'used', NOW - DAY + M, 5 * M)]
    const ref = { 'ig-caption': 10 }
    const t1 = estimateSavedMinutes(summarizeActivity(events, tag1), ref).totalMinutes
    const t2 = estimateSavedMinutes(summarizeActivity(events, tag2), ref).totalMinutes
    const gesamt = estimateSavedMinutes(summarizeActivity(events, { from: tag1.from, to: tag2.to }), ref).totalMinutes
    expect([t1, t2, gesamt]).toEqual([0, 5, 5])
    // Mit Referenz für beide Kanäle verbucht Tag 1 die Zeit, Tag 2 bringt nur seine Referenz.
    const beide = { 'wp-post': 20, 'ig-caption': 10 }
    const b1 = estimateSavedMinutes(summarizeActivity(events, tag1), beide).totalMinutes
    const b2 = estimateSavedMinutes(summarizeActivity(events, tag2), beide).totalMinutes
    const bg = estimateSavedMinutes(summarizeActivity(events, { from: tag1.from, to: tag2.to }), beide).totalMinutes
    expect([b1, b2, bg]).toEqual([15, 10, 25])
  })

  it('rechnet den zweiten Kanal am Folgetag ohne erneuten Zeitabzug', () => {
    const events = [start('mk-5'), outcome('mk-5', 'wp-post', 'draft', NOW - DAY - M, 8 * M), outcome('mk-5', 'ig-caption', 'used', NOW, 9 * M)]
    const s = summarizeActivity(events, range)
    expect(s.jobRuns).toEqual([expect.objectContaining({ jobId: 'mk-5', channels: ['ig-caption'], earlierChannels: ['wp-post'] })])
    expect(estimateSavedMinutes(s, { 'wp-post': 20, 'ig-caption': 10 }).totalMinutes).toBe(10)
  })

  it('führt eine Teilnehmerliste ohne Vorbereitungs-Ereignis als abgeschlossenen Vorgang', () => {
    const s = summarizeActivity([outcome('tl-abc', 'attendance-list', 'saved', NOW, 40_000)], range)
    expect(s.jobs.completed['attendance-list']).toEqual({ saved: 1 })
    expect(s.jobRuns[0]).toMatchObject({ jobKind: 'attendance-list', channels: ['attendance-list'], activeMs: 40_000 })
    expect(impactBadge(s, estimateSavedMinutes(s, {}))).toEqual({ kind: 'jobs', count: 1 })
  })

  it('stableJobId: gleiche Teile = gleiche Kennung, Reihenfolge zählt, kein Inhalt sichtbar', () => {
    const a = stableJobId(['attendance-list', 'offer-1', '2026-09-08'])
    expect(a).toBe(stableJobId(['attendance-list', 'offer-1', '2026-09-08']))
    expect(a).not.toBe(stableJobId(['attendance-list', 'offer-1', '2026-09-09']))
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('pluginActivityEvent: Kern setzt Zeit und Plugin-ID, verwirft Fremdes', () => {
    expect(pluginActivityEvent('edoobox', { kind: 'job-started', jobId: 'mk-9', jobKind: 'marketing', at: 1, pluginId: 'other' }, NOW))
      .toEqual({ at: NOW, kind: 'job-started', jobId: 'mk-9', jobKind: 'marketing', pluginId: 'edoobox' })
    expect(pluginActivityEvent('edoobox', { kind: 'job-outcome', jobId: 'mk-9', jobType: 'ig-caption', outcome: 'used', activeMs: 1234.6 }, NOW))
      .toEqual({ at: NOW, kind: 'job-outcome', jobId: 'mk-9', jobType: 'ig-caption', outcome: 'used', pluginId: 'edoobox', activeMs: 1235 })
    expect(pluginActivityEvent('edoobox', { kind: 'job-abandoned', jobId: 'mk-9', activeMs: 500 }, NOW))
      .toEqual({ at: NOW, kind: 'job-abandoned', jobId: 'mk-9', pluginId: 'edoobox', activeMs: 500 })
    expect(pluginActivityEvent('edoobox', { kind: 'agent-run-finished', runId: 'x' }, NOW)).toBeNull()
    expect(pluginActivityEvent('edoobox', { kind: 'job-outcome', jobId: 'Titel der Veranstaltung', jobType: 'wp-post', outcome: 'draft' }, NOW)).toBeNull()
    expect(pluginActivityEvent('edoobox', { kind: 'job-outcome', jobId: 'mk-9', jobType: 'wp-post', outcome: 'printed' }, NOW)).toBeNull()
    expect(pluginActivityEvent('', { kind: 'job-started', jobId: 'mk-9', jobKind: 'marketing' }, NOW)).toBeNull()
  })
})

describe('Manuelle Zeitkorrektur (Paket 3)', () => {
  const range = { from: NOW - DAY, to: NOW + DAY }
  const M = 60_000
  const korrektur = (targetId: string, min: number, at = NOW + 60 * M): ActivityEvent =>
    ({ at, kind: 'time-correction', targetId, extraMs: min * M, source: 'manual' })

  it('zählt Nacharbeit zur aktiven Zeit des Laufs und weist sie als nachgetragen aus', () => {
    const events = [runFinished({ runId: 'a', instructionMs: 2 * M }), accepted({ runId: 'a', reviewMs: 3 * M }), korrektur('a', 10)]
    const s = summarizeActivity(events, range)
    expect(s.acceptedRuns[0]).toMatchObject({ runId: 'a', activeMs: 15 * M, correctedMs: 10 * M })
    const saved = estimateSavedMinutes(s, { 'table-merge': 30 })
    expect(saved.totalMinutes).toBe(15)
    expect(saved.lines[0]).toMatchObject({ correctedRuns: 1, correctedMs: 10 * M })
    expect(saved.correctedRuns).toBe(1)
  })

  it('F13: ein Nachtrag ersetzt keine fehlende Messung — der Lauf bleibt unbewertet', () => {
    // Das Formular fragt nach ZUSÄTZLICHER Nacharbeit; die unbekannte Basis bleibt unbekannt.
    const events = [runFinished({ runId: 'u', instructionMs: undefined }), accepted({ runId: 'u', reviewMs: undefined }), korrektur('u', 5)]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 30 })
    expect(saved.unmeasuredRuns).toBe(1)
    expect(saved.totalMinutes).toBe(0)
    expect(saved.correctedRuns).toBe(0)
  })

  it('gehört zum Lauf, nicht zum Tag der Eingabe, und gilt auch für Fehlversuche, Mail-Durchgänge und Vorgänge', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'weg', instructionMs: M }),
      { at: NOW, kind: 'email-tasks-extracted', id: 'mail-x', emails: 5, tasks: 2, durationMs: 1000, waitingMs: 30_000 },
      { at: NOW, kind: 'job-outcome', jobId: 'tl-1', jobType: 'attendance-list', outcome: 'saved', pluginId: 'edoobox', activeMs: 40_000 },
      korrektur('weg', 4, NOW + 3 * DAY), korrektur('mail-x', 2, NOW + 3 * DAY), korrektur('tl-1', 6, NOW + 3 * DAY)
    ]
    const s = summarizeActivity(events, range)
    expect(s.discardedRuns[0]).toMatchObject({ activeMs: 5 * M, correctedMs: 4 * M })
    expect(s.acceptedRuns.find(r => r.runId === 'mail-x')).toMatchObject({ activeMs: 150_000, correctedMs: 2 * M })
    expect(s.jobRuns[0]).toMatchObject({ activeMs: 400_000, correctedMs: 6 * M })
    const saved = estimateSavedMinutes(s, { 'table-merge': 30, 'email-tasks': 4, 'attendance-list': 15 })
    expect(saved.correctedRuns).toBe(3)
  })

  it('lehnt unsinnige Korrekturen ab: null, negativ, über acht Stunden, fremde Quelle', () => {
    expect(isActivityEvent({ at: NOW, kind: 'time-correction', targetId: 'a', extraMs: 0, source: 'manual' })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'time-correction', targetId: 'a', extraMs: -1, source: 'manual' })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'time-correction', targetId: 'a', extraMs: MAX_CORRECTION_MS + 1, source: 'manual' })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'time-correction', targetId: 'a', extraMs: 1000, source: 'auto' })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'time-correction', targetId: 'a', extraMs: 1000, source: 'manual' })).toBe(true)
  })

  it('kennt nur Ziele, die im Protokoll stehen', () => {
    const events: ActivityEvent[] = [runFinished({ runId: 'a' }), { at: NOW, kind: 'job-outcome', jobId: 'tl-1', jobType: 'attendance-list', outcome: 'saved', pluginId: 'p' }]
    expect(isCorrectionTargetKnown(events, 'a')).toBe(true)
    expect(isCorrectionTargetKnown(events, 'tl-1')).toBe(true)
    expect(isCorrectionTargetKnown(events, 'erfunden')).toBe(false)
  })
})
