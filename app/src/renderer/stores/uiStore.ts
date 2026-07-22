import { create } from 'zustand'
import type { UpdateInfo } from '../../shared/types'
import type { NoteKindId } from '../utils/noteKind'
import { DEFAULT_OPENROUTER_SETTINGS, DEFAULT_LLMBASE_SETTINGS, type CloudProviderSettings } from '../../shared/llmBackend'
import { toggleTaskFolder } from '../../shared/taskFolderFilter'

type ViewMode = 'editor' | 'split' | 'canvas'
type Theme = 'light' | 'dark' | 'system'
type CanvasViewMode = 'cards'
type FileTreeDisplayMode = 'name' | 'path'  // 'name' = nur Dateiname, 'path' = voller Pfad
type EditorViewMode = 'edit' | 'live-preview' | 'preview'
export interface EditorHeaderActions {
  languageTool: boolean
  pdf: boolean
  remarkable: boolean
  docx: boolean
  wordpress: boolean
}
export type EditorExportKind = 'pdf' | 'docx' | 'remarkable' | 'wordpress'
export interface EditorLastExport {
  kind: EditorExportKind
  at: number // Date.now() des letzten Exports
}
type PdfDisplayMode = 'both' | 'companion-only' | 'pdf-only'  // Anzeige von PDF/Companion im FileTree
type AccentColor = 'ink' | 'blue' | 'orange' | 'green' | 'purple' | 'pink' | 'teal' | 'rose' | 'coral' | 'mauve' | 'mint' | 'lime' | 'gold' | 'terracotta' | 'custom'
export type LLMBackend = 'ollama' | 'lm-studio'
export type Language = 'de' | 'en'
export type IconSet = 'default' | 'minimal' | 'colorful' | 'emoji'
export type UserProfile = 'office' | 'student' | 'researcher' | 'professional' | 'writer' | 'developer' | 'viewer' | null
export type OutlineStyle = 'default' | 'lines' | 'minimal' | 'bullets' | 'dashes'
export type FontFamily = 'system' | 'inter' | 'source-sans' | 'roboto' | 'open-sans' | 'lato' |
  'jetbrains-mono-nerd' | 'fira-code-nerd' | 'hack-nerd' | 'meslo-nerd' | 'cascadia-code-nerd' | 'iosevka-nerd' | 'victor-mono-nerd' | 'agave-nerd'

// Verfügbare Schriftarten
export const FONT_FAMILIES: Record<FontFamily, { name: string; value: string; category: 'sans' | 'nerd' }> = {
  // Sans-Serif Schriften
  system: { name: 'System', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', category: 'sans' },
  inter: { name: 'Inter', value: '"Inter", -apple-system, sans-serif', category: 'sans' },
  'source-sans': { name: 'Source Sans 3', value: '"Source Sans 3", -apple-system, sans-serif', category: 'sans' },
  roboto: { name: 'Roboto', value: '"Roboto", -apple-system, sans-serif', category: 'sans' },
  'open-sans': { name: 'Open Sans', value: '"Open Sans", -apple-system, sans-serif', category: 'sans' },
  lato: { name: 'Lato', value: '"Lato", -apple-system, sans-serif', category: 'sans' },
  // Nerd Fonts (Monospace mit Icons)
  'jetbrains-mono-nerd': { name: 'JetBrainsMono Nerd', value: '"JetBrainsMono Nerd Font", "JetBrainsMono NF", monospace', category: 'nerd' },
  'fira-code-nerd': { name: 'FiraCode Nerd', value: '"FiraCode Nerd Font", "FiraCode NF", monospace', category: 'nerd' },
  'hack-nerd': { name: 'Hack Nerd', value: '"Hack Nerd Font", "Hack NF", monospace', category: 'nerd' },
  'meslo-nerd': { name: 'MesloLG Nerd', value: '"MesloLGS Nerd Font", "MesloLGS NF", monospace', category: 'nerd' },
  'cascadia-code-nerd': { name: 'CaskaydiaCove Nerd', value: '"CaskaydiaCove Nerd Font", "CaskaydiaCove NF", monospace', category: 'nerd' },
  'iosevka-nerd': { name: 'Iosevka Nerd', value: '"Iosevka Nerd Font", "Iosevka NF", monospace', category: 'nerd' },
  'victor-mono-nerd': { name: 'VictorMono Nerd', value: '"VictorMono Nerd Font", "VictorMono NF", monospace', category: 'nerd' },
  'agave-nerd': { name: 'Agave Nerd', value: '"Agave Nerd Font", "AgaveNerdFont", monospace', category: 'nerd' }
}

// Verfügbare UI-Sprachen
export const UI_LANGUAGES: Record<Language, string> = {
  de: 'Deutsch',
  en: 'English'
}

// Verfügbare Übersetzungssprachen
export const AI_LANGUAGES = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'Englisch' },
  { code: 'fr', name: 'Französisch' },
  { code: 'es', name: 'Spanisch' },
  { code: 'it', name: 'Italienisch' }
] as const

export type AILanguageCode = typeof AI_LANGUAGES[number]['code']

// Farbpalette für Akzentfarben
export const ACCENT_COLORS: Record<AccentColor, { name: string; color: string; hover: string }> = {
  // 'ink' key = the theme-aware brand default; recolored to Petrol (App.tsx clears inline
  // overrides for this key → the per-theme CSS accent tokens apply: #10696b light / #3cbfb3 dark).
  ink: { name: 'Petrol (Standard)', color: '#10696b', hover: '#0d5a5c' },
  blue: { name: 'Blau', color: '#0a84ff', hover: '#0070e0' },
  orange: { name: 'Orange', color: '#ff9500', hover: '#e68600' },
  green: { name: 'Grün', color: '#30d158', hover: '#28b84c' },
  purple: { name: 'Violett', color: '#bf5af2', hover: '#a849d6' },
  pink: { name: 'Pink', color: '#ff375f', hover: '#e62e52' },
  teal: { name: 'Türkis', color: '#5ac8fa', hover: '#4ab8e8' },
  rose: { name: 'Rosé', color: '#f472b6', hover: '#ec4899' },
  coral: { name: 'Koralle', color: '#fb7185', hover: '#f43f5e' },
  mauve: { name: 'Malve', color: '#c084fc', hover: '#a855f7' },
  mint: { name: 'Mint', color: '#34d399', hover: '#10b981' },
  lime: { name: 'Limette', color: '#a3e635', hover: '#84cc16' },
  gold: { name: 'Gold', color: '#fbbf24', hover: '#f59e0b' },
  terracotta: { name: 'Terracotta', color: '#d4875a', hover: '#c47a4e' },
  custom: { name: 'Custom', color: '#d4875a', hover: '#c47a4e' }
}

// Hintergrundfarben (Pastelltöne)
export type BackgroundColor = 'default' | 'beige' | 'cream' | 'lavender' | 'mint' | 'blush' | 'sky' | 'peach' | 'sage' | 'rosepetal' | 'blossom' | 'seafoam' | 'pistachio' | 'lemonade' | 'cotton' | 'custom'

export const BACKGROUND_COLORS: Record<BackgroundColor, { name: string; light: string; dark: string }> = {
  default: { name: 'Standard', light: '#ffffff', dark: '#0d0d0d' },
  beige: { name: 'Beige', light: '#f5f0e8', dark: '#1a1814' },
  cream: { name: 'Creme', light: '#faf8f0', dark: '#18170f' },
  lavender: { name: 'Lavendel', light: '#f0eef8', dark: '#141318' },
  mint: { name: 'Mint', light: '#eef8f4', dark: '#121816' },
  blush: { name: 'Rosé', light: '#f8eef0', dark: '#181214' },
  sky: { name: 'Himmel', light: '#eef4f8', dark: '#121518' },
  peach: { name: 'Pfirsich', light: '#f8f2ee', dark: '#181614' },
  sage: { name: 'Salbei', light: '#f0f4ee', dark: '#141612' },
  rosepetal: { name: 'Rosenblatt', light: '#fce4ec', dark: '#1a1215' },
  blossom: { name: 'Kirschblüte', light: '#fdf2f8', dark: '#1a1118' },
  seafoam: { name: 'Meeresschaum', light: '#e8f5f0', dark: '#111815' },
  pistachio: { name: 'Pistazie', light: '#f0f7ee', dark: '#141712' },
  lemonade: { name: 'Limonade', light: '#fefce8', dark: '#191812' },
  cotton: { name: 'Baumwolle', light: '#faf5ff', dark: '#161218' },
  custom: { name: 'Custom', light: '#ffffff', dark: '#0d0d0d' }
}

// Icon Sets für FileTree
export const ICON_SETS: Record<IconSet, { name: string; description: string }> = {
  default: { name: 'Standard', description: 'Klassische Ordner-Icons' },
  minimal: { name: 'Minimal', description: 'Umriss-Icons' },
  colorful: { name: 'Bunt', description: 'Gradient-Icons' },
  emoji: { name: 'Emoji', description: '📁 📄 📕' }
}

// Outline-Styles für Listen
export const OUTLINE_STYLES: Record<OutlineStyle, { name: string; description: string }> = {
  default: { name: 'Standard', description: 'Normale Listen ohne Linien' },
  lines: { name: 'Vertikale Linien', description: 'Mit durchgehenden Linien' },
  minimal: { name: 'Minimal', description: 'Dezente Einrückung' },
  bullets: { name: 'Punkte', description: 'Gefüllte Aufzählungspunkte' },
  dashes: { name: 'Striche', description: 'Gedankenstriche als Marker' }
}

// Folder Color Palette (für Rechtsklick-Menü) - Pastellfarben
export const FOLDER_COLORS = [
  { id: 'default', name: 'Standard', color: '#F5A623' },
  { id: 'red', name: 'Rot', color: '#F4A4A4' },
  { id: 'orange', name: 'Orange', color: '#FBBF7D' },
  { id: 'yellow', name: 'Gelb', color: '#F7E19C' },
  { id: 'green', name: 'Grün', color: '#A8D8A8' },
  { id: 'teal', name: 'Türkis', color: '#9DD5D5' },
  { id: 'blue', name: 'Blau', color: '#A4C8E8' },
  { id: 'purple', name: 'Lila', color: '#C9B3D9' },
  { id: 'pink', name: 'Pink', color: '#F0B8D0' },
  { id: 'gray', name: 'Grau', color: '#B8B8B8' }
]

