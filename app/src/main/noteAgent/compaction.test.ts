// Verdichten von Gelesenem (compaction.ts) — Auswahl, Zerlegen der Antwort, Ersetzen im Lauf.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('../llm/chatClient', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  chatWithTools: vi.fn()
}))

import { chatWithTools, type ChatMessage } from '../llm/chatClient'
import { COMPACTED_PREFIX, buildCompactionMessages, compactedContent, parseCompaction, salientSentences, selectCompactable, shapeSummary } from './compaction'
import { runNoteAgentLoop } from './loop'
import { createContextBudget, creditCompaction, recordServerPromptTokens, usedTokens } from '../../shared/contextBudget'
import type { AgentRun } from './runRegistry'

const mockChat = chatWithTools as unknown as ReturnType<typeof vi.fn>
const long = (word: string): string => Array.from({ length: 120 }, (_, i) => `Absatz ${i}: ${word} verändert die Arbeit der Lerngruppe.`).join('\n')

function conversation(): ChatMessage[] {
  return [
    { role: 'system', content: 'System' },
    { role: 'user', content: 'Vergleiche die Notizen' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'a', name: 'note_read', arguments: { path: 'eins.md' } }, { id: 'b', name: 'note_read', arguments: { path: 'kurz.md' } }] },
    { role: 'tool', tool_call_id: 'a', tool_name: 'note_read', content: long('Eins') },
    { role: 'tool', tool_call_id: 'b', tool_name: 'note_read', content: 'kurz' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'c', name: 'note_read', arguments: { path: 'zwei.md' } }] },
    { role: 'tool', tool_call_id: 'c', tool_name: 'note_read', content: long('Zwei') }
  ]
}

describe('selectCompactable', () => {
  it('nimmt nur lange Leseergebnisse, die das Modell schon gesehen hat', () => {
    const items = selectCompactable(conversation(), 100_000)
    expect(items.map(i => i.label)).toEqual(['note_read: eins.md'])
    expect(items[0].id).toBe('K1')
  })

  it('lässt schon Verdichtetes und Fehler aus und hält die Obergrenze ein', () => {
    const msgs = conversation()
    msgs[3] = { ...msgs[3], content: `${COMPACTED_PREFIX} …]\n${long('Eins')}` }
    expect(selectCompactable(msgs, 100_000)).toHaveLength(0)
    expect(selectCompactable(conversation(), 10)).toHaveLength(0)
  })
})

describe('parseCompaction', () => {
  it('ordnet Abschnitte den Kennungen zu und verwirft Unbekanntes und Leeres', () => {
    const parsed = parseCompaction('Vorrede\n### K1\nErster Befund.\n\n### K9\nfremd\n### K2 — note_read\n\n### K3\nDritter Befund.', ['K1', 'K2', 'K3'])
    expect(parsed.get('K1')).toBe('Erster Befund.')
    expect(parsed.has('K2')).toBe(false)
    expect(parsed.get('K3')).toBe('Dritter Befund.')
    expect(parsed.has('K9')).toBe(false)
  })
})

describe('salientSentences', () => {
  const note = [
    '# Rückmeldung',
    'Das Kollegium hat mehrere Reihen erprobt. Die Dokumentenkamera mit der Inventarnummer INV-4821 ist defekt.',
    'Die Elternvertretung hat nachgefragt.',
    'Der Raum R-114 ist gesperrt. Gewünscht werden insgesamt 37 Fortbildungsstunden.'
  ].join('\n')

  it('behält wörtlich die Sätze mit Kennungen und Zahlen, in Reihenfolge des Originals', () => {
    expect(salientSentences(note)).toEqual([
      'Die Dokumentenkamera mit der Inventarnummer INV-4821 ist defekt.',
      'Der Raum R-114 ist gesperrt.',
      'Gewünscht werden insgesamt 37 Fortbildungsstunden.'
    ])
  })

  it('zieht bei knappem Budget Kennungen den bloßen Zahlen vor', () => {
    expect(salientSentences(note, 100)).toEqual([
      'Die Dokumentenkamera mit der Inventarnummer INV-4821 ist defekt.',
      'Der Raum R-114 ist gesperrt.'
    ])
  })

  it('hängt die Belegsätze an die Kurzfassung gelesener Texte, nicht an Suchtreffer', () => {
    const item = { index: 0, id: 'K1', label: 'note_read: a.md', content: note, tokens: 100, seen: true }
    expect(compactedContent(item, 'Kurz.')).toContain('Wörtlich aus dem Original (Sätze mit Zahlen und Kennungen): „Die Dokumentenkamera mit der Inventarnummer INV-4821 ist defekt.“')
    expect(compactedContent({ ...item, label: 'note_search: Kamera' }, 'Kurz.')).not.toContain('Wörtlich aus dem Original')
  })
})

