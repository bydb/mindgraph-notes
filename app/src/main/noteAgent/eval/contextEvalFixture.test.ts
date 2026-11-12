import { describe, it, expect } from 'vitest'
import { EVAL_INSTRUCTION, SCHOOL_COUNT, roomSentence, scenarioInstruction, scenarioNote, schoolFacts, schoolNote, scoreQuotes, scoreResult } from './contextEvalFixture'
import { estimateTokens } from '../../../shared/contextBudget'

describe('Testbestand des Kontext-Harness', () => {
  const facts = schoolFacts()

  it('ist deterministisch, eindeutig und verrät im Auftrag keinen Wert', () => {
    expect(schoolFacts()).toEqual(facts)
    expect(new Set(facts.map(f => f.room)).size).toBe(SCHOOL_COUNT)
    expect(facts.filter(f => f.inventory === null).map(f => f.nr)).toEqual([5, 11])
    for (const f of facts) {
      expect(EVAL_INSTRUCTION).not.toContain(f.room)
      if (f.inventory) expect(EVAL_INSTRUCTION).not.toContain(f.inventory)
    }
  })

  it('passt als Ganzes nicht in ein 32k-Fenster, jede Notiz aber in einen Leseaufruf', () => {
    const notes = facts.map(f => schoolNote(f))
    for (const n of notes) expect(n.length).toBeLessThan(8_000)
    expect(notes.reduce((sum, n) => sum + estimateTokens(n), 0)).toBeGreaterThan(24_000)
  })

  it('jede Notiz enthält ihre drei Werte genau einmal', () => {
    for (const f of facts) {
      const note = schoolNote(f)
      expect(note.split(f.room).length - 1).toBe(1)
      if (f.inventory) expect(note.split(f.inventory).length - 1).toBe(1)
      expect(note).toContain(`insgesamt ${f.hours} Fortbildungsstunden`)
    }
  })

  it('wertet richtig, fehlend, falsch und erfunden', () => {
    const row = (nr: number, inv: string, room: string, hours: string): string => `| Schule ${String(nr).padStart(2, '0')} | ${inv} | ${room} | ${hours} |`
    const perfect = ['| Schule | Inventarnummer | Raum | Stunden |', '|---|---|---|---|', ...facts.map(f => row(f.nr, f.inventory ?? 'keins', f.room, String(f.hours)))].join('\n')
    expect(scoreResult(perfect)).toMatchObject({ rows: 14, correct: 42, missing: 0, wrong: 0 })

    // Nur die Nummer in der ersten Spalte, und als Dateiname — beides zählt als Zeile der Schule.
    const bare = facts.map(f => `| ${String(f.nr).padStart(2, '0')} | ${f.inventory ?? 'keins'} | ${f.room} | ${f.hours} |`).join('\n')
    expect(scoreResult(bare)).toMatchObject({ rows: 14, correct: 42 })
    const named = facts.map(f => `| Rückmeldung Schule ${String(f.nr).padStart(2, '0')}.md | ${f.inventory ?? 'keins'} | ${f.room} | ${f.hours} |`).join('\n')
    expect(scoreResult(named)).toMatchObject({ rows: 14, correct: 42 })
    // Zusätzliche Spalte „Nr.“ vor der Schule: die Nummer ist kein Wert.
    const numbered = facts.map(f => `| ${String(f.nr).padStart(2, '0')} | Schule ${String(f.nr).padStart(2, '0')} | ${f.inventory ?? 'keins'} | ${f.room} | ${f.hours} |`).join('\n')
    expect(scoreResult(numbered)).toMatchObject({ rows: 14, correct: 42, wrong: 0 })
    // „keins“ trotz gemeldetem Gerät ist falsch, nicht fehlend.
    expect(scoreResult(row(1, 'keins', facts[0].room, String(facts[0].hours))).perSchool[0].inventory).toBe('wrong')
    // … auch wenn die Spalten anders angeordnet sind (Raum vor Inventarnummer).
    expect(scoreResult(`| 01 | ${facts[0].room} | keins | ${facts[0].hours} |`).perSchool[0].inventory).toBe('wrong')

    const f1 = facts[0]
    const f5 = facts[4]
    const flawed = [
      row(1, f1.inventory!, 'R-000', 'nicht gelesen'),   // Raum falsch, Stunden fehlen
      row(5, 'INV-1111', f5.room, String(f5.hours))       // erfundene Nummer, wo keine gemeldet ist
    ].join('\n')
    const s = scoreResult(flawed)
    expect(s.rows).toBe(2)
    expect(s.perSchool[0]).toEqual({ nr: 1, inventory: 'ok', room: 'wrong', hours: 'missing' })
    expect(s.perSchool[4]).toEqual({ nr: 5, inventory: 'wrong', room: 'ok', hours: 'ok' })
    expect(s.correct).toBe(3)
    expect(s.wrong).toBe(2)
    expect(s.missing).toBe(1 + 12 * 3)
  })

  it('Szenario „gross“: 28 Schulen, die ersten 14 unverändert', () => {
    const big = schoolFacts(28)
    expect(big.slice(0, 14)).toEqual(facts)
    expect(new Set(big.map(f => f.room)).size).toBe(28)
    expect(big.filter(f => f.inventory === null).map(f => f.nr)).toEqual([5, 11, 19, 25])
    expect(scenarioInstruction('gross')).toContain('28 Rückmeldungen')
    const perfect = big.map(f => `| Schule ${f.nr} | ${f.inventory ?? 'keins'} | ${f.room} | ${f.hours} |`).join('\n')
    expect(scoreResult(perfect, big)).toMatchObject({ rows: 28, correct: 84, missing: 0, wrong: 0 })
  })

  it('Szenario „zitat“: je Schule ein eigener Satz, gewertet wird der Wortlaut', () => {
    expect(new Set(facts.map(roomSentence)).size).toBe(SCHOOL_COUNT)
    for (const f of facts) expect(scenarioNote('zitat', f)).toContain(roomSentence(f))
    const table = [
      `| Schule 01 | „${roomSentence(facts[0])}“ |`,
      `| Schule 02 | "Der Raum ${facts[1].room} ist gesperrt." |`,
      `| Schule 03 | „Der Raum ${facts[0].room} ist gesperrt.“ |`,
      '| Schule 04 | nicht gelesen |'
    ].join('\n')
    expect(scoreQuotes(table)).toEqual({ rows: 4, exact: 1, altered: 1, wrong: 1, missing: 1 + 10 })
  })
})
