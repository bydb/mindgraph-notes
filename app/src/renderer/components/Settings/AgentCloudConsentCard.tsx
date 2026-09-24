import { useUIStore, flushUISettings } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { Card, Row, Toggle } from './SettingsUI'
import { NOTE_AGENT_CLOUD_CONSENT_VERSION, hasCloudConsent } from '../../../shared/agentRoute'

// Zustimmung zu Cloud-Läufen des Notiz-Agenten MIT Vault-Zugriff (Codex F28). Erteilt wird
// sie meist direkt auf der Auftragskarte; hier lässt sie sich einsehen und zurücknehmen.
// Der Main liest den Wert selbst aus ui-settings.json — der Schalter ist keine Anzeige-Attrappe.
export function AgentCloudConsentCard() {
  const { t } = useTranslation()
  const version = useUIStore(s => s.noteAgentCloudConsentVersion)
  const setVersion = useUIStore(s => s.setNoteAgentCloudConsentVersion)
  const granted = hasCloudConsent(version)
  return (
    <Card>
      <Row label={t('settings.agentCloudConsent.label')} hint={t('settings.agentCloudConsent.hint')}>
        <Toggle
          checked={granted}
          ariaLabel={t('settings.agentCloudConsent.label')}
          onChange={next => {
            if (next) {
              // eslint-disable-next-line no-alert
              if (!window.confirm(t('settings.agentCloudConsent.confirm'))) return
              setVersion(NOTE_AGENT_CLOUD_CONSENT_VERSION)
            } else {
              setVersion(0)
            }
            // Sofort schreiben: der Agent-Tab prüft beim Schließen der Einstellungen neu.
            void flushUISettings()
          }}
        />
      </Row>
    </Card>
  )
}
