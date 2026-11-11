import { describe, it, expect } from 'vitest'
import {
  diffCheckedTasks, isDayLogEvent, localDayBounds, summarizeDayLog, pruneDayLog, dayLogCoverageStart,
  dayKey, taskKey, taskLines, findTaskText, normalizeDayLogEvent, remapDayLogPaths, gapsInRange,
  DAY_LOG_MAX_EVENTS, type DayLogEvent
} from './dayLog'

describe('diffCheckedTasks', () => {
  it('zählt den Übergang offen → abgehakt', () => {
    expect(diffCheckedTasks('- [ ] Antrag senden\n- [ ] Raum buchen', '- [x] Antrag senden\n- [ ] Raum buchen'))
      .toEqual(['Antrag senden'])
  })

  it('zählt eine geänderte Aufgabe NICHT als abgeschlossen', () => {
    expect(diffCheckedTasks('- [ ] Antrag senden', '- [ ] Antrag senden (@[[2026-11-12]])')).toEqual([])
    expect(diffCheckedTasks('- [ ] Antrag senden', '- [x] Antrag versenden')).toEqual([])
  })

  it('zählt eine neu eingefügte, schon abgehakte Zeile nicht', () => {
    expect(diffCheckedTasks('Text', 'Text\n- [x] war schon erledigt')).toEqual([])
  })

  it('zählt Wieder-Öffnen nicht und gleichlautende Aufgaben je Vorkommen', () => {
    expect(diffCheckedTasks('- [x] A', '- [ ] A')).toEqual([])
    expect(diffCheckedTasks('- [ ] A\n- [ ] A', '- [x] A\n- [x] A')).toEqual(['A', 'A'])
    expect(diffCheckedTasks('- [ ] A\n- [x] A', '- [x] A\n- [x] A')).toEqual(['A'])
  })

  it('kennt eingerückte und großgeschriebene Checkboxen sowie CRLF', () => {
    expect(diffCheckedTasks('  * [ ] eins\r\n- [ ] zwei', '  * [X] eins\r\n- [x] zwei')).toEqual(['eins', 'zwei'])
  })

  it('erkennt Checkboxen wie der Rest der App: keine nummerierten Listen, kein „+“', () => {
    expect(diffCheckedTasks('1. [ ] eins\n+ [ ] zwei', '1. [x] eins\n+ [x] zwei')).toEqual([])
  })

  it('zählt Checkboxen in Zitaten und Hinweiskästen, aber nicht in Code-Blöcken', () => {
    expect(diffCheckedTasks('> [!todo]\n> - [ ] im Kasten\n>> - [ ] tief', '> [!todo]\n> - [x] im Kasten\n>> - [x] tief')).toEqual(['im Kasten', 'tief'])
    const code = (box: string) => `Text\n\`\`\`md\n- [${box}] Beispiel\n\`\`\`\n~~~~\n- [${box}] zwei\n~~~\n- [${box}] noch drin\n~~~~\n- [${box}] echt`
    expect(diffCheckedTasks(code(' '), code('x'))).toEqual(['echt'])
  })

  it('Grenze: gleicher Text wird nicht nach Zeile unterschieden', () => {
    // Offene Zeile gelöscht, gleichlautende abgehakte eingefügt — zählt als Wechsel (dokumentiert, Codex F15).
    expect(diffCheckedTasks('## A\n- [ ] Anrufen\n## B', '## A\n## B\n- [x] Anrufen')).toEqual(['Anrufen'])
  })

  it('bleibt bei verschobenen Zeilen richtig', () => {
    expect(diffCheckedTasks('- [ ] A\n- [ ] B', '- [ ] B\n\n- [x] A')).toEqual(['A'])
  })
})

