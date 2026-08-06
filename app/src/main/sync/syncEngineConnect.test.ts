import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Alle erzeugten Sockets, damit ein Test das WS-Verhalten von außen steuern kann.
const sockets: FakeSocket[] = []

class FakeSocket extends EventEmitter {
  readyState = 0 // CONNECTING
  sent: unknown[] = []
  terminated = false

  constructor(public url: string) {
    super()
    sockets.push(this)
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }

  close(): void {
    this.readyState = 3
    this.emit('close')
  }

  terminate(): void {
    this.terminated = true
    this.readyState = 3
    this.emit('close')
  }

  ping(): void {}
  removeListener(event: string, fn: (...args: unknown[]) => void): this {
    return super.removeListener(event, fn) as this
  }

  /** Server nimmt die Verbindung an — aber bestätigt noch KEINE Registrierung. */
  open(): void {
    this.readyState = 1 // OPEN
    this.emit('open')
  }

  /** Server bestätigt die Registrierung. */
  confirmRegistration(): void {
    this.emit('message', Buffer.from(JSON.stringify({ type: 'registered' })))
  }
}

vi.mock('ws', () => {
  const Ctor = function (this: unknown, url: string) {
    return new FakeSocket(url)
  } as unknown as { new (url: string): FakeSocket; OPEN: number }
  Ctor.OPEN = 1
  return { default: Ctor }
})

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false }
}))

const { SyncEngine } = await import('./syncEngine')

/**
 * Regression: connect() muss sich IMMER entscheiden.
 *
 * Bleibt das Promise offen, kehrt `await this.connect()` in sync() nie zurück,
 * das `finally` dort läuft nie und `syncing` bleibt dauerhaft true — ab dann
 * beantwortet sich jeder Sync nur noch mit "Sync already in progress", bis die
 * App neu gestartet wird. Genau das ist in der Praxis passiert.
 */
describe('SyncEngine.connect() settlement', () => {
  beforeEach(() => {
    sockets.length = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function connectingEngine(): Promise<{ engine: InstanceType<typeof SyncEngine>; promise: Promise<void>; socket: FakeSocket }> {
    const engine = new SyncEngine()
    // Interner Zustand statt init(): init() schreibt ein Manifest auf die Platte.
    // `key` bleibt bewusst leer — sonst plant der close-Handler einen Reconnect ein,
    // dessen Timer in einem SPÄTEREN Test feuert und dort einen fremden Fehler auslöst.
    // Für das Settlement-Verhalten von connect() spielt der Schlüssel keine Rolle.
    Object.assign(engine, {
      vaultPath: '/tmp/vault',
      vaultId: 'mg-test',
      relayUrl: 'wss://example.invalid'
    })
    const promise = engine.connect()
    await Promise.resolve()
    return { engine, promise, socket: sockets[0] }
  }

  it('lehnt ab, wenn die Verbindung vor der Registrierung wieder abbricht', async () => {
    const { promise, socket } = await connectingEngine()

    socket.open()
    // Server bestätigt NICHT, Verbindung fällt weg (Netzwechsel, Ruhezustand, Relay-Neustart).
    socket.close()

    await expect(promise).rejects.toThrow(/closed before registration/i)
  })

  it('lehnt ab, wenn die Registrierung unbeantwortet bleibt', async () => {
    const { promise, socket } = await connectingEngine()

    socket.open()
    // Erwartung VOR dem Vorspulen anhängen: die Ablehnung fällt beim Vorspulen an,
    // ein später angehängter Handler macht daraus kurzzeitig eine "unhandled rejection".
    const abgelehnt = expect(promise).rejects.toThrow(/Registration timeout/i)
    // Nichts passiert — kein 'registered', kein 'close', kein 'error'.
    await vi.advanceTimersByTimeAsync(10_000)
    await abgelehnt
  })

  it('lehnt ab, wenn die Verbindung gar nicht erst zustande kommt', async () => {
    const { promise } = await connectingEngine()

    const abgelehnt = expect(promise).rejects.toThrow(/Connection timeout/i)
    await vi.advanceTimersByTimeAsync(10_000)
    await abgelehnt
  })

  it('löst auf, sobald der Server die Registrierung bestätigt', async () => {
    const { promise, socket } = await connectingEngine()

    socket.open()
    socket.confirmRegistration()

    await expect(promise).resolves.toBeUndefined()
    expect(socket.sent).toContainEqual(expect.objectContaining({ type: 'register', vaultId: 'mg-test' }))
  })

  it('bleibt aufgelöst, wenn die Verbindung SPÄTER abbricht (kein doppeltes Settlement)', async () => {
    const { promise, socket } = await connectingEngine()

    socket.open()
    socket.confirmRegistration()
    await expect(promise).resolves.toBeUndefined()

    // Ein späterer Abbruch darf das bereits aufgelöste Promise nicht nachträglich
    // ablehnen (unhandled rejection) — der close-Handler ist derselbe.
    expect(() => socket.close()).not.toThrow()
  })
})
