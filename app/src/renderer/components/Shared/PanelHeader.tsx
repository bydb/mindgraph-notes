// Geteilter Modul-Kopf — die „Email-Designsprache" als Kanon für ALLE Panels.
//
// Aufbau (wie im Posteingang/InboxPanel, dem Design-Maßstab):
//   [← optional] [Icon] [Titel] [Count?] ……………… [Aktionen] [× schließen]
//
// Linke Gruppe (Icon + Titel) und rechte Aktionsgruppe werden in eigenen
// Containern gehalten, damit `justify-content: space-between` Titel links und
// Aktionen rechts *clustert* — statt die Buttons über die ganze Breite zu
// verstreuen (der frühere „Bruch" im Aufgaben-Panel).
//
// Module liefern ihre modul-spezifischen Buttons über `actions` und benutzen
// dafür <PanelHeaderIconButton> / <PanelHeaderButton>, damit eine einzige
// Button-Familie über alle Module gilt.

import React from 'react'
import { IconClose, IconChevronLeft } from './Icons'

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement>

/** Icon-only Header-Button (28×28, transparent) — die Standard-Aktion. */
export const PanelHeaderIconButton: React.FC<BtnProps> = ({ className, children, ...rest }) => (
  <button className={`panel-header-iconbtn${className ? ` ${className}` : ''}`} {...rest}>
    {children}
  </button>
)

/** Beschrifteter Header-Button (Icon + Text), z.B. „Neu". */
export const PanelHeaderButton: React.FC<BtnProps> = ({ className, children, ...rest }) => (
  <button className={`panel-header-btn${className ? ` ${className}` : ''}`} {...rest}>
    {children}
  </button>
)

interface PanelHeaderProps {
  /** Führendes Modul-Icon (14×14, in --text-muted getönt). */
  icon?: React.ReactNode
  title: React.ReactNode
  /** Optionaler Zähler-Chip rechts vom Titel (z.B. ungelesene Mails). */
  count?: React.ReactNode
  /** Optionaler Zurück-Pfeil ganz links (z.B. Detail → Liste). */
  onBack?: () => void
  backTitle?: string
  /** Modul-spezifische Aktionsbuttons, werden links vom × eingesetzt. */
  actions?: React.ReactNode
  /** Schließen-× ganz rechts. Weglassen, wenn das Panel nicht schließbar ist. */
  onClose?: () => void
  closeTitle?: string
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  icon,
  title,
  count,
  onBack,
  backTitle,
  actions,
  onClose,
  closeTitle,
}) => (
  <div className="panel-header">
    <div className="panel-header-title">
      {onBack && (
        <button
          className="panel-header-iconbtn plain panel-header-back"
          onClick={onBack}
          title={backTitle}
          aria-label={backTitle}
        >
          <IconChevronLeft size={16} />
        </button>
      )}
      {icon && <span className="panel-header-icon">{icon}</span>}
      <span className="panel-header-label">{title}</span>
      {count !== undefined && count !== null && count !== false && (
        <span className="panel-header-count">{count}</span>
      )}
    </div>
    {(actions || onClose) && (
      <div className="panel-header-actions">
        {actions}
        {onClose && (
          <button
            className="panel-header-iconbtn plain"
            onClick={onClose}
            title={closeTitle}
            aria-label={closeTitle}
          >
            <IconClose size={16} />
          </button>
        )}
      </div>
    )}
  </div>
)

export default PanelHeader
