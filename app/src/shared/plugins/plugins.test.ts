import { describe, it, expect } from 'vitest'
import {
  validateManifest,
  validateManifestSemantics,
  validateAgainst,
} from './schemas'
import {
  initialPluginState,
  isPluginUsable,
  pluginBlockedReason,
  type PluginRuntimeState,
} from './state'
import { definePluginMain } from './entry'
import type { PluginManifest } from './manifest'

const validManifest: PluginManifest = {
  id: 'antares',
  version: '1.0.0',
  label: 'Antares Medienzentrum',
  description: 'Verleih-Dashboard',
  category: 'business',
  capabilities: ['http.fetch', 'secrets'],
  http: { allowedHosts: ['antares.example.net'] },
  actions: [
    { id: 'antares.listMahnungen', requiredCapabilities: ['http.fetch'] },
  ],
}

describe('validateManifest', () => {
  it('akzeptiert ein gültiges Manifest', () => {
    expect(validateManifest(validManifest)).toEqual({ valid: true, errors: [] })
  })

  it('lehnt fehlende Pflichtfelder ab', () => {
    const r = validateManifest({ id: 'x', label: 'X' })
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('lehnt ungültige id-Pattern ab', () => {
    const r = validateManifest({ ...validManifest, id: 'Bad ID' })
    expect(r.valid).toBe(false)
  })

  it('lehnt unbekannte Capability ab', () => {
    const r = validateManifest({ ...validManifest, capabilities: ['fs.raw'] })
    expect(r.valid).toBe(false)
  })
})

describe('validateManifestSemantics', () => {
  it('akzeptiert Actions mit deklarierten Capabilities', () => {
    expect(validateManifestSemantics(validManifest)).toEqual({ valid: true, errors: [] })
  })

  it('fängt eine Action, die eine nicht deklarierte Capability verlangt', () => {
    const bad: PluginManifest = {
      ...validManifest,
      actions: [{ id: 'antares.write', requiredCapabilities: ['vault.write'] }],
    }
    const r = validateManifestSemantics(bad)
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('vault.write')
  })
})

describe('validateAgainst (Action-IO)', () => {
  const schema = {
    type: 'object',
    required: ['q'],
    properties: { q: { type: 'string' } },
    additionalProperties: false,
  }
  it('validiert eine korrekte Payload', () => {
    expect(validateAgainst(schema, { q: 'hallo' }, 'test.in').valid).toBe(true)
  })
  it('lehnt eine fehlerhafte Payload ab', () => {
    expect(validateAgainst(schema, { q: 5 }, 'test.in').valid).toBe(false)
  })
})

describe('Plugin-Lebenszyklus', () => {
  it('frischer Zustand ist nicht nutzbar', () => {
    const s = initialPluginState('antares', '1.0.0')
    expect(isPluginUsable(s)).toBe(false)
    expect(pluginBlockedReason(s)).toBe('Plugin deaktiviert')
  })

  it('alle drei Achsen grün ⇒ nutzbar', () => {
    const s: PluginRuntimeState = {
      id: 'antares',
      installation: 'bundled',
      activation: 'active',
      readiness: 'ready',
    }
    expect(isPluginUsable(s)).toBe(true)
    expect(pluginBlockedReason(s)).toBeNull()
  })

  it('error-Aktivierung meldet die Fehlermeldung', () => {
    const s: PluginRuntimeState = {
      id: 'antares',
      installation: 'bundled',
      activation: 'error',
      readiness: 'unavailable',
      error: { message: 'Boom', at: '2026-06-27T00:00:00Z' },
    }
    expect(pluginBlockedReason(s)).toBe('Boom')
  })

  it('aktiv aber unkonfiguriert nennt den Konfig-Grund', () => {
    const s: PluginRuntimeState = {
      id: 'remarkable',
      installation: 'bundled',
      activation: 'active',
      readiness: 'needs-configuration',
    }
    expect(isPluginUsable(s)).toBe(false)
    expect(pluginBlockedReason(s)).toBe('Konfiguration erforderlich')
  })
})

describe('definePluginMain', () => {
  it('bindet die Capabilities und liefert einen Main-Entry', () => {
    const manifest = { id: 'antares', capabilities: ['http.fetch', 'secrets'] } as const
    let registered = false
    const entry = definePluginMain(manifest, ({ host, actions }) => {
      // Compile-Time: host.http + host.secrets sichtbar, host.vault NICHT.
      void host.log
      void host.http
      void host.secrets
      actions.register('antares.ping', async () => 'pong')
      registered = true
    })
    expect(entry.id).toBe('antares')
    // register mit einem Fake-Context aufrufen
    const calls: string[] = []
    entry.register({
      host: { log: () => {}, http: { fetch: async () => new Response() }, secrets: {} as never },
      actions: { register: (id: string) => calls.push(id) },
    } as never)
    expect(registered).toBe(true)
    expect(calls).toEqual(['antares.ping'])
  })
})
