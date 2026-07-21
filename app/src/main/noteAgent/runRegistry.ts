// Run-Lebenszyklus des Notiz-Agenten (Phase 2, docs/note-agent-harness-plan.md §4).
// Verbindlich (F02/F10): genau EIN aktiver Lauf pro webContents, Sender-Bindung,
// opake Result-Handles (der Renderer sieht nie Staging-Pfade), Results höchstens
// einmal konsumierbar, verspätete Ergebnisse abgebrochener Läufe werden verworfen.

import { randomBytes } from 'crypto'
import type { WebResearchConfig, WebResearchPhase, WebFetchRecord } from '../../shared/webResearch'

export type AgentRunStatus = 'running' | 'done' | 'cancelled' | 'error'

// Webrecherche-Zustand eines Laufs (nur gesetzt, wenn der Nutzer die Webrecherche für
// diesen Lauf aktiviert hat). Der Main führt die erlaubte URL-Liste (Suchtreffer +
// Auftrags-URLs), NIE das Modell. Zustandsmaschine search → fetch → write (einseitig).
export interface WebRunState {
  config: WebResearchConfig
  apiKey: string | null                 // Key des aktuellen Providers (tavily/linkup); null bei searxng
  phase: WebResearchPhase
  allowedUrls: Set<string>              // normalisierte URLs, die web_fetch abrufen darf
  queries: Array<{ query: string; status: 'ok' | 'failed' }>
  fetches: WebFetchRecord[]
  searchCount: number
  fetchCount: number
  wrote: boolean                        // 0e: genau EIN write_note pro Web-Lauf
}

export interface AgentResultEntry {
  resultId: string
  stagingPath: string // absolut, ausschließlich Main-seitig
  suggestedName: string
  kind: 'md' | 'xlsx' | 'docx' | 'txt' | 'csv' | 'html'
  summary: string
  sources: string[]
  consumed: boolean
}

// Renderer-sichtbare Form — bewusst ohne Pfade.
export interface PublicAgentResult {
  resultId: string
  suggestedName: string
  kind: AgentResultEntry['kind']
  summary: string
  sources: string[]
}

export interface AgentRun {
  runId: string
  senderId: number
  noteId: string
  vaultPath: string
  targetFolderRel: string
  // Kanonischer (realpath) Zielordner, bei Run-Start festgeschrieben (R01): Accept
  // schreibt ausschließlich hierhin, nie über einen später untergeschobenen Symlink.
  targetFolderAbs: string
  attachmentIds: string[]
  instruction: string
  // Aktivierte Vault-Skills (Agent-Skills Stufe 1) — Discovery-Metadaten für den
  // System-Prompt; den Body holt use_skill bei Bedarf.
  skills: Array<{ name: string; description: string; folderName: string }>
  status: AgentRunStatus
  abort: AbortController
  seq: number
  results: Map<string, AgentResultEntry>
  sources: Set<string> // gelesene Anhänge/Notizen — landen auf den Ergebnis-Karten
  web?: WebRunState    // nur bei aktivierter Webrecherche
}

// Beendete Läufe mit noch offenen Review-Karten pro Sender maximal halten —
// darüber hinaus die ältesten evakuieren (ihre Staging-Reste räumt der Alters-Cleanup).
const MAX_RETAINED_FINISHED_RUNS_PER_SENDER = 8

const activeBySender = new Map<number, AgentRun>()
const runsById = new Map<string, AgentRun>()
// C02: bei der Retention evakuierte Läufe mit NOCH OFFENEN Review-Karten. Der
// IPC-Layer holt sie ab (consumeEvictedRuns), löscht ihr Staging sofort und meldet
// dem Renderer, dass er die zugehörigen Karten fallenlassen soll — sonst würden
// Accept/Discord später mit „Unbekannter Lauf" scheitern.
const evictedWithOpenReviews: AgentRun[] = []

function isFullyConsumed(run: AgentRun): boolean {
  for (const r of run.results.values()) if (!r.consumed) return false
  return true
}

// Retention: pro Sender höchstens N beendete Läufe behalten (Map = Insertion-Order,
// älteste zuerst evakuieren). Aktive Läufe zählen nicht. Evakuierte Läufe mit offenen
// Karten wandern in den Meldepuffer (C02).
function enforceRetention(senderId: number): void {
  const finished = [...runsById.values()].filter(r => r.senderId === senderId && r.status !== 'running')
  for (let i = 0; i < finished.length - MAX_RETAINED_FINISHED_RUNS_PER_SENDER; i++) {
    const r = finished[i]
    runsById.delete(r.runId)
    if (!isFullyConsumed(r)) evictedWithOpenReviews.push(r)
  }
}

