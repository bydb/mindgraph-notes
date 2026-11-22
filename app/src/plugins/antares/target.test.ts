import { describe, it, expect } from 'vitest'
import { validateAntaresTarget, antaresTestPrecheck } from './target'

describe('validateAntaresTarget', () => {
  it('akzeptiert https-Adresse und Kontext, trimmt beides', () => {
    expect(validateAntaresTarget('  https://mzantares-xx-nn.datenbank-bildungsmedien.net/ ', ' XX/NN '))
      .toEqual({ baseUrl: 'https://mzantares-xx-nn.datenbank-bildungsmedien.net', context: 'XX/NN' })
  })
  it('lehnt leere Adresse oder leeren Kontext ab', () => {
    expect(() => validateAntaresTarget('', 'XX/NN')).toThrow(/Serveradresse fehlt/)
    expect(() => validateAntaresTarget('   ', 'XX/NN')).toThrow(/Serveradresse fehlt/)
    expect(() => validateAntaresTarget(undefined, 'XX/NN')).toThrow(/Serveradresse fehlt/)
    expect(() => validateAntaresTarget('https://a.datenbank-bildungsmedien.net', '')).toThrow(/Kontext fehlt/)
  })
  it('lehnt http und ungültige Adressen ab', () => {
    expect(() => validateAntaresTarget('http://a.datenbank-bildungsmedien.net', 'XX/NN')).toThrow(/https/)
    expect(() => validateAntaresTarget('kein url', 'XX/NN')).toThrow(/gültige/)
  })
  it('lehnt eingebettete Zugangsdaten in der Adresse ab', () => {
    expect(() => validateAntaresTarget('https://u:p@a.datenbank-bildungsmedien.net', 'XX/NN')).toThrow(/Zugangsdaten/)
    expect(() => validateAntaresTarget('https://u@a.datenbank-bildungsmedien.net', 'XX/NN')).toThrow(/Zugangsdaten/)
  })
})

describe('antaresTestPrecheck — erst Ziel, dann Zugangsdaten (G03)', () => {
  const MISSING = 'Bitte zuerst Zugangsdaten eingeben'
  const ok = { baseUrl: 'https://mzantares-xx-nn.datenbank-bildungsmedien.net', context: 'XX/NN' }
  it('leere Adresse wird vor fehlenden Zugangsdaten gemeldet', () => {
    expect(antaresTestPrecheck({ baseUrl: '', context: '' }, { username: '', password: '' }, MISSING)).toMatch(/Serveradresse fehlt/)
  })
  it('leerer Kontext wird vor fehlenden Zugangsdaten gemeldet', () => {
    expect(antaresTestPrecheck({ ...ok, context: '' }, { username: '', password: '' }, MISSING)).toMatch(/Kontext fehlt/)
  })
  it('Ziel in Ordnung, Zugangsdaten fehlen → Hinweis auf Zugangsdaten', () => {
    expect(antaresTestPrecheck(ok, { username: 'u', password: '' }, MISSING)).toBe(MISSING)
  })
  it('alles da → kein Fehler', () => {
    expect(antaresTestPrecheck(ok, { username: 'u', password: 'p' }, MISSING)).toBeNull()
  })
})
