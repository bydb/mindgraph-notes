// Einheitlicher Chat-Client für Main-Prozess-Komponenten (z. B. Telegram-Bot).
// Unterstützt Ollama (lokal) und Anthropic (API). Backend wählbar + 'auto'-Fallback.

import Anthropic from '@anthropic-ai/sdk'

export type ChatBackend = 'ollama' | 'anthropic' | 'auto'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  backend: ChatBackend
  ollamaUrl?: string            // default: http://localhost:11434
  ollamaModel?: string          // z.B. 'llama3.1'
  anthropicApiKey?: string
  anthropicModel?: string       // default: 'claude-sonnet-4-6'
  maxTokens?: number            // default: 1024
}

export interface ChatResult {
  text: string
  backend: 'ollama' | 'anthropic'
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
    if (preferred && names.includes(preferred)) return preferred
    // bevorzugt Chat-fähige Modelle
    for (const candidate of ['llama3.1', 'llama3.1:8b', 'llama3', 'qwen2.5:7b-instruct', 'mistral']) {
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
