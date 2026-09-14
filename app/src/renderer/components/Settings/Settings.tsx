import React, { useState, useEffect, useMemo } from 'react'
import { useUIStore, AI_LANGUAGES, MODULE_CATEGORIES, type LLMBackend, type ModuleCategory, type ModuleDescriptor } from '../../stores/uiStore'
import { MODULES, isModuleEnabled, setModuleEnabled, useIsModuleEnabled, isPluginModule, pluginIdsForModule } from '../../utils/modules'
import { PluginSlot, getSettingsSections } from '../../plugins/slots'
import { SETTINGS_SECTION_SLOT } from '@mindgraph/plugin-api'
import { pluginErrorText } from '../../utils/pluginErrors'
import { catalogCategories, filterCatalogEntries } from '../../utils/catalogFilter'
import { useNotesStore } from '../../stores/notesStore'
import { useTranslation } from '../../utils/translations'
import { TelegramSettings } from './TelegramSettings'
import { CredentialsSettings } from './CredentialsSettings'
import { ModelCompatibilitySection, ActiveModelStatusBadge } from './ModelCompatibilitySection'
import { OpenRouterSection } from './OpenRouterSection'
import { LLMBaseSection } from './LLMBaseSection'
import { WebResearchSection } from './WebResearchSection'
import { AgentShellSection } from './AgentShellSection'
import { ImageGenerationSection } from './ImageGenerationSection'
import { SkillsSection } from './SkillsSection'
import { SettingsSearch, type SettingsSearchEntry } from './SettingsSearch'
import { GeneralSettingsTab } from './GeneralSettingsTab'
import { EditorSettingsTab } from './EditorSettingsTab'
import { ShortcutsTab } from './ShortcutsTab'
import { DataviewTab } from './DataviewTab'
import { SyncSettingsTab } from './SyncSettingsTab'
import { EmailSettingsTab } from './EmailSettingsTab'
import { EdooboxSettingsTab } from './EdooboxSettingsTab'
import { RemarkableSettingsTab } from './RemarkableSettingsTab'
import type { Tab, TabTFn } from './settingsTypes'
import { TransportSettingsTab } from './TransportSettingsTab'
import { VaultSettingsTab } from './VaultSettingsTab'
import { SpeechSettingsTab } from './SpeechSettingsTab'
import { DashboardSettingsTab } from './DashboardSettingsTab'
import { IntegrationsTab } from './IntegrationsTab'
import { useIntegrationStatus, type IntegrationStatus, type ConnState } from './useIntegrationStatus'
import { PageHeader, SectionTitle, Card, ServiceHead, IconTile, TILE_GLYPH, Row, Note, Details, Toggle, Segmented, Select, Button, NumberInput, TextInput, Hero, ModuleOffCard } from './SettingsUI'
import { CLOUD_TEST_MODELS, RECOMMENDED_PULL_MODELS, isCloudModel, modelMarkers } from '../../../shared/modelCompatibility'
import { ModelRamWarning } from '../Shared/ModelRamWarning'
import { ModelPicker } from '../Shared/ModelPicker'
import { ExternalLink } from '../Shared/ExternalLink'

import {
  TemplateConfig,
  CustomTemplate,
  DEFAULT_TEMPLATES,
  loadTemplateConfig,
  saveTemplateConfig,
  generateRandomId
} from '../../utils/templateEngine'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: Tab
  initialAnchor?: string
}


type BuiltInTemplateKey = 'empty' | 'dailyNote' | 'zettel' | 'meeting'

type SelectedTemplate = {
  type: 'builtin'
  key: BuiltInTemplateKey
} | {
  type: 'custom'
  id: string
}

// Navigations-Icons der Einstellungen (18 px Strichglyphen), gekeyt nach Tab.
// Die Nav wird datengetrieben gerendert (Gruppen klappen ein) — Icons hier, Gruppen im Render.
const NAV_ICONS: Record<string, React.ReactNode> = {
  vault: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 5L9 2L16 5V13L9 16L2 13V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 8V16M2 5L9 8L16 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  general: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 1V3M9 15V17M1 9H3M15 9H17M3.5 3.5L5 5M13 13L14.5 14.5M3.5 14.5L5 13M13 5L14.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  editor: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M13.5 2.5L15.5 4.5L6 14H4V12L13.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  templates: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 6H13M5 9H13M5 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  shortcuts: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4 8H5M7 8H8M10 8H11M13 8H14M5 11H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="10" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="2" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="10" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  dailyNote: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 6h6M6 9h6M6 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="13" cy="13" r="4" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M13 11v2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  brain: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2.5C7 2.5 5.5 4 5.5 6c0 .4.05.8.16 1.17C4.36 7.66 3.5 8.74 3.5 10c0 1.04.6 1.95 1.5 2.43C5 13.4 5.84 14 6.8 14c.43 0 .82-.12 1.16-.32C8.31 14.5 9.13 15 10 15c1.66 0 3-1.12 3-2.5 0-.18-.02-.36-.06-.53.94-.46 1.56-1.32 1.56-2.32 0-1.07-.7-1.99-1.7-2.42.13-.4.2-.81.2-1.23 0-2-1.5-3.5-3.5-3.5-.36 0-.7.05-1 .15-.3-.1-.65-.15-1-.15z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 6v8M7 9c1 1 3 1 4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  skills: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2l1.8 4.4L15 8.2l-4.2 1.8L9 14.4 7.2 10 3 8.2l4.2-1.8L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M14.5 12.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
  transport: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 9l6-6 6 6M9 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  dataview: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 7H13M5 10H13M5 13H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  ai: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2l1.8 4.4L15 8.2l-4.2 1.8L9 14.4 7.2 10 3 8.2l4.2-1.8L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  modules: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L2 6l7 4 7-4-7-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M2 12l7 4 7-4M2 9l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  integrations: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M6 9H12M9 6V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="11" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="2" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="11" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  email: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="4" width="13" height="10" rx="1.8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3.5 5.5L8.2 9.1a1.3 1.3 0 001.6 0l4.7-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  agents: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 6v6M6 9h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  speech: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 1a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M14 8v1a5 5 0 0 1-10 0V8M9 14v3M6 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  remarkable: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="1" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 5h4M7 8h4M7 11h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  plugin: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M6 2v4M12 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 6h10v3a5 5 0 01-10 0V6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  telegram: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 9l14-6-2 13-5-3-3 3v-4l8-6-9 5-3-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  sync: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 9C3 5.69 5.69 3 9 3C11.22 3 13.15 4.26 14.13 6.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M15 9C15 12.31 12.31 15 9 15C6.78 15 4.85 13.74 3.87 11.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 6H15V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 12H3V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  credentials: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M12 3a3 3 0 0 1 3 3v2h1v7H2V8h1V6a3 3 0 0 1 3-3h6zm0 1.5H6a1.5 1.5 0 0 0-1.5 1.5v2h9V6A1.5 1.5 0 0 0 12 4.5zM9 10.5a1.5 1.5 0 0 0-.75 2.8V14h1.5v-.7A1.5 1.5 0 0 0 9 10.5z" stroke="currentColor" strokeWidth="1" fill="none"/>
    </svg>
  )
}

const BUILTIN_LABELS: Record<BuiltInTemplateKey, string> = {
  empty: 'Leere Notiz',
  dailyNote: 'Daily Note',
  zettel: 'Zettel',
  meeting: 'Meeting'
}

// Konvertiert einen Browser-KeyboardEvent in einen Electron-Accelerator-String.
// Gibt null zurück, wenn die Kombination ungültig ist (z. B. nur Modifier, oder
// überhaupt kein Modifier — globalShortcut.register() lehnt solche Kombinationen ab).
// Konsistente Icon-Kachel je Modul-Kategorie (Kern-Module haben kein eigenes iconText) — lucide-artige
// White-Stroke-Glyphen + Kategorie-Farbe. Single-Source für renderModuleRow.
const CATEGORY_VISUAL: Record<ModuleCategory, { color: string; path: React.ReactNode }> = {
  ai: { color: '#7c5cff', path: <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /> },
  communication: { color: '#2f7af5', path: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></> },
  business: { color: '#e0823d', path: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></> },
  learning: { color: '#2fab6b', path: <><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></> },
  research: { color: '#cc4d8f', path: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></> },
  devices: { color: '#5b6470', path: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></> },
  documents: { color: '#3aa0b0', path: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></> },
}
const categoryGlyph = (cat: ModuleCategory): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {CATEGORY_VISUAL[cat].path}
  </svg>
)

// Module, deren Konfiguration in einem anderen Settings-Tab liegt: nach dem
// Aktivieren direkt dorthin springen können — Toggle (hier) und Einrichtung
// (dort) sind sonst zwei getrennte Orte ohne Verbindung.
// Konfigurationsort eines Moduls: fester Tab, optional mit Anker auf die Dienst-Karte
// (Integrationen) oder Sektion (KI). Die Wahrheit über den Verbindungszustand steht damit
// an beiden Orten — Modul-Tab (Status-Zeile) und Konfigurationsseite (Karte).
const MODULE_CONFIG_TABS: Record<string, { tab: Tab; anchor?: string }> = {
  email: { tab: 'email' },
  speech: { tab: 'speech' },
  remarkable: { tab: 'remarkable' },
  'mz-suite': { tab: 'agents' },
  'smart-connections': { tab: 'ai', anchor: 'ai-smart-connections' },
  'web-research': { tab: 'ai', anchor: 'ai-webresearch' },
  'agent-shell': { tab: 'ai', anchor: 'ai-agentshell' },
  'image-generation': { tab: 'ai', anchor: 'ai-imagegen' },
  zotero: { tab: 'integrations', anchor: 'integration-zotero' },
  'semantic-scholar': { tab: 'integrations', anchor: 'integration-research' },
  readwise: { tab: 'integrations', anchor: 'integration-readwise' },
  docling: { tab: 'integrations', anchor: 'integration-docling' },
  'vision-ocr': { tab: 'integrations', anchor: 'integration-vision-ocr' },
  'language-tool': { tab: 'integrations', anchor: 'integration-languagetool' }
}

// Config-Ziel eines Moduls: fester Eintrag oben ODER — bei Plugin-Modulen — der dynamische
// Tab `plugin:<id>`, wenn das Plugin eine settings.section beiträgt (z.B. Antares).
function moduleConfigTab(modId: string): { tab: Tab; anchor?: string } | undefined {
  if (MODULE_CONFIG_TABS[modId]) return MODULE_CONFIG_TABS[modId]
  const sections = getSettingsSections()
  const pluginId = pluginIdsForModule(modId).find(id => sections.some(c => c.pluginId === id))
  return pluginId ? { tab: `plugin:${pluginId}` } : undefined
}

type ModuleFilter = 'all' | 'active' | 'setup'

