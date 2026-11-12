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
import { listVaultNotes, looseKey, repairNotePath } from './notePathRepair'
import type { AgentRun } from './runRegistry'

const mockChat = chatWithTools as unknown as ReturnType<typeof vi.fn>

describe('repairNotePath', () => {
  const all = [
    '300 - 📦 Ressourcen/371 - 💬 KI/Fokus Schule/🤖🎓 Einsatz von KI in der Schule.md',
    '100 - ✅ Projekte/136 - KiDi/Kerncurriculum.md',
    '200 - Bereich/Kerncurriculum.md',
    'Artikel/Meine Sichtweise.md'
  ]

  it('findet die eine Notiz, wenn Emojis oder ein Ordner fehlen', () => {
    expect(repairNotePath(all, '300 - Ressourcen/371 - KI/Einsatz von KI in der Schule.md').match).toBe(all[0])
    expect(repairNotePath(all, 'meine sichtweise.md').match).toBe(all[3])
  })

  it('rät nicht bei mehreren Notizen gleichen Namens — außer der Pfad passt genau zu einer', () => {
    const ambiguous = repairNotePath(all, 'Kerncurriculum.md')
    expect(ambiguous.match).toBeUndefined()
    expect(ambiguous.candidates).toEqual([all[1], all[2]])
    expect(repairNotePath(all, '100 - Projekte/136 - KiDi/Kerncurriculum.md').match).toBe(all[1])
  })

  it('findet nichts, wenn keine Notiz so heißt', () => {
    expect(repairNotePath(all, 'Gibt es nicht.md')).toEqual({ candidates: [] })
    expect(looseKey('💬 KI — Fokus!')).toBe('kifokus')
    expect(looseKey('Rückmeldung Größe')).toBe(looseKey('Rueckmeldung Groesse'))
  })
})

describe('note_read mit falsch abgeschriebenem Pfad', () => {
  let vault: string
  beforeEach(async () => {
    mockChat.mockReset()
    vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-path-repair-')))
    await fs.mkdir(path.join(vault, '371 - 💬 KI'), { recursive: true })
    await fs.mkdir(path.join(vault, '.mindgraph'), { recursive: true })
    await fs.writeFile(path.join(vault, '371 - 💬 KI', '🤖 Einsatz von KI.md'), 'Inhalt der gemeinten Notiz', 'utf8')
    await fs.writeFile(path.join(vault, '.mindgraph', 'Einsatz von KI.md'), 'versteckt', 'utf8')
  })
  afterEach(async () => { await fs.rm(vault, { recursive: true, force: true }) })

  const makeRun = (): AgentRun => ({
    runId: 'run-repair', senderId: 987_658, noteId: 'n', vaultPath: vault,
    targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'),
    attachmentIds: [], instruction: 'Fasse zusammen', skills: [],
    status: 'running', abort: new AbortController(), seq: 0,
    results: new Map(), sources: new Set<string>(), datasets: new Map(),
    folderReads: new Map(), collectedFolders: new Set(), toolsUsed: new Set()
  } as unknown as AgentRun)
  const read = (file: string) => ({
    text: '', toolCalls: [{ id: 'c1', name: 'note_read', arguments: { path: file } }],
    assistantMessage: { role: 'assistant', content: '' }, promptTokens: 3_000
  })
  const done = { text: 'fertig', toolCalls: [], assistantMessage: { role: 'assistant', content: 'fertig' }, promptTokens: 3_200 }
  const toolResult = (): string => (mockChat.mock.calls[1][0] as Array<{ role: string; content: string }>).filter(m => m.role === 'tool')[0].content

  it('liest die eine Notiz gleichen Namens und sagt, dass der Pfad korrigiert wurde', async () => {
    mockChat.mockResolvedValueOnce(read('371 - KI/Einsatz von KI.md')).mockResolvedValueOnce(done)
    await runNoteAgentLoop({ run: makeRun(), noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep: vi.fn() })
    expect(toolResult()).toContain('Inhalt der gemeinten Notiz')
    expect(toolResult()).toContain('Gelesen wurde die einzige Notiz dieses Namens: 371 - 💬 KI/🤖 Einsatz von KI.md')
  })

  it('bleibt ehrlich, wenn es die Notiz nicht gibt', async () => {
    mockChat.mockResolvedValueOnce(read('Protokoll vom Mond.md')).mockResolvedValueOnce(done)
    await runNoteAgentLoop({ run: makeRun(), noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep: vi.fn() })
    expect(toolResult()).toContain('keine andere Notiz im Vault trägt diesen Namen')
  })

  it('listVaultNotes lässt versteckte Ordner aus', async () => {
    expect(await listVaultNotes(vault)).toEqual(['371 - 💬 KI/🤖 Einsatz von KI.md'])
  })
})
