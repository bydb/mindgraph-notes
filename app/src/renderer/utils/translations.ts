import type { Language } from '../stores/uiStore'

type TranslationKey = keyof typeof translations.de

const translations = {
  de: {
    // Settings Tabs
    'settings.title': 'Einstellungen',
    'settings.tab.general': 'Allgemein',
    'settings.tab.editor': 'Editor',
    'settings.tab.templates': 'Templates',
    'settings.tab.integrations': 'Integrationen',
    'settings.tab.shortcuts': 'Tastenkürzel',

    // General Settings
    'settings.general.theme': 'Theme',
    'settings.general.theme.light': 'Hell',
    'settings.general.theme.dark': 'Dunkel',
    'settings.general.theme.system': 'System',
    'settings.general.language': 'Sprache',
    'settings.general.font': 'Schriftart',
    'settings.general.accentColor': 'Akzentfarbe',
    'settings.general.backgroundColor': 'Hintergrund',
    'settings.general.loadLastVault': 'Letzten Vault beim Start öffnen',
    'settings.general.vault': 'Vault',
    'settings.general.currentVault': 'Aktueller Vault',
    'settings.general.changeVault': 'Vault wechseln',
    'settings.general.noVault': 'Kein Vault ausgewählt',

    // Editor Settings
    'settings.editor.fontSize': 'Schriftgröße',
    'settings.editor.lineNumbers': 'Zeilennummern anzeigen',
    'settings.editor.defaultView': 'Standard-Ansicht',
    'settings.editor.defaultView.edit': 'Bearbeiten',
    'settings.editor.defaultView.preview': 'Vorschau',
    'settings.editor.defaultView.livePreview': 'Live-Vorschau',
    'settings.editor.autoSave': 'Auto-Speichern',
    'settings.editor.autoSave.off': 'Aus',
    'settings.editor.autoSave.ms': 'ms',

    // Templates
    'settings.templates.builtIn': 'Integrierte Templates',
    'settings.templates.custom': 'Eigene Templates',
    'settings.templates.addCustom': 'Eigenes Template hinzufügen',
    'settings.templates.name': 'Name',
    'settings.templates.content': 'Inhalt',
    'settings.templates.save': 'Speichern',
    'settings.templates.delete': 'Löschen',
    'settings.templates.variables': 'Verfügbare Variablen',

    // Integrations
    'settings.integrations.ollama': 'Ollama (Lokale KI)',
    'settings.integrations.ollama.enabled': 'Aktiviert',
    'settings.integrations.ollama.model': 'Modell',
    'settings.integrations.ollama.noModels': 'Keine Modelle gefunden',
    'settings.integrations.ollama.notRunning': 'Ollama läuft nicht',
    'settings.integrations.zotero': 'Zotero',
    'settings.integrations.zotero.connect': 'Verbinden',
    'settings.integrations.zotero.connected': 'Verbunden',

    // Shortcuts
    'settings.shortcuts.description': 'Tastenkürzel-Referenz',
    'settings.shortcuts.general': 'Allgemein',
    'settings.shortcuts.editor': 'Editor',
    'settings.shortcuts.navigation': 'Navigation',

    // View Modes
    'viewMode.editor': 'Editor',
    'viewMode.split': 'Split',
    'viewMode.canvas': 'Canvas',

    // Sidebar
    'sidebar.files': 'Dateien',
    'sidebar.search': 'Suchen',
    'sidebar.newNote': 'Neue Notiz',
    'sidebar.newFolder': 'Neuer Ordner',
    'sidebar.refresh': 'Aktualisieren',

    // Canvas
    'canvas.allNotes': 'Alle Notizen',
    'canvas.rootOnly': 'Nur Hauptebene',
    'canvas.filter.clear': 'Filter zurücksetzen',
    'canvas.notesCount': '{count} von {total} Notizen',
    'canvas.empty': 'Keine Notizen im ausgewählten Ordner',
    'canvas.showAll': 'Alle anzeigen',
    'canvas.export.svg': 'Als SVG exportieren',
    'canvas.layout': 'Layout',
    'canvas.layout.hierarchical': 'Hierarchisch',
    'canvas.layout.grid': 'Raster',
    'canvas.layout.smartGrid': 'Smart-Raster',
    'canvas.align.left': 'Links ausrichten',
    'canvas.align.center': 'Zentrieren',
    'canvas.align.right': 'Rechts ausrichten',
    'canvas.align.top': 'Oben ausrichten',
    'canvas.align.middle': 'Mittig ausrichten',
    'canvas.align.bottom': 'Unten ausrichten',
    'canvas.distribute.horizontal': 'Horizontal verteilen',
    'canvas.distribute.vertical': 'Vertikal verteilen',
    'canvas.focus': 'Fokus',
    'canvas.focus.enter': 'Fokus-Modus: Nur ausgewählte Karten anzeigen',
    'canvas.focus.add': 'Auswahl zum Fokus hinzufügen',
    'canvas.focus.remove': 'Auswahl aus Fokus entfernen',
    'canvas.focus.exit': 'Beenden',
    'canvas.focus.count': '{count} im Fokus',
    'canvas.selected': '{count} ausgewählt',

    // Context Menu
    'contextMenu.changeColor': 'Farbe ändern',
    'contextMenu.delete': 'Löschen',

    // Colors
    'color.default': 'Standard',
    'color.red': 'Rot',
    'color.orange': 'Orange',
    'color.yellow': 'Gelb',
    'color.green': 'Grün',
    'color.blue': 'Blau',
    'color.purple': 'Lila',
    'color.pink': 'Pink',
    'color.gray': 'Grau',

    // Accent Colors
    'accent.blue': 'Blau',
    'accent.orange': 'Orange',
    'accent.green': 'Grün',
    'accent.purple': 'Violett',
    'accent.pink': 'Pink',
    'accent.teal': 'Türkis',

    // Dialogs
    'dialog.newNote.title': 'Neue Notiz erstellen',
    'dialog.newNote.name': 'Name',
    'dialog.newNote.template': 'Template',
    'dialog.newNote.create': 'Erstellen',
    'dialog.newNote.cancel': 'Abbrechen',
    'dialog.newFolder.title': 'Neuer Ordner',
    'dialog.newFolder.name': 'Ordnername',
    'dialog.delete.confirm': 'Wirklich löschen?',

    // Common
    'common.save': 'Speichern',
    'common.cancel': 'Abbrechen',
    'common.delete': 'Löschen',
    'common.edit': 'Bearbeiten',
    'common.close': 'Schließen',
    'common.yes': 'Ja',
    'common.no': 'Nein',
    'common.loading': 'Laden...',
    'common.error': 'Fehler',
    'common.success': 'Erfolg',

    // Statusbar
    'statusbar.noVault': 'Kein Vault',
    'statusbar.notes': 'Notizen',
    'statusbar.links': 'Links',

    // Titlebar Buttons
    'titlebar.textSplit': 'Text-Split: Zwei Notizen vergleichen',
    'titlebar.settings': 'Einstellungen (Cmd+,)',
    'titlebar.overdue': 'Überfällige Aufgaben',
    'titlebar.tags': 'Tags anzeigen',
    'titlebar.smartConnections': 'Smart Connections',
    'titlebar.notesChat': 'Notes Chat (mit Notizen chatten)',
    'titlebar.terminal': 'Terminal ein/ausblenden',

    // Text Split Placeholder
    'textSplit.placeholder.instruction': 'Cmd/Ctrl+Klick auf eine Notiz',
    'textSplit.placeholder.hint': 'um sie hier zu öffnen',

    // Tabs
    'tabs.allNotes': 'Alle Notizen',

    // Sidebar
    'sidebar.openVault': 'Vault öffnen (Cmd+O)',

    // Panels
    'panel.close': 'Schließen',
    'panel.overdueTasks': 'Überfällige Tasks',

    // PDF Viewer
    'pdf.zoomIn': 'Vergrößern',
    'pdf.zoomOut': 'Verkleinern',
    'pdf.reset': 'Zurücksetzen',
    'pdf.nextPage': 'Nächste Seite',
    'pdf.prevPage': 'Vorherige Seite',

    // Image Viewer
    'image.zoomIn': 'Vergrößern (+)',
    'image.resetZoom': 'Originalgröße (0)',

    // Terminal
    'terminal.close': 'Terminal schließen',

    // Canvas
    'canvas.reset': 'Zurücksetzen',
    'canvas.addCard': 'Neue Karte hinzufügen',
    'canvas.filterReset': 'Filter zurücksetzen',
    'canvas.focusMode': 'Fokus-Modus: Nur ausgewählte Karten anzeigen',
    'canvas.addToFocus': 'Auswahl zum Fokus hinzufügen',
    'canvas.layoutSelect': 'Layout-Algorithmus wählen',

    // Editor
    'editor.back': 'Zurück (Cmd+[)',
    'editor.forward': 'Vorwärts (Cmd+])',
    'editor.closePanel': 'Sekundäres Panel schließen',
    'editor.words': 'Wörter',
    'editor.readTime': 'Geschätzte Lesezeit',

    // Template Settings
    'templates.resetDefault': 'Auf Standard zurücksetzen',
    'templates.deleteTemplate': 'Template löschen',

    // Notes Chat
    'notesChat.socraticMode': 'Sokratischer Dialog - die KI stellt Rückfragen',

    // Smart Connections
    'smartConnections.folderProximity': 'Ordner-Nähe (5%)',
  },

  en: {
    // Settings Tabs
    'settings.title': 'Settings',
    'settings.tab.general': 'General',
    'settings.tab.editor': 'Editor',
    'settings.tab.templates': 'Templates',
    'settings.tab.integrations': 'Integrations',
    'settings.tab.shortcuts': 'Shortcuts',

    // General Settings
    'settings.general.theme': 'Theme',
    'settings.general.theme.light': 'Light',
    'settings.general.theme.dark': 'Dark',
    'settings.general.theme.system': 'System',
    'settings.general.language': 'Language',
    'settings.general.font': 'Font',
    'settings.general.accentColor': 'Accent Color',
    'settings.general.backgroundColor': 'Background',
    'settings.general.loadLastVault': 'Open last vault on startup',
    'settings.general.vault': 'Vault',
    'settings.general.currentVault': 'Current Vault',
    'settings.general.changeVault': 'Change Vault',
    'settings.general.noVault': 'No vault selected',

    // Editor Settings
    'settings.editor.fontSize': 'Font Size',
    'settings.editor.lineNumbers': 'Show line numbers',
    'settings.editor.defaultView': 'Default View',
    'settings.editor.defaultView.edit': 'Edit',
    'settings.editor.defaultView.preview': 'Preview',
    'settings.editor.defaultView.livePreview': 'Live Preview',
    'settings.editor.autoSave': 'Auto-Save',
    'settings.editor.autoSave.off': 'Off',
    'settings.editor.autoSave.ms': 'ms',

    // Templates
    'settings.templates.builtIn': 'Built-in Templates',
    'settings.templates.custom': 'Custom Templates',
    'settings.templates.addCustom': 'Add Custom Template',
    'settings.templates.name': 'Name',
    'settings.templates.content': 'Content',
    'settings.templates.save': 'Save',
    'settings.templates.delete': 'Delete',
    'settings.templates.variables': 'Available Variables',

    // Integrations
    'settings.integrations.ollama': 'Ollama (Local AI)',
    'settings.integrations.ollama.enabled': 'Enabled',
    'settings.integrations.ollama.model': 'Model',
    'settings.integrations.ollama.noModels': 'No models found',
    'settings.integrations.ollama.notRunning': 'Ollama is not running',
    'settings.integrations.zotero': 'Zotero',
    'settings.integrations.zotero.connect': 'Connect',
    'settings.integrations.zotero.connected': 'Connected',

    // Shortcuts
    'settings.shortcuts.description': 'Keyboard Shortcuts Reference',
    'settings.shortcuts.general': 'General',
    'settings.shortcuts.editor': 'Editor',
    'settings.shortcuts.navigation': 'Navigation',

    // View Modes
    'viewMode.editor': 'Editor',
    'viewMode.split': 'Split',
    'viewMode.canvas': 'Canvas',

    // Sidebar
    'sidebar.files': 'Files',
    'sidebar.search': 'Search',
    'sidebar.newNote': 'New Note',
    'sidebar.newFolder': 'New Folder',
    'sidebar.refresh': 'Refresh',

    // Canvas
    'canvas.allNotes': 'All Notes',
    'canvas.rootOnly': 'Root Level Only',
    'canvas.filter.clear': 'Clear filter',
    'canvas.notesCount': '{count} of {total} notes',
    'canvas.empty': 'No notes in selected folder',
    'canvas.showAll': 'Show all',
    'canvas.export.svg': 'Export as SVG',
    'canvas.layout': 'Layout',
    'canvas.layout.hierarchical': 'Hierarchical',
    'canvas.layout.grid': 'Grid',
    'canvas.layout.smartGrid': 'Smart Grid',
    'canvas.align.left': 'Align Left',
    'canvas.align.center': 'Center',
    'canvas.align.right': 'Align Right',
    'canvas.align.top': 'Align Top',
    'canvas.align.middle': 'Align Middle',
    'canvas.align.bottom': 'Align Bottom',
    'canvas.distribute.horizontal': 'Distribute Horizontally',
    'canvas.distribute.vertical': 'Distribute Vertically',
    'canvas.focus': 'Focus',
    'canvas.focus.enter': 'Focus Mode: Show only selected cards',
    'canvas.focus.add': 'Add selection to focus',
    'canvas.focus.remove': 'Remove selection from focus',
    'canvas.focus.exit': 'Exit',
    'canvas.focus.count': '{count} in focus',
    'canvas.selected': '{count} selected',

    // Context Menu
    'contextMenu.changeColor': 'Change Color',
    'contextMenu.delete': 'Delete',

    // Colors
    'color.default': 'Default',
    'color.red': 'Red',
    'color.orange': 'Orange',
    'color.yellow': 'Yellow',
    'color.green': 'Green',
    'color.blue': 'Blue',
    'color.purple': 'Purple',
    'color.pink': 'Pink',
    'color.gray': 'Gray',

    // Accent Colors
    'accent.blue': 'Blue',
    'accent.orange': 'Orange',
    'accent.green': 'Green',
    'accent.purple': 'Purple',
    'accent.pink': 'Pink',
    'accent.teal': 'Teal',

    // Dialogs
    'dialog.newNote.title': 'Create New Note',
    'dialog.newNote.name': 'Name',
    'dialog.newNote.template': 'Template',
    'dialog.newNote.create': 'Create',
    'dialog.newNote.cancel': 'Cancel',
    'dialog.newFolder.title': 'New Folder',
    'dialog.newFolder.name': 'Folder Name',
    'dialog.delete.confirm': 'Are you sure you want to delete?',

    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.close': 'Close',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',

    // Statusbar
    'statusbar.noVault': 'No Vault',
    'statusbar.notes': 'Notes',
    'statusbar.links': 'Links',

    // Titlebar Buttons
    'titlebar.textSplit': 'Text-Split: Compare two notes',
    'titlebar.settings': 'Settings (Cmd+,)',
    'titlebar.overdue': 'Overdue tasks',
    'titlebar.tags': 'Show tags',
    'titlebar.smartConnections': 'Smart Connections',
    'titlebar.notesChat': 'Notes Chat (chat with notes)',
    'titlebar.terminal': 'Toggle terminal',

    // Text Split Placeholder
    'textSplit.placeholder.instruction': 'Cmd/Ctrl+click on a note',
    'textSplit.placeholder.hint': 'to open it here',

    // Tabs
    'tabs.allNotes': 'All Notes',

    // Sidebar
    'sidebar.openVault': 'Open Vault (Cmd+O)',

    // Panels
    'panel.close': 'Close',
    'panel.overdueTasks': 'Overdue tasks',

    // PDF Viewer
    'pdf.zoomIn': 'Zoom in',
    'pdf.zoomOut': 'Zoom out',
    'pdf.reset': 'Reset',
    'pdf.nextPage': 'Next page',
    'pdf.prevPage': 'Previous page',

    // Image Viewer
    'image.zoomIn': 'Zoom in (+)',
    'image.resetZoom': 'Original size (0)',

    // Terminal
    'terminal.close': 'Close terminal',

    // Canvas
    'canvas.reset': 'Reset',
    'canvas.addCard': 'Add new card',
    'canvas.filterReset': 'Reset filter',
    'canvas.focusMode': 'Focus mode: Show only selected cards',
    'canvas.addToFocus': 'Add selection to focus',
    'canvas.layoutSelect': 'Select layout algorithm',

    // Editor
    'editor.back': 'Back (Cmd+[)',
    'editor.forward': 'Forward (Cmd+])',
    'editor.closePanel': 'Close secondary panel',
    'editor.words': 'Words',
    'editor.readTime': 'Estimated reading time',

    // Template Settings
    'templates.resetDefault': 'Reset to default',
    'templates.deleteTemplate': 'Delete template',

    // Notes Chat
    'notesChat.socraticMode': 'Socratic dialogue - AI asks follow-up questions',

    // Smart Connections
    'smartConnections.folderProximity': 'Folder proximity (5%)',
  }
} as const

// Translation function
export function t(key: TranslationKey, language: Language, params?: Record<string, string | number>): string {
  let text = translations[language][key] || translations.de[key] || key

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v))
    })
  }

  return text
}

// Hook for easy usage in components
import { useUIStore } from '../stores/uiStore'

export function useTranslation() {
  const language = useUIStore((state) => state.language)

  return {
    t: (key: TranslationKey, params?: Record<string, string | number>) => t(key, language, params),
    language
  }
}

export { translations }
export type { TranslationKey }
