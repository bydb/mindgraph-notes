// Schrittlimit und voller Kontext: Der Lauf soll mit einem Ergebnis enden statt wortlos.
// Auslöser (11.11.2026): Leseauftrag über acht Notizen — lokal fuhr sich der Agent an
// abgelehnten note_read-Aufrufen fest, in der Cloud las er zwölf Aufrufe lang und schrieb nie.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('../llm/chatClient', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  chatWithTools: vi.fn(),
  catalogContextLength: vi.fn(async () => null)
}))

import { chatWithTools, catalogContextLength } from '../llm/chatClient'
import { runNoteAgentLoop } from './loop'
import { sliceNotePiece } from '../telegram/agent/tools/notes'
import type { AgentRun } from './runRegistry'

const mockChat = chatWithTools as unknown as ReturnType<typeof vi.fn>
const mockCatalog = catalogContextLength as unknown as ReturnType<typeof vi.fn>
let vault: string

function makeRun(): AgentRun {
  return {
    runId: 'run-turns', senderId: 987_656, noteId: 'n', vaultPath: vault,
    targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'),
    attachmentIds: [], instruction: 'Vergleiche die Notizen', skills: [],
    status: 'running', abort: new AbortController(), seq: 0,
    results: new Map(), sources: new Set<string>(), datasets: new Map(),
    folderReads: new Map(), collectedFolders: new Set(), toolsUsed: new Set()
  } as unknown as AgentRun
}

const toolCall = (name: string, args: Record<string, unknown>, promptTokens?: number) => ({
  text: '',
  toolCalls: [{ id: `c-${name}`, name, arguments: args }],
  assistantMessage: { role: 'assistant', content: '' },
  promptTokens
})

type Msg = { role: string; content: string }
const messagesOf = (callIndex: number): Msg[] => mockChat.mock.calls[callIndex][0] as Msg[]
const toolNamesOf = (callIndex: number): string[] => (mockChat.mock.calls[callIndex][1] as Array<{ name: string }>).map(t => t.name)

beforeEach(async () => {
  mockChat.mockReset()
  mockCatalog.mockReset()
  mockCatalog.mockResolvedValue(null)
  vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-loop-turns-')))
  await fs.writeFile(path.join(vault, 'a.md'), 'Inhalt', 'utf8')
})
afterEach(async () => { await fs.rm(vault, { recursive: true, force: true }) })

const run = (onContext = vi.fn(), chatOptions: Record<string, unknown> = { backend: 'ollama' }) =>
  runNoteAgentLoop({ run: makeRun(), noteContent: '', agentMemory: '', chatOptions: chatOptions as never, onStep: vi.fn(), onContext })

