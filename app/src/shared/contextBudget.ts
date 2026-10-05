// Kontextbudget des Notiz-Agenten (Baustein B, docs/codex-collab/agent-rueckblick-unterordner.md).
//
// Grundsatz: Das Budget STEUERT, das Erkennen SICHERT. Eine Zeichenschätzung ist nie eine
// garantierte Obergrenze — die harte Grenze bleibt der Überlauf-Wächter (contextGuard.ts).
// Das Budget sorgt dafür, dass große Werkzeugergebnisse geblättert statt angehängt werden
// und lesende Werkzeuge rechtzeitig sperren, damit der Überlauf im Normalfall gar nicht
// erst entsteht.
//
// Eichung (05.10.2026, Ollama prompt_eval_count, qwen3.6/qwen3.8/gemma4): Zeichen pro Token
// liegen bei deutschem Fließtext um 3,4, bei Werkzeug-JSON um 3,6 — aber bei Tabellen nur
// 1,86 und bei Pfadlisten (Manifest!) 1,3. Ein fester Divisor passt deshalb nie. Die
// Schätzung zählt Zeichenarten: Buchstaben/2,9 + Ziffern·1,4 + Satzzeichen·0,65 + Umbrüche.
// Sie überschätzte in allen Messungen um 8–37 % (Eichtexte) bzw. 15–71 % (Gegenprobe mit
// CHANGELOG, TS-Code, Journal, englischem Text, auch llama3.1), unterschätzte nie.

/** Fenster, wenn die App die echte Größe nicht kennt (LM Studio, Cloud). */
export const ASSUMED_CONTEXT_WINDOW = 32_768
/**
 * Platz, der für die nächste Antwort frei bleiben soll. Bei Cloud-Läufen ist das das
 * gesetzte `max_tokens`; lokal setzt die App bewusst KEIN Ausgabelimit (index.ts) — dort
 * ist der Wert eine Planungsgröße, keine Garantie (F36).
 */
export const ASSUMED_OUTPUT_RESERVE = 8_192
/** Höchstens dieser Anteil des Fensters für EIN Werkzeugergebnis. */
export const TOOL_RESULT_SHARE = 0.25
/** Unter dieser Ausgabe-Reserve wird vor dem Senden gestoppt statt überzulaufen. */
export const MIN_OUTPUT_RESERVE = 2_048

const LETTER_RE = /\p{L}/u
const DIGIT_RE = /\p{N}/u
const SPACE_RE = /\s/u

/** Vorsichtige Token-Schätzung nach Zeichenarten (siehe Kopf). */
export function estimateTokens(text: string): number {
  let letters = 0
  let digits = 0
  let punct = 0
  let newlines = 0
  for (const ch of text) {
    if (ch === '\n') newlines++
    else if (LETTER_RE.test(ch)) letters++
    else if (DIGIT_RE.test(ch)) digits++
    else if (!SPACE_RE.test(ch)) punct++
  }
  return Math.ceil(letters / 2.9 + digits * 1.4 + punct * 0.65 + newlines)
}

export type ContextWindowSource = 'num_ctx' | 'assumed'

export interface ContextWindow {
  tokens: number
  /** 'num_ctx' = von der App selbst gesetzt (Ollama), 'assumed' = unbekannt, vorsichtig angenommen. */
  source: ContextWindowSource
}

/**
 * Fenster bestimmen. Nur bei Ollama kennt die App es sicher, weil sie `num_ctx` selbst
 * setzt. LM Studio ignoriert `num_ctx`; bei Cloud-Anbietern ist der Katalogwert kein
 * garantiertes Endpunkt-Fenster (F29/F35) — dort gilt vorsichtig 32 768. Über-Läufe
 * jenseits davon meldet OpenRouter als Fehler (die App schaltet die stille
 * Mitten-Kompression per `transforms: []` ab).
 */
export function resolveContextWindow(backend: string | undefined, numCtx: number | undefined): ContextWindow {
  if ((backend ?? 'ollama') === 'ollama' && numCtx && numCtx > 0) return { tokens: numCtx, source: 'num_ctx' }
  return { tokens: ASSUMED_CONTEXT_WINDOW, source: 'assumed' }
}

export interface ContextBudget {
  window: number
  outputReserve: number
  /** Vom Server zuletzt gemeldete Prompt-Token (gesamter Prompt inkl. Werkzeug-Schemata). */
  reportedPromptTokens?: number
  /** Geschätzte Token, die seit der letzten Meldung angehängt wurden (bzw. alles, solange keine kam). */
  tokensSinceReport: number
}

export function createContextBudget(window: number, outputReserve = ASSUMED_OUTPUT_RESERVE): ContextBudget {
  return { window, outputReserve: Math.min(outputReserve, Math.floor(window / 2)), tokensSinceReport: 0 }
}

/** Text, der an die Konversation angehängt wird (oder vor der ersten Meldung: der ganze Prompt). */
export function addToBudget(budget: ContextBudget, text: string): void {
  budget.tokensSinceReport += estimateTokens(text)
}

/**
 * Meldung des Servers nach einem Aufruf: sie ersetzt alle Schätzungen bis hierhin.
 * Fehlt sie (Backend meldet nichts), bleibt es bei der Schätzung — unbekannt ist nicht null.
 */
export function recordServerPromptTokens(budget: ContextBudget, promptTokens: number | undefined): void {
  if (typeof promptTokens !== 'number' || promptTokens <= 0) return
  budget.reportedPromptTokens = promptTokens
  budget.tokensSinceReport = 0
}

export function usedTokens(budget: ContextBudget): number {
  return (budget.reportedPromptTokens ?? 0) + budget.tokensSinceReport
}

/** Platz für weitere Werkzeugergebnisse, nachdem die Ausgabe-Reserve abgezogen ist. */
export function remainingForInput(budget: ContextBudget): number {
  return budget.window - budget.outputReserve - usedTokens(budget)
}

/**
 * Lesende Werkzeuge sperren: Ab hier ist nur noch Platz für die Antwort. Der Agent soll
 * jetzt schreiben statt weiter lesen.
 */
export function isReadLocked(budget: ContextBudget): boolean {
  return remainingForInput(budget) <= 0
}

/** Höchstgröße EINES Werkzeugergebnisses in Token (frisch nach jeder Nachricht berechnen). */
export function maxToolResultTokens(budget: ContextBudget): number {
  return Math.max(0, Math.min(Math.floor(budget.window * TOOL_RESULT_SHARE), remainingForInput(budget)))
}

/** Reicht der Platz für eine sinnvolle nächste Antwort? Sonst vor dem Senden stoppen. */
export function hasRoomForNextCall(budget: ContextBudget): boolean {
  return budget.window - usedTokens(budget) >= MIN_OUTPUT_RESERVE
}

/**
 * Zeilen von vorne übernehmen, solange sie in `maxTokens` passen — für Werkzeuge, die
 * blättern statt abgelehnt zu werden. Gibt die Zahl übernommener Zeilen zurück
 * (mindestens 0; der Aufrufer meldet den Rest mit offset).
 */
export function linesFittingTokens(lines: string[], maxTokens: number): number {
  let used = 0
  for (let i = 0; i < lines.length; i++) {
    used += estimateTokens(lines[i]) + 1
    if (used > maxTokens) return i
  }
  return lines.length
}
