// Zeichenlimits der ElevenLabs-Modelle für eine Sprachanfrage.
//
// Warum als Tabelle und nicht als eine Konstante in der Komponente: In den
// Einstellungen stehen drei Modelle zur Auswahl, gespeichert wird aber ein freier
// String (`speech.elevenlabsModel`). Ein Nutzer kann also eine unbekannte Modell-ID
// im Feld haben — dann gilt der konservative Wert, nicht der größte.
//
// Quelle: elevenlabs.io/docs/models, abgerufen 09/2026. `eleven_turbo_v2_5` ist
// abgekündigt und dort nicht mehr mit Limit gelistet — deshalb konservativ.
// Die Zahlen gehören beim nächsten Modellwechsel gegengeprüft.

export const ELEVENLABS_CHAR_LIMITS: Record<string, number> = {
  eleven_multilingual_v2: 10000,
  eleven_flash_v2_5: 40000,
  eleven_turbo_v2_5: 10000
}

/** Konservativer Wert für unbekannte oder leere Modell-IDs. */
export const ELEVENLABS_FALLBACK_CHAR_LIMIT = 10000

export function getElevenLabsCharLimit(modelId: string): number {
  return ELEVENLABS_CHAR_LIMITS[modelId] ?? ELEVENLABS_FALLBACK_CHAR_LIMIT
}

export interface TtsLengthCheck {
  ok: boolean
  chars: number
  limit: number
}

/**
 * Prüft die Textlänge VOR dem Netzwerkaufruf. ElevenLabs rechnet nach Zeichen ab —
 * ein Lauf, der serverseitig am Limit scheitert, kostet trotzdem.
 */
export function checkTtsLength(text: string, modelId: string): TtsLengthCheck {
  const chars = text.length
  const limit = getElevenLabsCharLimit(modelId)
  return { ok: chars > 0 && chars <= limit, chars, limit }
}
