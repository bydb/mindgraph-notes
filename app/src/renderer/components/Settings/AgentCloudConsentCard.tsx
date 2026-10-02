import { useState } from 'react'
import { useUIStore, flushUISettings } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { Card, Row, Toggle, Note } from './SettingsUI'
import { NOTE_AGENT_CLOUD_CONSENT_VERSION, hasCloudConsent } from '../../../shared/agentRoute'

// Zustimmung zu Cloud-Läufen des Notiz-Agenten MIT Vault-Zugriff (Codex F28). Erteilt wird
// sie meist direkt auf der Auftragskarte; hier lässt sie sich einsehen und zurücknehmen.
// Der Main liest den Wert selbst aus ui-settings.json — der Schalter ist keine Anzeige-Attrappe.
export function AgentCloudConsentCard() {
  const { t } = useTranslation()
  const version = useUIStore(s => s.noteAgentCloudConsentVersion)
  const setVersion = useUIStore(s => s.setNoteAgentCloudConsentVersion)
  const granted = hasCloudConsent(version)
  const [saveFailed, setSaveFailed] = useState(false)
  return (
    <Card>
      <Row label={t('settings.agentCloudConsent.label')} hint={t('settings.agentCloudConsent.hint')}>
        <Toggle
          checked={granted}
          ariaLabel={t('settings.agentCloudConsent.label')}
          onChange={async next => {
            if (next) {
              // eslint-disable-next-line no-alert
              if (!window.confirm(t('settings.agentCloudConsent.confirm'))) return
            }
            const vorher = version
            setVersion(next ? NOTE_AGENT_CLOUD_CONSENT_VERSION : 0)
            setSaveFailed(false)
            // Sofort schreiben: der Main liest die Zustimmung aus ui-settings.json. Scheitert
            // das Schreiben, gilt dort weiter der alte Stand — der Schalter darf dann nicht
            // „aus" zeigen, während Cloud-Läufe weiter erlaubt sind (Codex F21).
            const ok = await flushUISettings()
            if (!ok) {
              setVersion(vorher)
              setSaveFailed(true)
            }
          }}
        />
      </Row>
      {saveFailed && <Note tone="danger">{t('settings.agentCloudConsent.saveFailed')}</Note>}
    </Card>
  )
}
