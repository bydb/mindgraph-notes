// Abgeschnittene Modellantworten (Ausgabegrenze), real am 27.10.2026: ein write_html-Aufruf
// lief zweimal in die 8192-Token-Grenze, wurde mit leeren Argumenten ausgeführt („Parameter
// fehlt") und das Modell schrieb dieselbe Seite erneut — Minuten ohne Fortschritt.

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
let snapshots: ChatMessage[][] = []

function makeRun(): AgentRun {
  return {
    runId: 'run-cut', senderId: 987_801, noteId: 'n', vaultPath: vault,
    targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'),
    attachmentIds: [], instruction: 'Infografik', skills: [],
    status: 'running', abort: new AbortController(), seq: 0,
    results: new Map(), sources: new Set<string>(), datasets: new Map(),
    folderReads: new Map(), collectedFolders: new Set(), toolsUsed: new Set()
  } as unknown as AgentRun
}

type Reply = { text?: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>; outputCut?: boolean }
function replies(...list: Reply[]): void {
  for (const r of list) {
    mockChat.mockImplementationOnce(async (messages: ChatMessage[]) => {
      snapshots.push(messages.map(m => ({ ...m })))
      const toolCalls = r.toolCalls ?? []
      return {
        text: r.text ?? '', toolCalls, backend: 'ollama', outputCut: r.outputCut,
        assistantMessage: { role: 'assistant', content: r.text ?? '', tool_calls: toolCalls.length ? toolCalls : undefined }
      }
    })
  }
}

const cutWrite = (id: string): Reply => ({ toolCalls: [{ id, name: 'write_note', arguments: {} }], outputCut: true })
const loop = (run: AgentRun) =>
  runNoteAgentLoop({ run, noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep: vi.fn() })

beforeEach(async () => {
  mockChat.mockReset()
  snapshots = []
  vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-loop-cut-')))
  await fs.mkdir(path.join(vault, 'Ziel'))
})

afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

describe('abgeschnittene Modellantwort', () => {
  it('führt den abgeschnittenen Aufruf nicht aus und nennt dem Modell den wahren Grund', async () => {
    const run = makeRun()
    replies(cutWrite('tc1'), { text: 'Ich habe es kürzer gefasst.' })
    const res = await loop(run)
    expect(mockChat).toHaveBeenCalledTimes(2)
    expect(run.results.size).toBe(0)
    const toolReply = snapshots[1].at(-1)!
    expect(toolReply.role).toBe('tool')
    expect(toolReply.tool_call_id).toBe('tc1')
    expect(toolReply.content).toContain('Ausgabegrenze')
    expect(toolReply.content).toContain('NICHT ausgeführt')
    expect(toolReply.content).not.toContain('Parameter')
    expect(res.text).toBe('Ich habe es kürzer gefasst.')
  })

  it('bricht beim zweiten Abschneiden laut ab, statt weiter Minuten zu verbrennen', async () => {
    replies(cutWrite('tc1'), cutWrite('tc2'), { text: 'nie erreicht' })
    await expect(loop(makeRun())).rejects.toThrow(/2-mal die Grenze seiner Ausgabelänge/)
    expect(mockChat).toHaveBeenCalledTimes(2)
  })

  it('schickt bei abgeschnittenem Text ohne Werkzeugaufruf eine Nutzer-Nachricht zurück', async () => {
    replies({ text: '<html><body><svg', outputCut: true }, { text: 'Kurze Antwort.' })
    await loop(makeRun())
    const last = snapshots[1].at(-1)!
    expect(last.role).toBe('user')
    expect(last.content).toContain('abgeschnitten')
  })

  it('meldet auch nach fertigem Ergebnis jedes Abschneiden zurück — darin kann ein zweiter Schreibaufruf stecken (F01)', async () => {
    const run = makeRun()
    run.results.set('r1', { kind: 'md', fileName: 'a.md' } as never)
    replies({ text: '{"name": "write_html", "arguments": {"title": "Seite", "body_html": "<p>', outputCut: true }, { text: 'Fertig.' })
    const res = await loop(run)
    expect(mockChat).toHaveBeenCalledTimes(2)
    expect(snapshots[1].at(-1)!.content).toContain('abgeschnitten')
    expect(res.text).toBe('Fertig.')
  })

  it('endet nach fertigem Ergebnis beim zweiten Abschneiden mit Vermerk statt mit Fehler', async () => {
    const run = makeRun()
    run.results.set('r1', { kind: 'md', fileName: 'a.md' } as never)
    replies({ text: 'lang…', outputCut: true }, { text: 'wieder lang…', outputCut: true })
    const res = await loop(run)
    expect(mockChat).toHaveBeenCalledTimes(2)
    expect(res.text).toContain('Ergebnisse sind vollständig')
    expect(res.text).not.toContain('wieder lang')
  })

  it('zählt nur Abbrüche in Folge — dazwischen eine vollständige Antwort setzt zurück (F02)', async () => {
    replies(
      cutWrite('tc1'),
      { toolCalls: [{ id: 'tc2', name: 'list_target_folder', arguments: {} }] },
      cutWrite('tc3'),
      { text: 'Fertig nach kürzerer Fassung.' }
    )
    const res = await loop(makeRun())
    expect(mockChat).toHaveBeenCalledTimes(4)
    expect(res.text).toBe('Fertig nach kürzerer Fassung.')
  })

  it('rät nicht zum Formatwechsel, sondern zur Kürzung im verlangten Format (F03)', async () => {
    replies({ toolCalls: [{ id: 'tc1', name: 'write_html', arguments: {} }], outputCut: true }, { text: 'ok' })
    await loop(makeRun())
    const toolReply = snapshots[1].at(-1)!.content ?? ''
    expect(toolReply).toContain('im verlangten Format')
    expect(toolReply).not.toMatch(/Notiz statt/)
  })

  it('zählt im Web-Lauf ein Bild allein nicht als fertiges Ergebnis', async () => {
    const run = makeRun()
    run.results.set('img', { kind: 'jpg', fileName: 'bild.jpg' } as never)
    ;(run as unknown as { web: unknown }).web = { wrote: false, fetches: [], searches: 0, phase: 'write' }
    replies({ text: 'Hier ist die Seite: <html>…', outputCut: true }, { text: 'abbrechen' })
    await loop(run).catch(() => undefined)
    // Kein vorzeitiger Erfolg: der Loop meldet das Abschneiden und läuft weiter (danach der Web-Schubs).
    expect(mockChat.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(snapshots[1].at(-1)!.content).toContain('abgeschnitten')
  })
})
