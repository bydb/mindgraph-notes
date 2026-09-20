import { describe, it, expect } from 'vitest'
import { chunkMarkdown, canonicalizeMarkdown, frontmatterEndOffset, stripFrontmatter } from './chunking'

/** Die eine Invariante des Koordinatenvertrags. */
function assertInvariant(content: string, opts?: Parameters<typeof chunkMarkdown>[1]) {
  const canonical = canonicalizeMarkdown(content)
  const chunks = chunkMarkdown(content, opts)
  for (const c of chunks) {
    expect(canonical.slice(c.sourceStart, c.sourceEnd)).toBe(c.text)
    expect(c.text).toBe(c.text.trim())
    expect(c.text.length).toBeGreaterThan(0)
    const expectedLine = canonical.slice(0, c.sourceStart).split('\n').length
    expect(c.startLine).toBe(expectedLine)
  }
  // Chunks sind in Dateireihenfolge.
  for (let i = 1; i < chunks.length; i++) {
    expect(chunks[i].sourceStart).toBeGreaterThanOrEqual(chunks[i - 1].sourceStart)
    expect(chunks[i].chunkIndex).toBe(i)
  }
  return { canonical, chunks }
}

const para = (n: number, seed = 'Satz') =>
  Array.from({ length: n }, (_, i) => `${seed} ${i + 1} mit etwas Text, der lang genug ist, um zu zählen.`).join(' ')

describe('canonicalizeMarkdown', () => {
  it('entfernt BOM und normalisiert CRLF/CR auf LF', () => {
    expect(canonicalizeMarkdown('﻿# A\r\nb\rc\n')).toBe('# A\nb\nc\n')
  })
  it('lässt kanonische Eingabe unverändert', () => {
    const s = '# A\n\nText\n'
    expect(canonicalizeMarkdown(s)).toBe(s)
  })
})

describe('frontmatterEndOffset', () => {
  it('misst den Frontmatter-Block inklusive Folge-Leerzeilen', () => {
    const fm = '---\ntitle: X\n---\n\n'
    expect(frontmatterEndOffset(fm + '# A\n')).toBe(fm.length)
  })
  it('liefert 0 ohne Frontmatter', () => {
    expect(frontmatterEndOffset('# A\n')).toBe(0)
  })
  it('stripFrontmatter bleibt kompatibel', () => {
    expect(stripFrontmatter('﻿---\na: 1\n---\nBody')).toBe('Body')
  })
})

