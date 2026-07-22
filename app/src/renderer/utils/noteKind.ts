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

// Zettelkasten-Titel „202606222240 - Optimierung vs. Transformation" in ID und
// Anzeige-Titel trennen. Die ID (JJJJMMTTHHmm, 10-14 Ziffern) bleibt als stiller
// Chip verfügbar; der Rest wird als Titel angezeigt. Kein Match → id: null.
export function splitZettelTitle(title: string): { zettelId: string | null; displayTitle: string } {
  const match = title.match(/^(\d{10,14})\s*-\s*(.+)$/)
  if (!match) return { zettelId: null, displayTitle: title }
  return { zettelId: match[1], displayTitle: match[2].trim() }
}

export function setNoteKindInContent(content: string, kindId: NoteKindId): string {
  const categoryLine = `category: ${kindId}`
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    const bodyStart = frontmatterMatch[0].length
    const nextFrontmatter = /^(category|noteKind|kind):\s*.*$/m.test(frontmatter)
      ? frontmatter.replace(/^(category|noteKind|kind):\s*.*$/m, categoryLine)
      : `${frontmatter.trimEnd()}\n${categoryLine}`

    return `---\n${nextFrontmatter}\n---${content.slice(bodyStart)}`
  }

  return `---\n${categoryLine}\n---\n\n${content}`
}

export function clearNoteKindInContent(content: string): string {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return content

  const frontmatter = frontmatterMatch[1]
  const bodyStart = frontmatterMatch[0].length

  // Entferne alle drei möglichen Kind-Keys (category, noteKind, kind), je inkl. nachfolgendem Newline.
  const stripped = frontmatter.replace(/^(?:category|noteKind|kind):\s*.*$\n?/gm, '')

  // Wenn der Frontmatter-Block dadurch leer wird, ihn komplett entfernen.
  if (stripped.trim() === '') {
    return content.slice(bodyStart).replace(/^\n+/, '')
  }
  return `---\n${stripped.replace(/\n+$/, '')}\n---${content.slice(bodyStart)}`
}

// ─── KI-Provenienz (welches Modell hat zuletzt bearbeitet) ───────────────────
// Durable, maschinenlesbar im Frontmatter; unsichtbar im Lesen-Modus.
export function setAiProvenanceInContent(content: string, model: string, date: string): string {
  const modelLine = `ki-modell: ${model}`
  const dateLine = `ki-datum: ${date}`
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (fmMatch) {
    let fm = fmMatch[1]
    const bodyStart = fmMatch[0].length
    fm = /^ki-modell:\s*.*$/m.test(fm) ? fm.replace(/^ki-modell:\s*.*$/m, modelLine) : `${fm.trimEnd()}\n${modelLine}`
    fm = /^ki-datum:\s*.*$/m.test(fm) ? fm.replace(/^ki-datum:\s*.*$/m, dateLine) : `${fm.trimEnd()}\n${dateLine}`
    return `---\n${fm}\n---${content.slice(bodyStart)}`
  }
  return `---\n${modelLine}\n${dateLine}\n---\n\n${content}`
}

export function getAiProvenance(content: string): { model: string; date: string } | null {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch) return null
  const m = fmMatch[1].match(/^ki-modell:\s*(.+)$/m)
  if (!m) return null
  const d = fmMatch[1].match(/^ki-datum:\s*(.+)$/m)
  return { model: m[1].trim(), date: d ? d[1].trim() : '' }
}

// ─── Tags (Frontmatter) ──────────────────────────────────────────────────────
// Liest vorhandene Tags (inline-Array `tags: [a, b]` oder Block-Liste `- a`).
export function getFrontmatterTags(content: string): string[] {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch) return []
  const fm = fmMatch[1]
  const inline = fm.match(/^tags:\s*\[(.*)\]\s*$/m)
  if (inline) return inline[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  // Block-Liste: `tags:` gefolgt von `  - tag`-Zeilen.
  const block = fm.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m)
  if (block) return block[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  // Einzeiler `tags: a, b` (kein Array).
  const oneLine = fm.match(/^tags:\s*(.+)$/m)
  if (oneLine && !oneLine[1].includes('[')) return oneLine[1].split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
  return []
}

