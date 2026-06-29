import { describe, it, expect } from 'vitest'
import { ExternalWidgetRegistry, EXTERNAL_WIDGET_SLOTS } from './registry'

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

  it('leerer/unbekannter Slot → leeres Array; clear() leert alles', () => {
    const r = new ExternalWidgetRegistry()
    r.register({ pluginId: 'a', slot: 'dashboard.widget' })
    expect(r.getBySlot('does.not.exist')).toEqual([])
    r.clear()
    expect(r.getBySlot('dashboard.widget')).toEqual([])
  })
})
