// Importnotiz eines reMarkable-Notizbuchs: erkennen und auf den Stand eines frischen Downloads
// bringen. Pur (kein electronAPI), damit die Fälle aus Codex F02/F08/F10/F15 testbar sind.
//
// Die Importnotiz entsteht in RemarkablePanel mit Frontmatter (`remarkable_id`, `sourcePdf`, …)
// und der Einbettung `![[<sourcePdf>]]`. Alles, was der Nutzer darunter schreibt, bleibt
// unangetastet — hier ändern sich nur Frontmatter-Felder und der PDF-Verweis.

export interface ImportCandidateNote {
  path: string
  content: string
  sourcePdf?: string
}

interface FrontmatterParts {
  /** Ab `---\n` bis vor die schließende `---`-Zeile */
  frontmatter: string
  /** Schließende `---`-Zeile samt Rest der Datei */
  rest: string
}

function splitFrontmatter(content: string): FrontmatterParts | null {
  if (!content.startsWith('---\n')) return null
  const close = content.indexOf('\n---', 3)
  if (close === -1) return null
  const afterDashes = close + 4
  // `---` muss die ganze Zeile sein (nicht `----` oder `--- x`)
  if (afterDashes < content.length && content[afterDashes] !== '\n' && content[afterDashes] !== '\r') return null
  return { frontmatter: content.slice(0, close), rest: content.slice(close) }
}

function readField(frontmatter: string, key: string): string | undefined {
  const m = frontmatter.match(new RegExp(`^${key}:\\s*"([^"\\n]*)"\\s*$`, 'm'))
  return m?.[1]
}

/** Geräte-ID der Importnotiz — NUR aus dem Frontmatter, nie aus dem Fließtext. */
export function importIdOf(content: string): string | undefined {
  const parts = splitFrontmatter(content)
  return parts ? readField(parts.frontmatter, 'remarkable_id') : undefined
}

export function sourcePdfOf(content: string): string | undefined {
  const parts = splitFrontmatter(content)
  return parts ? readField(parts.frontmatter, 'sourcePdf') : undefined
}

/**
 * Lohnt es sich, diese Notiz von der Platte zu lesen? Geladene Notizen werden direkt geprüft;
 * Cache-Stubs (`content: ''`, nach jedem App-Start) über Ordner, ID-Präfix im Pfad oder im
 * gecachten `sourcePdf` — sonst fand die Suche bestehende Importe nicht (Codex F02).
 */
export function isImportCandidate(note: ImportCandidateNote, docId: string): boolean {
  if (note.content) return importIdOf(note.content) === docId
  const id8 = docId.slice(0, 8)
  return note.path.startsWith('reMarkable/') || note.path.includes(id8) || (note.sourcePdf ?? '').includes(id8)
}

export interface ImportRefresh {
  modifiedClient: string
  importedAt: string
  relativePdfPath: string
  pageCount?: number
  /** false = Gerät lieferte identische Bytes */
  changed?: boolean
}

export type ImportNoteUpdate =
  | { status: 'updated'; content: string }
  | { status: 'unchanged'; content: string }
  | { status: 'no-frontmatter'; content: string }

function setField(frontmatter: string, key: string, value: string): string {
  const line = `${key}: ${value}`
  const re = new RegExp(`^${key}:.*$`, 'm')
  return re.test(frontmatter) ? frontmatter.replace(re, () => line) : `${frontmatter}\n${line}`
}

/** Fügt die Einbettung hinter der ersten H1 ein, sonst an den Anfang des Notiztexts. */
function insertEmbed(rest: string, embed: string): string {
  const closeLineEnd = rest.indexOf('\n', 1)
  if (closeLineEnd === -1) return `${rest}\n\n${embed}\n`
  const head = rest.slice(0, closeLineEnd + 1)
  const body = rest.slice(closeLineEnd + 1)
  const h1 = body.match(/^# .*$/m)
  if (h1 && h1.index !== undefined) {
    const end = h1.index + h1[0].length
    return `${head}${body.slice(0, end)}\n\n${embed}${body.slice(end)}`
  }
  return `${head}\n${embed}\n${body}`
}

export function updateImportNote(content: string, refresh: ImportRefresh): ImportNoteUpdate {
  const parts = splitFrontmatter(content)
  if (!parts) return { status: 'no-frontmatter', content }

  const oldPdf = readField(parts.frontmatter, 'sourcePdf')
  const embed = `![[${refresh.relativePdfPath}]]`
  const pagesKnown = /^remarkable_pages:/m.test(parts.frontmatter)
  // Nichts Neues vom Gerät und Notiz vollständig: nicht bei jedem Öffnen neu schreiben.
  if (refresh.changed === false && oldPdf === refresh.relativePdfPath && pagesKnown && parts.rest.includes(embed)) {
    return { status: 'unchanged', content }
  }

  let frontmatter = parts.frontmatter
  frontmatter = setField(frontmatter, 'remarkable_modified', JSON.stringify(refresh.modifiedClient))
  frontmatter = setField(frontmatter, 'remarkable_imported_at', JSON.stringify(refresh.importedAt))
  if (typeof refresh.pageCount === 'number') frontmatter = setField(frontmatter, 'remarkable_pages', String(refresh.pageCount))
  if (oldPdf !== refresh.relativePdfPath) frontmatter = setField(frontmatter, 'sourcePdf', JSON.stringify(refresh.relativePdfPath))

  let rest = parts.rest
  if (oldPdf && oldPdf !== refresh.relativePdfPath) rest = rest.split(`![[${oldPdf}]]`).join(embed)
  if (!rest.includes(embed)) rest = insertEmbed(rest, embed)

  const updated = frontmatter + rest
  return updated === content ? { status: 'unchanged', content } : { status: 'updated', content: updated }
}

export function hasExtractedSection(content: string): boolean {
  return content.includes('## Extrahierter Inhalt') || content.includes('## Extracted Content')
}
