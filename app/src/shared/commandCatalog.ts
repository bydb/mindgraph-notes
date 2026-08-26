// Statischer Bestand der Befehlspaletten-Aktionen.
//
// Vorher standen id, Label-Schlüssel und Suchwörter inline in App.tsx, verwoben mit
// den Callbacks. Damit war der Aktionsbestand von außen nicht lesbar — und der
// Sprachbefehl-Rückfall hätte gegen eine zweite, abschreibende Liste getestet werden
// müssen. Zwei Listen, die auseinanderlaufen, sind schlimmer als keine.
//
// `keywords` ist zugleich die WORTSCHATZ-Schicht: Menschen sagen „Design auf schwarz
// umstellen", nicht „Theme umschalten". Steht das gesagte Wort nirgends, findet weder
// die Palettensuche noch der Sprach-Rückfall die Aktion. Neue Einträge deshalb mit den
// Wörtern versehen, die Nutzer benutzen — nicht mit denen aus dem Label.
//
// Hier stehen nur Daten. Die Callbacks bleiben in App.tsx und werden über die id
// zugeordnet. `labelKey` ist bewusst `string` und kein TranslationKey, damit shared/
// nicht auf den Renderer zeigt; der Test in commandCatalog.test.ts prüft dafür, dass
// jeder Schlüssel in beiden Sprachen existiert.

export type CommandRequirement =
  | 'dashboard'
  | 'workflowCanvas'
  | 'smartConnections'
  | 'notesChat'
  | 'flashcards'
  | 'email'
  | 'edoobox'
  | 'semanticScholar'
  | 'zotero'
  | 'transport'

export interface CommandDescriptor {
  id: string
  labelKey: string
  categoryKey: string
  keywords: string
  shortcut?: string
  /** Nur sichtbar, wenn das Modul aktiv ist. Fehlt der Eintrag, ist die Aktion immer da. */
  requires?: CommandRequirement
}

