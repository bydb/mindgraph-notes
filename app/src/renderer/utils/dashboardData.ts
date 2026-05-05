import type { EmailMessage, EdooboxOfferDashboard, EdooboxBooking, CalendarEvent, Note } from '../../shared/types'
import { extractTasks, type ExtractedTask } from './linkExtractor'
import { getContextMemorySummary, type ContextMemorySummary } from './contextMemory'

export interface DashboardTask extends ExtractedTask {
  noteId: string
  noteTitle: string
  notePath: string
}

export interface TaskBuckets {
  overdue: DashboardTask[]
  today: DashboardTask[]
  upcoming: DashboardTask[]   // > heute, < 7 Tage
}

export interface EmailActionItem {
  email: EmailMessage
  urgency: 'high' | 'medium' | 'low'
  score: number               // sort-key
}

export interface BookingItem {
  booking: EdooboxBooking
  offer: { id: string; name: string; dateStart?: string }
}

export interface CalendarItem {
  event: CalendarEvent
  dayOffset: number            // 0=heute, 1=morgen, ...
}

export interface CalendarResult {
  items: CalendarItem[]
  needsPermission?: boolean    // true = UI soll „Zugriff erteilen"-Button zeigen
  neverAsked?: boolean         // true = notDetermined; false = denied/restricted
  error?: string
}

export interface ActivityFolderStat {
  folder: string
  changed: number
}

export interface ActivitySnapshot {
  totalNotes: number
  created7d: number
  changed7d: number
  changed30d: number
  touchedToday: number
  topFolders: ActivityFolderStat[]
  memory: ContextMemorySummary
}

export interface DashboardSnapshot {
  tasks: TaskBuckets
  emails: EmailActionItem[]
  bookings: BookingItem[]
  calendar: CalendarItem[]
  activity: ActivitySnapshot
  calendarNeedsPermission?: boolean
  calendarNeverAsked?: boolean
  generatedAt: Date
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export async function collectTasks(
  notes: Note[],
  vaultPath: string | null,
  excludedFolders: string[]
): Promise<TaskBuckets> {
  const empty: TaskBuckets = { overdue: [], today: [], upcoming: [] }
  if (!vaultPath) return empty

  const relevant = notes.filter(note =>
    ((note.taskStats?.total && note.taskStats.total > 0) || note.content) &&
    !excludedFolders.some(f => note.path.startsWith(f + '/'))
  )

  const toLoad = relevant.filter(n => !n.content).map(n => n.path)
  let loaded: Record<string, string | null> = {}
  if (toLoad.length > 0) {
    try {
      loaded = await window.electronAPI.readFilesBatch(vaultPath, toLoad) as Record<string, string | null>
    } catch (err) {
      console.error('[dashboardData] readFilesBatch failed', err)
    }
  }

  const all: DashboardTask[] = []
  for (const note of relevant) {
    const content = note.content || loaded[note.path]
    if (!content) continue
    const { tasks } = extractTasks(content)
    for (const task of tasks) {
      if (task.completed || !task.dueDate) continue
      all.push({ ...task, noteId: note.id, noteTitle: note.title, notePath: note.path })
    }
  }

  const today = startOfDay(new Date())
  const tomorrow = new Date(today.getTime() + MS_PER_DAY)
  const inOneWeek = new Date(today.getTime() + 7 * MS_PER_DAY)

  const byDue = (a: DashboardTask, b: DashboardTask) =>
    (a.dueDate!.getTime()) - (b.dueDate!.getTime())

  return {
    overdue: all.filter(t => t.dueDate! < today).sort(byDue),
    today: all.filter(t => t.dueDate! >= today && t.dueDate! < tomorrow).sort(byDue),
    upcoming: all.filter(t => t.dueDate! >= tomorrow && t.dueDate! < inOneWeek).sort(byDue)
  }
}

export function collectEmailActions(emails: EmailMessage[]): EmailActionItem[] {
  const urgencyScore = { high: 3, medium: 2, low: 1 } as const
  const items: EmailActionItem[] = []
  for (const email of emails) {
    if (email.sent) continue
    const a = email.analysis
    if (!a?.needsReply) continue
    if (a.replyHandled) continue
    const urgency = (a.replyUrgency ?? 'medium') as 'high' | 'medium' | 'low'
    const relevance = a.relevanceScore ?? 50
    // Sortier-Score: Urgency dominiert, Relevanz refined, Datum tiebreak (neuer zuerst)
    const score = urgencyScore[urgency] * 1000 + relevance + (new Date(email.date).getTime() / 1e13)
    items.push({ email, urgency, score })
  }
  return items.sort((a, b) => b.score - a.score)
}

export function collectNewBookings(
  dashboardOffers: EdooboxOfferDashboard[],
  sinceIso: string | null
): BookingItem[] {
  const since = sinceIso ? new Date(sinceIso).getTime() : 0
  const items: BookingItem[] = []
  for (const offer of dashboardOffers) {
    if (!offer.bookings) continue
    for (const booking of offer.bookings) {
      if (!booking.bookedAt) continue
      if (booking.status === 'canceled') continue
      if (new Date(booking.bookedAt).getTime() <= since) continue
      items.push({
        booking,
        offer: { id: offer.id, name: offer.name, dateStart: offer.dateStart }
      })
    }
  }
  return items.sort((a, b) =>
    new Date(b.booking.bookedAt).getTime() - new Date(a.booking.bookedAt).getTime()
  )
}

function toTime(value: Date | string | number | undefined): number {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isFinite(time) ? time : 0
}

function getTopFolder(notePath: string): string {
  const clean = notePath.replace(/\\/g, '/')
  const parts = clean.split('/').filter(Boolean)
  return parts.length > 1 ? parts[0] : '(Root)'
}

export function collectActivity(notes: Note[], vaultPath: string | null): ActivitySnapshot {
  const now = Date.now()
  const today = startOfDay(new Date()).getTime()
  const since7d = now - 7 * MS_PER_DAY
  const since30d = now - 30 * MS_PER_DAY
  const folderCounts = new Map<string, number>()

  let created7d = 0
  let changed7d = 0
  let changed30d = 0
  let touchedToday = 0

  for (const note of notes) {
    const createdAt = toTime(note.createdAt)
    const modifiedAt = toTime(note.modifiedAt)

    if (createdAt >= since7d) created7d++
    if (modifiedAt >= since7d) {
      changed7d++
      const folder = getTopFolder(note.path)
      folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1)
    }
    if (modifiedAt >= since30d) changed30d++
    if (modifiedAt >= today) touchedToday++
  }

