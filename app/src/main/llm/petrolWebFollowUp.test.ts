import { describe, it, expect } from 'vitest'
import { WebSnapshotStore } from './petrolWebSnapshots'
import {
  SNAPSHOT_GONE_TEXT,
  measureWithFollowUpRoom,
  parseFollowUpRequest,
  resolveFollowUp
} from './petrolWebFollowUp'
import { buildPetrolWebSystemPrompt } from './petrolWebPrompt'
import { freezeWebSourcesToFit, webChatCharBudget, type WebSource } from '../../shared/webChat'

const id = (t: string) => t
const TODAY = '2026-10-24'
const SNAP = 'a'.repeat(32)

function source(n: number, excerpt: string): WebSource {
  return {
    n, title: `Seite ${n}`, url: `https://h${n}.example/`, host: `h${n}.example`,
    fetchedAt: '2026-10-24T10:00:00.000Z', excerpt, originalChars: excerpt.length, truncated: false
  }
}

function storeWith(sources: WebSource[], senderId = 1, scopeId = 'tab-1'): { store: WebSnapshotStore; snapshotId: string } {
  const store = new WebSnapshotStore(() => 1_000, () => SNAP)
  return { store, snapshotId: store.put(senderId, scopeId, sources) }
}

describe('parseFollowUpRequest: Suche oder Nachfrage', () => {
  it('ohne Kennung ist es eine Suche', () => {
    expect(parseFollowUpRequest({})).toEqual({ mode: 'search' })
    expect(parseFollowUpRequest({ snapshotId: undefined, scopeId: 'tab-1' })).toEqual({ mode: 'search' })
    expect(parseFollowUpRequest({ snapshotId: '   ' })).toEqual({ mode: 'search' })
    expect(parseFollowUpRequest(null)).toEqual({ mode: 'search' })
  })

  it('eine gültige Kennung mit Gespräch ist eine Nachfrage', () => {
    expect(parseFollowUpRequest({ snapshotId: SNAP, scopeId: 'tab-1' })).toEqual({ mode: 'snapshot', snapshotId: SNAP, scopeId: 'tab-1' })
  })

  it('eine kaputte Kennung wird abgelehnt und läuft NIE als Suche weiter', () => {
    for (const bad of ['zu-kurz', 'A'.repeat(32), `${SNAP} `.replace(' ', 'x'), 0, 12, {}, [], true, 'g'.repeat(32)]) {
      const r = parseFollowUpRequest({ snapshotId: bad, scopeId: 'tab-1' })
      expect(r.mode, `Kennung ${JSON.stringify(bad)}`).toBe('invalid')
    }
  })

  it('ohne gültiges Gespräch wird die Nachfrage abgelehnt', () => {
    expect(parseFollowUpRequest({ snapshotId: SNAP }).mode).toBe('invalid')
    expect(parseFollowUpRequest({ snapshotId: SNAP, scopeId: 'ein gespräch' }).mode).toBe('invalid')
    expect(parseFollowUpRequest({ snapshotId: SNAP, scopeId: 42 }).mode).toBe('invalid')
  })
})

