// Notiz-Agent: ein Zustand für ALLE Orte, an denen der Agent erreichbar ist
// (Macher-Leiste unter der Notiz und Agent-Tab).
//
// Warum ein Store und nicht State pro Komponente: preload registriert die vier
// `note-agent-*`-Events mit `removeAllListeners` — der zuletzt registrierte Hörer
// gewinnt. Mit lokalem State im Editor UND im Agent-Tab hätte einer der beiden
// stumm keine Fortschritts- und Ergebnis-Events mehr bekommen. Hier lauscht genau
// eine Stelle und verteilt über runId → Bereich.
//
// „Bereich" (scopeId) ist die Notiz-ID (Editor) oder die Tab-ID (Agent-Tab).

import type { AgentRoute } from '../../shared/agentRoute'
import { dropComposeMeasurement } from '../utils/activeTimeTracker'
import { create } from 'zustand'
import { createActiveMeasurement, type ActiveMeasurement } from '../utils/activeTimeTracker'
import type { NoteAgentAttachment } from '../../shared/types'
import type { CloudProviderId } from '../../shared/llmBackend'

export interface AgentUiStep {
  seq: number
  skill: string
  summary: string
}

export interface AgentUiResult {
  resultId: string
  suggestedName: string
  kind: string
  summary: string
  sources: string[]
  state: 'pending' | 'accepted' | 'discarded'
  finalName?: string
  error?: string
}

export interface AgentUiWeb {
  queries: Array<{ query: string; status: string }>
  fetches: Array<{ url: string; title: string; status: string }>
  searchCount: number
  fetchCount: number
}

/**
 * Ausgang eines Laufs — bewusst als Zustand, nicht als fertiger Satz: Der Store
 * kennt die Übersetzungen nicht, die Anzeige setzt den Text mit t() zusammen.
 */
export type AgentRunOutcome = 'ok' | 'cancelled' | 'error' | 'evicted'

export interface AgentRunUiState {
  runId: string | null
  phase: 'idle' | 'running' | 'review'
  steps: AgentUiStep[]
  results: AgentUiResult[]
  outcome: AgentRunOutcome | null
  /** Abschlusstext des Modells. */
  text: string
  errorText: string
  hitMaxIterations: boolean
  /** Startzeitpunkt (Renderer-Uhr) — für die laufende Zeitanzeige im Panel. */
  startedAt: number | null
  web?: AgentUiWeb
  // Provenienz des Laufs: Modell + Datenweg (lokal vs. Cloud-Provider-Label) —
  // beim Start festgehalten, damit die Review-Karten sie anzeigen können.
  model: string
  cloudLabel: string | null
  shellAccess?: boolean
  computerAccess?: boolean
  webResearch?: boolean
  /** Main-seitig beim Start festgestellter Modellweg — die Karte zeigt während des Laufs nur ihn. */
  route?: AgentRoute
  // Mitlernen (Stufe 3): Merksatz-Vorschlag des Modells, trifft asynchron nach dem
  // Done-Event ein und befüllt das Merken-Feld vor (solange der Nutzer nichts tippt).
  rememberSuggestion?: string
}

export interface AgentScopeState {
  attachments: NoteAgentAttachment[]
  /**
   * Anhang-ID → Vault-relativer Pfad, für Anhänge aus dem Vault. Nötig, weil ein
   * Anhang nur seinen Basisnamen trägt: „Projekt A/Rückmeldungen" und
   * „Projekt B/Rückmeldungen" heißen beide „Rückmeldungen". Über den Namen zu
   * entscheiden, ob schon angehängt ist, hätte den zweiten Ordner still verschluckt.
   */
  vaultRelPaths: Record<string, string>
  targetFolder: string
  attachError: string | null
  run: AgentRunUiState
  /**
   * Noch nicht gestarteter Auftrag im Agent-Tab und das Beispiel, aus dem er stammt.
   * Liegt hier statt im Komponenten-State, damit ein Tab-Wechsel (AgentView wird dabei
   * ausgehängt) ihn nicht löscht — Anhänge und Zielordner überleben das ja auch.
   */
  draft?: string
  pickedExample?: { text: string; need: AgentExampleNeed } | null
  /** Modellwahl und Web-Schalter des Agent-Tabs — aus demselben Grund wie `draft` hier. */
  prefs?: AgentScopePrefs
  /** Start vom Main abgelehnt, weil Cloud-Freigabe oder Zustimmung fehlt — die Karte zeigt
   *  dafür eine eigene Zeile statt einer Fehlermeldung unter den Anhängen. */
  startGate?: { code: 'optin' | 'consent'; message: string } | null
}

