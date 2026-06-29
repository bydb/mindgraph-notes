// Transport-Kern — die reine, electron-freie Hälfte des `plugin:invoke`-Dispatchers.
//
// Validiert die rohen IPC-Argumente und normalisiert Erfolg/Fehler zu PluginInvokeResult.
// Die Registry führt drinnen Activation-/Capability-/Schema-Checks aus (registry.invoke);
// hier wird NUR aus dem Renderer kommender Müll abgefangen und alles in {ok,error} gegossen.
// Getrennt von transport.ts (electron), damit dieser Kern ohne Electron testbar bleibt.

import type { PluginInvokeResult } from '../../shared/plugins/transport'

/** Strukturelle Sicht auf die Registry — entkoppelt den Kern von der konkreten Klasse. */
export interface InvokableRegistry {
  invoke(pluginId: string, actionId: string, payload: unknown): Promise<unknown>
}

/**
 * Ist der `senderFrame` eines IPC-Events der erlaubte Haupt-Frame? STRIKT + fail-closed: ein
 * fehlender Frame (null/undefined) → false. Ein Sub-/Plugin-Frame darf privilegierte Kanäle nie
 * ansprechen. Pure Identitätsprüfung (electron-frei) → ohne Electron testbar. Genutzt von
 * isTrustedSender (transport.ts). Siehe ADR §6 I-A4.
 */
export function isMainFrameSender(senderFrame: unknown, mainFrame: unknown): boolean {
  return senderFrame != null && senderFrame === mainFrame
}

/**
 * Führt einen Plugin-Aufruf aus und normalisiert das Ergebnis. Wirft NIE — jeder Fehler
 * (ungültige Argumente, unbekanntes Plugin/Action, Schema-Verstoß, Executor-Exception)
 * wird zu {ok:false,error}. Die Sender-/Frame-Prüfung passiert davor in transport.ts.
 */
export async function dispatchInvoke(
  registry: InvokableRegistry,
  pluginId: unknown,
  actionId: unknown,
  payload: unknown
): Promise<PluginInvokeResult> {
  if (typeof pluginId !== 'string' || typeof actionId !== 'string') {
    return { ok: false, error: 'Ungültige Aufruf-Parameter: pluginId und actionId müssen Strings sein' }
  }
  try {
    const data = await registry.invoke(pluginId, actionId, payload)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
