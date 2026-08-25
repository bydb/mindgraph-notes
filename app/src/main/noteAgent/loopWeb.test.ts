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
    apiKey: null, phase: 'search', allowedUrls: new Set(), queries: [], fetches: [],
    searchCount: 0, fetchCount: 0, wrote: false, ...overrides
  }
}

const noToolCalls = { text: 'fertig', toolCalls: [], assistantMessage: { role: 'assistant', content: 'fertig' } }
const runWithChatOptions = (web: WebRunState | undefined, chatOptions: Record<string, unknown>) =>
  runNoteAgentLoop({ run: makeRun(web), noteContent: '', agentMemory: '', chatOptions: chatOptions as never, onStep: () => {} })
const run = (web?: WebRunState) => runWithChatOptions(web, {})

beforeEach(() => mockChat.mockReset())

describe('Agent-Ausführungsprofil', () => {
  it('setzt von sich aus kein Profil — auch nicht für Thinking-Modelle', async () => {
    mockChat.mockResolvedValue(noToolCalls)
    await runWithChatOptions(undefined, { backend: 'ollama', ollamaModel: 'qwen3.8:27b-mlx' })
    expect(mockChat.mock.calls[0][2].executionProfile).toBeUndefined()
  })

  it('reicht ein vom Aufrufer gesetztes Profil unverändert durch', async () => {
    mockChat.mockResolvedValue(noToolCalls)
    const executionProfile = {
      id: 'explizit-preserve',
      ollama: { thinkingMode: 'preserve', temperature: 1, topP: 0.95 }
    }
    await runWithChatOptions(undefined, { backend: 'ollama', ollamaModel: 'qwen3.8:27b-mlx', executionProfile })
    expect(mockChat.mock.calls[0][2].executionProfile).toEqual(executionProfile)
  })
})

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

// Regression 30.07.2026: write_html war im Web-Lauf aus der Allowlist geflogen, während der
// Skill „Wissenschaftliche Webseite" es verlangte. Das Modell rief write_note mit .html auf,
// bekam „benutze write_html" — ein Werkzeug, das der Lauf nicht hatte — und drehte eine
// Fehler-Schleife (real mit kimi-k3, bis ein Netzabbruch den Lauf killte).
describe('Werkzeug-Allowlist im Web-Lauf', () => {
  const toolNames = (callIndex = 0) =>
    (mockChat.mock.calls[callIndex][1] as Array<{ name: string }>).map(t => t.name)

  it('bietet write_note UND write_html an, aber keine Office-Formate', async () => {
    mockChat.mockResolvedValue(noToolCalls)
    await run(makeWeb({ wrote: true, phase: 'write' }))
    const names = toolNames()
    expect(names).toContain('write_note')
    expect(names).toContain('write_html')
    expect(names).toContain('web_search')
    expect(names).not.toContain('write_xlsx')
    expect(names).not.toContain('write_docx')
    expect(names).not.toContain('fill_docx_form')
  })

  it('Nicht-Web-Lauf bietet die Office-Formate weiterhin an', async () => {
    mockChat.mockResolvedValue(noToolCalls)
    await run(undefined)
    const names = toolNames()
    expect(names).toContain('write_xlsx')
    expect(names).toContain('write_html')
    expect(names).not.toContain('web_search')
  })
})
