import { describe, expect, it } from 'vitest'
import { prepareChatImageRequest } from './chatImageRequest'
import { LocalModelError } from '../rag/localModel'

function jpegB64(width: number, height: number): string {
  const seg = (m: number, p: number[]) => [0xff, m, (p.length + 2) >> 8, (p.length + 2) & 0xff, ...p]
  const bytes = [0xff, 0xd8, ...seg(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]), 0xff, 0xda, 0, 2, 0xff, 0xd9]
  return btoa(String.fromCharCode(...bytes))
}

const img = { id: 'b1', dataBase64: jpegB64(1600, 1200) }
const msgs = [{ role: 'user', content: 'Was steht auf dem Whiteboard?', imageIds: ['b1'] }]
const vision = async (name: string) => ({ name, digest: 'sha', capabilities: ['completion', 'vision'] })
// Im Test ohne Electron: „neu kodiert“ = erkennbar andere Nutzlast mit den Maßen aus dem Kopf.
const reencode = (b: Buffer) => ({ dataBase64: `NEU-${b.length}`, width: 1600, height: 1200 })

describe('prepareChatImageRequest', () => {
  it('ohne Bilder nichts zu tun', async () => {
    expect(await prepareChatImageRequest({ mode: 'petrol', web: false, messages: [{ role: 'user', content: 'x' }], images: [] })).toEqual({ kind: 'none' })
  })

  it('lokales Vision-Modell bekommt das Bild', async () => {
    const r = await prepareChatImageRequest({ mode: 'petrol', web: false, messages: msgs, images: [img], ollamaModel: 'qwen3.5:4b', resolveLocal: vision, reencode })
    expect(r).toMatchObject({ kind: 'ok', imageTokens: 2560, delivery: { b1: { kind: 'image', route: 'local', target: 'qwen3.5:4b' } } })
    // Hinaus geht das im Main neu kodierte Bild, nie die Nutzlast des Renderers (F42).
    expect(r.kind === 'ok' && r.messages[0].images).toEqual([reencode(Buffer.from(img.dataBase64, 'base64')).dataBase64])
  })

  it('Ollama-Cloud wird erkannt und abgelehnt', async () => {
    const r = await prepareChatImageRequest({
      mode: 'petrol', web: false, messages: msgs, images: [img], ollamaModel: 'qwen3.5:cloud', reencode,
      resolveLocal: async () => { throw new LocalModelError('cloud-tag', 'qwen3.5:cloud', 'cloud') }
    })
    expect(r).toMatchObject({ kind: 'rejected', delivery: { b1: { kind: 'rejected' } } })
    expect(r.kind === 'rejected' && r.error).toMatch(/Cloud/)
  })

  it('Cloud ohne Bild-Zustimmung wird abgelehnt, mit Zustimmung gesendet', async () => {
    const cloud = { provider: 'openrouter' as const, model: 'anthropic/claude-haiku' }
    const cloudCatalog = async () => ({ vision: 'yes' as const, contextLength: 200_000 })
    expect(await prepareChatImageRequest({ mode: 'petrol', web: false, messages: msgs, images: [img], cloud, cloudCatalog, consent: {}, reencode }))
      .toMatchObject({ kind: 'rejected' })
    expect(await prepareChatImageRequest({ mode: 'petrol', web: false, messages: msgs, images: [img], cloud, cloudCatalog, consent: { openrouter: 1 }, reencode }))
      .toMatchObject({ kind: 'ok', delivery: { b1: { route: 'cloud', target: 'OpenRouter · anthropic/claude-haiku' } } })
  })

  it('Verweis ohne Bytes lehnt ab, statt still ohne Bild zu fragen', async () => {
    const r = await prepareChatImageRequest({ mode: 'petrol', web: false, messages: msgs, images: [], ollamaModel: 'm', resolveLocal: vision })
    expect(r.kind).toBe('rejected')
  })

  it('frühe Ablehnung der Bytes wird je Bild gemeldet (F51)', async () => {
    const r = await prepareChatImageRequest({ mode: 'petrol', web: false, messages: msgs, images: [{ id: 'b1', dataBase64: 'AAAA' }], ollamaModel: 'm', resolveLocal: vision, reencode })
    expect(r).toMatchObject({ kind: 'rejected', delivery: { b1: { kind: 'rejected' } } })
  })

  it('nicht dekodierbares Bild oder zu große echte Maße: abgelehnt (F42)', async () => {
    const broken = await prepareChatImageRequest({ mode: 'petrol', web: false, messages: msgs, images: [img], ollamaModel: 'm', resolveLocal: vision, reencode: () => { throw new Error('Bild lässt sich nicht dekodieren.') } })
    expect(broken).toMatchObject({ kind: 'rejected', error: expect.stringMatching(/dekodieren/) })
    const huge = await prepareChatImageRequest({ mode: 'petrol', web: false, messages: msgs, images: [img], ollamaModel: 'm', resolveLocal: vision, reencode: () => ({ dataBase64: 'x', width: 4000, height: 3000 }) })
    expect(huge).toMatchObject({ kind: 'rejected', error: expect.stringMatching(/1600/) })
  })
})

describe('nur Verlaufsbilder, Weg lehnt ab (Nutzerentscheidung 02.11.2026)', () => {
  it('Textfrage geht ohne die älteren Bilder, Grund je Bild gemeldet', async () => {
    const history = [
      { role: 'user', content: 'Was steht da?', imageIds: ['b1'] },
      { role: 'assistant', content: '4711' },
      { role: 'user', content: 'Und das Datum?' }
    ]
    const cloud = { provider: 'openrouter' as const, model: 'm' }
    const r = await prepareChatImageRequest({ mode: 'petrol', web: false, messages: history, images: [img], cloud, consent: {}, cloudCatalog: async () => ({ vision: 'yes' as const, contextLength: 200_000 }), reencode })
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.messages.every(m => m.images.length === 0)).toBe(true)
    expect(r.messages[0].content).toContain('Die Antwort darauf beruht auf dem Bild')
    expect(r.delivery.b1).toMatchObject({ kind: 'history-dropped', reason: expect.stringMatching(/nicht freigegeben/) })
  })

  it('hat die neue Frage selbst ein Bild, bleibt es bei der Ablehnung', async () => {
    const r = await prepareChatImageRequest({ mode: 'petrol', web: false, messages: msgs, images: [img], cloud: { provider: 'openrouter', model: 'm' }, consent: {}, cloudCatalog: async () => ({ vision: 'yes' as const, contextLength: 200_000 }), reencode })
    expect(r.kind).toBe('rejected')
  })
})
