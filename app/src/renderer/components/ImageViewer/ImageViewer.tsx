import React, { useState, useEffect, useCallback } from 'react'
import { sanitizeSvg } from '../../utils/sanitize'
import './ImageViewer.css'

interface ImageViewerProps {
  filePath: string
  fileName: string
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ filePath, fileName }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [isLoading, setIsLoading] = useState(true)

  const isSvg = filePath.toLowerCase().endsWith('.svg')

  // Bild laden
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setImageSrc(null)
    setSvgContent(null)

    const loadImage = async () => {
      try {
        if (isSvg) {
          // SVGs inline laden für korrekte Darstellung
          const content = await window.electronAPI.readFile(filePath)
          if (cancelled) return
          if (content) {
            setSvgContent(content)
          } else {
            setError('SVG konnte nicht geladen werden')
          }
        } else {
          const result = await window.electronAPI.readImageAsDataUrl(filePath)
          if (cancelled) return

          if (result.success && result.dataUrl) {
            setImageSrc(result.dataUrl)
          } else {
            setError(result.error || 'Bild konnte nicht geladen werden')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadImage()

    return () => {
      cancelled = true
    }
  }, [filePath, isSvg])

  // Zoom-Funktionen
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 25, 400))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 25, 25))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(100)
  }, [])

  const handleZoomFit = useCallback(() => {
    setZoom(100) // Fit wird über CSS "contain" gesteuert
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        handleZoomIn()
      } else if (e.key === '-') {
        e.preventDefault()
        handleZoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        handleZoomReset()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleZoomIn, handleZoomOut, handleZoomReset])

  return (
    <div className="image-viewer">
      <div className="image-viewer-header">
        <div className="image-viewer-title">
          <span className="image-icon">🖼️</span>
          <span className="image-name" title={filePath}>{fileName}</span>
        </div>
        <div className="image-viewer-controls">
          <button
            className="image-control-btn"
            onClick={handleZoomOut}
            title="Verkleinern (-)"
            disabled={zoom <= 25}
          >
            −
          </button>
          <span className="zoom-level">{zoom}%</span>
          <button
            className="image-control-btn"
            onClick={handleZoomIn}
            title="Vergrößern (+)"
            disabled={zoom >= 400}
          >
            +
          </button>
          <button
            className="image-control-btn"
            onClick={handleZoomReset}
            title="Originalgröße (0)"
          >
            1:1
          </button>
          <button
            className="image-control-btn"
            onClick={handleZoomFit}
            title="An Fenster anpassen"
          >
            ⬜
          </button>
        </div>
      </div>

      <div className="image-viewer-content">
        {isLoading && (
          <div className="image-loading">
            <div className="loading-spinner" />
            <span>Lade Bild...</span>
          </div>
        )}

        {error && (
          <div className="image-error">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {imageSrc && !isLoading && !error && (
          <div className="image-container" style={{ transform: `scale(${zoom / 100})` }}>
            <img
              src={imageSrc}
              alt={fileName}
              className="image-content"
              draggable={false}
            />
          </div>
        )}

        {svgContent && !isLoading && !error && (
          <div
            className="image-container svg-container"
            style={{ transform: `scale(${zoom / 100})` }}
            dangerouslySetInnerHTML={{ __html: sanitizeSvg(svgContent) }}
          />
        )}
      </div>
    </div>
  )
}
