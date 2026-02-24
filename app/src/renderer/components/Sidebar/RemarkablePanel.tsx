import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ReMarkableDocumentSummary } from '../../../shared/types'
import { useTranslation } from '../../utils/translations'
import { useUIStore } from '../../stores/uiStore'
import { createNoteFromFile, useNotesStore } from '../../stores/notesStore'

export const RemarkablePanel: React.FC = () => {
  const { t } = useTranslation()
  const remarkable = useUIStore((s) => s.remarkable)
  const docling = useUIStore((s) => s.docling)
  const vaultPath = useNotesStore((s) => s.vaultPath)
  const notes = useNotesStore((s) => s.notes)
  const setFileTree = useNotesStore((s) => s.setFileTree)
  const addNote = useNotesStore((s) => s.addNote)
  const selectNote = useNotesStore((s) => s.selectNote)
  const selectPdf = useNotesStore((s) => s.selectPdf)
  const selectedPdfPath = useNotesStore((s) => s.selectedPdfPath)
  const selectedNoteId = useNotesStore((s) => s.selectedNoteId)
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [documents, setDocuments] = useState<ReMarkableDocumentSummary[]>([])
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([])
  const [importingDocumentId, setImportingDocumentId] = useState<string | null>(null)
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null)
  const [isExportingSelectedPdf, setIsExportingSelectedPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const refreshInFlightRef = useRef(false)

  const selectedNote = selectedNoteId ? notes.find((note) => note.id === selectedNoteId) : null
  const exportCandidatePath = selectedPdfPath || selectedNote?.sourcePdf || null
  const exportCandidateName = exportCandidatePath ? exportCandidatePath.split('/').pop() || exportCandidatePath : null

  const sanitizeFileName = (name: string): string => {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    const sanitized = trimmed.replace(/[^a-zA-Z0-9\-_. ]/g, '').replace(/ /g, '-')
    return sanitized || 'remarkable-note'
  }

  const loadDocuments = useCallback(async (folderId?: string) => {
    const result = await window.electronAPI.remarkableListDocuments(folderId)
    if (result.error) {
      setError(result.error)
    }

    const sorted = [...result.documents].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'CollectionType' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    setDocuments(sorted)
  }, [])

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return
    }

    refreshInFlightRef.current = true
    setIsLoading(true)
    setError(null)
    setInfo(null)

    try {
      const status = await window.electronAPI.remarkableUsbCheck()
      setIsConnected(status.connected)

      if (!status.connected) {
        if (status.error) {
          setError(status.error)
        }
        setDocuments([])
        setFolderStack([])
        return
      }

      const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : undefined
      await loadDocuments(currentFolderId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh reMarkable')
    } finally {
      refreshInFlightRef.current = false
      setIsLoading(false)
    }
  }, [folderStack, loadDocuments])

  const openFolder = useCallback(async (folder: ReMarkableDocumentSummary) => {
    if (folder.type !== 'CollectionType') return

    setIsLoading(true)
    setError(null)
    setInfo(null)

    try {
      await loadDocuments(folder.id)
      setFolderStack((prev) => [...prev, { id: folder.id, name: folder.name }])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.error'))
    } finally {
      setIsLoading(false)
    }
  }, [loadDocuments, t])

  const navigateToRoot = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setInfo(null)

    try {
      await loadDocuments()
      setFolderStack([])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.error'))
    } finally {
      setIsLoading(false)
    }
  }, [loadDocuments, t])

  const navigateBack = useCallback(async () => {
    if (folderStack.length === 0) return

    const parentId = folderStack.length > 1 ? folderStack[folderStack.length - 2].id : undefined
    setIsLoading(true)
    setError(null)
    setInfo(null)

    try {
      await loadDocuments(parentId)
      setFolderStack((prev) => prev.slice(0, -1))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.error'))
    } finally {
      setIsLoading(false)
    }
  }, [folderStack, loadDocuments, t])

  const importDocument = useCallback(async (doc: ReMarkableDocumentSummary) => {
    if (!vaultPath) {
      setError(t('sidebar.remarkable.noVault'))
      return
    }

    setImportingDocumentId(doc.id)
    setError(null)
    setInfo(null)

    try {
      const remarkableMarker = `remarkable_id: "${doc.id}"`
      const existingNote = notes.find((note) => note.content.includes(remarkableMarker))
      if (existingNote) {
        const hasExtractedContent =
          existingNote.content.includes('## Extrahierter Inhalt') ||
          existingNote.content.includes('## Extracted Content')

        if (docling.enabled && !hasExtractedContent) {
          const sourcePdfMatch = existingNote.content.match(/sourcePdf:\s*"([^"]+)"/)
          const sourcePdf = sourcePdfMatch?.[1]

          if (sourcePdf) {
            setInfo(t('sidebar.remarkable.extracting'))

            const checkResult = await window.electronAPI.doclingCheck(docling.url)
            if (checkResult.available) {
              const convertResult = await window.electronAPI.doclingConvertPdf(
                `${vaultPath}/${sourcePdf}`,
                docling.url,
                {
                  ocrEnabled: docling.ocrEnabled,
                  ocrLanguages: docling.ocrLanguages
                }
              )

              if (convertResult.success && convertResult.content) {
                const updatedContent = `${existingNote.content.trimEnd()}\n\n## ${t('docling.extractedContentHeader')}\n\n${convertResult.content}\n`
                await window.electronAPI.writeFile(`${vaultPath}/${existingNote.path}`, updatedContent)
                const updatedNote = await createNoteFromFile(
                  `${vaultPath}/${existingNote.path}`,
                  existingNote.path,
                  updatedContent
                )
                addNote(updatedNote)
                selectNote(existingNote.id)
                setInfo(t('sidebar.remarkable.importedWithExtraction'))
                return
              }
            }
          }
        }

        selectNote(existingNote.id)
        setInfo(t('sidebar.remarkable.openedExisting'))
        return
      }

      const downloadResult = await window.electronAPI.remarkableDownloadDocument(vaultPath, {
        id: doc.id,
        name: doc.name
      })
      if (!downloadResult.success || !downloadResult.relativePdfPath) {
        throw new Error(downloadResult.error || t('sidebar.remarkable.downloadError'))
      }

      let extractedContent: string | null = null
      let extractionFailed = false
      const pdfFullPath = `${vaultPath}/${downloadResult.relativePdfPath}`

      if (docling.enabled) {
        setInfo(t('sidebar.remarkable.extracting'))
        const checkResult = await window.electronAPI.doclingCheck(docling.url)
        if (checkResult.available) {
          const convertResult = await window.electronAPI.doclingConvertPdf(
            pdfFullPath,
            docling.url,
            {
              ocrEnabled: docling.ocrEnabled,
              ocrLanguages: docling.ocrLanguages
            }
          )
          if (convertResult.success && convertResult.content) {
            extractedContent = convertResult.content
          } else {
            extractionFailed = true
          }
        } else {
          extractionFailed = true
        }
      }

      const importFolderRelative = 'reMarkable'
      const importFolderFullPath = `${vaultPath}/${importFolderRelative}`
      await window.electronAPI.ensureDir(importFolderFullPath)

      const safeName = sanitizeFileName(doc.name)
      const fileName = `${safeName}-${doc.id.slice(0, 8)}.md`
      const filePath = `${importFolderFullPath}/${fileName}`
      const relativePath = `${importFolderRelative}/${fileName}`
      const importedAt = new Date().toISOString()

      const extractedSection = extractedContent
        ? `\n## ${t('docling.extractedContentHeader')}\n\n${extractedContent}\n`
        : ''

      const content = `---\nremarkable_id: "${doc.id}"\nremarkable_name: "${doc.name.replace(/"/g, '\\"')}"\nremarkable_type: "${doc.type}"\nremarkable_parent: "${doc.parent}"\nremarkable_modified: "${doc.modifiedClient}"\nremarkable_imported_at: "${importedAt}"\nsourcePdf: "${downloadResult.relativePdfPath}"\n---\n\n# ${doc.name}\n\n![[${downloadResult.relativePdfPath}]]\n\n> Imported from reMarkable via USB.${extractedContent ? ' OCR extraction completed.' : ' OCR and handwritten text extraction pending.'}${extractedSection}`

      await window.electronAPI.writeFile(filePath, content)

      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)

      const note = await createNoteFromFile(filePath, relativePath, content)
      addNote(note)
      selectNote(note.id)
      if (extractedContent) {
        setInfo(t('sidebar.remarkable.importedWithExtraction'))
      } else if (docling.enabled && extractionFailed) {
        setInfo(t('sidebar.remarkable.importedExtractionFailed'))
      } else {
        setInfo(t('sidebar.remarkable.imported'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.importError'))
    } finally {
      setImportingDocumentId(null)
    }
  }, [addNote, docling.enabled, docling.ocrEnabled, docling.ocrLanguages, docling.url, notes, selectNote, setFileTree, t, vaultPath])

  const handleItemDoubleClick = useCallback(async (doc: ReMarkableDocumentSummary) => {
    if (doc.type === 'CollectionType') {
      await openFolder(doc)
    }
  }, [openFolder])

  const openDocumentPdf = useCallback(async (doc: ReMarkableDocumentSummary) => {
    if (!vaultPath) {
      setError(t('sidebar.remarkable.noVault'))
      return
    }

    setOpeningDocumentId(doc.id)
    setError(null)
    setInfo(t('sidebar.remarkable.openingPdf'))

    try {
      const downloadResult = await window.electronAPI.remarkableDownloadDocument(vaultPath, {
        id: doc.id,
        name: doc.name
      })
      if (!downloadResult.success || !downloadResult.relativePdfPath) {
        throw new Error(downloadResult.error || t('sidebar.remarkable.downloadError'))
      }

      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)
      selectPdf(downloadResult.relativePdfPath)
      setInfo(t('sidebar.remarkable.openedPdf'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.openPdfError'))
    } finally {
      setOpeningDocumentId(null)
    }
  }, [selectPdf, setFileTree, t, vaultPath])

  const exportSelectedPdfToRemarkable = useCallback(async () => {
    if (!vaultPath) {
      setError(t('sidebar.remarkable.noVault'))
      return
    }
    if (!exportCandidatePath) {
      setError(t('sidebar.remarkable.noPdfSelected'))
      return
    }

    setIsExportingSelectedPdf(true)
    setError(null)
    setInfo(t('sidebar.remarkable.exportingPdf'))

    try {
      const status = await window.electronAPI.remarkableUsbCheck()
      if (!status.connected) {
        throw new Error(status.error || t('sidebar.remarkable.disconnected'))
      }

      const result = await window.electronAPI.remarkableUploadPdf(vaultPath, exportCandidatePath)
      if (!result.success) {
        throw new Error(result.error || t('sidebar.remarkable.exportPdfError'))
      }

      setInfo(t('sidebar.remarkable.exportedPdf'))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.exportPdfError'))
    } finally {
      setIsExportingSelectedPdf(false)
    }
  }, [exportCandidatePath, refresh, t, vaultPath])

  useEffect(() => {
    if (remarkable.enabled && remarkable.autoRefreshOnOpen) {
      refresh()
    }
  }, [remarkable.enabled, remarkable.autoRefreshOnOpen])

  if (!remarkable.enabled) {
    return null
  }

  return (
    <div className="remarkable-panel">
      <div className="remarkable-header">
        <div className="remarkable-title">reMarkable</div>
        <button className="display-mode-toggle" onClick={refresh} disabled={isLoading} title={t('sidebar.remarkable.refresh')}>
          {isLoading ? '...' : 'R'}
        </button>
      </div>

      <div className="remarkable-status">
        <span className={`remarkable-dot ${isConnected ? 'connected' : 'disconnected'}`} />
        <span>{isConnected ? t('sidebar.remarkable.connected') : t('sidebar.remarkable.disconnected')}</span>
      </div>

      {error && <div className="remarkable-error">{error}</div>}
      {info && <div className="remarkable-info">{info}</div>}

      {isConnected && (
        <>
          <div className="remarkable-export-row">
            <button
              className="remarkable-export-btn"
              onClick={exportSelectedPdfToRemarkable}
              disabled={isExportingSelectedPdf || !exportCandidatePath}
              title={t('sidebar.remarkable.exportPdfAction')}
            >
              {isExportingSelectedPdf ? t('sidebar.remarkable.exporting') : t('sidebar.remarkable.exportPdfAction')}
            </button>
            <span className="remarkable-export-file" title={exportCandidatePath || t('sidebar.remarkable.noPdfSelected')}>
              {exportCandidateName || t('sidebar.remarkable.noPdfSelected')}
            </span>
          </div>

          <div className="remarkable-subtitle">{t('sidebar.remarkable.documents')}</div>
          <div className="remarkable-help">{t('sidebar.remarkable.importHint')}</div>
          <div className="remarkable-nav">
            <button className="remarkable-nav-btn" onClick={navigateToRoot} disabled={isLoading}>
              {t('sidebar.remarkable.root')}
            </button>
            <button className="remarkable-nav-btn" onClick={navigateBack} disabled={isLoading || folderStack.length === 0}>
              {t('sidebar.remarkable.back')}
            </button>
            <span className="remarkable-path" title={folderStack.map((f) => f.name).join(' / ')}>
              {folderStack.length === 0 ? t('sidebar.remarkable.root') : folderStack[folderStack.length - 1].name}
            </span>
          </div>
          {documents.length === 0 ? (
            <div className="remarkable-empty">{t('sidebar.remarkable.empty')}</div>
          ) : (
            <div className="remarkable-list">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`remarkable-item ${doc.type === 'CollectionType' ? 'folder' : ''}`}
                  title={doc.name}
                  onDoubleClick={() => handleItemDoubleClick(doc)}
                >
                  <span className="remarkable-item-icon">{doc.type === 'CollectionType' ? 'D' : 'N'}</span>
                  <span className="remarkable-item-name">{doc.name}</span>
                  {doc.type === 'DocumentType' && (
                    <button
                      className="remarkable-open-btn"
                      onClick={() => openDocumentPdf(doc)}
                      disabled={openingDocumentId === doc.id || importingDocumentId === doc.id}
                      title={t('sidebar.remarkable.openPdfAction')}
                    >
                      {'>'}
                    </button>
                  )}
                  {doc.type === 'DocumentType' && (
                    <button
                      className="remarkable-import-btn"
                      onClick={() => importDocument(doc)}
                      disabled={importingDocumentId === doc.id || openingDocumentId === doc.id}
                      title={t('sidebar.remarkable.importAction')}
                    >
                      +
                    </button>
                  )}
                  {importingDocumentId === doc.id && (
                    <span className="remarkable-item-importing">{t('sidebar.remarkable.importing')}</span>
                  )}
                  {openingDocumentId === doc.id && (
                    <span className="remarkable-item-importing">{t('sidebar.remarkable.opening')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
