// Vergleichsmodus im Renderer (docs/comparison-mode-plan.md).
//
// Der Store hält nur Anzeige-Zustand und schickt Absichten an den Main. Zuteilung,
// Zustandsübergänge und Persistenz liegen dort — ein Renderer, der einen Fall umteilen
// könnte, machte die Auswertung wertlos.
//
// **Die Stoppuhr hängt bewusst NICHT am Fensterfokus.** Beim konventionellen Weg arbeitet
// der Nutzer in Excel oder Outlook; MindGraph ist dann gerade NICHT im Vordergrund. Eine
// fokusabhängige Messung zählte dort null — und würde ausgerechnet den Weg kleinrechnen,
// gegen den verglichen wird. Deshalb: Wanduhr, vom Nutzer gestartet und beendet, Herkunft
// `gestoppt`.

import { create } from 'zustand'
import type { CampaignReport } from '../../shared/comparison/metrics'
import type {
  Campaign, ComparisonCase, Quality, SessionKind, WorkSession
} from '../../shared/comparison/types'
import type { ComparisonActionInput } from '../../shared/types'

interface RunningStopwatch {
  caseId: string
  kind: SessionKind
  startedAt: number
}

interface ComparisonState {
  campaigns: Campaign[]
  cases: ComparisonCase[]
  report: CampaignReport | null
  activeCampaignId: string | null
  /** Fall, dem ein Agent-Lauf zugerechnet wird (an noteAgentStore durchgereicht). */
  activeCaseId: string | null
  stopwatch: RunningStopwatch | null
  loading: boolean
  error: string | null

  load: (vaultPath: string) => Promise<void>
  createCampaign: (vaultPath: string, params: { taskClass: string; inclusionRules: string; acceptanceDefinition: string }) => Promise<void>
  createCase: (vaultPath: string, label: string) => Promise<ComparisonCase | null>
  update: (vaultPath: string, caseId: string, action: ComparisonActionInput) => Promise<boolean>
  endCampaign: (vaultPath: string) => Promise<void>
  setActiveCampaign: (campaignId: string | null) => void
  setActiveCase: (caseId: string | null) => void
  startStopwatch: (caseId: string, kind: SessionKind) => void
  /** Beendet die Uhr und schreibt die Sitzung — oder verwirft sie bei `keep: false`. */
  stopStopwatch: (vaultPath: string, keep: boolean) => Promise<void>
}

function applyData(set: (partial: Partial<ComparisonState>) => void, data?: { campaigns: Campaign[]; cases: ComparisonCase[] }): void {
  if (data) set({ campaigns: data.campaigns, cases: data.cases })
}

export const useComparisonStore = create<ComparisonState>((set, get) => ({
  campaigns: [],
  cases: [],
  report: null,
  activeCampaignId: null,
  activeCaseId: null,
  stopwatch: null,
  loading: false,
  error: null,

  load: async (vaultPath) => {
    set({ loading: true, error: null })
    const res = await window.electronAPI.comparisonLoad(vaultPath)
    if (!res.success || !res.data) {
      set({ loading: false, error: res.error ?? 'Kampagnen nicht lesbar' })
      return
    }
    const laufende = res.data.campaigns.find(c => c.endedAt === undefined) ?? res.data.campaigns[0] ?? null
    const aktiv = get().activeCampaignId ?? laufende?.id ?? null
    set({ campaigns: res.data.campaigns, cases: res.data.cases, activeCampaignId: aktiv, loading: false })
    if (aktiv) await refreshReport(vaultPath, aktiv, set)
  },

  createCampaign: async (vaultPath, params) => {
    const res = await window.electronAPI.comparisonCreateCampaign(vaultPath, params)
    if (!res.success) {
      set({ error: res.error ?? 'Kampagne nicht angelegt' })
      return
    }
    applyData(set, res.data)
    set({ activeCampaignId: res.campaignId ?? null, error: null })
    if (res.campaignId) await refreshReport(vaultPath, res.campaignId, set)
  },

  createCase: async (vaultPath, label) => {
    const campaignId = get().activeCampaignId
    if (!campaignId) return null
    const res = await window.electronAPI.comparisonCreateCase(vaultPath, campaignId, label)
    if (!res.success || !res.case) {
      set({ error: res.error ?? 'Fall nicht angelegt' })
      return null
    }
    applyData(set, res.data)
    set({ error: null })
    await refreshReport(vaultPath, campaignId, set)
    return res.case
  },

  update: async (vaultPath, caseId, action) => {
    const res = await window.electronAPI.comparisonUpdateCase(vaultPath, caseId, action)
    if (!res.success) {
      set({ error: res.error ?? 'Änderung abgelehnt' })
      return false
    }
    applyData(set, res.data)
    set({ error: null })
    const campaignId = get().activeCampaignId
    if (campaignId) await refreshReport(vaultPath, campaignId, set)
    return true
  },

  endCampaign: async (vaultPath) => {
    const campaignId = get().activeCampaignId
    if (!campaignId) return
    const res = await window.electronAPI.comparisonEndCampaign(vaultPath, campaignId)
    if (!res.success) {
      set({ error: res.error ?? 'Kampagne nicht beendet' })
      return
    }
    applyData(set, res.data)
  },

  setActiveCampaign: (campaignId) => set({ activeCampaignId: campaignId, report: null }),
  setActiveCase: (caseId) => set({ activeCaseId: caseId }),

  startStopwatch: (caseId, kind) => {
    if (get().stopwatch) return   // Zwei laufende Uhren wären zwei Wahrheiten.
    set({ stopwatch: { caseId, kind, startedAt: Date.now() } })
  },

  stopStopwatch: async (vaultPath, keep) => {
    const laufend = get().stopwatch
    if (!laufend) return
    set({ stopwatch: null })
    if (!keep) return
    const session: WorkSession = {
      kind: laufend.kind,
      from: laufend.startedAt,
      to: Date.now(),
      origin: 'gestoppt'
    }
    await get().update(vaultPath, laufend.caseId, { type: 'add-session', session })
  }
}))

async function refreshReport(
  vaultPath: string,
  campaignId: string,
  set: (partial: Partial<ComparisonState>) => void
): Promise<void> {
  const res = await window.electronAPI.comparisonReport(vaultPath, campaignId)
  set({ report: res.success && res.report ? res.report : null })
}

/** Für die Anzeige: Fälle der aktiven Kampagne, jüngste zuerst. */
export function casesOfCampaign(cases: ComparisonCase[], campaignId: string | null): ComparisonCase[] {
  if (!campaignId) return []
  return cases.filter(c => c.campaignId === campaignId).sort((a, b) => b.createdAt - a.createdAt)
}

export const QUALITY_LABEL_KEY: Record<Quality, string> = {
  1: 'comparison.quality.unusable',
  2: 'comparison.quality.majorFlaws',
  3: 'comparison.quality.minorFlaws',
  4: 'comparison.quality.usable'
}
