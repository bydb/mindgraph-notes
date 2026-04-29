// Agent-Loop für den Telegram-Bot.
// Wechsel zwischen LLM und Tool-Ausführung, bis das Modell fertig ist
// (keine tool_calls mehr) oder das Iterations-Limit erreicht ist.
//
// Schreib-Tools erfordern Bestätigung: der Loop ruft `requestConfirm` auf,
// das eine Telegram-Nachricht mit Inline-Buttons schickt und auf die
// Entscheidung wartet (siehe confirm.ts).

import { chatWithTools, type ChatMessage, type ChatOptions, type ToolCall } from '../../llm/chatClient'
import type { ToolRegistry, ToolContext } from './tools/registry'

export interface AgentRunOptions {
  registry: ToolRegistry
  toolContext: ToolContext
  allowedTools: Set<string>           // Whitelist aus Settings
  confirmRequiredTools: Set<string>   // Untermenge: braucht Confirm bevor ausgeführt
  maxIterations: number
  chatOptions: ChatOptions
  /** Sendet einen kurzen Status (z. B. "📝 lege Notiz an…") an den User. */
  onProgress?: (message: string) => Promise<void>
  /** Fragt den User nach Confirm. Resolve mit true = approve, false = deny. */
  requestConfirm?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
}

export interface AgentRunResult {
  text: string                        // finale Antwort des Modells
  iterations: number
  toolCallsExecuted: number
  toolCallsDenied: number
  hitMaxIterations: boolean
  backend: 'ollama' | 'anthropic'
}

function buildSystemPrompt(allowedTools: string[]): string {
  const toolList = allowedTools.length > 0 ? allowedTools.join(', ') : '(keine — beantworte ohne Tools)'
  return `Du bist Jochens MindGraph-Agent. Du kannst Notizen suchen, lesen, neu anlegen, ergänzen und Tasks im Vault verwalten.

VERFÜGBARE TOOLS (exakt diese Namen verwenden, mit Unterstrich!): ${toolList}

KRITISCH:
- Wenn du ein Tool nutzen willst, RUFE ES STRUKTURIERT auf (über das tools-API). Schreibe NIEMALS \`{"name": "...", "parameters": {...}}\` als Text in deine Antwort — das funktioniert nicht und verwirrt.
- Tool-Namen sind genau so zu schreiben wie oben: note_create (NICHT notecreate, NICHT noteCreate, NICHT create_note).

REGELN:
- Antworte AUSSCHLIESSLICH auf Deutsch.
- Nutze Tools, wenn du Informationen brauchst oder etwas ändern sollst — rate niemals Notiz-Inhalte.
- Bei Schreib-Operationen (note_create, note_append, task_toggle): formuliere präzise, was du tun willst — der Nutzer bekommt einen Bestätigungs-Dialog.
- Wenn ein Tool fehlschlägt, erkläre kurz das Problem und versuche es nicht stumpf nochmal.
- Schließe IMMER mit einer kurzen Zusammenfassung (max. 200 Wörter, Telegram-Markdown, *Stern* für fett).
- Kein Gendern (keine Sternchen oder Doppelpunkte bei Personenbezeichnungen).
- Keine langen Aufzählungen — fasse zusammen.`
}

let fallbackToolCallCounter = 0

function nextFallbackToolCallId(): string {
  fallbackToolCallCounter += 1
  return `text_tc_${Date.now().toString(36)}_${fallbackToolCallCounter}`
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : trimmed
}

function extractTextToolCalls(text: string, allowedTools: Set<string>): ToolCall[] {
  const candidates = [stripMarkdownFence(text)]
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(stripMarkdownFence(text.slice(firstBrace, lastBrace + 1)))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      const items = Array.isArray(parsed) ? parsed : [parsed]
      const calls: ToolCall[] = []
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const obj = item as Record<string, unknown>
        const name = typeof obj.name === 'string' ? obj.name : undefined
        if (!name || !allowedTools.has(name)) continue
        const rawArgs = obj.arguments ?? obj.parameters ?? {}
        const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
          ? rawArgs as Record<string, unknown>
          : {}
        calls.push({
          id: nextFallbackToolCallId(),
          name,
          arguments: args
        })
      }
      if (calls.length > 0) return calls
    } catch {
      // Kein reines JSON-Tool-Objekt; normales Antwortverhalten.
    }
  }
  return []
}