export interface AgentScopePrefs {
  localModel?: string
  cloudProvider?: 'openrouter' | 'llmbase' | null
  webArmed?: boolean
}

/** Voraussetzung eines Beispielauftrags, solange sein Text unverändert ist. */
export type AgentExampleNeed = 'none' | 'folder' | 'files2' | 'web'

export const EMPTY_AGENT_RUN: AgentRunUiState = {
  runId: null,
  phase: 'idle',
  steps: [],
  results: [],
  outcome: null,
  text: '',
  errorText: '',
  hitMaxIterations: false,
  startedAt: null,
  model: '',
  cloudLabel: null
}

export const EMPTY_AGENT_SCOPE: AgentScopeState = {
  attachments: [],
  vaultRelPaths: {},
  targetFolder: '',
  attachError: null,
  run: EMPTY_AGENT_RUN
}

export interface AgentStartParams {
  vaultPath: string
  noteId: string
  noteContent: string
  instruction: string
  model: string
  localBackend: 'ollama' | 'lmstudio'
  lmStudioPort?: number
  cloud: { model: string; provider: CloudProviderId } | null
  cloudLabel: string | null
  webResearch: boolean
  shellAccess?: boolean
  computerAccess?: boolean
  /** Gemessene aktive Zeit beim Formulieren des Auftrags (Wirkungsbilanz). */
  instructionMs?: number
  /** Vergleichsfall, zu dem dieser Lauf gehört (Vergleichsmodus, optional). */
  comparisonCaseId?: string
}

interface NoteAgentStoreState {
  scopes: Record<string, AgentScopeState>
  /** runId → scopeId, damit Events dem richtigen Bereich zugeordnet werden (F10). */
  runScope: Record<string, string>

  getScope: (scopeId: string) => AgentScopeState
  setAttachError: (scopeId: string, error: string | null) => void
  addAttachments: (scopeId: string, added: NoteAgentAttachment[]) => void
  attachFromDialog: (scopeId: string) => Promise<void>
  attachFolderFromDialog: (scopeId: string) => Promise<void>
  /** Hängt eine Vault-Datei oder einen Vault-Ordner an. Bereits angehängte Pfade
   *  werden übersprungen (Vergleich über den vollen Pfad, nicht den Namen). */
  attachVaultPath: (scopeId: string, vaultPath: string, relPath: string) => Promise<void>
  detach: (scopeId: string, id: string) => Promise<void>
  setTargetFolder: (scopeId: string, rel: string | null) => void
  setDraft: (scopeId: string, text: string) => void
  setPickedExample: (scopeId: string, example: { text: string; need: AgentExampleNeed } | null) => void
  setPrefs: (scopeId: string, patch: AgentScopePrefs) => void

  startRun: (scopeId: string, params: AgentStartParams) => Promise<void>
  cancelRun: (scopeId: string) => void
  /** `openAfter`: nach dem Übernehmen die Datei im Standardprogramm öffnen (DOCX, XLSX …
   *  Formate, die die App selbst nicht anzeigt). Geöffnet wird die ECHTE Datei im Vault,
   *  nicht die Wegwerf-Kopie, die `computer_open` während des Laufs benutzt. */
  acceptResult: (scopeId: string, resultId: string, openAfter?: boolean) => Promise<void>
  discardResult: (scopeId: string, resultId: string) => Promise<void>
  previewResult: (scopeId: string, resultId: string) => Promise<{ success: boolean; kind?: string; binary?: boolean; text?: string; truncated?: boolean; error?: string }>
  dismissRun: (scopeId: string) => void
  /** Bereich vollständig vergessen (Tab geschlossen). Läuft noch etwas, wird abgebrochen. */
  disposeScope: (scopeId: string) => void
}

