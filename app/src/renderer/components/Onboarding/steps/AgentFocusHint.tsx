import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../stores/uiStore'
import { useTranslation } from '../../../utils/translations'
import { agentDefaultModel } from '../../../../shared/workFocus'
import type { AgentRoute } from '../../../../shared/agentRoute'

// Ehrlicher Satz zum Agenten auf diesem Rechner, nur beim Schwerpunkt „Agent“
// (docs/codex-collab/schwerpunkt-beim-einrichten.md §5, Codex F07/F20).
//
// Zwei getrennte Aussagen, nie vermischt: der WEG kommt aus der Route-Vorprüfung des
// Main (nicht aus dem Modellnamen), der RECHNER aus der RAM-Abfrage — und Letztere
// nur bei nachweislich lokalem Weg. LM Studio ist „nicht geprüft“: dann keine Aussage.
// Bewertet wird das Standardmodell; eine Cloud-Auswahl im Agent-Tab kennt das
// Onboarding nicht und behauptet für sie nichts.
const LOW_RAM_GB = 16 // gleiche Schwelle wie der Schonmodus in App.tsx

export const AgentFocusHint: React.FC = () => {
  const { t } = useTranslation()
  const ollama = useUIStore(s => s.ollama)
  const ramGb = useUIStore(s => s.systemTotalRamGb)
  const model = ollama.enabled ? agentDefaultModel(ollama) : ''
  const localBackend: 'ollama' | 'lmstudio' = ollama.backend === 'lm-studio' ? 'lmstudio' : 'ollama'
  const [route, setRoute] = useState<{ key: string; route: AgentRoute } | null>(null)
  const key = `${localBackend}|${model}`

  useEffect(() => {
    if (!model) return
    let alive = true
    window.electronAPI.noteAgentRoutePreflight({ model, localBackend, cloud: null })
      .then(r => { if (alive && r.success && r.route) setRoute({ key, route: r.route }) })
      .catch(() => { /* ohne Befund kein Satz */ })
    return () => { alive = false }
  }, [key, model, localBackend])

  let text: string | null = null
  if (!model) {
    text = t('onboarding.focus.hint.noModel')
  } else if (route?.key === key) {
    if (route.route.kind === 'cloud') {
      text = t('onboarding.focus.hint.cloud').replace('{provider}', route.route.providerLabel)
    } else if (route.route.kind === 'local' && ramGb !== null && ramGb < LOW_RAM_GB) {
      text = t('onboarding.focus.hint.lowRam')
    }
  }
  if (!text) return null

  return (
    <div className="onboarding-ai-hint" role="note">
      <strong>{t('onboarding.focus.hint.title')}:</strong> {text}
    </div>
  )
}
