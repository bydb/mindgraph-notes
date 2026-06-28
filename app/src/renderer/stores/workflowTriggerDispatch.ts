// Generischer Event-Dispatch für Trigger-Provider — die Kern-Mechanik hinter
// `workflowStore.runTrigger`, bewusst OHNE Store-/IPC-/localStorage-Import (alles injiziert),
// damit sie pur testbar ist (Antares-Reset, edoobox-Baseline, Fehlschlag-Gate).
//
// Drei Phasen pro Workflow:
//   1. Provider erzeugt Kandidaten und darf das (genamespacete) Ledger aufräumen → Reset persistieren.
//   2. Generischer Lauf: frische Items (Batch-Cap), Exactly-once pro itemKey NUR bei Erfolg.
//   3. `afterRun` (z.B. edoobox-Baseline vorrücken) NUR, wenn alle frischen Items erfolgreich
//      waren — sonst bliebe ein fehlgeschlagener Lauf unwiederholbar (`workflowRun` meldet
//      normale Fehler über `status: 'failed'`, ohne zu werfen).

import type { Workflow, WorkflowRun, WorkflowRunTrigger, WorkflowSeedItem } from '../../shared/workflow/model'
import type { WorkflowTriggerProvider, WorkflowTriggerLedger } from '@mindgraph/plugin-api'

export const ledgerKey = (wfId: string, itemKey: string): string => `${wfId}::${itemKey}`

/** Auf EINEN Workflow eingeschränkte Sicht aufs Ledger (Schlüssel `wfId::itemKey`), die ein
 *  Plugin-Trigger-Provider bekommt. Mutationen wirken direkt auf `raw`; der Aufrufer persistiert. */
export function scopeLedger(raw: Record<string, string>, wfId: string): WorkflowTriggerLedger {
  const prefix = `${wfId}::`
  return {
    get: (itemKey) => raw[prefix + itemKey],
    set: (itemKey, value) => { raw[prefix + itemKey] = value },
    delete: (itemKey) => { delete raw[prefix + itemKey] },
    keys: () => Object.keys(raw).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length)),
  }
}

export interface EventDispatchDeps {
  /** Lädt das vollständige (geräte-lokale) Ledger. */
  loadLedger: () => Record<string, string>
  /** Persistiert das Ledger. */
  saveLedger: (ledger: Record<string, string>) => void
  /** Führt EINEN Seed-Lauf aus (IPC `workflowRun`). Wirft NICHT bei normalen Fehlern → `status`. */
  runOne: (wf: Workflow, item: WorkflowSeedItem, trigger: WorkflowRunTrigger) => Promise<WorkflowRun>
  /** Max. Items pro Lauf (CPU-/Ollama-Schutz). */
  batchCap: number
  /** Eindeutige Lauf-Id (Default: zeit-/zufallsbasiert). Injizierbar für deterministische Tests. */
  genRunId?: () => string
  /** Jetzt-Zeitstempel (ISO). Injizierbar für Tests. */
  now?: () => string
}

const defaultRunId = () => `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/**
 * Pollt EINEN Workflow über seinen Provider und liefert den anzuzeigenden Lauf (oder null,
 * wenn `collectEvent` warf). Mutiert das Ledger über die injizierten load/save-Hooks.
 */
export async function runEventForWorkflow(
  wf: Workflow,
  provider: WorkflowTriggerProvider,
  deps: EventDispatchDeps,
): Promise<WorkflowRun | null> {
  const now = deps.now ?? (() => new Date().toISOString())
  const genRunId = deps.genRunId ?? defaultRunId

  // Phase 1: Kandidaten + optionaler Ledger-Reset (z.B. nicht-mehr-fällige Mahnungen).
  const raw1 = deps.loadLedger()
  let ev
  try {
    ev = await provider.collectEvent(scopeLedger(raw1, wf.id))
  } catch (e) {
    console.warn(`[workflow] collectEvent(${provider.triggerActionId}):`, e)
    return null
  }
  deps.saveLedger(raw1) // Reset VOR dem Lauf festschreiben.

  const trigger: WorkflowRunTrigger = ev.trigger ?? 'event-external'
  const emptyMsg = ev.emptyMessage ?? 'Keine neuen Einträge.'

  // Phase 2: frische Items seriell, gedeckelt; Ledger NUR bei Erfolg pflegen.
  const ledger = deps.loadLedger()
  const fresh = ev.items.filter(it => !ledger[ledgerKey(wf.id, it.itemKey)]).slice(0, deps.batchCap)

  let run: WorkflowRun
  let allSucceeded = true
  if (fresh.length === 0) {
    run = {
      id: genRunId(), workflowId: wf.id, mode: 'execute', trigger,
      status: 'success', startedAt: now(), finishedAt: now(),
      steps: [{ nodeId: '-', actionId: '-', label: 'Trigger', status: 'skipped', log: [emptyMsg] }]
    }
  } else {
    let last: WorkflowRun | null = null
    let changed = false
    for (const it of fresh) {
      const result = await deps.runOne(wf, it, trigger)
      if (result.status === 'success') { ledger[ledgerKey(wf.id, it.itemKey)] = now(); changed = true }
      else allSucceeded = false
      last = result
    }
    if (changed) deps.saveLedger(ledger)
    run = last as WorkflowRun
  }

  // Phase 3: afterRun NUR bei vollständigem Erfolg — frisch laden, damit die in Phase 2
  // gesetzten Marker erhalten bleiben. Bei Fehlschlag bleibt z.B. die edoobox-Baseline stehen
  // und der Delta wird beim nächsten Poll erneut versucht.
  if (ev.afterRun && allSucceeded) {
    const raw2 = deps.loadLedger()
    ev.afterRun(scopeLedger(raw2, wf.id))
    deps.saveLedger(raw2)
  }

  return run
}
