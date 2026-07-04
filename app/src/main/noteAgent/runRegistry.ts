// Run-Lebenszyklus des Notiz-Agenten (Phase 2, docs/note-agent-harness-plan.md §4).
// Verbindlich (F02/F10): genau EIN aktiver Lauf pro webContents, Sender-Bindung,
// opake Result-Handles (der Renderer sieht nie Staging-Pfade), Results höchstens
// einmal konsumierbar, verspätete Ergebnisse abgebrochener Läufe werden verworfen.

import { randomBytes } from 'crypto'

export type AgentRunStatus = 'running' | 'done' | 'cancelled' | 'error'

export interface AgentResultEntry {
  resultId: string
  stagingPath: string // absolut, ausschließlich Main-seitig
  suggestedName: string
  kind: 'md' | 'xlsx' | 'docx' | 'txt' | 'csv'
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
  attachmentIds: string[]
  instruction: string
  status: AgentRunStatus
  abort: AbortController
  seq: number
  results: Map<string, AgentResultEntry>
  sources: Set<string> // gelesene Anhänge/Notizen — landen auf den Ergebnis-Karten
}

const activeBySender = new Map<number, AgentRun>()
const runsById = new Map<string, AgentRun>()

// Atomare Reservierung: existiert für den Sender bereits ein aktiver Lauf → null.
// Ein beendeter Vorgänger-Lauf des Senders wird dabei aus der Registry entfernt
// (seine unkonsumierte Staging-Reste räumt der Alters-Cleanup ab).
export function startRun(params: {
  senderId: number
  noteId: string
  vaultPath: string
  targetFolderRel: string
  attachmentIds: string[]
  instruction: string
}): AgentRun | null {
  const existing = activeBySender.get(params.senderId)
  if (existing && existing.status === 'running') return null
  if (existing) runsById.delete(existing.runId)

  const run: AgentRun = {
    runId: `run-${randomBytes(8).toString('hex')}`,
    senderId: params.senderId,
    noteId: params.noteId,
    vaultPath: params.vaultPath,
    targetFolderRel: params.targetFolderRel,
    attachmentIds: params.attachmentIds,
    instruction: params.instruction,
    status: 'running',
    abort: new AbortController(),
    seq: 0,
    results: new Map(),
    sources: new Set()
  }
  activeBySender.set(params.senderId, run)
  runsById.set(run.runId, run)
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
