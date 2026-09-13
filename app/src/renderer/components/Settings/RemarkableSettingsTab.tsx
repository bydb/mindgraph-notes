// Einstellungen → reMarkable (Redesign 09/2026): eine Dienst-Karte mit USB-Status.

import React, { useEffect, useState } from 'react'
import { REMARKABLE_DEFAULTS } from '../../stores/uiStore'
import { usePluginConfig } from '../../plugins/config'
import { invokePlugin } from '../../plugins/client'
import { setModuleEnabled, useIsModuleEnabled } from '../../utils/modules'
import type { TabTFn } from './settingsTypes'
import { PageHeader, Card, ServiceHead, IconTile, Row, Note, Toggle, Select, Button, ModuleOffCard } from './SettingsUI'

const TABLET_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M9 7h6M9 11h6M9 15h3" />
  </svg>
)

export const RemarkableSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const enabled = useIsModuleEnabled('remarkable')
  const [settings, setRemarkable] = usePluginConfig('remarkable', REMARKABLE_DEFAULTS)
  const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'disconnected'>('idle')
  const [error, setError] = useState<string | null>(null)

  const check = async () => {
    setStatus('checking')
    setError(null)
    try {
      const result = await invokePlugin<{ connected: boolean; error?: string }>('remarkable', 'remarkable.usbCheck')
      setStatus(result.connected ? 'connected' : 'disconnected')
      if (!result.connected && result.error) setError(result.error)
    } catch {
      setStatus('disconnected')
      setError(t('settings.agents.remarkable.checkError'))
    }
  }
  useEffect(() => { if (enabled) void check() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [enabled])

  const icon = <IconTile bg="#5b6470">{TABLET_ICON}</IconTile>

  return (
    <div className="settings-section">
      <PageHeader title="reMarkable" subtitle={t('settings.remarkable.subtitle')} />
      {!enabled ? (
        <ModuleOffCard icon={icon} name="reMarkable" onEnable={() => { void setModuleEnabled('remarkable', true).catch(err => console.error('[settings] remarkable:', err)) }} />
      ) : (
        <Card>
          <ServiceHead
            icon={icon}
            name="reMarkable"
            desc={t('settings.agents.remarkable.description')}
            status={
              status === 'connected' ? { tone: 'ok', label: t('settings.agents.remarkable.connected') }
                : status === 'checking' ? { tone: 'checking', label: t('settings.agents.remarkable.checking') }
                  : status === 'disconnected' ? { tone: 'off', label: t('settings.agents.remarkable.disconnected') }
                    : { tone: 'warn', label: t('settings.remarkable.notChecked') }
            }
            actions={<Button onClick={() => void check()} disabled={status === 'checking'}>{t('settings.agents.remarkable.testConnection')}</Button>}
          />
          {status === 'disconnected' && (
            <Note tone="warn" action={t('settings.integ.recheck')} onAction={() => void check()}>
              {t('settings.remarkable.diagnosis')}{error && <> <span className="settings-error-detail">{error}</span></>}
            </Note>
          )}
          <Row label={t('settings.agents.remarkable.transport')}>
            <Select value={settings.transport} onChange={e => setRemarkable({ transport: e.target.value as 'usb' })}>
              <option value="usb">USB</option>
            </Select>
          </Row>
          <Row label={t('settings.agents.remarkable.autoRefresh')} htmlFor="rm-autorefresh">
            <Toggle id="rm-autorefresh" checked={settings.autoRefreshOnOpen} onChange={v => setRemarkable({ autoRefreshOnOpen: v })} />
          </Row>
        </Card>
      )}
    </div>
  )
}
