// Einstellungen → Allgemein (Redesign 09/2026): Darstellung, Präsentationsmodus, Start,
// Zeitbilanz, Ordner. Liest und schreibt direkt im uiStore — vorher hingen 40 destrukturierte
// Werte in Settings.tsx an dieser einen Seite.

import React from 'react'
import { useUIStore, ACCENT_COLORS, FONT_FAMILIES, UI_LANGUAGES, BACKGROUND_COLORS, type Language, type FontFamily, type BackgroundColor } from '../../stores/uiStore'
import { useNotesStore } from '../../stores/notesStore'
import { VALUED_TYPES, isReferenceable, type ValuedType } from '../../../shared/activityLog'
import type { TabTFn } from './settingsTypes'
import { PresentationSection } from './PresentationSection'
import { PageHeader, SectionTitle, Card, Row, Details, Toggle, Segmented, Select, Button, TextInput } from './SettingsUI'

export const GeneralSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const theme = useUIStore(s => s.theme)
  const setTheme = useUIStore(s => s.setTheme)
  const accentColor = useUIStore(s => s.accentColor)
  const setAccentColor = useUIStore(s => s.setAccentColor)
  const customAccentColor = useUIStore(s => s.customAccentColor)
  const setCustomAccentColor = useUIStore(s => s.setCustomAccentColor)
  const backgroundColor = useUIStore(s => s.backgroundColor)
  const setBackgroundColor = useUIStore(s => s.setBackgroundColor)
  const customBackgroundColorLight = useUIStore(s => s.customBackgroundColorLight)
  const setCustomBackgroundColorLight = useUIStore(s => s.setCustomBackgroundColorLight)
  const setCustomBackgroundColorDark = useUIStore(s => s.setCustomBackgroundColorDark)
  const customLogo = useUIStore(s => s.customLogo)
  const setCustomLogo = useUIStore(s => s.setCustomLogo)
  const removeCustomLogo = useUIStore(s => s.removeCustomLogo)
  const language = useUIStore(s => s.language)
  const setLanguage = useUIStore(s => s.setLanguage)
  const fontFamily = useUIStore(s => s.fontFamily)
  const setFontFamily = useUIStore(s => s.setFontFamily)
  const loadLastVaultOnStart = useUIStore(s => s.loadLastVaultOnStart)
  const setLoadLastVaultOnStart = useUIStore(s => s.setLoadLastVaultOnStart)
  const notesRootFolder = useUIStore(s => s.notesRootFolder)
  const setNotesRootFolder = useUIStore(s => s.setNotesRootFolder)
  const projectsRootFolder = useUIStore(s => s.projectsRootFolder)
  const setProjectsRootFolder = useUIStore(s => s.setProjectsRootFolder)
  const vaultPath = useNotesStore(s => s.vaultPath)
  const setFileTree = useNotesStore(s => s.setFileTree)

  return (
    <div className="settings-section">
      <PageHeader title={t('settings.tab.general')} subtitle={t('settings.general.subtitle')} />

      <SectionTitle title={t('settings.general.groupAppearance')} />
      <Card>
        <Row label={t('settings.general.theme')}>
          <Segmented
            options={[
              { value: 'light' as const, label: t('settings.general.theme.light') },
              { value: 'dark' as const, label: t('settings.general.theme.dark') },
              { value: 'system' as const, label: t('settings.general.theme.system') }
            ]}
            value={theme}
            onChange={setTheme}
            ariaLabel={t('settings.general.theme')}
          />
        </Row>
        <Row label={t('settings.general.language')}>
          <Select value={language} onChange={e => setLanguage(e.target.value as Language)}>
            {(Object.keys(UI_LANGUAGES) as Language[]).map(lang => <option key={lang} value={lang}>{UI_LANGUAGES[lang]}</option>)}
          </Select>
        </Row>
        <Row label={t('settings.general.font')}>
          <Select value={fontFamily} onChange={e => setFontFamily(e.target.value as FontFamily)}>
            <optgroup label="Sans-Serif">
              {(Object.keys(FONT_FAMILIES) as FontFamily[]).filter(f => FONT_FAMILIES[f].category === 'sans').map(f => (
                <option key={f} value={f}>{FONT_FAMILIES[f].name}</option>
              ))}
            </optgroup>
            <optgroup label="Nerd Fonts">
              {(Object.keys(FONT_FAMILIES) as FontFamily[]).filter(f => FONT_FAMILIES[f].category === 'nerd').map(f => (
                <option key={f} value={f}>{FONT_FAMILIES[f].name}</option>
              ))}
            </optgroup>
          </Select>
        </Row>
        <Row label={t('settings.general.accentColor')} hint={t('settings.general.accentHint')}>
          <div className="accent-color-picker">
            {(Object.keys(ACCENT_COLORS) as Array<keyof typeof ACCENT_COLORS>).map(colorKey => (
              <button
                key={colorKey}
                className={`accent-color-btn ${accentColor === colorKey ? 'active' : ''}`}
                style={{ backgroundColor: ACCENT_COLORS[colorKey].color }}
                onClick={() => setAccentColor(colorKey)}
                title={ACCENT_COLORS[colorKey].name}
              />
            ))}
            {accentColor === 'custom' && (
              <button
                className="accent-color-btn custom-color-swatch active"
                style={{ backgroundColor: customAccentColor }}
                onClick={() => setAccentColor('custom')}
                title={customAccentColor}
              />
            )}
            <label className="accent-color-btn custom-color-btn" title={t('settings.general.customColor')}>
              <input
                type="color"
                value={customAccentColor}
                onChange={e => { setCustomAccentColor(e.target.value); setAccentColor('custom') }}
                className="sui-visually-hidden"
              />
            </label>
          </div>
        </Row>
        <Row label={t('settings.general.backgroundColor')}>
          <div className="accent-color-picker background-picker">
            {(Object.keys(BACKGROUND_COLORS) as BackgroundColor[]).map(colorKey => (
              <button
                key={colorKey}
                className={`accent-color-btn ${backgroundColor === colorKey ? 'active' : ''}`}
                style={{ backgroundColor: BACKGROUND_COLORS[colorKey].light }}
                onClick={() => setBackgroundColor(colorKey)}
                title={BACKGROUND_COLORS[colorKey].name}
              />
            ))}
            {backgroundColor === 'custom' && (
              <button
                className="accent-color-btn custom-color-swatch active"
                style={{ backgroundColor: customBackgroundColorLight }}
                onClick={() => setBackgroundColor('custom')}
                title={customBackgroundColorLight}
              />
            )}
            <label className="accent-color-btn custom-color-btn" title={t('settings.general.customColor')}>
              <input
                type="color"
                value={customBackgroundColorLight}
                onChange={e => {
                  setCustomBackgroundColorLight(e.target.value)
                  const hex = e.target.value
                  const r = Math.round(parseInt(hex.slice(1, 3), 16) * 0.1)
                  const g = Math.round(parseInt(hex.slice(3, 5), 16) * 0.1)
                  const b = Math.round(parseInt(hex.slice(5, 7), 16) * 0.1)
                  setCustomBackgroundColorDark(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`)
                  setBackgroundColor('custom')
                }}
                className="sui-visually-hidden"
              />
            </label>
          </div>
        </Row>
        <Row label={t('settings.general.logo')} hint={t('settings.general.logo.description')}>
          {customLogo && <img src={customLogo} width="28" height="28" className="sui-logo-preview" alt="" />}
          <Button onClick={async () => { const dataUrl = await window.electronAPI.selectCustomLogo(); if (dataUrl) setCustomLogo(dataUrl) }}>
            {t('settings.general.logo.upload')}
          </Button>
          {customLogo && (
            <Button variant="link" onClick={async () => { await window.electronAPI.removeCustomLogo(); removeCustomLogo() }}>
              {t('settings.general.logo.remove')}
            </Button>
          )}
        </Row>
        <PresentationSection />
        <Row label={t('settings.general.resetAppearance')} hint={t('settings.general.resetAppearanceHint')}>
          <Button
            danger
            onClick={() => {
              // Auf die ECHTEN Store-Defaults zurücksetzen (Petrol-Akzent, weißer Hintergrund).
              setTheme('system')
              setAccentColor('ink')
              setBackgroundColor('default')
              setFontFamily('system')
              setCustomAccentColor('#d4875a')
              setCustomBackgroundColorLight('#ffffff')
              setCustomBackgroundColorDark('#0d0d0d')
              removeCustomLogo()
            }}
          >
            {t('settings.general.reset')}
          </Button>
        </Row>
      </Card>

      <SectionTitle title={t('settings.general.groupStart')} />
      <Card>
        <Row label={t('settings.general.loadLastVault')} htmlFor="general-load-last-vault">
          <Toggle id="general-load-last-vault" checked={loadLastVaultOnStart} onChange={setLoadLastVaultOnStart} />
        </Row>
      </Card>

      <SectionTitle title={t('settings.general.groupFolders')} />
      <Card>
        <Row label={t('settings.general.notesRoot')} hint={<>{notesRootFolder || t('settings.general.notSet')} · {t('settings.general.notesRootHint')}</>}>
          <Button
            disabled={!vaultPath}
            onClick={async () => {
              if (!vaultPath) return
              const folder = await window.electronAPI.selectFolderInVault(vaultPath)
              if (folder !== null) setNotesRootFolder(folder)
            }}
          >
            {t('settings.general.chooseFolder')}
          </Button>
          <Button
            disabled={!vaultPath}
            onClick={async () => {
              if (!vaultPath) return
              await window.electronAPI.ensureDir(`${vaultPath}/Notes`)
              const tree = await window.electronAPI.readDirectory(vaultPath)
              setFileTree(tree)
              setNotesRootFolder('Notes')
            }}
          >
            {t('settings.general.createNotes')}
          </Button>
          <Button variant="link" onClick={() => setNotesRootFolder('')}>{t('settings.general.reset')}</Button>
        </Row>
        <Row label={t('settings.general.projectsRoot')} hint={<>{projectsRootFolder || t('settings.general.notSet')} · {t('settings.general.projectsRootHint')}</>}>
          <Button
            disabled={!vaultPath}
            onClick={async () => {
              if (!vaultPath) return
              const folder = await window.electronAPI.selectFolderInVault(vaultPath)
              if (folder !== null) setProjectsRootFolder(folder)
            }}
          >
            {t('settings.general.chooseFolder')}
          </Button>
          <Button variant="link" onClick={() => setProjectsRootFolder('')}>{t('settings.general.reset')}</Button>
        </Row>
      </Card>

      <SectionTitle title={t('settings.impact.section')} />
      <ImpactCard t={t} />
    </div>
  )
}

// Zeitbilanz: Referenzzeiten je Tätigkeit, Stundensatz, Statusleiste. Ehrlichkeitsregeln
// siehe CLAUDE.md „Arbeitsbilanz" — hier nur die Eingabe, keine Rechnung.
const ImpactCard: React.FC<{ t: TabTFn }> = ({ t }) => {
  const referenceMinutes = useUIStore(state => state.impact.referenceMinutes)
  const setReferenceMinutes = useUIStore(state => state.setReferenceMinutes)
  const referenceSources = useUIStore(state => state.impact.referenceSources)
  const setReferenceSource = useUIStore(state => state.setReferenceSource)
  const hourlyRate = useUIStore(state => state.impact.hourlyRate)
  const currency = useUIStore(state => state.impact.currency)
  const showInStatusBar = useUIStore(state => state.impact.showInStatusBar)
  const setImpact = useUIStore(state => state.setImpact)

  const labels: Record<ValuedType, string> = {
    'table-merge': t('voiceCommand.activityType.tableMerge'),
    document: t('voiceCommand.activityType.document'),
    summary: t('voiceCommand.activityType.summary'),
    'web-research': t('voiceCommand.activityType.webResearch'),
    'email-tasks': t('voiceCommand.activityType.emailTasks'),
    shell: t('voiceCommand.activityType.shell'),
    other: t('voiceCommand.activityType.other'),
    'attendance-list': t('voiceCommand.activityType.attendanceList'),
    'wp-post': t('voiceCommand.activityType.wpPost'),
    'ig-caption': t('voiceCommand.activityType.igCaption')
  }

  return (
    <Card>
      <Row label={t('settings.impact.referenceTitle')} hint={t('settings.impact.referenceHint')} />
      {VALUED_TYPES.filter(isReferenceable).map(type => {
        const minutes = referenceMinutes[type]
        return (
          <Row key={type} label={labels[type]}>
            <input
              type="number"
              className="sui-input is-number"
              min={0}
              step={5}
              value={minutes ?? ''}
              placeholder={t('settings.impact.placeholder')}
              onChange={e => setReferenceMinutes(type, e.target.value === '' ? null : Number(e.target.value))}
            />
            <span className="sui-unit">{t('settings.impact.column')}</span>
            <Select
              value={referenceSources?.[type] ?? 'estimated'}
              onChange={e => setReferenceSource(type, e.target.value === 'measured' ? 'measured' : 'estimated')}
              aria-label={t('settings.impact.source')}
              disabled={!(minutes && minutes > 0)}
            >
              <option value="estimated">{t('settings.impact.sourceEstimated')}</option>
              <option value="measured">{t('settings.impact.sourceMeasured')}</option>
            </Select>
          </Row>
        )
      })}
      <Row label={t('settings.impact.hourlyRate')} hint={t('settings.impact.hourlyRateHint')}>
        <input
          type="number"
          className="sui-input is-number"
          min={0}
          step={5}
          value={typeof hourlyRate === 'number' && hourlyRate > 0 ? hourlyRate : ''}
          placeholder={t('settings.impact.placeholder')}
          onChange={e => {
            const v = Number(e.target.value)
            setImpact({ hourlyRate: e.target.value === '' || !Number.isFinite(v) || v <= 0 ? null : v })
          }}
        />
        <TextInput
          narrow
          value={currency ?? 'EUR'}
          onCommit={v => setImpact({ currency: v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'EUR' })}
          placeholder="EUR"
        />
      </Row>
      <Row label={t('settings.impact.statusBar')} hint={t('settings.impact.statusBarHint')} htmlFor="impact-status-bar">
        <Toggle id="impact-status-bar" checked={showInStatusBar} onChange={v => setImpact({ showInStatusBar: v })} />
      </Row>
      <Details title={t('settings.impact.howTitle')}>
        <p>{t('settings.impact.hint')}</p>
        <p>{t('settings.impact.basis')}</p>
        <p>{t('settings.impact.sourceHint')}</p>
      </Details>
    </Card>
  )
}
