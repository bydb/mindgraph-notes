import { describe, it, expect } from 'vitest'
import { buildFallback, suggestCommands, tokenizeForFallback, type FallbackCommand } from './fallback'
import { COMMAND_CATALOG } from '../commandCatalog'
import { translations } from '../../renderer/utils/translations'
import { INTENTS } from './intents'
import { matchIntent } from './match'

// Der ECHTE Aktionsbestand, nicht eine abgeschriebene Testliste: Katalog plus die
// tatsächlichen deutschen Labels. Wird eine Aktion umbenannt, misst dieser Test die
// neue Benennung.
const REAL_COMMANDS: FallbackCommand[] = COMMAND_CATALOG.map(c => ({
  id: c.id,
  label: (translations.de as Record<string, string>)[c.labelKey],
  keywords: c.keywords
}))

describe('tokenizeForFallback', () => {
  it('wirft Stoppwörter und Kurzwörter weg', () => {
    expect(tokenizeForFallback('Was ist die Übersicht?')).toEqual(['uebersicht'])
  })
  it('faltet Umlaute, damit Label und Suchwörter dieselbe Form haben', () => {
    expect(tokenizeForFallback('ähnliche Notizen')).toEqual(['aehnliche', 'notizen'])
  })
  it('entfernt Dubletten', () => {
    expect(tokenizeForFallback('terminal terminal')).toEqual(['terminal'])
  })
})

describe('Vorschläge aus dem echten Aktionsbestand', () => {
  const cases: Array<[string, string]> = [
    ['zeig mir die karteikarten', 'panel-flashcards'],
    ['terminal öffnen', 'toggle-terminal'],
    ['einstellungen', 'open-settings'],
    ['posteingang', 'panel-inbox'],
    ['vorlage einfügen', 'open-templates'],
    ['seitenleiste umschalten', 'toggle-sidebar'],
    // Real gescheitert: gesagt wurde "Design auf schwarz umstellen", die Aktion hieß
    // "Theme umschalten (hell/dunkel)" und hatte keines dieser Wörter.
    ['wie kann ich das design auf schwarz umstellen', 'toggle-theme'],
    ['dunkelmodus einschalten', 'toggle-theme'],
    ['welche todos habe ich', 'panel-tasks']
  ]
  for (const [phrase, expectedId] of cases) {
    it(`"${phrase}" schlägt ${expectedId} vor`, () => {
      const ids = suggestCommands(phrase, REAL_COMMANDS).map(s => s.id)
      expect(ids).toContain(expectedId)
    })
  }

  it('unterdrückt Treffer, die nur auf einem allgegenwärtigen Wort beruhen', () => {
    // "öffne" steht in vielen Labels und unterscheidet nichts; "notiz" schon.
    const ids = suggestCommands('neue öffne eine neue notiz', REAL_COMMANDS).map(s => s.id)
    expect(ids).toContain('open-quick-switcher')
    expect(ids).not.toContain('llm-performance')
    expect(ids).not.toContain('open-agent')
  })

  it('liefert höchstens drei Vorschläge', () => {
    expect(suggestCommands('agent ki notizen panel', REAL_COMMANDS).length).toBeLessThanOrEqual(3)
  })
})

describe('Die Rückfallliste ist NIE leer', () => {
  // Genau die Zusage aus dem Plan: ein nicht erkannter Satz endet nicht im Nichts.
  const phrases = [
    ...INTENTS.flatMap(i => i.examples),
    'wie war das wetter gestern',
    'schreib eine mail an herrn müller',
    'lies mir die aktuelle notiz vor',
    'öffne projekt müller',
    'wie viele notizen habe ich',
    'mach das licht aus',
    'erstelle eine neue notiz',
    'was steht diese woche an',
    'guten morgen',
    'qwertz',
    ''
  ]

  for (const phrase of phrases) {
    it(`"${phrase}" -> mindestens die Notizsuche`, () => {
      const entries = buildFallback(phrase, REAL_COMMANDS)
      expect(entries.length).toBeGreaterThan(0)
      expect(entries[0].kind).toBe('search-notes')
      if (entries[0].kind === 'search-notes') expect(entries[0].query).toBe(phrase.trim())
    })
  }

  it('jeder abgelehnte Satz landet über den Erkenner im Rückfall und findet dort etwas', () => {
    const outcome = matchIntent('wie war das wetter gestern')
    expect(outcome.kind).toBe('fallback')
    if (outcome.kind === 'fallback') {
      expect(buildFallback(outcome.query, REAL_COMMANDS).length).toBeGreaterThan(0)
    }
  })
})
