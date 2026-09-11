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
})