// Folder Icon Emojis (für Rechtsklick-Menü)
export const FOLDER_ICONS = [
  { id: 'default', emoji: '📁', name: 'Standard' },

  // Archiv & Bibliothek
  { id: 'temple', emoji: '🏛️', name: 'Archiv' },
  { id: 'cabinet', emoji: '🗄️', name: 'Ablage' },
  { id: 'cardbox', emoji: '🗃️', name: 'Kartei' },
  { id: 'inbox', emoji: '📥', name: 'Eingang' },
  { id: 'outbox', emoji: '📤', name: 'Ausgang' },

  // Dokumente & Notizen
  { id: 'books', emoji: '📚', name: 'Bücher' },
  { id: 'book', emoji: '📖', name: 'Buch' },
  { id: 'notebook', emoji: '📓', name: 'Notizbuch' },
  { id: 'memo', emoji: '📝', name: 'Memo' },
  { id: 'pencil', emoji: '✏️', name: 'Stift' },
  { id: 'writing', emoji: '✍️', name: 'Schreiben' },

  // Bildung & Lernen
  { id: 'graduation', emoji: '🎓', name: 'Studium' },
  { id: 'school', emoji: '🏫', name: 'Schule' },
  { id: 'teacher', emoji: '👨‍🏫', name: 'Lehre' },
  { id: 'student', emoji: '👨‍🎓', name: 'Lernen' },
  { id: 'abc', emoji: '🔤', name: 'Sprache' },
  { id: 'abacus', emoji: '🧮', name: 'Rechnen' },
  { id: 'dna', emoji: '🧬', name: 'Biologie' },
  { id: 'atom', emoji: '⚛️', name: 'Physik' },

  // PKM - Wissensmanagement
  { id: 'brain', emoji: '🧠', name: 'Wissen' },
  { id: 'thought', emoji: '💭', name: 'Gedanken' },
  { id: 'bulb', emoji: '💡', name: 'Ideen' },
  { id: 'link', emoji: '🔗', name: 'Verknüpfung' },
  { id: 'puzzle', emoji: '🧩', name: 'Zusammenhang' },
  { id: 'seedling', emoji: '🌱', name: 'Keimling' },
  { id: 'tree', emoji: '🌳', name: 'Ausgearbeitet' },
  { id: 'map', emoji: '🗺️', name: 'Übersicht' },
  { id: 'compass', emoji: '🧭', name: 'Navigation' },

  // Forschung & Projekte
  { id: 'microscope', emoji: '🔬', name: 'Forschung' },
  { id: 'flask', emoji: '🧪', name: 'Experiment' },
  { id: 'telescope', emoji: '🔭', name: 'Exploration' },
  { id: 'target', emoji: '🎯', name: 'Ziel' },
  { id: 'rocket', emoji: '🚀', name: 'Projekt' },
  { id: 'gear', emoji: '⚙️', name: 'System' },
  { id: 'tools', emoji: '🛠️', name: 'Werkzeuge' },

  // Organisation
  { id: 'clipboard', emoji: '📋', name: 'Liste' },
  { id: 'check', emoji: '✅', name: 'Erledigt' },
  { id: 'calendar', emoji: '📅', name: 'Kalender' },
  { id: 'clock', emoji: '🕐', name: 'Zeitlich' },
  { id: 'pin', emoji: '📌', name: 'Angeheftet' },
  { id: 'bookmark', emoji: '🔖', name: 'Lesezeichen' },
  { id: 'label', emoji: '🏷️', name: 'Label' },
  { id: 'search', emoji: '🔍', name: 'Suche' },

  // Bereiche & Kontext
  { id: 'home', emoji: '🏠', name: 'Privat' },
  { id: 'briefcase', emoji: '💼', name: 'Arbeit' },
  { id: 'art', emoji: '🎨', name: 'Kreativ' },
  { id: 'music', emoji: '🎵', name: 'Musik' },
  { id: 'camera', emoji: '📷', name: 'Foto' },
  { id: 'film', emoji: '🎬', name: 'Video' },
  { id: 'globe', emoji: '🌍', name: 'Welt' },
  { id: 'people', emoji: '👥', name: 'Personen' },

  // Kommunikation
  { id: 'speech', emoji: '💬', name: 'Gespräch' },
  { id: 'mail', emoji: '📧', name: 'E-Mail' },
  { id: 'megaphone', emoji: '📢', name: 'Ankündigung' },

  // Markierungen & Status
  { id: 'star', emoji: '⭐', name: 'Favorit' },
  { id: 'sparkles', emoji: '✨', name: 'Neu' },
  { id: 'heart', emoji: '❤️', name: 'Wichtig' },
  { id: 'fire', emoji: '🔥', name: 'Hot' },
  { id: 'gem', emoji: '💎', name: 'Premium' },
  { id: 'lightning', emoji: '⚡', name: 'Schnell' },
  { id: 'warning', emoji: '⚠️', name: 'Achtung' },
  { id: 'lock', emoji: '🔒', name: 'Privat' },
  { id: 'question', emoji: '❓', name: 'Offen' },
  { id: 'recycle', emoji: '♻️', name: 'Wiederholen' }
]

interface PendingTemplateInsert {
  content: string
  cursorPosition?: number
}

// Notiz-Agent Phase 1: „Mit KI bearbeiten" aus dem PDF-Viewer — der Editor hängt
// nach dem Notizwechsel die Datei als Kontext an und öffnet die Macher-Leiste.
// Gleiche Mechanik wie pendingTemplateInsert (Store trägt, Editor konsumiert).
interface PendingAgentContext {
  noteId: string
  relPath: string
}

// LLM AI Settings (Ollama & LM Studio)
interface LLMSettings {
  enabled: boolean
  backend: LLMBackend  // 'ollama' | 'lm-studio'
  selectedModel: string
  defaultTranslateLanguage: AILanguageCode
  lmStudioPort: number  // Default: 1234
  // Pro-Modul-Override: leer = nutze selectedModel.
  // Quelle: shared/modelCompatibility.ts (Stand 2026-05-14).
  moduleModelOverrides: {
    brain: string
    'task-extraction': string
    'mail-summary': string
    'dashboard-snapshot': string
    'smart-connections': string
    'project-status': string
    'note-agent': string
  }
  // Embedding-Modell fürs Projekt-RAG. EIN zentrales Setting — alle Surfaces
  // (Dashboard, NotesChat, Telegram, Workflow, loadProjectContext, Crystallizer)
  // MÜSSEN dasselbe lesen, sonst invalidiert ein Modell-Mismatch den Index bei
  // jedem Cross-Surface-Aufruf (Dauer-Rebuild). Default: bge-m3.
  projectRagEmbeddingModel: string
  // Cloud-Backends (opt-in). Single-Source-Policy in shared/llmBackend.ts.
  // Die API-Keys selbst liegen NICHT hier, sondern verschlüsselt im Main (safeStorage);
  // `hasApiKey` spiegelt nur, ob einer hinterlegt ist.
  openrouter: CloudProviderSettings
  // LLMBase (llmbase.ai) — EU-Inference (DE/NL/FI/CH), DSGVO-Positionierung.
  llmbase: CloudProviderSettings
}

// Brain (lokales Tagesgedächtnis — speichert Tageszusammenfassungen im Vault)
export interface BrainSettings {
  folderPath: string  // Relativer Pfad im Vault, z.B. '800 - 🧠 brain'
  autoConsolidateEnabled: boolean
  autoConsolidateTime: string // HH:mm, lokale Zeit
}

// Smart Connections Gewichtungen (User-konfigurierbar)
export interface SmartConnectionsWeights {
  embedding: number   // Semantische Ähnlichkeit (0-100)
  keyword: number     // Keyword-Match (0-100)
  wikilink: number    // Explizite Wikilinks (0-100)
  tags: number        // Tag-Überlappung (0-100)
  folder: number      // Ordner-Nähe (0-100)
}

// Docling PDF Extraction Settings
export interface DoclingSettings {
  enabled: boolean
  url: string
  ocrEnabled: boolean
  ocrLanguages: string[]
}

// Vision OCR Settings (Ollama Vision Models)
export interface VisionOcrSettings {
  enabled: boolean
  model: string
  pageWidth: number
}

// Readwise Integration Settings
export interface ReadwiseSettings {
  enabled: boolean
  apiKey: string
  syncFolder: string        // Relativer Pfad im Vault, z.B. "500 - 📚 Readwise"
  autoSync: boolean
  autoSyncInterval: number  // Minuten (z.B. 60)
  lastSyncedAt: string      // ISO timestamp für inkrementellen Sync
  syncCategories: {         // Welche Kategorien synchronisiert werden sollen
    books: boolean
    articles: boolean
    tweets: boolean
    podcasts: boolean
    supplementals: boolean
  }
}

// LanguageTool Grammar/Spell Check Settings
export interface LanguageToolIgnoredRule {
  ruleId: string
  text: string  // The ignored text for this rule
}

export interface LanguageToolSettings {
  enabled: boolean
  mode: 'local' | 'api'  // local = Docker, api = LanguageTool API
  url: string  // For local mode
  apiUsername: string  // For Premium API (email)
  apiKey: string  // For API mode (optional for free tier, required for premium)
  language: string  // 'auto', 'de-DE', 'en-US', etc.
  autoCheck: boolean
  autoCheckDelay: number  // ms
  ignoredRules: LanguageToolIgnoredRule[]  // Persisted ignored matches
}

// Email Integration Settings
export interface EmailSettings {
  enabled: boolean
  accounts: Array<{ id: string; name: string; host: string; port: number; user: string; tls: boolean; smtpHost: string; smtpPort: number; smtpTls: boolean; fromAddress: string }>
  fetchIntervalMinutes: number
  instructionNotePath: string
  inboxFolderName: string
  relevanceThreshold: number
  maxEmailsPerFetch: number
  retainDays: number
  autoAnalyze: boolean
  /** Schonmodus für schwache Hardware: Cooldown zwischen Mails bei Batch-Analyse (gegen Überhitzung). */
  lowPowerMode: boolean
  /** Einmaliger Auto-Vorschlag des Schonmodus auf <16-GB-Hardware bereits angewandt (verhindert Re-Override eines bewussten Aus-Schaltens). */
  lowPowerModeAutoApplied: boolean
  analysisModel: string
  signature: string
  signatureImagePath: string
  /** IMAP-Folder pro Account (accountId → Folder-Pfad). Fehlend = 'INBOX'. */
  activeFolders: Record<string, string>
}

// Marketing Settings (WordPress)
export interface MarketingSettings {
  enabled: boolean
  wordpressUrl: string
  wordpressUser: string
  defaultPostStatus: 'draft' | 'publish'
  googleImagenApiKey: string
}

// edoobox Agent Settings
export interface EdooboxSettings {
  enabled: boolean
  baseUrl: string
  apiVersion: 'v1' | 'v2'
  webhookUrl: string
}

// Antares CS (Medienzentrum-Verleih) Settings

export interface ReMarkableSettings {
  enabled: boolean
  transport: 'usb'
  autoRefreshOnOpen: boolean
}

