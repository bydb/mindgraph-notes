// Cloud-Anbieter-Karte (OpenRouter, LLMBase) — EINE Komponente für beide, weil die beiden
// Sektionen vorher zeilengleich waren und nur in IPC-Namen, Logo und Texten abwichen.
//
// Privacy-Modell siehe shared/llmBackend.ts: Default lokal, globaler Opt-in (Schalter im
// Kopf) + pro-Funktion-Opt-in mit Rückfrage. Aus = nur der Kopf (die Karte „kollabiert").
//
// LLMBase: KEINE pauschale EU-Zusage (27.08.2026). Der Anbieter formuliert selbst, dass die
// Verarbeitungsregion vom MODELL abhängt; der Katalog enthält kein Regionsfeld. Deshalb der
// vorsichtige Hinweis in der Karte — eine Zusage, die wir nicht prüfen können, geben wir nicht.

import { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import {
  CLOUD_CAPABLE_FEATURES,
  isCloudProviderReady,
  type CloudFeatureId,
  type CloudProviderSettings
} from '../../../shared/llmBackend'
import { formatPricing, type ModelPricing } from '../../../shared/llmCost'
import { useTranslation } from '../../utils/translations'
import openrouterLogo from '../../assets/model-vendors/openrouter.svg'
import llmbaseLogo from '../../assets/model-vendors/llmbase.svg'
import { ExternalLink } from '../Shared/ExternalLink'
import { Card, ServiceHead, IconTile, Row, Note, Toggle, Select, Button, SecretField, TextInput } from './SettingsUI'

// Preis-Etikett des Modell-Pickers. Stand bis 28.08.2026 fest auf Deutsch in
// shared/llmCost.ts — im englischen Picker las sich das als "je 1 Mio.".
const DE_PRICE_LABELS = { free: 'gratis', perMillion: 'je 1 Mio.' }
const EN_PRICE_LABELS = { free: 'free', perMillion: 'per 1M' }

// Anzeige-Labels für Nicht-Matrix-Cloud-Features.
const FEATURE_LABELS: Record<CloudFeatureId, { de: string; en: string }> = {
  'notes-chat': { de: 'Notes Chat', en: 'Notes Chat' },
  'note-edit': { de: 'Notiz bearbeiten (KI)', en: 'Note editing (AI)' },
  'quiz': { de: 'Karteikarten & Quiz', en: 'Flashcards & Quiz' },
  'note-agent': { de: 'Notiz-Agent (Aufträge mit Vault-Zugriff)', en: 'Note agent (tasks with vault access)' }
}

type ProviderId = 'openrouter' | 'llmbase'
type ModelEntry = { id: string; name: string; promptPrice?: string; pricing?: ModelPricing }

const PROVIDERS: Record<ProviderId, {
  name: string
  logo: string
  keysUrl: string
  keyPlaceholder: string
  modelPlaceholder: string
  hasKey: () => Promise<boolean>
  saveKey: (key: string) => Promise<{ success: boolean; hasKey?: boolean; error?: string }>
  clearKey: () => Promise<unknown>
  listModels: () => Promise<{ success: boolean; models?: ModelEntry[]; error?: string }>
  test: (model: string) => Promise<{ success: boolean; reply?: string; error?: string }>
  /** kostenlose Modelle gesondert anbieten (OpenRouter kennt „:free"-Varianten) */
  freeTier: boolean
}> = {
  openrouter: {
    name: 'OpenRouter',
    logo: openrouterLogo,
    keysUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-...',
    modelPlaceholder: 'qwen/qwen-2.5-7b-instruct',
    hasKey: () => window.electronAPI.openrouterHasKey(),
    saveKey: key => window.electronAPI.openrouterSaveKey(key),
    clearKey: () => window.electronAPI.openrouterClearKey(),
    listModels: () => window.electronAPI.openrouterListModels(),
    test: model => window.electronAPI.openrouterTest(model),
    freeTier: true
  },
  llmbase: {
    name: 'LLMBase',
    logo: llmbaseLogo,
    keysUrl: 'https://llmbase.ai',
    keyPlaceholder: 'sk-...',
    modelPlaceholder: 'qwen/qwen3.5-9b',
    hasKey: () => window.electronAPI.llmbaseHasKey(),
    saveKey: key => window.electronAPI.llmbaseSaveKey(key),
    clearKey: () => window.electronAPI.llmbaseClearKey(),
    listModels: () => window.electronAPI.llmbaseListModels(),
    test: model => window.electronAPI.llmbaseTest(model),
    freeTier: false
  }
}

export function CloudProviderSection({ provider }: { provider: ProviderId }) {
  const { t } = useTranslation()
  const en = useUIStore(s => s.language) === 'en'
  const ollama = useUIStore(s => s.ollama)
  const setOllama = useUIStore(s => s.setOllama)
  const settings: CloudProviderSettings = ollama[provider]
  const meta = PROVIDERS[provider]

  const [savingKey, setSavingKey] = useState(false)
  const [models, setModels] = useState<ModelEntry[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [freeOnly, setFreeOnly] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)

  // hasApiKey aus dem Main reconcilen (der Key liegt verschlüsselt dort, nicht im Store).
  useEffect(() => {
    meta.hasKey().then(has => {
      if (has !== settings.hasApiKey) setOllama({ [provider]: { ...settings, hasApiKey: has } })
    }).catch(() => { /* ignorieren */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = (next: Partial<CloudProviderSettings>) => setOllama({ [provider]: { ...settings, ...next } })

  const isFreeModel = (m: ModelEntry) =>
    /:free$/i.test(m.id) || m.promptPrice === '0' || (m.promptPrice != null && parseFloat(m.promptPrice) === 0)
  const freeModels = meta.freeTier ? models.filter(isFreeModel) : []
  const paidModels = meta.freeTier ? models.filter(m => !isFreeModel(m)) : models
  const priceLabels = en ? EN_PRICE_LABELS : DE_PRICE_LABELS

  const saveKey = async (key: string) => {
    setSavingKey(true)
    setTestResult(null)
    try {
      const res = await meta.saveKey(key)
      if (res.success) patch({ hasApiKey: !!res.hasKey })
      else setTestResult({ ok: false, msg: res.error || t('settings.cloud.saveFailed') })
    } finally {
      setSavingKey(false)
    }
  }

  const clearKey = async () => {
    await meta.clearKey()
    patch({ hasApiKey: false })
  }

  const loadModels = async () => {
    setLoadingModels(true)
    try {
      const res = await meta.listModels()
      if (res.success && res.models) setModels(res.models)
      else setTestResult({ ok: false, msg: res.error || t('settings.cloud.loadFailed') })
    } finally {
      setLoadingModels(false)
    }
  }

  const runTest = async () => {
    if (!settings.model) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await meta.test(settings.model)
      setTestResult(res.success
        ? { ok: true, msg: t('settings.cloud.testOk', { reply: res.reply || '' }) }
        : { ok: false, msg: res.error || t('settings.cloud.testFailed') })
    } finally {
      setTesting(false)
    }
  }

  // Alle Cloud-Features verarbeiten Notiz-Inhalte → jede Freischaltung mit Rückfrage.
  const toggleFeature = (f: CloudFeatureId, on: boolean) => {
    if (on) {
      const label = en ? FEATURE_LABELS[f].en : FEATURE_LABELS[f].de
      // eslint-disable-next-line no-alert
      if (!window.confirm(t('settings.cloud.featureConfirm', { label, provider: meta.name }))) return
    }
    const set = new Set(settings.cloudFeatures)
    if (on) set.add(f); else set.delete(f)
    patch({ cloudFeatures: Array.from(set) })
  }

  const ready = isCloudProviderReady(settings)
  const status = !settings.enabled
    ? null
    : ready
      ? { tone: 'ok' as const, label: t('settings.cloud.ready') }
      : { tone: 'warn' as const, label: !settings.hasApiKey ? t('settings.cloud.keyMissing') : t('settings.cloud.modelMissing') }

  const featuresLocked = !settings.hasApiKey || !settings.model

  return (
    <Card>
      <ServiceHead
        icon={<IconTile neutral={!settings.enabled} bg="var(--bg-tertiary)"><img src={meta.logo} alt="" /></IconTile>}
        name={t(`settings.cloud.${provider}.name`)}
        desc={t(`settings.cloud.${provider}.desc`)}
        status={status}
        dimmed={!settings.enabled}
        plain={!settings.enabled}
        toggle={{ checked: settings.enabled, onChange: v => patch({ enabled: v }), ariaLabel: meta.name }}
      />
      {settings.enabled && (
        <>
          {provider === 'llmbase' && <Note tone="muted">{t('settings.cloud.llmbase.regionNote')}</Note>}
          <Row
            label={t('settings.cloud.apiKey')}
            hint={<>{t('settings.cloud.apiKeyHint')} · <ExternalLink href={meta.keysUrl}>{meta.keysUrl.replace(/^https?:\/\//, '')}</ExternalLink></>}
          >
            <SecretField
              saved={settings.hasApiKey}
              onSave={saveKey}
              onRemove={clearKey}
              placeholder={meta.keyPlaceholder}
              busy={savingKey}
            />
          </Row>
          <Row label={t('settings.cloud.defaultModel')} hint={models.length === 0 ? t('settings.cloud.defaultModelHint') : undefined}>
            {models.length > 0 ? (
              <Select value={settings.model} onChange={e => patch({ model: e.target.value })} style={{ maxWidth: 320 }}>
                <option value="">{t('settings.cloud.select')}</option>
                {freeModels.length > 0 && (
                  <optgroup label={t('settings.cloud.groupFree')}>
                    {freeModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                )}
                {!freeOnly && paidModels.length > 0 && (
                  <optgroup label={meta.freeTier ? t('settings.cloud.groupPaid') : t('settings.cloud.groupModels')}>
                    {paidModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}{m.pricing ? ` — ${formatPricing(m.pricing, priceLabels)}` : ''}</option>
                    ))}
                  </optgroup>
                )}
              </Select>
            ) : (
              <TextInput value={settings.model} onCommit={v => patch({ model: v })} placeholder={meta.modelPlaceholder} />
            )}
            <Button onClick={() => void loadModels()} disabled={loadingModels}>
              {loadingModels ? '…' : t('settings.cloud.loadModels')}
            </Button>
          </Row>
          {meta.freeTier && models.length > 0 && (
            <Row label={t('settings.cloud.freeOnly')} hint={t('settings.cloud.freeOnlyHint', { n: freeModels.length })} htmlFor={`${provider}-free-only`}>
              <Toggle id={`${provider}-free-only`} checked={freeOnly} onChange={setFreeOnly} />
            </Row>
          )}
          <Row label={t('settings.cloud.test')} hint={t('settings.cloud.testHint')}>
            <Button onClick={() => void runTest()} disabled={testing || !settings.hasApiKey || !settings.model}>
              {testing ? '…' : t('settings.cloud.test')}
            </Button>
          </Row>
          {testResult && <Note tone={testResult.ok ? 'ok' : 'danger'}>{testResult.msg}</Note>}
          <Row label={t('settings.cloud.features')} hint={t('settings.cloud.featuresHint')} />
          {CLOUD_CAPABLE_FEATURES.map(f => (
            <Row key={f} label={en ? FEATURE_LABELS[f].en : FEATURE_LABELS[f].de} htmlFor={`${provider}-feature-${f}`} disabled={featuresLocked}>
              <Toggle
                id={`${provider}-feature-${f}`}
                checked={settings.cloudFeatures.includes(f)}
                disabled={featuresLocked}
                onChange={v => toggleFeature(f, v)}
              />
            </Row>
          ))}
        </>
      )}
    </Card>
  )
}
