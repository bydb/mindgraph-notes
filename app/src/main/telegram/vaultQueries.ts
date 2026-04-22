// Vault-Queries für den Telegram-Bot.
// Scannt alle .md-Dateien im Vault, parst Tasks via shared/taskExtractor,
// liefert gefilterte Listen für Commands wie /today, /overdue, /week.

import { promises as fs } from 'fs'
import path from 'path'
import { extractTasks, type ExtractedTask } from '../../shared/taskExtractor'
import { getCalendarEvents, type CalendarEvent } from '../calendar/calendarService'

export interface VaultTaskHit {
  notePath: string          // relativer Pfad zum Vault
  noteTitle: string         // Dateiname ohne .md
  task: ExtractedTask
}

// Standard-Ausschluss-Ordner (versteckt, .git etc.)
const EXCLUDED_DIRS = new Set(['.git', '.obsidian', '.mindgraph', 'node_modules', '.trash'])

async function walkMdFiles(dir: string, vaultRoot: string): Promise<string[]> {
  const results: string[] = []
  let entries: Array<import('fs').Dirent>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.')) continue
      results.push(...await walkMdFiles(full, vaultRoot))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push(full)
    }
  }
  return results
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

export interface ScanOptions {
  vaultPath: string
  excludedFolders?: string[] // zusätzliche relative Ordner, die übersprungen werden
}

// Scannt das Vault und gibt alle Tasks zurück
export async function scanAllTasks(opts: ScanOptions): Promise<VaultTaskHit[]> {
  const files = await walkMdFiles(opts.vaultPath, opts.vaultPath)
  const excluded = new Set(
    (opts.excludedFolders ?? []).map(p => path.normalize(p).replace(/^[/\\]+|[/\\]+$/g, ''))
  )

  const hits: VaultTaskHit[] = []
  for (const file of files) {
    const relative = path.relative(opts.vaultPath, file)
    if ([...excluded].some(ex => relative === ex || relative.startsWith(ex + path.sep))) continue

    const content = await readFileSafe(file)
    if (!content) continue
    const { tasks } = extractTasks(content)
    if (tasks.length === 0) continue

    const noteTitle = path.basename(file, '.md')
    for (const task of tasks) {
      hits.push({ notePath: relative, noteTitle, task })
    }
  }
  return hits
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export async function tasksDueToday(opts: ScanOptions): Promise<VaultTaskHit[]> {
  const all = await scanAllTasks(opts)
  const now = new Date()
  const from = startOfDay(now)
  const to = endOfDay(now)
  return all
    .filter(h => !h.task.completed && h.task.dueDate && h.task.dueDate >= from && h.task.dueDate <= to)
    .sort((a, b) => a.task.dueDate!.getTime() - b.task.dueDate!.getTime())
}

export async function tasksOverdue(opts: ScanOptions): Promise<VaultTaskHit[]> {
  const all = await scanAllTasks(opts)
  const startToday = startOfDay(new Date())
  return all
    .filter(h => !h.task.completed && h.task.dueDate && h.task.dueDate < startToday)
    .sort((a, b) => a.task.dueDate!.getTime() - b.task.dueDate!.getTime())
}

export async function tasksThisWeek(opts: ScanOptions): Promise<VaultTaskHit[]> {
  const all = await scanAllTasks(opts)
  const now = new Date()
  const from = startOfDay(now)
  const to = endOfDay(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))
  return all
    .filter(h => !h.task.completed && h.task.dueDate && h.task.dueDate >= from && h.task.dueDate <= to)
    .sort((a, b) => a.task.dueDate!.getTime() - b.task.dueDate!.getTime())
}

// Einfache Keyword-Suche: welche Notizen enthalten diese Begriffe?
// Begrenzt auf Top-N kürzeste Matches, damit der Bot-Kontext klein bleibt.
export async function searchVault(
  opts: ScanOptions & { query: string; maxResults?: number; maxChars?: number }
): Promise<Array<{ notePath: string; excerpt: string }>> {
  const maxResults = opts.maxResults ?? 5
  const maxChars = opts.maxChars ?? 8000
  const keywords = opts.query
    .toLowerCase()
    .split(/\s+/)
    .filter(k => k.length >= 3)

  if (keywords.length === 0) return []

  const files = await walkMdFiles(opts.vaultPath, opts.vaultPath)
  const scored: Array<{ notePath: string; excerpt: string; score: number }> = []
  let collectedChars = 0

  for (const file of files) {
    const content = await readFileSafe(file)
    if (!content) continue
    const lower = content.toLowerCase()
    let score = 0
    for (const kw of keywords) {
      const matches = lower.split(kw).length - 1
      score += matches
    }
    if (score === 0) continue

    // Excerpt um das erste Keyword-Match
    const firstKw = keywords.find(k => lower.includes(k)) ?? keywords[0]
    const idx = lower.indexOf(firstKw)
    const start = Math.max(0, idx - 200)
    const end = Math.min(content.length, idx + 600)
    const excerpt = content.substring(start, end).trim()

    scored.push({
      notePath: path.relative(opts.vaultPath, file),
      excerpt,
      score
    })
  }

  scored.sort((a, b) => b.score - a.score)
  const picked: Array<{ notePath: string; excerpt: string }> = []
  for (const s of scored.slice(0, maxResults)) {
    if (collectedChars + s.excerpt.length > maxChars) break
    picked.push({ notePath: s.notePath, excerpt: s.excerpt })
    collectedChars += s.excerpt.length
  }
  return picked
}

