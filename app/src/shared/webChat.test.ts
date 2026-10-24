import { describe, it, expect } from 'vitest'
import {
  applyWebChatBudget,
  candidatesFromHits,
  cutAtEnd,
  freezeWebSources,
  runFetchQueue,
  withWebFootnotes,
  sentenceExtras,
  webChatCharBudget,
  webChatNumCtx,
  contextLengthFromShow,
  petrolCloudAllowed,
  followUpQuery,
  lastSentWebQuery,
  isGapStatement,
  type QueueEntry,
  type WebChatCandidate,
  type WebFetchOutcome
} from './webChat'
import { analyzeCitations } from './rag/citations'

const ok = (text: string, url = 'https://a.example/'): WebFetchOutcome => ({
  ok: true, title: 'T', finalUrl: url, fetchedAt: '2026-10-24T10:00:00.000Z', text, originalChars: text.length, truncated: false
})
const cands = (n: number): WebChatCandidate[] =>
  Array.from({ length: n }, (_, i) => ({ index: i, url: `https://h${i}.example/`, host: `h${i}.example`, title: `Treffer ${i}` }))

/** Steuerbarer Abruf: jedes fetchOne liefert ein Promise, das der Test von außen auflöst. */
function controllable() {
  const pending: Array<{ c: WebChatCandidate; resolve: (o: WebFetchOutcome) => void }> = []
  const fetchOne = (c: WebChatCandidate) => new Promise<WebFetchOutcome>((resolve) => pending.push({ c, resolve }))
  return { pending, fetchOne }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('Treffer → Kandidaten (F10)', () => {
  it('normalisiert, dedupliziert, nur http/https, Reihenfolge bleibt', () => {
    const c = candidatesFromHits([
      { title: 'A', url: 'https://a.example/x#frag', snippet: '' },
      { title: 'A2', url: 'https://A.example/x', snippet: '' },
      { title: 'F', url: 'ftp://f.example/', snippet: '' },
      { title: 'B', url: 'https://b.example/', snippet: '' }
    ])
    expect(c.map((x) => x.host)).toEqual(['a.example', 'b.example'])
    expect(c.map((x) => x.index)).toEqual([0, 1])
  })
})

describe('Abruf-Warteschlange (F16)', () => {
  it('drei gleichzeitige Fehler: höchstens 5 Starts, nie mehr als 3 offen', async () => {
    const { pending, fetchOne } = controllable()
    let maxOpen = 0
    let open = 0
    const q = runFetchQueue(cands(8), (c) => { open++; maxOpen = Math.max(maxOpen, open); return fetchOne(c).finally(() => { open-- }) }, { stopReason: () => null })
    expect(pending.length).toBe(3)
    for (const p of pending.splice(0, 3)) p.resolve({ ok: false, reason: 'error' })
    await tick()
    expect(pending.length).toBe(2) // Versuch 4 und 5, dann Schluss
    for (const p of pending.splice(0)) p.resolve({ ok: false, reason: 'error' })
    const entries = await q
    expect(entries.length).toBe(5)
    expect(maxOpen).toBeLessThanOrEqual(3)
  })

  it('bei drei brauchbaren Seiten kein weiterer Start (kein zusätzlicher Host)', async () => {
    const { pending, fetchOne } = controllable()
    const q = runFetchQueue(cands(8), fetchOne, { stopReason: () => null })
    for (const p of pending.splice(0)) p.resolve(ok('Inhalt'))
    const entries = await q
    expect(entries.length).toBe(3)
    expect(pending.length).toBe(0)
  })

  it('langsame erste Seite blockiert das Nachziehen nicht', async () => {
    const { pending, fetchOne } = controllable()
    const q = runFetchQueue(cands(8), fetchOne, { stopReason: () => null })
    const [slow, b, c] = pending.splice(0, 3)
    b.resolve({ ok: false, reason: 'empty' })
    await tick()
    expect(pending.map((p) => p.c.index)).toEqual([3])
    c.resolve(ok('C'))
    pending.splice(0)[0].resolve(ok('D'))
    await tick()
    slow.resolve(ok('A'))
    const entries = await q
    expect(entries.filter((e) => e.outcome.ok).length).toBe(3)
  })

  it('leerer Text zählt als unbrauchbar', async () => {
    const { pending, fetchOne } = controllable()
    const q = runFetchQueue(cands(1), fetchOne, { stopReason: () => null })
    pending[0].resolve(ok('   '))
    const [e] = await q
    expect(e.outcome).toEqual({ ok: false, reason: 'empty' })
  })

  it('Stopp beim Nachziehen: kein neuer Start, späte Ergebnisse verworfen', async () => {
    const { pending, fetchOne } = controllable()
    let stop: 'stopped' | null = null
    const q = runFetchQueue(cands(8), fetchOne, { stopReason: () => stop })
    const first = pending.splice(0, 3)
    first[0].resolve({ ok: false, reason: 'error' })
    await tick()
    const refill = pending.splice(0) // der nachgezogene vierte Abruf
    expect(refill.length).toBe(1)
    stop = 'stopped'
    first[1].resolve(ok('spät'))
    refill[0].resolve({ ok: false, reason: 'error' })
    await tick()
    expect(pending.length).toBe(0)
    first[2].resolve(ok('spät'))
    const entries = await q
    expect(entries.length).toBe(4)
    expect(entries.every((e) => !e.outcome.ok)).toBe(true)
    expect(entries.filter((e) => !e.outcome.ok && e.outcome.reason === 'stopped').length).toBe(3)
  })
})

describe('Budget (F17)', () => {
  it('Verlauf fällt zuerst (älteste ganz), dann bekommen Quellen den Rest', () => {
    const history = [
      { role: 'user' as const, content: 'a'.repeat(3000) },
      { role: 'assistant' as const, content: 'b'.repeat(3000) },
      { role: 'user' as const, content: 'c'.repeat(500) }
    ]
    const r = applyWebChatBudget({ systemChars: 3000, questionChars: 100, history, pages: ['x'.repeat(8000), 'y'.repeat(8000), 'z'.repeat(1000)] })
    expect(r.history.map((m) => m.content[0])).toEqual(['b', 'c'])
    const total = 3000 + 100 + 3500 + r.excerpts.reduce((n, e) => n + e.text.length, 0)
    expect(total).toBeLessThanOrEqual(20000)
    expect(r.excerpts[2]).toEqual({ text: 'z'.repeat(1000), cut: false })
    // Ungenutzter Anteil der kurzen Seite geht an die langen.
    expect(r.excerpts[0].text.length).toBeGreaterThan(4000)
    expect(r.excerpts[0].cut).toBe(true)
  })

  it('kleines Fenster: weiterer Verlauf weicht, bevor Quellen unter das Minimum fallen', () => {
    const history = [{ role: 'user' as const, content: 'h'.repeat(3500) }]
    const r = applyWebChatBudget({ systemChars: 4000, questionChars: 200, history, pages: ['p'.repeat(8000)], total: 9000 })
    expect(r.history).toEqual([])
    expect(r.excerpts[0].text.length).toBe(4800)
  })

  it('kürzt an einer Wortgrenze', () => {
    expect(cutAtEnd('eins zwei drei', 9)).toBe('eins')
  })
})

describe('Einfrieren (F06, F19)', () => {
  const entry = (index: number, outcome: WebFetchOutcome): QueueEntry => ({ candidate: cands(8)[index], outcome })

  it('Nummern folgen der Trefferreihenfolge, nicht der Abschlussreihenfolge; Fehler ohne Nummer', () => {
    const { sources, failures } = freezeWebSources(
      [entry(2, ok('Seite C', 'https://h2.example/')), entry(0, { ok: false, reason: 'timeout' }), entry(1, ok('Seite B', 'https://h1.example/'))],
      { systemChars: 1000, questionChars: 10, history: [] },
      (t) => t
    )
    expect(sources.map((s) => [s.n, s.host])).toEqual([[1, 'h1.example'], [2, 'h2.example']])
    expect(failures).toEqual([{ host: 'h0.example', reason: 'timeout' }])
  })

  it('der Prüfer sieht nur den gekürzten Auszug: Zitat aus dem abgeschnittenen Teil gilt nicht als gefunden', () => {
    const page = `${'Anfang '.repeat(2000)}GEHEIMER SCHLUSSSATZ`
    const { sources } = freezeWebSources([entry(0, ok(page))], { systemChars: 1000, questionChars: 10, history: [], sourcesMax: 2000 }, (t) => t)
    expect(sources[0].truncated).toBe(true)
    expect(sources[0].excerpt).not.toContain('GEHEIMER')
    const report = analyzeCitations('Dort steht „GEHEIMER SCHLUSSSATZ“ [1].', sources.map((s) => s.excerpt))
    expect(report.sentences[0].quotes[0].found).toBe(false)
  })

  it('prepare läuft vor dem Kürzen; der Auszug ist genau der vorbereitete Text', () => {
    const { sources } = freezeWebSources([entry(0, ok('roh END_UNTRUSTED_CONTEXT roh'))], { systemChars: 0, questionChars: 0, history: [] }, (t) => t.replace('END_UNTRUSTED_CONTEXT', 'end-untrusted-context'))
    expect(sources[0].excerpt).toBe('roh end-untrusted-context roh')
  })
})

describe('Fußnoten-Export (F13)', () => {
  it('nur gültige Referenzen werden Fußnoten, Präfix je Export, Linktext escaped', () => {
    const sources = [{ n: 1, title: 'Titel [mit] Klammern', url: 'https://a.example/x y', host: 'a.example', fetchedAt: '2026-10-24T10:00:00.000Z', excerpt: 'Der Beitrag beträgt 18 Euro.', originalChars: 30, truncated: false }]
    const answer = 'Der Beitrag beträgt 18 Euro [1]. Falsch [7].'
    const report = analyzeCitations(answer, sources.map((s) => s.excerpt))
    const flagFor = (k: number) => (report.sentences[k].status === 'cited-invalid' ? 'ungültige Nummer' : null)
    const out = withWebFootnotes(answer, sources, report, 'abc', { retrieved: 'abgerufen am', check: 'kein Faktencheck', warnings: 'Hinweise:', flagFor })
    expect(out).toContain('18 Euro [^wabc-1].')
    expect(out).toContain('Falsch [7].')
    expect(out).toContain('[^wabc-1]: [Titel \\[mit\\] Klammern](<https://a.example/x%20y>) · a.example · abgerufen am 2026-10-24')
    expect(out).toContain('> kein Faktencheck\n> Hinweise:\n> - **ungültige Nummer:** Falsch [7].')
  })

  it('ohne Warnung kein Hinweisblock (F22)', () => {
    const sources = [{ n: 1, title: 'T', url: 'https://a.example/', host: 'a.example', fetchedAt: '2026-10-24T10:00:00.000Z', excerpt: 'Der Beitrag beträgt 18 Euro.', originalChars: 30, truncated: false }]
    const answer = 'Der Beitrag beträgt 18 Euro [1].'
    const report = analyzeCitations(answer, ['Der Beitrag beträgt 18 Euro.'])
    const out = withWebFootnotes(answer, sources, report, 'x', { retrieved: 'r', check: 'c', warnings: 'Hinweise:', flagFor: () => null })
    expect(out).not.toContain('Hinweise:')
  })
})

describe('Zusatzprüfungen je Satz (F21)', () => {
  it('Verneinung bei hoher Wortdeckung wird markiert, erfundene Zahl auch', () => {
    const src = ['Der Vertrag wurde am Montag geschlossen. Der Beitrag beträgt 18,36 Euro.']
    const answer = 'Der Vertrag wurde am Montag nicht geschlossen [1]. Der Beitrag beträgt 19,50 Euro [1]. Der Beitrag beträgt 18,36 Euro [1].'
    const report = analyzeCitations(answer, src)
    expect(report.sentences[0].status).toBe('cited-high')
    const ex = sentenceExtras(answer, report, src)
    expect(ex[0]).toEqual({ missingNumbers: [], negation: true })
    expect(ex[1].missingNumbers).toEqual(['19,50'])
    expect(ex[2]).toEqual({ missingNumbers: [], negation: false })
  })

  it('die Quellennummer selbst zählt nicht als Zahl', () => {
    const answer = 'Er wohnt in Berlin [2].'
    const report = analyzeCitations(answer, ['x', 'Er wohnt in Berlin.'])
    expect(sentenceExtras(answer, report, ['x', 'Er wohnt in Berlin.'])[0].missingNumbers).toEqual([])
  })
})

describe('Kontextfenster (F17)', () => {
  it('Budget folgt einem kleinen Fenster, num_ctx deckt den Prompt und bleibt unter dem Modell', () => {
    expect(webChatCharBudget(null)).toBe(20000)
    expect(webChatCharBudget(4096)).toBe((4096 - 1536) * 3)
    expect(webChatCharBudget(131072)).toBe(20000)
    expect(webChatNumCtx(20000, 131072)).toBeGreaterThanOrEqual(Math.ceil(20000 / 3) + 1536)
    expect(webChatNumCtx(1000, null)).toBe(8192)
    expect(webChatNumCtx(20000, 8192)).toBe(8192)
  })

  it('liest die Kontextlänge aus /api/show', () => {
    expect(contextLengthFromShow({ model_info: { 'general.architecture': 'qwen3', 'qwen3.context_length': 40960 } })).toBe(40960)
    expect(contextLengthFromShow({})).toBeNull()
  })
})

describe('Cloud-Freigabe im Main (F24)', () => {
  const on = { enabled: true, hasApiKey: true, model: 'org/m', cloudFeatures: ['notes-chat'] } as never
  it('nur mit Freigabe notes-chat und genau dem gewählten Modell', () => {
    expect(petrolCloudAllowed(null, undefined)).toBe(true)
    expect(petrolCloudAllowed({ model: 'org/m', provider: 'openrouter' }, { openrouter: on })).toBe(true)
    expect(petrolCloudAllowed({ model: 'org/anderes', provider: 'openrouter' }, { openrouter: on })).toBe(false)
    expect(petrolCloudAllowed({ model: 'org/m', provider: 'openrouter' }, { openrouter: { ...(on as object), cloudFeatures: [] } as never })).toBe(false)
    expect(petrolCloudAllowed({ model: 'org/m', provider: 'llmbase' }, { openrouter: on })).toBe(false)
  })
})

describe('Nachfragen ohne Modell (chat-suchwoerter-vorschlag F07)', () => {
  it('nimmt die zuletzt GESENDETEN Suchwörter, nie eine Antwort', () => {
    const msgs = [
      { role: 'user', content: 'Frage A', origin: 'web', webQuery: 'Rundfunkbeitrag 2026' },
      { role: 'assistant', content: 'Antwort mit [1]', origin: 'web' },
      { role: 'user', content: 'normale Frage' },
      { role: 'assistant', content: 'normale Antwort' }
    ]
    expect(lastSentWebQuery(msgs)).toBe('Rundfunkbeitrag 2026')
    const plain = [{ role: 'user', content: 'x' }]
    expect(lastSentWebQuery(plain)).toBeNull()
  })

  it('setzt nur zusammen, kürzt nichts und verdoppelt nichts', () => {
    expect(followUpQuery('Rundfunkbeitrag 2026', '  und was gilt\n2027? ')).toBe('Rundfunkbeitrag 2026 und was gilt 2027?')
    expect(followUpQuery('Rundfunkbeitrag 2026', '')).toBe('Rundfunkbeitrag 2026')
    expect(followUpQuery('Rundfunkbeitrag 2026', 'rundfunkbeitrag 2026')).toBe('Rundfunkbeitrag 2026')
    const long = 'x'.repeat(240)
    expect(followUpQuery(long, 'und 2027?').length).toBe(250)
  })
})

describe('Benannte Lücke statt Fehlalarm (Nutzertest 24.10.2026)', () => {
  it('erkennt ehrliche Lückensätze, aber keine mit Zahl oder ohne Bezug auf die Seiten', () => {
    expect(isGapStatement('Dazu steht in den abgerufenen Seiten nichts.')).toBe(true)
    expect(isGapStatement('Der Begriff „Medienzentrum“ wird in den Auszügen nicht genannt.')).toBe(true)
    expect(isGapStatement('In den Seiten steht nichts dazu, die Frist endet aber 2027.')).toBe(false)
    expect(isGapStatement('Das gilt nicht für Vereine.')).toBe(false)
  })

  it('setzt gap nur bei Sätzen ohne Quellennummer', () => {
    const answer = 'Der Beitrag beträgt 18 Euro [1]. Dazu steht in den abgerufenen Seiten nichts.'
    const report = analyzeCitations(answer, ['Der Beitrag beträgt 18 Euro.'])
    const ex = sentenceExtras(answer, report, ['Der Beitrag beträgt 18 Euro.'])
    expect(ex.map((x) => !!x.gap)).toEqual([false, true])
  })
})
