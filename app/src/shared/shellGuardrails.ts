// Schutzgrenzen der Agent-Shell — geteilt zwischen Einstellungen (Renderer) und
// Durchsetzung (Main). Der Renderer wählt, der Main liest die gespeicherte Kopie
// selbst und erzwingt sie über die Betriebssystem-Sandbox (main/noteAgent/shellSandbox.ts).
//
// Bewusst NICHT einstellbar:
// - Schreiben: immer nur der Arbeitsordner des Laufs. „Löschen verboten" bei freiem
//   Schreibrecht wäre keine Zusicherung — Überschreiben richtet denselben Schaden an.
// - Ein ungeschützter Modus. Kann der Schutz nicht aktiviert werden, startet die Shell nicht.

export type ShellReadScope = 'attachments' | 'vault'

export interface ShellGuardrails {
  /** Was die Shell außer Systempfaden lesen darf: nur Anhänge des Laufs oder den ganzen Vault. */
  readScope: ShellReadScope
  /** Netzwerk der Shell (auch lokale Dienste wie Ollama). Standard gesperrt. */
  network: boolean
}

export const DEFAULT_SHELL_GUARDRAILS: ShellGuardrails = { readScope: 'attachments', network: false }

/** Aus gespeicherten Einstellungen (unbekannte Form) — alles Unklare fällt auf den sicheren Standard. */
export function normalizeShellGuardrails(raw: unknown): ShellGuardrails {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    readScope: r.readScope === 'vault' ? 'vault' : 'attachments',
    network: r.network === true
  }
}

/** Eine Zeile für Dialog, Laufprotokoll und Prompt — dieselbe Formulierung an allen drei Stellen. */
export function describeShellGuardrails(g: ShellGuardrails, lang: 'de' | 'en' = 'de'): string {
  if (lang === 'en') {
    return `read: ${g.readScope === 'vault' ? 'whole vault' : 'attached files only'} · write: work folder only · network: ${g.network ? 'allowed' : 'blocked'}`
  }
  return `Lesen: ${g.readScope === 'vault' ? 'ganzer Vault' : 'nur Anhänge'} · Schreiben: nur Arbeitsordner · Netz: ${g.network ? 'erlaubt' : 'gesperrt'}`
}
