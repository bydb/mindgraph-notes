// Ablage des Tätigkeitsprotokolls (Schema und Auswertung: shared/activityLog.ts).
//
// Ablage in `userData/activity/<hash(vaultPath)>.json`, NICHT im Vault. Ein Pfad unter
// `.mindgraph/` wäre zwar vom MindGraph-Sync ausgenommen, aber nicht vor iCloud,
// Dropbox oder einem Netzlaufwerk sicher — dort läge dieselbe Datei auf allen Geräten
// und die Tageszähler würden sich verdoppeln. `userData` hat hier Vorbilder
// (settings.json, plugin-secrets.json, elevenlabs-key.enc).
//
// Nebenwirkung, die so stimmt: Entwicklungs-App und installierte App haben getrennte
// userData und damit getrennte Protokolle. Testläufe sollen die Zähler des Nutzers
// nicht fälschen.

import { app } from 'electron'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import {
  isActivityEvent,
  pruneActivityEvents,
  summarizeActivity,
  localDayRange,
  type ActivityEvent,
  type ActivitySummary
} from '../shared/activityLog'

function ledgerDir(): string {
  return path.join(app.getPath('userData'), 'activity')
}

function ledgerFile(vaultPath: string): string {
  const key = createHash('sha256').update(vaultPath).digest('hex').slice(0, 16)
  return path.join(ledgerDir(), `${key}.json`)
}

// Je Datei EIN Schreibvorgang gleichzeitig. Ereignisse kommen aus mehreren Handlern
// (Lauf-Ende, Übernehmen, Aufgabe anlegen, Sprachbefehl) — ohne diese Kette
// überschreiben sich zwei Schreibvorgänge gegenseitig und die Datei verliert Einträge.
const queues = new Map<string, Promise<unknown>>()

function enqueue<T>(file: string, job: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(job)
  // Fehler dürfen die Kette nicht abreißen lassen — der nächste Auftrag läuft trotzdem.
  queues.set(file, next.catch(() => undefined))
  return next
}

async function readFile(file: string): Promise<ActivityEvent[]> {
  try {
    const raw = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Zeilenweise prüfen: Eine halb geschriebene oder von Hand veränderte Datei soll
    // nur die kaputten Einträge verlieren, nicht die ganze Historie.
    return parsed.filter(isActivityEvent)
  } catch {
    return []
  }
}

async function writeAtomic(file: string, events: ActivityEvent[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(events), 'utf-8')
  await fs.rename(tmp, file)
}

// Beobachter für „es hat sich etwas getan". Der Renderer soll die Statusleiste nicht
// im Sekundentakt abfragen müssen — es passiert selten, aber dann soll es sofort stehen.
type ActivityListener = (vaultPath: string) => void
const listeners = new Set<ActivityListener>()

export function onActivityChanged(listener: ActivityListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Ereignis anhängen. Fehler bleiben still: Ein nicht geschriebener Zähler darf keinen
 * Agent-Lauf und keine Aufgabe scheitern lassen.
 */
export async function appendActivityEvent(vaultPath: string, event: ActivityEvent): Promise<void> {
  if (!vaultPath) return
  const file = ledgerFile(vaultPath)
  await enqueue(file, async () => {
    try {
      const events = await readFile(file)
      events.push(event)
      await writeAtomic(file, pruneActivityEvents(events, Date.now()))
      // Erst nach dem geglückten Schreiben melden — sonst zeigt die Statusleiste einen
      // Stand, der die nächste Lesung nicht übersteht.
      for (const listener of listeners) {
        try { listener(vaultPath) } catch { /* ein defekter Beobachter darf nichts aufhalten */ }
      }
    } catch (e) {
      console.warn('[activity] Ereignis nicht gespeichert:', e instanceof Error ? e.message : e)
    }
  })
}

/** Feuert und vergisst — für Aufrufstellen, die auf das Protokoll nicht warten sollen. */
export function recordActivity(vaultPath: string, event: ActivityEvent): void {
  void appendActivityEvent(vaultPath, event).catch(() => undefined)
}

/**
 * Bilanz eines Zeitraums. Die Auswertung bekommt ALLE Ereignisse, nicht nur den
 * Zeitraum — sonst fehlt die Laufzeit zu einer Übernahme, deren Lauf vor Mitternacht
 * endete (siehe summarizeActivity).
 */
export async function readActivitySummary(
  vaultPath: string,
  range?: { from: number; to: number }
): Promise<ActivitySummary> {
  const file = ledgerFile(vaultPath)
  const events = await enqueue(file, () => readFile(file))
  return summarizeActivity(events, range ?? localDayRange(Date.now()))
}
