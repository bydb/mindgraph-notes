import React, { useState, useEffect } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { extractTasks, type ExtractedTask } from '../../utils/linkExtractor'

interface OverdueTask extends ExtractedTask {
  noteId: string
  noteTitle: string
  notePath: string
}

interface OverduePanelProps {
  onClose: () => void
}

export const OverduePanel: React.FC<OverduePanelProps> = ({ onClose }) => {
  const { notes, vaultPath, selectNote } = useNotesStore()
  const [allTasks, setAllTasks] = useState<OverdueTask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Notes mit Tasks identifizieren und Content laden
  useEffect(() => {
    const loadTasks = async () => {
      if (!vaultPath) {
        setIsLoading(false)
        return
      }

      const tasks: OverdueTask[] = []

      // Finde Notes die Tasks haben könnten
      const notesWithPotentialTasks = notes.filter(note =>
        (note.taskStats?.total && note.taskStats.total > 0) || note.content
      )

      // Lade Content für Notes die keinen haben
      const notesToLoad = notesWithPotentialTasks.filter(n => !n.content)
      const pathsToLoad = notesToLoad.map(n => n.path)

      let loadedContents: Record<string, string | null> = {}
      if (pathsToLoad.length > 0) {
        try {
          loadedContents = await window.electronAPI.readFilesBatch(vaultPath, pathsToLoad) as Record<string, string | null>
        } catch (error) {
          console.error('[OverduePanel] Failed to load note contents:', error)
        }
      }

      // Extrahiere alle Tasks mit Datum
      for (const note of notesWithPotentialTasks) {
        const content = note.content || loadedContents[note.path]
        if (!content) continue

        const taskSummary = extractTasks(content)

        for (const task of taskSummary.tasks) {
          // Nur unerledigte Tasks mit Datum
          if (!task.completed && task.dueDate) {
            tasks.push({
              ...task,
              noteId: note.id,
              noteTitle: note.title,
              notePath: note.path
            })
          }
        }
      }

      // Sortiere nach Fälligkeitsdatum
      tasks.sort((a, b) => {
        if (!a.dueDate || !b.dueDate) return 0
        return a.dueDate.getTime() - b.dueDate.getTime()
      })

      setAllTasks(tasks)
      setIsLoading(false)
    }

    loadTasks()
  }, [notes, vaultPath])

  // Kategorisiere Tasks
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  const overdueTasks = allTasks.filter(t => t.dueDate && t.dueDate < today)
  const todayTasks = allTasks.filter(t => t.dueDate && t.dueDate >= today && t.dueDate < tomorrow)
  const futureTasks = allTasks.filter(t => t.dueDate && t.dueDate >= tomorrow)

  const handleTaskClick = (task: OverdueTask) => {
    selectNote(task.noteId)
  }

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatRelativeDate = (date: Date): string => {
    const diffMs = date.getTime() - today.getTime()
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))

    if (diffDays === 1) return 'Morgen'
    if (diffDays < 7) return `In ${diffDays} Tagen`
    if (diffDays < 14) return 'Nächste Woche'
    return formatDate(date)
  }

  const renderTask = (task: OverdueTask, showDate: boolean = false, isOverdue: boolean = false) => (
    <div
      key={`${task.noteId}-${task.line}`}
      className="overdue-item"
      onClick={() => handleTaskClick(task)}
    >
      <div className="overdue-item-checkbox">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        </svg>
      </div>
      <div className="overdue-item-content">
        <div className="overdue-item-row">
          <span className={`overdue-item-time ${isOverdue ? 'overdue' : ''}`}>
            {formatTime(task.dueDate!)}
          </span>
          <span className="overdue-item-text">{task.text}</span>
        </div>
        <div className="overdue-item-meta">
          <span className="overdue-item-note">{task.noteTitle}</span>
          {showDate && (
            <>
              <span className="overdue-item-separator">•</span>
              <span className="overdue-item-future-date">{formatRelativeDate(task.dueDate!)}</span>
            </>
          )}
        </div>
      </div>
      {task.isCritical && (
        <div className="overdue-item-critical" title="Kritisch">!</div>
      )}
    </div>
  )

  const renderSection = (title: string, tasks: OverdueTask[], type: 'overdue' | 'today' | 'future') => {
    const isOverdue = type === 'overdue'
    const showDate = type === 'future'

    return (
      <div className={`overdue-section ${type}`}>
        <div className="overdue-section-header">
          <span className="overdue-section-title">{title}</span>
          {tasks.length > 0 && (
            <span className={`overdue-section-count ${type}`}>{tasks.length}</span>
          )}
        </div>
        {tasks.length === 0 ? (
          <div className="overdue-section-empty">Keine Termine</div>
        ) : (
          <div className="overdue-section-list">
            {tasks.map(task => renderTask(task, showDate, isOverdue))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="overdue-panel">
      <div className="overdue-panel-header">
        <div className="overdue-panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Termine</span>
        </div>
        <button className="overdue-panel-close" onClick={onClose} title="Schließen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="overdue-panel-content">
        {isLoading ? (
          <div className="overdue-loading">
            <div className="overdue-spinner"></div>
            <p>Lade Termine...</p>
          </div>
        ) : allTasks.length === 0 ? (
          <div className="overdue-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p>Keine Termine</p>
            <span>Alle Aufgaben sind erledigt!</span>
          </div>
        ) : (
          <>
            {renderSection('Überfällig', overdueTasks, 'overdue')}
            {renderSection('Heute', todayTasks, 'today')}
            {renderSection('Geplant', futureTasks, 'future')}
          </>
        )}
      </div>
    </div>
  )
}
