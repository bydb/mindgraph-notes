// Absatzweises Chunking für Lang-Text-KI-Aktionen (Übersetzen, OCR-Cleanup, Lektorat).
//
// Ein langes Dokument (real: 78k Zeichen) passt in keinen einzelnen Generate-Call:
// `num_predict`/`max_tokens` deckeln den Output, `num_ctx` den Input, Cloud-Provider
// capen die Ausgabe zusätzlich — die Übersetzung „bricht ab". Chunks an Absatzgrenzen
// halten jeden Teil-Call klein genug für alle drei Limits.
//
// Invariante des Splitters: `chunks.join('') === text` — alle Trennstellen sind
// Zero-Width-Lookbehinds, es geht kein Zeichen verloren. Bevorzugte Grenzen in
// dieser Reihenfolge: Absatz (Leerzeile) → Zeile → Satzende → harter Schnitt.

/** Ab dieser Länge wird eine Lang-Text-Aktion in Chunks zerlegt. */
export const LONG_TEXT_CHUNK_THRESHOLD = 12000

/** Ziel-Chunkgröße (Zeichen) — klein genug für num_ctx/Output-Caps, groß genug für Kontext. */
export const LONG_TEXT_CHUNK_SIZE = 9000

// Zero-width Trennstellen, von grob nach fein. Lookbehind hält den Separator
// beim vorherigen Stück — nichts wird verschluckt.
const SPLIT_LEVELS: RegExp[] = [
  /(?<=\n\n)/,
  /(?<=\n)/,
  /(?<=[.!?…] )/u
]

function splitPiece(piece: string, maxChars: number, level: number): string[] {
  if (piece.length <= maxChars) return [piece]
  if (level >= SPLIT_LEVELS.length) {
    // Letzte Instanz: harter Schnitt (z.B. Base64-Wüsten ohne jede Grenze)
    const out: string[] = []
    for (let i = 0; i < piece.length; i += maxChars) {
      out.push(piece.slice(i, i + maxChars))
    }
    return out
  }
  const parts = piece.split(SPLIT_LEVELS[level])
  if (parts.length <= 1) return splitPiece(piece, maxChars, level + 1)
  return parts.flatMap((part) => splitPiece(part, maxChars, level + 1))
}

/**
 * Zerlegt Text in Chunks ≤ maxChars an möglichst natürlichen Grenzen.
 * `chunks.join('') === text` gilt immer.
 */
export function splitTextIntoChunks(text: string, maxChars: number = LONG_TEXT_CHUNK_SIZE): string[] {
  if (text.length <= maxChars) return text.length > 0 ? [text] : []

  // Erst fein genug fragmentieren (jedes Stück ≤ maxChars, bevorzugt an groben
  // Grenzen), dann gierig wieder zu möglichst vollen Chunks packen.
  const pieces = splitPiece(text, maxChars, 0)
  const chunks: string[] = []
  let current = ''
  for (const piece of pieces) {
    if (current && current.length + piece.length > maxChars) {
      chunks.push(current)
      current = ''
    }
    current += piece
  }
  if (current) chunks.push(current)
  return chunks
}
