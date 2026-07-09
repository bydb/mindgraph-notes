// Einheitlicher Chat-Client für Main-Prozess-Komponenten (Telegram-Bot,
// Email-Analyse, Notes-Chat, …).
//
// Drei Backends:
//   - 'ollama'     — lokale Modelle ODER Ollama-Cloud-Modelle (`*:cloud`).
//   - 'openrouter' — OpenAI-kompatibles Cloud-Backend (https://openrouter.ai).
//   - 'llmbase'    — OpenAI-kompatibles EU-Cloud-Backend (https://llmbase.ai,
//                    Inference in DE/NL/FI/CH — DSGVO-Positionierung).
//
// WICHTIG (Privacy): OpenRouter und LLMBase sind Cloud-Dienste. Der Aufrufer ist
// dafür verantwortlich, das Backend NUR dann auf einen Cloud-Provider zu setzen,
// wenn der User es bewusst freigeschaltet hat. Siehe shared/llmBackend.ts
// (isCloudProviderReady / canUseCloudForFeature) und den Email-Picker (analysisModel).
// Das Brain-Modul nutzt diesen Client NICHT — es ist hardcoded localhost.

export type ChatBackend = 'ollama' | 'openrouter' | 'llmbase'
// Die OpenAI-kompatiblen Cloud-Backends (alles außer Ollama).
export type CloudChatBackend = Exclude<ChatBackend, 'ollama'>

export function isCloudChatBackend(backend: ChatBackend | undefined): backend is CloudChatBackend {
  return backend === 'openrouter' || backend === 'llmbase'
}

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
  // LLMBase:
  llmbaseApiKey?: string                  // Pflicht wenn backend === 'llmbase'
  llmbaseModel?: string                   // z.B. 'qwen/qwen3.5-9b' (Pflicht für LLMBase)
  responseFormat?: 'json'                  // Cloud: erzwingt response_format json_object (für strukturierte Analysen)
  temperature?: number                     // Cloud: temperature
  maxTokens?: number                      // Cloud: max_tokens; Ollama: nur dokumentarisch
  // Externes Abbruch-Signal (z.B. Abbrechen-Button im Notiz-Agent) — wird mit dem
  // internen Request-Timeout kombiniert, ersetzt ihn nicht (Plan F05).
  signal?: AbortSignal
  // Request-Timeout-Override in ms. Default: 120s (chat) / 180s (chatWithTools).
  // Der Notiz-Agent setzt 600s: große lokale Modelle brauchen mit gewachsenem
  // Tool-Kontext länger, und der Nutzer hat einen echten Abbrechen-Button.
  timeoutMs?: number
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

// OpenAI-kompatible Cloud-Provider — EIN Codepfad, parametrisiert über diese Map.
// OpenRouter empfiehlt die Attribution-Header (optional, schaden nicht); LLMBase
// braucht keine Extra-Header (schaden aber ebenfalls nicht — App-Attribution).
const CLOUD_PROVIDERS: Record<CloudChatBackend, {
  label: string
  baseUrl: string
  extraHeaders: Record<string, string>
  creditsHint: string   // handlungsleitender Hinweis bei 402 (Guthaben erschöpft)
}> = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    extraHeaders: {
      'HTTP-Referer': 'https://mindgraph-notes.de',
      'X-Title': 'MindGraph Notes'
    },
    creditsHint: 'auf openrouter.ai/credits aufladen'
  },
  llmbase: {
    label: 'LLMBase',
    baseUrl: 'https://api.llmbase.ai/v1',
    extraHeaders: {
      'HTTP-Referer': 'https://mindgraph-notes.de',
      'X-Title': 'MindGraph Notes'
    },
    creditsHint: 'Prepaid-Credits auf llmbase.ai aufladen'
  }
}

// Kombiniert externes Abbruch-Signal mit dem internen Timeout (Cancellation-Vertrag F05).
function requestSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return external ? AbortSignal.any([external, timeout]) : timeout
}

