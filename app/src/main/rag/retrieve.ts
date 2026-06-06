/**
 * Projekt-RAG Retrieval + Prompt-Bau.
 *
 * `ensureIndex` baut bei fehlend/stale (inkrementell), sonst lädt. `retrieve`
 * mischt Cosine- und Keyword-Score. `buildRagPrompt` erzeugt einen System-Prompt,
 * der das Modell auf den Kontext festnagelt und Quellen-Zitate erzwingt.
 */

import * as path from 'path'
import { cosineSimilarity, keywordOverlapScore } from '../../shared/rag/similarity'
import type { RagIndex, RetrievedChunk, RagRetrieveOptions } from '../../shared/rag/types'
import { buildOrUpdateIndex, getIndexStatus, loadIndex } from './index'
import { embedText } from './embed'

type AssertSafePath = (p: string, op: string) => Promise<string>

const DEFAULT_TOP_K = 6
// Garbage-Floor, KEIN „starker Treffer"-Filter. bge-m3 clustert relevante deutsche
// Treffer oft bei 0.40–0.50 (gemessen 2026-06-06: „aktueller Sachstand" → bester
// Chunk 0.446). Eine 0.45-Klippe schnitt RELEVANTEN Inhalt weg → „nichts gefunden"
// trotz vorhandener Mails. 0.30 lässt plausibel Verwandtes durch; echter Müll
// (<0.30) bleibt draußen. Zusätzlich greift unten ein Top-1-Fallback.
const DEFAULT_MIN_SCORE = 0.3
// Default 0 = reines bge-m3-Cosine. Empirisch (Eval-Harness `npm run rag:eval`,
// 4 Projekte / 21 Queries, 2026-06-06): das Keyword-Bein SCHADET der Genauigkeit
// — auch bei wörtlichen Queries (URLs, Daten, Eigennamen). Cosine-only schlug
// hybrid-0.25 (Hit@1 89/100 % vs 78/88 %) auf den diskriminierenden Projekten.
// Bleibt als tunbarer Knopf (RagRetrieveOptions.hybridKeywordWeight) erhalten.
const DEFAULT_KEYWORD_WEIGHT = 0
// Starker wörtlicher Treffer rettet einen Chunk auch bei schwachem Embedding
// (Recall-Sicherheitsnetz fürs Filtern; beeinflusst die Cosine-Rangfolge nicht).
const STRONG_KEYWORD = 0.5

/** Lädt den Index, baut ihn bei fehlend/stale (inkrementell) neu. */
export async function ensureIndex(
  vaultPath: string,
  projectFolderRel: string,
  model: string,
  assertSafePath: AssertSafePath,
  onProgress?: (done: number, total: number) => void
): Promise<RagIndex> {
  const status = await getIndexStatus(vaultPath, projectFolderRel, model, assertSafePath)
  if (!status.exists || status.stale) {
    return buildOrUpdateIndex(vaultPath, projectFolderRel, model, assertSafePath, onProgress)
  }
  const idx = await loadIndex(vaultPath, projectFolderRel)
  return idx ?? buildOrUpdateIndex(vaultPath, projectFolderRel, model, assertSafePath, onProgress)
}

/** Semantisches + Keyword-Hybrid-Retrieval über einen geladenen Index. */
export async function retrieve(
  index: RagIndex,
  query: string,
  model: string,
  opts: RagRetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  if (index.chunks.length === 0 || !query.trim()) return []

  const topK = opts.topK ?? DEFAULT_TOP_K
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE
  const w = opts.hybridKeywordWeight ?? DEFAULT_KEYWORD_WEIGHT

  const queryVec = await embedText(model, query)

  const scored = index.chunks.map((c) => {
    const cos = cosineSimilarity(queryVec, c.embedding)
    const kw = keywordOverlapScore(query, c.text)
    return {
      chunk: c,
      cos,
      kw,
      score: cos * (1 - w) + kw * w
    }
  })

  const ranked = scored.sort((a, b) => b.score - a.score)
  let passing = ranked.filter((s) => s.cos >= minScore || s.kw >= STRONG_KEYWORD)
  // Top-1-Fallback: liegt nichts über dem Floor, aber der Index ist nicht leer,
  // gib trotzdem den besten Chunk zurück. „Projekt befragen" soll nie wegen einer
  // knappen Schwellen-Klippe verstummen, wenn überhaupt Inhalt da ist — die
  // ehrliche „passt nicht"-Einschätzung trifft dann das LLM aus dem Kontext.
  if (passing.length === 0) passing = ranked.slice(0, 1)

  return passing
    .slice(0, topK)
    .map((s) => ({
      text: s.chunk.text,
      heading: s.chunk.heading,
      fileRel: s.chunk.fileRel,
      chunkIndex: s.chunk.chunkIndex,
      score: s.score
    }))
}

/** Datei-Zitat-Label: `[[Basename]] § Heading`. */
function sourceLabel(c: RetrievedChunk): string {
  const base = path.basename(c.fileRel).replace(/\.md$/i, '')
  return c.heading ? `[[${base}]] § ${c.heading}` : `[[${base}]]`
}

/** Verdichtet Retrieval-Chunks zu einem Kontext-Block (für Augmentierung). */
export function chunksToContext(chunks: RetrievedChunk[], maxChars = 2500): string {
  let out = ''
  for (const c of chunks) {
    const block = `### ${sourceLabel(c)}\n${c.text}\n\n`
    if (out.length + block.length > maxChars) break
    out += block
  }
  return out.trim()
}

/**
 * System-Prompt für eine verankerte Antwort. Das Modell darf NUR aus dem Kontext
 * antworten und muss Quellen als `[[Datei]]` zitieren; bei leerem Kontext ehrlich
 * sagen, dass nichts gefunden wurde.
 */
export function buildRagPrompt(query: string, chunks: RetrievedChunk[], language: 'de' | 'en'): string {
  const de = language === 'de'
  if (chunks.length === 0) {
    return de
      ? 'Du beantwortest Fragen zu einem Projektordner. Es wurden KEINE relevanten Projektinhalte gefunden. Sag dem Nutzer ehrlich, dass der Projektordner dazu nichts enthält, und rate keine Inhalte herbei.'
      : 'You answer questions about a project folder. NO relevant project content was found. Tell the user honestly that the folder contains nothing on this, and do not invent content.'
  }

  const context = chunks
    .map((c, i) => `[${i + 1}] Quelle: ${sourceLabel(c)}\n${c.text}`)
    .join('\n\n---\n\n')

  if (de) {
    return `Du beantwortest Fragen zu einem Projektordner ausschließlich auf Basis des folgenden Projektkontexts. Antworte auf Deutsch, präzise und konkret.

REGELN:
- Nutze NUR den Kontext unten. Erfinde nichts. Steht die Antwort nicht im Kontext, sag das ehrlich.
- Zitiere die Quelle(n), auf die du dich stützt, als [[Dateiname]] direkt im Text.
- Fasse zusammen, statt wörtlich zu kopieren.

PROJEKTKONTEXT:
${context}

---
Frage des Nutzers: ${query}`
  }

  return `You answer questions about a project folder strictly from the project context below. Be precise and concrete.

RULES:
- Use ONLY the context below. Invent nothing. If the answer is not in the context, say so honestly.
- Cite the source(s) you rely on as [[filename]] inline.
- Summarize rather than copy verbatim.

PROJECT CONTEXT:
${context}

---
User question: ${query}`
}
