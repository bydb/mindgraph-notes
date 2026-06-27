// Service-Facade-Bridge für die edoobox-Vertikale (Plugin-System Schritt 9, Phase 3b).
//
// Neben den Buchungs-DATEN (eventAgentBridge) brauchen einige Core-Stellen auch edoobox-
// SERVICE-Aufrufe: die Credential-UI (Settings/CredentialsSettings), der Workflow-Canvas
// (Credential-Presence) und der Editor (Notiz → WordPress publizieren). Damit diese NICHT
// hart `edooboxClient` (bzw. das Plugin) importieren, laufen sie über diese neutrale Facade.
//
// Das edoobox-Plugin (bzw. in 3b-i noch der Core-edooboxClient) REGISTRIERT sich als Provider.
// Ohne Provider (Plugin gelöscht) liefern die Methoden sichere Defaults → der Editor bleibt
// plugin-unabhängig und kompiliert weiter; WordPress-Publish ist dann schlicht nicht verfügbar.

/** Die Service-Methoden, die Core-Stellen über die Facade aufrufen (Untermenge von edooboxClient). */
export interface EdooboxServiceProvider {
  loadCredentials: () => Promise<{ apiKey: string; apiSecret: string } | null>
  saveCredentials: (apiKey: string, apiSecret: string) => Promise<boolean>
  check: (baseUrl: string, apiVersion: string) => Promise<{ success: boolean; error?: string }>
  marketingLoadCredentials: () => Promise<{ wpAppPassword?: string } | null>
  marketingSaveCredentials: (wpAppPassword: string) => Promise<boolean>
  marketingCheckWordpress: (siteUrl: string, username: string) => Promise<{ success: boolean; userName?: string; error?: string }>
  marketingUploadImage: (siteUrl: string, username: string, imageBase64: string, fileName: string, caption?: string) => Promise<{ success: boolean; mediaId?: number; imageUrl?: string; error?: string }>
  marketingPublishWordpress: (siteUrl: string, username: string, title: string, content: string, status: 'draft' | 'publish', featuredMediaId?: number) => Promise<{ success: boolean; postId?: number; postUrl?: string; status?: string; error?: string }>
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
  marketingLoadCredentials: () => (provider ? provider.marketingLoadCredentials() : Promise.resolve(null)),
  marketingSaveCredentials: (wpAppPassword) =>
    provider ? provider.marketingSaveCredentials(wpAppPassword) : Promise.resolve(false),
  marketingCheckWordpress: (siteUrl, username) =>
    provider ? provider.marketingCheckWordpress(siteUrl, username) : Promise.resolve({ success: false, error: PLUGIN_INACTIVE }),
  marketingUploadImage: (siteUrl, username, imageBase64, fileName, caption) =>
    provider
      ? provider.marketingUploadImage(siteUrl, username, imageBase64, fileName, caption)
      : Promise.resolve({ success: false, error: PLUGIN_INACTIVE }),
  marketingPublishWordpress: (siteUrl, username, title, content, status, featuredMediaId) =>
    provider
      ? provider.marketingPublishWordpress(siteUrl, username, title, content, status, featuredMediaId)
      : Promise.resolve({ success: false, error: PLUGIN_INACTIVE }),
}