// Defaults für die generisch (pluginConfig) gespeicherten Vertikalen-Configs. Liegen — wie
// ANTARES_DEFAULTS — bewusst im KERN, damit auch die (noch im Kern liegenden) Settings-Tabs
// sie importieren können, ohne aus src/plugins/ zu importieren (Deletion-Test). A-pre Schritt 3.
export const MARKETING_DEFAULTS: MarketingSettings = {
  enabled: false,
  wordpressUrl: '',
  wordpressUser: '',
  defaultPostStatus: 'draft',
  googleImagenApiKey: ''
}
export const EDOOBOX_DEFAULTS: EdooboxSettings = {
  enabled: false,
  baseUrl: 'https://app1.edoobox.com',
  apiVersion: 'v2',
  webhookUrl: ''
}
export const REMARKABLE_DEFAULTS: ReMarkableSettings = {
  enabled: false,
  transport: 'usb',
  autoRefreshOnOpen: true
}

/** Plugin-Ids, deren Config aus einem alten Top-Level-Key in die generische pluginConfig wandert. */
const LEGACY_PLUGIN_CONFIG_IDS = ['antares', 'edoobox', 'marketing', 'remarkable'] as const

/**
 * A-pre Schritt 3: Legacy Top-Level-Configs der Vertikalen (z.B. `settings.edoobox`) einmalig in
 * die generische `pluginConfig.<id>` übernehmen. Pure + getestet. Eine bereits vorhandene
 * pluginConfig.<id> gewinnt (kein Überschreiben). Inklusive edoobox-baseUrl-Normalisierung.
 */
export function migrateLegacyPluginConfig(
  saved: Record<string, unknown>,
  currentPluginConfig: Record<string, Record<string, unknown>>
): Record<string, Record<string, unknown>> {
  const pc: Record<string, Record<string, unknown>> = { ...currentPluginConfig }
  for (const id of LEGACY_PLUGIN_CONFIG_IDS) {
    const legacy = saved[id]
    if (legacy && typeof legacy === 'object' && !pc[id]) {
      pc[id] = { ...(legacy as Record<string, unknown>) }
    }
  }
  // edoobox-baseUrl-Normalisierung (vormals eigener Block): /v1|/v2-Suffix strippen, falsche
  // app2-Migration zurückdrehen, fehlende apiVersion auf v1.
  const edo = pc.edoobox as Partial<EdooboxSettings> | undefined
  if (edo) {
    if (typeof edo.baseUrl === 'string') {
      edo.baseUrl = edo.baseUrl.replace(/\/v[12]$/i, '').replace('app2.edoobox.com', 'app1.edoobox.com')
    }
    if (!edo.apiVersion) edo.apiVersion = 'v1'
  }
  return pc
}

// Daily Note Settings
export interface DailyNoteSettings {
  enabled: boolean
  folderPath: string
  templateId: string  // 'dailyNote' | 'zettel' | 'meeting' | 'empty' | custom template id | '' (= dailyNote)
  dateFormat: string
}

// Vorlauf in Tagen, ab wann eine Aufgabe in den "Bald fällig"-Bucket rückt.
// Mapping: kritisch (#dringend etc.) → critical, sonst → normal.
// `high` ist als Reserve-Stufe für künftige Differenzierung vorhanden.
export interface TaskLeadTime {
  critical: number
  high: number
  normal: number
}


export interface TransportDestination {
  label: string
  folder: string
}

export interface TransportSettings {
  enabled: boolean
  shortcut: string
  destinations: TransportDestination[]
  predefinedTags: string[]
  /** @deprecated Migriert auf defaultDestinationFolder. Nur noch für Rückwärtskompatibilität. */
  defaultDestinationIndex?: number
  defaultDestinationFolder: string   // Pfad zum Ziel-Ordner (aus destinations ODER Vault-Subdir)
  zettelDestinationFolder: string    // Zielordner für Zettel; leer = Auto-Erkennung („zettelkasten"-Ordner)
  showTitlebarButton: boolean
}

// Dashboard Widgets — identifier-basiert, Reihenfolge im Array = Anzeigereihenfolge
export type DashboardWidgetId = 'focus' | 'radar' | 'activity' | 'tasks' | 'emails' | 'calendar' | 'bookings' | 'antares' | 'project-status' | 'sync'

export interface DashboardSettings {
  enabled: boolean
  widgets: DashboardWidgetId[]         // aktive Widgets in Anzeigereihenfolge
  briefingEnabled: boolean             // Morning Briefing beim ersten Öffnen am Tag anzeigen
  briefingIncludeCalendar: boolean
  lastBriefingDate: string             // YYYY-MM-DD; leer = nie gezeigt
  calendarDaysAhead: number            // wie viele Tage Kalender voraus zeigen (default 1)
  radarAiEnabled: boolean              // KI-basierte Relevanz-Analyse pro 🔴 aktivieren
  radarAiRefreshIntervalHours: number  // wie oft wird die KI-Analyse pro Notiz aufgefrischt (1/6/24)
  radarAiModel: string                 // Ollama-Modell für Notiz-Analyse; leer = nutze ollama.selectedModel
}

export const DASHBOARD_ALL_WIDGETS: DashboardWidgetId[] = ['focus', 'radar', 'activity', 'tasks', 'emails', 'calendar', 'bookings', 'antares', 'project-status', 'sync']

const normalizeVaultFolder = (folder: string): string => folder.trim().replace(/^\/+|\/+$/g, '')

// Telegram Bot Settings — nutzt ausschließlich Ollama (lokal oder -cloud-Modelle).
export interface TelegramBotSettings {
  enabled: boolean
  allowedChatIds: string[]      // Whitelist — nur diese Chat-IDs dürfen mit dem Bot reden
  ollamaModel: string            // konkretes Ollama-Modell (lokal oder -cloud)
  briefingIncludeEmails: boolean
  briefingIncludeOverdue: boolean
  priorityFolders: string[]     // Vault-relative Ordnerpfade — Notizen dort werden bei /ask + /inbox bevorzugt
  active: boolean                // true = Bot läuft (wird vom Main-Prozess aus gesetzt/gelesen)
  agentEnabled: boolean         // /agent verfügbar (Tool-Use-Loop)
  agentInboxFolder: string      // Default-Ordner für note_create
  agentMaxIterations: number    // Hard-Limit gegen Loops (1-15)
  agentAllowedTools: string[]   // Tool-Namen, die der Agent benutzen darf
  agentConfirmTools: string[]   // Untermenge — diese erfordern User-Bestätigung
}

// ===== Module-Registry (Kern vs. Plugins) =====
// Kern-Features sind immer aktiv und nicht in dieser Liste.
// Jedes Modul wrapt bestehende uiStore-Flags — der Toggle im Settings-Tab delegiert an diese.
export type ModuleCategory = 'ai' | 'communication' | 'business' | 'learning' | 'research' | 'devices' | 'documents'

export interface ModuleDescriptor {
  id: string
  label: string
  description: string
  category: ModuleCategory
  /** Optional: Markenzeichen/Buchstabe als Icon in der Modul-Liste (z. B. "Z" für Zotero). */
  iconText?: string
  /** Optional: Markenfarbe (Hintergrund des Icon-Badges). */
  iconColor?: string
}

export const MODULE_CATEGORIES: Record<ModuleCategory, string> = {
  ai: 'Lokale KI',
  communication: 'Kommunikation',
  business: 'Business & Automatisierung',
  learning: 'Lernen',
  research: 'Forschung & Wissen',
  devices: 'Geräte',
  documents: 'Dokument-Verarbeitung'
}

export const MODULES: ModuleDescriptor[] = [
  { id: 'notes-chat',       label: 'Notes-Chat',       description: 'Chat mit deinen Notizen als Kontext', category: 'ai' },
  { id: 'smart-connections',label: 'Smart Connections',description: 'Semantisch ähnliche Notizen finden', category: 'ai' },
  { id: 'language-tool',    label: 'LanguageTool',     description: 'Grammatik- und Rechtschreibprüfung im Editor', category: 'ai' },
  { id: 'email',            label: 'Email-Client',     description: 'IMAP/SMTP + KI-Analyse + Entwurfshilfe', category: 'communication' },
  { id: 'workflow-canvas',  label: 'Workflow Canvas',  description: 'Module als verbindbare Bausteine auf einem Canvas — visuelle Prozesse mit lokaler KI', category: 'business' },
  { id: 'flashcards',       label: 'Flashcards & Quiz',description: 'Karteikarten mit Spaced Repetition und Quiz-Modus', category: 'learning' },
  { id: 'semantic-scholar', label: 'Research', description: 'Paper via Semantic Scholar und OpenAlex durchsuchen und zitieren', category: 'research' },
  { id: 'zotero',           label: 'Zotero',           description: 'Bibliothek durchsuchen, Zitate einfügen (⌘⇧Z)', category: 'research', iconText: 'Z', iconColor: '#cc2936' },
  { id: 'readwise',         label: 'Readwise',         description: 'Highlights aus Readwise synchronisieren', category: 'research' },
  { id: 'docling',          label: 'Docling',          description: 'PDF-Textextraktion via Docling-Server', category: 'documents' },
  { id: 'vision-ocr',       label: 'Vision OCR',       description: 'Bilder und Scans per Vision-Modell in Text umwandeln', category: 'documents' },
  { id: 'speech',           label: 'Sprache',          description: 'Vorlesen (TTS) und Diktieren (Whisper, läuft offline in der App) in Editor & Flashcards', category: 'ai' },
  { id: 'project-rag',      label: 'Projekt-RAG',      description: 'Projektordner semantisch befragen — On-demand-Index, Embedding & Antwort lokal', category: 'ai' },
  { id: 'web-research',     label: 'Webrecherche',     description: 'Der Notiz-Agent recherchiert im Web und erstellt eine Notiz mit Quellen — opt-in, eigene Suchmaschine (SearXNG) oder EU-Anbieter (Linkup)', category: 'ai' }
]

export type TtsEngine = 'system' | 'elevenlabs'
export type SttEngine = 'transformers' | 'whisper-cli'
export type TransformersWhisperModel = 'tiny' | 'base' | 'small'

