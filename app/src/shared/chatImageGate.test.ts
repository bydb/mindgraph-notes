import { describe, expect, it } from 'vitest'
import { decideChatImageRoute, ollamaNumCtxForImages, type ChatImageRoute } from './chatImageGate'

const base = { mode: 'petrol', web: false, imageTokens: 2560 }
const cloud = (p: Partial<Extract<ChatImageRoute, { kind: 'cloud' }>> = {}): ChatImageRoute => ({
  kind: 'cloud', provider: 'llmbase', model: 'claude-haiku', imageConsent: true, vision: 'yes', contextWindow: 32_768, ...p
})

describe('decideChatImageRoute', () => {
  it('lokales Vision-Modell darf', () => {
    expect(decideChatImageRoute({ ...base, route: { kind: 'ollama-local', model: 'qwen3.5:4b', capabilities: ['completion', 'vision'] } }))
      .toEqual({ ok: true, route: 'local', target: 'qwen3.5:4b' })
  })

  it('lokales Modell ohne vision oder ohne Angabe nicht', () => {
    expect(decideChatImageRoute({ ...base, route: { kind: 'ollama-local', model: 'llama3.1:8b', capabilities: ['completion', 'tools'] } }))
      .toMatchObject({ ok: false, code: 'no-vision' })
    expect(decideChatImageRoute({ ...base, route: { kind: 'ollama-local', model: 'x' } }))
      .toMatchObject({ ok: false, code: 'unknown-capabilities' })
  })

  it('Ollama-Cloud, ungeprüft und LM Studio werden abgelehnt (F37)', () => {
    expect(decideChatImageRoute({ ...base, route: { kind: 'ollama-cloud', model: 'qwen3.5:cloud' } })).toMatchObject({ ok: false, code: 'ollama-cloud' })
    expect(decideChatImageRoute({ ...base, route: { kind: 'ollama-unresolved', model: 'x', reason: 'nicht erreichbar' } })).toMatchObject({ ok: false, code: 'unresolved' })
    expect(decideChatImageRoute({ ...base, route: { kind: 'lmstudio' } })).toMatchObject({ ok: false, code: 'lmstudio' })
  })

  it('Cloud braucht Bild-Zustimmung, Bildeingabe und Platz (F35, F40)', () => {
    expect(decideChatImageRoute({ ...base, route: cloud() })).toMatchObject({ ok: true, route: 'cloud', target: 'LLMBase · claude-haiku' })
    expect(decideChatImageRoute({ ...base, route: cloud({ vision: 'unknown' }) })).toMatchObject({ ok: true })
    // OpenRouter ohne Katalogbestätigung: kein Bild (F44); LLMBase bleibt die benannte Ausnahme.
    expect(decideChatImageRoute({ ...base, route: cloud({ provider: 'openrouter', vision: 'unknown' }) })).toMatchObject({ ok: false, code: 'unknown-capabilities' })
    expect(decideChatImageRoute({ ...base, route: cloud({ imageConsent: false }) })).toMatchObject({ ok: false, code: 'no-consent' })
    expect(decideChatImageRoute({ ...base, route: cloud({ vision: 'no' }) })).toMatchObject({ ok: false, code: 'no-vision' })
    expect(decideChatImageRoute({ ...base, imageTokens: 16_385, route: cloud() })).toMatchObject({ ok: false, code: 'too-large' })
  })

  it('nur im Petrol-Chat und nie mit Websuche', () => {
    const route: ChatImageRoute = { kind: 'ollama-local', model: 'm', capabilities: ['completion', 'vision'] }
    expect(decideChatImageRoute({ ...base, mode: 'direct', route })).toMatchObject({ ok: false, code: 'mode' })
    expect(decideChatImageRoute({ ...base, web: true, route })).toMatchObject({ ok: false, code: 'web' })
  })
})

describe('ollamaNumCtxForImages', () => {
  it('mindestens 8192, höchstens 32768', () => {
    expect(ollamaNumCtxForImages(300, 0)).toBe(8192)
    expect(ollamaNumCtxForImages(30_000, 4 * 2560)).toBe(22_528)
    expect(ollamaNumCtxForImages(300_000, 10_000)).toBe(32_768)
  })
})