describe('shapeSummary', () => {
  it('lässt eine knappe Kurzfassung unverändert', () => {
    expect(shapeSummary('Raum R-1 gesperrt.\nNicht übernommen: Ganztag, Netz')).toBe('Raum R-1 gesperrt.\nNicht übernommen: Ganztag, Netz')
  })

  it('kürzt ausufernde Themenlisten, behält nur EINE und begrenzt den Fließtext', () => {
    const topics = Array.from({ length: 60 }, (_, i) => `Thema Nummer ${i}`).join(', ')
    const shaped = shapeSummary(`Kurz. Nicht übernommen: ${topics}\nNicht übernommen: ${topics}`)
    expect(shaped.match(/Nicht übernommen:/g)).toHaveLength(1)
    expect(shaped.length).toBeLessThan(220)
    expect(shaped.startsWith('Kurz.')).toBe(true)
    const long = Array.from({ length: 80 }, (_, i) => `Satz ${i} steht hier.`).join(' ')
    expect(shapeSummary(long).length).toBeLessThanOrEqual(910)
  })
})

describe('buildCompactionMessages', () => {
  it('gibt Auftrag und Material mit Kennungen weiter', () => {
    const items = selectCompactable(conversation(), 100_000)
    const [system, user] = buildCompactionMessages('Vergleiche die Notizen', items)
    expect(system.content).toContain('Erfinde nichts')
    expect(user.content).toContain('Vergleiche die Notizen')
    expect(user.content).toContain('### K1 — note_read: eins.md')
  })
})

describe('creditCompaction', () => {
  it('zieht nur den sicher belegten Teil ab und zählt die neue Fassung voll', () => {
    const budget = createContextBudget(32_768)
    recordServerPromptTokens(budget, 20_000)
    creditCompaction(budget, 10_000, 1_000)
    expect(usedTokens(budget)).toBe(20_000 - 5_800 + 1_000)
  })
})

