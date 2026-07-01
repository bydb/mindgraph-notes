// Geteilte Wire-Typen für den Renderer-Plugin-Host (ADR plugin-renderer-host §5.3/§6). Single-Source
// für die IPC-Grenze: sowohl `main/plugins/rendererRuntime.ts` (Erzeuger) als auch das `ElectronAPI`-
// Interface (Konsument im Renderer) referenzieren GENAU diese Formen — kein Drift zwischen beiden Seiten.
//
// Bewusst byte-arm getrennt: der `RendererDescriptor` (Liste/Push) trägt KEINE Bytes; nur `RendererServe`
// (Antwort auf `plugin:rendererEntry`) liefert den verifizierten Code als utf8-String für den Blob-Import.

import type { FileEditorDecl } from '@mindgraph/plugin-api'

/** Byte-freie Beschreibung eines aktiven Renderer-Plugins (für Liste + `plugin:renderers-changed`-Push). */
export interface RendererDescriptor {
  pluginId: string
  pluginLabel: string
  version: string
  /** Routing-/Lifecycle-Mechanik (I-S1), KEINE Trust-Grenze. Wechselt bei jeder (Re-)Aktivierung. */
  rendererInstanceId: string
  fileEditors: FileEditorDecl[]
}

/** Antwort auf `plugin:rendererEntry`: die VERIFIZIERTEN Bytes (utf8) + Routing-Metadaten (I-L5). */
export interface RendererServe {
  rendererInstanceId: string
  pluginId: string
  pluginLabel: string
  version: string
  code: string
  styles?: string
  fileEditors: FileEditorDecl[]
}

/** Ergebnis von `plugin:renderers` (byte-frei). */
export type RendererListResult =
  | { ok: true; data: RendererDescriptor[] }
  | { ok: false; error: string }

/** Ergebnis von `plugin:rendererEntry` (verifizierte Bytes). */
export type RendererServeResult =
  | { ok: true; data: RendererServe }
  | { ok: false; error: string }

/** Ergebnis der `plugin:host`-Vault-Bridge (§5.4). Fehler sind normalisierte Messages (keine Main-Stacks, F13). */
export type RendererHostOpResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string }

/**
 * Renderer→Main Aktivierungs-Ack (F06/§5.2): nach `import(blob)` + `activate(host)` + Staging meldet der
 * Renderer den Ausgang für GENAU diese `rendererInstanceId` zurück. Main committet `active.json` erst nach
 * `{ ok: true }`. `phase` lokalisiert den Fehler (für UI/Logs); ein gescheiterter Ack rollt die Transaktion zurück.
 */
export type RendererActivateAck =
  | { ok: true; rendererInstanceId: string }
  | {
      ok: false
      rendererInstanceId: string
      error: string
      phase?: 'import' | 'contract' | 'activate' | 'register'
    }

/**
 * Renderer→Main Teardown-Ack (§5.2 Deactivate-Previous / §5.5-Matrix, F15/F16): nach einem gerichteten
 * Teardown-Request meldet der Renderer den Ausgang für GENAU diese rendererInstanceId zurück. Nur
 * `success` erlaubt Main den Nachfolgerstart/Commit; `error`/`timeout` sind fail-closed (restart-required).
 */
export type RendererTeardownAck = {
  rendererInstanceId: string
  outcome: 'success' | 'error' | 'timeout'
}
