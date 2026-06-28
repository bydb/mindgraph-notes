import { describe, it, expect, afterEach } from 'vitest'
import {
  WORKFLOW_ACTIONS,
  getActionById,
  actionsByModule,
  registerWorkflowActions,
  __resetWorkflowActionsForTest,
  workflowModuleLabel,
  workflowModuleGate,
} from './registry'
import { simulateWorkflow } from './simulation'
import { buildExampleWorkflows } from './examples'
import type { WorkflowActionDefinition } from './types'
import type { Workflow } from './model'

// Bewusst KEIN Import aus src/plugins/* — dieser Test muss eine echte Ordner-Löschung überleben.
// Er prüft, dass der KERN selbst keine Plugin-Trigger enthält und sie nur generisch via
// registerWorkflowActions dazukommen. Ein synthetischer Trigger steht für ein beliebiges Plugin.
const synthetic: WorkflowActionDefinition = {
  id: 'test.syntheticTrigger',
  moduleId: 'antares', // Plugin-Modul-Vokabular → kein Kern-Label/-Gate
  moduleLabel: 'Synthetisch',
  featureGate: 'syntheticFeature',
  label: 'Synthetischer Trigger',
  isTrigger: true,
  inputs: [],
  outputs: [{ id: 'text', label: 'Text', kind: 'text' }],
  simLine: 'Synthetischer Sim-Hinweis',
}

afterEach(() => __resetWorkflowActionsForTest())

describe('Deletion-Test: der Kern enthält keine statischen Plugin-Workflow-Trigger', () => {
  it('Kern kennt antares.mahnung/edoobox.newBooking nicht (Ordner weg ⇒ Palette-Block weg)', () => {
    expect(WORKFLOW_ACTIONS.some(a => a.id === 'antares.mahnung' || a.id === 'edoobox.newBooking')).toBe(false)
    expect(getActionById('antares.mahnung')).toBeUndefined()
    expect(getActionById('edoobox.newBooking')).toBeUndefined()
    expect(actionsByModule().antares).toBeUndefined()
    expect(actionsByModule().edoobox).toBeUndefined()
  })

  it('Kern hält kein Label/Gate für Plugin-Module (Fallback: Modul-Id, kein Gate)', () => {
    expect(workflowModuleLabel('antares')).toBe('antares')
    expect(workflowModuleGate('antares')).toBeNull()
    expect(workflowModuleGate('edoobox')).toBeNull()
  })

  it('registerWorkflowActions baut Palette-Block + Label + Gate generisch auf', () => {
    registerWorkflowActions([synthetic])
    expect(getActionById('test.syntheticTrigger')?.isTrigger).toBe(true)
    expect(actionsByModule().antares?.map(a => a.id)).toEqual(['test.syntheticTrigger'])
    expect(workflowModuleLabel('antares')).toBe('Synthetisch')
    expect(workflowModuleGate('antares')).toBe('syntheticFeature')
  })

  it('Kern-Actions bleiben unberührt', () => {
    expect(getActionById('tasks.dueSoon')?.isTrigger).toBe(true)
    expect(getActionById('email.analyze')).toBeDefined()
  })

  it('idempotent (dedupe per id)', () => {
    registerWorkflowActions([synthetic])
    registerWorkflowActions([synthetic])
    expect(actionsByModule().antares?.length).toBe(1)
  })

  it('Simulation nutzt action.simLine (statt einer Kern-Tabelle)', () => {
    registerWorkflowActions([synthetic])
    const wf: Workflow = {
      id: 'w', name: 'x', description: '', version: 1, enabled: false,
      createdAt: '', updatedAt: '',
      nodes: [{ id: 'n1', actionId: 'test.syntheticTrigger', position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    }
    const step = simulateWorkflow(wf).steps.find(s => s.actionId === 'test.syntheticTrigger')
    expect(step?.log.join(' ')).toContain('Synthetischer Sim-Hinweis')
  })
})

describe('Deletion-Test: Kern-Beispiele referenzieren keine Plugin-Trigger', () => {
  it('buildExampleWorkflows nennt weder antares.mahnung noch edoobox.newBooking', () => {
    const actionIds = buildExampleWorkflows().flatMap(w => w.nodes.map(n => n.actionId))
    expect(actionIds).not.toContain('antares.mahnung')
    expect(actionIds).not.toContain('edoobox.newBooking')
  })
})
