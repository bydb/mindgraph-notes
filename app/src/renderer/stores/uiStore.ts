import { create } from 'zustand'
import type { UpdateInfo } from '../../shared/types'
import type { NoteKindId } from '../utils/noteKind'

type ViewMode = 'editor' | 'split' | 'canvas'
type Theme = 'light' | 'dark' | 'system'
type CanvasViewMode = 'cards'
type FileTreeDisplayMode = 'name' | 'path'  // 'name' = nur Dateiname, 'path' = voller Pfad
type EditorViewMode = 'edit' | 'live-preview' | 'preview'
type PdfDisplayMode = 'both' | 'companion-only' | 'pdf-only'  // Anzeige von PDF/Companion im FileTree
type AccentColor = 'blue' | 'orange' | 'green' | 'purple' | 'pink' | 'teal' | 'rose' | 'coral' | 'mauve' | 'mint' | 'lime' | 'gold' | 'terracotta' | 'custom'
export type LLMBackend = 'ollama' | 'lm-studio'
export type Language = 'de' | 'en'
export type IconSet = 'default' | 'minimal' | 'colorful' | 'emoji'
export type UserProfile = 'student' | 'researcher' | 'professional' | 'writer' | 'developer' | 'viewer' | null
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

// LLM AI Settings (Ollama & LM Studio)
interface LLMSettings {
  enabled: boolean
  backend: LLMBackend  // 'ollama' | 'lm-studio'
  selectedModel: string
  defaultTranslateLanguage: AILanguageCode
  lmStudioPort: number  // Default: 1234
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
  analysisModel: string
  signature: string
  signatureImagePath: string
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

export interface ReMarkableSettings {
  enabled: boolean
  transport: 'usb'
  autoRefreshOnOpen: boolean
}

// Daily Note Settings
export interface DailyNoteSettings {
  enabled: boolean
  folderPath: string
  templateId: string  // 'dailyNote' | 'zettel' | 'meeting' | 'empty' | custom template id | '' (= dailyNote)
  dateFormat: string
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
  showTitlebarButton: boolean
}

// Dashboard Widgets — identifier-basiert, Reihenfolge im Array = Anzeigereihenfolge
export type DashboardWidgetId = 'focus' | 'radar' | 'activity' | 'tasks' | 'emails' | 'calendar' | 'bookings' | 'sync'

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

export const DASHBOARD_ALL_WIDGETS: DashboardWidgetId[] = ['focus', 'radar', 'activity', 'tasks', 'emails', 'calendar', 'bookings', 'sync']

const normalizeVaultFolder = (folder: string): string => folder.trim().replace(/^\/+|\/+$/g, '')

// Telegram Bot Settings
export type TelegramLlmBackend = 'ollama' | 'anthropic' | 'auto'

export interface TelegramBotSettings {
  enabled: boolean
  allowedChatIds: string[]      // Whitelist — nur diese Chat-IDs dürfen mit dem Bot reden
  llmBackend: TelegramLlmBackend // 'auto' = Ollama wenn erreichbar, sonst Anthropic
  anthropicModel: string         // z.B. 'claude-sonnet-4-6'
  ollamaModel: string            // fallback / direct choice
  briefingIncludeEmails: boolean
  briefingIncludeOverdue: boolean
  priorityFolders: string[]     // Vault-relative Ordnerpfade — Notizen dort werden bei /ask + /inbox bevorzugt
  active: boolean                // true = Bot läuft (wird vom Main-Prozess aus gesetzt/gelesen)
  agentEnabled: boolean         // /agent verfügbar (Tool-Use-Loop, nur Ollama)
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
  { id: 'mz-suite',         label: 'Edoobox Modul',description: 'edoobox + Marketing (WordPress) + IQ-Auswertung + Formularimport', category: 'business' },
  { id: 'flashcards',       label: 'Flashcards & Quiz',description: 'Karteikarten mit Spaced Repetition und Quiz-Modus', category: 'learning' },
  { id: 'semantic-scholar', label: 'Semantic Scholar', description: 'Wissenschaftliche Paper durchsuchen und zitieren', category: 'research' },
  { id: 'zotero',           label: 'Zotero',           description: 'Bibliothek durchsuchen, Zitate einfügen (⌘⇧Z)', category: 'research', iconText: 'Z', iconColor: '#cc2936' },
  { id: 'readwise',         label: 'Readwise',         description: 'Highlights aus Readwise synchronisieren', category: 'research' },
  { id: 'remarkable',       label: 'reMarkable',       description: 'Dokumente mit dem reMarkable-Tablet austauschen', category: 'devices' },
  { id: 'docling',          label: 'Docling',          description: 'PDF-Textextraktion via Docling-Server', category: 'documents' },
  { id: 'vision-ocr',       label: 'Vision OCR',       description: 'Bilder und Scans per Vision-Modell in Text umwandeln', category: 'documents' },
  { id: 'speech',           label: 'Sprache',          description: 'Vorlesen (TTS) und Diktieren (Whisper, läuft offline in der App) in Editor & Flashcards', category: 'ai' }
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
  pendingTemplateInsert: PendingTemplateInsert | null // Template das in Editor eingefügt werden soll

