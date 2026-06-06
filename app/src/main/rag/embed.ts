/**
 * Embedding-Wrapper fürs Projekt-RAG — main-intern (kein IPC-Roundtrip), damit
 * auch `loadProjectContext`/Crystallizer/Matching ihn direkt nutzen können.
 *
 * Privacy: hartkodiert gegen lokales Ollama (wie crystallizer.ts). KEIN
 * Cloud-/LM-Studio-Pfad für Projektinhalte.
 */

const OLLAMA_LOCAL_URL = 'http://localhost:11434'
const EMBED_TIMEOUT_MS = 60000

export class EmbeddingModelMissingError extends Error {
  constructor(public model: string) {
    super(
      `Embedding-Modell „${model}" nicht verfügbar. In Einstellungen → Projekt-RAG wählen oder via Ollama pullen.`
    )
    this.name = 'EmbeddingModelMissingError'
  }
}

/** Bettet einen Text ein. Wirft bei Fehler (Modell fehlt, Ollama down, Timeout). */
export async function embedText(model: string, text: string): Promise<number[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS)
  try {
    const response = await fetch(`${OLLAMA_LOCAL_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: controller.signal
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      // Ollama meldet ein nicht gepulltes Modell mit 404 + "not found".
      if (response.status === 404 || /not found|no such model/i.test(body)) {
        throw new EmbeddingModelMissingError(model)
      }
      throw new Error(`Ollama Embeddings Fehler ${response.status}`)
    }
    const data = (await response.json()) as { embedding?: number[] }
    if (!data.embedding || data.embedding.length === 0) {
      throw new Error('Leere Embedding-Antwort von Ollama')
    }
    return data.embedding
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Timeout: Embedding dauerte zu lange (>60s)')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Bettet viele Texte mit beschränkter Parallelität ein.
 * Deckel (Default 3) gegen Ollama-/CPU-Sturm: ein 200-Datei-Projekt würde sonst
 * die lokale Ollama-Instanz lahmlegen (vgl. MAX_TRIGGER_BATCH im Workflow-Runner).
 */
export async function embedBatch(
  model: string,
  texts: string[],
  concurrency = 3,
  onProgress?: (done: number, total: number) => void
): Promise<number[][]> {
  const results: number[][] = new Array(texts.length)
  let next = 0
  let done = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= texts.length) return
      results[i] = await embedText(model, texts[i])
      done++
      onProgress?.(done, texts.length)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, () => worker())
  await Promise.all(workers)
  return results
}
