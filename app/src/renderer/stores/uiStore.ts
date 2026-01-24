import { create } from 'zustand'

type ViewMode = 'editor' | 'split' | 'canvas'
type Theme = 'light' | 'dark' | 'system'
type CanvasViewMode = 'cards'
type FileTreeDisplayMode = 'name' | 'path'  // 'name' = nur Dateiname, 'path' = voller Pfad
type EditorViewMode = 'edit' | 'live-preview' | 'preview'
type PdfDisplayMode = 'both' | 'companion-only' | 'pdf-only'  // Anzeige von PDF/Companion im FileTree
type AccentColor = 'blue' | 'orange' | 'green' | 'purple' | 'pink' | 'teal'
type AIAction = 'translate' | 'summarize' | 'continue' | 'improve'
export type Language = 'de' | 'en'
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
  teal: { name: 'Türkis', color: '#5ac8fa', hover: '#4ab8e8' }
}

// Hintergrundfarben (Pastelltöne)
export type BackgroundColor = 'default' | 'beige' | 'cream' | 'lavender' | 'mint' | 'blush' | 'sky' | 'peach' | 'sage'

export const BACKGROUND_COLORS: Record<BackgroundColor, { name: string; light: string; dark: string }> = {
  default: { name: 'Standard', light: '#ffffff', dark: '#0d0d0d' },
  beige: { name: 'Beige', light: '#f5f0e8', dark: '#1a1814' },
  cream: { name: 'Creme', light: '#faf8f0', dark: '#18170f' },
  lavender: { name: 'Lavendel', light: '#f0eef8', dark: '#141318' },
  mint: { name: 'Mint', light: '#eef8f4', dark: '#121816' },
  blush: { name: 'Rosé', light: '#f8eef0', dark: '#181214' },
  sky: { name: 'Himmel', light: '#eef4f8', dark: '#121518' },
  peach: { name: 'Pfirsich', light: '#f8f2ee', dark: '#181614' },
  sage: { name: 'Salbei', light: '#f0f4ee', dark: '#141612' }
}

interface PendingTemplateInsert {
  content: string
  cursorPosition?: number
}

// Ollama AI Settings
interface OllamaSettings {
  enabled: boolean
  selectedModel: string
  defaultTranslateLanguage: AILanguageCode
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

  // UI State
  sidebarWidth: number
  sidebarVisible: boolean
  editorPreviewSplit: boolean
  canvasFilterPath: string | null // null = alle anzeigen, sonst Ordnerpfad
  canvasViewMode: CanvasViewMode // 'cards' = Karten mit Titel, 'dots' = Punkte
  canvasShowTags: boolean // Tags in Karten anzeigen
  canvasShowLinks: boolean // Link-Anzahl in Karten anzeigen
  canvasShowImages: boolean // Bilder in Karten anzeigen
  canvasCompactMode: boolean // Kompakt-Modus: nur Titel anzeigen
  canvasDefaultCardWidth: number // Standard-Kartenbreite (150-400)
  splitPosition: number // Prozent für Editor-Breite im Split-Modus (0-100)
  fileTreeDisplayMode: FileTreeDisplayMode // 'name' = nur Dateiname, 'path' = voller Pfad
  pendingTemplateInsert: PendingTemplateInsert | null // Template das in Editor eingefügt werden soll

  // Ollama AI Settings
  ollama: OllamaSettings

  // PDF Companion Settings
  pdfCompanionEnabled: boolean  // PDF Companion-Dateien automatisch erstellen
  pdfDisplayMode: PdfDisplayMode  // Anzeige im FileTree: 'both', 'companion-only', 'pdf-only'

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
  setSidebarWidth: (width: number) => void
  toggleSidebar: () => void
  toggleEditorPreview: () => void
  setCanvasFilterPath: (path: string | null) => void
  setCanvasViewMode: (mode: CanvasViewMode) => void
  setCanvasShowTags: (show: boolean) => void
  setCanvasShowLinks: (show: boolean) => void
  setCanvasShowImages: (show: boolean) => void
  setCanvasCompactMode: (compact: boolean) => void
  setCanvasDefaultCardWidth: (width: number) => void
  setSplitPosition: (position: number) => void
  setFileTreeDisplayMode: (mode: FileTreeDisplayMode) => void
  setPendingTemplateInsert: (template: PendingTemplateInsert | null) => void
  setOllama: (settings: Partial<OllamaSettings>) => void
  setPdfCompanionEnabled: (enabled: boolean) => void
  setPdfDisplayMode: (mode: PdfDisplayMode) => void
}