describe('chunkMarkdown — Spannen', () => {
  it('leere Datei und reines Frontmatter ergeben keine Chunks', () => {
    expect(chunkMarkdown('')).toEqual([])
    expect(chunkMarkdown('   \n\n')).toEqual([])
    expect(chunkMarkdown('---\ntitle: nur Kopf\n---\n')).toEqual([])
  })

  it('kurze Notiz: ein Chunk, Offsets hinter dem Frontmatter', () => {
    const fm = '---\ntitle: T\n---\n\n'
    const body = '# Überschrift\n\nEin Absatz.\n'
    const { chunks } = assertInvariant(fm + body)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].sourceStart).toBe(fm.length)
    expect(chunks[0].heading).toBe('Überschrift')
    expect(chunks[0].startLine).toBe(5)
  })

  it('CRLF- und LF-Fassung derselben Datei liefern identische Chunks', () => {
    const lf = '---\na: 1\n---\n\n# H\n\n' + para(30) + '\n\n' + para(30) + '\n'
    const crlf = lf.replace(/\n/g, '\r\n')
    const a = assertInvariant(lf).chunks
    const b = assertInvariant(crlf).chunks
    expect(b).toEqual(a)
  })

  it('BOM verschiebt keine Offsets (Offsets gelten für die kanonische Datei)', () => {
    const plain = '# H\n\nText hier.\n'
    const a = chunkMarkdown(plain)
    const b = chunkMarkdown('﻿' + plain)
    expect(b).toEqual(a)
  })

  it('Frontmatter-Änderung ohne Body-Änderung verschiebt nur die Offsets', () => {
    const body = '# H\n\n' + para(5) + '\n'
    const a = chunkMarkdown('---\na: 1\n---\n' + body)
    const b = chunkMarkdown('---\na: 1\nb: zwei\n---\n' + body)
    expect(a.map((c) => c.text)).toEqual(b.map((c) => c.text))
    expect(b[0].sourceStart - a[0].sourceStart).toBe('b: zwei\n'.length)
  })

  it('Sektionen an H1–H3, H4 schneidet nicht', () => {
    const md = '# A\n\n' + para(3) + '\n\n## B\n\n' + para(3) + '\n\n#### C\n\n' + para(3) + '\n'
    const { chunks } = assertInvariant(md, { minChars: 10 })
    expect(chunks.map((c) => c.heading)).toEqual(['A', 'B'])
    expect(chunks[1].text).toContain('#### C')
  })

  it('lange Sektion: aufeinanderfolgende Chunks überlappen als Spannen', () => {
    const md = '# Lang\n\n' + Array.from({ length: 12 }, (_, i) => para(6, `Absatz${i}`)).join('\n\n') + '\n'
    const { chunks } = assertInvariant(md, { targetChars: 800, overlapChars: 150 })
    expect(chunks.length).toBeGreaterThan(2)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].sourceStart).toBeLessThan(chunks[i - 1].sourceEnd)
      expect(chunks[i - 1].sourceEnd - chunks[i].sourceStart).toBeLessThanOrEqual(150)
    }
  })

  it('Riesen-Absatz ohne Leerzeilen wird hart, aber zusammenhängend geschnitten', () => {
    const md = '# X\n\n' + para(120) + '\n'
    const { chunks } = assertInvariant(md, { targetChars: 500, overlapChars: 50 })
    expect(chunks.length).toBeGreaterThan(3)
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(500 * 1.5 + 1)
  })

  it('zerteilt keine Emojis (Surrogatpaare) an Schnittkanten', () => {
    const emojiWord = '🔴🟢🔵'
    const md = '# E\n\n' + Array.from({ length: 200 }, () => emojiWord).join(' ') + '\n'
    const { chunks } = assertInvariant(md, { targetChars: 300, overlapChars: 40 })
    for (const c of chunks) {
      expect(c.text).not.toMatch(/^[\uDC00-\uDFFF]/)
      expect(c.text).not.toMatch(/[\uD800-\uDBFF]$/)
    }
  })

  it('kurze Chunks werden in den Vorgänger gezogen, die Spanne bleibt zusammenhängend', () => {
    const md = '# A\n\n' + para(8) + '\n\n## B\n\nKurz.\n'
    const { chunks } = assertInvariant(md, { minChars: 200 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text.endsWith('Kurz.')).toBe(true)
    expect(chunks[0].heading).toBe('A')
  })

  it('kurzer erster Chunk (nur Überschrift) wandert in den nächsten statt allein zu stehen', () => {
    const md = '# Beta\n\n' + para(30) + '\n'
    const { chunks } = assertInvariant(md, { targetChars: 800, overlapChars: 100, minChars: 200 })
    expect(chunks[0].text.startsWith('# Beta')).toBe(true)
    expect(chunks[0].text.length).toBeGreaterThan(200)
    expect(chunks.every((c) => c.text.length >= 200 || chunks.length === 1)).toBe(true)
  })

  it('identische Passage zweimal: zwei Chunks, gleicher Text, verschiedene Offsets', () => {
    const passage = para(8, 'Wiederholt')
    const md = '# A\n\n' + passage + '\n\n# B\n\n' + passage + '\n'
    const { chunks } = assertInvariant(md, { minChars: 10 })
    // Die Überschrift bleibt im Sektionstext; die Passage steht in beiden Chunks am Ende.
    const same = chunks.filter((c) => c.text.endsWith(passage))
    expect(same).toHaveLength(2)
    expect(same[0].sourceStart).not.toBe(same[1].sourceStart)
    expect(same[0].text.replace(/^# [AB]\n\n/, '')).toBe(same[1].text.replace(/^# [AB]\n\n/, ''))
  })

  it('doppelte Überschrift: beide Sektionen tragen dasselbe heading, aber eigene Spannen', () => {
    const md = '## Notizen\n\n' + para(5, 'Eins') + '\n\n## Notizen\n\n' + para(5, 'Zwei') + '\n'
    const { chunks } = assertInvariant(md, { minChars: 10 })
    expect(chunks.map((c) => c.heading)).toEqual(['Notizen', 'Notizen'])
    expect(chunks[1].sourceStart).toBeGreaterThan(chunks[0].sourceEnd)
  })

  it('verschobene Chunk-Grenzen nach Einfügung: die Passage bleibt als Text auffindbar', () => {
    const passage = para(4, 'Stabil')
    const before = '# A\n\n' + para(20, 'Vor') + '\n\n' + passage + '\n'
    const after = '# A\n\nNeuer Absatz am Anfang.\n\n' + para(20, 'Vor') + '\n\n' + passage + '\n'
    const a = assertInvariant(before, { targetChars: 600, overlapChars: 100, minChars: 50 }).canonical
    const b = assertInvariant(after, { targetChars: 600, overlapChars: 100, minChars: 50 }).canonical
    expect(a.includes(passage)).toBe(true)
    expect(b.includes(passage)).toBe(true)
  })
})
