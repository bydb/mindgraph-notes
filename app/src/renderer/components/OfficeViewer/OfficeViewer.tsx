import React, { useEffect, useState, useCallback } from 'react'
import type { ExcelData, WordData, PowerPointData } from '../../../shared/types'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { sanitizeHtml } from '../../utils/sanitize'
import './OfficeViewer.css'

type OfficeType = 'excel' | 'word' | 'powerpoint'

interface OfficeViewerProps {
  filePath: string       // Absoluter Pfad
  fileName: string
  relativePath: string   // Relativ zur Vault
  type: OfficeType
}

export const OfficeViewer: React.FC<OfficeViewerProps> = (props) => {
  if (props.type === 'excel') return <ExcelViewer {...props} />
  if (props.type === 'word') return <WordViewer {...props} />
  return <PowerPointViewer {...props} />
}

// ===== Excel =====

const ExcelViewer: React.FC<OfficeViewerProps> = ({ filePath, fileName, relativePath }) => {
  const [data, setData] = useState<ExcelData | null>(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const { vaultPath, selectedNoteId, notes, updateNote } = useNotesStore()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    setActiveSheet(0)
    window.electronAPI.officeParseExcel(filePath).then((res) => {
      if (cancelled) return
      if (res.success && res.data) setData(res.data)
      else setError(res.error || 'Excel-Datei konnte nicht gelesen werden')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [filePath])

  const sheet = data?.sheets[activeSheet]

  const insertIntoActiveNote = useCallback(async () => {
    if (!sheet || !vaultPath) return
    const activeNote = notes.find((n) => n.id === selectedNoteId)
    if (!activeNote) {
      alert('Keine aktive Notiz ausgewählt. Bitte öffne zuerst eine Notiz.')
      return
    }
    setBusy(true)
    try {
      const res = await window.electronAPI.officeExcelToMarkdown(filePath, sheet.name)
      if (!res.success || !res.markdown) {
        alert(res.error || 'Konvertierung fehlgeschlagen')
        return
      }
      const newContent = activeNote.content + '\n\n' + res.markdown + '\n'
      const notePath = `${vaultPath}/${activeNote.path}`
      await window.electronAPI.writeFile(notePath, newContent)
      updateNote(activeNote.id, { content: newContent })
    } finally {
      setBusy(false)
    }
  }, [sheet, vaultPath, notes, selectedNoteId, filePath, updateNote])

  const copyMarkdown = useCallback(async () => {
    if (!sheet) return
    const res = await window.electronAPI.officeExcelToMarkdown(filePath, sheet.name)
    if (res.success && res.markdown) {
      await navigator.clipboard.writeText(res.markdown)
    }
  }, [sheet, filePath])

  return (
    <div className="office-viewer">
      <div className="office-viewer-header">
        <div className="office-viewer-title">
          <span>📊</span>
          <span title={relativePath}>{fileName}</span>
        </div>
        <div className="office-viewer-actions">
          <button className="office-action-btn" onClick={copyMarkdown} disabled={!sheet || busy}>Als Markdown kopieren</button>
          <button className="office-action-btn primary" onClick={insertIntoActiveNote} disabled={!sheet || busy}>In aktive Notiz einfügen</button>
        </div>
      </div>

      {data && data.sheets.length > 1 && (
        <div className="excel-sheet-tabs">
          {data.sheets.map((s, i) => (
            <button key={s.name + i} className={`excel-sheet-tab ${i === activeSheet ? 'active' : ''}`} onClick={() => setActiveSheet(i)}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="office-viewer-body">
        {loading && <div className="office-loading">Lade Excel-Datei…</div>}
        {error && <div className="office-error">⚠️ {error}</div>}
        {sheet && !loading && (
          <div className="excel-table-wrapper">
            <table className="excel-table">
              {sheet.rows.length > 0 && (
                <thead>
                  <tr>
                    {sheet.rows[0].map((cell, i) => (
                      <th key={i} title={cell}>{cell}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {sheet.rows.slice(1).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} title={cell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ===== Word =====

const WordViewer: React.FC<OfficeViewerProps> = ({ filePath, fileName, relativePath }) => {
  const [data, setData] = useState<WordData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const { vaultPath, setFileTree, selectNote, addNote } = useNotesStore()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    window.electronAPI.officeParseDocx(filePath).then((res) => {
      if (cancelled) return
      if (res.success && res.data) setData(res.data)
      else setError(res.error || 'Word-Dokument konnte nicht gelesen werden')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [filePath])

  const importAsNote = useCallback(async () => {
    if (!vaultPath) return
    setBusy(true)
    setImportMsg(null)
    try {
      const sourceDir = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : ''
      const res = await window.electronAPI.officeImportDocx(vaultPath, filePath, sourceDir || undefined)
      if (res.success && res.relativePath) {
        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
        const fullPath = `${vaultPath}/${res.relativePath}`
        const content = await window.electronAPI.readFile(fullPath)
        const note = await createNoteFromFile(fullPath, res.relativePath, content || '')
        addNote(note)
        selectNote(note.id)
        setImportMsg(`Importiert: ${res.relativePath}`)
      } else {
        setImportMsg(res.error || 'Import fehlgeschlagen')
      }
    } finally {
      setBusy(false)
    }
  }, [vaultPath, filePath, setFileTree, selectNote, addNote])

  return (
    <div className="office-viewer">
      <div className="office-viewer-header">
        <div className="office-viewer-title">
          <span>📝</span>
          <span title={relativePath}>{fileName}</span>
        </div>
        <div className="office-viewer-actions">
          <button className="office-action-btn primary" onClick={importAsNote} disabled={busy || !vaultPath}>Als Notiz importieren</button>
        </div>
      </div>
      <div className="office-viewer-body">
        {loading && <div className="office-loading">Lade Word-Dokument…</div>}
        {error && <div className="office-error">⚠️ {error}</div>}
        {importMsg && <div className="office-loading">{importMsg}</div>}
        {data && !loading && (
          <div className="word-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.html) }} />
        )}
      </div>
    </div>
  )
}

// ===== PowerPoint =====

const PowerPointViewer: React.FC<OfficeViewerProps> = ({ filePath, fileName, relativePath }) => {
  const [data, setData] = useState<PowerPointData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [slideIdx, setSlideIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const { vaultPath, setFileTree, selectNote, addNote } = useNotesStore()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    setSlideIdx(0)
    window.electronAPI.officeParsePptx(filePath).then((res) => {
      if (cancelled) return
      if (res.success && res.data) setData(res.data)
      else setError(res.error || 'PowerPoint-Datei konnte nicht gelesen werden')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [filePath])

  const importAsNote = useCallback(async () => {
    if (!vaultPath) return
    setBusy(true)
    setImportMsg(null)
    try {
      const sourceDir = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : ''
      const res = await window.electronAPI.officeImportPptx(vaultPath, filePath, sourceDir || undefined)
      if (res.success && res.relativePath) {
        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
        const fullPath = `${vaultPath}/${res.relativePath}`
        const content = await window.electronAPI.readFile(fullPath)
        const note = await createNoteFromFile(fullPath, res.relativePath, content || '')
        addNote(note)
        selectNote(note.id)
        setImportMsg(`Importiert: ${res.relativePath}`)
      } else {
        setImportMsg(res.error || 'Import fehlgeschlagen')
      }
    } finally {
      setBusy(false)
    }
  }, [vaultPath, filePath, setFileTree, selectNote, addNote])

  const slide = data?.slides[slideIdx]
  const total = data?.slides.length || 0

  return (
    <div className="office-viewer">
      <div className="office-viewer-header">
        <div className="office-viewer-title">
          <span>📽️</span>
          <span title={relativePath}>{fileName}</span>
        </div>
        <div className="office-viewer-actions">
          <button className="office-action-btn primary" onClick={importAsNote} disabled={busy || !vaultPath}>Als Slides-Notiz importieren</button>
        </div>
      </div>
      {data && total > 0 && (
        <div className="pptx-nav">
          <button className="office-action-btn" onClick={() => setSlideIdx((i) => Math.max(0, i - 1))} disabled={slideIdx === 0}>←</button>
          <span>Slide {slideIdx + 1} / {total}</span>
          <button className="office-action-btn" onClick={() => setSlideIdx((i) => Math.min(total - 1, i + 1))} disabled={slideIdx >= total - 1}>→</button>
        </div>
      )}
      <div className="office-viewer-body">
        {loading && <div className="office-loading">Lade PowerPoint-Datei…</div>}
        {error && <div className="office-error">⚠️ {error}</div>}
        {importMsg && <div className="office-loading">{importMsg}</div>}
        {slide && !loading && (
          <div className="pptx-slide">
            <h2>{slide.title}</h2>
            {slide.text && <div className="pptx-slide-text">{slide.text}</div>}
            {slide.images.length > 0 && (
              <div className="pptx-slide-images">
                {slide.images.map((img, i) => (
                  <img key={i} src={img.dataUrl} alt={img.name} />
                ))}
              </div>
            )}
            {slide.notes && <div className="pptx-slide-notes">{slide.notes}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
