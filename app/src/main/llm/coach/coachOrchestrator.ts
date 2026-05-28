// Coach-Conversation-Loop. Kombiniert KB-Retrieval, System-Prompt-Build, den
// bestehenden chatClient (Ollama — lokal oder Ollama-Cloud, z.B.
// `ministral-3:14b-cloud`) und das Parsing der Action-Vorschläge. Liefert
// {text, actions} pro User-Turn an die IPC-Ebene.

import { chat, type ChatMessage } from '../chatClient'
import { retrieveKb } from './coachKbRetriever'
import { buildSystemPrompt, buildQaSystemPrompt, greeting, type Language } from './coachPrompt'
import { extractActionFence, validateAction, type CoachAction } from './coachActions'

async function isOllamaReachable(url = 'http://localhost:11434'): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

export type CoachBackendDetail = 'ollama' | 'none'

export interface CoachPrecheckResult {
  backend: CoachBackendDetail
  detail: string
}

export async function coachPrecheck(): Promise<CoachPrecheckResult> {
  if (await isOllamaReachable()) {
    return { backend: 'ollama', detail: 'Ollama lokal erreichbar' }
  }
  return {
    backend: 'none',
    detail: 'Ollama nicht erreichbar. Bitte Ollama starten oder ein -cloud-Modell mit `ollama signin` einrichten.'
  }
}

export interface CoachTurnInput {
  userText: string
  history: ChatMessage[]            // bisherige Conversation (ohne System)
  vaultReady: boolean
  acceptedActionIds: string[]
  acceptedActionTypes: string[]    // parallel — damit Pflicht-Regeln (z.B. "Editor-Mode gewählt") prüfbar sind
  language: Language
}

export interface CoachTurnResult {
  text: string
  actions: CoachAction[]
  assistantMessage: ChatMessage    // an History anhängen
  backend: 'ollama'
  parseWarnings: string[]          // ungültige Action-Vorschläge wandern hierher
}

let actionIdCounter = 0
function fallbackActionId(): string {
  actionIdCounter += 1
  return `auto_${Date.now().toString(36)}_${actionIdCounter}`
}

export async function coachTurn(input: CoachTurnInput): Promise<CoachTurnResult> {
  // 1. KB-Retrieval auf Basis der User-Frage (Top-3)
  const kbHits = await retrieveKb(input.userText, 3)
  const kbDocs = kbHits.map(h => h.doc)

  // 2. System-Prompt bauen
  const system = buildSystemPrompt({
    kbDocs,
    language: input.language,
    vaultReady: input.vaultReady,
    acceptedActionIds: input.acceptedActionIds,
    editorModeChosen: input.acceptedActionTypes.includes('set-editor-mode')
  })

  // History limitieren (max 12 Nachrichten = ~6 Turns) — Context-Window-Schutz
  const limitedHistory = input.history.slice(-12)

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...limitedHistory,
    { role: 'user', content: input.userText }
  ]

  const result = await chat(messages, { maxTokens: 1200 })

  // 4. Action-Fence extrahieren & validieren
  const { text, rawActions } = extractActionFence(result.text)
  const warnings: string[] = []
  const seenIds = new Set<string>()
  const actions: CoachAction[] = []
  for (const raw of rawActions) {
    const v = validateAction(raw, input.vaultReady)
    if (!v.ok) {
      warnings.push(v.reason)
      continue
    }
    let id = v.action.actionId
    if (seenIds.has(id) || input.acceptedActionIds.includes(id)) {
      id = fallbackActionId()
      v.action.actionId = id
    }
    seenIds.add(id)
    actions.push(v.action)
  }

  return {
    text,
    actions,
    assistantMessage: { role: 'assistant', content: result.text }, // raw inkl. Fence speichern, falls erneut geparst werden muss
    backend: result.backend,
    parseWarnings: warnings
  }
}

export interface CoachStartResult {
  greeting: string
  backend: CoachBackendDetail
}

export async function coachStart(language: Language, isRestart = false): Promise<CoachStartResult> {
  const pre = await coachPrecheck()
  return {
    greeting: greeting(language, isRestart),
    backend: pre.backend
  }
}

// ─── Q&A-Mode (CoachBot — dauerhafter Auskunfts-Bot) ──────────────────

export interface CoachAskInput {
  question: string
  history: ChatMessage[]    // ephemerer Verlauf, vom Renderer geliefert
  language: Language
}

export interface CoachAskResult {
  text: string
  backend: 'ollama'
}

export async function coachAsk(input: CoachAskInput): Promise<CoachAskResult> {
  // KB-Retrieval auf Basis der Frage (Top-4, da Q&A oft mehrere Kontexte braucht)
  const kbHits = await retrieveKb(input.question, 4)
  const kbDocs = kbHits.map(h => h.doc)

  const system = buildQaSystemPrompt({ kbDocs, language: input.language })

  const limitedHistory = input.history.slice(-10)
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...limitedHistory,
    { role: 'user', content: input.question }
  ]

  const result = await chat(messages, {
    // 1400 reicht für normale Q&A (≈700 Token Antwort) und für Mini-Kurse
    // (Code-Blöcke + Lektionen) ohne abgeschnittene Antworten.
    maxTokens: 1400
  })

  return { text: result.text.trim(), backend: result.backend }
}
