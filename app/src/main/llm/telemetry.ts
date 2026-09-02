// Sammelstelle für Modell-Leistungsdaten im Main-Prozess.
//
// Hält die letzten Läufe im Arbeitsspeicher, schiebt jeden neuen an die Fenster und
// hängt ihn an das Logbuch auf Platte an (telemetryLedger.ts). Der Ringpuffer ist
// Cache für die Live-Anzeige (Statusleiste, Badge), nicht die Wahrheit — die liegt
// in der Datei und wird über Zeiträume abgefragt.
//
// Bis 09/2026 stand hier „BEWUSST nichts auf die Platte". Das war die Entscheidung
// für den kleinen ersten Schritt, kein Datenschutz-Argument: Die Einträge enthalten
// keinen Prompt, keine Antwort, keinen Dateinamen. Was bleibt, ist die Abgrenzung
// gegen Sync und Backup — das Logbuch liegt in userData, nie im Vault
// (docs/measurement-history-plan.md § 2).
//
// Kosten: Ollama liefert die Zahlen in jeder Antwort ohnehin mit. Es entsteht kein
// zusätzlicher Aufruf; pro Modell-Lauf wird ein Objekt angelegt, ein Event gesendet
// und eine Zeile angehängt — also einmal pro Anfrage, nicht einmal pro Token.

import { BrowserWindow } from 'electron'
import { summarizeRunCalls, type LlmRunMetrics, type RunCallTotals } from '../../shared/llmTelemetry'
import { recordTelemetryRun } from './telemetryLedger'

// Reicht für einen Arbeitstag Vergleiche und bleibt weit unter einem Megabyte.
const MAX_RUNS = 300

const runs: LlmRunMetrics[] = []

// Der Vault, dem die Aufrufe zugerechnet werden. Die Aufrufstellen (chatClient,
// Brain, Mail-Analyse) kennen ihn nicht — er wird gesetzt, wo der Main-Prozess den
// Vault erfährt (get-last-vault, set-last-vault). Ohne Vault bleibt der Aufruf im
// Ringpuffer; das wird einmal gemeldet, nicht still verschluckt.
let telemetryVaultPath: string | null = null
let warnedWithoutVault = false

export function setTelemetryVault(vaultPath: string | null): void {
  telemetryVaultPath = vaultPath || null
}

// ─── Aufrufe je Lauf sammeln (docs/measurement-history-plan.md § 3) ─────────
//
// Wer am Ende eines Agentenlaufs wissen will, was er gekostet hat, braucht alle
// Aufrufe mit seiner runId — nicht nur die, die zufällig noch im Ringpuffer liegen
// (eine parallele Mail-Analyse kann ihn füllen). Deshalb ein eigener Korb je Lauf.
//
// Cloud-Aufrufe werden erst NACH einer Preisabfrage festgehalten (chatClient
// recordCloudCall läuft asynchron). Damit die Bilanz am Lauf-Ende nicht den letzten
// Aufruf verpasst, meldet der chatClient laufende Erfassungen an, und
// collectRunTotals wartet sie ab.

interface RunBasket {
  runs: LlmRunMetrics[]
  pending: Set<Promise<unknown>>
  touchedAt: number
}

const baskets = new Map<string, RunBasket>()
/** Körbe, die nie abgeholt werden (Lauf abgestürzt, Mail-Durchlauf ohne Fund), verfallen. */
const BASKET_MAX_AGE_MS = 6 * 60 * 60_000
const BASKET_MAX_COUNT = 200

function basketFor(runId: string, now: number): RunBasket {
  let b = baskets.get(runId)
  if (!b) {
    b = { runs: [], pending: new Set(), touchedAt: now }
    baskets.set(runId, b)
  }
  b.touchedAt = now
  return b
}

function pruneBaskets(now: number): void {
  for (const [id, b] of baskets) {
    if (now - b.touchedAt > BASKET_MAX_AGE_MS) baskets.delete(id)
  }
  if (baskets.size > BASKET_MAX_COUNT) {
    const sorted = [...baskets.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)
    for (const [id] of sorted.slice(0, baskets.size - BASKET_MAX_COUNT)) baskets.delete(id)
  }
}

/** Eine noch laufende Erfassung anmelden, damit collectRunTotals sie abwartet. */
export function trackPendingTelemetry(runId: string | undefined, work: Promise<unknown>): void {
  if (!runId) return
  const b = basketFor(runId, Date.now())
  b.pending.add(work)
  const done = () => { b.pending.delete(work) }
  work.then(done, done)
}

/**
 * Verbrauch aller Aufrufe eines Laufs, danach ist der Korb leer. undefined, wenn kein
 * einziger Aufruf erfasst wurde — das ist „nicht gemessen", nicht „kostenlos".
 */
export async function collectRunTotals(runId: string): Promise<RunCallTotals | undefined> {
  const b = baskets.get(runId)
  if (!b) return undefined
  // Erst abwarten, dann lesen: Eine Erfassung kann während des Wartens weitere anstoßen.
  while (b.pending.size > 0) await Promise.allSettled([...b.pending])
  baskets.delete(runId)
  return b.runs.length ? summarizeRunCalls(b.runs) : undefined
}

export function recordLlmRun(run: LlmRunMetrics): void {
  runs.push(run)
  if (runs.length > MAX_RUNS) runs.splice(0, runs.length - MAX_RUNS)
  if (run.runId) {
    basketFor(run.runId, Date.now()).runs.push(run)
    pruneBaskets(Date.now())
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('llm-telemetry-run', run)
  }
  if (telemetryVaultPath) {
    recordTelemetryRun(telemetryVaultPath, run)
  } else if (!warnedWithoutVault) {
    warnedWithoutVault = true
    console.warn('[telemetry] Kein Vault bekannt — Aufruf nur im Arbeitsspeicher, nicht im Logbuch.')
  }
}

export function getLlmRuns(): LlmRunMetrics[] {
  return [...runs]
}

export function clearLlmRuns(): void {
  runs.length = 0
}
