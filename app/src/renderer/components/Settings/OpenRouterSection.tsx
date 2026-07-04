import { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import {
  CLOUD_CAPABLE_FEATURES,
  type CloudFeatureId
} from '../../../shared/llmBackend'

// Anzeige-Labels für Nicht-Matrix-Cloud-Features.
const FEATURE_LABELS: Record<CloudFeatureId, { de: string; en: string }> = {
  'notes-chat': { de: 'Notes Chat', en: 'Notes Chat' },
  'note-edit': { de: 'Notiz bearbeiten (KI)', en: 'Note editing (AI)' },
  'quiz': { de: 'Karteikarten & Quiz', en: 'Flashcards & Quiz' },
  'note-agent': { de: 'Notiz-Agent (Dateien erzeugen)', en: 'Note agent (create files)' }
}

// OpenRouter Cloud-Backend (opt-in). Privacy-Modell siehe shared/llmBackend.ts:
// Default lokal, globaler Opt-in + pro-Modul-Opt-in, sensible Module mit Warnung.
export function OpenRouterSection() {
  const language = useUIStore(s => s.language)
  const en = language === 'en'
  const ollama = useUIStore(s => s.ollama)
  const setOllama = useUIStore(s => s.setOllama)
  const or = ollama.openrouter

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; name: string; promptPrice?: string }>>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [freeOnly, setFreeOnly] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)

  // hasApiKey aus dem Main reconcilen (der Key liegt verschlüsselt dort, nicht im Store).
  useEffect(() => {
    window.electronAPI.openrouterHasKey().then(has => {
      if (has !== or.hasApiKey) setOllama({ openrouter: { ...or, hasApiKey: has } })
    }).catch(() => { /* ignorieren */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = (next: Partial<typeof or>) => setOllama({ openrouter: { ...or, ...next } })

  // Ein Modell ist kostenlos, wenn die ID auf ':free' endet oder der Prompt-Preis 0 ist.
  const isFreeModel = (m: { id: string; promptPrice?: string }) =>
    /:free$/i.test(m.id) || m.promptPrice === '0' || (m.promptPrice != null && parseFloat(m.promptPrice) === 0)
  const freeModels = models.filter(isFreeModel)
  const paidModels = models.filter(m => !isFreeModel(m))

  const saveKey = async () => {
    setSavingKey(true)
    try {
      const res = await window.electronAPI.openrouterSaveKey(apiKeyInput)
      if (res.success) {
        patch({ hasApiKey: !!res.hasKey })
        setApiKeyInput('')
      } else {
        setTestResult({ ok: false, msg: res.error || 'Fehler beim Speichern' })
      }
    } finally {
      setSavingKey(false)
    }
  }

  const clearKey = async () => {
    await window.electronAPI.openrouterClearKey()
    patch({ hasApiKey: false })
  }

  const loadModels = async () => {
    setLoadingModels(true)
    try {
      const res = await window.electronAPI.openrouterListModels()
      if (res.success) setModels(res.models)
      else setTestResult({ ok: false, msg: res.error || 'Fehler' })
    } finally {
      setLoadingModels(false)
    }
  }

  const runTest = async () => {
    if (!or.model) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.electronAPI.openrouterTest(or.model)
      setTestResult(res.success
        ? { ok: true, msg: (en ? 'OK — answer: ' : 'OK — Antwort: ') + (res.reply || '') }
        : { ok: false, msg: res.error || 'Fehler' })
    } finally {
      setTesting(false)
    }
  }

  // Nicht-Matrix-Features (notes-chat …) — alle personenbezogen → immer Warnung.
  const toggleFeature = (f: CloudFeatureId, on: boolean) => {
    if (on) {
      const label = en ? FEATURE_LABELS[f].en : FEATURE_LABELS[f].de
      const warn = en
        ? `“${label}” processes note content (personal data). Enabling cloud sends this content to OpenRouter and leaves your computer. Continue?`
        : `„${label}" verarbeitet Notiz-Inhalte (personenbezogene Daten). Mit Cloud werden diese an OpenRouter gesendet und verlassen deinen Rechner. Fortfahren?`
      // eslint-disable-next-line no-alert
      if (!window.confirm(warn)) return
    }
    const set = new Set(or.cloudFeatures)
    if (on) set.add(f); else set.delete(f)
    patch({ cloudFeatures: Array.from(set) })
  }

  return (
    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontWeight: 600 }}>
          {en ? 'OpenRouter (Cloud) — optional' : 'OpenRouter (Cloud) — optional'}
        </label>
        <input
          type="checkbox"
          checked={or.enabled}
          onChange={e => patch({ enabled: e.target.checked })}
        />
      </div>

      <p className="settings-hint" style={{ fontSize: '11px', margin: 0 }}>
        {en
          ? 'For weak hardware: route AI to cloud models instead of local Ollama. Off by default — everything stays local unless you opt in per module below. The Brain module always stays local.'
          : 'Für schwache Hardware: KI über Cloud-Modelle statt lokales Ollama. Standardmäßig aus — alles bleibt lokal, bis du unten pro Modul zustimmst. Das Brain-Modul bleibt immer lokal.'}
      </p>

      {or.enabled && (
        <>
          {/* API-Key */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ minWidth: '120px' }}>API-Key</label>
            {or.hasApiKey ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <span className="status-connected" style={{ fontSize: '12px' }}>
                  {en ? '✓ Key stored' : '✓ Key hinterlegt'}
                </span>
                <button className="settings-refresh" onClick={clearKey} style={{ color: 'var(--text-error, #e53935)' }}>
                  {en ? 'Remove' : 'Entfernen'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  placeholder="sk-or-..."
                  style={{ flex: 1 }}
                  autoComplete="off"
                />
                <button className="settings-refresh" onClick={saveKey} disabled={savingKey || !apiKeyInput.trim()}>
                  {savingKey ? '…' : (en ? 'Save' : 'Speichern')}
                </button>
              </div>
            )}
          </div>
          <p className="settings-hint" style={{ fontSize: '11px', margin: '0 0 0 128px' }}>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a>
          </p>

          {/* Default-Modell */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ minWidth: '120px' }}>{en ? 'Default model' : 'Standard-Modell'}</label>
            <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
              {models.length > 0 ? (
                <select value={or.model} onChange={e => patch({ model: e.target.value })} style={{ flex: 1 }}>
                  <option value="">{en ? '— select —' : '— wählen —'}</option>
                  {freeModels.length > 0 && (
                    <optgroup label={en ? '🆓 Free' : '🆓 Kostenlos'}>
                      {freeModels.map(m => (
                        <option key={m.id} value={m.id}>🆓 {m.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {!freeOnly && paidModels.length > 0 && (
                    <optgroup label={en ? 'Paid (pay-as-you-go)' : 'Kostenpflichtig (Guthaben nötig)'}>
                      {paidModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name}{m.promptPrice ? ` (${m.promptPrice}$/tok)` : ''}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  value={or.model}
                  onChange={e => patch({ model: e.target.value })}
                  placeholder="qwen/qwen-2.5-7b-instruct"
                  style={{ flex: 1 }}
                />
              )}
              <button className="settings-refresh" onClick={loadModels} disabled={loadingModels}>
                {loadingModels ? '…' : (en ? 'Load models' : 'Modelle laden')}
              </button>
            </div>
          </div>
          {models.length > 0 && (
            <p className="settings-hint" style={{ fontSize: '11px', margin: '4px 0 0 128px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={freeOnly} onChange={e => setFreeOnly(e.target.checked)} />
                {en ? `Only free models (🆓 ${freeModels.length})` : `Nur kostenlose Modelle (🆓 ${freeModels.length})`}
              </label>
              <span style={{ opacity: 0.7 }}>
                {en ? '— 🆓 = no credit needed (rate-limited)' : '— 🆓 = ohne Guthaben nutzbar (ratenbegrenzt)'}
              </span>
            </p>
          )}

          {/* Verbindungstest */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ minWidth: '120px' }}></label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
              <button className="settings-refresh" onClick={runTest} disabled={testing || !or.hasApiKey || !or.model}>
                {testing ? '…' : (en ? 'Test connection' : 'Verbindung testen')}
              </button>
              {testResult && (
                <span className={testResult.ok ? 'status-connected' : 'status-disconnected'} style={{ fontSize: '12px' }}>
                  {testResult.msg}
                </span>
              )}
            </div>
          </div>

          {/* Pro-Funktion-Opt-in (nur tatsächlich verdrahtete Cloud-Funktionen) */}
          <div style={{ marginTop: '6px' }}>
            <label style={{ fontWeight: 600, fontSize: '13px' }}>
              {en ? 'Use cloud for these features' : 'Cloud für diese Funktionen nutzen'}
            </label>
            <p className="settings-hint" style={{ fontSize: '11px', margin: '2px 0 8px' }}>
              {en
                ? 'Each feature must be enabled individually. ⚠️ = sends note content to the cloud. Email analysis is configured in the Email tab.'
                : 'Jede Funktion einzeln freischalten. ⚠️ = sendet Notiz-Inhalte in die Cloud. Die E-Mail-Analyse stellst du im Email-Tab ein (Analyse-Modell → „☁️ OpenRouter").'}
            </p>
            {CLOUD_CAPABLE_FEATURES.map(f => (
              <div key={f} className="settings-row" style={{ padding: '4px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span title={en ? 'personal data' : 'personenbezogene Daten'}>⚠️</span>
                  {en ? FEATURE_LABELS[f].en : FEATURE_LABELS[f].de}
                </label>
                <input
                  type="checkbox"
                  checked={or.cloudFeatures.includes(f)}
                  disabled={!or.hasApiKey || !or.model}
                  onChange={e => toggleFeature(f, e.target.checked)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