function withScope(
  state: NoteAgentStoreState,
  scopeId: string,
  update: (scope: AgentScopeState) => AgentScopeState
): Pick<NoteAgentStoreState, 'scopes'> {
  const current = state.scopes[scopeId] ?? EMPTY_AGENT_SCOPE
  return { scopes: { ...state.scopes, [scopeId]: update(current) } }
}

function patchRun(
  state: NoteAgentStoreState,
  runId: string,
  update: (run: AgentRunUiState) => AgentRunUiState
): Pick<NoteAgentStoreState, 'scopes'> | null {
  const scopeId = state.runScope[runId]
  if (!scopeId) return null
  const scope = state.scopes[scopeId]
  // Events verworfener oder fremder Läufe ignorieren (F10).
  if (!scope || scope.run.runId !== runId) return null
  return { scopes: { ...state.scopes, [scopeId]: { ...scope, run: update(scope.run) } } }
}

/**
 * Prüfzeit je Lauf: läuft, sobald die Ergebniskarten da sind, und endet mit der
 * Entscheidung. Bewusst außerhalb des Stores — eine laufende Messung ist kein
 * Anzeigezustand und soll kein Rendern auslösen.
 *
 * Gemessen wird nur bei Fenster im Vordergrund (siehe activeTimeTracker): Zwischen
 * „Karte erscheint" und „Klick" liegt sonst auch eine Mittagspause.
 */
const reviewTimers = new Map<string, ActiveMeasurement>()
/**
 * Wartezeit AM BILDSCHIRM während der Agent rechnet. Läuft nur, solange das Fenster
 * vorn ist — wer wegklickt, zahlt nichts. Erst dadurch schlägt sich die Modellwahl in
 * der Bilanz nieder: Vierzehn Minuten auf ein lokales Modell zu warten ist verlorene
 * Zeit, dieselbe Aufgabe in zwanzig Sekunden nicht.
 */
const waitTimers = new Map<string, ActiveMeasurement>()

function startWaitTimer(runId: string): void {
  const measurement = createActiveMeasurement()
  measurement.begin()
  waitTimers.set(runId, measurement)
}

/** Einmalig je Lauf: Die Wartezeit gehört dem Lauf, nicht dem einzelnen Ergebnis. */
function takeWaitMs(runId: string): number | undefined {
  const measurement = waitTimers.get(runId)
  if (!measurement) return undefined
  waitTimers.delete(runId)
  return measurement.end()
}

/** Beendet die Wartemessung, ohne sie zu verbrauchen — beim Eintreffen der Ergebnisse. */
function stopWaiting(runId: string): void {
  const measurement = waitTimers.get(runId)
  if (!measurement) return
  const ms = measurement.end()
  // Wert festhalten, damit ihn die erste Entscheidung mitschicken kann.
  waitTimers.set(runId, { begin: () => {}, end: () => ms, peek: () => ms, cancel: () => {} })
}

function startReviewTimer(runId: string): void {
  if (reviewTimers.has(runId)) return
  const measurement = createActiveMeasurement()
  measurement.begin()
  reviewTimers.set(runId, measurement)
}

/** Liefert die bisher aktiv verbrachte Prüfzeit und beendet die Messung des Laufs. */
function takeReviewMs(runId: string): number | undefined {
  const measurement = reviewTimers.get(runId)
  if (!measurement) return undefined
  reviewTimers.delete(runId)
  return measurement.end()
}

/** Feste Zahl als Messung ablegen — zum Zurücklegen nach einem gescheiterten Aufruf. */
function keepMeasured(store: Map<string, ActiveMeasurement>, runId: string, ms: number): void {
  store.set(runId, { begin: () => {}, end: () => ms, peek: () => ms, cancel: () => {} })
}

