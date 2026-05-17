// Coach-Conversation-Loop. Kombiniert KB-Retrieval, System-Prompt-Build, den
// bestehenden chatClient (Ollama/Anthropic mit auto-Backend) und parsing der
// Action-Vorschläge. Liefert {text, actions} pro User-Turn an die IPC-Ebene.
//
// Kein Streaming im MVP — chatClient liefert ganze Responses. Latenz auf Ollama
// (Sonnet ~2-4 s) ist akzeptabel und vereinfacht die IPC erheblich.

import { app, safeStorage } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { chat, type ChatBackend, type ChatMessage } from '../chatClient'
import { retrieveKb } from './coachKbRetriever'
import { buildSystemPrompt, buildQaSystemPrompt, greeting, type Language } from './coachPrompt'
import { extractActionFence, validateAction, type CoachAction } from './coachActions'

// Anthropic-Key wird im Telegram-Modul über safeStorage in
// userData/anthropic-api-key.enc gespeichert. Wir lesen dieselbe Datei.
function getAnthropicKeyPath(): string {
  return path.join(app.getPath('userData'), 'anthropic-api-key.enc')
}
async function loadAnthropicKey(): Promise<string | null> {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const encrypted = await fs.readFile(getAnthropicKeyPath())
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

async function isOllamaReachable(url = 'http://localhost:11434'): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

export type CoachBackendDetail = 'anthropic' | 'ollama' | 'none'

export interface CoachPrecheckResult {
  backend: CoachBackendDetail
  detail: string
}

export async function coachPrecheck(): Promise<CoachPrecheckResult> {
  const anthropicKey = await loadAnthropicKey()
  if (anthropicKey) {
    return { backend: 'anthropic', detail: 'Anthropic-API-Key vorhanden' }
  }
  if (await isOllamaReachable()) {
    return { backend: 'ollama', detail: 'Ollama lokal erreichbar' }
  }
  return {
    backend: 'none',
    detail: 'Weder Anthropic-Key noch Ollama verfügbar. Bitte in den Einstellungen einrichten.'
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
  backend: 'ollama' | 'anthropic'
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

  // 3. Backend-Auswahl: chatClient mit 'auto' — versucht erst Ollama, sonst Anthropic
  const anthropicKey = await loadAnthropicKey()
  const backend: ChatBackend = 'auto'

  // History limitieren (max 12 Nachrichten = ~6 Turns) — Context-Window-Schutz
  const limitedHistory = input.history.slice(-12)

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...limitedHistory,
    { role: 'user', content: input.userText }
  ]

  const result = await chat(messages, {
    backend,
    anthropicApiKey: anthropicKey ?? undefined,
    maxTokens: 1200
  })

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
  /** Bewusste Backend-Wahl vom User. Default-Verhalten: privacy-first lokal.
   *  Anthropic nur wenn der User explizit umschaltet. */
  backend?: 'ollama' | 'anthropic'
}

export interface CoachAskResult {
  text: string
  backend: 'ollama' | 'anthropic'
}

export async function coachAsk(input: CoachAskInput): Promise<CoachAskResult> {
  // KB-Retrieval auf Basis der Frage (Top-4, da Q&A oft mehrere Kontexte braucht)
  const kbHits = await retrieveKb(input.question, 4)
  const kbDocs = kbHits.map(h => h.doc)

  const system = buildQaSystemPrompt({ kbDocs, language: input.language })
  const anthropicKey = await loadAnthropicKey()
  // Privacy-first: explizite Backend-Wahl respektieren. Default ist 'ollama',
  // selbst wenn ein Anthropic-Key vorhanden ist — der Cloud-Modus wird erst
  // aktiv, wenn der User ihn im CoachBot bewusst umschaltet.
  const backend: ChatBackend = input.backend === 'anthropic' ? 'anthropic' : 'ollama'

  // Wenn der User Cloud will, aber kein Key da ist → klarer Fehler
  if (backend === 'anthropic' && !anthropicKey) {
    throw new Error(
      input.language === 'de'
        ? 'Cloud-Modus (Claude) gewählt, aber kein Anthropic-API-Key gespeichert. Wechsle auf Lokal oder trage einen Key ein (Settings → Telegram).'
        : 'Cloud mode (Claude) selected but no Anthropic API key stored. Switch to Local or add a key (Settings → Telegram).'
    )
  }

  const limitedHistory = input.history.slice(-10)
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...limitedHistory,
    { role: 'user', content: input.question }
  ]

  const result = await chat(messages, {
    backend,
    anthropicApiKey: anthropicKey ?? undefined,
    // 1400 reicht für normale Q&A (≈700 Token Antwort) und für Mini-Kurse
    // (Code-Blöcke + Lektionen) ohne abgeschnittene Antworten.
    maxTokens: 1400
  })

  return { text: result.text.trim(), backend: result.backend }
}
