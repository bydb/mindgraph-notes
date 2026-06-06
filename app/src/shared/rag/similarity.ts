/**
 * Embedding-Hilfen für das Projekt-RAG.
 *
 * `cosineSimilarity` + `prepareTextForEmbedding` sind aus dem (UI-gebundenen)
 * SmartConnectionsPanel extrahiert, damit Main UND Renderer dieselbe Logik teilen.
 * `keywordOverlapScore` liefert das Keyword-Bein des Hybrid-Scorings.
 */

import { GENERIC_STOPWORDS } from '../projectMatch'

// nomic-embed-text hat ein strenges Token-Limit; 4000 Zeichen ≈ 1000–1400 Tokens.
// Für RAG-Chunks (~1200 Zeichen) greift die Kürzung praktisch nie, ist aber als
// Sicherheitsnetz erhalten.
const MAX_EMBEDDING_LENGTH = 4000

/** Cosine-Similarity zweier Vektoren (0..1 bei normalen Embeddings). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Bereitet Text fürs Embedding vor: Frontmatter, Email-Metadaten-Block und
 * Obsidian-Syntax raus, Wikilinks auf ihren Text reduziert. Spiegelt die Logik
 * aus SmartConnectionsPanel, damit Query- und Chunk-Embeddings konsistent sind.
 */
export function prepareTextForEmbedding(text: string): string {
  let clean = text.replace(/^---[\s\S]*?---\n*/m, '')

  // Email-Metadaten-Block (Bold-Markdown aus dem Mail-Note-Template) entfernen —
  // sonst landen alle Mail-Notizen in einem gemeinsamen „Metadaten-Cluster".
  clean = clean.replace(
    /^\*\*(?:Von|An|Datum|Relevanz|Stimmung|Kategorien|Betreff):\*\*.*$/gim,
    ''
  )

  clean = clean
    .replace(/>\s*Erstellt am.*?\n/g, '')
    .replace(/!\[\[.*?\]\]/g, '') // Bild-Embeds
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[link|text]] → text
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[link]] → link
    .replace(/^>\s*\[!.*?\].*$/gm, '') // Callout-Header
    .replace(/^[-*]\s*\[[ x]\]/gm, '') // Checkboxen
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return clean.length <= MAX_EMBEDDING_LENGTH ? clean : clean.slice(0, MAX_EMBEDDING_LENGTH)
}

function tokenize(s: string): Set<string> {
  const words = s.toLowerCase().match(/[a-zäöüß0-9][a-zäöüß0-9-]{2,}/gi) || []
  const out = new Set<string>()
  for (const w of words) {
    if (!GENERIC_STOPWORDS.has(w)) out.add(w)
  }
  return out
}

/**
 * Keyword-Überlappung Query↔Chunk (0..1), Stopwörter gefiltert.
 * Anteil der Query-Begriffe, die im Chunk vorkommen — robustes Hybrid-Bein,
 * das wörtliche Treffer (Eigennamen, IDs) belohnt, die Embeddings verwaschen.
 */
export function keywordOverlapScore(query: string, text: string): number {
  const q = tokenize(query)
  if (q.size === 0) return 0
  const t = tokenize(text)
  let hits = 0
  for (const w of q) if (t.has(w)) hits++
  return hits / q.size
}
