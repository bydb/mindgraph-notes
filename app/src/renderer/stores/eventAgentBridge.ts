// Bridge-Seam für die edoobox-Veranstaltungs-Vertikale (Plugin-System Schritt 9, Phase 3).
//
// Core-Konsumenten (Dashboard, Morning-Briefing, Kontakt-Aggregation, Workflow-Trigger,
// Email-KI-Kontext) brauchen die edoobox-Buchungsdaten — dürfen aber NICHT mehr hart den
// Plugin-Store (`agentStore`) oder `edooboxClient` importieren (sonst bricht der Deletion-Test).
//
// Stattdessen lesen sie aus dieser neutralen, Core-eigenen Bridge. Das edoobox-Plugin
// REGISTRIERT sich als Provider (registerProvider) und füttert `offers`. Ist das Plugin nicht
// aktiv / gelöscht, bleibt der Provider null → loadOffers/listBookings sind sichere No-ops und
// `offers` bleibt leer. Die edoobox-DATENTYPEN bleiben in shared/types.ts (Core), nur die
// LAUFZEIT-Kopplung läuft über diese Schnittstelle.

import { create } from 'zustand'
import type { EdooboxOfferDashboard, EdooboxBooking } from '../../shared/types'

/** Vom edoobox-Plugin registrierte Daten-Provider (nutzen intern edooboxClient + uiStore). */
export interface EventAgentProvider {
  loadOffers: (opts?: { includeBookings?: boolean; scope?: 'active' | 'past' | 'all' }) => Promise<EdooboxOfferDashboard[]>
  listBookings: (offerId: string) => Promise<EdooboxBooking[]>
}

interface EventAgentBridgeState {
  /** Zuletzt geladene Dashboard-Angebote (inkl. Buchungen). Leer ohne aktives Plugin. */
  offers: EdooboxOfferDashboard[]
  setOffers: (offers: EdooboxOfferDashboard[]) => void

  _provider: EventAgentProvider | null
  /** Vom Plugin aufgerufen (eager beim Renderer-Start). null hebt die Registrierung auf. */
  registerProvider: (provider: EventAgentProvider | null) => void

  /** Lädt die Angebote über den Provider und legt sie in `offers` ab. No-op ohne Provider. */
  loadOffers: (opts?: { includeBookings?: boolean; scope?: 'active' | 'past' | 'all' }) => Promise<EdooboxOfferDashboard[]>
  /** Buchungen eines Angebots über den Provider. Leeres Array ohne Provider. */
  listBookings: (offerId: string) => Promise<EdooboxBooking[]>
}

export const useEventAgentBridge = create<EventAgentBridgeState>()((set, get) => ({
  offers: [],
  setOffers: (offers) => set({ offers }),

  _provider: null,
  registerProvider: (provider) => set({ _provider: provider }),

  loadOffers: async (opts) => {
    const provider = get()._provider
    if (!provider) return []
    const offers = await provider.loadOffers(opts)
    set({ offers })
    return offers
  },
  listBookings: async (offerId) => {
    const provider = get()._provider
    if (!provider) return []
    return provider.listBookings(offerId)
  },
}))
