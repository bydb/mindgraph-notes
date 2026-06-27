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
import type { EdooboxEvent } from '../../../shared/types'

const DOCX_FILTER = [{ name: 'Word-Dokument', extensions: ['docx'] }]

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
  }
)
