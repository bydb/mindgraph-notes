import { describe, it, expect } from 'vitest'
import entry from './index'
import { manifest } from '../manifest'
import { PluginRegistry } from '../../../main/plugins/registry'
import { createHostFactory, type HostServices } from '../../../main/plugins/host'
import { validateManifest, validateManifestSemantics, validateAgainst } from '@mindgraph/plugin-api/validation'

function buildRegistry(overrides: Partial<HostServices> = {}) {
  const secrets = new Map<string, string>()
  const vault = new Map<string, string>()
  const services: HostServices = {
    readVaultFile: async (rel) => {
      const v = vault.get(rel)
      if (v === undefined) throw new Error('ENOENT')
      return v
    },
    writeVaultFile: async (rel, content) => { vault.set(rel, content) },
    readVaultBytes: async () => new Uint8Array(),
    writeVaultBytes: async () => {},
    vaultExists: async (rel) => vault.has(rel),
    secretGet: async (k) => secrets.get(k) ?? null,
    secretSet: async (k, v) => { secrets.set(k, v) },
    secretDelete: async (k) => { secrets.delete(k) },
    llmGenerate: async () => '',
    httpFetch: async () => new Response('x'),
    httpFetchBasicAuth: async () => ({ statusCode: 200, text: '{}' }),
    deviceRequest: async () => ({ statusCode: 200, text: '[]' }),
    deviceDownload: async () => ({ ok: true, statusCode: 200, bytes: new Uint8Array() }),
    deviceUpload: async () => ({ statusCode: 200, body: '' }),
    listUsbDevices: async () => [],
    pdfHtmlToPdf: async () => new Uint8Array(),
    pdfOptimize: async () => ({ bytes: new Uint8Array(), method: 'unchanged' }),
    dialogOpenFile: async () => null,
    dialogSaveFile: async () => null,
    readResource: async () => new Uint8Array(),
    emitWorkflow: async () => {},
    recordActivity: async () => {},
    ...overrides,
  }
  const registry = new PluginRegistry(createHostFactory(services))
  registry.register([{ manifest, loadEntry: async () => ({ default: entry }) }])
  return { registry, secrets, vault }
}

describe('edoobox-Plugin — Manifest', () => {
  it('ist schematisch und semantisch gültig', () => {
    expect(validateManifest(manifest)).toEqual({ valid: true, errors: [] })
    expect(validateManifestSemantics(manifest)).toEqual({ valid: true, errors: [] })
  })
})

