// Anbindung der aktiven Zeitmessung an das Fenster.
//
// Gemessen wird NUR, während MindGraph im Vordergrund ist. Ohne diese Regel landet die
// Mittagspause in der Prüfzeit: Die Ergebniskarte erscheint um 11:50, geklickt wird um
// 13:10 — das waren keine 80 Minuten Prüfung. Genau an so einer Zahl zerbricht das
// Vertrauen in die ganze Bilanz.
//
// Die Rechenlogik selbst steht in shared/activeTime.ts und kennt weder Fenster noch Uhr.

import { useEffect, useRef } from 'react'
import { ActiveTimer } from '../../shared/activeTime'

const live = new Set<ActiveTimer>()
let listenersAttached = false
let focused = true

function now(): number {
  return Date.now()
}

function attachListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true
  focused = typeof document === 'undefined' || document.visibilityState !== 'hidden'

  const pauseAll = (): void => {
    focused = false
    for (const timer of live) timer.pause(now())
  }
  const resumeAll = (): void => {
    focused = true
    for (const timer of live) timer.resume(now())
  }

  window.addEventListener('blur', pauseAll)
  window.addEventListener('focus', resumeAll)
  // Minimiertes Fenster meldet kein blur, aber visibilitychange.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseAll()
    else resumeAll()
  })
}

export interface ActiveMeasurement {
  /** Startet die Messung (mehrfach aufrufbar, zählt nur einmal). */
  begin: () => void
  /** Beendet sie und liefert die aktive Zeit in Millisekunden. */
  end: () => number
  /** Zwischenstand, ohne die Messung zu beenden — für Vorgänge mit mehreren Abschlüssen. */
  peek: () => number
  /** Bricht ab, ohne einen Wert zu liefern. */
  cancel: () => void
}

/**
 * Eine laufende Messung. Sie pausiert automatisch, sobald das Fenster in den
 * Hintergrund geht, und läuft weiter, wenn es zurückkommt.
 */
export function createActiveMeasurement(): ActiveMeasurement {
  attachListeners()
  const timer = new ActiveTimer()
  return {
    begin: () => {
      if (timer.running || !live.has(timer)) {
        live.add(timer)
        if (focused) timer.start(now())
      }
    },
    end: () => {
      live.delete(timer)
      return timer.stop(now())
    },
    peek: () => timer.elapsed(now()),
    cancel: () => {
      live.delete(timer)
      timer.stop(now())
    }
  }
}

/**
 * Für die beiden Auftrags-Eingaben (Agent-Tab und Macher-Leiste): Die Messung beginnt
 * beim ersten Tastendruck und endet beim Abschicken. Vorher zu starten wäre falsch —
 * ein offenes Fenster ist noch keine Arbeit am Auftrag.
 */
// Bereits gemessene, beim Aushängen gesicherte Zeit je Schlüssel (Agent-Tab: Tab-ID).
// Der Entwurf überlebt einen Tab-Wechsel — die Zeit daran muss es auch, aber die Zeit
// auf anderen Tabs zählt nicht mit.
const carried = new Map<string, number>()

/** Gesicherte Zeit eines geschlossenen Bereichs vergessen. */
export function dropComposeMeasurement(key: string): void {
  carried.delete(key)
}

export function useComposeMeasurement(key?: string): { noteTyping: () => void; take: () => number } {
  const ref = useRef<ActiveMeasurement | null>(null)
  // Aushängen beendet den Messer immer (sonst bleibt er in `live` hängen und zählt
  // weiter). Mit Schlüssel wird der Zwischenstand gesichert, ohne verworfen.
  useEffect(() => () => {
    if (!ref.current) return
    const ms = ref.current.end()
    ref.current = null
    if (key) carried.set(key, (carried.get(key) ?? 0) + ms)
  }, [key])
  return {
    noteTyping: () => {
      if (!ref.current) ref.current = createActiveMeasurement()
      ref.current.begin()
    },
    take: () => {
      const ms = (ref.current ? ref.current.end() : 0) + (key ? carried.get(key) ?? 0 : 0)
      ref.current = null
      if (key) carried.delete(key)
      return ms
    }
  }
}
