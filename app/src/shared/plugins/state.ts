// Plugin-Lebenszyklus in DREI orthogonalen Dimensionen.
//
// Eine vermischte Kette (bundled→enabled→configured→active) verwischt Gründe:
// reMarkable braucht z.B. keine Credentials, wäre also nie „configured" im Secret-Sinn.
// Getrennte Achsen lassen ein aktiviertes Plugin sauber anzeigen, WARUM es noch
// nicht nutzbar ist. Siehe docs/plugin-system-plan.md, Entscheidung #10.

/** Liegt das Plugin im Build vor? (Phase 1: immer entweder gebündelt oder fehlend.) */
export type InstallationState = 'bundled' | 'unavailable'

/** Laufzeit-Aktivierung — vom User/Settings gesteuert, mit Übergangszuständen. */
export type ActivationState =
  | 'disabled'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'error'

/** Ist das Plugin tatsächlich einsatzbereit, oder fehlt noch Konfiguration? */
export type ReadinessState = 'ready' | 'needs-configuration' | 'unavailable'

export interface PluginErrorInfo {
  message: string
  /** ISO-Zeitstempel, vom aufrufenden Prozess gesetzt. */
  at: string
}

/** Kombinierter Laufzeit-Zustand eines Plugins (eine Instanz pro Plugin-ID). */
export interface PluginRuntimeState {
  id: string
  version?: string
  installation: InstallationState
  activation: ActivationState
  readiness: ReadinessState
  error?: PluginErrorInfo
}

/** Frischer Default-Zustand für ein gebündeltes, noch nicht aktiviertes Plugin. */
export function initialPluginState(id: string, version?: string): PluginRuntimeState {
  return {
    id,
    version,
    installation: 'bundled',
    activation: 'disabled',
    readiness: 'unavailable',
  }
}

/** Genau dann nutzbar, wenn alle drei Achsen grün sind. */
export function isPluginUsable(s: PluginRuntimeState): boolean {
  return (
    s.installation === 'bundled' &&
    s.activation === 'active' &&
    s.readiness === 'ready'
  )
}

/** Menschlich lesbarer Grund, warum ein Plugin (noch) nicht nutzbar ist — oder null. */
export function pluginBlockedReason(s: PluginRuntimeState): string | null {
  if (s.installation !== 'bundled') return 'Plugin nicht installiert'
  if (s.activation === 'error') return s.error?.message ?? 'Plugin-Fehler'
  if (s.activation === 'disabled') return 'Plugin deaktiviert'
  if (s.activation === 'starting' || s.activation === 'stopping') return 'Plugin im Übergang'
  if (s.readiness === 'needs-configuration') return 'Konfiguration erforderlich'
  if (s.readiness === 'unavailable') return 'Plugin nicht verfügbar'
  return null
}
