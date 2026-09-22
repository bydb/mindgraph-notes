import { describe, it, expect } from 'vitest'
import {
  socketLooksAlive,
  transferTimeoutMs,
  TRANSFER_IDLE_TIMEOUT_MS,
  TRANSFER_HARD_CAP_MS,
  ASSUMED_MIN_BYTES_PER_SECOND
} from './transferTiming'

describe('socketLooksAlive', () => {
  const z = { bytesRead: 1000, bytesWritten: 1000 }

  it('lebt mit Pong, auch ohne Datenfluss', () => {
    expect(socketLooksAlive(true, z, z)).toBe(true)
  })

  it('lebt ohne Pong, solange gesendet wird — der Ping steckt hinter dem Upload', () => {
    // Genau der Fall der 45-MB-Mailliste: kein Pong binnen 30 s, aber Bytes fließen.
    expect(socketLooksAlive(false, z, { ...z, bytesWritten: 5_000_000 })).toBe(true)
  })

  it('lebt ohne Pong, solange empfangen wird — der Pong steckt hinter dem Download', () => {
    expect(socketLooksAlive(false, z, { ...z, bytesRead: 5_000_000 })).toBe(true)
  })

  it('ist tot ohne Pong und ohne ein einziges Byte', () => {
    expect(socketLooksAlive(false, z, z)).toBe(false)
  })
})

describe('transferTimeoutMs', () => {
  it('nimmt die Grundfrist, wenn die Größe unbekannt ist', () => {
    expect(transferTimeoutMs(undefined)).toBe(TRANSFER_IDLE_TIMEOUT_MS)
    expect(transferTimeoutMs(0)).toBe(TRANSFER_IDLE_TIMEOUT_MS)
    expect(transferTimeoutMs(NaN)).toBe(TRANSFER_IDLE_TIMEOUT_MS)
  })

  it('gibt einer 34-MB-Datei deutlich mehr als 30 Sekunden', () => {
    // Die Mailliste aus dem Anlassfall. Bei 2 Mbit/s braucht sie rund drei Minuten.
    const frist = transferTimeoutMs(34 * 1024 * 1024)
    expect(frist).toBeGreaterThan(150_000)
    expect(frist).toBeLessThan(TRANSFER_HARD_CAP_MS)
  })

  it('rechnet die base64-Aufblähung mit', () => {
    const bytes = ASSUMED_MIN_BYTES_PER_SECOND * 30 // 30 s roh …
    // … aber als base64 sind es 40 s Übertragung
    expect(transferTimeoutMs(bytes)).toBe(TRANSFER_IDLE_TIMEOUT_MS + 40_000)
  })

  it('deckelt bei der harten Obergrenze', () => {
    expect(transferTimeoutMs(10 * 1024 * 1024 * 1024)).toBe(TRANSFER_HARD_CAP_MS)
  })

  it('lässt eine kleine Notiz bei der Grundfrist plus einer Sekunde', () => {
    expect(transferTimeoutMs(2000)).toBe(TRANSFER_IDLE_TIMEOUT_MS + 1000)
  })
})
