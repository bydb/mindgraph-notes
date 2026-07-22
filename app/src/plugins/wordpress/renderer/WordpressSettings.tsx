// WordPress-Einstellungen — die Settings-Hälfte des WordPress-Plugins (Renderer).
//
// War früher die „Marketing"-Sektion im edoobox/Agenten-Tab von Settings.tsx; jetzt im
// Plugin und über den generischen SETTINGS_SECTION_SLOT gemountet → eigener dynamischer
// Tab `plugin:wordpress`. Config (baseUrl/username/defaultPostStatus/enabled) läuft über
// die generische Plugin-Config-API; das App-Passwort über die Plugin-Secrets
// (wordpress.save/loadCredentials). Self-Gating: bei deaktiviertem Modul nur der Hinweis.

import { useEffect, useState } from 'react'
import { useTranslation } from '../../../renderer/utils/translations'
import { usePluginConfig } from '../../../renderer/plugins/config'
import { WORDPRESS_DEFAULTS } from '../../../renderer/stores/uiStore'
import { wordpressClient } from './wordpressClient'

type TestStatus = 'idle' | 'testing' | 'success' | 'failed'

/** `onGoToModules` wird vom Settings-Slot durchgereicht (Sprung zum Modul-Tab). */
export default function WordpressSettings({ onGoToModules }: { onGoToModules?: () => void }) {
  const { t } = useTranslation()
  const [wordpress, setWordpress] = usePluginConfig('wordpress', WORDPRESS_DEFAULTS)

  const [appPassword, setAppPassword] = useState('')
  const [credsSaved, setCredsSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testError, setTestError] = useState<string | null>(null)

  // Hinterlegtes App-Passwort beim Mounten laden (für die Anzeige im Formular).
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

  return (
    <>
      <h4 className="settings-section-title">{t('settings.wordpress.title')}</h4>
      <p className="settings-hint">{t('settings.wordpress.description')}</p>

      {!wordpress.enabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '8px 12px',
            margin: '8px 0 12px',
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border-color)',
            borderRadius: 'var(--radius-md, 6px)',
            fontSize: '12px',
            color: 'var(--text-secondary)'
          }}
        >
          <span>{t('settings.moduleGate.disabledHint')}</span>
          <button
            className="settings-btn-secondary"
            onClick={onGoToModules}
            style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
          >
            {t('settings.moduleGate.goToModules')} →
          </button>
        </div>
      )}

      {wordpress.enabled && (
        <>
          <div className="settings-row">
            <label>{t('settings.wordpress.url')}</label>
            <input
              type="url"
              value={wordpress.baseUrl}
              onChange={e => setWordpress({ baseUrl: e.target.value })}
              placeholder="https://meine-seite.de"
              className="settings-input"
            />
          </div>

          <div className="settings-row">
            <label>{t('settings.wordpress.user')}</label>
            <input
              type="text"
              value={wordpress.username}
              onChange={e => setWordpress({ username: e.target.value })}
              placeholder="admin"
              className="settings-input"
            />
          </div>

          <div className="settings-row">
            <label>{t('settings.wordpress.appPassword')}</label>
            <input
              type="password"
              value={appPassword}
              onChange={e => { setAppPassword(e.target.value); setCredsSaved(false) }}
              placeholder="xxxx xxxx xxxx xxxx"
              className="settings-input"
            />
          </div>

          <div className="settings-row" style={{ gap: '8px' }}>
            <button
              className="settings-btn"
              onClick={async () => {
                if (appPassword) {
                  const saved = await wordpressClient.saveCredentials(appPassword)
                  setCredsSaved(saved)
                }
              }}
            >
              {credsSaved ? t('settings.wordpress.saved') : t('settings.wordpress.save')}
            </button>
            <button
              className="settings-btn"
              disabled={testStatus === 'testing'}
              onClick={async () => {
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
              }}
            >
              {testStatus === 'testing'
                ? t('settings.wordpress.testing')
                : t('settings.wordpress.testConnection')}
            </button>
            {testStatus === 'success' && (
              <span className="status-connected">{t('settings.wordpress.connected')}</span>
            )}
            {testStatus === 'failed' && (
              <span className="status-disconnected">{t('settings.wordpress.failed')}</span>
            )}
          </div>
          {testError && (
            <div className="settings-row">
              <span className="settings-error-detail">{testError}</span>
            </div>
          )}

          <div className="settings-row">
            <label>{t('settings.wordpress.defaultStatus')}</label>
            <select
              value={wordpress.defaultPostStatus}
              onChange={e => setWordpress({ defaultPostStatus: e.target.value as 'draft' | 'publish' })}
              className="settings-select"
            >
              <option value="draft">{t('settings.wordpress.statusDraft')}</option>
              <option value="publish">{t('settings.wordpress.statusPublish')}</option>
            </select>
          </div>
        </>
      )}
    </>
  )
}
