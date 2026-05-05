import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { extractTasks, buildTaskLine, type ExtractedTask } from '../../utils/linkExtractor'
import { trackContextEvent } from '../../utils/contextMemory'

interface TaskEntry extends ExtractedTask {
  noteId: string
  noteTitle: string
  notePath: string
}

interface OverduePanelProps {
  onClose: () => void
}

// Format Date → yyyy-mm-ddThh:mm für <input type="datetime-local">
function toDatetimeLocal(d: Date | undefined): string {
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}`
}

function fromDatetimeLocal(s: string): Date | undefined {
  if (!s) return undefined
  const parsed = new Date(s)
  return isNaN(parsed.getTime()) ? undefined : parsed
}

function getTodayStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function isBeforeToday(date: Date): boolean {
  return date < getTodayStart()
}

// ============ TASK CARD ============
const TaskCard: React.FC<{
  task: TaskEntry
  showDate: boolean
  onSave: (task: TaskEntry, updates: Partial<ExtractedTask>) => Promise<void>
  onOpenNote: (task: TaskEntry) => void
  availableTags: string[]
}> = ({ task, showDate, onSave, onOpenNote, availableTags }) => {
  const { t } = useTranslation()
  const [editingText, setEditingText] = useState(false)
  const [textDraft, setTextDraft] = useState(task.text)
  const [addingTag, setAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [showDateEdit, setShowDateEdit] = useState(false)
  const [dateDraft, setDateDraft] = useState(toDatetimeLocal(task.dueDate))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTextDraft(task.text)
    setDateDraft(toDatetimeLocal(task.dueDate))
  }, [task.text, task.dueDate])

  const tagSuggestions = useMemo(() => {
    if (!tagDraft) return []
    const lower = tagDraft.toLowerCase()
    return availableTags
      .filter(tg => tg.toLowerCase().includes(lower) && !task.tags.includes(tg))
      .slice(0, 5)
  }, [tagDraft, availableTags, task.tags])

  const isOverdueNow = task.dueDate ? isBeforeToday(task.dueDate) : false

  const commit = async (updates: Partial<ExtractedTask>): Promise<void> => {
    setSaving(true)
    try {
      await onSave(task, updates)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleComplete = (e: React.MouseEvent): void => {
    e.stopPropagation()
    commit({ completed: !task.completed })
  }

  const handleTextSave = (): void => {
    setEditingText(false)
    if (textDraft.trim() && textDraft.trim() !== task.text) {
      commit({ text: textDraft.trim() })
    } else {
      setTextDraft(task.text)
    }
  }

  const handleAddTag = (tag: string): void => {
    const clean = tag.trim().replace(/^#/, '')
    if (!clean || task.tags.includes(clean)) return
    commit({ tags: [...task.tags, clean] })
    setTagDraft('')
    setAddingTag(false)
  }

  const handleRemoveTag = (tag: string): void => {
    commit({ tags: task.tags.filter(tg => tg !== tag) })
  }

  const handleDateSave = (): void => {
    setShowDateEdit(false)
    const newDate = fromDatetimeLocal(dateDraft)
    const oldMs = task.dueDate?.getTime()
    const newMs = newDate?.getTime()
    if (oldMs !== newMs) {
      commit({ dueDate: newDate })
    }
  }

  const handleClearDate = (): void => {
    setShowDateEdit(false)
    setDateDraft('')
    if (task.dueDate) commit({ dueDate: undefined })
  }

  return (
    <div className={`overdue-item ${task.completed ? 'completed' : ''} ${saving ? 'saving' : ''}`}>
      <button
        className="overdue-item-checkbox"
        onClick={handleToggleComplete}
        title={task.completed ? t('tasks.markOpen') : t('tasks.markDone')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          {task.completed && <polyline points="9 12 11 14 15 10"/>}
        </svg>
      </button>

      <div className="overdue-item-content">
        <div className="overdue-item-row">
          {editingText ? (
            <input
              type="text"
              className="overdue-inline-input"
              value={textDraft}
              autoFocus
              onChange={e => setTextDraft(e.target.value)}
              onBlur={handleTextSave}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleTextSave() }
                if (e.key === 'Escape') { setTextDraft(task.text); setEditingText(false) }
              }}
            />
          ) : (
            <span
              className="overdue-item-text"
              onClick={() => setEditingText(true)}
              title={t('tasks.clickToEdit')}
            >
              {task.text || <em className="overdue-item-empty">{t('tasks.emptyText')}</em>}
            </span>
          )}
        </div>

        <div className="overdue-item-meta">
          {/* Datum */}
          {showDateEdit ? (
            <div className="overdue-date-editor">
              <input
                type="datetime-local"
                className="overdue-date-input"
                value={dateDraft}
                autoFocus
                onChange={e => setDateDraft(e.target.value)}
                onBlur={handleDateSave}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleDateSave() }
                  if (e.key === 'Escape') { setDateDraft(toDatetimeLocal(task.dueDate)); setShowDateEdit(false) }
                }}
              />
              {task.dueDate && (
                <button className="overdue-date-clear" onClick={handleClearDate} title={t('tasks.clearDate')}>×</button>
              )}
            </div>
          ) : (
            <button
              className={`overdue-item-date-btn ${isOverdueNow ? 'overdue' : ''}`}
              onClick={() => setShowDateEdit(true)}
              title={t('tasks.editDate')}
            >
              {task.dueDate
                ? task.dueDate.toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: showDate ? 'numeric' : undefined,
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : `+ ${t('tasks.addDate')}`}
            </button>
          )}

          <span className="overdue-item-separator">•</span>
          <button
            className="overdue-item-note"
            onClick={() => onOpenNote(task)}
            title={t('tasks.openNote')}
          >
            {task.noteTitle}
          </button>
        </div>

        {/* Tags-Zeile */}
        <div className="overdue-item-tags">
          {task.tags.map(tag => (
            <span key={tag} className="overdue-tag-chip">
              #{tag}
              <button className="overdue-tag-remove" onClick={() => handleRemoveTag(tag)} title={t('tasks.removeTag')}>×</button>
            </span>
          ))}
          {addingTag ? (
            <div className="overdue-tag-adder">
              <input
                type="text"
                className="overdue-tag-input"
                placeholder={t('tasks.tagPlaceholder')}
                value={tagDraft}
                autoFocus
                onChange={e => setTagDraft(e.target.value)}
                onBlur={() => { if (!tagSuggestions.length) { handleAddTag(tagDraft); setAddingTag(false) } }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleAddTag(tagDraft) }
                  if (e.key === 'Escape') { setTagDraft(''); setAddingTag(false) }
                }}
              />
              {tagSuggestions.length > 0 && (
                <div className="overdue-tag-suggestions">
                  {tagSuggestions.map(sg => (
                    <button
                      key={sg}
                      className="overdue-tag-suggestion"
                      onMouseDown={e => { e.preventDefault(); handleAddTag(sg) }}
                    >
                      #{sg}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button className="overdue-tag-add" onClick={() => setAddingTag(true)} title={t('tasks.addTag')}>
              + Tag
            </button>
          )}
        </div>
      </div>

      {task.isCritical && (
        <div className="overdue-item-critical" title={t('overdue.critical')}>!</div>
      )}
    </div>
  )
}

// ============ QUICK-ADD ============
const QuickAdd: React.FC<{
  availableTags: string[]
  destinationOptions: { label: string; path: string }[]
  defaultDestination: string
  onAdd: (text: string, dueDate: Date | undefined, tags: string[], destinationPath: string) => Promise<void>
  onCancel: () => void
}> = ({ availableTags, destinationOptions, defaultDestination, onAdd, onCancel }) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [dateDraft, setDateDraft] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [destination, setDestination] = useState(defaultDestination)
  const [submitting, setSubmitting] = useState(false)
  const textRef = useRef<HTMLInputElement>(null)

  useEffect(() => { textRef.current?.focus() }, [])

  const tagSuggestions = useMemo(() => {
    if (!tagDraft) return []
    const lower = tagDraft.toLowerCase()
    return availableTags.filter(tg => tg.toLowerCase().includes(lower) && !tags.includes(tg)).slice(0, 5)
  }, [tagDraft, availableTags, tags])

  const handleSubmit = async (): Promise<void> => {
    if (!text.trim() || submitting) return
    setSubmitting(true)
    try {
      await onAdd(text.trim(), fromDatetimeLocal(dateDraft), tags, destination)
    } finally {
      setSubmitting(false)
    }
  }

  const addTag = (tag: string): void => {
    const clean = tag.trim().replace(/^#/, '')
    if (clean && !tags.includes(clean)) setTags([...tags, clean])
    setTagDraft('')
  }

  return (
    <div className="overdue-quickadd">
      <input
        ref={textRef}
        type="text"
        className="overdue-quickadd-text"
        placeholder={t('tasks.newTaskPlaceholder')}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
          if (e.key === 'Escape') onCancel()
        }}
      />

      <div className="overdue-quickadd-row">
        <input
          type="datetime-local"
          className="overdue-quickadd-date"
          value={dateDraft}
          onChange={e => setDateDraft(e.target.value)}
        />
        <select
          className="overdue-quickadd-destination"
          value={destination}
          onChange={e => setDestination(e.target.value)}
        >
          {destinationOptions.map(opt => (
            <option key={opt.path} value={opt.path}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="overdue-quickadd-tags">
        {tags.map(tg => (
          <span key={tg} className="overdue-tag-chip">
            #{tg}
            <button className="overdue-tag-remove" onClick={() => setTags(tags.filter(x => x !== tg))}>×</button>
          </span>
        ))}
        <div className="overdue-tag-adder">
          <input
            type="text"
            className="overdue-tag-input"
            placeholder={t('tasks.tagPlaceholder')}
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && tagDraft.trim()) { e.preventDefault(); addTag(tagDraft) }
            }}
          />
          {tagSuggestions.length > 0 && (
            <div className="overdue-tag-suggestions">
              {tagSuggestions.map(sg => (
                <button key={sg} className="overdue-tag-suggestion" onMouseDown={e => { e.preventDefault(); addTag(sg) }}>
                  #{sg}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overdue-quickadd-actions">
        <button className="overdue-quickadd-cancel" onClick={onCancel}>{t('cancel')}</button>
        <button
          className="overdue-quickadd-submit"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
        >
          {t('tasks.createTask')}
        </button>
      </div>
    </div>
  )
}

// ============ MAIN PANEL ============
export const OverduePanel: React.FC<OverduePanelProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const { notes, vaultPath, selectNote, updateNote } = useNotesStore()
  const { taskExcludedFolders } = useUIStore()
  const [allTasks, setAllTasks] = useState<TaskEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [reloadTick, setReloadTick] = useState(0)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  // Alle im Vault bekannten Tags einmal aggregieren (für Autocomplete)
  const availableTags = useMemo(() => {
    const set = new Set<string>()
    for (const note of notes) {
      note.tags?.forEach(tg => set.add(tg))
    }
    return Array.from(set).sort()
  }, [notes])

  // Ziel-Optionen für Quick-Add: Daily Note (heute) + Inbox/Tasks.md + bereits bekannte Task-Notizen
  const destinationOptions = useMemo(() => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const dailyNotePath = `Daily Notes/${y}-${m}-${d}.md`

    const opts = [
      { label: `${t('tasks.destDaily')} (${y}-${m}-${d})`, path: dailyNotePath },
      { label: t('tasks.destInbox'), path: '00 - Inbox/Tasks.md' }
    ]

    // Task-Notizen die aktuell Tasks haben → auch als Ziel anbieten
    const taskNotes = notes
      .filter(n => (n.taskStats?.total ?? 0) > 0)
      .slice(0, 10)
      .map(n => ({ label: n.title, path: n.path }))
    for (const tn of taskNotes) {
      if (!opts.some(o => o.path === tn.path)) opts.push(tn)
    }
    return opts
  }, [notes, t])

  // Tasks laden
  useEffect(() => {
    const loadTasks = async () => {
      if (!vaultPath) { setIsLoading(false); return }

      const tasks: TaskEntry[] = []
      const notesWithPotentialTasks = notes.filter(note =>
        ((note.taskStats?.total && note.taskStats.total > 0) || note.content) &&
        !taskExcludedFolders.some(f => note.path.startsWith(f + '/'))
      )

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

      for (const note of notesWithPotentialTasks) {
        const content = note.content || loadedContents[note.path]
        if (!content) continue

        const taskSummary = extractTasks(content)
        for (const task of taskSummary.tasks) {
          // Alle unerledigten (auch ohne Datum — Inbox-artige Tasks sollen sichtbar sein)
          if (!task.completed) {
            tasks.push({
              ...task,
              noteId: note.id,
              noteTitle: note.title,
              notePath: note.path
            })
          }
        }
      }

      tasks.sort((a, b) => {
        // ohne Datum ans Ende
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.getTime() - b.dueDate.getTime()
      })

      setAllTasks(tasks)
      setIsLoading(false)
    }

    loadTasks()
  }, [notes, vaultPath, taskExcludedFolders, reloadTick])

  const today = getTodayStart()
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

  const overdueTasks = allTasks.filter(t => t.dueDate && t.dueDate < today)
  const todayTasks = allTasks.filter(t => t.dueDate && t.dueDate >= today && t.dueDate < tomorrow)
  const futureTasks = allTasks.filter(t => t.dueDate && t.dueDate >= tomorrow)
  const undatedTasks = allTasks.filter(t => !t.dueDate)

  const handleSaveTask = useCallback(async (task: TaskEntry, updates: Partial<ExtractedTask>): Promise<void> => {
    if (!vaultPath) return
    const merged: ExtractedTask = { ...task, ...updates }
    const newLine = buildTaskLine({
      rawLine: task.rawLine,
      completed: merged.completed,
      text: merged.text,
      tags: merged.tags,
      dueDate: merged.dueDate
    })

    if (newLine === task.rawLine) return

    const result = await window.electronAPI.tasksUpdateLine({
      vaultPath,
      relativePath: task.notePath,
      lineIndex: task.line,
      expectedOldLine: task.rawLine,
      newLine
    })

    if (!result.success) {
      setErrorBanner(result.error || t('tasks.saveError'))
      setTimeout(() => setErrorBanner(null), 4000)
      return
    }

    trackContextEvent(vaultPath, {
      type: 'task_updated',
      noteId: task.noteId,
      notePath: task.notePath,
      noteTitle: task.noteTitle,
      source: 'tasks'
    }, { throttleMs: 30 * 1000 })

    // Content im Store aktualisieren, damit nächstes Rendering frisch ist
    try {
      const content = await window.electronAPI.readFile(`${vaultPath}/${task.notePath}`) as string
      updateNote(task.noteId, { content })
    } catch {
      // Fallback: einfach neu laden
    }
    setReloadTick(x => x + 1)
  }, [vaultPath, updateNote, t])

  const handleCreateTask = useCallback(async (
    text: string,
    dueDate: Date | undefined,
    tags: string[],
    destinationPath: string
  ): Promise<void> => {
    if (!vaultPath) return
    const taskLine = buildTaskLine({ completed: false, text, tags, dueDate })

    const result = await window.electronAPI.tasksCreate({
      vaultPath,
      relativePath: destinationPath,
      taskLine
    })

    if (!result.success) {
      setErrorBanner(result.error || t('tasks.saveError'))
      setTimeout(() => setErrorBanner(null), 4000)
      return
    }

    trackContextEvent(vaultPath, {
      type: 'task_created',
      notePath: result.relativePath || destinationPath,
      noteTitle: destinationPath.split('/').pop()?.replace(/\.md$/, '') || destinationPath,
      source: 'tasks'
    })

    setQuickAddOpen(false)
    setReloadTick(x => x + 1)
  }, [vaultPath, t])

  const handleOpenNote = (task: TaskEntry): void => {
    selectNote(task.noteId)
  }

  const renderSection = (title: string, tasks: TaskEntry[], type: 'overdue' | 'today' | 'future' | 'undated') => {
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
          <div className="overdue-section-empty">{t('overdue.noAppointments')}</div>
        ) : (
          <div className="overdue-section-list">
            {tasks.map(task => (
              <TaskCard
                key={`${task.noteId}-${task.line}`}
                task={task}
                showDate={showDate}
                onSave={handleSaveTask}
                onOpenNote={handleOpenNote}
                availableTags={availableTags}
              />
            ))}
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
          <span>{t('tasks.title')}</span>
        </div>
        <button
          className="overdue-panel-add"
          onClick={() => setQuickAddOpen(v => !v)}
          title={t('tasks.addNew')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button className="overdue-panel-close" onClick={onClose} title={t('panel.close')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {errorBanner && (
        <div className="overdue-error-banner">{errorBanner}</div>
      )}

      {quickAddOpen && createPortal(
        <div className="overdue-quickadd-overlay" onMouseDown={() => setQuickAddOpen(false)}>
          <div className="overdue-quickadd-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="overdue-quickadd-modal-header">
              <div className="overdue-quickadd-modal-title">{t('tasks.addNew')}</div>
              <button className="overdue-panel-close" onClick={() => setQuickAddOpen(false)} title={t('panel.close')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <QuickAdd
              availableTags={availableTags}
              destinationOptions={destinationOptions}
              defaultDestination={destinationOptions[0]?.path || '00 - Inbox/Tasks.md'}
              onAdd={handleCreateTask}
              onCancel={() => setQuickAddOpen(false)}
            />
          </div>
        </div>,
        document.body
      )}

      <div className="overdue-panel-content">
        {isLoading ? (
          <div className="overdue-loading">
            <div className="overdue-spinner"></div>
            <p>{t('overdue.loading')}</p>
          </div>
        ) : allTasks.length === 0 ? (
          <div className="overdue-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p>{t('overdue.noAppointments')}</p>
            <span>{t('overdue.allDone')}</span>
          </div>
        ) : (
          <>
            {overdueTasks.length > 0 && renderSection(t('overdue.overdue'), overdueTasks, 'overdue')}
            {todayTasks.length > 0 && renderSection(t('overdue.today'), todayTasks, 'today')}
            {futureTasks.length > 0 && renderSection(t('overdue.scheduled'), futureTasks, 'future')}
            {undatedTasks.length > 0 && renderSection(t('tasks.undated'), undatedTasks, 'undated')}
          </>
        )}
      </div>
    </div>
  )
}
