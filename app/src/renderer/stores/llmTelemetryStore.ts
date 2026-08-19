// Leistungsdaten der Modell-Läufe im Renderer.
//
// Absichtlich NICHT persistiert: Das sind Betriebsdaten eines Laufs, keine
// Nutzerdaten. Nach einem Neustart beginnt die Messung neu — alles andere würde
// alte Zahlen mit neuer Hardware- oder Modell-Lage vermischen.
//
// Kosten: Ein Event pro Modell-Anfrage, nicht pro Token. Es gibt hier deshalb
// keine Drosselung — sie wäre nur nötig, wenn wir live pro Chunk rendern würden.

import { create } from 'zustand'
import type { LlmRunMetrics } from '../../shared/llmTelemetry'

// Genug für einen Arbeitstag Vergleiche; der Main-Prozess deckelt ohnehin bei 300.
const MAX_RUNS = 300

interface LlmTelemetryState {
  runs: LlmRunMetrics[]
  lastRun: LlmRunMetrics | null
  loaded: boolean
  load: () => Promise<void>
  addRun: (run: LlmRunMetrics) => void
}

export const useLlmTelemetryStore = create<LlmTelemetryState>((set, get) => ({
  runs: [],
  lastRun: null,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const runs = await window.electronAPI.getLlmTelemetry()
      set({ runs, lastRun: runs.length ? runs[runs.length - 1] : null, loaded: true })
    } catch {
      // Kein Grund, die App zu stören — ohne Daten bleibt die Anzeige einfach leer.
      set({ loaded: true })
    }
  },

  addRun: (run) => set(state => {
    const runs = [...state.runs, run]
    if (runs.length > MAX_RUNS) runs.splice(0, runs.length - MAX_RUNS)
    return { runs, lastRun: run }
  }),
}))

/**
 * Einmal pro Fenster aufrufen. Meldet sich für neue Läufe an und lädt den
 * bisherigen Puffer nach.
 */
export function initLlmTelemetry(): () => void {
  void useLlmTelemetryStore.getState().load()
  return window.electronAPI.onLlmTelemetryRun(run => {
    useLlmTelemetryStore.getState().addRun(run)
  })
}
