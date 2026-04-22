import type { Note, NoteHeading, NoteBlock } from '../../shared/types'
import { extractTasks } from '../../shared/taskExtractor'
export { extractTasks }
export type { ExtractedTask, TaskSummary } from '../../shared/taskExtractor'

const WIKILINK_REGEX = /(?<!!)\[\[([^\]|]+)(\|[^\]]+)?\]\]/g
const TAG_REGEX = /#([\p{L}\p{N}_-]+)/gu

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?)$/i

export function extractLinks(content: string): string[] {
  const links: string[] = []
  let match

  // Reset regex state
  WIKILINK_REGEX.lastIndex = 0

  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    const linkTarget = match[1].trim()
    // Bild-Embeds und andere Medien-Dateien nicht als Links zählen
    if (!IMAGE_EXTENSIONS.test(linkTarget)) {
      links.push(linkTarget)
    }
  }

  return [...new Set(links)] // Deduplizieren
}

export function extractTags(content: string): string[] {
  const tags: string[] = []
  let match

  // 1. Extrahiere Tags aus YAML Frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]

    // Format: tags: [tag1, tag2] oder tags: ["tag1", "tag2"]
    const inlineArrayMatch = frontmatter.match(/^tags:\s*\[([^\]]*)\]/m)
    if (inlineArrayMatch) {
      const arrayContent = inlineArrayMatch[1]
      const arrayTags = arrayContent.split(',').map(t =>
        t.trim().replace(/^["']|["']$/g, '')
      ).filter(t => t)
      tags.push(...arrayTags)
    }

    // Format: tags:\n  - tag1\n  - tag2
    const listMatch = frontmatter.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m)
    if (listMatch) {
      const listContent = listMatch[1]
      const listTags = listContent.match(/^\s+-\s+(.+)$/gm)
      if (listTags) {
        for (const tagLine of listTags) {
          const tag = tagLine.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '')
          if (tag) tags.push(tag)
        }
      }
    }
  }

  // 2. Extrahiere Inline-Tags (#tag)
  TAG_REGEX.lastIndex = 0
  while ((match = TAG_REGEX.exec(content)) !== null) {
    tags.push(match[1])
  }

  return [...new Set(tags)]
}

export function resolveLink(linkText: string, allNotes: Note[]): Note | null {
  const normalizedLink = linkText.toLowerCase()

  // PDF-Link: [[document.pdf]] -> suche Companion-Note mit sourcePdf
  if (normalizedLink.endsWith('.pdf')) {
    const pdfMatch = allNotes.find(note => {
      if (!note.sourcePdf) return false
      // Vergleiche PDF-Dateinamen
      const pdfFileName = note.sourcePdf.split('/').pop()?.toLowerCase() || ''
      const linkFileName = normalizedLink.split('/').pop() || normalizedLink
      return pdfFileName === linkFileName || note.sourcePdf.toLowerCase() === normalizedLink
    })
    if (pdfMatch) return pdfMatch
  }

  // Exakter Match auf Titel (case-insensitive)
  const exactMatch = allNotes.find(
    note => note.title.toLowerCase() === normalizedLink
  )
  if (exactMatch) return exactMatch

  // Match auf Dateiname ohne Extension
  const fileNameMatch = allNotes.find(note => {
    const fileName = note.path.split('/').pop()?.replace('.md', '') || ''
    return fileName.toLowerCase() === normalizedLink
  })
  if (fileNameMatch) return fileNameMatch

  // Partial Match (Pfad enthält den Link-Text)
  const partialMatch = allNotes.find(
    note => note.path.toLowerCase().includes(normalizedLink)
  )
  return partialMatch || null
}

