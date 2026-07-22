// Renderer-Client des WordPress-Plugins. Routet durch den generischen Plugin-Transport
// (invokePlugin → plugin:invoke → Capability-Host) und registriert sich eager als Provider
// der neutralen wordpressServiceBridge — Core-Stellen (Editor, Zugangsdaten-Tab) und das
// edoobox-Plugin (Marketing-Tab) rufen NUR die Bridge, nie diesen Client direkt.

import { invokePlugin } from '../../../renderer/plugins/client'
import { registerWordpressServiceProvider } from '../../../renderer/stores/wordpressServiceBridge'

export const wordpressClient = {
  saveCredentials: (appPassword: string) =>
    invokePlugin<boolean>('wordpress', 'wordpress.saveCredentials', { appPassword }),

  loadCredentials: () =>
    invokePlugin<{ wpAppPassword: string } | null>('wordpress', 'wordpress.loadCredentials'),

  check: (siteUrl: string, username: string) =>
    invokePlugin<{ success: boolean; userName?: string; error?: string }>(
      'wordpress', 'wordpress.check', { siteUrl, username }),

  publishPost: (
    siteUrl: string, username: string, title: string, content: string,
    status: 'draft' | 'publish', featuredMediaId?: number
  ) =>
    invokePlugin<{ success: boolean; postId?: number; postUrl?: string; status?: string; error?: string }>(
      'wordpress', 'wordpress.publishPost', { siteUrl, username, title, content, status, featuredMediaId }),

  uploadImage: (siteUrl: string, username: string, imageBase64: string, fileName: string, caption?: string) =>
    invokePlugin<{ success: boolean; mediaId?: number; imageUrl?: string; error?: string }>(
      'wordpress', 'wordpress.uploadImage', { siteUrl, username, imageBase64, fileName, caption }),
}

registerWordpressServiceProvider({
  loadCredentials: wordpressClient.loadCredentials,
  saveCredentials: wordpressClient.saveCredentials,
  check: wordpressClient.check,
  uploadImage: wordpressClient.uploadImage,
  publishPost: wordpressClient.publishPost,
})
