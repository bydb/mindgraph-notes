// Brücke zu den Oberflächenaktionen, die nur App.tsx auslösen kann.
//
// Der Controller ist ein Store und kommt an tabStore/notesStore über getState() heran.
// Rechte Leiste, QuickSearch und Ansichtswechsel liegen dagegen als lokaler React-State
// in App.tsx. Statt diesen State in einen Store zu heben (und damit eine funktionierende
// Komponente umzubauen), meldet App.tsx hier einmalig seine Rückrufe an.
//
// Semantische Aktionen, keine simulierten Klicks oder Tastaturereignisse.

export interface VoiceUiBridge {
  /** Dashboard-Tab öffnen. Muss den Brain-Modus verlassen, sonst verdeckt der Canvas den Tab. */
  openDashboard(): void
  /** Volltextsuche mit vorbelegtem Suchbegriff öffnen. */
  openQuickSearch(query: string): void
  /** Rechte Leiste auf Aufgaben & Termine schalten. */
  openTasksPanel(): void
  /** Dialog für eine neue Notiz öffnen — genau das, was das Plus in der Seitenleiste tut. */
  newNote(): void
  /** Eine Aktion aus dem Befehlskatalog ausführen (für Folgeaktionen auf der Karte). */
  runCommand(commandId: string): void
  /** Ob ein Modul aktiv ist — eine ausgeschaltete Funktion darf nicht still scheitern. */
  isModuleEnabled(module: 'dashboard'): boolean
  /**
   * Genau die Aktionen, die die Palette gerade anzeigt (inklusive Modul-Filterung).
   * Der Rückfall bewertet damit den echten Bestand und keine zweite Liste.
   */
  getAvailableCommands(): Array<{ id: string; label: string; keywords?: string }>
}

let bridge: VoiceUiBridge | null = null

export function registerVoiceUiBridge(next: VoiceUiBridge): () => void {
  bridge = next
  return () => {
    if (bridge === next) bridge = null
  }
}

export function getVoiceUiBridge(): VoiceUiBridge | null {
  return bridge
}
