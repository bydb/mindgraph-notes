// Schwerpunkt beim Einrichten: womit die App startet und welcher Knopf vorn steht.
//
// Entwurf + vier Codex-Runden: docs/codex-collab/schwerpunkt-beim-einrichten.md (Rev. 3).
// `workFocus` ist eine dauerhafte DARSTELLUNGS-Entscheidung — er schaltet nie Module
// und ändert nie die Seitenleiste. Die Modul-Voreinstellungen bleiben beim Profil
// (`userProfile`, einmalig im Onboarding).

export type WorkFocus = 'notes' | 'agent'

export const WORK_FOCUS_VALUES: readonly WorkFocus[] = ['notes', 'agent']

/** Gespeicherten Wert prüfen: alles Unbekannte (alte/künftige IDs, Tippfehler) ist `notes`,
 *  also das Verhalten vor Einführung des Schwerpunkts. */
export function normalizeWorkFocus(raw: unknown): WorkFocus {
  return raw === 'agent' ? 'agent' : 'notes'
}

/** Startlade-Status des Vaults, gesetzt nur vom Auto-Laden beim Start (Codex F27/F28). */
export type InitialVaultLoad = 'pending' | 'ready' | 'none' | 'failed'

/**
 * Springt die App beim Start in den Agent-Tab? Nur nach erfolgreichem Startladen und nur
 * beim Schwerpunkt `agent`. `none`/`failed` schließen die Entscheidung ohne Sprung ab —
 * ein später manuell geöffneter Vault springt nie.
 */
export function shouldOpenAgentOnStart(focus: WorkFocus, load: InitialVaultLoad): boolean {
  return focus === 'agent' && load === 'ready'
}

/** Ist die Startentscheidung gefallen (egal wie)? */
export function isStartDecisionDue(load: InitialVaultLoad): boolean {
  return load !== 'pending'
}

/**
 * Standardmodell des Notiz-Agenten ohne Auswahl im Tab: Modul-Override `note-agent` →
 * globales Modell. Dieselbe Präzedenz wie Agent-Tab und Macher-Leiste (dort steht die
 * Tab-/Leistenauswahl noch davor). Leerer String = kein Modell gewählt.
 */
export function agentDefaultModel(ollama: {
  selectedModel?: string
  moduleModelOverrides?: Partial<Record<string, string>>
}): string {
  return (ollama.moduleModelOverrides?.['note-agent'] || ollama.selectedModel || '').trim()
}
