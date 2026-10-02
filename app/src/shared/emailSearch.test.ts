import { describe, it, expect } from 'vitest'
import { emailMatchesQuery } from './emailSearch'

const mail = {
  from: { name: 'Alice Müller', address: 'alice@example.org' },
  to: [{ name: 'Ich', address: 'ich@example.org' }, { name: 'Bob', address: 'bob@example.org' }],
  cc: [{ name: '', address: 'carol@example.org' }],
  subject: 'Protokoll Digitalwoche',
  bodyText: 'Hallo, anbei das Protokoll vom Dienstag.'
}

describe('emailMatchesQuery', () => {
  it('leere Suche trifft alles', () => {
    expect(emailMatchesQuery(mail, '')).toBe(true)
    expect(emailMatchesQuery(mail, '   ')).toBe(true)
  })
  it('findet Absender, Empfänger, CC, Betreff und Text', () => {
    expect(emailMatchesQuery(mail, 'müller')).toBe(true)
    expect(emailMatchesQuery(mail, 'bob@')).toBe(true)
    expect(emailMatchesQuery(mail, 'carol')).toBe(true)
    expect(emailMatchesQuery(mail, 'digitalwoche')).toBe(true)
    expect(emailMatchesQuery(mail, 'dienstag')).toBe(true)
  })
  it('mehrere Wörter müssen alle vorkommen, egal in welchem Feld', () => {
    expect(emailMatchesQuery(mail, 'bob protokoll')).toBe(true)
    expect(emailMatchesQuery(mail, 'bob rechnung')).toBe(false)
  })
  it('fällt ohne bodyText auf den snippet zurück', () => {
    expect(emailMatchesQuery({ from: { address: 'x@y.z' }, snippet: 'Kurzer Auszug' }, 'auszug')).toBe(true)
  })
  it('faltet ß/ss und Umlaute: „Grüssner" findet „Grüßner" und „gruessner@"', () => {
    const mail = { from: { name: 'Jürgen Grüßner', address: 'juergen.gruessner@schule.example' }, subject: 'AG Treffen' }
    for (const q of ['Grüssner', 'grüßner', 'Gruessner', 'gruessner', 'Grussner', 'GRÜSSNER', 'jürgen grüssner']) {
      expect(emailMatchesQuery(mail, q)).toBe(true)
    }
    expect(emailMatchesQuery({ from: { address: 'x@y.z' }, subject: 'Grüße aus Gießen' }, 'giessen gruesse')).toBe(true)
    expect(emailMatchesQuery({ from: { address: 'x@y.z' }, subject: 'Café José' }, 'cafe jose')).toBe(true)
  })
  it('zerlegte Umlaute (NFD) treffen zusammengesetzte (NFC)', () => {
    expect(emailMatchesQuery({ from: { name: 'Grüßner' } }, 'Gru\u0308ssner')).toBe(true)
    expect(emailMatchesQuery({ from: { name: 'Gru\u0308ßner' } }, 'Grüssner')).toBe(true)
  })
  it('falsche Treffer bleiben aus', () => {
    expect(emailMatchesQuery(mail, 'grüssner')).toBe(false)
    expect(emailMatchesQuery({ from: { name: 'Absender B' }, subject: 'Digitale Familie' }, 'Grüssner')).toBe(false)
  })
})