/**
 * Nach einer Entscheidung: Die Messwerte gehen NICHT verloren.
 *
 * Zwei Fälle, die vorher Zeit verschluckten:
 *  - Der Aufruf scheitert (Datei gesperrt, Pfad weg) → die Werte müssen zurück, sonst
 *    steht der zweite Versuch ohne Prüfzeit da.
 *  - Es liegen noch weitere Karten → für sie beginnt eine NEUE Prüfphase. Ohne das
 *    wurde nur die erste Entscheidung gemessen und der Lauf sah zu günstig aus.
 */
function settleTimings(
  runId: string,
  timings: { reviewMs?: number; waitingMs?: number },
  erfolgreich: boolean,
  weitereKartenOffen: boolean
): void {
  if (!erfolgreich) {
    if (typeof timings.reviewMs === 'number') keepMeasured(reviewTimers, runId, timings.reviewMs)
    if (typeof timings.waitingMs === 'number') keepMeasured(waitTimers, runId, timings.waitingMs)
    return
  }
  if (weitereKartenOffen) startReviewTimer(runId)
}

/** Sind neben `entschieden` noch Ergebnisse offen? */
function hatOffeneKarten(results: Array<{ resultId: string; state: string }>, entschieden: string): boolean {
  return results.some(r => r.resultId !== entschieden && r.state === 'pending')
}

