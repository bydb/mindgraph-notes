import React, { useState, useEffect } from 'react'
import { useUIStore, ACCENT_COLORS, AI_LANGUAGES, FONT_FAMILIES, UI_LANGUAGES, BACKGROUND_COLORS, ICON_SETS, OUTLINE_STYLES, MODULE_CATEGORIES, EDOOBOX_DEFAULTS, MARKETING_DEFAULTS, REMARKABLE_DEFAULTS, type Language, type FontFamily, type BackgroundColor, type IconSet, type OutlineStyle, type LLMBackend, type TransportDestination, type ModuleCategory, type ModuleDescriptor } from '../../stores/uiStore'
import { usePluginConfig } from '../../plugins/config'
import { MODULES, isModuleEnabled, setModuleEnabled, useIsModuleEnabled, isPluginModule } from '../../utils/modules'
import { invokePlugin } from '../../plugins/client'
import { PluginSlot } from '../../plugins/slots'
import { pluginErrorText } from '../../utils/pluginErrors'
import { catalogCategories, filterCatalogEntries } from '../../utils/catalogFilter'
import { edooboxService } from '../../stores/edooboxServiceBridge'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useSyncStore } from '../../stores/syncStore'
import { useVaultSettingsStore } from '../../stores/vaultSettingsStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { TelegramSettings } from './TelegramSettings'
import { CredentialsSettings } from './CredentialsSettings'
import { ModelCompatibilitySection, ActiveModelStatusBadge, VERDICT_ICON, VERDICT_COLOR } from './ModelCompatibilitySection'
import { OpenRouterSection } from './OpenRouterSection'
import { EmailRelevanceRulesSection } from './EmailRelevanceRulesSection'
import { getModelVerdict, CLOUD_TEST_MODELS, RECOMMENDED_PULL_MODELS, isCloudModel, modelMarkers } from '../../../shared/modelCompatibility'
import { OPENROUTER_MODEL_SENTINEL, isOpenRouterReady } from '../../../shared/llmBackend'
import { ModelRamWarning } from '../Shared/ModelRamWarning'
import { ModelPicker } from '../Shared/ModelPicker'
import { ensureTransformersModel, isTransformersModelReady } from '../../utils/voice/transformersStt'
import { writeClipboardText } from '../../utils/clipboard'

type TabTFn = (key: TranslationKey, params?: Record<string, string | number>) => string
import {
  TemplateConfig,
  CustomTemplate,
  DEFAULT_TEMPLATES,
  loadTemplateConfig,
  saveTemplateConfig,
  generateRandomId,
  formatDate
} from '../../utils/templateEngine'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: Tab
}

type Tab = 'vault' | 'general' | 'editor' | 'templates' | 'integrations' | 'shortcuts' | 'dataview' | 'sync' | 'dailyNote' | 'remarkable' | 'email' | 'agents' | 'transport' | 'dashboard' | 'modules' | 'speech' | 'telegram' | 'credentials' | 'brain'

type BuiltInTemplateKey = 'empty' | 'dailyNote' | 'zettel' | 'meeting'

type SelectedTemplate = {
  type: 'builtin'
  key: BuiltInTemplateKey
} | {
  type: 'custom'
  id: string
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
function keyboardEventToAccelerator(e: React.KeyboardEvent<HTMLButtonElement>): string | null {
  const parts: string[] = []

  // Modifier in Electron-Reihenfolge
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  const key = e.key

  // Reine Modifier-Keys ignorieren — User muss noch eine "richtige" Taste drücken
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(key)) {
    return null
  }

  // Key-Name in Electron-Accelerator konvertieren
  let keyName: string
  if (key.length === 1) {
    // Einzelnes Zeichen: Buchstaben groß, Ziffern unverändert, Sonderzeichen weitgehend passthrough
    const upper = key.toUpperCase()
    if (/^[A-Z0-9]$/.test(upper)) {
      keyName = upper
    } else if (key === ' ') {
      keyName = 'Space'
    } else if (key === '+') {
      keyName = 'Plus'
    } else if (key === '-') {
      keyName = '-'
    } else if (key === '=') {
      keyName = '='
    } else if (key === ',') {
      keyName = ','
    } else if (key === '.') {
      keyName = '.'
    } else if (key === '/') {
      keyName = '/'
    } else if (key === '\\') {
      keyName = '\\'
    } else if (key === ';') {
      keyName = ';'
    } else if (key === "'") {
      keyName = "'"
    } else if (key === '[') {
      keyName = '['
    } else if (key === ']') {
      keyName = ']'
    } else if (key === '`') {
      keyName = '`'
    } else {
      // Fallback: unbekanntes Sonderzeichen — Key-Code als Anhaltspunkt nutzen
      keyName = upper
    }
  } else {
    // Named keys: Pfeile, Funktionstasten, Escape, …
    const map: Record<string, string> = {
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
      'Escape': 'Esc',
      'Enter': 'Return',
      'Delete': 'Delete',
      'Backspace': 'Backspace',
      'Tab': 'Tab',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown',
      'Insert': 'Insert'
    }
    if (map[key]) {
      keyName = map[key]
    } else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
      keyName = key // F1..F24
    } else {
      return null
    }
  }

  parts.push(keyName)

  // Mindestens ein Modifier ist unter Linux/Windows für nicht-Funktionstasten quasi Pflicht
  // (F1..F24 und Medien-Keys gehen ohne — der Rest nicht). Wir erlauben's für Funktionstasten.
  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(keyName)
  const hasModifier = parts.length > 1 // mind. ein Modifier + key
  if (!isFunctionKey && !hasModifier) {
    return null
  }

  return parts.join('+')
}

// Hübsche Anzeige eines Accelerator-Strings auf Linux/Windows
function formatAcceleratorForDisplay(accelerator: string): string {
  return accelerator
    .split('+')
    .map(part => {
      if (part === 'CommandOrControl') return navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'
      if (part === 'Control') return 'Ctrl'
      if (part === 'Alt') return 'Alt'
      if (part === 'Shift') return 'Shift'
      if (part === 'Super' || part === 'Meta') return 'Super'
      return part
    })
    .join(' + ')
}

// Transport-Settings Tab
// Zeigt unter einem Integrations-Modul-Header einen Hinweis, dass das Modul deaktiviert ist,
// mit einem Link zum Modul-Tab. Konfiguration darunter bleibt via bestehenden `disabled={...}` Attributen gesperrt.
const ModuleDisabledHint: React.FC<{
  moduleId: string
  onGoToModules: () => void
  t: TabTFn
}> = ({ moduleId, onGoToModules, t }) => {
  const enabled = useIsModuleEnabled(moduleId)
  if (enabled) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '8px 12px',
        margin: '8px 0 12px',
        background: 'var(--bg-secondary)',
        border: '1px dashed var(--border-color)',
        borderRadius: 'var(--radius-md, 6px)',
        fontSize: '12px',
        color: 'var(--text-secondary)'
      }}
    >
      <span>{t('settings.moduleGate.disabledHint')}</span>
      <button
        className="settings-btn-secondary"
        onClick={onGoToModules}
        style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
      >
        {t('settings.moduleGate.goToModules')} →
      </button>
    </div>
  )
}

const TransportSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const transport = useUIStore(state => state.transport)
  const setTransport = useUIStore(state => state.setTransport)
  const [newTag, setNewTag] = useState('')
  const [newDestLabel, setNewDestLabel] = useState('')
  const [newDestFolder, setNewDestFolder] = useState('')
  const [vaultSubdirs, setVaultSubdirs] = useState<string[]>([])

  // Vault-Unterordner für Ordner-Dropdown laden
  useEffect(() => {
    let cancelled = false
    window.electronAPI.transportListVaultSubdirs()
      .then(dirs => {
        if (!cancelled) setVaultSubdirs(Array.isArray(dirs) ? dirs : [])
      })
      .catch(err => console.error('[Settings] Vault-Subdirs laden fehlgeschlagen:', err))
    return () => { cancelled = true }
  }, [])
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const [shortcutStatus, setShortcutStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' })

  const handleShortcutCapture = async (e: React.KeyboardEvent<HTMLButtonElement>): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()

    // Escape bricht das Recording ab, ohne zu speichern
    if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      setRecordingShortcut(false)
      setShortcutStatus({ type: 'idle' })
      ;(e.target as HTMLButtonElement).blur()
      return
    }

    const accelerator = keyboardEventToAccelerator(e)
    if (!accelerator) {
      // Noch nicht genug gedrückt (z. B. nur Ctrl) — weiter warten
      return
    }

    // Sofort speichern
    setTransport({ shortcut: accelerator })
    setRecordingShortcut(false)
    ;(e.target as HTMLButtonElement).blur()

    // An Main-Prozess schicken, um globalShortcut neu zu registrieren
    try {
      const result = await window.electronAPI.transportUpdateShortcut(accelerator)
      if (result.success) {
        setShortcutStatus({ type: 'success', message: t('settings.transport.shortcutSaved') })
      } else {
        setShortcutStatus({
          type: 'error',
          message: result.error || t('settings.transport.shortcutFailed')
        })
      }
    } catch (err) {
      setShortcutStatus({
        type: 'error',
        message: err instanceof Error ? err.message : t('settings.transport.shortcutFailed')
      })
    }
  }

  const addDestination = (): void => {
    if (!newDestLabel.trim() || !newDestFolder.trim()) return
    const dest: TransportDestination = { label: newDestLabel.trim(), folder: newDestFolder.trim() }
    setTransport({ destinations: [...transport.destinations, dest] })
    setNewDestLabel('')
    setNewDestFolder('')
  }

  const removeDestination = (index: number): void => {
    const updated = transport.destinations.filter((_, i) => i !== index)
    setTransport({ destinations: updated })
  }

  const addTag = (): void => {
    if (!newTag.trim() || transport.predefinedTags.includes(newTag.trim())) return
    setTransport({ predefinedTags: [...transport.predefinedTags, newTag.trim()] })
    setNewTag('')
  }

  const removeTag = (tag: string): void => {
    setTransport({ predefinedTags: transport.predefinedTags.filter(t => t !== tag) })
  }

  return (
    <div className="settings-section">
      <h3>{t('settings.transport.title')}</h3>
      <p className="settings-hint">{t('settings.transport.description')}</p>

      <div className="settings-row">
        <label>{t('settings.transport.enabled')}</label>
        <input
          type="checkbox"
          checked={transport.enabled}
          onChange={e => setTransport({ enabled: e.target.checked })}
        />
      </div>

      <div className="settings-row">
        <label>{t('settings.transport.shortcut')}</label>
        <button
          type="button"
          className="settings-input"
          onKeyDown={handleShortcutCapture}
          onFocus={() => {
            setRecordingShortcut(true)
            setShortcutStatus({ type: 'idle' })
          }}
          onBlur={() => setRecordingShortcut(false)}
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            textAlign: 'left',
            cursor: 'pointer',
            border: recordingShortcut ? '2px solid var(--accent-color, #3b82f6)' : undefined,
            background: recordingShortcut ? 'var(--bg-secondary)' : undefined
          }}
          title={t('settings.transport.shortcutRecord')}
        >
          {recordingShortcut
            ? t('settings.transport.shortcutRecording')
            : formatAcceleratorForDisplay(transport.shortcut || 'CommandOrControl+Shift+N')}
        </button>
      </div>
      {shortcutStatus.type !== 'idle' && shortcutStatus.message && (
        <div
          className="settings-hint"
          style={{
            color: shortcutStatus.type === 'error' ? 'var(--danger-color, #dc2626)' : 'var(--success-color, #16a34a)',
            marginTop: '-4px',
            marginBottom: '8px'
          }}
        >
          {shortcutStatus.message}
        </div>
      )}

      <div className="settings-row">
        <label>{t('settings.transport.titlebarButton')}</label>
        <input
          type="checkbox"
          checked={transport.showTitlebarButton}
          onChange={e => setTransport({ showTitlebarButton: e.target.checked })}
        />
      </div>
      <p className="settings-hint" style={{ marginTop: '-4px' }}>{t('settings.transport.titlebarButtonHint')}</p>

      <div className="settings-divider" />

      <h3>{t('settings.transport.destinations')}</h3>
      <p className="settings-hint">{t('settings.transport.destinationsHint')}</p>

      {transport.destinations.map((dest, i) => (
        <div key={i} className="settings-row" style={{ gap: '8px' }}>
          <span style={{ flex: 1 }}>
            <strong>{dest.label}</strong> — <code style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{dest.folder}</code>
          </span>
          <button
            className="settings-btn-danger"
            onClick={() => removeDestination(i)}
            style={{ padding: '2px 8px', fontSize: '12px' }}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="settings-row" style={{ gap: '8px', alignItems: 'flex-start' }}>
        <input
          type="text"
          value={newDestLabel}
          onChange={e => setNewDestLabel(e.target.value)}
          placeholder={t('settings.transport.destLabelPlaceholder')}
          className="settings-input"
          style={{ flex: 1 }}
        />
        <select
          value={newDestFolder}
          onChange={e => setNewDestFolder(e.target.value)}
          className="settings-select"
          style={{ flex: 1 }}
        >
          <option value="">{t('settings.transport.destFolderPlaceholder')}</option>
          {vaultSubdirs.length === 0 && (
            <option value="" disabled>{t('settings.transport.noSubdirs')}</option>
          )}
          {vaultSubdirs.map(dir => (
            <option key={dir} value={dir}>{dir}</option>
          ))}
        </select>
        <button
          className="settings-btn-primary"
          onClick={addDestination}
          disabled={!newDestLabel.trim() || !newDestFolder.trim()}
          style={{ padding: '4px 12px', fontSize: '12px' }}
        >
          +
        </button>
      </div>

      <div className="settings-row">
        <label>{t('settings.transport.defaultDestination')}</label>
        <select
          value={transport.defaultDestinationFolder || ''}
          onChange={e => setTransport({ defaultDestinationFolder: e.target.value })}
          className="settings-select"
        >
          <option value="" disabled>{t('settings.transport.chooseFolder')}</option>
          {transport.destinations.map((dest, i) => (
            <option key={`dest-${i}`} value={dest.folder}>{dest.label} — {dest.folder}</option>
          ))}
          {vaultSubdirs
            .filter(dir => !transport.destinations.some(d => d.folder === dir))
            .map(dir => (
              <option key={`vault-${dir}`} value={dir}>{dir}</option>
            ))}
        </select>
      </div>

      <div className="settings-divider" />

      <h3>{t('settings.transport.tags')}</h3>
      <p className="settings-hint">{t('settings.transport.tagsHint')}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {transport.predefinedTags.map(tag => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              border: '1px solid var(--border-color)',
              borderRadius: '100px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
            onClick={() => removeTag(tag)}
            title={`${tag} entfernen`}
          >
            {tag} <span style={{ opacity: 0.5 }}>✕</span>
          </span>
        ))}
      </div>

      <div className="settings-row" style={{ gap: '8px' }}>
        <input
          type="text"
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          placeholder={t('settings.transport.tagPlaceholder')}
          className="settings-input"
          style={{ flex: 1 }}
          onKeyDown={e => {
            if (e.key === 'Enter') addTag()
          }}
        />
        <button
          className="settings-btn-primary"
          onClick={addTag}
          disabled={!newTag.trim()}
          style={{ padding: '4px 12px', fontSize: '12px' }}
        >
          +
        </button>
      </div>
    </div>
  )
}

// Vault-Settings Tab als eigene Komponente (für korrekte Hook-Reaktivität)
const VaultSettingsTab: React.FC<{ vaultPath: string; t: TabTFn; onNavigateToTab: (tab: Tab) => void }> = ({ vaultPath, t, onNavigateToTab }) => {
  const vaultFeatures = useVaultSettingsStore(state => state.features)
  const setFeatureActive = useVaultSettingsStore(state => state.setFeatureActive)
  const readwise = useUIStore(state => state.readwise)
  const email = useUIStore(state => state.email)
  const [edoobox] = usePluginConfig('edoobox', EDOOBOX_DEFAULTS)
  const [remarkable] = usePluginConfig('remarkable', REMARKABLE_DEFAULTS)
  const vaultName = vaultPath.split('/').pop() || vaultPath

  const features: Array<{
    key: keyof typeof vaultFeatures
    label: string
    description: string
    globallyConfigured: boolean
    configTab: Tab | null
  }> = [
    {
      key: 'dailyNote',
      label: t('settings.vault.dailyNote'),
      description: t('settings.vault.dailyNoteDesc'),
      globallyConfigured: true,
      configTab: 'dailyNote'
    },
    {
      key: 'readwise',
      label: 'Readwise',
      description: t('settings.vault.readwiseDesc'),
      globallyConfigured: readwise.enabled && readwise.apiKey !== '',
      configTab: 'integrations'
    },
    {
      key: 'email',
      label: 'E-Mail',
      description: t('settings.vault.emailDesc'),
      globallyConfigured: email.enabled && email.accounts.length > 0,
      configTab: 'agents'
    },
    {
      key: 'edoobox',
      label: 'edoobox Agent',
      description: t('settings.vault.edooboxDesc'),
      globallyConfigured: edoobox.enabled,
      configTab: 'agents'
    },
    {
      key: 'remarkable',
      label: 'reMarkable',
      description: t('settings.vault.remarkableDesc'),
      globallyConfigured: remarkable.enabled,
      configTab: 'remarkable'
    }
  ]

  return (
    <div className="settings-section">
      <h3>{t('settings.vault.title')}</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 }}>
        {t('settings.vault.description').replace('{vault}', vaultName)}
      </p>

      {features.map(feature => (
        <div className="settings-row" key={feature.key} style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontWeight: 500 }}>{feature.label}</label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {feature.description}
            </div>
            {!feature.globallyConfigured && feature.configTab && (
              <button
                onClick={() => onNavigateToTab(feature.configTab!)}
                style={{
                  fontSize: 11, color: 'var(--accent-color)', marginTop: 4, background: 'none',
                  border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline'
                }}
              >
                {t('settings.vault.goToConfigure')}
              </button>
            )}
          </div>
          <input
            type="checkbox"
            checked={vaultFeatures[feature.key]}
            disabled={!feature.globallyConfigured}
            onChange={e => setFeatureActive(feature.key, e.target.checked)}
            title={!feature.globallyConfigured ? t('settings.vault.enableFirst') : ''}
            style={{ marginTop: 6, width: 18, height: 18, cursor: feature.globallyConfigured ? 'pointer' : 'not-allowed' }}
          />
        </div>
      ))}
    </div>
  )
}

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

const ModulesTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  // useUIStore als Abhängigkeit einbinden, damit der Tab bei Flag-Änderungen rerendert
  const _tick = useUIStore(s => `${s.notesChatEnabled}${s.projectRagEnabled}${s.smartConnectionsEnabled}${s.flashcardsEnabled}${s.workflowCanvasEnabled}${s.semanticScholarEnabled}${s.zoteroEnabled}${s.languageTool.enabled}${s.email.enabled}${s.readwise.enabled}${s.docling.enabled}${s.visionOcr.enabled}${s.speech.enabled}`)
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

  const renderModuleRow = (mod: ModuleDescriptor, official?: boolean) => {
    const enabled = isModuleEnabled(mod.id)
    return (
      <label key={mod.id} className={`module-row ${enabled ? 'active' : ''}`}>
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
        </div>
        <input
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
      <div className="settings-tab-header">
        <h2>{t('settings.modules.tabTitle')}</h2>
        <p className="settings-tab-subtitle">{t('settings.modules.hint')}</p>
      </div>

      {orderedCategories.map(cat => (
        grouped[cat].length === 0 ? null : (
          <div key={cat} className="modules-category">
            <h4 className="modules-category-title">{MODULE_CATEGORIES[cat]}</h4>
            <div className="modules-list">
              {grouped[cat].map(mod => renderModuleRow(mod))}
            </div>
          </div>
        )
      ))}

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

const SpeechSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const speech = useUIStore(s => s.speech)
  const setSpeech = useUIStore(s => s.setSpeech)

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [whisperStatus, setWhisperStatus] = useState<{ available: boolean; command: string | null; error?: string } | null>(null)
  const [checkingWhisper, setCheckingWhisper] = useState(false)

  // ElevenLabs State
  const [elApiKey, setElApiKey] = useState('')
  const [elKeySaved, setElKeySaved] = useState(false)
  const [elSaving, setElSaving] = useState(false)
  const [elVoices, setElVoices] = useState<Array<{ voice_id: string; name: string; labels?: Record<string, string>; category?: string }>>([])
  const [elLoadingVoices, setElLoadingVoices] = useState(false)
  const [elVoicesError, setElVoicesError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = await window.electronAPI.elevenlabsLoadKey()
      if (cancelled) return
      if (stored) {
        setElKeySaved(true)
        setElApiKey('')  // wir zeigen den gespeicherten Key nicht an
      }
    })()
    return () => { cancelled = true }
  }, [])

  const saveElKey = async () => {
    if (!elApiKey.trim()) return
    setElSaving(true)
    try {
      const res = await window.electronAPI.elevenlabsSaveKey(elApiKey.trim())
      if (res.success) {
        setElKeySaved(true)
        setElApiKey('')
      } else {
        setElVoicesError(res.error ?? 'Speichern fehlgeschlagen')
      }
    } finally {
      setElSaving(false)
    }
  }

  const deleteElKey = async () => {
    await window.electronAPI.elevenlabsDeleteKey()
    setElKeySaved(false)
    setElVoices([])
    setSpeech({ elevenlabsVoiceId: '', elevenlabsVoiceName: '' })
  }

  const loadElVoices = async () => {
    setElLoadingVoices(true)
    setElVoicesError(null)
    try {
      const res = await window.electronAPI.elevenlabsListVoices()
      if (res.success && res.voices) {
        setElVoices(res.voices)
      } else {
        setElVoicesError(res.error ?? 'Stimmen konnten nicht geladen werden')
      }
    } finally {
      setElLoadingVoices(false)
    }
  }

  const testElVoice = async () => {
    if (!speech.elevenlabsVoiceId) return
    try {
      const res = await window.electronAPI.elevenlabsSynthesize({
        text: t('settings.speech.tts.testSample'),
        voiceId: speech.elevenlabsVoiceId,
        modelId: speech.elevenlabsModel || 'eleven_multilingual_v2',
        stability: speech.elevenlabsStability,
        similarity: speech.elevenlabsSimilarity
      })
      if (!res.success || !res.audio) {
        setElVoicesError(res.error ?? 'Synthese fehlgeschlagen')
        return
      }
      const bytes = new Uint8Array(res.audio)
      if (bytes.byteLength === 0) {
        setElVoicesError('Synthese leer (0 Bytes). API-Key hat evtl. kein text_to_speech-Scope.')
        return
      }
      const blob = new Blob([bytes], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setElVoicesError(`Wiedergabe fehlgeschlagen (${bytes.byteLength} bytes empfangen, aber kein gültiges MP3).`)
      }
      await audio.play()
    } catch (err) {
      setElVoicesError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  // Auto-check Whisper beim Öffnen des Tabs
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCheckingWhisper(true)
      try {
        const result = await window.electronAPI.voiceCheckWhisper(speech.whisperCommand || 'auto')
        if (!cancelled) setWhisperStatus(result)
      } catch (err) {
        if (!cancelled) setWhisperStatus({ available: false, command: null, error: err instanceof Error ? err.message : String(err) })
      } finally {
        if (!cancelled) setCheckingWhisper(false)
      }
    })()
    return () => { cancelled = true }
  }, [speech.whisperCommand])

  const testVoice = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(t('settings.speech.tts.testSample'))
    utterance.rate = speech.ttsRate
    utterance.pitch = speech.ttsPitch
    if (speech.ttsVoice) {
      const voice = voices.find(v => v.voiceURI === speech.ttsVoice)
      if (voice) utterance.voice = voice
    }
    window.speechSynthesis.speak(utterance)
  }

  const runWhisperCheck = async () => {
    setCheckingWhisper(true)
    try {
      const result = await window.electronAPI.voiceCheckWhisper(speech.whisperCommand || 'auto')
      setWhisperStatus(result)
    } finally {
      setCheckingWhisper(false)
    }
  }

  const [preloadingModel, setPreloadingModel] = useState(false)
  const [preloadStatus, setPreloadStatus] = useState<string | null>(null)
  const [preloadError, setPreloadError] = useState<string | null>(null)
  const transformersReady = isTransformersModelReady(speech.transformersModel || 'base')

  useEffect(() => {
    setPreloadError(null)
    setPreloadStatus(transformersReady ? t('settings.speech.stt.preloaded') : null)
  }, [speech.transformersModel, transformersReady, t])

  const preloadTransformersModel = async () => {
    setPreloadingModel(true)
    setPreloadError(null)
    setPreloadStatus(t('settings.speech.stt.preloading'))
    try {
      await ensureTransformersModel(speech.transformersModel || 'base')
      setPreloadStatus(t('settings.speech.stt.preloaded'))
    } catch (err) {
      setPreloadStatus(null)
      setPreloadError(err instanceof Error ? err.message : String(err))
    } finally {
      setPreloadingModel(false)
    }
  }

  return (
    <div className="settings-section">
      <h3>{t('settings.speech.title')}</h3>
      <p className="settings-hint">{t('settings.speech.hint')}</p>

      <h4 style={{ marginTop: 24 }}>{t('settings.speech.tts.heading')}</h4>

      <div className="settings-row">
        <label>{t('settings.speech.tts.engine')}</label>
        <select
          value={speech.ttsEngine}
          onChange={e => setSpeech({ ttsEngine: e.target.value as 'system' | 'elevenlabs' })}
        >
          <option value="system">{t('settings.speech.tts.engine.system')}</option>
          <option value="elevenlabs">{t('settings.speech.tts.engine.elevenlabs')}</option>
        </select>
      </div>

      {speech.ttsEngine === 'system' && (
        <>
          <div className="settings-row">
            <label>{t('settings.speech.tts.voice')}</label>
            <select
              value={speech.ttsVoice}
              onChange={e => setSpeech({ ttsVoice: e.target.value })}
              style={{ minWidth: 240 }}
            >
              <option value="">{t('settings.speech.tts.voice.default')}</option>
              {voices.map(v => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          <div className="settings-row">
            <label>{t('settings.speech.tts.rate')}: {speech.ttsRate.toFixed(1)}x</label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speech.ttsRate}
              onChange={e => setSpeech({ ttsRate: Number(e.target.value) })}
              style={{ width: 200 }}
            />
          </div>

          <div className="settings-row">
            <label>{t('settings.speech.tts.pitch')}: {speech.ttsPitch.toFixed(1)}</label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speech.ttsPitch}
              onChange={e => setSpeech({ ttsPitch: Number(e.target.value) })}
              style={{ width: 200 }}
            />
          </div>

          <div className="settings-row">
            <button className="btn-primary" onClick={testVoice}>{t('settings.speech.tts.test')}</button>
          </div>
        </>
      )}

      {speech.ttsEngine === 'elevenlabs' && (
        <>
          <p className="settings-hint" style={{ color: 'var(--warning, #d97706)', marginTop: 8 }}>
            {t('settings.speech.el.cloudWarning')}
          </p>

          <div className="settings-row">
            <label>{t('settings.speech.el.apiKey')}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="password"
                value={elApiKey}
                onChange={e => setElApiKey(e.target.value)}
                placeholder={elKeySaved ? '••••••••' : t('settings.speech.el.apiKey.placeholder')}
                style={{ minWidth: 260 }}
              />
              <button className="btn-primary" onClick={saveElKey} disabled={elSaving || !elApiKey.trim()}>
                {elSaving ? '…' : t('settings.speech.el.apiKey.save')}
              </button>
              {elKeySaved && (
                <button onClick={deleteElKey} style={{ color: 'var(--danger, #dc2626)' }}>
                  {t('settings.speech.el.apiKey.delete')}
                </button>
              )}
            </div>
          </div>
          <p className="settings-hint">{t('settings.speech.el.apiKey.hint')}</p>
          {elKeySaved && <p className="settings-hint" style={{ color: 'var(--success, #059669)' }}>✓ {t('settings.speech.el.apiKey.saved')}</p>}

          <div className="settings-row">
            <label>{t('settings.speech.el.voice')}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={speech.elevenlabsVoiceId}
                onChange={e => {
                  const v = elVoices.find(voice => voice.voice_id === e.target.value)
                  setSpeech({ elevenlabsVoiceId: e.target.value, elevenlabsVoiceName: v?.name ?? '' })
                }}
                disabled={!elKeySaved || elVoices.length === 0}
                style={{ minWidth: 240 }}
              >
                <option value="">{t('settings.speech.el.voice.none')}</option>
                {(() => {
                  // Gruppiere nach Kategorie — premade ist im Free-Tier verfügbar, cloned/generated braucht Upgrade.
                  const groups: Record<string, typeof elVoices> = {}
                  for (const v of elVoices) {
                    const cat = v.category ?? 'other'
                    if (!groups[cat]) groups[cat] = []
                    groups[cat].push(v)
                  }
                  const order = ['premade', 'professional', 'cloned', 'generated', 'other']
                  const labels: Record<string, string> = {
                    premade: 'Premade (Free)',
                    professional: 'Professional Clone',
                    cloned: 'Instant Clone (Paid)',
                    generated: 'Voice Design (Paid)',
                    other: 'Other'
                  }
                  return order.filter(k => groups[k]?.length).map(cat => (
                    <optgroup key={cat} label={labels[cat] ?? cat}>
                      {groups[cat].map(v => (
                        <option key={v.voice_id} value={v.voice_id}>
                          {v.name}{v.labels?.language ? ` (${v.labels.language})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))
                })()}
                {/* Wenn gespeicherte Voice noch nicht in der Liste ist (weil voices nicht geladen), zeige den Namen trotzdem */}
                {speech.elevenlabsVoiceId && !elVoices.some(v => v.voice_id === speech.elevenlabsVoiceId) && (
                  <option value={speech.elevenlabsVoiceId}>{speech.elevenlabsVoiceName || speech.elevenlabsVoiceId}</option>
                )}
              </select>
              <button onClick={loadElVoices} disabled={!elKeySaved || elLoadingVoices}>
                {elLoadingVoices ? t('settings.speech.el.loadingVoices') : t('settings.speech.el.loadVoices')}
              </button>
              <button className="btn-primary" onClick={testElVoice} disabled={!speech.elevenlabsVoiceId}>
                {t('settings.speech.tts.test')}
              </button>
            </div>
          </div>
          {!elKeySaved && <p className="settings-hint">{t('settings.speech.el.keyMissing')}</p>}
          {elVoicesError && <p className="settings-hint" style={{ color: 'var(--danger, #dc2626)' }}>{elVoicesError}</p>}

          <div className="settings-row">
            <label>{t('settings.speech.el.model')}</label>
            <select
              value={speech.elevenlabsModel}
              onChange={e => setSpeech({ elevenlabsModel: e.target.value })}
              style={{ minWidth: 280 }}
            >
              <option value="eleven_multilingual_v2">{t('settings.speech.el.model.multilingual')}</option>
              <option value="eleven_turbo_v2_5">{t('settings.speech.el.model.turbo')}</option>
              <option value="eleven_flash_v2_5">{t('settings.speech.el.model.flash')}</option>
            </select>
          </div>

          <div className="settings-row">
            <label>{t('settings.speech.el.stability')}: {speech.elevenlabsStability.toFixed(2)}</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={speech.elevenlabsStability}
              onChange={e => setSpeech({ elevenlabsStability: Number(e.target.value) })}
              style={{ width: 200 }}
            />
          </div>

          <div className="settings-row">
            <label>{t('settings.speech.el.similarity')}: {speech.elevenlabsSimilarity.toFixed(2)}</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={speech.elevenlabsSimilarity}
              onChange={e => setSpeech({ elevenlabsSimilarity: Number(e.target.value) })}
              style={{ width: 200 }}
            />
          </div>

          <div className="settings-row">
            <label>{t('settings.speech.tts.rate')}: {speech.ttsRate.toFixed(1)}x</label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speech.ttsRate}
              onChange={e => setSpeech({ ttsRate: Number(e.target.value) })}
              style={{ width: 200 }}
            />
          </div>
        </>
      )}

      <h4 style={{ marginTop: 32 }}>{t('settings.speech.stt.heading')}</h4>

      <div className="settings-row">
        <label>{t('settings.speech.stt.engine')}</label>
        <select
          value={speech.sttEngine}
          onChange={e => setSpeech({ sttEngine: e.target.value as 'transformers' | 'whisper-cli' })}
          style={{ minWidth: 240 }}
        >
          <option value="transformers">{t('settings.speech.stt.engine.transformers')}</option>
          <option value="whisper-cli">{t('settings.speech.stt.engine.cli')}</option>
        </select>
      </div>
      <p className="settings-hint">
        {speech.sttEngine === 'transformers'
          ? t('settings.speech.stt.engine.transformers.hint')
          : t('settings.speech.stt.engine.cli.hint')}
      </p>

      <div className="settings-row">
        <label>{t('settings.speech.stt.language')}</label>
        <select
          value={speech.sttLanguage}
          onChange={e => setSpeech({ sttLanguage: e.target.value })}
        >
          <option value="auto">{t('settings.speech.stt.language.auto')}</option>
          <option value="de">{t('settings.speech.stt.language.de')}</option>
          <option value="en">{t('settings.speech.stt.language.en')}</option>
          <option value="fr">{t('settings.speech.stt.language.fr')}</option>
          <option value="es">{t('settings.speech.stt.language.es')}</option>
          <option value="it">{t('settings.speech.stt.language.it')}</option>
        </select>
      </div>

      {speech.sttEngine === 'transformers' && (
        <>
          <div className="settings-row">
            <label>{t('settings.speech.stt.model')}</label>
            <select
              value={speech.transformersModel}
              onChange={e => setSpeech({ transformersModel: e.target.value as 'tiny' | 'base' | 'small' })}
              style={{ minWidth: 240 }}
            >
              <option value="tiny">{t('settings.speech.stt.transformersModel.tiny')}</option>
              <option value="base">{t('settings.speech.stt.transformersModel.base')}</option>
              <option value="small">{t('settings.speech.stt.transformersModel.small')}</option>
            </select>
          </div>
          <p className="settings-hint">{t('settings.speech.stt.transformersModel.hint')}</p>

          <div className="settings-row">
            <button
              className={transformersReady ? 'voice-model-status-chip' : 'btn-primary'}
              onClick={preloadTransformersModel}
              disabled={preloadingModel || transformersReady}
            >
              {transformersReady ? t('settings.speech.stt.prepared') : (preloadingModel ? t('settings.speech.stt.preloading') : t('settings.speech.stt.preload'))}
            </button>
            {preloadStatus && (
              <span style={{ marginLeft: 12, fontSize: 13, opacity: 0.85 }}>{preloadStatus}</span>
            )}
          </div>
          {preloadError && (
            <p className="settings-hint" style={{ color: 'var(--danger, #dc2626)' }}>{preloadError}</p>
          )}
        </>
      )}

      {speech.sttEngine === 'whisper-cli' && (
        <>
          <div className="settings-row">
            <label>{t('settings.speech.stt.model')}</label>
            <select
              value={speech.whisperModel}
              onChange={e => setSpeech({ whisperModel: e.target.value })}
            >
              <option value="tiny">tiny</option>
              <option value="base">base</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large">large</option>
            </select>
          </div>
          <p className="settings-hint">{t('settings.speech.stt.model.hint')}</p>

          <div className="settings-row">
            <label>{t('settings.speech.stt.command')}</label>
            <input
              type="text"
              value={speech.whisperCommand}
              onChange={e => setSpeech({ whisperCommand: e.target.value })}
              placeholder="auto"
              style={{ minWidth: 240 }}
            />
          </div>
          <p className="settings-hint">{t('settings.speech.stt.command.hint')}</p>

          <div className="settings-row">
            <button className="btn-primary" onClick={runWhisperCheck} disabled={checkingWhisper}>
              {checkingWhisper ? t('settings.speech.stt.checking') : t('settings.speech.stt.check')}
            </button>
          </div>

          {whisperStatus && (
            <div style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 6,
              background: whisperStatus.available ? 'rgba(40, 200, 120, 0.12)' : 'rgba(240, 160, 60, 0.12)',
              border: `1px solid ${whisperStatus.available ? 'rgba(40, 200, 120, 0.5)' : 'rgba(240, 160, 60, 0.5)'}`
            }}>
              {whisperStatus.available ? (
                <div style={{ fontSize: 13 }}>
                  ✓ {t('settings.speech.stt.installed', { path: whisperStatus.command ?? '' })}
                </div>
              ) : (
                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('settings.speech.stt.notInstalled')}</div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>{t('settings.speech.stt.installMac')}:</strong>{' '}
                    <code>brew install openai-whisper</code>
                  </div>
                  <div>
                    <strong>{t('settings.speech.stt.installPip')}:</strong>{' '}
                    <code>pip install openai-whisper</code>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                    {t('settings.speech.stt.ffmpegHint')}
                  </div>
                </div>
              )}
              {whisperStatus.available && (
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                  {t('settings.speech.stt.ffmpegHint')}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <h4 style={{ marginTop: 32 }}>Flashcards</h4>
      <div className="settings-row">
        <label>{t('settings.speech.flashcards.autoPlay')}</label>
        <input
          type="checkbox"
          checked={speech.flashcardsAutoPlay}
          onChange={e => setSpeech({ flashcardsAutoPlay: e.target.checked })}
        />
      </div>
      <p className="settings-hint">{t('settings.speech.flashcards.autoPlay.hint')}</p>
    </div>
  )
}

const DashboardSettingsTab: React.FC<{ t: TabTFn }> = ({ t }) => {
  const dashboard = useUIStore(state => state.dashboard)
  const setDashboard = useUIStore(state => state.setDashboard)

  const widgetLabels: Record<string, string> = {
    focus: t('dashboard.widgets.focus'),
    radar: t('dashboard.widgets.radar'),
    activity: t('dashboard.widgets.activity'),
    tasks: t('dashboard.widgets.tasks'),
    emails: t('dashboard.widgets.emails'),
    calendar: t('dashboard.widgets.calendar'),
    bookings: t('dashboard.widgets.bookings'),
    antares: t('dashboard.widgets.antares'),
    'project-status': t('dashboard.widgets.projectStatus')
  }
  const allWidgetIds = ['focus', 'radar', 'activity', 'tasks', 'emails', 'calendar', 'bookings', 'antares', 'project-status'] as const

  const toggleWidget = (id: typeof allWidgetIds[number]) => {
    const active = dashboard.widgets.includes(id)
    if (active) {
      setDashboard({ widgets: dashboard.widgets.filter(w => w !== id) })
    } else {
      setDashboard({ widgets: [...dashboard.widgets, id] })
    }
  }

  const moveWidget = (id: typeof allWidgetIds[number], direction: -1 | 1) => {
    const idx = dashboard.widgets.indexOf(id)
    if (idx < 0) return
    const target = idx + direction
    if (target < 0 || target >= dashboard.widgets.length) return
    const next = [...dashboard.widgets]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setDashboard({ widgets: next })
  }

  return (
    <div className="settings-section">
      <h3>{t('settings.dashboard.title')}</h3>

      <div className="settings-row">
        <label>{t('settings.dashboard.enabled')}</label>
        <input
          type="checkbox"
          checked={dashboard.enabled}
          onChange={e => setDashboard({ enabled: e.target.checked })}
        />
      </div>

      <h3>{t('settings.dashboard.widgets')}</h3>
      <p className="settings-hint">{t('settings.dashboard.widgetsHint')}</p>
      <div className="dashboard-widget-config-list">
        {allWidgetIds.map(id => {
          const active = dashboard.widgets.includes(id)
          const position = dashboard.widgets.indexOf(id)
          return (
            <div key={id} className={`dashboard-widget-config-row ${active ? 'active' : ''}`}>
              <label className="dashboard-widget-config-label">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleWidget(id)}
                />
                <span>{widgetLabels[id]}</span>
              </label>
              <div className="dashboard-widget-config-order">
                <button
                  type="button"
                  className="dashboard-widget-config-btn"
                  disabled={!active || position <= 0}
                  onClick={() => moveWidget(id, -1)}
                  aria-label="up"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className="dashboard-widget-config-btn"
                  disabled={!active || position < 0 || position >= dashboard.widgets.length - 1}
                  onClick={() => moveWidget(id, 1)}
                  aria-label="down"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <h3>{t('settings.dashboard.briefing')}</h3>

      <div className="settings-row">
        <label>{t('settings.dashboard.briefingEnabled')}</label>
        <input
          type="checkbox"
          checked={dashboard.briefingEnabled}
          onChange={e => setDashboard({ briefingEnabled: e.target.checked })}
        />
      </div>

      <div className="settings-row">
        <label>{t('settings.dashboard.briefingIncludeCalendar')}</label>
        <input
          type="checkbox"
          checked={dashboard.briefingIncludeCalendar}
          onChange={e => setDashboard({ briefingIncludeCalendar: e.target.checked })}
        />
      </div>

      <div className="settings-row">
        <label>{t('settings.dashboard.calendarDaysAhead')}</label>
        <input
          type="number"
          min={0}
          max={14}
          value={dashboard.calendarDaysAhead}
          onChange={e => setDashboard({ calendarDaysAhead: Math.max(0, Math.min(14, Number(e.target.value) || 0)) })}
        />
      </div>

      <h3>{t('settings.tasks.leadTime.title')}</h3>
      <p className="settings-hint">{t('settings.tasks.leadTime.hint')}</p>
      <TaskLeadTimeRows t={t} />
    </div>
  )
}

const TaskLeadTimeRows: React.FC<{ t: TabTFn }> = ({ t }) => {
  const taskLeadTime = useUIStore(state => state.taskLeadTime)
  const setTaskLeadTime = useUIStore(state => state.setTaskLeadTime)
  return (
    <>
      <div className="settings-row">
        <label>{t('settings.tasks.leadTime.critical')}</label>
        <input
          type="number"
          min={0}
          max={30}
          value={taskLeadTime.critical}
          onChange={e => setTaskLeadTime({ critical: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
        />
      </div>
      <div className="settings-row">
        <label>{t('settings.tasks.leadTime.normal')}</label>
        <input
          type="number"
          min={0}
          max={30}
          value={taskLeadTime.normal}
          onChange={e => setTaskLeadTime({ normal: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
        />
      </div>
    </>
  )
}

const SignatureImagePreview: React.FC<{ imagePath: string }> = ({ imagePath }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  useEffect(() => {
    if (imagePath) {
      window.electronAPI.emailLoadSignatureImage(imagePath).then(url => setDataUrl(url))
    }
  }, [imagePath])
  if (!dataUrl) return null
  return (
    <img
      src={dataUrl}
      alt="Signatur"
      style={{ maxWidth: '200px', maxHeight: '80px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border)' }}
    />
  )
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, initialTab }) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'general')

  // Wenn der initialTab sich ändert (z.B. vom HelpGuide), übernehmen
  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab)
  }, [isOpen, initialTab])
  const [zoteroStatus, setZoteroStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [lmstudioStatus, setLmstudioStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [doclingStatus, setDoclingStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [doclingVersion, setDoclingVersion] = useState<string>('')
  const [visionOcrModelList, setVisionOcrModelList] = useState<{ name: string; size: number }[]>([])

  const [languageToolStatus, setLanguageToolStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [readwiseStatus, setReadwiseStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [openAlexStatus, setOpenAlexStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [openAlexApiKey, setOpenAlexApiKey] = useState('')
  const [openAlexKeySaved, setOpenAlexKeySaved] = useState(false)
  const [openAlexMessage, setOpenAlexMessage] = useState<string | null>(null)
  const [openAlexMailto, setOpenAlexMailto] = useState('')
  const [openAlexMailtoSaved, setOpenAlexMailtoSaved] = useState<string | null>(null)
  const [readwiseSyncing, setReadwiseSyncing] = useState(false)
  const [readwiseSyncProgress, setReadwiseSyncProgress] = useState<{ current: number; total: number; status: string; title?: string } | null>(null)
  const [readwiseSyncResult, setReadwiseSyncResult] = useState<string | null>(null)
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string; size: number }>>([])
  const [lmstudioModels, setLmstudioModels] = useState<Array<{ name: string; size: number }>>([])
  const [emailTestStatus, setEmailTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'failed'>>({})
  const [emailPasswords, setEmailPasswords] = useState<Record<string, string>>({})
  const [edooboxApiKey, setEdooboxApiKey] = useState('')
  const [edooboxApiSecret, setEdooboxApiSecret] = useState('')
  const [edooboxTestStatus, setEdooboxTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')
  const [edooboxTestError, setEdooboxTestError] = useState<string | null>(null)
  const [edooboxCredsSaved, setEdooboxCredsSaved] = useState(false)
  // Antares-Credentials/-Settings: in die Antares-Vertikale ausgelagert (AntaresSettings.tsx).

  // Marketing Credentials State
  const [wpAppPassword, setWpAppPassword] = useState('')
  const [wpCredsSaved, setWpCredsSaved] = useState(false)
  const [wpTestStatus, setWpTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')
  const [wpTestError, setWpTestError] = useState<string | null>(null)
  const [remarkableStatus, setRemarkableStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [remarkableError, setRemarkableError] = useState<string | null>(null)

  // Ollama Pull Model State
  const [pullModelName, setPullModelName] = useState('qwen3.5:4b')
  const [customPullModelName, setCustomPullModelName] = useState('')
  const [isPulling, setIsPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState<{ status: string; completed?: number; total?: number } | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const [pullSuccess, setPullSuccess] = useState(false)

  // Sync Setup State
  const [syncMode, setSyncMode] = useState<'new' | 'join'>('new')
  const [syncActivationCode, setSyncActivationCode] = useState('')
  const [syncPassphrase, setSyncPassphrase] = useState('')
  const [syncJoinVaultId, setSyncJoinVaultId] = useState('')
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncCopied, setSyncCopied] = useState(false)
  const [syncSetupError, setSyncSetupError] = useState<string | null>(null)
  const [excludeFolderInput, setExcludeFolderInput] = useState('')
  const [excludeExtInput, setExcludeExtInput] = useState('')
  const [deletedFiles, setDeletedFiles] = useState<Array<{ path: string; originalPath: string; size: number; deletedAt: number }>>([])
  const [deletedFilesLoading, setDeletedFilesLoading] = useState(false)
  const [deletedFilesLoaded, setDeletedFilesLoaded] = useState(false)
  const [restoredFiles, setRestoredFiles] = useState<Set<string>>(new Set())

  // Sync Store
  const syncState = useSyncStore()

  // UI Store
  const {
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    backgroundColor,
    setBackgroundColor,
    loadLastVaultOnStart,
    setLoadLastVaultOnStart,
    notesRootFolder,
    setNotesRootFolder,
    projectsRootFolder,
    setProjectsRootFolder,
    language,
    setLanguage,
    fontFamily,
    setFontFamily,
    editorFontSize,
    setEditorFontSize,
    editorLineNumbers,
    setEditorLineNumbers,
    editorHeadingFolding,
    setEditorHeadingFolding,
    editorOutlining,
    setEditorOutlining,
    outlineStyle,
    setOutlineStyle,
    editorShowWordCount,
    setEditorShowWordCount,
    editorHeaderActions,
    setEditorHeaderActions,
    editorDefaultView,
    setEditorDefaultView,
    autoSaveInterval,
    setAutoSaveInterval,
    imagesFolder,
    setImagesFolder,
    ollama,
    setOllama,
    pdfCompanionEnabled,
    setPdfCompanionEnabled,
    pdfDisplayMode,
    setPdfDisplayMode,
    canvasDefaultCardWidth,
    setCanvasDefaultCardWidth,
    iconSet,
    setIconSet,
    smartConnectionsEnabled,
    semanticScholarEnabled,
    flashcardsEnabled,
    smartConnectionsWeights,
    setSmartConnectionsWeights,
    smartConnectionsRerankerEnabled,
    setSmartConnectionsRerankerEnabled,
    docling,
    setDocling,
    visionOcr,
    setVisionOcr,
    readwise,
    setReadwise,
    languageTool,
    setLanguageTool,
    customLogo,
    setCustomLogo,
    removeCustomLogo,
    customAccentColor,
    setCustomAccentColor,
    customBackgroundColorLight,
    setCustomBackgroundColorLight,
    setCustomBackgroundColorDark,
    showFormattingToolbar,
    setShowFormattingToolbar,
    showRawEditor,
    setShowRawEditor,
    email: emailSettings,
    setEmail,
    dailyNote: dailyNoteSettings,
    setDailyNote,
    brain: brainSettings,
    setBrain,
    slashCommandDateFormat,
    setSlashCommandDateFormat,
    slashCommandTimeFormat,
    setSlashCommandTimeFormat
  } = useUIStore()

  // Plugin-Vertikalen-Config generisch (pluginConfig) statt state.edoobox/marketing/remarkable.
  const [marketingSettings, setMarketing] = usePluginConfig('marketing', MARKETING_DEFAULTS)
  const [edooboxSettings] = usePluginConfig('edoobox', EDOOBOX_DEFAULTS)
  const [remarkableSettings, setRemarkable] = usePluginConfig('remarkable', REMARKABLE_DEFAULTS)

  const { t } = useTranslation()

  const { vaultPath, setFileTree } = useNotesStore()

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

  // Zotero Status prüfen
  useEffect(() => {
    if (isOpen && (activeTab === 'integrations' || activeTab === 'email' || activeTab === 'agents')) {
      checkZoteroConnection()
      checkOllamaConnection()
      checkLmstudioConnection()
      checkDoclingConnection()
      checkLanguageToolConnection()
      checkReadwiseConnection()
      checkOpenAlexConnection()
      window.electronAPI.openAlexLoadKey().then(key => {
        setOpenAlexKeySaved(Boolean(key))
        setOpenAlexApiKey('')
      }).catch(() => {})
      window.electronAPI.openAlexLoadMailto().then(mailto => {
        setOpenAlexMailtoSaved(mailto)
        setOpenAlexMailto('')
      }).catch(() => {})
      // Load vision OCR models
      window.electronAPI.visionOcrModels().then(setVisionOcrModelList).catch(() => {})
    }
  }, [isOpen, activeTab])

  // Email-Passwörter aus safeStorage laden
  useEffect(() => {
    if (isOpen && emailSettings.accounts.length > 0) {
      const loadPasswords = async () => {
        const passwords: Record<string, string> = {}
        for (const account of emailSettings.accounts) {
          try {
            const pw = await window.electronAPI.emailLoadPassword(account.id)
            if (pw) passwords[account.id] = pw
          } catch { /* ignore */ }
        }
        if (Object.keys(passwords).length > 0) {
          setEmailPasswords(prev => ({ ...prev, ...passwords }))
        }
      }
      loadPasswords()
    }
  }, [isOpen, emailSettings.accounts.length])

  // edoobox + Marketing Credentials laden (Antares lädt sich selbst in AntaresSettings.tsx)
  useEffect(() => {
    if (isOpen && activeTab === 'agents') {
      edooboxService.loadCredentials().then(creds => {
        if (creds) {
          setEdooboxApiKey(creds.apiKey)
          setEdooboxApiSecret(creds.apiSecret)
        }
      })
      edooboxService.marketingLoadCredentials().then(creds => {
        if (creds) {
          if (creds.wpAppPassword) setWpAppPassword(creds.wpAppPassword)
        }
      })
    }
    if (isOpen && (activeTab === 'agents' || activeTab === 'remarkable')) {
      checkRemarkableConnection()
    }
  }, [isOpen, activeTab])

  const checkRemarkableConnection = async () => {
    setRemarkableStatus('checking')
    setRemarkableError(null)
    try {
      const result = await invokePlugin<{ connected: boolean; error?: string }>('remarkable', 'remarkable.usbCheck')
      setRemarkableStatus(result.connected ? 'connected' : 'disconnected')
      if (!result.connected && result.error) {
        setRemarkableError(result.error)
      }
    } catch {
      setRemarkableStatus('disconnected')
      setRemarkableError(t('settings.agents.remarkable.checkError'))
    }
  }

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

  const checkZoteroConnection = async () => {
    setZoteroStatus('checking')
    try {
      const connected = await window.electronAPI.zoteroCheck()
      setZoteroStatus(connected ? 'connected' : 'disconnected')
    } catch {
      setZoteroStatus('disconnected')
    }
  }

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

  const checkDoclingConnection = async () => {
    setDoclingStatus('checking')
    try {
      const result = await window.electronAPI.doclingCheck(docling.url)
      setDoclingStatus(result.available ? 'connected' : 'disconnected')
      if (result.version) {
        setDoclingVersion(result.version)
      }
    } catch {
      setDoclingStatus('disconnected')
    }
  }

  const checkLanguageToolConnection = async () => {
    setLanguageToolStatus('checking')
    try {
      const mode = languageTool.mode || 'local'
      const result = await window.electronAPI.languagetoolCheck(
        mode,
        mode === 'local' ? languageTool.url : undefined,
        mode === 'api' ? languageTool.apiKey : undefined
      )
      setLanguageToolStatus(result.available ? 'connected' : 'disconnected')
    } catch {
      setLanguageToolStatus('disconnected')
    }
  }

  const checkReadwiseConnection = async () => {
    if (!readwise.apiKey) {
      setReadwiseStatus('disconnected')
      return
    }
    setReadwiseStatus('checking')
    try {
      const result = await window.electronAPI.readwiseCheck(readwise.apiKey)
      setReadwiseStatus(result.available ? 'connected' : 'disconnected')
    } catch {
      setReadwiseStatus('disconnected')
    }
  }

  const checkOpenAlexConnection = async () => {
    setOpenAlexStatus('checking')
    setOpenAlexMessage(null)
    try {
      const result = await window.electronAPI.openAlexCheck()
      setOpenAlexStatus(result.available ? 'connected' : 'disconnected')
      if (result.available) {
        setOpenAlexMessage(result.authenticated
          ? t('settings.integrations.openAlexConnectedWithKey')
          : t('settings.integrations.openAlexConnectedDemo'))
      } else {
        setOpenAlexMessage(result.error || t('settings.notConnected'))
      }
    } catch {
      setOpenAlexStatus('disconnected')
      setOpenAlexMessage(t('settings.notConnected'))
    }
  }

  const saveOpenAlexKey = async () => {
    const key = openAlexApiKey.trim()
    if (!key) return
    const result = await window.electronAPI.openAlexSaveKey(key)
    if (result.success) {
      setOpenAlexKeySaved(true)
      setOpenAlexApiKey('')
      setOpenAlexMessage(t('settings.integrations.openAlexSaved'))
      await checkOpenAlexConnection()
    } else {
      setOpenAlexStatus('disconnected')
      setOpenAlexMessage(result.error || t('settings.integrations.openAlexSaveFailed'))
    }
  }

  const deleteOpenAlexKey = async () => {
    await window.electronAPI.openAlexDeleteKey()
    setOpenAlexKeySaved(false)
    setOpenAlexApiKey('')
    setOpenAlexMessage(t('settings.integrations.openAlexDeleted'))
    await checkOpenAlexConnection()
  }

  const saveOpenAlexMailto = async () => {
    const mailto = openAlexMailto.trim()
    if (!mailto) return
    const result = await window.electronAPI.openAlexSaveMailto(mailto)
    if (result.success) {
      setOpenAlexMailtoSaved(mailto)
      setOpenAlexMailto('')
      setOpenAlexMessage(t('settings.integrations.openAlexMailtoSaved'))
      await checkOpenAlexConnection()
    } else {
      setOpenAlexMessage(result.error || t('settings.integrations.openAlexMailtoSaveFailed'))
    }
  }

  const deleteOpenAlexMailto = async () => {
    await window.electronAPI.openAlexDeleteMailto()
    setOpenAlexMailtoSaved(null)
    setOpenAlexMailto('')
    setOpenAlexMessage(t('settings.integrations.openAlexMailtoDeleted'))
    await checkOpenAlexConnection()
  }

  const triggerReadwiseSync = async () => {
    if (!readwise.apiKey || !vaultPath || readwiseSyncing) return
    setReadwiseSyncing(true)
    setReadwiseSyncResult(null)
    setReadwiseSyncProgress(null)

    // Progress-Listener registrieren
    window.electronAPI.onReadwiseSyncProgress((progress) => {
      setReadwiseSyncProgress(progress)
    })

    try {
      const result = await window.electronAPI.readwiseSync(
        readwise.apiKey,
        readwise.syncFolder,
        vaultPath,
        readwise.lastSyncedAt || undefined,
        readwise.syncCategories
      )

      if (result.success && result.stats) {
        const now = new Date().toISOString()
        setReadwise({ lastSyncedAt: now })
        setReadwiseSyncResult(
          t('settings.readwise.syncStats')
            .replace('{new}', String(result.stats.new))
            .replace('{updated}', String(result.stats.updated))
            .replace('{total}', String(result.stats.total))
        )

        // FileTree neu laden und synced Dateien in den NotesStore aufnehmen
        if ((result.stats.new > 0 || result.stats.updated > 0) && result.syncedFiles && result.syncedFiles.length > 0) {
          try {
            // FileTree aktualisieren
            const newTree = await window.electronAPI.readDirectory(vaultPath)
            useNotesStore.getState().setFileTree(newTree)

            // Synced-Dateien lesen und in NotesStore laden
            const contents = await window.electronAPI.readFilesBatch(vaultPath, result.syncedFiles)
            for (const relativePath of result.syncedFiles) {
              const content = contents[relativePath]
              if (!content) continue
              const fullPath = `${vaultPath}/${relativePath}`
              const note = await createNoteFromFile(fullPath, relativePath, content)
              useNotesStore.getState().addNote(note)
            }
            console.log(`[Readwise] ${result.syncedFiles.length} Notizen in Store geladen`)
          } catch (e) {
            console.error('[Readwise] Store-Update failed:', e)
          }
        }
      } else {
        setReadwiseSyncResult(`Fehler: ${result.error}`)
      }
    } catch (error) {
      setReadwiseSyncResult(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`)
    } finally {
      setReadwiseSyncing(false)
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
            {/* Vault (immer ganz oben, wenn geladen) */}
            {vaultPath && (
              <button
                className={`settings-nav-item ${activeTab === 'vault' ? 'active' : ''}`}
                onClick={() => setActiveTab('vault')}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M2 5L9 2L16 5V13L9 16L2 13V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M9 8V16M2 5L9 8L16 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                {t('settings.tab.vault')}
              </button>
            )}

            {/* Section: Grundlagen */}
            <div className="settings-nav-section-label">{t('settings.nav.basics')}</div>
            <button
              className={`settings-nav-item ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M9 1V3M9 15V17M1 9H3M15 9H17M3.5 3.5L5 5M13 13L14.5 14.5M3.5 14.5L5 13M13 5L14.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {t('settings.tab.general')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M13.5 2.5L15.5 4.5L6 14H4V12L13.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('settings.tab.editor')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveTab('templates')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5 6H13M5 9H13M5 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {t('settings.tab.templates')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'shortcuts' ? 'active' : ''}`}
              onClick={() => setActiveTab('shortcuts')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="1" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M4 8H5M7 8H8M10 8H11M13 8H14M5 11H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {t('settings.tab.shortcuts')}
            </button>

            {/* Section: Workflow */}
            <div className="settings-nav-section-label">{t('settings.nav.workflow')}</div>
            <button
              className={`settings-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="10" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="2" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="10" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              {t('settings.dashboard.title')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'dailyNote' ? 'active' : ''}`}
              onClick={() => setActiveTab('dailyNote')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 6h6M6 9h6M6 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="13" cy="13" r="4" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M13 11v2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('settings.tab.dailyNote')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'brain' ? 'active' : ''}`}
              onClick={() => setActiveTab('brain')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2.5C7 2.5 5.5 4 5.5 6c0 .4.05.8.16 1.17C4.36 7.66 3.5 8.74 3.5 10c0 1.04.6 1.95 1.5 2.43C5 13.4 5.84 14 6.8 14c.43 0 .82-.12 1.16-.32C8.31 14.5 9.13 15 10 15c1.66 0 3-1.12 3-2.5 0-.18-.02-.36-.06-.53.94-.46 1.56-1.32 1.56-2.32 0-1.07-.7-1.99-1.7-2.42.13-.4.2-.81.2-1.23 0-2-1.5-3.5-3.5-3.5-.36 0-.7.05-1 .15-.3-.1-.65-.15-1-.15z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M9 6v8M7 9c1 1 3 1 4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              {t('settings.tab.brain')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'transport' ? 'active' : ''}`}
              onClick={() => setActiveTab('transport')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9l6-6 6 6M9 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('settings.transport.title')}
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'dataview' ? 'active' : ''}`}
              onClick={() => setActiveTab('dataview')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5 7H13M5 10H13M5 13H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {t('settings.tab.dataview')}
            </button>

            {/* Section: Module */}
            <div className="settings-nav-section-label">{t('settings.nav.modules')}</div>
            <button
              className={`settings-nav-item ${activeTab === 'modules' ? 'active' : ''}`}
              onClick={() => setActiveTab('modules')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2L2 6l7 4 7-4-7-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M2 12l7 4 7-4M2 9l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
              {t('settings.tab.modules')}
            </button>
            {/* Integrationen bleibt sichtbar, da es Ollama/LM Studio als KI-Backend enthält */}
            <button
              className={`settings-nav-item ${activeTab === 'integrations' ? 'active' : ''}`}
              onClick={() => setActiveTab('integrations')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M6 9H12M9 6V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="11" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="2" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="11" y="11" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              {t('settings.tab.integrations')}
            </button>
            {/* Email-Tab: nur wenn Modul aktiv */}
            {isModuleEnabled('email') && (
              <button
                className={`settings-nav-item ${activeTab === 'email' ? 'active' : ''}`}
                onClick={() => setActiveTab('email')}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2.5" y="4" width="13" height="10" rx="1.8" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3.5 5.5L8.2 9.1a1.3 1.3 0 001.6 0l4.7-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t('settings.email.title')}
              </button>
            )}
            {/* Edoobox-Tab: nur wenn Modul aktiv */}
            {isModuleEnabled('mz-suite') && (
              <button
                className={`settings-nav-item ${activeTab === 'agents' ? 'active' : ''}`}
                onClick={() => setActiveTab('agents')}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M9 6v6M6 9h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {t('settings.tab.agents')}
              </button>
            )}
            {/* Speech-Tab: nur wenn Modul aktiv */}
            {isModuleEnabled('speech') && (
              <button
                className={`settings-nav-item ${activeTab === 'speech' ? 'active' : ''}`}
                onClick={() => setActiveTab('speech')}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 1a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M14 8v1a5 5 0 0 1-10 0V8M9 14v3M6 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {t('settings.tab.speech')}
              </button>
            )}
            {/* reMarkable-Tab: nur wenn Modul aktiv */}
            {isModuleEnabled('remarkable') && (
              <button
                className={`settings-nav-item ${activeTab === 'remarkable' ? 'active' : ''}`}
                onClick={() => setActiveTab('remarkable')}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="3" y="1" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 5h4M7 8h4M7 11h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                reMarkable
              </button>
            )}
            {/* Telegram-Tab: immer sichtbar (Bot-Feature) */}
            <button
              className={`settings-nav-item ${activeTab === 'telegram' ? 'active' : ''}`}
              onClick={() => setActiveTab('telegram')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M2 9l14-6-2 13-5-3-3 3v-4l8-6-9 5-3-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
              Telegram
            </button>

            {/* Section: Konto & Sync */}
            <div className="settings-nav-section-label">{t('settings.nav.account')}</div>
            <button
              className={`settings-nav-item ${activeTab === 'sync' ? 'active' : ''}`}
              onClick={() => setActiveTab('sync')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9C3 5.69 5.69 3 9 3C11.22 3 13.15 4.26 14.13 6.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M15 9C15 12.31 12.31 15 9 15C6.78 15 4.85 13.74 3.87 11.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M12 6H15V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 12H3V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('settings.tab.sync')}
            </button>
            {/* Zugangsdaten-Tab: zentrale Übersicht aller Credentials */}
            <button
              className={`settings-nav-item ${activeTab === 'credentials' ? 'active' : ''}`}
              onClick={() => setActiveTab('credentials')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M12 3a3 3 0 0 1 3 3v2h1v7H2V8h1V6a3 3 0 0 1 3-3h6zm0 1.5H6a1.5 1.5 0 0 0-1.5 1.5v2h9V6A1.5 1.5 0 0 0 12 4.5zM9 10.5a1.5 1.5 0 0 0-.75 2.8V14h1.5v-.7A1.5 1.5 0 0 0 9 10.5z" stroke="currentColor" strokeWidth="1" fill="none"/>
              </svg>
              Zugangsdaten
            </button>
          </nav>

          <div className="settings-content">
            {/* Petrol redesign: großer Seiten-Titel je Tab wie im Module-Tab (Konsistenz).
                Der Module-Tab bringt seinen eigenen Header inkl. Untertitel mit → hier ausgenommen. */}
            {activeTab !== 'modules' && (
              <div className="settings-tab-header">
                <h2>{
                  activeTab === 'dashboard' ? t('settings.dashboard.title')
                    : activeTab === 'transport' ? t('settings.transport.title')
                    : activeTab === 'email' ? t('settings.email.title')
                    : activeTab === 'remarkable' ? 'reMarkable'
                    : activeTab === 'telegram' ? 'Telegram'
                    : activeTab === 'credentials' ? 'Zugangsdaten'
                    : t(`settings.tab.${activeTab}` as TranslationKey)
                }</h2>
              </div>
            )}
            {/* Vault Tab */}
            {activeTab === 'vault' && vaultPath && (
              <VaultSettingsTab vaultPath={vaultPath} t={t} onNavigateToTab={setActiveTab} />
            )}

            {/* Allgemein Tab */}
            {activeTab === 'general' && (
              <div className="settings-section">
                <h3>{t('settings.general.theme')}</h3>
                <div className="settings-row">
                  <label>{t('settings.general.theme')}</label>
                  <select
                    value={theme}
                    onChange={e => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                  >
                    <option value="system">{t('settings.general.theme.system')}</option>
                    <option value="light">{t('settings.general.theme.light')}</option>
                    <option value="dark">{t('settings.general.theme.dark')}</option>
                  </select>
                </div>
                <div className="settings-row">
                  <label>{t('settings.general.accentColor')}</label>
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
                    <label
                      className="accent-color-btn custom-color-btn"
                      title={t('settings.general.customColor')}
                    >
                      <input
                        type="color"
                        value={customAccentColor}
                        onChange={e => {
                          setCustomAccentColor(e.target.value)
                          setAccentColor('custom')
                        }}
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                      />
                    </label>
                  </div>
                </div>
                <div className="settings-row">
                  <label>{t('settings.general.backgroundColor')}</label>
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
                    <label
                      className="accent-color-btn custom-color-btn"
                      title={t('settings.general.customColor')}
                    >
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
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                      />
                    </label>
                  </div>
                </div>
                <div className="settings-row">
                  <label>{t('settings.general.logo')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {customLogo && (
                      <img src={customLogo} width="28" height="28" style={{ borderRadius: '50%', objectFit: 'cover' }} />
                    )}
                    <button
                      className="settings-refresh"
                      onClick={async () => {
                        const dataUrl = await window.electronAPI.selectCustomLogo()
                        if (dataUrl) setCustomLogo(dataUrl)
                      }}
                    >
                      {t('settings.general.logo.upload')}
                    </button>
                    {customLogo && (
                      <button
                        className="settings-refresh"
                        onClick={async () => {
                          await window.electronAPI.removeCustomLogo()
                          removeCustomLogo()
                        }}
                      >
                        {t('settings.general.logo.remove')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="settings-row">
                  <label>{t('settings.general.language')}</label>
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value as Language)}
                  >
                    {(Object.keys(UI_LANGUAGES) as Language[]).map(lang => (
                      <option key={lang} value={lang}>{UI_LANGUAGES[lang]}</option>
                    ))}
                  </select>
                </div>
                <div className="settings-row">
                  <label>{t('settings.general.font')}</label>
                  <select
                    value={fontFamily}
                    onChange={e => setFontFamily(e.target.value as FontFamily)}
                  >
                    <optgroup label="Sans-Serif">
                      {(Object.keys(FONT_FAMILIES) as FontFamily[])
                        .filter(font => FONT_FAMILIES[font].category === 'sans')
                        .map(font => (
                          <option key={font} value={font}>{FONT_FAMILIES[font].name}</option>
                        ))}
                    </optgroup>
                    <optgroup label="Nerd Fonts">
                      {(Object.keys(FONT_FAMILIES) as FontFamily[])
                        .filter(font => FONT_FAMILIES[font].category === 'nerd')
                        .map(font => (
                          <option key={font} value={font}>{FONT_FAMILIES[font].name}</option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                <div className="settings-row" style={{ marginTop: '12px' }}>
                  <div>
                    <label>{t('settings.general.resetAppearance')}</label>
                    <div className="settings-hint">{t('settings.general.resetAppearanceHint')}</div>
                  </div>
                  <button
                    className="settings-refresh"
                    onClick={() => {
                      // Petrol redesign fix: auf die ECHTEN Store-Defaults zurücksetzen. Vorher
                      // setzte der Reset die alten Vor-Petrol-Werte (terracotta-Akzent + creme-
                      // Hintergrund) — Letzterer überschrieb sogar den Dark-Mode.
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
                    {t('settings.general.resetAppearance')}
                  </button>
                </div>

                <h3>{t('settings.general.vault')}</h3>
                <div className="settings-row">
                  <label>{t('settings.general.loadLastVault')}</label>
                  <input
                    type="checkbox"
                    checked={loadLastVaultOnStart}
                    onChange={e => setLoadLastVaultOnStart(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <div>
                    <label>Standard-Notizenordner</label>
                    <div className="settings-hint">
                      {notesRootFolder || 'Nicht festgelegt'} · Neue Notizen werden hier angelegt.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      className="settings-refresh"
                      disabled={!vaultPath}
                      onClick={async () => {
                        if (!vaultPath) return
                        const folder = await window.electronAPI.selectFolderInVault(vaultPath)
                        if (folder !== null) setNotesRootFolder(folder)
                      }}
                    >
                      Ordner wählen
                    </button>
                    <button
                      className="settings-refresh"
                      disabled={!vaultPath}
                      onClick={async () => {
                        if (!vaultPath) return
                        await window.electronAPI.ensureDir(`${vaultPath}/Notes`)
                        const tree = await window.electronAPI.readDirectory(vaultPath)
                        setFileTree(tree)
                        setNotesRootFolder('Notes')
                      }}
                    >
                      Notes anlegen
                    </button>
                    <button
                      className="settings-refresh"
                      onClick={() => setNotesRootFolder('')}
                    >
                      Zurücksetzen
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div>
                    <label>Projekt-Ordner (Crystallizer)</label>
                    <div className="settings-hint">
                      {projectsRootFolder || 'Nicht festgelegt'} · Pro Unterordner kann der „Projekt-Status"-Crystallizer einen Wochenstand erzeugen.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      className="settings-refresh"
                      disabled={!vaultPath}
                      onClick={async () => {
                        if (!vaultPath) return
                        const folder = await window.electronAPI.selectFolderInVault(vaultPath)
                        if (folder !== null) setProjectsRootFolder(folder)
                      }}
                    >
                      Ordner wählen
                    </button>
                    <button
                      className="settings-refresh"
                      onClick={() => setProjectsRootFolder('')}
                    >
                      Zurücksetzen
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Editor Tab */}
            {activeTab === 'editor' && (
              <div className="settings-section">
                <h3>{t('settings.editor.display')}</h3>
                <div className="settings-row">
                  <label>{t('settings.editor.fontSize')}</label>
                  <div className="settings-input-group">
                    <input
                      type="number"
                      min="10"
                      max="24"
                      value={editorFontSize}
                      onChange={e => setEditorFontSize(parseInt(e.target.value) || 15)}
                    />
                    <span>px</span>
                  </div>
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.showLineNumbers')}</label>
                  <input
                    type="checkbox"
                    checked={editorLineNumbers}
                    onChange={e => setEditorLineNumbers(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.foldHeadings')}</label>
                  <input
                    type="checkbox"
                    checked={editorHeadingFolding}
                    onChange={e => setEditorHeadingFolding(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.outlining')}</label>
                  <input
                    type="checkbox"
                    checked={editorOutlining}
                    onChange={e => setEditorOutlining(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.outlineStyle')}</label>
                  <select
                    value={outlineStyle}
                    onChange={e => setOutlineStyle(e.target.value as OutlineStyle)}
                    disabled={!editorOutlining}
                  >
                    {(Object.keys(OUTLINE_STYLES) as OutlineStyle[]).map(key => (
                      <option key={key} value={key}>
                        {OUTLINE_STYLES[key].name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.wordCounter')}</label>
                  <input
                    type="checkbox"
                    checked={editorShowWordCount}
                    onChange={e => setEditorShowWordCount(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.formattingToolbar')}</label>
                  <input
                    type="checkbox"
                    checked={showFormattingToolbar}
                    onChange={e => setShowFormattingToolbar(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.rawEditor')}</label>
                  <input
                    type="checkbox"
                    checked={showRawEditor}
                    onChange={e => {
                      const enabled = e.target.checked
                      setShowRawEditor(enabled)
                      if (!enabled && editorDefaultView === 'edit') {
                        setEditorDefaultView('preview')
                      }
                    }}
                  />
                </div>

                <h3>{t('settings.editor.headerActions')}</h3>
                {([
                  ['languageTool', 'settings.editor.headerActionLanguageTool'],
                  ['pdf', 'settings.editor.headerActionPdf'],
                  ['remarkable', 'settings.editor.headerActionRemarkable'],
                  ['docx', 'settings.editor.headerActionDocx'],
                  ['wordpress', 'settings.editor.headerActionWordpress']
                ] as const).map(([action, label]) => (
                  <div className="settings-row" key={action}>
                    <label>{t(label)}</label>
                    <input
                      type="checkbox"
                      checked={editorHeaderActions[action]}
                      onChange={e => setEditorHeaderActions({ [action]: e.target.checked })}
                    />
                  </div>
                ))}

                <h3>{t('settings.editor.behavior')}</h3>
                <div className="settings-row">
                  <label>{t('settings.editor.defaultViewLabel')}</label>
                  <select
                    value={!showRawEditor && editorDefaultView === 'edit' ? 'live-preview' : editorDefaultView}
                    onChange={e => setEditorDefaultView(e.target.value as 'edit' | 'live-preview' | 'preview')}
                  >
                    {showRawEditor && <option value="edit">{t('settings.editor.viewEdit')}</option>}
                    <option value="live-preview">{t('settings.editor.viewLivePreview')}</option>
                    <option value="preview">{t('settings.editor.viewPreview')}</option>
                  </select>
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.autoSaveInterval')}</label>
                  <select
                    value={autoSaveInterval}
                    onChange={e => setAutoSaveInterval(parseInt(e.target.value))}
                  >
                    <option value="0">{t('settings.editor.autoSaveDisabled')}</option>
                    <option value="500">0.5 {t('settings.editor.autoSaveSeconds')}</option>
                    <option value="1000">1 {t('settings.editor.autoSaveSeconds')}</option>
                    <option value="2000">2 {t('settings.editor.autoSaveSeconds')}</option>
                    <option value="5000">5 {t('settings.editor.autoSaveSeconds')}</option>
                  </select>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>{t('settings.editor.imagesFolder')}</label>
                    <span className="settings-hint">{t('settings.editor.imagesFolderHint')}</span>
                  </div>
                  <input
                    type="text"
                    value={imagesFolder}
                    onChange={e => setImagesFolder(e.target.value)}
                    placeholder=".attachments"
                    style={{ width: '240px', flexShrink: 0 }}
                  />
                </div>

                <h3>{t('settings.editor.slashCommands')}</h3>
                <div className="settings-row">
                  <label>{t('settings.editor.slashCommands.dateFormat')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="text"
                      value={slashCommandDateFormat}
                      onChange={e => setSlashCommandDateFormat(e.target.value)}
                      style={{ width: '120px' }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {t('settings.editor.slashCommands.preview')}: {formatDate(new Date(), slashCommandDateFormat)}
                    </span>
                  </div>
                </div>
                <div className="settings-row">
                  <label>{t('settings.editor.slashCommands.timeFormat')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="text"
                      value={slashCommandTimeFormat}
                      onChange={e => setSlashCommandTimeFormat(e.target.value)}
                      style={{ width: '120px' }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {t('settings.editor.slashCommands.preview')}: {formatDate(new Date(), slashCommandTimeFormat)}
                    </span>
                  </div>
                </div>

                <h3>{t('settings.pdf.title')}</h3>
                <div className="settings-row">
                  <label>{t('settings.pdf.enabled')}</label>
                  <input
                    type="checkbox"
                    checked={pdfCompanionEnabled}
                    onChange={e => setPdfCompanionEnabled(e.target.checked)}
                  />
                </div>
                <div className="settings-row">
                  <label>{t('settings.pdf.displayMode')}</label>
                  <select
                    value={pdfDisplayMode}
                    onChange={e => setPdfDisplayMode(e.target.value as 'both' | 'companion-only' | 'pdf-only')}
                    disabled={!pdfCompanionEnabled}
                  >
                    <option value="companion-only">{t('settings.pdf.companionOnly')}</option>
                    <option value="both">{t('settings.pdf.both')}</option>
                    <option value="pdf-only">{t('settings.pdf.pdfOnly')}</option>
                  </select>
                </div>
                <div className="settings-info">
                  <p>
                    <strong>{t('settings.pdf.title')}</strong> {t('settings.pdf.description')}
                  </p>
                </div>

                <h3>{t('settings.canvas.title')}</h3>
                <div className="settings-row">
                  <label>{t('settings.canvas.cardWidth')}</label>
                  <div className="settings-input-group">
                    <input
                      type="range"
                      min="150"
                      max="500"
                      step="10"
                      value={canvasDefaultCardWidth}
                      onChange={e => setCanvasDefaultCardWidth(parseInt(e.target.value))}
                      style={{ width: '120px' }}
                    />
                    <span>{canvasDefaultCardWidth}px</span>
                  </div>
                </div>
                <div className="settings-info">
                  <p>
                    {t('settings.canvas.cardWidthDesc')}
                  </p>
                </div>

                <h3>{t('settings.fileTree.title')}</h3>
                <div className="settings-row">
                  <label>{t('settings.fileTree.iconStyle')}</label>
                  <select
                    value={iconSet}
                    onChange={e => setIconSet(e.target.value as IconSet)}
                  >
                    {(Object.keys(ICON_SETS) as IconSet[]).map(key => (
                      <option key={key} value={key}>
                        {ICON_SETS[key].name} - {ICON_SETS[key].description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="settings-info">
                  <p>
                    {t('settings.fileTree.iconStyleDesc')}
                  </p>
                </div>

                <h3>{t('settings.tools.title')}</h3>
                <div className="settings-row">
                  <label>{t('settings.tools.stripWikilinks')}</label>
                  <button
                    className="btn-secondary"
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
                  </button>
                </div>
                <div className="settings-info">
                  <p>
                    {t('settings.tools.stripWikilinksDesc')}<br/>
                    {t('settings.tools.stripWikilinksExample')}
                  </p>
                  <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
                    {t('settings.tools.stripWikiliksHint')}
                  </p>
                </div>
              </div>
            )}

            {/* Templates Tab */}
            {activeTab === 'templates' && (
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
            )}

            {/* Integrationen Tab */}
            {activeTab === 'integrations' && (
              <div className="settings-section">
                <h3>{t('settings.integrations.localAI')}</h3>

                <div className="settings-row">
                  <label>{t('settings.integrations.aiEnabled')}</label>
                  <input
                    type="checkbox"
                    checked={ollama.enabled}
                    onChange={e => setOllama({ enabled: e.target.checked })}
                  />
                </div>

                <div className="settings-row">
                  <label>{t('settings.integrations.backend')}</label>
                  <select
                    value={ollama.backend}
                    onChange={e => {
                      const newBackend = e.target.value as LLMBackend
                      setOllama({ backend: newBackend, selectedModel: '' })
                    }}
                    disabled={!ollama.enabled}
                  >
                    <option value="ollama">Ollama (localhost:11434)</option>
                    <option value="lm-studio">LM Studio (localhost:{ollama.lmStudioPort})</option>
                  </select>
                </div>

                {/* Ollama Settings */}
                {ollama.backend === 'ollama' && (
                  <>
                    <div className="settings-row">
                      <label>Ollama Status</label>
                      <div className="settings-status">
                        {ollamaStatus === 'checking' && (
                          <span className="status-checking">{t('settings.checkingConnection')}</span>
                        )}
                        {ollamaStatus === 'connected' && (
                          <span className="status-connected">{t('settings.connected')} ({ollamaModels.length} {t('settings.models')})</span>
                        )}
                        {ollamaStatus === 'disconnected' && (
                          <span className="status-disconnected">{t('settings.notConnected')}</span>
                        )}
                        <button className="settings-refresh" onClick={checkOllamaConnection}>
                          {t('settings.refresh')}
                        </button>
                      </div>
                    </div>

                    {ollamaStatus === 'connected' && (
                      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ minWidth: '120px' }}>{t('settings.integrations.ollama.model')}</label>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1 }}>
                            <ModelPicker
                              value={ollama.selectedModel}
                              models={ollamaModels}
                              onChange={value => setOllama({ selectedModel: value })}
                              disabled={!ollama.enabled}
                              placeholder={{ value: '', label: t('settings.selectModel') }}
                              ariaLabel={t('settings.integrations.ollama.model')}
                              style={{ flex: 1 }}
                              maxWidth="none"
                            />
                            {ollama.selectedModel && (
                              <button
                                className="settings-refresh"
                                onClick={() => handleDeleteModel(ollama.selectedModel)}
                                title={t('settings.integrations.ollama.deleteModel')}
                                style={{ color: 'var(--text-error, #e53935)', flexShrink: 0 }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                        <ActiveModelStatusBadge model={ollama.selectedModel} />
                        <ModelRamWarning model={ollama.selectedModel} />
                      </div>
                    )}

                    {/* Projekt-RAG: zentrales Embedding-Modell (nur wenn Modul aktiv) */}
                    {ollamaStatus === 'connected' && isModuleEnabled('project-rag') && (
                      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ minWidth: '120px' }}>
                            {language === 'en' ? 'Project-RAG embedding' : 'Projekt-RAG Embedding'}
                          </label>
                          {(() => {
                            const patterns = ['embed', 'minilm', 'bge', 'gte', 'e5', 'nomic']
                            const embs = ollamaModels.filter(m => patterns.some(p => m.name.toLowerCase().includes(p)))
                            const cur = ollama.projectRagEmbeddingModel || 'bge-m3'
                            if (!embs.some(m => m.name === cur)) embs.unshift({ name: cur, size: 0 })
                            return (
                              <ModelPicker
                                value={cur}
                                models={embs}
                                onChange={value => setOllama({ projectRagEmbeddingModel: value })}
                                disabled={!ollama.enabled}
                                getLabel={name => {
                                  const m = embs.find(e => e.name === name)
                                  return name + (m && m.size === 0 ? (language === 'en' ? ' (not installed)' : ' (nicht installiert)') : '')
                                }}
                                ariaLabel={language === 'en' ? 'Project-RAG embedding' : 'Projekt-RAG Embedding'}
                                style={{ flex: 1 }}
                                maxWidth="none"
                              />
                            )
                          })()}
                        </div>
                        <p className="settings-hint" style={{ fontSize: '11px' }}>
                          {language === 'en'
                            ? 'Local embedding model for Project-RAG (bge-m3 recommended for German vaults). Answers use the chat model selected above. Everything stays local.'
                            : 'Lokales Embedding-Modell fürs Projekt-RAG (bge-m3 für deutsche Vaults empfohlen). Antworten nutzen das oben gewählte Chat-Modell. Alles bleibt lokal.'}
                        </p>
                      </div>
                    )}

                    {/* Model Download Section */}
                    {ollamaStatus === 'connected' && (
                      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                        <label>{t('settings.integrations.ollama.pullModel')}</label>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <select
                            value={pullModelName}
                            onChange={e => { setPullModelName(e.target.value); setCustomPullModelName('') }}
                            disabled={isPulling}
                            style={{ flex: 1 }}
                          >
                            <optgroup label={t('settings.integrations.ollama.cloudTestGroup')}>
                              {CLOUD_TEST_MODELS.map(m => (
                                <option key={m.name} value={m.name}>{m.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label={t('settings.integrations.ollama.recommendedModels')}>
                              {RECOMMENDED_PULL_MODELS.filter(m => (m.kind ?? 'chat') === 'chat').map(m => (
                                <option key={m.name} value={m.name}>
                                  {modelMarkers(m.name)}{m.label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label={t('settings.integrations.ollama.embeddingModels')}>
                              {RECOMMENDED_PULL_MODELS.filter(m => m.kind === 'embedding').map(m => (
                                <option key={m.name} value={m.name}>
                                  {modelMarkers(m.name)}{m.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          <button
                            className="settings-refresh"
                            onClick={handlePullModel}
                            disabled={isPulling}
                            style={{ flexShrink: 0 }}
                          >
                            {isPulling ? t('settings.integrations.ollama.pulling') : t('settings.integrations.ollama.download')}
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder={t('settings.integrations.ollama.customModel')}
                            value={customPullModelName}
                            onChange={e => setCustomPullModelName(e.target.value)}
                            disabled={isPulling}
                            onKeyDown={e => { if (e.key === 'Enter') handlePullModel() }}
                            style={{ flex: 1 }}
                          />
                        </div>
                        {isCloudModel(customPullModelName || pullModelName) && (
                          <span style={{ fontSize: '11px', color: 'var(--warning, #d97706)' }}>
                            {t('settings.integrations.ollama.cloudHint')}
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {t('settings.integrations.ollama.humanFavoriteHint')}
                        </span>
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
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {pullProgress.status}
                              {pullProgress.total ? ` — ${Math.round((pullProgress.completed || 0) / pullProgress.total * 100)}%` : ''}
                            </span>
                          </div>
                        )}
                        {pullSuccess && (
                          <span style={{ fontSize: '12px', color: 'var(--text-success, #43a047)' }}>
                            {t('settings.integrations.ollama.pullSuccess')}
                          </span>
                        )}
                        {pullError && (
                          <span style={{ fontSize: '12px', color: 'var(--text-error, #e53935)' }}>
                            {t('settings.integrations.ollama.pullError')}: {pullError}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="settings-info">
                      <p>
                        <strong>Ollama</strong> {t('settings.integrations.ollamaDesc')}
                      </p>
                      <p>
                        {t('settings.integrations.installOllama')} <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a>
                      </p>
                    </div>
                  </>
                )}

                {/* LM Studio Settings */}
                {ollama.backend === 'lm-studio' && (
                  <>
                    <div className="settings-row">
                      <label>LM Studio Port</label>
                      <div className="settings-input-group">
                        <input
                          type="number"
                          min="1"
                          max="65535"
                          value={ollama.lmStudioPort}
                          onChange={e => setOllama({ lmStudioPort: parseInt(e.target.value) || 1234 })}
                          style={{ width: '80px' }}
                        />
                        <button className="settings-refresh" onClick={checkLmstudioConnection}>
                          {t('settings.connect')}
                        </button>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>LM Studio Status</label>
                      <div className="settings-status">
                        {lmstudioStatus === 'checking' && (
                          <span className="status-checking">{t('settings.checkingConnection')}</span>
                        )}
                        {lmstudioStatus === 'connected' && (
                          <span className="status-connected">{t('settings.connected')} ({lmstudioModels.length} {t('settings.models')})</span>
                        )}
                        {lmstudioStatus === 'disconnected' && (
                          <span className="status-disconnected">{t('settings.notConnected')}</span>
                        )}
                        <button className="settings-refresh" onClick={checkLmstudioConnection}>
                          {t('settings.refresh')}
                        </button>
                      </div>
                    </div>

                    {lmstudioStatus === 'connected' && (
                      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ minWidth: '120px' }}>{t('settings.integrations.ollama.model')}</label>
                          <ModelPicker
                            value={ollama.selectedModel}
                            models={lmstudioModels}
                            onChange={value => setOllama({ selectedModel: value })}
                            disabled={!ollama.enabled}
                            placeholder={{ value: '', label: t('settings.selectModel') }}
                            ariaLabel={t('settings.integrations.ollama.model')}
                            style={{ flex: 1 }}
                            maxWidth="none"
                          />
                        </div>
                        <ActiveModelStatusBadge model={ollama.selectedModel} />
                        <ModelRamWarning model={ollama.selectedModel} />
                      </div>
                    )}

                    <div className="settings-info">
                      <p>
                        <strong>LM Studio</strong> {t('settings.integrations.lmstudioDesc')}
                      </p>
                      <p>
                        Download: <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer">lmstudio.ai</a>
                      </p>
                      <p>
                        <strong>Setup:</strong> {t('settings.integrations.lmstudioSetup')}
                      </p>
                    </div>
                  </>
                )}

                <ModelCompatibilitySection
                  availableModels={ollama.backend === 'ollama' ? ollamaModels : lmstudioModels}
                />

                <OpenRouterSection />

                <div className="settings-row">
                  <label>{t('settings.integrations.defaultTranslation')}</label>
                  <select
                    value={ollama.defaultTranslateLanguage}
                    onChange={e => setOllama({ defaultTranslateLanguage: e.target.value as typeof ollama.defaultTranslateLanguage })}
                    disabled={!ollama.enabled}
                  >
                    {AI_LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-info" style={{ marginTop: '12px' }}>
                  <p>
                    {t('settings.integrations.usage')}
                  </p>
                  <p>
                    {t('settings.integrations.transparency')}
                  </p>
                </div>

                <h3 style={{ marginTop: '32px' }}>{t('settings.integrations.aiFeatures')}</h3>
                <div className="settings-info" style={{ marginBottom: '16px' }}>
                  <p>
                    {t('settings.integrations.aiFeaturesDesc')}
                  </p>
                </div>
                <h3 style={{ marginTop: '16px' }}>{t('settings.integrations.smartConnections')}</h3>
                <p className="settings-hint">{t('settings.integrations.smartConnectionsHint')}</p>
                <ModuleDisabledHint moduleId="smart-connections" onGoToModules={() => setActiveTab('modules')} t={t} />

                {/* Smart Connections Weights Configuration */}
                {smartConnectionsEnabled && (
                  <div className="settings-subsection" style={{ marginLeft: '8px', paddingLeft: '12px', borderLeft: '2px solid var(--border-color)' }}>
                    <div className="settings-row" style={{ marginBottom: '8px' }}>
                      <label style={{ fontWeight: 500, fontSize: '13px' }}>{t('smartConnections.weights.title')}</label>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.embedding')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.embedding}
                          onChange={e => setSmartConnectionsWeights({ embedding: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.embedding}%</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.keyword')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.keyword}
                          onChange={e => setSmartConnectionsWeights({ keyword: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.keyword}%</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.wikilink')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.wikilink}
                          onChange={e => setSmartConnectionsWeights({ wikilink: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.wikilink}%</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.tags')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.tags}
                          onChange={e => setSmartConnectionsWeights({ tags: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.tags}%</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('smartConnections.weights.folder')}</label>
                      <div className="settings-input-group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={smartConnectionsWeights.folder}
                          onChange={e => setSmartConnectionsWeights({ folder: parseInt(e.target.value) })}
                          style={{ width: '100px' }}
                        />
                        <span style={{ minWidth: '40px', textAlign: 'right' }}>{smartConnectionsWeights.folder}%</span>
                      </div>
                    </div>

                    <div className="settings-row" style={{ marginTop: '8px' }}>
                      <label>{t('smartConnections.weights.total')}</label>
                      <span style={{
                        fontWeight: 500,
                        color: (smartConnectionsWeights.embedding + smartConnectionsWeights.keyword + smartConnectionsWeights.wikilink + smartConnectionsWeights.tags + smartConnectionsWeights.folder) === 100
                          ? 'var(--text-primary)'
                          : 'var(--color-warning, #ff9500)'
                      }}>
                        {smartConnectionsWeights.embedding + smartConnectionsWeights.keyword + smartConnectionsWeights.wikilink + smartConnectionsWeights.tags + smartConnectionsWeights.folder}%
                      </span>
                    </div>

                    <div className="settings-info" style={{ marginTop: '8px' }}>
                      <p style={{ fontSize: '12px' }}>{t('smartConnections.weights.hint')}</p>
                    </div>
                  </div>
                )}

                {smartConnectionsEnabled && (
                  <div className="settings-subsection" style={{ marginLeft: '8px', paddingLeft: '12px', borderLeft: '2px solid var(--border-color)', marginTop: '12px' }}>
                    <div className="settings-row">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={smartConnectionsRerankerEnabled}
                          onChange={e => setSmartConnectionsRerankerEnabled(e.target.checked)}
                        />
                        <span style={{ fontWeight: 500, fontSize: '13px' }}>LLM-Reranker (experimentell)</span>
                      </label>
                    </div>
                    <div className="settings-info" style={{ marginTop: '4px' }}>
                      <p style={{ fontSize: '12px' }}>
                        Nach der Embedding-Suche bewertet das aktuell gewählte Ollama-Modell die Top-Kandidaten paarweise auf Relevanz und sortiert um. Läuft im Hintergrund (~1-3s pro Kandidat), die Embedding-Liste wird sofort angezeigt. Kein dedizierter Reranker, sondern LLM-as-Judge — funktioniert mit jedem Chat-Modell, das du eh nutzt.
                      </p>
                    </div>
                  </div>
                )}

                {/* Notes Chat, Flashcards: Aktivierung erfolgt im Modul-Tab (keine Konfiguration nötig). */}

                {/* Flashcards-Ollama-Warnung bleibt als globaler Hinweis sichtbar, wenn das Modul aktiv ist aber Ollama fehlt */}
                {flashcardsEnabled && (!ollama.enabled || !ollama.selectedModel) && (
                  <div className="settings-warning" style={{
                    marginTop: '8px',
                    padding: '12px',
                    background: 'var(--color-warning-bg, rgba(255, 149, 0, 0.1))',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-warning, #ff9500)'
                  }}>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-warning, #ff9500)' }}>
                      {t('settings.integrations.flashcardsOllamaWarning')}
                    </p>
                  </div>
                )}

                <h3 style={{ marginTop: '32px' }}>{t('settings.integrations.zotero')}</h3>
                <div className="settings-row">
                  <label>Status</label>
                  <div className="settings-status">
                    {zoteroStatus === 'checking' && (
                      <span className="status-checking">{t('settings.checkingConnection')}</span>
                    )}
                    {zoteroStatus === 'connected' && (
                      <span className="status-connected">{t('settings.connected')}</span>
                    )}
                    {zoteroStatus === 'disconnected' && (
                      <span className="status-disconnected">{t('settings.notConnected')}</span>
                    )}
                    <button className="settings-refresh" onClick={checkZoteroConnection}>
                      {t('settings.refresh')}
                    </button>
                  </div>
                </div>
                <div className="settings-info">
                  <p>
                    {t('settings.integrations.zoteroDesc')}
                  </p>
                  <p>
                    {t('settings.integrations.zoteroShortcut')} <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
                  </p>
                </div>

                <h3 style={{ marginTop: '32px' }}>{t('settings.integrations.research')}</h3>
                <ModuleDisabledHint moduleId="semantic-scholar" onGoToModules={() => setActiveTab('modules')} t={t} />

                <div className="settings-info">
                  <p>{t('settings.integrations.researchDesc')}</p>
                  <p>{t('settings.integrations.openAlexHint')}</p>
                </div>

                <div className="settings-row">
                  <label>{t('settings.integrations.openAlexApiKey')}</label>
                  <div className="settings-input-group">
                    <input
                      type="password"
                      value={openAlexApiKey}
                      onChange={e => setOpenAlexApiKey(e.target.value)}
                      placeholder={openAlexKeySaved ? t('settings.integrations.openAlexKeySaved') : 'OPENALEX_API_KEY'}
                      disabled={!semanticScholarEnabled}
                      style={{ width: '260px' }}
                    />
                    <button
                      className="settings-refresh"
                      onClick={saveOpenAlexKey}
                      disabled={!openAlexApiKey.trim() || !semanticScholarEnabled}
                    >
                      {t('settings.integrations.openAlexSave')}
                    </button>
                    {openAlexKeySaved && (
                      <button className="settings-refresh" onClick={deleteOpenAlexKey}>
                        {t('settings.integrations.openAlexDelete')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="settings-row">
                  <label>{t('settings.integrations.openAlexMailto')}</label>
                  <div className="settings-input-group">
                    <input
                      type="email"
                      value={openAlexMailto}
                      onChange={e => setOpenAlexMailto(e.target.value)}
                      placeholder={openAlexMailtoSaved || 'mail@example.com'}
                      disabled={!semanticScholarEnabled}
                      style={{ width: '260px' }}
                    />
                    <button
                      className="settings-refresh"
                      onClick={saveOpenAlexMailto}
                      disabled={!openAlexMailto.trim() || !semanticScholarEnabled}
                    >
                      {t('settings.integrations.openAlexSave')}
                    </button>
                    {openAlexMailtoSaved && (
                      <button className="settings-refresh" onClick={deleteOpenAlexMailto}>
                        {t('settings.integrations.openAlexDelete')}
                      </button>
                    )}
                  </div>
                </div>
                <p className="settings-hint" style={{ marginTop: '-4px', marginLeft: 0 }}>
                  {t('settings.integrations.openAlexMailtoHint')}
                </p>

                <div className="settings-row">
                  <label>Status</label>
                  <div className="settings-status">
                    {openAlexStatus === 'checking' && (
                      <span className="status-checking">{t('settings.checkingConnection')}</span>
                    )}
                    {openAlexStatus === 'connected' && (
                      <span className="status-connected">{t('settings.connected')}</span>
                    )}
                    {openAlexStatus === 'disconnected' && (
                      <span className="status-disconnected">{t('settings.notConnected')}</span>
                    )}
                    <button className="settings-refresh" onClick={checkOpenAlexConnection}>
                      {t('settings.refresh')}
                    </button>
                  </div>
                </div>

                {openAlexMessage && (
                  <div className="settings-info">
                    <p>{openAlexMessage}</p>
                  </div>
                )}

                <h3 style={{ marginTop: '32px' }}>{t('settings.docling.title')}</h3>
                <ModuleDisabledHint moduleId="docling" onGoToModules={() => setActiveTab('modules')} t={t} />

                <div className="settings-row">
                  <label>{t('settings.docling.url')}</label>
                  <div className="settings-input-group">
                    <input
                      type="text"
                      value={docling.url}
                      onChange={e => setDocling({ url: e.target.value })}
                      placeholder="http://localhost:5001"
                      disabled={!docling.enabled}
                      style={{ width: '200px' }}
                    />
                    <button className="settings-refresh" onClick={checkDoclingConnection}>
                      {t('settings.connect')}
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <label>Status</label>
                  <div className="settings-status">
                    {doclingStatus === 'checking' && (
                      <span className="status-checking">{t('settings.checkingConnection')}</span>
                    )}
                    {doclingStatus === 'connected' && (
                      <span className="status-connected">
                        {t('settings.connected')} {doclingVersion && `(v${doclingVersion})`}
                      </span>
                    )}
                    {doclingStatus === 'disconnected' && (
                      <span className="status-disconnected">{t('settings.notConnected')}</span>
                    )}
                    <button className="settings-refresh" onClick={checkDoclingConnection}>
                      {t('settings.refresh')}
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <label>{t('settings.docling.ocrEnabled')}</label>
                  <input
                    type="checkbox"
                    checked={docling.ocrEnabled}
                    onChange={e => setDocling({ ocrEnabled: e.target.checked })}
                    disabled={!docling.enabled}
                  />
                </div>

                <div className="settings-row">
                  <label>{t('settings.docling.ocrLanguages')}</label>
                  <div className="settings-input-group">
                    <input
                      type="text"
                      value={docling.ocrLanguages.join(', ')}
                      onChange={e => setDocling({
                        ocrLanguages: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                      })}
                      placeholder="de, en"
                      disabled={!docling.enabled || !docling.ocrEnabled}
                      style={{ width: '120px' }}
                    />
                  </div>
                </div>

                <div className="settings-info">
                  <p>
                    <strong>Docling</strong> {t('settings.docling.description')}
                  </p>
                  <p>
                    {t('settings.docling.usage')}
                  </p>
                  <p>
                    {t('settings.docling.installHint')} <code>docker run -p 5001:5001 ds4sd/docling-serve</code>
                  </p>
                </div>

                {/* Vision OCR */}
                <h3 style={{ marginTop: '32px' }}>{t('settings.visionOcr.title')}</h3>
                <ModuleDisabledHint moduleId="vision-ocr" onGoToModules={() => setActiveTab('modules')} t={t} />

                <div className="settings-row">
                  <label>{t('settings.visionOcr.model')}</label>
                  <div className="settings-input-group">
                    <select
                      value={visionOcr.model}
                      onChange={e => setVisionOcr({ model: e.target.value })}
                      disabled={!visionOcr.enabled}
                      style={{ minWidth: '200px' }}
                    >
                      <option value="">{t('settings.selectModel')}</option>
                      {visionOcrModelList.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                    <button className="settings-refresh" onClick={() => window.electronAPI.visionOcrModels().then(setVisionOcrModelList).catch(() => {})}>
                      {t('settings.refresh')}
                    </button>
                  </div>
                </div>
                <div className="settings-row">
                  <label>{t('settings.visionOcr.pageWidth')}</label>
                  <select
                    value={visionOcr.pageWidth}
                    onChange={e => setVisionOcr({ pageWidth: Number(e.target.value) })}
                    disabled={!visionOcr.enabled}
                  >
                    <option value={400}>400px (schnell)</option>
                    <option value={600}>600px</option>
                    <option value={800}>800px (empfohlen)</option>
                    <option value={1200}>1200px (hohe Qualität)</option>
                  </select>
                </div>
                <div className="settings-info">
                  <p>
                    <strong>Vision OCR</strong> {t('settings.visionOcr.description')}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {t('settings.visionOcr.modelHint')}
                  </p>
                </div>

                <h3 style={{ marginTop: '32px' }}>{t('settings.languagetool.title')}</h3>
                <ModuleDisabledHint moduleId="language-tool" onGoToModules={() => setActiveTab('modules')} t={t} />

                <div className="settings-row">
                  <label>{t('settings.languagetool.mode')}</label>
                  <select
                    value={languageTool.mode || 'local'}
                    onChange={e => setLanguageTool({ mode: e.target.value as 'local' | 'api' })}
                    disabled={!languageTool.enabled}
                  >
                    <option value="local">{t('settings.languagetool.modeLocal')}</option>
                    <option value="api">{t('settings.languagetool.modeApi')}</option>
                  </select>
                </div>

                {(languageTool.mode || 'local') === 'local' && (
                  <div className="settings-row">
                    <label>{t('settings.languagetool.url')}</label>
                    <div className="settings-input-group">
                      <input
                        type="text"
                        value={languageTool.url}
                        onChange={e => setLanguageTool({ url: e.target.value })}
                        placeholder="http://localhost:8010"
                        disabled={!languageTool.enabled}
                        style={{ width: '200px' }}
                      />
                      <button className="settings-refresh" onClick={checkLanguageToolConnection}>
                        {t('settings.connect')}
                      </button>
                    </div>
                  </div>
                )}

                {(languageTool.mode || 'local') === 'api' && (
                  <>
                    <div className="settings-row">
                      <label>{t('settings.languagetool.apiUsername')}</label>
                      <input
                        type="email"
                        value={languageTool.apiUsername || ''}
                        onChange={e => setLanguageTool({ apiUsername: e.target.value })}
                        placeholder={t('settings.languagetool.apiUsernamePlaceholder')}
                        disabled={!languageTool.enabled}
                        style={{ width: '250px' }}
                      />
                    </div>
                    <div className="settings-row">
                      <label>{t('settings.languagetool.apiKey')}</label>
                      <div className="settings-input-group">
                        <input
                          type="password"
                          value={languageTool.apiKey || ''}
                          onChange={e => setLanguageTool({ apiKey: e.target.value })}
                          placeholder={t('settings.languagetool.apiKeyPlaceholder')}
                          disabled={!languageTool.enabled}
                          style={{ width: '200px' }}
                        />
                        <button className="settings-refresh" onClick={checkLanguageToolConnection}>
                          {t('settings.connect')}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="settings-row">
                  <label>Status</label>
                  <div className="settings-status">
                    {languageToolStatus === 'checking' && (
                      <span className="status-checking">{t('settings.checkingConnection')}</span>
                    )}
                    {languageToolStatus === 'connected' && (
                      <span className="status-connected">{t('settings.connected')}</span>
                    )}
                    {languageToolStatus === 'disconnected' && (
                      <span className="status-disconnected">{t('settings.notConnected')}</span>
                    )}
                    <button className="settings-refresh" onClick={checkLanguageToolConnection}>
                      {t('settings.refresh')}
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <label>{t('settings.languagetool.language')}</label>
                  <select
                    value={languageTool.language}
                    onChange={e => setLanguageTool({ language: e.target.value })}
                    disabled={!languageTool.enabled}
                  >
                    <option value="auto">{t('settings.languagetool.languageAuto')}</option>
                    <option value="de-DE">Deutsch</option>
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="fr">Français</option>
                    <option value="es">Español</option>
                    <option value="it">Italiano</option>
                    <option value="pt-PT">Português</option>
                    <option value="nl">Nederlands</option>
                    <option value="pl-PL">Polski</option>
                  </select>
                </div>

                <div className="settings-row">
                  <label>{t('settings.languagetool.autoCheck')}</label>
                  <input
                    type="checkbox"
                    checked={languageTool.autoCheck}
                    onChange={e => setLanguageTool({ autoCheck: e.target.checked })}
                    disabled={!languageTool.enabled}
                  />
                </div>

                <div className="settings-row">
                  <label>{t('settings.languagetool.autoCheckDelay')}</label>
                  <div className="settings-input-group">
                    <input
                      type="number"
                      min="500"
                      max="5000"
                      step="100"
                      value={languageTool.autoCheckDelay}
                      onChange={e => setLanguageTool({ autoCheckDelay: parseInt(e.target.value) || 1500 })}
                      disabled={!languageTool.enabled || !languageTool.autoCheck}
                      style={{ width: '80px' }}
                    />
                    <span>ms</span>
                  </div>
                </div>

                <div className="settings-info">
                  <p>
                    <strong>LanguageTool</strong> {t('settings.languagetool.description')}
                  </p>
                  {(languageTool.mode || 'local') === 'local' ? (
                    <p>
                      {t('settings.languagetool.installHint')} <code>docker run -d -p 8010:8010 erikvl87/languagetool</code>
                    </p>
                  ) : (
                    <p>
                      {t('settings.languagetool.apiHint')}
                    </p>
                  )}
                </div>

                <h3 style={{ marginTop: '32px' }}>{t('settings.readwise.title')}</h3>
                <ModuleDisabledHint moduleId="readwise" onGoToModules={() => setActiveTab('modules')} t={t} />

                <div className="settings-row">
                  <label>{t('settings.readwise.apiKey')}</label>
                  <div className="settings-input-group">
                    <input
                      type="password"
                      value={readwise.apiKey}
                      onChange={e => setReadwise({ apiKey: e.target.value })}
                      placeholder={t('settings.readwise.apiKeyHint')}
                      disabled={!readwise.enabled}
                      style={{ width: '250px' }}
                    />
                    <button className="settings-refresh" onClick={checkReadwiseConnection}>
                      {t('settings.connect')}
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <label>Status</label>
                  <div className="settings-status">
                    {readwiseStatus === 'checking' && (
                      <span className="status-checking">{t('settings.checkingConnection')}</span>
                    )}
                    {readwiseStatus === 'connected' && (
                      <span className="status-connected">{t('settings.connected')}</span>
                    )}
                    {readwiseStatus === 'disconnected' && (
                      <span className="status-disconnected">{t('settings.notConnected')}</span>
                    )}
                    <button className="settings-refresh" onClick={checkReadwiseConnection}>
                      {t('settings.refresh')}
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <label>{t('settings.readwise.syncFolder')}</label>
                  <input
                    type="text"
                    value={readwise.syncFolder}
                    onChange={e => setReadwise({ syncFolder: e.target.value })}
                    placeholder="500 - 📚 Readwise"
                    disabled={!readwise.enabled}
                    style={{ width: '250px' }}
                  />
                </div>

                <div className="settings-row">
                  <label>{t('settings.readwise.categories')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(['books', 'articles', 'tweets', 'podcasts', 'supplementals'] as const).map(cat => (
                      <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={readwise.syncCategories?.[cat] !== false}
                          onChange={e => setReadwise({
                            syncCategories: { ...readwise.syncCategories, [cat]: e.target.checked }
                          })}
                          disabled={!readwise.enabled}
                        />
                        {t(`settings.readwise.category.${cat}`)}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="settings-row">
                  <label>{t('settings.readwise.autoSync')}</label>
                  <input
                    type="checkbox"
                    checked={readwise.autoSync}
                    onChange={e => setReadwise({ autoSync: e.target.checked })}
                    disabled={!readwise.enabled}
                  />
                </div>

                <div className="settings-row">
                  <label>{t('settings.readwise.autoSyncInterval')}</label>
                  <div className="settings-input-group">
                    <select
                      value={readwise.autoSyncInterval}
                      onChange={e => setReadwise({ autoSyncInterval: parseInt(e.target.value) })}
                      disabled={!readwise.enabled || !readwise.autoSync}
                    >
                      <option value={15}>15 {t('settings.readwise.minutes')}</option>
                      <option value={30}>30 {t('settings.readwise.minutes')}</option>
                      <option value={60}>60 {t('settings.readwise.minutes')}</option>
                      <option value={120}>120 {t('settings.readwise.minutes')}</option>
                    </select>
                  </div>
                </div>

                <div className="settings-row">
                  <label>{t('settings.readwise.lastSync')}</label>
                  <div className="settings-input-group">
                    <span>
                      {readwise.lastSyncedAt
                        ? new Date(readwise.lastSyncedAt).toLocaleString()
                        : t('settings.readwise.never')
                      }
                    </span>
                    {readwise.lastSyncedAt && (
                      <button
                        className="settings-refresh"
                        onClick={() => setReadwise({ lastSyncedAt: '' })}
                        disabled={readwiseSyncing}
                        title={t('settings.readwise.resetSync')}
                        style={{ fontSize: '11px' }}
                      >
                        {t('settings.readwise.resetSync')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="settings-row">
                  <label>{t('settings.readwise.syncNow')}</label>
                  <div className="settings-input-group">
                    <button
                      className="settings-refresh"
                      onClick={triggerReadwiseSync}
                      disabled={!readwise.enabled || !readwise.apiKey || readwiseSyncing || readwiseStatus !== 'connected'}
                    >
                      {readwiseSyncing ? t('settings.readwise.syncing') : (readwise.lastSyncedAt ? t('settings.readwise.syncNow') : t('settings.readwise.fullSync'))}
                    </button>
                  </div>
                </div>

                {readwiseSyncProgress && readwiseSyncing && (
                  <div className="settings-row">
                    <label></label>
                    <span style={{ fontSize: '12px', opacity: 0.7 }}>
                      {readwiseSyncProgress.title}
                      {readwiseSyncProgress.total > 0 && ` (${readwiseSyncProgress.current}/${readwiseSyncProgress.total})`}
                    </span>
                  </div>
                )}

                {readwiseSyncResult && (
                  <div className="settings-row">
                    <label></label>
                    <span style={{ fontSize: '12px', color: readwiseSyncResult.startsWith('Fehler') ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {readwiseSyncResult}
                    </span>
                  </div>
                )}

                <div className="settings-info">
                  <p>
                    <strong>Readwise</strong> {t('settings.readwise.description')}
                  </p>
                </div>
              </div>
            )}

            {/* Tastenkürzel Tab */}
            {activeTab === 'shortcuts' && (
              <div className="settings-section settings-shortcuts">
                <h3>{t('settings.shortcuts.navigation')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>K</kbd>
                    <span>{t('settings.shortcuts.quickSwitcher')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>P</kbd>
                    <span>{t('settings.shortcuts.quickSearch')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>,</kbd>
                    <span>{t('settings.shortcuts.openSettings')}</span>
                  </div>
                </div>

                <h3>{t('settings.shortcuts.notesTemplates')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>
                    <span>{t('settings.shortcuts.templatePicker')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
                    <span>{t('settings.shortcuts.zoteroSearch')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>S</kbd>
                    <span>{t('settings.shortcuts.saveNote')}</span>
                  </div>
                </div>

                <h3>{t('settings.shortcuts.editorSection')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>E</kbd>
                    <span>{t('settings.shortcuts.switchView')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>B</kbd>
                    <span>{t('settings.shortcuts.bold')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>I</kbd>
                    <span>{t('settings.shortcuts.italic')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>
                    <span>{t('settings.shortcuts.code')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>
                    <span>{t('settings.shortcuts.strikethrough')}</span>
                  </div>
                </div>

                <h3>{t('settings.shortcuts.wikilinks')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>[[</kbd>
                    <span>{t('settings.shortcuts.startWikilink')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Cmd</kbd>+<kbd>Click</kbd>
                    <span>{t('settings.shortcuts.openWikilink')}</span>
                  </div>
                </div>

                <h3>{t('settings.shortcuts.view')}</h3>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>Sidebar-Button</kbd>
                    <span>{t('settings.shortcuts.toggleSidebar')}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>View-Switcher</kbd>
                    <span>{t('settings.shortcuts.switchViews')}</span>
                  </div>
                </div>

                <div className="settings-info" style={{ marginTop: '24px' }}>
                  <p>{t('settings.shortcuts.tip')}</p>
                </div>
              </div>
            )}

            {/* Dataview Tab */}
            {activeTab === 'dataview' && (
              <div className="settings-section settings-dataview">
                <h3>{t('settings.dataview.title')}</h3>
                <p className="settings-description">{t('settings.dataview.description')}</p>

                <h3>{t('settings.dataview.basicSyntax')}</h3>
                <div className="dataview-example">
                  <code className="dataview-code">```dataview<br/>LIST<br/>```</code>
                  <span className="dataview-desc">{t('settings.dataview.listAllNotes')}</span>
                </div>
                <div className="dataview-example">
                  <code className="dataview-code">```dataview<br/>TABLE status, priority<br/>```</code>
                  <span className="dataview-desc">{t('settings.dataview.tableWithColumns')}</span>
                </div>

                <h3>{t('settings.dataview.fromClause')}</h3>
                <div className="dataview-example">
                  <code className="dataview-code">LIST FROM #projekt</code>
                  <span className="dataview-desc">{t('settings.dataview.filterByTag')}</span>
                </div>
                <div className="dataview-example">
                  <code className="dataview-code">LIST FROM "Work/Projects"</code>
                  <span className="dataview-desc">{t('settings.dataview.filterByFolder')}</span>
                </div>
                <div className="dataview-example">
                  <code className="dataview-code">LIST FROM #projekt AND "Work"</code>
                  <span className="dataview-desc">{t('settings.dataview.combineSources')}</span>
                </div>

                <h3>{t('settings.dataview.whereClause')}</h3>
                <div className="dataview-example">
                  <code className="dataview-code">LIST WHERE status = "active"</code>
                  <span className="dataview-desc">{t('settings.dataview.filterByField')}</span>
                </div>
                <div className="dataview-example">
                  <code className="dataview-code">LIST WHERE priority &gt;= 2</code>
                  <span className="dataview-desc">{t('settings.dataview.filterByNumber')}</span>
                </div>
                <div className="dataview-example">
                  <code className="dataview-code">LIST WHERE completed = false</code>
                  <span className="dataview-desc">{t('settings.dataview.filterByBoolean')}</span>
                </div>
                <div className="dataview-example">
                  <code className="dataview-code">LIST WHERE contains(tags, "urgent")</code>
                  <span className="dataview-desc">{t('settings.dataview.filterWithContains')}</span>
                </div>

                <h3>{t('settings.dataview.sortAndLimit')}</h3>
                <div className="dataview-example">
                  <code className="dataview-code">LIST SORT file.mtime DESC</code>
                  <span className="dataview-desc">{t('settings.dataview.sortByDate')}</span>
                </div>
                <div className="dataview-example">
                  <code className="dataview-code">LIST SORT priority ASC LIMIT 10</code>
                  <span className="dataview-desc">{t('settings.dataview.sortAndLimitResults')}</span>
                </div>

                <h3>{t('settings.dataview.availableFields')}</h3>
                <div className="dataview-fields">
                  <div className="dataview-field-group">
                    <strong>{t('settings.dataview.fileFields')}</strong>
                    <ul>
                      <li><code>file.name</code> - {t('settings.dataview.fileName')}</li>
                      <li><code>file.path</code> - {t('settings.dataview.filePath')}</li>
                      <li><code>file.folder</code> - {t('settings.dataview.fileFolder')}</li>
                      <li><code>file.ctime</code> - {t('settings.dataview.fileCreated')}</li>
                      <li><code>file.mtime</code> - {t('settings.dataview.fileModified')}</li>
                      <li><code>file.tags</code> - {t('settings.dataview.fileTags')}</li>
                    </ul>
                  </div>
                  <div className="dataview-field-group">
                    <strong>{t('settings.dataview.frontmatterFields')}</strong>
                    <p>{t('settings.dataview.frontmatterDesc')}</p>
                    <ul>
                      <li><code>status</code>, <code>priority</code>, <code>deadline</code></li>
                      <li><code>author</code>, <code>tags</code>, <code>category</code></li>
                    </ul>
                  </div>
                </div>

                <h3>{t('settings.dataview.fullExample')}</h3>
                <div className="dataview-example full-example">
                  <pre className="dataview-code-block">{`\`\`\`dataview
TABLE status, deadline, priority
FROM "Work/Projects"
WHERE !completed AND priority >= 2
SORT deadline ASC
LIMIT 10
\`\`\``}</pre>
                </div>

                <div className="settings-info" style={{ marginTop: '24px' }}>
                  <p>{t('settings.dataview.tip')}</p>
                </div>
              </div>
            )}

            {/* Sync Tab */}
            {activeTab === 'sync' && (
              <div className="settings-section">
                {!syncState.syncEnabled ? (
                  /* Setup Mode */
                  <div className="sync-setup">
                    <h3>{t('settings.sync.title')}</h3>
                    <p className="sync-description">{t('settings.sync.description')}</p>

                    <div className="sync-mode-selector">
                      <div
                        className={`sync-mode-option ${syncMode === 'new' ? 'selected' : ''}`}
                        onClick={() => setSyncMode('new')}
                      >
                        <div className="sync-mode-radio" />
                        <div className="sync-mode-text">
                          <h4>{t('settings.sync.newSync')}</h4>
                          <p>{t('settings.sync.newSyncDesc')}</p>
                        </div>
                      </div>
                      <div
                        className={`sync-mode-option ${syncMode === 'join' ? 'selected' : ''}`}
                        onClick={() => setSyncMode('join')}
                      >
                        <div className="sync-mode-radio" />
                        <div className="sync-mode-text">
                          <h4>{t('settings.sync.joinSync')}</h4>
                          <p>{t('settings.sync.joinSyncDesc')}</p>
                        </div>
                      </div>
                    </div>

                    {syncMode === 'join' && (
                      <div className="sync-input-group">
                        <label>{t('settings.sync.vaultId')}</label>
                        <input
                          type="text"
                          value={syncJoinVaultId}
                          onChange={e => setSyncJoinVaultId(e.target.value)}
                          placeholder={t('settings.sync.enterVaultId')}
                        />
                      </div>
                    )}

                    <div className="sync-input-group">
                      <label>{t('settings.sync.relayUrl')}</label>
                      <input
                        type="text"
                        value={syncState.relayUrl}
                        onChange={e => syncState.setRelayUrl(e.target.value)}
                        placeholder="wss://sync.example.com"
                      />
                    </div>

                    <div className="sync-input-group">
                      <label>{t('settings.sync.activationCode')}</label>
                      <input
                        type="text"
                        value={syncActivationCode}
                        onChange={e => setSyncActivationCode(e.target.value)}
                        placeholder={t('settings.sync.activationCode')}
                      />
                      <span className="sync-input-hint">{t('settings.sync.activationCodeHint')}</span>
                    </div>

                    <div className="sync-input-group">
                      <label>{t('settings.sync.passphrase')}</label>
                      <input
                        type="password"
                        value={syncPassphrase}
                        onChange={e => setSyncPassphrase(e.target.value)}
                        placeholder={t('settings.sync.passphrase')}
                      />
                      <span className="sync-input-hint">{t('settings.sync.passphraseHint')}</span>
                      <span className="sync-input-warning">{t('settings.sync.passphraseWarning')}</span>
                    </div>

                    {syncSetupError && (
                      <div className="sync-input-warning" style={{ color: '#e53935' }}>
                        {syncSetupError}
                      </div>
                    )}

                    <button
                      className="sync-activate-btn"
                      disabled={!syncPassphrase || !syncActivationCode || !syncState.relayUrl || (syncMode === 'join' && !syncJoinVaultId) || !vaultPath || syncLoading}
                      onClick={async () => {
                        if (!vaultPath) return
                        setSyncLoading(true)
                        setSyncSetupError(null)
                        try {
                          if (syncMode === 'new') {
                            await syncState.initSync(vaultPath, syncPassphrase, syncActivationCode)
                          } else {
                            await syncState.joinSync(vaultPath, syncJoinVaultId, syncPassphrase, syncActivationCode)
                          }
                          setSyncPassphrase('')
                          setSyncJoinVaultId('')
                          setSyncActivationCode('')
                        } catch (err) {
                          setSyncSetupError(err instanceof Error ? err.message : 'Setup failed')
                        } finally {
                          setSyncLoading(false)
                        }
                      }}
                    >
                      {syncLoading ? t('settings.sync.status.connecting') : t('settings.sync.activate')}
                    </button>
                  </div>
                ) : (
                  /* Active Mode */
                  <div className="sync-active">
                    <div className="sync-header">
                      <h3>{t('settings.sync.title')}</h3>
                      <div className={`sync-status-badge ${
                        syncState.syncStatus === 'error' ? 'error' :
                        syncState.syncStatus !== 'idle' && syncState.syncStatus !== 'done' ? 'syncing' : ''
                      }`}>
                        <div className={`sync-status-dot ${
                          syncState.syncStatus !== 'idle' && syncState.syncStatus !== 'done' && syncState.syncStatus !== 'error' ? 'syncing' : ''
                        }`} />
                        {syncState.syncStatus === 'idle' || syncState.syncStatus === 'done'
                          ? t('settings.sync.active')
                          : syncState.syncStatus === 'error'
                            ? t('settings.sync.status.error')
                            : t('settings.sync.syncing')
                        }
                      </div>
                    </div>

                    <div className="sync-info-grid">
                      <span className="sync-info-label">{t('settings.sync.vaultName')}:</span>
                      <span className="sync-info-value">
                        <strong>{syncState.vaultName || vaultPath?.split(/[/\\]/).pop() || 'Vault'}</strong>
                      </span>

                      <span className="sync-info-label">{t('settings.sync.vaultId')}:</span>
                      <span className="sync-info-value">
                        <code style={{ fontSize: '0.85em', opacity: 0.7 }}>{syncState.vaultId}</code>
                        <button
                          className="sync-copy-btn"
                          onClick={() => {
                            writeClipboardText(syncState.vaultId)
                            setSyncCopied(true)
                            setTimeout(() => setSyncCopied(false), 2000)
                          }}
                          title={syncCopied ? t('settings.sync.copied') : 'Copy'}
                        >
                          {syncCopied ? (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <rect x="5" y="5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                              <path d="M9 5V3C9 2.45 8.55 2 8 2H3C2.45 2 2 2.45 2 3V8C2 8.55 2.45 9 3 9H5" stroke="currentColor" strokeWidth="1.2"/>
                            </svg>
                          )}
                        </button>
                      </span>

                      <span className="sync-info-label">{t('settings.sync.lastSync')}:</span>
                      <span className="sync-info-value">
                        {syncState.lastSyncTime
                          ? (() => {
                              const diff = Math.floor((Date.now() - syncState.lastSyncTime) / 1000)
                              if (diff < 60) return t('settings.sync.ago', { time: `${diff} ${t('settings.sync.seconds')}` })
                              if (diff < 3600) return t('settings.sync.ago', { time: `${Math.floor(diff / 60)} ${t('settings.sync.minutes')}` })
                              return t('settings.sync.ago', { time: `${Math.floor(diff / 3600)} ${t('settings.sync.hours')}` })
                            })()
                          : t('settings.sync.neverSynced')
                        }
                      </span>
                    </div>

                    {/* Progress Bar */}
                    {syncState.syncStatus !== 'idle' && syncState.syncStatus !== 'done' && syncState.syncStatus !== 'error' && syncState.syncProgress.total > 0 && (
                      <div>
                        <div className="sync-progress-bar">
                          <div
                            className="sync-progress-fill"
                            style={{ width: `${(syncState.syncProgress.current / syncState.syncProgress.total) * 100}%` }}
                          />
                        </div>
                        <div className="sync-progress-text">
                          {syncState.syncProgress.fileName && `${syncState.syncProgress.fileName} `}
                          ({syncState.syncProgress.current}/{syncState.syncProgress.total})
                        </div>
                      </div>
                    )}

                    {syncState.syncError && (
                      <div className="sync-input-warning" style={{ color: '#e53935' }}>
                        {syncState.syncError}
                        {syncState.syncError.includes('SAFETY') && (
                          <button
                            className="btn btn-small btn-danger"
                            style={{ marginLeft: '8px' }}
                            onClick={() => syncState.triggerSync(true)}
                          >
                            {t('settings.sync.forceSync')}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="settings-row">
                      <label>{t('settings.sync.autoSync')}</label>
                      <input
                        type="checkbox"
                        checked={syncState.autoSync}
                        onChange={e => syncState.setAutoSync(e.target.checked)}
                      />
                    </div>

                    {syncState.autoSync && (
                      <div className="settings-row">
                        <label>{t('settings.sync.interval')}</label>
                        <input
                          type="number"
                          min="60"
                          max="3600"
                          value={syncState.syncInterval}
                          onChange={e => syncState.setSyncInterval(parseInt(e.target.value) || 300)}
                          style={{ width: '100px' }}
                        />
                      </div>
                    )}

                    {/* Exclude Folders */}
                    <div className="sync-section">
                      <h4>{t('settings.sync.excludeFolders')}</h4>
                      <p className="sync-section-hint">{t('settings.sync.excludeFoldersHint')}</p>
                      <div className="sync-chips">
                        {syncState.excludeFolders.map(folder => (
                          <span key={folder} className="sync-chip">
                            {folder}
                            <button onClick={() => syncState.setExcludeFolders(syncState.excludeFolders.filter(f => f !== folder))}>
                              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="sync-chip-input">
                        <input
                          type="text"
                          value={excludeFolderInput}
                          onChange={e => setExcludeFolderInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && excludeFolderInput.trim()) {
                              const folder = excludeFolderInput.trim()
                              if (!syncState.excludeFolders.includes(folder)) {
                                syncState.setExcludeFolders([...syncState.excludeFolders, folder])
                              }
                              setExcludeFolderInput('')
                            }
                          }}
                          placeholder={t('settings.sync.addFolder')}
                        />
                      </div>
                    </div>

                    {/* Exclude Extensions */}
                    <div className="sync-section">
                      <h4>{t('settings.sync.excludeExtensions')}</h4>
                      <div className="sync-ext-checkboxes">
                        {['.pdf', '.png', '.jpg', '.gif', '.svg', '.webp', '.bmp'].map(ext => (
                          <label key={ext} className="sync-ext-checkbox">
                            <input
                              type="checkbox"
                              checked={syncState.excludeExtensions.includes(ext)}
                              onChange={e => {
                                if (e.target.checked) {
                                  syncState.setExcludeExtensions([...syncState.excludeExtensions, ext])
                                } else {
                                  syncState.setExcludeExtensions(syncState.excludeExtensions.filter(x => x !== ext))
                                }
                              }}
                            />
                            {ext}
                          </label>
                        ))}
                      </div>
                      <div className="sync-chip-input">
                        <input
                          type="text"
                          value={excludeExtInput}
                          onChange={e => setExcludeExtInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && excludeExtInput.trim()) {
                              let ext = excludeExtInput.trim()
                              if (!ext.startsWith('.')) ext = '.' + ext
                              if (!syncState.excludeExtensions.includes(ext)) {
                                syncState.setExcludeExtensions([...syncState.excludeExtensions, ext])
                              }
                              setExcludeExtInput('')
                            }
                          }}
                          placeholder=".docx"
                        />
                      </div>
                      {syncState.excludeExtensions.filter(e => !['.pdf', '.png', '.jpg', '.gif', '.svg', '.webp', '.bmp'].includes(e)).length > 0 && (
                        <div className="sync-chips" style={{ marginTop: '4px' }}>
                          {syncState.excludeExtensions.filter(e => !['.pdf', '.png', '.jpg', '.gif', '.svg', '.webp', '.bmp'].includes(e)).map(ext => (
                            <span key={ext} className="sync-chip">
                              {ext}
                              <button onClick={() => syncState.setExcludeExtensions(syncState.excludeExtensions.filter(x => x !== ext))}>
                                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sync Log */}
                    <div className="sync-section">
                      <div className="sync-section-header">
                        <h4>{t('settings.sync.log.title')}</h4>
                        {syncState.syncLog.length > 0 && (
                          <button className="sync-log-clear-btn" onClick={() => syncState.clearSyncLog()}>
                            {t('settings.sync.log.clear')}
                          </button>
                        )}
                      </div>
                      <div className="sync-log">
                        {syncState.syncLog.length === 0 ? (
                          <div className="sync-log-empty">{t('settings.sync.log.empty')}</div>
                        ) : (
                          syncState.syncLog.map((entry, i) => (
                            <div key={i} className="sync-log-entry">
                              <span className="sync-log-time">
                                {new Date(entry.timestamp).toLocaleTimeString()}
                              </span>
                              <span className={`sync-log-icon sync-log-icon-${entry.type}`}>
                                {entry.type === 'upload' && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 11V3M7 3L4 6M7 3L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                )}
                                {entry.type === 'download' && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3V11M7 11L4 8M7 11L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                )}
                                {entry.type === 'conflict' && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 4V8M7 10V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M1.5 12L7 2L12.5 12H1.5Z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
                                )}
                                {entry.type === 'delete' && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 4H11M5 4V3H9V4M5.5 6V10.5M8.5 6V10.5M4 4L4.5 11.5H9.5L10 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                )}
                                {entry.type === 'error' && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5L9 9M9 5L5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                )}
                                {(entry.type === 'connect' || entry.type === 'disconnect') && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4.5 7H9.5M3 4.5C3 4.5 2 5.5 2 7S3 9.5 3 9.5M11 4.5C11 4.5 12 5.5 12 7S11 9.5 11 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                )}
                                {entry.type === 'sync' && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5A4.5 4.5 0 0 1 11 4.5M11.5 6.5A4.5 4.5 0 0 1 3 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M9 3.5L11 4.5L10 6.5M5 10.5L3 9.5L4 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                )}
                              </span>
                              <span className="sync-log-message">{entry.message}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Deleted Files */}
                    <div className="sync-section">
                      <h4>{t('settings.sync.deleted.title')}</h4>
                      <p className="sync-section-hint">{t('settings.sync.deleted.hint')}</p>
                      <button
                        className="sync-btn-secondary"
                        disabled={deletedFilesLoading}
                        onClick={async () => {
                          setDeletedFilesLoading(true)
                          setRestoredFiles(new Set())
                          try {
                            const files = await window.electronAPI.syncGetDeletedFiles()
                            setDeletedFiles(files)
                            setDeletedFilesLoaded(true)
                          } catch {
                            // ignore
                          } finally {
                            setDeletedFilesLoading(false)
                          }
                        }}
                      >
                        {deletedFilesLoading ? t('settings.sync.deleted.loading') : deletedFilesLoaded ? t('settings.sync.deleted.reload') : t('settings.sync.deleted.load')}
                      </button>
                      {deletedFilesLoaded && (
                        <div className="sync-deleted-list">
                          {deletedFiles.length === 0 ? (
                            <div className="sync-log-empty">{t('settings.sync.deleted.empty')}</div>
                          ) : (
                            deletedFiles.map(file => {
                              const daysAgo = Math.floor((Date.now() / 1000 - file.deletedAt) / 86400)
                              const sizeKB = Math.round(file.size / 1024)
                              const displayPath = file.originalPath || file.path
                              return (
                                <div key={file.path} className="sync-deleted-entry">
                                  <div className="sync-deleted-info">
                                    <span className="sync-deleted-name">{displayPath}</span>
                                    <span className="sync-deleted-meta">
                                      {sizeKB} KB &middot; {t('settings.sync.deleted.daysAgo', { days: daysAgo })}
                                    </span>
                                  </div>
                                  <button
                                    className="sync-btn-secondary"
                                    disabled={restoredFiles.has(file.path)}
                                    onClick={async () => {
                                      const ok = await window.electronAPI.syncRestoreFile(file.path)
                                      if (ok) {
                                        setRestoredFiles(prev => new Set(prev).add(file.path))
                                        // Reload deleted files list after restore
                                        setTimeout(async () => {
                                          try {
                                            const files = await window.electronAPI.syncGetDeletedFiles()
                                            setDeletedFiles(files)
                                            setRestoredFiles(new Set())
                                          } catch { /* ignore */ }
                                        }, 2000)
                                      }
                                    }}
                                  >
                                    {restoredFiles.has(file.path) ? t('settings.sync.deleted.restored') : t('settings.sync.deleted.restore')}
                                  </button>
                                </div>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>

                    <div className="sync-actions">
                      <button
                        className="sync-btn-primary"
                        disabled={syncState.syncStatus !== 'idle' && syncState.syncStatus !== 'done' && syncState.syncStatus !== 'error'}
                        onClick={() => syncState.triggerSync()}
                      >
                        {t('settings.sync.syncNow')}
                      </button>
                      <button
                        className="sync-btn-danger"
                        onClick={async () => {
                          await syncState.disableSync()
                        }}
                      >
                        {t('settings.sync.deactivate')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tägliche Notiz Tab */}
            {activeTab === 'dailyNote' && (
              <div className="settings-section">
                <h3>{t('settings.dailyNote.title')}</h3>
                <p className="settings-hint">{t('settings.dailyNote.description')}</p>

                <div className="settings-row">
                  <label>{t('settings.dailyNote.enabled')}</label>
                  <input
                    type="checkbox"
                    checked={dailyNoteSettings.enabled}
                    onChange={e => setDailyNote({ enabled: e.target.checked })}
                  />
                </div>

                {dailyNoteSettings.enabled && (
                  <>
                    <div className="settings-row">
                      <label>{t('settings.dailyNote.folderPath')}</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="text"
                          value={dailyNoteSettings.folderPath}
                          onChange={e => setDailyNote({ folderPath: e.target.value })}
                          placeholder="Journal"
                          style={{ width: '300px' }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t('settings.dailyNote.folderPathHint')}
                        </span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.dailyNote.template')}</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select
                          value={dailyNoteSettings.templateId}
                          onChange={e => setDailyNote({ templateId: e.target.value })}
                          style={{ width: '300px' }}
                        >
                          <option value="dailyNote">{BUILTIN_LABELS.dailyNote}</option>
                          <option value="zettel">{BUILTIN_LABELS.zettel}</option>
                          <option value="meeting">{BUILTIN_LABELS.meeting}</option>
                          <option value="empty">{BUILTIN_LABELS.empty}</option>
                          {templates.custom.map(ct => (
                            <option key={ct.id} value={ct.id}>{ct.name}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t('settings.dailyNote.templateHint')}
                        </span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.dailyNote.dateFormat')}</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select
                          value={dailyNoteSettings.dateFormat}
                          onChange={e => setDailyNote({ dateFormat: e.target.value })}
                        >
                          <option value="DD.MM.YY">DD.MM.YY (12.03.26)</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD (2026-03-12)</option>
                          <option value="DD-MM-YYYY">DD-MM-YYYY (12-03-2026)</option>
                          <option value="MM-DD-YYYY">MM-DD-YYYY (03-12-2026)</option>
                        </select>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t('settings.dailyNote.dateFormatHint')}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Brain Tab — Lokales Tagesgedächtnis */}
            {activeTab === 'brain' && (
              <div className="settings-section">
                <h3>{t('settings.brain.title')}</h3>
                <p className="settings-hint">{t('settings.brain.description')}</p>

                <div className="settings-info" style={{ marginBottom: '16px' }}>
                  {t('settings.brain.privacyNote')}
                </div>

                <div className="settings-row">
                  <label>{t('settings.brain.folderPath')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input
                      type="text"
                      value={brainSettings.folderPath}
                      onChange={e => setBrain({ folderPath: e.target.value })}
                      placeholder="800 - 🧠 brain"
                      style={{ width: '300px' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {t('settings.brain.folderPathHint')}
                    </span>
                  </div>
                </div>

                <div className="settings-row">
                  <label>{t('settings.brain.autoConsolidate')}</label>
                  <input
                    type="checkbox"
                    checked={brainSettings.autoConsolidateEnabled}
                    onChange={e => setBrain({ autoConsolidateEnabled: e.target.checked })}
                  />
                </div>

                {brainSettings.autoConsolidateEnabled && (
                  <div className="settings-row">
                    <label>{t('settings.brain.autoConsolidateTime')}</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <input
                        type="time"
                        value={brainSettings.autoConsolidateTime || '21:30'}
                        onChange={e => setBrain({ autoConsolidateTime: e.target.value || '21:30' })}
                        style={{ width: '140px' }}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {t('settings.brain.autoConsolidateHint')}
                      </span>
                    </div>
                  </div>
                )}

                <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                  <label>{t('settings.brain.howItWorks')}</label>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '500px' }}>
                    {t('settings.brain.howItWorksBody')}
                  </div>
                </div>
              </div>
            )}

            {/* reMarkable Tab */}
            {activeTab === 'remarkable' && (
              <div className="settings-section">
                <h3>{t('settings.agents.remarkable.title')}</h3>
                <p className="settings-hint">{t('settings.agents.remarkable.description')}</p>
                <ModuleDisabledHint moduleId="remarkable" onGoToModules={() => setActiveTab('modules')} t={t} />

                {remarkableSettings.enabled && (
                  <>
                    <div className="settings-row">
                      <label>{t('settings.agents.remarkable.transport')}</label>
                      <select
                        value={remarkableSettings.transport}
                        onChange={e => setRemarkable({ transport: e.target.value as 'usb' })}
                      >
                        <option value="usb">USB</option>
                      </select>
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.agents.remarkable.autoRefresh')}</label>
                      <input
                        type="checkbox"
                        checked={remarkableSettings.autoRefreshOnOpen}
                        onChange={e => setRemarkable({ autoRefreshOnOpen: e.target.checked })}
                      />
                    </div>

                    <div className="settings-row" style={{ gap: '8px' }}>
                      <button className="settings-btn" onClick={checkRemarkableConnection}>
                        {t('settings.agents.remarkable.testConnection')}
                      </button>
                      {remarkableStatus === 'checking' && (
                        <span className="settings-hint">{t('settings.agents.remarkable.checking')}</span>
                      )}
                      {remarkableStatus === 'connected' && (
                        <span className="status-connected">{t('settings.agents.remarkable.connected')}</span>
                      )}
                      {remarkableStatus === 'disconnected' && (
                        <span className="status-disconnected">{t('settings.agents.remarkable.disconnected')}</span>
                      )}
                    </div>
                    {remarkableError && (
                      <div className="settings-row">
                        <span className="settings-error-detail">{remarkableError}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Email Tab */}
            {activeTab === 'email' && (
              <div className="settings-section">
                {/* Email Integration */}
                <h3>{t('settings.email.title')}</h3>
                <ModuleDisabledHint moduleId="email" onGoToModules={() => setActiveTab('modules')} t={t} />

                {emailSettings.enabled && (
                  <>
                    <div className="settings-info" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', borderLeft: '3px solid #f59e0b' }}>
                      {t('settings.email.warning')}
                    </div>
                    <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                      <label>{t('settings.email.accounts')}</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                        {emailSettings.accounts.map((account, idx) => (
                          <div key={account.id} style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={account.name}
                                onChange={e => {
                                  const updated = [...emailSettings.accounts]
                                  updated[idx] = { ...account, name: e.target.value }
                                  setEmail({ accounts: updated })
                                }}
                                placeholder={t('settings.email.accountName')}
                                style={{ width: '150px' }}
                              />
                              <button
                                className="settings-refresh"
                                style={{ color: 'var(--color-danger)', fontSize: '11px' }}
                                onClick={() => {
                                  const updated = emailSettings.accounts.filter((_, i) => i !== idx)
                                  setEmail({ accounts: updated })
                                }}
                              >
                                {t('settings.email.removeAccount')}
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <input
                                type="text"
                                value={account.host}
                                onChange={e => {
                                  const updated = [...emailSettings.accounts]
                                  updated[idx] = { ...account, host: e.target.value }
                                  setEmail({ accounts: updated })
                                }}
                                placeholder={t('settings.email.host')}
                                style={{ width: '180px' }}
                              />
                              <input
                                type="number"
                                value={account.port}
                                onChange={e => {
                                  const updated = [...emailSettings.accounts]
                                  updated[idx] = { ...account, port: parseInt(e.target.value) || 993 }
                                  setEmail({ accounts: updated })
                                }}
                                placeholder={t('settings.email.port')}
                                style={{ width: '70px' }}
                              />
                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                <input
                                  type="checkbox"
                                  checked={account.tls}
                                  onChange={e => {
                                    const updated = [...emailSettings.accounts]
                                    updated[idx] = { ...account, tls: e.target.checked }
                                    setEmail({ accounts: updated })
                                  }}
                                />
                                {t('settings.email.tls')}
                              </label>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <input
                                type="text"
                                value={account.user}
                                onChange={e => {
                                  const updated = [...emailSettings.accounts]
                                  updated[idx] = { ...account, user: e.target.value }
                                  setEmail({ accounts: updated })
                                }}
                                placeholder={t('settings.email.user')}
                                style={{ width: '180px' }}
                              />
                              <input
                                type="password"
                                value={emailPasswords[account.id] || ''}
                                onChange={e => setEmailPasswords(prev => ({ ...prev, [account.id]: e.target.value }))}
                                onBlur={async () => {
                                  const pw = emailPasswords[account.id]
                                  if (pw) {
                                    await window.electronAPI.emailSavePassword(account.id, pw)
                                  }
                                }}
                                placeholder={t('settings.email.password')}
                                style={{ width: '150px' }}
                              />
                              <button
                                className="settings-refresh"
                                onClick={async () => {
                                  const pw = emailPasswords[account.id]
                                  if (pw) {
                                    await window.electronAPI.emailSavePassword(account.id, pw)
                                  }
                                  setEmailTestStatus(prev => ({ ...prev, [account.id]: 'testing' }))
                                  const result = await window.electronAPI.emailConnect(account)
                                  setEmailTestStatus(prev => ({ ...prev, [account.id]: result.success ? 'success' : 'failed' }))
                                  setTimeout(() => setEmailTestStatus(prev => ({ ...prev, [account.id]: 'idle' })), 3000)
                                }}
                              >
                                {emailTestStatus[account.id] === 'testing' ? '...' :
                                 emailTestStatus[account.id] === 'success' ? t('settings.email.testSuccess') :
                                 emailTestStatus[account.id] === 'failed' ? t('settings.email.testFailed') :
                                 t('settings.email.testConnection')}
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <input
                                type="email"
                                value={account.fromAddress || ''}
                                onChange={e => {
                                  const updated = [...emailSettings.accounts]
                                  updated[idx] = { ...account, fromAddress: e.target.value }
                                  setEmail({ accounts: updated })
                                }}
                                placeholder={t('settings.email.fromAddress')}
                                style={{ width: '250px' }}
                              />
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {t('settings.email.fromAddressHint')}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '40px' }}>SMTP:</span>
                              <input
                                type="text"
                                value={account.smtpHost || ''}
                                onChange={e => {
                                  const updated = [...emailSettings.accounts]
                                  updated[idx] = { ...account, smtpHost: e.target.value }
                                  setEmail({ accounts: updated })
                                }}
                                placeholder={t('settings.email.smtpHost')}
                                style={{ width: '180px' }}
                              />
                              <input
                                type="number"
                                value={account.smtpPort || 587}
                                onChange={e => {
                                  const updated = [...emailSettings.accounts]
                                  updated[idx] = { ...account, smtpPort: parseInt(e.target.value) || 587 }
                                  setEmail({ accounts: updated })
                                }}
                                placeholder={t('settings.email.smtpPort')}
                                style={{ width: '70px' }}
                              />
                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                <input
                                  type="checkbox"
                                  checked={account.smtpTls !== false}
                                  onChange={e => {
                                    const updated = [...emailSettings.accounts]
                                    updated[idx] = { ...account, smtpTls: e.target.checked }
                                    setEmail({ accounts: updated })
                                  }}
                                />
                                TLS
                              </label>
                            </div>
                          </div>
                        ))}
                        <button
                          className="settings-refresh"
                          onClick={() => {
                            const id = `email-${Date.now()}`
                            setEmail({
                              accounts: [...emailSettings.accounts, { id, name: '', host: '', port: 993, user: '', tls: true, smtpHost: '', smtpPort: 587, smtpTls: true, fromAddress: '' }]
                            })
                          }}
                        >
                          + {t('settings.email.addAccount')}
                        </button>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.email.fetchInterval')}</label>
                      <div className="settings-input-group">
                        <select
                          value={emailSettings.fetchIntervalMinutes}
                          onChange={e => setEmail({ fetchIntervalMinutes: parseInt(e.target.value) })}
                        >
                          <option value={5}>5 {t('settings.email.minutes')}</option>
                          <option value={15}>15 {t('settings.email.minutes')}</option>
                          <option value={30}>30 {t('settings.email.minutes')}</option>
                          <option value={60}>60 {t('settings.email.minutes')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.email.instructionNote')}</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="text"
                          value={emailSettings.instructionNotePath}
                          onChange={e => setEmail({ instructionNotePath: e.target.value })}
                          placeholder="z.B. Email-Instruktionen.md"
                          style={{ width: '250px' }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t('settings.email.instructionNoteHint')}
                        </span>
                      </div>
                    </div>
                    <div className="settings-info" style={{ whiteSpace: 'pre-line', fontSize: '11px', lineHeight: '1.5' }}>
                      {t('settings.email.instructionTips')}
                    </div>

                    {vaultPath && <EmailRelevanceRulesSection vaultPath={vaultPath} />}

                    <div className="settings-row">
                      <label>{t('settings.email.inboxFolder')}</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="text"
                          value={emailSettings.inboxFolderName}
                          onChange={e => setEmail({ inboxFolderName: e.target.value })}
                          placeholder="‼️📧 - emails"
                          style={{ width: '250px' }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t('settings.email.inboxFolderHint')}
                        </span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.email.relevanceThreshold')}</label>
                      <div className="settings-input-group" style={{ gap: '8px' }}>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={emailSettings.relevanceThreshold}
                          onChange={e => setEmail({ relevanceThreshold: parseInt(e.target.value) })}
                          style={{ width: '150px' }}
                        />
                        <span style={{ fontSize: '12px', minWidth: '30px' }}>{emailSettings.relevanceThreshold}</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.email.maxPerFetch')}</label>
                      <input
                        type="number"
                        value={emailSettings.maxEmailsPerFetch}
                        onChange={e => setEmail({ maxEmailsPerFetch: parseInt(e.target.value) || 2 })}
                        min={1}
                        max={200}
                        style={{ width: '80px' }}
                      />
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.email.retainDays')}</label>
                      <input
                        type="number"
                        value={emailSettings.retainDays}
                        onChange={e => setEmail({ retainDays: parseInt(e.target.value) || 30 })}
                        min={7}
                        max={365}
                        style={{ width: '80px' }}
                      />
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.email.autoAnalyze')}</label>
                      <input
                        type="checkbox"
                        checked={emailSettings.autoAnalyze}
                        onChange={e => setEmail({ autoAnalyze: e.target.checked })}
                      />
                    </div>

                    <div className="settings-row">
                      <label title={t('settings.email.lowPowerModeHint')}>{t('settings.email.lowPowerMode')}</label>
                      <input
                        type="checkbox"
                        checked={emailSettings.lowPowerMode}
                        onChange={e => setEmail({ lowPowerMode: e.target.checked })}
                      />
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.email.analysisModel')}</label>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <ModelPicker
                          // SENTINEL nur als value zeigen, wenn OpenRouter wirklich verfügbar ist —
                          // sonst (deaktiviert) würde der Picker den Rohwert „__openrouter__" anzeigen.
                          value={emailSettings.analysisModel === OPENROUTER_MODEL_SENTINEL && !isOpenRouterReady(ollama.openrouter)
                            ? '' : emailSettings.analysisModel}
                          placeholder={{ value: '', label: t('settings.email.analysisModelDefault') }}
                          models={[
                            ...(isOpenRouterReady(ollama.openrouter) ? [{ name: OPENROUTER_MODEL_SENTINEL }] : []),
                            ...ollamaModels
                          ]}
                          getLabel={name => name === OPENROUTER_MODEL_SENTINEL
                            ? `OpenRouter · ${ollama.openrouter.model.trim()}`
                            : name}
                          renderMeta={name => {
                            if (name === OPENROUTER_MODEL_SENTINEL) return null
                            const v = getModelVerdict(name, 'task-extraction')
                            return (
                              <span title={v.reasons.join(' · ') || t(`settings.integrations.compatibility.verdict.${v.verdict}` as TranslationKey)}
                                style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: VERDICT_COLOR[v.verdict] }} />
                            )
                          }}
                          onChange={val => {
                            // `analysisModel` ist die EINZIGE autoritative Routing-Quelle (siehe emailStore).
                            // `cloudModules` dient hier NUR als „schon bestätigt"-Merker fürs ⚠️-Confirm —
                            // es steuert NICHT das Routing (sonst laufen zwei States auseinander → Rückfall).
                            if (val === OPENROUTER_MODEL_SENTINEL && !ollama.openrouter.cloudModules.includes('task-extraction')) {
                              const warn = language === 'en'
                                ? 'Email analysis via OpenRouter: email content is sent to OpenRouter (cloud) and leaves your computer. Continue?'
                                : 'E-Mail-Analyse über OpenRouter: Mailinhalte werden an OpenRouter (Cloud) gesendet und verlassen deinen Rechner. Fortfahren?'
                              // eslint-disable-next-line no-alert
                              if (!window.confirm(warn)) return
                              setOllama({ openrouter: { ...ollama.openrouter, cloudModules: [...ollama.openrouter.cloudModules, 'task-extraction'] } })
                            }
                            // Läuft IMMER durch — egal ob Cloud oder lokal. Kein Race möglich.
                            setEmail({ analysisModel: val })
                          }}
                          ariaLabel={t('settings.email.analysisModel')}
                          maxWidth="none"
                          style={{ minWidth: 280 }}
                        />
                        {emailSettings.analysisModel === OPENROUTER_MODEL_SENTINEL ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', background: 'var(--bg-secondary, rgba(0,0,0,0.04))', border: '1px solid var(--border, #e5e7eb)', fontSize: '11px' }}>
                            ☁️ {language === 'en' ? 'Cloud — emails are sent to OpenRouter' : 'Cloud — Mailinhalte gehen an OpenRouter'}
                          </span>
                        ) : emailSettings.analysisModel && (() => {
                          const v = getModelVerdict(emailSettings.analysisModel, 'task-extraction')
                          return (
                            <span
                              title={v.reasons.join(' · ') || t(`settings.integrations.compatibility.verdict.${v.verdict}` as TranslationKey)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                background: 'var(--bg-secondary, rgba(0,0,0,0.04))',
                                border: `1px solid ${VERDICT_COLOR[v.verdict]}`,
                                color: VERDICT_COLOR[v.verdict],
                                fontSize: '11px'
                              }}
                            >
                              {VERDICT_ICON[v.verdict]} {t(`settings.integrations.compatibility.verdict.${v.verdict}` as TranslationKey)}
                              {v.reasons.length > 0 && ` — ${v.reasons[0]}`}
                            </span>
                          )
                        })()}
                        {emailSettings.analysisModel !== OPENROUTER_MODEL_SENTINEL && (
                          <ModelRamWarning model={emailSettings.analysisModel || ollama.selectedModel} />
                        )}
                      </div>
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.email.signature')}</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Signatur-Bild */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            className="settings-refresh"
                            onClick={async () => {
                              if (!vaultPath) return
                              const result = await window.electronAPI.emailSelectSignatureImage(vaultPath)
                              if (result.success && result.path) {
                                setEmail({ signatureImagePath: result.path })
                              }
                            }}
                          >
                            {t('settings.email.selectImage')}
                          </button>
                          {emailSettings.signatureImagePath && (
                            <button
                              className="settings-refresh"
                              style={{ color: 'var(--color-danger)', fontSize: '11px' }}
                              onClick={() => setEmail({ signatureImagePath: '' })}
                            >
                              {t('settings.email.removeImage')}
                            </button>
                          )}
                        </div>
                        {emailSettings.signatureImagePath && (
                          <SignatureImagePreview imagePath={emailSettings.signatureImagePath} />
                        )}
                        {/* Signatur-Text */}
                        <textarea
                          value={emailSettings.signature || ''}
                          onChange={e => setEmail({ signature: e.target.value })}
                          placeholder={t('settings.email.signaturePlaceholder')}
                          style={{ width: '300px', minHeight: '80px', resize: 'vertical', fontFamily: 'inherit', fontSize: '12px' }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t('settings.email.signatureHint')}
                        </span>
                      </div>
                    </div>

                    <div className="settings-info">
                      <p>
                        <strong>E-Mail</strong> {t('settings.email.description')}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {t('settings.email.gmailHint')}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Edoobox Tab */}
            {activeTab === 'agents' && (
              <div className="settings-section">
                <div className="settings-section-header-with-logo">
                  <img src={new URL('../../assets/edoobox-logo.png', import.meta.url).href} alt="edoobox" className="settings-edoobox-logo" />
                </div>
                <p className="settings-hint">{t('settings.agents.edoobox.description')}</p>
                <ModuleDisabledHint moduleId="mz-suite" onGoToModules={() => setActiveTab('modules')} t={t} />

                {edooboxSettings.enabled && (
                  <>
                    <div className="settings-row">
                      <label>{t('settings.agents.edoobox.apiKey')}</label>
                      <input
                        type="password"
                        value={edooboxApiKey}
                        onChange={e => { setEdooboxApiKey(e.target.value); setEdooboxCredsSaved(false) }}
                        placeholder="API Key"
                        className="settings-input"
                      />
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.agents.edoobox.apiSecret')}</label>
                      <input
                        type="password"
                        value={edooboxApiSecret}
                        onChange={e => { setEdooboxApiSecret(e.target.value); setEdooboxCredsSaved(false) }}
                        placeholder="API Secret"
                        className="settings-input"
                      />
                    </div>

                    <div className="settings-row" style={{ gap: '8px' }}>
                      <button
                        className="settings-btn"
                        onClick={async () => {
                          if (edooboxApiKey && edooboxApiSecret) {
                            const saved = await edooboxService.saveCredentials(edooboxApiKey, edooboxApiSecret)
                            setEdooboxCredsSaved(saved)
                          }
                        }}
                      >
                        {edooboxCredsSaved ? t('settings.agents.edoobox.saved') : t('settings.agents.edoobox.save')}
                      </button>
                      <button
                        className="settings-btn"
                        disabled={edooboxTestStatus === 'testing'}
                        onClick={async () => {
                          setEdooboxTestError(null)
                          if (!edooboxApiKey || !edooboxApiSecret) {
                            setEdooboxTestStatus('failed')
                            setEdooboxTestError(t('settings.agents.edoobox.saveFirst'))
                            return
                          }
                          // Save first, then test
                          await edooboxService.saveCredentials(edooboxApiKey, edooboxApiSecret)
                          setEdooboxCredsSaved(true)
                          setEdooboxTestStatus('testing')
                          const result = await edooboxService.check(edooboxSettings.baseUrl, edooboxSettings.apiVersion)
                          setEdooboxTestStatus(result.success ? 'success' : 'failed')
                          setEdooboxTestError(result.success ? null : (result.error || null))
                        }}
                      >
                        {edooboxTestStatus === 'testing'
                          ? t('settings.agents.edoobox.testing')
                          : t('settings.agents.edoobox.testConnection')}
                      </button>
                      {edooboxTestStatus === 'success' && (
                        <span className="status-connected">{t('settings.agents.edoobox.connected')}</span>
                      )}
                      {edooboxTestStatus === 'failed' && (
                        <span className="status-disconnected">{t('settings.agents.edoobox.failed')}</span>
                      )}
                    </div>
                    {edooboxTestError && (
                      <div className="settings-row">
                        <span className="settings-error-detail">{edooboxTestError}</span>
                      </div>
                    )}
                  </>
                )}

                <div className="settings-divider" />

                {/* Generischer Plugin-Settings-Bereich: der Kern nennt KEIN Plugin namentlich,
                    er rendert nur diesen einen Slot. Jede Vertikale (aktuell: Antares) trägt ihre
                    eigene Sektion bei und gated sich selbst auf ihr Modul. Leer nach Löschen des
                    Plugin-Ordners → keine toten Plugin-Einstellungen (Deletion Test). */}
                <PluginSlot slotId="settings.section" props={{ onGoToModules: () => setActiveTab('modules') }} />

                <div className="settings-divider" />

                {/* Marketing (WordPress + Instagram) — Teil des mz-suite Moduls */}
                <h4 className="settings-section-title">{t('settings.agents.marketing.title')}</h4>
                <p className="settings-hint">{t('settings.agents.marketing.description')}</p>

                {marketingSettings.enabled && (
                  <>
                    {/* WordPress */}
                    <h5 className="settings-subsection-title">{t('settings.agents.marketing.wordpress')}</h5>

                    <div className="settings-row">
                      <label>{t('settings.agents.marketing.wpUrl')}</label>
                      <input
                        type="url"
                        value={marketingSettings.wordpressUrl}
                        onChange={e => setMarketing({ wordpressUrl: e.target.value })}
                        placeholder="https://meine-seite.de"
                        className="settings-input"
                      />
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.agents.marketing.wpUser')}</label>
                      <input
                        type="text"
                        value={marketingSettings.wordpressUser}
                        onChange={e => setMarketing({ wordpressUser: e.target.value })}
                        placeholder="admin"
                        className="settings-input"
                      />
                    </div>

                    <div className="settings-row">
                      <label>{t('settings.agents.marketing.wpAppPassword')}</label>
                      <input
                        type="password"
                        value={wpAppPassword}
                        onChange={e => { setWpAppPassword(e.target.value); setWpCredsSaved(false) }}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className="settings-input"
                      />
                    </div>

                    <div className="settings-row" style={{ gap: '8px' }}>
                      <button
                        className="settings-btn"
                        onClick={async () => {
                          if (wpAppPassword) {
                            const saved = await edooboxService.marketingSaveCredentials(wpAppPassword)
                            setWpCredsSaved(saved)
                          }
                        }}
                      >
                        {wpCredsSaved ? t('settings.agents.edoobox.saved') : t('settings.agents.edoobox.save')}
                      </button>
                      <button
                        className="settings-btn"
                        disabled={wpTestStatus === 'testing'}
                        onClick={async () => {
                          setWpTestError(null)
                          if (!wpAppPassword || !marketingSettings.wordpressUrl || !marketingSettings.wordpressUser) {
                            setWpTestStatus('failed')
                            setWpTestError(t('settings.agents.marketing.wpFillAll'))
                            return
                          }
                          await edooboxService.marketingSaveCredentials(wpAppPassword)
                          setWpCredsSaved(true)
                          setWpTestStatus('testing')
                          const result = await edooboxService.marketingCheckWordpress(marketingSettings.wordpressUrl, marketingSettings.wordpressUser)
                          setWpTestStatus(result.success ? 'success' : 'failed')
                          setWpTestError(result.success ? null : (result.error || null))
                        }}
                      >
                        {wpTestStatus === 'testing'
                          ? t('settings.agents.edoobox.testing')
                          : t('settings.agents.edoobox.testConnection')}
                      </button>
                      {wpTestStatus === 'success' && (
                        <span className="status-connected">{t('settings.agents.edoobox.connected')}</span>
                      )}
                      {wpTestStatus === 'failed' && (
                        <span className="status-disconnected">{t('settings.agents.edoobox.failed')}</span>
                      )}
                    </div>
                    {wpTestError && (
                      <div className="settings-row">
                        <span className="settings-error-detail">{wpTestError}</span>
                      </div>
                    )}

                    <div className="settings-row">
                      <label>{t('settings.agents.marketing.defaultStatus')}</label>
                      <select
                        value={marketingSettings.defaultPostStatus}
                        onChange={e => setMarketing({ defaultPostStatus: e.target.value as 'draft' | 'publish' })}
                        className="settings-select"
                      >
                        <option value="draft">{t('settings.agents.marketing.statusDraft')}</option>
                        <option value="publish">{t('settings.agents.marketing.statusPublish')}</option>
                      </select>
                    </div>

                    {/* Google Imagen */}
                    <h5 className="settings-subsection-title">{t('settings.agents.marketing.imagenTitle')}</h5>

                    <div className="settings-row">
                      <label>{t('settings.agents.marketing.imagenApiKey')}</label>
                      <input
                        type="password"
                        value={marketingSettings.googleImagenApiKey}
                        onChange={e => setMarketing({ googleImagenApiKey: e.target.value })}
                        placeholder="AIzaSy..."
                        className="settings-input"
                      />
                    </div>
                  </>
                )}

                <div className="settings-divider" />
                <p className="settings-hint">{t('settings.agents.moreAgents')}</p>
              </div>
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
              <ModulesTab t={t} />
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
