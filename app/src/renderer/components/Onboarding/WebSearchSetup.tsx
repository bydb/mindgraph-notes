import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { WEB_SEARCH_PROVIDER_META } from '../../../shared/webResearch'
import { looksLikeApiKey } from '../../../shared/cloudOnboarding'

// Optionaler Zusatz zur KI-Einrichtung: Websuche über Tavily. Ohne sie antwortet das Modell
// nur aus dem, was es gelernt hat. Vorher lag das allein in Einstellungen → KI & Modelle.
//
// Wie bei der Anbieter-Einrichtung gilt: eingeschaltet wird erst nach bestandener Testsuche.
// Scheitert sie, wird der eben gespeicherte Schlüssel wieder entfernt — kein halber Zustand.
// Eine schon bestehende Einrichtung (auch SearXNG oder Linkup) wird nie überschrieben.

type Loaded = { provider: 'tavily' | 'searxng' | 'linkup'; searxngUrl: string; hasTavilyKey: boolean; hasLinkupKey: boolean }

const isConfigured = (c: Loaded) =>
  c.provider === 'tavily' ? c.hasTavilyKey : c.provider === 'linkup' ? c.hasLinkupKey : !!c.searxngUrl.trim()

export const WebSearchSetup: React.FC = () => {
  const { t, language } = useTranslation()
  const lang: 'de' | 'en' = language === 'en' ? 'en' : 'de'
  const moduleOn = useUIStore(s => s.webResearchEnabled)
  const setModuleOn = useUIStore(s => s.setWebResearchEnabled)
  const setMirror = useUIStore(s => s.setWebResearchConfig)
  const meta = WEB_SEARCH_PROVIDER_META.tavily

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [open, setOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.electronAPI.webResearchLoadConfig()
      .then((c: Loaded) => { if (alive && c && typeof c.provider === 'string') { setLoaded(c); setMirror(c) } })
      .catch(() => { /* ohne Befund bleibt der Block geschlossen und unaufdringlich */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!loaded) return null
  const ready = isConfigured(loaded)

  if (ready && moduleOn) {
    return (
      <div className="cloud-setup-block web-setup is-done" role="status">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
        <span>{t('webSetup.done', { provider: WEB_SEARCH_PROVIDER_META[loaded.provider].label })}</span>
      </div>
    )
  }

  // Suchanbieter steht schon (z. B. eigene SearXNG-Instanz), nur das Modul ist aus: einschalten genügt.
  if (ready) {
    return (
      <div className="cloud-setup-block web-setup">
        <div className="onboarding-guide-label">{t('webSetup.title')}</div>
        <p className="cloud-setup-help">{t('webSetup.existing', { provider: WEB_SEARCH_PROVIDER_META[loaded.provider].label })}</p>
        <button type="button" className="onboarding-btn-secondary web-setup-btn" onClick={() => setModuleOn(true)}>{t('webSetup.turnOn')}</button>
      </div>
    )
  }

  const keyOk = looksLikeApiKey(keyInput)
  const keyLooksWrong = keyInput.trim().length > 0 && !keyOk

  const submit = async () => {
    if (!keyOk || busy) return
    setBusy(true)
    setError(null)
    try {
      const cfg = await window.electronAPI.webResearchSaveConfig({ provider: 'tavily' })
      if (!cfg.success) { setError(cfg.error || t('webSetup.failed')); return }
      const saved = await window.electronAPI.webResearchSaveKey('tavily', keyInput.trim())
      if (!saved.success || !saved.hasKey) { setError(saved.error || t('webSetup.failed')); return }
      const test = await window.electronAPI.webResearchTest()
      if (!test.success) {
        await window.electronAPI.webResearchClearKey('tavily').catch(() => undefined)
        setError(`${t('webSetup.failed')} ${test.error ?? ''}`.trim())
        return
      }
      const next: Loaded = { ...loaded, provider: 'tavily', hasTavilyKey: true }
      setLoaded(next)
      setMirror(next)
      setModuleOn(true)
      setKeyInput('')
    } catch (e) {
      setError(`${t('webSetup.failed')} ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cloud-setup-block web-setup">
      <button type="button" className="web-setup-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="onboarding-guide-label">{t('webSetup.title')}</span>
        <span className="web-setup-optional">{t('webSetup.optional')}</span>
        <svg className={open ? 'is-open' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {!open && <p className="cloud-setup-help">{t('webSetup.teaser')}</p>}
      {open && (
        <>
          <p className="cloud-setup-help">{t('webSetup.intro')}</p>
          <div className="cloud-setup-key-row">
            <button type="button" className="onboarding-btn-secondary" onClick={() => window.electronAPI.openExternal(meta.keysUrl)}>
              {t('webSetup.openKeys')}
            </button>
            <input
              type="password"
              className="cloud-setup-input"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder={t('cloudSetup.keyPlaceholder')}
              aria-label={t('webSetup.title')}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </div>
          <p className={`cloud-setup-note ${keyLooksWrong ? 'is-error' : ''}`}>
            {keyLooksWrong ? t('cloudSetup.keyInvalid') : meta.privacyNote[lang]}
          </p>
          {error && <p className="cloud-setup-note is-error" role="alert">{error}</p>}
          <button type="button" className="onboarding-btn-secondary web-setup-btn" onClick={() => void submit()} disabled={!keyOk || busy}>
            {busy ? t('cloudSetup.submitting') : t('webSetup.submit')}
          </button>
        </>
      )}
    </div>
  )
}