// Fügt einen Tag ins Frontmatter ein (idempotent). Bevorzugt die vorhandene Form;
// legt sonst eine Block-Liste an (Obsidian-üblich, gut lesbar).
export function addTagToFrontmatter(content: string, rawTag: string): string {
  const tag = rawTag.trim().replace(/^#/, '')
  if (!tag) return content
  if (getFrontmatterTags(content).map(t => t.toLowerCase()).includes(tag.toLowerCase())) return content

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch) {
    return `---\ntags:\n  - ${tag}\n---\n\n${content}`
  }
  let fm = fmMatch[1]
  const bodyStart = fmMatch[0].length

  if (/^tags:\s*\[.*\]\s*$/m.test(fm)) {
    // inline-Array: vor `]` einfügen
    fm = fm.replace(/^(tags:\s*\[)(.*)(\]\s*)$/m, (_m, a, inner, c) => {
      const trimmed = inner.trim()
      return `${a}${trimmed ? trimmed + ', ' : ''}${tag}${c}`
    })
  } else if (/^tags:\s*\n(?:\s*-\s*.+\n?)+/m.test(fm)) {
    // Block-Liste: neue Zeile nach dem letzten Listeneintrag
    fm = fm.replace(/^(tags:\s*\n(?:\s*-\s*.+\n?)+)/m, (block) => `${block.replace(/\n?$/, '\n')}  - ${tag}`)
  } else if (/^tags:\s*.+$/m.test(fm)) {
    // Einzeiler ohne Array → anhängen
    fm = fm.replace(/^(tags:\s*.+)$/m, `$1, ${tag}`)
  } else {
    // kein tags-Key → Block-Liste anlegen
    fm = `${fm.trimEnd()}\ntags:\n  - ${tag}`
  }
  return `---\n${fm}\n---${content.slice(bodyStart)}`
}

// ─── Status (open / solved / archived) ──────────────────────────────────────

export type NoteStatus = 'open' | 'solved' | 'archived'

export interface NoteSolutionMeta {
  status: NoteStatus
  solvedBy?: string  // Wikilink-Target ohne [[]] oder Plain-String
  solvedAt?: string  // ISO-Date
}

const STATUS_LINE_REGEX = /^status:\s*(.+?)\s*$/m
const SOLVED_BY_LINE_REGEX = /^solvedBy:\s*(.+?)\s*$/m
const SOLVED_AT_LINE_REGEX = /^solvedAt:\s*(.+?)\s*$/m

