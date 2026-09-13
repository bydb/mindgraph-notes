// Antares-Einstellungen — die Settings-Hälfte der Antares-Vertikale (Renderer).
//
// Über den generischen Slot `settings.section` gemountet (siehe ./index.tsx). Config
// (baseUrl/context/enabled) läuft über die GENERISCHE Plugin-Config-API (usePluginConfig),
// Credentials über invokePlugin('antares', …). Self-Gating: bei deaktiviertem Modul steht
// die gestrichelte Karte mit Sprung zum Modul-Tab. Nach Löschen des Plugin-Ordners ist der
// Slot leer → die Antares-Settings verschwinden rückstandslos (Deletion Test).
//
// Redesign 09/2026: eine Dienst-Karte (Status-Chip, Verbindung testen), Zugangsdaten als
// Auto-Save-Felder — gespeichert wird, sobald Benutzername UND Passwort vorliegen.

import { useEffect, useState } from 'react'
import { useTranslation } from '../../../renderer/utils/translations'
import { invokePlugin } from '../../../renderer/plugins/client'
import { usePluginConfig } from '../../../renderer/plugins/config'
import { ANTARES_DEFAULTS } from '../../../renderer/stores/antaresStore'
import { PageHeader, Card, ServiceHead, IconTile, Row, Note, Button, TextInput, SecretField } from '../../../renderer/components/Settings/SettingsUI'

type TestStatus = 'idle' | 'testing' | 'success' | 'failed'

const BOX_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
  </svg>
)

/** `onGoToModules` wird vom Settings-Slot durchgereicht (Sprung zum Modul-Tab). */
export default function AntaresSettings({ onGoToModules }: { onGoToModules?: () => void }) {
  const { t } = useTranslation()
  const [antares, setAntares] = usePluginConfig('antares', ANTARES_DEFAULTS)

  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [credsSaved, setCredsSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    invokePlugin<{ username: string; password: string } | null>('antares', 'antares.loadCredentials')
      .then(creds => {
        if (creds) {
          setUser(creds.username)
          setPassword(creds.password)
          setCredsSaved(!!creds.username && !!creds.password)
        }
      })
      .catch(() => {})
  }, [])

  const persist = async (username: string, pw: string) => {
    if (!username || !pw) { setCredsSaved(false); return }
    const saved = await invokePlugin<boolean>('antares', 'antares.saveCredentials', { username, password: pw }).catch(() => false)
    setCredsSaved(!!saved)
  }

  const runTest = async () => {
    setTestError(null)
    if (!user || !password) {
      setTestStatus('failed')
      setTestError(t('settings.agents.antares.saveFirst'))
      return
    }
    await persist(user, password)
    setTestStatus('testing')
    try {
      await invokePlugin('antares', 'antares.check', { baseUrl: antares.baseUrl, context: antares.context })
      setTestStatus('success')
    } catch (err) {
      setTestStatus('failed')
      setTestError(err instanceof Error ? err.message : null)
    }
  }

  const icon = <IconTile bg="#5b6470">{BOX_ICON}</IconTile>

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.agents.antares.title')} subtitle={t('settings.agents.antares.description')} />
      {!antares.enabled ? (
        <Card dashed>
          <ServiceHead
            icon={icon}
            name={t('settings.agents.antares.title')}
            desc={t('settings.moduleGate.disabledHint')}
            dimmed
            actions={<Button onClick={onGoToModules}>{t('settings.plugins.goToModules')}</Button>}
          />
        </Card>
      ) : (
        <Card>
          <ServiceHead
            icon={icon}
            name={t('settings.agents.antares.title')}
            desc={antares.baseUrl ? `${antares.baseUrl.replace(/^https?:\/\//, '')}${antares.context ? ` · ${antares.context}` : ''}` : undefined}
            status={
              testStatus === 'success' ? { tone: 'ok', label: t('settings.agents.antares.connected') }
                : testStatus === 'testing' ? { tone: 'checking', label: t('settings.agents.antares.testing') }
                  : testStatus === 'failed' ? { tone: 'off', label: t('settings.agents.antares.failed') }
                    : credsSaved ? { tone: 'warn', label: t('settings.edoobox.notTested') } : null
            }
            actions={<Button onClick={() => void runTest()} disabled={testStatus === 'testing'}>{t('settings.agents.antares.testConnection')}</Button>}
          />
          {testError && <Note tone="warn" action={t('settings.integ.recheck')} onAction={() => void runTest()}>{testError}</Note>}
          <Row label={t('settings.agents.antares.baseUrl')}>
            <TextInput type="url" value={antares.baseUrl} onCommit={v => setAntares({ baseUrl: v })} placeholder="https://mzantares-he-16.datenbank-bildungsmedien.net" />
          </Row>
          <Row label={t('settings.agents.antares.context')}>
            <TextInput narrow value={antares.context} onCommit={v => setAntares({ context: v })} placeholder="HE/16" />
          </Row>
          <Row label={t('settings.agents.antares.username')}>
            <TextInput value={user} onCommit={v => { setUser(v); void persist(v, password) }} placeholder={t('settings.agents.antares.username')} />
          </Row>
          <Row label={t('settings.agents.antares.password')} hint={t('settings.edoobox.keyHint')}>
            <SecretField
              saved={credsSaved && !!password}
              onSave={async v => { setPassword(v); await persist(user, v) }}
              onRemove={() => { setPassword(''); setCredsSaved(false) }}
              placeholder={t('settings.agents.antares.password')}
            />
          </Row>
        </Card>
      )}
    </div>
  )
}
