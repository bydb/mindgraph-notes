// Einheitlicher Chat-Client für Main-Prozess-Komponenten (Coach, Telegram-Bot,
// Onboarding-Coach, Email-Analyse, …).
//
// Zwei Backends:
//   - 'ollama'     — lokale Modelle ODER Ollama-Cloud-Modelle (`*:cloud`).
//   - 'openrouter' — OpenAI-kompatibles Cloud-Backend (https://openrouter.ai).
//
// WICHTIG (Privacy): OpenRouter ist ein Cloud-Dienst. Der Aufrufer ist dafür
// verantwortlich, das Backend NUR dann auf 'openrouter' zu setzen, wenn der
// User es bewusst freigeschaltet hat. Siehe shared/llmBackend.ts
// (isOpenRouterReady / canUseCloudForFeature) und den Email-Picker (analysisModel).
// Das Brain-Modul nutzt diesen Client NICHT — es ist hardcoded localhost.

export type ChatBackend = 'ollama' | 'openrouter'

export interface ToolCall {
  id: string                              // bei Ollama synthetisch, bei OpenRouter echt
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]                 // nur auf assistant
  tool_call_id?: string                   // OpenRouter braucht das auf tool-Antworten
  tool_name?: string                      // nur auf tool (Ollama)
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>     // JSON Schema (type: object, properties, required)
}

export interface ChatOptions {
  backend?: ChatBackend                   // default 'ollama'
  ollamaUrl?: string                      // default: http://localhost:11434
  ollamaModel?: string                    // z.B. 'qwen3.6:27b-mlx' oder 'qwen3.5:cloud'
  // OpenRouter:
  openrouterApiKey?: string               // Pflicht wenn backend === 'openrouter'
  openrouterModel?: string                // z.B. 'qwen/qwen-2.5-7b-instruct' (Pflicht für OpenRouter)
  responseFormat?: 'json'                  // OpenRouter: erzwingt response_format json_object (für strukturierte Analysen)
  temperature?: number                     // OpenRouter: temperature
  maxTokens?: number                      // OpenRouter: max_tokens; Ollama: nur dokumentarisch
}

export interface ChatResult {
  text: string
  backend: ChatBackend
}

export interface ChatWithToolsResult {
  text: string                            // Text-Anteil (kann leer sein, wenn nur Tools)
  toolCalls: ToolCall[]                   // leer = Modell ist fertig
  backend: ChatBackend
  assistantMessage: ChatMessage           // ans History anhängen, bevor weiter geht
}

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
// OpenRouter empfiehlt diese Header zur App-Attribution (optional, schaden nicht).
const OPENROUTER_HEADERS_EXTRA = {
  'HTTP-Referer': 'https://mindgraph-notes.de',
  'X-Title': 'MindGraph Notes'
}

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
// Wer Cloud will, gibt das Modell explizit an (z.B. via `ollamaModel: 'qwen3.5:cloud'`).
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

// ─── Ollama: plain chat ──────────────────────────────────────────────────────

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

// ─── OpenRouter: plain chat (OpenAI-kompatibel) ──────────────────────────────

interface OpenAIChatChoice {
  message?: {
    role?: string
    content?: string | null
    // Reasoning-Modelle (gpt-oss, DeepSeek-R1, …) legen den Denk-Teil — und manchmal
    // die finale Antwort — in ein separates Feld. Als Fallback nutzen, wenn content leer ist.
    reasoning?: string | null
    reasoning_content?: string | null
    tool_calls?: Array<{
      id?: string
      type?: string
      function?: { name?: string; arguments?: string }
    }>
  }
}

// Extrahiert den nutzbaren Text aus einer OpenAI-kompatiblen Antwort. Bevorzugt
// `content`; fällt auf `reasoning`/`reasoning_content` zurück, falls content leer ist
// (manche Reasoning-Modelle liefern bei response_format trotzdem leeren content).
function openrouterMessageText(msg: OpenAIChatChoice['message']): string {
  const content = (msg?.content ?? '').trim()
  if (content) return content
  return (msg?.reasoning ?? msg?.reasoning_content ?? '').trim()
}

function openrouterHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...OPENROUTER_HEADERS_EXTRA
  }
}

// Übersetzt OpenRouter-Fehler in klare, handlungsleitende Meldungen (statt rohem JSON).
function friendlyOpenRouterError(status: number, body: string, model?: string): string {
  if (status === 401) return 'OpenRouter: API-Key ungültig oder fehlt (401).'
  if (status === 402) return 'OpenRouter: Guthaben/Limit erschöpft (402) — auf openrouter.ai/credits aufladen.'
  if (status === 429) {
    const m = model ? `„${model}"` : 'Das Modell'
    const isFree = /:free\b/i.test(model || '')
    return `OpenRouter: ${m} ist gerade rate-limitiert (429).` +
      (isFree
        ? ' Das ist das Limit des Gratis-Tiers — kurz warten, ein anderes :free-Modell wählen oder ein kleines Guthaben aufladen (openrouter.ai/credits), das die Free-Limits anhebt.'
        : ' Kurz warten und erneut versuchen, oder ein anderes Modell wählen.')
  }
  // Versuche, eine kompakte Fehlermeldung aus dem JSON zu ziehen.
  try {
    const j = JSON.parse(body) as { error?: { message?: string; metadata?: { raw?: string } } }
    const raw = j.error?.metadata?.raw || j.error?.message
    if (raw) return `OpenRouter API ${status}: ${raw}`
  } catch { /* kein JSON */ }
  return `OpenRouter API ${status}: ${body}`
}

