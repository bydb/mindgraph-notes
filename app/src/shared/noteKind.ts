/**
 * Notiz-Kategorien (🔴🟢🔵) und Notiz-Datum — der reine, prozessübergreifende Kern.
 *
 * Der Renderer re-exportiert alles aus `renderer/utils/noteKind.ts` (dort liegen
 * zusätzlich die UI-nahen Helfer mit `Note`-Typ und die Frontmatter-Schreiber).
 * Der Main braucht die Erkennung für den Vault-Index (Vault-Chat-Plan Rev. 3,
 * Entscheidung 9): Kategorie strikt aus Frontmatter oder struktureller
 * Titelposition, Datum mit Herkunft.
 *
 * NICHT duplizieren — wenn ein neuer Ort Farbe/Label braucht, `NOTE_KINDS[kind]`.
 */

export type NoteKindId = 'problem' | 'solution' | 'info'

export interface NoteKindDefinition {
  id: NoteKindId
  emoji: string
  label: string
  aiCategory: string
  dotColor: string
  canvasColor: string
}

export const NOTE_KINDS: Record<NoteKindId, NoteKindDefinition> = {
  problem: {
    id: 'problem',
    emoji: '🔴',
    label: 'Problem',
    aiCategory: 'Aktion/Problem',
    dotColor: '#d93d42',
    canvasColor: '#ffcdd2'
  },
  solution: {
    id: 'solution',
    emoji: '🟢',
    label: 'Lösung',
    aiCategory: 'Wissen/Guide',
    dotColor: '#208f4f',
    canvasColor: '#c8e6c9'
  },
  info: {
    id: 'info',
    emoji: '🔵',
    label: 'Info',
    aiCategory: 'Info/Reader',
    dotColor: '#256fd1',
    canvasColor: '#bbdefb'
  }
}

const emojiToKind = new Map<string, NoteKindDefinition>(
  Object.values(NOTE_KINDS).map(kind => [kind.emoji, kind])
)

const categoryAliases: Record<string, NoteKindId> = {
  '🔴': 'problem',
  red: 'problem',
  problem: 'problem',
  aktion: 'problem',
  action: 'problem',
  '🟢': 'solution',
  green: 'solution',
  solution: 'solution',
  loesung: 'solution',
  lösung: 'solution',
  wissen: 'solution',
  guide: 'solution',
  '🔵': 'info',
  blue: 'info',
  info: 'info',
  reader: 'info'
}

