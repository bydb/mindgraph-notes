import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEmailStore } from '../../stores/emailStore'
import { useTranslation } from '../../utils/translations'
import { ComposeView } from './ComposeView'

/**
 * Schreibfenster für E-Mails — schwebt über der App, sperrt sie aber nicht.
 *
 * Vorher (bis 11/2026) lag eine Abdeckung über der ganzen App: Solange eine Mail
 * offen war, ließ sich nichts im Petrol-Chat oder Notiz-Agenten markieren und
 * kopieren. Jetzt fängt nur das Fenster selbst Klicks; es lässt sich verschieben,
 * in der Größe ändern und unten rechts zu einer Leiste verkleinern.
 *
 * Hängt an der App, nicht am Inbox-Panel: Ein Panelwechsel (Aufgaben, Tags, …)
 * baute das Panel samt Fenster ab, der Entwurf blieb unsichtbar im Store liegen.
 * Beim Verkleinern bleibt ComposeView gemountet (nur ausgeblendet), damit halb
 * getippte Adressen nicht verloren gehen.
 */

const MARGIN = 12
const DEFAULT_W = 760
const DEFAULT_H = 720

interface Rect { x: number; y: number; w: number; h: number }

function clampRect(r: Rect): Rect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(r.w, vw - 2 * MARGIN)
  const h = Math.min(r.h, vh - 2 * MARGIN)
  return {
    w,
    h,
    x: Math.min(Math.max(MARGIN, r.x), vw - w - MARGIN),
    y: Math.min(Math.max(MARGIN, r.y), vh - h - MARGIN)
  }
}

/** Startposition rechts unten — der Hauptbereich links (Agent-Tab) bleibt frei. */
function defaultRect(): Rect {
  const w = Math.min(DEFAULT_W, window.innerWidth - 2 * MARGIN)
  const h = Math.min(DEFAULT_H, window.innerHeight - 2 * MARGIN - 40)
  return clampRect({ w, h, x: window.innerWidth - w - 24, y: window.innerHeight - h - 24 })
}

// Nur für die laufende Sitzung und nur, wenn der Nutzer das Fenster selbst
// verschoben oder in der Größe geändert hat: dann überdauert es das Schließen.
let lastUserRect: Rect | null = null

export const ComposeWindow: React.FC = () => {
  const { t } = useTranslation()
  const composeState = useEmailStore(s => s.composeState)
  const closeCompose = useEmailStore(s => s.closeCompose)
  const draftId = composeState?.draftId
  const subject = composeState?.subject

  const [rect, setRect] = useState<Rect>(() => defaultRect())
  const [minimized, setMinimized] = useState(false)
  const windowRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  // Startgröße erst beim Öffnen berechnen, nicht beim App-Start: Die Komponente
  // hängt dauerhaft an der App, das App-Fenster hat beim Start oft noch nicht seine
  // endgültige Größe (real: Fenster öffnete winzig oben links).
  const isOpen = !!composeState
  useLayoutEffect(() => {
    if (isOpen) setRect(lastUserRect ? clampRect(lastUserRect) : defaultRect())
  }, [isOpen])

  // Neuer Entwurf (Antworten, Weiterleiten, Neu) → Fenster wieder aufklappen.
  useEffect(() => { if (draftId) setMinimized(false) }, [draftId])

  // App-Fenster verkleinert → Schreibfenster im sichtbaren Bereich halten.
  useEffect(() => {
    const onResize = () => setRect(r => clampRect(r))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Größenänderung per Griff (CSS resize) in den State übernehmen.
  useLayoutEffect(() => {
    const el = windowRef.current
    if (!el || minimized || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      setRect(r => {
        if (Math.abs(r.w - w) <= 1 && Math.abs(r.h - h) <= 1) return r
        const next = { ...r, w, h }
        lastUserRect = next
        return next
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [minimized, draftId])

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    dragRef.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [rect.x, rect.y])

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setRect(r => {
      const next = clampRect({ ...r, x: e.clientX - drag.dx, y: e.clientY - drag.dy })
      lastUserRect = next
      return next
    })
  }, [])

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  if (!composeState) return null

  const title = subject?.trim() ? subject.trim() : t('inbox.compose')

  return createPortal(
    <div className="inbox-compose-layer">
      {minimized && (
        <div className="inbox-compose-minibar" role="group" aria-label={t('inbox.compose')}>
          <button
            type="button"
            className="inbox-compose-minibar-open"
            onClick={() => setMinimized(false)}
            data-tooltip={t('inbox.compose.restore')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span className="inbox-compose-minibar-title">{title}</span>
          </button>
          <button
            type="button"
            className="inbox-panel-close"
            aria-label={t('inbox.compose.close')}
            data-tooltip={t('inbox.compose.closeHint')}
            onClick={() => closeCompose()}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
      <div
        ref={windowRef}
        className="inbox-compose-modal inbox-compose-window"
        role="dialog"
        aria-modal="false"
        aria-label={t('inbox.compose')}
        hidden={minimized}
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        // Editor-Kürzel (⌘E Ansicht, ⌘F Suche) sollen nicht die Notiz hinter dem
        // Fenster umschalten. Kopieren/Einfügen sind Standardaktionen und bleiben.
        onKeyDown={e => { if (e.metaKey || e.ctrlKey) e.stopPropagation() }}
      >
        <div
          className="inbox-compose-modal-header"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          onDoubleClick={e => { if (!(e.target as HTMLElement).closest('button')) setMinimized(true) }}
        >
          <div className="inbox-compose-modal-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span className="inbox-compose-modal-title-text">{title}</span>
            <span className="inbox-compose-modal-hint">{t('inbox.compose.dragHint')}</span>
          </div>
          <div className="inbox-compose-modal-buttons">
            <button
              type="button"
              className="inbox-panel-close"
              aria-label={t('inbox.compose.minimize')}
              data-tooltip={t('inbox.compose.minimize')}
              onClick={() => setMinimized(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="6" y1="17" x2="18" y2="17" />
              </svg>
            </button>
            <button
              type="button"
              className="inbox-panel-close"
              aria-label={t('inbox.compose.close')}
              data-tooltip={t('inbox.compose.closeHint')}
              onClick={() => closeCompose()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="inbox-compose-modal-body">
          <ComposeView />
        </div>
      </div>
    </div>,
    document.body
  )
}
