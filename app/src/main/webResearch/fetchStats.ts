// Ablage der Abrufzählung (Schema und Regeln: shared/webFetchStats.ts).
//
// `userData/web-fetch-stats.json`, nicht im Vault: Die Zahlen gehören zu diesem Rechner, nicht
// zu den Notizen, und sollen weder mitsynchronisiert noch über Geräte verdoppelt werden.
// Nur der Main schreibt; der Renderer liest die Zusammenfassung und darf sie löschen.
// Fehler bleiben still: eine nicht gezählte Seite darf nie einen Abruf scheitern lassen.

import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import {
  emptyFetchStats, localDay, parseFetchStats, pruneFetchStats, recordFetchStat, summarizeFetchStats,
  type FetchStatChannel, type FetchStatKind, type WebFetchStatsFile, type WebFetchStatsSummary
} from '../../shared/webFetchStats'

const statsFile = (): string => path.join(app.getPath('userData'), 'web-fetch-stats.json')

let cache: WebFetchStatsFile | null = null
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

/** Datei lesen und Tage außerhalb des Fensters gleich verwerfen (Codex F23: auch auf der Platte). */
async function load(today: string): Promise<{ file: WebFetchStatsFile; pruned: boolean }> {
  let file = cache
  if (!file) {
    try {
      file = parseFetchStats(JSON.parse(await fs.readFile(statsFile(), 'utf-8')))
    } catch {
      file = emptyFetchStats()
    }
  }
  const kept = pruneFetchStats(file, today)
  return { file: kept, pruned: Object.keys(kept.days).length !== Object.keys(file.days).length }
}

async function save(file: WebFetchStatsFile): Promise<void> {
  const target = statsFile()
  await fs.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, JSON.stringify(file), 'utf-8')
  await fs.rename(tmp, target)
}

/**
 * Einen Abruf zählen — fire-and-forget, nie werfend. Der Tag wird beim Abruf festgehalten, nicht
 * erst in der Warteschlange (F23). Der Zwischenstand gilt erst nach geglücktem Schreiben (F22).
 */
export function noteFetchOutcome(channel: FetchStatChannel, kind: FetchStatKind, host: string): void {
  const day = localDay()
  void enqueue(async () => {
    const { file } = await load(localDay())
    const next = recordFetchStat(file, { channel, kind, host, day })
    await save(next)
    cache = next
  }).catch(err => console.warn('[WebFetchStats] Zählen fehlgeschlagen:', err instanceof Error ? err.message : err))
}

export function getFetchStatsSummary(): Promise<WebFetchStatsSummary> {
  return enqueue(async () => {
    const today = localDay()
    const { file, pruned } = await load(today)
    if (pruned) {
      try {
        await save(file)
        cache = file
      } catch { /* Anzeige trotzdem; das Löschen alter Tage holt der nächste Lauf nach */ }
    } else cache = file
    return summarizeFetchStats(file, today)
  })
}

/** Wirft, wenn die Datei nicht gelöscht werden konnte — die Anzeige muss das sagen (F22). */
export function clearFetchStats(): Promise<void> {
  return enqueue(async () => {
    await fs.rm(statsFile(), { force: true })
    await fs.rm(`${statsFile()}.tmp`, { force: true })
    cache = emptyFetchStats()
  })
}
