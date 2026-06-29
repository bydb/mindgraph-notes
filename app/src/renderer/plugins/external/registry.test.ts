import { describe, it, expect } from 'vitest'
import { ExternalWidgetRegistry, EXTERNAL_WIDGET_SLOTS, type ExternalWidgetSlot, type ExternalWidgetEntry } from './registry'

describe('ExternalWidgetRegistry', () => {
  const entry = (pluginId: string, slot: ExternalWidgetSlot, title?: string): ExternalWidgetEntry => ({
    instanceId: `${pluginId}:${slot}`,
    pluginId,
    pluginLabel: pluginId.toUpperCase(),
    slot,
    title,
  })

  it('spiegelt die Main-Liste pro Slot und liefert sie zurück', () => {
    const r = new ExternalWidgetRegistry()
    r.replace([
      entry('a', EXTERNAL_WIDGET_SLOTS.dashboard, 'A'),
      entry('b', EXTERNAL_WIDGET_SLOTS.dashboard),
      entry('c', EXTERNAL_WIDGET_SLOTS.sidebar),
    ])
    expect(r.getBySlot(EXTERNAL_WIDGET_SLOTS.dashboard).map((e) => e.pluginId)).toEqual(['a', 'b'])
    expect(r.getBySlot(EXTERNAL_WIDGET_SLOTS.sidebar).map((e) => e.pluginId)).toEqual(['c'])
  })

  it('dedupliziert per pluginId+slot (letzter Eintrag gewinnt)', () => {
    const r = new ExternalWidgetRegistry()
    r.replace([entry('a', 'dashboard.widget', 'v1'), entry('a', 'dashboard.widget', 'v2')])
    const list = r.getBySlot('dashboard.widget')
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('v2')
  })

  it('replace() ist Vollersatz — fehlende Plugins verschwinden (Runtime-Disable/Uninstall)', () => {
    const r = new ExternalWidgetRegistry()
    r.replace([entry('a', 'dashboard.widget'), entry('a', 'sidebar.panel'), entry('b', 'dashboard.widget')])
    r.replace([entry('b', 'dashboard.widget')])
    expect(r.getBySlot('dashboard.widget').map((e) => e.pluginId)).toEqual(['b'])
    expect(r.getBySlot('sidebar.panel')).toEqual([]) // a's Sidebar-Beitrag ist weg
  })

  it('leerer Slot → leeres Array; replace([]) leert alles', () => {
    const r = new ExternalWidgetRegistry()
    r.replace([entry('a', 'dashboard.widget')])
    expect(r.getBySlot('sidebar.panel')).toEqual([]) // gültig, aber leer
    r.replace([])
    expect(r.getBySlot('dashboard.widget')).toEqual([])
  })

  it('verwirft einen unbekannten Slot zur Laufzeit (fail-closed) und verarbeitet den Rest weiter', () => {
    const r = new ExternalWidgetRegistry()
    r.replace([entry('a', 'evil.slot' as ExternalWidgetSlot), entry('b', 'dashboard.widget')])
    expect(r.getBySlot('evil.slot' as ExternalWidgetSlot)).toEqual([])
    expect(r.getBySlot('dashboard.widget').map((e) => e.pluginId)).toEqual(['b'])
  })

  it('getBySlot liefert eine KOPIE — Mutation am Ergebnis ändert die Registry nicht', () => {
    const r = new ExternalWidgetRegistry()
    r.replace([entry('a', 'dashboard.widget')])
    const out = r.getBySlot('dashboard.widget') as ExternalWidgetEntry[]
    out.push(entry('x', 'dashboard.widget'))
    out.length = 0
    expect(r.getBySlot('dashboard.widget').map((e) => e.pluginId)).toEqual(['a'])
  })

  it('benachrichtigt Subscriber bei replace() und stoppt nach unsubscribe (useSyncExternalStore-Vertrag)', () => {
    const r = new ExternalWidgetRegistry()
    let calls = 0
    const unsub = r.subscribe(() => { calls++ })
    const before = r.getRevision()
    r.replace([entry('a', 'dashboard.widget')])
    expect(calls).toBe(1)
    expect(r.getRevision()).toBe(before + 1)
    unsub()
    r.replace([])
    expect(calls).toBe(1) // nach unsubscribe keine weitere Benachrichtigung
    expect(r.getRevision()).toBe(before + 2) // Revision steigt dennoch (Snapshot bleibt konsistent)
  })
})
