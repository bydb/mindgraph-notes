import { describe, expect, it } from 'vitest'
import { hasOpenRecipientGroup, isValidEmailAddress, looksLikeRecipientList, mergeRecipients, parseRecipientList } from './emailRecipients'

const addresses = (text: string) => parseRecipientList(text).recipients.map(r => r.address)

describe('parseRecipientList', () => {
  it('liest eine Liste mit einer Adresse pro Zeile (Rückmeldung 09.11.2026)', () => {
    const list = [
      'manfred.dreier@gss-alsfeld.de',
      'matthias.matzen@friedrich-magnus.de',
      'thomas@meisterknecht.de',
      'stephiesuess@bfz-gks.de',
      'volker.h.zabel@gmx.de',
      'krenig@gmail.com',
      'danilo.magdeburg@tls-giessen.eu',
      'johannes.breidt@mes-alsfeld.eu',
      'paul.kuschmierz@gesahu.de',
      'anton.frankfurt@gesahu.de',
      'tobias.nitsche@gesahu.de',
    ]
    const parsed = parseRecipientList(list.join('\n') + '\n')
    expect(parsed.recipients.map(r => r.address)).toEqual(list)
    expect(parsed.recipients.every(r => r.name === '')).toBe(true)
    expect(parsed.rest).toBe('')
  })

  it('verträgt Windows-Zeilenenden und Leerzeilen', () => {
    expect(addresses('a@x.de\r\n\r\nb@y.de\r\n')).toEqual(['a@x.de', 'b@y.de'])
  })

  it('trennt an Komma, Semikolon, Leerzeichen und Tab, auch gemischt', () => {
    expect(addresses('a@x.de, b@y.de; c@z.de d@w.de\te@v.de')).toEqual([
      'a@x.de', 'b@y.de', 'c@z.de', 'd@w.de', 'e@v.de',
    ])
  })

  it('liest Name <adresse> und Outlook-Listen', () => {
    expect(parseRecipientList('Hans Müller <hans@x.de>; Eva Schmidt <eva@y.de>').recipients).toEqual([
      { name: 'Hans Müller', address: 'hans@x.de' },
      { name: 'Eva Schmidt', address: 'eva@y.de' },
    ])
  })

  it('trennt nicht am Komma im Namen', () => {
    expect(parseRecipientList('"Müller, Hans" <hans@x.de>, eva@y.de').recipients).toEqual([
      { name: 'Müller, Hans', address: 'hans@x.de' },
      { name: '', address: 'eva@y.de' },
    ])
    expect(parseRecipientList('Müller, Hans <hans@x.de>').recipients).toEqual([
      { name: 'Müller, Hans', address: 'hans@x.de' },
    ])
  })

  it('liest Tabellenzeilen Name<Tab>Adresse', () => {
    expect(parseRecipientList('Hans Müller\thans@x.de\nEva Schmidt\teva@y.de').recipients).toEqual([
      { name: 'Hans Müller', address: 'hans@x.de' },
      { name: 'Eva Schmidt', address: 'eva@y.de' },
    ])
  })

  it('entfernt mailto: und Randzeichen', () => {
    expect(addresses('mailto:a@x.de?subject=Hallo\n(b@y.de).\n<c@z.de>')).toEqual(['a@x.de', 'b@y.de', 'c@z.de'])
  })

  it('entfernt Dubletten ohne Rücksicht auf Groß/Klein', () => {
    expect(addresses('A@x.de\na@X.de\nb@y.de')).toEqual(['A@x.de', 'b@y.de'])
  })

  it('lässt Ungültiges als Rest stehen statt es zu verschlucken', () => {
    const parsed = parseRecipientList('a@x.de\nkeine-adresse\nb@y\nc@z.de')
    expect(parsed.recipients.map(r => r.address)).toEqual(['a@x.de', 'c@z.de'])
    expect(parsed.invalid).toEqual(['keine-adresse', 'b@y'])
    expect(parsed.rest).toBe('keine-adresse, b@y')
  })

  it('weist den alten Klumpen aus zusammengeklebten Zeilen ab', () => {
    const parsed = parseRecipientList('manfred.dreier@gss-alsfeld.dematthias.matzen@friedrich-magnus.de')
    expect(parsed.recipients).toEqual([])
    expect(parsed.invalid).toHaveLength(1)
  })

  it('gibt bei leerem Text nichts zurück', () => {
    expect(parseRecipientList('  \n ')).toEqual({ recipients: [], invalid: [], rest: '' })
  })
})

describe('isValidEmailAddress', () => {
  it.each(['a@x.de', 'vor.nach@sub.domain.eu', 'x+tag@mail.co.uk', 'jürgen@müller.de'])('nimmt %s', a => {
    expect(isValidEmailAddress(a)).toBe(true)
  })
  it.each(['a@x', 'a@@x.de', 'a b@x.de', '@x.de', 'a@.de', 'a@x..de', '.a@x.de', 'a@x.d'])('lehnt %s ab', a => {
    expect(isValidEmailAddress(a)).toBe(false)
  })
})

describe('mergeRecipients', () => {
  it('hängt nur neue Adressen an', () => {
    const existing = [{ name: 'Hans', address: 'hans@x.de' }]
    expect(mergeRecipients(existing, [
      { name: '', address: 'HANS@x.de' },
      { name: '', address: 'eva@y.de' },
    ])).toEqual([
      { name: 'Hans', address: 'hans@x.de' },
      { name: '', address: 'eva@y.de' },
    ])
  })
})

describe('hasOpenRecipientGroup / looksLikeRecipientList', () => {
  it('erkennt offene Anführungszeichen und Winkel', () => {
    expect(hasOpenRecipientGroup('"Müller')).toBe(true)
    expect(hasOpenRecipientGroup('Hans <h@x')).toBe(true)
    expect(hasOpenRecipientGroup('"Müller, Hans" <h@x.de>')).toBe(false)
  })
  it('erkennt Listen, aber keinen einzelnen Suchbegriff', () => {
    expect(looksLikeRecipientList('a@x.de\nb@y.de')).toBe(true)
    expect(looksLikeRecipientList('a@x.de b@y.de')).toBe(true)
    expect(looksLikeRecipientList('a@x.de, b')).toBe(true)
    expect(looksLikeRecipientList('müller')).toBe(false)
    expect(looksLikeRecipientList('hans@x.de')).toBe(false)
    expect(looksLikeRecipientList('"Müller, Hans')).toBe(false)
  })
})