  // LLM AI Settings (Ollama & LM Studio)
  ollama: LLMSettings

  // PDF Companion Settings
  pdfCompanionEnabled: boolean  // PDF Companion-Dateien automatisch erstellen
  pdfDisplayMode: PdfDisplayMode  // Anzeige im FileTree: 'both', 'companion-only', 'pdf-only'

  // FileTree Icon Settings
  iconSet: IconSet  // 'default' | 'minimal' | 'colorful' | 'emoji'

  // KI-Features (für ältere Rechner ohne Ollama deaktivierbar)
  smartConnectionsEnabled: boolean
  notesChatEnabled: boolean
  flashcardsEnabled: boolean
  semanticScholarEnabled: boolean
  zoteroEnabled: boolean

  // Sprache (TTS + STT)
  speech: SpeechSettings

  // Task-Zählung: Ordner ausschließen
  taskExcludedFolders: string[]

  // Smart Connections Gewichtungen
  smartConnectionsWeights: SmartConnectionsWeights

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

  // Marketing Settings
  marketing: MarketingSettings

  // edoobox Agent Settings
  edoobox: EdooboxSettings

  // reMarkable Settings
  remarkable: ReMarkableSettings

  // Daily Note Settings
  dailyNote: DailyNoteSettings

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

  // Onboarding
  onboardingCompleted: boolean
  onboardingOpen: boolean
  helpGuideOpen: boolean

  // Slash Commands
  slashCommandDateFormat: string
  slashCommandTimeFormat: string

  // Formatting Toolbar
  showFormattingToolbar: boolean
  showRawEditor: boolean

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
  setPendingTemplateInsert: (template: PendingTemplateInsert | null) => void
  setOllama: (settings: Partial<LLMSettings>) => void
  setPdfCompanionEnabled: (enabled: boolean) => void
  setPdfDisplayMode: (mode: PdfDisplayMode) => void
  setIconSet: (set: IconSet) => void
  setSmartConnectionsEnabled: (enabled: boolean) => void
  setNotesChatEnabled: (enabled: boolean) => void
  setFlashcardsEnabled: (enabled: boolean) => void
  setSemanticScholarEnabled: (enabled: boolean) => void
  setZoteroEnabled: (enabled: boolean) => void
  setSpeech: (settings: Partial<SpeechSettings>) => void
  toggleTaskExcludedFolder: (folderPath: string) => void
  setSmartConnectionsWeights: (weights: Partial<SmartConnectionsWeights>) => void
  setDocling: (settings: Partial<DoclingSettings>) => void
  setVisionOcr: (settings: Partial<VisionOcrSettings>) => void
  setReadwise: (settings: Partial<ReadwiseSettings>) => void
  setLanguageTool: (settings: Partial<LanguageToolSettings>) => void
  setEmail: (settings: Partial<EmailSettings>) => void
  setMarketing: (settings: Partial<MarketingSettings>) => void
  setEdoobox: (settings: Partial<EdooboxSettings>) => void
  setRemarkable: (settings: Partial<ReMarkableSettings>) => void
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
  setHelpGuideOpen: (open: boolean) => void
  setSlashCommandDateFormat: (format: string) => void
  setSlashCommandTimeFormat: (format: string) => void
  setShowFormattingToolbar: (show: boolean) => void
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
}

// Default-Werte für den Store
const defaultState = {
  // Allgemein
  viewMode: 'split' as ViewMode,
  theme: 'system' as Theme,
  accentColor: 'terracotta' as AccentColor,
  backgroundColor: 'cream' as BackgroundColor,
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
  pendingTemplateInsert: null as PendingTemplateInsert | null,

  // LLM AI Settings (Ollama & LM Studio)
  ollama: {
    enabled: true,
    backend: 'ollama' as LLMBackend,
    selectedModel: '',
    defaultTranslateLanguage: 'en' as AILanguageCode,
    lmStudioPort: 1234
  },

  // PDF Companion Settings
  pdfCompanionEnabled: true,
  pdfDisplayMode: 'companion-only' as PdfDisplayMode,

  // FileTree Icon Settings
  iconSet: 'default' as IconSet,

  // Task-Zählung: Ordner ausschließen
  taskExcludedFolders: [] as string[],

  // KI-Features (opt-in - Human in the Loop)
  smartConnectionsEnabled: false,
  notesChatEnabled: false,
  flashcardsEnabled: true,
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
    maxEmailsPerFetch: 50,
    retainDays: 30,
    autoAnalyze: true,
    analysisModel: '',
    signature: '',
    signatureImagePath: ''
  },