function assertOpenRouterConfig(opts: ChatOptions): { apiKey: string; model: string } {
  const apiKey = opts.openrouterApiKey?.trim()
  const model = opts.openrouterModel?.trim()
  if (!apiKey) throw new Error('OpenRouter-API-Key fehlt. Bitte in den Einstellungen hinterlegen.')
  if (!model) throw new Error('Kein OpenRouter-Modell ausgewählt.')
  return { apiKey, model }
}

async function chatViaOpenRouter(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const { apiKey, model } = assertOpenRouterConfig(opts)
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: openrouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      ...(opts.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      ...(typeof opts.temperature === 'number' ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {})
    }),
    signal: AbortSignal.timeout(120000)
  })
  if (!res.ok) {
    throw new Error(friendlyOpenRouterError(res.status, await res.text(), model))
  }
  const json = await res.json() as { choices?: OpenAIChatChoice[] }
  return { text: openrouterMessageText(json.choices?.[0]?.message), backend: 'openrouter' }
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  if (opts.backend === 'openrouter') {
    return chatViaOpenRouter(messages, opts)
  }
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

// ─── OpenRouter: tool-use (OpenAI-kompatibel) ────────────────────────────────

function openrouterMessageToWire(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: m.tool_call_id ?? m.tool_name ?? 'unknown',
      content: m.content
    }
  }
  if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
    return {
      role: 'assistant',
      content: m.content || '',
      tool_calls: m.tool_calls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) }
      }))
    }
  }
  return { role: m.role, content: m.content }
}

async function chatWithToolsViaOpenRouter(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  opts: ChatOptions
): Promise<ChatWithToolsResult> {
  const { apiKey, model } = assertOpenRouterConfig(opts)
  const wireTools = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }))

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: openrouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: messages.map(openrouterMessageToWire),
      tools: wireTools,
      stream: false
    }),
    signal: AbortSignal.timeout(180000)
  })
  if (!res.ok) {
    throw new Error(friendlyOpenRouterError(res.status, await res.text(), model))
  }
  const json = await res.json() as { choices?: OpenAIChatChoice[] }
  const msg = json.choices?.[0]?.message
  const rawCalls = msg?.tool_calls ?? []
  const toolCalls: ToolCall[] = rawCalls
    .filter(tc => tc.function?.name)
    .map(tc => {
      let args: Record<string, unknown> = {}
      const rawArgs = tc.function?.arguments
      if (typeof rawArgs === 'string' && rawArgs.trim()) {
        try {
          const parsed = JSON.parse(rawArgs)
          if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>
        } catch {
          // kaputtes JSON — args leer
        }
      }
      return {
        id: tc.id || nextToolCallId(),
        name: tc.function!.name!,
        arguments: args
      }
    })

  const text = msg?.content ?? ''
  const assistantMessage: ChatMessage = {
    role: 'assistant',
    content: text,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
  }
  return { text, toolCalls, backend: 'openrouter', assistantMessage }
}

export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  opts: ChatOptions = {}
): Promise<ChatWithToolsResult> {
  if (opts.backend === 'openrouter') {
    return chatWithToolsViaOpenRouter(messages, tools, opts)
  }
  const ollamaUrl = opts.ollamaUrl ?? DEFAULT_OLLAMA_URL
  if (!(await isOllamaReachable(ollamaUrl))) {
    throw new Error('Ollama ist nicht erreichbar (localhost:11434). Bitte Ollama starten.')
  }
  return chatWithToolsViaOllama(messages, tools, opts)
}

// ─── OpenRouter: Streaming-Chat (SSE) ───────────────────────────────────────
// Streamt Token für Token via onToken-Callback und liefert am Ende den
// Gesamttext. Für Notes-Chat & Co., damit Cloud sich wie das lokale Ollama-
// Streaming anfühlt (kein „hängen" bis die ganze Antwort da ist).
export async function streamOpenRouterChat(
  messages: ChatMessage[],
  opts: { apiKey: string; model: string; signal?: AbortSignal },
  onToken: (delta: string) => void
): Promise<string> {
  if (!opts.apiKey) throw new Error('OpenRouter-API-Key fehlt.')
  if (!opts.model) throw new Error('Kein OpenRouter-Modell ausgewählt.')

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: openrouterHeaders(opts.apiKey),
    body: JSON.stringify({
      model: opts.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true
    }),
    signal: opts.signal
  })
  if (!res.ok) {
    throw new Error(friendlyOpenRouterError(res.status, await res.text(), opts.model))
  }
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Keine Response-Daten von OpenRouter')

  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onToken(delta)
        }
      } catch {
        // unvollständige/Kommentar-Zeile (OpenRouter sendet gelegentlich ": OPENROUTER PROCESSING")
      }
    }
  }
  return full
}

// ─── OpenRouter: Modell-Liste (für Settings-Picker) ──────────────────────────

export interface OpenRouterModelInfo {
  id: string
  name: string
  contextLength?: number
  promptPrice?: string        // USD pro 1M Tokens, als String wie von OpenRouter geliefert
}

export async function listOpenRouterModels(apiKey: string): Promise<OpenRouterModelInfo[]> {
  const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`OpenRouter Modell-Liste ${res.status}: ${await res.text()}`)
  const json = await res.json() as {
    data?: Array<{
      id?: string
      name?: string
      context_length?: number
      pricing?: { prompt?: string }
    }>
  }
  return (json.data ?? [])
    .filter(m => m.id)
    .map(m => ({
      id: m.id!,
      name: m.name || m.id!,
      contextLength: m.context_length,
      promptPrice: m.pricing?.prompt
    }))
}
