import { describe, it, expect } from 'vitest'
import {
  validateManifest,
  validateManifestSemantics,
  validateAgainst,
  isApiCompatible,
  isAppCompatible,
} from './validation'
import { API_VERSION } from './version'
import { definePluginMain } from './entry'
import type { PluginManifest } from './manifest'

// Vertrags-Tests des Pakets: Manifest-Validierung + Kompat-Gate + definePluginMain. Bewusst nur
// gegen die eigene Surface (./validation, ./entry, ./manifest, ./version) — kein Import aus
// app/src. Das ist zugleich der Beleg, dass der Vertrag eigenständig testbar ist.

const validManifest: PluginManifest = {
  manifestVersion: 2,
  id: 'antares',
  version: '1.0.0',
  label: 'Antares Medienzentrum',
  description: 'Verleih-Dashboard',
  category: 'business',
  apiVersion: '^0.2.0',
  minAppVersion: '0.8.14',
  author: { name: 'Jochen Leeder', url: 'https://mindgraph-notes.de' },
  entrypoints: { main: 'main.js', renderer: 'renderer.js' },
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

describe('validateManifest — v2-Schema (strikt)', () => {
  it('verlangt manifestVersion: 2', () => {
    const { manifestVersion: _omit, ...noVersion } = validManifest
    expect(validateManifest(noVersion).valid).toBe(false)
    expect(validateManifest({ ...validManifest, manifestVersion: 1 }).valid).toBe(false)
  })

  it('verlangt die v2-Pflichtfelder apiVersion/minAppVersion/author/entrypoints', () => {
    for (const field of ['apiVersion', 'minAppVersion', 'author', 'entrypoints'] as const) {
      const { [field]: _drop, ...without } = validManifest
      expect(validateManifest(without).valid, field).toBe(false)
    }
  })

  it('author muss ein Objekt mit name sein', () => {
    expect(validateManifest({ ...validManifest, author: 'Jochen' }).valid).toBe(false)
    expect(validateManifest({ ...validManifest, author: {} }).valid).toBe(false)
    expect(validateManifest({ ...validManifest, author: { name: 'J', github: 'x' } }).valid).toBe(false)
  })

  it('entrypoints verlangt main ODER renderer (at-least-one)', () => {
    expect(validateManifest({ ...validManifest, entrypoints: {} }).valid).toBe(false)
    expect(validateManifest({ ...validManifest, entrypoints: { styles: 'x.css' } }).valid).toBe(false)
    expect(validateManifest({ ...validManifest, entrypoints: { main: 'main.js' } }).valid).toBe(true)
    expect(validateManifest({ ...validManifest, entrypoints: { renderer: 'r.js' } }).valid).toBe(true)
  })

  it('lehnt absolute Pfade, URLs und führendes .. in entrypoints ab (ajv-Form)', () => {
    expect(validateManifest({ ...validManifest, entrypoints: { main: '/abs/main.js' } }).valid).toBe(false)
    expect(validateManifest({ ...validManifest, entrypoints: { main: 'https://x/main.js' } }).valid).toBe(false)
    expect(validateManifest({ ...validManifest, entrypoints: { main: '../main.js' } }).valid).toBe(false)
  })

  it('erzwingt Artefakt-Endungen: main/renderer = .js, styles = .css', () => {
    expect(validateManifest({ ...validManifest, entrypoints: { main: 'main.css' } }).valid).toBe(false)
    expect(validateManifest({ ...validManifest, entrypoints: { renderer: 'renderer.tsx' } }).valid).toBe(false)
    expect(validateManifest({ ...validManifest, entrypoints: { main: 'main.ts' } }).valid).toBe(false)
    expect(validateManifest({
      ...validManifest, entrypoints: { main: 'main.js', styles: 'styles.js' },
    }).valid).toBe(false)
    expect(validateManifest({
      ...validManifest, entrypoints: { main: 'dist/main.js', renderer: 'dist/renderer.js', styles: 'dist/styles.css' },
    }).valid).toBe(true)
  })

  it('validiert author.email per ajv-Format', () => {
    expect(validateManifest({ ...validManifest, author: { name: 'J', email: 'kein-email' } }).valid).toBe(false)
    expect(validateManifest({ ...validManifest, author: { name: 'J', email: 'j@example.com' } }).valid).toBe(true)
  })
})

describe('validateManifestSemantics — SemVer/URL/Pfad', () => {
  it('lehnt ungültige version/minAppVersion (kein SemVer) ab', () => {
    expect(validateManifestSemantics({ ...validManifest, version: 'abc' }).valid).toBe(false)
    expect(validateManifestSemantics({ ...validManifest, minAppVersion: 'x.y' }).valid).toBe(false)
  })

  it('lehnt eine ungültige apiVersion-Range ab', () => {
    expect(validateManifestSemantics({ ...validManifest, apiVersion: 'nope' }).valid).toBe(false)
  })

  it('lehnt eine kaputte repo-URL ab, akzeptiert eine echte http(s)-URL', () => {
    expect(validateManifestSemantics({ ...validManifest, repo: 'not a url' }).valid).toBe(false)
    expect(validateManifestSemantics({ ...validManifest, repo: 'ftp://x/y' }).valid).toBe(false)
    expect(validateManifestSemantics({ ...validManifest, repo: 'https://github.com/x/y' }).valid).toBe(true)
  })

  it('lehnt eine nicht-http(s) author.url ab (z.B. javascript:)', () => {
    const js = { ...validManifest, author: { name: 'J', url: 'javascript:alert(1)' } }
    expect(validateManifestSemantics(js).valid).toBe(false)
    const ok = { ...validManifest, author: { name: 'J', url: 'https://example.com' } }
    expect(validateManifestSemantics(ok).valid).toBe(true)
  })

  it('fängt ein ..-Segment irgendwo im Entry-Pfad', () => {
    const r = validateManifestSemantics({ ...validManifest, entrypoints: { main: 'a/../b.js' } })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('..'))).toBe(true)
  })
})

