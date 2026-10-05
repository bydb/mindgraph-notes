// folder_digest mit Ersatzmodell (Baustein C): Pakete, Fundstellenprüfung, Abdeckung,
// Erkennen-Schicht (Halbieren bei Kürzungsverdacht), Aufrufgrenze, Modellweg-Prüfung.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('../llm/chatClient', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  chatWithTools: vi.fn()
}))

import { chatWithTools } from '../llm/chatClient'
import { registerContextFolder, clearContextAttachments } from './contextFiles'
import { assertSameRoute, parseDigestArgs, runFolderDigest, type FolderDigestArgs } from './folderDigest'
import { estimateTokens } from '../../shared/contextBudget'
import type { AgentRun } from './runRegistry'

const mockChat = chatWithTools as unknown as ReturnType<typeof vi.fn>
const SENDER = 951_001
let root: string

/** Ersatzmodell: nennt je Datei im Paket einen Befund mit ihrer Fundstelle. */
function answerWithRefs(extra = ''): (messages: Array<{ content: string }>) => Promise<unknown> {
  return async messages => {
    const user = messages[1].content
    const refs = Array.from(user.matchAll(/Fundstelle: ([^>]+)>>>/g), m => m[1])
    const text = refs.map(r => `- Befund aus ${r} [${r}]`).join('\n') + extra
    return { text, toolCalls: [], assistantMessage: { role: 'assistant', content: text }, promptTokens: Math.ceil((messages[0].content.length + user.length) / 3) }
  }
}

async function journal(months: string[], perMonth: number, body = 'Eintrag'): Promise<string> {
  const folder = path.join(root, 'Journal')
  for (const m of months) {
    const dir = path.join(folder, '2026', m)
    await fs.mkdir(dir, { recursive: true })
    for (let d = 1; d <= perMonth; d++) {
      const day = String(d).padStart(2, '0')
      await fs.writeFile(path.join(dir, `2026-${m}-${day}.md`), `---\ndate: 2026-${m}-${day}\n---\n\n${body} ${m}-${day}`, 'utf8')
    }
  }
  return folder
}

async function setup(folder: string): Promise<AgentRun> {
  const reg = await registerContextFolder(SENDER, folder, false)
  if (!reg.ok) throw new Error(reg.error)
  return {
    runId: 'r-digest', senderId: SENDER, attachmentIds: [reg.attachment.id], abort: new AbortController(),
    sources: new Set<string>(), route: { kind: 'local', provider: 'ollama', providerLabel: 'Ollama', model: 'qwen-test' }
  } as unknown as AgentRun
}

const args = (over: Partial<FolderDigestArgs> = {}): FolderDigestArgs =>
  ({ folder: 'Journal', question: 'Was war wichtig?', groupBy: 'month', ...over })

function deps(run: AgentRun, over: Record<string, unknown> = {}) {
  return {
    senderId: SENDER, run,
    chatOptions: { backend: 'ollama', ollamaModel: 'qwen-test', numCtx: 32_768 } as never,
    maxResultTokens: () => 8_000,
    recordUsage: vi.fn(),
    ...over
  }
}

beforeEach(async () => {
  mockChat.mockReset()
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-digest-')))
})

afterEach(async () => {
  clearContextAttachments(SENDER)
  await fs.rm(root, { recursive: true, force: true })
})

