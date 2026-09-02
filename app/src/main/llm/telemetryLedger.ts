// Ablage der Modell-Aufrufe auf Platte (Schema und Regeln: shared/llmTelemetry.ts).
//
// Bis 09/2026 lebten die Aufrufe nur im Ringpuffer (telemetry.ts) und waren nach dem
// Neustart weg. Damit war jede Aussage über Einsatz, Kosten und Geschwindigkeit eine
// Momentaufnahme des Tages. Geschichte lässt sich nicht nachträglich erfassen — deshalb
// wird ab jetzt jeder Aufruf angehängt (docs/measurement-history-plan.md § 2).
//
// Ablage in `userData/telemetry/<hash(vaultPath)>.jsonl`, NICHT im Vault — aus denselben
// Gründen wie beim Tätigkeitsprotokoll (activityLedger.ts): unter `.mindgraph/` wäre die
// Datei zwar vom MindGraph-Sync ausgenommen, aber nicht vor iCloud, Dropbox oder einem
// Netzlaufwerk sicher, und die Zähler würden sich über Geräte verdoppeln.
//
// JSONL statt JSON-Array, anders als beim Tätigkeitsprotokoll: Dort kommen wenige
// Ereignisse am Tag, hier hundert und mehr Aufrufe. Ein Array müsste bei jedem Aufruf
// komplett gelesen und neu geschrieben werden — bei 50 000 Einträgen sind das über zehn
// Megabyte je Modellantwort. Eine Zeile anhängen kostet nichts, und eine halb
// geschriebene letzte Zeile verliert beim Lesen nur sich selbst (isLlmRunMetrics).
// Der Verbleib (Alter, Obergrenze) wird beim Verdichten durchgesetzt: beim ersten
// Anhängen nach dem Start und danach alle COMPACT_EVERY Einträge.
//
// Der Renderer schreibt hier nichts. Er darf nur Zeiträume lesen — sonst könnte ein
// kompromittierter Renderer Geschichte erfinden.

import { app } from 'electron'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { isLlmRunMetrics, pruneLlmRuns, type LlmRunMetrics } from '../../shared/llmTelemetry'

/** Nach so vielen angehängten Zeilen wird die Datei einmal verdichtet. */
export const COMPACT_EVERY = 500

function ledgerDir(): string {
  return path.join(app.getPath('userData'), 'telemetry')
}

export function ledgerFile(vaultPath: string): string {
  const key = createHash('sha256').update(vaultPath).digest('hex').slice(0, 16)
  return path.join(ledgerDir(), `${key}.jsonl`)
}

// Je Datei EIN Schreibvorgang gleichzeitig. Zwei Modellantworten können sich real
// treffen (Mail-Analyse parallel zum Agenten). Anhängen wäre auch ohne Kette sicher,
// das Verdichten nicht — es liest und schreibt die ganze Datei.
const queues = new Map<string, Promise<unknown>>()

function enqueue<T>(file: string, job: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(job)
  queues.set(file, next.catch(() => undefined))
  return next
}

// Zähler je Datei seit Prozessstart. Beim ersten Anhängen steht er auf 0 → verdichten,
// damit der Verbleib auch dann greift, wenn die App nur kurz läuft.
const appendsSinceCompact = new Map<string, number>()

function parseLines(raw: string): LlmRunMetrics[] {
  const out: LlmRunMetrics[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (isLlmRunMetrics(parsed)) out.push(parsed)
    } catch {
      // Halb geschriebene oder von Hand veränderte Zeile: nur sie geht verloren.
    }
  }
  return out
}

async function readAll(file: string): Promise<LlmRunMetrics[]> {
  try {
    return parseLines(await fs.readFile(file, 'utf-8'))
  } catch {
    return []
  }
}

async function writeAtomic(file: string, runs: LlmRunMetrics[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  const body = runs.map(r => JSON.stringify(r)).join('\n')
  await fs.writeFile(tmp, body ? body + '\n' : '', 'utf-8')
  await fs.rename(tmp, file)
}

/**
 * Aufruf anhängen. Fehler bleiben still: Ein nicht geschriebener Messwert darf
 * niemals die Modellantwort scheitern lassen, die er beschreibt.
 */
export async function appendTelemetryRun(vaultPath: string, run: LlmRunMetrics, nowMs: number = Date.now()): Promise<void> {
  if (!vaultPath) return
  const file = ledgerFile(vaultPath)
  await enqueue(file, async () => {
    try {
      const count = appendsSinceCompact.get(file) ?? 0
      if (count === 0 || count >= COMPACT_EVERY) {
        // Verdichten: Datei lesen, ungültige Zeilen verwerfen, Verbleib anwenden,
        // den neuen Aufruf dazu, einmal atomar zurückschreiben.
        const all = await readAll(file)
        all.push(run)
        await writeAtomic(file, pruneLlmRuns(all, nowMs))
        appendsSinceCompact.set(file, 1)
        return
      }
      await fs.mkdir(path.dirname(file), { recursive: true })
      // Zeilenumbruch VOR dem Eintrag, nicht danach: Bricht ein Schreibvorgang mitten
      // in der Zeile ab, klebt der nächste Eintrag sonst an den Torso und geht mit
      // verloren. Der Umbruch davor trennt ihn ab; Leerzeilen überliest parseLines.
      await fs.appendFile(file, '\n' + JSON.stringify(run), 'utf-8')
      appendsSinceCompact.set(file, count + 1)
    } catch (e) {
      console.warn('[telemetry] Aufruf nicht gespeichert:', e instanceof Error ? e.message : e)
    }
  })
}

/** Feuert und vergisst — die Sammelstelle soll auf die Platte nicht warten. */
export function recordTelemetryRun(vaultPath: string, run: LlmRunMetrics): void {
  void appendTelemetryRun(vaultPath, run).catch(() => undefined)
}

/**
 * Aufrufe eines Zeitraums, aufsteigend nach Zeit. Der Verbleib wird beim Lesen
 * mit angewendet, damit ein Eintrag, der die nächste Verdichtung nicht überlebt,
 * auch jetzt schon nicht mehr erscheint.
 */
export async function readTelemetryRange(
  vaultPath: string,
  range: { from: number; to: number },
  nowMs: number = Date.now()
): Promise<LlmRunMetrics[]> {
  if (!vaultPath) return []
  const file = ledgerFile(vaultPath)
  const all = await enqueue(file, () => readAll(file))
  return pruneLlmRuns(all, nowMs)
    .filter(r => r.at >= range.from && r.at < range.to)
    .sort((a, b) => a.at - b.at)
}

/** Nur für Tests: Zähler zurücksetzen, damit jeder Fall wieder mit einer Verdichtung beginnt. */
export function resetTelemetryLedgerForTests(): void {
  appendsSinceCompact.clear()
  queues.clear()
}
