import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_MAX_EVENTS,
  impactBadge,
  deriveActivityType,
  estimateSavedMinutes,
  isActivityEvent,
  localDayRange,
  pruneActivityEvents,
  summarizeActivity,
  type ActivityEvent
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
  it('wirft Einträge älter als 90 Tage weg', () => {
    const events: ActivityEvent[] = [
      { at: NOW - 91 * DAY, kind: 'task-created', count: 1 },
      { at: NOW - 89 * DAY, kind: 'task-created', count: 1 }
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
  it('lehnt kaputte Zeilen ab, statt die Bilanz zu sprengen', () => {
    expect(isActivityEvent(null)).toBe(false)
    expect(isActivityEvent({ kind: 'task-created', count: 1 })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'was-anderes' })).toBe(false)
    expect(isActivityEvent({ at: NOW, kind: 'task-created', count: 3 })).toBe(true)
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

  it('wird nie negativ, wenn der Lauf länger dauert als die Referenzzeit', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', instructionMs: 40 * 60_000 }),
      accepted({ runId: 'run-a', reviewMs: 20 * 60_000 })
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.totalMinutes).toBe(0)
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
      { at: NOW, kind: 'email-tasks-extracted', emails: 23, tasks: 7, durationMs: 4 * 60_000, model: 'llmbase/deepseek-flash-v4', waitingMs: 2 * 60_000 }
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
      { at: NOW, kind: 'email-tasks-extracted', emails: 12, tasks: 0, durationMs: 60_000, waitingMs: 30_000 }
    ]
    const summary = summarizeActivity(events, range)
    expect(summary.emailRuns).toBe(1)
    expect(summary.acceptedRuns).toEqual([])
    expect(estimateSavedMinutes(summary, { 'email-tasks': 20 }).totalMinutes).toBe(0)
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

  it('zeigt keine Minuten, wenn die Ersparnis auf null zusammenfällt', () => {
    const events: ActivityEvent[] = [
      // Aktive Arbeit länger als von Hand — kein Gewinn, aber die Übernahme zählt.
      runFinished({ runId: 'run-a', instructionMs: 30 * 60_000 }),
      accepted({ runId: 'run-a', format: 'xlsx', reviewMs: 30 * 60_000 })
    ]
    // Der Lauf dauerte länger als die Referenzzeit — dann steht die Übernahme da,
    // nicht „0 min gespart".
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
