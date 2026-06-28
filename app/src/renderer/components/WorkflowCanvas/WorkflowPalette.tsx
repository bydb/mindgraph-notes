import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { actionsByModule, workflowModuleLabel, workflowModuleGate } from '../../../shared/workflow/registry'
import {
  type WorkflowActionDefinition,
  type WorkflowPortDefinition
} from '../../../shared/workflow/types'
import type { VaultFeatures } from '../../../shared/types'
import { useVaultSettingsStore } from '../../stores/vaultSettingsStore'
import { ModuleIcon } from './ModuleIcon'
import { portColor, portKindLabel } from './ui'

/** Verfügbarkeit eines Moduls: aktiv nur wenn Toggle AN UND konfiguriert. */
export interface ModuleAvailability {
  ok: boolean
  /** Grund, falls nicht ok (Tooltip am ausgegrauten Baustein). */
  reason?: string
}

interface Props {
  onAdd: (actionId: string) => void
  /** Pixelbreite (vom ziehbaren Trenner gesteuert). Default per CSS 200px. */
  width?: number
  /** Pro Modul: aktiv + Grund. Fehlt ein Eintrag → Fallback auf Feature-Toggle. */
  availability?: Partial<Record<string, ModuleAvailability>>
}

// Ein gebündelter Tooltip-Text pro Baustein (Beschreibung + alle Ports). Abschnitte
// per „\n" getrennt; der eigene Tooltip (CSS white-space: pre-line + max-width)
// rendert die Umbrüche UND bricht lange Zeilen um — native title-Tooltips können das hier nicht.
function paletteTooltip(action: WorkflowActionDefinition): string {
  const fmt = (ports: WorkflowPortDefinition[]) =>
    ports.map(p => `${p.label} (${portKindLabel(p.kind)})`).join(', ')
  const parts: string[] = [action.description || action.label]
  const extra: string[] = []
  if (action.inputs.length) extra.push(`Eingänge: ${fmt(action.inputs)}`)
  if (action.outputs.length) extra.push(`Ausgänge: ${fmt(action.outputs)}`)
  if (extra.length) parts.push('', ...extra)
  return parts.join('\n')
}

export function WorkflowPalette({ onAdd, width, availability }: Props) {
  const features = useVaultSettingsStore(s => s.features)
  const grouped = actionsByModule()

  const isModuleActive = (moduleId: string): boolean => {
    const gate = workflowModuleGate(moduleId)
    if (!gate) return true // Kern-Modul (oder Plugin-Modul ohne Gate)
    return Boolean(features[gate as keyof VaultFeatures])
  }

  // Eigener Tooltip via Portal an document.body → nicht vom overflow der Palette
  // abgeschnitten; rechts neben dem Baustein, am Rand geklemmt.
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const showTip = (e: ReactMouseEvent<HTMLButtonElement>, action: WorkflowActionDefinition, reason?: string) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({
      text: (reason ? `⚠ ${reason}\n\n` : '') + paletteTooltip(action),
      x: Math.min(r.right + 8, window.innerWidth - 320),
      y: Math.min(r.top, window.innerHeight - 160)
    })
  }

  return (
    <div className="wf-palette" style={width ? { width, flex: `0 0 ${width}px` } : undefined}>
      <div className="wf-palette__title">Bausteine</div>
      {Object.keys(grouped).map(moduleId => {
        const actions = grouped[moduleId]
        if (!actions?.length) return null
        // Verfügbarkeit: explizite Map (Toggle + Konfiguration) gewinnt; sonst Feature-Toggle.
        const avail = availability?.[moduleId] ?? { ok: isModuleActive(moduleId) }
        const active = avail.ok
        return (
          <div className={`wf-palette__group ${active ? '' : 'wf-palette__group--disabled'}`} key={moduleId}>
            <div className="wf-palette__group-title">
              <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <ModuleIcon moduleId={moduleId} size={14} />
              </span>
              <span>{workflowModuleLabel(moduleId)}</span>
              {!active && <span className="wf-palette__off" title={avail.reason || 'Modul deaktiviert'}>aus</span>}
            </div>
            {actions.map(action => (
              <button
                key={action.id}
                className={`wf-palette__item${active ? '' : ' wf-palette__item--off'}`}
                aria-disabled={!active}
                onMouseEnter={(e) => showTip(e, action, active ? undefined : avail.reason)}
                onMouseLeave={() => setTip(null)}
                onClick={() => { setTip(null); if (active) onAdd(action.id) }}
              >
                <span className="wf-pi__ports wf-pi__ports--in" aria-hidden="true">
                  {action.inputs.map(p => (
                    <span key={`in-${p.id}`} className="wf-pi__dot" style={{ background: portColor(p.kind) }} />
                  ))}
                </span>
                <span className="wf-pi__label">{action.label}</span>
                <span className="wf-pi__ports wf-pi__ports--out" aria-hidden="true">
                  {action.outputs.map(p => (
                    <span key={`out-${p.id}`} className="wf-pi__dot" style={{ background: portColor(p.kind) }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        )
      })}
      {tip && createPortal(
        <div className="wf-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>,
        document.body
      )}
    </div>
  )
}