// Chat-Completions laufen über Electrons net.fetch (Chromium-Netzwerk-Stack) statt
// über das globale Node-fetch (undici): undici bricht Requests nach 300 s ohne
// Response-Header hart ab (headersTimeout, nicht konfigurierbar ohne Dispatcher).
// Bei `stream: false` kommen die Header aber erst, wenn die KOMPLETTE Antwort
// generiert ist — langsame lokale Modelle (qwen3.6:27b-mlx, lange write_html-
// Antworten) starben so reproduzierbar nach exakt 5 Minuten mit „fetch failed",
// obwohl der Notiz-Agent ein 600-s-Timeout gesetzt hatte. Das AbortSignal aus
// requestSignal() bleibt die einzige Zeitgrenze. Die kurzen Reachability-Checks
// (/api/tags, 1,5-3 s Timeout) bleiben bewusst auf dem globalen fetch.
async function chatFetch(url: string, init: RequestInit): Promise<Response> {
  const { net } = await import('electron')
  return net.fetch(url, init)
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

  const res = await chatFetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false
    }),
    signal: requestSignal(opts.timeoutMs ?? 120000, opts.signal)
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

function cloudHeaders(backend: CloudChatBackend, apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...CLOUD_PROVIDERS[backend].extraHeaders
  }
}

// Übersetzt Cloud-Provider-Fehler in klare, handlungsleitende Meldungen (statt rohem JSON).
function friendlyCloudError(backend: CloudChatBackend, status: number, body: string, model?: string): string {
  const { label, creditsHint } = CLOUD_PROVIDERS[backend]
  if (status === 401) return `${label}: API-Key ungültig oder fehlt (401).`
  if (status === 402) return `${label}: Guthaben/Limit erschöpft (402) — ${creditsHint}.`
  if (status === 429) {
    const m = model ? `„${model}"` : 'Das Modell'
    const isFree = backend === 'openrouter' && /:free\b/i.test(model || '')
    return `${label}: ${m} ist gerade rate-limitiert (429).` +
      (isFree
        ? ' Das ist das Limit des Gratis-Tiers — kurz warten, ein anderes :free-Modell wählen oder ein kleines Guthaben aufladen (openrouter.ai/credits), das die Free-Limits anhebt.'
        : ' Kurz warten und erneut versuchen, oder ein anderes Modell wählen.')
  }
  // Versuche, eine kompakte Fehlermeldung aus dem JSON zu ziehen.
  try {
    const j = JSON.parse(body) as { error?: { message?: string; metadata?: { raw?: string } } }
    const raw = j.error?.metadata?.raw || j.error?.message
    if (raw) return `${label} API ${status}: ${raw}`
  } catch { /* kein JSON */ }
  return `${label} API ${status}: ${body}`
}

function assertCloudConfig(backend: CloudChatBackend, opts: ChatOptions): { apiKey: string; model: string } {
  const label = CLOUD_PROVIDERS[backend].label
  const apiKey = (backend === 'llmbase' ? opts.llmbaseApiKey : opts.openrouterApiKey)?.trim()
  const model = (backend === 'llmbase' ? opts.llmbaseModel : opts.openrouterModel)?.trim()
  if (!apiKey) throw new Error(`${label}-API-Key fehlt. Bitte in den Einstellungen hinterlegen.`)
  if (!model) throw new Error(`Kein ${label}-Modell ausgewählt.`)
  return { apiKey, model }
}

async function chatViaCloud(backend: CloudChatBackend, messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const { apiKey, model } = assertCloudConfig(backend, opts)
  const res = await chatFetch(`${CLOUD_PROVIDERS[backend].baseUrl}/chat/completions`, {
    method: 'POST',
    headers: cloudHeaders(backend, apiKey),
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      ...(opts.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      ...(typeof opts.temperature === 'number' ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {})
    }),
    signal: requestSignal(opts.timeoutMs ?? 120000, opts.signal)
  })
  if (!res.ok) {
    throw new Error(friendlyCloudError(backend, res.status, await res.text(), model))
  }
  const json = await res.json() as { choices?: OpenAIChatChoice[] }
  return { text: openrouterMessageText(json.choices?.[0]?.message), backend }
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  if (isCloudChatBackend(opts.backend)) {
    return chatViaCloud(opts.backend, messages, opts)
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

  const res = await chatFetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map(ollamaMessageToWire),
      tools: wireTools,
      stream: false
    }),
    signal: requestSignal(opts.timeoutMs ?? 180000, opts.signal)
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

