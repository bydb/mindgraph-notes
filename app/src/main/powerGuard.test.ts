// Vertragstest des Wachhaltens während langer Aufträge.
//
// Die beiden Fehler, die hier leise passieren würden: (1) ein Blocker bleibt nach einem
// Fehler-Lauf stehen → die Maschine schläft nie wieder ein, bis die App beendet wird;
// (2) bei zwei parallelen Läufen beendet der erste Abschluss das Wachhalten für beide.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const start = vi.fn()
const stop = vi.fn()
const isStarted = vi.fn()
vi.mock('electron', () => ({ powerSaveBlocker: { start: (...a: unknown[]) => start(...a), stop: (...a: unknown[]) => stop(...a), isStarted: (...a: unknown[]) => isStarted(...a) } }))

import { acquireStayAwake, isStayAwakeActive, _resetPowerGuardForTests } from './powerGuard'

beforeEach(() => {
  start.mockReset().mockReturnValue(42)
  stop.mockReset()
  isStarted.mockReset().mockReturnValue(true)
  _resetPowerGuardForTests()
})

describe('acquireStayAwake', () => {
  it('startet den Blocker beim ersten Auftrag und beendet ihn beim letzten', () => {
    const release = acquireStayAwake('Lauf A')
    expect(start).toHaveBeenCalledTimes(1)
    // prevent-app-suspension: Bildschirm darf ausgehen, das System nicht schlafen.
    expect(start).toHaveBeenCalledWith('prevent-app-suspension')
    expect(isStayAwakeActive()).toBe(true)

    release()
    expect(stop).toHaveBeenCalledWith(42)
    expect(isStayAwakeActive()).toBe(false)
  })

  it('zwei parallele Läufe teilen sich EINEN Blocker', () => {
    const a = acquireStayAwake('Lauf A')
    const b = acquireStayAwake('Lauf B')
    expect(start).toHaveBeenCalledTimes(1)

    a()
    // Lauf B läuft noch — das Wachhalten darf NICHT enden.
    expect(stop).not.toHaveBeenCalled()
    expect(isStayAwakeActive()).toBe(true)

    b()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(isStayAwakeActive()).toBe(false)
  })

  it('mehrfaches Freigeben desselben Laufs zählt nur einmal', () => {
    const a = acquireStayAwake('Lauf A')
    const b = acquireStayAwake('Lauf B')
    a()
    a()
    a()
    // Der doppelte Aufruf darf B nicht mit abräumen.
    expect(stop).not.toHaveBeenCalled()
    b()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('nach vollständiger Freigabe startet ein neuer Auftrag einen neuen Blocker', () => {
    acquireStayAwake('Lauf A')()
    acquireStayAwake('Lauf B')
    expect(start).toHaveBeenCalledTimes(2)
    expect(isStayAwakeActive()).toBe(true)
  })

  it('ein Fehler im Energie-API lässt den Auftrag weiterlaufen', () => {
    start.mockImplementation(() => { throw new Error('powerSaveBlocker nicht verfügbar') })
    const release = acquireStayAwake('Lauf A')
    expect(isStayAwakeActive()).toBe(false)
    // Freigeben darf trotzdem nicht werfen.
    expect(() => release()).not.toThrow()
    expect(stop).not.toHaveBeenCalled()
  })

  it('beendet nichts, was das System schon selbst beendet hat', () => {
    isStarted.mockReturnValue(false)
    acquireStayAwake('Lauf A')()
    expect(stop).not.toHaveBeenCalled()
    expect(isStayAwakeActive()).toBe(false)
  })
})
