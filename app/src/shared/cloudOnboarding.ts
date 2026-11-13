// Einrichtung eines Cloud-Anbieters im Onboarding (13.11.2026).
//
// Auslöser: Wer keinen Rechner für lokale Modelle hat, kam im Onboarding nicht weiter — der
// KI-Schritt kannte nur Ollama und LM Studio. OpenRouter und LLMBase lagen in den
// Einstellungen, mit sieben Handgriffen. Hier steht die pure Logik des geführten Wegs;
// die Oberfläche liegt in renderer/components/Onboarding/CloudSetup.tsx.
//
// KEINE Renderer-/Node-Importe (wird getestet und könnte im Main gebraucht werden).

import type { CloudFeatureId, CloudProviderSettings } from './llmBackend'

/**
 * Was die Sammelfreigabe im Onboarding einschaltet. Bewusst OHNE 'email-draft': Mail-Inhalte
 * betreffen Dritte und behalten ihre eigene Rückfrage in den Einstellungen. Die Mail-Analyse
 * wird ohnehin im E-Mail-Tab gewählt. Der Notiz-Agent verlangt beim ersten Cloud-Lauf
 * zusätzlich seine eigene Zustimmung zum Vault-Zugriff — die erteilt das Onboarding nicht.
 */
export const ONBOARDING_CLOUD_FEATURES: CloudFeatureId[] = ['notes-chat', 'note-edit', 'quiz', 'note-agent']

/** Unter dieser Größe schlägt das Onboarding den Anbieter-Weg vor (gleiche Schwelle wie der Schonmodus). */
export const CLOUD_SUGGEST_BELOW_RAM_GB = 16

/**
 * Anbieter-Weg vorauswählen? Nur, wenn der Arbeitsspeicher bekannt und knapp ist UND noch
 * kein lokales Modell da ist. Wer schon ein Modell eingerichtet hat, wird nicht umgelenkt.
 */
export function shouldSuggestCloud(totalRamGb: number | null, hasLocalModel: boolean): boolean {
  return !hasLocalModel && totalRamGb !== null && totalRamGb < CLOUD_SUGGEST_BELOW_RAM_GB
}

export interface CloudModelEntry {
  id: string
  name?: string
  promptPrice?: string
}

/** Kostenlos nutzbar (OpenRouter „:free“ oder Preis 0). */
export function isFreeCloudModel(m: CloudModelEntry): boolean {
  if (/:free$/i.test(m.id)) return true
  return m.promptPrice != null && m.promptPrice !== '' && parseFloat(m.promptPrice) === 0
}

// Keine Textmodelle bzw. Sonderformen, die als Vorschlag nichts taugen.
const NOT_FOR_CHAT = /embed|rerank|ocr|whisper|tts|speech|image|guard|moderation|vision-exp/i

/** Taugt das Modell für Chat und Aufträge? Embedding-, OCR-, Sprach- und Bildmodelle nicht. */
export function isChatCloudModel(m: CloudModelEntry): boolean {
  return !!m.id && !NOT_FOR_CHAT.test(m.id)
}

// Vorschlagsreihenfolge. Familien, mit denen die App real gelaufen ist (Agent-Läufe und
// Karteikarten über OpenRouter/LLMBase) — KEIN Benchmark-Ergebnis. Günstige Allrounder zuerst.
// Als Muster statt fester IDs, weil die Kataloge Versionen laufend ersetzen
// (aus deepseek-v4-flash wurde binnen Monaten deepseek-v4.1-flash).
const PREFERRED_FAMILIES: RegExp[] = [
  /^deepseek\/deepseek-v[\d.]+-flash$/i,
  /^deepseek\/deepseek-v[\d.]+-pro$/i,
  /^qwen\/qwen[\d.]+-27b$/i,
  /^moonshotai\/kimi-k[\d.]+$/i
]

function versionOf(id: string): number {
  const m = /(\d+(?:\.\d+)?)/.exec(id.split('/').pop() ?? id)
  return m ? parseFloat(m[1]) : 0
}

/**
 * Schlägt aus dem Live-Katalog ein Modell vor oder gibt null zurück (dann wählt der Nutzer).
 * `freeOnly`: nur kostenlose Modelle (OpenRouter zum Ausprobieren).
 */
export function recommendCloudModel(models: CloudModelEntry[], opts: { freeOnly?: boolean } = {}): string | null {
  const pool = models.filter(m => {
    if (!m.id || m.id.startsWith('~') || NOT_FOR_CHAT.test(m.id)) return false
    const free = isFreeCloudModel(m)
    if (opts.freeOnly) return free
    // Ohne freeOnly keine Sondertarife (":batch", ":free", ":nitro" …) vorschlagen.
    return !m.id.includes(':')
  })
  for (const family of PREFERRED_FAMILIES) {
    const hits = pool.filter(m => family.test(m.id.replace(/:free$/i, '')))
    if (hits.length) return hits.sort((a, b) => versionOf(b.id) - versionOf(a.id))[0].id
  }
  return null
}

/** Schlüssel grob prüfen, bevor er gespeichert wird: fängt versehentlich eingefügte Sätze/URLs ab. */
export function looksLikeApiKey(raw: string): boolean {
  const key = raw.trim()
  return key.length >= 16 && !/\s/.test(key) && !/^https?:/i.test(key)
}

/** Einstellungen nach erfolgreicher Einrichtung: Anbieter an, Modell gesetzt, Sammelfreigabe ergänzt. */
export function applyCloudOnboarding(settings: CloudProviderSettings, model: string): CloudProviderSettings {
  const features = new Set<CloudFeatureId>(settings.cloudFeatures ?? [])
  for (const f of ONBOARDING_CLOUD_FEATURES) features.add(f)
  return { ...settings, enabled: true, hasApiKey: true, model: model.trim(), cloudFeatures: Array.from(features) }
}
