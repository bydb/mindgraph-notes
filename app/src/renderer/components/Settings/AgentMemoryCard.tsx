import { useState } from 'react'
import { useUIStore, flushUISettings } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { Card, Row, Toggle, Note } from './SettingsUI'

// Agent-Gedächtnis ein/aus. Standard aus (24.11.2026): Die App schlug nach jedem Lauf eine Regel
// vor, und gespeicherte Regeln standen über jedem Auftrag — auch über solchen, zu denen sie nicht
// passten. Der Main liest den Schalter selbst aus ui-settings.json; die Notiz bleibt unberührt.
export function AgentMemoryCard() {
  const { t } = useTranslation()
  const enabled = useUIStore(s => s.noteAgentMemoryEnabled)
  const setEnabled = useUIStore(s => s.setNoteAgentMemoryEnabled)
  const [saveFailed, setSaveFailed] = useState(false)
  return (
    <Card>
      <Row label={t('settings.agentMemory.label')} hint={t('settings.agentMemory.hint')}>
        <Toggle
          checked={enabled}
          ariaLabel={t('settings.agentMemory.label')}
          onChange={async next => {
            const before = enabled
            setEnabled(next)
            setSaveFailed(false)
            const ok = await flushUISettings()
            if (!ok) { setEnabled(before); setSaveFailed(true) }
            // Die Auftragskarte liest den Stand neu, sobald die Einstellungen schließen.
          }}
        />
      </Row>
      {saveFailed && <Note tone="danger">{t('settings.agentMemory.saveFailed')}</Note>}
    </Card>
  )
}
