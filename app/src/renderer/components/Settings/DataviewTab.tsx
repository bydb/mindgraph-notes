// Einstellungen → Dataview (Referenzseite, Redesign 09/2026).

import React from 'react'
import type { TabTFn } from './settingsTypes'
import { PageHeader, SectionTitle, Card, Row, Code, Note, Details } from './SettingsUI'

export const DataviewTab: React.FC<{ t: TabTFn }> = ({ t }) => (
  <div className="settings-section">
    <PageHeader title={t('settings.tab.dataview')} subtitle={t('settings.dataview.subtitle')} />

    <SectionTitle title={t('settings.dataview.basicSyntax')} />
    <Card>
      <Row label={t('settings.dataview.listAllNotes')}><Code>{'```dataview\nLIST\n```'}</Code></Row>
      <Row label={t('settings.dataview.tableWithColumns')}><Code>{'```dataview\nTABLE status, priority\n```'}</Code></Row>
    </Card>

    <SectionTitle title={t('settings.dataview.fromClause')} />
    <Card>
      <Row label={t('settings.dataview.filterByTag')}><Code>LIST FROM #projekt</Code></Row>
      <Row label={t('settings.dataview.filterByFolder')}><Code>LIST FROM "Work/Projects"</Code></Row>
      <Row label={t('settings.dataview.combineSources')}><Code>LIST FROM #projekt AND "Work"</Code></Row>
    </Card>

    <SectionTitle title={t('settings.dataview.whereClause')} />
    <Card>
      <Row label={t('settings.dataview.filterByField')}><Code>LIST WHERE status = "active"</Code></Row>
      <Row label={t('settings.dataview.filterByNumber')}><Code>{'LIST WHERE priority >= 2'}</Code></Row>
      <Row label={t('settings.dataview.filterByBoolean')}><Code>LIST WHERE completed = false</Code></Row>
      <Row label={t('settings.dataview.filterWithContains')}><Code>LIST WHERE contains(tags, "urgent")</Code></Row>
    </Card>

    <SectionTitle title={t('settings.dataview.sortAndLimit')} />
    <Card>
      <Row label={t('settings.dataview.sortByDate')}><Code>LIST SORT file.mtime DESC</Code></Row>
      <Row label={t('settings.dataview.sortAndLimitResults')}><Code>LIST SORT priority ASC LIMIT 10</Code></Row>
    </Card>

    <SectionTitle title={t('settings.dataview.availableFields')} />
    <Card>
      <Row label="file.name · file.path · file.folder" hint={`${t('settings.dataview.fileName')} · ${t('settings.dataview.filePath')} · ${t('settings.dataview.fileFolder')}`} />
      <Row label="file.ctime · file.mtime · file.tags" hint={`${t('settings.dataview.fileCreated')} · ${t('settings.dataview.fileModified')} · ${t('settings.dataview.fileTags')}`} />
      <Row label={t('settings.dataview.frontmatterFields')} hint={`${t('settings.dataview.frontmatterDesc')} status, priority, deadline, author, tags, category`} />
      <Details title={t('settings.dataview.fullExample')} wide>
        <Code>{'```dataview\nTABLE status, deadline, priority\nFROM "Work/Projects"\nWHERE !completed AND priority >= 2\nSORT deadline ASC\nLIMIT 10\n```'}</Code>
      </Details>
      <Note tone="muted">{t('settings.dataview.tip')}</Note>
    </Card>
  </div>
)
