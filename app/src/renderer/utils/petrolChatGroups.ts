// Gruppen der Gesprächsliste (Seitenleiste, Codex F06 in docs/codex-collab/chat-verlauf-seitenleiste-design.md):
// oben „Angeheftet“, darunter nach Datum der letzten Nachricht — Heute, Gestern, Letzte 7 Tage,
// Älter. Archivierte stehen nur in der Archiv-Ansicht. Rein, damit die Grenzen testbar sind
// (lokale Mitternacht, nicht 24-Stunden-Fenster).

import type { PetrolConvListItem } from '../../shared/petrolChat'

export type ChatGroupKey = 'pinned' | 'today' | 'yesterday' | 'week' | 'older' | 'archived'

export interface ChatGroup {
  key: ChatGroupKey
  items: PetrolConvListItem[]
}

/** Ab so vielen Gesprächen erscheint die Suche nach Titel. */
export const CHAT_SEARCH_FROM = 15

/**
 * Lokale Mitternacht `daysBack` Kalendertage vor `t` — über das Kalenderdatum, nicht über feste
 * 24-Stunden-Blöcke: an der Zeitumstellung hat ein Tag 23 oder 25 Stunden (Design F16).
 */
export function startOfDay(t: number, daysBack = 0): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  if (daysBack) d.setDate(d.getDate() - daysBack)
  return d.getTime()
}

/** Nächste lokale Mitternacht nach `t` — dann wechseln die Gruppen. */
export function nextMidnight(t: number): number {
  const d = new Date(t)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

/** Passt der Eintrag zur Suche? Nicht lesbare haben keinen Titel und passen nur ohne Suche. */
export function matchesChatQuery(item: PetrolConvListItem, query: string): boolean {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return true
  if (item.unreadable) return false
  return item.title.toLocaleLowerCase().includes(q)
}

export function groupConversations(items: readonly PetrolConvListItem[], now: number, opts: { archived?: boolean; query?: string } = {}): ChatGroup[] {
  const byNewest = [...items].sort((a, b) => b.updatedAt - a.updatedAt).filter(it => matchesChatQuery(it, opts.query ?? ''))
  if (opts.archived) {
    const archived = byNewest.filter(it => it.archived)
    return archived.length ? [{ key: 'archived', items: archived }] : []
  }
  const active = byNewest.filter(it => !it.archived)
  const today = startOfDay(now)
  const yesterday = startOfDay(now, 1)
  const weekAgo = startOfDay(now, 6)
  const groups: Record<Exclude<ChatGroupKey, 'archived'>, PetrolConvListItem[]> = { pinned: [], today: [], yesterday: [], week: [], older: [] }
  for (const it of active) {
    if (it.pinned) groups.pinned.push(it)
    else if (it.updatedAt >= today) groups.today.push(it)
    else if (it.updatedAt >= yesterday) groups.yesterday.push(it)
    else if (it.updatedAt >= weekAgo) groups.week.push(it)
    else groups.older.push(it)
  }
  return (['pinned', 'today', 'yesterday', 'week', 'older'] as const).filter(k => groups[k].length).map(k => ({ key: k, items: groups[k] }))
}

/** Anzahl archivierter Gespräche — für den Eintrag im Menü. */
export function archivedCount(items: readonly PetrolConvListItem[]): number {
  return items.filter(it => it.archived).length
}
