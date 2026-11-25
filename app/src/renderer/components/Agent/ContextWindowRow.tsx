import { useEffect, useRef, useState } from 'react'
import { useUIStore, flushUISettings } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { AGENT_CONTEXT_DEFAULT, availableAgentContextSteps, normalizeAgentContextSetting } from '../../../shared/agentContext'
import { memoryBar, reliefPlan } from '../../../shared/memoryPicture'
// Der Speicherbalken ist derselbe wie in den Einstellungen (Klassen `sui-membar*`).
import '../Settings/SettingsUI.css'
import { loadMemoryPicture, memoryPictureAge, openMemoryPictureFor, type MemoryPictureData } from '../../utils/memoryPictureClient'

// Kontextfenster direkt im Modell-Menü der Auftragskarte. Dieselbe Einstellung wie unter
// Einstellungen → KI (`AgentContextCard`): der Main liest den Wert beim Laufstart selbst und
// begrenzt ihn auf das Maximum des Modells. Nur für lokale Ollama-Modelle sichtbar.
export function ContextWindowRow({ model, disabled }: { model: string; disabled?: boolean }) {
  const { t, language } = useTranslation()
  const stored = useUIStore(s => s.noteAgentLocalContextTokens)
  const setStored = useUIStore(s => s.setNoteAgentLocalContextTokens)
  const [modelMax, setModelMax] = useState<number | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  // Speicherbild für dieses Modell: einmal je Öffnen des Menüs gemessen, der Balken folgt dem Regler.
  const [memory, setMemory] = useState<MemoryPictureData | null>(null)

  useEffect(() => {
    let alive = true
    setModelMax(null)
    if (!model) return
    window.electronAPI.noteAgentContextInfo({ model }).then(res => {
      if (alive && res.success && res.local) setModelMax(res.modelMax ?? null)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [model])

  useEffect(() => {
    let alive = true
    setMemory(null)
    if (!model) return
    void loadMemoryPicture(model).then(data => { if (alive && data) setMemory(data) })
    return () => { alive = false }
  }, [model])

  const fmt = (n: number): string => n.toLocaleString(language === 'en' ? 'en-US' : 'de-DE')
  const wanted = normalizeAgentContextSetting(stored)
  const steps = availableAgentContextSteps(modelMax)
  const index = Math.max(0, steps.reduce((best, step, i) => (step <= wanted ? i : best), 0))
  const effective = steps[index]

  // Passt ein VOLLES Fenster dieser Größe neben dem Modell in den Arbeitsspeicher? Die Warnung steht
  // hier und nicht nur in den Einstellungen: dort schaut im Alltag niemand nach (Nutzerbefund 25.11.2026).
  const gb = (bytes: number): string => (bytes / 1024 ** 3).toLocaleString(language === 'en' ? 'en-US' : 'de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const plan = memory ? reliefPlan(memory.picture, memory.apps, effective) : null
  const bar = memory && plan ? memoryBar(memory.picture, effective) : null
  const pct = (bytes: number): string => `${bar ? (bytes / bar.scaleBytes) * 100 : 0}%`
  // Die Karte in den Einstellungen zeigt dann dieses Modell mit demselben Messwert.
  const openMemoryPicture = (): void => openMemoryPictureFor(model, memory, effective)
  // Das Menü hängt die ganze Zeit im Baum (nur ausgeblendet): beim Hineinfahren neu messen, wenn der
  // Stand älter als ein paar Sekunden ist — sonst zeigt es die Belegung von vor einer halben Stunde.
  // Eine verspätete Antwort für ein anderes Modell oder nach dem Aushängen überschreibt nichts.
  const shownModel = useRef(model)
  shownModel.current = model
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const refreshIfStale = (): void => {
    if (!model || memoryPictureAge(model) < 10_000) return
    const asked = model
    // Auch ein Fehlschlag wird übernommen: der Balken von vorhin gilt dann nicht mehr (agy F21).
    void loadMemoryPicture(asked, true).then(data => { if (mounted.current && shownModel.current === asked) setMemory(data) })
  }

  const change = async (next: number): Promise<void> => {
    const before = stored
    setStored(next)
    setSaveFailed(false)
    const ok = await flushUISettings()
    if (!ok) { setStored(before); setSaveFailed(true) }
  }

  return (
    <div className="agent-card-row is-two-col" onPointerEnter={refreshIfStale}>
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
        {bar && plan && memory && (
          <>
            <div className="sui-membar agent-card-membar" role="img" aria-label={t('agentCard.contextBarLabel')}>
              {bar.otherBytes > 0 && <div className="sui-membar-seg is-other" style={{ width: pct(Math.min(bar.otherBytes, memory.picture.totalBytes)) }} title={`${t('settings.memoryPicture.other')}: ${gb(bar.otherBytes)} GB`} />}
              {bar.modelBytes + bar.bufferBytes > 0 && <div className="sui-membar-seg is-model" style={{ width: pct(Math.max(0, Math.min(bar.modelBytes + bar.bufferBytes, memory.picture.totalBytes - bar.otherBytes))) }} title={`${t('settings.memoryPicture.model')}: ${gb(bar.modelBytes + bar.bufferBytes)} GB`} />}
              {bar.contextBytes > 0 && <div className="sui-membar-seg is-context" style={{ width: pct(Math.max(0, bar.contextBytes - bar.overBytes)) }} title={`${t('settings.memoryPicture.context', { n: fmt(effective) })}: ${gb(bar.contextBytes)} GB`} />}
              {bar.freeBytes > 0 && <div className="sui-membar-seg is-free" style={{ width: pct(bar.freeBytes) }} />}
              {bar.overBytes > 0 && <div className="sui-membar-seg is-over" style={{ width: pct(bar.overBytes) }} title={`${t('settings.memoryPicture.over')}: ${gb(bar.overBytes)} GB`} />}
            </div>
            {plan.impossible ? (
              <span className="agent-card-help agent-card-warn-text">
                {plan.impossible === 'gpu'
                  ? t('agentCard.contextImpossibleGpu', { need: gb(plan.needBytes), gpu: gb(memory.picture.gpuLimitBytes ?? 0) })
                  : t('agentCard.contextImpossibleMemory', { need: gb(plan.needBytes), total: gb(memory.picture.totalBytes) })}
              </span>
            ) : plan.deficitBytes > 0 ? (
              <span className="agent-card-help agent-card-warn-text">
                {t('agentCard.contextOver', { need: gb(plan.needBytes), total: gb(memory.picture.totalBytes), gb: gb(plan.deficitBytes) })}{' '}
                <button type="button" className="agent-card-link-btn is-strong" onClick={openMemoryPicture}>{t('agentCard.contextMakeRoom')}</button>
              </span>
            ) : (
              <span className={plan.tight ? 'agent-card-help agent-card-warn-text' : 'agent-card-help'}>
                {t(plan.tight ? 'agentCard.contextTight' : 'agentCard.contextFits', { need: gb(plan.needBytes), free: gb(plan.freeBytes) })}
              </span>
            )}
          </>
        )}
        {saveFailed && <span className="agent-card-no-local">{t('settings.agentContext.saveFailed')}</span>}
      </div>
    </div>
  )
}
