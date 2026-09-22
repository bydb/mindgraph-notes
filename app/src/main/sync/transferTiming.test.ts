import { describe, it, expect } from 'vitest'
import {
  socketLooksAlive,
  transferTimeoutMs,
  receiveWatchVerdict,
  TRANSFER_IDLE_TIMEOUT_MS,
  TRANSFER_HARD_CAP_MS,
  ASSUMED_MIN_BYTES_PER_SECOND
} from './transferTiming'

describe('socketLooksAlive', () => {
  const ruhe = { pongSeen: false, bytesReadBefore: 1000, bytesReadNow: 1000, uploadInFlightWithinDeadline: false }

  it('lebt mit Pong', () => {
    expect(socketLooksAlive({ ...ruhe, pongSeen: true })).toBe(true)
  })

  it('lebt ohne Pong, solange Bytes ANKOMMEN — der Pong steckt hinter dem Download', () => {
    expect(socketLooksAlive({ ...ruhe, bytesReadNow: 5_000_000 })).toBe(true)
  })

  it('lebt ohne Pong, solange ein Upload in seiner Frist läuft — der Ping steckt dahinter', () => {
    // Der 45-MB-Fall. Gesendete Bytes sind kein Beweis, die Frist des Uploads ist die Grenze.
    expect(socketLooksAlive({ ...ruhe, uploadInFlightWithinDeadline: true })).toBe(true)
  })

  it('ist tot ohne Pong, ohne empfangenes Byte und ohne laufenden Upload', () => {
    // Der zweite Entwurf zählte eigene Pings als Lebensbeweis — eine tote Verbindung
    // galt damit 60 Minuten lang als lebendig (Codex, F13).
    expect(socketLooksAlive(ruhe)).toBe(false)
  })
})

describe('transferTimeoutMs', () => {
  it('nimmt die Grundfrist, wenn die Größe unbekannt ist', () => {
    expect(transferTimeoutMs(undefined)).toBe(TRANSFER_IDLE_TIMEOUT_MS)
    expect(transferTimeoutMs(0)).toBe(TRANSFER_IDLE_TIMEOUT_MS)
    expect(transferTimeoutMs(NaN)).toBe(TRANSFER_IDLE_TIMEOUT_MS)
  })

  it('gibt einer 34-MB-Datei deutlich mehr als 30 Sekunden', () => {
    const frist = transferTimeoutMs(34 * 1024 * 1024)
    expect(frist).toBeGreaterThan(150_000)
    expect(frist).toBeLessThan(TRANSFER_HARD_CAP_MS)
  })

  it('rechnet die base64-Aufblähung mit', () => {
    const bytes = ASSUMED_MIN_BYTES_PER_SECOND * 30
    expect(transferTimeoutMs(bytes)).toBe(TRANSFER_IDLE_TIMEOUT_MS + 40_000)
  })

  it('deckelt bei der harten Obergrenze', () => {
    expect(transferTimeoutMs(10 * 1024 * 1024 * 1024)).toBe(TRANSFER_HARD_CAP_MS)
  })
})

describe('receiveWatchVerdict', () => {
  const t0 = 1_000_000
  const grund = { startedAt: t0, lastProgressAt: t0, bytesReadBefore: 100, bytesReadNow: 100 }

  it('wartet, solange nichts entschieden ist', () => {
    expect(receiveWatchVerdict({ ...grund, now: t0 + 5_000 }).verdict).toBe('wait')
  })

  it('meldet Fortschritt, wenn Bytes angekommen sind', () => {
    expect(receiveWatchVerdict({ ...grund, now: t0 + 5_000, bytesReadNow: 101 }).verdict).toBe('progress')
  })

  it('bricht nach 30 s ohne ein einziges Byte ab', () => {
    expect(receiveWatchVerdict({ ...grund, now: t0 + TRANSFER_IDLE_TIMEOUT_MS }).verdict).toBe('idle-timeout')
  })

  it('lässt laufenden Empfang die Frist neu beginnen', () => {
    const spaet = { ...grund, now: t0 + 200_000, lastProgressAt: t0 + 190_000 }
    expect(receiveWatchVerdict(spaet).verdict).toBe('wait')
  })

  it('prüft den harten Deckel VOR dem Fortschritt', () => {
    // Genau F15: Fortschritt in jedem Takt darf den Deckel nicht überspringen.
    const r = receiveWatchVerdict({ ...grund, now: t0 + TRANSFER_HARD_CAP_MS, bytesReadNow: 999 })
    expect(r.verdict).toBe('hard-cap')
  })
})
