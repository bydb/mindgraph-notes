import { useUIStore } from '../../stores/uiStore'
import { checkModelRamFit } from '../../../shared/modelCompatibility'

// Warnt, wenn das gewählte lokale Modell nicht in den verfügbaren System-RAM passt.
// Hintergrund: ein zu großes Modell drückt Ollama ins Swap → das ganze (8-GB-)System
// friert ein (Hang). Cloud-Modelle und unbekannte Größen lösen keine Warnung aus.
export function ModelRamWarning({ model, compact }: { model: string; compact?: boolean }) {
  const totalRamGb = useUIStore(s => s.systemTotalRamGb)
  const language = useUIStore(s => s.language)
  const en = language === 'en'
  const fit = checkModelRamFit(model, totalRamGb)
  if (fit.fits || fit.modelRamGb == null) return null

  const text = en
    ? `“${model}” needs ~${fit.modelRamGb} GB, but this device has ${fit.totalRamGb} GB. It will swap and may freeze the whole system — pick a smaller model (e.g. qwen3.5:4b) or use OpenRouter (Cloud).`
    : `„${model}" braucht ~${fit.modelRamGb} GB, dieses Gerät hat aber ${fit.totalRamGb} GB. Das Modell läuft ins Swap und kann das ganze System einfrieren — wähle ein kleineres Modell (z.B. qwen3.5:4b) oder OpenRouter (Cloud).`

  return (
    <span
      title={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: compact ? '1px 6px' : '2px 8px',
        borderRadius: '10px',
        background: 'color-mix(in srgb, var(--danger, #dc2626) 12%, transparent)',
        border: '1px solid var(--danger, #dc2626)',
        color: 'var(--danger, #dc2626)',
        fontSize: '11px',
        lineHeight: 1.3
      }}
    >
      ⚠️ {compact
        ? (en ? `~${fit.modelRamGb} GB > ${fit.totalRamGb} GB RAM` : `~${fit.modelRamGb} GB > ${fit.totalRamGb} GB RAM`)
        : text}
    </span>
  )
}
