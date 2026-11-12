import { describe, expect, it } from 'vitest'
import { insertPastedText, linkedPasteText, normalizePastedHref, uriListPasteText } from './emailPasteLinks'

describe('linkedPasteText', () => {
  it('ersetzt die Beschriftung durch einen Markdown-Link', () => {
    const plain = 'Hier geht es zur Anmeldung für den Kurs.'
    const out = linkedPasteText(plain, [{ text: 'Anmeldung', href: 'https://example.org/anmelden?kurs=7', before: 'Hier geht es zur ' }])
    expect(out).toBe('Hier geht es zur [Anmeldung](https://example.org/anmelden?kurs=7) für den Kurs.')
  })
  it('lässt eine Adresse, die selbst die Beschriftung ist, unverändert', () => {
    expect(linkedPasteText('https://example.org/', [{ text: 'https://example.org/', href: 'https://example.org/', before: '' }])).toBeNull()
    expect(linkedPasteText('www.example.org', [{ text: 'www.example.org', href: 'https://www.example.org/', before: '' }])).toBeNull()
    expect(linkedPasteText('eva@example.org', [{ text: 'eva@example.org', href: 'mailto:eva@example.org', before: '' }])).toBeNull()
  })
  it('trifft bei gleicher Beschriftung das richtige Vorkommen', () => {
    const plain = 'Nicht hier klicken, sondern hier.'
    const out = linkedPasteText(plain, [{ text: 'hier', href: 'https://example.org/b', before: 'Nicht hier klicken, sondern ' }])
    expect(out).toBe('Nicht hier klicken, sondern [hier](https://example.org/b).')
  })
  it('behält mehrere Links und die Umbrüche des Klartexts', () => {
    const plain = 'Programm\nund Anfahrt\n\nGruß'
    const out = linkedPasteText(plain, [
      { text: 'Programm', href: 'https://example.org/p', before: '' },
      { text: 'Anfahrt', href: 'https://example.org/a', before: 'Programm und ' }
    ])
    expect(out).toBe('[Programm](https://example.org/p)\nund [Anfahrt](https://example.org/a)\n\nGruß')
  })
  it('findet eine Beschriftung auch über einen Umbruch im Klartext', () => {
    const out = linkedPasteText('zum\nneuen   Portal', [{ text: 'neuen Portal', href: 'https://example.org/', before: 'zum ' }])
    expect(out).toBe('zum\n[neuen Portal](https://example.org/)')
  })
  it('verlinkt Namen mit mailto', () => {
    const out = linkedPasteText('Fragen an Eva Muster', [{ text: 'Eva Muster', href: 'mailto:eva@example.org', before: 'Fragen an ' }])
    expect(out).toBe('Fragen an [Eva Muster](mailto:eva@example.org)')
  })
  it('übergeht Ziele, die der Versand nicht verlinkt', () => {
    expect(linkedPasteText('Abschnitt und Skript', [
      { text: 'Abschnitt', href: '#teil-2', before: '' },
      { text: 'Skript', href: 'javascript:alert(1)', before: 'Abschnitt und ' }
    ])).toBeNull()
  })
  it('lässt den Text unverändert, wenn die Beschriftung im Klartext fehlt', () => {
    expect(linkedPasteText('Ganz anderer Text', [{ text: 'Anmeldung', href: 'https://example.org/', before: '' }])).toBeNull()
  })
  it('verdoppelt keine Adresse, die schon hinter der Beschriftung steht', () => {
    expect(linkedPasteText('Anmeldung (https://example.org/a)', [{ text: 'Anmeldung', href: 'https://example.org/a', before: '' }])).toBeNull()
    expect(linkedPasteText('[Anmeldung](https://example.org/a)', [{ text: 'Anmeldung', href: 'https://example.org/a', before: '' }])).toBeNull()
  })
  it('macht Klammern in Beschriftung und Adresse unschädlich', () => {
    const out = linkedPasteText('Artikel [PDF]', [{ text: 'Artikel [PDF]', href: 'https://example.org/Datei_(neu).pdf', before: '' }])
    expect(out).toBe('[Artikel (PDF)](https://example.org/Datei_%28neu%29.pdf)')
  })
  it('liefert ohne Anker oder ohne Text nichts', () => {
    expect(linkedPasteText('Text', [])).toBeNull()
    expect(linkedPasteText('', [{ text: 'a', href: 'https://example.org', before: '' }])).toBeNull()
  })
})

describe('normalizePastedHref', () => {
  it('lässt nur http, https und mailto durch', () => {
    expect(normalizePastedHref(' https://example.org/a b ')).toBe('https://example.org/a%20b')
    expect(normalizePastedHref('mailto:eva@example.org')).toBe('mailto:eva@example.org')
    expect(normalizePastedHref('file:///etc/passwd')).toBeNull()
    expect(normalizePastedHref('/relativ')).toBeNull()
  })
})

describe('uriListPasteText', () => {
  it('nimmt Adressen, überspringt Kommentare und Fremdes', () => {
    expect(uriListPasteText('# Titel\r\nhttps://example.org/a\r\nfile:///x\r\nhttps://example.org/b')).toBe('https://example.org/a\nhttps://example.org/b')
    expect(uriListPasteText('')).toBeNull()
    expect(uriListPasteText('file:///x')).toBeNull()
  })
})

describe('insertPastedText', () => {
  it('ersetzt die Auswahl und setzt den Cursor dahinter', () => {
    expect(insertPastedText('Hallo Welt', 6, 10, 'du')).toEqual({ body: 'Hallo du', cursor: 8 })
    expect(insertPastedText('ab', 99, 99, 'c')).toEqual({ body: 'abc', cursor: 3 })
  })
})
