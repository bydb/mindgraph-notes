import type { Note } from '../../shared/types'

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

export function getNoteKindFromText(text: string | undefined | null): NoteKindDefinition | null {
  if (!text) return null
  for (const kind of Object.values(NOTE_KINDS)) {
    if (text.includes(kind.emoji)) return kind
  }
  return null
}

export function getNoteKindFromContent(content: string | undefined | null): NoteKindDefinition | null {
  if (!content) return null
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/)
  const source = frontmatter?.[1] || content
  const categoryMatch = source.match(/^category:\s*(.+?)\s*$/m)
  return getNoteKindFromMarker(categoryMatch?.[1])
}

export function getNoteKind(note: Pick<Note, 'title' | 'path' | 'content'> | null | undefined): NoteKindDefinition | null {
  if (!note) return null
  return getNoteKindFromContent(note.content)
    || getNoteKindFromText(note.title)
    || getNoteKindFromText(note.path)
}

export function stripNoteKindMarker(text: string): string {
  return text
    .replace(/(^|\s-\s)\s*[🔴🟢🔵]\s+/u, '$1')
    .replace(/^[🔴🟢🔵]\s+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}
