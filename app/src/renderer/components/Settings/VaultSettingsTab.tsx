// Einstellungen → Vault (Redesign 09/2026): Status-Kopf mit Vault-Name/Pfad, eine Schalter-Zeile
// je Vault-Feature. Ein Feature ist erst schaltbar, wenn es global eingerichtet ist — sonst Link.

import React from 'react'
import { useUIStore, EDOOBOX_DEFAULTS, REMARKABLE_DEFAULTS } from '../../stores/uiStore'
import { usePluginConfig } from '../../plugins/config'
import { useVaultSettingsStore } from '../../stores/vaultSettingsStore'
import type { Tab, TabTFn } from './settingsTypes'
import { PageHeader, SectionTitle, Card, Row, Toggle, Hero } from './SettingsUI'

const VAULT_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
  </svg>
)

export const VaultSettingsTab: React.FC<{ vaultPath: string; t: TabTFn; onNavigateToTab: (tab: Tab) => void }> = ({ vaultPath, t, onNavigateToTab }) => {
  const vaultFeatures = useVaultSettingsStore(state => state.features)
  const setFeatureActive = useVaultSettingsStore(state => state.setFeatureActive)
  const readwise = useUIStore(state => state.readwise)
  const email = useUIStore(state => state.email)
  const [edoobox] = usePluginConfig('edoobox', EDOOBOX_DEFAULTS)
  const [remarkable] = usePluginConfig('remarkable', REMARKABLE_DEFAULTS)
  const vaultName = vaultPath.split('/').pop() || vaultPath

  const features: Array<{ key: keyof typeof vaultFeatures; label: string; description: string; globallyConfigured: boolean; configTab: Tab | null }> = [
    { key: 'dailyNote', label: t('settings.vault.dailyNote'), description: t('settings.vault.dailyNoteDesc'), globallyConfigured: true, configTab: 'dailyNote' },
    { key: 'readwise', label: 'Readwise', description: t('settings.vault.readwiseDesc'), globallyConfigured: readwise.enabled && readwise.apiKey !== '', configTab: 'integrations' },
    { key: 'email', label: 'E-Mail', description: t('settings.vault.emailDesc'), globallyConfigured: email.enabled && email.accounts.length > 0, configTab: 'email' },
    { key: 'edoobox', label: 'edoobox Agent', description: t('settings.vault.edooboxDesc'), globallyConfigured: edoobox.enabled, configTab: 'agents' },
    { key: 'remarkable', label: 'reMarkable', description: t('settings.vault.remarkableDesc'), globallyConfigured: remarkable.enabled, configTab: 'remarkable' }
  ]
  const active = features.filter(f => f.globallyConfigured && vaultFeatures[f.key]).length

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.tab.vault')} subtitle={t('settings.vault.subtitle')} />
      <Hero icon={VAULT_ICON} title={vaultName} dot="ok" meta={vaultPath} />

      <SectionTitle title={t('settings.vault.title')} meta={t('settings.vault.featuresMeta', { on: active, total: features.length })} />
      <Card>
        {features.map(feature => (
          <Row
            key={feature.key}
            label={feature.label}
            htmlFor={`vault-feature-${feature.key}`}
            hint={
              <>
                {feature.description}
                {!feature.globallyConfigured && feature.configTab && (
                  <> · {t('settings.vault.notConfigured')} · <button type="button" className="sui-link" onClick={() => onNavigateToTab(feature.configTab!)}>{t('settings.vault.goToConfigure')}</button></>
                )}
              </>
            }
            disabled={!feature.globallyConfigured}
          >
            <Toggle
              id={`vault-feature-${feature.key}`}
              checked={vaultFeatures[feature.key]}
              disabled={!feature.globallyConfigured}
              onChange={v => setFeatureActive(feature.key, v)}
              ariaLabel={!feature.globallyConfigured ? t('settings.vault.enableFirst') : feature.label}
            />
          </Row>
        ))}
      </Card>
    </div>
  )
}
