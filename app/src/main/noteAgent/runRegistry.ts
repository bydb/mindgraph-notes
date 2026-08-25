// Run-Lebenszyklus des Notiz-Agenten (Phase 2, docs/note-agent-harness-plan.md §4).
// Verbindlich (F02/F10): genau EIN aktiver Lauf pro webContents, Sender-Bindung,
// opake Result-Handles (der Renderer sieht nie Staging-Pfade), Results höchstens
// einmal konsumierbar, verspätete Ergebnisse abgebrochener Läufe werden verworfen.

import { randomBytes } from 'crypto'
import type { WebResearchConfig, WebResearchPhase, WebFetchRecord } from '../../shared/webResearch'
import type { CollectedTable } from '../../shared/tableCollect'

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
  kind: 'md' | 'xlsx' | 'docx' | 'txt' | 'csv' | 'html' | 'png' | 'jpg'
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
  // Modell dieses Laufs (lokaler Tag oder `<provider>/<modell>` bei Cloud-Routing).
  // Trägt die KI-Provenienz in die übernommenen Ergebnisse (shared/aiProvenance).
  model: string
  // Aktivierte Vault-Skills (Agent-Skills Stufe 1) — Discovery-Metadaten für den
  // System-Prompt; den Body holt use_skill bei Bedarf.
  skills: Array<{ name: string; description: string; folderName: string }>
  status: AgentRunStatus
  abort: AbortController
  seq: number
  results: Map<string, AgentResultEntry>
  // Zusammengeführte Tabellen dieses Laufs (collect_table). Sie leben NUR hier —
  // ihre Zeilen gehen nie an das Modell, sondern direkt in die Ergebnisdatei.
  datasets: Map<string, CollectedTable>
  // Einzeln gelesene Dateien je Ordner. Zwei Zwecke: die Leitplanke, die nach ein
  // paar Dateien auf collect_table verweist, und eine ehrliche Fehlermeldung bei
  // Zeitüberschreitung (real: 31 Einzeldateien statt EINES Zusammenführens).
  folderReads: Map<string, number>
  // Ordner, für die collect_table bereits gelaufen ist — danach sind gezielte
  // Einzelabfragen wieder legitim (nur nicht unbegrenzt).
  collectedFolders: Set<string>
  sources: Set<string> // gelesene Anhänge/Notizen — landen auf den Ergebnis-Karten
  // Beginn des Laufs. Grundlage der Gesamtdauer im Tätigkeitsprotokoll:
  // llmTelemetry.wallMs misst einzelne Modellaufrufe, nicht den Auftrag samt Tool-Runden.
  startedAt: number
  // Erfolgreich gelaufene Werkzeuge. Nur die NAMEN, nie Argumente — daraus leitet
  // shared/activityLog.ts die Tätigkeitsart ab (inhaltsfrei, siehe deriveActivityType).
  toolsUsed: Set<string>
  web?: WebRunState    // nur bei aktivierter Webrecherche
  // Bild-Generierung (Opt-in-Modul image-generation): beim Run-Start Main-seitig
  // bestimmt (Modul aktiv + Imagen-Key hinterlegt) → schaltet das generate_image-Tool frei.
  imageGen?: boolean
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
  model: string
  skills?: Array<{ name: string; description: string; folderName: string }>
  web?: WebRunState
  imageGen?: boolean
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
    model: params.model,
    skills: params.skills ?? [],
    status: 'running',
    abort: new AbortController(),
    seq: 0,
    results: new Map(),
    datasets: new Map(),
    folderReads: new Map(),
    collectedFolders: new Set(),
    sources: new Set(),
    startedAt: Date.now(),
    toolsUsed: new Set(),
    web: params.web,
    imageGen: params.imageGen
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

/** Werkzeugnamen eines erfolgreichen Aufrufs merken — Grundlage der Tätigkeitsart. */
export function recordToolUse(run: AgentRun, toolName: string): void {
  run.toolsUsed.add(toolName)
}

export function finishRun(run: AgentRun, status: Exclude<AgentRunStatus, 'running'>): void {
  if (run.status === 'running') run.status = status
}

/** Summe aller einzeln gelesenen Ordner-Dateien — Grundlage der Fehlermeldung. */
export function totalFolderReads(run: AgentRun): number {
  let sum = 0
  for (const n of run.folderReads.values()) sum += n
  return sum
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

// Zusammengeführte Tabelle im Lauf ablegen; der Name ist sprechend, damit das Modell
// ihn in write_xlsx wiederverwenden kann (dataset="tabelle1").
export function registerDataset(run: AgentRun, table: CollectedTable): string {
  const id = `tabelle${run.datasets.size + 1}`
  run.datasets.set(id, table)
  return id
}

export function getDataset(run: AgentRun, id: string): CollectedTable | null {
  return run.datasets.get(id) || run.datasets.get(id.trim().toLowerCase()) || null
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

// Read-only-Zugriff für die Vorschau vor der Übernahme — konsumiert NICHT.
export function peekResult(senderId: number, runId: string, resultId: string): AgentResultEntry | null {
  const run = getRunForSender(senderId, runId)
  if (!run) return null
  const entry = run.results.get(resultId)
  if (!entry || entry.consumed) return null
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
