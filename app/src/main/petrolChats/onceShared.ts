// Einmal je Schlüssel und Programmlauf — aber erst NACH Erfolg (Codex F84).
//
// Für das Aufräumen gespeicherter Gespräche je Vault: Wer gleichzeitig öffnet, wartet auf
// denselben laufenden Durchgang, statt daran vorbei ein Gespräch zu laden, das gerade als
// abgelaufen gelöscht wird. Scheitert ein Durchgang (Schlüssel gerade nicht verfügbar, Fehler),
// versucht es der nächste Zugriff erneut.

export class OnceShared {
  private readonly done = new Set<string>()
  private readonly running = new Map<string, Promise<void>>()

  /** `job` liefert true, wenn der Durchgang als erledigt gelten darf. Wirft nie. */
  run(key: string, job: () => Promise<boolean>): Promise<void> {
    if (this.done.has(key)) return Promise.resolve()
    const open = this.running.get(key)
    if (open) return open
    const p = (async () => {
      try {
        if (await job()) this.done.add(key)
      } catch {
        // nicht erledigt — der nächste Zugriff versucht es erneut
      } finally {
        this.running.delete(key)
      }
    })()
    this.running.set(key, p)
    return p
  }
}