export function getNoteKindFromMarker(value: string | undefined | null): NoteKindDefinition | null {
  if (!value) return null
  const trimmed = value.trim().replace(/^["']|["']$/g, '')
  const emojiKind = emojiToKind.get(trimmed)
  if (emojiKind) return emojiKind

  const normalized = trimmed.toLowerCase()
  const alias = categoryAliases[normalized]
  return alias ? NOTE_KINDS[alias] : null
}

/** Lockere Variante: irgendein Marker-Emoji irgendwo im Text. NICHT für Indizes nutzen. */
export function getNoteKindFromText(text: string | undefined | null): NoteKindDefinition | null {
  if (!text) return null
  for (const kind of Object.values(NOTE_KINDS)) {
    if (text.includes(kind.emoji)) return kind
  }
  return null
}

// Striktere Variante: matched Emoji-Marker nur an strukturell sinnvollen Positionen im Titel —
// am Anfang oder direkt nach " - " (analog zur Konvention `{zettelkasten-id} - 🔴 {titel}`).
// Verhindert False Positives bei zufälligen Inline-Emojis in Notiz-Inhalt oder Pfad,
// matched aber den geläufigen Schreibstil mit ID-Präfix.
const TITLE_KIND_MARKER_PATTERN = /(?:^|\s-\s)\s*([🔴🟢🔵])(?:\s|-|$)/u

export function getNoteKindFromTitleStrict(text: string | undefined | null): NoteKindDefinition | null {
  if (!text) return null
  const match = text.match(TITLE_KIND_MARKER_PATTERN)
  if (!match) return null
  return emojiToKind.get(match[1]) ?? null
}

export function getNoteKindFromContent(content: string | undefined | null): NoteKindDefinition | null {
  if (!content) return null
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/)
  const source = frontmatter?.[1] || content
  const categoryMatch = source.match(/^(?:category|noteKind|kind):\s*(.+?)\s*$/m)
  return getNoteKindFromMarker(categoryMatch?.[1])
}

/**
 * Kategorie für Indizes: Frontmatter, sonst strikter Titel-Marker im Dateinamen.
 * Kein Pfad-Fallback, kein Inline-Emoji (sonst werden Zettel mit zufälligen
 * Emojis falsch einsortiert — siehe CLAUDE.md „Notiz-Kategorien").
 */
export function getNoteKindStrict(fileRel: string, content: string): NoteKindId | null {
  const fromContent = getNoteKindFromContent(content)
  if (fromContent) return fromContent.id
  const base = fileRel.replace(/\\/g, '/').split('/').pop() ?? ''
  return getNoteKindFromTitleStrict(base.replace(/\.md$/i, ''))?.id ?? null
}

// ─── Notiz-Datum ─────────────────────────────────────────────────────────────

export type NoteDateSource = 'frontmatter' | 'filename' | 'mtime'

export interface NoteDate {
  dateValue: number
  dateSource: NoteDateSource
}

function localDate(y: number, m: number, d: number, h = 0, mi = 0): number | null {
  if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const date = new Date(y, m - 1, d, h, mi)
  // new Date(2026, 1, 31) rollt still in den März — das ist kein gültiges Datum.
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return date.getTime()
}

/**
 * Datum aus dem Dateinamen bzw. Pfad, Ortszeit:
 *   `202609181530 - Titel.md` (Zettel-ID, 12 Ziffern), `20260918 - Titel.md`,
 *   `2026-09-18.md` (Daily Note), `…/2026/09/18.md` (Brain-Tag).
 */
export function noteDateFromFileName(fileRel: string): number | null {
  const posix = fileRel.replace(/\\/g, '/')
  const base = (posix.split('/').pop() ?? '').replace(/\.md$/i, '')

  let m = base.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(?!\d)/)
  if (m) {
    const v = localDate(+m[1], +m[2], +m[3], +m[4], +m[5])
    if (v !== null) return v
  }
  m = base.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/)
  if (m) {
    const v = localDate(+m[1], +m[2], +m[3])
    if (v !== null) return v
  }
  m = base.match(/^(\d{4})-(\d{2})-(\d{2})(?!\d)/)
  if (m) {
    const v = localDate(+m[1], +m[2], +m[3])
    if (v !== null) return v
  }
  m = posix.match(/(?:^|\/)(\d{4})\/(\d{2})\/(\d{2})(?: \(\d+\))?\.md$/i)
  if (m) {
    const v = localDate(+m[1], +m[2], +m[3])
    if (v !== null) return v
  }
  return null
}

/** `date:` oder `created:` im Frontmatter (JJJJ-MM-TT, optional Uhrzeit), Ortszeit. */
export function noteDateFromFrontmatter(content: string): number | null {
  const fm = content.match(/^﻿?---\s*\n([\s\S]*?)\n---/)
  if (!fm) return null
  const line = fm[1].match(/^(?:date|created):\s*["']?(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/m)
  if (!line) return null
  return localDate(+line[1], +line[2], +line[3], line[4] ? +line[4] : 0, line[5] ? +line[5] : 0)
}

/** Datum mit Herkunft: Frontmatter → Dateiname → mtime (Entscheidung 9). */
export function resolveNoteDate(fileRel: string, content: string, mtime: number): NoteDate {
  const fromFm = noteDateFromFrontmatter(content)
  if (fromFm !== null) return { dateValue: fromFm, dateSource: 'frontmatter' }
  const fromName = noteDateFromFileName(fileRel)
  if (fromName !== null) return { dateValue: fromName, dateSource: 'filename' }
  return { dateValue: mtime, dateSource: 'mtime' }
}