describe('resolveFollowUp: Auszüge nur aus dem Main-Speicher, nie neu gekürzt', () => {
  const base = { question: 'Und für Vereine?', charBudget: 20_000, today: TODAY, sanitize: id }

  it('liefert die gespeicherten Auszüge byte-gleich', () => {
    const excerpt = 'Der Auszug bleibt vollständig — auch mit Umlauten äöü und [Klammern].\n\nZweiter Absatz.'
    const { store, snapshotId } = storeWith([source(1, excerpt)])
    const r = resolveFollowUp({ ...base, store, senderId: 1, scopeId: 'tab-1', snapshotId, history: [] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.sources[0].excerpt).toBe(excerpt)
  })

  it('fremdes Fenster, fremdes Gespräch oder unbekannte Kennung: „nicht mehr da“, nie eine Suche', () => {
    const { store, snapshotId } = storeWith([source(1, 'Text')])
    for (const [senderId, scopeId, snap] of [[2, 'tab-1', snapshotId], [1, 'tab-2', snapshotId], [1, 'tab-1', 'b'.repeat(32)]] as const) {
      const r = resolveFollowUp({ ...base, store, senderId, scopeId, snapshotId: snap, history: [] })
      expect(r).toMatchObject({ ok: false, gone: true, error: SNAPSHOT_GONE_TEXT, sources: [] })
    }
  })

  it('nach dem Verwerfen des Gesprächs ist die Kennung weg', () => {
    const { store, snapshotId } = storeWith([source(1, 'Text')])
    store.dropScope(1, 'tab-1')
    expect(resolveFollowUp({ ...base, store, senderId: 1, scopeId: 'tab-1', snapshotId, history: [] })).toMatchObject({ ok: false, gone: true })
  })

  it('kürzt bei Platzmangel nur den Verlauf — die ältesten zuerst, die Auszüge nie', () => {
    const excerpt = 'x'.repeat(3000)
    const { store, snapshotId } = storeWith([source(1, excerpt)])
    const fixed = buildPetrolWebSystemPrompt([source(1, excerpt)], TODAY, id, [], true).length
    const history = [
      { role: 'user' as const, content: 'a'.repeat(100) },
      { role: 'assistant' as const, content: 'b'.repeat(100) },
      { role: 'user' as const, content: 'c'.repeat(100) }
    ]
    const budget = fixed + base.question.length + 150
    const r = resolveFollowUp({ ...base, store, senderId: 1, scopeId: 'tab-1', snapshotId, history, charBudget: budget })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.dropped).toBe(2)
      expect(r.history).toEqual([history[2]])
      expect(r.sources[0].excerpt).toBe(excerpt)
    }
  })

  it('lässt keine Antwort ohne ihre Frage im Verlauf stehen (Codex F12)', () => {
    const excerpt = 'x'.repeat(3000)
    const { store, snapshotId } = storeWith([source(1, excerpt)])
    const fixed = buildPetrolWebSystemPrompt([source(1, excerpt)], TODAY, id, [], true).length
    const history = [{ role: 'user' as const, content: 'F'.repeat(100) }, { role: 'assistant' as const, content: 'A'.repeat(100) }]
    // Platz nur noch für die Antwort, nicht für Frage UND Antwort.
    const r = resolveFollowUp({ ...base, store, senderId: 1, scopeId: 'tab-1', snapshotId, history, charBudget: fixed + base.question.length + 150 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.history).toEqual([])
      expect(r.dropped).toBe(2)
    }
  })

  it('lehnt ab, wenn die Seiten allein nicht passen — Meldung nennt das Modellfenster, nicht die Frage', () => {
    const { store, snapshotId } = storeWith([source(1, 'x'.repeat(5000))])
    const r = resolveFollowUp({ ...base, store, senderId: 1, scopeId: 'tab-1', snapshotId, history: [], charBudget: 3000 })
    expect(r).toMatchObject({ ok: false, gone: false })
    if (!r.ok) {
      expect(r.error).toMatch(/Kontextfenster des gewählten Modells/)
      expect(r.error).not.toMatch(/Kürze die Frage/)
      expect(r.sources[0].excerpt.length).toBe(5000)
    }
  })

  it('lehnt ab, wenn erst die Frage über das Budget geht — Meldung rät zum Kürzen der Frage', () => {
    const excerpt = 'x'.repeat(2000)
    const { store, snapshotId } = storeWith([source(1, excerpt)])
    const fixed = buildPetrolWebSystemPrompt([source(1, excerpt)], TODAY, id, [], true).length
    const r = resolveFollowUp({ ...base, store, senderId: 1, scopeId: 'tab-1', snapshotId, history: [], question: 'q'.repeat(500), charBudget: fixed + 100 })
    expect(r).toMatchObject({ ok: false, gone: false })
    if (!r.ok) expect(r.error).toMatch(/Kürze die Frage/)
  })
})

describe('Kleine Kontextfenster: die erste Antwort lässt Platz für die Nachfrage', () => {
  const page = 'Wort '.repeat(4000)
  const entries = [0, 1, 2].map((i) => ({
    candidate: { index: i, url: `https://h${i}.example/`, host: `h${i}.example`, title: '' },
    outcome: { ok: true as const, title: 'Titel', finalUrl: `https://h${i}.example/`, fetchedAt: '2026-10-24T10:00:00.000Z', text: page, originalChars: page.length, truncated: false }
  }))

  // Gemessen am 24.10.2026 ohne Reserve: bei 4096 und 6144 Tokens wurde die Nachfrage abgelehnt.
  for (const contextTokens of [4096, 6144, 8192, null]) {
    it(`Kontextfenster ${contextTokens ?? 'unbekannt'}: Nachfrage passt, die erste Antwort bleibt im Budget`, () => {
      const total = webChatCharBudget(contextTokens)
      const firstQuestion = 'Was gilt?'
      const frozen = freezeWebSourcesToFit(
        entries,
        { systemChars: 100, questionChars: firstQuestion.length, history: [], total },
        (t) => t,
        (f) => measureWithFollowUpRoom({ sources: f.sources, history: f.history, questionChars: firstQuestion.length, topics: [], today: TODAY, sanitize: id })
      )
      expect(frozen.sources.length).toBe(3)
      const first = buildPetrolWebSystemPrompt(frozen.sources, TODAY, id).length + firstQuestion.length
      expect(first).toBeLessThanOrEqual(total)

      const { store, snapshotId } = storeWith(frozen.sources)
      // Feste Länge, bewusst NICHT die Konstante: sonst bestünde der Test auch mit Reserve 0.
      const followUpQuestion = 'x'.repeat(400)
      const r = resolveFollowUp({ store, senderId: 1, scopeId: 'tab-1', snapshotId, history: [], question: followUpQuestion, charBudget: total, today: TODAY, sanitize: id })
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    })
  }

  it('Themenfragen im ersten Prompt zählen mit, wenn sie ihn länger machen als den Nachfrage-Prompt', () => {
    const topics = [{ text: 'Eine längere frühere Webfrage zum Thema', clipped: false }]
    const sources = [source(1, 'kurz')]
    const withTopics = measureWithFollowUpRoom({ sources, history: [], questionChars: 5000, topics, today: TODAY, sanitize: id })
    expect(withTopics).toBeGreaterThanOrEqual(buildPetrolWebSystemPrompt(sources, TODAY, id, topics).length + 5000)
  })
})
