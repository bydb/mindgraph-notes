// Instanzsperre (Codex F25, 06.11.2026): je Profil (userData) läuft nur EINE MindGraph-Instanz.
//
// Zwei Instanzen mit demselben Profil — unter Windows/Linux reicht ein Doppelklick zu viel —
// schrieben gleichzeitig in dieselben Ablagen (Einstellungen, Mailliste, Zählungen …) und
// überschrieben sich gegenseitig. Electron bindet die Sperre an das userData-Verzeichnis: Dev-App
// („<App> (dev)“), installierte App und Testprofile (MINDGRAPH_USER_DATA_DIR) sperren sich also
// nicht gegenseitig. Ein zweiter Start mit demselben Profil beendet sich sofort und holt das
// vorhandene Fenster nach vorn.

/** Was die Fokuslogik vom Fenster braucht — als Schnittstelle, damit sie ohne Electron testbar ist. */
export interface FocusableWindow {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  isVisible(): boolean
  show(): void
  focus(): void
}

/**
 * Zweiter Start: vorhandenes Fenster wiederherstellen, zeigen, fokussieren. Gibt es keins mehr
 * (macOS nach dem Schließen aller Fenster), wird eins erzeugt.
 */
export function focusExistingWindow(win: FocusableWindow | null, createWindow: () => void): 'focused' | 'created' {
  if (!win || win.isDestroyed()) {
    createWindow()
    return 'created'
  }
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  return 'focused'
}
