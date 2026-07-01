// Pending-Ack-Registry für den Eager-Activate-Handshake (ADR plugin-renderer-host §5.2, F06).
// Main mintet bei der Aktivierung eine rendererInstanceId, pusht sie an den Renderer und WARTET hier auf
// dessen `plugin:rendererActivated`-Ack, BEVOR `active.json` committet wird. Timeout = fail-closed
// (Rollback, kein Commit). Bewusst modul-lokal + ohne Electron-Abhängigkeit → in manage.ts injizierbar/testbar.

import type { RendererActivateAck, RendererTeardownAck } from '../../shared/plugins/renderer'

interface Pending {
  resolve: (ack: RendererActivateAck) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()
const ACK_PHASES = new Set(['import', 'contract', 'activate', 'register'])
const TEARDOWN_OUTCOMES = new Set(['success', 'error', 'timeout'])

type TeardownOutcome = RendererTeardownAck['outcome']
interface PendingTeardown {
  resolve: (outcome: TeardownOutcome) => void
  timer: ReturnType<typeof setTimeout>
  /** Erwartete Sender-`webContents.id` (F24): nur der BESITZER der instanceId darf den Ack auflösen. */
  expectedSenderId?: number
}
const pendingTeardown = new Map<string, PendingTeardown>()

/** Wartet auf den Renderer-Aktivierungs-Ack für GENAU diese instanceId. Timeout → `{ ok:false }` (fail-closed). */
export function awaitRendererActivation(
  rendererInstanceId: string,
  timeoutMs: number,
): Promise<RendererActivateAck> {
  // Doppelte Warter auf dieselbe instanceId sind ein Bug — der vorherige wird fail-closed aufgelöst.
  const existing = pending.get(rendererInstanceId)
  if (existing) {
    clearTimeout(existing.timer)
    existing.resolve({ ok: false, rendererInstanceId, error: 'Ack durch neuen Warter ersetzt', phase: 'activate' })
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(rendererInstanceId)
      resolve({ ok: false, rendererInstanceId, error: `Renderer-Ack-Timeout (${timeoutMs} ms)`, phase: 'activate' })
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    pending.set(rendererInstanceId, { resolve, timer })
  })
}

/** Vom IPC `plugin:rendererActivated` aufgerufen — löst den wartenden Promise (falls vorhanden). */
export function resolveRendererActivation(ack: RendererActivateAck): void {
  const p = pending.get(ack.rendererInstanceId)
  if (!p) return
  clearTimeout(p.timer)
  pending.delete(ack.rendererInstanceId)
  p.resolve(ack)
}

/**
 * Wartet auf den Teardown-Ack EINER instanceId (ADR §5.2/§5.5, F15/F16). Timeout → `'timeout'` (fail-closed:
 * der Renderer ist nicht erreichbar / dispose hängt → restart-required). Nur `'success'` erlaubt dem Aufrufer
 * den Nachfolgerstart/Commit.
 */
export function awaitRendererTeardown(
  rendererInstanceId: string,
  timeoutMs: number,
  expectedSenderId?: number,
): Promise<TeardownOutcome> {
  const existing = pendingTeardown.get(rendererInstanceId)
  if (existing) {
    clearTimeout(existing.timer)
    existing.resolve('timeout')
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingTeardown.delete(rendererInstanceId)
      resolve('timeout')
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    pendingTeardown.set(rendererInstanceId, { resolve, timer, expectedSenderId })
  })
}

/**
 * Vom IPC `plugin:rendererTornDown` aufgerufen — löst den wartenden Teardown-Promise. `senderId` ist die
 * `webContents.id` des Ack-Absenders: stimmt sie nicht mit dem erwarteten BESITZER überein (F24), wird der
 * Ack VERWORFEN (ein nicht-besitzendes Fenster darf den Besitzer-Ausgang nicht vorzeitig ersetzen).
 */
export function resolveRendererTeardown(ack: RendererTeardownAck, senderId?: number): void {
  const p = pendingTeardown.get(ack.rendererInstanceId)
  if (!p) return
  if (p.expectedSenderId !== undefined && senderId !== p.expectedSenderId) return // Fremd-Ack ignorieren
  clearTimeout(p.timer)
  pendingTeardown.delete(ack.rendererInstanceId)
  p.resolve(ack.outcome)
}

/** Parst/validiert eine untrusted Teardown-Ack-Payload (oder `undefined`). */
export function parseRendererTeardownAck(raw: unknown): RendererTeardownAck | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.rendererInstanceId !== 'string') return undefined
  if (typeof r.outcome !== 'string' || !TEARDOWN_OUTCOMES.has(r.outcome)) return undefined
  return { rendererInstanceId: r.rendererInstanceId, outcome: r.outcome as TeardownOutcome }
}

/** Parst/validiert eine untrusted Ack-Payload vom Renderer in die typisierte Form (oder `undefined`). */
export function parseRendererAck(raw: unknown): RendererActivateAck | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.rendererInstanceId !== 'string') return undefined
  if (r.ok === true) return { ok: true, rendererInstanceId: r.rendererInstanceId }
  if (r.ok === false) {
    const phase = typeof r.phase === 'string' && ACK_PHASES.has(r.phase)
      ? (r.phase as 'import' | 'contract' | 'activate' | 'register')
      : undefined
    return {
      ok: false,
      rendererInstanceId: r.rendererInstanceId,
      error: typeof r.error === 'string' ? r.error : 'Renderer-Aktivierung fehlgeschlagen',
      phase,
    }
  }
  return undefined
}
