/**
 * Projekt-RAG: gemeinsame Typen (prozessübergreifend Main ↔ Renderer).
 *
 * Ein Projektordner wird gechunkt, jeder Chunk lokal via Ollama eingebettet
 * und als On-demand-Index in `<vault>/.mindgraph/rag/<sanitized>.json` abgelegt.
 * Von dort aus kann der Ordner semantisch abgefragt/befragt werden.
 *
 * Privacy-Constraint (siehe CLAUDE.md / Memory): Embedding UND Antwort laufen
 * ausschließlich gegen lokales Ollama. Kein Cloud-Pfad für Projektinhalte.
 */

/** Erhöhen, wenn sich Chunking oder das Index-Format ändert → Voll-Rebuild. */
export const RAG_INDEX_VERSION = 1

/** Ein eingebetteter Chunk einer Projektdatei. */
export interface RagChunk {
  id: string // `${fileRel}::${chunkIndex}` — stabil, deterministisch
  text: string // Roh-Chunk (für Anzeige + LLM-Kontext)
  heading: string // nächstgelegene Überschrift (für Quellen-Zitat)
  fileRel: string // vault-relativer Pfad der Quelldatei
  chunkIndex: number
  mtime: number // mtimeMs der Quelldatei zum Embedding-Zeitpunkt
  embedding: number[]
}

/** Persistierter Index eines Projekts. */
export interface RagIndex {
  version: number // RAG_INDEX_VERSION
  model: string // Embedding-Modell, mit dem gebaut wurde
  projectFolderRel: string
  lastUpdated: number // Date.now() des letzten Builds
  chunks: RagChunk[]
}

/** Ein Retrieval-Treffer (ohne Embedding-Vektor, für UI/Antwort). */
export interface RetrievedChunk {
  text: string
  heading: string
  fileRel: string
  chunkIndex: number
  score: number // 0..1 (Hybrid: Cosine + Keyword)
}

/** Ergebnis einer reinen Retrieval-Abfrage (ohne LLM-Antwort). */
export interface RagQueryResult {
  success: boolean
  chunks: RetrievedChunk[]
  usedModel?: string
  error?: string
}

/** Status eines Projekt-Index (für Badges / „veraltet"-Anzeige). */
export interface RagIndexStatus {
  exists: boolean
  chunkCount: number
  fileCount: number
  model: string | null
  lastUpdated: number | null
  stale: boolean // eine Quelldatei ist jünger als der Index oder fehlt im Index
}

/** Ergebnis eines Index-Builds. */
export interface RagIndexBuildResult {
  success: boolean
  chunkCount?: number
  fileCount?: number
  error?: string
}

/** Optionen für Retrieval. */
export interface RagRetrieveOptions {
  topK?: number // Default 6
  minScore?: number // Default 0.45 (Cosine; darunter = irrelevant)
  hybridKeywordWeight?: number // Default 0.25
}
