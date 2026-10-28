// Welche Modelle gehören in eine Chat-Auswahl?
//
// Die Picker zeigten alle installierten Ollama-Modelle, auch Embedding- und Bildmodelle.
// Wer z. B. `bge-m3` (für Smart Connections/Vault-Index) als Chat-Modell wählte, bekam
// nur „Ollama API Fehler: 400" (real, 28.10.2026). Ohne gewähltes Modell griff die App
// außerdem einfach zum ersten Listeneintrag — das kann genau so ein Modell sein.
//
// Regel: Meldet Ollama Fähigkeiten (`/api/tags` → `capabilities`), zählt nur `completion`.
// Meldet es keine (ältere Versionen, LM Studio), bleibt das Modell drin — außer der Name
// sagt eindeutig Embedding/Reranker. Reranker melden teils `completion`, chatten aber nicht.

import { isNonGenerativeModel } from './modelCompatibility'

export interface ModelListEntry {
  name: string
  capabilities?: string[]
}

export function isChatModel(model: ModelListEntry): boolean {
  if (isNonGenerativeModel(model.name)) return false
  if (Array.isArray(model.capabilities)) return model.capabilities.includes('completion')
  return true
}

export function chatModelsOnly<T extends ModelListEntry>(models: readonly T[]): T[] {
  return models.filter(isChatModel)
}

/** Erstes chatfähiges Modell für die automatische Vorauswahl, sonst ''. */
export function firstChatModel(models: readonly ModelListEntry[]): string {
  return models.find(isChatModel)?.name ?? ''
}

/**
 * Ist ein gespeichertes Modell nachweislich ungeeignet? Nur wenn es in der Liste steht
 * und dort als nicht chatfähig erkannt wird — ein nicht (mehr) installiertes Modell
 * ist ein anderes Problem und wird hier nicht gemeldet.
 */
export function isKnownNonChatModel(name: string, models: readonly ModelListEntry[]): boolean {
  if (!name) return false
  const entry = models.find(m => m.name === name)
  return !!entry && !isChatModel(entry)
}
