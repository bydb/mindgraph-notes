import { describe, it, expect } from 'vitest'
import entry from './index'
import { manifest } from '../manifest'
import { PluginRegistry } from '../../../main/plugins/registry'
import { createHostFactory, type HostServices } from '../../../main/plugins/host'
import { validateManifest, validateManifestSemantics } from '../../../shared/plugins/schemas'

function buildRegistry(over: Partial<HostServices> = {}) {
  const vault = new Map<string, Uint8Array>()
  const services: HostServices = {
    readVaultFile: async () => '',
    writeVaultFile: async () => {},
    readVaultBytes: async (rel) => vault.get(rel) ?? new Uint8Array(),
    writeVaultBytes: async (rel, bytes) => { vault.set(rel, bytes) },
    vaultExists: async (rel) => vault.has(rel),
    secretGet: async () => null,
    secretSet: async () => {},
    secretDelete: async () => {},
    llmGenerate: async () => '',
    httpFetch: async () => new Response('x'),
    deviceRequest: async () => ({ statusCode: 200, text: '[]' }),
    deviceDownload: async () => ({ ok: true, statusCode: 200, bytes: new Uint8Array([1, 2, 3]) }),
    deviceUpload: async () => ({ statusCode: 200, body: '' }),
    listUsbDevices: async () => [],
    pdfHtmlToPdf: async () => new Uint8Array([9, 9]),
    pdfOptimize: async () => ({ bytes: new Uint8Array([7]), method: 'ghostscript' }),
    dialogOpenFile: async () => null,
    dialogSaveFile: async () => null,
    readResource: async () => new Uint8Array(),
    emitWorkflow: async () => {},
    ...over,
  }
  const registry = new PluginRegistry(createHostFactory(services))
  registry.register([{ manifest, loadEntry: async () => ({ default: entry }) }])
  return { registry, vault }
}

describe('reMarkable-Plugin — Manifest', () => {
  it('ist schematisch und semantisch gültig', () => {
    expect(validateManifest(manifest)).toEqual({ valid: true, errors: [] })
    expect(validateManifestSemantics(manifest)).toEqual({ valid: true, errors: [] })
  })
})

describe('reMarkable-Plugin — Vertikale durch Registry + Host', () => {
  it('aktiviert und registriert die Actions', async () => {
    const { registry } = buildRegistry()
    await registry.activate('remarkable')
    expect(registry.get('remarkable')?.activation).toBe('active')
  })

  it('usbCheck routet durch host.device (200 → connected)', async () => {
    const { registry } = buildRegistry()
    await registry.activate('remarkable')
    expect(await registry.invoke('remarkable', 'remarkable.usbCheck', {})).toEqual({
      connected: true,
      mode: 'usb',
    })
  })

  it('download schreibt Geräte-Bytes binär in den Vault', async () => {
    const { registry, vault } = buildRegistry()
    await registry.activate('remarkable')
    const res = (await registry.invoke('remarkable', 'remarkable.download', {
      id: 'abcdef1234',
      name: 'Mein Heft',
    })) as { success: boolean; relativePdfPath: string; alreadyExists: boolean }
    expect(res.success).toBe(true)
    expect(res.relativePdfPath).toBe('reMarkable/pdf/Mein-Heft-abcdef12.pdf')
    expect(res.alreadyExists).toBe(false)
    expect(vault.get('reMarkable/pdf/Mein-Heft-abcdef12.pdf')).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('optimize liest Vault-Bytes, routet durch host.pdf, schreibt das Ergebnis', async () => {
    const { registry, vault } = buildRegistry()
    await registry.activate('remarkable')
    vault.set('reMarkable/pdf/doc.pdf', new Uint8Array([5, 5, 5, 5]))
    const res = (await registry.invoke('remarkable', 'remarkable.optimize', {
      relativePdfPath: 'reMarkable/pdf/doc.pdf',
    })) as { success: boolean; relativePdfPath: string; method: string; originalSize: number; optimizedSize: number }
    expect(res).toMatchObject({
      success: true,
      relativePdfPath: 'reMarkable/pdf/doc.remarkable.pdf',
      method: 'ghostscript',
      originalSize: 4,
      optimizedSize: 1,
    })
    expect(vault.get('reMarkable/pdf/doc.remarkable.pdf')).toEqual(new Uint8Array([7]))
  })

  it('upload ohne .pdf-Endung wird kontrolliert abgelehnt', async () => {
    const { registry } = buildRegistry()
    await registry.activate('remarkable')
    const res = (await registry.invoke('remarkable', 'remarkable.upload', {
      relativePdfPath: 'notes/foo.txt',
    })) as { success: boolean; error?: string }
    expect(res.success).toBe(false)
  })
})
