// Geteilte Embedding-Bausteine für Smart Connections und die Editor-Kontextspalte.
// Single-Source: Cache-Format, Cosine-Similarity und Score-Normalisierung müssen
// in beiden Oberflächen identisch sein, sonst zeigen sie widersprüchliche Werte.

export interface EmbeddingsCacheEntry {
  embedding: number[]
  mtime: number      // File modification time when embedding was generated
  size: number       // File size for change detection
}

export interface EmbeddingsCache {
  model: string
  version: number
  lastUpdated: number
  files: Record<string, EmbeddingsCacheEntry>
}

// Cache-Version. Erhöhen, wenn sich `prepareTextForEmbedding` ändert,
// damit veraltete Embeddings automatisch neu berechnet werden.
export const EMBEDDINGS_CACHE_VERSION = 2

// Bevorzuge bge-m3 (multilingual, deutlich bessere Score-Spreizung für deutsche Vaults),
// dann nomic-embed-text als Fallback, sonst erstes verfügbares Modell.
export function pickPreferredEmbeddingModel(models: Array<{ name: string }>): string | null {
  if (models.length === 0) return null
  const bgeModel = models.find(m => m.name.includes('bge-m3'))
  if (bgeModel) return bgeModel.name
  const nomicModel = models.find(m => m.name.includes('nomic'))
  if (nomicModel) return nomicModel.name
  return models[0].name
}

// Normalisiere Embedding-Score für bessere Differenzierung
// Cosine-Similarity clustert typisch zwischen 0.5-0.95
// Diese Funktion spreizt die Werte auf 0-1 für sichtbarere Unterschiede
export function normalizeEmbeddingScore(rawScore: number): number {
  const MIN_EXPECTED = 0.50  // Scores darunter = unverwandt
  const MAX_EXPECTED = 0.95  // Sehr hohe Ähnlichkeit

  const normalized = (rawScore - MIN_EXPECTED) / (MAX_EXPECTED - MIN_EXPECTED)
  return Math.max(0, Math.min(1, normalized))
}

// Cosine similarity zwischen zwei Vektoren
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
