// Renderer-Host-Vertrag — die plugin-zugewandte Grenze für SIGNIERTE externe Renderer-Plugins, die
// ihr Renderer-JS direkt in den Haupt-Renderer laden (ADR plugin-renderer-host §6/§7, Option A).
//
// EHRLICH (ADR §4): Ein externes Renderer-Plugin läuft VOLL VERTRAUT im Top-Frame desselben Renderers
// und erreicht `window.electronAPI` direkt. Dieses Host-Objekt ist ein KOMFORT-/Kompatibilitäts-
// interface (einheitliche Vault-Pfade über die `plugin:host`-Bridge), KEINE Sicherheits-Seam — es hält
// ein bösartiges signiertes Plugin nicht ab. Die harten Grenzen bleiben `writeFileSafe`/
// `assertApprovedVault` + der leere Prod-Keyring. Vertrauen entsteht aus Signatur + Autorvertrauen.
//
// NICHT zu verwechseln mit `PluginRendererEntry` (entry.ts) — das ist der GEBÜNDELTE Slot-Pfad
// (React-Komponenten an benannte Slots). Dieser Vertrag ist der EXTERNE, disk-installierte
// Datei-Editor-Pfad mit eigener React-Root im gemeinsamen Realm.

/**
 * Imperativer Mount-Vertrag (ADR §7, R1-F10) — eng benannt: „eigene React-Root im GEMEINSAMEN Realm",
 * KEINE Isolation. Das Plugin bündelt sein EIGENES React und mountet imperativ in den vom Host
 * gestellten Container (`createRoot(container).render(...)`); der Host bekommt KEINE React-Component
 * (Dual-React-Bruch). Rückgabe = `dispose`: muss Timer/Listener/Theme-Subscriptions/React-Root
 * abräumen (gemeinsamer Realm, kein Schutz — Teardown ist best-effort, §9 I-S4).
 */
export type FileEditorMount = (
  container: HTMLElement,
  ctx: { filePath: string; host: PluginRendererHost },
) => () => void

/**
 * Komfort-Vault-Zugriff über die `plugin:host`-Bridge (geht durch `writeFileSafe`/`assertApprovedVault`,
 * einheitliche Vault-relative Pfade). KEINE Grenze gegen das Plugin (es hat `electronAPI`) — nur
 * ergonomisch und least-surprise. Alle Pfade sind relativ zum aktiven Vault.
 */
export interface PluginRendererVault {
  read(relPath: string): Promise<string>
  readBytes(relPath: string): Promise<Uint8Array>
  exists(relPath: string): Promise<boolean>
  write(relPath: string, content: string): Promise<void>
  writeBytes(relPath: string, bytes: Uint8Array): Promise<void>
}

/** Das Host-Objekt, das ein externes Renderer-Plugin in `activate(host)` erhält (ADR §6). */
export interface PluginRendererHost {
  /** Eigene Plugin-ID — muss zum geladenen Descriptor passen (der Host prüft das beim Laden). */
  readonly id: string
  /**
   * Bindet eine Mount-Funktion an eine im Manifest DEKLARIERTE `editorId` (`ui.fileEditors`). Es werden
   * hier KEINE Endungen genannt — die kommen ausschließlich aus dem signierten Manifest (§8), damit das
   * Routing deterministisch und vor Code-Ausführung bekannt bleibt. Jede deklarierte `editorId` muss
   * GENAU EINMAL registriert werden; unbekannt/doppelt/fehlend lässt die Aktivierung terminal scheitern.
   */
  registerFileEditor(opts: { editorId: string; mount: FileEditorMount }): void
  /** Komfort-Vault-Bridge (siehe `PluginRendererVault`). */
  readonly vault: PluginRendererVault
  /** Aktuelles Host-Theme (live — spiegelt spätere Wechsel wider). */
  readonly theme: 'light' | 'dark'
  /** Abonniert Theme-Wechsel; Rückgabe = unsubscribe. */
  onThemeChange(cb: (theme: 'light' | 'dark') => void): () => void
  /** Plugin-geprefixtes Logging in die Renderer-Konsole. */
  log(...args: unknown[]): void
}

/**
 * Strikter Default-Export-Vertrag eines externen Renderer-Plugins (ADR §6, R1-F11). Das Plugin-Bundle
 * (`renderer.js`, Single-File-ESM) `export default`et dieses Objekt. `import(blobUrl)` führt bereits
 * Top-Level-Code aus; der Host validiert NUR die Form (`{ id, activate }`) und ruft `activate(host)`
 * STAGED auf (Contributions erst nach erfolgreichem Ack veröffentlicht). `id` muss zum Descriptor passen.
 */
export interface PluginRendererModule {
  /** Plugin-ID — muss zum signierten Manifest/Descriptor passen. */
  id: string
  /** Wird beim Aktivieren genau einmal aufgerufen; registriert die deklarierten File-Editoren. */
  activate(host: PluginRendererHost): void | Promise<void>
  /** Optionaler Teardown beim Entladen (Disable/Upgrade/Uninstall) — best-effort, §9 I-S4. */
  deactivate?(): void | Promise<void>
}
