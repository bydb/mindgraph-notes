import type { Note } from '../../shared/types'
import type { BrainSensors, BrainSensorNote, BrainSensorJournal } from '../../shared/types'
import type { EmailMessage } from '../../shared/types'
import { getDayEvents } from './contextMemory'
import { formatDate } from './templateEngine'

const DAY_RESET_HOUR = 4

export function getDayBoundsMs(now: Date = new Date()): { startMs: number; endMs: number; isoDate: string } {
  const local = new Date(now)
  if (local.getHours() < DAY_RESET_HOUR) {
    local.setDate(local.getDate() - 1)
  }
  const start = new Date(local.getFullYear(), local.getMonth(), local.getDate(), DAY_RESET_HOUR, 0, 0, 0)
  const end = start.getTime() + 24 * 60 * 60 * 1000
  const isoDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  return { startMs: start.getTime(), endMs: end, isoDate }
}

interface BuildArgs {
  notes: Note[]
  emails: EmailMessage[]
  vaultPath: string | null
  dayStartMs: number
  dayEndMs: number
  dailyNote?: { folderPath: string; dateFormat: string } | null
}

const JOURNAL_EXCERPT_LIMIT = 2000

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 3)
  if (end === -1) return content
  return content.slice(end + 4).replace(/^\n+/, '')
}

function findJournalExcerpt(
  notes: Note[],
  dayStartMs: number,
  dailyNote: BuildArgs['dailyNote']
): BrainSensorJournal | undefined {
  if (!dailyNote || !dailyNote.dateFormat) return undefined
  const dateStr = formatDate(new Date(dayStartMs), dailyNote.dateFormat)
  const expectedFileName = `${dateStr} - Journal.md`
  const expectedSuffix = dailyNote.folderPath
    ? `${dailyNote.folderPath}/${expectedFileName}`
    : expectedFileName
  const journal = notes.find(n => n.path.endsWith(expectedSuffix) || n.path.endsWith(expectedFileName))
  if (!journal || !journal.content) return undefined
  const body = stripFrontmatter(journal.content).trim()
  if (!body) return undefined
  const excerpt = body.length > JOURNAL_EXCERPT_LIMIT
    ? body.slice(0, JOURNAL_EXCERPT_LIMIT) + '…'
    : body
  return { title: journal.title, path: journal.path, excerpt }
}

export function buildBrainSensors(args: BuildArgs): { sensors: BrainSensors; hasContent: boolean } {
  const { notes, emails, vaultPath, dayStartMs, dayEndMs } = args

  const events = getDayEvents(vaultPath, dayStartMs, dayEndMs)

  const noteCounts = new Map<string, { created: boolean; opened: number; updated: number }>()
  for (const ev of events) {
    if (!ev.notePath && !ev.noteId) continue
    const key = ev.notePath || ev.noteId || ''
    if (!key) continue
    const cur = noteCounts.get(key) || { created: false, opened: 0, updated: 0 }
    if (ev.type === 'note_created') cur.created = true
    if (ev.type === 'note_opened') cur.opened++
    if (ev.type === 'note_updated') cur.updated++
    noteCounts.set(key, cur)
  }

  for (const note of notes) {
    const m = note.modifiedAt instanceof Date
      ? note.modifiedAt.getTime()
      : new Date(note.modifiedAt as unknown as string).getTime()
    if (Number.isFinite(m) && m >= dayStartMs && m < dayEndMs) {
      if (!noteCounts.has(note.path)) {
        noteCounts.set(note.path, { created: false, opened: 0, updated: 1 })
      }
    }
    const c = note.createdAt instanceof Date
      ? note.createdAt.getTime()
      : new Date(note.createdAt as unknown as string).getTime()
    if (Number.isFinite(c) && c >= dayStartMs && c < dayEndMs) {
      const cur = noteCounts.get(note.path) || { created: false, opened: 0, updated: 0 }
      cur.created = true
      noteCounts.set(note.path, cur)
    }
  }

  const noteList: BrainSensorNote[] = Array.from(noteCounts.entries())
    .map(([key, evs]) => {
      const note = notes.find(n => n.path === key) || notes.find(n => n.id === key)
      const fallbackTitle = key.split('/').pop()?.replace(/\.md$/i, '') || key
      return {
        title: note?.title || fallbackTitle,
        path: note?.path || key,
        tags: (note?.tags || []).slice(0, 5),
        events: evs
      }
    })
    .filter(n => n.events.opened + n.events.updated > 0 || n.events.created)
    .sort((a, b) => {
      const score = (e: BrainSensorNote['events']) => e.opened + e.updated * 2 + (e.created ? 3 : 0)
      return score(b.events) - score(a.events)
    })
    .slice(0, 12)

  const tasksCompleted = events.filter(e => e.type === 'task_updated').length
  const tasksCreated = events.filter(e => e.type === 'task_created').length

  const todayEmails = emails.filter(em => {
    const d = new Date(em.date).getTime()
    return Number.isFinite(d) && d >= dayStartMs && d < dayEndMs
  })
  const emailsReceived = todayEmails.filter(e => !e.sent).length
  const emailsReplied = todayEmails.filter(e => e.sent).length

  const topRelevant = todayEmails
    .filter(e => !e.sent && e.analysis)
    .sort((a, b) => (b.analysis?.relevanceScore || 0) - (a.analysis?.relevanceScore || 0))
    .slice(0, 3)
    .map(e => ({
      from: e.from?.name || e.from?.address || 'unbekannt',
      subject: e.subject || '(ohne Betreff)',
      relevance: e.analysis?.relevanceScore || 0,
      needsReply: e.analysis?.needsReply || false
    }))

  const journal = findJournalExcerpt(notes, dayStartMs, args.dailyNote)

  const sensors: BrainSensors = {
    notes: noteList,
    tasks: { completed: tasksCompleted, created: tasksCreated, examples: [] },
    emails: { received: emailsReceived, replied: emailsReplied, topRelevant },
    ...(journal ? { journal } : {})
  }

  const hasContent =
    noteList.length > 0 ||
    tasksCompleted > 0 ||
    tasksCreated > 0 ||
    emailsReceived > 0 ||
    emailsReplied > 0 ||
    !!journal

  return { sensors, hasContent }
}
