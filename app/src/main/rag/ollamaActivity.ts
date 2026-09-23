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

/**
 * Hüllt einen IPC-Handler so ein, dass seine gesamte Laufzeit als Vordergrund zählt.
 *
 * `usesLocalOllama` entscheidet anhand der Aufrufargumente, ob dieser Lauf überhaupt
 * lokales Ollama belegt. Ohne diese Prüfung blockiert ein Lauf, der über einen
 * Cloud-Anbieter rechnet, den lokalen Vault-Indexer über seine ganze Dauer — er lässt
 * ihn auf eine Ressource warten, die gar nicht beansprucht wird (Codex F19). Bei einer
 * Batch-Mailanalyse sind das Minuten, in denen der Index nicht nachzieht.
 *
 * Zwei Regeln für diese Prüfung:
 *
 *   1. Sie muss die Verzweigung des Handlers SPIEGELN, nicht nur das Vorhandensein eines
 *      Cloud-Parameters. Der Notiz-Chat zwingt den E-Mail-Modus zurück auf lokal
 *      (Personendaten dürfen nicht in die Cloud) — ein dort gesetztes Cloud-Modell wird
 *      also nie benutzt, und der Lauf zählt trotzdem als lokal.
 *   2. Sie ist fail-closed: wirft sie, gilt der Lauf als lokal. Ein zu früh laufender
 *      Indexer kostet Rechenzeit im Vordergrund; ein zu lange pausierender kostet nur
 *      Indexfrische.
 *
 * Die ganze Laufzeit statt nur der Modellaufrufe zu zählen bleibt Absicht: dazwischen
 * liegen Wartezeiten (im Schonmodus 8 s Abkühlung je Mail), in denen der Indexer sonst
 * eine Einbettung anfinge, die der nächste Modellaufruf sofort wieder abbräche.
 */
export function wrapIpcWithOllamaActivity<A extends unknown[], R>(
  label: string,
  handler: (...args: A) => Promise<R>,
  usesLocalOllama?: (...args: A) => boolean
): (...args: A) => Promise<R> {
  return (...args: A) => {
    let local = true
    if (usesLocalOllama) {
      try {
        local = usesLocalOllama(...args)
      } catch {
        local = true
      }
    }
    if (!local) return handler(...args)
    return withOllamaActivity(label, () => handler(...args))
  }
}

/** Nur für Tests. */
export const ollamaActivityInternals = {
  reset(): void {
    active = 0
    listeners.clear()
  }
}
