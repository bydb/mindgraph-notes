// Rückfrage am Schluss und Folgelauf („Antworten und weitermachen“), real am 05.10.2026:
// Nach einer Ordner-Auswertung endete der Agent mit „Möchtest du, dass ich das als Notiz
// zusammenstelle?“ — und der Nutzer hatte keinen Weg zu antworten.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('../llm/chatClient', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  chatWithTools: vi.fn()
}))

import { chatWithTools, type ChatMessage } from '../llm/chatClient'
import { runNoteAgentLoop } from './loop'
import type { AgentRun } from './runRegistry'

const mockChat = chatWithTools as unknown as ReturnType<typeof vi.fn>
let vault: string

function makeRun(): AgentRun {
  return {
    runId: 'run-followup', senderId: 987_656, noteId: 'n', vaultPath: vault,
    targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'),
    attachmentIds: [], instruction: 'Jahresrückblick', skills: [],
    status: 'running', abort: new AbortController(), seq: 0,
    results: new Map(), sources: new Set<string>(), datasets: new Map(),
    folderReads: new Map(), collectedFolders: new Set(), toolsUsed: new Set()
  } as unknown as AgentRun
}

const answer = (text: string) => ({ text, toolCalls: [], assistantMessage: { role: 'assistant', content: text } })
// Der Loop übergibt sein Nachrichten-Array per Referenz und hängt danach weiter an —
// deshalb beim Aufruf eine Kopie festhalten.
let snapshots: ChatMessage[][] = []
const sentMessages = (callIndex: number) => snapshots[callIndex]
function answers(...texts: string[]): void {
  for (const t of texts) {
    mockChat.mockImplementationOnce(async (messages: ChatMessage[]) => {
      snapshots.push(messages.map(m => ({ ...m })))
      return answer(t)
    })
  }
}

beforeEach(async () => {
  mockChat.mockReset()
  snapshots = []
  vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-loop-followup-')))
})

afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

const loop = (agentRun: AgentRun, continuation?: { priorMessages: ChatMessage[]; answer: string }) =>
  runNoteAgentLoop({ run: agentRun, noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep: vi.fn(), continuation })

describe('Rückfrage am Schluss', () => {
  it('schickt den Agenten einmal zurück, wenn er ohne Ergebnis mit einer Frage endet', async () => {
    answers('Ich habe 88 Einträge ausgewertet.\n\nMöchtest du, dass ich das als Notiz zusammenstelle?', 'Ich habe die Notiz als Markdown angenommen.')
    const res = await loop(makeRun())
    expect(mockChat).toHaveBeenCalledTimes(2)
    const last = sentMessages(1).at(-1)!
    expect(last.role).toBe('user')
    expect(last.content).toContain('nicht antworten')
    expect(res.text).toBe('Ich habe die Notiz als Markdown angenommen.')
  })

  it('schickt nur einmal zurück — bleibt die Frage, endet der Lauf mit ihr', async () => {
    answers('Soll ich eine Notiz oder ein PDF erstellen?', 'Soll ich eine Notiz oder ein PDF erstellen?')
    const res = await loop(makeRun())
    expect(mockChat).toHaveBeenCalledTimes(2)
    expect(res.text).toContain('PDF')
  })

  it('eine Antwort ohne Frage beendet den Lauf sofort', async () => {
    answers('Die Notiz liegt im Zielordner.')
    await loop(makeRun())
    expect(mockChat).toHaveBeenCalledTimes(1)
  })
})

describe('Folgelauf', () => {
  it('merkt sich den Verlauf am Ende und setzt ihn mit frischem Systemprompt und der Antwort fort', async () => {
    const first = makeRun()
    answers('Soll ich eine Notiz oder ein PDF erstellen?', 'Soll ich eine Notiz oder ein PDF erstellen?')
    await loop(first)
    expect(first.transcript?.some(m => m.content?.includes('Notiz oder ein PDF'))).toBe(true)

    mockChat.mockReset()
    snapshots = []
    answers('Notiz geschrieben.')
    const second = makeRun()
    await loop(second, { priorMessages: first.transcript!, answer: 'Als Notiz bitte.' })
    const sent = sentMessages(0)
    expect(sent.filter(m => m.role === 'system')).toHaveLength(1)
    expect(sent[0].role).toBe('system')
    expect(sent.some(m => m.role === 'assistant' && m.content?.includes('Notiz oder ein PDF'))).toBe(true)
    expect(sent.at(-1)!.content).toContain('Als Notiz bitte.')
    expect(sent.at(-1)!.content).toContain('lies es nicht erneut')
  })
})

describe('Fortsetzungs-Stand in der Registry', () => {
  it('bleibt erhalten, auch wenn der Lauf nach dem Verwerfen aller Karten aus der Registry fällt', async () => {
    const { startRun, finishRun, registerResult, takeResult, pruneRunIfConsumed, getRunForSender, peekContinuation, dropContinuation } = await import('./runRegistry')
    const senderId = 987_700
    const r = startRun({ senderId, noteId: 'n', vaultPath: vault, targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'), attachmentIds: [], instruction: 'Auftrag', model: 'm' })!
    const resultId = registerResult(r, { kind: 'md', fileName: 'a.md', stagedPath: path.join(vault, 'a.md'), words: 1 } as never)!.resultId
    r.transcript = [{ role: 'user', content: 'Auftrag' }, { role: 'assistant', content: 'Fertig.' }]
    finishRun(r, 'done')
    expect(r.transcript).toBeUndefined()
    takeResult(senderId, r.runId, resultId)
    pruneRunIfConsumed(r)
    expect(getRunForSender(senderId, r.runId)).toBeNull()
    const c = peekContinuation(senderId, r.runId)
    expect(c?.transcript.at(-1)?.content).toBe('Fertig.')
    expect(peekContinuation(senderId, 'anderer-lauf')).toBeNull()
    expect(peekContinuation(senderId + 1, r.runId)).toBeNull()
    dropContinuation(senderId, r.runId)
    expect(peekContinuation(senderId, r.runId)).toBeNull()
  })

  it('ein gescheiterter Lauf ist nicht fortsetzbar und verdrängt den Stand des Vorgängers', async () => {
    const { startRun, finishRun, peekContinuation } = await import('./runRegistry')
    const senderId = 987_701
    const base = { senderId, noteId: 'n', vaultPath: vault, targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'), attachmentIds: [], instruction: 'A', model: 'm' }
    const ok = startRun(base)!
    ok.transcript = [{ role: 'assistant', content: 'x' }]
    finishRun(ok, 'done')
    const failed = startRun(base)!
    failed.transcript = [{ role: 'assistant', content: 'y' }]
    finishRun(failed, 'error')
    expect(peekContinuation(senderId, ok.runId)).toBeNull()
    expect(peekContinuation(senderId, failed.runId)).toBeNull()
  })
})
