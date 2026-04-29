// Einheitlicher Chat-Client für Main-Prozess-Komponenten (z. B. Telegram-Bot).
// Unterstützt Ollama (lokal) und Anthropic (API). Backend wählbar + 'auto'-Fallback.

import Anthropic from '@anthropic-ai/sdk'

export type ChatBackend = 'ollama' | 'anthropic' | 'auto'

export interface ToolCall {
  id: string                              // synthetisch erzeugt (Ollama liefert keine)
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]                 // nur auf assistant
  tool_call_id?: string                   // nur auf tool (für Anthropic-Roundtrip)
  tool_name?: string                      // nur auf tool (Ollama)
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>     // JSON Schema (type: object, properties, required)
}

export interface ChatOptions {
  backend: ChatBackend
  ollamaUrl?: string                      // default: http://localhost:11434
  ollamaModel?: string                    // z.B. 'llama3.1'
  anthropicApiKey?: string
  anthropicModel?: string                 // default: 'claude-sonnet-4-6'
  maxTokens?: number                      // default: 1024
}

export interface ChatResult {
  text: string
  backend: 'ollama' | 'anthropic'
}

export interface ChatWithToolsResult {
  text: string                            // Text-Anteil (kann leer sein, wenn nur Tools)
  toolCalls: ToolCall[]                   // leer = Modell ist fertig
  backend: 'ollama' | 'anthropic'
  assistantMessage: ChatMessage           // ans History anhängen, bevor weiter geht
}

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6'

async function isOllamaReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function pickDefaultOllamaModel(url: string, preferred?: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const json = await res.json() as { models?: Array<{ name: string }> }
    const names = (json.models ?? []).map(m => m.name)
    const requested = preferred?.trim()
    if (requested && requested.toLowerCase() !== 'auto') {
      if (names.includes(requested)) return requested
      const prefixMatch = names.find(n => n === requested || n.startsWith(requested + ':'))
      if (prefixMatch) return prefixMatch
      throw new Error(`Ollama-Modell "${requested}" nicht gefunden. Installierte Modelle: ${names.join(', ') || '(keine)'}`)
    }
    // bevorzugt Tool-/Chat-fähige Modelle
    for (const candidate of ['qwen3', 'qwen2.5-coder', 'llama3.1', 'llama3.1:8b', 'llama3', 'qwen2.5:7b-instruct', 'mistral-nemo', 'mistral']) {
      const match = names.find(n => n === candidate || n.startsWith(candidate + ':'))
      if (match) return match
    }
    return names[0] ?? null
  } catch {
    return null
  }
}

async function chatViaOllama(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const url = opts.ollamaUrl ?? DEFAULT_OLLAMA_URL
  const model = await pickDefaultOllamaModel(url, opts.ollamaModel)
  if (!model) throw new Error('Kein Ollama-Modell verfügbar')

  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false
    }),
    signal: AbortSignal.timeout(120000)
  })
  if (!res.ok) throw new Error(`Ollama API ${res.status}: ${await res.text()}`)
  const json = await res.json() as { message?: { content?: string } }
  return { text: json.message?.content ?? '', backend: 'ollama' }
}

async function chatViaAnthropic(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  if (!opts.anthropicApiKey) throw new Error('Anthropic API Key fehlt')
  const client = new Anthropic({ apiKey: opts.anthropicApiKey })

  const system = messages.find(m => m.role === 'system')?.content
  const userMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const response = await client.messages.create({
    model: opts.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    system,
    messages: userMessages
  })

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('')

  return { text, backend: 'anthropic' }
}

