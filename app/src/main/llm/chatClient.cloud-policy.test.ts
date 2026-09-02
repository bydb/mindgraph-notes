import { beforeEach, describe, expect, it, vi } from 'vitest'

const netFetch = vi.fn()
vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => netFetch(...args) },
  BrowserWindow: { getAllWindows: () => [] }
}))

import { chatWithTools } from './chatClient'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

beforeEach(() => {
  netFetch.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ models: [] })))
})

describe('Cloud-Policy des Notiz-Agent-Wire', () => {
  it('erzwingt OpenRouter-ZDR und überträgt reproduzierbare Sampling-Grenzen', async () => {
    netFetch.mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'fertig' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 }
    }))

    await chatWithTools([{ role: 'user', content: 'Auswerten' }], [], { telemetryModule: 'chat',
      backend: 'openrouter',
      openrouterApiKey: 'test-key',
      openrouterModel: 'vendor/model',
      zeroDataRetention: true,
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 8192
    })

    const body = JSON.parse((netFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({
      model: 'vendor/model',
      provider: { zdr: true },
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 8192
    })
  })

  it('sendet keine OpenRouter-spezifische Policy an LLMBase', async () => {
    netFetch.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'fertig' } }] }))

    await chatWithTools([{ role: 'user', content: 'Auswerten' }], [], { telemetryModule: 'chat',
      backend: 'llmbase',
      llmbaseApiKey: 'test-key',
      llmbaseModel: 'vendor/model',
      zeroDataRetention: true
    })

    const body = JSON.parse((netFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.provider).toBeUndefined()
  })
})

describe('lokale Auto-Auswahl', () => {
  it('behandelt sowohl :cloud als auch -cloud als nicht lokal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      models: [
        { name: 'qwen3.5:cloud' },
        { name: 'gpt-oss:120b-cloud' },
        { name: 'qwen3.8:4b' }
      ]
    })))
    netFetch.mockResolvedValue(jsonResponse({
      message: { role: 'assistant', content: 'lokal' },
      prompt_eval_count: 4
    }))

    await chatWithTools([{ role: 'user', content: 'Hallo' }], [], { backend: 'ollama', telemetryModule: 'chat' })

    const body = JSON.parse((netFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.model).toBe('qwen3.8:4b')
  })
})
