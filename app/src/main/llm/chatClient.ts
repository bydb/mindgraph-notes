// Einheitlicher Chat-Client für Main-Prozess-Komponenten (Coach, Telegram-Bot,
// Onboarding-Coach). Nutzt ausschließlich Ollama — sowohl für lokale Modelle
// als auch für Ollama-Cloud-Modelle (z.B. `ministral-3:14b-cloud`). Kein
// Anthropic-/Mistral-SDK, kein zweiter API-Key.

export type ChatBackend = 'ollama'

export interface ToolCall {
  id: string                              // synthetisch erzeugt (Ollama liefert keine)
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]                 // nur auf assistant
  tool_call_id?: string                   // historisch, von Ollama nicht benötigt
  tool_name?: string                      // nur auf tool (Ollama)
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>     // JSON Schema (type: object, properties, required)
}

export interface ChatOptions {
  backend?: ChatBackend                   // optional, immer 'ollama' — Param bleibt für Aufrufer-Kompatibilität
  ollamaUrl?: string                      // default: http://localhost:11434
  ollamaModel?: string                    // z.B. 'qwen3.6:27b-mlx' oder 'ministral-3:14b-cloud'
  maxTokens?: number                      // wird an Ollama nicht übergeben, hier nur dokumentarisch
}

export interface ChatResult {
  text: string
  backend: 'ollama'
}

export interface ChatWithToolsResult {
  text: string                            // Text-Anteil (kann leer sein, wenn nur Tools)
  toolCalls: ToolCall[]                   // leer = Modell ist fertig
  backend: 'ollama'
  assistantMessage: ChatMessage           // ans History anhängen, bevor weiter geht
}

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

async function isOllamaReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

// Cloud-Modelle (`-cloud`-Suffix) werden NIE auto-gewählt:
// 1. Privacy — Prompt-Inhalte (Briefing, Brain, Mails) sollen nicht ungewollt
//    zur Ollama-Cloud gehen.
// 2. Auth — `-cloud`-Modelle brauchen `ollama signin`; ein nicht eingeloggter
//    User würde sonst auf jeden Call mit 403 fliegen.
// Wer Cloud will, gibt das Modell explizit an (z.B. via `ollamaModel: 'ministral-3:14b-cloud'`).
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
    // Auto-Pick: nur LOKALE Tool-/Chat-fähige Modelle. Cloud-Modelle filtern.
    const localNames = names.filter(n => !/-cloud$/i.test(n))
    for (const candidate of ['qwen3', 'qwen2.5-coder', 'llama3.1', 'llama3.1:8b', 'llama3', 'qwen2.5:7b-instruct', 'mistral-nemo', 'mistral']) {
      const match = localNames.find(n => n === candidate || n.startsWith(candidate + ':'))
      if (match) return match
    }
    return localNames[0] ?? null
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
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 403 && /cloud/i.test(body)) {
      throw new Error(`Ollama-Cloud-Modell nicht verfügbar — bist du eingeloggt? Führe \`ollama signin\` im Terminal aus, oder wähle ein lokales Modell. (Details: ${body})`)
    }
    throw new Error(`Ollama API ${res.status}: ${body}`)
  }
  const json = await res.json() as { message?: { content?: string } }
  return { text: json.message?.content ?? '', backend: 'ollama' }
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const ollamaUrl = opts.ollamaUrl ?? DEFAULT_OLLAMA_URL
  if (!(await isOllamaReachable(ollamaUrl))) {
    throw new Error('Ollama ist nicht erreichbar (localhost:11434). Bitte Ollama starten oder ein -cloud-Modell mit `ollama signin` einrichten.')
  }
  return chatViaOllama(messages, opts)
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
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 403 && /cloud/i.test(body)) {
      throw new Error(`Ollama-Cloud-Modell nicht verfügbar — bist du eingeloggt? Führe \`ollama signin\` im Terminal aus, oder wähle ein lokales Modell. (Details: ${body})`)
    }
    throw new Error(`Ollama API ${res.status}: ${body}`)
  }
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

export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  opts: ChatOptions = {}
): Promise<ChatWithToolsResult> {
  const ollamaUrl = opts.ollamaUrl ?? DEFAULT_OLLAMA_URL
  if (!(await isOllamaReachable(ollamaUrl))) {
    throw new Error('Ollama ist nicht erreichbar (localhost:11434). Bitte Ollama starten.')
  }
  return chatWithToolsViaOllama(messages, tools, opts)
}
