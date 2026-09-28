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

/**
 * Varianten, gemessen im A/B (25.09.2026, Anlass: Frage „schaue dir bitte … Lizenzverlängerung der
 * Software Tutory … gebe mir eine Zusammenfassung“ fand die passende Mail nicht):
 * - `dropRequestWords`: Auftrags- und Füllwörter der FRAGE zählen nicht. „schaue“ war dort das
 *   seltenste und damit schwerste Wort der ganzen Frage.
 * - `compoundHeads`: Deutsche Komposita teilweise treffen. „Lizenzverlängerung“ in der Frage trifft
 *   „Verlängerung“ im Text (und umgekehrt) zur Hälfte — der tragende Wortteil steht hinten.
 */
export interface LexicalOptions {
  dropRequestWords?: boolean
  compoundHeads?: boolean
}

// Seit 25.09.2026 Standard (Nutzerentscheidung): Tuning-Set 42 Fragen ohne jede Rangänderung,
// Tutory-Fälle Platz 6 → 1 bzw. 16 → 9. Mehr Treffer sind damit NICHT belegt — nur „nichts schlechter“.
export const DEFAULT_LEXICAL_OPTIONS: LexicalOptions = { dropRequestWords: true, compoundHeads: true }

// Nur Wörter, die in einer FRAGE den Auftrag formulieren, nicht den Inhalt. Wirken nur auf die
// Frage; df und Chunk-Tokens bleiben unverändert.
const REQUEST_WORDS = new Set([
  'bitte', 'mal', 'dir', 'mir', 'mich', 'uns', 'euch', 'kannst', 'könntest', 'kann', 'könnte', 'würdest',
  'schau', 'schaue', 'schauen', 'gib', 'gebe', 'geben', 'zeig', 'zeige', 'zeigen', 'fasse', 'fass', 'fassen',
  'zusammen', 'zusammenfassung', 'zusammenfassen', 'erkläre', 'erklär', 'erklären', 'sag', 'sage', 'sagen',
  'nenne', 'nennen', 'liste', 'auflisten', 'finde', 'finden', 'such', 'suche', 'suchen', 'gerne', 'gern',
  'danke', 'okay', 'kurz', 'kurze', 'kurzen', 'genau', 'eigentlich', 'etwas', 'alles', 'dazu', 'darüber',
  'please', 'show', 'tell', 'give', 'summarize', 'summary', 'find', 'list', 'explain'
])

const COMPOUND_MIN_PART = 5
const COMPOUND_WEIGHT = 0.5

export function lexicalQueryTokens(query: string, opts: LexicalOptions = DEFAULT_LEXICAL_OPTIONS): string[] {
  const q = [...new Set(lexicalTokens(query))]
  return opts.dropRequestWords ? q.filter((w) => !REQUEST_WORDS.has(w)) : q
}

/** Ein Wort ist Kopf des anderen (gemeinsames Ende, kürzeres mind. 5 Zeichen, nicht identisch). */
function sharesCompoundHead(a: string, b: string): boolean {
  if (a === b) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= COMPOUND_MIN_PART && long.endsWith(short)
}

/** Anteil (0…1) der seltenheitsgewichteten Fragewörter, die im Text vorkommen. */
export function lexicalOverlap(index: LexicalIndex, query: string, text: string, opts: LexicalOptions = DEFAULT_LEXICAL_OPTIONS): number {
  const q = lexicalQueryTokens(query, opts)
  if (q.length === 0) return 0
  const t = new Set(lexicalTokens(text))
  let sum = 0
  let hit = 0
  for (const w of q) {
    const idf = Math.log(index.docCount / ((index.df.get(w) ?? 0) + 1))
    if (idf <= 0) continue
    sum += idf
    if (t.has(w)) hit += idf
    else if (opts.compoundHeads) {
      for (const tw of t) {
        if (sharesCompoundHead(w, tw)) { hit += idf * COMPOUND_WEIGHT; break }
      }
    }
  }
  return sum > 0 ? hit / sum : 0
}
