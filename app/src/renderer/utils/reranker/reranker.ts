// LLM-as-Judge-Reranker für Smart Connections.
//
// Hintergrund: Ollama unterstützt (Stand 2026-05-16) keinen nativen Reranker-Endpoint
// für Cross-Encoder-Modelle wie bge-reranker-v2-m3 oder Qwen3-Reranker — dedizierte
// Reranker-GGUFs crashen entweder den Loader oder geben Müll-Tokens aus, weil die
// Yes/No-Logit-Extraktion fehlt. Dokumentation siehe Memory [[project-reranker-via-ollama]].
//
// Pragmatischer Workaround: einen normalen Chat-Model (z.B. gemma4:latest, qwen3.6:latest)
// als Relevanz-Richter benutzen. Strukturierter JSON-Output via Ollamas `format: 'json'`.
// Per Paar 1 HTTP-Request → ~1-3 Sekunden mit gemma4:latest.
//
// Trade-off vs echtem Cross-Encoder:
// - Plus: nutzt das ohnehin geladene Modell, kein neuer Download, multilingual incl. Deutsch
// - Minus: nicht task-spezifisch trainiert, Scores eher grob (0.3 / 0.6 / 0.9 als breite Bänder)

import { useUIStore } from '../../stores/uiStore'

export interface RerankerProgress {
  status?: string
  file?: string
  percent: number | null
}

function getRerankModel(): string {
  // Aktuelles Hauptmodell aus uiStore — der User hat es bewusst gewählt
  // und kennt seine Qualitätserwartung.
  const ollama = useUIStore.getState().ollama
  return ollama.selectedModel || ''
}

/**
 * Re-ranked Kandidaten via LLM-as-Judge.
 * Liefert ein neues Array mit `rerankerScore ∈ [0,1]`, sortiert absteigend.
 */
export async function rerank<T>(
  query: string,
  candidates: T[],
  getText: (item: T) => string,
  onProgress?: (p: RerankerProgress) => void
): Promise<{ item: T; rerankerScore: number }[]> {
  if (candidates.length === 0) return []

  const model = getRerankModel()
  if (!model) {
    throw new Error('Kein Ollama-Modell konfiguriert')
  }

  const results: { item: T; rerankerScore: number }[] = []
  for (let i = 0; i < candidates.length; i++) {
    onProgress?.({
      status: `Reranking ${i + 1}/${candidates.length}`,
      percent: ((i + 1) / candidates.length) * 100
    })

    try {
      const response = await window.electronAPI.ollamaRerankPair(
        model,
        query,
        getText(candidates[i])
      )
      const score = response.success && typeof response.score === 'number' ? response.score : 0
      results.push({ item: candidates[i], rerankerScore: score })
      if (!response.success) {
        console.warn(`[reranker] pair ${i + 1} failed:`, response.error)
      }
    } catch (err) {
      console.error(`[reranker] pair ${i + 1} threw:`, err)
      results.push({ item: candidates[i], rerankerScore: 0 })
    }
  }

  return results.sort((a, b) => b.rerankerScore - a.rerankerScore)
}

/**
 * Kein Preload nötig — Ollama lädt das gewählte Modell selbst,
 * und das gewählte Modell ist vom User bereits eingerichtet.
 */
export async function ensureRerankerModel(_onProgress?: (p: RerankerProgress) => void): Promise<void> {
  const model = getRerankModel()
  if (!model) {
    throw new Error('Kein Ollama-Modell konfiguriert')
  }
}

export function isRerankerReady(): boolean {
  return Boolean(getRerankModel())
}
