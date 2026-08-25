// Aktive Arbeitszeit — die Größe, auf die es beim Zeitgewinn ankommt.
//
// Der Unterschied, der alles entscheidet: Durchlaufzeit ist, wie lange es dauert, bis
// das Ergebnis da ist. Aktive Zeit ist, wie lange ein Mensch dafür am Rechner saß.
// Läuft der Agent 14 Minuten, während der Nutzer etwas anderes tut, sind das keine
// 14 Minuten Arbeitszeit — und sie gehören deshalb nicht in den Abzug.
//
// Reine Logik mit eingespeister Zeit: keine Uhr, kein Fenster, kein React. Die
// Anbindung an Fokus und Sichtbarkeit liegt im Renderer (utils/activeTimeTracker.ts).

/**
 * Obergrenze je Abschnitt. Ohne sie landet eine Mittagspause in der „Prüfzeit": Die
 * Karte erscheint um 11:50, geklickt wird um 13:10 — das waren keine 80 Minuten Prüfung.
 * Der Deckel ist bewusst großzügig; er soll Ausreißer kappen, nicht Arbeit wegkürzen.
 */
export const MAX_ACTIVE_MS = 30 * 60_000

/**
 * Summiert nur die Zeit, in der wirklich gearbeitet wurde: Zwischen `pause()` und
 * `resume()` läuft nichts. Alle Zeitpunkte kommen von außen, damit die Klasse ohne
 * Uhr prüfbar ist.
 */
export class ActiveTimer {
  private accumulatedMs = 0
  private runningSince: number | null = null

  constructor(private readonly maxMs: number = MAX_ACTIVE_MS) {}

  start(now: number): void {
    if (this.runningSince === null) this.runningSince = now
  }

  pause(now: number): void {
    if (this.runningSince === null) return
    this.accumulatedMs += Math.max(0, now - this.runningSince)
    this.runningSince = null
  }

  resume(now: number): void {
    this.start(now)
  }

  get running(): boolean {
    return this.runningSince !== null
  }

  /** Zwischenstand, ohne den Lauf zu beenden. */
  elapsed(now: number): number {
    const open = this.runningSince === null ? 0 : Math.max(0, now - this.runningSince)
    return Math.min(this.maxMs, this.accumulatedMs + open)
  }

  /** Beendet die Messung und liefert die gedeckelte Summe. */
  stop(now: number): number {
    this.pause(now)
    return Math.min(this.maxMs, this.accumulatedMs)
  }
}

/**
 * Aktive Zeit eines Vorgangs: Auftrag formulieren plus Ergebnis prüfen.
 *
 * `null` heißt „nicht erfasst" und ist NICHT dasselbe wie 0. Läufe aus der Zeit vor
 * dieser Messung haben keine Werte — sie dürfen keinen Zeitgewinn erzeugen, statt mit
 * einer 0 die volle Referenzzeit als Ersparnis auszuweisen.
 */
export function activeMs(parts: { instructionMs?: number; reviewMs?: number }): number | null {
  const instruction = parts.instructionMs
  const review = parts.reviewMs
  if (typeof instruction !== 'number' && typeof review !== 'number') return null
  return (instruction ?? 0) + (review ?? 0)
}
