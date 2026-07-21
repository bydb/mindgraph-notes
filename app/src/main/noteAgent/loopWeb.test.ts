// Vertragstest des Web-Lauf-Abschlusses (Phase 3, 0e): ein Web-Lauf darf NICHT erfolgreich
// enden, ohne dass write_note erfolgreich ausgeführt wurde. chatWithTools ist gemockt (kein
// echtes Modell) — das Modell „stoppt" hier ohne je zu schreiben.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../llm/chatClient', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  chatWithTools: vi.fn()
}))

import { chatWithTools } from '../llm/chatClient'
import { runNoteAgentLoop } from './loop'
import type { AgentRun, WebRunState } from './runRegistry'

const mockChat = chatWithTools as unknown as ReturnType<typeof vi.fn>

function makeRun(web?: WebRunState): AgentRun {
  return {
    runId: 'run-test', senderId: 987654, noteId: 'n', vaultPath: '/tmp/vault',
    targetFolderRel: 'Ordner', targetFolderAbs: '/tmp/vault/Ordner',
    attachmentIds: [], instruction: 'Recherchiere X', skills: [],
    status: 'running', abort: new AbortController(), seq: 0,
    results: new Map(), sources: new Set<string>(), web
  } as unknown as AgentRun
}

function makeWeb(overrides: Partial<WebRunState> = {}): WebRunState {
  return {
    config: { provider: 'searxng', searxngUrl: 'https://searx.example/' },
    linkupApiKey: null, phase: 'search', allowedUrls: new Set(), queries: [], fetches: [],
    searchCount: 0, fetchCount: 0, wrote: false, ...overrides
  }
}

const noToolCalls = { text: 'fertig', toolCalls: [], assistantMessage: { role: 'assistant', content: 'fertig' } }
const run = (web?: WebRunState) => runNoteAgentLoop({ run: makeRun(web), noteContent: '', agentMemory: '', chatOptions: {} as never, onStep: () => {} })

beforeEach(() => mockChat.mockReset())

describe('Web-Lauf-Abschluss (0e: genau ein Write)', () => {
  it('Web-Lauf ohne erfolgreichen Write endet NICHT erfolgreich (Fehler statt ok)', async () => {
    mockChat.mockResolvedValue(noToolCalls) // Modell schreibt nie
    await expect(run(makeWeb())).rejects.toThrow(/ohne Ergebnis|keine Notiz/i)
    // Es wurde nachgefasst (nudge) → mindestens zwei Modell-Aufrufe.
    expect(mockChat.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('Web-Lauf MIT geschriebenem Ergebnis endet erfolgreich', async () => {
    mockChat.mockResolvedValue(noToolCalls)
    const res = await run(makeWeb({ wrote: true, phase: 'write' }))
    expect(res.text).toBe('fertig')
    expect(res.hitMaxIterations).toBe(false)
  })

  it('Nicht-Web-Lauf endet ohne Write ganz normal erfolgreich', async () => {
    mockChat.mockResolvedValue(noToolCalls)
    const res = await run(undefined)
    expect(res.text).toBe('fertig')
    expect(res.hitMaxIterations).toBe(false)
  })
})
