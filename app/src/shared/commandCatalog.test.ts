import { describe, it, expect } from 'vitest'
import { COMMAND_CATALOG } from './commandCatalog'
import { translations } from '../renderer/utils/translations'

describe('Befehlskatalog', () => {
  it('hat eindeutige ids', () => {
    const ids = COMMAND_CATALOG.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // shared/ darf nicht auf den Renderer zeigen, deshalb ist labelKey nur ein String.
  // Diese Prüfung ersetzt die fehlende Typbindung — und sie ist strenger, weil sie
  // BEIDE Sprachen abdeckt.
  it('jeder Label- und Kategorie-Schlüssel existiert auf Deutsch und Englisch', () => {
    const missing: string[] = []
    for (const cmd of COMMAND_CATALOG) {
      for (const key of [cmd.labelKey, cmd.categoryKey]) {
        if (!(key in translations.de)) missing.push(`de: ${key}`)
        if (!(key in translations.en)) missing.push(`en: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('führt jede Aktion einer bekannten Kategorie zu', () => {
    const categories = new Set(COMMAND_CATALOG.map(c => c.categoryKey))
    expect([...categories].sort()).toEqual([
      'commandPalette.cat.panels',
      'commandPalette.cat.search',
      'commandPalette.cat.tools',
      'commandPalette.cat.view'
    ])
  })
})
