import { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import {
  CLOUD_CAPABLE_FEATURES,
  type CloudFeatureId
} from '../../../shared/llmBackend'
import llmbaseLogo from '../../assets/model-vendors/llmbase.svg'

// Anzeige-Labels für Nicht-Matrix-Cloud-Features (identisch zur OpenRouter-Sektion).
const FEATURE_LABELS: Record<CloudFeatureId, { de: string; en: string }> = {
  'notes-chat': { de: 'Notes Chat', en: 'Notes Chat' },
  'note-edit': { de: 'Notiz bearbeiten (KI)', en: 'Note editing (AI)' },
  'quiz': { de: 'Karteikarten & Quiz', en: 'Flashcards & Quiz' },
  'note-agent': { de: 'Notiz-Agent (Dateien erzeugen)', en: 'Note agent (create files)' }
}

// LLMBase Cloud-Backend (opt-in) — llmbase.ai, Eyloo GmbH. EU-Inference (DE/NL/FI/CH),
// DSGVO-Positionierung mit AVV. Gleiche Privacy-Policy wie OpenRouter (shared/llmBackend.ts):
// Default lokal, globaler Opt-in + pro-Feature-Opt-in mit Warnung — auch EU-Cloud ist Cloud.
export function LLMBaseSection() {
  const language = useUIStore(s => s.language)
  const en = language === 'en'
  const ollama = useUIStore(s => s.ollama)
  const setOllama = useUIStore(s => s.setOllama)
  const lb = ollama.llmbase

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; name: string; promptPrice?: string }>>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)

  // hasApiKey aus dem Main reconcilen (der Key liegt verschlüsselt dort, nicht im Store).
  useEffect(() => {
    window.electronAPI.llmbaseHasKey().then(has => {
      if (has !== lb.hasApiKey) setOllama({ llmbase: { ...lb, hasApiKey: has } })
    }).catch(() => { /* ignorieren */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = (next: Partial<typeof lb>) => setOllama({ llmbase: { ...lb, ...next } })

  const saveKey = async () => {
    setSavingKey(true)
    try {
      const res = await window.electronAPI.llmbaseSaveKey(apiKeyInput)
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
    await window.electronAPI.llmbaseClearKey()
    patch({ hasApiKey: false })
  }

  const loadModels = async () => {
    setLoadingModels(true)
    try {
      const res = await window.electronAPI.llmbaseListModels()
      if (res.success) setModels(res.models)
      else setTestResult({ ok: false, msg: res.error || 'Fehler' })
    } finally {
      setLoadingModels(false)
    }
  }

  const runTest = async () => {
    if (!lb.model) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.electronAPI.llmbaseTest(lb.model)
      setTestResult(res.success
        ? { ok: true, msg: (en ? 'OK — answer: ' : 'OK — Antwort: ') + (res.reply || '') }
        : { ok: false, msg: res.error || 'Fehler' })
    } finally {
      setTesting(false)
    }
  }

  // Nicht-Matrix-Features (notes-chat …) — alle personenbezogen → immer Warnung.
  // Auch bei EU-Hosting: Inhalte verlassen den Rechner, das bleibt eine bewusste Entscheidung.
  const toggleFeature = (f: CloudFeatureId, on: boolean) => {
    if (on) {
      const label = en ? FEATURE_LABELS[f].en : FEATURE_LABELS[f].de
      const warn = en
        ? `“${label}” processes note content (personal data). Enabling cloud sends this content to LLMBase (EU inference, GDPR positioning) and leaves your computer. Continue?`
        : `„${label}" verarbeitet Notiz-Inhalte (personenbezogene Daten). Mit Cloud werden diese an LLMBase gesendet (EU-Inference, DSGVO-Positionierung) und verlassen deinen Rechner. Fortfahren?`
      // eslint-disable-next-line no-alert
      if (!window.confirm(warn)) return
    }
    const set = new Set(lb.cloudFeatures)
    if (on) set.add(f); else set.delete(f)
    patch({ cloudFeatures: Array.from(set) })
  }

  return (
    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src={llmbaseLogo} width={20} height={20} alt="" />
          {en ? 'LLMBase (EU cloud) — optional' : 'LLMBase (EU-Cloud) — optional'}
        </label>
        <input
          type="checkbox"
          checked={lb.enabled}
          onChange={e => patch({ enabled: e.target.checked })}
        />
      </div>

      <p className="settings-hint" style={{ fontSize: '11px', margin: 0 }}>
        {en
          ? 'German provider (llmbase.ai): open-weight models on EU servers (DE/NL/FI/CH), GDPR positioning with DPA. Off by default — content still leaves your computer, so every feature needs an explicit opt-in. The Brain module always stays local.'
          : 'Deutscher Anbieter (llmbase.ai): Open-Weight-Modelle auf EU-Servern (DE/NL/FI/CH), DSGVO-Positionierung mit AVV. Standardmäßig aus — Inhalte verlassen trotzdem deinen Rechner, daher braucht jede Funktion ein explizites Opt-in. Das Brain-Modul bleibt immer lokal.'}
      </p>

      {lb.enabled && (
        <>
          {/* API-Key */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ minWidth: '120px' }}>API-Key</label>
            {lb.hasApiKey ? (
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
                  placeholder="sk-..."
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
            <a href="https://llmbase.ai" target="_blank" rel="noopener noreferrer">llmbase.ai</a>
          </p>

          {/* Default-Modell */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ minWidth: '120px' }}>{en ? 'Default model' : 'Standard-Modell'}</label>
            <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
              {models.length > 0 ? (
                <select value={lb.model} onChange={e => patch({ model: e.target.value })} style={{ flex: 1 }}>
                  <option value="">{en ? '— select —' : '— wählen —'}</option>
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={lb.model}
                  onChange={e => patch({ model: e.target.value })}
                  placeholder="qwen/qwen3.5-9b"
                  style={{ flex: 1 }}
                />
              )}
              <button className="settings-refresh" onClick={loadModels} disabled={loadingModels}>
                {loadingModels ? '…' : (en ? 'Load models' : 'Modelle laden')}
              </button>
            </div>
          </div>

          {/* Verbindungstest */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ minWidth: '120px' }}></label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
              <button className="settings-refresh" onClick={runTest} disabled={testing || !lb.hasApiKey || !lb.model}>
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
                : 'Jede Funktion einzeln freischalten. ⚠️ = sendet Notiz-Inhalte in die Cloud. Die E-Mail-Analyse stellst du im Email-Tab ein (Analyse-Modell → „☁️ LLMBase").'}
            </p>
            {CLOUD_CAPABLE_FEATURES.map(f => (
              <div key={f} className="settings-row" style={{ padding: '4px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span title={en ? 'personal data' : 'personenbezogene Daten'}>⚠️</span>
                  {en ? FEATURE_LABELS[f].en : FEATURE_LABELS[f].de}
                </label>
                <input
                  type="checkbox"
                  checked={lb.cloudFeatures.includes(f)}
                  disabled={!lb.hasApiKey || !lb.model}
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
