import React, { useState, useRef, useEffect } from 'react'

interface TaskInsertModalProps {
  onInsert: (taskLine: string) => void
  onClose: () => void
}

export default function TaskInsertModal({ onInsert, onClose }: TaskInsertModalProps): React.ReactElement {
  const [taskText, setTaskText] = useState('')
  const [taskDate, setTaskDate] = useState(() => new Date().toISOString().split('T')[0])
  const [taskTime, setTaskTime] = useState('10:00')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleConfirm = (): void => {
    if (!taskText.trim()) return

    let taskLine = `- [ ] ${taskText.trim()}`
    if (taskDate) {
      taskLine += ` (@[[${taskDate}]]`
      if (taskTime) taskLine += ` ${taskTime}`
      taskLine += ')'
    }

    onInsert(taskLine)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="transport-task-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="transport-task-content" onKeyDown={handleKeyDown}>
        <h3>Task einfügen</h3>
        <input
          ref={inputRef}
          type="text"
          placeholder="Aufgabe beschreiben..."
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
        />
        <div className="transport-task-row">
          <input
            type="date"
            value={taskDate}
            onChange={(e) => setTaskDate(e.target.value)}
          />
          <input
            type="time"
            value={taskTime}
            onChange={(e) => setTaskTime(e.target.value)}
          />
        </div>
        <div className="transport-task-actions">
          <button className="transport-btn transport-btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="transport-btn transport-btn-primary"
            onClick={handleConfirm}
            disabled={!taskText.trim()}
          >
            Einfügen
          </button>
        </div>
      </div>
    </div>
  )
}