  // Marketing (WordPress)
  marketing: {
    enabled: false,
    wordpressUrl: '',
    wordpressUser: '',
    defaultPostStatus: 'draft' as const,
    googleImagenApiKey: ''
  },

  // edoobox Agent
  edoobox: {
    enabled: false,
    baseUrl: 'https://app1.edoobox.com',
    apiVersion: 'v2' as const,
    webhookUrl: ''
  },

  // reMarkable
  remarkable: {
    enabled: false,
    transport: 'usb' as const,
    autoRefreshOnOpen: true
  },

  // Daily Note
  dailyNote: {
    enabled: true,
    folderPath: '',
    templateId: 'dailyNote',
    dateFormat: 'DD.MM.YY'
  },

  // Update-Checker & What's New
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
  helpGuideOpen: false,

  // Slash Commands
  slashCommandDateFormat: 'DD.MM.YYYY',
  slashCommandTimeFormat: 'HH:mm',

  // Formatting Toolbar
  showFormattingToolbar: false,
  showRawEditor: false,

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
    showTitlebarButton: true
  } as TransportSettings,

  // Dashboard
  dashboard: {
    enabled: true,
    widgets: ['focus', 'radar', 'activity', 'tasks', 'emails', 'calendar', 'bookings'],
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
    llmBackend: 'auto' as TelegramLlmBackend,
    anthropicModel: 'claude-sonnet-4-6',
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
  } as TelegramBotSettings
}

