// Kompakte Pill, die zeigt, welches Modell für ein konkretes Modul gerade
// aktiv ist — inklusive Quelle (Tab-Override, Modul-Override, globaler
// Default). Klick öffnet Settings → Integrationen, damit der User direkt
// das Modell ändern kann.

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getModelVerdict, isHumanFavorite, isMlxModel, type ModuleId } from '../../../shared/modelCompatibility'
import { useUIStore } from '../../stores/uiStore'
import { VERDICT_COLOR } from '../Settings/ModelCompatibilitySection'
import { ModelLogo } from './ModelLogo'
import { ModelMarkers } from './ModelMarkers'
import { useLlmTelemetryStore } from '../../stores/llmTelemetryStore'
import { formatTps, summarize } from '../../../shared/llmTelemetry'

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

  // Gemessene Geschwindigkeit dieses Modells, sofern es in dieser Sitzung schon
  // gelaufen ist. Median über die WARMEN Läufe — ein Kaltstart misst das Laden der
  // Gewichte, nicht das Modell, und würde die Zahl um Faktor 2 verziehen.
  //
  // Der Selektor liefert bewusst das ROHE runs-Array (stabile Referenz) und
  // rechnet erst im Render. Ein Selektor, der die Zusammenfassung selbst baut,
  // gäbe bei jedem Aufruf ein neues Objekt zurück — die dokumentierte
  // „Maximum update depth"-Falle.
  const runs = useLlmTelemetryStore(s => s.runs)
  const speed = useMemo(
    () => summarize(runs.filter(r => r.model === effectiveModel)),
    [runs, effectiveModel]
  )

  const favorite = isHumanFavorite(effectiveModel)
  const mlx = isMlxModel(effectiveModel)
  const tooltip = [
    `Modell: ${effectiveModel}`,
    `Quelle: ${sourceLabel}`,
    mlx ? '🍎 Apple-Silicon-optimiert (MLX)' : null,
    favorite ? '⭐ Entwickler-Favorit (Real-Use-Erfahrung)' : null,
    verdict.reasons.length ? `Hinweise: ${verdict.reasons.join(' · ')}` : null,
    speed.outputTps !== null
      ? `Gemessen: ${formatTps(speed.outputTps)} Tok/s${speed.promptTps !== null ? `, Prompt ${formatTps(speed.promptTps)} Tok/s` : ''} (Median aus ${speed.runs - speed.coldRuns} warmen Läufen)`
      : null,
    speed.hiddenThinkingRuns > 0
      ? 'Bei Reasoning-Läufen meldet Ollama die Denk-Token nicht mit — der Wert ist dann zu niedrig'
      : null,
    'Klick öffnet Einstellungen → Integrationen'
  ]
    .filter(Boolean)
    .join('\n')

  const openSettings = () => {
    window.dispatchEvent(
      new CustomEvent('mindgraph:openSettings', { detail: { tab: 'ai' } })
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
        opacity: 0.55,
        // In schmalen Karten (Dashboard-Spalte) sonst mitten im Modellnamen
        // umgebrochen: „gemma4:12b-" / „mlx". Lieber abschneiden.
        minWidth: 0,
        maxWidth: '100%'
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
      <ModelLogo model={effectiveModel} size={13} />
      <ModelMarkers model={effectiveModel} size={12} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{effectiveModel}</span>
    </button>
  )
}

