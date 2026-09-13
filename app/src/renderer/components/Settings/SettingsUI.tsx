// Geteilte Bausteine der Einstellungen (Redesign 09/2026, Claude-Design „Einstellungen").
//
// Ein System für alle Seiten: Seitenkopf, Sektionstitel, Karte, Dienst-Kopf, Zeile,
// gestylte Controls, Auto-Save mit Rückmeldung, Diagnose-Zeile, Aufklapper. Die Seiten
// setzen NUR diese Bausteine zusammen — Optik lebt in SettingsUI.css, Verhalten hier.
//
// Auto-Save-Konvention: Textfelder übernehmen beim Verlassen (blur) oder mit Enter,
// Schalter/Segmente/Selects sofort. Ein „Speichern"-Knopf pro Feld existiert nicht mehr;
// die Rückmeldung ist das grüne „Gespeichert" an der Zeile.

import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from '../../utils/translations'
import './SettingsUI.css'

export type StatusTone = 'ok' | 'off' | 'warn' | 'checking'

// ── Seitenkopf ────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="settings-tab-header">
      <h2>{title}</h2>
      {subtitle && <p className="settings-tab-subtitle">{subtitle}</p>}
    </div>
  )
}

// ── Sektionstitel mit Meta („3 von 5 aktiv") ───────────────────────────────
export function SectionTitle({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="sui-section">
      <span>{title}</span>
      {meta && <span className="sui-section-meta">{meta}</span>}
    </div>
  )
}

// ── Karte ─────────────────────────────────────────────────────────────────
export function Card({
  children,
  dashed,
  anchor,
  className,
  style
}: {
  children: ReactNode
  dashed?: boolean
  /** data-settings-anchor für Such-Sprünge und Deep-Links */
  anchor?: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`sui-card${dashed ? ' is-dashed' : ''}${className ? ` ${className}` : ''}`}
      data-settings-anchor={anchor}
      style={style}
    >
      {children}
    </div>
  )
}

// ── Icon-Kachel ───────────────────────────────────────────────────────────
export function IconTile({
  bg,
  text,
  serif,
  children,
  neutral
}: {
  bg?: string
  text?: string
  serif?: boolean
  children?: ReactNode
  neutral?: boolean
}) {
  return (
    <div
      className={`sui-tile${serif ? ' is-serif' : ''}${neutral ? ' is-neutral' : ''}`}
      style={neutral ? undefined : { background: bg || 'var(--accent-color)' }}
      aria-hidden="true"
    >
      {text ?? children}
    </div>
  )
}

