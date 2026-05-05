import React, { useEffect, useState, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'

type TabId = 'integrations' | 'email' | 'agents' | 'telegram' | 'speech' | 'sync' | 'dashboard'

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
  const email = useUIStore(s => s.email)
  const readwise = useUIStore(s => s.readwise)
  const languageTool = useUIStore(s => s.languageTool)
  const marketing = useUIStore(s => s.marketing)

  const [statuses, setStatuses] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  // Dynamische Credential-Liste — Email-Accounts kommen aus dem uiStore
  const credentials: CredentialRow[] = React.useMemo(() => {
    const rows: CredentialRow[] = []

    // Telegram
    rows.push({
      id: 'telegram-token',
      label: 'Telegram Bot-Token',
      category: 'Messenger',
      note: 'Bot für Vault-Abfragen via Telegram',
      settingsTab: 'telegram',
      checkSet: () => window.electronAPI.telegramHasToken()
    })
    rows.push({
      id: 'anthropic-key',
      label: 'Anthropic API-Key',
      category: 'KI-Cloud',
      note: 'Für /ask und /briefing im Telegram-Bot (Claude)',
      settingsTab: 'telegram',
      checkSet: () => window.electronAPI.telegramHasAnthropicKey()
    })

    // ElevenLabs (Speech)
    rows.push({
      id: 'elevenlabs-key',
      label: 'ElevenLabs API-Key',
      category: 'KI-Cloud',
      note: 'Für Cloud-TTS im Sprache-Modul',
      settingsTab: 'speech',
      checkSet: async () => {
        const k = await window.electronAPI.elevenlabsLoadKey()
        return !!k
      }
    })

    // Sync
    rows.push({
      id: 'sync-passphrase',
      label: 'Sync-Passphrase',
      category: 'Sync',
      note: 'E2E-verschlüsselter Vault-Sync',
      settingsTab: 'sync',
      checkSet: async () => {
        const p = await window.electronAPI.syncLoadPassphrase()
        return !!p
      }
    })

    // Email-Accounts — ein Eintrag pro Account
    for (const acc of email.accounts ?? []) {
      rows.push({
        id: `email-${acc.id}`,
        label: `Email-Passwort (${acc.name || acc.user})`,
        category: 'Kommunikation',
        note: `IMAP ${acc.host} · SMTP ${acc.smtpHost}`,
        settingsTab: 'email',
        checkSet: async () => {
          const pw = await window.electronAPI.emailLoadPassword(acc.id)
          return !!pw
        }
      })
    }

    // edoobox
    rows.push({
      id: 'edoobox',
      label: 'edoobox API-Key + Secret',
      category: 'Business',
      note: 'Veranstaltungs-Agent',
      settingsTab: 'agents',
      checkSet: async () => {
        const creds = await window.electronAPI.edooboxLoadCredentials()
        return !!(creds && creds.apiKey && creds.apiSecret)
      }
    })

    // WordPress (Marketing)
    rows.push({
      id: 'wordpress',
      label: 'WordPress App-Passwort',
      category: 'Business',
      note: 'Automatisiertes Publishing im Marketing-Tab',
      settingsTab: 'agents',
      checkSet: async () => {
        const creds = await window.electronAPI.marketingLoadCredentials()
        return !!(creds && creds.wpAppPassword)
      }
    })

    // uiStore-basierte Credentials (NICHT safeStorage — Sicherheits-Hinweis)
    rows.push({
      id: 'readwise',
      label: 'Readwise API-Key',
      category: 'Forschung',
      note: 'Highlights-Synchronisation',
      settingsTab: 'integrations',
      checkSet: async () => !!readwise?.apiKey,
      inUiStore: true
    })
    rows.push({
      id: 'languagetool',
      label: 'LanguageTool API-Key',
      category: 'Editor',
      note: 'Nur bei LanguageTool Premium API',
      settingsTab: 'integrations',
      checkSet: async () => !!languageTool?.apiKey,
      inUiStore: true
    })
    rows.push({
      id: 'imagen',
      label: 'Google Imagen API-Key',
      category: 'KI-Cloud',
      note: 'Bild-Generierung im Marketing-Tab',
      settingsTab: 'agents',
      checkSet: async () => !!marketing?.googleImagenApiKey,
      inUiStore: true
    })

    return rows
  }, [email, readwise, languageTool, marketing])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    const result: Record<string, boolean> = {}
    await Promise.all(credentials.map(async c => {
      try {
        result[c.id] = await c.checkSet()
      } catch {
        result[c.id] = false
      }
    }))
    setStatuses(result)
    setLoading(false)
  }, [credentials])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // Gruppierung nach Kategorie
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
      <h3>Zugangsdaten</h3>
      <p className="settings-help">
        Zentrale Übersicht aller gespeicherten API-Keys, Passwörter und Tokens. Die Credentials selbst werden
        in ihrem jeweiligen Feature-Tab gesetzt und gelöscht — hier siehst du nur den Status und springst
        per Klick zum passenden Tab. Alle Einträge (außer den mit ⚠️ markierten) werden via
        <code> electron.safeStorage</code> verschlüsselt lokal abgelegt und verlassen den Rechner nicht.
      </p>

      <div className="settings-group" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <strong>{setCount}</strong>
        <span>von {credentials.length} Einträgen gesetzt</span>
        <button
          className="settings-button"
          onClick={refreshAll}
          disabled={loading}
          style={{ marginLeft: 'auto' }}
        >
          {loading ? 'Prüfe …' : 'Aktualisieren'}
        </button>
      </div>

      {hasUiStoreClearText && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fff7e6',
            border: '1px solid #f4c078',
            borderRadius: 4,
            marginBottom: 16,
            fontSize: 13,
            color: '#8a5a00'
          }}
        >
          ⚠️ Einträge mit dem Warnsymbol sind aktuell im Klartext in der lokalen UI-Settings-Datei
          abgelegt (nicht verschlüsselt). Bei Bedarf sollten diese auf safeStorage migriert werden.
        </div>
      )}

      {grouped.map(([category, rows]) => (
        <div key={category} className="settings-group">
          <label className="settings-label" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
            {category}
          </label>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map(row => {
              const isSet = statuses[row.id]
              return (
                <li
                  key={row.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 4,
                    marginBottom: 6
                  }}
                >
                  <span
                    title={isSet ? 'Gesetzt' : 'Nicht gesetzt'}
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: loading ? '#ccc' : isSet ? '#44c767' : '#ddd',
                      flexShrink: 0
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>
                      {row.label}
                      {row.inUiStore && (
                        <span title="Im Klartext in ui-settings.json — sollte auf safeStorage migriert werden" style={{ marginLeft: 6 }}>
                          ⚠️
                        </span>
                      )}
                    </div>
                    {row.note && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{row.note}</div>}
                  </div>
                  <button
                    className="settings-button small"
                    onClick={() => onNavigateToTab(row.settingsTab)}
                    title="Zum Feature-Tab wechseln, wo die Credential verwaltet wird"
                  >
                    {isSet ? 'Ändern' : 'Einrichten'}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