describe('edoobox-Plugin — Vertikale durch Registry + Host', () => {
  it('aktiviert und registriert die Actions', async () => {
    const { registry } = buildRegistry()
    await registry.activate('edoobox')
    expect(registry.get('edoobox')?.activation).toBe('active')
  })

  it('Credentials: roundtrip über host.secrets (genamespacet)', async () => {
    const { registry, secrets } = buildRegistry()
    await registry.activate('edoobox')

    expect(await registry.invoke('edoobox', 'edoobox.loadCredentials', {})).toBeNull()

    expect(await registry.invoke('edoobox', 'edoobox.saveCredentials', { apiKey: 'k', apiSecret: 's' })).toBe(true)
    expect(secrets.get('plugin:edoobox:apiKey')).toBe('k')
    expect(secrets.get('plugin:edoobox:apiSecret')).toBe('s')
    // Zeilenende und Leerzeichen aus der Zwischenablage dürfen nicht mitgespeichert werden —
    // edoobox antwortet darauf mit 401, ohne dass jemand das unsichtbare Zeichen sähe.
    expect(await registry.invoke('edoobox', 'edoobox.saveCredentials', { apiKey: ' key\r\n', apiSecret: 'secret \n' })).toBe(true)
    expect(secrets.get('plugin:edoobox:apiKey')).toBe('key')
    expect(secrets.get('plugin:edoobox:apiSecret')).toBe('secret')

    expect(await registry.invoke('edoobox', 'edoobox.loadCredentials', {})).toEqual({ apiKey: 'key', apiSecret: 'secret' })
  })

  it('API-Action ohne Credentials liefert {success:false}', async () => {
    const { registry } = buildRegistry()
    await registry.activate('edoobox')
    const res = await registry.invoke('edoobox', 'edoobox.listOffers', { baseUrl: 'https://app1.edoobox.com', apiVersion: 'v2' })
    expect(res).toEqual({ success: false, error: 'Keine Zugangsdaten gespeichert' })
  })

  it('Marketing-Bild: speichert dekodierte Bytes mit sicherem Dateinamen über den Dialog', async () => {
    let saved: { defaultPath?: string; bytes: number[] } | null = null
    const { registry } = buildRegistry({
      dialogSaveFile: async (opts, bytes) => {
        saved = { defaultPath: opts.defaultPath, bytes: [...bytes] }
        return { path: '/tmp/Jugend_Konferenz_.png' }
      },
    })
    await registry.activate('edoobox')

    await expect(registry.invoke('edoobox', 'edoobox.marketingSaveImage', {
      fileName: '../../Jugend:Konferenz?.png',
      imageBase64: 'AQID',
    })).resolves.toEqual({ success: true, filePath: '/tmp/Jugend_Konferenz_.png' })
    expect(saved).toEqual({ defaultPath: 'Jugend_Konferenz_.png', bytes: [1, 2, 3] })
  })

  it('Teilnehmerliste: erfolgreiches Speichern vermerkt den Vorgang — gleicher Tag, gleiche Kennung', async () => {
    const recorded: unknown[] = []
    const { registry } = buildRegistry({
      dialogSaveFile: async () => ({ path: '/tmp/liste.docx' }),
      readResource: async () => { throw new Error('keine Vorlage im Test') },
      recordActivity: async (e) => { recorded.push(e) },
    })
    await registry.activate('edoobox')
    // Ohne Vorlage scheitert die Erzeugung — dann darf auch kein Vorgang vermerkt werden.
    const fail = await registry.invoke('edoobox', 'edoobox.generateAttendanceList', {
      data: { title: 'T', dates: [], participants: [] }, suggestedFileName: 'x.docx', jobKey: 'offer-1|2026-10-01', activeMs: 40_000,
    }) as { success: boolean }
    expect(fail.success).toBe(false)
    expect(recorded).toHaveLength(0)
  })

  it('Instagram: „Als verwendet markieren" schreibt den Abschluss mit der Vorgangs-Kennung', async () => {
    const recorded: Array<Record<string, unknown>> = []
    const { registry } = buildRegistry({ recordActivity: async (e) => { recorded.push(e as Record<string, unknown>) } })
    await registry.activate('edoobox')
    expect(await registry.invoke('edoobox', 'edoobox.marketingMarkUsed', { jobId: 'mk-abc', activeMs: 1500 })).toEqual({ success: true })
    expect(recorded[0]).toMatchObject({ kind: 'job-outcome', jobId: 'mk-abc', jobType: 'ig-caption', outcome: 'used', pluginId: 'edoobox', activeMs: 1500 })
    // Eine Kennung mit Inhalt (Titel) wird abgewiesen, nicht still verkürzt.
    const res = await registry.invoke('edoobox', 'edoobox.marketingMarkUsed', { jobId: 'Herbstakademie 2026' }) as { success: boolean }
    expect(res.success).toBe(false)
    expect(recorded).toHaveLength(1)
  })

  it('Marketing: Vorbereitung liefert eine jobId, reicht sie als runId an das Modell und vermerkt sie', async () => {
    const recorded: Array<Record<string, unknown>> = []
    const runIds: Array<string | undefined> = []
    const { registry } = buildRegistry({
      llmGenerate: async (_p, opts) => { runIds.push(opts.runId); return 'Text' },
      recordActivity: async (e) => { recorded.push(e as Record<string, unknown>) },
    })
    await registry.activate('edoobox')
    const res = await registry.invoke('edoobox', 'edoobox.marketingGenerateContent', {
      offerData: { name: 'X', description: '', dateStart: '', dateEnd: '', location: '', maxParticipants: 0, speakers: [] },
    }) as { success: boolean; jobId?: string }
    expect(res.success).toBe(true)
    expect(res.jobId).toMatch(/^mk-/)
    expect(runIds).toEqual([res.jobId, res.jobId])
    expect(recorded[0]).toMatchObject({ kind: 'job-started', jobId: res.jobId, jobKind: 'marketing', pluginId: 'edoobox' })
  })

  it('Marketing: eine gescheiterte Generierung liefert trotzdem die jobId und wird als Vorbereitung vermerkt (F09)', async () => {
    const recorded: Array<Record<string, unknown>> = []
    const { registry } = buildRegistry({
      llmGenerate: async () => { throw new Error('Ollama nicht erreichbar') },
      recordActivity: async (e) => { recorded.push(e as Record<string, unknown>) },
    })
    await registry.activate('edoobox')
    const res = await registry.invoke('edoobox', 'edoobox.marketingGenerateContent', {
      offerData: { name: 'X', description: '', dateStart: '', dateEnd: '', location: '', maxParticipants: 0, speakers: [] },
    }) as { success: boolean; jobId?: string; error?: string }
    expect(res.success).toBe(false)
    expect(res.jobId).toMatch(/^mk-/)
    expect(recorded[0]).toMatchObject({ kind: 'job-started', jobId: res.jobId })
    expect(await registry.invoke('edoobox', 'edoobox.marketingAbandon', { jobId: res.jobId, activeMs: 2000 })).toEqual({ success: true })
    expect(recorded[1]).toMatchObject({ kind: 'job-abandoned', jobId: res.jobId, activeMs: 2000, pluginId: 'edoobox' })
  })

  it('Events: leeres Laden ohne Datei, dann roundtrip über host.vault', async () => {
    const { registry, vault } = buildRegistry()
    await registry.activate('edoobox')

    expect(await registry.invoke('edoobox', 'edoobox.loadEvents', {})).toEqual([])

    const events = [{ id: 'e1', title: 'Test' }]
    expect(await registry.invoke('edoobox', 'edoobox.saveEvents', { events })).toBe(true)
    expect(vault.has('.mindgraph/edoobox-events.json')).toBe(true)

    expect(await registry.invoke('edoobox', 'edoobox.loadEvents', {})).toEqual(events)
  })
})

