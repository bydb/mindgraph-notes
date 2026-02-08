import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useFlashcardStore, createFlashcardFromQuiz } from '../../stores/flashcardStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { fileToBase64, extractImageFromDataTransfer } from '../../utils/imageUtils'
import type { FlashcardStatus, FileEntry } from '../../../shared/types'

export const FlashcardEditor: React.FC = () => {
  const { t } = useTranslation()
  const { vaultPath, selectedNoteId, notes, fileTree } = useNotesStore()

  const {
    editingCard,
    setEditingCard,
    isCreatingCard,
    setCreatingCard,
    addFlashcard,
    updateFlashcard,
    deleteFlashcard,
    saveFlashcards
  } = useFlashcardStore()

  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [topic, setTopic] = useState('')
  const [status, setStatus] = useState<FlashcardStatus>('pending')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const frontTextareaRef = useRef<HTMLTextAreaElement>(null)
  const backTextareaRef = useRef<HTMLTextAreaElement>(null)
  const frontFileInputRef = useRef<HTMLInputElement>(null)
  const backFileInputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!editingCard
  const isOpen = isEditing || isCreatingCard

  // Get current note for source
  const currentNote = notes.find(n => n.id === selectedNoteId)

  // Extract all folders from fileTree
  const folders = useMemo(() => {
    const vaultName = vaultPath?.split('/').pop() || ''
    const folderList: string[] = [vaultName]

    const collectFolders = (entries: FileEntry[]) => {
      for (const entry of entries) {
        if (entry.isDirectory) {
          folderList.push(entry.name)
          if (entry.children) {
            // For nested folders, we could add them with path, but keeping it simple
            collectFolders(entry.children)
          }
        }
      }
    }

    if (fileTree) {
      collectFolders(fileTree)
    }

    return folderList
  }, [fileTree, vaultPath])

  // Sync local state with editing card
  useEffect(() => {
    if (editingCard) {
      setFront(editingCard.front)
      setBack(editingCard.back)
      setTopic(editingCard.topic)
      setStatus(editingCard.status)
      setShowDeleteConfirm(false)
    } else if (isCreatingCard) {
      setFront('')
      setBack('')
      // Topic = Ordnername der aktuellen Notiz, oder Vault-Name wenn im Root
      const vaultName = vaultPath?.split('/').pop() || ''
      let newTopic = vaultName

      if (currentNote?.path) {
        const pathParts = currentNote.path.split('/')
        if (pathParts.length > 1) {
          // Datei in Unterordner: verwende Ordnername
          newTopic = pathParts[0]
        } else if (!currentNote.path.endsWith('.md')) {
          // Kein .md am Ende = wahrscheinlich ein Ordner
          newTopic = currentNote.path
        }
        // Sonst: Einzelne .md Datei im Root → Vault-Name bleibt
      }

      setTopic(newTopic)
      setStatus('active') // New cards are active by default
      setShowDeleteConfirm(false)
    }
  }, [editingCard, isCreatingCard, vaultPath, currentNote])

  const handleClose = () => {
    setEditingCard(null)
    setCreatingCard(false)
  }

  const handleCreate = async () => {
    if (!vaultPath || !front.trim() || !back.trim()) return

    const sourceNote = currentNote?.path || 'Manuell erstellt'
    const newCard = createFlashcardFromQuiz(
      front.trim(),
      back.trim(),
      topic.trim() || 'Allgemein',
      sourceNote
    )
    // Set to active immediately so it's due for learning
    newCard.status = 'active'
    newCard.nextReview = new Date().toISOString()

    addFlashcard(newCard)
    await saveFlashcards(vaultPath)
    setCreatingCard(false)
  }

  const handleSave = async () => {
    if (!editingCard || !vaultPath) return

    updateFlashcard(editingCard.id, {
      front: front.trim(),
      back: back.trim(),
      topic: topic.trim() || editingCard.topic,
      status
    })

    await saveFlashcards(vaultPath)
    setEditingCard(null)
  }

  const handleDelete = async () => {
    if (!editingCard || !vaultPath) return

    deleteFlashcard(editingCard.id)
    await saveFlashcards(vaultPath)
    setEditingCard(null)
  }

  const handleActivate = async () => {
    if (!editingCard || !vaultPath) return

    updateFlashcard(editingCard.id, {
      front: front.trim(),
      back: back.trim(),
      status: 'active',
      nextReview: new Date().toISOString()
    })

    await saveFlashcards(vaultPath)
    setEditingCard(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (isCreatingCard) {
        handleCreate()
      } else {
        handleSave()
      }
    }
  }

  const insertImageIntoTextarea = async (
    file: File,
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    if (!vaultPath) return

    try {
      const base64 = await fileToBase64(file)
      const suggestedName = (file.name?.replace(/\.[^.]+$/, '') || 'flashcard-image').replace(/\s+/g, '-')

      const result = await window.electronAPI.writeImageFromBase64(vaultPath, base64, suggestedName)

      if (result.success && result.relativePath) {
        const textarea = textareaRef.current
        if (!textarea) return

        const cursorPos = textarea.selectionStart
        const currentValue = textarea.value
        const imageMarkdown = `![](${result.relativePath})`

        const before = currentValue.substring(0, cursorPos)
        const after = currentValue.substring(textarea.selectionEnd)
        const needsNewlineBefore = before.length > 0 && !before.endsWith('\n')
        const needsNewlineAfter = after.length > 0 && !after.startsWith('\n')
        const insert = (needsNewlineBefore ? '\n' : '') + imageMarkdown + (needsNewlineAfter ? '\n' : '')

        const newValue = before + insert + after
        setter(newValue)

        requestAnimationFrame(() => {
          const newCursorPos = cursorPos + insert.length
          textarea.focus()
          textarea.setSelectionRange(newCursorPos, newCursorPos)
        })
      }
    } catch (error) {
      console.error('[FlashcardEditor] Image insert error:', error)
    }
  }

  const handleImageSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const file = e.target.files?.[0]
    if (file) {
      insertImageIntoTextarea(file, textareaRef, setter)
    }
    e.target.value = ''
  }

  const handlePaste = async (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    if (!e.clipboardData) return
    const imageFile = await extractImageFromDataTransfer(e.clipboardData as unknown as DataTransfer)
    if (imageFile) {
      e.preventDefault()
      insertImageIntoTextarea(imageFile, textareaRef, setter)
    }
  }

  if (!isOpen) return null

  const statusOptions: { value: FlashcardStatus; label: string }[] = [
    { value: 'pending', label: t('flashcards.statusPending') },
    { value: 'active', label: t('flashcards.statusActive') },
    { value: 'suspended', label: t('flashcards.statusSuspended') }
  ]

  return (
    <div className="flashcard-editor-backdrop" onClick={handleClose}>
      <div
        className="flashcard-editor-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flashcard-editor-header">
          <div className="flashcard-editor-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isCreatingCard ? (
                <>
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="12" y1="9" x2="12" y2="15" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                </>
              ) : (
                <>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </>
              )}
            </svg>
            <span>{isCreatingCard ? t('flashcards.createTitle') : t('flashcards.editTitle')}</span>
          </div>
          <button className="flashcard-editor-close" onClick={handleClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flashcard-editor-content">
          {/* Front */}
          <div className="flashcard-editor-field">
            <div className="flashcard-editor-field-header">
              <label>{t('flashcards.front')}</label>
              <button
                className="flashcard-editor-image-btn"
                onClick={() => frontFileInputRef.current?.click()}
                title={t('flashcards.insertImage')}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
              <input
                ref={frontFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageSelect(e, frontTextareaRef, setFront)}
              />
            </div>
            <textarea
              ref={frontTextareaRef}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              onPaste={(e) => handlePaste(e, frontTextareaRef, setFront)}
              placeholder={t('flashcards.frontPlaceholder')}
              rows={3}
              autoFocus
            />
          </div>

          {/* Back */}
          <div className="flashcard-editor-field">
            <div className="flashcard-editor-field-header">
              <label>{t('flashcards.back')}</label>
              <button
                className="flashcard-editor-image-btn"
                onClick={() => backFileInputRef.current?.click()}
                title={t('flashcards.insertImage')}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
              <input
                ref={backFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageSelect(e, backTextareaRef, setBack)}
              />
            </div>
            <textarea
              ref={backTextareaRef}
              value={back}
              onChange={(e) => setBack(e.target.value)}
              onPaste={(e) => handlePaste(e, backTextareaRef, setBack)}
              placeholder={t('flashcards.backPlaceholder')}
              rows={4}
            />
          </div>

          {/* Topic (for creating) */}
          {isCreatingCard && (
            <div className="flashcard-editor-field">
              <label>{t('flashcards.topic')}</label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              >
                {folders.map((folder) => (
                  <option key={folder} value={folder}>{folder}</option>
                ))}
              </select>
            </div>
          )}

          {/* Status (only for editing) */}
          {isEditing && (
            <div className="flashcard-editor-field">
              <label>{t('flashcards.status')}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as FlashcardStatus)}
              >
                {statusOptions.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Source (read-only, only for editing) */}
          {isEditing && editingCard && (
            <div className="flashcard-editor-field flashcard-editor-source">
              <label>{t('flashcards.source')}</label>
              <div className="flashcard-editor-source-value">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {editingCard.sourceNote}
              </div>
            </div>
          )}

          {/* Source hint for creating */}
          {isCreatingCard && currentNote && (
            <div className="flashcard-editor-field flashcard-editor-source">
              <label>{t('flashcards.source')}</label>
              <div className="flashcard-editor-source-value">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {currentNote.path}
              </div>
            </div>
          )}

          {/* Stats (for active cards) */}
          {isEditing && editingCard && editingCard.status === 'active' && editingCard.lastReview && (
            <div className="flashcard-editor-stats">
              <div className="flashcard-stat">
                <span className="flashcard-stat-label">{t('flashcards.repetitions')}</span>
                <span className="flashcard-stat-value">{editingCard.repetitions}</span>
              </div>
              <div className="flashcard-stat">
                <span className="flashcard-stat-label">{t('flashcards.interval')}</span>
                <span className="flashcard-stat-value">{editingCard.interval} {t('flashcards.days')}</span>
              </div>
              <div className="flashcard-stat">
                <span className="flashcard-stat-label">{t('flashcards.ease')}</span>
                <span className="flashcard-stat-value">{(editingCard.easeFactor * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flashcard-editor-footer">
          {isCreatingCard ? (
            // Create mode footer
            <div className="flashcard-editor-actions" style={{ marginLeft: 'auto' }}>
              <button className="flashcard-btn-cancel" onClick={handleClose}>
                {t('common.cancel')}
              </button>
              <button
                className="flashcard-btn-save"
                onClick={handleCreate}
                disabled={!front.trim() || !back.trim()}
              >
                {t('flashcards.createCard')}
              </button>
            </div>
          ) : showDeleteConfirm ? (
            <div className="flashcard-delete-confirm">
              <span>{t('flashcards.deleteConfirm')}</span>
              <button className="flashcard-btn-cancel" onClick={() => setShowDeleteConfirm(false)}>
                {t('common.cancel')}
              </button>
              <button className="flashcard-btn-delete" onClick={handleDelete}>
                {t('common.delete')}
              </button>
            </div>
          ) : (
            <>
              <button
                className="flashcard-btn-delete-outline"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                {t('common.delete')}
              </button>

              <div className="flashcard-editor-actions">
                {editingCard && editingCard.status === 'pending' && (
                  <button
                    className="flashcard-btn-activate"
                    onClick={handleActivate}
                    disabled={!front.trim() || !back.trim()}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t('flashcards.activate')}
                  </button>
                )}
                <button
                  className="flashcard-btn-save"
                  onClick={handleSave}
                  disabled={!front.trim() || !back.trim()}
                >
                  {t('common.save')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