export function extractTitle(content: string, fileName: string): string {
  // Extract leading emoji from filename (e.g. "202512091255 - 🟢 Title.md" → "🟢")
  const nameWithoutExt = fileName.endsWith('.pdf.md')
    ? fileName.replace('.pdf.md', '')
    : fileName.replace('.md', '')
  const emojiMatch = nameWithoutExt.match(/(?:^|\s-\s)([\p{Emoji_Presentation}\p{Extended_Pictographic}]+(?:\s[\p{Emoji_Presentation}\p{Extended_Pictographic}]+)*)\s/u)
  const fileNameEmoji = emojiMatch ? emojiMatch[1] : ''

  // Versuche, ersten H1 zu finden
  const h1Match = content.match(/^#\s+(.+)$/m)
  if (h1Match) {
    const h1Title = h1Match[1].trim()
    // Prepend emoji from filename if H1 doesn't already contain it
    if (fileNameEmoji && !h1Title.includes(fileNameEmoji)) {
      return `${fileNameEmoji} ${h1Title}`
    }
    return h1Title
  }

  // Fallback: Dateiname ohne Extension
  return nameWithoutExt
}

// Generiert eine eindeutige ID aus dem Pfad
export function generateNoteId(path: string): string {
  // Einfacher Hash basierend auf dem Pfad
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

// Callout-Typen die auf Karten angezeigt werden sollen
const CARD_CALLOUT_TYPES = ['summary', 'tldr', 'abstract', 'note', 'info']
const CARD_CALLOUT_TYPE_ALIASES: Record<string, string> = {
  zusammenfassung: 'summary',
  tl_dr: 'tldr',
  'tl-dr': 'tldr'
}

export interface ExtractedCallout {
  type: string
  title: string
  content: string
  icon: string
}

// Extrahiert Callouts aus dem Content (für Kartenanzeige)
export function extractCallouts(content: string): ExtractedCallout[] {
  const callouts: ExtractedCallout[] = []

  const lines = content.split('\n')
  const headerRegex = /^>\s*\[!([^\]\s]+)\][+-]?\s*(.*)$/

  for (let i = 0; i < lines.length; i++) {
    const headerMatch = lines[i].match(headerRegex)
    if (!headerMatch) continue

    const rawType = headerMatch[1].toLowerCase()
    const normalizedType = CARD_CALLOUT_TYPE_ALIASES[rawType] || rawType
    if (!CARD_CALLOUT_TYPES.includes(normalizedType)) continue

    const customTitle = headerMatch[2]?.trim()
    const bodyLines: string[] = []
    let j = i + 1

    while (j < lines.length && /^>/.test(lines[j])) {
      bodyLines.push(lines[j].replace(/^>\s?/, '').trim())
      j++
    }

    let cleanBody = bodyLines
      .filter(Boolean)
      .join(' ')
      .trim()

    // Fallback für einzeilige Callouts: > [!summary] Dein Text ...
    if (!cleanBody && customTitle) {
      cleanBody = customTitle
    }

    // Icons für Callout-Typen
    const icons: Record<string, string> = {
      summary: '📄',
      tldr: '📄',
      abstract: '📄',
      note: '📝',
      info: 'ℹ️'
    }

    callouts.push({
      type: normalizedType,
      title: cleanBody === customTitle ? normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1) : (customTitle || normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)),
      content: cleanBody,
      icon: icons[normalizedType] || '📌'
    })

    i = j - 1
  }

  return callouts
}

// Extrahiert den ersten passenden Callout für die Kartenanzeige
export function extractFirstCardCallout(content: string): ExtractedCallout | null {
  const callouts = extractCallouts(content)
  return callouts.length > 0 ? callouts[0] : null
}

// ============ TASK EXTRACTION ============
// Die Kernfunktion `extractTasks` + Types `ExtractedTask`/`TaskSummary`
// leben in `shared/taskExtractor.ts` (oben re-exportiert), damit sie auch
// im Main-Prozess (Telegram-Bot) nutzbar sind.

// Vault-weite Task-Statistiken — bleibt renderer-lokal
export interface VaultTaskStats {
  total: number
  completed: number
  open: number
  critical: number
  overdue: number
}

