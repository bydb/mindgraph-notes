// Regressionstests für den geteilten Task-Parser (Renderer + Main + Editor-Decorator).
// Pur, kein fs/Netz. Die heiklen Stellen: Reminder-Regex toleriert Backslash-
// Schaden aus LLM/Markdown-Roundtrips, Critical-Pattern wird an drei Stellen
// wiederverwendet (darf nicht auseinanderlaufen), und die Summary-Aggregate
// zählen überfällig/kritisch nur für UNERLEDIGTE Tasks.
import { describe, it, expect } from 'vitest'
import {
  extractTasks,
  daysUntilDue,
  isCriticalLine,
  CRITICAL_TASK_PATTERN
} from './taskExtractor'

// Eindeutig in Vergangenheit/Zukunft, damit isOverdue (nutzt intern `new Date()`)
// nicht an Tagesgrenzen flaky wird.
const PAST = '2000-01-01'
const FUTURE = '2999-12-31'

describe('extractTasks — Grundparsing', () => {
  it('parst offene und erledigte Tasks mit 1-basierter Zeilennummer', () => {
    const md = ['# Titel', '- [ ] offen', 'Text', '- [x] erledigt'].join('\n')
    const { total, completed, tasks } = extractTasks(md)
    expect(total).toBe(2)
    expect(completed).toBe(1)
    expect(tasks[0]).toMatchObject({ text: 'offen', completed: false, line: 2 })
    expect(tasks[1]).toMatchObject({ text: 'erledigt', completed: true, line: 4 })
  })

  it('akzeptiert * als Bullet und grosses [X]', () => {
    const { tasks } = extractTasks('* [X] mit Stern')
    expect(tasks).toHaveLength(1)
    expect(tasks[0].completed).toBe(true)
  })

  it('ignoriert Nicht-Task-Zeilen (Fließtext, Überschriften, Listen ohne Checkbox)', () => {
    const md = ['- normale Liste', '## Heading', '> Zitat', 'Absatz'].join('\n')
    expect(extractTasks(md).total).toBe(0)
  })

  it('liefert rawLine unverändert (für In-Place-Edits)', () => {
    const line = '  - [ ] eingerückt'
    expect(extractTasks(line).tasks[0].rawLine).toBe(line)
  })
})

describe('extractTasks — Reminder-Datum', () => {
  it('parst (@[[YYYY-MM-DD]])', () => {
    const { tasks } = extractTasks(`- [ ] Abgabe (@[[${FUTURE}]])`)
    expect(tasks[0].dueDate).toEqual(new Date(2999, 11, 31, 0, 0, 0))
  })

  it('parst optionale Uhrzeit (@[[YYYY-MM-DD]] HH:MM)', () => {
    const { tasks } = extractTasks('- [ ] Termin (@[[2026-05-08]] 14:30)')
    expect(tasks[0].dueDate).toEqual(new Date(2026, 4, 8, 14, 30))
  })

  it('REGRESSION: toleriert Backslash-Schaden aus Roundtrips (@\\[\\[…\\]\\])', () => {
    // Genau das Symptom, das frühere LLM/turndown-Durchläufe erzeugt haben.
    const { tasks } = extractTasks(`- [ ] beschädigt (@\\[\\[${FUTURE}\\]\\])`)
    expect(tasks[0].dueDate).toEqual(new Date(2999, 11, 31, 0, 0, 0))
  })

  it('kein Datum → dueDate undefined, isOverdue false', () => {
    const { tasks } = extractTasks('- [ ] ohne Datum')
    expect(tasks[0].dueDate).toBeUndefined()
    expect(tasks[0].isOverdue).toBe(false)
  })

  it('markiert vergangene Termine als überfällig', () => {
    const { tasks } = extractTasks(`- [ ] alt (@[[${PAST}]])`)
    expect(tasks[0].isOverdue).toBe(true)
  })
})

describe('extractTasks — cleanTaskText', () => {
  it('entfernt Reminder und Tags aus dem Anzeigetext, normalisiert Whitespace', () => {
    const { tasks } = extractTasks(`- [ ] Mail schreiben #dringend (@[[${FUTURE}]])`)
    expect(tasks[0].text).toBe('Mail schreiben')
  })

  it('extrahiert Inline-Tags (inkl. Umlaute und Slash-Hierarchie) separat', () => {
    const { tasks } = extractTasks('- [ ] Aufgabe #büro #projekt/x')
    expect(tasks[0].tags).toEqual(['büro', 'projekt/x'])
  })
})

