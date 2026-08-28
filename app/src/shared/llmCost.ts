// Kosten eines Cloud-Aufrufs — reine Logik, prozessübergreifend.
//
// Gegenstück zur Zeitbilanz: die sagt, was ein Lauf spart, hier steht, was er
// kostet. Es gelten dieselben Ehrlichkeitsregeln — vor allem die eine, an der
// die Zeitbilanz zweimal nachgebessert werden musste: NICHT GEMESSEN IST NICHT
// NULL. Ein Aufruf ohne `usage`-Block bekommt keine 0, sondern gar keinen Wert
// und wird getrennt gezählt.
//
// Zwei Herkünfte, die nie vermischt werden dürfen:
//   'reported' — der Anbieter nennt den Betrag selbst (OpenRouter: `usage.cost`,
//                seit 08/2026 in jeder Antwort, ohne Anforderung). Das ist die
//                Abrechnungswahrheit inklusive Auf-/Abschlägen.
//   'computed' — wir rechnen Token × Preis. Nur so gut wie der Preis, den wir
//                beim Aufruf kannten; Cache-Rabatte können ihn kleiner machen.
// Eine Summe aus beidem wäre eine Zahl, deren Herkunft niemand mehr benennen
// kann — deshalb führt `sumCalls` beide Töpfe getrennt.

export type CostSource = 'reported' | 'computed'

/** Preise eines Modells, normalisiert auf USD je 1 Mio. Token. */
export interface ModelPricing {
  inputPerMillion: number
  outputPerMillion: number
  cachedInputPerMillion?: number
  reasoningPerMillion?: number
}

/** Verbrauch eines einzelnen API-Aufrufs. Fehlende Felder bleiben undefined. */
export interface CallUsage {
  promptTokens?: number
  completionTokens?: number
  cachedTokens?: number
  reasoningTokens?: number
  /** Vom Anbieter gemeldeter Betrag in USD. */
  reportedCostUsd?: number
}

/**
 * Rohes `pricing`-Objekt der OpenAI-kompatiblen Modell-Kataloge → Preise je 1 Mio.
 *
 * ACHTUNG, das war der eigentliche Fehler in der alten Fassung: OpenRouter und
 * LLMBase liefern USD **je einzelnem Token** als String ("0.00000015"), nicht je
 * Million. Der Kommentar im chatClient behauptete das Gegenteil, und der Picker
 * zeigte darum "0.00000015$/tok" — formal richtig, praktisch unlesbar.
 */
export function parseModelPricing(raw: unknown): ModelPricing | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const input = perMillion(p.prompt)
  const output = perMillion(p.completion)
  if (input === null || output === null) return null
  const cached = perMillion(p.input_cache_read)
  const reasoning = perMillion(p.internal_reasoning)
  return {
    inputPerMillion: input,
    outputPerMillion: output,
    ...(cached !== null ? { cachedInputPerMillion: cached } : {}),
    ...(reasoning !== null ? { reasoningPerMillion: reasoning } : {}),
  }
}

function perMillion(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const n = typeof value === 'number' ? value : parseFloat(value)
  // Ein negativer Preis ist kein Rabatt, sondern kaputte Eingabe.
  if (!Number.isFinite(n) || n < 0) return null
  return n * 1e6
}

/**
 * `usage`-Block einer OpenAI-kompatiblen Antwort → Verbrauch.
 *
 * OpenRouter legt Cache- und Reasoning-Token in Unterobjekte
 * (`prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`).
 * `cost` liefert nur OpenRouter; bei LLMBase bleibt es undefined und wir rechnen.
 */
export function parseCallUsage(raw: unknown): CallUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as Record<string, unknown>
  const promptDetails = u.prompt_tokens_details as Record<string, unknown> | undefined
  const completionDetails = u.completion_tokens_details as Record<string, unknown> | undefined
  const usage: CallUsage = {
    ...num(u.prompt_tokens, 'promptTokens'),
    ...num(u.completion_tokens, 'completionTokens'),
    ...num(promptDetails?.cached_tokens, 'cachedTokens'),
    ...num(completionDetails?.reasoning_tokens, 'reasoningTokens'),
    ...num(u.cost, 'reportedCostUsd'),
  }
  return Object.keys(usage).length ? usage : null
}

function num<K extends string>(value: unknown, key: K): Partial<Record<K, number>> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return {}
  return { [key]: value } as Record<K, number>
}

/**
 * Kosten eines Aufrufs. Gemeldeter Betrag schlägt jede eigene Rechnung.
 * null heißt „nicht bestimmbar" — nicht „kostenlos".
 */
