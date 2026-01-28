import { create } from 'zustand'
import type { Note } from '../../shared/types'
import { extractTasks, type ExtractedTask } from '../utils/linkExtractor'
import { t } from '../utils/translations'
import { useUIStore } from './uiStore'

interface ReminderState {
  checkInterval: ReturnType<typeof setInterval> | null
  notifiedTaskIds: Set<string>  // Bereits benachrichtigte Tasks (verhindert Duplikate)
  isRunning: boolean

  // Actions
  startChecking: (notes: Note[]) => void
  stopChecking: () => void
  checkDueTasks: (notes: Note[]) => void
}

// Generiert eine eindeutige ID für einen Task basierend auf Notiz-ID und Zeile
function getTaskId(noteId: string, task: ExtractedTask): string {
  return `${noteId}:${task.line}:${task.text.substring(0, 20)}`
}

// Formatiert das Datum für die Notification
function formatNotificationTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  checkInterval: null,
  notifiedTaskIds: new Set(),
  isRunning: false,

  startChecking: (notes: Note[]) => {
    const state = get()

    // Bereits laufend? Stoppen und neu starten
    if (state.checkInterval) {
      clearInterval(state.checkInterval)
    }

    console.log('[Reminder] Starting reminder checking service')

    // Sofort einmal prüfen
    get().checkDueTasks(notes)

    // Alle 60 Sekunden prüfen
    const interval = setInterval(() => {
      get().checkDueTasks(notes)
    }, 60000)

    set({ checkInterval: interval, isRunning: true })
  },

  stopChecking: () => {
    const state = get()
    if (state.checkInterval) {
      clearInterval(state.checkInterval)
      console.log('[Reminder] Stopped reminder checking service')
    }
    set({ checkInterval: null, isRunning: false })
  },

  checkDueTasks: async (notes: Note[]) => {
    const state = get()
    const now = new Date()
    const oneMinuteFromNow = new Date(now.getTime() + 60000)

    for (const note of notes) {
      const taskSummary = extractTasks(note.content)

      for (const task of taskSummary.tasks) {
        // Nur unerledigte Tasks mit Fälligkeitsdatum prüfen
        if (task.completed || !task.dueDate) continue

        const taskId = getTaskId(note.id, task)

        // Bereits benachrichtigt?
        if (state.notifiedTaskIds.has(taskId)) continue

        // Ist der Task fällig? (innerhalb der nächsten Minute oder bereits überfällig)
        if (task.dueDate <= oneMinuteFromNow) {
          console.log('[Reminder] Task due:', task.text, 'at', task.dueDate)

          try {
            // Notification senden
            const language = useUIStore.getState().language
            const title = `📋 ${t('reminder.title', language)}: ${note.title}`
            const body = task.dueDate < now
              ? `⚠️ ${t('reminder.overdue', language)}: ${task.text}`
              : `${formatNotificationTime(task.dueDate)} - ${task.text}`

            const success = await window.electronAPI.showNotification(title, body, note.id)

            if (success) {
              // Task als benachrichtigt markieren
              set((state) => ({
                notifiedTaskIds: new Set([...state.notifiedTaskIds, taskId])
              }))
            }
          } catch (error) {
            console.error('[Reminder] Failed to show notification:', error)
          }
        }
      }
    }
  }
}))

// Hilfs-Hook für einfache Integration
export function useReminders() {
  const { startChecking, stopChecking, isRunning } = useReminderStore()
  return { startChecking, stopChecking, isRunning }
}
