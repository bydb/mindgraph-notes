import { describe, it, expect } from 'vitest'
import {
  initialPluginState,
  isPluginUsable,
  isPluginInvokable,
  pluginBlockedReason,
  type PluginRuntimeState,
} from './state'
import { readBoolPath, isPluginGateEnabled } from './moduleGate'
import type { PluginManifest } from '@mindgraph/plugin-api'

// App-interne Tests: Lebenszyklus-State + Modulschalter-Gate. Die Vertrags-Tests
// (Manifest-Validierung, definePluginMain) leben jetzt im Paket (contract.test.ts).

const validManifest: PluginManifest = {
  manifestVersion: 2,
  id: 'antares',
  version: '1.0.0',
  label: 'Antares Medienzentrum',
  description: 'Verleih-Dashboard',
  category: 'business',
  apiVersion: '^0.2.0',
  minAppVersion: '0.0.0',
  author: { name: 'Test' },
  entrypoints: { main: 'main.js' },
  capabilities: ['http.fetch', 'secrets'],
  module: { enabledPath: 'pluginConfig.antares.enabled', legacyEnabledPath: 'antares.enabled' },
  http: { allowedHosts: ['antares.example.net'] },
  actions: [
    { id: 'antares.listMahnungen', requiredCapabilities: ['http.fetch'] },
  ],
}

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
    // …darf aber INVOKABLE bleiben: needs-configuration ist ein UX-Signal, kein Invoke-Gate
    // (sonst wäre saveCredentials gesperrt). isPluginUsable bleibt für die „bereit"-Anzeige.
    expect(isPluginInvokable(s)).toBe(true)
  })

  it('isPluginInvokable verlangt nur active (nicht ready), blockt aber disabled/error', () => {
    const base = { id: 'x', installation: 'bundled' as const }
    expect(isPluginInvokable({ ...base, activation: 'active', readiness: 'ready' })).toBe(true)
    expect(isPluginInvokable({ ...base, activation: 'active', readiness: 'needs-configuration' })).toBe(true)
    expect(isPluginInvokable({ ...base, activation: 'disabled', readiness: 'unavailable' })).toBe(false)
    expect(isPluginInvokable({ ...base, activation: 'error', readiness: 'unavailable' })).toBe(false)
  })
})

describe('moduleGate (A-pre Schritt 1)', () => {
  it('readBoolPath liest verschachtelte Flags und ist null-sicher', () => {
    expect(readBoolPath({ antares: { enabled: true } }, 'antares.enabled')).toBe(true)
    expect(readBoolPath({ antares: { enabled: false } }, 'antares.enabled')).toBe(false)
    expect(readBoolPath({}, 'antares.enabled')).toBe(false)
    expect(readBoolPath(null, 'antares.enabled')).toBe(false)
  })

  it('isPluginGateEnabled: gegatete Plugins folgen dem Flag, ungegatete sind immer aktiv', () => {
    // Antares liest seit 3b den generischen Pfad pluginConfig.antares.enabled …
    expect(isPluginGateEnabled(validManifest, { pluginConfig: { antares: { enabled: true } } })).toBe(true)
    expect(isPluginGateEnabled(validManifest, { pluginConfig: { antares: { enabled: false } } })).toBe(false)
    expect(isPluginGateEnabled(validManifest, {})).toBe(false)
    // … plus Legacy-Fallback (Top-Level antares) für den EINEN Start vor der Renderer-Migration.
    expect(isPluginGateEnabled(validManifest, { antares: { enabled: true } })).toBe(true)
    expect(isPluginGateEnabled(validManifest, { antares: { enabled: false } })).toBe(false)
    // edoobox wird vom Bundle-Modul 'mz-suite' über edoobox.enabled gesteuert
    const edoobox = { ...validManifest, id: 'edoobox', module: { enabledPath: 'edoobox.enabled' } }
    expect(isPluginGateEnabled(edoobox, { edoobox: { enabled: true } })).toBe(true)
    // demo hat kein Gate → immer aktiv
    expect(isPluginGateEnabled({ ...validManifest, id: 'demo', module: undefined }, {})).toBe(true)
  })
})
