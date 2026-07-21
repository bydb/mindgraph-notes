import { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { WEB_SEARCH_PROVIDER_META, WEB_SEARCH_PROVIDER_IDS, type WebSearchProviderId } from '../../../shared/webResearch'

// Webrecherche-Konfiguration (Opt-in). Provider-Config + Linkup-Key liegen Main-seitig (0d);
// diese Sektion verwaltet sie über die webResearch-IPC und spiegelt den Zustand in den Store
// (uiStore.webResearchConfig), damit die KI-Leiste Provider + „konfiguriert?" kennt. Default
// lokal — nur Suchanfragen verlassen den Rechner; die Seiten-Extraktion bleibt lokal.
export function WebResearchSection() {
  const en = useUIStore(s => s.language) === 'en'
  const setMirror = useUIStore(s => s.setWebResearchConfig)

  const [provider, setProvider] = useState<WebSearchProviderId>('searxng')
  const [searxngUrl, setSearxngUrl] = useState('')
  const [lastSavedUrl, setLastSavedUrl] = useState('')
  const [hasLinkupKey, setHasLinkupKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const applyLoaded = (cfg: { provider: WebSearchProviderId; searxngUrl: string; hasLinkupKey: boolean }) => {
    setProvider(cfg.provider)
    setSearxngUrl(cfg.searxngUrl)
    setLastSavedUrl(cfg.searxngUrl)
    setHasLinkupKey(cfg.hasLinkupKey)
    setMirror({ provider: cfg.provider, searxngUrl: cfg.searxngUrl, hasLinkupKey: cfg.hasLinkupKey })
  }

  useEffect(() => {
    window.electronAPI.webResearchLoadConfig().then(applyLoaded).catch(() => { /* ignorieren */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const meta = WEB_SEARCH_PROVIDER_META[provider]

  // Speichert Provider/URL Main-seitig und aktualisiert den Store-Spiegel NUR bei Erfolg
  // (kein optimistischer Wert, der von Main abweicht). Gibt Erfolg zurück (für Save-dann-Test).
  const saveProvider = async (next: { provider?: WebSearchProviderId; searxngUrl?: string }): Promise<boolean> => {
    setSaving(true)
    setStatus(null)
    try {
      const res = await window.electronAPI.webResearchSaveConfig(next)
      if (res.success && res.config) {
        setProvider(res.config.provider)
        setSearxngUrl(res.config.searxngUrl)
        setLastSavedUrl(res.config.searxngUrl)
        setMirror({ provider: res.config.provider, searxngUrl: res.config.searxngUrl, hasLinkupKey })
        return true
      }
      setStatus({ ok: false, msg: res.error || (en ? 'Save failed' : 'Speichern fehlgeschlagen') })
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveKey = async () => {
    setSaving(true)
    try {
      const res = await window.electronAPI.webResearchSaveKey(keyInput)
      if (res.success) {
        setHasLinkupKey(!!res.hasKey)
        setMirror({ provider, searxngUrl, hasLinkupKey: !!res.hasKey })
        setKeyInput('')
      } else {
        setStatus({ ok: false, msg: res.error || 'Fehler' })
      }
    } finally {
      setSaving(false)
    }
  }

  const clearKey = async () => {
    setSaving(true)
    try {
      const res = await window.electronAPI.webResearchClearKey()
      if (res.success) {
        setHasLinkupKey(false)
        setMirror({ provider, searxngUrl, hasLinkupKey: false })
      } else {
        // Konnte NICHT gelöscht werden → Zustand NICHT auf „kein Key" setzen.
        setStatus({ ok: false, msg: res.error || (en ? 'Could not remove key' : 'Key konnte nicht entfernt werden') })
      }
    } finally {
      setSaving(false)
    }
  }

  // Save-dann-Test: erst die aktuelle URL sichern, damit der Test nie eine veraltete
  // Main-Config prüft (P2-2). Bei SearXNG kann das Speichern einen Freigabe-Dialog auslösen.
  const runTest = async () => {
    if (provider === 'searxng') {
      const saved = await saveProvider({ provider: 'searxng', searxngUrl })
      if (!saved) return
    }
    setTesting(true)
    setStatus(null)
    try {
      const res = await window.electronAPI.webResearchTest()
      setStatus(res.success
        ? { ok: true, msg: en ? `OK — ${res.count ?? 0} results` : `OK — ${res.count ?? 0} Treffer` }
        : { ok: false, msg: res.error || 'Fehler' })
    } finally {
      setTesting(false)
    }
  }

  // WICHTIG: NICHT von `saving` abhängig machen — sonst deaktiviert das onBlur-Speichern
  // (das beim Klick auf „Suche testen" durch den Fokuswechsel feuert) den Button, bevor der
  // Klick greift, und der erste Klick wird verschluckt. runTest speichert selbst vorab.
  const testDisabled = testing || (provider === 'linkup' && !hasLinkupKey) || (provider === 'searxng' && !searxngUrl.trim())

  return (
    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <label style={{ fontWeight: 600 }}>{en ? 'Web research (opt-in)' : 'Webrecherche (Opt-in)'}</label>
      <p className="settings-hint" style={{ fontSize: '11px', margin: 0 }}>
        {en
          ? 'Lets the note agent search the web and write a note with sources. Only search queries leave your computer; page extraction stays local. With a cloud model the read page content and note context are additionally sent to the cloud provider. The globe toggle in the AI bar arms it per run.'
          : 'Lässt den Notiz-Agenten im Web recherchieren und eine Notiz mit Quellen schreiben. Nur Suchanfragen verlassen deinen Rechner; die Seiten-Extraktion bleibt lokal. Mit einem Cloud-Modell werden zusätzlich die gelesenen Seiteninhalte und der Notizkontext an den Cloud-Anbieter gesendet. Der Globus-Schalter in der KI-Leiste aktiviert sie pro Lauf.'}
      </p>

      {/* Provider-Wahl */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ minWidth: '120px' }}>{en ? 'Search provider' : 'Suchanbieter'}</label>
        <select
          value={provider}
          onChange={e => { const p = e.target.value as WebSearchProviderId; setProvider(p); void saveProvider({ provider: p }) }}
          disabled={saving}
          style={{ flex: 1 }}
        >
          {WEB_SEARCH_PROVIDER_IDS.map(id => (
            <option key={id} value={id}>{WEB_SEARCH_PROVIDER_META[id].label}</option>
          ))}
        </select>
      </div>

      <p className="settings-hint" style={{ fontSize: '11px', margin: '0 0 0 128px' }}>
        {en ? meta.privacyNote.en : meta.privacyNote.de}
      </p>

      {/* SearXNG-URL */}
      {provider === 'searxng' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ minWidth: '120px' }}>{en ? 'Instance URL' : 'Instanz-URL'}</label>
          <input
            type="text"
            value={searxngUrl}
            onChange={e => setSearxngUrl(e.target.value)}
            onBlur={() => { if (searxngUrl !== lastSavedUrl) void saveProvider({ searxngUrl }) }}
            placeholder="https://searx.example.org"
            style={{ flex: 1 }}
          />
        </div>
      )}
      {provider === 'searxng' && (
        <p className="settings-hint" style={{ fontSize: '11px', margin: '0 0 0 128px' }}>
          {en
            ? 'Your own SearXNG instance with the JSON format enabled (settings.yml → search.formats: json). A local/LAN address requires a one-time confirmation.'
            : 'Deine eigene SearXNG-Instanz mit aktiviertem JSON-Format (settings.yml → search.formats: json). Eine lokale/LAN-Adresse verlangt eine einmalige Bestätigung.'}
          {' '}<a href="https://docs.searxng.org/" target="_blank" rel="noopener noreferrer">docs.searxng.org</a>
        </p>
      )}

      {/* Linkup-Key */}
      {provider === 'linkup' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ minWidth: '120px' }}>API-Key</label>
          {hasLinkupKey ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <span className="status-connected" style={{ fontSize: '12px' }}>{en ? 'Key stored' : 'Key hinterlegt'}</span>
              <button className="settings-refresh" onClick={clearKey} disabled={saving} style={{ color: 'var(--text-error, #e53935)' }}>
                {en ? 'Remove' : 'Entfernen'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
              <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="..." style={{ flex: 1 }} autoComplete="off" />
              <button className="settings-refresh" onClick={saveKey} disabled={saving || !keyInput.trim()}>
                {saving ? '…' : (en ? 'Save' : 'Speichern')}
              </button>
            </div>
          )}
        </div>
      )}
      {provider === 'linkup' && (
        <p className="settings-hint" style={{ fontSize: '11px', margin: '0 0 0 128px' }}>
          <a href={meta.keysUrl} target="_blank" rel="noopener noreferrer">{meta.keysUrl.replace(/^https?:\/\//, '')}</a>
        </p>
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
