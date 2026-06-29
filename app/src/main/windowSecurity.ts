// Zentrale, sichere Basis-WebPreferences für ALLE App-eigenen Fenster (Prep-Security für den
// Renderer-Plugin-Spike, ADR docs/plugin-renderer-widgets-plan.md §6 I-A2/I-A5).
//
// Pinnt die Isolations-Invarianten EXPLIZIT, statt auf Electron-Defaults zu vertrauen: so fällt eine
// spätere versehentliche Lockerung — oder ein neues Fenster ohne diese Basis — im Test auf
// (windowSecurity.test.ts scannt jedes `new BrowserWindow`). Jedes Fenster spreadet diese Konstante
// in seine `webPreferences` und ergänzt nur preload/sandbox nach Bedarf.
//
// `import type` ist zur Laufzeit erased → dieses Modul zieht KEIN Electron (ohne Electron testbar).
import type { WebPreferences } from 'electron'

export const SECURE_WEB_PREFERENCES = {
  /** Renderer-Welt vom Node/Preload-Kontext trennen (kein direkter electron/Node-Zugriff). */
  contextIsolation: true,
  /** Kein Node im Renderer. */
  nodeIntegration: false,
  /** Kein Node/preload in Sub-Frames → ein eingebettetes <iframe> bekommt NIE electronAPI. */
  nodeIntegrationInSubFrames: false,
  /** <webview> aus — würde eine eigene, schwer kontrollierbare preload-Fläche öffnen. */
  webviewTag: false,
  /** Same-Origin-Policy aktiv — die opaque-Origin-Isolation künftiger Plugin-Frames hängt daran;
   *  NIE für ein App-eigenes Fenster lockern. */
  webSecurity: true,
} as const satisfies WebPreferences
