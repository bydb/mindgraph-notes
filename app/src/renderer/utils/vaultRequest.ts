/**
 * Lebenszyklus einer Vault-Anfrage (Codex F29/F41): genau eine aktive Anfrage, Ereignisse nur
 * für ihre ID, und ein Abbruch (Vault-Wechsel, Chat leeren, Panel zu) setzt auch den
 * Streaming-Zustand und den Antwortpuffer zurück — sonst blieben Eingabe und Senden gesperrt
 * und ein alter Antwortteil sichtbar (F41). Verspätete Erfolgs- und Fehlerpfade einer
 * abgebrochenen oder abgelösten Anfrage werden ignoriert. Reine Logik, testbar ohne React.
 */

import type { VaultRagAnswerDone } from '../../shared/types'

export interface VaultRequestDeps {
  subscribeChunk: (cb: (payload: { requestId: string; chunk: string }) => void) => () => void
  subscribeDone: (cb: (payload: VaultRagAnswerDone) => void) => () => void
  answer: (vaultPath: string, question: string, requestId: string, language: 'de' | 'en') => Promise<{ success: boolean; error?: string }>
  cancelRemote: (requestId: string) => void
  /** Ein Antwort-Stück anhängen. */
  onChunk: (chunk: string) => void
  /** Anfrage beendet (Antwort, Fehler, Abbruch durch Main): Nachricht anlegen, Streaming aus. */
  onDone: (payload: VaultRagAnswerDone) => void
  /** Fehler vor dem ersten Ereignis (IPC-Rückgabe oder Ausnahme). */
  onFailure: (error: string) => void
  /** Lokaler Abbruch: Streaming-Zustand UND Puffer zurücksetzen, keine Nachricht. */
  onReset: () => void
  newRequestId?: () => string
}

export interface VaultRequester {
  start: (vaultPath: string, question: string, language: 'de' | 'en') => string
  /** Bricht die aktive Anfrage ab (Listener ab, Main informiert, Zustand zurückgesetzt). */
  cancel: () => void
  activeId: () => string | null
}

export function createVaultRequester(deps: VaultRequestDeps): VaultRequester {
  let active: string | null = null
  let unsubscribe: Array<() => void> = []
  const newId = deps.newRequestId ?? (() => `vq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)

  const release = (): void => {
    for (const off of unsubscribe) off()
    unsubscribe = []
  }

  return {
    activeId: () => active,
    cancel: () => {
      const id = active
      release()
      active = null
      if (id) {
        deps.cancelRemote(id)
        // Nur wenn wirklich etwas lief, den Streaming-Zustand aufräumen (F41).
        deps.onReset()
      }
    },
    start: (vaultPath, question, language) => {
      // Eine neue Anfrage löst eine noch laufende ab.
      if (active) {
        const old = active
        release()
        active = null
        deps.cancelRemote(old)
      }
      const requestId = newId()
      active = requestId
      const offChunk = deps.subscribeChunk(({ requestId: id, chunk }) => {
        if (id === requestId && active === requestId) deps.onChunk(chunk)
      })
      const offDone = deps.subscribeDone((payload) => {
        if (payload.requestId !== requestId || active !== requestId) return
        release()
        active = null
        deps.onDone(payload)
      })
      unsubscribe = [offChunk, offDone]
      deps.answer(vaultPath, question, requestId, language).then(
        (res) => {
          if (active !== requestId) return // abgebrochen oder abgelöst: verspätete Rückgabe ignorieren
          if (!res.success && res.error) {
            release()
            active = null
            deps.onFailure(res.error)
          }
        },
        (err) => {
          if (active !== requestId) return
          release()
          active = null
          deps.onFailure(err instanceof Error ? err.message : String(err))
        }
      )
      return requestId
    }
  }
}