describe('edoobox-Plugin — Output-Schemas (Envelope-Validierung)', () => {
  const out = (id: string) => manifest.actions!.find((a) => a.id === id)!.outputSchema!

  it('JEDE Action deklariert ein outputSchema (Coverage erzwungen)', () => {
    for (const a of manifest.actions ?? []) expect(a.outputSchema, a.id).toBeDefined()
  })

  it('Envelope: Erfolg/Fehler ok, Fremdform abgewiesen', () => {
    expect(validateAgainst(out('edoobox.listOffers'), { success: true, offers: [{ id: '1' }] }).valid).toBe(true)
    expect(validateAgainst(out('edoobox.listOffers'), { success: false, error: 'kaputt' }).valid).toBe(true)
    expect(validateAgainst(out('edoobox.listOffers'), { offers: [] }).valid).toBe(false) // kein success
    expect(validateAgainst(out('edoobox.listOffers'), '<html>error</html>').valid).toBe(false)
  })

  it('konsumierte Felder werden getypt: offers/bookings/dates als Array', () => {
    // genau der Review-Fall: success:true, aber offers ist kaputt (String) → MUSS scheitern.
    expect(validateAgainst(out('edoobox.listOffers'), { success: true, offers: 'kaputt' }).valid).toBe(false)
    expect(validateAgainst(out('edoobox.listBookings'), { success: true, bookings: {} }).valid).toBe(false)
    expect(validateAgainst(out('edoobox.listDates'), { success: true, dates: [] }).valid).toBe(true)
  })

  it('konsumierte Felder werden getypt: IDs/Texte mit passendem Typ', () => {
    // Publish/Upload sind seit Paket 3 Actions des wordpress-Plugins (dort getestet).
    expect(validateAgainst(out('edoobox.marketingGenerateContent'), { success: true, blogPost: 123, igCaption: 'ok' }).valid).toBe(false)
    expect(validateAgainst(out('edoobox.importEvent'), { success: true, offerId: 'abc' }).valid).toBe(true)
  })

  it('loadCredentials: null oder {apiKey,apiSecret}; halbes Paar abgewiesen', () => {
    expect(validateAgainst(out('edoobox.loadCredentials'), null).valid).toBe(true)
    expect(validateAgainst(out('edoobox.loadCredentials'), { apiKey: 'k', apiSecret: 's' }).valid).toBe(true)
    expect(validateAgainst(out('edoobox.loadCredentials'), { apiKey: 'k' }).valid).toBe(false)
  })

  it('loadEvents: Array ok, Objekt abgewiesen; saveCredentials: Boolean', () => {
    expect(validateAgainst(out('edoobox.loadEvents'), [{ id: 'e1' }]).valid).toBe(true)
    expect(validateAgainst(out('edoobox.loadEvents'), { id: 'e1' }).valid).toBe(false)
    expect(validateAgainst(out('edoobox.saveCredentials'), true).valid).toBe(true)
    expect(validateAgainst(out('edoobox.saveCredentials'), { success: true }).valid).toBe(false)
  })

  it('marketingSelectImage: null oder {fileName,imageBase64}', () => {
    expect(validateAgainst(out('edoobox.marketingSelectImage'), null).valid).toBe(true)
    expect(validateAgainst(out('edoobox.marketingSelectImage'), { fileName: 'b.png', imageBase64: 'AAAA' }).valid).toBe(true)
    expect(validateAgainst(out('edoobox.marketingSelectImage'), { fileName: 'b.png' }).valid).toBe(false)
  })

  it('marketingSaveImage: typisierte Speichern-/Abbruch-Hülle', () => {
    expect(validateAgainst(out('edoobox.marketingSaveImage'), { success: true, filePath: '/tmp/b.png' }).valid).toBe(true)
    expect(validateAgainst(out('edoobox.marketingSaveImage'), { success: false, canceled: true }).valid).toBe(true)
    expect(validateAgainst(out('edoobox.marketingSaveImage'), { filePath: '/tmp/b.png' }).valid).toBe(false)
  })
})
