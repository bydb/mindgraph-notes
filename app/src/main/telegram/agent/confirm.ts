// Pending-Confirmations-Registry für den Telegram-Agent.
// Wenn ein Schreib-Tool aufgerufen wird, sendet der Loop eine Telegram-Nachricht
// mit Inline-Buttons. Der callback_query-Handler im bot.ts ruft resolve(decision)
// auf und der wartende Promise im Loop läuft weiter.
//
// Auto-Deny nach Timeout, damit der Loop nicht ewig blockiert.

export type ConfirmDecision = 'approve' | 'deny' | 'timeout'

interface PendingEntry {
  resolve: (decision: ConfirmDecision) => void
  timer: NodeJS.Timeout
}

const pending = new Map<string, PendingEntry>()
let counter = 0

export function nextConfirmId(): string {
  counter += 1
  return `c_${Date.now().toString(36)}_${counter}`
}

export interface PendingConfirm {
  id: string
  promise: Promise<ConfirmDecision>
}

export function registerPending(timeoutMs = 60_000): PendingConfirm {
  const id = nextConfirmId()
  const promise = new Promise<ConfirmDecision>((resolve) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        resolve('timeout')
      }
    }, timeoutMs)
    pending.set(id, { resolve, timer })
  })
  return { id, promise }
}

export function resolvePending(id: string, decision: ConfirmDecision): boolean {
  const entry = pending.get(id)
  if (!entry) return false
  clearTimeout(entry.timer)
  pending.delete(id)
  entry.resolve(decision)
  return true
}

/** Cleanup beim Bot-Stop — alle hängenden Promises mit timeout auflösen. */
export function clearAllPending(): void {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer)
    entry.resolve('timeout')
  }
  pending.clear()
}
