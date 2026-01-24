import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// PDF.js Worker lokal aus node_modules laden (für Electron CSP)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface PDFViewerProps {
  filePath: string  // Absoluter Pfad zur PDF-Datei
  fileName: string  // Dateiname für Anzeige
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ filePath, fileName }) => {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.0)
  const [error, setError] = useState<string | null>(null)
  const [pdfData, setPdfData] = useState<string | null>(null)  // Base64 data URL
  const [loading, setLoading] = useState<boolean>(true)

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

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-header">
        <span className="pdf-viewer-title">{fileName}</span>
        <div className="pdf-viewer-controls">
          <div className="pdf-viewer-zoom">
            <button onClick={zoomOut} title="Verkleinern" disabled={scale <= 0.5}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <span className="pdf-viewer-zoom-level">{Math.round(scale * 100)}%</span>
            <button onClick={zoomIn} title="Vergrößern" disabled={scale >= 3.0}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button onClick={resetZoom} title="Zurücksetzen" className="pdf-viewer-reset">
              100%
            </button>
          </div>
          <div className="pdf-viewer-pagination">
            <button onClick={goToPrevPage} disabled={currentPage <= 1} title="Vorherige Seite">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className="pdf-viewer-page-info">
              {currentPage} / {numPages || '?'}
            </span>
            <button onClick={goToNextPage} disabled={currentPage >= numPages} title="Nächste Seite">
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
