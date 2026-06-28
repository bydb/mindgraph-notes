import { describe, it, expect } from 'vitest'
import { validateManifest, validateManifestSemantics, validateAgainst } from './validation'
import { definePluginMain } from './entry'
import type { PluginManifest } from './manifest'

// Vertrags-Tests des Pakets: Manifest-Validierung + definePluginMain. Bewusst nur gegen
// die eigene Surface (./validation, ./entry, ./manifest) — kein Import aus app/src. Das ist
// zugleich der Beleg, dass der Vertrag eigenständig testbar ist (Standalone-Compile/-Test).

const validManifest: PluginManifest = {
  id: 'antares',
  version: '1.0.0',
  label: 'Antares Medienzentrum',
  description: 'Verleih-Dashboard',
  category: 'business',
  capabilities: ['http.fetch', 'secrets'],
  module: { enabledPath: 'pluginConfig.antares.enabled', legacyEnabledPath: 'antares.enabled' },
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

  it('lehnt unbekannte Top-Level-Felder ab (Tippfehler-Schutz)', () => {
    const r = validateManifest({ ...validManifest, capabilites: ['secrets'] })
    expect(r.valid).toBe(false)
  })

  it('lehnt unbekannte Action-Felder ab (z.B. outputShema-Tippfehler)', () => {
    const r = validateManifest({
      ...validManifest,
      actions: [{ id: 'antares.x', requiredCapabilities: ['http.fetch'], outputShema: { type: 'object' } }],
    })
    expect(r.valid).toBe(false)
  })

  it('lehnt unsichere oder malformed Modul-Pfade ab', () => {
    expect(validateManifest({
      ...validManifest,
      module: { enabledPath: '__proto__.enabled' },
    }).valid).toBe(false)
    expect(validateManifest({
      ...validManifest,
      module: { enabledPath: 'enabled' },
    }).valid).toBe(false)
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

  it('fängt doppelte Action-IDs', () => {
    const bad: PluginManifest = {
      ...validManifest,
      actions: [
        { id: 'antares.dup', requiredCapabilities: ['http.fetch'] },
        { id: 'antares.dup', requiredCapabilities: ['secrets'] },
      ],
    }
    const r = validateManifestSemantics(bad)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes("Doppelte Action-ID 'antares.dup'"))).toBe(true)
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