describe('extractTasks — kritische Aufgaben', () => {
  it.each([
    '#dringend',
    '#kritisch',
    '#urgent',
    '@dringend',
    'Sofort erledigen!!',
    '[!] markiert'
  ])('erkennt kritischen Marker: %s', marker => {
    const { tasks } = extractTasks(`- [ ] Task ${marker}`)
    expect(tasks[0].isCritical).toBe(true)
  })

  it('nicht-kritische Aufgabe ist isCritical=false', () => {
    expect(extractTasks('- [ ] normaler Task').tasks[0].isCritical).toBe(false)
  })
})

describe('extractTasks — Summary-Aggregate', () => {
  it('zählt überfällig und kritisch NUR für unerledigte Tasks', () => {
    const md = [
      `- [x] erledigt aber alt (@[[${PAST}]])`,   // überfällig, aber erledigt → zählt nicht
      `- [x] erledigt kritisch #dringend`,          // kritisch, aber erledigt → zählt nicht
      `- [ ] offen überfällig (@[[${PAST}]])`,      // zählt für hasOverdue
      `- [ ] offen kritisch #urgent`                // zählt für critical
    ].join('\n')
    const s = extractTasks(md)
    expect(s.total).toBe(4)
    expect(s.completed).toBe(2)
    expect(s.hasOverdue).toBe(true)
    expect(s.critical).toBe(1)
  })

  it('hasOverdue=false und critical=0 wenn alle kritischen/überfälligen erledigt sind', () => {
    const md = [
      `- [x] alt (@[[${PAST}]])`,
      `- [x] kritisch #dringend`
    ].join('\n')
    const s = extractTasks(md)
    expect(s.hasOverdue).toBe(false)
    expect(s.critical).toBe(0)
  })

  it('nextDue ist das früheste Fälligkeitsdatum unter den unerledigten Tasks', () => {
    const md = [
      `- [ ] später (@[[2999-12-31]])`,
      `- [ ] früher (@[[2999-01-01]])`,
      `- [x] noch früher aber erledigt (@[[2026-01-01]])`
    ].join('\n')
    const s = extractTasks(md)
    expect(s.nextDue).toEqual(new Date(2999, 0, 1, 0, 0, 0))
  })

  it('nextDue undefined ohne datierte offene Tasks', () => {
    expect(extractTasks('- [ ] ohne Datum').nextDue).toBeUndefined()
  })

  it('leerer Input → leere Summary', () => {
    const s = extractTasks('')
    expect(s).toMatchObject({ total: 0, completed: 0, hasOverdue: false, critical: 0 })
    expect(s.nextDue).toBeUndefined()
  })
})

describe('daysUntilDue', () => {
  const now = new Date(2026, 5, 24, 15, 0, 0) // 2026-06-24, mittags

  it('0 für heute (unabhängig von Uhrzeit — rechnet auf Tagesgrenzen)', () => {
    expect(daysUntilDue(new Date(2026, 5, 24, 23, 59), now)).toBe(0)
    expect(daysUntilDue(new Date(2026, 5, 24, 0, 1), now)).toBe(0)
  })

  it('negativ für überfällig, positiv für Zukunft', () => {
    expect(daysUntilDue(new Date(2026, 5, 23), now)).toBe(-1)
    expect(daysUntilDue(new Date(2026, 5, 27), now)).toBe(3)
  })

  it('rechnet über Monatsgrenzen korrekt', () => {
    expect(daysUntilDue(new Date(2026, 6, 1), now)).toBe(7)
  })
})

describe('isCriticalLine', () => {
  it('true nur wenn es eine Task-Zeile UND kritisch ist', () => {
    expect(isCriticalLine('- [ ] fix !!')).toBe(true)
    expect(isCriticalLine('- [ ] #dringend tun')).toBe(true)
  })

  it('false für kritischen Marker in Nicht-Task-Zeile', () => {
    expect(isCriticalLine('Das ist dringend!!')).toBe(false)
  })

  it('false für Task-Zeile ohne kritischen Marker', () => {
    expect(isCriticalLine('- [ ] normaler Task')).toBe(false)
  })
})

describe('CRITICAL_TASK_PATTERN', () => {
  it('ist case-insensitive', () => {
    expect(CRITICAL_TASK_PATTERN.test('#KRITISCH')).toBe(true)
    expect(CRITICAL_TASK_PATTERN.test('#Urgent')).toBe(true)
  })

  it('matcht nicht bei einzelnem Ausrufezeichen', () => {
    expect(CRITICAL_TASK_PATTERN.test('Hallo!')).toBe(false)
  })
})
