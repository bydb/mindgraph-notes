/**
 * Seltenheitsgewichteter Wortabgleich für das Vault-Retrieval (Phase 3, A/B 20.09.2026).
 *
 * Bedeutungsnähe allein trennt an einem großen Vault schlecht: die Notiz „Neubewertung Stelle
 * Hitzel" lag bei einer Frage mit „Neubewertung" auf Rang 18, weil kurze Brain-Tagesnotizen
 * fast jeder Frage ähneln. Der Abgleich zählt, welcher Anteil der Fragewörter (gewichtet mit
 * log(N/df), also seltene Wörter stärker) in Dateiname, Überschrift und Chunk-Text vorkommt,
 * und dient NUR der Umsortierung der Kandidaten. Der Floor bleibt auf der Bedeutungsnähe —
 * die Verweigerung ändert sich nicht. Am Tuning-Set (42 positiv): Hit@8 37 → 39, MRR 0,69 → 0,78,
 * kein Fall schlechter. Einfacher Wortanteil und Titel-Abgleich fielen durch.
 */

import type { VaultIndexContainer } from './vaultIndex'

const STOPWORDS = new Set([
  'der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'was', 'wie', 'wer', 'wann', 'wo', 'ich', 'meine', 'mein',
  'ein', 'eine', 'einen', 'einer', 'eines', 'zu', 'zur', 'zum', 'im', 'in', 'am', 'an', 'auf', 'für', 'von', 'mit',
  'bei', 'nach', 'über', 'aus', 'des', 'dem', 'den', 'es', 'gibt', 'steht', 'habe', 'hat', 'hatte', 'war', 'wurde',
  'werden', 'sich', 'nicht', 'auch', 'welche', 'welcher', 'welches', 'laut', 'meinem', 'meiner', 'unsere', 'unser',
  'wir', 'noch', 'schon', 'dass', 'als', 'bis', 'nur', 'the', 'of', 'and', 'to', 'is', 'a', 'in', 'for', 'what', 'how'
])

/** Wörter ab drei Zeichen, kleingeschrieben, ohne Stoppwörter. */
export function lexicalTokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOPWORDS.has(w))
}

export interface LexicalIndex {
  df: Map<string, number>
  docCount: number
}

const cache = new WeakMap<VaultIndexContainer, LexicalIndex>()

export function chunkLexicalText(fileRel: string, heading: string, text: string): string {
  const base = fileRel.split('/').pop()?.replace(/\.md$/i, '') ?? ''
  return `${base} ${heading} ${text}`
}

/** Dokumenthäufigkeiten einmal pro geladenem Container (WeakMap-Cache). */
export function lexicalIndexFor(container: VaultIndexContainer): LexicalIndex {
  const hit = cache.get(container)
  if (hit) return hit
  const df = new Map<string, number>()
  for (const ch of container.meta.chunks) {
    for (const w of new Set(lexicalTokens(chunkLexicalText(ch.fileRel, ch.heading, ch.text)))) df.set(w, (df.get(w) ?? 0) + 1)
  }
  const idx = { df, docCount: container.meta.chunks.length || 1 }
  cache.set(container, idx)
  return idx
}

/** Anteil (0…1) der seltenheitsgewichteten Fragewörter, die im Text vorkommen. */
export function lexicalOverlap(index: LexicalIndex, query: string, text: string): number {
  const q = [...new Set(lexicalTokens(query))]
  if (q.length === 0) return 0
  const t = new Set(lexicalTokens(text))
  let sum = 0
  let hit = 0
  for (const w of q) {
    const idf = Math.log(index.docCount / ((index.df.get(w) ?? 0) + 1))
    if (idf <= 0) continue
    sum += idf
    if (t.has(w)) hit += idf
  }
  return sum > 0 ? hit / sum : 0
}
