import type { Note } from '../../shared/types'

// Erkennung & Beschriftung von Brain-Tagesnotizen (lokales Tagesgedächtnis).
// Brain-Notizen liegen unter dem konfigurierten Brain-Ordner (Default
// `800 - 🧠 brain/JJJJ/MM/TT.md`) und tragen Frontmatter `type: brain-day`.
// Sie heißen nur „TT" (z.B. „17") — daher braucht die UI eine eigene Kennung
// + ein sprechendes Label, sonst fallen sie als nichtssagende „17" durch.

export const BRAIN_FOLDER_DEFAULT = '800 - 🧠 brain'

const stripTrailingSlash = (s: string): string => s.replace(/\/+$/, '')

/**
 * Ist die Notiz eine Brain-Tageszusammenfassung?
 * Primär pfadbasiert (funktioniert auch bei leerem Cache-Content), mit
 * Frontmatter-Fallback (`type: brain-day`), falls Content geladen ist.
 */
export function isBrainNote(
  note: Pick<Note, 'path' | 'content'> | null | undefined,
  brainFolder?: string
): boolean {
  if (!note) return false
  const folder = stripTrailingSlash((brainFolder || '').trim() || BRAIN_FOLDER_DEFAULT)
  if (folder && note.path.startsWith(`${folder}/`)) return true
  if (note.content) {
    const fm = note.content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (fm && /^type:\s*brain-day\s*$/m.test(fm[1])) return true
  }
  return false
}

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
]

/** Datum einer Brain-Notiz aus dem Pfad (…/JJJJ/MM/TT.md) oder Frontmatter. */
export function brainNoteDate(note: Pick<Note, 'path' | 'content'>): { y: number; m: number; d: number } | null {
  const p = note.path.match(/(\d{4})\/(\d{2})\/(\d{1,2})(?:\s*\(\d+\))?\.md$/)
  if (p) return { y: +p[1], m: +p[2], d: +p[3] }
  if (note.content) {
    const fm = note.content.match(/^---\s*\n([\s\S]*?)\n---/)
    const dm = fm?.[1].match(/^date:\s*(\d{4})-(\d{2})-(\d{2})/m)
    if (dm) return { y: +dm[1], m: +dm[2], d: +dm[3] }
  }
  return null
}

/** Sprechendes Label statt „17": z.B. „17. Juni". Fallback: roher Titel. */
export function brainNoteLabel(note: Pick<Note, 'path' | 'title' | 'content'>): string {
  const dt = brainNoteDate(note)
  if (dt && dt.m >= 1 && dt.m <= 12) return `${dt.d}. ${MONTHS_DE[dt.m - 1]}`
  return note.title
}
