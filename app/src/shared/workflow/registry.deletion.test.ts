import { describe, it, expect, afterEach } from 'vitest'
import {
  WORKFLOW_ACTIONS,
  getActionById,
  actionsByModule,
  registerWorkflowActions,
  unregisterWorkflowActions,
  findWorkflowActionCollisions,
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

describe('Owner-scoped unregister (Upgrade/Uninstall)', () => {
  const aOwner: WorkflowActionDefinition = {
    id: 'plugA.do', moduleId: 'antares', moduleLabel: 'Plugin A', featureGate: 'gateA',
    label: 'A', inputs: [], outputs: [{ id: 'text', label: 'T', kind: 'text' }],
  }
  const bOwner: WorkflowActionDefinition = {
    id: 'plugB.do', moduleId: 'edoobox', moduleLabel: 'Plugin B',
    label: 'B', inputs: [], outputs: [{ id: 'text', label: 'T', kind: 'text' }],
  }

  it('entfernt nur die Actions des angegebenen Owners', () => {
    registerWorkflowActions([aOwner], 'plugin-a')
    registerWorkflowActions([bOwner], 'plugin-b')
    expect(getActionById('plugA.do')).toBeDefined()
    expect(getActionById('plugB.do')).toBeDefined()

    unregisterWorkflowActions('plugin-a')
    expect(getActionById('plugA.do')).toBeUndefined() // weg
    expect(getActionById('plugB.do')).toBeDefined() // bleibt
    // Modul-Label/-Gate des entfernten Owners fallen zurück, das des anderen bleibt.
    expect(workflowModuleLabel('antares')).toBe('antares')
    expect(workflowModuleGate('antares')).toBeNull()
    expect(workflowModuleLabel('edoobox')).toBe('Plugin B')
  })

  it('besitzlose (gebündelte) Actions werden von unregister nicht angefasst', () => {
    registerWorkflowActions([aOwner]) // KEIN owner
    unregisterWorkflowActions('plugin-a')
    expect(getActionById('plugA.do')).toBeDefined()
  })

  it('Upgrade-Semantik: alte Actions entfernen, dann neue (reduzierte) Menge registrieren', () => {
    const v1a: WorkflowActionDefinition = { id: 'p.one', moduleId: 'antares', label: '1', inputs: [], outputs: [] }
    const v1b: WorkflowActionDefinition = { id: 'p.two', moduleId: 'antares', label: '2', inputs: [], outputs: [] }
    registerWorkflowActions([v1a, v1b], 'p') // v1 hatte zwei Actions
    unregisterWorkflowActions('p') // Upgrade entfernt alte
    registerWorkflowActions([v1a], 'p') // v2 bringt nur noch eine
    expect(getActionById('p.one')).toBeDefined()
    expect(getActionById('p.two')).toBeUndefined() // gedroppte Action bleibt NICHT hängen
  })

  it('unregister eines unbekannten Owners ist ein No-Op', () => {
    registerWorkflowActions([aOwner], 'plugin-a')
    expect(() => unregisterWorkflowActions('does-not-exist')).not.toThrow()
    expect(getActionById('plugA.do')).toBeDefined()
  })
})

describe('Owner-Kollisions-Guard (Sicherheit gegen Action-Shadowing)', () => {
  it('ein Owned-Plugin darf KEINE Kern-Action shadowen', () => {
    const evil: WorkflowActionDefinition = {
      id: 'tasks.dueSoon', moduleId: 'tasks', label: 'EVIL', inputs: [], outputs: [],
    }
    registerWorkflowActions([evil], 'evil-plugin')
    // Kern-Action bleibt unverändert (Kern-Definition, nicht die Plugin-Variante).
    expect(getActionById('tasks.dueSoon')?.label).not.toBe('EVIL')
    expect(getActionById('tasks.dueSoon')?.isTrigger).toBe(true)
    // Beim Uninstall des Plugins verschwindet die Kern-Action NICHT.
    unregisterWorkflowActions('evil-plugin')
    expect(getActionById('tasks.dueSoon')?.isTrigger).toBe(true)
  })

  it('ein Owned-Plugin darf die Action eines anderen Owners NICHT übernehmen/löschen', () => {
    const aReal: WorkflowActionDefinition = {
      id: 'shared.do', moduleId: 'antares', label: 'A-real', inputs: [], outputs: [],
    }
    const bEvil: WorkflowActionDefinition = {
      id: 'shared.do', moduleId: 'edoobox', label: 'B-evil', inputs: [], outputs: [],
    }
    registerWorkflowActions([aReal], 'plugin-a')
    registerWorkflowActions([bEvil], 'plugin-b') // Kollision → verworfen
    expect(getActionById('shared.do')?.label).toBe('A-real') // A behält die Action

    // B's Uninstall darf A's Action NICHT mitnehmen.
    unregisterWorkflowActions('plugin-b')
    expect(getActionById('shared.do')?.label).toBe('A-real')
  })

  it('ein Owned-Plugin darf eine besitzlose (gebündelte) Action NICHT übernehmen', () => {
    const bundled: WorkflowActionDefinition = {
      id: 'bundled.do', moduleId: 'antares', label: 'bundled', inputs: [], outputs: [],
    }
    registerWorkflowActions([bundled]) // ownerless (gebündelt)
    const diskTakeover: WorkflowActionDefinition = {
      id: 'bundled.do', moduleId: 'antares', label: 'disk', inputs: [], outputs: [],
    }
    registerWorkflowActions([diskTakeover], 'disk-plugin') // Kollision mit ownerless → verworfen
    expect(getActionById('bundled.do')?.label).toBe('bundled')
    unregisterWorkflowActions('disk-plugin')
    expect(getActionById('bundled.do')?.label).toBe('bundled') // bleibt erhalten
  })

  it('ein Owned-Plugin darf seine EIGENE Action ersetzen (Upgrade)', () => {
    const v1: WorkflowActionDefinition = { id: 'mine.do', moduleId: 'm', label: 'v1', inputs: [], outputs: [] }
    const v2: WorkflowActionDefinition = { id: 'mine.do', moduleId: 'm', label: 'v2', inputs: [], outputs: [] }
    registerWorkflowActions([v1], 'mine')
    registerWorkflowActions([v2], 'mine') // gleicher Owner → ersetzt
    expect(getActionById('mine.do')?.label).toBe('v2')
  })
})

describe('findWorkflowActionCollisions (terminale Ablehnung im Install-Pfad)', () => {
  it('meldet Kollision mit einer Kern-Action', () => {
    const defs: WorkflowActionDefinition[] = [{ id: 'tasks.dueSoon', moduleId: 'tasks', label: 'x', inputs: [], outputs: [] }]
    expect(findWorkflowActionCollisions(defs, 'p')).toEqual(['tasks.dueSoon'])
  })

  it('meldet Kollision mit einer fremden Plugin-Action', () => {
    registerWorkflowActions([{ id: 'a.do', moduleId: 'antares', label: 'a', inputs: [], outputs: [] }], 'plugin-a')
    expect(findWorkflowActionCollisions([{ id: 'a.do', moduleId: 'x', label: 'b', inputs: [], outputs: [] }], 'plugin-b')).toEqual(['a.do'])
  })

  it('meldet KEINE Kollision für neue oder eigene IDs', () => {
    registerWorkflowActions([{ id: 'a.do', moduleId: 'antares', label: 'a', inputs: [], outputs: [] }], 'plugin-a')
    expect(findWorkflowActionCollisions([{ id: 'a.new', moduleId: 'antares', label: 'n', inputs: [], outputs: [] }], 'plugin-a')).toEqual([])
    expect(findWorkflowActionCollisions([{ id: 'a.do', moduleId: 'antares', label: 'a2', inputs: [], outputs: [] }], 'plugin-a')).toEqual([])
  })
})

describe('Deletion-Test: Kern-Beispiele referenzieren keine Plugin-Trigger', () => {
  it('buildExampleWorkflows nennt weder antares.mahnung noch edoobox.newBooking', () => {
    const actionIds = buildExampleWorkflows().flatMap(w => w.nodes.map(n => n.actionId))
    expect(actionIds).not.toContain('antares.mahnung')
    expect(actionIds).not.toContain('edoobox.newBooking')
  })
})
