// Ablage der Abrufzählung (Schema und Regeln: shared/webFetchStats.ts).
//
// `userData/web-fetch-stats.json`, nicht im Vault: Die Zahlen gehören zu diesem Rechner, nicht
// zu den Notizen, und sollen weder mitsynchronisiert noch über Geräte verdoppelt werden.
// Nur der Main schreibt; der Renderer liest die Zusammenfassung und darf sie löschen.
// Fehler bleiben still: eine nicht gezählte Seite darf nie einen Abruf scheitern lassen.

import { app } from 'electron'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import {
  emptyFetchStats, localDay, parseFetchStats, pruneFetchStats, recordFetchStat, summarizeFetchStats,
  type FetchStatChannel, type FetchStatKind, type WebFetchStatsFile, type WebFetchStatsSummary
} from '../../shared/webFetchStats'

// Pfad in Tests umbiegbar; sonst userData.
let statsPathOverride: string | null = null
export function setFetchStatsPathForTests(p: string | null): void { statsPathOverride = p }
const statsFile = (): string => statsPathOverride ?? path.join(app.getPath('userData'), 'web-fetch-stats.json')

// Codex F25: Die Warteschlange ordnet nur innerhalb EINES Prozesses. Zwei App-Instanzen mit
// demselben Profil (unter Windows/Linux möglich, die App hat keine Instanzsperre) teilten vorher
// einen Zwischenspeicher-Stand und denselben `.tmp`-Namen — eine überschrieb die Zählung der
// anderen oder scheiterte am Umbenennen. Deshalb: vor jedem Schreiben frisch von der Platte lesen
// (kein Zwischenspeicher) und je Schreibvorgang ein eigener Temp-Name. Zwischen Lesen und Umbenennen
// bleibt ein Fenster von Millisekunden, in dem ein gleichzeitiger Eintrag verloren gehen kann —
// für eine Zählung hinnehmbar, eine prozessübergreifende Sperre wäre unverhältnismäßig.
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

/** Für Tests: warten, bis alle eingereihten Schreibvorgänge durch sind. */
export function flushFetchStats(): Promise<unknown> {
  return queue
}

/** Datei frisch lesen und Tage außerhalb des Fensters verwerfen (F23: auch auf der Platte). */
async function load(today: string): Promise<{ file: WebFetchStatsFile; pruned: boolean }> {
  let file: WebFetchStatsFile
  try {
    file = parseFetchStats(JSON.parse(await fs.readFile(statsFile(), 'utf-8')))
  } catch {
    file = emptyFetchStats()
  }
  const kept = pruneFetchStats(file, today)
  return { file: kept, pruned: Object.keys(kept.days).length !== Object.keys(file.days).length }
}

async function save(file: WebFetchStatsFile): Promise<void> {
  const target = statsFile()
  await fs.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(file), 'utf-8')
    await fs.rename(tmp, target)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

/**
 * Einen Abruf zählen — fire-and-forget, nie werfend. Der Tag wird beim Abruf festgehalten, nicht
 * erst in der Warteschlange (F23).
 */
export function noteFetchOutcome(channel: FetchStatChannel, kind: FetchStatKind, host: string): void {
  const day = localDay()
  void enqueue(async () => {
    const { file } = await load(localDay())
    await save(recordFetchStat(file, { channel, kind, host, day }))
  }).catch(err => console.warn('[WebFetchStats] Zählen fehlgeschlagen:', err instanceof Error ? err.message : err))
}

export function getFetchStatsSummary(): Promise<WebFetchStatsSummary> {
  return enqueue(async () => {
    const today = localDay()
    const { file, pruned } = await load(today)
    if (pruned) await save(file).catch(() => undefined) // Löschen alter Tage holt sonst der nächste Lauf nach
    return summarizeFetchStats(file, today)
  })
}

/** Wirft, wenn die Datei nicht gelöscht werden konnte — die Anzeige muss das sagen (F22). */
export function clearFetchStats(): Promise<void> {
  return enqueue(async () => {
    await fs.rm(statsFile(), { force: true })
  })
}
