import React, { useState, useEffect, useRef, useMemo } from 'react'
import { EditorView } from '@codemirror/view'
import { useTranslation } from '../../utils/translations'
import { useUIStore } from '../../stores/uiStore'
import { getSlashCommands, type SlashCommand } from './slashCommands'

export interface SlashCommandMenuProps {
  view: EditorView | null
  isOpen: boolean
  triggerPos: number
  query: string
  onClose: () => void
  onExecute: () => void
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  view,
  isOpen,
  triggerPos,
  query,
  onClose,
  onExecute
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const dateFormat = useUIStore(s => s.slashCommandDateFormat)
  const timeFormat = useUIStore(s => s.slashCommandTimeFormat)

  // Get all commands
  const allCommands = useMemo(
    () => getSlashCommands(t as (key: string) => string, dateFormat, timeFormat),
    [t, dateFormat, timeFormat]
  )

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query) return allCommands
    const q = query.toLowerCase()
    return allCommands.filter(cmd =>
      cmd.id.toLowerCase().includes(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.keywords.some(kw => kw.toLowerCase().includes(q))
    )
  }, [allCommands, query])

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Calculate position from editor view
  useEffect(() => {
    if (!view || !isOpen) return
    const coords = view.coordsAtPos(triggerPos)
    if (coords) {
      setPosition({
        x: coords.left,
        y: coords.bottom + 4
      })
    }
  }, [view, isOpen, triggerPos])

  // Keyboard handling (capture phase to intercept before CodeMirror)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        if (filteredCommands.length > 0) {
          executeCommand(filteredCommands[selectedIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, filteredCommands, selectedIndex, onClose])

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && listRef.current.children[selectedIndex]) {
      const el = listRef.current.children[selectedIndex] as HTMLElement
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const executeCommand = (cmd: SlashCommand) => {
    if (!view) return
    // from = position of the '/' character, to = current cursor position
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const textBefore = line.text.slice(0, cursor - line.from)
    const slashMatch = textBefore.match(/(?:^|\s)\/([\w-]*)$/)
    if (slashMatch) {
      const slashStart = cursor - slashMatch[0].length + (slashMatch[0].startsWith('/') ? 0 : 1)
      cmd.action(view, slashStart, cursor)
    }
    onExecute()
    view.focus()
  }

  if (!isOpen || !position) return null

  return (
    <div
      ref={containerRef}
      className="slash-command-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y
      }}
    >
      <div className="slash-command-menu-header">
        {t('slashCommand.header')}
      </div>

      <div className="slash-command-menu-list" ref={listRef}>
        {filteredCommands.length === 0 ? (
          <div className="slash-command-menu-empty">
            {t('slashCommand.noResults')}
          </div>
        ) : (
          (() => {
            const elements: React.ReactNode[] = []
            let currentCategory = ''
            filteredCommands.forEach((cmd, idx) => {
              if (cmd.category !== currentCategory) {
                currentCategory = cmd.category
                elements.push(
                  <div key={`cat-${cmd.category}`} className="slash-command-menu-category">
                    {cmd.category}
                  </div>
                )
              }
              elements.push(
                <div
                  key={cmd.id}
                  className={`slash-command-menu-item${idx === selectedIndex ? ' selected' : ''}`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => executeCommand(cmd)}
                >
                  <span className="slash-command-menu-icon">{cmd.icon}</span>
                  <span className="slash-command-menu-label">{cmd.label}</span>
                  <span className="slash-command-menu-desc">{cmd.description}</span>
                </div>
              )
            })
            return elements
          })()
        )}
      </div>

      <div className="slash-command-menu-footer">
        <span>↑↓ {t('slashCommand.navigate')}</span>
        <span>↩ {t('slashCommand.select')}</span>
        <span>Esc {t('slashCommand.close')}</span>
      </div>
    </div>
  )
}
