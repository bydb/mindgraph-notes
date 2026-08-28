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

const OPTS = {
  backend: 'openrouter' as const,
  openrouterApiKey: 'test-key',
  openrouterModel: 'deepseek/deepseek-v4-flash'
}

const TOOLS = [{
  name: 'write_note',
  description: 'Erzeugt eine Notiz',
  parameters: { type: 'object' as const, properties: { file_name: { type: 'string' } }, required: ['file_name'] }
}]

beforeEach(() => {
  netFetch.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ models: [] })))
})

// Regression: Reasoning-Modelle liefern eine werkzeuglose Runde mit leerem `content`
// und der Antwort in `reasoning`. Ohne Rückfall sah der Notiz-Agent „kein Werkzeug UND
// kein Text" und brach den Lauf mit „ohne Ergebnis beendet — stärkeres Modell wählen"
// ab, obwohl das Modell geantwortet hatte (deepseek-v4-flash über OpenRouter).
describe('Reasoning-Antworten im Tool-Pfad', () => {
  it('nimmt reasoning als Text, wenn content leer ist und kein Werkzeug gerufen wurde', async () => {
    netFetch.mockResolvedValue(jsonResponse({
      choices: [{ message: { role: 'assistant', content: '', reasoning: 'Das Arbeitsblatt ist fertig.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    }))

    const res = await chatWithTools([{ role: 'user', content: 'Los' }], TOOLS, OPTS)

    expect(res.toolCalls).toHaveLength(0)
    expect(res.text).toBe('Das Arbeitsblatt ist fertig.')
    expect(res.assistantMessage.content).toBe('Das Arbeitsblatt ist fertig.')
  })

  it('nimmt auch reasoning_content (OpenAI-kompatible Schreibweise)', async () => {
    netFetch.mockResolvedValue(jsonResponse({
      choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'Antwort aus dem Denk-Feld.' } }]
    }))

    const res = await chatWithTools([{ role: 'user', content: 'Los' }], TOOLS, OPTS)

    expect(res.text).toBe('Antwort aus dem Denk-Feld.')
  })

  it('bevorzugt content, wenn beides da ist', async () => {
    netFetch.mockResolvedValue(jsonResponse({
      choices: [{ message: { role: 'assistant', content: 'Echte Antwort.', reasoning: 'Nur Gedanken.' } }]
    }))

    const res = await chatWithTools([{ role: 'user', content: 'Los' }], TOOLS, OPTS)

    expect(res.text).toBe('Echte Antwort.')
  })

  // Gegenprobe: Auf Tool-Runden ist leeres content der Normalfall. Der Denk-Text darf
  // dort NICHT zum Antworttext werden — sonst wandert er über assistantMessage in die
  // Historie und frisst bei jeder Iteration Kontext.
  it('lässt den Denk-Text weg, wenn ein Werkzeug gerufen wurde', async () => {
    netFetch.mockResolvedValue(jsonResponse({
      choices: [{
        message: {
          role: 'assistant',
          content: '',
          reasoning: 'Ich überlege lange, welches Werkzeug passt …',
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'write_note', arguments: '{"file_name":"a.md"}' } }]
        }
      }]
    }))

    const res = await chatWithTools([{ role: 'user', content: 'Los' }], TOOLS, OPTS)

    expect(res.toolCalls).toHaveLength(1)
    expect(res.toolCalls[0].arguments).toEqual({ file_name: 'a.md' })
    expect(res.text).toBe('')
    expect(res.assistantMessage.content).toBe('')
  })
})
