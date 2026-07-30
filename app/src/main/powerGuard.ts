// Hält das System wach, solange ein langer Auftrag läuft.
//
// Anlass (30.07.2026, real gemessen): Auf einem kleinen MacBook im Akkubetrieb brachen drei
// Notiz-Agent-Läufe hintereinander mit `net::ERR_NETWORK_IO_SUSPENDED` ab, auf dem
// Arbeitsrechner keiner. Ursache ist nicht die App, sondern macOS: Ein Agent-Lauf dauert
// Minuten, in denen der Nutzer nichts tut — die Maschine geht in den Energiesparzustand,
// Chromium legt den Netzwerkdienst still, und die laufende Anfrage stirbt. Ein Retry heilt
// das nicht, weil das Problem nach dem Aufwachen weiterbesteht, solange niemand die Maschine
// wachhält.
//
// Bewusst `prevent-app-suspension` und NICHT `prevent-display-sleep`: Der Bildschirm darf
// dunkel werden (Akku, Blickschutz) — nur schlafen legen darf sich das System nicht.
//
// Referenzzählung, weil mehrere Fenster gleichzeitig einen Lauf haben können: Es gibt genau
// EINEN Blocker; er startet beim ersten Auftrag und endet mit dem letzten.

import { powerSaveBlocker } from 'electron'

let activeCount = 0
let blockerId: number | null = null

/** Nur für Tests: Zustand zwischen den Fällen zurücksetzen. */
export function _resetPowerGuardForTests(): void {
  activeCount = 0
  blockerId = null
}

/** Nur für Tests/Diagnose: Läuft gerade ein Blocker? */
export function isStayAwakeActive(): boolean {
  return blockerId !== null
}

/**
 * Hält das System wach, bis die zurückgegebene Funktion aufgerufen wird.
 *
 * Der Rückgabewert ist mehrfach aufrufbar (idempotent) — er MUSS in ein `finally`, sonst
 * bleibt die Maschine für immer wach. Fehler aus dem Energie-API werden geschluckt: Ein
 * Auftrag darf niemals daran scheitern, dass das Wachhalten nicht klappt.
 */
export function acquireStayAwake(reason: string): () => void {
  activeCount++
  if (activeCount === 1 && blockerId === null) {
    try {
      blockerId = powerSaveBlocker.start('prevent-app-suspension')
      console.log(`[Power] System wird wachgehalten (${reason})`)
    } catch (e) {
      // Kein harter Fehler: der Auftrag läuft weiter, nur ohne Schutz vor dem Ruhezustand.
      blockerId = null
      console.log(`[Power] Wachhalten nicht möglich: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  let released = false
  return () => {
    if (released) return
    released = true
    activeCount = Math.max(0, activeCount - 1)
    if (activeCount > 0 || blockerId === null) return
    try {
      if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId)
      console.log(`[Power] Wachhalten beendet (${reason})`)
    } catch {
      // ignorieren — im Zweifel ist der Blocker ohnehin weg
    }
    blockerId = null
  }
}
