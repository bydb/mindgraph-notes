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
  it('aktiviert: mintet instanceId + monotone generation; Descriptor ist byte-frei', () => {
    const rt = seqRuntime()
    const desc = rt.activate(activation())
    expect(desc.rendererInstanceId).toBe('iid-1')
    expect(desc.fileEditors).toEqual([{ editorId: 'draw', extensions: ['.excalidraw'] }])
    expect(desc).not.toHaveProperty('payload')

    const entry = rt.getByPluginId('excalidraw')!
    expect(entry.generation).toBe(1)
    expect(entry.payload.code.toString('utf8')).toBe('export default {}')
  })

  it('löst instanceId→Eintrag auf (plugin:host-Scoping)', () => {
    const rt = seqRuntime()
    rt.activate(activation())
    expect(rt.getByInstanceId('iid-1')?.pluginId).toBe('excalidraw')
    expect(rt.getByInstanceId('unbekannt')).toBeUndefined()
    expect(rt.getByInstanceId(42 as unknown)).toBeUndefined()
  })

  it('re-aktivieren ersetzt atomar — alte instanceId wird ungültig, generation steigt', () => {
    const rt = seqRuntime()
    rt.activate(activation({ version: '0.1.0' }))
    rt.activate(activation({ version: '0.2.0', payload: payload('v2') }))

    expect(rt.getByInstanceId('iid-1')).toBeUndefined() // alte Instanz tot
    const entry = rt.getByInstanceId('iid-2')!
    expect(entry.version).toBe('0.2.0')
    expect(entry.generation).toBe(2)
    expect(rt.getByPluginId('excalidraw')?.payload.code.toString('utf8')).toBe('v2')
  })

  it('deactivate entfernt Plugin- UND Instanz-Eintrag', () => {
    const rt = seqRuntime()
    rt.activate(activation())
    rt.deactivate('excalidraw')
    expect(rt.getByPluginId('excalidraw')).toBeUndefined()
    expect(rt.getByInstanceId('iid-1')).toBeUndefined()
    expect(rt.list()).toEqual([])
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
