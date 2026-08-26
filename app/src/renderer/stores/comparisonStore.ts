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

/**
 * Die laufende Uhr überlebt einen Neustart — aber NICHT als stille Fortschreibung.
 *
 * Eine Uhr, die über Nacht weiterläuft und am Morgen vierzehn Stunden meldet, wäre
 * schlimmer als gar keine: Sie sähe aus wie eine Messung. Deshalb wird ein gefundener
 * Stand nur ANGEBOTEN — übernehmen, kürzen oder verwerfen.
 */
const STOPWATCH_KEY = 'mindgraph:comparison-stopwatch'

function stopwatchKey(vaultPath: string): string {
  return `${STOPWATCH_KEY}:${vaultPath}`
}

function persistStopwatch(vaultPath: string, laufend: RunningStopwatch | null): void {
  try {
    if (laufend) localStorage.setItem(stopwatchKey(vaultPath), JSON.stringify(laufend))
    else localStorage.removeItem(stopwatchKey(vaultPath))
  } catch {
    // Kein Speicher, kein Drama: Die Uhr läuft dann nur bis zum Schließen des Fensters.
  }
}

function readPersistedStopwatch(vaultPath: string): RunningStopwatch | null {
  try {
    const roh = localStorage.getItem(stopwatchKey(vaultPath))
    if (!roh) return null
    const w = JSON.parse(roh) as RunningStopwatch
    if (!w?.caseId || !w?.kind || typeof w.startedAt !== 'number') return null
    return w
  } catch {
    return null
  }
}

interface ComparisonState {
  campaigns: Campaign[]
  cases: ComparisonCase[]
  report: CampaignReport | null
  activeCampaignId: string | null
  /** Fall, dem ein Agent-Lauf zugerechnet wird (an noteAgentStore durchgereicht). */
  activeCaseId: string | null
  stopwatch: RunningStopwatch | null
  /** Beim Start gefundene, nicht beendete Uhr — wartet auf eine Entscheidung. */
  pendingStopwatch: RunningStopwatch | null
  loading: boolean
  error: string | null

  load: (vaultPath: string) => Promise<void>
  createCampaign: (vaultPath: string, params: { taskClass: string; inclusionRules: string; acceptanceDefinition: string }) => Promise<void>
  createCase: (vaultPath: string, label: string) => Promise<ComparisonCase | null>
  update: (vaultPath: string, caseId: string, action: ComparisonActionInput) => Promise<boolean>
  endCampaign: (vaultPath: string) => Promise<void>
  setActiveCampaign: (campaignId: string | null) => void
  setActiveCase: (caseId: string | null) => void
  startStopwatch: (vaultPath: string, caseId: string, kind: SessionKind) => void
  /** Beendet die Uhr und schreibt die Sitzung — oder verwirft sie bei `keep: false`. */
  stopStopwatch: (vaultPath: string, keep: boolean) => Promise<void>
  /**
   * Entscheidet über eine gefundene, offene Uhr. `minutes` ist der vom Nutzer
   * bestätigte oder gekürzte Wert; `null` verwirft sie.
   *
   * Herkunft ist `nachgetragen`, nicht `gestoppt`: Der Endzeitpunkt wurde nicht
   * beobachtet, sondern hinterher behauptet. Diesen Unterschied muss der Export tragen.
   */
  resolvePendingStopwatch: (vaultPath: string, minutes: number | null) => Promise<void>
  /** Zeit von Hand eintragen (z. B. Arbeit in Excel, die niemand mitgestoppt hat). */
  addManualTime: (vaultPath: string, caseId: string, kind: SessionKind, minutes: number) => Promise<void>
  /** Korrigiert eine Sitzung; Originalwert und Grund bleiben erhalten. */
  correctSessionTime: (vaultPath: string, caseId: string, index: number, minutes: number, reason: string) => Promise<void>
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
  pendingStopwatch: null,
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
    // Eine gefundene Uhr gehört nur zu einem Fall, der noch offen ist.
    const gefunden = readPersistedStopwatch(vaultPath)
    const gueltig = gefunden && res.data.cases.some(c => c.id === gefunden.caseId && c.state === 'offen')
      ? gefunden
      : null
    if (gefunden && !gueltig) persistStopwatch(vaultPath, null)
    set({
      campaigns: res.data.campaigns,
      cases: res.data.cases,
      activeCampaignId: aktiv,
      pendingStopwatch: get().stopwatch ? null : gueltig,
      loading: false
    })
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

  startStopwatch: (vaultPath, caseId, kind) => {
    if (get().stopwatch) return   // Zwei laufende Uhren wären zwei Wahrheiten.
    const laufend = { caseId, kind, startedAt: Date.now() }
    persistStopwatch(vaultPath, laufend)
    set({ stopwatch: laufend, pendingStopwatch: null })
  },

  stopStopwatch: async (vaultPath, keep) => {
    const laufend = get().stopwatch
    if (!laufend) return
    set({ stopwatch: null })
    persistStopwatch(vaultPath, null)
    if (!keep) return
    const session: WorkSession = {
      kind: laufend.kind,
      from: laufend.startedAt,
      to: Date.now(),
      origin: 'gestoppt'
    }
    await get().update(vaultPath, laufend.caseId, { type: 'add-session', session })
  },

  resolvePendingStopwatch: async (vaultPath, minutes) => {
    const offen = get().pendingStopwatch
    if (!offen) return
    set({ pendingStopwatch: null })
    persistStopwatch(vaultPath, null)
    if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return
    const bis = Date.now()
    await get().update(vaultPath, offen.caseId, {
      type: 'add-session',
      session: { kind: offen.kind, from: bis - minutes * 60_000, to: bis, origin: 'nachgetragen' }
    })
  },

  addManualTime: async (vaultPath, caseId, kind, minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return
    const bis = Date.now()
    await get().update(vaultPath, caseId, {
      type: 'add-session',
      session: { kind, from: bis - minutes * 60_000, to: bis, origin: 'nachgetragen' }
    })
  },

  correctSessionTime: async (vaultPath, caseId, index, minutes, reason) => {
    if (!Number.isFinite(minutes) || minutes <= 0 || !reason.trim()) return
    const bis = Date.now()
    await get().update(vaultPath, caseId, {
      type: 'correct-session', index, from: bis - minutes * 60_000, to: bis, reason: reason.trim()
    })
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