describe('Kompatibilitäts-Gate', () => {
  it('isApiCompatible: erfüllte Range ok', () => {
    expect(isApiCompatible(`^${API_VERSION}`).compatible).toBe(true)
  })

  it('isApiCompatible: nicht erfüllte Range ⇒ incompatible-api', () => {
    const r = isApiCompatible('^9.9.9')
    expect(r.compatible).toBe(false)
    expect(r.kind).toBe('incompatible-api')
  })

  it('isApiCompatible: ungültige Range ⇒ manifest-invalid', () => {
    expect(isApiCompatible('keine-range').kind).toBe('manifest-invalid')
  })

  it('isAppCompatible: App neu genug ok; zu alte App ⇒ incompatible-app', () => {
    expect(isAppCompatible('0.8.0', '0.8.14').compatible).toBe(true)
    const r = isAppCompatible('999.0.0', '0.8.14')
    expect(r.compatible).toBe(false)
    expect(r.kind).toBe('incompatible-app')
  })

  it('isAppCompatible: ungültige minAppVersion ⇒ manifest-invalid', () => {
    expect(isAppCompatible('x.y.z', '0.8.14').kind).toBe('manifest-invalid')
  })

  it('isAppCompatible: unlesbare App-Version ⇒ fail-closed (incompatible-app)', () => {
    const r = isAppCompatible('0.8.0', 'unbekannt')
    expect(r.compatible).toBe(false)
    expect(r.kind).toBe('incompatible-app')
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

describe('validateManifestSemantics — Widget-Provider-Vertrag (Renderer-Spike §4)', () => {
  const withWidget = (over: Record<string, unknown>): PluginManifest => ({
    ...validManifest,
    actions: [{ id: 'antares.widgetData', requiredCapabilities: [], widgetProvider: true, isWrite: false, ...over }],
    ui: { dashboardWidget: { slot: 'dashboard.widget', fromAction: 'antares.widgetData' } },
  })

  it('akzeptiert eine fromAction mit widgetProvider:true UND isWrite:false', () => {
    expect(validateManifestSemantics(withWidget({})).valid).toBe(true)
  })

  it('lehnt ab, wenn die fromAction-Action nicht existiert', () => {
    const m: PluginManifest = { ...validManifest, ui: { dashboardWidget: { slot: 'dashboard.widget', fromAction: 'ghost' } } }
    const r = validateManifestSemantics(m)
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toContain('ghost')
  })

  it('lehnt ab, wenn widgetProvider fehlt/false', () => {
    expect(validateManifestSemantics(withWidget({ widgetProvider: false })).valid).toBe(false)
    expect(validateManifestSemantics(withWidget({ widgetProvider: undefined })).valid).toBe(false)
  })

  it('lehnt ab, wenn isWrite:true (nicht nebenwirkungsfrei)', () => {
    expect(validateManifestSemantics(withWidget({ isWrite: true })).valid).toBe(false)
  })

  it('ohne ui-Widget ist nichts zu prüfen', () => {
    expect(validateManifestSemantics(validManifest).valid).toBe(true)
  })
})
