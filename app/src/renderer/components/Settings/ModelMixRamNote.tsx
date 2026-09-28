import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { checkModelMixRamFit } from '../../../shared/modelCompatibility'
import { Note } from './SettingsUI'

// Warnt, wenn die Module zusammen verschiedene lokale Modelle nutzen, die gleichzeitig
// geladen nicht in den RAM passen. Einzeln prüft das ModelRamWarning am Picker.
// Anlass: zwei 27B-Modelle aus verschiedenen Modul-Einstellungen haben Ollama auf
// 32 GB ins Swap gedrückt, der Rechner fror ein (25.09.2026).
export function ModelMixRamNote() {
  const { t } = useTranslation()
  const ollama = useUIStore(s => s.ollama)
  const emailEnabled = useUIStore(s => s.email.enabled)
  const analysisModel = useUIStore(s => s.email.analysisModel)
  const totalRamGb = useUIStore(s => s.systemTotalRamGb)

  const models = [
    ollama.selectedModel,
    ...Object.values(ollama.moduleModelOverrides ?? {}),
    emailEnabled ? analysisModel : ''
  ]
  const fit = checkModelMixRamFit(models, totalRamGb)
  if (fit.fits) return null

  return (
    <Note tone="warn">
      {t('settings.aiTab.modelMixRam', {
        models: fit.models.map(m => `${m.model} (~${m.ramGb} GB)`).join(', '),
        sum: String(fit.sumGb),
        total: String(fit.totalRamGb)
      })}
    </Note>
  )
}
