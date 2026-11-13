import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore, flushUISettings } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { CLOUD_PROVIDER_META, type CloudProviderId } from '../../../shared/llmBackend'
import {
  applyCloudOnboarding, isChatCloudModel, isFreeCloudModel, looksLikeApiKey, recommendCloudModel
} from '../../../shared/cloudOnboarding'
import { formatPricing, type ModelPricing } from '../../../shared/llmCost'
import { PROVIDERS } from '../Settings/CloudProviderSection'
import { WebSearchSetup } from './WebSearchSetup'

// Geführte Einrichtung eines Cloud-Anbieters: Anbieter → Schlüssel → Modell → eine Freigabe.
// Genutzt im KI-Schritt des Onboardings und im Fenster „KI einrichten“ (CloudSetupModal).
//
// Regeln (shared/cloudOnboarding.ts):
//   - Freigegeben werden Chat, Notiz bearbeiten, Karteikarten und Agent. E-Mail nie.
//   - Gespeichert wird erst nach bestandener Testanfrage — sonst verließe jemand das
//     Onboarding mit einer Einrichtung, die beim ersten Chat scheitert.
//   - Der Schlüssel steht in einem Passwortfeld und wird nach dem Speichern nie wieder gezeigt.

type ModelEntry = { id: string; name: string; promptPrice?: string; pricing?: ModelPricing }
const ORDER: CloudProviderId[] = ['llmbase', 'openrouter']
const PRICE_LABELS = {
  de: { free: 'gratis', perMillion: 'je 1 Mio.' },
  en: { free: 'free', perMillion: 'per 1M' }
}