describe('isDayLogEvent', () => {
  it('lässt nur vollständige Einträge durch', () => {
    expect(isDayLogEvent({ at: 1, kind: 'task-checked', note: 'a.md', key: taskKey('x'), origin: 'tasks' })).toBe(true)
    expect(isDayLogEvent({ at: 1, kind: 'task-checked', note: 'a.md', text: 'x', origin: 'tasks' })).toBe(false)
    expect(isDayLogEvent({ at: 1, kind: 'note-moved', note: 'b.md', from: 'a.md', origin: 'renderer' })).toBe(true)
    expect(isDayLogEvent({ at: 1, kind: 'note-moved', note: 'b.md', origin: 'renderer' })).toBe(false)
    expect(isDayLogEvent({ at: 1, kind: 'note-saved', note: 'a.md', created: false, origin: 'renderer' })).toBe(true)
    expect(isDayLogEvent({ at: 1, kind: 'note-saved', note: 'a.md', origin: 'renderer' })).toBe(false)
    expect(isDayLogEvent({ at: 1, kind: 'task-checked', note: 'a.md', key: taskKey('x'), origin: 'sync' })).toBe(false)
    expect(isDayLogEvent({ at: NaN, kind: 'note-saved', note: 'a.md', created: true, origin: 'app' })).toBe(false)
    expect(isDayLogEvent(null)).toBe(false)
  })
})

describe('localDayBounds', () => {
  it('lehnt ungültige und unmögliche Daten ab', () => {
    expect(localDayBounds('2026-02-30')).toBeNull()
    expect(localDayBounds('11.11.2026')).toBeNull()
    expect(localDayBounds('2026-13-01')).toBeNull()
    expect(localDayBounds('../../etc')).toBeNull()
  })

  it('endet an der nächsten lokalen Mitternacht', () => {
    const b = localDayBounds('2026-11-11')!
    expect(dayKey(b.from)).toBe('2026-11-11')
    expect(dayKey(b.to - 1)).toBe('2026-11-11')
    expect(dayKey(b.to)).toBe('2026-11-12')
    expect(new Date(b.to).getHours()).toBe(0)
  })

  it('reicht auch am Tag der Zeitumstellung von Mitternacht bis Mitternacht', () => {
    for (const day of ['2026-03-29', '2026-10-25']) {
      const b = localDayBounds(day)!
      expect(new Date(b.from).getHours()).toBe(0)
      expect(new Date(b.to).getHours()).toBe(0)
      expect(dayKey(b.to - 1)).toBe(day)
    }
  })
})

describe('summarizeDayLog', () => {
  const day = localDayBounds('2026-11-11')!
  const ev = (over: Partial<DayLogEvent> & { kind: DayLogEvent['kind'] }): DayLogEvent =>
    ({ at: day.from + 1000, note: 'a.md', origin: 'renderer', key: taskKey('x'), created: false, from: 'alt.md', ...over } as unknown as DayLogEvent)

  it('trennt angelegt von gespeichert und lässt andere Tage weg', () => {
    const s = summarizeDayLog([
      ev({ kind: 'note-saved', note: 'neu.md', created: true }),
      ev({ kind: 'note-saved', note: 'neu.md', created: false, at: day.from + 5000 }),
      ev({ kind: 'note-saved', note: 'alt.md' }),
      ev({ kind: 'note-saved', note: 'gestern.md', at: day.from - 1 }),
      ev({ kind: 'task-checked', note: 'alt.md', key: taskKey('Antrag') }),
      ev({ kind: 'task-checked', note: 'alt.md', key: taskKey('morgen'), at: day.to }),
      ev({ kind: 'note-moved', note: 'B/x.md', from: 'A/x.md' })
    ], day)
    expect(s.notesCreated).toEqual(['neu.md'])
    expect(s.notesSaved).toEqual(['alt.md'])
    expect(s.tasksChecked.map(t => t.key)).toEqual([taskKey('Antrag')])
    expect(s.notesMoved).toEqual([{ from: 'A/x.md', to: 'B/x.md' }])
  })
})

describe('Aufbewahrung und Abdeckung', () => {
  it('kappt Altes und hält die Obergrenze', () => {
    const now = Date.now()
    const old: DayLogEvent = { at: now - 400 * 86400000, kind: 'note-saved', note: 'a.md', created: false, origin: 'app' }
    const many: DayLogEvent[] = Array.from({ length: DAY_LOG_MAX_EVENTS + 5 }, (_, i) =>
      ({ at: now - 1000 + i, kind: 'note-saved', note: `n${i}.md`, created: false, origin: 'app' }))
    const kept = pruneDayLog([old, ...many], now)
    expect(kept.length).toBe(DAY_LOG_MAX_EVENTS)
    expect(kept[0].note).toBe('n5.md')
  })

  it('nennt den Beginn der Abdeckung, leer = null', () => {
    expect(dayLogCoverageStart([])).toBeNull()
    expect(dayLogCoverageStart([
      { at: 50, kind: 'note-saved', note: 'a.md', created: false, origin: 'app' },
      { at: 20, kind: 'note-saved', note: 'b.md', created: false, origin: 'app' }
    ])).toBe(20)
  })
})

