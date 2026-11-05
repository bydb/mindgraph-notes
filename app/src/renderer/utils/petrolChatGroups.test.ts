import { describe, it, expect } from 'vitest'

// Gruppen nach lokalem Kalendertag — mit Sommerzeit getestet (Design F16).
process.env.TZ = 'Europe/Berlin'
import { archivedCount, groupConversations, matchesChatQuery, nextMidnight } from './petrolChatGroups'
import type { PetrolConvListItem } from '../../shared/petrolChat'

// Gruppen der Gesprächsliste (chat-verlauf-seitenleiste-design.md F06, Anheften/Archivieren).

const now = new Date(2026, 10, 5, 10, 0).getTime()          // 05.11.2026, 10:00 Ortszeit
const at = (d: number, h = 12) => new Date(2026, 10, d, h, 0).getTime()
const item = (id: string, updatedAt: number, extra: Partial<PetrolConvListItem> = {}): PetrolConvListItem => ({ id, title: `Titel ${id}`, updatedAt, ...extra })

describe('groupConversations', () => {
  it('Angeheftet oben, dann nach lokalen Tagen', () => {
    const g = groupConversations([
      item('heute-frueh', at(5, 0)),
      item('gestern-spaet', at(4, 23)),
      item('vor-6-tagen', at(30 - 31 + 30, 12) && new Date(2026, 9, 30, 12).getTime()),
      item('vor-7-tagen', new Date(2026, 9, 29, 12).getTime()),
      item('alt-angeheftet', new Date(2026, 0, 1).getTime(), { pinned: true }),
      item('archiviert', at(5, 9), { archived: true })
    ], now)
    expect(g.map(x => [x.key, x.items.map(i => i.id)])).toEqual([
      ['pinned', ['alt-angeheftet']],
      ['today', ['heute-frueh']],
      ['yesterday', ['gestern-spaet']],
      ['week', ['vor-6-tagen']],
      ['older', ['vor-7-tagen']]
    ])
  })

  it('neueste zuerst; leere Gruppen fehlen', () => {
    const g = groupConversations([item('a', at(5, 8)), item('b', at(5, 9))], now)
    expect(g).toEqual([{ key: 'today', items: [item('b', at(5, 9)), item('a', at(5, 8))] }])
  })

  it('Archiv-Ansicht: nur archivierte, auch angeheftete', () => {
    const g = groupConversations([item('a', at(5), { archived: true, pinned: true }), item('b', at(5))], now, { archived: true })
    expect(g.map(x => [x.key, x.items.map(i => i.id)])).toEqual([['archived', ['a']]])
    expect(archivedCount([item('a', 1, { archived: true }), item('b', 1)])).toBe(1)
  })

  it('Suche nach Titel, ohne Groß/Klein; nicht Lesbares nur ohne Suche', () => {
    const items = [item('a', at(5), { title: 'Parfüm Gris Charnel' }), item('b', at(5), { title: '', unreadable: true })]
    expect(groupConversations(items, now, { query: 'gris' })[0].items.map(i => i.id)).toEqual(['a'])
    expect(groupConversations(items, now, { query: '  ' })[0].items).toHaveLength(2)
    expect(matchesChatQuery(items[1], 'x')).toBe(false)
  })
})

describe('Zeitumstellung und Tageswechsel (Design F16)', () => {
  it('nach der Herbst-Umstellung (25.10.2026) gehört 00:30 des Vortags zu „Gestern“', () => {
    const n = new Date(2026, 9, 26, 10, 0).getTime()
    const g = groupConversations([item('a', new Date(2026, 9, 25, 0, 30).getTime())], n)
    expect(g.map(x => x.key)).toEqual(['yesterday'])
  })
  it('nach der Frühjahrs-Umstellung (29.03.2026) bleibt die 7-Tage-Grenze bei Mitternacht', () => {
    const n = new Date(2026, 3, 1, 10, 0).getTime()                    // 01.04.
    const g = groupConversations([item('in', new Date(2026, 2, 26, 0, 10).getTime()), item('raus', new Date(2026, 2, 25, 23, 50).getTime())], n)
    expect(g.map(x => [x.key, x.items.map(i => i.id)])).toEqual([['week', ['in']], ['older', ['raus']]])
  })
  it('nächste Mitternacht', () => {
    expect(new Date(nextMidnight(new Date(2026, 9, 24, 23, 59).getTime())).getHours()).toBe(0)
    expect(new Date(nextMidnight(new Date(2026, 9, 24, 23, 59).getTime())).getDate()).toBe(25)
  })
})