// Default-Werte für den Store
const defaultState = {
  // Allgemein
  viewMode: 'split' as ViewMode,
  theme: 'system' as Theme,
  accentColor: 'blue' as AccentColor,
  backgroundColor: 'default' as BackgroundColor,
  loadLastVaultOnStart: true,
  language: 'de' as Language,
  fontFamily: 'system' as FontFamily,

  // Editor Settings
  editorFontSize: 15,
  editorLineNumbers: true,
  editorDefaultView: 'edit' as EditorViewMode,
  autoSaveInterval: 500,

  // UI State
  sidebarWidth: 250,
  sidebarVisible: true,
  editorPreviewSplit: true,
  canvasFilterPath: null as string | null,
  canvasViewMode: 'cards' as CanvasViewMode,
  canvasShowTags: false,
  canvasShowLinks: true,
  canvasShowImages: true,
  canvasCompactMode: false,
  canvasDefaultCardWidth: 220, // Standard: 220px
  splitPosition: 50,
  fileTreeDisplayMode: 'name' as FileTreeDisplayMode,
  pendingTemplateInsert: null as PendingTemplateInsert | null,

  // Ollama AI Settings
  ollama: {
    enabled: true,
    selectedModel: '',
    defaultTranslateLanguage: 'en' as AILanguageCode
  },

  // PDF Companion Settings
  pdfCompanionEnabled: true,
  pdfDisplayMode: 'companion-only' as PdfDisplayMode
}

// Felder die persistiert werden sollen (keine Funktionen, keine transienten Werte)
const persistedKeys = [
  'viewMode', 'theme', 'accentColor', 'backgroundColor', 'loadLastVaultOnStart',
  'language', 'fontFamily', 'editorFontSize', 'editorLineNumbers', 'editorDefaultView',
  'autoSaveInterval', 'sidebarWidth', 'sidebarVisible', 'editorPreviewSplit',
  'canvasFilterPath', 'canvasViewMode', 'canvasShowTags', 'canvasShowLinks', 'canvasShowImages',
  'canvasCompactMode', 'canvasDefaultCardWidth', 'splitPosition', 'fileTreeDisplayMode', 'ollama',
  'pdfCompanionEnabled', 'pdfDisplayMode'
] as const

export const useUIStore = create<UIState>()((set, get) => ({
  ...defaultState,

  // Actions
  setViewMode: (mode) => set({ viewMode: mode }),
  setTheme: (theme) => set({ theme }),
  setAccentColor: (color) => set({ accentColor: color }),
  setBackgroundColor: (color) => set({ backgroundColor: color }),
  setLoadLastVaultOnStart: (value) => set({ loadLastVaultOnStart: value }),
  setLanguage: (lang) => set({ language: lang }),
  setFontFamily: (font) => set({ fontFamily: font }),
  setEditorFontSize: (size) => set({ editorFontSize: Math.max(10, Math.min(24, size)) }),
  setEditorLineNumbers: (show) => set({ editorLineNumbers: show }),
  setEditorDefaultView: (mode) => set({ editorDefaultView: mode }),
  setAutoSaveInterval: (interval) => set({ autoSaveInterval: interval }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleEditorPreview: () => set((state) => ({ editorPreviewSplit: !state.editorPreviewSplit })),
  setCanvasFilterPath: (path) => set({ canvasFilterPath: path }),
  setCanvasViewMode: (mode) => set({ canvasViewMode: mode }),
  setCanvasShowTags: (show) => set({ canvasShowTags: show }),
  setCanvasShowLinks: (show) => set({ canvasShowLinks: show }),
  setCanvasShowImages: (show) => set({ canvasShowImages: show }),
  setCanvasCompactMode: (compact) => set({ canvasCompactMode: compact }),
  setCanvasDefaultCardWidth: (width) => set({ canvasDefaultCardWidth: Math.max(150, Math.min(400, width)) }),
  setSplitPosition: (position) => set({ splitPosition: Math.max(20, Math.min(80, position)) }),
  setFileTreeDisplayMode: (mode) => set({ fileTreeDisplayMode: mode }),
  setPendingTemplateInsert: (template) => set({ pendingTemplateInsert: template }),
  setOllama: (settings) => set((state) => ({ ollama: { ...state.ollama, ...settings } })),
  setPdfCompanionEnabled: (enabled) => set({ pdfCompanionEnabled: enabled }),
  setPdfDisplayMode: (mode) => set({ pdfDisplayMode: mode })
}))

// Settings laden beim App-Start
export async function initializeUISettings(): Promise<void> {
  try {
    const savedSettings = await window.electronAPI.loadUISettings()
    if (savedSettings && Object.keys(savedSettings).length > 0) {
      console.log('[UIStore] Loaded settings from file:', savedSettings)
      // Nur persistierte Felder übernehmen
      const validSettings: Partial<UIState> = {}
      for (const key of persistedKeys) {
        if (key in savedSettings) {
          (validSettings as Record<string, unknown>)[key] = savedSettings[key]
        }
      }
      useUIStore.setState(validSettings)
    } else {
      console.log('[UIStore] No saved settings found, using defaults')
    }
  } catch (error) {
    console.error('[UIStore] Failed to load settings:', error)
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
