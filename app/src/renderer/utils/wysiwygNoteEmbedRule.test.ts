import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
// @ts-expect-error — domino bringt keine Typen mit; turndown nutzt es in Node selbst
import domino from '@mixmark-io/domino'
import { noteEmbedRule, renderNoteEmbedHtml } from './wysiwygNoteEmbedRule'

// Echte Kette wie im Lesen-Modus (Codex F31): md.render → HTML parsen → Embed-Inhalt
// nachladen (innerHTML, wie processEmbeds) → turndown. Ein künstlich gebautes DOM würde
// verdecken, dass der Parser einen Absatz um einen Block-Container aufbricht.

const md = new MarkdownIt({ html: true, typographer: true, breaks: true })
const defaultText = md.renderer.rules.text!
// Gleiche Erkennung wie in MarkdownEditor.tsx (Notiz-Zweig der Text-Regel)
md.renderer.rules.text = (tokens, idx, options, env, self) => {
  const content = tokens[idx].content
  if (!content.includes('![[')) return defaultText(tokens, idx, options, env, self)
  return content.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (match: string, linkText: string, sizeOrAlias: string | undefined, offset: number) => {
    const aloneInParagraph = tokens.length === 1 && content.trim() === match
    return renderNoteEmbedHtml({
      linkText, sizeOrAlias, inline: !aloneInParagraph,
      spaceBefore: /\s/.test(content[offset - 1] ?? ''),
      spaceAfter: /\s/.test(content[offset + match.length] ?? ''),
      escapeHtml: md.utils.escapeHtml
    })
  })
}

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
td.addRule('noteEmbed', noteEmbedRule)

type Hydration = 'loaded' | 'loading' | 'error' | 'empty'

function roundtrip(markdown: string, hydration: Hydration = 'loaded'): string {
  const doc = domino.createDocument(`<div id="root">${md.render(markdown)}</div>`)
  const root = doc.getElementById('root')
  for (const el of Array.from(root.querySelectorAll('.wikilink-embed')) as HTMLElement[]) {
    if (hydration === 'loaded') {
      el.innerHTML = '<div class="wikilink-embed-content"><div class="wikilink-embed-header"><span>Andere Notiz</span></div><div class="wikilink-embed-body"><h2>Geheimer Inhalt</h2><p>Text der anderen Notiz</p></div></div>'
    } else if (hydration === 'error') {
      el.innerHTML = '<div class="wikilink-embed-error">Notiz nicht gefunden</div>'
    } else if (hydration === 'empty') {
      el.innerHTML = '​'
    }
  }
  return td.turndown(root).replace(/\n{3,}/g, '\n\n').trim()
}

describe('noteEmbedRule (Lesen-Modus-Roundtrip)', () => {
  it('Einbettung allein im Absatz bleibt ![[…]] und schreibt keinen Fremdinhalt', () => {
    const out = roundtrip('Vorher\n\n![[Andere Notiz]]\n\nNachher')
    expect(out).toBe('Vorher\n\n![[Andere Notiz]]\n\nNachher')
    expect(out).not.toContain('Geheimer Inhalt')
  })

  it.each<Hydration>(['loaded', 'loading', 'error', 'empty'])('Zustand %s → genau ![[…]]', (h) => {
    expect(roundtrip('![[Andere Notiz]]', h)).toBe('![[Andere Notiz]]')
  })

  it('Alias, Überschrift und Block-Fragment bleiben erhalten', () => {
    expect(roundtrip('![[Notiz#Überschrift|Alias]]')).toBe('![[Notiz#Überschrift|Alias]]')
    expect(roundtrip('![[Notiz#^abc123]]')).toBe('![[Notiz#^abc123]]')
    expect(roundtrip('![[ordner/Notiz]]')).toBe('![[ordner/Notiz]]')
  })

  it.each<Hydration>(['loaded', 'loading'])('Einbettung mitten im Satz zerreißt den Absatz nicht (%s)', (h) => {
    expect(roundtrip('Vorher ![[Andere Notiz]] nachher', h)).toBe('Vorher ![[Andere Notiz]] nachher')
    expect(roundtrip('Vorher![[Andere Notiz]]nachher', h)).toBe('Vorher![[Andere Notiz]]nachher')
  })

  it('Apostroph: typografisch gerendert, gerade zurückgeschrieben', () => {
    expect(roundtrip("![[You'll]]")).toBe("![[You'll]]")
  })
})
