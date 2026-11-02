/**
 * Darf ein Bild an dieses Modell? Rev. 7 Punkt 21/22 (docs/codex-collab/chat-verlauf-notizen-bilder.md).
 *
 * Pure Entscheidung, aufgerufen im Main am wirklichen Request, bevor ein Bild in eine
 * Anbieter-Nutzlast umgewandelt wird (Codex F40). Der Renderer zeigt dieselbe Regel nur an.
 * Jede Ablehnung nennt den Grund und den nächsten Schritt — nie still ohne Bild weiter.
 */

export const CHAT_IMAGE_CLOUD_CONSENT_VERSION = 1
/** Anteil des Kontextfensters, den Bilder einer Anfrage höchstens belegen dürfen (F35). */
export const CHAT_IMAGE_WINDOW_SHARE = 0.5

export type ChatImageRoute =
  | { kind: 'ollama-local'; model: string; capabilities?: string[] }
  | { kind: 'ollama-cloud'; model: string }
  | { kind: 'ollama-unresolved'; model: string; reason: string }
  | { kind: 'lmstudio' }
  | {
      kind: 'cloud'
      provider: 'openrouter' | 'llmbase'
      model: string
      /** Bild-Zustimmung für genau diesen Anbieter. */
      imageConsent: boolean
      /** Bildeingabe laut Katalog; 'unknown' = Katalog sagt nichts. */
      vision: 'yes' | 'no' | 'unknown'
      contextWindow: number
    }

export interface ChatImageGateInput {
  mode: string
  web: boolean
  route: ChatImageRoute
  imageTokens: number
}

export type ChatImageGateResult =
  | { ok: true; route: 'local' | 'cloud'; target: string }
  | { ok: false; code: ChatImageRejectCode; reason: string }

export type ChatImageRejectCode =
  | 'mode'
  | 'web'
  | 'no-vision'
  | 'unknown-capabilities'
  | 'unresolved'
  | 'ollama-cloud'
  | 'lmstudio'
  | 'no-consent'
  | 'too-large'

const PROVIDER_LABEL = { openrouter: 'OpenRouter', llmbase: 'LLMBase' } as const

export function decideChatImageRoute(input: ChatImageGateInput): ChatImageGateResult {
  const { route } = input
  if (input.mode !== 'petrol') return { ok: false, code: 'mode', reason: 'Bilder gibt es nur im Chat des Agent-Tabs.' }
  if (input.web) return { ok: false, code: 'web', reason: 'Bild und Websuche gehen nicht zusammen. Globus ausschalten, um nach dem Bild zu fragen.' }
  switch (route.kind) {
    case 'ollama-local': {
      if (!route.capabilities) {
        return { ok: false, code: 'unknown-capabilities', reason: `Ollama meldet für „${route.model}“ nicht, ob es Bilder versteht. Bitte Ollama aktualisieren.` }
      }
      if (!route.capabilities.includes('vision') || !route.capabilities.includes('completion')) {
        return { ok: false, code: 'no-vision', reason: `„${route.model}“ kann keine Bilder ansehen. Ein Modell mit Bildverständnis wählen oder den Text im Bild per Texterkennung lesen lassen.` }
      }
      return { ok: true, route: 'local', target: route.model }
    }
    case 'ollama-cloud':
      return { ok: false, code: 'ollama-cloud', reason: `„${route.model}“ rechnet bei Ollama in der Cloud. Bilder gehen nur an lokale Modelle oder über OpenRouter/LLMBase.` }
    case 'ollama-unresolved':
      return { ok: false, code: 'unresolved', reason: `Nicht prüfbar, ob „${route.model}“ lokal rechnet (${route.reason}). Das Bild wird nicht gesendet.` }
    case 'lmstudio':
      return { ok: false, code: 'lmstudio', reason: 'Mit LM Studio gehen noch keine Bilder. Bilder nur über Ollama oder OpenRouter/LLMBase.' }
    case 'cloud': {
      const label = PROVIDER_LABEL[route.provider]
      if (route.vision === 'no') {
        return { ok: false, code: 'no-vision', reason: `„${route.model}“ nimmt laut ${label} keine Bilder an. Ein Modell mit Bildeingabe wählen.` }
      }
      // OpenRouter meldet Eingabearten im Katalog; ohne Bestätigung kein Bild (Codex F44).
      // LLMBase: Katalogangabe unbelegt — dort geht das Bild bei „unbekannt“ mit, ein Fehler
      // des Anbieters wird gemeldet (Rev. 7 Punkt 21, bewusste Ausnahme).
      if (route.vision === 'unknown' && route.provider === 'openrouter') {
        return { ok: false, code: 'unknown-capabilities', reason: `${label} bestätigt für „${route.model}“ gerade nicht, dass es Bilder annimmt (Katalog nicht erreichbar oder ohne Angabe). Später erneut versuchen oder ein anderes Modell wählen.` }
      }
      if (!route.imageConsent) {
        return { ok: false, code: 'no-consent', reason: `Bilder an ${label} sind nicht freigegeben. Die Freigabe steht an der Bildmarke und in Einstellungen → Cloud-Anbieter.` }
      }
      const limit = Math.floor(route.contextWindow * CHAT_IMAGE_WINDOW_SHARE)
      if (input.imageTokens > limit) {
        return { ok: false, code: 'too-large', reason: `Die Bilder brauchen geschätzt ${input.imageTokens} Token, erlaubt sind ${limit}. Weniger oder kleinere Bilder senden.` }
      }
      return { ok: true, route: 'cloud', target: `${label} · ${route.model}` }
    }
  }
}

/**
 * Ollama-Kontextgröße für eine Anfrage mit Bildern. Ohne `num_ctx` schneidet Ollama einen
 * zu langen Prompt still vorne ab — mit Bildern fiele dann der Systemtext weg.
 */
export function ollamaNumCtxForImages(textChars: number, imageTokens: number): number {
  const need = Math.ceil(textChars / 3) + imageTokens + 2048
  const rounded = Math.ceil(need / 2048) * 2048
  return Math.min(32_768, Math.max(8192, rounded))
}
