// Generische Plugin-Konfiguration (A-pre Schritt 3b).
//
// Der Kern speichert Plugin-Settings GENERISCH unter `uiStore.pluginConfig[pluginId]` —
// ohne die Form eines konkreten Plugins zu kennen (kein `state.antares.*` mehr). Jedes Plugin
// bringt seine eigene Config-Form + Defaults mit und liest/schreibt über diese schmale API.
// Das ist die Vorstufe zu `@mindgraph/plugin-api` (A0): die Settings-Persistenz ist damit
// plugin-unabhängig, sodass eine Vertikale (perspektivisch) in ein eigenes Repo wandern kann.

import { useCallback, useMemo } from 'react'
import { useUIStore } from '../stores/uiStore'

/** Liest die pro-pluginId gespeicherte Config (mit Defaults gemerged) — NICHT reaktiv (für Stores). */
export function getPluginConfig<T extends object>(pluginId: string, defaults: T): T {
  const stored = useUIStore.getState().pluginConfig[pluginId] as Partial<T> | undefined
  return { ...defaults, ...(stored ?? {}) }
}

/** Reaktiver Zugriff auf die Plugin-Config + Patch-Setter (für Settings-UI). */
export function usePluginConfig<T extends object>(
  pluginId: string,
  defaults: T
): [T, (patch: Partial<T>) => void] {
  const stored = useUIStore((s) => s.pluginConfig[pluginId]) as Partial<T> | undefined
  const setPluginConfig = useUIStore((s) => s.setPluginConfig)
  // STABILE Referenz: `stored` ist ein stabiler Zustand-Selektor-Wert, `defaults` eine
  // Modul-Konstante. Ohne useMemo entstünde bei JEDEM Render ein neues Objekt → wer es in eine
  // useEffect/useMemo-Dependency steckt (z.B. CredentialsSettings), bekommt eine Render-Schleife
  // („Maximum update depth" / flackernde UI). Vgl. die Zustand-Selektor-Loop-Falle in CLAUDE.md.
  const config = useMemo(() => ({ ...defaults, ...(stored ?? {}) }), [stored, defaults])
  const setConfig = useCallback(
    (patch: Partial<T>) => setPluginConfig(pluginId, patch as Record<string, unknown>),
    [pluginId, setPluginConfig]
  )
  return [config, setConfig]
}

/** Reaktiver Enabled-Flag eines Plugin-Moduls (Default false). */
export function usePluginEnabled(pluginId: string): boolean {
  return useUIStore((s) => s.pluginConfig[pluginId]?.enabled === true)
}

/** Nicht-reaktiver Enabled-Check (für modules.ts isModuleEnabled). */
export function isPluginConfigEnabled(pluginId: string): boolean {
  return useUIStore.getState().pluginConfig[pluginId]?.enabled === true
}
