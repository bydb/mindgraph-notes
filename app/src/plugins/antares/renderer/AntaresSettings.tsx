// Antares-Einstellungen — die Settings-Hälfte der Antares-Vertikale (Renderer).
//
// War früher inline in Settings.tsx (agents-Tab); jetzt im Plugin und über den generischen
// Slot `settings.section` gemountet (siehe ./index.tsx). Config (baseUrl/context/enabled)
// läuft über die GENERISCHE Plugin-Config-API (usePluginConfig) — kein Zugriff mehr auf
// `state.antares.*`. Credentials über invokePlugin('antares', …). Self-Gating: bei
// deaktiviertem Modul zeigt es den Hinweis statt der Felder. Nach Löschen des Plugin-Ordners
// ist der Slot leer → die Antares-Settings verschwinden rückstandslos (Deletion Test).

import { useEffect, useState } from 'react'
import { useTranslation } from '../../../renderer/utils/translations'
import { invokePlugin } from '../../../renderer/plugins/client'
import { usePluginConfig } from '../../../renderer/plugins/config'
import { ANTARES_DEFAULTS } from '../../../renderer/stores/antaresStore'

type TestStatus = 'idle' | 'testing' | 'success' | 'failed'

/** `onGoToModules` wird vom Settings-Slot durchgereicht (Sprung zum Modul-Tab). */
export default function AntaresSettings({ onGoToModules }: { onGoToModules?: () => void }) {
  const { t } = useTranslation()
  const [antares, setAntares] = usePluginConfig('antares', ANTARES_DEFAULTS)

  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [credsSaved, setCredsSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testError, setTestError] = useState<string | null>(null)

  // Hinterlegte Credentials beim Mounten laden (für die Anzeige im Formular).
  useEffect(() => {
    invokePlugin<{ username: string; password: string } | null>('antares', 'antares.loadCredentials')
      .then(creds => {
        if (creds) {
          setUser(creds.username)
          setPassword(creds.password)
          setCredsSaved(true)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <>
      <h4 className="settings-section-title">{t('settings.agents.antares.title')}</h4>
      <p className="settings-hint">{t('settings.agents.antares.description')}</p>

      {!antares.enabled && (
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

      {antares.enabled && (
        <>
          <div className="settings-row">
            <label>{t('settings.agents.antares.baseUrl')}</label>
            <input
              type="text"
              value={antares.baseUrl}
              onChange={e => setAntares({ baseUrl: e.target.value })}
              placeholder="https://mzantares-he-16.datenbank-bildungsmedien.net"
              className="settings-input"
            />
          </div>

          <div className="settings-row">
            <label>{t('settings.agents.antares.context')}</label>
            <input
              type="text"
              value={antares.context}
              onChange={e => setAntares({ context: e.target.value })}
              placeholder="HE/16"
              className="settings-input"
            />
          </div>

          <div className="settings-row">
            <label>{t('settings.agents.antares.username')}</label>
            <input
              type="text"
              value={user}
              onChange={e => { setUser(e.target.value); setCredsSaved(false) }}
              placeholder={t('settings.agents.antares.username')}
              className="settings-input"
              autoComplete="username"
            />
          </div>

          <div className="settings-row">
            <label>{t('settings.agents.antares.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setCredsSaved(false) }}
              placeholder={t('settings.agents.antares.password')}
              className="settings-input"
              autoComplete="current-password"
            />
          </div>

          <div className="settings-row" style={{ gap: '8px' }}>
            <button
              className="settings-btn"
              onClick={async () => {
                if (user && password) {
                  const saved = await invokePlugin<boolean>('antares', 'antares.saveCredentials', { username: user, password }).catch(() => false)
                  setCredsSaved(!!saved)
                }
              }}
            >
              {credsSaved ? t('settings.agents.antares.saved') : t('settings.agents.antares.save')}
            </button>
            <button
              className="settings-btn"
              disabled={testStatus === 'testing'}
              onClick={async () => {
                setTestError(null)
                if (!user || !password) {
                  setTestStatus('failed')
                  setTestError(t('settings.agents.antares.saveFirst'))
                  return
                }
                await invokePlugin('antares', 'antares.saveCredentials', { username: user, password })
                setCredsSaved(true)
                setTestStatus('testing')
                try {
                  await invokePlugin('antares', 'antares.check', { baseUrl: antares.baseUrl, context: antares.context })
                  setTestStatus('success')
                  setTestError(null)
                } catch (err) {
                  setTestStatus('failed')
                  setTestError(err instanceof Error ? err.message : null)
                }
              }}
            >
              {testStatus === 'testing'
                ? t('settings.agents.antares.testing')
                : t('settings.agents.antares.testConnection')}
            </button>
            {testStatus === 'success' && (
              <span className="status-connected">{t('settings.agents.antares.connected')}</span>
            )}
            {testStatus === 'failed' && (
              <span className="status-disconnected">{t('settings.agents.antares.failed')}</span>
            )}
          </div>
          {testError && (
            <div className="settings-row">
              <span className="settings-error-detail">{testError}</span>
            </div>
          )}
        </>
      )}
    </>
  )
}