// ─── Cloud (OpenRouter/LLMBase): tool-use (OpenAI-kompatibel) ────────────────

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

async function chatWithToolsViaCloud(
  backend: CloudChatBackend,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  opts: ChatOptions
): Promise<ChatWithToolsResult> {
  const { apiKey, model } = assertCloudConfig(backend, opts)
  const wireTools = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }))

  const res = await chatFetch(`${CLOUD_PROVIDERS[backend].baseUrl}/chat/completions`, {
    method: 'POST',
    headers: cloudHeaders(backend, apiKey),
    body: JSON.stringify({
      model,
      messages: messages.map(openrouterMessageToWire),
      tools: wireTools,
      stream: false
    }),
    signal: requestSignal(opts.timeoutMs ?? 180000, opts.signal)
  })
  if (!res.ok) {
    throw new Error(friendlyCloudError(backend, res.status, await res.text(), model))
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
  return { text, toolCalls, backend, assistantMessage }
}

export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  opts: ChatOptions = {}
): Promise<ChatWithToolsResult> {
  if (isCloudChatBackend(opts.backend)) {
    return chatWithToolsViaCloud(opts.backend, messages, tools, opts)
  }
  const ollamaUrl = opts.ollamaUrl ?? DEFAULT_OLLAMA_URL
  if (!(await isOllamaReachable(ollamaUrl))) {
    throw new Error('Ollama ist nicht erreichbar (localhost:11434). Bitte Ollama starten.')
  }
  return chatWithToolsViaOllama(messages, tools, opts)
}

// ─── Cloud (OpenRouter/LLMBase): Streaming-Chat (SSE) ───────────────────────
// Streamt Token für Token via onToken-Callback und liefert am Ende den
// Gesamttext. Für Notes-Chat & Co., damit Cloud sich wie das lokale Ollama-
// Streaming anfühlt (kein „hängen" bis die ganze Antwort da ist).
export async function streamCloudChat(
  messages: ChatMessage[],
  opts: { backend: CloudChatBackend; apiKey: string; model: string; signal?: AbortSignal },
  onToken: (delta: string) => void
): Promise<string> {
  const label = CLOUD_PROVIDERS[opts.backend].label
  if (!opts.apiKey) throw new Error(`${label}-API-Key fehlt.`)
  if (!opts.model) throw new Error(`Kein ${label}-Modell ausgewählt.`)

  const res = await fetch(`${CLOUD_PROVIDERS[opts.backend].baseUrl}/chat/completions`, {
    method: 'POST',
    headers: cloudHeaders(opts.backend, opts.apiKey),
    body: JSON.stringify({
      model: opts.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true
    }),
    signal: opts.signal
  })
  if (!res.ok) {
    throw new Error(friendlyCloudError(opts.backend, res.status, await res.text(), opts.model))
  }
  const reader = res.body?.getReader()
  if (!reader) throw new Error(`Keine Response-Daten von ${label}`)

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

// Historischer Name — OpenRouter-Streaming, bestehende Aufrufer bleiben gültig.
export async function streamOpenRouterChat(
  messages: ChatMessage[],
  opts: { apiKey: string; model: string; signal?: AbortSignal },
  onToken: (delta: string) => void
): Promise<string> {
  return streamCloudChat(messages, { ...opts, backend: 'openrouter' }, onToken)
}

// ─── Cloud (OpenRouter/LLMBase): Modell-Liste (für Settings-Picker) ──────────

export interface OpenRouterModelInfo {
  id: string
  name: string
  contextLength?: number
  promptPrice?: string        // USD pro 1M Tokens, als String wie vom Provider geliefert
}

export async function listCloudModels(backend: CloudChatBackend, apiKey: string): Promise<OpenRouterModelInfo[]> {
  const { label, baseUrl } = CLOUD_PROVIDERS[backend]
  const res = await fetch(`${baseUrl}/models`, {
    headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`${label} Modell-Liste ${res.status}: ${await res.text()}`)
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

// Historischer Name — bestehende Aufrufer bleiben gültig.
export async function listOpenRouterModels(apiKey: string): Promise<OpenRouterModelInfo[]> {
  return listCloudModels('openrouter', apiKey)
}