export function callCostUsd(
  usage: CallUsage | null | undefined,
  pricing?: ModelPricing | null
): { usd: number; source: CostSource } | null {
  if (!usage) return null
  if (typeof usage.reportedCostUsd === 'number') {
    return { usd: usage.reportedCostUsd, source: 'reported' }
  }
  if (!pricing) return null
  if (usage.promptTokens === undefined && usage.completionTokens === undefined) return null
  // Zwischengespeicherte Eingabe wird günstiger abgerechnet. Kennen wir den
  // Cache-Preis nicht, bleibt sie zum vollen Preis stehen — lieber zu teuer
  // geschätzt als eine Ersparnis behauptet, die wir nicht belegen können.
  const prompt = usage.promptTokens ?? 0
  const cached = Math.min(usage.cachedTokens ?? 0, prompt)
  const fresh = prompt - cached
  const cachedRate = pricing.cachedInputPerMillion ?? pricing.inputPerMillion
  const usd =
    (fresh / 1e6) * pricing.inputPerMillion +
    (cached / 1e6) * cachedRate +
    ((usage.completionTokens ?? 0) / 1e6) * pricing.outputPerMillion
  return { usd, source: 'computed' }
}

export interface RunCost {
  /** Summe der Aufrufe, deren Betrag der Anbieter selbst gemeldet hat. */
  reportedUsd: number
  /** Summe der Aufrufe, die wir aus Token und Preis gerechnet haben. */
  computedUsd: number
  reportedCalls: number
  computedCalls: number
  /** Aufrufe ganz ohne Kostenangabe — die fehlende Zahl, nicht die Null. */
  unpricedCalls: number
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  reasoningTokens: number
}

/**
 * Aggregiert die Aufrufe EINES Agenten-Laufs.
 *
 * Der Agenten-Loop schickt bei jeder Iteration die komplette Konversation erneut —
 * ein Lauf mit vier Iterationen kostet deshalb nicht vier Aufrufe, sondern die
 * Summe eines wachsenden Prompts. Genau darum wird hier je Aufruf summiert und
 * nicht am Ende einmal geschätzt.
 */
export function sumCalls(calls: Array<{ usage: CallUsage | null; pricing?: ModelPricing | null }>): RunCost {
  const total: RunCost = {
    reportedUsd: 0, computedUsd: 0,
    reportedCalls: 0, computedCalls: 0, unpricedCalls: 0,
    promptTokens: 0, completionTokens: 0, cachedTokens: 0, reasoningTokens: 0,
  }
  for (const call of calls) {
    total.promptTokens += call.usage?.promptTokens ?? 0
    total.completionTokens += call.usage?.completionTokens ?? 0
    total.cachedTokens += call.usage?.cachedTokens ?? 0
    total.reasoningTokens += call.usage?.reasoningTokens ?? 0
    const cost = callCostUsd(call.usage, call.pricing)
    if (!cost) { total.unpricedCalls += 1; continue }
    if (cost.source === 'reported') { total.reportedUsd += cost.usd; total.reportedCalls += 1 }
    else { total.computedUsd += cost.usd; total.computedCalls += 1 }
  }
  return total
}

/** Gesamtbetrag eines Laufs. null, wenn kein einziger Aufruf einen Preis hatte. */
export function totalUsd(cost: RunCost): number | null {
  if (!cost.reportedCalls && !cost.computedCalls) return null
  return cost.reportedUsd + cost.computedUsd
}

/**
 * Ist die Zahl vollständig? Solange auch nur ein Aufruf ohne Preis blieb, ist die
 * Summe eine Untergrenze und muss so beschriftet werden.
 */
export function isComplete(cost: RunCost): boolean {
  return cost.unpricedCalls === 0 && (cost.reportedCalls > 0 || cost.computedCalls > 0)
}

/**
 * Kleinbeträge lesbar machen. Ein Agenten-Lauf kostet Bruchteile eines Cents —
 * „$0.00" wäre die häufigste und nutzloseste Ausgabe.
 */
export function formatUsd(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return '—'
  if (usd === 0) return '$0'
  // Unter vier Nachkommastellen wuerde toFixed(4) '$0.0000' liefern — das liest sich
  // wie null, ist aber keine. Ein einzelner kleiner Chat-Aufruf kostet real so wenig.
  if (usd < 0.0001) return '<$0.0001'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/** Preis-Etikett für den Modell-Picker: Ein- und Ausgabe, je 1 Mio. Token. */
export function formatPricing(pricing: ModelPricing | null | undefined): string {
  if (!pricing) return ''
  if (pricing.inputPerMillion === 0 && pricing.outputPerMillion === 0) return 'gratis'
  const fmt = (v: number) => (v < 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(2)}`)
  return `${fmt(pricing.inputPerMillion)} / ${fmt(pricing.outputPerMillion)} je 1 Mio.`
}
