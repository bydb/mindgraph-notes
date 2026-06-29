import { describe, it, expect } from 'vitest'
import { ExternalWidgetRegistry, EXTERNAL_WIDGET_SLOTS, type ExternalWidgetSlot, type ExternalWidgetEntry } from './registry'

describe('ExternalWidgetRegistry', () => {
  it('registriert Beiträge pro Slot und liefert sie zurück', () => {
    const r = new ExternalWidgetRegistry()
    r.register({ pluginId: 'a', slot: EXTERNAL_WIDGET_SLOTS.dashboard, title: 'A' })
    r.register({ pluginId: 'b', slot: EXTERNAL_WIDGET_SLOTS.dashboard })
    r.register({ pluginId: 'c', slot: EXTERNAL_WIDGET_SLOTS.sidebar })
    expect(r.getBySlot(EXTERNAL_WIDGET_SLOTS.dashboard).map((e) => e.pluginId)).toEqual(['a', 'b'])
    expect(r.getBySlot(EXTERNAL_WIDGET_SLOTS.sidebar).map((e) => e.pluginId)).toEqual(['c'])
  })

  it('dedupliziert per pluginId+slot (erneutes register ersetzt)', () => {
    const r = new ExternalWidgetRegistry()
    r.register({ pluginId: 'a', slot: 'dashboard.widget', title: 'v1' })
    r.register({ pluginId: 'a', slot: 'dashboard.widget', title: 'v2' })
    const list = r.getBySlot('dashboard.widget')
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('v2')
  })

  it('removeByPlugin entfernt ALLE Beiträge eines Plugins (Runtime-Uninstall)', () => {
    const r = new ExternalWidgetRegistry()
    r.register({ pluginId: 'a', slot: 'dashboard.widget' })
    r.register({ pluginId: 'a', slot: 'sidebar.panel' })
    r.register({ pluginId: 'b', slot: 'dashboard.widget' })
    r.removeByPlugin('a')
    expect(r.getBySlot('dashboard.widget').map((e) => e.pluginId)).toEqual(['b'])
    expect(r.getBySlot('sidebar.panel')).toEqual([]) // leerer Slot → leeres Array
  })

  it('leerer Slot → leeres Array; clear() leert alles', () => {
    const r = new ExternalWidgetRegistry()
    r.register({ pluginId: 'a', slot: 'dashboard.widget' })
    expect(r.getBySlot('sidebar.panel')).toEqual([]) // gültig, aber leer
    r.clear()
    expect(r.getBySlot('dashboard.widget')).toEqual([])
  })

  it('verwirft einen unbekannten Slot zur Laufzeit (fail-closed)', () => {
    const r = new ExternalWidgetRegistry()
    r.register({ pluginId: 'a', slot: 'evil.slot' as ExternalWidgetSlot })
    expect(r.getBySlot('evil.slot' as ExternalWidgetSlot)).toEqual([])
    expect(r.getBySlot('dashboard.widget')).toEqual([])
  })

  it('getBySlot liefert eine KOPIE — Mutation am Ergebnis ändert die Registry nicht', () => {
    const r = new ExternalWidgetRegistry()
    r.register({ pluginId: 'a', slot: 'dashboard.widget' })
    const out = r.getBySlot('dashboard.widget') as ExternalWidgetEntry[]
    out.push({ pluginId: 'x', slot: 'dashboard.widget' })
    out.length = 0
    expect(r.getBySlot('dashboard.widget').map((e) => e.pluginId)).toEqual(['a'])
  })
})
