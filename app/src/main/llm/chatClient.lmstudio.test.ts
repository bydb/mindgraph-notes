// Vertragstest des LM-Studio-Backends: der Notiz-Agent muss seinen Tool-Loop auch
// ohne Ollama fahren können. Geprüft wird der Draht (URL, Header, tools-Array,
// Parsing der tool_calls) — LM Studio selbst läuft dabei NICHT.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const netFetch = vi.fn()
vi.mock('electron', () => ({ net: { fetch: (...args: unknown[]) => netFetch(...args) } }))

import { chatWithTools, friendlyLmStudioError } from './chatClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const TOOLS = [{
  name: 'note_search',
  description: 'Sucht Notizen',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
}]

beforeEach(() => {
  netFetch.mockReset()
  // Erreichbarkeitsprüfung läuft über das globale fetch (/v1/models).
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [] })))
})

describe('chatWithTools über LM Studio', () => {
  it('spricht den lokalen OpenAI-kompatiblen Endpunkt ohne API-Key an', async () => {
    netFetch.mockResolvedValue(jsonResponse({
      choices: [{
        message: {
          content: '',
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'note_search', arguments: '{"query":"Digitalwoche"}' }
          }]
        }
      }]
    }))

    const res = await chatWithTools(
      [{ role: 'user', content: 'Suche Digitalwoche' }],
      TOOLS,
      { backend: 'lmstudio', lmstudioModel: 'qwen/qwen3.5-4b', lmstudioUrl: 'http://127.0.0.1:1234' }
    )

    const [url, init] = netFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:1234/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('qwen/qwen3.5-4b')
    expect(body.tools[0].function.name).toBe('note_search')

    expect(res.backend).toBe('lmstudio')
    expect(res.toolCalls).toEqual([
      { id: 'call_1', name: 'note_search', arguments: { query: 'Digitalwoche' } }
    ])
  })

  it('meldet ein nicht erreichbares LM Studio klar, statt gegen Ollama zu laufen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    await expect(chatWithTools([{ role: 'user', content: 'hi' }], TOOLS, {
      backend: 'lmstudio',
      lmstudioModel: 'qwen/qwen3.5-4b',
      lmstudioUrl: 'http://127.0.0.1:1234'
    })).rejects.toThrow(/LM Studio ist nicht erreichbar/)
    expect(netFetch).not.toHaveBeenCalled()
  })

  it('nutzt den Standard-Port, wenn keine URL gesetzt ist', async () => {
    netFetch.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    await chatWithTools([{ role: 'user', content: 'hi' }], TOOLS, {
      backend: 'lmstudio',
      lmstudioModel: 'modell'
    })
    expect(netFetch.mock.calls[0][0]).toBe('http://127.0.0.1:1234/v1/chat/completions')
  })

  it('verlangt ein ausgewähltes Modell', async () => {
    await expect(chatWithTools([{ role: 'user', content: 'hi' }], TOOLS, {
      backend: 'lmstudio'
    })).rejects.toThrow(/Kein LM-Studio-Modell/)
  })
})

describe('friendlyLmStudioError', () => {
  it('erklärt eine Tool-Ablehnung als Modell-Eigenschaft', () => {
    const msg = friendlyLmStudioError(400, JSON.stringify({
      error: 'This model does not support tools'
    }), 'google/gemma-2-9b-it')
    expect(msg).toMatch(/unterstützt keine Tool-Aufrufe/)
    expect(msg).toMatch(/google\/gemma-2-9b-it/)
  })

  it('erklärt ein nicht geladenes Modell', () => {
    expect(friendlyLmStudioError(404, '{"error":"model not found"}', 'x/y'))
      .toMatch(/nicht geladen/)
  })

  it('reicht unbekannte Fehler lesbar durch', () => {
    expect(friendlyLmStudioError(500, 'boom', 'x/y')).toBe('LM Studio API 500: boom')
  })
})
