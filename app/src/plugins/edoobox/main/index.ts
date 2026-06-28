// edoobox-Plugin — Main-Entry. Registriert die Backend-Actions (Phase 1 der Schritt-9-Vertikale).
//
// Importiert NIE rohes fs/net/electron: Netzwerk über host.http.fetch (allowedHosts-Gate),
// Credentials über host.secrets (safeStorage, pro Plugin genamespacet), events.json über
// host.vault (writeFileSafe-Pfad). Die Action-Rückgaben behalten BEWUSST die alten
// {success,…}-IPC-Shapes, damit agentStore/workflowStore unverändert weiterlaufen.

import { definePluginMain } from '../../../shared/plugins/entry'
import { EdooboxService } from '../service'
import { EDOOBOX_CAPABILITIES, manifest } from '../manifest'
import { parseAkkreditierungsformular } from '../formularParser'
import { generateIqReportBytes, IQ_TEMPLATE_NAME, type IqReportData } from '../iqReportService'
import { generateAttendanceListBytes, ATTENDANCE_TEMPLATE_NAME, type AttendanceListData } from '../attendanceListService'
import { WordPressService } from '../marketingService'
import { buildMarketingPrompts, type MarketingOfferData } from '../marketingContent'
import type { EdooboxEvent } from '../../../shared/types'

