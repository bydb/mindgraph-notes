import React, { useEffect, useState, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { invokePlugin } from '../../plugins/client'
import { edooboxService } from '../../stores/edooboxServiceBridge'
import { wordpressService } from '../../stores/wordpressServiceBridge'
import { useTranslation } from '../../utils/translations'
import { PageHeader, SectionTitle, Card, Row, Note, Details, Button, StatusChip } from './SettingsUI'

type TabId = 'integrations' | 'email' | 'agents' | 'telegram' | 'speech' | 'sync' | 'dashboard' | 'ai' | `plugin:${string}`

interface CredentialRow {
  id: string
  label: string
  category: string
  note?: string
  settingsTab: TabId
  checkSet: () => Promise<boolean>
  inUiStore?: boolean    // true = Klartext im uiStore (Audit-Hinweis)
}

interface Props {
  onNavigateToTab: (tab: string) => void
}

/**
 * Zentrale Übersicht aller safeStorage-basierten Zugangsdaten.
 * Zeigt Status (gesetzt/leer) und springt beim Klick in den passenden Settings-Tab,
 * in dem die Credential tatsächlich gesetzt/gelöscht wird.
 */
export const CredentialsSettings: React.FC<Props> = ({ onNavigateToTab }) => {
  const { t } = useTranslation()
  const email = useUIStore(s => s.email)
  const readwise = useUIStore(s => s.readwise)
  const languageTool = useUIStore(s => s.languageTool)

  const [statuses, setStatuses] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  // Dynamische Credential-Liste — Email-Accounts kommen aus dem uiStore
  const credentials: CredentialRow[] = React.useMemo(() => {
    const rows: CredentialRow[] = []
    rows.push({ id: 'telegram-token', label: 'Telegram Bot-Token', category: 'Messenger', note: 'Bot für Vault-Abfragen via Telegram', settingsTab: 'telegram', checkSet: () => window.electronAPI.telegramHasToken() })
    rows.push({ id: 'elevenlabs-key', label: 'ElevenLabs API-Key', category: 'KI-Cloud', note: 'Für Cloud-TTS im Sprache-Modul', settingsTab: 'speech', checkSet: async () => !!(await window.electronAPI.elevenlabsLoadKey()) })
    rows.push({ id: 'sync-passphrase', label: 'Sync-Passphrase', category: 'Sync', note: 'E2E-verschlüsselter Vault-Sync', settingsTab: 'sync', checkSet: async () => !!(await window.electronAPI.syncLoadPassphrase()) })
    for (const acc of email.accounts ?? []) {
      rows.push({
        id: `email-${acc.id}`,
        label: `Email-Passwort (${acc.name || acc.user})`,
        category: 'Kommunikation',
        note: `IMAP ${acc.host} · SMTP ${acc.smtpHost}`,
        settingsTab: 'email',
        checkSet: async () => !!(await window.electronAPI.emailLoadPassword(acc.id))
      })
    }
    rows.push({
      id: 'edoobox', label: 'edoobox API-Key + Secret', category: 'Business', note: 'Veranstaltungs-Agent', settingsTab: 'agents',
      checkSet: async () => { const creds = await edooboxService.loadCredentials(); return !!(creds && creds.apiKey && creds.apiSecret) }
    })
    rows.push({
      id: 'antares', label: 'Antares Zugangsdaten', category: 'Business', note: 'Username + Passwort für Antares CS (Medienzentrum-Verleih). Read-only.', settingsTab: 'plugin:antares',
      checkSet: async () => {
        const creds = await invokePlugin<{ username?: string; password?: string } | null>('antares', 'antares.loadCredentials').catch(() => null)
        return !!(creds && creds.username && creds.password)
      }
    })
    rows.push({
      id: 'wordpress', label: 'WordPress App-Passwort', category: 'Business', note: 'Publishing aus Editor und Marketing-Tab', settingsTab: 'plugin:wordpress',
      checkSet: async () => { const creds = await wordpressService.loadCredentials(); return !!(creds && creds.wpAppPassword) }
    })
    rows.push({ id: 'openalex-key', label: 'OpenAlex API-Key', category: 'Forschung', note: 'Höhere Limits im Research-Panel', settingsTab: 'integrations', checkSet: async () => !!(await window.electronAPI.openAlexLoadKey()) })
    rows.push({ id: 'readwise', label: 'Readwise API-Key', category: 'Forschung', note: 'Highlights-Synchronisation', settingsTab: 'integrations', checkSet: async () => !!readwise?.apiKey, inUiStore: true })
    rows.push({ id: 'languagetool', label: 'LanguageTool API-Key', category: 'Editor', note: 'Nur bei LanguageTool Premium API', settingsTab: 'integrations', checkSet: async () => !!languageTool?.apiKey, inUiStore: true })
    rows.push({ id: 'imagen', label: 'Google AI Studio API-Key', category: 'KI-Cloud', note: 'Nano-Banana-Bildgenerierung — genutzt von Marketing und Notiz-Agent', settingsTab: 'ai', checkSet: async () => !!(await window.electronAPI.imageGenLoadKey()) })
    return rows
  }, [email, readwise, languageTool])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    const result: Record<string, boolean> = {}
    await Promise.all(credentials.map(async c => {
      try { result[c.id] = await c.checkSet() } catch { result[c.id] = false }
    }))
    setStatuses(result)
    setLoading(false)
  }, [credentials])

  useEffect(() => { void refreshAll() }, [refreshAll])

  const grouped = React.useMemo(() => {
    const map = new Map<string, CredentialRow[]>()
    for (const c of credentials) {
      if (!map.has(c.category)) map.set(c.category, [])
      map.get(c.category)!.push(c)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [credentials])

  const setCount = Object.values(statuses).filter(Boolean).length
  const hasUiStoreClearText = credentials.some(c => c.inUiStore && statuses[c.id])

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.credentials.title')} subtitle={t('settings.credentials.subtitle')} />

      <SectionTitle title={t('settings.credentials.groupStored')} meta={loading ? t('settings.credentials.checking') : t('settings.credentials.meta', { set: setCount, total: credentials.length })} />
      {hasUiStoreClearText && <Card><Note tone="warn">{t('settings.credentials.plaintextWarn')}</Note></Card>}
      {grouped.map(([category, rows]) => (
        <Card key={category}>
          <Row label={category}>
            {category === grouped[0][0] && (
              <Button variant="link" onClick={() => void refreshAll()} disabled={loading}>{loading ? t('settings.credentials.checking') : t('settings.credentials.refresh')}</Button>
            )}
          </Row>
          {rows.map(row => {
            const isSet = statuses[row.id]
            return (
              <Row key={row.id} label={row.label} hint={<>{row.note}{row.inUiStore && <> · <b>{t('settings.credentials.plaintext')}</b></>}</>}>
                <StatusChip tone={loading ? 'checking' : isSet ? 'ok' : 'off'} label={loading ? t('settings.credentials.checking') : isSet ? t('settings.credentials.set') : t('settings.credentials.missing')} />
                <Button variant="link" onClick={() => onNavigateToTab(row.settingsTab)}>{isSet ? t('settings.credentials.change') : t('settings.credentials.setup')}</Button>
              </Row>
            )
          })}
        </Card>
      ))}
      <Card>
        <Details title={t('settings.credentials.whereTitle')}>
          <p>{t('settings.credentials.whereBody')}</p>
        </Details>
      </Card>
    </div>
  )
}
