// reMarkable-Plugin — Renderer-Panel (Sidebar). War früher components/Sidebar/RemarkablePanel.tsx;
// jetzt in der Vertikale und über den Slot `sidebar.panel.remarkable` gemountet (./index.tsx).
// Geräte-/PDF-Aufrufe laufen über invokePlugin('remarkable', …) statt window.electronAPI.remarkable*.
// Docling/writeFile/readDirectory bleiben Kern-APIs (kein Teil der Vertikale).

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ReMarkableDocumentSummary,
  ReMarkableUsbCheckResult,
  ReMarkableUsbDebugInfoResult,
  ReMarkableDownloadResult,
  ReMarkableUploadResult,
  ReMarkableOptimizeResult,
  ReMarkableBookifyResult,
} from '../../../shared/types'
import { useTranslation } from '../../../renderer/utils/translations'
import { useUIStore, REMARKABLE_DEFAULTS } from '../../../renderer/stores/uiStore'
import { usePluginConfig } from '../../../renderer/plugins/config'
import { createNoteFromFile, useNotesStore } from '../../../renderer/stores/notesStore'
import { hasExtractedSection, importIdOf, isImportCandidate, sourcePdfOf, updateImportNote } from '../importNote'
import type { Note } from '../../../shared/types'
import { invokePlugin } from '../../../renderer/plugins/client'
import remarkableLogo from '../../../renderer/assets/remarkable-logo.png'

