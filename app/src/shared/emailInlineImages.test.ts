import { describe, it, expect } from 'vitest'
import {
  findBrokenInlineTokens,
  inlineImageToken,
  inlineTokenRanges,
  insertInlineTokens,
  inlineTokensToPlainText,
  referencedInlineIds,
  removeInlineToken,
  replaceInlineTokens,
  sendableAttachments,
  splitInlineAttachments
} from './emailInlineImages'

const A = 'aaaaaaaaaaaa'
const B = 'bbbbbbbbbbbb'

describe('inlineImageToken', () => {
  it('baut einen Platzhalter, den referencedInlineIds wiederfindet', () => {
    const token = inlineImageToken('Bildschirmfoto 2026-11-11 14.03.22.png', A)
    expect(token).toBe(`![Bildschirmfoto 2026-11-11 14.03.22.png](bild:${A})`)
    expect(referencedInlineIds(`Text\n${token}\nmehr`)).toEqual([A])
  })

  it('entschärft Klammern und Umbrüche im Namen', () => {
    const token = inlineImageToken('a]b[c\nd.png', A)
    expect(referencedInlineIds(token)).toEqual([A])
  })
})

describe('referencedInlineIds', () => {
  it('ignoriert gewöhnliche Markdown-Bilder und Links', () => {
    expect(referencedInlineIds('![x](https://example.org/a.png) [y](bild:aaaaaaaaaaaa)')).toEqual([])
  })

  it('nennt jede Kennung einmal, in Reihenfolge', () => {
    expect(referencedInlineIds(`![1](bild:${B}) ![2](bild:${A}) ![3](bild:${B})`)).toEqual([B, A])
  })
})

describe('splitInlineAttachments / sendableAttachments', () => {
  const atts = [
    { path: '/a/bericht.pdf', filename: 'bericht.pdf' },
    { path: '/s/1.png', filename: '1.png', inlineId: A },
    { path: '/s/2.png', filename: '2.png', inlineId: B }
  ]

  it('nimmt nur Bilder mit, deren Platzhalter im Text steht', () => {
    const { inline, regular } = splitInlineAttachments(`Hallo ![1](bild:${A})`, atts)
    expect(inline.map(a => a.filename)).toEqual(['1.png'])
    expect(regular.map(a => a.filename)).toEqual(['bericht.pdf'])
  })

  it('lässt ein Bild ohne Platzhalter ganz weg, auch nicht als Anhang', () => {
    expect(sendableAttachments('Kein Bild mehr', atts).map(a => a.filename)).toEqual(['bericht.pdf'])
  })

  it('verwirft eine ungültige Kennung', () => {
    const { inline } = splitInlineAttachments('![x](bild:../../etc)', [{ path: '/s/x.png', filename: 'x.png', inlineId: '../../etc' }])
    expect(inline).toEqual([])
  })
})

describe('insertInlineTokens', () => {
  it('setzt das Bild in eine eigene Zeile an der Cursorstelle', () => {
    const { body, cursor } = insertInlineTokens('Hallo Welt', 5, 5, ['![a](bild:aaaaaaaaaaaa)'])
    expect(body).toBe('Hallo\n![a](bild:aaaaaaaaaaaa)\n Welt')
    expect(body.slice(0, cursor)).toBe('Hallo\n![a](bild:aaaaaaaaaaaa)\n')
  })

  it('fügt am Zeilenanfang keinen zusätzlichen Umbruch davor ein', () => {
    expect(insertInlineTokens('eins\n\nzwei', 5, 5, ['T']).body).toBe('eins\nT\nzwei')
  })

  it('ersetzt eine Auswahl und nimmt mehrere Bilder untereinander', () => {
    expect(insertInlineTokens('abc', 1, 2, ['T1', 'T2']).body).toBe('a\nT1\nT2\nc')
  })

  it('verträgt Positionen außerhalb des Textes', () => {
    expect(insertInlineTokens('abc', 99, 120, ['T']).body).toBe('abc\nT\n')
  })
})

describe('removeInlineToken', () => {
  it('entfernt die Zeile, die der Platzhalter allein belegt', () => {
    expect(removeInlineToken(`oben\n![a](bild:${A})\nunten`, A)).toBe('oben\nunten')
  })

  it('lässt übrigen Text der Zeile und andere Bilder stehen', () => {
    expect(removeInlineToken(`vor ![a](bild:${A}) nach\n![b](bild:${B})`, A)).toBe(`vor  nach\n![b](bild:${B})`)
  })
})

describe('replaceInlineTokens / inlineTokensToPlainText', () => {
  it('lässt unbekannte Kennungen stehen, wenn die Ersetzung null liefert', () => {
    const body = `![a](bild:${A}) ![b](bild:${B})`
    expect(replaceInlineTokens(body, id => id === A ? 'X' : null)).toBe(`X ![b](bild:${B})`)
  })

  it('macht aus Platzhaltern einen lesbaren Hinweis und streicht verwaiste', () => {
    expect(inlineTokensToPlainText(`Siehe ![foto.png](bild:${A})![weg](bild:${B})`, [A])).toBe('Siehe [Bild: foto.png]')
  })
})

describe('inlineTokenRanges', () => {
  it('nennt Anfang und Ende jedes gültigen Platzhalters', () => {
    const token = `![a](bild:${A})`
    const body = `vor ${token} nach`
    expect(inlineTokenRanges(body)).toEqual([{ start: 4, end: 4 + token.length }])
    expect(inlineTokenRanges('![x](https://example.org/a.png)')).toEqual([])
  })
})

describe('findBrokenInlineTokens', () => {
  const atts = [{ path: '/s/1.png', filename: '1.png', inlineId: A }]

  it('ist leer, wenn jeder Platzhalter ein Bild hat', () => {
    expect(findBrokenInlineTokens(`Hallo ![1](bild:${A})`, atts)).toEqual([])
    expect(findBrokenInlineTokens('Nur Text (bild: siehe unten)', atts)).toEqual([])
  })

  it('nennt einen Platzhalter, dessen Kennung zu keinem Bild gehört', () => {
    expect(findBrokenInlineTokens(`![foto.png](bild:${B})`, atts)).toEqual(['foto.png'])
    expect(findBrokenInlineTokens(`![foto.png](bild:${A})`, undefined)).toEqual(['foto.png'])
  })

  it('erkennt beschädigte Reste, etwa nach einer Korrektur der Kennung', () => {
    expect(findBrokenInlineTokens('![foto.png](bild:Aaaa aaaa)', atts)).toEqual(['beschädigter Platzhalter'])
  })
})