// Vom IPC-Layer nach startRun abgeholt: evakuierte Läufe mit offenen Karten (leert den Puffer).
export function consumeEvictedRuns(): AgentRun[] {
  return evictedWithOpenReviews.splice(0)
}

// Atomare Reservierung: existiert für den Sender bereits ein AKTIVER Lauf → null.
// Ein beendeter Vorgänger bleibt adressierbar, solange er offene Review-Karten hat
// (R02) — nur wenn alle seine Results konsumiert sind, wird er entfernt.
export function startRun(params: {
  senderId: number
  noteId: string
  vaultPath: string
  targetFolderRel: string
  targetFolderAbs: string
  attachmentIds: string[]
  instruction: string
  skills?: Array<{ name: string; description: string; folderName: string }>
  web?: WebRunState
}): AgentRun | null {
  const existing = activeBySender.get(params.senderId)
  if (existing && existing.status === 'running') return null
  if (existing && isFullyConsumed(existing)) runsById.delete(existing.runId)

  const run: AgentRun = {
    runId: `run-${randomBytes(8).toString('hex')}`,
    senderId: params.senderId,
    noteId: params.noteId,
    vaultPath: params.vaultPath,
    targetFolderRel: params.targetFolderRel,
    targetFolderAbs: params.targetFolderAbs,
    attachmentIds: params.attachmentIds,
    instruction: params.instruction,
    skills: params.skills ?? [],
    status: 'running',
    abort: new AbortController(),
    seq: 0,
    results: new Map(),
    sources: new Set(),
    web: params.web
  }
  activeBySender.set(params.senderId, run)
  runsById.set(run.runId, run)
  enforceRetention(params.senderId)
  return run
}

// Sender-Bindung: liefert den Run nur, wenn er dem anfragenden Renderer gehört.
export function getRunForSender(senderId: number, runId: string): AgentRun | null {
  const run = runsById.get(runId)
  if (!run || run.senderId !== senderId) return null
  return run
}

export function finishRun(run: AgentRun, status: Exclude<AgentRunStatus, 'running'>): void {
  if (run.status === 'running') run.status = status
}

export function nextSeq(run: AgentRun): number {
  run.seq += 1
  return run.seq
}

// Ergebnis registrieren — nur solange der Lauf aktiv ist (abgebrochene Läufe
// erzeugen keine neuen Karten mehr, F05).
export function registerResult(
  run: AgentRun,
  entry: Omit<AgentResultEntry, 'resultId' | 'consumed'>
): AgentResultEntry | null {
  if (run.status !== 'running' || run.abort.signal.aborted) return null
  const result: AgentResultEntry = { ...entry, resultId: `res-${randomBytes(6).toString('hex')}`, consumed: false }
  run.results.set(result.resultId, result)
  return result
}

// Atomare Einmal-Konsumierung für Übernehmen/Verwerfen.
export function takeResult(senderId: number, runId: string, resultId: string): AgentResultEntry | null {
  const run = getRunForSender(senderId, runId)
  if (!run) return null
  const entry = run.results.get(resultId)
  if (!entry || entry.consumed) return null
  entry.consumed = true
  return entry
}

// Nach erfolgreichem Accept/Discard: beendeten Lauf entfernen, wenn keine offenen
// Karten mehr da sind. Bei Rollback (consumed→false gesetzt) bleibt er adressierbar.
export function pruneRunIfConsumed(run: AgentRun): void {
  if (run.status !== 'running' && isFullyConsumed(run)) runsById.delete(run.runId)
}

export function publicResults(run: AgentRun): PublicAgentResult[] {
  return Array.from(run.results.values()).map(r => ({
    resultId: r.resultId,
    suggestedName: r.suggestedName,
    kind: r.kind,
    summary: r.summary,
    sources: r.sources
  }))
}

export function cancelRunsForSender(senderId: number): void {
  const run = activeBySender.get(senderId)
  if (run && run.status === 'running') {
    run.abort.abort()
    finishRun(run, 'cancelled')
  }
}
