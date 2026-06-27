// Renderer-Client für den Plugin-Transport. Packt die {ok,error}-Hülle aus, sodass der
// aufrufende Code mit Promise<T> + throw arbeitet wie bei jedem anderen async-Aufruf.

import type { PluginInvokeResult } from '../../shared/plugins/transport'
import type { PluginRuntimeState } from '../../shared/plugins/state'

/** Ruft eine Plugin-Action auf; wirft mit der normalisierten Fehlermeldung bei !ok. */
export async function invokePlugin<T = unknown>(
  pluginId: string,
  actionId: string,
  payload?: unknown
): Promise<T> {
  const res = (await window.electronAPI.pluginInvoke(pluginId, actionId, payload)) as PluginInvokeResult
  if (!res.ok) {
    throw new Error(res.error ?? `Plugin-Aufruf '${pluginId}.${actionId}' fehlgeschlagen`)
  }
  return res.data as T
}

/** Liest die Laufzeitzustände aller Plugins (für die Verwaltungs-UI). */
export async function listPlugins(): Promise<PluginRuntimeState[]> {
  const res = (await window.electronAPI.pluginList()) as PluginInvokeResult
  if (!res.ok) throw new Error(res.error ?? 'Plugin-Liste konnte nicht geladen werden')
  return (res.data as PluginRuntimeState[]) ?? []
}
