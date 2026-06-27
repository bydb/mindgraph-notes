import { describe, it, expect } from 'vitest'
import entry from './index'
import { manifest } from '../manifest'
import { PluginRegistry } from '../../../main/plugins/registry'
import { createHostFactory, type HostServices } from '../../../main/plugins/host'
import { validateManifest, validateManifestSemantics } from '../../../shared/plugins/schemas'

function buildRegistry() {
  const secrets = new Map<string, string>()
  const services: HostServices = {
    readVaultFile: async () => '',
    writeVaultFile: async () => {},
    secretGet: async (k) => secrets.get(k) ?? null,
    secretSet: async (k, v) => { secrets.set(k, v) },
    secretDelete: async (k) => { secrets.delete(k) },
    llmGenerate: async () => '',
    httpFetch: async () => new Response('x'),
    emitWorkflow: async () => {},
  }
  const registry = new PluginRegistry(createHostFactory(services))
  registry.register([{ manifest, loadEntry: async () => ({ default: entry }) }])
  return { registry, secrets }
}

describe('Antares-Plugin — Manifest', () => {
  it('ist schematisch und semantisch gültig', () => {
    expect(validateManifest(manifest)).toEqual({ valid: true, errors: [] })
    expect(validateManifestSemantics(manifest)).toEqual({ valid: true, errors: [] })
  })
})

describe('Antares-Plugin — Vertikale durch Registry + Host', () => {
  it('aktiviert und registriert die Actions', async () => {
    const { registry } = buildRegistry()
    await registry.activate('antares')
    expect(registry.get('antares')?.activation).toBe('active')
  })

  it('Credentials: roundtrip über host.secrets (genamespacet)', async () => {
    const { registry, secrets } = buildRegistry()
    await registry.activate('antares')

    expect(await registry.invoke('antares', 'antares.loadCredentials', {})).toBeNull()

    expect(await registry.invoke('antares', 'antares.saveCredentials', { username: 'u', password: 'p' })).toBe(true)
    expect(secrets.get('plugin:antares:username')).toBe('u')
    expect(secrets.get('plugin:antares:password')).toBe('p')

    expect(await registry.invoke('antares', 'antares.loadCredentials', {})).toEqual({ username: 'u', password: 'p' })
  })

  it('Daten-Action ohne Credentials wirft kontrolliert', async () => {
    const { registry } = buildRegistry()
    await registry.activate('antares')
    await expect(
      registry.invoke('antares', 'antares.dashboardCounts', { baseUrl: 'https://mz.datenbank-bildungsmedien.net', context: 'HE/16' })
    ).rejects.toThrow(/Zugangsdaten/)
  })
})
