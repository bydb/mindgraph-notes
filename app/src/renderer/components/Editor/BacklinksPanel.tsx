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
        <span className="backlinks-toggle">▼</span>
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