const ModulesTab: React.FC<{
  t: TabTFn
  onOpenTab: (tab: Tab, anchor?: string) => void
  status: IntegrationStatus
}> = ({ t, onOpenTab, status }) => {
  // useUIStore als Abhängigkeit einbinden, damit der Tab bei Flag-Änderungen rerendert
  const _tick = useUIStore(s => `${s.notesChatEnabled}${s.projectRagEnabled}${s.smartConnectionsEnabled}${s.flashcardsEnabled}${s.workflowCanvasEnabled}${s.webResearchEnabled}${s.semanticScholarEnabled}${s.zoteroEnabled}${s.languageTool.enabled}${s.email.enabled}${s.readwise.enabled}${s.docling.enabled}${s.visionOcr.enabled}${s.speech.enabled}`)
  void _tick
  // Generische Plugin-Module (z.B. Antares) liegen in pluginConfig — separat abonnieren, sonst
  // löst ein Toggle über die generische Config-API keinen Re-Render des Modul-Tabs aus.
  const _pluginTick = useUIStore(s => s.pluginConfig)
  void _pluginTick

  // Fehlertext pro Modul, falls der Main-Prozess der Aktivierung nicht folgen kann (A-pre #1).
  const [moduleErrors, setModuleErrors] = useState<Record<string, string>>({})
  const toggleModule = (modId: ModuleDescriptor['id'], next: boolean) => {
    setModuleErrors(prev => { const { [modId]: _drop, ...rest } = prev; return rest })
    setModuleEnabled(modId, next).catch(err => {
      setModuleErrors(prev => ({ ...prev, [modId]: err instanceof Error ? err.message : String(err) }))
    })
  }

  // Disk-installierte Plugins (A1): Datei-Install, Liste der installierten Plugins (Version/Status)
  // mit Uninstall, sowie abgewiesene (beim Start nicht verifizierbare) Plugins.
  const [installing, setInstalling] = useState(false)
  const [installMsg, setInstallMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [installErrors, setInstallErrors] = useState<Array<{ id: string; version: string; code: string; message: string }>>([])
  const [diskPlugins, setDiskPlugins] = useState<Array<{ id: string; version: string; activation: string; readiness: string | null; error: string | null }>>([])
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [confirmingUninstall, setConfirmingUninstall] = useState<string | null>(null)
  // A3: Install per GitHub-Repo + Update-Badges (verdrahtet die ruhenden A2-IPCs).
  const [repoInput, setRepoInput] = useState('')
  const [repoTag, setRepoTag] = useState('')
  const [installingRepo, setInstallingRepo] = useState(false)
  const [updates, setUpdates] = useState<Array<{ id: string; repo: string; current: string; latest: string; hasUpdate: boolean }>>([])
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  // A3-Voll: browsebarer Katalog (Discovery, read-only). Beim Öffnen einmal laden + manueller Refresh.
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; repo: string; description?: string; author?: string; category?: string; tag?: string }>>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [installingCatalogId, setInstallingCatalogId] = useState<string | null>(null)
  // A5: Katalog-Suche + Kategorie-Filter (rein clientseitig über die geladenen Einträge).
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogCategory, setCatalogCategory] = useState<string | null>(null)
  // Redesign: „Erweitert"-Block (manuelle Installation per Repo/Datei) standardmäßig eingeklappt.
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Lokalisierte Anzeige der Laufzeit-Enums (sonst englische Rohwerte für DE-User).
  const activationLabel: Record<string, string> = {
    active: t('settings.modules.statusActive'),
    disabled: t('settings.modules.statusDisabled'),
    starting: t('settings.modules.statusStarting'),
    stopping: t('settings.modules.statusStopping'),
    error: t('settings.modules.statusError'),
  }
  const readinessLabel: Record<string, string> = {
    ready: t('settings.modules.readyReady'),
    'needs-configuration': t('settings.modules.readyNeedsConfig'),
    unavailable: t('settings.modules.readyUnavailable'),
  }
  const statusText = (p: { activation: string; readiness: string | null }) => {
    const act = activationLabel[p.activation] ?? p.activation
    // Readiness nur bei aktivem Plugin zeigen (bei disabled/error ist sie redundant).
    if (p.activation === 'active' && p.readiness && readinessLabel[p.readiness]) {
      return `${act} · ${readinessLabel[p.readiness]}`
    }
    return act
  }
  const refreshDiskPlugins = () => {
    window.electronAPI.pluginInstallErrors().then(res => {
      if (res.ok && res.data) setInstallErrors(res.data)
    }).catch(() => { /* read-only Diagnose — Fehler ignorieren */ })
    window.electronAPI.pluginInstalled().then(res => {
      if (res.ok && res.data) setDiskPlugins(res.data)
    }).catch(() => { /* read-only — Fehler ignorieren */ })
  }
  useEffect(refreshDiskPlugins, [])
  // Verständliche Plugin-Fehlermeldung — NIE Rohtext/Code an einer Installationsfläche zeigen.
  const pluginErr = (code?: string, raw?: string) => pluginErrorText(t as (key: string) => string, code, raw)
  const handleInstallPlugin = async () => {
    setInstalling(true)
    setInstallMsg(null)
    try {
      const res = await window.electronAPI.pluginInstall()
      if (res.ok && res.data) {
        setInstallMsg({ ok: true, text: t('settings.modules.installSuccess', { id: res.data.id, version: res.data.version }) })
      } else if (!res.canceled) {
        setInstallMsg({ ok: false, text: t('settings.modules.installFailed', { error: pluginErr(res.code, res.error) }) })
      }
      refreshDiskPlugins()
    } catch (err) {
      console.error('[plugin:install]', err)
      setInstallMsg({ ok: false, text: t('settings.modules.installFailed', { error: t('plugins.error.unknown') }) })
    } finally {
      setInstalling(false)
    }
  }
  const handleUninstallPlugin = async (id: string) => {
    setConfirmingUninstall(null)
    setUninstalling(id)
    setInstallMsg(null)
    try {
      const res = await window.electronAPI.pluginUninstall(id)
      if (!res.ok) {
        setInstallMsg({ ok: false, text: t('settings.modules.uninstallFailed', { error: res.error ?? '?' }) })
      }
      refreshDiskPlugins()
    } catch (err) {
      console.error('[plugin:uninstall]', err)
      setInstallMsg({ ok: false, text: t('settings.modules.uninstallFailed', { error: t('plugins.error.unknown') }) })
    } finally {
      setUninstalling(null)
    }
  }
  // A3: Update-Check (read-only) — beim Öffnen einmal + manueller Button. Kein Hintergrund-Polling.
  const handleCheckUpdates = async () => {
    setCheckingUpdates(true)
    try {
      const res = await window.electronAPI.pluginCheckUpdates()
      if (res.ok && res.data) setUpdates(res.data)
    } catch { /* read-only — Fehler ignorieren */ } finally {
      setCheckingUpdates(false)
    }
  }
  const handleInstallFromRepo = async () => {
    const repo = repoInput.trim()
    if (!repo) return
    setInstallingRepo(true)
    setInstallMsg(null)
    try {
      const res = await window.electronAPI.pluginInstallFromGithub(repo, repoTag.trim() || undefined)
      if (res.ok && res.data) {
        setInstallMsg({ ok: true, text: t('settings.modules.installSuccess', { id: res.data.id, version: res.data.version }) })
        setRepoInput(''); setRepoTag('')
        refreshDiskPlugins(); void handleCheckUpdates()
      } else {
        setInstallMsg({ ok: false, text: pluginErr(res.code, res.error) })
      }
    } catch (err) {
      console.error('[plugin:installFromGithub]', err)
      setInstallMsg({ ok: false, text: t('plugins.error.unknown') })
    } finally {
      setInstallingRepo(false)
    }
  }
  // 1-Klick-Update: lädt das neueste Release desselben Repos über denselben verifizierten A2-Pfad.
  const handleUpdatePlugin = async (id: string, repo: string) => {
    setUpdatingId(id)
    setInstallMsg(null)
    try {
      const res = await window.electronAPI.pluginInstallFromGithub(repo)
      if (res.ok && res.data) {
        setInstallMsg({ ok: true, text: t('settings.modules.installSuccess', { id: res.data.id, version: res.data.version }) })
        refreshDiskPlugins(); void handleCheckUpdates()
      } else {
        setInstallMsg({ ok: false, text: pluginErr(res.code, res.error) })
      }
    } catch (err) {
      console.error('[plugin:installFromGithub]', err)
      setInstallMsg({ ok: false, text: t('plugins.error.unknown') })
    } finally {
      setUpdatingId(null)
    }
  }
  useEffect(() => { void handleCheckUpdates() }, [])
  // A3-Voll: Katalog laden (read-only Discovery). Beim Öffnen einmal + manueller Refresh.
  const loadCatalog = async () => {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const res = await window.electronAPI.pluginCatalog()
      if (res.ok && res.data) setCatalog(res.data)
      else setCatalogError(pluginErr(res.code, res.error))
    } catch {
      setCatalogError(t('plugins.error.unknown'))
    } finally {
      setCatalogLoading(false)
    }
  }
  useEffect(() => { void loadCatalog() }, [])
  // Install/Update aus dem Katalog — DERSELBE verifizierte A2-Pfad wie „Per Repo installieren".
  const handleInstallFromCatalog = async (entry: { id: string; repo: string; tag?: string }) => {
    setInstallingCatalogId(entry.id)
    setInstallMsg(null)
    try {
      const res = await window.electronAPI.pluginInstallFromGithub(entry.repo, entry.tag)
      if (res.ok && res.data) {
        setInstallMsg({ ok: true, text: t('settings.modules.installSuccess', { id: res.data.id, version: res.data.version }) })
        refreshDiskPlugins(); void handleCheckUpdates()
      } else {
        setInstallMsg({ ok: false, text: pluginErr(res.code, res.error) })
      }
    } catch (err) {
      console.error('[plugin:installFromGithub]', err)
      setInstallMsg({ ok: false, text: t('plugins.error.unknown') })
    } finally {
      setInstallingCatalogId(null)
    }
  }
  // Verfügbare Updates per Plugin-ID für die Disk-Liste.
  const updateById = new Map(updates.filter(u => u.hasUpdate).map(u => [u.id, u] as const))
  // Installierte Version je Plugin-ID — für den Katalog-Status (nicht installiert / installiert / Update).
  const installedById = new Map(diskPlugins.map(p => [p.id, p.version] as const))
  // A5: Kategorien (für die Filter-Chips) + gefilterte Sicht (Suche + Kategorie).
  const catCategories = catalogCategories(catalog)
  const visibleCatalog = filterCatalogEntries(catalog, catalogSearch, catalogCategory)

  // Kern- von plugin-gestützten Modulen trennen: „MindGraph-Module" (immer dabei) vs.
  // „Installierte Plugins" (eigenständige Vertikalen, später per Store verwaltbar).
  const coreModules = MODULES.filter(m => !isPluginModule(m.id))
  const pluginMods = MODULES.filter(m => isPluginModule(m.id))

  const grouped: Record<ModuleCategory, ModuleDescriptor[]> = {
    ai: [], communication: [], business: [], learning: [], research: [], devices: [], documents: []
  }
  for (const mod of coreModules) grouped[mod.category].push(mod)

  const orderedCategories: ModuleCategory[] = ['ai', 'communication', 'business', 'learning', 'research', 'devices', 'documents']

  // Status-Zeile je aktivem Modul mit Konfiguration (Redesign 2b). Verbindungszustand aus
  // useIntegrationStatus; für Module ohne prüfbare Verbindung nur der Sprung „Einstellungen →".
  const emailAccounts = useUIStore(s => s.email.accounts.length)
  const readwiseHasKey = useUIStore(s => !!s.readwise.apiKey)
  const visionModel = useUIStore(s => s.visionOcr.model)
  const webResearchCfg = useUIStore(s => s.webResearchConfig)
  const [imageGenKey, setImageGenKey] = useState<boolean | null>(null)
  useEffect(() => {
    window.electronAPI.imageGenLoadKey().then(k => setImageGenKey(!!k)).catch(() => setImageGenKey(null))
  }, [])
  const connLabel = (s: ConnState, okLabel?: string) =>
    s === 'connected' ? (okLabel ?? t('settings.connected')) : s === 'checking' ? t('settings.checkingConnection') : t('settings.notConnected')
  const connTone = (s: ConnState): 'ok' | 'off' | 'warn' | 'checking' =>
    s === 'connected' ? 'ok' : s === 'checking' ? 'checking' : 'off'
  const moduleStatus = (id: string): { tone: 'ok' | 'off' | 'warn' | 'checking'; label: string } | null => {
    switch (id) {
      case 'zotero': return { tone: connTone(status.zotero), label: connLabel(status.zotero) }
      case 'semantic-scholar': return { tone: connTone(status.openAlex), label: connLabel(status.openAlex, status.openAlexKeySaved ? t('settings.modules.status.openAlexKey') : t('settings.modules.status.openAlexDemo')) }
      case 'docling': return { tone: connTone(status.docling), label: connLabel(status.docling) }
      case 'language-tool': return { tone: connTone(status.languageTool), label: connLabel(status.languageTool) }
      case 'readwise': return readwiseHasKey ? { tone: connTone(status.readwise), label: connLabel(status.readwise) } : { tone: 'off', label: t('settings.modules.status.noKey') }
      case 'vision-ocr': return visionModel ? { tone: 'ok', label: t('settings.modules.status.modelReady', { model: visionModel }) } : { tone: 'off', label: t('settings.modules.status.noModel') }
      case 'email': return emailAccounts > 0 ? { tone: 'ok', label: t('settings.modules.status.accounts', { n: emailAccounts }) } : { tone: 'off', label: t('settings.modules.status.noAccount') }
      case 'image-generation': return imageGenKey === null ? null : imageGenKey ? { tone: 'ok', label: t('settings.modules.status.keyStored') } : { tone: 'off', label: t('settings.modules.status.noKey') }
      case 'web-research': {
        if (!webResearchCfg) return null
        const ok = webResearchCfg.provider === 'searxng' ? !!webResearchCfg.searxngUrl : webResearchCfg.provider === 'tavily' ? webResearchCfg.hasTavilyKey : webResearchCfg.hasLinkupKey
        return ok ? { tone: 'ok', label: t('settings.modules.status.configured') } : { tone: 'off', label: t('settings.modules.status.notConfigured') }
      }
      default: return null
    }
  }

  const [filter, setFilter] = useState<ModuleFilter>('all')
  const needsSetup = (mod: ModuleDescriptor) => {
    if (!isModuleEnabled(mod.id)) return false
    const st = moduleStatus(mod.id)
    return !!st && st.tone === 'off'
  }
  const allMods = [...coreModules, ...pluginMods]
  const activeCount = allMods.filter(m => isModuleEnabled(m.id)).length
  const setupCount = allMods.filter(needsSetup).length
  const passesFilter = (mod: ModuleDescriptor) =>
    filter === 'all' ? true : filter === 'active' ? isModuleEnabled(mod.id) : needsSetup(mod)

  const renderModuleRow = (mod: ModuleDescriptor, official?: boolean) => {
    const enabled = isModuleEnabled(mod.id)
    const config = moduleConfigTab(mod.id)
    const st = enabled ? moduleStatus(mod.id) : null
    return (
      // htmlFor MUSS explizit gesetzt sein: ohne es wäre das Label-Ziel das ERSTE labelbare
      // Element im Baum — und das ist der „Konfigurieren"-<button>, nicht die Checkbox.
      // Ein Klick auf die Zeile/den Toggle öffnete dann den Config-Tab statt umzuschalten.
      <label key={mod.id} htmlFor={`module-toggle-${mod.id}`} className={`module-row ${enabled ? 'active' : 'is-off'}`}>
        <div
          className="module-row-icon"
          style={{ background: mod.iconText ? (mod.iconColor || 'var(--accent-color, #4a9eff)') : CATEGORY_VISUAL[mod.category].color }}
          aria-hidden="true"
        >
          {mod.iconText ? (
            <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
              <text x="14" y="20" textAnchor="middle" fill="white" fontFamily="'Georgia', 'Times New Roman', serif" fontWeight="700" fontSize="18">
                {mod.iconText}
              </text>
            </svg>
          ) : categoryGlyph(mod.category)}
        </div>
        <div className="module-row-body">
          <div className="module-row-label">
            {mod.label}
            {official && (
              <span className="module-row-badge" title={t('settings.modules.officialBadge')}>
                ✓ {t('settings.modules.officialBadge')}
              </span>
            )}
          </div>
          <div className="module-row-desc">{mod.description}</div>
          {moduleErrors[mod.id] && (
            <div className="module-row-error" style={{ color: 'var(--error-color, #e5484d)', fontSize: '0.8em', marginTop: 4 }}>
              {moduleErrors[mod.id]}
            </div>
          )}
          {enabled && (st || config) && (
            <div className="module-row-status">
              {st && (
                <>
                  <span className={`sui-dot is-${st.tone}`} aria-hidden="true" />
                  <span className={`is-${st.tone}`}>{st.label}</span>
                </>
              )}
              {st && config && <span className="sui-sep">·</span>}
              {config && (
                <button
                  type="button"
                  className="module-row-configure"
                  style={{ marginTop: 0 }}
                  onClick={(e) => {
                    // Row ist ein <label> um die Toggle-Checkbox — ohne preventDefault
                    // würde der Klick das Modul gleich wieder deaktivieren.
                    e.preventDefault()
                    e.stopPropagation()
                    onOpenTab(config.tab, config.anchor)
                  }}
                >
                  {st && st.tone === 'off' ? t('settings.ui.setupLink') : t('settings.ui.settingsLink')}
                </button>
              )}
            </div>
          )}
        </div>
        <input
          id={`module-toggle-${mod.id}`}
          type="checkbox"
          className="module-toggle-input"
          checked={enabled}
          onChange={e => toggleModule(mod.id, e.target.checked)}
        />
        <span className="module-toggle" aria-hidden="true" />
      </label>
    )
  }

  return (
    <div className="settings-section">
      <div className="modules-head">
        <div className="settings-tab-header">
          <h2>{t('settings.modules.tabTitle')}</h2>
          <p className="settings-tab-subtitle">{t('settings.modules.hint')}</p>
        </div>
        <Segmented
          options={[
            { value: 'all' as ModuleFilter, label: `${t('settings.modules.filterAll')} · ${allMods.length}` },
            { value: 'active' as ModuleFilter, label: `${t('settings.modules.filterActive')} · ${activeCount}` },
            { value: 'setup' as ModuleFilter, label: `${t('settings.modules.filterSetup')} · ${setupCount}` }
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel={t('settings.modules.filterLabel')}
        />
      </div>

      {orderedCategories.map(cat => {
        const visible = grouped[cat].filter(passesFilter)
        if (grouped[cat].length === 0 || visible.length === 0) return null
        const on = grouped[cat].filter(m => isModuleEnabled(m.id)).length
        return (
          <div key={cat} className="modules-category">
            <div className="sui-section" style={{ margin: '0 0 8px' }}>
              <span>{MODULE_CATEGORIES[cat]}</span>
              <span className="sui-section-meta">{t('settings.modules.categoryMeta', { on, total: grouped[cat].length })}</span>
            </div>
            <div className="modules-list">
              {visible.map(mod => renderModuleRow(mod))}
            </div>
          </div>
        )
      })}
      {filter !== 'all' && allMods.filter(passesFilter).length === 0 && (
        <p className="settings-hint">{filter === 'setup' ? t('settings.modules.filterSetupEmpty') : t('settings.modules.filterActiveEmpty')}</p>
      )}

      <div className="plugins-zone">
        <div className="plugins-zone-header">
          <div className="module-row-icon" style={{ background: '#5b6470', boxShadow: 'none' }} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </div>
          <div>
            <h3 className="plugins-zone-title">{t('settings.modules.pluginsZoneTitle')}</h3>
            <p className="plugins-zone-subtitle">{t('settings.modules.pluginsZoneSubtitle')}</p>
          </div>
        </div>
        {installMsg && (
          <p
            className="settings-hint"
            style={{ color: installMsg.ok ? 'var(--success-color, #30a46c)' : 'var(--error-color, #e5484d)' }}
          >
            {installMsg.text}
          </p>
        )}

        <div className="plugins-subsection">
          <div className="plugins-subsection-head">
            <h4 className="plugins-subsection-title">{t('settings.modules.catalogTitle')}</h4>
            <button className="settings-btn-secondary" onClick={loadCatalog} disabled={catalogLoading}>
              {catalogLoading ? t('settings.modules.catalogLoading') : t('settings.modules.catalogRefresh')}
            </button>
          </div>
        <p className="settings-hint">{t('settings.modules.catalogHint')}</p>
        {catalogError && (
          <p className="settings-hint" style={{ color: 'var(--error-color, #e5484d)' }}>{catalogError}</p>
        )}
        {catalog.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0' }}>
            <input
              className="settings-input"
              style={{ flex: '1 1 180px', minWidth: 140 }}
              placeholder={t('settings.modules.catalogSearchPlaceholder')}
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
            />
            {catCategories.length > 1 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button
                  className="settings-btn-secondary"
                  style={catalogCategory === null ? { borderColor: 'var(--accent-color, #4a9eff)', color: 'var(--accent-color, #4a9eff)' } : undefined}
                  onClick={() => setCatalogCategory(null)}
                >
                  {t('settings.modules.catalogAllCategories')}
                </button>
                {catCategories.map(cat => (
                  <button
                    key={cat}
                    className="settings-btn-secondary"
                    style={catalogCategory === cat ? { borderColor: 'var(--accent-color, #4a9eff)', color: 'var(--accent-color, #4a9eff)' } : undefined}
                    onClick={() => setCatalogCategory(catalogCategory === cat ? null : cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="modules-list">
          {!catalogError && !catalogLoading && catalog.length === 0 && (
            <p className="settings-hint">{t('settings.modules.catalogEmpty')}</p>
          )}
          {catalog.length > 0 && visibleCatalog.length === 0 && (
            <p className="settings-hint">{t('settings.modules.catalogNoMatch')}</p>
          )}
          {visibleCatalog.map(entry => {
            const installedVersion = installedById.get(entry.id)
            const upd = updateById.get(entry.id)
            const busy = installingCatalogId === entry.id
            return (
              <div key={entry.id} className="module-row">
                <div className="module-row-icon catalog-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #4a9eff)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                    <path d="m3.3 7 8.7 5 8.7-5" />
                    <path d="M12 22V12" />
                  </svg>
                </div>
                <div className="module-row-body">
                  <div className="module-row-label">
                    {entry.name}
                    {entry.category && <span className="catalog-cat-chip">{entry.category}</span>}
                  </div>
                  {entry.description && <div className="module-row-desc">{entry.description}</div>}
                  <div className="module-row-desc" style={{ opacity: 0.7, fontSize: '0.8em' }}>
                    {entry.repo}{entry.author ? ` · ${entry.author}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {installedVersion && upd ? (
                    <button className="settings-btn-primary" onClick={() => handleInstallFromCatalog(entry)} disabled={busy}>
                      {busy ? t('settings.modules.updating') : t('settings.modules.updateButton', { current: upd.current, latest: upd.latest })}
                    </button>
                  ) : installedVersion ? (
                    <button className="settings-btn-secondary" disabled>
                      {t('settings.modules.catalogInstalled')} {installedVersion}
                    </button>
                  ) : (
                    <button className="settings-btn-primary" onClick={() => handleInstallFromCatalog(entry)} disabled={busy}>
                      {busy ? t('settings.modules.installing') : t('settings.modules.catalogInstall')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="plugins-subsection">
        <div className="plugins-subsection-head">
          <h4 className="plugins-subsection-title">{t('settings.modules.diskPluginsTitle')}</h4>
          <button className="settings-btn-secondary" onClick={handleCheckUpdates} disabled={checkingUpdates}>
            {checkingUpdates ? t('settings.modules.checkingUpdates') : t('settings.modules.checkUpdates')}
          </button>
        </div>
        <div className="modules-list">
          {diskPlugins.length === 0
            ? <p className="settings-hint">{t('settings.modules.diskPluginsEmpty')}</p>
            : diskPlugins.map(p => {
              const upd = updateById.get(p.id)
              return (
              <div key={p.id} className="module-row">
                <div className="module-row-body">
                  <div className="module-row-label">
                    {p.id} {p.version}
                    {upd && (
                      <span style={{ marginLeft: 8, fontSize: '0.72em', color: 'var(--accent-color, #4a9eff)', border: '1px solid var(--accent-color, #4a9eff)', borderRadius: 4, padding: '1px 5px' }}>
                        {t('settings.modules.updateAvailable')}
                      </span>
                    )}
                  </div>
                  <div className="module-row-desc">{statusText(p)}</div>
                  {p.error && (
                    <div className="module-row-error" style={{ color: 'var(--error-color, #e5484d)', fontSize: '0.8em', marginTop: 4 }}>
                      {p.error}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {upd && (
                    <button
                      className="settings-btn-secondary"
                      onClick={() => handleUpdatePlugin(p.id, upd.repo)}
                      disabled={updatingId === p.id}
                    >
                      {updatingId === p.id
                        ? t('settings.modules.updating')
                        : t('settings.modules.updateButton', { current: upd.current, latest: upd.latest })}
                    </button>
                  )}
                  {confirmingUninstall === p.id ? (
                    <>
                      <button
                        className="settings-btn-secondary"
                        style={{ color: 'var(--error-color, #e5484d)' }}
                        onClick={() => handleUninstallPlugin(p.id)}
                        disabled={uninstalling === p.id}
                      >
                        {uninstalling === p.id ? t('settings.modules.uninstalling') : t('settings.modules.uninstallConfirm')}
                      </button>
                      <button className="settings-btn-secondary" onClick={() => setConfirmingUninstall(null)} disabled={uninstalling === p.id}>
                        {t('settings.modules.cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      className="settings-btn-secondary"
                      onClick={() => setConfirmingUninstall(p.id)}
                      disabled={uninstalling !== null}
                    >
                      {t('settings.modules.uninstall')}
                    </button>
                  )}
                </div>
              </div>
              )
            })}
        </div>
      </div>

      {pluginMods.length > 0 && (
        <div className="plugins-subsection">
          <h4 className="plugins-subsection-title">{t('settings.modules.officialPluginsTitle')}</h4>
          <div className="modules-list" style={{ marginTop: 8 }}>
            {pluginMods.map(mod => renderModuleRow(mod, true))}
          </div>
        </div>
      )}

      <div className={`plugins-advanced ${advancedOpen ? 'open' : ''}`}>
        <button className="plugins-advanced-summary" onClick={() => setAdvancedOpen(o => !o)} aria-expanded={advancedOpen}>
          <span className="plugins-advanced-caret">▸</span>
          {t('settings.modules.advancedTitle')}
        </button>
        {advancedOpen && (
          <div className="plugins-advanced-body">
            <p className="settings-hint" style={{ marginTop: 0 }}>{t('settings.modules.advancedHint')}</p>
            <div className="modules-install-repo" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              <input
                className="settings-input"
                style={{ flex: '1 1 160px', minWidth: 120 }}
                placeholder={t('settings.modules.repoPlaceholder')}
                value={repoInput}
                onChange={e => setRepoInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleInstallFromRepo() }}
                disabled={installingRepo}
              />
              <input
                className="settings-input"
                style={{ flex: '0 1 120px', minWidth: 90 }}
                placeholder={t('settings.modules.tagPlaceholder')}
                value={repoTag}
                onChange={e => setRepoTag(e.target.value)}
                disabled={installingRepo}
              />
              <button className="settings-btn-secondary" onClick={handleInstallFromRepo} disabled={installingRepo || !repoInput.trim()}>
                {installingRepo ? t('settings.modules.installing') : t('settings.modules.installFromRepoButton')}
              </button>
            </div>
            <p className="settings-hint">{t('settings.modules.installFromRepoHint')}</p>
            <button className="settings-btn-secondary" onClick={handleInstallPlugin} disabled={installing} style={{ marginTop: 6 }}>
              {installing ? t('settings.modules.installing') : t('settings.modules.installPlugin')}
            </button>
          </div>
        )}
      </div>

      {installErrors.length > 0 && (
        <div className="modules-category" style={{ marginTop: 16 }}>
          <h4 className="modules-category-title">{t('settings.modules.installErrorsTitle')}</h4>
          <p className="settings-hint">{t('settings.modules.installErrorsHint')}</p>
          <div className="modules-list">
            {installErrors.map(err => (
              <div key={`${err.id}@${err.version}`} className="module-row">
                <div className="module-row-body">
                  <div className="module-row-label">{err.id} {err.version}</div>
                  <div className="module-row-error" style={{ color: 'var(--error-color, #e5484d)', fontSize: '0.8em', marginTop: 4 }}>
                    {pluginErr(err.code, err.message)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, initialTab, initialAnchor }) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'general')

  // Dynamische Plugin-Settings-Tabs: ein Tab pro settings.section-Beitrag eines AKTIVEN
  // Plugins (Konvention: Gate `pluginConfig.<pluginId>.enabled`, wie usePluginEnabled).
  // Der Kern nennt kein Plugin namentlich — Titel/Sichtbarkeit kommen aus der Registrierung.
  const pluginConfigState = useUIStore(s => s.pluginConfig)
  const pluginSettingsSections = useMemo(
    () => getSettingsSections().filter(c => pluginConfigState[c.pluginId]?.enabled === true),
    [pluginConfigState]
  )

  // Wenn der initialTab sich ändert (z.B. vom HelpGuide), übernehmen
  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab)
  }, [isOpen, initialTab])

  // Settings-Suche (Design 1b): Sprung zum Tab, optional zum Anker mit kurzem Aufblitzen.
  const navigateToSetting = (tab: string, anchor?: string) => {
    setActiveTab(tab as Tab)
    if (!anchor) return
    window.setTimeout(() => {
      const el = document.querySelector(`[data-settings-anchor="${anchor}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('settings-anchor-flash')
        window.setTimeout(() => el.classList.remove('settings-anchor-flash'), 1800)
      }
    }, 90)
  }
  // Deep-Link aus einer anderen Oberfläche (z.B. unkonfigurierter Web-Globus): nach dem
  // Tab-Wechsel exakt zur Zielsektion scrollen, statt nur oben im langen KI-Tab zu landen.
  useEffect(() => {
    if (!isOpen || !initialAnchor) return
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-settings-anchor="${initialAnchor}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('settings-anchor-flash')
        window.setTimeout(() => el.classList.remove('settings-anchor-flash'), 1800)
      }
    }, 90)
    return () => window.clearTimeout(timer)
  }, [isOpen, initialTab, initialAnchor])
  // Verbindungszustand der externen Dienste — geteilt von Integrations- und Modul-Tab
  const integrationStatus = useIntegrationStatus(isOpen && (activeTab === 'integrations' || activeTab === 'modules'))
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [lmstudioStatus, setLmstudioStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string; size: number }>>([])
  const [lmstudioModels, setLmstudioModels] = useState<Array<{ name: string; size: number }>>([])


  // Ollama Pull Model State
  const [pullModelName, setPullModelName] = useState('qwen3.5:4b')
  const [customPullModelName, setCustomPullModelName] = useState('')
  const [isPulling, setIsPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const [pullSuccess, setPullSuccess] = useState(false)

  // UI Store — nur noch, was die Shell selbst braucht (KI-Tab, Tägliche Notiz, Gehirn)
  const {
    ollama,
    setOllama,
    smartConnectionsEnabled,
    flashcardsEnabled,
    smartConnectionsWeights,
    setSmartConnectionsWeights,
    smartConnectionsRerankerEnabled,
    setSmartConnectionsRerankerEnabled,
    language,
    dailyNote: dailyNoteSettings,
    setDailyNote,
    brain: brainSettings,
    setBrain
  } = useUIStore()

  const { t } = useTranslation()

  const { vaultPath } = useNotesStore()

  // Kuratierter Such-Index (Design 1b, Befund S1): alle Tabs + die wichtigsten
  // Einzel-Einstellungen mit Pfad und Synonym-Keywords. Modell-Orte sind komplett
  // abgedeckt — genau die waren vorher über 7 Tabs verstreut.
  // Modul-Flags als Hook-Werte, damit der Index nach dem asynchronen Laden der
  // Modul-Konfiguration neu gebaut wird (sonst fehlen z.B. die E-Mail-Einträge).
  const searchEmailEnabled = useIsModuleEnabled('email')
  const searchSpeechEnabled = useIsModuleEnabled('speech')
  const searchRemarkableEnabled = useIsModuleEnabled('remarkable')
  const searchWebResearchEnabled = useIsModuleEnabled('web-research')
  const searchImageGenEnabled = useIsModuleEnabled('image-generation')
  const agentShellModuleOn = useIsModuleEnabled('agent-shell')
  const projectRagOn = useIsModuleEnabled('project-rag')
  const searchIndex = React.useMemo<SettingsSearchEntry[]>(() => {
    const g = {
      basics: t('settings.nav.basics'),
      workflow: t('settings.nav.workflow'),
      modules: t('settings.nav.modules'),
      account: t('settings.nav.account')
    }
    const entries: SettingsSearchEntry[] = [
      // Tabs
      { id: 'tab-general', tab: 'general', label: t('settings.tab.general'), path: g.basics, keywords: 'allgemein general theme design darstellung' },
      { id: 'tab-editor', tab: 'editor', label: t('settings.tab.editor'), path: g.basics, keywords: 'editor schreiben lesen markdown' },
      { id: 'tab-templates', tab: 'templates', label: t('settings.tab.templates'), path: g.basics, keywords: 'vorlagen templates' },
      { id: 'tab-shortcuts', tab: 'shortcuts', label: t('settings.tab.shortcuts'), path: g.basics, keywords: 'tastenkürzel shortcuts hotkeys tastatur keyboard' },
      { id: 'tab-dashboard', tab: 'dashboard', label: t('settings.dashboard.title'), path: g.workflow, keywords: 'dashboard radar widgets' },
      { id: 'tab-dailyNote', tab: 'dailyNote', label: t('settings.tab.dailyNote'), path: g.workflow, keywords: 'tägliche notiz daily journal' },
      { id: 'tab-brain', tab: 'brain', label: t('settings.tab.brain'), path: g.workflow, keywords: 'brain gehirn tagesgedächtnis rückblick zeitstrahl' },
      { id: 'tab-skills', tab: 'skills', label: t('settings.tab.skills'), path: g.workflow, keywords: 'skills fähigkeiten agent' },
      { id: 'tab-transport', tab: 'transport', label: t('settings.transport.title'), path: g.workflow, keywords: 'schnellerfassung quick capture zettel diktat transport' },
      { id: 'tab-dataview', tab: 'dataview', label: t('settings.tab.dataview'), path: g.workflow, keywords: 'dataview abfragen queries tabellen' },
      { id: 'tab-ai', tab: 'ai', label: t('settings.tab.ai'), path: g.modules, keywords: 'ki ai modelle models ollama lm studio cloud llm' },
      { id: 'tab-modules', tab: 'modules', label: t('settings.tab.modules'), path: g.modules, keywords: 'module features aktivieren deaktivieren' },
      { id: 'tab-integrations', tab: 'integrations', label: t('settings.tab.integrations'), path: g.modules, keywords: 'integrationen zotero research openalex readwise languagetool docling' },
      { id: 'tab-email', tab: 'email', label: t('settings.email.title'), path: g.modules, keywords: 'email e-mail imap smtp posteingang mail' },
      { id: 'tab-speech', tab: 'speech', label: t('settings.tab.speech'), path: g.modules, keywords: 'sprache diktat vorlesen whisper stt tts speech voice' },
      { id: 'tab-remarkable', tab: 'remarkable', label: 'reMarkable', path: g.modules, keywords: 'remarkable tablet ereader export' },
      { id: 'tab-telegram', tab: 'telegram', label: 'Telegram', path: g.modules, keywords: 'telegram bot agent messenger' },
      { id: 'tab-sync', tab: 'sync', label: t('settings.tab.sync'), path: g.account, keywords: 'sync synchronisation geräte verschlüsselung passphrase aktivierungscode' },
      { id: 'tab-credentials', tab: 'credentials', label: 'Zugangsdaten', path: g.account, keywords: 'zugangsdaten credentials passwörter api keys schlüssel' },
      // Allgemein
      { id: 'general-theme', tab: 'general', label: t('settings.general.theme'), path: `${g.basics} → ${t('settings.tab.general')}`, keywords: 'theme hell dunkel dark light system' },
      { id: 'general-accent', tab: 'general', label: t('settings.general.accentColor'), path: `${g.basics} → ${t('settings.tab.general')}`, keywords: 'akzentfarbe accent farbe petrol color' },
      { id: 'general-language', tab: 'general', label: t('settings.general.language'), path: `${g.basics} → ${t('settings.tab.general')}`, keywords: 'sprache oberfläche language deutsch english ui' },
      { id: 'general-font', tab: 'general', label: t('settings.general.font'), path: `${g.basics} → ${t('settings.tab.general')}`, keywords: 'schriftart font typografie' },
      // Wortschatz wie im Befehlskatalog: die Wörter, die Nutzer benutzen — „gespart",
      // „bilanz", „wieviel zeit", nicht nur die interne Benennung.
      { id: 'general-impact', tab: 'general', label: t('settings.impact.section'), path: `${g.basics} → ${t('settings.tab.general')}`, keywords: 'zeitersparnis referenzzeit minuten gespart bilanz tagesbilanz effizienz statusleiste zeitgewinn wieviel zeit' },
      // Editor
      { id: 'editor-default-view', tab: 'editor', label: t('settings.editor.defaultViewLabel'), path: `${g.basics} → ${t('settings.tab.editor')}`, keywords: 'standardmodus lesen schreiben markdown default view' },
      { id: 'editor-languagetool', tab: 'editor', label: 'LanguageTool', path: `${g.basics} → ${t('settings.tab.editor')}`, keywords: 'rechtschreibung grammatik korrektur languagetool prüfen' },
      { id: 'editor-backlinks', tab: 'editor', label: t('settings.editor.showBacklinks'), path: `${g.basics} → ${t('settings.tab.editor')}`, keywords: 'backlinks verknüpft kontextspalte' },
      { id: 'editor-header-actions', tab: 'editor', label: t('settings.editor.headerActions'), path: `${g.basics} → ${t('settings.tab.editor')}`, keywords: 'export pdf docx remarkable wordpress kopfzeile' },
      // KI & Modelle (vorher über 7 Tabs verstreut — Befund S1)
      { id: 'ai-backend', tab: 'ai', label: t('settings.integrations.backend'), path: `${g.modules} → ${t('settings.tab.ai')}`, keywords: 'backend ollama lm studio lokal ki ai', anchor: 'ai-backend' },
      { id: 'ai-default-model', tab: 'ai', label: t('settings.integrations.ollama.model'), path: `${g.modules} → ${t('settings.tab.ai')}`, keywords: 'standard modell default model chat analyse qwen', anchor: 'ai-default-model' },
      { id: 'ai-matrix', tab: 'ai', label: t('settings.integrations.compatibility.title'), path: `${g.modules} → ${t('settings.tab.ai')}`, keywords: 'modell kompatibilität matrix modul override brain aufgaben extraktion mail zusammenfassung eignung verdict', anchor: 'ai-matrix' },
      { id: 'ai-embedding', tab: 'ai', label: 'Projekt-RAG Embedding', path: `${g.modules} → ${t('settings.tab.ai')}`, keywords: 'embedding modell bge nomic smart connections ähnlichkeit rag', anchor: 'ai-embedding' },
      { id: 'ai-openrouter', tab: 'ai', label: 'OpenRouter (Cloud)', path: `${g.modules} → ${t('settings.tab.ai')}`, keywords: 'openrouter cloud api opt-in claude gpt', anchor: 'ai-openrouter' },
      { id: 'ai-llmbase', tab: 'ai', label: 'LLMBase (europäischer Anbieter)', path: `${g.modules} → ${t('settings.tab.ai')}`, keywords: 'llmbase eu dsgvo cloud europa', anchor: 'ai-llmbase' },
      { id: 'ai-webresearch', tab: 'ai', label: 'Webrecherche', path: `${g.modules} → ${t('settings.tab.ai')}`, keywords: 'webrecherche tavily linkup suche web research agent', anchor: 'ai-webresearch' },
      { id: 'ai-imagegen', tab: 'ai', label: 'Bild-Generierung', path: `${g.modules} → ${t('settings.tab.ai')}`, keywords: 'bild generierung nano banana imagen google bilder image generation api key', anchor: 'ai-imagegen' },
      { id: 'ai-smart-connections', tab: 'ai', label: t('settings.integrations.smartConnections'), path: `${g.modules} → ${t('settings.tab.ai')}`, keywords: 'smart connections gewichte reranker ähnliche notizen', anchor: 'ai-smart-connections' },
      // Integrationen: eine Dienst-Karte pro Anker
      { id: 'integ-zotero', tab: 'integrations', label: 'Zotero', path: `${g.modules} → ${t('settings.tab.integrations')}`, keywords: 'zotero better bibtex zitate literatur', anchor: 'integration-zotero' },
      { id: 'integ-research', tab: 'integrations', label: t('settings.integ.research.name'), path: `${g.modules} → ${t('settings.tab.integrations')}`, keywords: 'research openalex semantic scholar paper api key mailto', anchor: 'integration-research' },
      { id: 'integ-readwise', tab: 'integrations', label: 'Readwise', path: `${g.modules} → ${t('settings.tab.integrations')}`, keywords: 'readwise highlights sync token', anchor: 'integration-readwise' },
      { id: 'integ-docling', tab: 'integrations', label: t('settings.integ.docling.name'), path: `${g.modules} → ${t('settings.tab.integrations')}`, keywords: 'docling pdf extraktion server docker', anchor: 'integration-docling' },
      { id: 'integ-vision-ocr', tab: 'integrations', label: t('settings.integ.ocr.name'), path: `${g.modules} → ${t('settings.tab.integrations')}`, keywords: 'vision ocr scan handschrift bild text modell seitenbreite', anchor: 'integration-vision-ocr' },
      { id: 'integ-languagetool', tab: 'integrations', label: 'LanguageTool', path: `${g.modules} → ${t('settings.tab.integrations')}`, keywords: 'languagetool grammatik rechtschreibung server api', anchor: 'integration-languagetool' },
      // E-Mail
      { id: 'email-analysis-model', tab: 'email', label: t('settings.email.analysisModel'), path: `${g.modules} → ${t('settings.email.title')}`, keywords: 'analyse modell email ki relevanz' },
      { id: 'email-signature', tab: 'email', label: t('settings.email.signature'), path: `${g.modules} → ${t('settings.email.title')}`, keywords: 'signatur unterschrift absender' },
      // Diktat & Vorlesen
      { id: 'speech-whisper', tab: 'speech', label: 'Whisper-Modell', path: `${g.modules} → ${t('settings.tab.speech')}`, keywords: 'whisper diktat stt modell transkription spracherkennung' },
      // Schnellerfassung
      { id: 'transport-zettel-folder', tab: 'transport', label: t('settings.transport.zettelDestination'), path: `${g.workflow} → ${t('settings.transport.title')}`, keywords: 'zettel zielordner zettelkasten schnellerfassung' }
    ]
    // Modul-gegatete Tabs nur anbieten, wenn sie auch in der Nav existieren
    return entries.filter(e => {
      if (['tab-email', 'email-analysis-model', 'email-signature'].includes(e.id)) return searchEmailEnabled
      if (['tab-speech', 'speech-whisper'].includes(e.id)) return searchSpeechEnabled
      if (e.id === 'tab-remarkable') return searchRemarkableEnabled
      if (e.id === 'ai-webresearch') return searchWebResearchEnabled
      if (e.id === 'ai-imagegen') return searchImageGenEnabled
      return true
    })
  }, [t, searchEmailEnabled, searchSpeechEnabled, searchRemarkableEnabled, searchWebResearchEnabled, searchImageGenEnabled])

  // App Version
  const [appVersion, setAppVersion] = useState<string>('')

  // Template State
  const [templates, setTemplates] = useState<TemplateConfig>(DEFAULT_TEMPLATES)
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplate>({ type: 'builtin', key: 'dailyNote' })
  const [templateHasChanges, setTemplateHasChanges] = useState(false)
  const [isSavingTemplates, setIsSavingTemplates] = useState(false)

  // App-Version laden
  useEffect(() => {
    if (isOpen) {
      window.electronAPI.getAppVersion().then((v: string) => setAppVersion(v))
    }
  }, [isOpen])

  // Lokales Backend (Ollama / LM Studio) prüfen — KI-Tab, E-Mail-Modell-Picker, Agenten, Modul-Status
  useEffect(() => {
    if (isOpen && (activeTab === 'ai' || activeTab === 'integrations' || activeTab === 'email' || activeTab === 'agents' || activeTab === 'modules')) {
      checkOllamaConnection()
      checkLmstudioConnection()
    }
  }, [isOpen, activeTab])

  // Templates laden
  useEffect(() => {
    if (isOpen && (activeTab === 'templates' || activeTab === 'dailyNote') && vaultPath) {
      loadTemplateConfig(vaultPath).then(config => {
        if (!config.custom) {
          config.custom = []
        }
        setTemplates(config)
        setTemplateHasChanges(false)
      })
    }
  }, [isOpen, activeTab, vaultPath])

  const checkOllamaConnection = async () => {
    setOllamaStatus('checking')
    try {
      const connected = await window.electronAPI.ollamaCheck()
      setOllamaStatus(connected ? 'connected' : 'disconnected')

      if (connected) {
        const models = await window.electronAPI.ollamaModels()
        setOllamaModels(models)
        // Wenn Ollama als Backend und noch kein Modell ausgewählt
        if (ollama.backend === 'ollama' && !ollama.selectedModel && models.length > 0) {
          setOllama({ selectedModel: models[0].name })
        }
      }
    } catch {
      setOllamaStatus('disconnected')
    }
  }

  const handlePullModel = async () => {
    const modelToPull = customPullModelName.trim() || pullModelName
    if (!modelToPull || isPulling) return

    setIsPulling(true)
    setPullError(null)
    setPullSuccess(false)
    setPullProgress({ status: 'starting...' })

    // Listen for progress
    window.electronAPI.onOllamaPullProgress((progress) => {
      setPullProgress(progress)
    })

    try {
      const result = await window.electronAPI.ollamaPullModel(modelToPull)
      if (result.success) {
        setPullSuccess(true)
        setPullProgress(null)
        setCustomPullModelName('')
        // Refresh models list and auto-select
        const models = await window.electronAPI.ollamaModels()
        setOllamaModels(models)
        setOllamaStatus('connected')
        setOllama({ selectedModel: modelToPull, enabled: true, backend: 'ollama' })
      } else {
        setPullError(result.error || 'Unknown error')
        setPullProgress(null)
      }
    } catch (err) {
      setPullError(err instanceof Error ? err.message : 'Unknown error')
      setPullProgress(null)
    } finally {
      setIsPulling(false)
    }
  }

  const handleDeleteModel = async (modelName: string) => {
    const confirmMsg = t('settings.integrations.ollama.deleteConfirm').replace('{name}', modelName)
    if (!confirm(confirmMsg)) return

    try {
      const result = await window.electronAPI.ollamaDeleteModel(modelName)
      if (result.success) {
        // Refresh models
        const models = await window.electronAPI.ollamaModels()
        setOllamaModels(models)
        if (ollama.selectedModel === modelName) {
          setOllama({ selectedModel: models.length > 0 ? models[0].name : '' })
        }
      }
    } catch (err) {
      console.error('Delete model error:', err)
    }
  }

  const checkLmstudioConnection = async () => {
    setLmstudioStatus('checking')
    try {
      const connected = await window.electronAPI.lmstudioCheck(ollama.lmStudioPort)
      setLmstudioStatus(connected ? 'connected' : 'disconnected')

      if (connected) {
        const models = await window.electronAPI.lmstudioModels(ollama.lmStudioPort)
        setLmstudioModels(models)
        // Wenn LM Studio als Backend und noch kein Modell ausgewählt
        if (ollama.backend === 'lm-studio' && !ollama.selectedModel && models.length > 0) {
          setOllama({ selectedModel: models[0].name })
        }
      }
    } catch {
      setLmstudioStatus('disconnected')
    }
  }

  // Template Functions
  const getSelectedContent = (): string => {
    if (selectedTemplate.type === 'builtin') {
      return templates[selectedTemplate.key]
    } else {
      const custom = templates.custom.find(t => t.id === selectedTemplate.id)
      return custom?.content || ''
    }
  }

  const getSelectedName = (): string => {
    if (selectedTemplate.type === 'builtin') {
      return BUILTIN_LABELS[selectedTemplate.key]
    } else {
      const custom = templates.custom.find(t => t.id === selectedTemplate.id)
      return custom?.name || ''
    }
  }

  const handleTemplateContentChange = (content: string) => {
    if (selectedTemplate.type === 'builtin') {
      setTemplates(prev => ({
        ...prev,
        [selectedTemplate.key]: content
      }))
    } else {
      setTemplates(prev => ({
        ...prev,
        custom: prev.custom.map(t =>
          t.id === selectedTemplate.id ? { ...t, content } : t
        )
      }))
    }
    setTemplateHasChanges(true)
  }

  const handleTemplateNameChange = (name: string) => {
    if (selectedTemplate.type === 'custom') {
      setTemplates(prev => ({
        ...prev,
        custom: prev.custom.map(t =>
          t.id === selectedTemplate.id ? { ...t, name } : t
        )
      }))
      setTemplateHasChanges(true)
    }
  }

  const handleCreateTemplate = () => {
    const newTemplate: CustomTemplate = {
      id: generateRandomId(8),
      name: t('settings.templates.newTemplate'),
      content: `# {{title}}\n\n{{cursor}}`
    }
    setTemplates(prev => ({
      ...prev,
      custom: [...prev.custom, newTemplate]
    }))
    setSelectedTemplate({ type: 'custom', id: newTemplate.id })
    setTemplateHasChanges(true)
  }

  const handleDeleteTemplate = () => {
    if (selectedTemplate.type !== 'custom') return
    if (!confirm(t('settings.templates.deleteConfirm'))) return

    setTemplates(prev => ({
      ...prev,
      custom: prev.custom.filter(tpl => tpl.id !== selectedTemplate.id)
    }))
    setSelectedTemplate({ type: 'builtin', key: 'dailyNote' })
    setTemplateHasChanges(true)
  }

  const handleSaveTemplates = async () => {
    if (!vaultPath) return
    setIsSavingTemplates(true)
    try {
      await saveTemplateConfig(vaultPath, templates)
      setTemplateHasChanges(false)
    } catch (error) {
      console.error('Fehler beim Speichern der Templates:', error)
    }
    setIsSavingTemplates(false)
  }

  const handleResetTemplate = () => {
    if (selectedTemplate.type === 'builtin') {
      setTemplates(prev => ({
        ...prev,
        [selectedTemplate.key]: DEFAULT_TEMPLATES[selectedTemplate.key]
      }))
      setTemplateHasChanges(true)
    }
  }

  const handleClose = () => {
    if (templateHasChanges) {
      if (confirm(t('settings.templates.unsavedConfirm'))) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  // Keyboard handler for Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, templateHasChanges])

  // Navigation: alle Gruppen sind standardmäßig offen — bei 22 Seiten zählt Überblick mehr
  // als Kompaktheit, denn wer nicht weiß, in welcher Gruppe „Diktat" oder „Schnellerfassung"
  // steckt, muss sonst raten und zweimal klicken. Ein Klick aufs Label klappt eine Gruppe
  // ein; die Wahl bleibt erhalten (Bedienprobe 14.09.2026: das Zurücksetzen beim
  // Seitenwechsel machte rückgängig, was man gerade selbst getan hatte). Passt die Liste
  // nicht in den Dialog, scrollt die Navigation, das Suchfeld bleibt oben stehen.
  const [openNavGroups, setOpenNavGroups] = useState<Record<string, boolean>>({})
  // Seitenwechsel beginnt oben — vorher blieb der Scroll der vorigen Seite stehen. Anker-Sprünge
  // (navigateToSetting) scrollen 90 ms später gezielt nach, das bleibt davon unberührt.
  const contentRef = React.useRef<HTMLDivElement>(null)
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0 }, [activeTab])
  type NavItem = { id: Tab; label: string; icon: React.ReactNode }
  const navGroups: Array<{ id: string; label: string; items: NavItem[] }> = [
    {
      id: 'basics',
      label: t('settings.nav.basics'),
      items: [
        { id: 'general', label: t('settings.tab.general'), icon: NAV_ICONS.general },
        { id: 'editor', label: t('settings.tab.editor'), icon: NAV_ICONS.editor },
        { id: 'templates', label: t('settings.tab.templates'), icon: NAV_ICONS.templates },
        { id: 'shortcuts', label: t('settings.tab.shortcuts'), icon: NAV_ICONS.shortcuts }
      ]
    },
    {
      id: 'workflow',
      label: t('settings.nav.workflow'),
      items: [
        { id: 'dashboard', label: t('settings.dashboard.title'), icon: NAV_ICONS.dashboard },
        { id: 'dailyNote', label: t('settings.tab.dailyNote'), icon: NAV_ICONS.dailyNote },
        { id: 'brain', label: t('settings.tab.brain'), icon: NAV_ICONS.brain },
        { id: 'skills', label: t('settings.tab.skills'), icon: NAV_ICONS.skills },
        { id: 'transport', label: t('settings.transport.title'), icon: NAV_ICONS.transport },
        { id: 'dataview', label: t('settings.tab.dataview'), icon: NAV_ICONS.dataview }
      ]
    },
    {
      id: 'modules',
      label: t('settings.nav.modules'),
      items: [
        // KI-Zentrale (Design 1c): alle Modell-Entscheidungen an einem Ort
        { id: 'ai', label: t('settings.tab.ai'), icon: NAV_ICONS.ai },
        { id: 'modules', label: t('settings.tab.modules'), icon: NAV_ICONS.modules },
        { id: 'integrations', label: t('settings.tab.integrations'), icon: NAV_ICONS.integrations },
        // Modul-Tabs nur bei aktivem Modul
        ...(searchEmailEnabled ? [{ id: 'email' as Tab, label: t('settings.email.title'), icon: NAV_ICONS.email }] : []),
        ...(isModuleEnabled('mz-suite') ? [{ id: 'agents' as Tab, label: t('settings.tab.agents'), icon: NAV_ICONS.agents }] : []),
        ...(searchSpeechEnabled ? [{ id: 'speech' as Tab, label: t('settings.tab.speech'), icon: NAV_ICONS.speech }] : []),
        ...(searchRemarkableEnabled ? [{ id: 'remarkable' as Tab, label: 'reMarkable', icon: NAV_ICONS.remarkable }] : []),
        // Plugin-Settings-Tabs: ein Eintrag pro settings.section-Beitrag eines aktiven
        // Plugins (z.B. Antares). Der Kern nennt kein Plugin namentlich.
        ...pluginSettingsSections.map(section => ({ id: `plugin:${section.pluginId}` as Tab, label: section.title ?? section.pluginId, icon: NAV_ICONS.plugin })),
        // Telegram: immer sichtbar (Bot-Feature)
        { id: 'telegram', label: 'Telegram', icon: NAV_ICONS.telegram }
      ]
    },
    {
      id: 'account',
      label: t('settings.nav.account'),
      items: [
        { id: 'sync', label: t('settings.tab.sync'), icon: NAV_ICONS.sync },
        { id: 'credentials', label: 'Zugangsdaten', icon: NAV_ICONS.credentials }
      ]
    }
  ]
  // Landet die aktive Seite in einer eingeklappten Gruppe (Suche, Anker-Sprung, Modul-Link),
  // wird nur DIESE Gruppe aufgedeckt — sonst wäre der markierte Eintrag unsichtbar.
  const activeGroupId = navGroups.find(g => g.items.some(i => i.id === activeTab))?.id
  useEffect(() => {
    if (!activeGroupId) return
    setOpenNavGroups(prev => (prev[activeGroupId] === false ? { ...prev, [activeGroupId]: true } : prev))
  }, [activeTab, activeGroupId])
  const renderNavItem = (item: NavItem) => (
    <button
      key={item.id}
      className={`settings-nav-item ${activeTab === item.id ? 'active' : ''}`}
      onClick={() => setActiveTab(item.id)}
    >
      {item.icon}
      {item.label}
    </button>
  )

  if (!isOpen) return null

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t('settings.title')}</h2>
          <button className="settings-close" onClick={handleClose} title={t('panel.close')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M4 12L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <nav className="settings-nav">
            {/* Settings-Suche (Design 1b): findet Tabs UND Einzel-Einstellungen */}
            <SettingsSearch entries={searchIndex} onNavigate={navigateToSetting} />
            {/* Vault (immer ganz oben, wenn geladen) */}
            {vaultPath && renderNavItem({ id: 'vault', label: t('settings.tab.vault'), icon: NAV_ICONS.vault })}
            {navGroups.map(group => {
              // undefined = Standard (offen), false = vom Nutzer eingeklappt.
              const open = openNavGroups[group.id] ?? true
              return (
                <React.Fragment key={group.id}>
                  <button
                    type="button"
                    className={`settings-nav-section-label is-collapsible${open ? ' is-open' : ''}`}
                    aria-expanded={open}
                    onClick={() => setOpenNavGroups(prev => ({ ...prev, [group.id]: !open }))}
                  >
                    <span>{group.label}</span>
                    <span className="settings-nav-section-count">
                      {!open && group.items.length}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                    </span>
                  </button>
                  {open && group.items.map(renderNavItem)}
                </React.Fragment>
              )
            })}
          </nav>

          <div className="settings-content" ref={contentRef}>
            {/* Petrol redesign: großer Seiten-Titel je Tab wie im Module-Tab (Konsistenz).
                Der Module-Tab bringt seinen eigenen Header inkl. Untertitel mit → hier ausgenommen. */}
            {/* Vault Tab */}
            {activeTab === 'vault' && vaultPath && (
              <VaultSettingsTab vaultPath={vaultPath} t={t} onNavigateToTab={setActiveTab} />
            )}

            {/* Allgemein Tab */}
            {activeTab === 'general' && <GeneralSettingsTab t={t} />}

            {/* Editor Tab */}
            {activeTab === 'editor' && <EditorSettingsTab t={t} />}

            {/* Templates Tab */}
            {activeTab === 'templates' && (
              <div className="settings-section">
              <PageHeader title={t('settings.tab.templates')} subtitle={t('settings.templates.subtitle')} />
              <div className="settings-templates">
                <div className="settings-templates-sidebar">
                  <div className="settings-templates-section">
                    <div className="settings-templates-section-title">{t('settings.templates.standard')}</div>
                    {(Object.keys(BUILTIN_LABELS) as BuiltInTemplateKey[]).map(key => (
                      <button
                        key={key}
                        className={`settings-templates-item ${selectedTemplate.type === 'builtin' && selectedTemplate.key === key ? 'active' : ''}`}
                        onClick={() => setSelectedTemplate({ type: 'builtin', key })}
                      >
                        {BUILTIN_LABELS[key]}
                      </button>
                    ))}
                  </div>

                  <div className="settings-templates-section">
                    <div className="settings-templates-section-title">
                      {t('settings.templates.own')}
                      <button className="settings-templates-add" onClick={handleCreateTemplate}>+</button>
                    </div>
                    {templates.custom.map(template => (
                      <button
                        key={template.id}
                        className={`settings-templates-item ${selectedTemplate.type === 'custom' && selectedTemplate.id === template.id ? 'active' : ''}`}
                        onClick={() => setSelectedTemplate({ type: 'custom', id: template.id })}
                      >
                        {template.name}
                      </button>
                    ))}
                    {templates.custom.length === 0 && (
                      <div className="settings-templates-empty">{t('settings.templates.noCustom')}</div>
                    )}
                  </div>
                </div>

                <div className="settings-templates-editor">
                  <div className="settings-templates-editor-header">
                    {selectedTemplate.type === 'custom' ? (
                      <input
                        type="text"
                        className="settings-templates-name-input"
                        value={getSelectedName()}
                        onChange={e => handleTemplateNameChange(e.target.value)}
                        placeholder="Template-Name"
                      />
                    ) : (
                      <span className="settings-templates-name">{getSelectedName()}</span>
                    )}
                    <div className="settings-templates-actions">
                      {selectedTemplate.type === 'builtin' && (
                        <button onClick={handleResetTemplate}>{t('settings.templates.standard')}</button>
                      )}
                      {selectedTemplate.type === 'custom' && (
                        <button className="danger" onClick={handleDeleteTemplate}>{t('settings.templates.delete')}</button>
                      )}
                    </div>
                  </div>
                  <textarea
                    className="settings-templates-textarea"
                    value={getSelectedContent()}
                    onChange={e => handleTemplateContentChange(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="settings-templates-help">
                    <strong>Variablen:</strong> {`{{title}}`}, {`{{date}}`}, {`{{date:DD.MM.YYYY}}`}, {`{{time}}`}, {`{{datetime}}`}, {`{{weekday}}`}, {`{{week}}`}, {`{{timestamp}}`}, {`{{uuid}}`}, {`{{cursor}}`}
                  </div>
                  {templateHasChanges && (
                    <div className="settings-templates-footer">
                      <button className="primary" onClick={handleSaveTemplates} disabled={isSavingTemplates}>
                        {isSavingTemplates ? t('settings.templates.saving') : t('settings.templates.saveTemplates')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              </div>
            )}

            {/* Integrationen Tab */}
            {/* KI & Modelle (Design 1c „KI-Zentrale"): Backend, Standard-Modell,
                Modul-Matrix, Embedding und Cloud-Provider an EINEM Ort — vorher
                über den Integrationen-Tab verstreut. */}
            {/* KI & Modelle (Redesign 2c): Status-Kopf bündelt Backend, Erreichbarkeit,
                Modellzahl und Hauptschalter; Modelle als Karte; Cloud-Anbieter als
                kollabierende Karten; Erklärtexte als Aufklapper. */}
            {activeTab === 'ai' && (() => {
              const isLm = ollama.backend === 'lm-studio'
              const backendState = isLm ? lmstudioStatus : ollamaStatus
              const backendModels = isLm ? lmstudioModels : ollamaModels
              const backendName = isLm ? 'LM Studio' : 'Ollama'
              const backendTone = backendState === 'connected' ? 'ok' : backendState === 'checking' ? 'checking' : 'off'
              const connected = backendState === 'connected'
              const cloudActiveCount = (searchImageGenEnabled ? 1 : 0) + (ollama.openrouter.enabled ? 1 : 0) + (ollama.llmbase.enabled ? 1 : 0)
              const weightTotal = smartConnectionsWeights.embedding + smartConnectionsWeights.keyword + smartConnectionsWeights.wikilink + smartConnectionsWeights.tags + smartConnectionsWeights.folder
              const weightRow = (key: 'embedding' | 'keyword' | 'wikilink' | 'tags' | 'folder') => (
                <Row key={key} label={t(`smartConnections.weights.${key}`)}>
                  <input
                    type="range"
                    className="sui-range"
                    min="0"
                    max="100"
                    step="5"
                    value={smartConnectionsWeights[key]}
                    onChange={e => setSmartConnectionsWeights({ [key]: parseInt(e.target.value, 10) })}
                  />
                  <span className="sui-unit" style={{ textAlign: 'right' }}>{smartConnectionsWeights[key]}%</span>
                </Row>
              )
              return (
                <div className="settings-section">
                  <PageHeader title={t('settings.tab.ai')} subtitle={t('settings.aiTab.subtitle')} />

                  <div data-settings-anchor="ai-backend">
                    <Hero
                      icon={TILE_GLYPH.cpu}
                      title={`${backendName} ${connected ? t('settings.ai.statusRunning') : backendState === 'checking' ? t('settings.checkingConnection') : t('settings.ai.statusOffline')}`}
                      dot={backendTone}
                      meta={
                        <>
                          {isLm ? `localhost:${ollama.lmStudioPort}` : 'localhost:11434'} · {backendModels.length} {t('settings.models')}
                          {ollama.selectedModel && <> · {t('settings.aiTab.defaultShort')}: <b>{ollama.selectedModel}</b></>}
                        </>
                      }
                      actions={
                        <>
                          <Segmented
                            options={[{ value: 'ollama' as LLMBackend, label: 'Ollama' }, { value: 'lm-studio' as LLMBackend, label: 'LM Studio' }]}
                            value={ollama.backend}
                            onChange={b => setOllama({ backend: b, selectedModel: '' })}
                            disabled={!ollama.enabled}
                            ariaLabel={t('settings.integrations.backend')}
                          />
                          <Button onClick={isLm ? checkLmstudioConnection : checkOllamaConnection} disabled={backendState === 'checking'}>
                            {t('settings.refresh')}
                          </Button>
                          <Toggle checked={ollama.enabled} onChange={v => setOllama({ enabled: v })} ariaLabel={t('settings.integrations.aiEnabled')} />
                        </>
                      }
                    />
                  </div>
                  <p className="sui-hero-note">{t('settings.aiTab.brainLocal')}</p>
                  <Details title={t('settings.aiTab.privacyMore')}>
                    <p>{t('settings.ai.privacyStory')}</p>
                  </Details>

                  {backendState === 'disconnected' && (
                    <Card>
                      <Note tone="warn" action={t('settings.integ.recheck')} onAction={isLm ? checkLmstudioConnection : checkOllamaConnection}>
                        {isLm ? (
                          <><b>LM Studio</b> {t('settings.integrations.lmstudioDesc')} {t('settings.integrations.lmstudioSetup')} · <ExternalLink href="https://lmstudio.ai">lmstudio.ai</ExternalLink></>
                        ) : (
                          <><b>Ollama</b> {t('settings.integrations.ollamaDesc')} {t('settings.integrations.installOllama')} <ExternalLink href="https://ollama.ai">ollama.ai</ExternalLink></>
                        )}
                      </Note>
                    </Card>
                  )}

                  {/* ── Modelle ── */}
                  <SectionTitle title={t('settings.aiTab.models')} />
                  <Card>
                    {isLm && (
                      <Row label={t('settings.aiTab.lmPort')}>
                        <NumberInput value={ollama.lmStudioPort} min={1} max={65535} onCommit={p => setOllama({ lmStudioPort: p })} />
                        <Button onClick={checkLmstudioConnection}>{t('settings.connect')}</Button>
                      </Row>
                    )}
                    <Row label={t('settings.aiTab.defaultModel')} hint={t('settings.aiTab.defaultModelHint')} anchor="ai-default-model" stacked>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <ModelPicker
                          value={ollama.selectedModel}
                          models={backendModels}
                          onChange={value => setOllama({ selectedModel: value })}
                          disabled={!ollama.enabled || !connected}
                          placeholder={{ value: '', label: t('settings.selectModel') }}
                          ariaLabel={t('settings.aiTab.defaultModel')}
                          style={{ flex: 1 }}
                          maxWidth="none"
                        />
                        {!isLm && ollama.selectedModel && (
                          <Button variant="link" onClick={() => handleDeleteModel(ollama.selectedModel)} title={t('settings.integrations.ollama.deleteModel')}>
                            {t('settings.integrations.ollama.deleteModel')}
                          </Button>
                        )}
                      </div>
                      <ActiveModelStatusBadge model={ollama.selectedModel} />
                      <ModelRamWarning model={ollama.selectedModel} />
                    </Row>
                    {!isLm && connected && projectRagOn && (() => {
                      const patterns = ['embed', 'minilm', 'bge', 'gte', 'e5', 'nomic']
                      const embs = ollamaModels.filter(m => patterns.some(p => m.name.toLowerCase().includes(p)))
                      const cur = ollama.projectRagEmbeddingModel || 'bge-m3'
                      if (!embs.some(m => m.name === cur)) embs.unshift({ name: cur, size: 0 })
                      return (
                        <Row label={t('settings.aiTab.embedding')} hint={t('settings.aiTab.embeddingHint')} anchor="ai-embedding">
                          <ModelPicker
                            value={cur}
                            models={embs}
                            onChange={value => setOllama({ projectRagEmbeddingModel: value })}
                            disabled={!ollama.enabled}
                            getLabel={name => {
                              const m = embs.find(e => e.name === name)
                              return name + (m && m.size === 0 ? (language === 'en' ? ' (not installed)' : ' (nicht installiert)') : '')
                            }}
                            ariaLabel={t('settings.aiTab.embedding')}
                            maxWidth={260}
                          />
                        </Row>
                      )
                    })()}
                    <Row label={t('settings.integrations.defaultTranslation')}>
                      <Select
                        value={ollama.defaultTranslateLanguage}
                        onChange={e => setOllama({ defaultTranslateLanguage: e.target.value as typeof ollama.defaultTranslateLanguage })}
                        disabled={!ollama.enabled}
                      >
                        {AI_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                      </Select>
                    </Row>
                    <div data-settings-anchor="ai-matrix">
                      <Details title={t('settings.aiTab.compatToggle')} wide defaultOpen={initialAnchor === 'ai-matrix'}>
                        <ModelCompatibilitySection availableModels={backendModels} />
                      </Details>
                    </div>
                    {!isLm && connected && (
                      <Details title={t('settings.aiTab.pullToggle')} wide>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <Select
                              value={pullModelName}
                              onChange={e => { setPullModelName(e.target.value); setCustomPullModelName('') }}
                              disabled={isPulling}
                              style={{ flex: 1 }}
                            >
                              <optgroup label={t('settings.integrations.ollama.cloudTestGroup')}>
                                {CLOUD_TEST_MODELS.map(m => <option key={m.name} value={m.name}>{m.label}</option>)}
                              </optgroup>
                              <optgroup label={t('settings.integrations.ollama.recommendedModels')}>
                                {RECOMMENDED_PULL_MODELS.filter(m => (m.kind ?? 'chat') === 'chat').map(m => (
                                  <option key={m.name} value={m.name}>{modelMarkers(m.name)}{m.label}</option>
                                ))}
                              </optgroup>
                              <optgroup label={t('settings.integrations.ollama.embeddingModels')}>
                                {RECOMMENDED_PULL_MODELS.filter(m => m.kind === 'embedding').map(m => (
                                  <option key={m.name} value={m.name}>{modelMarkers(m.name)}{m.label}</option>
                                ))}
                              </optgroup>
                            </Select>
                            <Button variant="primary" onClick={handlePullModel} disabled={isPulling}>
                              {isPulling ? t('settings.integrations.ollama.pulling') : t('settings.integrations.ollama.download')}
                            </Button>
                          </div>
                          <input
                            type="text"
                            className="sui-input"
                            style={{ width: '100%' }}
                            placeholder={t('settings.integrations.ollama.customModel')}
                            value={customPullModelName}
                            onChange={e => setCustomPullModelName(e.target.value)}
                            disabled={isPulling}
                            onKeyDown={e => { if (e.key === 'Enter') handlePullModel() }}
                          />
                          {isCloudModel(customPullModelName || pullModelName) && (
                            <span style={{ fontSize: '12px', color: 'var(--color-warning)' }}>{t('settings.integrations.ollama.cloudHint')}</span>
                          )}
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('settings.integrations.ollama.humanFavoriteHint')}</span>
                          {isPulling && pullProgress && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div className="inbox-progress-bar">
                                <div style={{
                                  width: pullProgress.total
                                    ? `${Math.round((pullProgress.completed || 0) / pullProgress.total * 100)}%`
                                    : '100%',
                                  ...(pullProgress.total ? {} : { animation: 'indeterminate 1.5s infinite linear' })
                                }} />
                              </div>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {pullProgress.status}
                                {pullProgress.total ? ` — ${Math.round((pullProgress.completed || 0) / pullProgress.total * 100)}%` : ''}
                              </span>
                            </div>
                          )}
                          {pullSuccess && <span style={{ fontSize: '12px', color: 'var(--color-success)' }}>{t('settings.integrations.ollama.pullSuccess')}</span>}
                          {pullError && <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{t('settings.integrations.ollama.pullError')}: {pullError}</span>}
                        </div>
                      </Details>
                    )}
                  </Card>

                  {/* ── Cloud-Anbieter (Opt-in) ── */}
                  <SectionTitle title={t('settings.aiTab.cloud')} meta={t('settings.aiTab.cloudActive', { n: cloudActiveCount, total: 3 })} />
                  <div data-settings-anchor="ai-imagegen"><ImageGenerationSection /></div>
                  <div data-settings-anchor="ai-openrouter"><OpenRouterSection /></div>
                  <div data-settings-anchor="ai-llmbase"><LLMBaseSection /></div>

                  {/* ── Agent-Fähigkeiten (nur bei aktivem Modul) ── */}
                  {(searchWebResearchEnabled || agentShellModuleOn) && <SectionTitle title={t('settings.aiTab.agent')} />}
                  {searchWebResearchEnabled && (
                    <Card anchor="ai-webresearch"><div className="sui-embed"><WebResearchSection /></div></Card>
                  )}
                  {agentShellModuleOn && (
                    <Card anchor="ai-agentshell"><div className="sui-embed"><AgentShellSection /></div></Card>
                  )}

                  {/* ── Smart Connections ── */}
                  <SectionTitle title={t('settings.aiTab.smartConnections')} />
                  {!smartConnectionsEnabled ? (
                    <ModuleOffCard
                      icon={<IconTile bg="#7c5cff">{TILE_GLYPH.spark}</IconTile>}
                      name="Smart Connections"
                      onEnable={() => { void setModuleEnabled('smart-connections', true).catch(err => console.error('[settings] smart-connections:', err)) }}
                      anchor="ai-smart-connections"
                    />
                  ) : (
                    <Card anchor="ai-smart-connections">
                      <ServiceHead
                        icon={<IconTile bg="#7c5cff">{TILE_GLYPH.spark}</IconTile>}
                        name="Smart Connections"
                        desc={t('settings.integrations.smartConnectionsHint')}
                      />
                      <Row label={t('smartConnections.weights.title')} hint={t('smartConnections.weights.hint')} />
                      {weightRow('embedding')}
                      {weightRow('keyword')}
                      {weightRow('wikilink')}
                      {weightRow('tags')}
                      {weightRow('folder')}
                      <Row label={t('smartConnections.weights.total')}>
                        <span style={{ fontWeight: 600, color: weightTotal === 100 ? 'var(--text-primary)' : 'var(--color-warning)' }}>{weightTotal}%</span>
                      </Row>
                      <Row label={t('settings.aiTab.rerankerTitle')} hint={t('settings.aiTab.rerankerHint')} htmlFor="sc-reranker">
                        <Toggle id="sc-reranker" checked={smartConnectionsRerankerEnabled} onChange={setSmartConnectionsRerankerEnabled} />
                      </Row>
                    </Card>
                  )}

                  {flashcardsEnabled && (!ollama.enabled || !ollama.selectedModel) && (
                    <Card>
                      <Note tone="warn">{t('settings.integrations.flashcardsOllamaWarning')}</Note>
                    </Card>
                  )}

                  <Details title={t('settings.aiTab.howTo')}>
                    <p>{t('settings.integrations.usage')}</p>
                    <p>{t('settings.integrations.transparency')}</p>
                  </Details>
                </div>
              )
            })()}

            {activeTab === 'integrations' && (
              <IntegrationsTab status={integrationStatus} onGoToModules={() => setActiveTab('modules')} />
            )}

            {/* Tastenkürzel Tab */}
            {activeTab === 'shortcuts' && <ShortcutsTab t={t} />}

            {/* Dataview Tab */}
            {activeTab === 'dataview' && <DataviewTab t={t} />}

            {/* Sync Tab */}
            {activeTab === 'sync' && <SyncSettingsTab t={t} />}

            {/* Tägliche Notiz Tab */}
            {activeTab === 'dailyNote' && (
              <div className="settings-section">
                <PageHeader title={t('settings.dailyNote.title')} subtitle={t('settings.dailyNote.subtitle')} />
                <Card>
                  <Row label={t('settings.dailyNote.enabled')} htmlFor="daily-enabled">
                    <Toggle id="daily-enabled" checked={dailyNoteSettings.enabled} onChange={v => setDailyNote({ enabled: v })} />
                  </Row>
                  {dailyNoteSettings.enabled && (
                    <>
                      <Row label={t('settings.dailyNote.folderPath')} hint={t('settings.dailyNote.folderPathHint')}>
                        <TextInput value={dailyNoteSettings.folderPath} onCommit={v => setDailyNote({ folderPath: v })} placeholder="Journal" />
                      </Row>
                      <Row label={t('settings.dailyNote.template')} hint={t('settings.dailyNote.templateHintShort')}>
                        <Select value={dailyNoteSettings.templateId} onChange={e => setDailyNote({ templateId: e.target.value })}>
                          <option value="dailyNote">{BUILTIN_LABELS.dailyNote}</option>
                          <option value="zettel">{BUILTIN_LABELS.zettel}</option>
                          <option value="meeting">{BUILTIN_LABELS.meeting}</option>
                          <option value="empty">{BUILTIN_LABELS.empty}</option>
                          {templates.custom.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                        </Select>
                      </Row>
                      <Row label={t('settings.dailyNote.dateFormat')} hint={t('settings.dailyNote.dateFormatHint')}>
                        <Select value={dailyNoteSettings.dateFormat} onChange={e => setDailyNote({ dateFormat: e.target.value })}>
                          <option value="DD.MM.YY">DD.MM.YY (12.03.26)</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD (2026-03-12)</option>
                          <option value="DD-MM-YYYY">DD-MM-YYYY (12-03-2026)</option>
                          <option value="MM-DD-YYYY">MM-DD-YYYY (03-12-2026)</option>
                        </Select>
                      </Row>
                    </>
                  )}
                </Card>
              </div>
            )}

            {activeTab === 'skills' && <SkillsSection onClose={onClose} />}
            {activeTab === 'brain' && (
              <div className="settings-section">
                <PageHeader title={t('settings.brain.title')} subtitle={t('settings.brain.subtitle')} />
                <Hero icon={NAV_ICONS.brain} title={t('settings.brain.heroTitle')} dot="ok" meta={t('settings.brain.heroMeta')} />
                <p className="sui-hero-note">{t('settings.brain.privacyNote')}</p>
                <Card>
                  <Row label={t('settings.brain.folderPath')} hint={t('settings.brain.folderHintShort')}>
                    <TextInput value={brainSettings.folderPath} onCommit={v => setBrain({ folderPath: v })} placeholder="800 - 🧠 brain" />
                  </Row>
                  <Row label={t('settings.brain.autoConsolidate')} htmlFor="brain-auto">
                    <Toggle id="brain-auto" checked={brainSettings.autoConsolidateEnabled} onChange={v => setBrain({ autoConsolidateEnabled: v })} />
                  </Row>
                  {brainSettings.autoConsolidateEnabled && (
                    <Row label={t('settings.brain.autoConsolidateTime')} hint={t('settings.brain.autoConsolidateHint')}>
                      <input
                        type="time"
                        className="sui-input is-narrow"
                        value={brainSettings.autoConsolidateTime || '21:30'}
                        onChange={e => setBrain({ autoConsolidateTime: e.target.value || '21:30' })}
                      />
                    </Row>
                  )}
                  <Details title={t('settings.brain.howItWorks')}>
                    <p>{t('settings.brain.howItWorksBody')}</p>
                    <p>{t('settings.brain.description')}</p>
                  </Details>
                </Card>
              </div>
            )}

            {/* reMarkable Tab */}
            {activeTab === 'remarkable' && <RemarkableSettingsTab t={t} />}

            {/* Email Tab */}
            {activeTab === 'email' && <EmailSettingsTab t={t} ollamaModels={ollamaModels} />}

            {/* Edoobox Tab */}
            {activeTab === 'agents' && <EdooboxSettingsTab t={t} />}

            {/* Dynamische Plugin-Settings-Tabs: rendert genau die settings.section des
                gewählten Plugins (z.B. plugin:antares). Leerer Slot nach Plugin-Löschung
                → leerer Tab statt Crash (Deletion Test); der Nav-Eintrag ist dann eh weg. */}
            {activeTab.startsWith('plugin:') && (
              <PluginSlot
                slotId={SETTINGS_SECTION_SLOT}
                pluginId={activeTab.slice('plugin:'.length)}
                props={{ onGoToModules: () => setActiveTab('modules') }}
              />
            )}

            {/* Transport Tab */}
            {activeTab === 'transport' && (
              <TransportSettingsTab t={t} />
            )}

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <DashboardSettingsTab t={t} />
            )}

            {/* Modules Tab */}
            {activeTab === 'modules' && (
              <ModulesTab t={t} onOpenTab={navigateToSetting} status={integrationStatus} />
            )}

            {/* Speech Tab */}
            {activeTab === 'speech' && (
              <SpeechSettingsTab t={t} />
            )}

            {/* Telegram Tab */}
            {activeTab === 'telegram' && (
              <TelegramSettings />
            )}

            {/* Zugangsdaten Tab */}
            {activeTab === 'credentials' && (
              <CredentialsSettings onNavigateToTab={(tab) => setActiveTab(tab as Tab)} />
            )}
          </div>
        </div>

        <div className="settings-footer">
          <div className="settings-version">
            <strong>MindGraph Notes</strong> {appVersion ? `v${appVersion}` : ''}
          </div>
          <div className="settings-credits">
            {t('settings.footer.developedBy')} Jochen Leeder
          </div>
        </div>
      </div>
    </div>
  )
}


