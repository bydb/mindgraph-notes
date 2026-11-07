import { describe, it, expect } from 'vitest'
import { rankPageLinks, foldForMatch, type PageLink } from './pageLinks'

const L = (text: string, path: string): PageLink => ({ text, url: `https://mz.de${path}` })

describe('rankPageLinks', () => {
  const links = [
    L('Aktuelles', '/aktuelles/'),
    L('Digiscreen für die Grundschule', '/digiscreen/'),
    L('Impressum', '/impressum/'),
    L('Öffnungszeiten', '/oeffnungszeiten/'),
    L('Verleih', '/verleih/')
  ]

  it('stellt Links mit Wörtern der Frage nach vorn (Umlaute gleichgesetzt)', () => {
    const r = rankPageLinks(links, 'Öffnungszeiten der hessischen Medienzentren', 3)
    expect(r[0].text).toBe('Öffnungszeiten')
  })

  it('erkennt das Fragewort auch nur im Pfad', () => {
    const r = rankPageLinks([L('Aktuelles', '/a/'), L('Hier', '/oeffnungszeiten-und-anfahrt/')], 'Öffnungszeiten', 1)
    expect(r[0].url).toBe('https://mz.de/oeffnungszeiten-und-anfahrt/')
  })

  it('bevorzugt ohne Fragewort Sachangaben-Links, sonst bleibt die Seitenreihenfolge', () => {
    const r = rankPageLinks(links, 'Was gibt es Neues', 5)
    // Impressum, Öffnungszeiten und Verleih tragen Sachangaben-Wörter; Aktuelles und Digiscreen nicht.
    expect(r.map((l) => l.text)).toEqual(['Impressum', 'Öffnungszeiten', 'Verleih', 'Aktuelles', 'Digiscreen für die Grundschule'])
  })

  it('kappt auf max und entfernt Dubletten', () => {
    const dup = [L('Kontakt', '/kontakt/'), L('Kontakt unten', '/kontakt/'), L('Team', '/team/')]
    expect(rankPageLinks(dup, '', 5).map((l) => l.text)).toEqual(['Kontakt', 'Team'])
    expect(rankPageLinks(links, '', 2)).toHaveLength(2)
    expect(rankPageLinks(links, '', 0)).toEqual([])
  })

  it('faltet Umlaute und Akzente', () => {
    expect(foldForMatch('Öffnungszeiten Straße Café')).toBe('oeffnungszeiten strasse cafe')
  })
})
