import { describe, it, expect } from 'vitest'
import { catalogCategories, filterCatalogEntries, type CatalogEntryLike } from './catalogFilter'

const entries: CatalogEntryLike[] = [
  { id: 'demo', name: 'MindGraph Demo', repo: 'bydb/mindgraph-plugin-demo', description: 'Dashboard-Widget + Update-Demo', author: 'bydb', category: 'productivity' },
  { id: 'cal', name: 'Calendar Sync', repo: 'acme/cal', description: 'Termine abgleichen', author: 'acme', category: 'productivity' },
  { id: 'ai-notes', name: 'AI Notes', repo: 'acme/ai', description: 'KI-Vorschläge', author: 'acme', category: 'ai' },
  { id: 'nocat', name: 'No Category', repo: 'x/y' },
]

describe('catalogCategories', () => {
  it('liefert eindeutige, sortierte Kategorien ohne leere', () => {
    expect(catalogCategories(entries)).toEqual(['ai', 'productivity'])
  })
  it('leere Eingabe → leeres Array', () => {
    expect(catalogCategories([])).toEqual([])
  })
})

describe('filterCatalogEntries', () => {
  it('ohne Query/Kategorie → alle Einträge', () => {
    expect(filterCatalogEntries(entries, '', null)).toHaveLength(4)
  })
  it('filtert per Kategorie (exakt)', () => {
    expect(filterCatalogEntries(entries, '', 'productivity').map(e => e.id)).toEqual(['demo', 'cal'])
    expect(filterCatalogEntries(entries, '', 'ai').map(e => e.id)).toEqual(['ai-notes'])
  })
  it('Freitext case-insensitiv über name/description/id/repo/author', () => {
    expect(filterCatalogEntries(entries, 'CALENDAR', null).map(e => e.id)).toEqual(['cal'])
    expect(filterCatalogEntries(entries, 'ki-vor', null).map(e => e.id)).toEqual(['ai-notes'])
    expect(filterCatalogEntries(entries, 'acme/ai', null).map(e => e.id)).toEqual(['ai-notes'])
    expect(filterCatalogEntries(entries, 'bydb', null).map(e => e.id)).toEqual(['demo'])
  })
  it('kombiniert Query UND Kategorie', () => {
    expect(filterCatalogEntries(entries, 'sync', 'productivity').map(e => e.id)).toEqual(['cal'])
    expect(filterCatalogEntries(entries, 'sync', 'ai')).toHaveLength(0)
  })
  it('kein Treffer → leeres Array', () => {
    expect(filterCatalogEntries(entries, 'zzz-nichts', null)).toHaveLength(0)
  })
})
