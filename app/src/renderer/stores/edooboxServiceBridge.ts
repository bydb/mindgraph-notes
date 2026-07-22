// Service-Facade-Bridge für die edoobox-Vertikale (Plugin-System Schritt 9, Phase 3b).
//
// Neben den Buchungs-DATEN (eventAgentBridge) brauchen einige Core-Stellen auch edoobox-
// SERVICE-Aufrufe: die Credential-UI (Settings/CredentialsSettings) und der Workflow-Canvas
// (Credential-Presence). Damit diese NICHT hart `edooboxClient` (bzw. das Plugin)
// importieren, laufen sie über diese neutrale Facade. WordPress-Publishing lief früher
// auch hier — seit Paket 3 der Modul-Entflechtung ist das die eigene wordpressServiceBridge.
//
// Das edoobox-Plugin REGISTRIERT sich als Provider. Ohne Provider (Plugin gelöscht)
// liefern die Methoden sichere Defaults → die Aufrufer kompilieren weiter.

/** Die Service-Methoden, die Core-Stellen über die Facade aufrufen (Untermenge von edooboxClient). */
export interface EdooboxServiceProvider {
  loadCredentials: () => Promise<{ apiKey: string; apiSecret: string } | null>
  saveCredentials: (apiKey: string, apiSecret: string) => Promise<boolean>
  check: (baseUrl: string, apiVersion: string) => Promise<{ success: boolean; error?: string }>
}

let provider: EdooboxServiceProvider | null = null

/** Vom edoobox-Plugin (eager beim Renderer-Start) aufgerufen. null hebt die Registrierung auf. */
export function registerEdooboxServiceProvider(p: EdooboxServiceProvider | null): void {
  provider = p
}

const PLUGIN_INACTIVE = 'edoobox-Modul nicht aktiv'

/** Facade — delegiert an den registrierten Provider oder liefert sichere Defaults. */
export const edooboxService: EdooboxServiceProvider = {
  loadCredentials: () => (provider ? provider.loadCredentials() : Promise.resolve(null)),
  saveCredentials: (apiKey, apiSecret) => (provider ? provider.saveCredentials(apiKey, apiSecret) : Promise.resolve(false)),
  check: (baseUrl, apiVersion) =>
    provider ? provider.check(baseUrl, apiVersion) : Promise.resolve({ success: false, error: PLUGIN_INACTIVE }),
}
