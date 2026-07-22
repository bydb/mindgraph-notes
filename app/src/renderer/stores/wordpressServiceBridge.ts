// Service-Facade-Bridge für das WordPress-Plugin (Paket 3 der Modul-Entflechtung).
//
// WordPress-Publishing wird an mehreren Core-Stellen gebraucht (Editor → „Zu WordPress
// veröffentlichen", Zugangsdaten-Tab) und vom edoobox-Marketing-Tab MITBENUTZT. Damit
// keiner davon das Plugin hart importiert, laufen alle über diese neutrale Facade.
//
// Das WordPress-Plugin registriert sich eager als Provider (renderer/wordpressClient.ts).
// Ohne Provider (Plugin gelöscht/inaktiv) liefern die Methoden sichere Defaults — die
// Aufrufer kompilieren weiter, Publishing ist schlicht nicht verfügbar (Deletion Test).

export interface WordpressServiceProvider {
  loadCredentials: () => Promise<{ wpAppPassword?: string } | null>
  saveCredentials: (appPassword: string) => Promise<boolean>
  check: (siteUrl: string, username: string) => Promise<{ success: boolean; userName?: string; error?: string }>
  uploadImage: (siteUrl: string, username: string, imageBase64: string, fileName: string, caption?: string) => Promise<{ success: boolean; mediaId?: number; imageUrl?: string; error?: string }>
  publishPost: (siteUrl: string, username: string, title: string, content: string, status: 'draft' | 'publish', featuredMediaId?: number) => Promise<{ success: boolean; postId?: number; postUrl?: string; status?: string; error?: string }>
}

let provider: WordpressServiceProvider | null = null

/** Vom WordPress-Plugin (eager beim Renderer-Start) aufgerufen. null hebt die Registrierung auf. */
export function registerWordpressServiceProvider(p: WordpressServiceProvider | null): void {
  provider = p
}

const PLUGIN_INACTIVE = 'WordPress-Modul nicht aktiv'

/** Facade — delegiert an den registrierten Provider oder liefert sichere Defaults. */
export const wordpressService: WordpressServiceProvider = {
  loadCredentials: () => (provider ? provider.loadCredentials() : Promise.resolve(null)),
  saveCredentials: (appPassword) => (provider ? provider.saveCredentials(appPassword) : Promise.resolve(false)),
  check: (siteUrl, username) =>
    provider ? provider.check(siteUrl, username) : Promise.resolve({ success: false, error: PLUGIN_INACTIVE }),
  uploadImage: (siteUrl, username, imageBase64, fileName, caption) =>
    provider
      ? provider.uploadImage(siteUrl, username, imageBase64, fileName, caption)
      : Promise.resolve({ success: false, error: PLUGIN_INACTIVE }),
  publishPost: (siteUrl, username, title, content, status, featuredMediaId) =>
    provider
      ? provider.publishPost(siteUrl, username, title, content, status, featuredMediaId)
      : Promise.resolve({ success: false, error: PLUGIN_INACTIVE }),
}
