import { describe, it, expect } from 'vitest'
import { RendererPluginRegistry, discoverRendererPlugins } from './registry'
import type { PluginRendererEntry } from '../../shared/plugins/entry'

function entry(id: string, slot: string, component: unknown): PluginRendererEntry {
  return { id, contribute: (slots) => slots.register(slot, component) }
}

describe('RendererPluginRegistry', () => {
  it('sammelt Beiträge an benannten Slots', () => {
    const r = new RendererPluginRegistry()
    r.load([entry('a', 'dashboard.widgets', { tag: 'A' }), entry('b', 'dashboard.widgets', { tag: 'B' })])
    expect(r.getSlot('dashboard.widgets')).toEqual([{ tag: 'A' }, { tag: 'B' }])
    expect(r.getSlot('leer')).toEqual([])
  })

  it('isoliert einen Entry, der bei contribute wirft', () => {
    const r = new RendererPluginRegistry()
    const boom: PluginRendererEntry = {
      id: 'boom',
      contribute: () => {
        throw new Error('contribute kaputt')
      },
    }
    r.load([boom, entry('ok', 'slot', { tag: 'OK' })])
    expect(r.failures().boom).toContain('contribute kaputt')
    expect(r.getSlot('slot')).toEqual([{ tag: 'OK' }])
  })
})

describe('discoverRendererPlugins (import.meta.glob-Verdrahtung)', () => {
  it('findet den Demo-Renderer-Entry und registriert seinen Slot', () => {
    const entries = discoverRendererPlugins()
    expect(entries.some((e) => e.id === 'demo')).toBe(true)
    const r = new RendererPluginRegistry()
    r.load(entries)
    expect(r.getSlot('dashboard.widgets').length).toBeGreaterThan(0)
  })
})