export interface SpeechSettings {
  enabled: boolean
  ttsEngine: TtsEngine       // 'system' = Web Speech API (OS-Stimmen), 'elevenlabs' = Cloud
  ttsVoice: string           // voiceURI aus speechSynthesis.getVoices(); leer = Default
  ttsRate: number            // 0.5 – 2.0 (1.0 = normal)
  ttsPitch: number           // 0.5 – 2.0 (1.0 = normal)
  sttLanguage: string        // Whisper-Sprachcode: 'de', 'en', 'auto'
  sttEngine: SttEngine       // 'transformers' = im Browser via WebGPU/WASM, 'whisper-cli' = lokales CLI (Power-User)
  transformersModel: TransformersWhisperModel  // Modellgröße fürs eingebaute Whisper (tiny ~39MB / base ~80MB / small ~244MB)
  flashcardsAutoPlay: boolean  // Karten automatisch vorlesen beim Wechsel
  whisperCommand: string     // CLI-Befehl; 'auto' = automatisch erkennen (whisper, whisper-cpp, whisper-ctranslate2)
  whisperModel: string       // 'tiny', 'base', 'small', 'medium', 'large'
  // ElevenLabs
  elevenlabsVoiceId: string  // voice_id, leer = kein Voice gewählt
  elevenlabsVoiceName: string // Anzeige-Name (für UI, keine API-Relevanz)
  elevenlabsModel: string    // 'eleven_multilingual_v2' | 'eleven_turbo_v2_5' | 'eleven_flash_v2_5'
  elevenlabsStability: number // 0 – 1
  elevenlabsSimilarity: number // 0 – 1
}

interface UIState {
  // Allgemein
  viewMode: ViewMode
  theme: Theme
  accentColor: AccentColor
  backgroundColor: BackgroundColor
  loadLastVaultOnStart: boolean
  language: Language
  fontFamily: FontFamily

  // Editor Settings
  editorFontSize: number
  editorLineNumbers: boolean
  editorDefaultView: EditorViewMode
  autoSaveInterval: number // in Millisekunden, 0 = deaktiviert
  editorHeadingFolding: boolean // Überschriften auf-/zuklappen
  editorOutlining: boolean // Einrückungsbasiertes Outlining (Listen etc.)
  outlineStyle: OutlineStyle // Outlining-Design: 'default', 'lines', 'minimal', 'bullets', 'dashes'
  editorShowWordCount: boolean // Wort-/Zeichenzähler anzeigen
  editorShowBacklinks: boolean // Backlinks-Bereich unter dem Editor anzeigen
  editorShowContextPanel: boolean // Kontextspalte rechts im Editor (Verknüpft/Ähnlich/Karteikarten)
  editorLastExport: EditorLastExport | null // „Zuletzt"-Gedächtnis des Export-Menüs
  editorHeaderActions: EditorHeaderActions // optionale Aktionen in der Editor-Kopfzeile
  imagesFolder: string // Vault-relativer Ordner für Bild-Drops/Pastes (default '.attachments')

  // UI State
  sidebarWidth: number
  sidebarVisible: boolean
  editorPreviewSplit: boolean
  textSplitEnabled: boolean  // Text-Split: zwei Notizen nebeneinander
  textSplitPosition: number  // Position des Text-Split Dividers (0-100)
  canvasFilterPath: string | null // null = alle anzeigen, sonst Ordnerpfad
  canvasViewMode: CanvasViewMode // 'cards' = Karten mit Titel, 'dots' = Punkte
  canvasShowEdges: boolean // Verbindungslinien anzeigen
  canvasShowTags: boolean // Tags in Karten anzeigen
  canvasShowLinks: boolean // Link-Anzahl in Karten anzeigen
  canvasShowImages: boolean // Bilder in Karten anzeigen
  canvasShowSummaries: boolean // Zusammenfassungen/Callouts in Karten anzeigen
  canvasCompactMode: boolean // Kompakt-Modus: nur Titel anzeigen
  canvasReadMode: boolean // Lese-Modus: Hover-Zoom aktiv, kein Bearbeiten
  canvasHoverScale: number // Hover-Vergrößerung im Lesemodus (1-8)
  canvasDefaultCardWidth: number // Standard-Kartenbreite (150-500)
  splitPosition: number // Prozent für Editor-Breite im Split-Modus (0-100)
  fileTreeDisplayMode: FileTreeDisplayMode // 'name' = nur Dateiname, 'path' = voller Pfad
  fileTreeKindFilter: NoteKindId[]
  notesRootFolder: string // Relativer Pfad im Vault für neue Arbeitsnotizen
  projectsRootFolder: string // Relativer Pfad im Vault für Projekt-Ordner (Crystallizer)
  pendingTemplateInsert: PendingTemplateInsert | null // Template das in Editor eingefügt werden soll
  pendingAgentContext: PendingAgentContext | null // Datei, die der Editor als KI-Kontext anhängen soll

  // LLM AI Settings (Ollama & LM Studio)
  ollama: LLMSettings

  // Brain (lokales Tagesgedächtnis — Phase 1)
  brain: BrainSettings

  // PDF Companion Settings
  pdfCompanionEnabled: boolean  // PDF Companion-Dateien automatisch erstellen
  pdfDisplayMode: PdfDisplayMode  // Anzeige im FileTree: 'both', 'companion-only', 'pdf-only'

  // FileTree Icon Settings
  iconSet: IconSet  // 'default' | 'minimal' | 'colorful' | 'emoji'

  // KI-Features (für ältere Rechner ohne Ollama deaktivierbar)
  smartConnectionsEnabled: boolean
  notesChatEnabled: boolean
  projectRagEnabled: boolean
  flashcardsEnabled: boolean
  workflowCanvasEnabled: boolean
  webResearchEnabled: boolean
  // Spiegel der Main-seitigen Webrecherche-Config (0d) — nur zum Anzeigen in der KI-Leiste
  // (Provider-Tooltip, „konfiguriert?"). NICHT persistiert; wird per IPC geladen/aktualisiert.
  webResearchConfig: { provider: 'tavily' | 'searxng' | 'linkup'; searxngUrl: string; hasTavilyKey: boolean; hasLinkupKey: boolean } | null
  semanticScholarEnabled: boolean
  zoteroEnabled: boolean

  // Sprache (TTS + STT)
  speech: SpeechSettings

  // Task-Zählung: Ordner ausschließen. taskIncludedFolders sind Wieder-Aufnahme-Overrides
  // unterhalb ausgeschlossener Ordner — der tiefste Treffer entscheidet (shared/taskFolderFilter.ts).
  taskExcludedFolders: string[]
  taskIncludedFolders: string[]

  // Smart Connections Gewichtungen
  smartConnectionsWeights: SmartConnectionsWeights

  // Smart Connections Reranker (bge-reranker-v2-m3 via @huggingface/transformers)
  // Wenn an: nach Embedding-Sort werden Top-50 Kandidaten per Cross-Encoder neu sortiert.
  // Erstes Einschalten lädt ~570 MB Modell.
  smartConnectionsRerankerEnabled: boolean

  // Docling PDF Extraction Settings
  docling: DoclingSettings
  // Vision OCR (Ollama Vision Models)
  visionOcr: VisionOcrSettings

  // Readwise Settings
  readwise: ReadwiseSettings

  // LanguageTool Settings
  languageTool: LanguageToolSettings

  // Email Settings
  email: EmailSettings

  // Generische Plugin-Konfiguration (A-pre Schritt 3): pro pluginId ein Settings-Objekt,
  // ohne dass der uiStore die Form eines konkreten Plugins kennt. Antares, edoobox, marketing
  // und remarkable laufen hierüber (state.antares/edoobox/marketing/remarkable.* entfernt).
  pluginConfig: Record<string, Record<string, unknown>>

  // Daily Note Settings
  dailyNote: DailyNoteSettings

  // Migration-Marker: einmalige Resets, die bei bestehenden Usern beim
  // App-Start nachgezogen werden. Aktuell nur ein Eintrag — beim ersten Start
  // nach diesem Build wird editorDefaultView hart auf 'preview' gesetzt
  // (Direktive: Markdown-Editing ist out-of-the-box für niemanden lesbar).
  editorDefaultViewForcedToPreview: boolean
  // einmalige Migration: altes warmes Default-Design (cream/terracotta) → weiß/ink
  appearanceMigratedToLight: boolean

  // Update-Checker & What's New
  lastSeenVersion: string
  updateAvailable: UpdateInfo | null
  whatsNewOpen: boolean

  // Custom Colors
  customAccentColor: string
  customBackgroundColorLight: string
  customBackgroundColorDark: string

  // Custom Logo
  customLogo: string | null

  // System-RAM (GB), beim Start einmal ermittelt. Transient (nicht persisted) — für
  // die Weak-HW-Warnung an den Modell-Pickern. null = noch nicht ermittelt.
  systemTotalRamGb: number | null

  // Onboarding
  onboardingCompleted: boolean
  onboardingOpen: boolean
  /** Transient (nicht persistiert): direkt nach Onboarding-Abschluss die Willkommen-Notiz öffnen */
  welcomeNotePending: boolean
  brainLensActive: boolean
  helpGuideOpen: boolean

  // Slash Commands
  slashCommandDateFormat: string
  slashCommandTimeFormat: string

  // Formatting Toolbar
  showFormattingToolbar: boolean
  showRawEditor: boolean
  /** Einmaliger Hinweis „Lesemodus — Cmd+E zum Schreiben" wurde weggeklickt oder durch Moduswechsel erledigt */
  readingModeHintDismissed: boolean

  // User Profile
  userProfile: UserProfile