export const useNoteAgentStore = create<NoteAgentStoreState>((set, get) => ({
  scopes: {},
  runScope: {},

  getScope: (scopeId) => get().scopes[scopeId] ?? EMPTY_AGENT_SCOPE,

  setAttachError: (scopeId, error) => set(s => withScope(s, scopeId, sc => ({ ...sc, attachError: error }))),

  addAttachments: (scopeId, added) =>
    set(s => withScope(s, scopeId, sc => ({ ...sc, attachments: [...sc.attachments, ...added] }))),

  attachFromDialog: async (scopeId) => {
    get().setAttachError(scopeId, null)
    const res = await window.electronAPI.noteAgentAttachDialog()
    if (res.attachments.length > 0) get().addAttachments(scopeId, res.attachments)
    if (res.errors.length > 0) get().setAttachError(scopeId, res.errors.join(' · '))
  },

  attachFolderFromDialog: async (scopeId) => {
    get().setAttachError(scopeId, null)
    const res = await window.electronAPI.noteAgentAttachFolderDialog()
    if (res.attachments.length > 0) get().addAttachments(scopeId, res.attachments)
    if (res.errors.length > 0) get().setAttachError(scopeId, res.errors.join(' · '))
  },

  // Der Main-Handler nimmt Dateien UND Ordner aus dem Vault (registerContextFolder).
  attachVaultPath: async (scopeId, vaultPath, relPath) => {
    const scope = get().getScope(scopeId)
    // Idempotent über den VOLLEN Pfad: derselbe Ordner nicht doppelt, ein
    // gleichnamiger aus einem anderen Projekt aber sehr wohl.
    if (Object.values(scope.vaultRelPaths).includes(relPath)) return
    get().setAttachError(scopeId, null)
    const res = await window.electronAPI.noteAgentAttachVaultFile(vaultPath, relPath)
    if (res.attachments.length > 0) {
      set(s => withScope(s, scopeId, sc => ({
        ...sc,
        attachments: [...sc.attachments, ...res.attachments],
        vaultRelPaths: { ...sc.vaultRelPaths, ...Object.fromEntries(res.attachments.map(a => [a.id, relPath])) }
      })))
    }
    if (res.errors.length > 0) get().setAttachError(scopeId, res.errors.join(' · '))
  },

  detach: async (scopeId, id) => {
    await window.electronAPI.noteAgentDetach(id)
    set(s => withScope(s, scopeId, sc => {
      const vaultRelPaths = { ...sc.vaultRelPaths }
      delete vaultRelPaths[id]
      return { ...sc, attachError: null, attachments: sc.attachments.filter(a => a.id !== id), vaultRelPaths }
    }))
  },

  setTargetFolder: (scopeId, rel) =>
    set(s => withScope(s, scopeId, sc => ({ ...sc, targetFolder: rel || '' }))),

  setDraft: (scopeId, text) =>
    set(s => withScope(s, scopeId, sc => ({ ...sc, draft: text }))),

  setPickedExample: (scopeId, example) =>
    set(s => withScope(s, scopeId, sc => ({ ...sc, pickedExample: example }))),

  setPrefs: (scopeId, patch) =>
    set(s => withScope(s, scopeId, sc => ({ ...sc, prefs: { ...sc.prefs, ...patch } }))),

  startRun: async (scopeId, params) => {
    get().setAttachError(scopeId, null)
    const attachmentIds = get().getScope(scopeId).attachments.map(a => a.id)
    const targetFolderRel = get().getScope(scopeId).targetFolder
    const res = await window.electronAPI.noteAgentRun({
      vaultPath: params.vaultPath,
      noteId: params.noteId,
      noteContent: params.noteContent,
      instruction: params.instruction,
      model: params.model,
      attachmentIds,
      targetFolderRel,
      localBackend: params.localBackend,
      lmStudioPort: params.lmStudioPort,
      cloud: params.cloud,
      webResearch: params.webResearch ? { enabled: true } : null,
      shellAccess: params.shellAccess === true,
      computerAccess: params.computerAccess === true,
      instructionMs: params.instructionMs,
      comparisonCaseId: params.comparisonCaseId
    })
    if (!res.success || !res.runId) {
      if (res.code === 'optin' || res.code === 'consent') {
        set(s => withScope(s, scopeId, sc => ({ ...sc, startGate: { code: res.code as 'optin' | 'consent', message: res.error || '' } })))
      }
      get().setAttachError(scopeId, res.error || 'Start fehlgeschlagen')
      return
    }
    set(s => withScope(s, scopeId, sc => ({ ...sc, startGate: null })))
    const runId = res.runId
    startWaitTimer(runId)
    set(s => ({
      runScope: { ...s.runScope, [runId]: scopeId },
      ...withScope(s, scopeId, sc => ({
        ...sc,
        run: {
          ...EMPTY_AGENT_RUN,
          runId,
          phase: 'running',
          startedAt: Date.now(),
          model: params.cloud ? params.cloud.model : params.model,
          cloudLabel: params.cloudLabel,
          shellAccess: params.shellAccess === true,
          computerAccess: params.computerAccess === true,
          webResearch: params.webResearch === true,
          route: res.route
        }
      }))
    }))
  },

  cancelRun: (scopeId) => {
    const run = get().getScope(scopeId).run
    if (run.runId && run.phase === 'running') void window.electronAPI.noteAgentCancel(run.runId)
  },

  acceptResult: async (scopeId, resultId, openAfter) => {
    const run = get().getScope(scopeId).run
    if (!run.runId) return
    const timings = { reviewMs: takeReviewMs(run.runId), waitingMs: takeWaitMs(run.runId) }
    const weitereOffen = hatOffeneKarten(run.results, resultId)
    const res = await window.electronAPI.noteAgentAcceptResult(run.runId, resultId, timings)
    settleTimings(run.runId, timings, !!res.success, weitereOffen)
    // Ein gescheitertes Öffnen darf die geglückte Übernahme nicht als Fehler erscheinen
    // lassen — die Datei liegt dann trotzdem im Vault. Deshalb eigener Fehlertext.
    let openError: string | undefined
    if (openAfter && res.success) {
      if (!res.absPath) {
        // Kommt vor, wenn der Main-Prozess älter ist als der Renderer (Dev-Neustart fehlt).
        // Still nichts tun sähe aus wie ein kaputter Knopf — die Übernahme selbst hat geklappt.
        openError = 'Übernommen, aber nicht geöffnet: Die App hat den Dateipfad nicht zurückgegeben. Nach einem Neustart der App geht es wieder.'
      } else {
        const opened = await window.electronAPI.openPath(res.absPath)
        if (!opened.success) openError = opened.error || 'Übernommen, aber das Öffnen im Standardprogramm ist fehlgeschlagen.'
      }
    }
    set(s => withScope(s, scopeId, sc => ({
      ...sc,
      run: {
        ...sc.run,
        results: sc.run.results.map(r => r.resultId === resultId
          ? (res.success
            ? { ...r, state: 'accepted' as const, finalName: res.fileName, error: openError }
            : { ...r, error: res.error })
          : r)
      }
    })))
  },

  discardResult: async (scopeId, resultId) => {
    const run = get().getScope(scopeId).run
    if (!run.runId) return
    const timings = { reviewMs: takeReviewMs(run.runId), waitingMs: takeWaitMs(run.runId) }
    const weitereOffen = hatOffeneKarten(run.results, resultId)
    const res = await window.electronAPI.noteAgentDiscardResult(run.runId, resultId, timings)
    settleTimings(run.runId, timings, !!res.success, weitereOffen)
    set(s => withScope(s, scopeId, sc => ({
      ...sc,
      run: {
        ...sc.run,
        results: sc.run.results.map(r => r.resultId === resultId
          ? (res.success ? { ...r, state: 'discarded' as const, error: undefined } : { ...r, error: res.error })
          : r)
      }
    })))
  },

  previewResult: async (scopeId, resultId) => {
    const run = get().getScope(scopeId).run
    if (!run.runId) return { success: false, error: 'Kein aktiver Lauf' }
    return window.electronAPI.noteAgentPreviewResult(run.runId, resultId)
  },

  dismissRun: (scopeId) =>
    set(s => withScope(s, scopeId, sc => ({ ...sc, run: EMPTY_AGENT_RUN }))),

  disposeScope: (scopeId) => {
    dropComposeMeasurement(scopeId)
    const scope = get().scopes[scopeId]
    if (scope?.run.phase === 'running' && scope.run.runId) {
      void window.electronAPI.noteAgentCancel(scope.run.runId)
    }
    set(s => {
      const scopes = { ...s.scopes }
      delete scopes[scopeId]
      const runScope = { ...s.runScope }
      for (const [runId, id] of Object.entries(runScope)) if (id === scopeId) delete runScope[runId]
      return { scopes, runScope }
    })
  }
}))

