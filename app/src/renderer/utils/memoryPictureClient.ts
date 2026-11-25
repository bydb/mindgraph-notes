// Ein Messwert für Modell-Menü und Einstellungskarte (shared/memoryPicture.ts).
//
// Beide zeigen dieselbe Rechnung. Maß jede Stelle für sich, lagen die Zahlen um ein, zwei GB
// auseinander — die Belegung schwankt von Sekunde zu Sekunde —, und der Sprung vom Menü
// („es fehlen 2,1 GB · Platz schaffen“) landete auf einer Karte mit anderen Zahlen oder einem
// anderen Modell (Nutzerbefund 25.11.2026). Deshalb: ein kurzlebiger Zwischenstand je Modell und
// eine Übergabe, welches Modell und welches Fenster die Karte zeigen soll.

import type { MemoryPicture, ProcessGroup } from '../../shared/memoryPicture'

export interface MemoryPictureData {
  picture: MemoryPicture
  swapUsedBytes: number | null
  apps: ProcessGroup[]
  reopenable: string[]
  /** Die Programmgrößen sind unvollständig gemessen (`top` hat nicht geantwortet). */
  sizesPartial: boolean
}

export interface MemoryPictureRequest { model: string; targetTokens: number | null }

const FRESH_MS = 60_000
// `started` = wann die Messung begann: eine ältere Antwort überschreibt keine jüngere.
const cache = new Map<string, { at: number; started: number; data: MemoryPictureData }>()
// Laufende Messungen je Modell: Menü und Karte teilen sich eine, statt je vier Prozesse zu starten.
const inFlight = new Map<string, Promise<MemoryPictureData | null>>()
let request: MemoryPictureRequest | null = null
let platformUnsupported = false

/** Dieser Rechner hat gar kein Speicherbild (nicht macOS auf Apple Silicon) — bekannt nach der ersten Abfrage. */
export function memoryPictureUnsupported(): boolean {
  return platformUnsupported
}

/**
 * Speicherbild für das Modell; `fresh` misst neu, sonst reicht ein Stand der letzten Minute.
 * null = nicht verfügbar. Ein Fehlschlag wird NICHT gemerkt — der nächste Aufruf versucht es wieder
 * (vorher verschwand die Karte nach einer Zeitüberschreitung für eine Minute, agy F13).
 */
export function loadMemoryPicture(model: string, fresh = false): Promise<MemoryPictureData | null> {
  if (!model) return Promise.resolve(null)
  const hit = cache.get(model)
  if (!fresh && hit && Date.now() - hit.at < FRESH_MS) return Promise.resolve(hit.data)
  // „Neu messen“ heißt neu messen: eine Messung, die schon vor dem Beenden der Programme lief,
  // zeigte sonst den Stand von davor als Nachmessung (agy F21).
  const running = inFlight.get(model)
  if (running && !fresh) return running
  const startedAt = Date.now()
  let self: Promise<MemoryPictureData | null> | null = null
  const started = (async (): Promise<MemoryPictureData | null> => {
    try {
      const res = await window.electronAPI.noteAgentMemoryPicture({ model })
      if (res.success && res.supported === false && res.reason === 'platform') platformUnsupported = true
      if (!res.success || !res.supported || !res.picture) return null
      const data: MemoryPictureData = {
        picture: res.picture, swapUsedBytes: res.swapUsedBytes ?? null, apps: res.apps ?? [],
        reopenable: res.reopenable ?? [], sizesPartial: res.sizesPartial === true
      }
      const known = cache.get(model)
      if (!known || known.started <= startedAt) cache.set(model, { at: Date.now(), started: startedAt, data })
      return data
    } catch {
      return null
    } finally {
      if (inFlight.get(model) === self) inFlight.delete(model)
    }
  })()
  self = started
  inFlight.set(model, started)
  return started
}

/** Wie alt der Stand für das Modell ist (ms); Infinity = keiner. */
export function memoryPictureAge(model: string): number {
  const hit = cache.get(model)
  return hit ? Date.now() - hit.at : Infinity
}

/**
 * Das Menü sagt der Karte, welches Modell und welches Fenster sie zeigen soll, und öffnet sie.
 * `shown` ist der Stand, den das Menü gerade anzeigt — die Karte übernimmt genau ihn, damit beide
 * dieselben Zahlen nennen.
 */
export function openMemoryPictureFor(model: string, shown: MemoryPictureData | null, targetTokens: number | null): void {
  if (shown) cache.set(model, { at: Date.now(), started: Date.now(), data: shown })
  request = { model, targetTokens }
  window.dispatchEvent(new CustomEvent('mindgraph:memoryPictureModel', { detail: request }))
  window.dispatchEvent(new CustomEvent('mindgraph:openSettings', { detail: { tab: 'ai', anchor: 'ai-memory-picture' } }))
}

/** Von der Karte beim Einhängen abgeholt (einmalig). */
export function takeMemoryPictureRequest(): MemoryPictureRequest | null {
  const taken = request
  request = null
  return taken
}