export async function chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const ollamaUrl = opts.ollamaUrl ?? DEFAULT_OLLAMA_URL

  if (opts.backend === 'ollama') {
    return chatViaOllama(messages, opts)
  }
  if (opts.backend === 'anthropic') {
    return chatViaAnthropic(messages, opts)
  }
  // auto: Ollama bevorzugt, Anthropic als Fallback
  if (await isOllamaReachable(ollamaUrl)) {
    try {
      return await chatViaOllama(messages, opts)
    } catch (err) {
      console.warn('[chatClient] Ollama failed, fallback to Anthropic:', err)
    }
  }
  return chatViaAnthropic(messages, opts)
}

// ─── Tool-Use ──────────────────────────────────────────────────────────────

let toolCallCounter = 0
function nextToolCallId(): string {
  toolCallCounter += 1
  return `tc_${Date.now().toString(36)}_${toolCallCounter}`
}

function ollamaMessageToWire(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    // Ollama erwartet tool-Antworten als {role: 'tool', content: '...'}
    return { role: 'tool', content: m.content }
  }
  if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.tool_calls.map(tc => ({
        function: { name: tc.name, arguments: tc.arguments }
      }))
    }
  }
  return { role: m.role, content: m.content }
}

interface OllamaToolCallWire {
  function?: { name?: string; arguments?: unknown }
}

async function chatWithToolsViaOllama(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  opts: ChatOptions
): Promise<ChatWithToolsResult> {
  const url = opts.ollamaUrl ?? DEFAULT_OLLAMA_URL
  const model = await pickDefaultOllamaModel(url, opts.ollamaModel)
  if (!model) throw new Error('Kein Ollama-Modell verfügbar')
  console.log(`[chatClient] Ollama tool chat: model=${model}, tools=${tools.map(t => t.name).join(', ')}`)

  const wireTools = tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }))

  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map(ollamaMessageToWire),
      tools: wireTools,
      stream: false
    }),
    signal: AbortSignal.timeout(180000)
  })
  if (!res.ok) throw new Error(`Ollama API ${res.status}: ${await res.text()}`)
  const json = await res.json() as {
    message?: {
      role?: string
      content?: string
      tool_calls?: OllamaToolCallWire[]
    }
  }

  const rawCalls = json.message?.tool_calls ?? []
  const toolCalls: ToolCall[] = rawCalls
    .filter(tc => tc.function?.name)
    .map(tc => {
      let args: Record<string, unknown> = {}
      const rawArgs = tc.function?.arguments
      if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
        args = rawArgs as Record<string, unknown>
      } else if (typeof rawArgs === 'string') {
        try {
          const parsed = JSON.parse(rawArgs)
          if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>
        } catch {
          // Modell hat kaputtes JSON gesendet — args bleibt leer; loop kann darauf reagieren
        }
      }
      return {
        id: nextToolCallId(),
        name: tc.function!.name!,
        arguments: args
      }
    })

  const text = json.message?.content ?? ''
  console.log(`[chatClient] Ollama tool chat result: textChars=${text.length}, toolCalls=${toolCalls.map(tc => tc.name).join(', ') || '(none)'}`)
  const assistantMessage: ChatMessage = {
    role: 'assistant',
    content: text,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
  }

  return {
    text,
    toolCalls,
    backend: 'ollama',
    assistantMessage
  }
}

/**
 * Tool-aware Chat-Wrapper. Aktuell nur Ollama implementiert (User-Fokus).
 * Anthropic-Tool-Use folgt später — fällt aktuell mit klarem Fehler aus.
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  opts: ChatOptions
): Promise<ChatWithToolsResult> {
  const ollamaUrl = opts.ollamaUrl ?? DEFAULT_OLLAMA_URL
  const wantOllama = opts.backend === 'ollama' || opts.backend === 'auto'

  if (wantOllama) {
    if (opts.backend === 'ollama' || await isOllamaReachable(ollamaUrl)) {
      return chatWithToolsViaOllama(messages, tools, opts)
    }
  }
  throw new Error('Tool-Use ist aktuell nur über Ollama unterstützt. Bitte Backend auf "ollama" stellen und sicherstellen, dass Ollama läuft.')
}