const DOCX_FILTER = [{ name: 'Word-Dokument', extensions: ['docx'] }]
const IMAGE_FILTER = [{ name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}

const EVENTS_REL_PATH = '.mindgraph/edoobox-events.json'

interface ApiPayload {
  baseUrl: string
  apiVersion: string
}

export default definePluginMain(
  { id: manifest.id, capabilities: EDOOBOX_CAPABILITIES },
  ({ host, actions }) => {
    host.log('register')

    // Baut einen Service aus Payload-Koordinaten (baseUrl/apiVersion) + hinterlegten Credentials.
    // Wirft, wenn keine Credentials da sind — die Actions fangen das in ihre {success:false}-Hülle.
    const makeService = async (payload: unknown): Promise<EdooboxService> => {
      const { baseUrl, apiVersion } = payload as ApiPayload
      const apiKey = await host.secrets.get('apiKey')
      const apiSecret = await host.secrets.get('apiSecret')
      if (!apiKey || !apiSecret) throw new Error('Keine Zugangsdaten gespeichert')
      return new EdooboxService(baseUrl, apiKey, apiSecret, host.http.fetch, apiVersion as 'v1' | 'v2')
    }

    const errMsg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback)

    // — Verbindungstest —
    actions.register('edoobox.check', async (p) => {
      try {
        const service = await makeService(p)
        await service.checkConnection()
        return { success: true }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Verbindung fehlgeschlagen') }
      }
    })

    // — Angebote auflisten —
    actions.register('edoobox.listOffers', async (p) => {
      try {
        const offers = await (await makeService(p)).listOffers()
        return { success: true, offers }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Angebote konnten nicht geladen werden') }
      }
    })

    // — Kategorien auflisten —
    actions.register('edoobox.listCategories', async (p) => {
      try {
        const categories = await (await makeService(p)).listCategories()
        return { success: true, categories }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Kategorien konnten nicht geladen werden') }
      }
    })

    // — Dashboard: Angebote mit Buchungszahlen —
    actions.register('edoobox.listOffersDashboard', async (p) => {
      try {
        const { scope } = p as { scope?: 'active' | 'past' | 'all' }
        const offers = await (await makeService(p)).listOffersForDashboard(scope || 'active')
        return { success: true, offers }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Dashboard konnte nicht geladen werden') }
      }
    })

    // — Dashboard: Buchungen für ein Angebot —
    actions.register('edoobox.listBookings', async (p) => {
      try {
        const { offerId } = p as { offerId: string }
        const bookings = await (await makeService(p)).listBookingsForOffer(offerId)
        return { success: true, bookings }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Buchungen konnten nicht geladen werden') }
      }
    })

    // — Termine für ein Angebot —
    actions.register('edoobox.listDates', async (p) => {
      try {
        const { offerId } = p as { offerId: string }
        const dates = await (await makeService(p)).listDatesForOffer(offerId)
        return { success: true, dates }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Termine konnten nicht geladen werden') }
      }
    })

    // — Event an edoobox senden (Offer + Place + Text + Dates) —
    actions.register('edoobox.importEvent', async (p) => {
      try {
        const { event } = p as {
          event: {
            id?: string; title: string; description: string; maxParticipants?: number;
            dates: Array<{ date: string; startTime: string; endTime: string }>;
            location?: string; price?: number; category?: string
          }
        }
        const service = await makeService(p)

        if (!event.category) return { success: false, error: 'Keine Kategorie ausgewählt' }

        const offerId = await service.createOffer({ name: event.title, category: event.category })

        const updateFields: Record<string, unknown> = {}
        if (event.maxParticipants) updateFields.user_maximum = event.maxParticipants
        if (event.price !== undefined) updateFields.price = event.price

        let placeId: string | undefined
        if (event.location) {
          try {
            const places = await service.listPlaces()
            const existing = places.find(pl => pl.name === event.location)
            placeId = existing ? existing.id : await service.createPlace(event.location)
            updateFields.place = placeId
          } catch (e) {
            console.warn('[edoobox] Could not create/find place:', e)
          }
        }

        if (Object.keys(updateFields).length > 0) {
          await service.updateOffer(offerId, updateFields)
        }

        if (event.description) {
          await service.createOfferText(offerId, 'de', event.description)
        }

        for (const d of event.dates) {
          await service.createDate(offerId, { ...d, placeId })
        }

        return { success: true, offerId }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Event konnte nicht erstellt werden') }
      }
    })

    // — Credentials (safeStorage via host.secrets, genamespacet) —
    actions.register('edoobox.saveCredentials', async (p) => {
      try {
        const { apiKey, apiSecret } = p as { apiKey: string; apiSecret: string }
        await host.secrets.set('apiKey', apiKey)
        await host.secrets.set('apiSecret', apiSecret)
        return true
      } catch {
        return false
      }
    })
    actions.register('edoobox.loadCredentials', async () => {
      const apiKey = await host.secrets.get('apiKey')
      const apiSecret = await host.secrets.get('apiSecret')
      if (!apiKey || !apiSecret) return null
      return { apiKey, apiSecret }
    })

    // — Events-Persistenz (JSON in .mindgraph/) —
    actions.register('edoobox.loadEvents', async () => {
      try {
        if (!(await host.vault.exists(EVENTS_REL_PATH))) return []
        const raw = await host.vault.read(EVENTS_REL_PATH)
        return JSON.parse(raw) as EdooboxEvent[]
      } catch (e) {
        console.error('[edoobox] Load events failed:', e)
        return []
      }
    })
    actions.register('edoobox.saveEvents', async (p) => {
      try {
        const { events } = p as { events: unknown[] }
        await host.vault.write(EVENTS_REL_PATH, JSON.stringify(events, null, 2))
        return true
      } catch (e) {
        console.error('[edoobox] Save events failed:', e)
        return false
      }
    })

    // — Akkreditierungsformular (DOCX) → Event. Datei via host.dialog (User-gewählt). —
    actions.register('edoobox.parseFormular', async () => {
      try {
        const picked = await host.dialog.openFile({ title: 'Akkreditierungsformular auswählen', filters: DOCX_FILTER })
        if (!picked) return null
        const fileName = picked.path.split(/[\\/]/).pop() || 'formular.docx'
        return await parseAkkreditierungsformular(picked.bytes, fileName)
      } catch (e) {
        console.error('[edoobox] Parse formular failed:', e)
        return null
      }
    })

    // — IQ-Auswertung (DOCX): Vorlage via host.resource, Speicherort via host.dialog. —
    actions.register('edoobox.generateIqReport', async (p) => {
      try {
        const { data, suggestedFileName } = p as { data: IqReportData; suggestedFileName: string }
        const templateBytes = await host.resource.read(IQ_TEMPLATE_NAME)
        const bytes = await generateIqReportBytes(data, templateBytes)
        const saved = await host.dialog.saveFile(
          { title: 'IQ-Auswertung speichern', defaultPath: suggestedFileName, filters: DOCX_FILTER },
          bytes
        )
        if (!saved) return { success: false, canceled: true }
        return { success: true, filePath: saved.path }
      } catch (e) {
        return { success: false, error: errMsg(e, 'IQ-Auswertung konnte nicht erstellt werden') }
      }
    })

    // — Teilnehmerliste (DOCX): Vorlage via host.resource, Speicherort via host.dialog. —
    actions.register('edoobox.generateAttendanceList', async (p) => {
      try {
        const { data, suggestedFileName } = p as { data: AttendanceListData; suggestedFileName: string }
        const templateBytes = await host.resource.read(ATTENDANCE_TEMPLATE_NAME)
        const bytes = await generateAttendanceListBytes(data, templateBytes)
        const saved = await host.dialog.saveFile(
          { title: 'Teilnehmerliste speichern', defaultPath: suggestedFileName, filters: DOCX_FILTER },
          bytes
        )
        if (!saved) return { success: false, canceled: true }
        return { success: true, filePath: saved.path }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Teilnehmerliste konnte nicht erstellt werden') }
      }
    })

    // ── Marketing (WordPress + Ollama-Content + Google Imagen) ──────────────────

    // Baut einen WordPress-Client aus Payload-Koordinaten + hinterlegtem App-Passwort.
    const makeWp = async (siteUrl: string, username: string): Promise<WordPressService> => {
      const pw = await host.secrets.get('wpAppPassword')
      if (!pw) throw new Error('Kein WordPress App-Passwort gespeichert')
      return new WordPressService(siteUrl, username, pw, host.http.fetch, host.http.fetchBasicAuth)
    }

    actions.register('edoobox.marketingSaveCredentials', async (p) => {
      try {
        const { wpAppPassword } = p as { wpAppPassword: string }
        await host.secrets.set('wpAppPassword', wpAppPassword)
        return true
      } catch {
        return false
      }
    })
    actions.register('edoobox.marketingLoadCredentials', async () => {
      const wpAppPassword = await host.secrets.get('wpAppPassword')
      return wpAppPassword ? { wpAppPassword } : null
    })

    actions.register('edoobox.marketingCheckWordpress', async (p) => {
      try {
        const { siteUrl, username } = p as { siteUrl: string; username: string }
        const wp = await makeWp(siteUrl, username)
        const user = await wp.checkConnection()
        return { success: true, userName: user.name }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Verbindung fehlgeschlagen') }
      }
    })

    actions.register('edoobox.marketingGenerateContent', async (p) => {
      try {
        const { offerData } = p as { offerData: MarketingOfferData }
        const { wpPrompt, igPrompt } = buildMarketingPrompts(offerData)
        const blogPost = (await host.llm.generate(wpPrompt, { temperature: 0.7, maxTokens: 2000 })).trim()
        const igCaption = (await host.llm.generate(igPrompt, { temperature: 0.8, maxTokens: 1000 })).trim()
        return { success: true, blogPost, igCaption }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Content-Generierung fehlgeschlagen') }
      }
    })

    actions.register('edoobox.marketingPublishWordpress', async (p) => {
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

    actions.register('edoobox.marketingUploadImage', async (p) => {
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

    // Google Imagen — liefert Base64 direkt zurück (keine Temp-Datei nötig).
    actions.register('edoobox.marketingGenerateImage', async (p) => {
      try {
        const { prompt, apiKey } = p as { prompt: string; apiKey: string }
        const res = await host.http.fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instances: [{ prompt }],
              parameters: { sampleCount: 1, aspectRatio: '16:9', safetyFilterLevel: 'block_only_high' },
            }),
            signal: AbortSignal.timeout(120000),
          }
        )
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`Imagen API Fehler (${res.status}): ${text.slice(0, 200)}`)
        }
        const data = await res.json()
        const predictions = (data.predictions as Array<{ bytesBase64Encoded?: string }> | undefined)?.filter(
          (pr) => pr.bytesBase64Encoded
        )
        if (!predictions || predictions.length === 0) {
          throw new Error(`Keine Bilder generiert: ${data.filteredReason || JSON.stringify(data).slice(0, 300)}`)
        }
        return { success: true, imageBase64: predictions[0].bytesBase64Encoded }
      } catch (e) {
        return { success: false, error: errMsg(e, 'Bildgenerierung fehlgeschlagen') }
      }
    })

    // Bild auswählen (Dialog) → Base64 + Dateiname (kein Pfad, keine Temp-Datei).
    actions.register('edoobox.marketingSelectImage', async () => {
      try {
        const picked = await host.dialog.openFile({ title: 'Bild auswählen', filters: IMAGE_FILTER })
        if (!picked) return null
        const fileName = picked.path.split(/[\\/]/).pop() || 'bild.png'
        return { fileName, imageBase64: Buffer.from(picked.bytes).toString('base64') }
      } catch (e) {
        console.error('[edoobox] Select image failed:', e)
        return null
      }
    })
  }
)
