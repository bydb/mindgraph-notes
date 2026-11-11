import { describe, it, expect } from 'vitest'
import { formatDayOverview, dayOverviewDateError, type DayOverviewData } from './dayOverview'
import { localDayBounds, type DayLogSummary } from './dayLog'

const range = localDayBounds('2026-11-11')!
const empty: DayLogSummary = { tasksChecked: [], notesCreated: [], notesSaved: [], notesMoved: [] }
const okActivity = { state: 'ok' as const, accepted: 0, runsFinished: 0, runsFailed: 0, emailTasks: 0, emailsAnalyzed: 0, tasksCreatedViaApp: 0, pluginChannelsCompleted: 0 }
const base: DayOverviewData = {
  date: '2026-11-11', weekday: 'Mittwoch', range,
  log: { state: 'ok', since: range.from - 86400000, summary: empty, taskTexts: [], gaps: [] },
  activity: okActivity,
  brainNotes: []
}

describe('formatDayOverview', () => {
  it('nennt abgehakte Aufgaben mit Notiz und benennt die Zähler nach dem, was sie messen', () => {
    const text = formatDayOverview({
      ...base,
      log: { state: 'ok', since: range.from - 1, summary: {
        tasksChecked: [{ key: 'aaaaaaaa', note: 'Projekte/Antrag.md', at: range.from + 5 }, { key: 'bbbbbbbb', note: 'Projekte/Weg.md', at: range.from + 6 }],
        notesCreated: ['Inbox/Neu.md'], notesSaved: ['Projekte/Antrag.md'], notesMoved: [{ from: 'Inbox/a.md', to: 'Projekte/a.md' }] },
        taskTexts: ['Antrag senden', null], gaps: [] },
      activity: { ...okActivity, accepted: 2, runsFinished: 3, runsFailed: 1, emailTasks: 4, emailsAnalyzed: 9, pluginChannelsCompleted: 2 },
      brainNotes: ['800/2026/11/11.md']
    })
    expect(text).toContain('CHECKBOXEN AUF ERLEDIGT GESETZT — Wortlaut aus dem heutigen Stand der Notiz (2)')
    expect(text).toContain('- (Text steht nicht mehr in der Notiz) — Notiz: Projekte/Weg.md')
    expect(text).toContain('- Inbox/a.md → Projekte/a.md')
    expect(text).toContain('abgeschlossene Plugin-Kanäle: 2')
    expect(text).toContain('kein Nachweis')
    expect(text).toContain('- Antrag senden — Notiz: Projekte/Antrag.md')
    expect(text).toContain('übernommene Agent-Ergebnisse: 2')
    expect(text).toContain('beendete Agent-Läufe: 3 (davon fehlgeschlagen: 1)')
    expect(text).toContain('erkannt, nicht erledigt')
    expect(text).toContain('vorhanden: 800/2026/11/11.md')
    expect(text).not.toMatch(/Mails? (empfangen|beantwortet)/)
  })

  it('sagt „nicht gemessen“ statt null, wenn das Protokoll den Tag nicht abdeckt', () => {
    expect(formatDayOverview({ ...base, log: { state: 'missing' } })).toContain('nicht gemessen — es wird auf diesem Rechner noch nicht geführt')
    expect(formatDayOverview({ ...base, log: { state: 'broken' } })).toContain('nicht lesbar')
    const later = formatDayOverview({ ...base, log: { state: 'ok', since: range.to + 5, summary: empty, taskTexts: [], gaps: [] } })
    expect(later).toContain('für diesen Tag nicht gemessen')
    expect(later).not.toContain('CHECKBOXEN')
  })

  it('weist einen angebrochenen ersten Tag aus', () => {
    const text = formatDayOverview({ ...base, log: { state: 'ok', since: range.from + 15 * 3600000, summary: empty, taskTexts: [], gaps: [] } })
    expect(text).toContain('begann an diesem Tag um 15:00 Uhr')
    const gap = formatDayOverview({ ...base, log: { state: 'ok', since: range.from - 1, summary: empty, taskTexts: [], gaps: [{ from: range.from + 9 * 3600000, to: range.from + 10 * 3600000 }] } })
    expect(gap).toContain('Von 09:00 bis 10:00 Uhr konnte das Protokoll nicht geschrieben werden')
  })

  it('unterscheidet leere, fehlende und ungeprüfte Quellen', () => {
    expect(formatDayOverview(base)).toContain('- keine Einträge an diesem Tag')
    expect(formatDayOverview(base)).toContain('für diesen Tag wurde keine gefunden')
    expect(formatDayOverview({ ...base, activity: { state: 'broken' } })).toContain('keine verlässliche Bilanz verfügbar')
    expect(formatDayOverview({ ...base, activity: { state: 'missing' } })).toContain('noch kein Tätigkeitsprotokoll')
    expect(formatDayOverview({ ...base, brainNotes: null })).toContain('nicht geprüft')
    expect(formatDayOverview(base)).toContain('heißt „nichts gemessen“, nicht „nichts getan“')
  })

  it('kürzt sichtbar, nur an Zeilengrenzen, und behält die Grenzen-Zeile', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ key: 'aaaaaaaa', note: `Ordner/${'y'.repeat(300)}.md`, at: range.from + i }))
    const texts = many.map((_, i) => `Aufgabe ${i} ${'x'.repeat(300)}`)
    const data: DayOverviewData = { ...base, log: { state: 'ok', since: range.from - 1, summary: { ...empty, tasksChecked: many, notesCreated: Array.from({ length: 30 }, (_, i) => `n${i}.md`) }, taskTexts: texts, gaps: [] } }
    const full = formatDayOverview(data, 100000)
    expect(full).toContain('… und 25 weitere (nicht gezeigt)')
    const fullLines = new Set(full.split('\n'))
    for (const budget of [2000, 1500, 1234, 900]) {
      const text = formatDayOverview(data, budget)
      expect(text.length).toBeLessThanOrEqual(budget)
      expect(text).toContain('… gekürzt')
      expect(text).toContain('NICHT ENTHALTEN')
      // Jede gezeigte Zeile ist eine GANZE Zeile der ungekürzten Ausgabe (oder der Kürzungshinweis).
      for (const line of text.split('\n')) expect(fullLines.has(line) || line.startsWith('[… gekürzt')).toBe(true)
    }
    expect(formatDayOverview(data, 120).length).toBeLessThanOrEqual(120)
    expect(formatDayOverview(data, 120)).toContain('Budget zu klein')
  })
})

describe('dayOverviewDateError', () => {
  it('lehnt ungültige und künftige Tage ab', () => {
    const now = range.from + 1000
    expect(dayOverviewDateError('2026-02-30', localDayBounds('2026-02-30'), now)).toContain('kein gültiges Datum')
    expect(dayOverviewDateError('2026-11-12', localDayBounds('2026-11-12'), now)).toContain('Zukunft')
    expect(dayOverviewDateError('2026-11-11', range, now)).toBeNull()
    expect(dayOverviewDateError('2026-11-10', localDayBounds('2026-11-10'), now)).toBeNull()
  })
})