// ─── Priority-Folder Helpers ───────────────────────────────────────────────

export interface PriorityNote {
  relativePath: string
  title: string
  modifiedAt: Date
  excerpt: string    // Anfang der Datei, begrenzt auf maxChars
}

/**
 * Lädt Notizen aus priorisierten Ordnern, sortiert nach Änderungsdatum (neueste zuerst).
 * Wird für /inbox und als immer-präsenter Kontext in /ask genutzt.
 */
export async function loadPriorityNotes(opts: {
  vaultPath: string
  folders: string[]
  maxNotes?: number
  maxCharsPerNote?: number
}): Promise<PriorityNote[]> {
  const maxNotes = opts.maxNotes ?? 10
  const maxChars = opts.maxCharsPerNote ?? 1200

  if (opts.folders.length === 0) return []

  const results: Array<PriorityNote & { mtimeMs: number }> = []

  for (const folder of opts.folders) {
    const absFolder = path.join(opts.vaultPath, folder)
    const files = await walkMdFiles(absFolder, opts.vaultPath)
    for (const file of files) {
      try {
        const stat = await fs.stat(file)
        const content = await readFileSafe(file)
        if (!content) continue
        const title = path.basename(file, '.md')
        const excerpt = content.slice(0, maxChars).trim()
        results.push({
          relativePath: path.relative(opts.vaultPath, file),
          title,
          modifiedAt: stat.mtime,
          mtimeMs: stat.mtimeMs,
          excerpt
        })
      } catch {
        // Datei unlesbar → überspringen
      }
    }
  }

  results.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return results.slice(0, maxNotes).map(({ mtimeMs: _mtimeMs, ...rest }) => rest)
}

export function formatPriorityNoteList(notes: PriorityNote[]): string {
  if (notes.length === 0) return '_Keine Notizen in den priorisierten Ordnern._'
  const now = Date.now()
  return notes.map(n => {
    const ageDays = Math.floor((now - n.modifiedAt.getTime()) / (1000 * 60 * 60 * 24))
    const ageLabel = ageDays === 0 ? 'heute' : ageDays === 1 ? 'gestern' : `vor ${ageDays}d`
    return `• *${n.title}* _(${ageLabel})_\n  ${n.relativePath}`
  }).join('\n\n')
}

// ─── Calendar Helpers ─────────────────────────────────────────────────────

export interface CalendarWindow {
  events: CalendarEvent[]
  needsPermission?: boolean
  error?: string
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function eventsForRange(daysAhead: number): Promise<CalendarWindow> {
  const today = new Date()
  const end = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000)
  const res = await getCalendarEvents(ymd(today), ymd(end))
  if (res.success) return { events: res.events }
  return {
    events: [],
    needsPermission: res.needsPermission,
    error: res.error
  }
}

export function formatEventList(events: CalendarEvent[], opts: { showDayHeader?: boolean } = {}): string {
  if (events.length === 0) return '_Keine Termine._'

  const now = new Date()
  const todayYmd = ymd(now)
  const tomorrowYmd = ymd(new Date(now.getTime() + 24 * 60 * 60 * 1000))

  // Nach Tag gruppieren (wenn gewünscht)
  if (opts.showDayHeader) {
    const byDay = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const day = e.startDate.slice(0, 10)
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(e)
    }
    const parts: string[] = []
    for (const [day, dayEvents] of Array.from(byDay.entries()).sort()) {
      let label = day
      if (day === todayYmd) label = 'Heute'
      else if (day === tomorrowYmd) label = 'Morgen'
      else {
        const d = new Date(day + 'T00:00:00')
        label = d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })
      }
      parts.push(`*${label}*`)
      for (const e of dayEvents) {
        parts.push(formatSingleEvent(e))
      }
      parts.push('')
    }
    return parts.join('\n').trim()
  }

  return events.map(formatSingleEvent).join('\n')
}

function formatSingleEvent(e: CalendarEvent): string {
  const timeLabel = e.allDay
    ? 'ganztägig'
    : `${e.startDate.slice(11, 16)}–${e.endDate.slice(11, 16)}`
  const loc = e.location ? ` · ${e.location}` : ''
  return `• ${timeLabel}  ${e.title}${loc}`
}

export function formatTaskList(hits: VaultTaskHit[], opts: { showTime?: boolean } = {}): string {
  if (hits.length === 0) return '_Keine Tasks._'
  const lines: string[] = []
  for (const h of hits) {
    const t = h.task
    const marker = t.isCritical ? '🔴' : t.isOverdue ? '⚠️' : '•'
    let timePart = ''
    if (opts.showTime && t.dueDate) {
      const hh = String(t.dueDate.getHours()).padStart(2, '0')
      const mm = String(t.dueDate.getMinutes()).padStart(2, '0')
      if (hh !== '00' || mm !== '00') timePart = ` (${hh}:${mm})`
    }
    if (t.isOverdue && t.dueDate) {
      const days = Math.floor((Date.now() - t.dueDate.getTime()) / (1000 * 60 * 60 * 24))
      if (days > 0) timePart += ` [${days}d überfällig]`
    }
    lines.push(`${marker} ${t.text}${timePart}\n   📄 ${h.noteTitle}`)
  }
  return lines.join('\n\n')
}