export async function runAgent(
  userInput: string,
  opts: AgentRunOptions
): Promise<AgentRunResult> {
  const allowedToolList = Array.from(opts.allowedTools)
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(allowedToolList) },
    { role: 'user', content: userInput }
  ]

  const tools = opts.registry.toolDefinitionsFor(opts.allowedTools)
  console.log(`[Telegram Agent] start: allowedTools=${allowedToolList.join(', ')}, maxIterations=${opts.maxIterations}, input="${userInput.slice(0, 160)}"`)
  let iterations = 0
  let toolCallsExecuted = 0
  let toolCallsDenied = 0
  let lastBackend: 'ollama' | 'anthropic' = 'ollama'
  let lastText = ''

  while (iterations < opts.maxIterations) {
    iterations += 1
    const result = await chatWithTools(messages, tools, opts.chatOptions)
    lastBackend = result.backend
    lastText = result.text

    const textToolCalls = result.toolCalls.length === 0
      ? extractTextToolCalls(result.text, opts.allowedTools)
      : []
    const toolCalls = result.toolCalls.length > 0 ? result.toolCalls : textToolCalls
    const assistantMessage: ChatMessage = textToolCalls.length > 0
      ? { role: 'assistant', content: result.text, tool_calls: textToolCalls }
      : result.assistantMessage

    console.log(`[Telegram Agent] iteration=${iterations}, backend=${result.backend}, textChars=${result.text.length}, toolCalls=${toolCalls.map(c => c.name).join(', ') || '(none)'}${textToolCalls.length > 0 ? ' (text-fallback)' : ''}`)

    messages.push(assistantMessage)

    if (toolCalls.length === 0) {
      // Modell hat eine reine Text-Antwort gegeben → fertig
      return {
        text: result.text,
        iterations,
        toolCallsExecuted,
        toolCallsDenied,
        hitMaxIterations: false,
        backend: result.backend
      }
    }

    // Tool-Aufrufe nacheinander abarbeiten
    for (const call of toolCalls) {
      const tool = opts.registry.get(call.name)
      if (!tool) {
        const known = Array.from(opts.allowedTools).join(', ')
        const hint = `Fehler: unbekanntes Tool "${call.name}". Verfügbare Tools: ${known}. Nutze ausschließlich diese Namen — auf den Unterstrich achten (z. B. note_create, NICHT notecreate).`
        if (opts.onProgress) {
          await opts.onProgress(`⚠️ _LLM rief unbekanntes Tool_ \`${call.name}\` _— korrigiere zu_ \`${known.split(',')[0].trim()}\` _und versuche es nochmal._`).catch(() => undefined)
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          tool_name: call.name,
          content: hint
        })
        continue
      }
      if (!opts.allowedTools.has(call.name)) {
        if (opts.onProgress) {
          await opts.onProgress(`⚠️ _Tool_ \`${call.name}\` _ist in den Bot-Settings nicht freigegeben — Aufruf übersprungen._`).catch(() => undefined)
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          tool_name: call.name,
          content: `Fehler: Tool "${call.name}" ist in den Bot-Settings deaktiviert. Schlage etwas anderes vor oder erkläre dem Nutzer, dass dieses Tool zuerst in MindGraph → Einstellungen → Telegram → Aktive Tools aktiviert werden muss.`
        })
        continue
      }

      // Confirm-Flow für Schreib-Tools. Das isWrite-Flag ist die harte
      // Sicherheitsgrenze; confirmRequiredTools bleibt als zusätzliche Settings-Schicht.
      if (tool.isWrite || opts.confirmRequiredTools.has(call.name)) {
        const approved = opts.requestConfirm
          ? await opts.requestConfirm(call.name, call.arguments)
          : true
        if (!approved) {
          toolCallsDenied += 1
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            tool_name: call.name,
            content: `Vom Nutzer abgelehnt. Bitte schlage etwas anderes vor oder beende die Aktion.`
          })
          continue
        }
      }

      // Ausführen
      try {
        console.log(`[Telegram Agent] run tool: ${call.name} args=${JSON.stringify(call.arguments).slice(0, 500)}`)
        const toolResult = await tool.run(call.arguments, opts.toolContext)
        toolCallsExecuted += 1
        if (toolResult.display && opts.onProgress) {
          await opts.onProgress(toolResult.display).catch(() => undefined)
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          tool_name: call.name,
          content: toolResult.content
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          tool_name: call.name,
          content: `Tool-Fehler: ${msg}`
        })
      }
    }
  }

  // Iterationen aufgebraucht — gib zurück, was wir haben
  return {
    text: lastText || '_Iterations-Limit erreicht ohne abschließende Antwort._',
    iterations,
    toolCallsExecuted,
    toolCallsDenied,
    hitMaxIterations: true,
    backend: lastBackend
  }
}
