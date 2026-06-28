// edoobox-Workflow-Trigger-Provider — die Vertikale füllt den Trigger-Baustein
// `edoobox.newBooking`. Vorher lag die Baseline-Zähllogik + Item-Bau im Kern-`workflowStore`
// (Codex-Befund „edoobox-Baseline im Kern"); mit A-pre Schritt 4 wandert sie hierher. Gelesen
// werden Angebote/Buchungen über die NEUTRALE Core-Bridge `eventAgentBridge` (kein Provider →
// sichere No-ops). Fällt die Vertikale weg, registriert sich dieser Provider nicht mehr.

import type {
  WorkflowTriggerProvider,
  WorkflowTriggerLedger,
  WorkflowEventResult,
} from '@mindgraph/plugin-api'
import type { WorkflowSeedItem } from '../../../shared/workflow/model'
import type { EdooboxBooking, EdooboxOfferDashboard } from '../../../shared/types'
import { useEventAgentBridge } from '../../../renderer/stores/eventAgentBridge'

function formatBooking(o: EdooboxOfferDashboard, prev: number, neu: number): string {
  return [
    'Neue Anmeldung',
    `- Angebot: ${o.name}${o.number ? ` (Nr. ${o.number})` : ''}`,
    `- Anmeldungen gesamt: ${o.bookingCount} (vorher ${prev})`,
    `- Neu: ${neu}`,
    o.maxParticipants ? `- Plätze: ${o.bookingCount}/${o.maxParticipants}` : ''
  ].filter(Boolean).join('\n')
}
function formatBookingParticipant(o: EdooboxOfferDashboard, b: EdooboxBooking): string {
  return [
    'Neue Anmeldung',
    `- Angebot: ${o.name}${o.number ? ` (Nr. ${o.number})` : ''}`,
    `- Teilnehmer: ${b.userName || 'Unbekannt'}`,
    b.userEmail ? `- E-Mail: ${b.userEmail}` : '',
    b.schule ? `- Schule: ${b.schule}` : '',
    b.personalNr ? `- Personal-Nr: ${b.personalNr}` : '',
    b.bookedAt ? `- Gebucht am: ${b.bookedAt}` : '',
    o.maxParticipants ? `- Plätze: ${o.bookingCount}/${o.maxParticipants}` : ''
  ].filter(Boolean).join('\n')
}

function edooboxBookingToItem(o: EdooboxOfferDashboard, b: EdooboxBooking, newCount: number): WorkflowSeedItem {
  const text = formatBookingParticipant(o, b)
  return {
    itemKey: `booking:${o.id}:${b.id || o.bookingCount}`,
    text,
    meta: {
      offerId: o.id, bookingId: b.id, bookingCount: o.bookingCount, newCount,
      recipientEmail: b.userEmail, recipientName: b.userName, userEmail: b.userEmail, userName: b.userName,
      subject: `Neue Anmeldung: ${o.name}`
    },
    email: { id: `edoobox:${b.id || `${o.id}:${o.bookingCount}`}`, subject: `Neue Anmeldung: ${o.name}`, bodyText: text, from: b.userEmail, name: b.userName }
  }
}
function edooboxOfferToItem(o: EdooboxOfferDashboard, prev: number, newCount: number): WorkflowSeedItem {
  const text = formatBooking(o, prev, newCount)
  return {
    itemKey: `booking:${o.id}:${o.bookingCount}`,
    text,
    meta: { offerId: o.id, bookingCount: o.bookingCount, newCount, subject: `Neue Anmeldung: ${o.name}` },
    email: { id: `edoobox:${o.id}:${o.bookingCount}`, subject: `Neue Anmeldung: ${o.name}`, bodyText: text }
  }
}

const byBookedAtDesc = (a: EdooboxBooking, b: EdooboxBooking) =>
  (Date.parse(b.bookedAt || '') || 0) - (Date.parse(a.bookedAt || '') || 0)

// Buchungen pro Angebot EINMAL je Poll-Batch laden (mehrere Workflows derselben Quelle
// teilen sich den Scrape). Wird in prepareEvent geleert.
let bookingsCache = new Map<string, EdooboxBooking[]>()

async function bookingsFor(offerId: string): Promise<EdooboxBooking[]> {
  let bookings = bookingsCache.get(offerId)
  if (!bookings) {
    try { bookings = await useEventAgentBridge.getState().listBookings(offerId) } catch { bookings = [] }
    bookingsCache.set(offerId, bookings)
  }
  return bookings
}

/** Pure Event-Logik (für Tests von Bridge/Cache getrennt): Baseline-Delta pro Angebot, Items für
 *  neue Buchungen, `afterRun` rückt die Baseline vor. `getBookings` ist injiziert (real: Bridge+Cache). */
export async function buildEdooboxEvent(
  offers: EdooboxOfferDashboard[],
  getBookings: (offerId: string) => Promise<EdooboxBooking[]>,
  ledger: WorkflowTriggerLedger,
): Promise<WorkflowEventResult> {
  const items: WorkflowSeedItem[] = []
  // Baseline-Vergleich: pro Angebot den zuletzt gesehenen bookingCount merken; beim ersten
  // Sehen (prev = NaN) nur Baseline setzen (kein Fehlalarm gegen den Bestand). Baseline rückt
  // ERST in afterRun vor — und der Kern ruft afterRun nur bei vollständig erfolgreichem Lauf.
  const baselineUpdates: [string, string][] = []
  for (const o of offers) {
    const baseKey = `edoobox-count:${o.id}`
    const prev = Number(ledger.get(baseKey))
    if (Number.isFinite(prev) && o.bookingCount > prev) {
      const newCount = o.bookingCount - prev
      const fresh = (await getBookings(o.id)).slice().sort(byBookedAtDesc).slice(0, Math.max(1, newCount))
      if (fresh.length > 0) for (const b of fresh) items.push(edooboxBookingToItem(o, b, newCount))
      else items.push(edooboxOfferToItem(o, prev, newCount))
    }
    baselineUpdates.push([baseKey, String(o.bookingCount)])
  }
  return {
    items,
    trigger: 'event-external',
    emptyMessage: 'Keine neuen Anmeldungen.',
    afterRun: (l) => { for (const [k, v] of baselineUpdates) l.set(k, v) },
  }
}

export const edooboxTriggerProvider: WorkflowTriggerProvider = {
  triggerActionId: 'edoobox.newBooking',
  manualEmptyMessage: 'Keine Anmeldungen gefunden.',

  async prepareEvent(): Promise<void> {
    bookingsCache = new Map()
    try { await useEventAgentBridge.getState().loadOffers() } catch { /* keine/abgelaufene Credentials */ }
  },

  async collectManual(): Promise<WorkflowSeedItem | null> {
    const bridge = useEventAgentBridge.getState()
    try { await bridge.loadOffers() } catch { /* keine/abgelaufene Credentials */ }
    const offer = useEventAgentBridge.getState().offers.find(o => o.bookingCount > 0)
    if (!offer) return null
    let bookings: EdooboxBooking[] = []
    try { bookings = await bridge.listBookings(offer.id) } catch { bookings = [] }
    const b = bookings.slice().sort(byBookedAtDesc)[0]
    return b ? edooboxBookingToItem(offer, b, 1) : edooboxOfferToItem(offer, 0, offer.bookingCount)
  },

  async collectEvent(ledger: WorkflowTriggerLedger): Promise<WorkflowEventResult> {
    return buildEdooboxEvent(useEventAgentBridge.getState().offers, bookingsFor, ledger)
  },
}
