// Kontextbudget im Agent-Loop (Baustein B, docs/codex-collab/agent-rueckblick-unterordner.md).
// chatWithTools ist gemockt; die gemeldeten Prompt-Token steuern den Budget-Stand.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('../llm/chatClient', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  chatWithTools: vi.fn()
}))

import { chatWithTools } from '../llm/chatClient'
import { runNoteAgentLoop } from './loop'
import { estimateTokens } from '../../shared/contextBudget'
import type { AgentRun } from './runRegistry'

const mockChat = chatWithTools as unknown as ReturnType<typeof vi.fn>
let vault: string

function makeRun(): AgentRun {
  return {
    runId: 'run-budget', senderId: 987_655, noteId: 'n', vaultPath: vault,
    targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'),
    attachmentIds: [], instruction: 'Fasse zusammen', skills: [],
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
const done = (promptTokens?: number) => ({ text: 'fertig', toolCalls: [], assistantMessage: { role: 'assistant', content: 'fertig' }, promptTokens })

function toolMessages(callIndex: number): Array<{ role: string; content: string; tool_name?: string }> {
  return (mockChat.mock.calls[callIndex][0] as Array<{ role: string; content: string; tool_name?: string }>).filter(m => m.role === 'tool')
}

beforeEach(async () => {
  mockChat.mockReset()
  vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-loop-budget-')))
})

afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

const run = (agentRun: AgentRun, chatOptions: Record<string, unknown> = { backend: 'ollama' }, onStep = vi.fn()) =>
  runNoteAgentLoop({ run: agentRun, noteContent: '', agentMemory: '', chatOptions: chatOptions as never, onStep })

describe('Kontextbudget im Loop', () => {
  it('sperrt Lesewerkzeuge, wenn nur noch Platz für die Antwort bleibt', async () => {
    await fs.writeFile(path.join(vault, 'a.md'), 'Inhalt', 'utf8')
    mockChat
      .mockResolvedValueOnce(toolCall('note_read', { path: 'a.md' }, 25_000))
      .mockResolvedValueOnce(done(25_100))
    await run(makeRun())
    const msgs = toolMessages(1)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].content).toContain('Kontext fast voll')
    expect(msgs[0].content).not.toContain('Inhalt')
  })

  it('liest normal, solange Platz ist', async () => {
    await fs.writeFile(path.join(vault, 'a.md'), 'Inhalt der Notiz', 'utf8')
    mockChat
      .mockResolvedValueOnce(toolCall('note_read', { path: 'a.md' }, 5_000))
      .mockResolvedValueOnce(done(5_200))
    await run(makeRun())
    expect(toolMessages(1)[0].content).toContain('Inhalt der Notiz')
  })

  // Seit 11.11.2026 liest note_read ein passendes Stück, statt abgelehnt zu werden — die
  // Ablehnung ließ das Modell die nächste Notiz probieren, bis das Schrittlimit kam.
  it('liest von einer zu großen Notiz nur ein passendes Stück und nennt den offset fürs nächste', async () => {
    // 7 900 Ziffern ≈ 11 000 Token geschätzt — mehr als ein Viertel von 32 768.
    await fs.writeFile(path.join(vault, 'zahlen.md'), '1234567890'.repeat(790), 'utf8')
    mockChat
      .mockResolvedValueOnce(toolCall('note_read', { path: 'zahlen.md' }, 3_000))
      .mockResolvedValueOnce(done(3_200))
    await run(makeRun())
    const content = toolMessages(1)[0].content
    expect(content).not.toContain('zu groß für den verbleibenden Kontext')
    expect(content).toMatch(/weiterlesen mit offset=\d+/)
    // Ein Viertel des Fensters (8 192 Token) ist die Obergrenze für EIN Ergebnis.
    expect(estimateTokens(content)).toBeLessThanOrEqual(8_192)
  })

  it('stoppt vor dem Senden, wenn der Kontext voll ist — laut statt still überzulaufen', async () => {
    mockChat.mockResolvedValueOnce(toolCall('list_target_folder', {}, 31_500))
    await expect(run(makeRun())).rejects.toThrow(/Arbeitsspeicher des Modells/)
    expect(mockChat).toHaveBeenCalledTimes(1)
  })

  it('voller Kontext NACH einem geschriebenen Ergebnis ist kein Fehler — der Lauf endet mit dem Ergebnis', async () => {
    mockChat.mockResolvedValueOnce(toolCall('write_note', { file_name: 'Ergebnis.md', markdown: '# Ergebnis\n\nText.' }, 31_500))
    const agentRun = makeRun()
    const res = await run(agentRun)
    expect(agentRun.results.size).toBe(1)
    expect(res.hitMaxIterations).toBe(false)
    // Kein Fehler, aber auch keine Erfolgsbehauptung (Codex F11): sagen, was vorliegt und wie es weitergeht.
    expect(res.text).toContain('Geschrieben ist: „Ergebnis.md“')
    expect(res.text).toContain('Ob der Auftrag damit vollständig ist')
    expect(res.text).not.toMatch(/Das Ergebnis ist geschrieben|erledigt|fertig/)
    expect(agentRun.transcript?.length).toBeGreaterThan(0) // für „mach weiter“ erhalten
    expect(mockChat).toHaveBeenCalledTimes(1) // kein weiterer Modellaufruf in den vollen Kontext
  })

  it('voller Kontext OHNE Ergebnis bleibt ein Fehler; im Web-Lauf zählt nur ein geschriebenes Ergebnis', async () => {
    mockChat.mockResolvedValueOnce(toolCall('list_target_folder', {}, 31_500))
    await expect(run(makeRun())).rejects.toThrow(/bevor ein Ergebnis geschrieben wurde/)
  })

  it('nennt bei unbekannter Kontextgröße die vorsichtige Annahme im Protokoll', async () => {
    mockChat.mockResolvedValueOnce(done())
    const onStep = vi.fn()
    await run(makeRun(), { backend: 'lmstudio', lmstudioModel: 'x' }, onStep)
    expect(onStep.mock.calls.some(c => c[1] === 'kontext' && String(c[2]).includes('32.768'))).toBe(true)
  })

  it('fordert die Abschaltung der stillen Mitten-Kompression an (wirkt nur bei OpenRouter)', async () => {
    mockChat.mockResolvedValueOnce(done())
    await run(makeRun())
    expect(mockChat.mock.calls[0][2].disableMiddleOut).toBe(true)
  })
})

