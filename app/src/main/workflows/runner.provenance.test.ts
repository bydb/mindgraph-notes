// KI-Provenienz im Workflow-Runner: eine Notiz darf NUR dann als KI-Inhalt gestempelt
// werden, wenn in diesem Lauf tatsächlich ein Modell gearbeitet hat. Ein Workflow, der
// Text bloß deterministisch durchreicht, ist kein KI-Inhalt — und die Modell-Spur darf
// nicht aus einem vorherigen Lauf nachwirken.

import { describe, it, expect, vi } from 'vitest'
import { runWorkflow, type RunnerServices, type RunOptions } from './runner'
import type { Workflow } from '../../shared/workflow/model'

function mkServices(overrides: Partial<RunnerServices> = {}): RunnerServices {
  return {
    resolveModel: () => 'qwen3.6:27b-mlx',
    isHardLocked: () => false,
    isCloudModel: () => false,
    isModuleActive: () => true,
    ollamaGenerate: async () => 'Zusammenfassung des Textes.',
    matchProject: async () => null,
    loadProjectContext: async () => '',
    ragRetrieve: async () => ({ contextText: '', chunkCount: 0 }),
    createNote: vi.fn(async () => 'Ziel/Notiz.md'),
    appendNote: vi.fn(async () => 'Ziel/Notiz.md'),
    searchNotes: async () => [],
    createTask: async () => 'Ziel/Aufgaben.md',
    ...overrides
  }
}

function mkWorkflow(withLlm: boolean): Workflow {
  const nodes = [
    { id: 'trigger', actionId: 'tasks.dueSoon', position: { x: 0, y: 0 }, config: {} },
    ...(withLlm
      ? [{ id: 'llm', actionId: 'ollama.summarize', position: { x: 1, y: 0 }, config: {} }]
      : []),
    { id: 'write', actionId: 'notes.create', position: { x: 2, y: 0 }, config: { folder: 'Ziel', title: 'T' } }
  ]
  const edges = withLlm
    ? [
        { id: 'e1', fromNodeId: 'trigger', fromPortId: 'text', toNodeId: 'llm', toPortId: 'text' },
        { id: 'e2', fromNodeId: 'llm', fromPortId: 'text', toNodeId: 'write', toPortId: 'text' }
      ]
    : [{ id: 'e1', fromNodeId: 'trigger', fromPortId: 'text', toNodeId: 'write', toPortId: 'text' }]

  return {
    id: 'wf', name: 'Test', version: 1, nodes, edges,
    createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z'
  }
}

function mkOptions(services: RunnerServices): RunOptions {
  return { mode: 'execute', trigger: 'manual', seed: { text: 'Eingangstext' }, services }
}

describe('Runner — KI-Provenienz nur bei tatsächlicher Modell-Arbeit', () => {
  it('mit LLM-Node: die Notiz wird mit dem Modell gestempelt', async () => {
    const services = mkServices()
    const run = await runWorkflow(mkWorkflow(true), mkOptions(services))

    expect(run.status).not.toBe('failed')
    expect(services.createNote).toHaveBeenCalledWith('Ziel', 'T', expect.any(String), 'qwen3.6:27b-mlx')
  })

  it('ohne LLM-Node: kein Stempel — reines Durchreichen ist kein KI-Inhalt', async () => {
    const services = mkServices()
    const run = await runWorkflow(mkWorkflow(false), mkOptions(services))

    expect(run.status).not.toBe('failed')
    expect(services.createNote).toHaveBeenCalledWith('Ziel', 'T', expect.any(String), null)
  })

  it('die Modell-Spur wirkt nicht in einen späteren Lauf nach', async () => {
    const services = mkServices()
    const opts = mkOptions(services)

    await runWorkflow(mkWorkflow(true), opts)
    // Dasselbe Options-Objekt erneut verwenden — runWorkflow muss die Spur zurücksetzen.
    await runWorkflow(mkWorkflow(false), opts)

    const calls = (services.createNote as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][3]).toBe('qwen3.6:27b-mlx')
    expect(calls[1][3]).toBeNull()
  })
})
