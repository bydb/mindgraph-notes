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
    activityType: 'table-merge',
    resultCount: 1,
    status: 'ok',
    ...over
  }
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
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' },
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
      { at: range.from + 60_000, kind: 'agent-result-accepted', runId: 'run-nacht', format: 'xlsx' }
    ]
    const summary = summarizeActivity(events, range)
    // Der Lauf selbst zählt zum Vortag, die Übernahme zu heute — die Dauer wird trotzdem gefunden.
    expect(summary.runsFinished).toBe(0)
    expect(summary.acceptedRuns).toEqual([
      { runId: 'run-nacht', activityType: 'table-merge', durationMs: 300_000, accepted: 1 }
    ])
  })

  it('zählt einen Lauf mit zwei übernommenen Ergebnissen EINMAL', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-x' }),
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-x', format: 'xlsx' },
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-x', format: 'md' }
    ]
    const summary = summarizeActivity(events, range)
    expect(summary.acceptedTotal).toBe(2)
    expect(summary.acceptedRuns).toHaveLength(1)
    expect(summary.acceptedRuns[0].accepted).toBe(2)
  })

  it('erfindet keine Dauer, wenn der zugehörige Lauf fehlt', () => {
    const events: ActivityEvent[] = [{ at: NOW, kind: 'agent-result-accepted', runId: 'weg', format: 'md' }]
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
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' }
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), {})
    expect(saved.totalMinutes).toBe(0)
    expect(saved.lines).toEqual([])
    expect(saved.unpricedTypes).toEqual(['table-merge'])
  })

  it('rechnet Referenzzeit minus Laufzeit', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 14 * 60_000 }),
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' }
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.totalMinutes).toBe(31)
    expect(saved.lines[0]).toMatchObject({ runs: 1, referenceMinutes: 45, durationMinutes: 14, savedMinutes: 31 })
  })

  it('behält die Rohdauer, damit ein Kurzläufer nicht als „0 min Laufzeit" erscheint', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 15_000 }),
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' }
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 30 })
    expect(saved.lines[0].durationMinutes).toBe(0)
    expect(saved.lines[0].durationMs).toBe(15_000)
  })

  it('wird nie negativ, wenn der Lauf länger dauert als die Referenzzeit', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 90 * 60_000 }),
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' }
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.totalMinutes).toBe(0)
  })

  it('bewertet nur bepreiste Arten und meldet die anderen getrennt', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 5 * 60_000 }),
      runFinished({ runId: 'run-b', activityType: 'document', durationMs: 5 * 60_000 }),
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' },
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-b', format: 'docx' }
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 45 })
    expect(saved.totalMinutes).toBe(40)
    expect(saved.lines).toHaveLength(1)
    expect(saved.unpricedTypes).toEqual(['document'])
  })

  it('ignoriert eine Referenzzeit von 0 — sie ist keine Angabe', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a' }),
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' }
    ]
    const saved = estimateSavedMinutes(summarizeActivity(events, range), { 'table-merge': 0 })
    expect(saved.lines).toEqual([])
    expect(saved.unpricedTypes).toEqual(['table-merge'])
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
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' }
    ]
    expect(badgeFor(events, { 'table-merge': 45 })).toEqual({ kind: 'minutes', minutes: 40 })
  })

  it('fällt ohne Referenzzeit auf die Übernahmen zurück', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a' }),
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' }
    ]
    expect(badgeFor(events)).toEqual({ kind: 'accepted', count: 1 })
  })

  it('zeigt Aufgaben, wenn sonst nichts vorliegt', () => {
    expect(badgeFor([{ at: NOW, kind: 'task-created', count: 4 }])).toEqual({ kind: 'tasks', count: 4 })
  })

  it('zeigt keine Minuten, wenn die Ersparnis auf null zusammenfällt', () => {
    const events: ActivityEvent[] = [
      runFinished({ runId: 'run-a', durationMs: 90 * 60_000 }),
      { at: NOW, kind: 'agent-result-accepted', runId: 'run-a', format: 'xlsx' }
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
