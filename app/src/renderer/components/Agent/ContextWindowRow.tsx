import { useEffect, useState } from 'react'
import { useUIStore, flushUISettings } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { AGENT_CONTEXT_DEFAULT, availableAgentContextSteps, normalizeAgentContextSetting } from '../../../shared/agentContext'

// Kontextfenster direkt im Modell-Menü der Auftragskarte. Dieselbe Einstellung wie unter
// Einstellungen → KI (`AgentContextCard`): der Main liest den Wert beim Laufstart selbst und
// begrenzt ihn auf das Maximum des Modells. Nur für lokale Ollama-Modelle sichtbar.
export function ContextWindowRow({ model, disabled }: { model: string; disabled?: boolean }) {
  const { t, language } = useTranslation()
  const stored = useUIStore(s => s.noteAgentLocalContextTokens)
  const setStored = useUIStore(s => s.setNoteAgentLocalContextTokens)
  const [modelMax, setModelMax] = useState<number | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setModelMax(null)
    if (!model) return
    window.electronAPI.noteAgentContextInfo({ model }).then(res => {
      if (alive && res.success && res.local) setModelMax(res.modelMax ?? null)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [model])

  const fmt = (n: number): string => n.toLocaleString(language === 'en' ? 'en-US' : 'de-DE')
  const wanted = normalizeAgentContextSetting(stored)
  const steps = availableAgentContextSteps(modelMax)
  const index = Math.max(0, steps.reduce((best, step, i) => (step <= wanted ? i : best), 0))
  const effective = steps[index]

  const change = async (next: number): Promise<void> => {
    const before = stored
    setStored(next)
    setSaveFailed(false)
    const ok = await flushUISettings()
    if (!ok) { setStored(before); setSaveFailed(true) }
  }

  return (
    <div className="agent-card-row is-two-col">
      <span className="agent-card-label">{t('agentCard.rowContext')}</span>
      <div className="agent-card-value">
        <div className="agent-card-context">
          <input
            type="range"
            className="agent-card-context-range"
            aria-label={t('settings.agentContext.label')}
            min={0}
            max={Math.max(1, steps.length - 1)}
            step={1}
            value={index}
            disabled={disabled || steps.length < 2}
            onChange={e => { void change(steps[Number(e.target.value)] ?? AGENT_CONTEXT_DEFAULT) }}
          />
          <span className="agent-card-context-value">{t('settings.agentContext.value', { n: fmt(effective) })}</span>
        </div>
        <span className="agent-card-help">
          {effective === AGENT_CONTEXT_DEFAULT ? t('agentCard.contextDefault') : t('agentCard.contextRaised')}
        </span>
        {saveFailed && <span className="agent-card-no-local">{t('settings.agentContext.saveFailed')}</span>}
      </div>
    </div>
  )
}
