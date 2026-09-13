// WordPress-Einstellungen — die Settings-Hälfte des WordPress-Plugins (Renderer).
//
// Über den generischen SETTINGS_SECTION_SLOT gemountet → eigener dynamischer Tab
// `plugin:wordpress`. Config (baseUrl/username/defaultPostStatus/enabled) läuft über die
// generische Plugin-Config-API; das App-Passwort über die Plugin-Secrets
// (wordpress.save/loadCredentials). Self-Gating: bei deaktiviertem Modul nur die
// gestrichelte Karte mit Sprung zum Modul-Tab.
//
// Redesign 09/2026: eine Dienst-Karte mit Status-Chip und „Verbindung testen"; das
// Anwendungspasswort wird beim Verlassen des Felds gespeichert.

import { useEffect, useState } from 'react'
import { useTranslation } from '../../../renderer/utils/translations'
import { usePluginConfig } from '../../../renderer/plugins/config'
import { WORDPRESS_DEFAULTS } from '../../../renderer/stores/uiStore'
import { wordpressClient } from './wordpressClient'
import { PageHeader, Card, ServiceHead, IconTile, Row, Note, Button, TextInput, SecretField, Segmented } from '../../../renderer/components/Settings/SettingsUI'

type TestStatus = 'idle' | 'testing' | 'success' | 'failed'

/** `onGoToModules` wird vom Settings-Slot durchgereicht (Sprung zum Modul-Tab). */
export default function WordpressSettings({ onGoToModules }: { onGoToModules?: () => void }) {
  const { t } = useTranslation()
  const [wordpress, setWordpress] = usePluginConfig('wordpress', WORDPRESS_DEFAULTS)

  const [appPassword, setAppPassword] = useState('')
  const [credsSaved, setCredsSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    wordpressClient.loadCredentials()
      .then(creds => {
        if (creds?.wpAppPassword) {
          setAppPassword(creds.wpAppPassword)
          setCredsSaved(true)
        }
      })
      .catch(() => {})
  }, [])

  const runTest = async () => {
    setTestError(null)
    if (!wordpress.baseUrl || !wordpress.username || !appPassword) {
      setTestStatus('failed')
      setTestError(t('settings.wordpress.fillAll'))
      return
    }
    // Erst speichern, dann testen (der Check zieht das Passwort aus den Secrets)
    await wordpressClient.saveCredentials(appPassword)
    setCredsSaved(true)
    setTestStatus('testing')
    const result = await wordpressClient.check(wordpress.baseUrl, wordpress.username)
    setTestStatus(result.success ? 'success' : 'failed')
    setTestError(result.success ? null : (result.error || null))
  }

  const icon = <IconTile bg="#21759b" text="W" serif />

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.wordpress.title')} subtitle={t('settings.wordpress.description')} />
      {!wordpress.enabled ? (
        <Card dashed>
          <ServiceHead
            icon={icon}
            name={t('settings.wordpress.title')}
            desc={t('settings.moduleGate.disabledHint')}
            dimmed
            actions={<Button onClick={onGoToModules}>{t('settings.plugins.goToModules')}</Button>}
          />
        </Card>
      ) : (
        <Card>
          <ServiceHead
            icon={icon}
            name={wordpress.baseUrl ? wordpress.baseUrl.replace(/^https?:\/\//, '') : t('settings.wordpress.title')}
            desc="WordPress · REST API"
            status={
              testStatus === 'success' ? { tone: 'ok', label: t('settings.wordpress.connected') }
                : testStatus === 'testing' ? { tone: 'checking', label: t('settings.wordpress.testing') }
                  : testStatus === 'failed' ? { tone: 'off', label: t('settings.wordpress.failed') }
                    : credsSaved ? { tone: 'warn', label: t('settings.edoobox.notTested') } : null
            }
            actions={<Button onClick={() => void runTest()} disabled={testStatus === 'testing'}>{t('settings.wordpress.testConnection')}</Button>}
          />
          {testError && <Note tone="warn" action={t('settings.integ.recheck')} onAction={() => void runTest()}>{testError}</Note>}
          <Row label={t('settings.wordpress.url')}>
            <TextInput type="url" value={wordpress.baseUrl} onCommit={v => setWordpress({ baseUrl: v })} placeholder="https://meine-seite.de" />
          </Row>
          <Row label={t('settings.wordpress.user')}>
            <TextInput value={wordpress.username} onCommit={v => setWordpress({ username: v })} placeholder="admin" />
          </Row>
          <Row label={t('settings.wordpress.appPassword')} hint={t('settings.edoobox.keyHint')}>
            <SecretField
              saved={credsSaved && !!appPassword}
              suffix={appPassword ? appPassword.replace(/\s+/g, '').slice(-4) : null}
              onSave={async v => {
                setAppPassword(v)
                setCredsSaved(await wordpressClient.saveCredentials(v))
              }}
              onRemove={() => { setAppPassword(''); setCredsSaved(false) }}
              placeholder="xxxx xxxx xxxx xxxx"
            />
          </Row>
          <Row label={t('settings.wordpress.defaultStatus')}>
            <Segmented
              options={[{ value: 'draft' as const, label: t('settings.wordpress.statusDraft') }, { value: 'publish' as const, label: t('settings.wordpress.statusPublish') }]}
              value={wordpress.defaultPostStatus}
              onChange={v => setWordpress({ defaultPostStatus: v })}
              ariaLabel={t('settings.wordpress.defaultStatus')}
            />
          </Row>
        </Card>
      )}
    </div>
  )
}
