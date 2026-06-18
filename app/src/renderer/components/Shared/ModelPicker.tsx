import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ModelLogo } from './ModelLogo'
import { ModelMarkers } from './ModelMarkers'

interface ModelOption {
  name: string
}

interface Props {
  value: string
  models: ModelOption[]
  onChange: (name: string) => void
  /** Override the visible label for a model (e.g. pull-model descriptions). Default: name. */
  getLabel?: (name: string) => string
  /** Trailing meta per row (e.g. verdict icon). */
  renderMeta?: (name: string) => ReactNode
  /** Leading non-model entry, e.g. "use active model". */
  placeholder?: { value: string; label: string }
  ariaLabel?: string
  disabled?: boolean
  style?: CSSProperties
  maxWidth?: number | string
}

/**
 * Accessible model dropdown that shows a vendor logo next to every model name.
 * Native <select><option> can't render images, so this is a lightweight listbox.
 */
export function ModelPicker({
  value,
  models,
  onChange,
  getLabel,
  renderMeta,
  placeholder,
  ariaLabel,
  disabled,
  style,
  maxWidth = 240
}: Props) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  // Build the full option list (placeholder first, then models).
  const options: Array<{ value: string; label: string; isPlaceholder: boolean }> = [
    ...(placeholder ? [{ value: placeholder.value, label: placeholder.label, isPlaceholder: true }] : []),
    ...models.map(m => ({ value: m.name, label: getLabel ? getLabel(m.name) : m.name, isPlaceholder: false }))
  ]

  const current = options.find(o => o.value === value)
  const currentLabel = current?.label ?? (value || placeholder?.label || '—')

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (open) {
      const idx = options.findIndex(o => o.value === value)
      setHighlight(idx >= 0 ? idx : 0)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const select = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = options[highlight]; if (o) select(o.value) }
  }

  return (
    <div className="model-picker" ref={rootRef} style={{ maxWidth, ...style }}>
      <button
        type="button"
        className="model-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onKeyDown}
      >
        {value ? <ModelLogo model={value} size={16} /> : null}
        {value ? <ModelMarkers model={value} /> : null}
        <span className="model-picker-label">{currentLabel}</span>
        <span className="model-picker-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="model-picker-list" role="listbox" aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li
              key={o.value || '__placeholder__'}
              role="option"
              aria-selected={o.value === value}
              className={`model-picker-option${i === highlight ? ' highlight' : ''}${o.value === value ? ' selected' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); select(o.value) }}
            >
              {o.isPlaceholder
                ? <span className="model-picker-logo-spacer" />
                : <ModelLogo model={o.value} size={16} />}
              {!o.isPlaceholder ? <ModelMarkers model={o.value} /> : null}
              <span className="model-picker-option-label">{o.label}</span>
              {!o.isPlaceholder && renderMeta ? <span className="model-picker-option-meta">{renderMeta(o.value)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
