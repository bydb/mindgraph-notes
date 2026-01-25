import type { Note, NoteHeading, NoteBlock } from '../../shared/types'

const WIKILINK_REGEX = /\[\[([^\]|]+)(\|[^\]]+)?\]\]/g
const TAG_REGEX = /#([\p{L}\p{N}_-]+)/gu

export function extractLinks(content: string): string[] {
  const links: string[] = []
  let match
  
  // Reset regex state
  WIKILINK_REGEX.lastIndex = 0
  
  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    const linkTarget = match[1].trim()
    links.push(linkTarget)
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
  // Versuche, ersten H1 zu finden
  const h1Match = content.match(/^#\s+(.+)$/m)
  if (h1Match) {
    return h1Match[1].trim()
  }

  // Fallback: Dateiname ohne Extension
  // Für PDF-Companions: datei.pdf.md -> datei
  if (fileName.endsWith('.pdf.md')) {
    return fileName.replace('.pdf.md', '')
  }
  return fileName.replace('.md', '')
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

export interface ExtractedCallout {
  type: string
  title: string
  content: string
  icon: string
}

// Extrahiert Callouts aus dem Content (für Kartenanzeige)
export function extractCallouts(content: string): ExtractedCallout[] {
  const callouts: ExtractedCallout[] = []

  // Callout Pattern: > [!type] optional title
  // Gefolgt von > content lines
  const calloutRegex = /^>\s*\[!(\w+)\](?:\s+(.+))?\n((?:>.*\n?)*)/gm

  let match
  while ((match = calloutRegex.exec(content)) !== null) {
    const type = match[1].toLowerCase()
    const customTitle = match[2]?.trim()
    const body = match[3]

    // Nur bestimmte Callout-Typen für Karten extrahieren
    if (CARD_CALLOUT_TYPES.includes(type)) {
      // Entferne > am Anfang jeder Zeile im Body
      const cleanBody = body
        .split('\n')
        .map((line: string) => line.replace(/^>\s?/, ''))
        .join(' ')
        .trim()

      // Icons für Callout-Typen
      const icons: Record<string, string> = {
        summary: '📄',
        tldr: '📄',
        abstract: '📄',
        note: '📝',
        info: 'ℹ️'
      }

      callouts.push({
        type,
        title: customTitle || type.charAt(0).toUpperCase() + type.slice(1),
        content: cleanBody,
        icon: icons[type] || '📌'
      })
    }
  }

  return callouts
}

// Extrahiert den ersten passenden Callout für die Kartenanzeige
export function extractFirstCardCallout(content: string): ExtractedCallout | null {
  const callouts = extractCallouts(content)
  return callouts.length > 0 ? callouts[0] : null
}

// ============ TASK EXTRACTION ============

export interface ExtractedTask {
  text: string           // Task-Text ohne Checkbox
  completed: boolean     // [x] = true, [ ] = false
  line: number           // Zeilennummer im Dokument
  dueDate?: Date         // Aus @[[YYYY-MM-DD]] HH:MM
  isOverdue?: boolean    // Heute > dueDate
  isCritical?: boolean   // Enthält #critical, @urgent, !!, etc.
}

export interface TaskSummary {
  total: number
  completed: number
  tasks: ExtractedTask[]
  hasOverdue: boolean
  nextDue?: Date
  critical: number       // Anzahl kritischer unerledigter Tasks
}

// Vault-weite Task-Statistiken
export interface VaultTaskStats {
  total: number
  completed: number
  open: number
  critical: number       // Kritische unerledigte Tasks
  overdue: number        // Überfällige unerledigte Tasks
}

// Regex für Obsidian Reminder Format: (@[[YYYY-MM-DD]] HH:MM) oder (@[[YYYY-MM-DD]])
const REMINDER_REGEX = /\(@\[\[(\d{4}-\d{2}-\d{2})\]\](?:\s*(\d{1,2}:\d{2}))?\)/

// Parst Obsidian Reminder Format
function parseReminderDate(text: string): Date | undefined {
  const match = text.match(REMINDER_REGEX)
  if (!match) return undefined

  const dateStr = match[1] // YYYY-MM-DD
  const timeStr = match[2] // HH:MM (optional)

  const [year, month, day] = dateStr.split('-').map(Number)

  if (timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return new Date(year, month - 1, day, hours, minutes)
  }

  // Ohne Zeitangabe: Mitternacht des Tages
  return new Date(year, month - 1, day, 0, 0, 0)
}

// Entfernt das Reminder-Format aus dem Task-Text für die Anzeige
function cleanTaskText(text: string): string {
  return text.replace(REMINDER_REGEX, '').trim()
}

// Prüft ob ein Datum überfällig ist
function isOverdue(date: Date): boolean {
  return date < new Date()
}

// Prüft ob ein Task als kritisch markiert ist
// Erkannte Marker: #critical, #kritisch, @critical, @urgent, @dringend, !!, !!!
function isCriticalTask(text: string): boolean {
  const criticalPatterns = [
    /#critical/i,
    /#kritisch/i,
    /#urgent/i,
    /#dringend/i,
    /@critical/i,
    /@urgent/i,
    /@dringend/i,
    /!{2,}/,           // !! oder !!!
    /\[!\]/,           // [!] Marker
  ]
  return criticalPatterns.some(pattern => pattern.test(text))
}

// Extrahiert alle Tasks aus Content
export function extractTasks(content: string): TaskSummary {
  const tasks: ExtractedTask[] = []
  const lines = content.split('\n')

  // Task Pattern: - [ ] oder - [x] oder * [ ] oder * [x]
  const taskRegex = /^[\s]*[-*]\s*\[([ xX])\]\s*(.+)$/

  lines.forEach((line, index) => {
    const match = line.match(taskRegex)
    if (match) {
      const completed = match[1].toLowerCase() === 'x'
      const fullText = match[2]
      const dueDate = parseReminderDate(fullText)
      const text = cleanTaskText(fullText)
      const isCritical = isCriticalTask(fullText)

      tasks.push({
        text,
        completed,
        line: index + 1,
        dueDate,
        isOverdue: dueDate ? isOverdue(dueDate) : false,
        isCritical
      })
    }
  })

  const completedCount = tasks.filter(t => t.completed).length
  const hasOverdue = tasks.some(t => !t.completed && t.isOverdue)
  const criticalCount = tasks.filter(t => !t.completed && t.isCritical).length

  // Nächstes fälliges Datum finden (nur unerledigte Tasks)
  const uncompletedWithDue = tasks.filter(t => !t.completed && t.dueDate)
  const nextDue = uncompletedWithDue.length > 0
    ? uncompletedWithDue.reduce((min, t) =>
        t.dueDate! < min ? t.dueDate! : min,
        uncompletedWithDue[0].dueDate!
      )
    : undefined

  return {
    total: tasks.length,
    completed: completedCount,
    tasks,
    hasOverdue,
    nextDue,
    critical: criticalCount
  }
}

// Extrahiert Task-Statistiken für den Cache (wird beim Parsen aufgerufen)
export function extractTaskStatsForCache(content: string): { total: number; completed: number; critical: number; overdue: number } {
  const summary = extractTasks(content)
  return {
    total: summary.total,
    completed: summary.completed,
    critical: summary.critical,
    overdue: summary.tasks.filter(t => !t.completed && t.isOverdue).length
  }
}

// Berechnet Vault-weite Task-Statistiken aus allen Notizen
// Unterstützt sowohl Notes mit content als auch CachedNoteMetadata mit taskStats
export function getVaultTaskStats(notes: Array<{ content?: string; taskStats?: { total: number; completed: number; critical: number; overdue: number } }>): VaultTaskStats {
  let total = 0
  let completed = 0
  let critical = 0
  let overdue = 0

  for (const note of notes) {
    // Priorität: gecachte taskStats > content parsing
    if (note.taskStats) {
      total += note.taskStats.total
      completed += note.taskStats.completed
      critical += note.taskStats.critical
      overdue += note.taskStats.overdue
    } else if (note.content) {
      const summary = extractTasks(note.content)
      total += summary.total
      completed += summary.completed
      critical += summary.critical
      overdue += summary.tasks.filter(t => !t.completed && t.isOverdue).length
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
