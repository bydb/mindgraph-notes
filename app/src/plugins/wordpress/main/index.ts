// WordPress-Plugin — Main-Entry. Registriert die Publishing-Actions (Credentials, Check,
// Post, Media-Upload). Herausgelöst aus edoobox (Paket 3): das App-Passwort liegt als
// Plugin-Secret `wpAppPassword` DIESES Plugins; HTTP läuft über host.http.fetch /
// fetchBasicAuth (Apache-Auth-Quirk) gegen den konfigurierten Host (resolveExtraAllowedHosts
// liest pluginConfig.wordpress.baseUrl).

import { definePluginMain } from '@mindgraph/plugin-api'
import { WordPressService } from '../service'
import { WORDPRESS_CAPABILITIES, manifest } from '../manifest'

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}

export default definePluginMain(
  { id: manifest.id, capabilities: WORDPRESS_CAPABILITIES },
  ({ host, actions }) => {
    host.log('register')

    const errMsg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback)

    // Baut einen WordPress-Client aus Payload-Koordinaten + hinterlegtem App-Passwort.
    const makeWp = async (siteUrl: string, username: string): Promise<WordPressService> => {
      const pw = await host.secrets.get('wpAppPassword')
      if (!pw) throw new Error('Kein WordPress App-Passwort gespeichert')
      return new WordPressService(siteUrl, username, pw, host.http.fetch, host.http.fetchBasicAuth)
    }

    actions.register('wordpress.saveCredentials', async (p) => {
      try {
        const { appPassword } = p as { appPassword: string }
        await host.secrets.set('wpAppPassword', appPassword)
        return true
      } catch {
        return false
      }
    })

    actions.register('wordpress.loadCredentials', async () => {
      const wpAppPassword = await host.secrets.get('wpAppPassword')
      return wpAppPassword ? { wpAppPassword } : null
    })

    actions.register('wordpress.check', async (p) => {
      try {
        const { siteUrl, username } = p as { siteUrl: string; username: string }
        const wp = await makeWp(siteUrl, username)
        const user = await wp.checkConnection()
        return { success: true, userName: user.name }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Verbindung fehlgeschlagen') }
      }
    })

    actions.register('wordpress.publishPost', async (p) => {
      try {
        const { siteUrl, username, title, content, status, featuredMediaId } = p as {
          siteUrl: string; username: string; title: string; content: string
          status: 'draft' | 'publish'; featuredMediaId?: number
        }
        const wp = await makeWp(siteUrl, username)
        const post = await wp.createPost(title, content, status, featuredMediaId)
        return { success: true, postId: post.id, postUrl: post.link, status: post.status }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Veröffentlichung fehlgeschlagen') }
      }
    })

    actions.register('wordpress.uploadImage', async (p) => {
      try {
        const { siteUrl, username, imageBase64, fileName, caption } = p as {
          siteUrl: string; username: string; imageBase64: string; fileName: string; caption?: string
        }
        const ext = (fileName.split('.').pop() || '').toLowerCase()
        const mimeType = IMAGE_MIME[ext] || 'image/jpeg'
        const wp = await makeWp(siteUrl, username)
        const media = await wp.uploadMedia(Buffer.from(imageBase64, 'base64'), fileName, mimeType, caption)
        return { success: true, mediaId: media.id, imageUrl: media.source_url }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Bild-Upload fehlgeschlagen') }
      }
    })
  }
)