describe('Schrittlimit', () => {
  it('kündigt das Ende an und bietet im letzten Schritt nur noch Schreibwerkzeuge', async () => {
    mockChat.mockResolvedValue(toolCall('note_read', { path: 'a.md' }, 2_000))
    const onContext = vi.fn()
    const res = await run(onContext)
    expect(res.hitMaxIterations).toBe(true)
    expect(mockChat).toHaveBeenCalledTimes(20)
    // Aufruf 18 (noch drei Schritte): Ankündigung, alle Werkzeuge noch da.
    expect(messagesOf(17).some(m => m.role === 'user' && m.content.includes('noch drei Arbeitsschritte'))).toBe(true)
    expect(toolNamesOf(17)).toContain('note_read')
    // Aufruf 20: nur noch Ergebnis-Werkzeuge.
    expect(messagesOf(19).some(m => m.role === 'user' && m.content.includes('letzter Arbeitsschritt'))).toBe(true)
    expect(toolNamesOf(19).length).toBeGreaterThan(0)
    expect(toolNamesOf(19).every(n => n.startsWith('write_'))).toBe(true)
    // Die Oberfläche erfährt den Stand der Schritte.
    expect(onContext).toHaveBeenLastCalledWith(expect.objectContaining({ window: expect.any(Number) }), { used: 20, max: 20 })
  })

  it('großes Fenster aus dem Anbieterkatalog: 30 Runden statt 20', async () => {
    mockCatalog.mockResolvedValue(200_000)
    mockChat.mockResolvedValue(toolCall('note_read', { path: 'a.md' }, 2_000))
    const onContext = vi.fn()
    const res = await run(onContext, { backend: 'openrouter', model: 'anbieter/modell' })
    expect(res.hitMaxIterations).toBe(true)
    expect(mockChat).toHaveBeenCalledTimes(30)
    expect(toolNamesOf(28)).toContain('note_read')
    expect(toolNamesOf(29).every(n => n.startsWith('write_'))).toBe(true)
    expect(onContext).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'catalog' }), { used: 30, max: 30 })
  })

  it('angenommenes Fenster (Cloud ohne Katalogwert): bleibt bei 20 Runden', async () => {
    mockChat.mockResolvedValue(toolCall('note_read', { path: 'a.md' }, 2_000))
    await run(vi.fn(), { backend: 'llmbase', model: 'anbieter/modell' })
    expect(mockChat).toHaveBeenCalledTimes(20)
  })

  it('drängt nach zwei abgelehnten Leseversuchen zum Schreiben', async () => {
    // 25 000 gemeldete Token bei 32 768 Fenster: Lesen ist gesperrt.
    mockChat
      .mockResolvedValueOnce(toolCall('note_read', { path: 'a.md' }, 25_000))
      .mockResolvedValueOnce(toolCall('note_read', { path: 'a.md' }, 25_050))
      .mockResolvedValueOnce({ text: 'Ergebnis aus dem Gelesenen', toolCalls: [], assistantMessage: { role: 'assistant', content: 'Ergebnis aus dem Gelesenen' }, promptTokens: 25_100 })
    const res = await run()
    expect(res.hitMaxIterations).toBe(false)
    expect(messagesOf(2).some(m => m.role === 'user' && m.content.includes('Kontext ist voll'))).toBe(true)
    expect(toolNamesOf(2).every(n => n.startsWith('write_'))).toBe(true)
    expect(toolNamesOf(1)).toContain('note_read')
  })
})

describe('note_read in Stücken', () => {
  it('liest bei knappem Platz ein passendes Stück statt abgelehnt zu werden', async () => {
    const long = Array.from({ length: 400 }, (_, i) => `Zeile ${i}: Die Lerngruppe arbeitet mit dem Sprachmodell an einer Erörterung.`).join('\n')
    await fs.writeFile(path.join(vault, 'lang.md'), long, 'utf8')
    // 22 800 von 32 768 belegt, 8 192 Reserve: rund 1 800 Token Platz — zu wenig für 8 000 Zeichen.
    mockChat
      .mockResolvedValueOnce(toolCall('note_read', { path: 'lang.md' }, 22_800))
      .mockResolvedValueOnce({ text: 'fertig', toolCalls: [], assistantMessage: { role: 'assistant', content: 'fertig' }, promptTokens: 24_000 })
    await run()
    const tool = messagesOf(1).filter(m => m.role === 'tool')[0]
    expect(tool.content).toContain('Zeile 0:')
    expect(tool.content).toMatch(/weiterlesen mit offset=\d+/)
    expect(tool.content).not.toContain('zu groß')
  })

  it('sliceNotePiece: Folgestück, Zeilengrenze, Ende', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Zeile ${String(i).padStart(2, '0')}`).join('\n')
    const first = sliceNotePiece(text, 0, 100)
    const next = Number(/offset=(\d+)/.exec(first)![1])
    expect(text[next - 1]).toBe('\n')
    const second = sliceNotePiece(text, next, 100)
    expect(second.startsWith(`[Stück ab Zeichen ${next} von ${text.length}]`)).toBe(true)
    expect(second).toContain(text.slice(next, next + 8))
    expect(sliceNotePiece(text, 0)).toBe(text)
    expect(sliceNotePiece(text, text.length + 5)).toContain('Ende der Notiz')
  })
})
