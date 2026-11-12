/**
 * Links beim Einfügen in den Mailtext erhalten.
 *
 * Das Textfeld der Mail nimmt nur `text/plain`. Ein beschrifteter Link aus einer
 * Webseite, einem Chat oder einer Notiz („Anmeldung“ → https://…) verliert dabei
 * seine Adresse: im Text steht nur noch „Anmeldung“. Die Zwischenablage trägt die
 * Adresse aber im HTML-Teil. Hier wird der Klartext beibehalten (Umbrüche und
 * Aufbau stammen von der Quell-App) und nur die Beschriftung an ihrer Stelle durch
 * `[Beschriftung](Adresse)` ersetzt — die Form, die der Versand als Link verschickt.
 *
 * Pur und ohne DOM: das Auslesen der Anker aus dem HTML macht der Renderer.
 */

export interface PastedAnchor {
  /** Sichtbarer Text des Links. */
  text: string
  /** Ziel, wie es im HTML steht. */
  href: string
  /** Sichtbarer Text des Dokuments VOR diesem Link (zum Abzählen gleicher Beschriftungen). */
  before: string
}

const MAX_ANCHORS = 500

/** Nur Adressen, die der Versand verlinkt: http(s) und mailto. Sonst null. */
export function normalizePastedHref(href: string): string | null {
  const value = (href || '').trim()
  if (!/^(https?:\/\/|mailto:)\S/i.test(value)) return null
  // Die Markdown-Form endet an Leerraum und an „)“.
  return value.replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
}

function collapse(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function bareTarget(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\?.*$/, m => (m.length > 1 ? m : ''))
    .replace(/\/+$/, '')
}

/** Beschriftung ist die Adresse selbst — der Versand verlinkt sie ohnehin. */
function labelIsTarget(label: string, href: string): boolean {
  if (/\s/.test(label)) return false
  let decoded = href
  try { decoded = decodeURI(href) } catch { /* bleibt roh */ }
  const bare = bareTarget(label)
  return bare === bareTarget(href) || bare === bareTarget(decoded)
}

function labelPattern(label: string): RegExp {
  const parts = label.split(' ').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(parts.join('\\s+'), 'g')
}

function countMatches(pattern: RegExp, text: string): number {
  pattern.lastIndex = 0
  let n = 0
  while (pattern.exec(text) !== null) n++
  return n
}

/**
 * Liefert den einzufügenden Text mit erhaltenen Links — oder `null`, wenn sich
 * gegenüber dem Klartext nichts ändert (dann fügt der Browser wie gewohnt ein).
 * Ein Link, dessen Beschriftung sich im Klartext nicht eindeutig wiederfindet,
 * bleibt unangetastet: lieber ein Link weniger als ein Link am falschen Wort.
 */
export function linkedPasteText(plain: string, anchors: PastedAnchor[]): string | null {
  const text = plain || ''
  if (!text || !Array.isArray(anchors) || anchors.length === 0) return null

  const edits: Array<{ start: number; end: number; replacement: string }> = []
  for (const anchor of anchors.slice(0, MAX_ANCHORS)) {
    const label = collapse(anchor.text)
    const href = normalizePastedHref(anchor.href)
    if (!label || !href) continue
    if (labelIsTarget(label, href)) continue

    const pattern = labelPattern(label)
    const wanted = countMatches(pattern, anchor.before || '')
    pattern.lastIndex = 0
    let match: RegExpExecArray | null = null
    for (let i = 0; i <= wanted; i++) {
      match = pattern.exec(text)
      if (!match) break
    }
    if (!match) continue
    const start = match.index
    const end = start + match[0].length

    // Manche Apps schreiben die Adresse schon selbst hinter die Beschriftung.
    const rest = text.slice(end).replace(/^[\s(<[]+/, '')
    if (rest.toLowerCase().startsWith(anchor.href.trim().toLowerCase()) || rest.toLowerCase().startsWith(href.toLowerCase())) continue
    // Schon Teil eines Markdown-Links.
    if (text[start - 1] === '[' && text.slice(end, end + 2) === '](') continue

    const safeLabel = label.replace(/\[/g, '(').replace(/\]/g, ')')
    edits.push({ start, end, replacement: `[${safeLabel}](${href})` })
  }
  if (edits.length === 0) return null

  edits.sort((a, b) => a.start - b.start)
  let out = ''
  let cursor = 0
  for (const edit of edits) {
    if (edit.start < cursor) continue // überlappt einen früheren Link
    out += text.slice(cursor, edit.start) + edit.replacement
    cursor = edit.end
  }
  out += text.slice(cursor)
  return out === text ? null : out
}

/**
 * Zwischenablage, die NUR eine Adressliste trägt (`text/uri-list`, kein Klartext):
 * das Textfeld fügte bisher nichts ein. Liefert die verschickbaren Adressen, eine je Zeile.
 */
export function uriListPasteText(uriList: string): string | null {
  const lines = (uriList || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && /^(https?:\/\/|mailto:)\S+$/i.test(line))
  return lines.length > 0 ? lines.join('\n') : null
}

/** Ersetzt die Auswahl durch `inserted`; liefert Text und Cursorstelle danach. */
export function insertPastedText(body: string, selectionStart: number, selectionEnd: number, inserted: string): { body: string; cursor: number } {
  const text = body || ''
  const start = Math.min(Math.max(selectionStart, 0), text.length)
  const end = Math.min(Math.max(selectionEnd, start), text.length)
  return { body: text.slice(0, start) + inserted + text.slice(end), cursor: start + inserted.length }
}