// Felder die persistiert werden sollen (keine Funktionen, keine transienten Werte)
const persistedKeys = [
  'viewMode', 'theme', 'accentColor', 'backgroundColor', 'loadLastVaultOnStart',
  'language', 'fontFamily', 'editorFontSize', 'editorLineNumbers', 'editorDefaultView',
  'autoSaveInterval', 'editorHeadingFolding', 'editorOutlining', 'outlineStyle', 'editorShowWordCount',
  'sidebarWidth', 'sidebarVisible', 'editorPreviewSplit', 'textSplitEnabled', 'textSplitPosition',
  'canvasFilterPath', 'canvasViewMode', 'canvasShowEdges', 'canvasShowTags', 'canvasShowLinks', 'canvasShowImages', 'canvasShowSummaries',
  'canvasCompactMode', 'canvasReadMode', 'canvasHoverScale', 'canvasDefaultCardWidth', 'splitPosition', 'fileTreeDisplayMode', 'fileTreeKindFilter', 'notesRootFolder', 'ollama',
  'pdfCompanionEnabled', 'pdfDisplayMode', 'iconSet',
  'smartConnectionsEnabled', 'notesChatEnabled', 'flashcardsEnabled', 'semanticScholarEnabled', 'zoteroEnabled', 'smartConnectionsWeights', 'docling', 'visionOcr', 'readwise', 'languageTool', 'email', 'marketing', 'edoobox', 'remarkable', 'dailyNote', 'taskExcludedFolders', 'speech',
  'lastSeenVersion',
  'customAccentColor', 'customBackgroundColorLight', 'customBackgroundColorDark',
  'customLogo',
  'onboardingCompleted',
  'userProfile',
  'slashCommandDateFormat',
  'slashCommandTimeFormat',
  'showFormattingToolbar',
  'showRawEditor',
  'transport',
  'dashboard',
  'telegramBot'
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
  setPendingTemplateInsert: (template) => set({ pendingTemplateInsert: template }),
  setOllama: (settings) => set((state) => ({ ollama: { ...state.ollama, ...settings } })),
  setPdfCompanionEnabled: (enabled) => set({ pdfCompanionEnabled: enabled }),
  setPdfDisplayMode: (mode) => set({ pdfDisplayMode: mode }),
  setIconSet: (iconSet) => set({ iconSet }),
  setSmartConnectionsEnabled: (enabled) => set({ smartConnectionsEnabled: enabled }),
  setNotesChatEnabled: (enabled) => set({ notesChatEnabled: enabled }),
  setFlashcardsEnabled: (enabled) => set({ flashcardsEnabled: enabled }),
  setSpeech: (settings) => set((state) => ({ speech: { ...state.speech, ...settings } })),
  toggleTaskExcludedFolder: (folderPath) => set((state) => {
    const current = state.taskExcludedFolders
    const isExcluded = current.includes(folderPath)
    return { taskExcludedFolders: isExcluded ? current.filter(f => f !== folderPath) : [...current, folderPath] }
  }),
  setSemanticScholarEnabled: (enabled) => set({ semanticScholarEnabled: enabled }),
  setZoteroEnabled: (enabled) => set({ zoteroEnabled: enabled }),
  setSmartConnectionsWeights: (weights) => set((state) => ({
    smartConnectionsWeights: { ...state.smartConnectionsWeights, ...weights }
  })),
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
  setMarketing: (settings) => set((state) => ({
    marketing: { ...state.marketing, ...settings }
  })),
  setEdoobox: (settings) => set((state) => ({
    edoobox: { ...state.edoobox, ...settings }
  })),
  setRemarkable: (settings) => set((state) => ({
    remarkable: { ...state.remarkable, ...settings }
  })),
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
  setHelpGuideOpen: (open) => set({ helpGuideOpen: open }),
  setSlashCommandDateFormat: (format) => set({ slashCommandDateFormat: format }),
  setSlashCommandTimeFormat: (format) => set({ slashCommandTimeFormat: format }),
  setShowFormattingToolbar: (show) => set({ showFormattingToolbar: show }),
  setShowRawEditor: (show) => set({ showRawEditor: show }),
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
  applyProfileDefaults: (profile) => {
    if (!profile) return
    switch (profile) {
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
          edoobox: { ...get().edoobox, enabled: false },
          marketing: { ...get().marketing, enabled: false },
          readwise: { ...get().readwise, enabled: false },
          remarkable: { ...get().remarkable, enabled: false },
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
        if (typeof dash.radarAiEnabled !== 'boolean') dash.radarAiEnabled = true
        if (typeof dash.radarAiRefreshIntervalHours !== 'number' || dash.radarAiRefreshIntervalHours <= 0) {
          dash.radarAiRefreshIntervalHours = 6
        }
        if (typeof dash.radarAiModel !== 'string') dash.radarAiModel = ''
      }
      // Migrate edoobox base URL: strip /v1 or /v2 suffix, use app2 for V2
      if (validSettings.edoobox) {
        const edoobox = validSettings.edoobox as EdooboxSettings
        if (edoobox.baseUrl) {
          edoobox.baseUrl = edoobox.baseUrl.replace(/\/v[12]$/i, '')
        }
        // Revert incorrect app2 migration
        if (edoobox.baseUrl?.includes('app2.edoobox.com')) {
          edoobox.baseUrl = edoobox.baseUrl.replace('app2.edoobox.com', 'app1.edoobox.com')
        }
        if (!edoobox.apiVersion) {
          edoobox.apiVersion = 'v1'
        }
      }
      // Existing users upgrading from pre-1.0.16: they have settings but no onboardingCompleted
      // → skip onboarding for them
      if (!('onboardingCompleted' in savedSettings)) {
        validSettings.onboardingCompleted = true
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
      useUIStore.setState(validSettings)
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