const RAW_COMMAND_CATALOG = [
  { id: 'view-editor', labelKey: 'commandPalette.viewEditor', categoryKey: 'commandPalette.cat.view', keywords: 'editor view ansicht' },
  { id: 'view-split', labelKey: 'commandPalette.viewSplit', categoryKey: 'commandPalette.cat.view', keywords: 'split view ansicht' },
  { id: 'view-brain', labelKey: 'commandPalette.viewBrain', categoryKey: 'commandPalette.cat.view', keywords: 'graph canvas brain mindgraph netzwerk verknuepfungen beziehungen' },
  { id: 'open-dashboard', labelKey: 'commandPalette.openDashboard', categoryKey: 'commandPalette.cat.view', keywords: 'dashboard widgets', requires: 'dashboard' },
  { id: 'open-workflow', labelKey: 'commandPalette.openWorkflow', categoryKey: 'commandPalette.cat.view', keywords: 'workflow automation canvas', requires: 'workflowCanvas' },
  { id: 'open-agent', labelKey: 'commandPalette.openAgent', categoryKey: 'commandPalette.cat.view', keywords: 'agent ki ai ordner auswerten tabellen' },

  { id: 'panel-tasks', labelKey: 'commandPalette.panelTasks', categoryKey: 'commandPalette.cat.panels', keywords: 'tasks aufgaben termine overdue todo todos erledigen faellig ueberfaellig' },
  { id: 'panel-tags', labelKey: 'commandPalette.panelTags', categoryKey: 'commandPalette.cat.panels', keywords: 'tags schlagworte' },
  { id: 'panel-smart', labelKey: 'commandPalette.panelSmart', categoryKey: 'commandPalette.cat.panels', keywords: 'smart connections similar aehnlich', requires: 'smartConnections' },
  { id: 'panel-chat', labelKey: 'commandPalette.panelChat', categoryKey: 'commandPalette.cat.panels', keywords: 'chat ki ai notes', requires: 'notesChat' },
  { id: 'panel-flashcards', labelKey: 'commandPalette.panelFlashcards', categoryKey: 'commandPalette.cat.panels', keywords: 'flashcards karteikarten lernen', requires: 'flashcards' },
  { id: 'panel-inbox', labelKey: 'commandPalette.panelInbox', categoryKey: 'commandPalette.cat.panels', keywords: 'email inbox posteingang mail', requires: 'email' },
  { id: 'panel-agent', labelKey: 'commandPalette.panelAgent', categoryKey: 'commandPalette.cat.panels', keywords: 'agent edoobox veranstaltungen events', requires: 'edoobox' },
  { id: 'llm-performance', labelKey: 'commandPalette.llmPerformance', categoryKey: 'commandPalette.cat.panels', keywords: 'leistung geschwindigkeit token modell performance speed tokens' },
  { id: 'open-comparison', labelKey: 'commandPalette.openComparison', categoryKey: 'commandPalette.cat.view', keywords: 'vergleich kampagne studie messen konventionell gegenprobe wirklich schneller belegen nachweis controlling' },
  { id: 'panel-scholar', labelKey: 'commandPalette.panelScholar', categoryKey: 'commandPalette.cat.panels', keywords: 'semantic scholar paper research', requires: 'semanticScholar' },

  { id: 'new-note', labelKey: 'commandPalette.newNote', categoryKey: 'commandPalette.cat.search', keywords: 'neue notiz anlegen erstellen new note create', shortcut: 'Cmd+N' },
  { id: 'open-quick-search', labelKey: 'commandPalette.quickSearch', categoryKey: 'commandPalette.cat.search', keywords: 'suche search volltext finden durchsuchen notizen', shortcut: 'Cmd+P' },
  { id: 'open-quick-switcher', labelKey: 'commandPalette.quickSwitcher', categoryKey: 'commandPalette.cat.search', keywords: 'switcher notiz wechseln open note', shortcut: 'Cmd+K' },
  { id: 'open-templates', labelKey: 'commandPalette.templates', categoryKey: 'commandPalette.cat.search', keywords: 'template vorlage einfuegen', shortcut: 'Cmd+Shift+T' },
  { id: 'open-zotero', labelKey: 'commandPalette.zotero', categoryKey: 'commandPalette.cat.search', keywords: 'zotero literatur bibliothek', shortcut: 'Cmd+Shift+Z', requires: 'zotero' },

  { id: 'open-transport', labelKey: 'commandPalette.transport', categoryKey: 'commandPalette.cat.tools', keywords: 'transport schnellerfassung capture', requires: 'transport' },
  { id: 'toggle-terminal', labelKey: 'commandPalette.terminal', categoryKey: 'commandPalette.cat.tools', keywords: 'terminal shell konsole kommandozeile befehlszeile' },
  { id: 'toggle-sidebar', labelKey: 'commandPalette.sidebar', categoryKey: 'commandPalette.cat.tools', keywords: 'sidebar seitenleiste navigation dateibaum ausblenden einblenden' },
  { id: 'toggle-theme', labelKey: 'commandPalette.theme', categoryKey: 'commandPalette.cat.tools', keywords: 'theme dark light hell dunkel design darstellung erscheinungsbild aussehen schwarz weiss dunkelmodus nachtmodus umstellen' },
  { id: 'open-settings', labelKey: 'commandPalette.settings', categoryKey: 'commandPalette.cat.tools', keywords: 'settings einstellungen preferences optionen konfiguration einrichten', shortcut: 'Cmd+,' },
  { id: 'open-settings-modules', labelKey: 'commandPalette.settingsModules', categoryKey: 'commandPalette.cat.tools', keywords: 'module plugins aktivieren' },
  { id: 'open-help', labelKey: 'commandPalette.help', categoryKey: 'commandPalette.cat.tools', keywords: 'hilfe help guide uebersicht anleitung erklaerung handbuch', shortcut: 'Cmd+/' }
] as const satisfies readonly CommandDescriptor[]

/**
 * `as const` verengt jeden Eintrag auf seine eigenen Felder — ohne diese Verbreiterung
 * hätte ein Eintrag ohne `requires` die Eigenschaft gar nicht, und jeder Zugriff darauf
 * wäre ein Typfehler. Die id-Union stammt trotzdem aus den Rohdaten.
 */

/**
 * Union aller ids. App.tsx deklariert seine Callback-Tabelle als `Record<CommandId, ...>` —
 * damit bricht der Typecheck, sobald hier ein Eintrag dazukommt, für den es keinen
 * Callback gibt. Das ist die Zusage, dass Katalog und Verhalten nicht auseinanderlaufen.
 */
export type CommandId = (typeof RAW_COMMAND_CATALOG)[number]['id']

export const COMMAND_CATALOG: ReadonlyArray<CommandDescriptor & { id: CommandId }> = RAW_COMMAND_CATALOG

export const COMMAND_IDS: readonly CommandId[] = COMMAND_CATALOG.map(c => c.id)