describe('Treffer außerhalb des angehängten Ordners', () => {
  it('note_read markiert Notizen außerhalb, liest Notizen im Anhang unverändert', async () => {
    const { registerContextFolder, clearContextAttachments } = await import('./contextFiles')
    await fs.mkdir(path.join(vault, 'Journal'), { recursive: true })
    await fs.mkdir(path.join(vault, 'Anderes'), { recursive: true })
    await fs.writeFile(path.join(vault, 'Journal', 'innen.md'), 'innen', 'utf8')
    await fs.writeFile(path.join(vault, 'Anderes', 'aussen.md'), 'aussen', 'utf8')
    const agentRun = makeRun()
    const reg = await registerContextFolder(agentRun.senderId, path.join(vault, 'Journal'), true, vault)
    if (!reg.ok) throw new Error(reg.error)
    agentRun.attachmentIds = [reg.attachment.id]
    try {
      mockChat
        .mockResolvedValueOnce({
          text: '',
          toolCalls: [
            { id: 'a', name: 'note_read', arguments: { path: 'Journal/innen.md' } },
            { id: 'b', name: 'note_read', arguments: { path: 'Anderes/aussen.md' } }
          ],
          assistantMessage: { role: 'assistant', content: '' },
          promptTokens: 3_000
        })
        .mockResolvedValueOnce(done(3_200))
      await run(agentRun)
      const [innen, aussen] = toolMessages(1)
      expect(innen.content).not.toContain('außerhalb der angehängten Ordner')
      expect(aussen.content).toContain('HINWEIS: Diese Notiz liegt außerhalb der angehängten Ordner')
      expect(aussen.content).toContain('aussen')
    } finally {
      clearContextAttachments(agentRun.senderId)
    }
  })
})