export const CloudSetup: React.FC<{
  /** Nach bestandener Prüfung und gespeicherter Einstellung. */
  onDone?: (provider: CloudProviderId) => void
}> = ({ onDone }) => {
  const { t, language } = useTranslation()
  const lang: 'de' | 'en' = language === 'en' ? 'en' : 'de'
  const ollama = useUIStore(s => s.ollama)
  const setOllama = useUIStore(s => s.setOllama)

  const [provider, setProvider] = useState<CloudProviderId>('llmbase')
  const meta = PROVIDERS[provider]
  const settings = ollama[provider]

  const [keySaved, setKeySaved] = useState(false)
  const [replaceKey, setReplaceKey] = useState(false)
  // Letzte Prüfung mit dem gespeicherten Schlüssel gescheitert — nicht als „alles gut“ anzeigen.
  const [keyFailed, setKeyFailed] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [models, setModels] = useState<ModelEntry[]>([])
  const [modelsState, setModelsState] = useState<'loading' | 'ok' | 'failed'>('loading')
  const [reload, setReload] = useState(0)
  const [freeOnly, setFreeOnly] = useState(false)
  const [model, setModel] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null)
  const [done, setDone] = useState<{ provider: CloudProviderId; model: string } | null>(null)

  // Anbieterwechsel: Schlüsselstand und Katalog gehören zu genau einem Anbieter.
  const loadSeq = useRef(0)
  useEffect(() => {
    const seq = ++loadSeq.current
    setKeyInput(''); setReplaceKey(false); setKeyFailed(false); setError(null); setFreeOnly(false)
    setModels([]); setModelsState('loading'); setModel('')
    meta.hasKey().then(has => { if (seq === loadSeq.current) setKeySaved(has) }).catch(() => { if (seq === loadSeq.current) setKeySaved(false) })
    meta.listModels().then(res => {
      if (seq !== loadSeq.current) return
      if (res.success && res.models?.length) { setModels(res.models); setModelsState('ok') }
      else setModelsState('failed')
    }).catch(() => { if (seq === loadSeq.current) setModelsState('failed') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, reload])

  const visible = useMemo(
    () => models.filter(m => isChatCloudModel(m) && (!freeOnly || isFreeCloudModel(m))),
    [models, freeOnly]
  )
  const suggestion = useMemo(() => recommendCloudModel(models, { freeOnly }), [models, freeOnly])

  // Vorauswahl: ein früher gewähltes Modell bleibt, sonst der Vorschlag. Nie still ein
  // beliebiges erstes Listenmodell.
  useEffect(() => {
    if (modelsState !== 'ok') return
    const ids = new Set(visible.map(m => m.id))
    setModel(prev => {
      if (prev && ids.has(prev)) return prev
      if (settings.model && ids.has(settings.model)) return settings.model
      return suggestion ?? ''
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsState, visible, suggestion])

  const needsKeyInput = !keySaved || replaceKey
  const keyOk = needsKeyInput ? looksLikeApiKey(keyInput) : true
  const keyLooksWrong = needsKeyInput && keyInput.trim().length > 0 && !keyOk
  const canSubmit = keyOk && !!model && consent && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      if (needsKeyInput) {
        const saved = await meta.saveKey(keyInput.trim())
        if (!saved.success || !saved.hasKey) {
          setError({ title: saved.error || t('settings.cloud.saveFailed') })
          return
        }
        setKeySaved(true); setReplaceKey(false); setKeyInput('')
      }
      const test = await meta.test(model)
      setKeyFailed(!test.success)
      if (!test.success) {
        // Der Schlüssel bleibt gespeichert (sichtbar als „bereits gespeichert“), freigegeben
        // wird nichts: ohne bestandene Anfrage keine Einrichtung.
        setOllama({ [provider]: { ...useUIStore.getState().ollama[provider], hasApiKey: true } })
        setError({ title: t('cloudSetup.testFailed', { provider: meta.name }), detail: test.error })
        return
      }
      const before = useUIStore.getState().ollama
      setOllama({
        enabled: true,
        [provider]: applyCloudOnboarding(before[provider], model),
        defaultCloudProvider: provider
      })
      // Der Main liest Freigaben aus ui-settings.json — erst nach dem Schreiben gilt die Einrichtung.
      if (!(await flushUISettings())) {
        setOllama({ enabled: before.enabled, [provider]: before[provider], defaultCloudProvider: before.defaultCloudProvider ?? null })
        setError({ title: t('cloudSetup.saveFailed') })
        return
      }
      setDone({ provider, model })
      onDone?.(provider)
    } catch (e) {
      setError({ title: t('cloudSetup.testFailed', { provider: meta.name }), detail: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="cloud-setup">
        <div className="cloud-setup-done" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          <div>
            <strong>{t('cloudSetup.done', { provider: PROVIDERS[done.provider].name, model: done.model })}</strong>
            <p>{t('cloudSetup.doneLocalOnly')}</p>
          </div>
          <button type="button" className="onboarding-btn-text" onClick={() => { setDone(null); setConsent(false) }}>{t('cloudSetup.change')}</button>
        </div>
        {/* Aufgeklappt: zugeklappt wurde der Block nach der Bestätigung übersehen (Nutzertest 13.11.2026). */}
        <WebSearchSetup numbered />
      </div>
    )
  }

  const optionLabel = (m: ModelEntry) => `${m.name}${m.pricing ? ` · ${formatPricing(m.pricing, PRICE_LABELS[lang])}` : ''}`
  const suggested = suggestion ? visible.find(m => m.id === suggestion) : undefined

  return (
    <div className="cloud-setup">
      <section className="cloud-setup-block">
        <div className="onboarding-guide-label">{t('cloudSetup.step1')}</div>
        <div className="cloud-setup-providers" role="radiogroup" aria-label={t('cloudSetup.step1')}>
          {ORDER.map(id => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={provider === id}
              disabled={busy}
              className={`cloud-setup-provider ${provider === id ? 'selected' : ''}`}
              onClick={() => setProvider(id)}
            >
              <img src={PROVIDERS[id].logo} alt="" />
              <span className="cloud-setup-provider-text">
                <strong>{PROVIDERS[id].name}</strong>
                <span>{t(`cloudSetup.provider.${id}` as const)}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="cloud-setup-note">{CLOUD_PROVIDER_META[provider].privacyNote[lang]}</p>
      </section>

      <section className="cloud-setup-block">
        <div className="onboarding-guide-label">{t('cloudSetup.step2')}</div>
        {needsKeyInput ? (
          <>
            <p className="cloud-setup-help">{t(`cloudSetup.keyHelp.${provider}` as const)}</p>
            <div className="cloud-setup-key-row">
              <button type="button" className="onboarding-btn-secondary" onClick={() => window.electronAPI.openExternal(meta.keysUrl)}>
                {t('cloudSetup.openKeys')}
              </button>
              <input
                type="password"
                className="cloud-setup-input"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={t('cloudSetup.keyPlaceholder')}
                aria-label={t('cloudSetup.step2')}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </div>
            <p className={`cloud-setup-note ${keyLooksWrong ? 'is-error' : ''}`}>
              {keyLooksWrong ? t('cloudSetup.keyInvalid') : t('cloudSetup.keyStored')}
            </p>
          </>
        ) : (
          <p className="cloud-setup-help">
            {t(keyFailed ? 'cloudSetup.keySavedFailed' : 'cloudSetup.keySaved')}{' '}
            <button type="button" className="cloud-setup-link" onClick={() => setReplaceKey(true)} disabled={busy}>{t('cloudSetup.keyReplace')}</button>
          </p>
        )}
      </section>

      <section className="cloud-setup-block">
        <div className="onboarding-guide-label">{t('cloudSetup.step3')}</div>
        {modelsState === 'loading' && <p className="cloud-setup-help">{t('cloudSetup.modelsLoading')}</p>}
        {modelsState === 'failed' && (
          <p className="cloud-setup-help is-error">
            {t('cloudSetup.modelsFailed')}{' '}
            <button type="button" className="cloud-setup-link" onClick={() => setReload(n => n + 1)}>{t('cloudSetup.retry')}</button>
          </p>
        )}
        {modelsState === 'ok' && (
          <>
            <select className="cloud-setup-input" value={model} onChange={e => setModel(e.target.value)} disabled={busy} aria-label={t('cloudSetup.step3')}>
              {!model && <option value="">{t('cloudSetup.modelChoose')}</option>}
              {suggested && (
                <optgroup label={t('cloudSetup.modelSuggested')}>
                  <option value={suggested.id}>{optionLabel(suggested)}</option>
                </optgroup>
              )}
              <optgroup label={t('cloudSetup.modelAll')}>
                {visible.filter(m => m.id !== suggested?.id).map(m => <option key={m.id} value={m.id}>{optionLabel(m)}</option>)}
              </optgroup>
            </select>
            <p className="cloud-setup-note">{suggested ? t('cloudSetup.modelHint') : t('cloudSetup.modelNoSuggestion')}</p>
            {meta.freeTier && (
              <label className="cloud-setup-check">
                <input type="checkbox" checked={freeOnly} onChange={e => setFreeOnly(e.target.checked)} disabled={busy} />
                <span>{t('cloudSetup.freeOnly')}</span>
              </label>
            )}
            {model && isFreeCloudModel(visible.find(m => m.id === model) ?? { id: model }) && (
              <p className="cloud-setup-note is-warn">{t('cloudSetup.freeNote')}</p>
            )}
          </>
        )}
      </section>

      {/* Vierter Schritt, freiwillig und unabhängig vom Knopf unten: eigene Prüfung, eigener Anbieter. */}
      <WebSearchSetup numbered />

      <label className="cloud-setup-check cloud-setup-consent">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} />
        <span>
          {t('cloudSetup.consent', { provider: meta.name })}
          <span className="cloud-setup-consent-sub">{t('cloudSetup.consentMail')}</span>
        </span>
      </label>

      {error && (
        <div className="onboarding-ai-hint onboarding-error" role="alert">
          <strong>{error.title}</strong>
          {error.detail && <div className="cloud-setup-error-detail">{error.detail}</div>}
          {error.detail && <div>{t('cloudSetup.testFailedHint')}</div>}
        </div>
      )}

      <button type="button" className="onboarding-btn-primary cloud-setup-submit" onClick={() => void submit()} disabled={!canSubmit}>
        {busy ? t('cloudSetup.submitting') : t('cloudSetup.submit')}
      </button>
    </div>
  )
}
