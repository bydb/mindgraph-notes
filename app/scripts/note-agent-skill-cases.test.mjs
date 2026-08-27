import { describe, expect, it } from 'vitest'
import { SKILL_CASES } from './note-agent-skill-cases.mjs'

const testCase = SKILL_CASES.find(candidate => candidate.id === 's08_tabellen_zuordnung')

function validRun(finalText) {
  return {
    finalText,
    artifacts: [{
      args: {
        columns: ['Kurs-ID', 'Kurs', 'Raum'],
        rows: [
          ['K-03', 'Robotik', 'Labor 2'],
          ['K-01', 'Datenschutz', 'Aula'],
          ['K-99', 'Archivkunde', 'nicht gefunden'],
          ['K-02', 'Podcast', 'Studio']
        ]
      }
    }]
  }
}

describe('Tabellen-Zuordnung-Scorer', () => {
  it('akzeptiert drei Zuordnungen plus konkret benannten fehlenden Treffer', () => {
    const failures = testCase.validate(validRun(
      'Von den 4 Kursen waren 3 zugeordnet; K-99 hat keinen Raum und ist als „nicht gefunden“ markiert.'
    ))

    expect(failures).toEqual([])
  })

  it('lehnt eine Abschlussantwort ohne Zuordnungsbilanz ab', () => {
    const failures = testCase.validate(validRun('Die Excel-Datei wurde erstellt.'))

    expect(failures).toContain('Abschlussantwort nennt zugeordnete und nicht zugeordnete Zeilen nicht')
  })
})
