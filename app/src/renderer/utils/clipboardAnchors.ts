import type { PastedAnchor } from '../../shared/emailPasteLinks'

/**
 * Liest die Links aus dem HTML-Teil der Zwischenablage: sichtbarer Text, Ziel und
 * der Text davor (damit sich gleiche Beschriftungen abzählen lassen).
 * `DOMParser` baut ein totes Dokument — es lädt nichts nach und führt nichts aus.
 */
export function anchorsFromClipboardHtml(html: string): PastedAnchor[] {
  if (!html || !/<a\s/i.test(html)) return []
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return []
  }
  const root = doc.body
  if (!root) return []

  const anchors: PastedAnchor[] = []
  let running = ''
  let currentEl: Element | null = null
  let current: PastedAnchor | null = null

  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue || ''
      const parent = (node as Text).parentElement
      const link = parent ? parent.closest('a[href]') : null
      if (link) {
        if (link !== currentEl) {
          currentEl = link
          current = { text: '', href: link.getAttribute('href') || '', before: running }
          anchors.push(current)
        }
        if (current) current.text += text
      } else {
        currentEl = null
        current = null
      }
      running += text
      return
    }
    if (node.nodeType !== 1) return
    const tag = (node as Element).tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'head' || tag === 'template') return
    // Blockgrenzen trennen Wörter, auch wenn im HTML kein Leerraum steht.
    if (tag !== 'a' && tag !== 'span' && tag !== 'b' && tag !== 'i' && tag !== 'strong' && tag !== 'em' && tag !== 'u') running += ' '
    for (const child of Array.from(node.childNodes)) visit(child)
  }
  visit(root)
  return anchors
}
