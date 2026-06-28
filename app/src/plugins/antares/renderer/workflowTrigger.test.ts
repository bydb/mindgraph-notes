import { describe, it, expect } from 'vitest'
import { buildAntaresEvent } from './workflowTrigger'
import { manifest } from '../manifest'
import { buildAntaresReminderExample } from './workflowExample'
import type { WorkflowTriggerLedger } from '../../../shared/plugins/workflowTrigger'
import type { AntaresVerleihRow } from '../../../shared/types'

function fakeLedger(initial: Record<string, string> = {}): WorkflowTriggerLedger & { raw: Record<string, string> } {
  const raw: Record<string, string> = { ...initial }
  return {
    raw,
    get: (k) => raw[k],
    set: (k, v) => { raw[k] = v },
    delete: (k) => { delete raw[k] },
    keys: () => Object.keys(raw),
  }
}

function row(leihnr: string, over: Partial<AntaresVerleihRow> = {}): AntaresVerleihRow {
  return {
    identifier: leihnr, fn_leihnr: leihnr, fn_titel: `Titel ${leihnr}`, fn_info: 'geraete',
    fn_status: '40', fn_entldatum: '2026-01-01', fn_rueckdatum: '2026-02-01',
    fn_ename: 'Muster', fn_vorname: 'Max', fn_enr: '1', fn_schulname: 'Schule', fn_schulnr: '1',
    ...over,
  }
}

describe('antares-Manifest trägt den Workflow-Trigger (statt Kern-Registry)', () => {
  it('deklariert antares.mahnung als Trigger mit Text- + Kontakt-Ausgang', () => {
    const action = manifest.workflowActions?.find(a => a.id === 'antares.mahnung')
    expect(action?.isTrigger).toBe(true)
    expect(action?.moduleId).toBe('antares')
    expect(action?.outputs.map(o => o.id)).toEqual(['text', 'email'])
  })

  it('liefert ein Beispiel-Workflow, der mit antares.mahnung startet', () => {
    const wf = buildAntaresReminderExample()
    expect(wf.nodes.some(n => n.actionId === 'antares.mahnung')).toBe(true)
  })
})

describe('buildAntaresEvent', () => {
  it('erzeugt ein Item je überfälliger Mahnung mit generischem Event-Trigger', () => {
    const ev = buildAntaresEvent([row('L1'), row('L2')], fakeLedger())
    expect(ev.trigger).toBe('event-external')
    expect(ev.items.map(i => i.itemKey)).toEqual(['mahnung:L1', 'mahnung:L2'])
    expect(ev.items[0].email?.from).toBeDefined()
    expect(ev.afterRun).toBeUndefined() // Antares hat keine Baseline
  })

  it('Reset: entfernt Marker für nicht mehr fällige Leihnrn, behält aktuelle + Fremdmarker', () => {
    const ledger = fakeLedger({
      'mahnung:L1': '2026-02-01T10:00:00.000Z', // noch fällig
      'mahnung:OLD': '2026-01-15T10:00:00.000Z', // zurückgegeben → muss weg
      'task:n1:3': '2026-02-01T10:00:00.000Z', // Fremdmarker → bleibt
    })
    buildAntaresEvent([row('L1')], ledger)
    expect(ledger.raw['mahnung:L1']).toBeDefined()
    expect(ledger.raw['mahnung:OLD']).toBeUndefined()
    expect(ledger.raw['task:n1:3']).toBeDefined()
  })
})
