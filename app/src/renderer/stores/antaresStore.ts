import { create } from 'zustand'
import { useUIStore } from './uiStore'
import type { AntaresEntleiher, AntaresVerleihRow, AntaresDashboardCounts, AntaresLizenz } from '../../shared/types'

const EMPTY_COUNTS: AntaresDashboardCounts = {
  offeneRegistrierungen: 0,
  offeneAnfragenGeraete: 0,
  offeneVorbestellungenGeraete: 0,
  stornierteVorbestellungen: 0,
  ueberfaelligeGeraete: 0,
  offeneVorbestellungenMedien: 0,
  ueberfaelligeMedien: 0
}

interface AntaresState {
  counts: AntaresDashboardCounts
  offeneRegistrierungen: AntaresEntleiher[]
  mahnungenGeraete: AntaresVerleihRow[]
  mahnungenMedien: AntaresVerleihRow[]
  ausgabeliste: AntaresVerleihRow[]
  lizenzenAblauf365: AntaresLizenz[]

  loading: boolean
  lastError: string | null
  lastFetchedAt: number | null

  loadAll: () => Promise<void>
  reset: () => void
}

function getConfig() {
  const s = useUIStore.getState().antares
  return { baseUrl: s.baseUrl, context: s.context }
}

export const useAntaresStore = create<AntaresState>((set) => ({
  counts: EMPTY_COUNTS,
  offeneRegistrierungen: [],
  mahnungenGeraete: [],
  mahnungenMedien: [],
  ausgabeliste: [],
  lizenzenAblauf365: [],
  loading: false,
  lastError: null,
  lastFetchedAt: null,

  loadAll: async () => {
    const { baseUrl, context } = getConfig()
    set({ loading: true, lastError: null })
    const [rCounts, rReg, rGer, rMed, rAus, rLiz] = await Promise.all([
      window.electronAPI.antaresDashboardCounts(baseUrl, context),
      window.electronAPI.antaresListOffeneRegistrierungen(baseUrl, context),
      window.electronAPI.antaresListMahnungenGeraete(baseUrl, context),
      window.electronAPI.antaresListMahnungenMedien(baseUrl, context),
      window.electronAPI.antaresListAusgabeliste(baseUrl, context),
      window.electronAPI.antaresListLizenzenAblauf(baseUrl, context, 365)
    ])
    const firstError = [rCounts, rReg, rGer, rMed, rAus, rLiz].find(r => !r.success)
    set({
      counts: rCounts.success && rCounts.counts ? rCounts.counts : EMPTY_COUNTS,
      offeneRegistrierungen: rReg.success ? (rReg.rows || []) : [],
      mahnungenGeraete: rGer.success ? (rGer.rows || []) : [],
      mahnungenMedien: rMed.success ? (rMed.rows || []) : [],
      ausgabeliste: rAus.success ? (rAus.rows || []) : [],
      lizenzenAblauf365: rLiz.success ? (rLiz.rows || []) : [],
      loading: false,
      lastError: firstError ? (firstError.error || 'Fehler') : null,
      lastFetchedAt: Date.now()
    })
  },

  reset: () => set({
    counts: EMPTY_COUNTS,
    offeneRegistrierungen: [],
    mahnungenGeraete: [],
    mahnungenMedien: [],
    ausgabeliste: [],
    lizenzenAblauf365: [],
    lastError: null,
    lastFetchedAt: null
  })
}))