// Lucide-artige Glyphen für Dienst-Kacheln (weiße Linie auf Farbe)
const glyph = (path: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
)
export const TILE_GLYPH = {
  search: glyph(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></>),
  doc: glyph(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>),
  spark: glyph(<path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" />),
  image: glyph(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>),
  cloud: glyph(<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z" />),
  globe: glyph(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>),
  terminal: glyph(<><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></>),
  book: glyph(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>),
  pen: glyph(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  cpu: glyph(<><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="12" cy="12" r="3" /><path d="M12 4V2M12 22v-2M4 12H2M22 12h-2" /></>)
} as const

// ── Status-Chip ───────────────────────────────────────────────────────────
export function StatusChip({ tone, label }: { tone: StatusTone; label: ReactNode }) {
  return <span className={`sui-chip is-${tone}`}>{label}</span>
}

// ── Schalter ──────────────────────────────────────────────────────────────
export function Toggle({
  checked,
  onChange,
  id,
  disabled,
  ariaLabel
}: {
  checked: boolean
  onChange: (next: boolean) => void
  id?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <span className="sui-toggle">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="sui-toggle-track" aria-hidden="true" />
    </span>
  )
}

// ── Dienst-Kopf ───────────────────────────────────────────────────────────
export function ServiceHead({
  icon,
  name,
  desc,
  status,
  actions,
  toggle,
  dimmed,
  plain
}: {
  icon: ReactNode
  name: ReactNode
  desc?: ReactNode
  status?: { tone: StatusTone; label: ReactNode } | null
  actions?: ReactNode
  toggle?: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; ariaLabel?: string }
  /** Modul aus: Text gedämpft, Kachel blass */
  dimmed?: boolean
  /** ohne getönte Kopffläche (Cloud-Karten im Aus-Zustand) */
  plain?: boolean
}) {
  return (
    <div className={`sui-service${dimmed ? ' is-dimmed' : ''}${plain ? ' is-plain' : ''}`}>
      {icon}
      <div className="sui-service-body">
        <div className="sui-service-name">{name}</div>
        {desc && <div className="sui-service-desc">{desc}</div>}
      </div>
      {(status || actions || toggle) && (
        <div className="sui-service-actions">
          {status && <StatusChip tone={status.tone} label={status.label} />}
          {actions}
          {toggle && <Toggle checked={toggle.checked} onChange={toggle.onChange} disabled={toggle.disabled} ariaLabel={toggle.ariaLabel} />}
        </div>
      )}
    </div>
  )
}

// ── Zeile ─────────────────────────────────────────────────────────────────
export function Row({
  label,
  hint,
  children,
  htmlFor,
  anchor,
  stacked,
  disabled
}: {
  label: ReactNode
  hint?: ReactNode
  children?: ReactNode
  htmlFor?: string
  anchor?: string
  /** Control unter dem Label über die volle Breite (Modell-Picker mit Badges) */
  stacked?: boolean
  disabled?: boolean
}) {
  return (
    <div className={`sui-row${stacked ? ' is-stacked' : ''}${disabled ? ' is-disabled' : ''}`} data-settings-anchor={anchor}>
      <div className="sui-row-text">
        {htmlFor
          ? <label className="sui-row-label" htmlFor={htmlFor}>{label}</label>
          : <span className="sui-row-label">{label}</span>}
        {hint && <span className="sui-row-hint">{hint}</span>}
      </div>
      {children !== undefined && children !== null && <div className="sui-row-control">{children}</div>}
    </div>
  )
}

// ── Hinweis-/Diagnose-Zeile ───────────────────────────────────────────────
const NOTE_ICON = {
  warn: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>,
  danger: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>,
  ok: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  muted: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
}
export function Note({
  tone = 'muted',
  children,
  action,
  onAction,
  actionDisabled
}: {
  tone?: 'warn' | 'danger' | 'ok' | 'muted'
  children: ReactNode
  action?: ReactNode
  onAction?: () => void
  actionDisabled?: boolean
}) {
  return (
    <div className={`sui-note is-${tone}`}>
      {NOTE_ICON[tone]}
      <div className="sui-note-body">
        {children}
        {action && (
          <>
            {' '}
            <button type="button" className="sui-link" onClick={onAction} disabled={actionDisabled}>{action}</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Aufklapper ────────────────────────────────────────────────────────────
export function Details({
  title,
  children,
  defaultOpen,
  wide,
  onToggle
}: {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  /** eingebetteter Vollinhalt statt Erklärtext (kein Einzug, Primärfarbe) */
  wide?: boolean
  onToggle?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className={`sui-details${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="sui-details-toggle"
        aria-expanded={open}
        onClick={() => { const next = !open; setOpen(next); onToggle?.(next) }}
      >
        <span className="sui-details-caret" aria-hidden="true">▸</span>
        {title}
      </button>
      {open && <div className={`sui-details-body${wide ? ' is-wide' : ''}`}>{children}</div>}
    </div>
  )
}

// ── Segment-Control ───────────────────────────────────────────────────────
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel
}: {
  options: Array<{ value: T; label: ReactNode }>
  value: T
  onChange: (next: T) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <div className="sui-seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-active' : ''}
          disabled={disabled}
          onClick={() => { if (o.value !== value) onChange(o.value) }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Select (gestylter nativer Select) ─────────────────────────────────────
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props
  return <select {...rest} className={`sui-select${className ? ` ${className}` : ''}`} />
}

// ── Knöpfe ────────────────────────────────────────────────────────────────
export function Button({
  variant = 'secondary',
  children,
  onClick,
  disabled,
  danger,
  title,
  style
}: {
  variant?: 'primary' | 'secondary' | 'link'
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  title?: string
  style?: React.CSSProperties
}) {
  if (variant === 'link') {
    return (
      <button type="button" className="sui-link is-muted" onClick={onClick} disabled={disabled} title={title} style={style}>
        {children}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={variant === 'primary' ? 'settings-btn-primary' : 'settings-btn-secondary'}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={danger ? { color: 'var(--color-danger)', ...style } : style}
    >
      {children}
    </button>
  )
}

// ── Auto-Save-Textfeld ────────────────────────────────────────────────────
// Übernimmt bei blur/Enter — nie bei jedem Tastendruck (sonst prüft z.B. die URL-Zeile
// nach jedem Zeichen den Server). „Gespeichert" blitzt nach einer Übernahme kurz auf.
export function TextInput({
  value,
  onCommit,
  placeholder,
  disabled,
  type = 'text',
  narrow,
  id,
  showAutoSaveHint
}: {
  value: string
  onCommit: (next: string) => void
  placeholder?: string
  disabled?: boolean
  type?: 'text' | 'email' | 'url'
  narrow?: boolean
  id?: string
  /** graues „Speichert automatisch" links vom Feld, solange noch nichts übernommen wurde */
  showAutoSaveHint?: boolean
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [flash, setFlash] = useState(false)
  const lastValue = useRef(value)
  useEffect(() => {
    // Wert von außen (Store) übernehmen, aber nie einen laufenden Entwurf überschreiben.
    if (value !== lastValue.current) {
      lastValue.current = value
      setDraft(value)
    }
  }, [value])
  const commit = () => {
    const next = draft.trim()
    if (next === value) return
    lastValue.current = next
    onCommit(next)
    setFlash(true)
    window.setTimeout(() => setFlash(false), 1600)
  }
  return (
    <>
      {flash
        ? <SavedMark />
        : showAutoSaveHint ? <span className="sui-autosave">{t('settings.ui.autoSave')}</span> : null}
      <input
        id={id}
        type={type}
        className={`sui-input${narrow ? ' is-narrow' : ''}`}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        autoComplete="off"
        spellCheck={false}
      />
    </>
  )
}

export function NumberInput({
  value,
  onCommit,
  unit,
  min,
  max,
  step,
  disabled,
  id
}: {
  value: number
  onCommit: (next: number) => void
  unit?: ReactNode
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  id?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  const commit = () => {
    const n = parseInt(draft, 10)
    if (Number.isNaN(n)) { setDraft(String(value)); return }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }
  return (
    <>
      <input
        id={id}
        type="number"
        className="sui-input is-number"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
      {unit && <span className="sui-unit">{unit}</span>}
    </>
  )
}

export function SavedMark({ label }: { label?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <span className="sui-saved">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      {label ?? t('settings.ui.saved')}
    </span>
  )
}

// ── Secret-Feld (API-Keys) ────────────────────────────────────────────────
// Gespeichert: „Gespeichert ••••••••  …4f2a  Entfernen". Nicht gespeichert: Eingabefeld,
// das beim Verlassen/Enter speichert. Der Klartext wird nie wieder angezeigt.
export function SecretField({
  saved,
  suffix,
  onSave,
  onRemove,
  placeholder,
  disabled,
  busy,
  id
}: {
  saved: boolean
  /** letzte Zeichen des Schlüssels, falls bekannt (sonst nur Punkte) */
  suffix?: string | null
  onSave: (value: string) => void | Promise<void>
  onRemove: () => void | Promise<void>
  placeholder?: string
  disabled?: boolean
  busy?: boolean
  id?: string
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const commit = () => {
    const v = draft.trim()
    if (!v) return
    setDraft('')
    void onSave(v)
  }
  if (saved) {
    return (
      <>
        <SavedMark />
        <div className="sui-secret" aria-label={t('settings.ui.saved')}>
          <span className="sui-secret-dots">••••••••</span>
          {suffix && <span className="sui-secret-suffix">…{suffix}</span>}
        </div>
        <button type="button" className="sui-link is-muted" onClick={() => void onRemove()} disabled={disabled || busy}>
          {t('settings.ui.remove')}
        </button>
      </>
    )
  }
  return (
    <>
      <span className="sui-autosave">{busy ? '…' : t('settings.ui.autoSave')}</span>
      <input
        id={id}
        type="password"
        className="sui-input"
        value={draft}
        placeholder={placeholder}
        disabled={disabled || busy}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        autoComplete="off"
      />
    </>
  )
}

// ── Chip-Auswahl (Mehrfach) ───────────────────────────────────────────────
export function ChipSelect<T extends string>({
  options,
  selected,
  onToggle,
  disabled
}: {
  options: Array<{ value: T; label: ReactNode }>
  selected: (value: T) => boolean
  onToggle: (value: T, next: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="sui-chips">
      {options.map(o => {
        const on = selected(o.value)
        return (
          <button
            key={o.value}
            type="button"
            className={on ? 'is-active' : ''}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(o.value, !on)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Status-Kopf einer Seite ───────────────────────────────────────────────
export function Hero({
  icon,
  title,
  dot,
  meta,
  actions
}: {
  icon: ReactNode
  title: ReactNode
  dot?: StatusTone | null
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="sui-hero">
      <span className="sui-hero-icon">{icon}</span>
      <div className="sui-hero-body">
        <div className="sui-hero-title">
          {title}
          {dot && <span className={`sui-hero-dot is-${dot}`} aria-hidden="true" />}
        </div>
        {meta && <div className="sui-hero-meta">{meta}</div>}
      </div>
      {actions && <div className="sui-hero-actions">{actions}</div>}
    </div>
  )
}

// ── Modul-aus-Karte ───────────────────────────────────────────────────────
// Gestrichelt, Controls verborgen, Einschalten direkt hier (kein Umweg über den Modul-Tab).
export function ModuleOffCard({
  icon,
  name,
  onEnable,
  anchor
}: {
  icon: ReactNode
  name: ReactNode
  onEnable: () => void
  anchor?: string
}) {
  const { t } = useTranslation()
  return (
    <Card dashed anchor={anchor}>
      <ServiceHead
        icon={icon}
        name={name}
        desc={t('settings.ui.moduleOffHint')}
        dimmed
        actions={<Button onClick={onEnable}>{t('settings.ui.moduleEnable')}</Button>}
      />
    </Card>
  )
}

/** Stabile ID für Label/Control-Paare in Zeilen. */
export function useControlId(prefix: string): string {
  const id = useId()
  return `${prefix}-${id}`
}
