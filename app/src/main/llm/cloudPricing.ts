// Preise der Cloud-Modelle — gecacht, damit die Kostenrechnung nicht bei jedem
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
  const json = await res.json() as { data?: Array<{ id?: string; pricing?: unknown }> }
  const byModel = new Map<string, ModelPricing>()
  for (const m of json.data ?? []) {
    if (!m.id) continue
    const pricing = parseModelPricing(m.pricing)
    if (pricing) byModel.set(m.id, pricing)
  }
  cache.set(backend, { fetchedAt: Date.now(), byModel })
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
  return cache.get(backend)?.byModel.get(model) ?? null
}

/** Für Tests. */
export function clearPricingCache(): void {
  cache.clear()
  inFlight.clear()
}
