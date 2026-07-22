import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { WEB_SEARCH_PROVIDER_META, WEB_SEARCH_PROVIDER_IDS, type WebSearchProviderId } from '../../../shared/webResearch'

type LoadedWebResearchConfig = {
  provider: WebSearchProviderId
  searxngUrl: string
  hasTavilyKey: boolean
  hasLinkupKey: boolean
}

type WebResearchConfigPatch = {
  provider?: WebSearchProviderId
  searxngUrl?: string
}

// Webrecherche-Konfiguration (Opt-in). Provider-Config + API-Keys liegen Main-seitig (0d), pro
// Provider. Diese Sektion verwaltet sie über die webResearch-IPC und spiegelt den Zustand in den
// Store (uiStore.webResearchConfig), damit die KI-Leiste Provider + „konfiguriert?" kennt.
// Empfohlen: Tavily (kostenloser Key, sofort einsatzbereit). SearXNG/Linkup für Self-Host/DSGVO.
export function WebResearchSection() {
  const en = useUIStore(s => s.language) === 'en'
  const setMirror = useUIStore(s => s.setWebResearchConfig)

  const [provider, setProvider] = useState<WebSearchProviderId>('tavily')
  const [searxngUrl, setSearxngUrl] = useState('')
  const [hasTavilyKey, setHasTavilyKey] = useState(false)
  const [hasLinkupKey, setHasLinkupKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)
  // Provider-/URL-Saves strikt serialisieren. Besonders wichtig beim Klick auf „Suche testen":
  // davor feuert das blur des URL-Felds. Der Test wartet auf genau diesen Save, statt parallel
  // die alte Main-Config zu prüfen oder bei privaten URLs einen zweiten Freigabedialog zu öffnen.
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const pendingSavesRef = useRef(0)
  const savedConfigRef = useRef<Pick<LoadedWebResearchConfig, 'provider' | 'searxngUrl'>>({
    provider: 'tavily',
    searxngUrl: ''
  })

  const applyLoaded = (cfg: LoadedWebResearchConfig) => {
    setProvider(cfg.provider)
    setSearxngUrl(cfg.searxngUrl)
    savedConfigRef.current = { provider: cfg.provider, searxngUrl: cfg.searxngUrl }
    setHasTavilyKey(cfg.hasTavilyKey)
    setHasLinkupKey(cfg.hasLinkupKey)
    setMirror({ provider: cfg.provider, searxngUrl: cfg.searxngUrl, hasTavilyKey: cfg.hasTavilyKey, hasLinkupKey: cfg.hasLinkupKey })
  }

  useEffect(() => {
    window.electronAPI.webResearchLoadConfig().then(applyLoaded).catch(() => { /* ignorieren */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const meta = WEB_SEARCH_PROVIDER_META[provider]
  const currentHasKey = provider === 'tavily' ? hasTavilyKey : provider === 'linkup' ? hasLinkupKey : false

  const pushMirror = (over: Partial<LoadedWebResearchConfig>) =>
    setMirror({ provider, searxngUrl, hasTavilyKey, hasLinkupKey, ...over })

  const saveProvider = (next: WebResearchConfigPatch): Promise<boolean> => {
    pendingSavesRef.current += 1
    setSaving(true)
    setStatus(null)
    const run = async (): Promise<boolean> => {
      try {
        const res = await window.electronAPI.webResearchSaveConfig(next)
        if (res.success && res.config) {
          const mirror = useUIStore.getState().webResearchConfig
          const nextHasTavilyKey = mirror?.hasTavilyKey ?? hasTavilyKey
          const nextHasLinkupKey = mirror?.hasLinkupKey ?? hasLinkupKey
          setProvider(res.config.provider)
          setSearxngUrl(res.config.searxngUrl)
          savedConfigRef.current = { provider: res.config.provider, searxngUrl: res.config.searxngUrl }
          setMirror({
            provider: res.config.provider,
            searxngUrl: res.config.searxngUrl,
            hasTavilyKey: nextHasTavilyKey,
            hasLinkupKey: nextHasLinkupKey
          })
          return true
        }
        setStatus({ ok: false, msg: res.error || (en ? 'Save failed' : 'Speichern fehlgeschlagen') })
        return false
      } catch (error) {
        setStatus({
          ok: false,
          msg: error instanceof Error ? error.message : (en ? 'Save failed' : 'Speichern fehlgeschlagen')
        })
        return false
      }
    }

    const task = saveQueueRef.current.then(run, run)
    saveQueueRef.current = task
    return task.finally(() => {
      pendingSavesRef.current -= 1
      if (pendingSavesRef.current === 0) setSaving(false)
    })
  }

  const saveKey = async () => {
    if (provider !== 'tavily' && provider !== 'linkup') return
    setSaving(true)
    try {
      const res = await window.electronAPI.webResearchSaveKey(provider, keyInput)
      if (res.success) {
        if (provider === 'tavily') { setHasTavilyKey(!!res.hasKey); pushMirror({ hasTavilyKey: !!res.hasKey }) }
        else { setHasLinkupKey(!!res.hasKey); pushMirror({ hasLinkupKey: !!res.hasKey }) }
        setKeyInput('')
      } else {
        setStatus({ ok: false, msg: res.error || 'Fehler' })
      }
    } finally {
      setSaving(false)
    }
  }

  const clearKey = async () => {
    if (provider !== 'tavily' && provider !== 'linkup') return
    setSaving(true)
    try {
      const res = await window.electronAPI.webResearchClearKey(provider)
      if (res.success) {
        if (provider === 'tavily') { setHasTavilyKey(false); pushMirror({ hasTavilyKey: false }) }
        else { setHasLinkupKey(false); pushMirror({ hasLinkupKey: false }) }
      } else {
        setStatus({ ok: false, msg: res.error || (en ? 'Could not remove key' : 'Key konnte nicht entfernt werden') })
      }
    } finally {
      setSaving(false)
    }
  }

  // Save-dann-Test: erst die aktuelle URL sichern, damit der Test nie eine veraltete Main-Config
  // prüft (bei SearXNG kann das Speichern einen Freigabe-Dialog auslösen).
  const runTest = async () => {
    setTesting(true)
    setStatus(null)
    try {
      // Ein unmittelbar vorausgehendes blur/onChange hat seinen Save bereits eingereiht.
      // Scheitert dieser (z.B. Freigabe abgebrochen), nicht sofort denselben Dialog wiederholen.
      const hadPendingSave = pendingSavesRef.current > 0
      const pendingSaveSucceeded = await saveQueueRef.current
      if (hadPendingSave && !pendingSaveSucceeded) return

      const persisted = savedConfigRef.current
      const patch: WebResearchConfigPatch = {}
      if (persisted.provider !== provider) patch.provider = provider
      if (provider === 'searxng' && persisted.searxngUrl !== searxngUrl) patch.searxngUrl = searxngUrl
      if (Object.keys(patch).length > 0 && !(await saveProvider(patch))) return

      const res = await window.electronAPI.webResearchTest()
      setStatus(res.success
        ? { ok: true, msg: en ? `OK — ${res.count ?? 0} results` : `OK — ${res.count ?? 0} Treffer` }
        : { ok: false, msg: res.error || 'Fehler' })
    } finally {
      setTesting(false)
    }
  }

  const testDisabled = testing || (meta.needsApiKey && !currentHasKey) || (meta.needsBaseUrl && !searxngUrl.trim())

  return (
    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <label style={{ fontWeight: 600 }}>{en ? 'Web research (opt-in)' : 'Webrecherche (Opt-in)'}</label>
      <p className="settings-hint" style={{ fontSize: '11px', margin: 0 }}>
        {en
          ? 'Lets the note agent search the web and write a note with sources. Only search queries leave your computer; page extraction stays local. With a cloud model the read page content and note context are additionally sent to the cloud provider. The globe toggle in the AI bar arms it per run.'
          : 'Lässt den Notiz-Agenten im Web recherchieren und eine Notiz mit Quellen schreiben. Nur Suchanfragen verlassen deinen Rechner; die Seiten-Extraktion bleibt lokal. Mit einem Cloud-Modell werden zusätzlich die gelesenen Seiteninhalte und der Notizkontext an den Cloud-Anbieter gesendet. Der Globus-Schalter in der KI-Leiste aktiviert sie pro Lauf.'}
      </p>

      {/* Provider-Wahl (Tavily zuerst = empfohlen) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ minWidth: '120px' }}>{en ? 'Search provider' : 'Suchanbieter'}</label>
        <select
          value={provider}
          onChange={e => { const p = e.target.value as WebSearchProviderId; setProvider(p); setStatus(null); void saveProvider({ provider: p }) }}
          disabled={saving}
          style={{ flex: 1 }}
        >
          {WEB_SEARCH_PROVIDER_IDS.map(id => (
            <option key={id} value={id}>
              {WEB_SEARCH_PROVIDER_META[id].label}{id === 'tavily' ? (en ? ' (recommended)' : ' (empfohlen)') : ''}
            </option>
          ))}
        </select>
      </div>

      <p className="settings-hint" style={{ fontSize: '11px', margin: '0 0 0 128px' }}>
        {en ? meta.privacyNote.en : meta.privacyNote.de}
      </p>

      {/* SearXNG-URL */}
      {meta.needsBaseUrl && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ minWidth: '120px' }}>{en ? 'Instance URL' : 'Instanz-URL'}</label>
            <input
              type="text"
              value={searxngUrl}
              onChange={e => setSearxngUrl(e.target.value)}
              onBlur={() => {
                if (searxngUrl !== savedConfigRef.current.searxngUrl) void saveProvider({ searxngUrl })
              }}
              placeholder="https://searx.example.org"
              style={{ flex: 1 }}
            />
          </div>
          <p className="settings-hint" style={{ fontSize: '11px', margin: '0 0 0 128px' }}>
            {en
              ? 'Your own SearXNG instance with the JSON format enabled (settings.yml → search.formats: json). A local/LAN address requires a one-time confirmation.'
              : 'Deine eigene SearXNG-Instanz mit aktiviertem JSON-Format (settings.yml → search.formats: json). Eine lokale/LAN-Adresse verlangt eine einmalige Bestätigung.'}
            {' '}<a href="https://docs.searxng.org/" target="_blank" rel="noopener noreferrer">docs.searxng.org</a>
          </p>
        </>
      )}

      {/* API-Key (Tavily / Linkup) */}
      {meta.needsApiKey && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ minWidth: '120px' }}>API-Key</label>
            {currentHasKey ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <span className="status-connected" style={{ fontSize: '12px' }}>{en ? 'Key stored' : 'Key hinterlegt'}</span>
                <button className="settings-refresh" onClick={clearKey} disabled={saving} style={{ color: 'var(--text-error, #e53935)' }}>
                  {en ? 'Remove' : 'Entfernen'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder={provider === 'tavily' ? 'tvly-...' : '...'} style={{ flex: 1 }} autoComplete="off" />
                <button className="settings-refresh" onClick={saveKey} disabled={saving || !keyInput.trim()}>
                  {saving ? '…' : (en ? 'Save' : 'Speichern')}
                </button>
              </div>
            )}
          </div>
          <p className="settings-hint" style={{ fontSize: '11px', margin: '0 0 0 128px' }}>
            {provider === 'tavily' && (en ? 'Free key (no credit card): ' : 'Kostenloser Key (keine Kreditkarte): ')}
            <a href={meta.keysUrl} target="_blank" rel="noopener noreferrer">{meta.keysUrl.replace(/^https?:\/\//, '')}</a>
          </p>
        </>
      )}

      {/* Verbindungstest */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ minWidth: '120px' }}></label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
          <button className="settings-refresh" onClick={runTest} disabled={testDisabled}>
            {testing ? '…' : (en ? 'Test search' : 'Suche testen')}
          </button>
          {status && (
            <span className={status.ok ? 'status-connected' : 'status-disconnected'} style={{ fontSize: '12px' }}>{status.msg}</span>
          )}
        </div>
      </div>
    </div>
  )
}
