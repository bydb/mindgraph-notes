// Plugin-Transport (Main) — registriert den EINEN generischen Kanal `plugin:invoke`.
//
// Generischer Kanal, NICHT-generische Actions: kein freier Methoden-Passthrough. Der
// Dispatcher prüft erst den Aufrufer (nur eigene MindGraph-webContents, nur Top-Frame),
// dann delegiert er an die Registry, die Activation/Capabilities/Schema prüft. Rückgabe
// immer normalisiert zu {ok,error}. Siehe docs/plugin-system-plan.md, Entscheidung #5.

import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { PluginRegistry } from './registry'
import type { PluginInvokeResult } from '../../shared/plugins/transport'
import { dispatchInvoke } from './transport-core'

/**
 * Akzeptiert nur Aufrufe aus einem eigenen App-Fenster (mainWindow/transportWindow) UND
 * nur aus dessen Top-Frame. Damit kann fremder, in Markdown eingebetteter Inhalt (iframe)
 * den Kanal selbst bei CSP-Bypass nicht ansprechen. Defense-in-Depth vor der Registry.
 */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const wc = event.sender
  const isOwnWindow = BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.webContents.id === wc.id
  )
  if (!isOwnWindow) return false
  // senderFrame fehlt nur in Randfällen; wenn vorhanden, muss es der Haupt-Frame sein.
  const frame = event.senderFrame
  if (frame && frame !== wc.mainFrame) return false
  return true
}

const REJECTED: PluginInvokeResult = { ok: false, error: 'Nicht autorisierter Aufrufer' }

/** Verdrahtet `plugin:invoke` + `plugin:list` gegen die übergebene Registry. Einmal beim Start. */
export function registerPluginTransport(registry: PluginRegistry): void {
  ipcMain.handle(
    'plugin:invoke',
    async (event, pluginId: unknown, actionId: unknown, payload: unknown): Promise<PluginInvokeResult> => {
      if (!isTrustedSender(event)) {
        console.warn('[plugin:invoke] Aufruf von nicht autorisiertem Sender abgelehnt')
        return REJECTED
      }
      return dispatchInvoke(registry, pluginId, actionId, payload)
    }
  )

  // Read-only: Laufzeitzustände für die Plugin-Verwaltungs-UI (keine Aktivierung über IPC).
  ipcMain.handle('plugin:list', async (event): Promise<PluginInvokeResult> => {
    if (!isTrustedSender(event)) return REJECTED
    return { ok: true, data: registry.list() }
  })

  // Lebenszyklus: der Modulschalter (Renderer) fährt das Plugin im Main-Prozess hoch/runter.
  // A-pre Schritt 1 — vorher flippte der Schalter nur Renderer-Flags, das Plugin lief immer.
  ipcMain.handle(
    'plugin:setEnabled',
    async (event, pluginId: unknown, enabled: unknown): Promise<PluginInvokeResult> => {
      if (!isTrustedSender(event)) return REJECTED
      if (typeof pluginId !== 'string') return { ok: false, error: 'Ungültige Plugin-ID' }
      if (typeof enabled !== 'boolean') return { ok: false, error: 'Ungültiges enabled-Flag' }
      try {
        const state = enabled
          ? await registry.activate(pluginId)
          : await registry.deactivate(pluginId)
        // Erfolg NUR, wenn der erwartete Endzustand erreicht ist. activate/deactivate fangen
        // Fehler intern und liefern einen error-Zustand — den NICHT als {ok:true} verpacken,
        // sonst behauptet die UI „aus", obwohl der Main-Prozess meldet, dass das Plugin evtl.
        // noch läuft (z.B. fehlgeschlagenes stop()). Jeder andere Zustand → {ok:false} → Rollback.
        const expected = enabled ? 'active' : 'disabled'
        if (state.activation !== expected) {
          return {
            ok: false,
            error:
              state.error?.message ??
              `Plugin '${pluginId}' ist nach ${enabled ? 'Aktivierung' : 'Deaktivierung'} im Zustand '${state.activation}'`,
          }
        }
        return { ok: true, data: state }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
