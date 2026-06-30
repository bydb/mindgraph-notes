import { describe, it, expect } from 'vitest'
import { RendererRuntime, type RendererActivation } from './rendererRuntime'

const payload = (code: string) => ({ code: Buffer.from(code, 'utf8'), hash: 'h-' + code })

const activation = (over: Partial<RendererActivation> = {}): RendererActivation => ({
  pluginId: 'excalidraw',
  pluginLabel: 'Excalidraw',
  version: '0.1.0',
  payload: payload('export default {}'),
  fileEditors: [{ editorId: 'draw', extensions: ['.excalidraw'] }],
  ...over,
})

/** Deterministische instanceId-Folge für stabile Assertions. */
function seqRuntime() {
  let n = 0
  return new RendererRuntime(() => `iid-${++n}`)
}

describe('RendererRuntime', () => {
  it('aktiviert: mintet instanceId; Descriptor + Serve sind konsistent, byte-frei im Descriptor', () => {
    const rt = seqRuntime()
    const desc = rt.activate(activation())
    expect(desc.rendererInstanceId).toBe('iid-1')
    expect(desc.fileEditors).toEqual([{ editorId: 'draw', extensions: ['.excalidraw'] }])
    expect(desc).not.toHaveProperty('payload')

    const serve = rt.servePayload('excalidraw')!
    expect(serve.rendererInstanceId).toBe('iid-1')
    expect(serve.code).toBe('export default {}')
  })

  it('löst instanceId→Metadaten auf (plugin:host-Scoping), ohne Bytes', () => {
    const rt = seqRuntime()
    rt.activate(activation())
    expect(rt.resolveInstance('iid-1')?.pluginId).toBe('excalidraw')
    expect(rt.resolveInstance('iid-1')).not.toHaveProperty('payload')
    expect(rt.resolveInstance('unbekannt')).toBeUndefined()
    expect(rt.resolveInstance(42)).toBeUndefined()
  })

  it('re-aktivieren ersetzt atomar — alte instanceId tot, generation steigt', () => {
    const rt = seqRuntime()
    rt.activate(activation({ version: '0.1.0' }))
    rt.activate(activation({ version: '0.2.0', payload: payload('v2') }))

    expect(rt.resolveInstance('iid-1')).toBeUndefined() // alte Instanz tot
    expect(rt.resolveInstance('iid-2')?.version).toBe('0.2.0')
    expect(rt.resolveInstance('iid-2')?.generation).toBe(2)
    expect(rt.servePayload('excalidraw')?.code).toBe('v2')
  })

  it('deactivate entfernt Plugin- UND Instanz-Eintrag', () => {
    const rt = seqRuntime()
    rt.activate(activation())
    rt.deactivate('excalidraw')
    expect(rt.servePayload('excalidraw')).toBeUndefined()
    expect(rt.resolveInstance('iid-1')).toBeUndefined()
    expect(rt.list()).toEqual([])
  })

  // R1-impl-F03: das Modul bleibt Eigentümer der Bytes.
  it('Mutation von Eingabe oder Rückgabe ändert die Serve-Bytes NICHT', () => {
    const rt = seqRuntime()
    const input = activation()
    rt.activate(input)
    // Eingabe nach activate mutieren …
    input.fileEditors[0].extensions.push('.evil')
    input.payload.code.fill(0)
    // … Rückgabe von servePayload mutieren …
    const serve = rt.servePayload('excalidraw')!
    serve.fileEditors[0].extensions.push('.evil2')
    // → der nächste Serve liefert unverändert die verifizierten Bytes + Original-Endungen.
    const fresh = rt.servePayload('excalidraw')!
    expect(fresh.code).toBe('export default {}')
    expect(fresh.fileEditors).toEqual([{ editorId: 'draw', extensions: ['.excalidraw'] }])
  })

  it('ID-Kollisions-Guard mintet eine freie ID', () => {
    let n = 0
    // mintId liefert zweimal dieselbe ID, dann eine neue → activate#2 muss die Kollision umgehen.
    const ids = ['dup', 'dup', 'fresh']
    const rt = new RendererRuntime(() => ids[Math.min(n++, ids.length - 1)])
    rt.activate(activation({ pluginId: 'a' }))
    rt.activate(activation({ pluginId: 'b' }))
    expect(rt.resolveInstance('dup')?.pluginId).toBe('a')
    expect(rt.resolveInstance('fresh')?.pluginId).toBe('b')
  })

  describe('syncActive', () => {
    it('behält instanceId bei unveränderter Version+hash (kein Reload-Churn)', () => {
      const rt = seqRuntime()
      rt.syncActive([activation({ pluginId: 'a' })])
      const before = rt.servePayload('a')!.rendererInstanceId
      const r = rt.syncActive([activation({ pluginId: 'a' }), activation({ pluginId: 'b' })])
      expect(rt.servePayload('a')!.rendererInstanceId).toBe(before)
      expect(r.changed).toBe(true) // 'b' ist neu
    })

    it('re-aktiviert bei geänderter Version (neue instanceId)', () => {
      const rt = seqRuntime()
      rt.syncActive([activation({ pluginId: 'a', version: '0.1.0' })])
      const before = rt.servePayload('a')!.rendererInstanceId
      const r = rt.syncActive([activation({ pluginId: 'a', version: '0.2.0', payload: payload('v2') })])
      expect(rt.servePayload('a')!.rendererInstanceId).not.toBe(before)
      expect(r.changed).toBe(true)
    })

    it('deaktiviert entfernte Plugins; meldet changed=false bei Identität', () => {
      const rt = seqRuntime()
      rt.syncActive([activation({ pluginId: 'a' }), activation({ pluginId: 'b' })])
      const r1 = rt.syncActive([activation({ pluginId: 'a' })])
      expect(r1.changed).toBe(true) // 'b' entfernt
      expect(rt.servePayload('b')).toBeUndefined()
      const r2 = rt.syncActive([activation({ pluginId: 'a' })])
      expect(r2.changed).toBe(false) // nichts geändert
    })
  })

  it('list liefert byte-freie Descriptoren je aktivem Plugin', () => {
    const rt = seqRuntime()
    rt.activate(activation({ pluginId: 'a', pluginLabel: 'A' }))
    rt.activate(activation({ pluginId: 'b', pluginLabel: 'B' }))
    const list = rt.list()
    expect(list.map((d) => d.pluginId).sort()).toEqual(['a', 'b'])
    expect(list.every((d) => !('payload' in d))).toBe(true)
  })
})
