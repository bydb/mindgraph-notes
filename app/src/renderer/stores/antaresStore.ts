import { create } from 'zustand'
import { getPluginConfig } from '../plugins/config'
import { invokePlugin } from '../plugins/client'
import type { AntaresEntleiher, AntaresVerleihRow, AntaresDashboardCounts, AntaresLizenz } from '../../shared/types'

/** Antares-Config-Form + Defaults. Liegt (vorerst) im Kern, weil der gleichnamige Store ihn
 *  braucht — der Kern darf NICHT aus src/plugins/ importieren (Deletion Test). Die Plugin-UI
 *  (AntaresSettings) bezieht die Defaults von hier. Persistiert generisch in pluginConfig.antares. */
export interface AntaresConfig {
  enabled: boolean
  baseUrl: string
  context: string
}
export const ANTARES_DEFAULTS: AntaresConfig = {
  enabled: false,
  baseUrl: 'https://mzantares-he-16.datenbank-bildungsmedien.net',
  context: 'HE/16',
}

type Settled<T> = { ok: true; data: T } | { ok: false; error: string }
async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, data: await p }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}

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
  const c = getPluginConfig('antares', ANTARES_DEFAULTS)
  return { baseUrl: c.baseUrl, context: c.context }
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
    const arg = { baseUrl, context }
    set({ loading: true, lastError: null })
    type Verleih = { total: number; rows: AntaresVerleihRow[] }
    const [rCounts, rReg, rGer, rMed, rAus, rLiz] = await Promise.all([
      settle(invokePlugin<AntaresDashboardCounts>('antares', 'antares.dashboardCounts', arg)),
      settle(invokePlugin<AntaresEntleiher[]>('antares', 'antares.listOffeneRegistrierungen', arg)),
      settle(invokePlugin<Verleih>('antares', 'antares.listMahnungenGeraete', arg)),
      settle(invokePlugin<Verleih>('antares', 'antares.listMahnungenMedien', arg)),
      settle(invokePlugin<Verleih>('antares', 'antares.listAusgabeliste', arg)),
      settle(invokePlugin<AntaresLizenz[]>('antares', 'antares.listLizenzenAblauf', { ...arg, daysAhead: 365 }))
    ])
    const firstError = [rCounts, rReg, rGer, rMed, rAus, rLiz].find(r => !r.ok)
    set({
      counts: rCounts.ok ? rCounts.data : EMPTY_COUNTS,
      offeneRegistrierungen: rReg.ok ? rReg.data : [],
      mahnungenGeraete: rGer.ok ? rGer.data.rows : [],
      mahnungenMedien: rMed.ok ? rMed.data.rows : [],
      ausgabeliste: rAus.ok ? rAus.data.rows : [],
      lizenzenAblauf365: rLiz.ok ? rLiz.data : [],
      loading: false,
      lastError: firstError && firstError.ok === false ? firstError.error : null,
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
