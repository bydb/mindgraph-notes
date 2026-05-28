// Kompakte Pill, die zeigt, welches Modell für ein konkretes Modul gerade
// aktiv ist — inklusive Quelle (Tab-Override, Modul-Override, globaler
// Default). Klick öffnet Settings → Integrationen, damit der User direkt
// das Modell ändern kann.

import { useShallow } from 'zustand/react/shallow'
import { getModelVerdict, isHumanFavorite, isMlxModel, modelMarkers, type ModuleId } from '../../../shared/modelCompatibility'
import { useUIStore } from '../../stores/uiStore'
import { VERDICT_COLOR } from '../Settings/ModelCompatibilitySection'

interface Props {
  moduleId: ModuleId
  // Optionaler tab-spezifischer Override (höchste Prio). Wenn gesetzt,
  // gewinnt er sowohl gegen Modul-Override als auch gegen das globale
  // Modell — analog zur Prio-Reihenfolge im Code.
  tabOverride?: string
  // Beschreibender Name der Quelle des Tab-Overrides für den Tooltip,
  // z.B. "Tab E-Mail Integration" oder "Radar-AI-Einstellung".
  tabOverrideLabel?: string
}

export function ActiveModelBadge({ moduleId, tabOverride, tabOverrideLabel }: Props) {
  const { moduleOverride, globalModel } = useUIStore(
    useShallow(s => ({
      moduleOverride: s.ollama.moduleModelOverrides?.[moduleId] || '',
      globalModel: s.ollama.selectedModel || ''
    }))
  )

  const effectiveModel = (tabOverride || moduleOverride || globalModel).trim()
  if (!effectiveModel) return null

  const verdict = getModelVerdict(effectiveModel, moduleId)
  const source: 'tab' | 'module' | 'global' = tabOverride
    ? 'tab'
    : moduleOverride
    ? 'module'
    : 'global'

  const sourceLabel =
    source === 'tab'
      ? `Tab-Override${tabOverrideLabel ? ` (${tabOverrideLabel})` : ''}`
      : source === 'module'
      ? 'Modul-Override (Einstellungen → Integrationen)'
      : 'Globales Standardmodell'

  const favorite = isHumanFavorite(effectiveModel)
  const mlx = isMlxModel(effectiveModel)
  const tooltip = [
    `Modell: ${effectiveModel}`,
    `Quelle: ${sourceLabel}`,
    mlx ? '🍎 Apple-Silicon-optimiert (MLX)' : null,
    favorite ? '⭐ Entwickler-Favorit (Real-Use-Erfahrung)' : null,
    verdict.reasons.length ? `Hinweise: ${verdict.reasons.join(' · ')}` : null,
    'Klick öffnet Einstellungen → Integrationen'
  ]
    .filter(Boolean)
    .join('\n')

  const openSettings = () => {
    window.dispatchEvent(
      new CustomEvent('mindgraph:openSettings', { detail: { tab: 'integrations' } })
    )
  }

  return (
    <button
      type="button"
      onClick={openSettings}
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: 0,
        background: 'transparent',
        border: 'none',
        fontSize: '11px',
        lineHeight: 1.4,
        color: 'var(--text-secondary, #6b7280)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        opacity: 0.55
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: VERDICT_COLOR[verdict.verdict],
          display: 'inline-block',
          flexShrink: 0
        }}
      />
      <span>{modelMarkers(effectiveModel)}{effectiveModel}</span>
    </button>
  )
}