  // Actions
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: Theme) => void
  setAccentColor: (color: AccentColor) => void
  setBackgroundColor: (color: BackgroundColor) => void
  setLoadLastVaultOnStart: (value: boolean) => void
  setLanguage: (lang: Language) => void
  setFontFamily: (font: FontFamily) => void
  setEditorFontSize: (size: number) => void
  setEditorLineNumbers: (show: boolean) => void
  setEditorDefaultView: (mode: EditorViewMode) => void
  setAutoSaveInterval: (interval: number) => void
  setEditorHeadingFolding: (enabled: boolean) => void
  setEditorOutlining: (enabled: boolean) => void
  setOutlineStyle: (style: OutlineStyle) => void
  setEditorShowWordCount: (show: boolean) => void
  setEditorShowBacklinks: (show: boolean) => void
  setEditorShowContextPanel: (show: boolean) => void
  setEditorLastExport: (lastExport: EditorLastExport) => void
  setEditorHeaderActions: (settings: Partial<EditorHeaderActions>) => void
  setImagesFolder: (folder: string) => void
  setSidebarWidth: (width: number) => void
  toggleSidebar: () => void
  toggleEditorPreview: () => void
  setTextSplitEnabled: (enabled: boolean) => void
  setTextSplitPosition: (position: number) => void
  setCanvasFilterPath: (path: string | null) => void
  setCanvasViewMode: (mode: CanvasViewMode) => void
  setCanvasShowEdges: (show: boolean) => void
  setCanvasShowTags: (show: boolean) => void
  setCanvasShowLinks: (show: boolean) => void
  setCanvasShowImages: (show: boolean) => void
  setCanvasShowSummaries: (show: boolean) => void
  setCanvasCompactMode: (compact: boolean) => void
  setCanvasReadMode: (read: boolean) => void
  setCanvasHoverScale: (scale: number) => void
  setCanvasDefaultCardWidth: (width: number) => void
  setSplitPosition: (position: number) => void
  setFileTreeDisplayMode: (mode: FileTreeDisplayMode) => void
  setFileTreeKindFilter: (kinds: NoteKindId[]) => void
  toggleFileTreeKindFilter: (kind: NoteKindId) => void
  showOnlyFileTreeKind: (kind: NoteKindId) => void
  setNotesRootFolder: (folder: string) => void
  setProjectsRootFolder: (folder: string) => void
  setPendingTemplateInsert: (template: PendingTemplateInsert | null) => void
  setPendingAgentContext: (ctx: PendingAgentContext | null) => void
  setOllama: (settings: Partial<LLMSettings>) => void
  setBrain: (settings: Partial<BrainSettings>) => void
  setPdfCompanionEnabled: (enabled: boolean) => void
  setPdfDisplayMode: (mode: PdfDisplayMode) => void
  setIconSet: (set: IconSet) => void
  setSmartConnectionsEnabled: (enabled: boolean) => void
  setNotesChatEnabled: (enabled: boolean) => void
  setProjectRagEnabled: (enabled: boolean) => void
  setFlashcardsEnabled: (enabled: boolean) => void
  setWorkflowCanvasEnabled: (enabled: boolean) => void
  setWebResearchEnabled: (enabled: boolean) => void
  setWebResearchConfig: (config: { provider: 'tavily' | 'searxng' | 'linkup'; searxngUrl: string; hasTavilyKey: boolean; hasLinkupKey: boolean } | null) => void
  setSemanticScholarEnabled: (enabled: boolean) => void
  setZoteroEnabled: (enabled: boolean) => void
  setSpeech: (settings: Partial<SpeechSettings>) => void
  toggleTaskExcludedFolder: (folderPath: string) => void
  setSmartConnectionsWeights: (weights: Partial<SmartConnectionsWeights>) => void
  setSmartConnectionsRerankerEnabled: (enabled: boolean) => void
  setDocling: (settings: Partial<DoclingSettings>) => void
  setVisionOcr: (settings: Partial<VisionOcrSettings>) => void
  setReadwise: (settings: Partial<ReadwiseSettings>) => void
  setLanguageTool: (settings: Partial<LanguageToolSettings>) => void
  setEmail: (settings: Partial<EmailSettings>) => void
  /** Generischer Patch-Setter für die Plugin-Config eines pluginId (A-pre Schritt 3). */
  setPluginConfig: (pluginId: string, patch: Record<string, unknown>) => void
  /** Setzt einen manifest-deklarierten Boolean-Pfad, ohne eine Plugin-ID im Kern zu kennen. */
  setBooleanSettingPath: (path: string, value: boolean) => void
  setDailyNote: (settings: Partial<DailyNoteSettings>) => void
  setLastSeenVersion: (version: string) => void
  setUpdateAvailable: (info: UpdateInfo | null) => void
  setWhatsNewOpen: (open: boolean) => void
  setCustomAccentColor: (color: string) => void
  setCustomBackgroundColorLight: (color: string) => void
  setCustomBackgroundColorDark: (color: string) => void
  setCustomLogo: (logo: string | null) => void
  removeCustomLogo: () => void
  setOnboardingCompleted: (completed: boolean) => void
  setOnboardingOpen: (open: boolean) => void
  setWelcomeNotePending: (pending: boolean) => void
  setBrainLensActive: (active: boolean) => void
  setSystemTotalRamGb: (gb: number | null) => void
  setHelpGuideOpen: (open: boolean) => void
  setSlashCommandDateFormat: (format: string) => void
  setSlashCommandTimeFormat: (format: string) => void
  setShowFormattingToolbar: (show: boolean) => void
  setReadingModeHintDismissed: (dismissed: boolean) => void
  setShowRawEditor: (show: boolean) => void
  setUserProfile: (profile: UserProfile) => void
  applyProfileDefaults: (profile: UserProfile) => void

  // Transport (Quick Capture)
  transport: TransportSettings
  setTransport: (settings: Partial<TransportSettings>) => void

  dashboard: DashboardSettings
  setDashboard: (settings: Partial<DashboardSettings>) => void

  // Telegram Bot
  telegramBot: TelegramBotSettings
  setTelegramBot: (settings: Partial<TelegramBotSettings>) => void

  // Aufgaben-Vorlauf (Lead Time)
  taskLeadTime: TaskLeadTime
  setTaskLeadTime: (settings: Partial<TaskLeadTime>) => void

  // Quick-Event-Modal (transient)
  quickEventModalOpen: boolean
  setQuickEventModalOpen: (open: boolean) => void
}

// Default-Werte für den Store
const defaultState = {
  // Allgemein
  viewMode: 'split' as ViewMode,
  theme: 'system' as Theme,
  accentColor: 'ink' as AccentColor,
  backgroundColor: 'default' as BackgroundColor,
  loadLastVaultOnStart: true,
  language: 'de' as Language,
  fontFamily: 'system' as FontFamily,

  // Editor Settings
  editorFontSize: 15,
  editorLineNumbers: true,
  editorDefaultView: 'preview' as EditorViewMode,
  autoSaveInterval: 500,
  editorHeadingFolding: false,
  editorOutlining: false,
  outlineStyle: 'default' as OutlineStyle,
  editorShowWordCount: true,
  editorShowBacklinks: true,
  editorShowContextPanel: true,
  editorLastExport: null as EditorLastExport | null,
  editorHeaderActions: {
    languageTool: true,
    pdf: true,
    remarkable: true,
    docx: true,
    wordpress: true
  } as EditorHeaderActions,
  imagesFolder: '.attachments',

  // UI State
  sidebarWidth: 250,
  sidebarVisible: true,
  editorPreviewSplit: true,
  textSplitEnabled: false,
  textSplitPosition: 50,
  canvasFilterPath: null as string | null,
  canvasViewMode: 'cards' as CanvasViewMode,
  canvasShowEdges: true,
  canvasShowTags: false,
  canvasShowLinks: true,
  canvasShowImages: true,
  canvasShowSummaries: true,
  canvasCompactMode: false,
  canvasReadMode: false,
  canvasHoverScale: 3.6,
  canvasDefaultCardWidth: 280, // Standard: 280px
  splitPosition: 50,
  fileTreeDisplayMode: 'name' as FileTreeDisplayMode,
  fileTreeKindFilter: ['problem', 'solution', 'info'] as NoteKindId[],
  notesRootFolder: '',
  projectsRootFolder: '',
  pendingTemplateInsert: null as PendingTemplateInsert | null,
  pendingAgentContext: null as PendingAgentContext | null,

  // LLM AI Settings (Ollama & LM Studio)
  ollama: {
    enabled: true,
    backend: 'ollama' as LLMBackend,
    selectedModel: '',
    defaultTranslateLanguage: 'en' as AILanguageCode,
    lmStudioPort: 1234,
    moduleModelOverrides: {
      brain: '',
      'task-extraction': '',
      'mail-summary': '',
      'dashboard-snapshot': '',
      'smart-connections': '',
      'project-status': '',
      'note-agent': ''
    },
    projectRagEmbeddingModel: 'bge-m3',
    openrouter: { ...DEFAULT_OPENROUTER_SETTINGS },
    llmbase: { ...DEFAULT_LLMBASE_SETTINGS }
  },

  // Brain (lokales Tagesgedächtnis)
  brain: {
    folderPath: '800 - 🧠 brain',
    autoConsolidateEnabled: true,
    autoConsolidateTime: '21:30'
  } as BrainSettings,

  // PDF Companion Settings
  pdfCompanionEnabled: true,
  pdfDisplayMode: 'companion-only' as PdfDisplayMode,

  // FileTree Icon Settings
  iconSet: 'default' as IconSet,

  // Task-Zählung: Ordner ausschließen
  taskExcludedFolders: [] as string[],
  taskIncludedFolders: [] as string[],

  // KI-Features (opt-in - Human in the Loop)
  smartConnectionsEnabled: false,
  notesChatEnabled: false,
  projectRagEnabled: false,
  flashcardsEnabled: true,
  workflowCanvasEnabled: false,
  webResearchEnabled: false,
  webResearchConfig: null,
  semanticScholarEnabled: true,
  zoteroEnabled: true,

  // Sprache (TTS + STT) - opt-in, standardmäßig aus
  speech: {
    enabled: false,
    ttsEngine: 'system',
    ttsVoice: '',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    sttLanguage: 'de',
    sttEngine: 'transformers',
    transformersModel: 'base',
    flashcardsAutoPlay: false,
    whisperCommand: 'auto',
    whisperModel: 'base',
    elevenlabsVoiceId: '',
    elevenlabsVoiceName: '',
    elevenlabsModel: 'eleven_multilingual_v2',
    elevenlabsStability: 0.5,
    elevenlabsSimilarity: 0.75
  } as SpeechSettings,

  // Smart Connections Gewichtungen (Summe sollte 100 ergeben)
  smartConnectionsWeights: {
    embedding: 50,   // Semantische Ähnlichkeit
    keyword: 30,     // Keyword-Match
    wikilink: 10,    // Explizite Wikilinks
    tags: 10,        // Tag-Überlappung
    folder: 0        // Ordner-Nähe (default: 0)
  },

  smartConnectionsRerankerEnabled: false,

  // Docling PDF Extraction Settings
  docling: {
    enabled: false,
    url: 'http://localhost:5001',
    ocrEnabled: false,
    ocrLanguages: ['de', 'en']
  },

  // Vision OCR Settings
  visionOcr: {
    enabled: false,
    model: '',
    pageWidth: 800
  },

  // Readwise Settings
  readwise: {
    enabled: false,
    apiKey: '',
    syncFolder: '500 - 📚 Readwise',
    autoSync: false,
    autoSyncInterval: 60,
    lastSyncedAt: '',
    syncCategories: {
      books: true,
      articles: true,
      tweets: false,
      podcasts: true,
      supplementals: false
    }
  },

  // LanguageTool Settings
  languageTool: {
    enabled: false,
    mode: 'local' as const,
    url: 'http://localhost:8010',
    apiUsername: '',
    apiKey: '',
    language: 'auto',
    autoCheck: false,
    autoCheckDelay: 1500,
    ignoredRules: []
  },

  // Email Settings
  email: {
    enabled: false,
    accounts: [],
    fetchIntervalMinutes: 15,
    instructionNotePath: '',
    inboxFolderName: '‼️📧 - emails',
    relevanceThreshold: 30,
    maxEmailsPerFetch: 2, // konservativ: kleine Analyse-Batches → schwache Hardware (8 GB) steigt nicht aus. Power-User hochsetzen.
    retainDays: 30,
    autoAnalyze: true,
    lowPowerMode: false,
    lowPowerModeAutoApplied: false,
    analysisModel: '',
    signature: '',
    signatureImagePath: '',
    activeFolders: {}
  },

  // Generische Plugin-Config (A-pre Schritt 3) — antares/edoobox/marketing/remarkable leben hier
  // (pluginConfig.<id>), Defaults im Kern (ANTARES_DEFAULTS / EDOOBOX_DEFAULTS / …).
  pluginConfig: {},

  // Daily Note
  dailyNote: {
    enabled: true,
    folderPath: '',
    templateId: 'dailyNote',
    dateFormat: 'DD.MM.YY'
  },

  // Update-Checker & What's New
  editorDefaultViewForcedToPreview: false,
  appearanceMigratedToLight: false,
  lastSeenVersion: '',
  updateAvailable: null as UpdateInfo | null,
  whatsNewOpen: false,

  // Custom Colors
  customAccentColor: '#d4875a',
  customBackgroundColorLight: '#ffffff',
  customBackgroundColorDark: '#0d0d0d',

  // Custom Logo
  customLogo: null as string | null,

  // Onboarding
  onboardingCompleted: false,
  onboardingOpen: false,
  welcomeNotePending: false,
  brainLensActive: false,
  systemTotalRamGb: null,
  helpGuideOpen: false,

  // Slash Commands
  slashCommandDateFormat: 'DD.MM.YYYY',
  slashCommandTimeFormat: 'HH:mm',

  // Formatting Toolbar
  showFormattingToolbar: false,
  showRawEditor: false,
  readingModeHintDismissed: false,

  // User Profile
  userProfile: null as UserProfile,

  // Transport (Quick Capture)
  transport: {
    enabled: true,
    shortcut: 'CommandOrControl+Shift+N',
    destinations: [
      { label: 'Inbox', folder: '00 - Inbox' }
    ],
    predefinedTags: ['idee', 'todo', 'frage', 'wichtig'],
    defaultDestinationFolder: '00 - Inbox',
    zettelDestinationFolder: '',
    showTitlebarButton: true
  } as TransportSettings,

  // Dashboard
  dashboard: {
    enabled: true,
    widgets: ['focus', 'radar', 'activity', 'tasks', 'emails', 'calendar', 'bookings', 'antares', 'project-status'],
    briefingEnabled: true,
    briefingIncludeCalendar: true,
    lastBriefingDate: '',
    calendarDaysAhead: 1,
    radarAiEnabled: true,
    radarAiRefreshIntervalHours: 6,
    radarAiModel: ''
  } as DashboardSettings,

  // Telegram Bot
  telegramBot: {
    enabled: false,
    allowedChatIds: [],
    ollamaModel: '',
    briefingIncludeEmails: true,
    briefingIncludeOverdue: true,
    priorityFolders: [],
    active: false,
    agentEnabled: false,
    agentInboxFolder: '000 - 📥 inbox/010 - 📥 Notes',
    agentMaxIterations: 8,
    agentAllowedTools: ['note_search', 'note_read', 'task_list', 'calendar_list'],
    agentConfirmTools: ['note_create', 'note_append', 'task_toggle']
  } as TelegramBotSettings,

  // Aufgaben-Vorlauf
  taskLeadTime: {
    critical: 7,
    high: 3,
    normal: 1
  } as TaskLeadTime,

  // Quick-Event-Modal (transient — nicht persisted)
  quickEventModalOpen: false
}

