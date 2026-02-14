import React, { memo, useState, useRef, useEffect } from 'react'
import type { EditorView } from '@codemirror/view'
import { useTranslation } from '../../utils/translations'

interface FormattingToolbarProps {
  onFormat: (type: string) => void
  viewRef: React.RefObject<EditorView | null>
}

const svgProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const FormattingToolbar: React.FC<FormattingToolbarProps> = memo(({ onFormat, viewRef }) => {
  const { t } = useTranslation()
  const [headingOpen, setHeadingOpen] = useState(false)
  const headingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!headingOpen) return
    const handleClick = (e: MouseEvent) => {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) {
        setHeadingOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [headingOpen])

  const handleFormat = (type: string) => {
    onFormat(type)
    viewRef.current?.focus()
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  return (
    <div className="formatting-toolbar" onMouseDown={handleMouseDown}>
      {/* Inline formatting */}
      <div className="formatting-group">
        <button
          className="formatting-btn"
          onClick={() => handleFormat('bold')}
          title={`${t('format.bold')} (Cmd+B)`}
        >
          <svg {...svgProps}><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
        </button>
        <button
          className="formatting-btn"
          onClick={() => handleFormat('italic')}
          title={`${t('format.italic')} (Cmd+I)`}
        >
          <svg {...svgProps}><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
        </button>
        <button
          className="formatting-btn"
          onClick={() => handleFormat('strikethrough')}
          title={t('format.strikethrough')}
        >
          <svg {...svgProps}><line x1="4" y1="12" x2="20" y2="12"/><path d="M16 4c-1.5 0-3 .5-3 2 0 3 6 3 6 6 0 1.5-1.5 2-3 2"/><path d="M8 20c1.5 0 3-.5 3-2 0-3-6-3-6-6 0-1.5 1.5-2 3-2"/></svg>
        </button>
        <button
          className="formatting-btn"
          onClick={() => handleFormat('code')}
          title={`${t('format.code')} (Cmd+\`)`}
        >
          <svg {...svgProps}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
      </div>

      <div className="formatting-separator" />

      {/* Headings dropdown */}
      <div className="formatting-group" ref={headingRef} style={{ position: 'relative' }}>
        <button
          className="formatting-btn formatting-btn-wide"
          onClick={() => setHeadingOpen(!headingOpen)}
          title={t('toolbar.heading')}
        >
          <svg {...svgProps}><path d="M4 4v16"/><path d="M20 4v16"/><path d="M4 12h16"/></svg>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginLeft: 2 }}>
            <path d="M2 3l2 2 2-2"/>
          </svg>
        </button>
        {headingOpen && (
          <div className="formatting-dropdown">
            <button className="formatting-dropdown-item" onClick={() => { handleFormat('heading1'); setHeadingOpen(false) }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>H1</span>
              <span className="formatting-dropdown-label">{t('format.heading1')}</span>
            </button>
            <button className="formatting-dropdown-item" onClick={() => { handleFormat('heading2'); setHeadingOpen(false) }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>H2</span>
              <span className="formatting-dropdown-label">{t('format.heading2')}</span>
            </button>
            <button className="formatting-dropdown-item" onClick={() => { handleFormat('heading3'); setHeadingOpen(false) }}>
              <span style={{ fontWeight: 700, fontSize: 12 }}>H3</span>
              <span className="formatting-dropdown-label">{t('format.heading3')}</span>
            </button>
          </div>
        )}
      </div>

      <div className="formatting-separator" />

      {/* Block formatting */}
      <div className="formatting-group">
        <button
          className="formatting-btn"
          onClick={() => handleFormat('bulletList')}
          title={t('toolbar.bulletList')}
        >
          <svg {...svgProps}><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
        </button>
        <button
          className="formatting-btn"
          onClick={() => handleFormat('numberedList')}
          title={t('toolbar.numberedList')}
        >
          <svg {...svgProps}><line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><text x="4" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="4" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="4" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>
        </button>
        <button
          className="formatting-btn"
          onClick={() => handleFormat('task')}
          title={t('format.task')}
        >
          <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 12l2 2 4-4"/></svg>
        </button>
      </div>

      <div className="formatting-separator" />

      {/* Insert */}
      <div className="formatting-group">
        <button
          className="formatting-btn"
          onClick={() => handleFormat('quote')}
          title={t('format.quote')}
        >
          <svg {...svgProps}><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>
        </button>
        <button
          className="formatting-btn"
          onClick={() => handleFormat('link')}
          title={`${t('format.link')} (Cmd+K)`}
        >
          <svg {...svgProps}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </button>
        <button
          className="formatting-btn"
          onClick={() => handleFormat('horizontalRule')}
          title={t('toolbar.horizontalRule')}
        >
          <svg {...svgProps}><line x1="2" y1="12" x2="22" y2="12"/></svg>
        </button>
      </div>
    </div>
  )
})

FormattingToolbar.displayName = 'FormattingToolbar'
