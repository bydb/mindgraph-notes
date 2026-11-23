// Wann bietet der Loop describe_image an? (docs/codex-collab/agent-bilder-sehen.md, F03/F20)
// chatWithTools und die Fähigkeitsprüfung sind gemockt — kein Modell, kein Ollama.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('../llm/chatClient', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  chatWithTools: vi.fn()
}))
vi.mock('./describeImage', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  probeImageView: vi.fn()
}))

import { chatWithTools } from '../llm/chatClient'
import { probeImageView, createAgentImageViewState } from './describeImage'
import { runNoteAgentLoop, agentRequestTimeoutMs } from './loop'
import { registerContextAttachment, clearContextAttachments } from './contextFiles'
import type { AgentRun, WebRunState } from './runRegistry'

const mockChat = chatWithTools as unknown as ReturnType<typeof vi.fn>
const mockProbe = probeImageView as unknown as ReturnType<typeof vi.fn>
const SENDER = 987_700
const noToolCalls = { text: 'fertig', toolCalls: [], assistantMessage: { role: 'assistant', content: 'fertig' } }

function makeWeb(): WebRunState {
  return {
    config: { provider: 'searxng', searxngUrl: 'https://searx.example/' },
    apiKey: null, phase: 'write', allowedUrls: new Set(), queries: [], fetches: [],
    searchCount: 0, fetchCount: 0, wrote: true
  } as unknown as WebRunState
}

let dir = ''
async function attach(name: string): Promise<string> {
  const p = path.join(dir, name)
  await fs.writeFile(p, name.endsWith('.jpg') ? Buffer.from([0xff, 0xd8, 0xff, 0xd9]) : 'Text')
  const r = await registerContextAttachment(SENDER, p, false)
  if (!r.ok) throw new Error(r.error)
  return r.attachment.id
}

async function offered(attachmentIds: string[], web?: WebRunState): Promise<{ names: string[]; run: AgentRun; prompt: string }> {
  const run = {
    runId: 'run-bild', senderId: SENDER, noteId: 'n', vaultPath: dir,
    targetFolderRel: 'Ordner', targetFolderAbs: path.join(dir, 'Ordner'),
    attachmentIds, instruction: 'Sieh dir den Anhang an', skills: [], skillsUsed: [],
    status: 'running', abort: new AbortController(), seq: 0,
    results: new Map(), sources: new Set<string>(), toolsUsed: new Set(), web,
    route: { kind: 'local', provider: 'ollama', providerLabel: 'Ollama', model: 'bildmodell' }
  } as unknown as AgentRun
  await runNoteAgentLoop({ run, noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama', ollamaModel: 'bildmodell' } as never, onStep: () => {} })
  return {
    names: (mockChat.mock.calls[0][1] as Array<{ name: string }>).map(t => t.name),
    run,
    prompt: String(mockChat.mock.calls[0][0][0].content)
  }
}

beforeEach(async () => {
  mockChat.mockReset()
  mockProbe.mockReset()
  mockChat.mockResolvedValue(noToolCalls)
  dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-bildloop-')))
})
afterEach(async () => {
  clearContextAttachments(SENDER)
  await fs.rm(dir, { recursive: true, force: true })
})

describe('describe_image im Loop', () => {
  it('wird mit Bild im Anhang und bildfähigem Modell angeboten', async () => {
    mockProbe.mockResolvedValue({ state: createAgentImageViewState('bildmodell') })
    const { names, run } = await offered([await attach('plan.jpg')])
    expect(names).toContain('describe_image')
    expect(run.imageView?.model).toBe('bildmodell')
  })

  it('wird auch im Recherche-Lauf angeboten, und der Systemtext nennt die Regel für Suchanfragen', async () => {
    mockProbe.mockResolvedValue({ state: createAgentImageViewState('bildmodell') })
    const { names, prompt } = await offered([await attach('plan.jpg')], makeWeb())
    expect(names).toContain('describe_image')
    expect(names).toContain('web_search')
    expect(prompt).toContain('Verwende Inhalte aus Bildern nur dann in Suchanfragen')
  })

  it('fehlt ohne bildfähiges Modell, der Grund hängt am Lauf', async () => {
    mockProbe.mockResolvedValue({ reason: '„bildmodell“ kann keine Bilder ansehen' })
    const { names, run } = await offered([await attach('plan.jpg')])
    expect(names).not.toContain('describe_image')
    expect(run.imageView).toBeUndefined()
    expect(run.imageViewOff).toContain('kann keine Bilder ansehen')
  })

  it('fehlt ohne Bild im Anhang — die Fähigkeit wird dann gar nicht geprüft', async () => {
    const { names } = await offered([await attach('notiz.txt')])
    expect(names).not.toContain('describe_image')
    expect(mockProbe).not.toHaveBeenCalled()
  })
})

describe('Zeitgrenze eines Modellaufrufs', () => {
  it('lokal 20 Minuten, Cloud 10 Minuten — und der Lauf reicht sie an den Aufruf durch', async () => {
    expect([agentRequestTimeoutMs('ollama'), agentRequestTimeoutMs('lmstudio'), agentRequestTimeoutMs(undefined)]).toEqual([1_200_000, 1_200_000, 1_200_000])
    expect([agentRequestTimeoutMs('openrouter'), agentRequestTimeoutMs('llmbase')]).toEqual([600_000, 600_000])
    await offered([await attach('notiz.txt')])
    expect((mockChat.mock.calls[0][2] as { timeoutMs: number }).timeoutMs).toBe(1_200_000)
  })
})