// Felder die persistiert werden sollen (keine Funktionen, keine transienten Werte)
const persistedKeys = [
  'viewMode', 'theme', 'accentColor', 'backgroundColor', 'loadLastVaultOnStart',
  'language', 'fontFamily', 'editorFontSize', 'editorLineNumbers', 'editorDefaultView',
  'autoSaveInterval', 'editorHeadingFolding', 'editorOutlining', 'outlineStyle', 'editorShowWordCount', 'editorShowBacklinks', 'editorShowContextPanel', 'editorLastExport', 'editorHeaderActions', 'imagesFolder',
  'sidebarWidth', 'sidebarVisible', 'editorPreviewSplit', 'textSplitEnabled', 'textSplitPosition',
  'canvasFilterPath', 'canvasViewMode', 'canvasShowEdges', 'canvasShowTags', 'canvasShowLinks', 'canvasShowImages', 'canvasShowSummaries',
  'canvasCompactMode', 'canvasReadMode', 'canvasHoverScale', 'canvasDefaultCardWidth', 'splitPosition', 'fileTreeDisplayMode', 'fileTreeKindFilter', 'notesRootFolder', 'projectsRootFolder', 'ollama', 'brain',
  'pdfCompanionEnabled', 'pdfDisplayMode', 'iconSet',
  'smartConnectionsEnabled', 'notesChatEnabled', 'projectRagEnabled', 'flashcardsEnabled', 'workflowCanvasEnabled', 'webResearchEnabled', 'semanticScholarEnabled', 'zoteroEnabled', 'smartConnectionsWeights', 'smartConnectionsRerankerEnabled', 'docling', 'visionOcr', 'readwise', 'languageTool', 'email', 'pluginConfig', 'dailyNote', 'taskExcludedFolders', 'taskIncludedFolders', 'speech',
  'editorDefaultViewForcedToPreview',
  'appearanceMigratedToLight',
  'lastSeenVersion',
  'customAccentColor', 'customBackgroundColorLight', 'customBackgroundColorDark',
  'customLogo',
  'onboardingCompleted',
  'userProfile',
  'slashCommandDateFormat',
  'slashCommandTimeFormat',
  'showFormattingToolbar',
  'showRawEditor',
  'readingModeHintDismissed',
  'transport',
  'dashboard',
  'telegramBot',
  'taskLeadTime'
] as const

