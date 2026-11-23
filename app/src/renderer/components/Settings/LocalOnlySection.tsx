// Schalter „KI nur auf diesem Rechner“ (11/2026, Profil Schulverwaltung). Durchgesetzt wird er im
// Main (main/llm/localOnlyGuard.ts), hier wird er nur gesetzt und ehrlich beschrieben — inklusive
// dessen, was er NICHT abdeckt (Websuche, Sprachausgabe, Plugins usw. haben eigene Schalter; die Bilderzeugung über Google ist seit 23.11.2026 mit gesperrt).
import React from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../utils/translations'
import { Card, ServiceHead, IconTile, Note } from './SettingsUI'

export const LocalOnlySection: React.FC = () => {
  const { t } = useTranslation()
  const localOnly = useUIStore(s => s.ollama.localOnly === true)
  const setOllama = useUIStore(s => s.setOllama)
  return (
    <Card>
      <ServiceHead
        icon={
          <IconTile neutral={!localOnly}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" />
            </svg>
          </IconTile>
        }
        name={t('settings.localOnly.name')}
        desc={t('settings.localOnly.desc')}
        dimmed={!localOnly}
        toggle={{ checked: localOnly, onChange: v => setOllama({ localOnly: v }), ariaLabel: t('settings.localOnly.name') }}
      />
      {localOnly && <Note tone="muted">{t('settings.localOnly.scope')}</Note>}
    </Card>
  )
}
