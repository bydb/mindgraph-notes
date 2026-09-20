/**
 * Embedding-Wrapper — main-intern (kein IPC-Roundtrip), damit auch
 * `loadProjectContext`/Crystallizer/Matching ihn direkt nutzen können.
 *
 * Privacy: hartkodiert gegen lokales Ollama UND Modellprüfung über die
 * Modellmetadaten (`resolveLocalModel`, F21): Cloud-Tags und Modelle mit
 * Remote-Host werden hier abgelehnt — an der GEMEINSAMEN Embedding-Grenze, damit
 * Projekt-RAG (index/query/answer), Vault-Index und interne Verbraucher sie nicht
 * umgehen können. Kein Text verlässt den Prozess, bevor die Prüfung bestanden ist.
 */

import { recordLlmRun } from '../llm/telemetry'
import { fromOllamaResponse } from '../../shared/llmTelemetry'
import { resolveLocalModel, LocalModelError, describeLocalModelError, OLLAMA_LOCAL_URL } from './localModel'

const EMBED_TIMEOUT_MS = 60000

export class EmbeddingModelMissingError extends Error {
  constructor(public model: string) {
    super(
      `Embedding-Modell „${model}" nicht verfügbar. In Einstellungen → Projekt-RAG wählen oder via Ollama pullen.`
    )
    this.name = 'EmbeddingModelMissingError'
  }
}

/** Externer Abbruch (Pause/Cancel des Indexers) — vom Timeout unterscheidbar. */
export class EmbeddingAbortedError extends Error {
  constructor() {
    super('Embedding abgebrochen')
    this.name = 'EmbeddingAbortedError'
  }
}

export interface EmbedOptions {
  signal?: AbortSignal
}

/**
 * Prüft das Modell an der Embedding-Grenze. Wirft mit nutzerlesbarer Meldung.
 * `missing` wird auf den bestehenden `EmbeddingModelMissingError` abgebildet,
 * damit vorhandene Aufrufer ihre Fehlerbehandlung behalten.
 */
export async function assertLocalEmbeddingModel(model: string): Promise<void> {
  try {
    // IMMER frisch (Codex F35): ein 15-s-Cache ist kein Nachweis für Lokalität beim
    // Senden — wird der Tag in der Zwischenzeit auf ein Remote-Modell umgebogen, darf
    // kein Notiztext mehr rausgehen. Kostet einen lokalen /api/tags-Aufruf pro Request.
    await resolveLocalModel(model, { fresh: true })
  } catch (err) {
    if (err instanceof LocalModelError && err.reason === 'missing') throw new EmbeddingModelMissingError(model)
    throw new Error(describeLocalModelError(err))
  }
}

/** Bettet einen Text ein. Wirft bei Fehler (Modell fehlt/nicht lokal, Ollama down, Timeout, Abbruch). */
export async function embedText(model: string, text: string, opts: EmbedOptions = {}): Promise<number[]> {
  if (opts.signal?.aborted) throw new EmbeddingAbortedError()
  await assertLocalEmbeddingModel(model)
  if (opts.signal?.aborted) throw new EmbeddingAbortedError()

  const controller = new AbortController()
  let externalAbort = false
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS)
  const onAbort = () => {
    externalAbort = true
    controller.abort()
  }
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  const startedAt = Date.now()
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
    // /api/embeddings meldet keine Zeiten — der Aufruf wird gezählt, mehr nicht.
    recordLlmRun(fromOllamaResponse({}, { module: 'embedding', model, wallMs: Date.now() - startedAt, at: startedAt }))
    if (!data.embedding || data.embedding.length === 0) {
      throw new Error('Leere Embedding-Antwort von Ollama')
    }
    return data.embedding
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (externalAbort) throw new EmbeddingAbortedError()
      throw new Error('Timeout: Embedding dauerte zu lange (>60s)')
    }
    throw err
  } finally {
    clearTimeout(timeout)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Bettet viele Texte mit beschränkter Parallelität ein.
 * Deckel (Default 3) gegen Ollama-/CPU-Sturm: ein 200-Datei-Projekt würde sonst
 * die lokale Ollama-Instanz lahmlegen (vgl. MAX_TRIGGER_BATCH im Workflow-Runner).
 * Hält alle Ergebnisse im Speicher — für Projektordner gedacht; der Vault-Indexer
 * hat seinen eigenen streamenden Weg (`vaultIndexer.ts`).
 */
export async function embedBatch(
  model: string,
  texts: string[],
  concurrency = 3,
  onProgress?: (done: number, total: number) => void,
  opts: EmbedOptions = {}
): Promise<number[][]> {
  const results: number[][] = new Array(texts.length)
  let next = 0
  let done = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= texts.length) return
      results[i] = await embedText(model, texts[i], opts)
      done++
      onProgress?.(done, texts.length)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, () => worker())
  await Promise.all(workers)
  return results
}
