// Renderer-Client für die edoobox-Plugin-Vertikale (Phase 1). Spiegelt die alten
// window.electronAPI.edoobox*-Signaturen, routet aber durch den generischen Plugin-Transport
// (invokePlugin → plugin:invoke → Capability-Host). Die Action-Rückgaben behalten die alten
// {success,…}-Shapes, sodass agentStore/workflowStore unverändert weiterarbeiten.
//
// Hinweis: Vault-Pfad wird vom Host aufgelöst (lastKnownVaultPath) — loadEvents/saveEvents
// brauchen ihn NICHT mehr als Argument (anders als die alten IPC-Handler).

import { invokePlugin } from '../../../renderer/plugins/client'
import { registerEdooboxServiceProvider } from '../../../renderer/stores/edooboxServiceBridge'
import type {
  EdooboxEvent,
  EdooboxOffer,
  EdooboxCategory,
  EdooboxOfferDashboard,
  EdooboxBooking,
  EdooboxEventDate,
  EdooboxImportResult,
  IqReportData,
  AttendanceListData,
} from '../../../shared/types'

/** Rückgabe der DOCX-Export-Actions (Speichern via Dialog → Pfad | abgebrochen | Fehler). */
type DocxExportResult = { success: boolean; filePath?: string; canceled?: boolean; error?: string }

export const edooboxClient = {
  saveCredentials: (apiKey: string, apiSecret: string) =>
    invokePlugin<boolean>('edoobox', 'edoobox.saveCredentials', { apiKey, apiSecret }),

  loadCredentials: () =>
    invokePlugin<{ apiKey: string; apiSecret: string } | null>('edoobox', 'edoobox.loadCredentials'),

  check: (baseUrl: string, apiVersion: string) =>
    invokePlugin<{ success: boolean; error?: string }>('edoobox', 'edoobox.check', { baseUrl, apiVersion }),

  listOffers: (baseUrl: string, apiVersion: string) =>
    invokePlugin<{ success: boolean; offers?: EdooboxOffer[]; error?: string }>(
      'edoobox', 'edoobox.listOffers', { baseUrl, apiVersion }),

  listCategories: (baseUrl: string, apiVersion: string) =>
    invokePlugin<{ success: boolean; categories?: EdooboxCategory[]; error?: string }>(
      'edoobox', 'edoobox.listCategories', { baseUrl, apiVersion }),

  importEvent: (baseUrl: string, apiVersion: string, event: EdooboxEvent) =>
    invokePlugin<{ success: boolean; offerId?: string; error?: string }>(
      'edoobox', 'edoobox.importEvent', { baseUrl, apiVersion, event }),

  listOffersDashboard: (baseUrl: string, apiVersion: string, scope?: 'active' | 'past' | 'all') =>
    invokePlugin<{ success: boolean; offers?: EdooboxOfferDashboard[]; error?: string }>(
      'edoobox', 'edoobox.listOffersDashboard', { baseUrl, apiVersion, scope }),

  listBookings: (baseUrl: string, apiVersion: string, offerId: string) =>
    invokePlugin<{ success: boolean; bookings?: EdooboxBooking[]; error?: string }>(
      'edoobox', 'edoobox.listBookings', { baseUrl, apiVersion, offerId }),

  listDates: (baseUrl: string, apiVersion: string, offerId: string) =>
    invokePlugin<{ success: boolean; dates?: EdooboxEventDate[]; error?: string }>(
      'edoobox', 'edoobox.listDates', { baseUrl, apiVersion, offerId }),

  loadEvents: () =>
    invokePlugin<EdooboxEvent[]>('edoobox', 'edoobox.loadEvents'),

  saveEvents: (events: EdooboxEvent[]) =>
    invokePlugin<boolean>('edoobox', 'edoobox.saveEvents', { events }),

  // — DOCX-/Dialog-Actions (Phase 2) —
  parseFormular: () =>
    invokePlugin<EdooboxImportResult | null>('edoobox', 'edoobox.parseFormular'),

  generateIqReport: (data: IqReportData, suggestedFileName: string) =>
    invokePlugin<DocxExportResult>('edoobox', 'edoobox.generateIqReport', { data, suggestedFileName }),

  generateAttendanceList: (data: AttendanceListData, suggestedFileName: string) =>
    invokePlugin<DocxExportResult>('edoobox', 'edoobox.generateAttendanceList', { data, suggestedFileName }),

  // — Marketing: Ollama-Content + Bild-Auswahl. WordPress-Publishing = eigenes Plugin
  //   (wordpressServiceBridge), Bild-GENERIERUNG = Core-Modul image-generation. —
  marketingGenerateContent: (offerData: {
    name: string; description?: string; dateStart?: string; dateEnd?: string
    location?: string; maxParticipants?: number; speakers?: string[]; bookingUrl?: string
  }) =>
    invokePlugin<{ success: boolean; blogPost?: string; igCaption?: string; error?: string }>(
      'edoobox', 'edoobox.marketingGenerateContent', { offerData }),

  marketingSelectImage: () =>
    invokePlugin<{ fileName: string; imageBase64: string } | null>('edoobox', 'edoobox.marketingSelectImage'),
}

// Registriert die Credential-Methoden als Service-Provider der neutralen Facade,
// damit Core-Stellen (Settings/CredentialsSettings/WorkflowCanvas) NICHT direkt
// edooboxClient importieren.
registerEdooboxServiceProvider({
  loadCredentials: edooboxClient.loadCredentials,
  saveCredentials: edooboxClient.saveCredentials,
  check: edooboxClient.check,
})
