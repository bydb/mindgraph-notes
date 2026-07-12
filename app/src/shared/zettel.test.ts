import { describe, it, expect } from 'vitest'
import {
  buildZettelContent,
  buildZettelFileName,
  extractFrontmatterTags,
  sanitizeZettelEmojis,
  sanitizeZettelTag,
  sanitizeZettelTitle,
  zettelTimestampId
} from './zettel'

const NOW = new Date(2026, 6, 12, 9, 5) // 12.07.2026 09:05

describe('sanitizeZettelEmojis', () => {
  it('behält Emoji-Cluster inkl. ZWJ und Hautton', () => {
    expect(sanitizeZettelEmojis('🛬🤦‍♂️')).toBe('🛬🤦‍♂️')
    expect(sanitizeZettelEmojis('👍🏼')).toBe('👍🏼')
  })

  it('wirft Begleittext aus Modell-Antworten weg', () => {
    expect(sanitizeZettelEmojis('Hier: 🌍📊 passend!')).toBe('🌍📊')
    expect(sanitizeZettelEmojis('keine emojis')).toBe('')
  })

  it('behält Flaggen (Regional Indicators)', () => {
    expect(sanitizeZettelEmojis('🇩🇪 Deutschland')).toBe('🇩🇪')
  })
})

describe('zettelTimestampId', () => {
  it('formatiert JJJJMMTTHHmm', () => {
    expect(zettelTimestampId(NOW)).toBe('202607120905')
  })
})

describe('sanitizeZettelTitle / sanitizeZettelTag', () => {
  it('behält Umlaute, entfernt Dateisystem-Sonderzeichen', () => {
    expect(sanitizeZettelTitle('Entmündigung: Mensch/Maschine?')).toBe('Entmündigung MenschMaschine')
    expect(sanitizeZettelTitle('  Der   gesunde  Menschenverstand ')).toBe('Der gesunde Menschenverstand')
  })

  it('normalisiert Tags wie der Aufgaben-Tagger', () => {
    expect(sanitizeZettelTag('#Automation Bias')).toBe('Automation-Bias')
    expect(sanitizeZettelTag('entmündigung')).toBe('entmündigung')
    expect(sanitizeZettelTag('a:b,c[d]')).toBe('abcd')
  })
})

describe('buildZettelFileName', () => {
  it('Emoji-Cluster + Titel', () => {
    expect(buildZettelFileName({ title: 'Der gesunde Menschenverstand', emojis: '🛬🤦‍♂️' }))
      .toBe('🛬🤦‍♂️ - Der gesunde Menschenverstand.md')
  })

  it('ohne Emojis nur der Titel', () => {
    expect(buildZettelFileName({ title: 'Ohne Emoji', emojis: '' })).toBe('Ohne Emoji.md')
  })

  it('leerer Titel fällt auf "Zettel" zurück', () => {
    expect(buildZettelFileName({ title: '///', emojis: '' })).toBe('Zettel.md')
  })
})

describe('buildZettelContent', () => {
  it('baut Frontmatter und Sektionen nach gelebter Konvention', () => {
    const content = buildZettelContent({
      title: 'Test',
      quote: 'Ein Zitat.',
      thought: 'Mein Gedanke dazu.',
      source: '[[Does_automation_bias_decision-making]]',
      tags: ['automation-bias', 'ki-vertrauen'],
      now: NOW
    })
    expect(content).toContain('id: 202607120905')
    expect(content).toContain('created: 2026-07-12 09:05')
    expect(content).toContain('tags: [automation-bias, ki-vertrauen]')
    expect(content).toContain('**Zitat:**\n\nEin Zitat.')
    expect(content).toContain('**Mein Gedanke:**\n\nMein Gedanke dazu.')
    expect(content).toContain('**Quelle**\n\n[[Does_automation_bias_decision-making]]')
  })

  it('lässt leere Sektionen komplett weg', () => {
    const content = buildZettelContent({ title: 'T', thought: 'Nur ein Gedanke.', tags: [], now: NOW })
    expect(content).not.toContain('**Zitat:**')
    expect(content).not.toContain('**Quelle**')
    expect(content).toContain('tags: []')
  })
})

describe('extractFrontmatterTags', () => {
  it('liest Inline-Arrays (gelebte Zettel-Konvention)', () => {
    const md = `---\nid: 202607111947\ncreated: 2026-07-11 19:47\ntags: [automation-bias, entmündigung, skitka]\n---\n\nText`
    expect(extractFrontmatterTags(md)).toEqual(['automation-bias', 'entmündigung', 'skitka'])
  })

  it('liest Listen-Syntax', () => {
    const md = `---\ntags:\n  - eins\n  - "zwei"\nandere: x\n---\nText`
    expect(extractFrontmatterTags(md)).toEqual(['eins', 'zwei'])
  })

  it('ohne Frontmatter → leer', () => {
    expect(extractFrontmatterTags('# Nur Text')).toEqual([])
    expect(extractFrontmatterTags('---\nkaputt')).toEqual([])
  })
})
