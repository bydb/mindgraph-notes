// Einstellungen → Tastenkürzel (Referenzseite, Redesign 09/2026).

import React from 'react'
import type { TabTFn } from './settingsTypes'
import { PageHeader, SectionTitle, Card, Row, Keys, Note } from './SettingsUI'

export const ShortcutsTab: React.FC<{ t: TabTFn }> = ({ t }) => (
  <div className="settings-section">
    <PageHeader title={t('settings.tab.shortcuts')} subtitle={t('settings.shortcuts.subtitle')} />

    <SectionTitle title={t('settings.shortcuts.navigation')} />
    <Card>
      <Row label={t('settings.shortcuts.quickSwitcher')}><Keys keys={['Cmd', 'K']} /></Row>
      <Row label={t('settings.shortcuts.quickSearch')}><Keys keys={['Cmd', 'P']} /></Row>
      <Row label={t('settings.shortcuts.commandPalette')}><Keys keys={['Cmd', 'Shift', 'P']} /></Row>
      <Row label={t('settings.shortcuts.openSettings')}><Keys keys={['Cmd', ',']} /></Row>
    </Card>

    <SectionTitle title={t('settings.shortcuts.notesTemplates')} />
    <Card>
      <Row label={t('settings.shortcuts.templatePicker')}><Keys keys={['Cmd', 'Shift', 'T']} /></Row>
      <Row label={t('settings.shortcuts.zoteroSearch')}><Keys keys={['Cmd', 'Shift', 'Z']} /></Row>
      <Row label={t('settings.shortcuts.saveNote')}><Keys keys={['Cmd', 'S']} /></Row>
    </Card>

    <SectionTitle title={t('settings.shortcuts.editorSection')} />
    <Card>
      <Row label={t('settings.shortcuts.switchView')}><Keys keys={['Cmd', 'E']} /></Row>
      <Row label={t('settings.shortcuts.bold')}><Keys keys={['Cmd', 'B']} /></Row>
      <Row label={t('settings.shortcuts.italic')}><Keys keys={['Cmd', 'I']} /></Row>
      <Row label={t('settings.shortcuts.code')}><Keys keys={['Cmd', 'Shift', 'K']} /></Row>
      <Row label={t('settings.shortcuts.strikethrough')}><Keys keys={['Cmd', 'Shift', 'X']} /></Row>
    </Card>

    <SectionTitle title={t('settings.shortcuts.wikilinks')} />
    <Card>
      <Row label={t('settings.shortcuts.startWikilink')}><Keys keys={['[[']} /></Row>
      <Row label={t('settings.shortcuts.openWikilink')}><Keys keys={['Cmd', 'Click']} /></Row>
    </Card>

    <SectionTitle title={t('settings.shortcuts.view')} />
    <Card>
      <Row label={t('settings.shortcuts.toggleSidebar')}><Keys keys={['Sidebar-Button']} /></Row>
      <Row label={t('settings.shortcuts.switchViews')}><Keys keys={['View-Switcher']} /></Row>
      <Note tone="muted">{t('settings.shortcuts.tip')}</Note>
    </Card>
  </div>
)
