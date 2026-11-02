// Preise (und Kontextfenster) der Cloud-Modelle — gecacht, damit die Kostenrechnung nicht bei jedem
// Aufruf den Katalog abfragt.
//
// Warum überhaupt Preise, wenn OpenRouter den Betrag mitliefert? Weil LLMBase es
// NICHT tut. Dort ist der Katalogpreis die einzige Quelle, und er muss zum
// Zeitpunkt des Aufrufs gelten — ein später geänderter Preis darf einen alten
// Lauf nicht rückwirkend teurer machen.
//
// Der Katalog wird höchstens einmal je Backend und Sitzung geholt. Schlägt das
// fehl, bleibt der Preis unbekannt: Der Lauf wird dann als „ohne Preis" gezählt,
// nicht als kostenlos (siehe shared/llmCost.ts).

import { parseModelPricing, type ModelPricing } from '../../shared/llmCost'
import type { CloudChatBackend } from './chatClient'

const TTL_MS = 6 * 60 * 60 * 1000   // Preise ändern sich selten; ein halber Tag reicht.

interface CacheEntry {
  fetchedAt: number
  byModel: Map<string, ModelPricing>
  // Kontextfenster laut Katalog (context_length) — derselbe Abruf, kein zweiter Request.
  contextByModel: Map<string, number>
  // Bildeingabe laut Katalog: OpenRouter `architecture.input_modalities`, LLMBase laut Codex F34
  // `input_modalities` auf oberster Ebene (dort noch nicht am echten Zugang geprüft).
  imageInputByModel: Map<string, boolean>
}

const cache = new Map<CloudChatBackend, CacheEntry>()
const inFlight = new Map<CloudChatBackend, Promise<void>>()

/**
 * LLMBase liefert Preise NUR mit `?metadata=true` — ohne den Parameter fehlt das
 * `pricing`-Feld komplett (geprüft am Livekatalog, 27.08.2026). OpenRouter liefert
 * sie ohnehin; der Parameter stört dort nicht.
 */
function catalogUrl(baseUrl: string): string {
  return `${baseUrl}/models?metadata=true`
}

async function refresh(backend: CloudChatBackend, baseUrl: string, apiKey: string | undefined): Promise<void> {
  const res = await fetch(catalogUrl(baseUrl), {
    headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`Preiskatalog ${backend}: ${res.status}`)
  const json = await res.json() as { data?: Array<{ id?: string; pricing?: unknown; context_length?: unknown; input_modalities?: unknown; architecture?: { input_modalities?: unknown } }> }
  const byModel = new Map<string, ModelPricing>()
  const contextByModel = new Map<string, number>()
  const imageInputByModel = new Map<string, boolean>()
  for (const m of json.data ?? []) {
    if (!m.id) continue
    const pricing = parseModelPricing(m.pricing)
    if (pricing) byModel.set(m.id, pricing)
    if (typeof m.context_length === 'number' && Number.isFinite(m.context_length) && m.context_length > 0) {
      contextByModel.set(m.id, m.context_length)
    }
    const modalities = m.architecture?.input_modalities ?? m.input_modalities
    if (Array.isArray(modalities)) imageInputByModel.set(m.id, modalities.includes('image'))
  }
  cache.set(backend, { fetchedAt: Date.now(), byModel, contextByModel, imageInputByModel })
}

/**
 * Preis eines Modells. Holt den Katalog bei Bedarf nach und gibt null zurück,
 * wenn er nicht verfügbar war — der Aufrufer darf daraus KEINE 0 machen.
 */
export async function getModelPricing(
  backend: CloudChatBackend,
  baseUrl: string,
  model: string,
  apiKey?: string
): Promise<ModelPricing | null> {
  await ensureCatalog(backend, baseUrl, apiKey)
  return cache.get(backend)?.byModel.get(model) ?? null
}

/**
 * Kontextfenster eines Modells laut Katalog (roh, ohne Abschlag — den setzt
 * shared/contextBudget.ts). null = Katalog nicht erreichbar oder Modell ohne Angabe;
 * dann rechnet der Agent weiter mit der vorsichtigen Annahme.
 */
export async function getModelContextLength(
  backend: CloudChatBackend,
  baseUrl: string,
  model: string,
  apiKey?: string
): Promise<number | null> {
  await ensureCatalog(backend, baseUrl, apiKey)
  return cache.get(backend)?.contextByModel.get(model) ?? null
}

/**
 * Nimmt das Modell Bilder an? 'unknown', wenn der Katalog nicht erreichbar ist oder für
 * das Modell keine Eingabearten nennt — dann geht das Bild mit und ein Fehler des Anbieters
 * wird gemeldet, nie still ohne Bild weiter (Rev. 7 Punkt 21).
 */
export async function getModelImageInput(
  backend: CloudChatBackend,
  baseUrl: string,
  model: string,
  apiKey?: string
): Promise<'yes' | 'no' | 'unknown'> {
  await ensureCatalog(backend, baseUrl, apiKey)
  const v = cache.get(backend)?.imageInputByModel.get(model)
  return v === undefined ? 'unknown' : v ? 'yes' : 'no'
}

async function ensureCatalog(backend: CloudChatBackend, baseUrl: string, apiKey: string | undefined): Promise<void> {
  const entry = cache.get(backend)
  const stale = !entry || Date.now() - entry.fetchedAt > TTL_MS
  if (stale) {
    // Parallele Aufrufe teilen sich EINE Abfrage — im Agenten-Loop laufen sonst
    // bis zu zwölf Iterationen kurz hintereinander gegen den Katalog.
    let pending = inFlight.get(backend)
    if (!pending) {
      pending = refresh(backend, baseUrl, apiKey).catch(() => undefined).finally(() => inFlight.delete(backend))
      inFlight.set(backend, pending)
    }
    await pending
  }
}

/** Für Tests. */
export function clearPricingCache(): void {
  cache.clear()
  inFlight.clear()
}
