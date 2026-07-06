import React, { useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { isBrainNote, brainNoteLabel } from '../../utils/brainNote'
import { BrainIcon } from '../BrainIcon'

interface BacklinksPanelProps {
  isSecondary?: boolean
}

export const BacklinksPanel: React.FC<BacklinksPanelProps> = ({ isSecondary = false }) => {
  const { t } = useTranslation()
  const { notes, getSelectedNote, getSecondarySelectedNote, selectNote, selectSecondaryNote } = useNotesStore()
  const brainFolder = useUIStore(s => s.brain.folderPath)
  const setEditorShowBacklinks = useUIStore(s => s.setEditorShowBacklinks)
  const selectedNote = isSecondary ? getSecondarySelectedNote() : getSelectedNote()
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (!selectedNote) {
    return null
  }

  const backlinks = selectedNote.incomingLinks
    .map(id => notes.find(n => n.id === id))
    .filter(Boolean)

  // Klick auf Backlink öffnet Note im gleichen Panel
  const handleBacklinkClick = (noteId: string) => {
    if (isSecondary) {
      selectSecondaryNote(noteId)
    } else {
      selectNote(noteId)
    }
  }

  return (
    <div className={`backlinks-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div
        className="backlinks-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="backlinks-header-left">
          {t('backlinks.title')}
          <span className="backlinks-count">{backlinks.length}</span>
        </div>
        <div className="backlinks-header-right">
          <button
            type="button"
            className="backlinks-hide"
            title={t('backlinks.hide')}
            aria-label={t('backlinks.hide')}
            onClick={(e) => { e.stopPropagation(); setEditorShowBacklinks(false) }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </button>
          <span className="backlinks-toggle">▼</span>
        </div>
      </div>
      <div className="backlinks-content">
        {backlinks.length === 0 ? (
          <p className="no-backlinks">{t('backlinks.none')}</p>
        ) : (
          <ul className="backlinks-list">
            {backlinks.map(note => {
              const brain = isBrainNote(note!, brainFolder)
              return (
                <li
                  key={note!.id}
                  className={`backlink-item${brain ? ' backlink-brain' : ''}`}
                  onClick={() => handleBacklinkClick(note!.id)}
                >
                  {brain
                    ? <BrainIcon size={13} title={t('brain.noteLabel')} />
                    : <span className="backlink-icon">📄</span>}
                  <span className="backlink-title">{brain ? brainNoteLabel(note!) : note!.title}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