  const topFolders = Array.from(folderCounts.entries())
    .map(([folder, changed]) => ({ folder, changed }))
    .sort((a, b) => b.changed - a.changed || a.folder.localeCompare(b.folder))
    .slice(0, 4)

  return {
    totalNotes: notes.length,
    created7d,
    changed7d,
    changed30d,
    touchedToday,
    topFolders,
    memory: getContextMemorySummary(notes, vaultPath)
  }
}

export async function collectCalendar(daysAhead: number): Promise<CalendarResult> {
  const today = startOfDay(new Date())
  const end = new Date(today.getTime() + (daysAhead + 1) * MS_PER_DAY)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  try {
    const res = await window.electronAPI.calendarGetEvents(fmt(today), fmt(end))
    if (!res.success) {
      return {
        items: [],
        needsPermission: res.needsPermission,
        neverAsked: res.neverAsked,
        error: res.error
      }
    }
    const items: CalendarItem[] = []
    for (const event of res.events) {
      const start = new Date(event.startDate.replace(' ', 'T'))
      if (isNaN(start.getTime())) continue
      const dayOffset = Math.floor((startOfDay(start).getTime() - today.getTime()) / MS_PER_DAY)
      if (dayOffset < 0 || dayOffset > daysAhead) continue
      items.push({ event, dayOffset })
    }
    items.sort((a, b) => new Date(a.event.startDate).getTime() - new Date(b.event.startDate).getTime())
    return { items }
  } catch (err) {
    console.error('[dashboardData] calendarGetEvents failed', err)
    return { items: [], error: err instanceof Error ? err.message : String(err) }
  }
}

export interface SnapshotInputs {
  notes: Note[]
  vaultPath: string | null
  excludedFolders: string[]
  emails: EmailMessage[]
  dashboardOffers: EdooboxOfferDashboard[]
  bookingsSinceIso: string | null
  calendarDaysAhead: number
  includeCalendar: boolean
}

