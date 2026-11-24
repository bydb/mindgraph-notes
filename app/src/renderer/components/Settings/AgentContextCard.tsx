import { useEffect, useState } from 'react'
import { useUIStore, flushUISettings } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { Card, Row, Note } from './SettingsUI'
import { AGENT_CONTEXT_DEFAULT, availableAgentContextSteps, normalizeAgentContextSetting } from '../../../shared/agentContext'

type Info =
  | { state: 'loading' }
  | { state: 'not-local' }
  | { state: 'local'; modelMax: number | null; loaded: { sizeBytes: number; vramBytes: number; contextLength: number | null } | null; totalRamBytes: number }

// Kontextfenster lokaler Agentenläufe (shared/agentContext.ts). Der Main liest den Wert selbst aus
// ui-settings.json und begrenzt ihn beim Laufstart auf das Maximum des Modells — der Regler hier
// zeigt dieselbe Grenze, entscheidet sie aber nicht.
export function AgentContextCard() {
  const { t, language } = useTranslation()
  const stored = useUIStore(s => s.noteAgentLocalContextTokens)
  const setStored = useUIStore(s => s.setNoteAgentLocalContextTokens)
  const model = useUIStore(s => s.ollama.moduleModelOverrides?.['note-agent'] || s.ollama.selectedModel || '')
  const isLmStudio = useUIStore(s => s.ollama.backend === 'lm-studio')
  const [info, setInfo] = useState<Info>({ state: 'loading' })
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    let alive = true
    if (isLmStudio || !model) { setInfo({ state: 'not-local' }); return }
    setInfo({ state: 'loading' })
    window.electronAPI.noteAgentContextInfo({ model }).then(res => {
      if (!alive) return
      if (!res.success || !res.local) { setInfo({ state: 'not-local' }); return }
      setInfo({ state: 'local', modelMax: res.modelMax ?? null, loaded: res.loaded ?? null, totalRamBytes: res.totalRamBytes ?? 0 })
    }).catch(() => { if (alive) setInfo({ state: 'not-local' }) })
    return () => { alive = false }
  }, [model, isLmStudio])

  const fmt = (n: number): string => n.toLocaleString(language === 'en' ? 'en-US' : 'de-DE')
  const gb = (bytes: number): string => (bytes / 1024 ** 3).toLocaleString(language === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: 1 })
  const wanted = normalizeAgentContextSetting(stored)
  const steps = info.state === 'local' ? availableAgentContextSteps(info.modelMax) : [AGENT_CONTEXT_DEFAULT]
  const index = Math.max(0, steps.reduce((best, step, i) => (step <= wanted ? i : best), 0))
  const effective = steps[index]
  const disabled = info.state !== 'local' || steps.length < 2

  const change = async (next: number): Promise<void> => {
    const before = stored
    setStored(next)
    setSaveFailed(false)
    // Sofort schreiben: der Main liest den Wert beim Laufstart aus ui-settings.json.
    const ok = await flushUISettings()
    if (!ok) { setStored(before); setSaveFailed(true) }
  }

  return (
    <Card>
      <Row label={t('settings.agentContext.label')} hint={t('settings.agentContext.hint')} stacked>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range"
            className="sui-range"
            aria-label={t('settings.agentContext.label')}
            min={0}
            max={Math.max(1, steps.length - 1)}
            step={1}
            value={index}
            disabled={disabled}
            onChange={e => { void change(steps[Number(e.target.value)] ?? AGENT_CONTEXT_DEFAULT) }}
          />
          <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {t('settings.agentContext.value', { n: fmt(effective) })}{effective === AGENT_CONTEXT_DEFAULT ? ` · ${t('settings.agentContext.default')}` : ''}
          </span>
        </div>
      </Row>
      {info.state === 'not-local' && <Note tone="muted">{t('settings.agentContext.notLocal')}</Note>}
      {info.state === 'local' && (
        <Note tone="muted">
          {info.modelMax
            ? t('settings.agentContext.modelMax', { model, n: fmt(info.modelMax) })
            : t('settings.agentContext.modelMaxUnknown', { model })}
          {' '}
          {info.loaded
            // Ohne Fensterangabe: Ollama meldet bei MLX-Modellen weiter das zuerst geladene Fenster,
            // auch wenn ein Lauf längst mehr verarbeitet (gemessen 24.11.2026).
            ? t('settings.agentContext.loadedNoCtx', {
                size: gb(info.loaded.sizeBytes),
                ram: gb(info.totalRamBytes),
                gpu: Math.round((info.loaded.vramBytes / info.loaded.sizeBytes) * 100)
              })
            : t('settings.agentContext.notLoaded', { ram: gb(info.totalRamBytes) })}
        </Note>
      )}
      {info.state === 'local' && wanted > effective && <Note tone="warn">{t('settings.agentContext.clamped', { n: fmt(wanted) })}</Note>}
      {info.state === 'local' && effective > AGENT_CONTEXT_DEFAULT && <Note tone="warn">{t('settings.agentContext.raised')}</Note>}
      {saveFailed && <Note tone="danger">{t('settings.agentContext.saveFailed')}</Note>}
    </Card>
  )
}
