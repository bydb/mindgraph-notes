import { describe, it, expect } from 'vitest'
import { buildPrompt, injectWikilinks, isLinkableNote, stripWikilinksFor } from './dailyConsolidation'
import type { BrainConsolidateInput, BrainSensorNote } from './types'

const note = (title: string, events: BrainSensorNote['events']): BrainSensorNote => ({
  title,
  path: `${title}.md`,
  tags: [],
  events
})

const inputWith = (notes: BrainSensorNote[], language: 'de' | 'en' = 'de'): BrainConsolidateInput => ({
  vaultPath: '/tmp/vault',
  folderPath: '800 - 🧠 brain',
  date: '2026-07-11',
  generatedAtIso: '2026-07-11T08:00:00.000Z',
  model: 'test-model',
  language,
  sensors: {
    notes,
    tasks: { completed: 0, created: 0, examples: [] },
    emails: { received: 0, replied: 0, topRelevant: [] }
  }
})

describe('isLinkableNote', () => {
  it('bearbeitete und neue Notizen sind verlinkbar', () => {
    expect(isLinkableNote({ opened: 0, updated: 2, created: false })).toBe(true)
    expect(isLinkableNote({ opened: 0, updated: 0, created: true })).toBe(true)
  })

  it('nur geöffnete Notizen sind NICHT verlinkbar (Tab-Klick ≠ Tagesarbeit)', () => {
    expect(isLinkableNote({ opened: 5, updated: 0, created: false })).toBe(false)
  })
})

describe('buildPrompt — Wikilink-Liste nur für echte Aktivität', () => {
  const edited = note('Projektbericht Q3', { opened: 1, updated: 3, created: false })
  const openedOnly = note('Nerds werden Beobachter', { opened: 2, updated: 0, created: false })

  it('nur-geöffnete Notizen stehen ohne Doppelklammern in der Tagesliste (de)', () => {
    const prompt = buildPrompt(inputWith([edited, openedOnly]))
    expect(prompt).toContain('- [[Projektbericht Q3]]')
    expect(prompt).toContain('- „Nerds werden Beobachter“')
    expect(prompt).not.toContain('[[Nerds werden Beobachter]]')
  })

  it('die verpflichtende Wikilink-Liste enthält nur bearbeitete/neue Notizen', () => {
    const prompt = buildPrompt(inputWith([edited, openedOnly]))
    const verfuegbar = prompt.split('Verfügbare Notizen:')[1].split('\n')[0]
    expect(verfuegbar).toContain('[[Projektbericht Q3]]')
    expect(verfuegbar).not.toContain('Nerds werden Beobachter')
  })

  it('englischer Prompt nutzt gerade Anführungszeichen', () => {
    const prompt = buildPrompt(inputWith([openedOnly], 'en'))
    expect(prompt).toContain('- "Nerds werden Beobachter"')
    expect(prompt).not.toContain('[[Nerds werden Beobachter]]')
  })
})

describe('stripWikilinksFor', () => {
  it('dreht Links auf nur-geöffnete Notizen zu Klartext zurück', () => {
    const body = 'Die Notiz [[Nerds werden Beobachter]] wurde nur geöffnet.'
    expect(stripWikilinksFor(body, ['Nerds werden Beobachter']))
      .toBe('Die Notiz Nerds werden Beobachter wurde nur geöffnet.')
  })

  it('Alias-Links behalten den Anzeigetext', () => {
    const body = 'Fortführung von [[Nerds werden Beobachter|der Forschungsidee]].'
    expect(stripWikilinksFor(body, ['Nerds werden Beobachter']))
      .toBe('Fortführung von der Forschungsidee.')
  })

  it('lässt Links auf andere Notizen unangetastet', () => {
    const body = 'Arbeit an [[🔴 MOC - Nerds werden Beobachter]] und [[Nerds werden Beobachter]].'
    expect(stripWikilinksFor(body, ['Nerds werden Beobachter']))
      .toBe('Arbeit an [[🔴 MOC - Nerds werden Beobachter]] und Nerds werden Beobachter.')
  })

  it('escaped Regex-Sonderzeichen im Titel', () => {
    const body = 'Siehe [[feduc-11-1759062 (1).pdf]].'
    expect(stripWikilinksFor(body, ['feduc-11-1759062 (1).pdf']))
      .toBe('Siehe feduc-11-1759062 (1).pdf.')
  })
})

describe('strip + inject zusammen', () => {
  it('geteilter Titel (eine Notiz bearbeitet, eine nur geöffnet) bleibt verlinkt', () => {
    // Reihenfolge wie in consolidateDay: erst strip (opened-only), dann inject (linkable).
    let body = 'Heute an [[Doppelter Titel]] gearbeitet.'
    body = stripWikilinksFor(body, ['Doppelter Titel'])
    body = injectWikilinks(body, ['Doppelter Titel'])
    expect(body).toBe('Heute an [[Doppelter Titel]] gearbeitet.')
  })

  it('inject wickelt weiterhin Klartext-Titel bearbeiteter Notizen', () => {
    const body = injectWikilinks('Ich habe den Projektbericht Q3 erweitert.', ['Projektbericht Q3'])
    expect(body).toBe('Ich habe den [[Projektbericht Q3]] erweitert.')
  })
})