describe('folder_digest', () => {
  it('wertet jede Datei aus, gruppiert nach Monat und meldet vollständige Abdeckung', async () => {
    const run = await setup(await journal(['01', '02', '03'], 3))
    mockChat.mockImplementation(answerWithRefs())
    const d = deps(run)
    const res = await runFolderDigest(args(), d)
    expect(res.ok).toBe(true)
    expect(mockChat).toHaveBeenCalledTimes(3) // ein Paket je Monat
    expect(mockChat.mock.calls[0][1]).toEqual([]) // werkzeuglos
    expect(mockChat.mock.calls[0][2]).toMatchObject({ ollamaNumPredict: 2048, ollamaThink: false, maxTokens: 2048, telemetryModule: 'note-agent', telemetryRunId: 'r-digest' })
    expect(res.content).toContain('## 2026-01')
    expect(res.content).toContain('## 2026-03')
    expect(res.content).toContain('[2026/02/2026-02-03.md]')
    expect(res.content).toContain('9 Dateien gefunden — 9 vollständig ausgewertet')
    expect(res.coverageLine).toBe('Ordner-Auswertung: 9 Dateien, 9 vollständig ausgewertet')
    expect(d.recordUsage).toHaveBeenCalledTimes(3)
  })

  it('verwirft Befunde mit fremder Fundstelle und zählt sie', async () => {
    const run = await setup(await journal(['01'], 2))
    mockChat.mockImplementation(answerWithRefs('\n- erfunden [anderer/ordner.md]\n- ohne Fundstelle'))
    const res = await runFolderDigest(args(), deps(run))
    expect(res.content).not.toContain('erfunden')
    expect(res.content).toContain('2 Befunde ohne gültige Fundstelle wurden verworfen.')
  })

  it('Zeitraum-Filter lässt Dateien sichtbar aus statt still', async () => {
    const run = await setup(await journal(['01', '02'], 2))
    mockChat.mockImplementation(answerWithRefs())
    const res = await runFolderDigest(args({ from: '2026-02-01', to: '2026-02-28' }), deps(run))
    expect(mockChat).toHaveBeenCalledTimes(1)
    expect(res.content).toContain('4 Dateien gefunden — 2 vollständig ausgewertet')
    expect(res.content).toContain('2 × Filter: Zeitraum')
  })

  it('halbiert ein Paket bei Kürzungsverdacht und wertet die Hälften aus', async () => {
    const run = await setup(await journal(['01'], 4))
    let first = true
    mockChat.mockImplementation(async (messages: Array<{ content: string }>) => {
      if (first) {
        first = false
        // Server meldet viel weniger Prompt-Token als gesendet → stille Kürzung
        return { text: '- egal [x]', toolCalls: [], assistantMessage: { role: 'assistant', content: '' }, promptTokens: 5 }
      }
      return answerWithRefs()(messages)
    })
    const res = await runFolderDigest(args(), deps(run))
    expect(mockChat).toHaveBeenCalledTimes(3)
    expect(res.content).toContain('4 Dateien gefunden — 4 vollständig ausgewertet')
  })

  it('verweigert vorab, wenn mehr als 40 Aufrufe nötig wären — mit Weg zum Eingrenzen', async () => {
    const run = await setup(await journal(['01', '02', '03'], 14, 'Langer Text über den Tag. '.repeat(190)))
    const res = await runFolderDigest(args(), deps(run, { chatOptions: { backend: 'ollama', ollamaModel: 'qwen-test', numCtx: 6_000 } }))
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/bräuchte \d+ Modellaufrufe/)
    expect(res.content).toContain('subfolder')
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('hört bei sehr großen Ordnern schon beim Lesen auf, statt alles in den Speicher zu laden (F47)', async () => {
    const run = await setup(await journal(['01', '02', '03'], 20, 'Langer Text über den Tag. '.repeat(400)))
    const res = await runFolderDigest(args(), deps(run, { chatOptions: { backend: 'ollama', ollamaModel: 'qwen-test', numCtx: 6_000 } }))
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/schon nach \d+ von 60 Dateien/)
    expect(res.content).toContain('subfolder')
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('zählt per kinds/subfolder Ausgefiltertes und nicht lesbare Formate in der Abdeckung (F39)', async () => {
    const folder = await journal(['01', '02'], 2)
    await fs.writeFile(path.join(folder, '2026', '01', 'liste.csv'), 'a;b\n1;2\n', 'utf8')
    await fs.writeFile(path.join(folder, '2026', '01', 'bild.xyz'), 'x', 'utf8')
    const run = await setup(folder)
    mockChat.mockImplementation(answerWithRefs())
    const res = await runFolderDigest(args({ subfolder: '2026/01', kinds: ['md'] }), deps(run))
    expect(res.content).toContain('5 Dateien gefunden — 2 vollständig ausgewertet')
    expect(res.content).toContain('2 × Filter: anderer Unterordner, 1 × Filter: Format')
    expect(res.content).toContain('1 in nicht lesbaren Formaten')
    expect(res.coverageLine).toBe('Ordner-Auswertung: 5 Dateien, 2 vollständig ausgewertet')
  })

  it('halbiert ein Paket, wenn die Antwort an der Ausgabegrenze abgeschnitten wurde (F40)', async () => {
    const run = await setup(await journal(['01'], 4))
    let first = true
    mockChat.mockImplementation(async (messages: Array<{ content: string }>) => {
      const r = (await answerWithRefs()(messages)) as Record<string, unknown>
      if (first) { first = false; return { ...r, outputCut: true } }
      return r
    })
    const res = await runFolderDigest(args(), deps(run))
    expect(mockChat).toHaveBeenCalledTimes(3)
    expect(res.content).toContain('4 Dateien gefunden — 4 vollständig ausgewertet')
  })

  it('nicht mehr teilbare abgeschnittene Antwort: Befunde bleiben, Datei gilt als nur teilweise (F40)', async () => {
    const run = await setup(await journal(['01'], 1))
    mockChat.mockImplementation(async (messages: Array<{ content: string }>) => ({ ...(await answerWithRefs()(messages)) as object, outputCut: true }))
    const res = await runFolderDigest(args(), deps(run))
    expect(res.content).toContain('[2026/01/2026-01-01.md]')
    expect(res.content).toContain('1 Dateien gefunden — 0 vollständig ausgewertet, 0 in Abschnitten vollständig ausgewertet, 1 nur teilweise lesbar')
    expect(res.content).toContain('Antwortgrenze des Modells abgeschnitten')
  })

  it('die ganze Rückgabe passt ins Budget, auch bei vielen Befunden (F43)', async () => {
    const run = await setup(await journal(['01', '02', '03'], 10))
    mockChat.mockImplementation(answerWithRefs())
    for (const budget of [900, 250, 60]) {
      const res = await runFolderDigest(args(), deps(run, { maxResultTokens: () => budget }))
      expect(res.ok).toBe(true)
      if (budget >= 250) expect(estimateTokens(res.content)).toBeLessThanOrEqual(budget)
      expect(res.content).toMatch(/weitere Befunde nicht gezeigt|Kontext reicht nicht mehr/)
      expect(res.content).toContain('30 Dateien gefunden')
    }
  })

  it('ein fehlschlagendes Zusammenführen verwirft die Auswertung nicht (F48)', async () => {
    const run = await setup(await journal(['01'], 10))
    mockChat.mockImplementation(async (messages: Array<{ content: string }>) => {
      if (!messages[1].content.includes('Fundstelle:')) throw new Error('Netz weg')
      return answerWithRefs()(messages)
    })
    const res = await runFolderDigest(args(), deps(run, { maxResultTokens: () => 700 }))
    expect(res.ok).toBe(true)
    expect(res.content).toContain('[2026/01/2026-01-01.md]')
    expect(res.content).toContain('10 Dateien gefunden — 10 vollständig ausgewertet')
  })

  it('lehnt ein zu kleines Kontextfenster mit Hinweis ab', async () => {
    const run = await setup(await journal(['01'], 1))
    const res = await runFolderDigest(args(), deps(run, { chatOptions: { backend: 'ollama', ollamaModel: 'qwen-test', numCtx: 4_096 } }))
    expect(res.ok).toBe(false)
    expect(res.content).toContain('zu klein für eine Ordner-Auswertung')
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('bricht ab, wenn das Modell nicht zur Einstufung des Laufs passt', async () => {
    const run = await setup(await journal(['01'], 1))
    await expect(runFolderDigest(args(), deps(run, { chatOptions: { backend: 'ollama', ollamaModel: 'anderes-modell' } })))
      .rejects.toThrow(/passt nicht zur Einstufung/)
    expect(mockChat).not.toHaveBeenCalled()
  })
})

describe('assertSameRoute', () => {
  it('ordnet Ollama-Cloud dem Backend ollama zu, alles andere 1:1', () => {
    expect(() => assertSameRoute({ kind: 'cloud', provider: 'ollama-cloud', providerLabel: 'ollama.com', model: 'm:cloud' }, { backend: 'ollama', ollamaModel: 'm:cloud' })).not.toThrow()
    expect(() => assertSameRoute({ kind: 'cloud', provider: 'openrouter', providerLabel: 'OpenRouter', model: 'a/b' }, { backend: 'openrouter', openrouterModel: 'a/b' })).not.toThrow()
    expect(() => assertSameRoute({ kind: 'cloud', provider: 'llmbase', providerLabel: 'LLMBase', model: 'a/b' }, { backend: 'openrouter', openrouterModel: 'a/b' })).toThrow()
    expect(() => assertSameRoute({ kind: 'unverified', provider: 'lmstudio', providerLabel: 'LM Studio', model: 'x' }, { backend: 'lmstudio', lmstudioModel: 'y' })).toThrow()
  })
})

describe('parseDigestArgs', () => {
  it('verlangt eine Frage und prüft Gruppierung, Daten und Formate', () => {
    expect(parseDigestArgs({ folder: 'J' })).toMatch(/question/)
    expect(parseDigestArgs({ folder: 'J', question: 'q', group_by: 'jahr' })).toMatch(/group_by/)
    expect(parseDigestArgs({ folder: 'J', question: 'q', from: '1.1.2026' })).toMatch(/JJJJ-MM-TT/)
    expect(parseDigestArgs({ folder: 'J', question: 'q', kinds: ['exe'] })).toMatch(/Unbekanntes Format/)
    expect(parseDigestArgs({ folder: 'J', question: 'q', kinds: ['md', '.pdf'] })).toMatchObject({ groupBy: 'subfolder', kinds: ['md', 'pdf'] })
  })
})