// Genau EINMAL pro Renderer registrieren (App-Start). Ein zweiter Aufruf würde die
// Hörer über removeAllListeners neu setzen — harmlos, aber unnötig.
let eventsInitialized = false

export function initNoteAgentEvents(): void {
  if (eventsInitialized) return
  eventsInitialized = true
  const store = useNoteAgentStore

  window.electronAPI.onNoteAgentProgress(p => {
    store.setState(s => patchRun(s, p.runId, run => ({
      ...run,
      steps: [...run.steps, { seq: p.seq, skill: p.skill, summary: p.summary }]
    })) ?? {})
  })

  window.electronAPI.onNoteAgentDone(p => {
    // Ab hier zählt die Prüfzeit: Die Karten stehen, der Nutzer entscheidet.
    // Ohne Ergebnisse gibt es nichts zu prüfen — dann läuft auch keine Messung.
    stopWaiting(p.runId)
    if (p.results && p.results.length > 0) startReviewTimer(p.runId)
    store.setState(s => patchRun(s, p.runId, run => ({
      ...run,
      phase: 'review',
      results: p.results.map(r => ({ ...r, state: 'pending' as const })),
      web: p.web,
      outcome: p.ok ? 'ok' : p.cancelled ? 'cancelled' : 'error',
      text: p.text || '',
      errorText: p.error || '',
      hitMaxIterations: !!p.hitMaxIterations
    })) ?? {})
  })

  window.electronAPI.onNoteAgentMemorySuggestion(p => {
    store.setState(s => patchRun(s, p.runId, run => ({ ...run, rememberSuggestion: p.text })) ?? {})
  })

  // C02: Main hat einen alten Lauf aus der Retention evakuiert — dessen Karten sind
  // nicht mehr übernehmbar; als abgelaufen markieren statt „Unbekannter Lauf".
  window.electronAPI.onNoteAgentRunEvicted(p => {
    store.setState(s => {
      const patched = patchRun(s, p.runId, run => ({
        ...run,
        phase: 'review',
        results: [],
        outcome: 'evicted' as const
      }))
      if (!patched) return {}
      const runScope = { ...s.runScope }
      delete runScope[p.runId]
      return { ...patched, runScope }
    })
  })
}
