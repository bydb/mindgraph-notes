// Vertragstest des Confirm-Flows im Telegram-Agent-Loop: Schreib-Tools
// (isWrite) laufen NUR mit Nutzer-Bestätigung. Fehlt der Confirm-Kanal,
// wird das Tool abgelehnt (fail-closed) — nie stillschweigend ausgeführt.
// chatWithTools ist gemockt (kein echtes Modell).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../llm/chatClient', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  chatWithTools: vi.fn()
}))

import { chatWithTools } from '../../llm/chatClient'
import { runAgent } from './loop'
import { ToolRegistry, type ToolContext, type AppTool } from './tools/registry'

const mockChat = chatWithTools as unknown as ReturnType<typeof vi.fn>

const ctx: ToolContext = {
  vaultPath: '/tmp/mg-loop-test-nonexistent',
  excludedFolders: [],
  inboxFolder: '',
  projectsRootFolder: '',
  embeddingModel: ''
}

function makeWriteTool(): { tool: AppTool; runSpy: ReturnType<typeof vi.fn> } {
  const runSpy = vi.fn(async () => ({ ok: true, content: 'geschrieben' }))
  const tool: AppTool = {
    name: 'note_create',
    description: 'Testschreibtool',
    parameters: { type: 'object', properties: {} },
    isWrite: true,
    run: runSpy
  }
  return { tool, runSpy }
}

function toolCallTurn() {
  return {
    text: '',
    toolCalls: [{ id: 'tc1', name: 'note_create', arguments: { title: 't', content: 'c' } }],
    assistantMessage: { role: 'assistant', content: '' },
    backend: 'ollama'
  }
}

function finalTurn() {
  return {
    text: 'fertig',
    toolCalls: [],
    assistantMessage: { role: 'assistant', content: 'fertig' },
    backend: 'ollama'
  }
}

function baseOpts(registry: ToolRegistry) {
  return {
    registry,
    toolContext: ctx,
    allowedTools: new Set(['note_create']),
    confirmRequiredTools: new Set<string>(),
    maxIterations: 3,
    chatOptions: {} as never
  }
}

beforeEach(() => mockChat.mockReset())

describe('runAgent — Confirm-Flow für Schreib-Tools', () => {
  it('REGRESSION: ohne requestConfirm wird ein isWrite-Tool NICHT ausgeführt (fail-closed)', async () => {
    const registry = new ToolRegistry()
    const { tool, runSpy } = makeWriteTool()
    registry.register(tool)
    mockChat.mockResolvedValueOnce(toolCallTurn()).mockResolvedValueOnce(finalTurn())

    const result = await runAgent('lege eine Notiz an', baseOpts(registry))

    expect(runSpy).not.toHaveBeenCalled()
    expect(result.toolCallsExecuted).toBe(0)
    expect(result.toolCallsDenied).toBe(1)
    // Das Modell bekommt eine erklärende Tool-Fehlermeldung zurück:
    const secondCallMessages = mockChat.mock.calls[1][0] as Array<{ role: string; content: string }>
    const toolMsg = secondCallMessages.find(m => m.role === 'tool')
    expect(toolMsg?.content).toMatch(/Bestätigung/)
  })

  it('mit ablehnendem requestConfirm wird das Tool nicht ausgeführt', async () => {
    const registry = new ToolRegistry()
    const { tool, runSpy } = makeWriteTool()
    registry.register(tool)
    mockChat.mockResolvedValueOnce(toolCallTurn()).mockResolvedValueOnce(finalTurn())

    const result = await runAgent('lege eine Notiz an', {
      ...baseOpts(registry),
      requestConfirm: async () => false
    })

    expect(runSpy).not.toHaveBeenCalled()
    expect(result.toolCallsDenied).toBe(1)
  })

  it('mit zustimmendem requestConfirm wird das Tool ausgeführt', async () => {
    const registry = new ToolRegistry()
    const { tool, runSpy } = makeWriteTool()
    registry.register(tool)
    mockChat.mockResolvedValueOnce(toolCallTurn()).mockResolvedValueOnce(finalTurn())

    const result = await runAgent('lege eine Notiz an', {
      ...baseOpts(registry),
      requestConfirm: async () => true
    })

    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(result.toolCallsExecuted).toBe(1)
    expect(result.toolCallsDenied).toBe(0)
    expect(result.text).toBe('fertig')
  })
})
