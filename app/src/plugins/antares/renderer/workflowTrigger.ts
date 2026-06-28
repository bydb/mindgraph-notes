// Antares-Workflow-Trigger-Provider — die Vertikale füllt den Trigger-Baustein
// `antares.mahnung`. Vorher lag diese Logik (Datenform AntaresVerleihRow, Formatierung,
// Item-Bau, Ledger-Reset) im Kern-`workflowStore`; mit A-pre Schritt 4 wandert sie hierher,
// damit der Kern den Trigger generisch dispatcht. Fällt diese Vertikale weg, wird der
// Provider nicht mehr registriert und der Baustein feuert sauber ins Leere.

import type {
  WorkflowTriggerProvider,
  WorkflowTriggerLedger,
  WorkflowEventResult,
} from '../../../shared/plugins/workflowTrigger'
import type { WorkflowSeedItem } from '../../../shared/workflow/model'
import type { AntaresVerleihRow } from '../../../shared/types'
import { useAntaresStore } from '../../../renderer/stores/antaresStore'

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function extractEmail(obj: Record<string, unknown>): string {
  const direct = pickString(obj, [
    'email', 'mail', 'e_mail', 'eMail', 'userEmail', 'fn_email', 'fn_mail',
    'fn_emailadresse', 'fn_emailadr', 'fn_mailadresse', 'fn_eml'
  ])
  if (direct) return direct
  for (const value of Object.values(obj)) {
    if (typeof value !== 'string') continue
    const match = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    if (match) return match[0]
  }
  return ''
}

// Menschenlesbarer Seed-Text: fließt in notes/human/ollama.
function formatMahnung(r: AntaresVerleihRow): string {
  const name = [r.fn_vorname, r.fn_ename].filter(Boolean).join(' ').trim() || '(unbekannt)'
  const email = extractEmail(r)
  return [
    'Überfällige Rückgabe (Mahnung)',
    `- Leihnr: ${r.fn_leihnr || '?'}`,
    `- Titel: ${r.fn_titel || '?'}`,
    `- Art: ${r.fn_info === 'medien' ? 'Medium' : 'Gerät'}`,
    `- Entleiher: ${name}`,
    email ? `- E-Mail: ${email}` : '',
    `- Schule: ${r.fn_schulname || '?'}`,
    `- Rückgabe fällig: ${r.fn_rueckdatum || '?'}`
  ].filter(Boolean).join('\n')
}

function antaresRowToItem(r: AntaresVerleihRow): WorkflowSeedItem {
  const name = [r.fn_vorname, r.fn_ename].filter(Boolean).join(' ').trim()
  const email = extractEmail(r)
  const subject = `Überfällige Rückgabe: ${r.fn_titel || r.fn_leihnr || ''}`.trim()
  return {
    itemKey: `mahnung:${r.fn_leihnr}`,
    text: formatMahnung(r),
    meta: { leihnr: r.fn_leihnr, medium: r.fn_info, schule: r.fn_schulname, recipientEmail: email, recipientName: name, subject },
    email: { id: `antares:${r.fn_leihnr}`, subject, bodyText: formatMahnung(r), from: email, name }
  }
}

function currentRows(): AntaresVerleihRow[] {
  const a = useAntaresStore.getState()
  return [...a.mahnungenGeraete, ...a.mahnungenMedien].filter(r => r.fn_leihnr)
}

/** Pure Event-Logik (für Tests von der Store-Anbindung getrennt): Reset nicht-mehr-fälliger
 *  Marker + ein Item pro aktueller Mahnung. */
export function buildAntaresEvent(rows: AntaresVerleihRow[], ledger: WorkflowTriggerLedger): WorkflowEventResult {
  // Reset: Marker für Leihnrn entfernen, die nicht mehr überfällig sind, damit ein
  // zurückgegeben-und-erneut-überfälliges Item wieder feuert.
  const currentKeys = new Set(rows.map(r => `mahnung:${r.fn_leihnr}`))
  for (const k of ledger.keys()) {
    if (k.startsWith('mahnung:') && !currentKeys.has(k)) ledger.delete(k)
  }
  return {
    items: rows.map(antaresRowToItem),
    trigger: 'event-external',
    emptyMessage: 'Keine neuen überfälligen Rückgaben.',
  }
}

export const antaresTriggerProvider: WorkflowTriggerProvider = {
  triggerActionId: 'antares.mahnung',
  manualEmptyMessage: 'Keine überfälligen Rückgaben gefunden.',

  async prepareEvent(): Promise<void> {
    try { await useAntaresStore.getState().loadAll() } catch { /* keine/abgelaufene Credentials */ }
  },

  async collectManual(): Promise<WorkflowSeedItem | null> {
    try { await useAntaresStore.getState().loadAll() } catch { /* keine/abgelaufene Credentials */ }
    return currentRows().map(antaresRowToItem)[0] ?? null
  },

  async collectEvent(ledger: WorkflowTriggerLedger): Promise<WorkflowEventResult> {
    return buildAntaresEvent(currentRows(), ledger)
  },
}
