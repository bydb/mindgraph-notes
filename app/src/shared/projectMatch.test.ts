import { describe, it, expect } from 'vitest'
import { matchEmailToProjects, gateProjectMatch, GENERIC_STOPWORDS } from './projectMatch'
import type { DiscoveredProject } from './types'

function project(folderName: string, keywords: string[], priority: 'high' | 'med' | 'low' = 'med'): DiscoveredProject {
  return {
    folderName,
    folderRel: `100 - Projekte/${folderName}`,
    marker: { project: folderName, keywords, priority, status: 'active' } as DiscoveredProject['marker'],
    lastBrainSignal: { date: null, ageDays: null },
    currentWeekDraft: null,
    currentWeekDrafts: []
  }
}

const arduino = project('181 - Arduino UNO Q', ['Arduino', 'UnoQ'], 'high')
const mars = project('160 - Mars Abenteuer', ['Mars Abenteuer', 'Marslandschaft'])

describe('matchEmailToProjects — Trennzeichen-tolerantes Matching', () => {
  it('„UNO-Q" und „UNO Q" treffen das Keyword „UnoQ"', () => {
    for (const subject of ['Re: Follow-Up: UNO-Q Hardware Request', 'UNO Q Boards angekommen', 'unoq workshop']) {
      const m = matchEmailToProjects({ subject }, [arduino, mars])
      expect(m[0]?.project.folderName, subject).toBe(arduino.folderName)
      expect(m[0].subjectHitCount, subject).toBe(1)
      expect(m[0].matchedTerms, subject).toContain('UnoQ')
    }
  })

  it('großgeschriebenes Keyword „UNOQ" trifft ebenfalls „UNO-Q"', () => {
    const p = project('181 - Arduino', ['UNOQ'])
    const m = matchEmailToProjects({ subject: 'UNO-Q Hardware' }, [p])
    expect(m[0]?.subjectHitCount).toBe(1)
  })

  it('zählt nur ganze Token-Folgen, keine Teilwörter', () => {
    // „unoqualität" ≠ „unoq"; „Arduinos" ≠ „arduino"
    const m = matchEmailToProjects({ subject: 'UNO Qualität', bodyText: 'Die Arduinos sind da.' }, [arduino])
    expect(m).toHaveLength(0)
  })

  it('mehrteilige Keywords treffen mit Bindestrich und als Kompositum', () => {
    for (const subject of ['Roll-Up Mars-Abenteuer', 'Marsabenteuer Plakat', 'Mars Abenteuer']) {
      const m = matchEmailToProjects({ subject }, [arduino, mars])
      expect(m[0]?.project.folderName, subject).toBe(mars.folderName)
      expect(m[0].matchedTerms, subject).toContain('Mars Abenteuer')
    }
  })

  it('Ordnername-Token trifft im Betreff als Kompositum-Präfix, im Body nicht', () => {
    const p = project('160 - Mars Abenteuer', [])
    expect(matchEmailToProjects({ subject: 'Marslandschaft Roll-Up' }, [p])[0]?.subjectHitCount).toBe(1)
    expect(matchEmailToProjects({ bodyText: 'Die Marslandschaft ist fertig.' }, [p])).toHaveLength(0)
  })

  it('Umlaute in Begriff und Text sind kein Wortgrenzen-Problem', () => {
    const p = project('170 - Geräteverleih', ['Geräteverleih'])
    const m = matchEmailToProjects({ subject: 'Frage zum Geräteverleih' }, [p])
    expect(m[0]?.matchedTerms).toContain('Geräteverleih')
  })

  it('zählt Treffer im Body einzeln', () => {
    const m = matchEmailToProjects({ bodyText: 'Arduino hier, arduino.cc dort, ARDUINO überall.' }, [arduino])
    expect(m[0]?.hitCount).toBe(3)
  })
})

describe('GENERIC_STOPWORDS — Dokument-Gattungswörter', () => {
  it('enthält die Gattungswörter aus dem Dateinamen-Vorschlag', () => {
    for (const w of ['zusammenfassung', 'transcript', 'transkript', 'protokoll', 'call', 'meeting', 'bericht', 'notizen']) {
      expect(GENERIC_STOPWORDS.has(w), w).toBe(true)
    }
  })

  it('ein Gattungswort in der Keyword-Liste erzeugt keinen Treffer mehr', () => {
    // Realfall 09/2026: WPForms-Wochenmail landete über „Zusammenfassung" beim Arduino-Projekt.
    const p = project('181 - Ardunio UNOQ', ['Ardunio UNOQ', 'Arduino', 'Call', 'Zusammenfassung', 'Transcript', 'UnoQ'], 'high')
    const m = matchEmailToProjects(
      { subject: 'Deine wöchentliche WPForms-Zusammenfassung für medienzentrum-giessen-vogelsberg.de', bodyText: 'Here is how your forms performed. Call to action.' },
      [p]
    )
    expect(m).toHaveLength(0)
    expect(gateProjectMatch(m).confidence).toBe('none')
  })

  it('mehrteilige Keywords mit einem Gattungswort bleiben match-fähig', () => {
    const p = project('190 - Erasmus', ['Erasmus Call'])
    const m = matchEmailToProjects({ subject: 'Erasmus Call 2027 geöffnet' }, [p])
    expect(m[0]?.matchedTerms).toContain('Erasmus Call')
  })
})

describe('gateProjectMatch — Realfälle', () => {
  it('Arduino-Mail mit „UNO-Q" im Betreff wird sicher zugeordnet', () => {
    const m = matchEmailToProjects(
      { subject: 'Re: Follow-Up: UNO-Q Hardware Request', bodyText: 'Using the Arduino UNO Q as a flight computer. Best, Ivy, arduino.cc' },
      [arduino, mars]
    )
    const g = gateProjectMatch(m)
    expect(g.confidence).toBe('high')
    expect(g.top?.project.folderName).toBe(arduino.folderName)
  })

  it('ein einzelner Body-Begriff ohne Betreff-Anker reicht weiterhin nicht', () => {
    const m = matchEmailToProjects({ subject: 'Hardware Request', bodyText: 'Arduino hier, Arduino da.' }, [arduino, mars])
    expect(gateProjectMatch(m).confidence).toBe('none')
  })
})
