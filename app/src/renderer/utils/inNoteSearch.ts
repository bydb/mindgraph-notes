/**
 * Suche in der geöffneten Notiz (Lesen-Modus). Die Trefferstellen werden über die
 * CSS-Highlight-Schnittstelle (`CSS.highlights`) markiert — **das DOM bleibt unberührt**.
 * Das ist hier Pflicht, nicht Geschmack: der Lesen-Modus ist `contentEditable` und schreibt
 * über turndown nach Markdown zurück. Eingefügte `<mark>`-Elemente würden beim nächsten
 * Autosave in der Notiz landen.
 *
 * Die Textsuche selbst ist pur und getestet; der DOM-Teil bildet nur Offsets auf Ranges ab.
 */

export interface TextPiece {
  /** Länge des Textknotens. */
  length: number
}

/** Fundstellen (Start/Ende) im zusammengesetzten Text, ohne Groß-/Kleinschreibung. */
export function findMatches(haystack: string, needle: string): Array<[number, number]> {
  const q = needle.trim()
  if (q.length < 2) return []
  const hay = haystack.toLowerCase()
  const nee = q.toLowerCase()
  const out: Array<[number, number]> = []
  let from = 0
  for (;;) {
    const i = hay.indexOf(nee, from)
    if (i === -1) break
    out.push([i, i + nee.length])
    from = i + nee.length // keine Überlappungen
    if (out.length >= 500) break // Deckel: bei sehr kurzen Suchen sonst tausende Treffer
  }
  return out
}

/** Bildet einen Offset im zusammengesetzten Text auf (Knotenindex, Offset im Knoten) ab. */
export function locateOffset(pieces: readonly TextPiece[], offset: number): { index: number; offset: number } | null {
  let acc = 0
  for (let i = 0; i < pieces.length; i++) {
    const len = pieces[i].length
    if (offset <= acc + len) return { index: i, offset: offset - acc }
    acc += len
  }
  return null
}

/** Sichtbare Textknoten in Dokumentreihenfolge (ohne Skripte/Styles, ohne leere Knoten). */
export function collectTextNodes(root: HTMLElement): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      const tag = parent.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT
      return (node as Text).data.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })
  let n: Node | null
  while ((n = walker.nextNode())) out.push(n as Text)
  return out
}

/** Ranges aller Treffer von `query` unterhalb von `root` (leer, wenn nichts passt). */
export function matchRanges(root: HTMLElement, query: string): Range[] {
  const nodes = collectTextNodes(root)
  const haystack = nodes.map((n) => n.data).join('')
  const ranges: Range[] = []
  for (const [start, end] of findMatches(haystack, query)) {
    const a = locateOffset(nodes, start)
    const b = locateOffset(nodes, end)
    if (!a || !b) continue
    const r = document.createRange()
    r.setStart(nodes[a.index], a.offset)
    r.setEnd(nodes[b.index], b.offset)
    ranges.push(r)
  }
  return ranges
}

export const HIGHLIGHT_ALL = 'mg-find'
export const HIGHLIGHT_CURRENT = 'mg-find-current'

interface HighlightRegistry {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}
interface HighlightCtor {
  new (...ranges: Range[]): unknown
}

function registry(): HighlightRegistry | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS
  return css?.highlights ?? null
}

/** Setzt die Markierung; ohne Unterstützung der Schnittstelle passiert nichts (kein Fehler). */
export function applyHighlights(ranges: readonly Range[], currentIndex: number): void {
  const reg = registry()
  const Ctor = (globalThis as { Highlight?: HighlightCtor }).Highlight
  if (!reg || !Ctor) return
  clearHighlights()
  if (ranges.length === 0) return
  const others = ranges.filter((_, i) => i !== currentIndex)
  if (others.length > 0) reg.set(HIGHLIGHT_ALL, new Ctor(...others))
  const current = ranges[currentIndex]
  if (current) reg.set(HIGHLIGHT_CURRENT, new Ctor(current))
}

export function clearHighlights(): void {
  const reg = registry()
  if (!reg) return
  reg.delete(HIGHLIGHT_ALL)
  reg.delete(HIGHLIGHT_CURRENT)
}
