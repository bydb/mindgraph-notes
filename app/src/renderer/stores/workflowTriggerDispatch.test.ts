import { describe, it, expect } from 'vitest'
import { runEventForWorkflow, type EventDispatchDeps } from './workflowTriggerDispatch'
import type { Workflow, WorkflowRun, WorkflowRunStatus, WorkflowSeedItem } from '../../shared/workflow/model'
import type { WorkflowTriggerProvider } from '../../shared/plugins/workflowTrigger'

const wf = { id: 'wf1' } as Workflow

function makeRun(status: WorkflowRunStatus): WorkflowRun {
  return { id: 'r', workflowId: 'wf1', mode: 'execute', trigger: 'event-external', status, startedAt: '', finishedAt: '', steps: [] }
}

/** localStorage-ähnliche Hooks: load liefert IMMER eine Kopie, save schreibt zurück. */
function memDeps(initial: Record<string, string>, runStatus: WorkflowRunStatus | WorkflowRunStatus[]): EventDispatchDeps & { store: () => Record<string, string>; calls: () => number } {
  let store: Record<string, string> = { ...initial }
  const statuses = Array.isArray(runStatus) ? runStatus : [runStatus]
  let n = 0
  return {
    loadLedger: () => ({ ...store }),
    saveLedger: (l) => { store = { ...l } },
    runOne: async () => makeRun(statuses[Math.min(n++, statuses.length - 1)]),
    batchCap: 5,
    now: () => '2026-03-03T00:00:00.000Z',
    genRunId: () => 'run-test',
    store: () => store,
    calls: () => n,
  }
}

function provider(over: Partial<WorkflowTriggerProvider> & Pick<WorkflowTriggerProvider, 'collectEvent'>): WorkflowTriggerProvider {
  return { triggerActionId: 'x.test', async collectManual() { return null }, ...over }
}

const oneItem: WorkflowSeedItem[] = [{ itemKey: 'i1', text: 'Hallo' }]
const withBaseline = (items: WorkflowSeedItem[]) => provider({
  async collectEvent() {
    return { items, trigger: 'event-external', afterRun: (l) => l.set('baseline', 'advanced') }
  },
})

describe('runEventForWorkflow — afterRun-Gate (P1)', () => {
  it('Fehlschlag: afterRun läuft NICHT, Item bleibt unmarkiert (wiederholbar)', async () => {
    const deps = memDeps({}, 'failed')
    await runEventForWorkflow(wf, withBaseline(oneItem), deps)
    expect(deps.store()['wf1::baseline']).toBeUndefined()
    expect(deps.store()['wf1::i1']).toBeUndefined()
  })

  it('Erfolg: afterRun rückt Baseline vor, Item wird exactly-once markiert', async () => {
    const deps = memDeps({}, 'success')
    await runEventForWorkflow(wf, withBaseline(oneItem), deps)
    expect(deps.store()['wf1::baseline']).toBe('advanced')
    expect(deps.store()['wf1::i1']).toBe('2026-03-03T00:00:00.000Z')
  })

  it('Teilfehler: ein fehlgeschlagenes Item unter mehreren blockt die Baseline', async () => {
    const items: WorkflowSeedItem[] = [{ itemKey: 'i1', text: 'a' }, { itemKey: 'i2', text: 'b' }]
    const deps = memDeps({}, ['success', 'failed'])
    await runEventForWorkflow(wf, withBaseline(items), deps)
    expect(deps.store()['wf1::baseline']).toBeUndefined()
    expect(deps.store()['wf1::i1']).toBe('2026-03-03T00:00:00.000Z') // erfolgreiches bleibt markiert
    expect(deps.store()['wf1::i2']).toBeUndefined()
  })

  it('Leerlauf: ohne Items läuft afterRun (Baseline-Initialisierung) trotzdem', async () => {
    const deps = memDeps({}, 'success')
    const run = await runEventForWorkflow(wf, withBaseline([]), deps)
    expect(deps.calls()).toBe(0) // kein workflowRun
    expect(run?.steps[0].status).toBe('skipped')
    expect(deps.store()['wf1::baseline']).toBe('advanced')
  })

  it('bereits gefeuerte Items werden gefiltert (kein erneuter Lauf)', async () => {
    const deps = memDeps({ 'wf1::i1': '2026-01-01T00:00:00.000Z' }, 'success')
    const run = await runEventForWorkflow(wf, withBaseline(oneItem), deps)
    expect(deps.calls()).toBe(0)
    expect(run?.steps[0].status).toBe('skipped')
  })
})

describe('runEventForWorkflow — Ledger-Reset wird persistiert', () => {
  it('vom Provider gelöschte Marker verschwinden aus dem gespeicherten Ledger', async () => {
    const deps = memDeps({ 'wf1::stale': 'x', 'wf1::keep': 'y' }, 'success')
    const resetProvider = provider({
      async collectEvent(ledger) {
        ledger.delete('stale')
        return { items: [], trigger: 'event-external' }
      },
    })
    await runEventForWorkflow(wf, resetProvider, deps)
    expect(deps.store()['wf1::stale']).toBeUndefined()
    expect(deps.store()['wf1::keep']).toBe('y')
  })

  it('collectEvent-Fehler → null, kein Lauf', async () => {
    const deps = memDeps({}, 'success')
    const throwing = provider({ async collectEvent() { throw new Error('boom') } })
    const run = await runEventForWorkflow(wf, throwing, deps)
    expect(run).toBeNull()
    expect(deps.calls()).toBe(0)
  })
})