export async function buildDashboardSnapshot(input: SnapshotInputs): Promise<DashboardSnapshot> {
  const [tasks, calendarRes] = await Promise.all([
    collectTasks(input.notes, input.vaultPath, input.excludedFolders),
    input.includeCalendar ? collectCalendar(input.calendarDaysAhead) : Promise.resolve<CalendarResult>({ items: [] })
  ])
  return {
    tasks,
    emails: collectEmailActions(input.emails),
    bookings: collectNewBookings(input.dashboardOffers, input.bookingsSinceIso),
    calendar: calendarRes.items,
    activity: collectActivity(input.notes, input.vaultPath),
    calendarNeedsPermission: calendarRes.needsPermission,
    calendarNeverAsked: calendarRes.neverAsked,
    generatedAt: new Date()
  }
}

type RelativeDayTFn = (key: 'dashboard.today' | 'dashboard.tomorrow' | 'dashboard.inDays', params?: Record<string, string | number>) => string

export function formatRelativeDay(dayOffset: number, t: RelativeDayTFn): string {
  if (dayOffset === 0) return t('dashboard.today')
  if (dayOffset === 1) return t('dashboard.tomorrow')
  return t('dashboard.inDays', { days: dayOffset })
}

// ─── Focus-Widget ───────────────────────────────────────────────────────────

export interface FocusTask extends DashboardTask {
  reason: 'critical' | 'overdue' | 'today'
}

/**
 * Wählt aus dem Task-Snapshot die wichtigsten Aufgaben für heute.
 * Priorität: critical > überfällig > fällig heute.
 */
export function collectFocusTasks(tasks: TaskBuckets, cap = 5): FocusTask[] {
  const result: FocusTask[] = []
  const seen = new Set<string>()
  const push = (task: DashboardTask, reason: FocusTask['reason']) => {
    const key = `${task.noteId}-${task.line}`
    if (seen.has(key)) return
    seen.add(key)
    result.push({ ...task, reason })
  }
  // 1. kritisch (egal ob überfällig oder heute)
  for (const t of [...tasks.overdue, ...tasks.today]) {
    if (t.isCritical && result.length < cap) push(t, 'critical')
  }
  // 2. überfällig (ältestes zuerst, d.h. am längsten überfällig)
  for (const t of tasks.overdue) {
    if (result.length < cap) push(t, 'overdue')
  }
  // 3. heute fällig
  for (const t of tasks.today) {
    if (result.length < cap) push(t, 'today')
  }
  return result
}

/**
 * Findet den nächsten freien Zeitslot ab `from`, der `durationMinutes` lang ist
 * und nicht mit bestehenden Kalender-Events kollidiert. 15-Min-Granularität.
 * Returns null wenn vor `endOfDay` kein Slot frei ist.
 */
export function findNextFreeSlot(
  existingEvents: CalendarEvent[],
  durationMinutes: number,
  from: Date = new Date(),
  endOfDayHour = 22
): Date | null {
  const stepMs = 15 * 60 * 1000
  const durationMs = durationMinutes * 60 * 1000

  // Runde from auf nächste viertelstunde auf
  const start = new Date(from)
  start.setSeconds(0, 0)
  const minutes = start.getMinutes()
  const roundUp = Math.ceil(minutes / 15) * 15
  start.setMinutes(roundUp)
  if (roundUp === 60) start.setHours(start.getHours() + 1, 0)

  const dayEnd = new Date(start)
  dayEnd.setHours(endOfDayHour, 0, 0, 0)

  const busy = existingEvents
    .map(e => ({
      start: new Date(e.startDate.replace(' ', 'T')).getTime(),
      end: new Date(e.endDate.replace(' ', 'T')).getTime()
    }))
    .filter(b => !isNaN(b.start) && !isNaN(b.end))

  for (let t = start.getTime(); t + durationMs <= dayEnd.getTime(); t += stepMs) {
    const slotEnd = t + durationMs
    const collides = busy.some(b => t < b.end && slotEnd > b.start)
    if (!collides) return new Date(t)
  }
  return null
}