export const RemarkablePanel: React.FC = () => {
  const { t } = useTranslation()
  const [remarkable] = usePluginConfig('remarkable', REMARKABLE_DEFAULTS)
  const docling = useUIStore((s) => s.docling)
  const vaultPath = useNotesStore((s) => s.vaultPath)
  const notes = useNotesStore((s) => s.notes)
  const setFileTree = useNotesStore((s) => s.setFileTree)
  const addNote = useNotesStore((s) => s.addNote)
  const selectNote = useNotesStore((s) => s.selectNote)
  const selectPdf = useNotesStore((s) => s.selectPdf)
  const bumpPdfRevision = useNotesStore((s) => s.bumpPdfRevision)
  const selectedPdfPath = useNotesStore((s) => s.selectedPdfPath)
  const selectedNoteId = useNotesStore((s) => s.selectedNoteId)
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [documents, setDocuments] = useState<ReMarkableDocumentSummary[]>([])
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([])
  const [importingDocumentId, setImportingDocumentId] = useState<string | null>(null)
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null)
  const [isExportingSelectedPdf, setIsExportingSelectedPdf] = useState(false)
  const [isOptimizingAndExporting, setIsOptimizingAndExporting] = useState(false)
  const [isBookifyingAndExporting, setIsBookifyingAndExporting] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const [usbDebugInfo, setUsbDebugInfo] = useState<ReMarkableUsbDebugInfoResult | null>(null)
  const [lastExportMode, setLastExportMode] = useState<string>('n/a')
  const [lastExportDetail, setLastExportDetail] = useState<string>('n/a')
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
    const result = await invokePlugin<{ documents: ReMarkableDocumentSummary[]; error?: string }>(
      'remarkable',
      'remarkable.listDocuments',
      { folderId }
    )
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
      const status = await invokePlugin<ReMarkableUsbCheckResult>('remarkable', 'remarkable.usbCheck')
      setIsConnected(status.connected)

      const debugResult = await invokePlugin<ReMarkableUsbDebugInfoResult>('remarkable', 'remarkable.usbDebugInfo')
      if (debugResult.success) {
        setUsbDebugInfo(debugResult)
      }

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

  // Sucht die Importnotiz eines Notizbuchs. Nach einem App-Start sind Notizen aus dem Cache
  // noch ohne Inhalt (`content: ''`) — die Suche nur im geladenen Inhalt fand sie dann nicht,
  // und ein erneuter Import überschrieb die Notiz. Deshalb Kandidaten von der Platte lesen.
  // Erkannt wird nur über `remarkable_id` im Frontmatter (importNote.ts).
  const findExistingImport = useCallback(async (
    doc: ReMarkableDocumentSummary
  ): Promise<{ note: Note; content: string } | null> => {
    if (!vaultPath) return null
    for (const note of notes.filter((n) => isImportCandidate(n, doc.id))) {
      try {
        const content: string = await window.electronAPI.readFile(`${vaultPath}/${note.path}`)
        if (importIdOf(content) === doc.id) return { note, content }
      } catch {
        // Datei weg oder unlesbar — nächster Kandidat
      }
    }
    return null
  }, [notes, vaultPath])

  // Bringt eine vorhandene Importnotiz auf den Stand des frischen Downloads. Liefert den
  // aktuellen Inhalt und ob die Notiz aktualisiert werden konnte.
  const updateExistingImport = useCallback(async (
    existing: { note: Note; content: string },
    doc: ReMarkableDocumentSummary,
    result: ReMarkableDownloadResult
  ): Promise<{ content: string; ok: boolean }> => {
    if (!vaultPath || !result.relativePdfPath) return { content: existing.content, ok: false }
    const outcome = updateImportNote(existing.content, {
      modifiedClient: doc.modifiedClient,
      importedAt: new Date().toISOString(),
      relativePdfPath: result.relativePdfPath,
      pageCount: result.pageCount,
      changed: result.changed
    })
    if (outcome.status === 'no-frontmatter') return { content: existing.content, ok: false }
    if (outcome.status === 'updated') {
      await window.electronAPI.writeFile(`${vaultPath}/${existing.note.path}`, outcome.content)
      addNote(await createNoteFromFile(`${vaultPath}/${existing.note.path}`, existing.note.path, outcome.content))
    }
    return { content: outcome.content, ok: true }
  }, [addNote, vaultPath])

  const downloadInfo = useCallback((result: ReMarkableDownloadResult): string | null => {
    if (typeof result.pageCount !== 'number') return null
    if (result.changed === false) return t('sidebar.remarkable.pdfUnchanged', { pages: String(result.pageCount) })
    if (result.alreadyExists && typeof result.previousPageCount === 'number') {
      return t('sidebar.remarkable.pdfUpdated', { pages: String(result.pageCount), previous: String(result.previousPageCount) })
    }
    return t('sidebar.remarkable.pdfPages', { pages: String(result.pageCount) })
  }, [t])

  const importDocument = useCallback(async (doc: ReMarkableDocumentSummary) => {
    if (!vaultPath) {
      setError(t('sidebar.remarkable.noVault'))
      return
    }

    setImportingDocumentId(doc.id)
    setError(null)
    setInfo(null)

    try {
      const existing = await findExistingImport(doc)
      if (existing) {
        // Bereits importiert: trotzdem frisch vom Gerät laden. Früher wurde nur die alte
        // Notiz geöffnet, und neue Seiten kamen nie an.
        setInfo(t('sidebar.remarkable.openingPdf'))
        const sourcePdf = sourcePdfOf(existing.content)
        const refreshed = await invokePlugin<ReMarkableDownloadResult>('remarkable', 'remarkable.download', {
          id: doc.id,
          name: doc.name,
          ...(sourcePdf ? { existingPath: sourcePdf } : {})
        })
        if (!refreshed.success || !refreshed.relativePdfPath) {
          throw new Error(refreshed.error || t('sidebar.remarkable.downloadError'))
        }
        const updated = await updateExistingImport(existing, doc, refreshed)
        if (refreshed.changed !== false) bumpPdfRevision()
        const existingNote = { ...existing.note, content: updated.content }
        const hasExtractedContent = hasExtractedSection(existingNote.content)
        // Texterkennung wird beim Aktualisieren nicht neu erzeugt (zurückgestellt, Codex F09) —
        // dann wenigstens sagen, dass sie den alten Stand zeigt.
        const refreshedInfo = [
          downloadInfo(refreshed),
          updated.ok ? null : t('sidebar.remarkable.noteNotUpdated'),
          refreshed.changed !== false && hasExtractedContent ? t('sidebar.remarkable.extractOutdated') : null
        ].filter(Boolean).join(' · ') || null

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
        setInfo(refreshedInfo ?? t('sidebar.remarkable.openedExisting'))
        return
      }

      const downloadResult = await invokePlugin<ReMarkableDownloadResult>('remarkable', 'remarkable.download', {
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
      // Liegt dort schon eine Datei, die nicht als Import erkannt wurde (z. B. Frontmatter
      // gelöscht), nicht überschreiben — die PDF ist aktualisiert, die Notiz bleibt (Codex F10).
      const occupied = await window.electronAPI.readFile(filePath).then(() => true, () => false)
      if (occupied) {
        bumpPdfRevision()
        throw new Error(t('sidebar.remarkable.noteOccupied', { file: relativePath }))
      }
      const importedAt = new Date().toISOString()

      const extractedSection = extractedContent
        ? `\n## ${t('docling.extractedContentHeader')}\n\n${extractedContent}\n`
        : ''

      const content = `---\nremarkable_id: "${doc.id}"\nremarkable_name: "${doc.name.replace(/"/g, '\\"')}"\nremarkable_type: "${doc.type}"\nremarkable_parent: "${doc.parent}"\nremarkable_modified: "${doc.modifiedClient}"\nremarkable_imported_at: "${importedAt}"\n${typeof downloadResult.pageCount === 'number' ? `remarkable_pages: ${downloadResult.pageCount}\n` : ''}sourcePdf: "${downloadResult.relativePdfPath}"\n---\n\n# ${doc.name}\n\n![[${downloadResult.relativePdfPath}]]\n\n> Imported from reMarkable via USB.${extractedContent ? ' OCR extraction completed.' : ' OCR and handwritten text extraction pending.'}${extractedSection}`

      await window.electronAPI.writeFile(filePath, content)

      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)

      const note = await createNoteFromFile(filePath, relativePath, content)
      addNote(note)
      selectNote(note.id)
      const pagesInfo = downloadInfo(downloadResult)
      const suffix = pagesInfo ? ` · ${pagesInfo}` : ''
      if (extractedContent) {
        setInfo(t('sidebar.remarkable.importedWithExtraction') + suffix)
      } else if (docling.enabled && extractionFailed) {
        setInfo(t('sidebar.remarkable.importedExtractionFailed') + suffix)
      } else {
        setInfo(t('sidebar.remarkable.imported') + suffix)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.importError'))
    } finally {
      setImportingDocumentId(null)
    }
  }, [addNote, bumpPdfRevision, docling.enabled, docling.ocrEnabled, docling.ocrLanguages, docling.url, downloadInfo, findExistingImport, selectNote, setFileTree, t, updateExistingImport, vaultPath])

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
      const existing = await findExistingImport(doc)
      const sourcePdf = existing ? sourcePdfOf(existing.content) : undefined
      const downloadResult = await invokePlugin<ReMarkableDownloadResult>('remarkable', 'remarkable.download', {
        id: doc.id,
        name: doc.name,
        ...(sourcePdf ? { existingPath: sourcePdf } : {})
      })
      if (!downloadResult.success || !downloadResult.relativePdfPath) {
        throw new Error(downloadResult.error || t('sidebar.remarkable.downloadError'))
      }
      if (existing) await updateExistingImport(existing, doc, downloadResult)
      if (downloadResult.changed !== false) bumpPdfRevision()

      const tree = await window.electronAPI.readDirectory(vaultPath)
      setFileTree(tree)
      selectPdf(downloadResult.relativePdfPath)
      setInfo(downloadInfo(downloadResult) ?? t('sidebar.remarkable.openedPdf'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.openPdfError'))
    } finally {
      setOpeningDocumentId(null)
    }
  }, [bumpPdfRevision, downloadInfo, findExistingImport, selectPdf, setFileTree, t, updateExistingImport, vaultPath])

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
      const status = await invokePlugin<ReMarkableUsbCheckResult>('remarkable', 'remarkable.usbCheck')
      if (!status.connected) {
        throw new Error(status.error || t('sidebar.remarkable.disconnected'))
      }

      const result = await invokePlugin<ReMarkableUploadResult>('remarkable', 'remarkable.upload', {
        relativePdfPath: exportCandidatePath
      })
      if (!result.success) {
        throw new Error(result.error || t('sidebar.remarkable.exportPdfError'))
      }

      setLastExportMode('direct')
      setLastExportDetail('Original PDF upload')
      setInfo(t('sidebar.remarkable.exportedPdf'))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.exportPdfError'))
    } finally {
      setIsExportingSelectedPdf(false)
    }
  }, [exportCandidatePath, refresh, t, vaultPath])

  const optimizeAndExportSelectedPdfToRemarkable = useCallback(async () => {
    if (!vaultPath) {
      setError(t('sidebar.remarkable.noVault'))
      return
    }

    if (!exportCandidatePath) {
      setError(t('sidebar.remarkable.noPdfSelected'))
      return
    }

    setIsOptimizingAndExporting(true)
    setError(null)
    setInfo(t('remarkable.optimizingPdf'))

    try {
      const status = await invokePlugin<ReMarkableUsbCheckResult>('remarkable', 'remarkable.usbCheck')
      if (!status.connected) {
        throw new Error(status.error || t('sidebar.remarkable.disconnected'))
      }

      const optimizeResult = await invokePlugin<ReMarkableOptimizeResult>('remarkable', 'remarkable.optimize', {
        relativePdfPath: exportCandidatePath
      })
      if (!optimizeResult.success || !optimizeResult.relativePdfPath) {
        throw new Error(optimizeResult.error || t('remarkable.optimizeFailed'))
      }

      const uploadResult = await invokePlugin<ReMarkableUploadResult>('remarkable', 'remarkable.upload', {
        relativePdfPath: optimizeResult.relativePdfPath
      })
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || t('sidebar.remarkable.exportPdfError'))
      }

      const methodText = optimizeResult.method === 'ghostscript'
        ? 'Ghostscript'
        : optimizeResult.method === 'qpdf'
          ? 'qpdf'
          : t('remarkable.originalFormat')
      const originalKb = optimizeResult.originalSize ? Math.round(optimizeResult.originalSize / 1024) : null
      const optimizedKb = optimizeResult.optimizedSize ? Math.round(optimizeResult.optimizedSize / 1024) : null
      const sizeText = (originalKb !== null && optimizedKb !== null)
        ? ` (${originalKb} KB -> ${optimizedKb} KB)`
        : ''

      setLastExportMode('optimize+export')
      setLastExportDetail(methodText)
      setInfo(`${t('remarkable.exportSuccess', { method: methodText })}${sizeText}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.exportPdfError'))
    } finally {
      setIsOptimizingAndExporting(false)
    }
  }, [exportCandidatePath, refresh, t, vaultPath])

  const bookifyAndExportSelectedPdfToRemarkable = useCallback(async () => {
    if (!vaultPath) {
      setError(t('sidebar.remarkable.noVault'))
      return
    }
    if (!exportCandidatePath) {
      setError(t('sidebar.remarkable.noPdfSelected'))
      return
    }

    setIsBookifyingAndExporting(true)
    setError(null)
    setInfo(t('remarkable.bookifying'))

    try {
      const status = await invokePlugin<ReMarkableUsbCheckResult>('remarkable', 'remarkable.usbCheck')
      if (!status.connected) {
        throw new Error(status.error || t('sidebar.remarkable.disconnected'))
      }

      const bookifyResult = await invokePlugin<ReMarkableBookifyResult>('remarkable', 'remarkable.bookify', {
        relativePdfPath: exportCandidatePath
      })
      if (!bookifyResult.success || !bookifyResult.relativePdfPath) {
        throw new Error(bookifyResult.error || t('remarkable.bookifyFailed'))
      }

      const uploadResult = await invokePlugin<ReMarkableUploadResult>('remarkable', 'remarkable.upload', {
        relativePdfPath: bookifyResult.relativePdfPath
      })
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || t('sidebar.remarkable.exportPdfError'))
      }

      setLastExportMode('bookify+export')
      setLastExportDetail(`reflow ${bookifyResult.sourcePages ?? '?'}p`)
      setInfo(t('remarkable.bookifySuccess'))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.remarkable.exportPdfError'))
    } finally {
      setIsBookifyingAndExporting(false)
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
        <div className="remarkable-title">
          <img src={remarkableLogo} alt="reMarkable" className="remarkable-logo" />
          <span>reMarkable</span>
        </div>
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

      <div className="remarkable-debug">
        <button className="remarkable-debug-toggle" onClick={() => setDebugOpen((prev) => !prev)}>
          {debugOpen ? t('remarkable.debugHide') : t('remarkable.debugShow')}
        </button>
        {debugOpen && (
          <div className="remarkable-debug-content">
            <div>Vendor: {usbDebugInfo?.vendorName || 'n/a'}</div>
            <div>Product: {usbDebugInfo?.productName || 'n/a'}</div>
            <div>
              USB IDs: {usbDebugInfo?.vendorIdHex || 'n/a'} / {usbDebugInfo?.productIdHex || 'n/a'}
              {(usbDebugInfo?.vendorId || usbDebugInfo?.productId)
                ? ` (${usbDebugInfo?.vendorId ?? 'n/a'} / ${usbDebugInfo?.productId ?? 'n/a'})`
                : ''}
            </div>
            <div>Connected: {isConnected ? 'yes' : 'no'}</div>
            <div>Last export mode: {lastExportMode}</div>
            <div>Last export detail: {lastExportDetail}</div>
            {error && <div>Last error: {error}</div>}
          </div>
        )}
      </div>

      {isConnected && (
        <>
          <div className="remarkable-export-row">
            <button
              className="remarkable-export-btn"
              onClick={exportSelectedPdfToRemarkable}
              disabled={isExportingSelectedPdf || isOptimizingAndExporting || isBookifyingAndExporting || !exportCandidatePath}
              title={t('sidebar.remarkable.exportPdfAction')}
            >
              {isExportingSelectedPdf ? t('sidebar.remarkable.exporting') : t('sidebar.remarkable.exportPdfAction')}
            </button>
            <button
              className="remarkable-export-btn remarkable-export-optimize-btn"
              onClick={optimizeAndExportSelectedPdfToRemarkable}
              disabled={isExportingSelectedPdf || isOptimizingAndExporting || isBookifyingAndExporting || !exportCandidatePath}
              title={t('remarkable.optimizeExportTitle')}
            >
              {isOptimizingAndExporting ? t('remarkable.optimizing') : t('remarkable.optimizeExport')}
            </button>
            <button
              className="remarkable-export-btn remarkable-export-bookify-btn"
              onClick={bookifyAndExportSelectedPdfToRemarkable}
              disabled={isExportingSelectedPdf || isOptimizingAndExporting || isBookifyingAndExporting || !exportCandidatePath}
              title={t('remarkable.bookifyExportTitle')}
            >
              {isBookifyingAndExporting ? t('remarkable.bookifying') : t('remarkable.bookifyExport')}
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

export default RemarkablePanel
