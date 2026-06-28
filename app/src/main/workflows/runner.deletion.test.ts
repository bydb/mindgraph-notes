import { describe, it, expect, afterEach } from 'vitest'
import { resolveExecutor } from './runner'
import { registerWorkflowActions, __resetWorkflowActionsForTest } from '../../shared/workflow/registry'
import type { WorkflowActionDefinition } from '../../shared/workflow/types'

// Kein Import aus src/plugins/* — überlebt eine echte Ordner-Löschung. Ein synthetischer Trigger
// steht für eine beliebige plugin-beigesteuerte Workflow-Action.
const synthetic: WorkflowActionDefinition = {
  id: 'test.syntheticTrigger',
  moduleId: 'antares',
  label: 'Synthetischer Trigger',
  isTrigger: true,
  inputs: [],
  outputs: [{ id: 'text', label: 'Text', kind: 'text' }],
}

afterEach(() => __resetWorkflowActionsForTest())

describe('Runner — generischer Trigger-Executor (kein statischer Plugin-Eintrag)', () => {
  it('ohne registriertes Plugin: kein Executor → Schritt wird sauber übersprungen', () => {
    expect(resolveExecutor('antares.mahnung')).toBeUndefined()
    expect(resolveExecutor('edoobox.newBooking')).toBeUndefined()
    expect(resolveExecutor('test.syntheticTrigger')).toBeUndefined()
  })

  it('mit registriertem Plugin-Trigger: generischer Text-Trigger-Executor', () => {
    registerWorkflowActions([synthetic])
    expect(typeof resolveExecutor('test.syntheticTrigger')).toBe('function')
  })

  it('Kern-Trigger/-Actions bleiben explizit gemappt', () => {
    expect(typeof resolveExecutor('tasks.dueSoon')).toBe('function')
    expect(typeof resolveExecutor('email.selectedEmail')).toBe('function')
    expect(typeof resolveExecutor('email.analyze')).toBe('function')
  })

  it('unbekannte Nicht-Trigger-Action → kein Executor', () => {
    expect(resolveExecutor('does.not.exist')).toBeUndefined()
  })
})