describe('Verdichten im Loop', () => {
  let vault: string
  const makeRun = (): AgentRun => ({
    runId: 'run-compact', senderId: 987_657, noteId: 'n', vaultPath: vault,
    targetFolderRel: 'Ziel', targetFolderAbs: path.join(vault, 'Ziel'),
    attachmentIds: [], instruction: 'Vergleiche die Notizen', skills: [],
    status: 'running', abort: new AbortController(), seq: 0,
    results: new Map(), sources: new Set<string>(), datasets: new Map(),
    folderReads: new Map(), collectedFolders: new Set(), toolsUsed: new Set()
  } as unknown as AgentRun)
  const read = (file: string, promptTokens: number) => ({
    text: '', toolCalls: [{ id: `c-${file}`, name: 'note_read', arguments: { path: file } }],
    assistantMessage: { role: 'assistant', content: '', tool_calls: [{ id: `c-${file}`, name: 'note_read', arguments: { path: file } }] },
    promptTokens
  })
  const answer = (text: string, promptTokens: number) => ({ text, toolCalls: [], assistantMessage: { role: 'assistant', content: text }, promptTokens })

  beforeEach(async () => {
    mockChat.mockReset()
    vault = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mindgraph-loop-compact-')))
    for (const name of ['eins', 'zwei', 'drei']) await fs.writeFile(path.join(vault, `${name}.md`), long(name), 'utf8')
  })
  afterEach(async () => { await fs.rm(vault, { recursive: true, force: true }) })

  it('verdichtet mitten in einer Runde auch deren eigene Ergebnisse, statt das Lesen abzulehnen', async () => {
    const many = {
      text: '',
      toolCalls: ['eins.md', 'zwei.md', 'drei.md', 'vier.md', 'fuenf.md'].map(f => ({ id: `c-${f}`, name: 'note_read', arguments: { path: f } })),
      assistantMessage: { role: 'assistant', content: '', tool_calls: ['eins.md', 'zwei.md', 'drei.md', 'vier.md', 'fuenf.md'].map(f => ({ id: `c-${f}`, name: 'note_read', arguments: { path: f } })) },
      promptTokens: 14_000
    }
    for (const name of ['vier', 'fuenf']) await fs.writeFile(path.join(vault, `${name}.md`), long(name), 'utf8')
    mockChat
      .mockResolvedValueOnce(many)
      // Nach den ersten Leseergebnissen wird es eng: Verdichtung, bevor das nächste gelesen wird.
      .mockResolvedValueOnce(answer('### K1\nEins.\n### K2\nZwei.\n### K3\nDrei.\n### K4\nVier.', 6_000))
      .mockResolvedValue(answer('fertig', 16_000))
    const onStep = vi.fn()
    await runNoteAgentLoop({ run: makeRun(), noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep })
    const last = mockChat.mock.calls[mockChat.mock.calls.length - 1][0] as ChatMessage[]
    const tools = last.filter(m => m.role === 'tool')
    expect(tools).toHaveLength(5)
    // Kein Leseaufruf wurde abgelehnt, und mindestens das erste Ergebnis ist verdichtet.
    expect(tools.every(t => !/kein Platz|zu groß|fast voll/.test(t.content))).toBe(true)
    expect(tools[0].content.startsWith(COMPACTED_PREFIX)).toBe(true)
    expect(tools[4].content).toContain('Absatz 0: fuenf')
    expect(onStep.mock.calls.some(c => c[1] === 'kontext' && String(c[2]).includes('Gelesenes verdichtet'))).toBe(true)
  })

  it('ersetzt ältere Leseergebnisse, meldet es und zählt die Runde nicht mit', async () => {
    mockChat
      .mockResolvedValueOnce(read('eins.md', 6_000))
      .mockResolvedValueOnce(read('zwei.md', 9_000))
      // Runde 3 meldet einen knappen Stand: vor Runde 4 wird verdichtet.
      .mockResolvedValueOnce(read('drei.md', 18_000))
      .mockResolvedValueOnce(answer('### K1\nEins: Kernaussage.\n### K2\nZwei: Kernaussage.', 5_000))
      .mockResolvedValueOnce(answer('fertig', 12_000))
    const onStep = vi.fn()
    const onContext = vi.fn()
    const res = await runNoteAgentLoop({ run: makeRun(), noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep, onContext })
    expect(res.text.startsWith('fertig')).toBe(true)
    expect(res.text).toContain('2 Leseergebnisse hat der Agent während des Laufs zu Kurzfassungen verdichtet')
    // Der Verdichtungsaufruf hat keine Werkzeuge und ein eigenes Gespräch.
    expect(mockChat.mock.calls[3][1]).toEqual([])
    const tools = (mockChat.mock.calls[4][0] as ChatMessage[]).filter(m => m.role === 'tool')
    expect(tools[0].content.startsWith(COMPACTED_PREFIX)).toBe(true)
    expect(tools[0].content).toContain('Eins: Kernaussage.')
    expect(tools[1].content).toContain('Zwei: Kernaussage.')
    // Das jüngste Leseergebnis bleibt wörtlich.
    expect(tools[2].content).toContain('Absatz 0: drei')
    expect(onStep.mock.calls.some(c => c[1] === 'kontext' && String(c[2]).includes('Gelesenes verdichtet'))).toBe(true)
    expect(onContext).toHaveBeenLastCalledWith(expect.anything(), { used: 4, max: 20 })
  })

  it('lässt alles im Original, wenn die Antwort keine Abschnitte liefert', async () => {
    mockChat
      .mockResolvedValueOnce(read('eins.md', 6_000))
      .mockResolvedValueOnce(read('zwei.md', 9_000))
      .mockResolvedValueOnce(read('drei.md', 18_000))
      // Zwei Verdichtungsversuche ohne Abschnitte (vor dem dritten Lesen und vor der nächsten Runde) …
      .mockResolvedValueOnce(answer('Das kann ich nicht zusammenfassen.', 5_000))
      .mockResolvedValueOnce(answer('Auch jetzt nicht.', 5_000))
      .mockResolvedValueOnce(answer('fertig', 19_000))
    await runNoteAgentLoop({ run: makeRun(), noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep: vi.fn() })
    // … danach wird es nicht weiter versucht: genau sechs Aufrufe, keiner mehr.
    expect(mockChat).toHaveBeenCalledTimes(6)
    const tools = (mockChat.mock.calls[5][0] as ChatMessage[]).filter(m => m.role === 'tool')
    expect(tools[0].content).toContain('Absatz 0: eins')
  })

  // Folgelauf („Antworten und weitermachen“): Der übernommene Verlauf ist lang. Die reine
  // Zeichenschätzung hielte ihn für knapp (und würde verdichten); der Stand des Vorgängers
  // zeigt, dass reichlich Platz ist — also genau EIN Modellaufruf, kein Verdichten.
  const priorConversation = (): ChatMessage[] => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']
    return [
      { role: 'system', content: 'alt' },
      { role: 'user', content: 'Vergleiche die Notizen' },
      { role: 'assistant', content: '', tool_calls: names.map(n => ({ id: n, name: 'note_read', arguments: { path: `${n}.md` } })) },
      ...names.map(n => ({ role: 'tool' as const, tool_call_id: n, tool_name: 'note_read', content: long(n) })),
      { role: 'assistant', content: 'Erster Lauf fertig.' }
    ]
  }

  it('Folgelauf rechnet mit dem Stand des Vorgängers weiter statt den Verlauf neu zu schätzen', async () => {
    mockChat.mockResolvedValueOnce(answer('ergänzt', 12_500))
    const res = await runNoteAgentLoop({
      run: makeRun(), noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep: vi.fn(),
      continuation: { priorMessages: priorConversation(), answer: 'Ergänze die Tabelle.', priorTokens: 12_000 }
    })
    expect(res.text).toBe('ergänzt')
    expect(mockChat).toHaveBeenCalledTimes(1)
  })

  it('Folgelauf mit vollem Verlauf: erst verdichten, dann weiterarbeiten statt „Kontext voll“', async () => {
    mockChat
      .mockResolvedValueOnce(answer(['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10', 'K11', 'K12'].map(k => `### ${k}\nKurzfassung.`).join('\n'), 9_000))
      .mockResolvedValueOnce(answer('ergänzt', 12_000))
    const onStep = vi.fn()
    const res = await runNoteAgentLoop({
      run: makeRun(), noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep,
      continuation: { priorMessages: priorConversation(), answer: 'Ergänze die Tabelle.', priorTokens: 31_500 }
    })
    expect(res.text.startsWith('ergänzt')).toBe(true)
    expect(onStep.mock.calls.some(c => c[1] === 'kontext' && String(c[2]).includes('Gelesenes verdichtet'))).toBe(true)
  })

  it('Folgelauf erneuert Kurzfassungen aus dem Vorgänger für den neuen Auftrag — die App liest selbst neu', async () => {
    const stale = `${COMPACTED_PREFIX} — das Original hatte 6.000 Zeichen (note_read: eins.md).]\nNur der Raum: R-1.`
    const prior: ChatMessage[] = [
      { role: 'system', content: 'alt' },
      { role: 'user', content: 'Nenne die Räume' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'a', name: 'note_read', arguments: { path: 'eins.md' } }, { id: 'b', name: 'note_read', arguments: { path: 'fehlt.md' } }] },
      { role: 'tool', tool_call_id: 'a', tool_name: 'note_read', content: stale },
      { role: 'tool', tool_call_id: 'b', tool_name: 'note_read', content: stale.replace('eins.md', 'fehlt.md') },
      { role: 'assistant', content: 'Erster Lauf fertig.' }
    ]
    mockChat
      .mockResolvedValueOnce(answer('### K1\nRaum R-1, Inventarnummer INV-7.\nNicht übernommen: nichts', 3_000))
      .mockResolvedValueOnce(answer('ergänzt', 9_000))
    const onStep = vi.fn()
    await runNoteAgentLoop({
      run: makeRun(), noteContent: '', agentMemory: '', chatOptions: { backend: 'ollama' } as never, onStep,
      continuation: { priorMessages: prior, answer: 'Ergänze die Inventarnummern.', priorTokens: 9_000 }
    })
    // Der erste Aufruf ist das Erneuern: Material ist der NEU gelesene Wortlaut, Auftrag der neue.
    const refreshRequest = mockChat.mock.calls[0][0] as ChatMessage[]
    expect(mockChat.mock.calls[0][1]).toEqual([])
    expect(refreshRequest[1].content).toContain('Absatz 0: eins')
    const tools = (mockChat.mock.calls[1][0] as ChatMessage[]).filter(m => m.role === 'tool')
    expect(tools[0].content).toContain('INV-7')
    // Die nicht mehr lesbare Quelle behält ihre alte Kurzfassung.
    expect(tools[1].content).toContain('Nur der Raum: R-1.')
    expect(onStep.mock.calls.some(c => c[1] === 'kontext' && String(c[2]).includes('Kurzfassungen für den Nachtrag erneuert: 1 Quellen neu gelesen, 1 unverändert'))).toBe(true)
  })
})
