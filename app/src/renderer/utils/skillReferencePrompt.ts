// Wann fragt die Ergebniskarte nach der Referenzzeit eines Skills? Reine Regel, getestet —
// die Anzeige steht in components/Agent/SkillReferencePrompt.tsx.
//
// Erst wenn ALLE Karten entschieden sind und mindestens eine übernommen wurde (Codex F10):
// Mitten in der Prüfung weiterer Karten störte die Frage die Entscheidung, und ein
// verworfener Lauf hat nichts gespart — die Frage wirkte dort wie Werbung.

import type { SkillReferences } from '../../shared/activityLog'

export interface PromptRun {
  phase: 'idle' | 'running' | 'review'
  results: Array<{ state: 'pending' | 'accepted' | 'discarded' }>
  skills?: Array<{ id: string; label: string }>
}

/**
 * Skills, nach deren Referenz gefragt werden darf. Leer = keine Frage.
 *
 * Hat schon EINER der Skills des Laufs eine Referenz, wird nicht gefragt: Der Lauf ist dann
 * bewertet (oder bei zwei bepreisten mehrdeutig) — eine zweite Referenz machte ihn
 * mehrdeutig und schöbe ihn zurück auf die Tätigkeitsart.
 */
export function skillReferencePromptCandidates(
  run: PromptRun,
  refs: SkillReferences | undefined,
  dismissed: string[] | undefined
): Array<{ id: string; label: string }> {
  if (run.phase !== 'review' || !run.skills?.length || run.results.length === 0) return []
  if (run.results.some(r => r.state === 'pending')) return []
  if (!run.results.some(r => r.state === 'accepted')) return []
  if (run.skills.some(s => (refs?.[s.id]?.minutes ?? 0) > 0)) return []
  return run.skills.filter(s => !(dismissed ?? []).includes(s.id))
}
