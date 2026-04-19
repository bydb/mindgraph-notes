import React, { useState, useCallback, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { generateNoteId } from '../../utils/linkExtractor'

// PDF.js Worker lokal aus node_modules laden (für Electron CSP)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface PDFViewerProps {
  filePath: string  // Absoluter Pfad zur PDF-Datei
  fileName: string  // Dateiname für Anzeige
  relativePath?: string  // Relativer Pfad zur Vault-Root
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ filePath, fileName, relativePath }) => {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.0)
  const [error, setError] = useState<string | null>(null)
  const [pdfData, setPdfData] = useState<string | null>(null)  // Base64 data URL
  const [loading, setLoading] = useState<boolean>(true)

  // Docling extraction state
  const [extracting, setExtracting] = useState<boolean>(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractSuccess, setExtractSuccess] = useState<boolean>(false)

  // Vision OCR extraction state
  const [visionExtracting, setVisionExtracting] = useState<boolean>(false)
  const [visionError, setVisionError] = useState<string | null>(null)
  const [visionSuccess, setVisionSuccess] = useState<boolean>(false)
  const [visionProgress, setVisionProgress] = useState<{ current: number; total: number } | null>(null)

  const { docling, visionOcr, setTextSplitEnabled } = useUIStore()
  const { vaultPath, addNote, selectSecondaryNote } = useNotesStore()
  const { t } = useTranslation()

  // PDF über IPC laden (als Base64)
  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      setPdfData(null)

      try {
        const base64 = await window.electronAPI.readFileBinary(filePath)
        // Erstelle Data URL für react-pdf
        const dataUrl = `data:application/pdf;base64,${base64}`
        setPdfData(dataUrl)
      } catch (err) {
        console.error('PDF Load Error:', err)
        setError(`Fehler beim Laden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`)
      } finally {
        setLoading(false)
      }
    }

    loadPdf()
  }, [filePath])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setCurrentPage(1)
    setError(null)
  }, [])

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF Document Load Error:', error)
    setError(`Fehler beim Verarbeiten: ${error.message}`)
  }, [])

  const goToPrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1))
  }

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, numPages))
  }

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3.0))
  }

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5))
  }

  const resetZoom = () => {
    setScale(1.0)
  }

  // Docling: Extract PDF content to Companion Note
  const handleExtractContent = async () => {
    if (!vaultPath || !docling.enabled) return

    setExtracting(true)
    setExtractError(null)
    setExtractSuccess(false)

    try {
      // 1. Check if Docling is available
      const checkResult = await window.electronAPI.doclingCheck(docling.url)
      if (!checkResult.available) {
        setExtractError(t('docling.notAvailable'))
        setExtracting(false)
        return
      }

      // 2. Convert PDF to Markdown via Docling API
      const convertResult = await window.electronAPI.doclingConvertPdf(
        filePath,
        docling.url,
        {
          ocrEnabled: docling.ocrEnabled,
          ocrLanguages: docling.ocrLanguages
        }
      )

      if (!convertResult.success || !convertResult.content) {
        setExtractError(convertResult.error || t('docling.extractionFailed'))
        setExtracting(false)
        return
      }

      // 3. Ensure PDF Companion note exists
      const pdfRelativePath = relativePath || fileName
      const companionResult = await window.electronAPI.ensurePdfCompanion(pdfRelativePath, vaultPath)

      // 4. Read current companion content and append extracted content
      const companionFullPath = `${vaultPath}/${companionResult.path}`
      let companionContent = companionResult.content

      // Check if extracted content section already exists
      const extractedSectionMarker = '## Extrahierter Inhalt'
      const extractedSectionMarkerEn = '## Extracted Content'

      if (companionContent.includes(extractedSectionMarker) || companionContent.includes(extractedSectionMarkerEn)) {
        // Replace existing extracted content
        const markerToUse = companionContent.includes(extractedSectionMarker) ? extractedSectionMarker : extractedSectionMarkerEn
        const markerIndex = companionContent.indexOf(markerToUse)
        companionContent = companionContent.slice(0, markerIndex)
      }

      // Add extracted content section
      const sectionHeader = t('docling.extractedContentHeader')
      const timestamp = new Date().toLocaleString()
      const newContent = `${companionContent.trimEnd()}\n\n## ${sectionHeader}\n\n> ${t('docling.extractedOn')} ${timestamp}\n\n${convertResult.content}\n`

      // 5. Write updated companion content
      await window.electronAPI.writeFile(companionFullPath, newContent)

      // 6. Update note in store and select it
      const noteId = generateNoteId(companionResult.path)

      // Reload the file to update the note store
      const updatedContent = await window.electronAPI.readFile(companionFullPath)
      const stats = await window.electronAPI.getFileStats(companionFullPath)

      // Import link extractor functions
      const { extractLinks, extractTags, extractTitle, extractHeadings, extractBlocks } = await import('../../utils/linkExtractor')

      const updatedNote = {
        id: noteId,
        path: companionResult.path,
        title: extractTitle(updatedContent, companionResult.path.split('/').pop() || ''),
        content: updatedContent,
        outgoingLinks: extractLinks(updatedContent),
        incomingLinks: [],
        tags: extractTags(updatedContent),
        headings: extractHeadings(updatedContent),
        blocks: extractBlocks(updatedContent),
        sourcePdf: pdfRelativePath,
        createdAt: stats.createdAt,
        modifiedAt: stats.modifiedAt
      }

      addNote(updatedNote)

      // Enable text split and show companion in secondary panel
      // so user can see both PDF and extracted content
      setTextSplitEnabled(true)
      selectSecondaryNote(noteId)

      setExtractSuccess(true)
      setTimeout(() => setExtractSuccess(false), 3000)
    } catch (err) {
      console.error('Docling extraction error:', err)
      setExtractError(err instanceof Error ? err.message : t('docling.unknownError'))
    } finally {
      setExtracting(false)
    }
  }

  // Vision OCR: Extract PDF content via Ollama Vision Model
  const handleVisionOcrExtract = async () => {
    if (!vaultPath || !visionOcr.enabled || !visionOcr.model || !pdfData) return

    setVisionExtracting(true)
    setVisionError(null)
    setVisionSuccess(false)
    setVisionProgress(null)

    try {
      // 1. Load PDF document for rendering pages (use raw binary, not data URL)
      const base64Pdf = await window.electronAPI.readFileBinary(filePath)
      const binaryStr = atob(base64Pdf)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      const pdfDoc = await pdfjs.getDocument({ data: bytes }).promise
      const totalPages = pdfDoc.numPages
      const pageMarkdowns: string[] = []

      // 2. Render each page and send to Ollama
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setVisionProgress({ current: pageNum, total: totalPages })

        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0 })
        const renderScale = visionOcr.pageWidth / viewport.width
        const scaledViewport = page.getViewport({ scale: renderScale })

        // Render to off-screen canvas
        const canvas = document.createElement('canvas')
        canvas.width = scaledViewport.width
        canvas.height = scaledViewport.height
        const ctx = canvas.getContext('2d')!

        await page.render({ canvasContext: ctx, viewport: scaledViewport, canvas }).promise

        // Get base64 image (strip data URL prefix for Ollama)
        const base64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')

        // Send to main process → Ollama
        const result = await window.electronAPI.visionOcrExtractPage(base64, visionOcr.model, pageNum)

        if (result.success && result.content) {
          pageMarkdowns.push(result.content)
        }

        canvas.remove()
      }

      pdfDoc.destroy()

      if (pageMarkdowns.length === 0) {
        setVisionError('Keine Inhalte extrahiert')
        setVisionExtracting(false)
        return
      }

      const combinedContent = pageMarkdowns.join('\n\n---\n\n')

      // 3. Write to companion note (same pattern as Docling)
      const pdfRelativePath = relativePath || fileName
      const companionResult = await window.electronAPI.ensurePdfCompanion(pdfRelativePath, vaultPath)
      const companionFullPath = `${vaultPath}/${companionResult.path}`
      let companionContent = companionResult.content

      const sectionMarker = '## Vision OCR Inhalt'
      const sectionMarkerEn = '## Vision OCR Content'

      if (companionContent.includes(sectionMarker) || companionContent.includes(sectionMarkerEn)) {
        const markerToUse = companionContent.includes(sectionMarker) ? sectionMarker : sectionMarkerEn
        const markerIndex = companionContent.indexOf(markerToUse)
        companionContent = companionContent.slice(0, markerIndex)
      }

      const sectionHeader = t('visionOcr.extractedContentHeader')
      const timestamp = new Date().toLocaleString()
      const newContent = `${companionContent.trimEnd()}\n\n## ${sectionHeader}\n\n> ${t('visionOcr.extractedOn')} ${timestamp} · ${visionOcr.model}\n\n${combinedContent}\n`

      await window.electronAPI.writeFile(companionFullPath, newContent)

      // 4. Update note store
      const noteId = generateNoteId(companionResult.path)
      const updatedContent = await window.electronAPI.readFile(companionFullPath)
      const stats = await window.electronAPI.getFileStats(companionFullPath)
      const { extractLinks, extractTags, extractTitle, extractHeadings, extractBlocks } = await import('../../utils/linkExtractor')

      addNote({
        id: noteId,
        path: companionResult.path,
        title: extractTitle(updatedContent, companionResult.path.split('/').pop() || ''),
        content: updatedContent,
        outgoingLinks: extractLinks(updatedContent),
        incomingLinks: [],
        tags: extractTags(updatedContent),
        headings: extractHeadings(updatedContent),
        blocks: extractBlocks(updatedContent),
        sourcePdf: pdfRelativePath,
        createdAt: stats.createdAt,
        modifiedAt: stats.modifiedAt
      })

      setTextSplitEnabled(true)
      selectSecondaryNote(noteId)
      setVisionSuccess(true)
      setTimeout(() => setVisionSuccess(false), 3000)
    } catch (err) {
      console.error('Vision OCR extraction error:', err)
      setVisionError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setVisionExtracting(false)
      setVisionProgress(null)
    }
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-header">
        <span className="pdf-viewer-title">{fileName}</span>
        <div className="pdf-viewer-controls">
          {/* Docling Extract Button */}
          {docling.enabled && (
            <div className="pdf-viewer-extract">
              <button
                className={`pdf-viewer-extract-btn ${extracting ? 'extracting' : ''} ${extractSuccess ? 'success' : ''}`}
                onClick={handleExtractContent}
                disabled={extracting || !vaultPath}
                title={t('docling.extractTooltip')}
              >
                {extracting ? (
                  <>
                    <svg className="pdf-viewer-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="7" strokeLinecap="round"/>
                    </svg>
                    <span>{t('docling.extracting')}</span>
                  </>
                ) : extractSuccess ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>{t('docling.extracted')}</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 11V14H14V11M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>{t('docling.extract')}</span>
                  </>
                )}
              </button>
              {extractError && (
                <span className="pdf-viewer-extract-error" title={extractError}>
                  {t('docling.error')}
                </span>
              )}
            </div>
          )}

          {/* Vision OCR Button */}
          {visionOcr.enabled && (
            <div className="pdf-viewer-extract">
              <button
                className={`pdf-viewer-extract-btn ${visionExtracting ? 'extracting' : ''} ${visionSuccess ? 'success' : ''}`}
                onClick={handleVisionOcrExtract}
                disabled={visionExtracting || !vaultPath || !visionOcr.model}
                title={t('visionOcr.extractTooltip')}
              >
                {visionExtracting ? (
                  <>
                    <svg className="pdf-viewer-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="7" strokeLinecap="round"/>
                    </svg>
                    <span>
                      {visionProgress
                        ? `${visionProgress.current}/${visionProgress.total}`
                        : t('visionOcr.extracting')}
                    </span>
                  </>
                ) : visionSuccess ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>{t('visionOcr.extracted')}</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                    <span>{t('visionOcr.extract')}</span>
                  </>
                )}
              </button>
              {visionError && (
                <span className="pdf-viewer-extract-error" title={visionError}>
                  {t('visionOcr.error')}
                </span>
              )}
            </div>
          )}

          <div className="pdf-viewer-zoom">
            <button onClick={zoomOut} title={t('pdf.zoomOut')} disabled={scale <= 0.5}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <span className="pdf-viewer-zoom-level">{Math.round(scale * 100)}%</span>
            <button onClick={zoomIn} title={t('pdf.zoomIn')} disabled={scale >= 3.0}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button onClick={resetZoom} title={t('pdf.reset')} className="pdf-viewer-reset">
              100%
            </button>
          </div>
          <div className="pdf-viewer-pagination">
            <button onClick={goToPrevPage} disabled={currentPage <= 1} title={t('pdf.prevPage')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className="pdf-viewer-page-info">
              {currentPage} / {numPages || '?'}
            </span>
            <button onClick={goToNextPage} disabled={currentPage >= numPages} title={t('pdf.nextPage')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="pdf-viewer-content">
        {loading ? (
          <div className="pdf-viewer-loading">
            <div className="pdf-viewer-spinner"></div>
            <p>PDF wird geladen...</p>
          </div>
        ) : error ? (
          <div className="pdf-viewer-error">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" stroke="var(--text-error, #e53935)" strokeWidth="2"/>
              <path d="M24 14V26M24 32V34" stroke="var(--text-error, #e53935)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p>{error}</p>
          </div>
        ) : pdfData ? (
          <Document
            file={pdfData}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="pdf-viewer-loading">
                <div className="pdf-viewer-spinner"></div>
                <p>PDF wird verarbeitet...</p>
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
        ) : null}
      </div>
    </div>
  )
}

export default PDFViewer
