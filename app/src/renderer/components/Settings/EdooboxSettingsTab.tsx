// Einstellungen → Edoobox (Redesign 09/2026): eine Dienst-Karte für die API-Zugangsdaten.
// Key und Secret liegen in safeStorage (edooboxService); gespeichert wird, sobald beide da sind.

import React, { useEffect, useState } from 'react'
import { EDOOBOX_DEFAULTS } from '../../stores/uiStore'
import { usePluginConfig } from '../../plugins/config'
import { edooboxService } from '../../stores/edooboxServiceBridge'
import { setModuleEnabled, useIsModuleEnabled } from '../../utils/modules'
import type { TabTFn } from './settingsTypes'
import { PageHeader, Card, ServiceHead, IconTile, Row, Note, Button, SecretField, TextInput, ModuleOffCard } from './SettingsUI'

const LOGO = new URL('../../assets/edoobox-logo.png', import.meta.url).href

export const EdooboxSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const enabled = useIsModuleEnabled('mz-suite')
  const [settings, setSettings] = usePluginConfig('edoobox', EDOOBOX_DEFAULTS)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    edooboxService.loadCredentials().then(creds => {
      if (creds) {
        setApiKey(creds.apiKey)
        setApiSecret(creds.apiSecret)
        setSaved(!!creds.apiKey && !!creds.apiSecret)
      }
    })
  }, [])

  const persist = async (key: string, secret: string) => {
    if (!key || !secret) { setSaved(false); return }
    const ok = await edooboxService.saveCredentials(key, secret)
    setSaved(ok)
  }

  const runTest = async () => {
    setTestError(null)
    if (!apiKey || !apiSecret) {
      setTest('failed')
      setTestError(t('settings.agents.edoobox.saveFirst'))
      return
    }
    await persist(apiKey, apiSecret)
    setTest('testing')
    const result = await edooboxService.check(settings.baseUrl, settings.apiVersion)
    setTest(result.success ? 'success' : 'failed')
    setTestError(result.success ? null : (result.error || null))
  }

  const icon = <IconTile bg="#fff"><img src={LOGO} alt="" /></IconTile>

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.tab.agents')} subtitle={t('settings.edoobox.subtitle')} />
      {!enabled ? (
        <ModuleOffCard icon={icon} name={t('settings.edoobox.serviceName')} onEnable={() => { void setModuleEnabled('mz-suite', true).catch(err => console.error('[settings] mz-suite:', err)) }} />
      ) : (
        <Card>
          <ServiceHead
            icon={icon}
            name={t('settings.edoobox.serviceName')}
            desc={`${settings.baseUrl} · API ${settings.apiVersion}`}
            status={
              test === 'success' ? { tone: 'ok', label: t('settings.agents.edoobox.connected') }
                : test === 'testing' ? { tone: 'checking', label: t('settings.agents.edoobox.testing') }
                  : test === 'failed' ? { tone: 'off', label: t('settings.agents.edoobox.failed') }
                    : saved ? { tone: 'warn', label: t('settings.edoobox.notTested') } : null
            }
            actions={<Button onClick={() => void runTest()} disabled={test === 'testing'}>{t('settings.agents.edoobox.testConnection')}</Button>}
          />
          {testError && <Note tone="warn" action={t('settings.integ.recheck')} onAction={() => void runTest()}>{testError}</Note>}
          <Row label={t('settings.agents.edoobox.baseUrl')}>
            <TextInput type="url" value={settings.baseUrl} onCommit={v => setSettings({ baseUrl: v })} placeholder={EDOOBOX_DEFAULTS.baseUrl} />
          </Row>
          <Row label={t('settings.agents.edoobox.apiKey')} hint={t('settings.edoobox.keyHint')}>
            <SecretField
              saved={saved && !!apiKey}
              suffix={apiKey ? apiKey.slice(-4) : null}
              onSave={async v => { setApiKey(v); await persist(v, apiSecret) }}
              onRemove={async () => { setApiKey(''); setSaved(false) }}
              placeholder="API Key"
            />
          </Row>
          <Row label={t('settings.agents.edoobox.apiSecret')} hint={t('settings.edoobox.keyHint')}>
            <SecretField
              saved={saved && !!apiSecret}
              suffix={apiSecret ? apiSecret.slice(-4) : null}
              onSave={async v => { setApiSecret(v); await persist(apiKey, v) }}
              onRemove={async () => { setApiSecret(''); setSaved(false) }}
              placeholder="API Secret"
            />
          </Row>
          {!saved && (apiKey || apiSecret) && (!apiKey || !apiSecret) && (
            <Note tone="muted">{t('settings.edoobox.secretMissing')}</Note>
          )}
          <Row label={t('settings.agents.edoobox.webhookUrl')} hint={t('settings.agents.edoobox.webhookHint')}>
            <TextInput type="url" value={settings.webhookUrl || ''} onCommit={v => setSettings({ webhookUrl: v })} placeholder="https://hooks.zapier.com/…" />
          </Row>
        </Card>
      )}
      <p className="sui-hero-note">{t('settings.agents.moreAgents')}</p>
    </div>
  )
}
