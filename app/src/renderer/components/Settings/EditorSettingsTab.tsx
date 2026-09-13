// Einstellungen → Editor (Redesign 09/2026): Darstellung, Kopfzeilen-Aktionen, Verhalten,
// PDF Companion, MindGraph & Dateibaum, Werkzeuge.

import React from 'react'
import { useUIStore, ICON_SETS, OUTLINE_STYLES, type IconSet, type OutlineStyle } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { formatDate } from '../../utils/templateEngine'
import type { TabTFn } from './settingsTypes'
import { PageHeader, SectionTitle, Card, Row, Details, Toggle, Segmented, Select, Button, NumberInput, TextInput } from './SettingsUI'

const HEADER_ACTIONS = [
  ['languageTool', 'settings.editor.headerActionLanguageTool'],
  ['pdf', 'settings.editor.headerActionPdf'],
  ['remarkable', 'settings.editor.headerActionRemarkable'],
  ['docx', 'settings.editor.headerActionDocx'],
  ['wordpress', 'settings.editor.headerActionWordpress'],
  ['mp3', 'settings.editor.headerActionMp3']
] as const

export const EditorSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const s = useUIStore()
  const vaultPath = useNotesStore(n => n.vaultPath)
  const visibleActions = HEADER_ACTIONS.filter(([a]) => s.editorHeaderActions[a]).length

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.tab.editor')} subtitle={t('settings.editor.subtitle')} />

      <SectionTitle title={t('settings.editor.display')} />
      <Card>
        <Row label={t('settings.editor.fontSize')}>
          <NumberInput value={s.editorFontSize} min={10} max={24} onCommit={v => s.setEditorFontSize(v || 15)} unit="px" />
        </Row>
        <Row label={t('settings.editor.showLineNumbers')} htmlFor="ed-linenumbers">
          <Toggle id="ed-linenumbers" checked={s.editorLineNumbers} onChange={s.setEditorLineNumbers} />
        </Row>
        <Row label={t('settings.editor.foldHeadings')} htmlFor="ed-fold">
          <Toggle id="ed-fold" checked={s.editorHeadingFolding} onChange={s.setEditorHeadingFolding} />
        </Row>
        <Row label={t('settings.editor.outlining')} htmlFor="ed-outline">
          <Toggle id="ed-outline" checked={s.editorOutlining} onChange={s.setEditorOutlining} />
        </Row>
        <Row label={t('settings.editor.outlineStyle')} disabled={!s.editorOutlining}>
          <Select value={s.outlineStyle} onChange={e => s.setOutlineStyle(e.target.value as OutlineStyle)} disabled={!s.editorOutlining}>
            {(Object.keys(OUTLINE_STYLES) as OutlineStyle[]).map(key => <option key={key} value={key}>{OUTLINE_STYLES[key].name}</option>)}
          </Select>
        </Row>
        <Row label={t('settings.editor.formattingToolbar')} htmlFor="ed-toolbar">
          <Toggle id="ed-toolbar" checked={s.showFormattingToolbar} onChange={s.setShowFormattingToolbar} />
        </Row>
        <Row label={t('settings.editor.rawEditor')} htmlFor="ed-raw">
          <Toggle
            id="ed-raw"
            checked={s.showRawEditor}
            onChange={enabled => {
              s.setShowRawEditor(enabled)
              if (!enabled && s.editorDefaultView === 'edit') s.setEditorDefaultView('preview')
            }}
          />
        </Row>
        <Row label={t('settings.editor.wordCounter')} htmlFor="ed-wordcount">
          <Toggle id="ed-wordcount" checked={s.editorShowWordCount} onChange={s.setEditorShowWordCount} />
        </Row>
        <Row label={t('settings.editor.showBacklinks')} htmlFor="ed-backlinks" anchor="editor-backlinks">
          <Toggle id="ed-backlinks" checked={s.editorShowBacklinks} onChange={s.setEditorShowBacklinks} />
        </Row>
      </Card>

      <SectionTitle title={t('settings.editor.headerActions')} meta={t('settings.editor.headerActionsMeta', { n: visibleActions, total: HEADER_ACTIONS.length })} />
      <Card anchor="editor-header-actions">
        {HEADER_ACTIONS.map(([action, label]) => (
          <Row key={action} label={t(label)} htmlFor={`ed-action-${action}`}>
            <Toggle id={`ed-action-${action}`} checked={s.editorHeaderActions[action]} onChange={v => s.setEditorHeaderActions({ [action]: v })} />
          </Row>
        ))}
      </Card>

      <SectionTitle title={t('settings.editor.behavior')} />
      <Card>
        <Row label={t('settings.editor.defaultViewLabel')} anchor="editor-default-view">
          <Segmented
            options={[
              ...(s.showRawEditor ? [{ value: 'edit' as const, label: t('settings.editor.viewEdit') }] : []),
              { value: 'live-preview' as const, label: t('settings.editor.viewLivePreview') },
              { value: 'preview' as const, label: t('settings.editor.viewPreview') }
            ]}
            value={!s.showRawEditor && s.editorDefaultView === 'edit' ? 'live-preview' : s.editorDefaultView}
            onChange={v => s.setEditorDefaultView(v)}
            ariaLabel={t('settings.editor.defaultViewLabel')}
          />
        </Row>
        <Row label={t('settings.editor.autoSaveInterval')}>
          <Select value={s.autoSaveInterval} onChange={e => s.setAutoSaveInterval(parseInt(e.target.value, 10))}>
            <option value="0">{t('settings.editor.autoSaveDisabled')}</option>
            <option value="500">0.5 {t('settings.editor.autoSaveSeconds')}</option>
            <option value="1000">1 {t('settings.editor.autoSaveSeconds')}</option>
            <option value="2000">2 {t('settings.editor.autoSaveSeconds')}</option>
            <option value="5000">5 {t('settings.editor.autoSaveSeconds')}</option>
          </Select>
        </Row>
        <Row label={t('settings.editor.imagesFolder')} hint={t('settings.editor.imagesFolderHint')}>
          <TextInput value={s.imagesFolder} onCommit={s.setImagesFolder} placeholder=".attachments" />
        </Row>
        <Row label={t('settings.editor.slashCommands.dateFormat')} hint={t('settings.editor.formatPreview', { preview: formatDate(new Date(), s.slashCommandDateFormat) })}>
          <TextInput narrow value={s.slashCommandDateFormat} onCommit={s.setSlashCommandDateFormat} placeholder="DD.MM.YYYY" />
        </Row>
        <Row label={t('settings.editor.slashCommands.timeFormat')} hint={t('settings.editor.formatPreview', { preview: formatDate(new Date(), s.slashCommandTimeFormat) })}>
          <TextInput narrow value={s.slashCommandTimeFormat} onCommit={s.setSlashCommandTimeFormat} placeholder="HH:mm" />
        </Row>
      </Card>

      <SectionTitle title={t('settings.pdf.title')} />
      <Card>
        <Row label={t('settings.pdf.enabled')} hint={t('settings.pdf.description')} htmlFor="ed-pdf">
          <Toggle id="ed-pdf" checked={s.pdfCompanionEnabled} onChange={s.setPdfCompanionEnabled} />
        </Row>
        <Row label={t('settings.pdf.displayMode')} disabled={!s.pdfCompanionEnabled}>
          <Select
            value={s.pdfDisplayMode}
            onChange={e => s.setPdfDisplayMode(e.target.value as 'both' | 'companion-only' | 'pdf-only')}
            disabled={!s.pdfCompanionEnabled}
          >
            <option value="companion-only">{t('settings.pdf.companionOnly')}</option>
            <option value="both">{t('settings.pdf.both')}</option>
            <option value="pdf-only">{t('settings.pdf.pdfOnly')}</option>
          </Select>
        </Row>
      </Card>

      <SectionTitle title={t('settings.editor.groupGraph')} />
      <Card>
        <Row label={t('settings.canvas.cardWidth')} hint={t('settings.canvas.cardWidthDesc')}>
          <input
            type="range"
            className="sui-range"
            min="150"
            max="500"
            step="10"
            value={s.canvasDefaultCardWidth}
            onChange={e => s.setCanvasDefaultCardWidth(parseInt(e.target.value, 10))}
          />
          <span className="sui-unit">{s.canvasDefaultCardWidth}px</span>
        </Row>
        <Row label={t('settings.fileTree.iconStyle')} hint={t('settings.fileTree.iconStyleDesc')}>
          <Select value={s.iconSet} onChange={e => s.setIconSet(e.target.value as IconSet)}>
            {(Object.keys(ICON_SETS) as IconSet[]).map(key => (
              <option key={key} value={key}>{ICON_SETS[key].name} - {ICON_SETS[key].description}</option>
            ))}
          </Select>
        </Row>
      </Card>

      <SectionTitle title={t('settings.tools.title')} />
      <Card>
        <Row label={t('settings.tools.stripWikilinks')} hint={t('settings.tools.stripWikilinksExample')}>
          <Button
            onClick={async () => {
              if (!vaultPath) {
                alert(t('settings.tools.openVaultFirst'))
                return
              }
              const folderPath = await window.electronAPI.openVault()
              if (folderPath && folderPath.startsWith(vaultPath)) {
                await window.electronAPI.stripWikilinksInFolder(folderPath, vaultPath)
              } else if (folderPath) {
                alert(t('settings.tools.selectFolderInVault'))
              }
            }}
          >
            {t('settings.tools.selectFolder')}
          </Button>
        </Row>
        <Details title={t('settings.tools.stripHow')}>
          <p>{t('settings.tools.stripWikilinksDesc')}</p>
          <p>{t('settings.tools.stripWikiliksHint')}</p>
        </Details>
      </Card>
    </div>
  )
}