// Baut eine Task-Markdown-Zeile aus Komponenten auf.
// Behält Einrückung und Listen-Marker (`-` oder `*`) der rawLine bei, damit
// User-Formatierung erhalten bleibt. Neue Tasks nutzen `- [ ]`.
export function buildTaskLine(opts: {
  rawLine?: string         // bestehende Zeile (für Einrückungs-Erhaltung)
  completed: boolean
  text: string             // sauberer Text (ohne Datum, ohne Tags)
  tags: string[]
  dueDate?: Date
}): string {
  let prefix = '- '
  if (opts.rawLine) {
    const m = opts.rawLine.match(/^(\s*[-*])\s*\[[ xX]\]\s*/)
    if (m) prefix = m[1] + ' '
  }

  const checkbox = opts.completed ? '[x]' : '[ ]'
  const textPart = opts.text.trim()
  const tagPart = opts.tags.length > 0 ? ' ' + opts.tags.map(t => `#${t}`).join(' ') : ''

  let datePart = ''
  if (opts.dueDate) {
    const y = opts.dueDate.getFullYear()
    const m = String(opts.dueDate.getMonth() + 1).padStart(2, '0')
    const d = String(opts.dueDate.getDate()).padStart(2, '0')
    const hh = opts.dueDate.getHours()
    const mm = opts.dueDate.getMinutes()
    const hasTime = hh !== 0 || mm !== 0
    datePart = hasTime
      ? ` (@[[${y}-${m}-${d}]] ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')})`
      : ` (@[[${y}-${m}-${d}]])`
  }

  return `${prefix}${checkbox} ${textPart}${tagPart}${datePart}`.trimEnd()
}

// Extrahiert Task-Statistiken für den Cache (wird beim Parsen aufgerufen)
// overdue wird NICHT gecacht sondern live berechnet (→ getVaultTaskStats),
// damit tagesübergreifend keine stale Werte entstehen.
// Stattdessen: uncompletedDueDates für Live-Auswertung speichern.
export function extractTaskStatsForCache(content: string): { total: number; completed: number; critical: number; overdue: number; uncompletedDueDates?: string[] } {
  const summary = extractTasks(content)
  const dueDates = summary.tasks
    .filter(t => !t.completed && t.dueDate)
    .map(t => t.dueDate!.toISOString())
  return {
    total: summary.total,
    completed: summary.completed,
    critical: summary.critical,
    overdue: 0,
    uncompletedDueDates: dueDates.length > 0 ? dueDates : undefined
  }
}

// Berechnet Vault-weite Task-Statistiken aus allen Notizen
// Unterstützt sowohl Notes mit content als auch CachedNoteMetadata mit taskStats
// overdue wird IMMER live gegen das aktuelle Datum geprüft (nicht aus Cache gelesen)
export function getVaultTaskStats(notes: Array<{ content?: string; taskStats?: { total: number; completed: number; critical: number; overdue: number; uncompletedDueDates?: string[] } }>): VaultTaskStats {
  let total = 0
  let completed = 0
  let critical = 0
  let overdue = 0

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  for (const note of notes) {
    if (note.content) {
      const summary = extractTasks(note.content)
      total += summary.total
      completed += summary.completed
      critical += summary.critical
      overdue += summary.tasks.filter(t => !t.completed && t.dueDate && t.dueDate < todayStart).length
    } else if (note.taskStats) {
      total += note.taskStats.total
      completed += note.taskStats.completed
      critical += note.taskStats.critical
      if (note.taskStats.uncompletedDueDates) {
        overdue += note.taskStats.uncompletedDueDates.filter(d => new Date(d) < todayStart).length
      } else {
        overdue += note.taskStats.overdue
      }
    }
  }

  return {
    total,
    completed,
    open: total - completed,
    critical,
    overdue
  }
}

// ============ EXTERNAL LINKS & IMAGE EXTRACTION ============

export interface ExtractedExternalLink {
  url: string
  text: string
  line: number
}

export interface ExtractedImage {
  fileName: string
  line: number
}

