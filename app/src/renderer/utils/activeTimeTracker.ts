// Anbindung der aktiven Zeitmessung an das Fenster.
//
// Gemessen wird NUR, während MindGraph im Vordergrund ist. Ohne diese Regel landet die
// Mittagspause in der Prüfzeit: Die Ergebniskarte erscheint um 11:50, geklickt wird um
// 13:10 — das waren keine 80 Minuten Prüfung. Genau an so einer Zahl zerbricht das
// Vertrauen in die ganze Bilanz.
//
// Die Rechenlogik selbst steht in shared/activeTime.ts und kennt weder Fenster noch Uhr.

import { useRef } from 'react'
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
export function useComposeMeasurement(): { noteTyping: () => void; take: () => number } {
  const ref = useRef<ActiveMeasurement | null>(null)
  return {
    noteTyping: () => {
      if (!ref.current) ref.current = createActiveMeasurement()
      ref.current.begin()
    },
    take: () => {
      if (!ref.current) return 0
      const ms = ref.current.end()
      ref.current = null
      return ms
    }
  }
}