export const useUIStore = create<UIState>()((set, get) => ({
  ...defaultState,

  // Actions
  setViewMode: (mode) => set({ viewMode: mode }),
  setTheme: (theme) => set({ theme }),
  setAccentColor: (color) => set({ accentColor: color }),
  setBackgroundColor: (color) => set({ backgroundColor: color }),
  setLoadLastVaultOnStart: (value) => set({ loadLastVaultOnStart: value }),
  setLanguage: (lang) => {
    set({ language: lang })
    window.electronAPI.setMainLanguage(lang)
  },
  setFontFamily: (font) => set({ fontFamily: font }),
  setEditorFontSize: (size) => set({ editorFontSize: Math.max(10, Math.min(24, size)) }),
  setEditorLineNumbers: (show) => set({ editorLineNumbers: show }),
  setEditorDefaultView: (mode) => set({ editorDefaultView: mode }),
  setAutoSaveInterval: (interval) => set({ autoSaveInterval: interval }),
  setEditorHeadingFolding: (enabled) => set({ editorHeadingFolding: enabled }),
  setEditorOutlining: (enabled) => set({ editorOutlining: enabled }),
  setOutlineStyle: (style) => set({ outlineStyle: style }),
  setEditorShowWordCount: (show) => set({ editorShowWordCount: show }),
  setEditorShowBacklinks: (show) => set({ editorShowBacklinks: show }),
  setEditorShowContextPanel: (show) => set({ editorShowContextPanel: show }),
  setEditorLastExport: (lastExport) => set({ editorLastExport: lastExport }),
  setEditorHeaderActions: (settings) => set((state) => ({
    editorHeaderActions: { ...state.editorHeaderActions, ...settings }
  })),
  setImagesFolder: (folder) => set({ imagesFolder: folder }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleEditorPreview: () => set((state) => ({ editorPreviewSplit: !state.editorPreviewSplit })),
  setTextSplitEnabled: (enabled) => set({ textSplitEnabled: enabled }),
  setTextSplitPosition: (position) => set({ textSplitPosition: Math.max(20, Math.min(80, position)) }),
  setCanvasFilterPath: (path) => set({ canvasFilterPath: path }),
  setCanvasViewMode: (mode) => set({ canvasViewMode: mode }),
  setCanvasShowEdges: (show: boolean) => set({ canvasShowEdges: show }),
  setCanvasShowTags: (show: boolean) => set({ canvasShowTags: show }),
  setCanvasShowLinks: (show: boolean) => set({ canvasShowLinks: show }),
  setCanvasShowImages: (show: boolean) => set({ canvasShowImages: show }),
  setCanvasShowSummaries: (show: boolean) => set({ canvasShowSummaries: show }),
  setCanvasCompactMode: (compact: boolean) => set({ canvasCompactMode: compact }),
  setCanvasReadMode: (read: boolean) => set({ canvasReadMode: read }),
  setCanvasHoverScale: (scale: number) => set({ canvasHoverScale: Math.max(1, Math.min(8, scale)) }),
  setCanvasDefaultCardWidth: (width) => set({ canvasDefaultCardWidth: Math.max(150, Math.min(500, width)) }),
  setSplitPosition: (position) => set({ splitPosition: Math.max(20, Math.min(80, position)) }),
  setFileTreeDisplayMode: (mode) => set({ fileTreeDisplayMode: mode }),
  setFileTreeKindFilter: (kinds) => set({ fileTreeKindFilter: kinds }),
  toggleFileTreeKindFilter: (kind) => set((state) => {
    const current = state.fileTreeKindFilter
    if (current.length === 1 && current.includes(kind)) {
      return { fileTreeKindFilter: ['problem', 'solution', 'info'] }
    }
    const next = current.includes(kind)
      ? current.filter(k => k !== kind)
      : [...current, kind]
    return { fileTreeKindFilter: next }
  }),
  showOnlyFileTreeKind: (kind) => set({ fileTreeKindFilter: [kind] }),
  setNotesRootFolder: (folder) => set((state) => {
    const notesRootFolder = normalizeVaultFolder(folder)
    if (!notesRootFolder) return { notesRootFolder }

    return {
      notesRootFolder,
      transport: {
        ...state.transport,
        defaultDestinationFolder: notesRootFolder
      }
    }
  }),
  setProjectsRootFolder: (folder) => set({ projectsRootFolder: normalizeVaultFolder(folder) }),
  setPendingTemplateInsert: (template) => set({ pendingTemplateInsert: template }),
  setPendingAgentContext: (ctx) => set({ pendingAgentContext: ctx }),
  setOllama: (settings) => set((state) => ({ ollama: { ...state.ollama, ...settings } })),
  setBrain: (settings) => set((state) => ({ brain: { ...state.brain, ...settings } })),
  setPdfCompanionEnabled: (enabled) => set({ pdfCompanionEnabled: enabled }),
  setPdfDisplayMode: (mode) => set({ pdfDisplayMode: mode }),
  setIconSet: (iconSet) => set({ iconSet }),
  setSmartConnectionsEnabled: (enabled) => set({ smartConnectionsEnabled: enabled }),
  setNotesChatEnabled: (enabled) => set({ notesChatEnabled: enabled }),
  setProjectRagEnabled: (enabled) => set({ projectRagEnabled: enabled }),
  setFlashcardsEnabled: (enabled) => set({ flashcardsEnabled: enabled }),
  setWorkflowCanvasEnabled: (enabled) => set({ workflowCanvasEnabled: enabled }),
  setWebResearchEnabled: (enabled) => set({ webResearchEnabled: enabled }),
  setWebResearchConfig: (config) => set({ webResearchConfig: config }),
  setSpeech: (settings) => set((state) => ({ speech: { ...state.speech, ...settings } })),
  toggleTaskExcludedFolder: (folderPath) => set((state) => {
    // Kippt den EFFEKTIVEN Zustand des Ordners — ein via Eltern ausgeschlossener
    // Unterordner bekommt einen Include-Override statt (wie früher) fälschlich
    // einen zusätzlichen Exclude-Eintrag.
    const next = toggleTaskFolder(folderPath, state.taskExcludedFolders, state.taskIncludedFolders)
    return { taskExcludedFolders: next.excluded, taskIncludedFolders: next.included }
  }),
  setSemanticScholarEnabled: (enabled) => set({ semanticScholarEnabled: enabled }),
  setZoteroEnabled: (enabled) => set({ zoteroEnabled: enabled }),
  setSmartConnectionsWeights: (weights) => set((state) => ({
    smartConnectionsWeights: { ...state.smartConnectionsWeights, ...weights }
  })),
  setSmartConnectionsRerankerEnabled: (enabled) => set({ smartConnectionsRerankerEnabled: enabled }),
  setDocling: (settings) => set((state) => ({
    docling: { ...state.docling, ...settings }
  })),
  setVisionOcr: (settings) => set((state) => ({
    visionOcr: { ...state.visionOcr, ...settings }
  })),
  setReadwise: (settings) => set((state) => ({
    readwise: { ...state.readwise, ...settings }
  })),
  setLanguageTool: (settings) => set((state) => ({
    languageTool: { ...state.languageTool, ...settings }
  })),
  setEmail: (settings) => set((state) => ({
    email: { ...state.email, ...settings }
  })),

  setPluginConfig: (pluginId, patch) => set((state) => ({
    pluginConfig: {
      ...state.pluginConfig,
      [pluginId]: { ...(state.pluginConfig[pluginId] ?? {}), ...patch }
    }
  })),
  setBooleanSettingPath: (path, value) => set((state) => {
    const keys = path.split('.')
    if (keys.length < 2 || keys.some((key) => !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(key))) return {}
    const root = keys[0] as keyof UIState
    const currentRoot = state[root]
    if (!currentRoot || typeof currentRoot !== 'object' || Array.isArray(currentRoot)) return {}

    const nextRoot = { ...(currentRoot as Record<string, unknown>) }
    let cursor = nextRoot
    for (let i = 1; i < keys.length - 1; i++) {
      const current = cursor[keys[i]]
      const next = current && typeof current === 'object' && !Array.isArray(current)
        ? { ...(current as Record<string, unknown>) }
        : {}
      cursor[keys[i]] = next
      cursor = next
    }
    cursor[keys[keys.length - 1]] = value
    return { [root]: nextRoot } as Partial<UIState>
  }),
  setDailyNote: (settings) => set((state) => ({
    dailyNote: { ...state.dailyNote, ...settings }
  })),
  setLastSeenVersion: (version) => set({ lastSeenVersion: version }),
  setUpdateAvailable: (info) => set({ updateAvailable: info }),
  setWhatsNewOpen: (open) => set({ whatsNewOpen: open }),
  setCustomAccentColor: (color) => set({ customAccentColor: color }),
  setCustomBackgroundColorLight: (color) => set({ customBackgroundColorLight: color }),
  setCustomBackgroundColorDark: (color) => set({ customBackgroundColorDark: color }),
  setCustomLogo: (logo) => set({ customLogo: logo }),
  removeCustomLogo: () => set({ customLogo: null }),
  setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
  setOnboardingOpen: (open) => set({ onboardingOpen: open }),
  setWelcomeNotePending: (pending) => set({ welcomeNotePending: pending }),
  setBrainLensActive: (active) => set({ brainLensActive: active }),
  setSystemTotalRamGb: (gb) => set({ systemTotalRamGb: gb }),
  setHelpGuideOpen: (open) => set({ helpGuideOpen: open }),
  setSlashCommandDateFormat: (format) => set({ slashCommandDateFormat: format }),
  setSlashCommandTimeFormat: (format) => set({ slashCommandTimeFormat: format }),
  setShowFormattingToolbar: (show) => set({ showFormattingToolbar: show }),
  setShowRawEditor: (show) => set({ showRawEditor: show }),
  setReadingModeHintDismissed: (dismissed) => set({ readingModeHintDismissed: dismissed }),
  setUserProfile: (profile) => set({ userProfile: profile }),
  setTransport: (settings) => set((state) => ({
    transport: { ...state.transport, ...settings }
  })),
  setDashboard: (settings) => set((state) => ({
    dashboard: { ...state.dashboard, ...settings }
  })),
  setTelegramBot: (settings) => set((state) => ({
    telegramBot: { ...state.telegramBot, ...settings }
  })),
  setTaskLeadTime: (settings) => set((state) => ({
    taskLeadTime: { ...state.taskLeadTime, ...settings }
  })),
  setQuickEventModalOpen: (open) => set({ quickEventModalOpen: open }),
  applyProfileDefaults: (profile) => {
    if (!profile) return
    switch (profile) {
      case 'office':
        set({
          flashcardsEnabled: false,
          pdfCompanionEnabled: false,
          smartConnectionsEnabled: false,
          notesChatEnabled: true,
          editorDefaultView: 'preview' as EditorViewMode,
          showFormattingToolbar: true,
          showRawEditor: false,
          email: { ...get().email, enabled: true },
          dashboard: { ...get().dashboard, enabled: true }
        })
        break
      case 'student':
        set({
          flashcardsEnabled: true,
          pdfCompanionEnabled: true,
          smartConnectionsEnabled: false,
          notesChatEnabled: true,
          visionOcr: { ...get().visionOcr, enabled: true },
          editorDefaultView: 'preview' as EditorViewMode,
          showFormattingToolbar: true,
          showRawEditor: false
        })
        break
      case 'researcher':
        set({
          flashcardsEnabled: true,
          pdfCompanionEnabled: true,
          semanticScholarEnabled: true,
          zoteroEnabled: true,
          smartConnectionsEnabled: false,
          notesChatEnabled: true,
          visionOcr: { ...get().visionOcr, enabled: true },
          editorDefaultView: 'preview' as EditorViewMode
        })
        break
      case 'professional':
        set({
          flashcardsEnabled: false,
          pdfCompanionEnabled: false,
          smartConnectionsEnabled: false,
          notesChatEnabled: true,
          editorDefaultView: 'preview' as EditorViewMode
        })
        break
      case 'writer':
        set({
          flashcardsEnabled: false,
          smartConnectionsEnabled: false,
          notesChatEnabled: true,
          showFormattingToolbar: true,
          editorShowWordCount: true,
          editorDefaultView: 'preview' as EditorViewMode
        })
        break
      case 'developer':
        set({
          flashcardsEnabled: false,
          smartConnectionsEnabled: true,
          notesChatEnabled: true,
          showRawEditor: false,
          editorDefaultView: 'preview' as EditorViewMode
        })
        break
      case 'viewer':
        // Reiner Read-Only-Modus: alles Schwere aus, nur Preview + Sidebar + Graph
        set({
          smartConnectionsEnabled: false,
          notesChatEnabled: false,
          flashcardsEnabled: false,
          semanticScholarEnabled: false,
          zoteroEnabled: false,
          pdfCompanionEnabled: false,
          languageTool: { ...get().languageTool, enabled: false },
          email: { ...get().email, enabled: false },
          // Plugin-Vertikalen (generische Config): enabled-Flag pro pluginId aus pluginConfig kippen.
          pluginConfig: {
            ...get().pluginConfig,
            antares: { ...(get().pluginConfig.antares ?? {}), enabled: false },
            edoobox: { ...(get().pluginConfig.edoobox ?? {}), enabled: false },
            marketing: { ...(get().pluginConfig.marketing ?? {}), enabled: false },
            remarkable: { ...(get().pluginConfig.remarkable ?? {}), enabled: false },
          },
          readwise: { ...get().readwise, enabled: false },
          docling: { ...get().docling, enabled: false },
          visionOcr: { ...get().visionOcr, enabled: false },
          dashboard: { ...get().dashboard, enabled: false },
          transport: { ...get().transport, enabled: false, showTitlebarButton: false },
          editorDefaultView: 'preview' as EditorViewMode,
          showFormattingToolbar: false,
          showRawEditor: false
        })
        break
    }
  }
}))

// Guard: Verhindert dass Settings gespeichert werden bevor sie geladen wurden
let settingsInitialized = false

// Deep merge: Saved settings mit Defaults zusammenführen, sodass neue Sub-Properties
// aus Updates nicht verloren gehen (z.B. neues Feld in dailyNote, languageTool etc.)
function deepMergeSettings(defaults: Record<string, unknown>, saved: Record<string, unknown>): Record<string, unknown> {
  const result = { ...defaults }
  for (const key of Object.keys(saved)) {
    if (
      saved[key] !== null &&
      typeof saved[key] === 'object' &&
      !Array.isArray(saved[key]) &&
      defaults[key] !== null &&
      typeof defaults[key] === 'object' &&
      !Array.isArray(defaults[key])
    ) {
      // Deep merge für Objekte: Saved values überschreiben Defaults, aber neue Default-Keys bleiben erhalten
      result[key] = { ...(defaults[key] as Record<string, unknown>), ...(saved[key] as Record<string, unknown>) }
    } else {
      result[key] = saved[key]
    }
  }
  return result
}

// Settings laden beim App-Start
export async function initializeUISettings(): Promise<void> {
  try {
    const savedSettings = await window.electronAPI.loadUISettings()
    if (savedSettings && Object.keys(savedSettings).length > 0) {
      console.log('[UIStore] Loaded settings from file:', savedSettings)

      // Defaults für persistierte Felder sammeln
      const defaultValues: Record<string, unknown> = {}
      for (const key of persistedKeys) {
        defaultValues[key] = defaultState[key as keyof typeof defaultState]
      }

      // Nur persistierte Felder übernehmen
      const savedPersistedOnly: Record<string, unknown> = {}
      for (const key of persistedKeys) {
        if (key in savedSettings) {
          savedPersistedOnly[key] = savedSettings[key]
        }
      }

      // Deep merge: Defaults + gespeicherte Werte (neue Sub-Properties bekommen Defaults)
      const validSettings = deepMergeSettings(defaultValues, savedPersistedOnly) as Partial<UIState>

      // Always start with 'editor' mode on startup
      validSettings.viewMode = 'editor'
      // Migrate Transport: defaultDestinationIndex → defaultDestinationFolder
      if (validSettings.transport) {
        const tr = validSettings.transport as TransportSettings
        if (!tr.defaultDestinationFolder && typeof tr.defaultDestinationIndex === 'number' && Array.isArray(tr.destinations) && tr.destinations.length > 0) {
          const idx = Math.min(Math.max(tr.defaultDestinationIndex, 0), tr.destinations.length - 1)
          tr.defaultDestinationFolder = tr.destinations[idx]?.folder || ''
        }
        if (!tr.defaultDestinationFolder && Array.isArray(tr.destinations) && tr.destinations.length > 0) {
          tr.defaultDestinationFolder = tr.destinations[0].folder
        }
      }

      // Migrate Dashboard-Widgets: Focus-Widget nachtragen wenn Nutzer vor der Einführung gespeichert hat
      if (validSettings.dashboard) {
        const dash = validSettings.dashboard as DashboardSettings
        if (Array.isArray(dash.widgets) && !dash.widgets.includes('focus')) {
          dash.widgets = ['focus', ...dash.widgets]
        }
        if (Array.isArray(dash.widgets) && !dash.widgets.includes('radar')) {
          const focusIndex = dash.widgets.indexOf('focus')
          dash.widgets = focusIndex >= 0
            ? [...dash.widgets.slice(0, focusIndex + 1), 'radar', ...dash.widgets.slice(focusIndex + 1)]
            : ['radar', ...dash.widgets]
        }
        if (Array.isArray(dash.widgets) && !dash.widgets.includes('activity')) {
          const radarIndex = dash.widgets.indexOf('radar')
          dash.widgets = radarIndex >= 0
            ? [...dash.widgets.slice(0, radarIndex + 1), 'activity', ...dash.widgets.slice(radarIndex + 1)]
            : ['activity', ...dash.widgets]
        }
        if (Array.isArray(dash.widgets) && !dash.widgets.includes('antares')) {
          dash.widgets = [...dash.widgets, 'antares']
        }
        // Auto-migrate: 'project-status' bei bestehenden Installationen einfügen (eingeführt 2026-05-17)
        if (Array.isArray(dash.widgets) && !dash.widgets.includes('project-status')) {
          dash.widgets = [...dash.widgets, 'project-status']
        }
        if (typeof dash.radarAiEnabled !== 'boolean') dash.radarAiEnabled = true
        if (typeof dash.radarAiRefreshIntervalHours !== 'number' || dash.radarAiRefreshIntervalHours <= 0) {
          dash.radarAiRefreshIntervalHours = 6
        }
        if (typeof dash.radarAiModel !== 'string') dash.radarAiModel = ''
      }
      // Migrate ollama: moduleModelOverrides ergänzen (eingeführt 2026-05-14)
      if (validSettings.ollama) {
        const ll = validSettings.ollama as LLMSettings
        const defaults = (defaultState.ollama as LLMSettings).moduleModelOverrides
        if (!ll.moduleModelOverrides || typeof ll.moduleModelOverrides !== 'object') {
          ll.moduleModelOverrides = { ...defaults }
        } else {
          ll.moduleModelOverrides = { ...defaults, ...ll.moduleModelOverrides }
        }
        // Projekt-RAG-Embedding-Modell ergänzen (eingeführt 2026-06-06)
        if (typeof ll.projectRagEmbeddingModel !== 'string' || !ll.projectRagEmbeddingModel) {
          ll.projectRagEmbeddingModel = 'bge-m3'
        }
        // OpenRouter-Cloud-Backend ergänzen (eingeführt 2026-06-19). Default lokal —
        // bestehende Installationen bekommen es deaktiviert, kein Cloud-Modul aktiv.
        if (!ll.openrouter || typeof ll.openrouter !== 'object') {
          ll.openrouter = { ...DEFAULT_OPENROUTER_SETTINGS }
        } else {
          ll.openrouter = {
            ...DEFAULT_OPENROUTER_SETTINGS,
            ...ll.openrouter,
            cloudModules: Array.isArray(ll.openrouter.cloudModules) ? ll.openrouter.cloudModules : [],
            cloudFeatures: Array.isArray(ll.openrouter.cloudFeatures) ? ll.openrouter.cloudFeatures : [],
            moduleModelOverrides: (ll.openrouter.moduleModelOverrides && typeof ll.openrouter.moduleModelOverrides === 'object')
              ? ll.openrouter.moduleModelOverrides : {}
          }
        }
        // LLMBase-Cloud-Backend ergänzen (eingeführt 2026-07-07). Gleiche Policy:
        // Default lokal, keine Cloud-Features aktiv.
        if (!ll.llmbase || typeof ll.llmbase !== 'object') {
          ll.llmbase = { ...DEFAULT_LLMBASE_SETTINGS }
        } else {
          ll.llmbase = {
            ...DEFAULT_LLMBASE_SETTINGS,
            ...ll.llmbase,
            cloudModules: Array.isArray(ll.llmbase.cloudModules) ? ll.llmbase.cloudModules : [],
            cloudFeatures: Array.isArray(ll.llmbase.cloudFeatures) ? ll.llmbase.cloudFeatures : [],
            moduleModelOverrides: (ll.llmbase.moduleModelOverrides && typeof ll.llmbase.moduleModelOverrides === 'object')
              ? ll.llmbase.moduleModelOverrides : {}
          }
        }
      }
      // Migrate Brain: automatische Tagesverdichtung ergänzen (eingeführt 2026-06-06)
      if (validSettings.brain) {
        const brain = validSettings.brain as BrainSettings
        if (typeof brain.autoConsolidateEnabled !== 'boolean') brain.autoConsolidateEnabled = true
        if (typeof brain.autoConsolidateTime !== 'string' || !/^\d{2}:\d{2}$/.test(brain.autoConsolidateTime)) {
          brain.autoConsolidateTime = '21:30'
        }
      }
      // (edoobox-baseUrl-Normalisierung läuft jetzt in der pluginConfig-Migration weiter unten.)
      // Existing users upgrading from pre-1.0.16: they have settings but no onboardingCompleted
      // → skip onboarding for them
      if (!('onboardingCompleted' in savedSettings)) {
        validSettings.onboardingCompleted = true
      }
      // Force editorDefaultView to 'preview' once for all existing users (2026-05-28).
      // Markdown-Editing ist nichts, was Office-/Mittelstands-User out-of-the-box
      // bedienen können — sie sollen mit dem Lesen-Modus starten und bei Bedarf
      // umschalten. Migration nur einmal pro User; danach respektieren wir die
      // bewusste Wahl wieder.
      if (!validSettings.editorDefaultViewForcedToPreview) {
        validSettings.editorDefaultView = 'preview'
        validSettings.editorDefaultViewForcedToPreview = true
      }
      // Einmalige Migration vom alten warmen Default-Design (cream/terracotta) auf
      // weiß/ink (2026-06-18). Nur wer noch auf den ALTEN Defaults sitzt, wird
      // umgestellt — eine bewusste andere Wahl (z.B. Mint, Blau) bleibt erhalten.
      // Danach respektieren wir die Nutzerwahl wieder (Flag-gesteuert, läuft 1×).
      if (!validSettings.appearanceMigratedToLight) {
        if (validSettings.backgroundColor === 'cream') {
          validSettings.backgroundColor = 'default'
        }
        if (validSettings.accentColor === 'terracotta') {
          validSettings.accentColor = 'ink'
        }
        validSettings.appearanceMigratedToLight = true
      }
      // Migrate old profile names to new ones
      const profileMigration: Record<string, UserProfile> = {
        'schueler': 'student',
        'studium': 'researcher',
        'wissensmanagement': 'professional'
      }
      if (validSettings.userProfile && profileMigration[validSettings.userProfile as string]) {
        validSettings.userProfile = profileMigration[validSettings.userProfile as string]
      }
      // A-pre Schritt 3: Legacy Top-Level-Configs der Vertikalen → generische pluginConfig.<id>.
      const legacyPresent = LEGACY_PLUGIN_CONFIG_IDS.filter(
        (id) => { const v = (savedSettings as Record<string, unknown>)[id]; return v != null && typeof v === 'object' }
      )
      validSettings.pluginConfig = migrateLegacyPluginConfig(
        savedSettings as Record<string, unknown>,
        (validSettings.pluginConfig ?? {}) as Record<string, Record<string, unknown>>
      )
      useUIStore.setState(validSettings)
      // Karteileichen entfernen: erst die migrierte pluginConfig persistieren (crash-sicher),
      // DANN die alten Top-Level-Keys von der Platte prunen (saveUISettings mergt sonst weiter).
      if (legacyPresent.length > 0) {
        try {
          const persisted: Record<string, unknown> = {}
          const s = useUIStore.getState()
          for (const key of persistedKeys) persisted[key] = s[key as keyof typeof s]
          await window.electronAPI.saveUISettings(persisted)
          await window.electronAPI.pruneUISettingsKeys(legacyPresent as unknown as string[])
        } catch (err) {
          console.error('[UIStore] Legacy-pluginConfig-Cleanup fehlgeschlagen:', err)
        }
      }
    } else {
      console.log('[UIStore] No saved settings found, using defaults')
    }
  } catch (error) {
    console.error('[UIStore] Failed to load settings:', error)
  } finally {
    // Settings dürfen erst NACH dem Laden gespeichert werden
    settingsInitialized = true
    console.log('[UIStore] Settings initialization complete, saving enabled')
  }
}

// Settings speichern - wird bei jeder Änderung aufgerufen
let saveTimeout: ReturnType<typeof setTimeout> | null = null

function saveSettingsDebounced(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(async () => {
    const state = useUIStore.getState()
    const toSave: Record<string, unknown> = {}
    for (const key of persistedKeys) {
      toSave[key] = state[key as keyof typeof state]
    }
    try {
      await window.electronAPI.saveUISettings(toSave)
      console.log('[UIStore] Settings saved:', toSave)
    } catch (error) {
      console.error('[UIStore] Failed to save settings:', error)
    }
  }, 300) // 300ms Debounce
}

// Store-Änderungen überwachen und automatisch speichern
useUIStore.subscribe((state, prevState) => {
  // Nicht speichern bevor Settings geladen wurden (verhindert Überschreiben mit Defaults)
  if (!settingsInitialized) return

  // Prüfen ob sich ein persistiertes Feld geändert hat
  let changed = false
  for (const key of persistedKeys) {
    if (state[key as keyof typeof state] !== prevState[key as keyof typeof prevState]) {
      changed = true
      break
    }
  }
  if (changed) {
    saveSettingsDebounced()
  }
})
