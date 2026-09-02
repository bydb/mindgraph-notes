import { beforeEach, describe, expect, it, vi } from 'vitest'

const netFetch = vi.fn()
vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => netFetch(...args) },
  BrowserWindow: { getAllWindows: () => [] }
}))

import { chatWithTools, type ChatMessage, type ToolDefinition } from './chatClient'
import type { LlmExecutionProfile } from '../../shared/agentExecutionProfile'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const TOOLS: ToolDefinition[] = [{
  name: 'note_read',
  description: 'Liest eine Notiz',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
}]

// Explizit gesetzt, nicht abgeleitet: Das Produkt hat keine modellabhängige
// Automatik — der Aufrufer entscheidet, dieser Test prüft nur die Wire-Umsetzung.
const PROFILE: LlmExecutionProfile = {
  id: 'test-thinking-preserve',
  ollama: { thinkingMode: 'preserve', temperature: 1, topP: 0.95 }
}

beforeEach(() => {
  netFetch.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
    models: [{ name: 'qwen3.8:27b-mlx' }]
  })))
})

describe('Ollama-Thinking im Tool-Loop', () => {
  it('erhält Qwen-Thinking flüchtig bis zur nächsten Tool-Runde', async () => {
    netFetch
      .mockResolvedValueOnce(jsonResponse({
        message: {
          role: 'assistant',
          content: '',
          thinking: 'Ich muss zuerst die Quelle lesen.',
          tool_calls: [{ function: { name: 'note_read', arguments: { path: 'Quelle.md' } } }]
        },
        prompt_eval_count: 100,
        eval_count: 20
      }))
      .mockResolvedValueOnce(jsonResponse({
        message: { role: 'assistant', content: 'Fertig.' },
        prompt_eval_count: 140,
        eval_count: 8
      }))

    const options = { telemetryModule: 'chat' as const,
      backend: 'ollama' as const,
      ollamaModel: 'qwen3.8:27b-mlx',
      executionProfile: PROFILE
    }
    const first = await chatWithTools(
      [{ role: 'user', content: 'Lies die Quelle.' }],
      TOOLS,
      options
    )

    expect(first.assistantMessage.thinking).toBe('Ich muss zuerst die Quelle lesen.')

    const history: ChatMessage[] = [
      { role: 'user', content: 'Lies die Quelle.' },
      first.assistantMessage,
      { role: 'tool', content: 'Quellinhalt', tool_call_id: first.toolCalls[0].id }
    ]
    await chatWithTools(history, TOOLS, options)

    const firstBody = JSON.parse((netFetch.mock.calls[0][1] as RequestInit).body as string)
    const secondBody = JSON.parse((netFetch.mock.calls[1][1] as RequestInit).body as string)
    expect(firstBody).toMatchObject({
      think: true,
      options: { temperature: 1, top_p: 0.95 }
    })
    expect(secondBody.messages[1]).toMatchObject({
      role: 'assistant',
      thinking: 'Ich muss zuerst die Quelle lesen.'
    })
  })
})
