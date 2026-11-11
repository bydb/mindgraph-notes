import type { Note } from '../../shared/types'
import { eventsInRange, findTaskText, gapsInRange, type DayLogEvent, type DayLogGap } from '../../shared/dayLog'
import { isSentMail } from '../../shared/emailRelevance'
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
  /**
   * Tagesprotokoll aus dem Hauptprozess (shared/dayLog.ts): echte Schreibvorgänge dieser App,
   * ohne Sync. Fehlt es (Lesefehler), gelten die alten, ungenaueren Ersatzwerte.
   */
  dayLog?: { since: number | null; events: DayLogEvent[]; gaps?: DayLogGap[] } | null
}

const REPLY_SUBJECT = /^\s*(re|aw|antw|antwort)\s*:/i

/** Lädt das Tagesprotokoll für einen Zeitraum; null bei Fehler oder unlesbarer Datei. */
export async function loadDayLog(vaultPath: string | null, from: number, to: number): Promise<BuildArgs['dayLog']> {
  if (!vaultPath) return null
  try {
    const res = await window.electronAPI.dayLogRead(vaultPath, { from, to })
    // Nur ein LESBARES, geführtes Protokoll ist eine Quelle. „Noch nie geführt“ ist wie „nicht
    // lesbar“ keine gemessene Null (Codex F30).
    if (!res.success || !res.log || res.log.state !== 'ok' || res.log.since === null) return null
    return { since: res.log.since, events: res.log.events, gaps: res.log.gaps ?? [] }
  } catch {
    return null
  }
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
  const dayLog = args.dayLog ?? null
  const logEvents = dayLog ? eventsInRange(dayLog.events, { from: dayStartMs, to: dayEndMs }) : []
  // Das Protokoll deckt den Tag ab, wenn es schon vor Tagesbeginn geführt wurde. Sonst (Tag der
  // Einführung, nie geführt) bleiben die Dateizeiten als Ersatz — mit ihrer bekannten Schwäche,
  // dass ein Sync-Download wie eine Bearbeitung aussieht.
  // Eine Lücke (Protokoll ließ sich zeitweise nicht schreiben) zählt wie „nicht abgedeckt“.
  const logCoversDay = !!dayLog && dayLog.since !== null && dayLog.since <= dayStartMs &&
    gapsInRange(dayLog.gaps ?? [], { from: dayStartMs, to: dayEndMs }).length === 0

  const events = getDayEvents(vaultPath, dayStartMs, dayEndMs)

  const noteCounts = new Map<string, { created: boolean; opened: number; updated: number }>()
  for (const ev of events) {
    if (!ev.notePath && !ev.noteId) continue
    const key = ev.notePath || ev.noteId || ''
    if (!key) continue
    const cur = noteCounts.get(key) || { created: false, opened: 0, updated: 0 }
    // Deckt das Tagesprotokoll den Tag ab, kommen „angelegt“ und „bearbeitet“ NUR von dort —
    // die Renderer-Ereignisse entstehen auch, wenn der Sync eine Notiz ändert (Codex F20).
    // „Geöffnet“ kennt nur der Renderer und bleibt.
    if (ev.type === 'note_created' && !logCoversDay) cur.created = true
    if (ev.type === 'note_opened') cur.opened++
    if (ev.type === 'note_updated' && !logCoversDay) cur.updated++
    noteCounts.set(key, cur)
  }

  // Nur der exakte Pfad zählt (vault-relativ, ersatzweise absolut). Ein Vergleich über das
  // Pfad-Ende ordnete „x.md“ der ersten von zwei gleichnamigen Notizen zu (Codex F20).
  const byPath = new Map(notes.map(n => [n.path, n]))
  const abs = (rel: string) => (vaultPath ? `${vaultPath.replace(/[\\/]+$/, '')}/${rel}` : rel)
  const noteOf = (rel: string): Note | null => byPath.get(rel) ?? byPath.get(abs(rel)) ?? null
  for (const ev of logEvents) {
    if (ev.kind === 'task-checked') continue
    const key = noteOf(ev.note)?.path
    if (!key) continue
    const cur = noteCounts.get(key) || { created: false, opened: 0, updated: 0 }
    if (ev.kind === 'note-saved' && ev.created) cur.created = true
    else if (cur.updated === 0) cur.updated = 1
    noteCounts.set(key, cur)
  }

  for (const note of logCoversDay ? [] : notes) {
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
      if (!note) return null
      return {
        title: note.title,
        path: note.path,
        tags: (note.tags || []).slice(0, 5),
        events: evs
      }
    })
    .filter((n): n is BrainSensorNote => n !== null)
    .filter(n => n.events.opened + n.events.updated > 0 || n.events.created)
    .sort((a, b) => {
      const score = (e: BrainSensorNote['events']) => e.opened + e.updated * 2 + (e.created ? 3 : 0)
      return score(b.events) - score(a.events)
    })
    .slice(0, 12)

  // „Abgeschlossen“ heißt: im Tagesprotokoll von offen auf abgehakt gewechselt. Vorher zählte
  // hier JEDE Aufgaben-Änderung (Text, Termin) als Abschluss — die Tagesnotiz nannte dann z. B.
  // „39 Aufgaben abgeschlossen“. Ohne lesbares Protokoll ist die Zahl UNBEKANNT (`completedKnown`
  // false) — der alte, zu hohe Zähler kommt nicht als Ersatz zurück (Codex F20).
  const checked = logEvents.filter((e): e is Extract<DayLogEvent, { kind: 'task-checked' }> => e.kind === 'task-checked')
  // Bekannt nur, wenn das Protokoll in diesen Tag hineinreicht und an ihm keine Lücke hat.
  const tasksCompletedKnown = !!dayLog && dayLog.since !== null && dayLog.since < dayEndMs &&
    gapsInRange(dayLog.gaps ?? [], { from: dayStartMs, to: dayEndMs }).length === 0
  const tasksCompleted = checked.length
  // Das Protokoll speichert keinen Aufgabentext; Beispiele kommen aus dem heutigen Stand der Notiz.
  const taskExamples: string[] = []
  for (const e of checked) {
    if (taskExamples.length >= 5) break
    const content = noteOf(e.note)?.content
    const text = content ? findTaskText(content, e.key) : null
    if (text) taskExamples.push(text.length > 200 ? `${text.slice(0, 199)}…` : text)
  }
  const tasksCreated = events.filter(e => e.type === 'task_created').length

  const todayEmails = emails.filter(em => {
    const d = new Date(em.date).getTime()
    return Number.isFinite(d) && d >= dayStartMs && d < dayEndMs
  })
  const emailsReceived = todayEmails.filter(e => !isSentMail(e)).length
  // „Beantwortet“ nur, wenn die gesendete Mail erkennbar eine Antwort ist — nicht jede gesendete.
  const emailsReplied = todayEmails.filter(e =>
    isSentMail(e) && (!!e.inReplyTo || (e.references?.length ?? 0) > 0 || REPLY_SUBJECT.test(e.subject || ''))
  ).length

  const topRelevant = todayEmails
    .filter(e => !isSentMail(e) && e.analysis)
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
    tasks: { completed: tasksCompleted, completedKnown: tasksCompletedKnown, created: tasksCreated, examples: taskExamples },
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