describe('Aufgabentext steht nicht im Protokoll', () => {
  it('Prüfsumme ist stabil gegen Leerraum und findet den Text in der Notiz wieder', () => {
    expect(taskKey('Antrag   senden ')).toBe(taskKey('Antrag senden'))
    expect(taskKey('Antrag senden')).toMatch(/^[0-9a-f]{8}$/)
    expect(taskKey('Antrag senden')).not.toBe(taskKey('Antrag sendet'))
    const note = '# Notiz\n- [x] Antrag senden\n> - [ ] Raum buchen'
    expect(findTaskText(note, taskKey('Antrag senden'))).toBe('Antrag senden')
    expect(findTaskText(note, taskKey('Raum buchen'))).toBe('Raum buchen')
    expect(findTaskText(note, taskKey('gelöscht'))).toBeNull()
    // Gleichlautend offen und abgehakt: die abgehakte Zeile geht vor.
    expect(findTaskText('- [ ] A\n- [x]  A', taskKey('A'))).toBe('A')
    expect(taskLines(note)).toEqual([{ text: 'Antrag senden', done: true }, { text: 'Raum buchen', done: false }])
  })

  it('übernimmt Einträge der ersten Fassung ohne ihren Klartext', () => {
    const e = normalizeDayLogEvent({ at: 5, kind: 'task-checked', note: 'a.md', text: 'Antrag senden', origin: 'tasks' })
    expect(e).toEqual({ at: 5, kind: 'task-checked', note: 'a.md', key: taskKey('Antrag senden'), origin: 'tasks' })
    expect(JSON.stringify(e)).not.toContain('Antrag')
    expect(normalizeDayLogEvent({ at: 5, kind: 'note-saved', note: 'a.md', created: true, origin: 'app', fremd: 'x' }))
      .toEqual({ at: 5, kind: 'note-saved', note: 'a.md', created: true, origin: 'app' })
    expect(normalizeDayLogEvent({ at: 5, kind: 'unbekannt', note: 'a.md', origin: 'app' })).toBeNull()
  })
})

describe('Pfade und Lücken', () => {
  it('zieht Pfade für eine Notiz und für einen Ordner nach', () => {
    const events: DayLogEvent[] = [
      { at: 1, kind: 'note-saved', note: 'A/x.md', created: true, origin: 'app' },
      { at: 2, kind: 'task-checked', note: 'A/sub/y.md', key: '00000000', origin: 'tasks' },
      { at: 3, kind: 'note-saved', note: 'AB/x.md', created: false, origin: 'app' }
    ]
    expect(remapDayLogPaths(events, 'A/x.md', 'B/x.md').events.map(e => e.note)).toEqual(['B/x.md', 'A/sub/y.md', 'AB/x.md'])
    const moved: DayLogEvent = { at: 9, kind: 'note-moved', note: 'A/x.md', from: 'alt.md', origin: 'renderer' }
    expect(remapDayLogPaths([moved], 'A/x.md', 'B/x.md')).toEqual({ events: [moved], changed: 0 })
    const dir = remapDayLogPaths(events, 'A', 'Z/A2')
    expect(dir.events.map(e => e.note)).toEqual(['Z/A2/x.md', 'Z/A2/sub/y.md', 'AB/x.md'])
    expect(dir.changed).toBe(2)
  })

  it('findet Lücken, die einen Tag berühren', () => {
    const gaps = [{ from: 10, to: 20 }, { from: 50, to: 60 }]
    expect(gapsInRange(gaps, { from: 15, to: 30 })).toEqual([{ from: 10, to: 20 }])
    expect(gapsInRange(gaps, { from: 20, to: 50 })).toEqual([])
  })
})
