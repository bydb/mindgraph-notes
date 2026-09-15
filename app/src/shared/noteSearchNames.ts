/**
 * Namen, unter denen eine Notiz in Suche und Quick Switcher gefunden werden soll.
 *
 * Hintergrund: `note.title` kommt aus der ersten H1 der Notiz. KI-Zusammenfassungen
 * heißen so fast immer „Zusammenfassung", während der sprechende Name nur im
 * Dateinamen (`202609031500 - 🟢 Marburger Forum.md`) und im Frontmatter
 * (`title: "Marburger Forum"`) steht. Eine Suche, die nur `note.title` prüft,
 * findet solche Notizen nicht als Titeltreffer (real, 15.09.2026).
 */

export type NoteNameSource = 'title' | 'fileName' | 'frontmatterTitle'

export interface NoteName {
  source: NoteNameSource
  text: string
}

/** Dateiname ohne Ordner und ohne `.md` / `.pdf.md`. */
export function fileNameFromPath(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  if (base.toLowerCase().endsWith('.pdf.md')) return base.slice(0, -'.pdf.md'.length)
  if (base.toLowerCase().endsWith('.md')) return base.slice(0, -'.md'.length)
  return base
}

/**
 * `title:` aus dem Frontmatter-Block am Dateianfang. Nur der Block ganz oben zählt,
 * ein `title:` mitten im Text ist kein Titel. Anführungszeichen werden entfernt.
 */
export function frontmatterTitle(content: string): string | null {
  if (!content || !content.startsWith('---')) return null
  const match = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match) return null
  for (const rawLine of match[1].split(/\r?\n/)) {
    const m = rawLine.match(/^title\s*:\s*(.*)$/i)
    if (!m) continue
    let value = m[1].trim()
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1).replace(/\\"/g, '"').trim()
    }
    return value || null
  }
  return null
}

/**
 * Alle Namen einer Notiz in Prioritätsreihenfolge, ohne Doppelte
 * (Vergleich ohne Groß-/Kleinschreibung).
 */
export function noteSearchNames(note: { title: string; path: string; content: string }): NoteName[] {
  const names: NoteName[] = []
  const seen = new Set<string>()
  const push = (source: NoteNameSource, text: string | null | undefined) => {
    const t = (text ?? '').trim()
    if (!t) return
    const key = t.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    names.push({ source, text: t })
  }
  push('title', note.title)
  push('fileName', fileNameFromPath(note.path))
  push('frontmatterTitle', frontmatterTitle(note.content))
  return names
}

/**
 * Erster Name, der den (bereits kleingeschriebenen) Suchbegriff enthält.
 * Rückgabe null, wenn keiner passt.
 */
export function matchNoteName(
  note: { title: string; path: string; content: string },
  queryLower: string
): NoteName | null {
  if (!queryLower) return null
  for (const name of noteSearchNames(note)) {
    if (name.text.toLowerCase().includes(queryLower)) return name
  }
  return null
}
