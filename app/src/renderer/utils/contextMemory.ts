import type { Note } from '../../shared/types'

export type ContextEventType =
  | 'note_opened'
  | 'note_created'
  | 'note_updated'
  | 'note_deleted'
  | 'task_created'
  | 'task_updated'

export interface ContextEvent {
  id: string
  type: ContextEventType
  at: string
  noteId?: string
  notePath?: string
  noteTitle?: string
  source?: string
}

export interface ContextMemorySummary {
  events7d: number
  opened7d: number
  edited7d: number
  created7d: number
  taskEvents7d: number
  topNotes7d: Array<{ noteId?: string; title: string; path?: string; count: number }>
  topFolders7d: Array<{ folder: string; count: number }>
}

const MAX_EVENTS = 2500
const RETAIN_DAYS = 90
const MS_PER_DAY = 24 * 60 * 60 * 1000
const recentEventKeys = new Map<string, number>()

const getMemoryKey = (vaultPath: string | null | undefined): string =>
  `mindgraph:context-memory:${vaultPath || 'default'}`

const normalizePath = (path: string | undefined): string | undefined =>
  path?.replace(/\\/g, '/')

const getTopFolder = (notePath: string | undefined): string => {
  const clean = normalizePath(notePath) || ''
  const parts = clean.split('/').filter(Boolean)
  return parts.length > 1 ? parts[0] : '(Root)'
}

function loadEvents(vaultPath: string | null | undefined): ContextEvent[] {
  try {
    const raw = localStorage.getItem(getMemoryKey(vaultPath))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.type === 'string' && typeof e.at === 'string') : []
  } catch {
    return []
  }
}

function saveEvents(vaultPath: string | null | undefined, events: ContextEvent[]): void {
  try {
    localStorage.setItem(getMemoryKey(vaultPath), JSON.stringify(events))
  } catch {
    // localStorage kann voll oder deaktiviert sein; Kontextgedaechtnis ist optional.
  }
}

export function trackContextEvent(
  vaultPath: string | null | undefined,
  event: Omit<ContextEvent, 'id' | 'at'>,
  options: { throttleMs?: number } = {}
): void {
  if (!vaultPath) return

  const now = Date.now()
  const throttleKey = `${vaultPath}:${event.type}:${event.noteId || event.notePath || event.source || 'global'}`
  const last = recentEventKeys.get(throttleKey) || 0
  if (options.throttleMs && now - last < options.throttleMs) return
  recentEventKeys.set(throttleKey, now)

  const cutoff = now - RETAIN_DAYS * MS_PER_DAY
  const events = loadEvents(vaultPath).filter(e => new Date(e.at).getTime() >= cutoff)
  events.push({
    ...event,
    notePath: normalizePath(event.notePath),
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date(now).toISOString()
  })
  saveEvents(vaultPath, events.slice(-MAX_EVENTS))
}

export function getContextMemorySummary(notes: Note[], vaultPath: string | null | undefined): ContextMemorySummary {
  const since7d = Date.now() - 7 * MS_PER_DAY
  const events = loadEvents(vaultPath).filter(e => new Date(e.at).getTime() >= since7d)
  const noteById = new Map(notes.map(note => [note.id, note]))
  const noteCounts = new Map<string, { noteId?: string; title: string; path?: string; count: number }>()
  const folderCounts = new Map<string, number>()

  for (const event of events) {
    const note = event.noteId ? noteById.get(event.noteId) : undefined
    const notePath = normalizePath(event.notePath || note?.path)
    const title = event.noteTitle || note?.title || notePath || event.type
    const noteKey = event.noteId || notePath || title
    const current = noteCounts.get(noteKey) || { noteId: event.noteId, title, path: notePath, count: 0 }
    current.count++
    noteCounts.set(noteKey, current)

    const folder = getTopFolder(notePath)
    folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1)
  }

  const topNotes7d = Array.from(noteCounts.values())
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 4)

  const topFolders7d = Array.from(folderCounts.entries())
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder))
    .slice(0, 4)

  return {
    events7d: events.length,
    opened7d: events.filter(e => e.type === 'note_opened').length,
    edited7d: events.filter(e => e.type === 'note_updated').length,
    created7d: events.filter(e => e.type === 'note_created').length,
    taskEvents7d: events.filter(e => e.type === 'task_created' || e.type === 'task_updated').length,
    topNotes7d,
    topFolders7d
  }
}
