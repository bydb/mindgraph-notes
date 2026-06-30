// Reine Filter-/Gruppierungslogik für die Plugin-Katalog-Sektion (A5: Suche + Kategorie-Filter).
// Pure Funktionen über die bereits geladenen Katalog-Einträge — kein React, kein IPC → unit-testbar.

export interface CatalogEntryLike {
  id: string
  name: string
  repo: string
  description?: string
  author?: string
  category?: string
}

/** Eindeutige, alphabetisch sortierte Kategorien der Einträge (leere/fehlende ignoriert). */
export function catalogCategories(entries: readonly CatalogEntryLike[]): string[] {
  const set = new Set<string>()
  for (const e of entries) {
    const c = e.category?.trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/**
 * Filtert Einträge nach Freitext (Name/Beschreibung/id/repo/Autor, case-insensitive, getrimmt) und
 * optionaler exakter Kategorie. Leere Query ⇒ kein Textfilter; `category === null` ⇒ keine Kategorie-
 * Einschränkung. Reihenfolge bleibt erhalten.
 */
export function filterCatalogEntries<T extends CatalogEntryLike>(
  entries: readonly T[],
  query: string,
  category: string | null
): T[] {
  const q = query.trim().toLowerCase()
  return entries.filter((e) => {
    if (category !== null && (e.category?.trim() ?? '') !== category) return false
    if (!q) return true
    const hay = `${e.name} ${e.description ?? ''} ${e.id} ${e.repo} ${e.author ?? ''}`.toLowerCase()
    return hay.includes(q)
  })
}
