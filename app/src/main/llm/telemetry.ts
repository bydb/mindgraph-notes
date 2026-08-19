// Sammelstelle für Modell-Leistungsdaten im Main-Prozess.
//
// Hält die letzten Läufe im Arbeitsspeicher und schiebt jeden neuen an die
// Fenster. BEWUSST nichts auf die Platte: Das sind Betriebsdaten, keine Notizen —
// sie sollen weder in den Sync noch in ein Backup wandern, und ein Neustart darf
// sie vergessen.
//
// Kosten: Ollama liefert die Zahlen in jeder Antwort ohnehin mit. Es entsteht kein
// zusätzlicher Aufruf; pro Modell-Lauf wird ein Objekt angelegt und ein Event
// gesendet — also einmal pro Anfrage, nicht einmal pro Token.

import { BrowserWindow } from 'electron'
import type { LlmRunMetrics } from '../../shared/llmTelemetry'

// Reicht für einen Arbeitstag Vergleiche und bleibt weit unter einem Megabyte.
const MAX_RUNS = 300

const runs: LlmRunMetrics[] = []

export function recordLlmRun(run: LlmRunMetrics): void {
  runs.push(run)
  if (runs.length > MAX_RUNS) runs.splice(0, runs.length - MAX_RUNS)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('llm-telemetry-run', run)
  }
}

export function getLlmRuns(): LlmRunMetrics[] {
  return [...runs]
}

export function clearLlmRuns(): void {
  runs.length = 0
}
