import { describe, it, expect } from 'vitest'
import {
  buildProvenanceMetaTag,
  formatProvenanceLabel,
  getAiProvenance,
  setAiProvenanceInContent
} from './aiProvenance'

const MODEL = 'qwen3.6:27b-mlx'
const DATE = '2026-07-27'

describe('setAiProvenanceInContent', () => {
  it('ergänzt bestehendes Frontmatter und lässt den Body byte-identisch', () => {
    const input = '---\ntitle: "Test"\ntags:\n  - llm\n---\n\n# Überschrift\n\nAbsatz mit --- Trennstrich.\n'
    const out = setAiProvenanceInContent(input, MODEL, DATE)

    expect(out).toContain('title: "Test"')
    expect(out).toContain(`ki-modell: ${MODEL}`)
    expect(out).toContain(`ki-datum: ${DATE}`)
    // Body unverändert — insbesondere darf der `---` im Fließtext nicht als
    // Frontmatter-Ende missverstanden werden.
    expect(out.slice(out.indexOf('\n---\n') + 5)).toBe('\n# Überschrift\n\nAbsatz mit --- Trennstrich.\n')
  })

  it('legt Frontmatter an, wenn keins existiert', () => {
    const out = setAiProvenanceInContent('# Nur Body\n', MODEL, DATE)
    expect(out).toBe(`---\nki-modell: ${MODEL}\nki-datum: ${DATE}\n---\n\n# Nur Body\n`)
  })

  it('ersetzt vorhandene Werte statt zu duplizieren', () => {
    const once = setAiProvenanceInContent('---\ntitle: A\n---\n\nBody\n', 'gemma4:latest', '2026-01-01')
    const twice = setAiProvenanceInContent(once, MODEL, DATE)

    expect(twice.match(/^ki-modell:/gm)).toHaveLength(1)
    expect(twice.match(/^ki-datum:/gm)).toHaveLength(1)
    expect(twice).toContain(`ki-modell: ${MODEL}`)
    expect(twice).not.toContain('gemma4:latest')
  })

  it('quotet nur, wenn der Wert als Plain-Scalar ungültig wäre', () => {
    // Ollama-Tag: Doppelpunkt ohne Leerzeichen bleibt ein gültiger Plain-Scalar.
    expect(setAiProvenanceInContent('Body', 'qwen3.6:27b', DATE)).toContain('ki-modell: qwen3.6:27b')
    // Doppelpunkt + Leerzeichen bricht YAML → Quotes.
    expect(setAiProvenanceInContent('Body', 'Claude: Fable 5', DATE)).toContain('ki-modell: "Claude: Fable 5"')
  })
})

describe('getAiProvenance', () => {
  it('liest Modell und Datum zurück (Roundtrip)', () => {
    const out = setAiProvenanceInContent('---\ntitle: A\n---\n\nBody\n', MODEL, DATE)
    expect(getAiProvenance(out)).toEqual({ model: MODEL, date: DATE })
  })

  it('entfernt umschließende Quotes', () => {
    const out = setAiProvenanceInContent('Body', 'Claude: Fable 5', DATE)
    expect(getAiProvenance(out)?.model).toBe('Claude: Fable 5')
  })

  it('liest händisch gesetzte, ungequotete Werte', () => {
    const content = '---\ntitle: X\nki-modell: Claude (Fable 5)\n---\n\nBody\n'
    expect(getAiProvenance(content)).toEqual({ model: 'Claude (Fable 5)', date: '' })
  })

  it('gibt null zurück, wenn nicht KI-markiert', () => {
    expect(getAiProvenance('---\ntitle: X\n---\n\nBody\n')).toBeNull()
    expect(getAiProvenance('# Kein Frontmatter\n')).toBeNull()
  })
})

describe('formatProvenanceLabel', () => {
  it('strippt Provider- und Namespace-Präfixe', () => {
    expect(formatProvenanceLabel('openrouter/anthropic/claude-sonnet-4')).toBe('claude-sonnet-4')
    expect(formatProvenanceLabel('mlx-community/qwen3.6-27b')).toBe('qwen3.6-27b')
    expect(formatProvenanceLabel(MODEL)).toBe(MODEL)
  })

  it('kappt zu lange Namen mit Ellipse', () => {
    const label = formatProvenanceLabel('ein-sehr-langer-modellname-ohne-ende')
    expect(label).toHaveLength(22)
    expect(label.endsWith('…')).toBe(true)
  })

  it('verträgt leere Eingaben', () => {
    expect(formatProvenanceLabel('')).toBe('')
  })
})

describe('buildProvenanceMetaTag', () => {
  it('escapt Attributwerte', () => {
    expect(buildProvenanceMetaTag('a"b<c')).toBe('<meta name="ki-modell" content="a&quot;b&lt;c">')
  })

  it('bleibt leer ohne Modell — unmarkiert statt falsch markiert', () => {
    expect(buildProvenanceMetaTag('')).toBe('')
  })
})

// Am 29.07.2026 real aufgetreten: eine wissenschaftliche HTML-Seite lief über den
// Markdown-Zweig der Übernahme und bekam den Frontmatter-Block vorangestellt.
// Der stand danach als Text über der Seite — und weil `<!DOCTYPE html>` nicht
// mehr an erster Stelle stand, fiel der Browser in den Quirks-Modus und
// renderte KEINE Formel mehr, obwohl KaTeX geladen war.
describe('setAiProvenanceInContent — HTML bleibt unangetastet', () => {
  it('stempelt kein vollständiges HTML-Dokument', () => {
    const html = '<!DOCTYPE html>\n<html lang="de">\n<head><title>x</title></head>\n<body>$$ a $$</body>\n</html>'
    expect(setAiProvenanceInContent(html, 'qwen3.6:latest', '2026-07-29')).toBe(html)
  })

  it('erkennt HTML auch mit führendem Leerraum, BOM und anderer Schreibweise', () => {
    for (const doc of ['  \n<!doctype html>\n<html>', '﻿<!DOCTYPE HTML>\n<html>', '<html lang="de">']) {
      expect(setAiProvenanceInContent(doc, 'm', '2026-07-29')).toBe(doc)
    }
  })

  it('stempelt Markdown weiterhin — auch mit HTML-Codeblock darin', () => {
    const md = '# Titel\n\n```html\n<!DOCTYPE html>\n<html></html>\n```\n'
    const out = setAiProvenanceInContent(md, 'qwen3.6:latest', '2026-07-29')
    expect(out.startsWith('---\nki-modell: ')).toBe(true)
    expect(out).toContain('# Titel')
    expect(getAiProvenance(out)?.model).toBe('qwen3.6:latest')
  })

  it('stempelt Markdown, das nur mit einem Inline-Tag beginnt', () => {
    const md = '<span class="x">Hinweis</span>\n\nText'
    expect(setAiProvenanceInContent(md, 'm', '2026-07-29').startsWith('---\n')).toBe(true)
  })
})
