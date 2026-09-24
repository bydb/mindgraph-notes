// Einstufung des Modellwegs eines Agent-Laufs: lokal, Cloud oder nicht geprüft.
//
// Anlass (Codex-Review agent-vault-search-und-index-abgleich.md, F15/F26/F27): Die Karte
// leitete „lokal“ aus dem Modellnamen ab. Ein Ollama-Modell mit neutralem Namen, das per
// `remote_host` auswärts rechnet, galt so als lokal — und nach dem Start zeigte die Karte
// ein Ollama-Cloud-Modell sogar als lokalen Weg. Die Einstufung trifft jetzt der Main aus
// den Ollama-Metadaten; dieses Modul ist die reine Entscheidungsregel dazu.
//
// Drei Stufen, keine vierte: Was nicht nachweislich lokal ist, ist nicht „lokal“. LM Studio
// wird über Loopback angesprochen, aber `/v1/models` beweist nicht, wo das Modell rechnet —
// deshalb „nicht geprüft“, nie „lokal“.

import { canUseCloudForFeature, type CloudProviderSettings } from './llmBackend'

export type AgentRouteKind = 'local' | 'cloud' | 'unverified'
export type AgentRouteProvider = 'ollama' | 'ollama-cloud' | 'lmstudio' | 'openrouter' | 'llmbase'

export interface AgentRoute {
  kind: AgentRouteKind
  provider: AgentRouteProvider
  /** Anzeigename des Weges: „Ollama“, „Ollama (Cloud)“, „LM Studio“, „OpenRouter“, „LLMBase“. */
  providerLabel: string
  model: string
  /** Bei `unverified`: warum nicht geprüft (Resolver-Grund). */
  reason?: string
}

/** Gründe, die `resolveLocalModel` beim Scheitern liefert (siehe main/rag/localModel.ts). */
export type LocalResolveFailure = 'cloud-tag' | 'remote' | 'missing' | 'ambiguous' | 'no-digest' | 'unreachable' | 'empty' | string

export type ChatBackendForRoute = 'ollama' | 'lmstudio' | 'openrouter' | 'llmbase'

const CLOUD_LABELS: Record<'openrouter' | 'llmbase', string> = {
  openrouter: 'OpenRouter',
  llmbase: 'LLMBase'
}

/**
 * Entscheidungsregel. `ollamaCheck` ist das Ergebnis von `resolveLocalModel` für das
 * Chat-Modell: `{ ok: true }` bei nachweislich lokal, sonst der Fehlergrund.
 */
export function classifyRoute(
  backend: ChatBackendForRoute,
  model: string,
  ollamaCheck?: { ok: true } | { ok: false; reason: LocalResolveFailure }
): AgentRoute {
  if (backend === 'openrouter' || backend === 'llmbase') {
    return { kind: 'cloud', provider: backend, providerLabel: CLOUD_LABELS[backend], model }
  }
  if (backend === 'lmstudio') {
    return { kind: 'unverified', provider: 'lmstudio', providerLabel: 'LM Studio', model, reason: 'lmstudio' }
  }
  // Ollama: ohne Prüfergebnis gilt nichts als lokal (fail-closed für die Aussage).
  if (!ollamaCheck) {
    return { kind: 'unverified', provider: 'ollama', providerLabel: 'Ollama', model, reason: 'not-checked' }
  }
  if (ollamaCheck.ok) {
    return { kind: 'local', provider: 'ollama', providerLabel: 'Ollama', model }
  }
  if (ollamaCheck.reason === 'cloud-tag' || ollamaCheck.reason === 'remote') {
    // Empfänger ist der Ollama-Dienst im Netz, nicht das lokale Programm — so heißt er auch.
    return { kind: 'cloud', provider: 'ollama-cloud', providerLabel: 'ollama.com', model }
  }
  return { kind: 'unverified', provider: 'ollama', providerLabel: 'Ollama', model, reason: ollamaCheck.reason }
}

/**
 * Version der ausdrücklichen Zustimmung zu Cloud-Läufen des Agenten MIT Vault-Zugriff.
 * Bestandsfreigaben („Notiz-Agent: Dateien erzeugen“) deckten das Durchsuchen des ganzen
 * Vaults nicht erkennbar ab (F28) — deshalb einmal neu bestätigen. Steigt die Zahl,
 * müssen alle erneut zustimmen.
 */
export const NOTE_AGENT_CLOUD_CONSENT_VERSION = 1

export function hasCloudConsent(accepted: unknown): boolean {
  return typeof accepted === 'number' && accepted >= NOTE_AGENT_CLOUD_CONSENT_VERSION
}

/**
 * Darf dieser Lauf über einen Cloud-Weg gehen? Reine Regel für den Main-Gate (Codex F28):
 * (1) OpenRouter/LLMBase nur mit Feature-Opt-in `note-agent` und GENAU dem dort eingestellten
 * Modell (ein vom Renderer untergeschobenes anderes Modell fällt durch), (2) jeder Cloud-Weg —
 * auch Ollama-Cloud — nur mit der versionierten Zustimmung. Kein Sperren der Cloud an sich.
 * `ui` ist der Inhalt von ui-settings.json, wie der Main ihn liest.
 */
export function evaluateCloudGate(
  route: AgentRoute,
  cloudModel: string | undefined,
  ui: { ollama?: { openrouter?: CloudProviderSettings; llmbase?: CloudProviderSettings }; noteAgentCloudConsentVersion?: unknown }
): { ok: true } | { ok: false; code: 'optin' | 'consent' } {
  if (route.kind !== 'cloud') return { ok: true }
  if (route.provider === 'openrouter' || route.provider === 'llmbase') {
    const settings = ui.ollama?.[route.provider]
    const configured = settings?.model?.trim() ?? ''
    if (!canUseCloudForFeature('note-agent', settings) || !cloudModel || cloudModel.trim() !== configured) {
      return { ok: false, code: 'optin' }
    }
  }
  if (!hasCloudConsent(ui.noteAgentCloudConsentVersion)) return { ok: false, code: 'consent' }
  return { ok: true }
}