// Extrahiert externe Links (http/https)
export function extractExternalLinks(content: string): ExtractedExternalLink[] {
  const links: ExtractedExternalLink[] = []
  const lines = content.split('\n')

  // Markdown Link: [text](url)
  const mdLinkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g

  lines.forEach((line, index) => {
    let match
    mdLinkRegex.lastIndex = 0
    while ((match = mdLinkRegex.exec(line)) !== null) {
      links.push({
        text: match[1] || 'Link',
        url: match[2],
        line: index + 1
      })
    }
  })

  return links
}

// Extrahiert das erste eingebettete Bild
export function extractFirstImage(content: string): ExtractedImage | null {
  const lines = content.split('\n')

  // Obsidian embed: ![[image.png]] oder ![[image.jpg]]
  const embedRegex = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg))\]\]/i
  // Standard markdown: ![alt](path)
  const mdImgRegex = /!\[[^\]]*\]\(([^)]+\.(png|jpg|jpeg|gif|webp|svg))\)/i

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    const embedMatch = line.match(embedRegex)
    if (embedMatch) {
      return {
        fileName: embedMatch[1],
        line: index + 1
      }
    }

    const mdMatch = line.match(mdImgRegex)
    if (mdMatch) {
      return {
        fileName: mdMatch[1],
        line: index + 1
      }
    }
  }

  return null
}

// ============ HEADING & BLOCK EXTRACTION ============

// Extrahiert alle Überschriften aus Content
export function extractHeadings(content: string): NoteHeading[] {
  const headings: NoteHeading[] = []
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index
      })
    }
  })
  return headings
}

// Extrahiert alle Blöcke mit ^ID
// Obsidian-Format: Text am Zeilenende mit ^blockid (mit oder ohne Leerzeichen davor)
export function extractBlocks(content: string): NoteBlock[] {
  const blocks: NoteBlock[] = []
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    // Match ^blockid am Zeilenende (mit optionalem Whitespace davor und danach)
    const match = line.match(/\s?\^([a-zA-Z0-9-_]+)\s*$/)
    if (match) {
      blocks.push({
        id: match[1],
        line: index,
        content: line.replace(/\s?\^[a-zA-Z0-9-_]+\s*$/, '').trim().substring(0, 100)
      })
    }
  })
  return blocks
}

// Block-ID generieren (6 Zeichen alphanumerisch)
export function generateBlockId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

// Paragraph-Daten für Block-Autocomplete (inkl. Absätze ohne ID)
export interface ContentParagraph {
  line: number           // Zeilennummer
  content: string        // Inhalt (erste 100 Zeichen)
  existingId?: string    // Vorhandene Block-ID (falls vorhanden)
}

// Extrahiert alle referenzierbaren Absätze aus Content
// Inkludiert sowohl Absätze mit bestehender ^ID als auch ohne
export function extractParagraphs(content: string): ContentParagraph[] {
  const paragraphs: ContentParagraph[] = []
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    const trimmedLine = line.trim()

    // Überspringe leere Zeilen, Frontmatter-Grenzen, und reine Formatierungszeilen
    if (!trimmedLine ||
        trimmedLine === '---' ||
        trimmedLine.match(/^#{1,6}\s*$/) ||  // Leere Überschriften
        trimmedLine === '>' ||               // Leere Blockquotes
        trimmedLine.match(/^[-*+]\s*$/) ||   // Leere Listenpunkte
        trimmedLine.match(/^\d+\.\s*$/)) {   // Leere nummerierte Listen
      return
    }

    // Prüfe ob Zeile bereits eine Block-ID hat
    const blockIdMatch = line.match(/\s?\^([a-zA-Z0-9-_]+)\s*$/)

    // Erstelle Vorschau-Text (ohne Block-ID falls vorhanden)
    let previewContent = trimmedLine
    if (blockIdMatch) {
      previewContent = trimmedLine.replace(/\s?\^[a-zA-Z0-9-_]+\s*$/, '').trim()
    }

    // Kürze auf 100 Zeichen
    if (previewContent.length > 100) {
      previewContent = previewContent.substring(0, 97) + '...'
    }

    paragraphs.push({
      line: index,
      content: previewContent,
      existingId: blockIdMatch ? blockIdMatch[1] : undefined
    })
  })

  return paragraphs
}
