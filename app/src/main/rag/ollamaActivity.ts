/**
 * Vordergrund-Zähler für lokale Ollama-Aufrufe (Vault-Chat-Plan Rev. 3, Entscheidung 7).
 *
 * Kein vollwertiger Koordinator: Die instrumentierten Pfade melden `begin()`/`end()`,
 * der Vault-Indexer fragt VOR JEDEM Embedding-Request nach und pausiert, solange
 * etwas läuft. Abdeckung in v1 (so auch in der Oberfläche formuliert): Notiz-Chat,
 * Projekt-RAG-Antwort, Vault-Abfrage, Mail-Analyse, Brain, Notiz-Agent. Nicht
 * abgedeckt: Telegram, Workflow-Runner, Smart-Connections-Embeddings im Renderer.
 *
 * `end()` ist idempotent, `withOllamaActivity` räumt über `finally` auf — Fehler
 * und Abbrüche lassen den Zähler nie hängen.
 */

type Listener = (active: number) => void

let active = 0
const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) {
    try {
      l(active)
    } catch {
      /* Zuhörerfehler dürfen den Aufrufer nicht treffen */
    }
  }
}

/** Meldet einen laufenden Vordergrund-Aufruf an. Gibt die idempotente Abmeldung zurück. */
export function beginOllamaActivity(label: string): () => void {
  active++
  notify()
  let ended = false
  return () => {
    if (ended) return
    ended = true
    active = Math.max(0, active - 1)
    notify()
  }
  void label
}

export function ollamaForegroundCount(): number {
  return active
}

export function onOllamaActivityChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Löst auf, sobald kein Vordergrund-Aufruf mehr läuft (oder sofort). Abbruch per Signal. */
export function waitForOllamaIdle(signal?: AbortSignal): Promise<void> {
  if (active === 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('abgebrochen'))
      return
    }
    const off = onOllamaActivityChange((n) => {
      if (n === 0) {
        cleanup()
        resolve()
      }
    })
    const onAbort = () => {
      cleanup()
      reject(signal?.reason ?? new Error('abgebrochen'))
    }
    const cleanup = () => {
      off()
      signal?.removeEventListener('abort', onAbort)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function withOllamaActivity<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const end = beginOllamaActivity(label)
  try {
    return await fn()
  } finally {
    end()
  }
}

/** Hüllt einen IPC-Handler so ein, dass seine gesamte Laufzeit als Vordergrund zählt. */
export function wrapIpcWithOllamaActivity<A extends unknown[], R>(
  label: string,
  handler: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return (...args: A) => withOllamaActivity(label, () => handler(...args))
}

/** Nur für Tests. */
export const ollamaActivityInternals = {
  reset(): void {
    active = 0
    listeners.clear()
  }
}