const stripQuotesAndBrackets = (value: string): string =>
  value.trim().replace(/^["']|["']$/g, '').replace(/^\[\[|\]\]$/g, '')

export function getNoteStatusFromContent(content: string | undefined | null): NoteSolutionMeta {
  const fallback: NoteSolutionMeta = { status: 'open' }
  if (!content) return fallback
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fm) return fallback

  const block = fm[1]
  const statusMatch = block.match(STATUS_LINE_REGEX)
  const rawStatus = statusMatch ? stripQuotesAndBrackets(statusMatch[1]).toLowerCase() : 'open'
  const status: NoteStatus = rawStatus === 'solved' || rawStatus === 'archived' ? rawStatus : 'open'

  const solvedByMatch = block.match(SOLVED_BY_LINE_REGEX)
  const solvedAtMatch = block.match(SOLVED_AT_LINE_REGEX)
  return {
    status,
    solvedBy: solvedByMatch ? stripQuotesAndBrackets(solvedByMatch[1]) : undefined,
    solvedAt: solvedAtMatch ? stripQuotesAndBrackets(solvedAtMatch[1]) : undefined
  }
}

export function getNoteStatus(note: Pick<Note, 'content'> | null | undefined): NoteSolutionMeta {
  if (!note) return { status: 'open' }
  return getNoteStatusFromContent(note.content)
}

const upsertFrontmatterLine = (frontmatter: string, key: string, value: string): string => {
  const regex = new RegExp(`^${key}:\\s*.*$`, 'm')
  const line = `${key}: ${value}`
  return regex.test(frontmatter)
    ? frontmatter.replace(regex, line)
    : `${frontmatter.trimEnd()}\n${line}`
}

const removeFrontmatterLine = (frontmatter: string, key: string): string => {
  const regex = new RegExp(`^${key}:\\s*.*$\\n?`, 'm')
  return frontmatter.replace(regex, '')
}

const updateFrontmatter = (content: string, transform: (fm: string) => string): string => {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (fm) {
    const next = transform(fm[1])
    const bodyStart = fm[0].length
    return `---\n${next}\n---${content.slice(bodyStart)}`
  }
  return `---\n${transform('')}\n---\n\n${content}`
}

export function markProblemSolvedInContent(content: string, solutionTitle: string, isoDate: string): string {
  return updateFrontmatter(content, fm => {
    let next = upsertFrontmatterLine(fm, 'status', 'solved')
    next = upsertFrontmatterLine(next, 'solvedBy', `"[[${solutionTitle}]]"`)
    next = upsertFrontmatterLine(next, 'solvedAt', isoDate)
    return next.trim()
  })
}

export function reopenProblemInContent(content: string): string {
  return updateFrontmatter(content, fm => {
    let next = removeFrontmatterLine(fm, 'status')
    next = removeFrontmatterLine(next, 'solvedBy')
    next = removeFrontmatterLine(next, 'solvedAt')
    return next.trim()
  })
}

export function markProblemArchivedInContent(content: string): string {
  return updateFrontmatter(content, fm => upsertFrontmatterLine(fm, 'status', 'archived').trim())
}

export function addSolvedForBacklinkInContent(content: string, problemTitle: string): string {
  return updateFrontmatter(content, fm => {
    const wikilink = `"[[${problemTitle}]]"`
    const listMatch = fm.match(/^solvedFor:\s*\[(.*?)\]\s*$/m)
    if (listMatch) {
      const items = listMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      if (items.includes(wikilink)) return fm.trim()
      return fm.replace(/^solvedFor:\s*\[.*?\]\s*$/m, `solvedFor: [${[...items, wikilink].join(', ')}]`).trim()
    }
    if (/^solvedFor:\s*$/m.test(fm)) {
      return fm.replace(/^solvedFor:\s*$/m, `solvedFor: [${wikilink}]`).trim()
    }
    return `${fm.trimEnd()}\n${`solvedFor: [${wikilink}]`}`.trim()
  })
}

export function completeOpenTasksInContent(content: string): { content: string; completedCount: number } {
  let count = 0
  const next = content.replace(/^(\s*)-\s+\[\s\]/gm, (_match, indent: string) => {
    count++
    return `${indent}- [x]`
  })
  return { content: next, completedCount: count }
}

// ─── KI-Relevanz-Cache (Frontmatter) ────────────────────────────────────────

export interface NoteRelevanceCache {
  score?: number       // 0-100 von Ollama
  reason?: string      // 1-Satz-Begründung
  checkedAt?: string   // ISO-Timestamp der letzten Analyse
  model?: string       // verwendetes Ollama-Modell
}

const RELEVANCE_SCORE_REGEX = /^relevanceScore:\s*(.+?)\s*$/m
const RELEVANCE_REASON_REGEX = /^relevanceReason:\s*(.+?)\s*$/m
const RELEVANCE_CHECKED_AT_REGEX = /^relevanceCheckedAt:\s*(.+?)\s*$/m
const RELEVANCE_MODEL_REGEX = /^relevanceModel:\s*(.+?)\s*$/m

export function getNoteRelevanceFromContent(content: string | undefined | null): NoteRelevanceCache {
  if (!content) return {}
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fm) return {}
  const block = fm[1]

  const scoreMatch = block.match(RELEVANCE_SCORE_REGEX)
  const reasonMatch = block.match(RELEVANCE_REASON_REGEX)
  const checkedAtMatch = block.match(RELEVANCE_CHECKED_AT_REGEX)
  const modelMatch = block.match(RELEVANCE_MODEL_REGEX)

  const score = scoreMatch ? Number(scoreMatch[1].trim()) : undefined
  return {
    score: Number.isFinite(score) ? score : undefined,
    reason: reasonMatch ? stripQuotesAndBrackets(reasonMatch[1]) : undefined,
    checkedAt: checkedAtMatch ? stripQuotesAndBrackets(checkedAtMatch[1]) : undefined,
    model: modelMatch ? stripQuotesAndBrackets(modelMatch[1]) : undefined
  }
}

export function getNoteRelevance(note: Pick<Note, 'content'> | null | undefined): NoteRelevanceCache {
  if (!note) return {}
  return getNoteRelevanceFromContent(note.content)
}

const escapeYamlString = (text: string): string => {
  // Quote als YAML-String, mit Escape von " und Backslash
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

export function setNoteRelevanceInContent(
  content: string,
  cache: { score: number; reason: string; isoDate: string; model: string }
): string {
  return updateFrontmatter(content, fm => {
    let next = upsertFrontmatterLine(fm, 'relevanceScore', String(Math.max(0, Math.min(100, Math.round(cache.score)))))
    next = upsertFrontmatterLine(next, 'relevanceReason', escapeYamlString(cache.reason.slice(0, 240)))
    next = upsertFrontmatterLine(next, 'relevanceCheckedAt', cache.isoDate)
    next = upsertFrontmatterLine(next, 'relevanceModel', cache.model)
    return next.trim()
  })
}

export function clearNoteRelevanceInContent(content: string): string {
  return updateFrontmatter(content, fm => {
    let next = removeFrontmatterLine(fm, 'relevanceScore')
    next = removeFrontmatterLine(next, 'relevanceReason')
    next = removeFrontmatterLine(next, 'relevanceCheckedAt')
    next = removeFrontmatterLine(next, 'relevanceModel')
    return next.trim()
  })
}
