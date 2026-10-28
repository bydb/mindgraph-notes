import { describe, it, expect } from 'vitest'
import {
  withoutSourceMentions,
  applyWebChatBudget,
  candidatesFromHits,
  cutAtEnd,
  freezeWebSources,
  runFetchQueue,
  withWebFootnotes,
  sentenceExtras,
  isAcknowledgement,
  canonNumber,
  searchWordsFromQuestion,
  offerSearchWords,
  webChatCharBudget,
  webChatWideLimits,
  WEB_CHAT_WIDE,
  WEB_CHAT_CLOUD_BUDGET,
  webChatNumCtx,
  contextLengthFromShow,
  petrolCloudAllowed,
  followUpQuery,
  lastSentWebQuery,
  isGapStatement,
  numberUnits,
  shortenHistoryToFit,
  looksConversational,
  skipCategoryForHost,
  stripStrayThink,
  splitSkippedHits,
  type QueueEntry,
  type WebChatCandidate,
  type WebFetchOutcome
} from './webChat'
import { analyzeCitations, supportingSources } from './rag/citations'

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
    for (const p of pending.splice(0)) p.resolve(ok('Inhalt', p.c.url))
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
    c.resolve(ok('C', c.c.url))
    { const d = pending.splice(0)[0]; d.resolve(ok('D', d.c.url)) }
    await tick()
    slow.resolve(ok('A', slow.c.url))
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
    first[1].resolve(ok('spät', first[1].c.url))
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
    // „a“ (Frage) fällt zuerst; „b“ ist dann eine Antwort ohne Frage und fällt mit (Codex F12).
    expect(r.history.map((m) => m.content[0])).toEqual(['c'])
    const total = 3000 + 100 + 500 + r.excerpts.reduce((n, e) => n + e.text.length, 0)
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

  it('F36: zwei Treffer mit derselben Zielseite sind eine Quelle und ein Duplikat', () => {
    const r = freezeWebSources(
      [entry(0, ok('Seite A', 'https://ziel.example/')), entry(1, ok('Seite A', 'https://ziel.example/')), entry(2, ok('Seite C', 'https://c.example/'))],
      { systemChars: 1000, questionChars: 10, history: [] },
      (t) => t,
      1
    )
    expect(r.sources.map((s) => s.host)).toEqual(['ziel.example'])
    expect(r.used).toEqual([0])
    expect(r.duplicates).toEqual([1])
  })

  it('F62: nur ein Titel aus der Seite selbst ist als Zahlenbeleg markiert', () => {
    const { sources } = freezeWebSources(
      [entry(0, ok('Text', 'https://a.example/')), entry(1, { ...ok('Text', 'https://b.example/'), title: '' } as WebFetchOutcome)],
      { systemChars: 1000, questionChars: 10, history: [] },
      (t) => t
    )
    expect(sources.map((x) => x.titleFromPage)).toEqual([true, false])
  })

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
    expect(ex[1].missingNumbers).toEqual(['19,50 €'])
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

describe('Weniger Fehlalarm in der Satzprüfung (Vergleich mit Claude, 25.10.2026)', () => {
  const page = 'Erlaubt sind höchstens 2000 Watt installierte Leistung. Der Anschluss über eine Mehrfachsteckdose ist nicht zulässig.'

  it('Zahl aus der Frage wird mit Herkunft benannt (bleibt Warnung, Codex F02)', () => {
    const answer = 'Ein System mit 8 Modulen überschreitet die Grenze von 2000 Watt [1].'
    const report = analyzeCitations(answer, [page])
    const ex = sentenceExtras(answer, report, [page], 'Balkonkraftwerk mit 8 Modulen, was kostet das?')
    expect(ex[0].missingNumbers).toEqual([])
    expect(ex[0].questionNumbers).toEqual(['8'])
  })

  it('Suggestivfrage: die Zahl aus der Frage wird ausgewiesen, nicht verschluckt', () => {
    const src = ['Der Beitrag beträgt 18,36 Euro.']
    const answer = 'Der Beitrag beträgt 20 Euro [1].'
    const ex = sentenceExtras(answer, analyzeCitations(answer, src), src, 'Sind es 20 Euro?')
    expect(ex[0].questionNumbers).toEqual(['20 €'])
  })

  it('Zahl, die weder in Seite noch Frage steht, bleibt eine Warnung', () => {
    const answer = 'Erlaubt sind höchstens 2400 Watt [1].'
    const ex = sentenceExtras(answer, analyzeCitations(answer, [page]), [page], 'Wie viel Watt?')
    expect(ex[0].missingNumbers).toEqual(['2400 W'])
    expect(ex[0].questionNumbers).toBeUndefined()
  })

  it('Verneinung bleibt markiert, auch wenn die Seite sie ähnlich enthält (Codex F03)', () => {
    const src = ['Die Solaranlage mit Speicher ist nicht erlaubt.']
    const answer = 'Die Solaranlage ohne Speicher ist nicht erlaubt [1].'
    expect(sentenceExtras(answer, analyzeCitations(answer, src), src)[0].negation).toBe(true)
  })
})


describe('Verlauf kürzen, Auszüge nicht (Stufe 2 Schritt B)', () => {
  it('wirft die ältesten Nachrichten ab und lässt den Inhalt der übrigen unangetastet', () => {
    const history = [
      { role: 'user' as const, content: 'aaaa' },
      { role: 'assistant' as const, content: 'bbbb' },
      { role: 'user' as const, content: 'cccc' }
    ]
    const fit = shortenHistoryToFit(history, 10, 14)
    expect(fit).toEqual({ history: [{ role: 'user', content: 'cccc' }], dropped: 2 })
    expect(history[0].content).toBe('aaaa')
  })

  it('lehnt ab, wenn der feste Teil allein nicht passt — nichts wird gekürzt', () => {
    const page = 'Auszug bleibt ganz'
    expect(shortenHistoryToFit([{ role: 'user', content: page }], page.length + 1, page.length)).toBeNull()
  })

  it('behält den Verlauf, wenn er ins Budget passt', () => {
    const history = [{ role: 'user' as const, content: 'hallo' }]
    expect(shortenHistoryToFit(history, 5, 10)).toEqual({ history, dropped: 0 })
  })
})


describe('Gesprächssatz statt Suchwörter (Nutzertest 24.10.2026)', () => {
  it('warnt bei Sätzen an Petrol', () => {
    for (const q of [
      'Okay, schauen wir mal',
      'ok, mal sehen',
      'Hallo, wie geht es dir?',
      'Danke!',
      'ok',
      'Ja, genau',
      'Mal sehen, was es zum BFSG gibt',
      'Kannst du mir das BFSG erklären',
      'Ich möchte wissen, was das BFSG verlangt',
      '  „Okay, und jetzt?“',
      // Codex F01: Varianten des beobachteten Falls, die vorher still blieben
      'Okay schauen wir mal',
      'Na dann, schauen wir mal',
      // nur die Fortsetzungsregel greift (kein Satzzeichen, keine feste Formel)
      'Okay und jetzt',
      'Naja was nun',
      'Ja und dann',
      'Wie geht es dir?',
      'Can you look this up?',
      'Okay, ' + 'wort '.repeat(14),
      // GUI-Test 26.10.2026 (chat-nachfrage-weitere-seiten.md, Schritt 1)
      'Schaue bitte auf weiteren Seiten',
      'Schaue nach welche Parfüms Alesandro Gultieri von2023 bis 2026 veröffentlicht hat',
      'Schau mal, was es dazu gibt',
      'Guck mal nach Zugverbindungen',
      'Schaut auf anderen Seiten',
      'Recherchiere die Preise für Wärmepumpen',
      'look for more sources',
      'Please check other sites',
      'Suche noch gründlicher',
      'Suche weiter'
    ]) expect(looksConversational(q), q).toBe(true)
  })

  it('warnt NICHT bei echten Suchen, auch wenn sie wie ein Füllwort beginnen', () => {
    for (const q of [
      'BFSG Medienzentren Pflichten',
      'Was verlangt das BFSG von Volkshochschulen?',
      'Gut Hohenhaus Öffnungszeiten',
      'Ja-Stimmen Bundestag 2025',
      'Hi-Fi Anlage Test 2026',
      'Also sprach Zarathustra Zitat Nietzsche',
      'Rundfunkbeitrag 2026 Höhe',
      'Hallo Welt Programm C Beispiel',
      // Codex F01: Zahl im Rest = konkrete Suche
      'Okay, Boomer Film 2019',
      'Wie geht es Pflanzen im Winter',
      'Please Please Me Beatles Album',
      // Codex F01: Wortgrenze nach dem Partikel, Bindestrich zählt nicht
      'Schauinsland Wetter',
      'Guck mal-Reihe Folge 3',
      'Schauspieler Tatort Münster',
      'Recherchieren lernen Uni',
      'Look at Me Film',
      'Search engine optimization basics',
      'Suche nach Wohnung Marburg',
      'Suchergebnisse Google entfernen',
      '',
      '   '
    ]) expect(looksConversational(q), q).toBe(false)
  })

  it('sehr lange Texte bekommen keine Gesprächs-Warnung (dafür gibt es die Längenwarnung)', () => {
    expect(looksConversational('Okay, ' + 'Wort '.repeat(30))).toBe(false)
  })
})

describe('Treffer, die keine Sachquelle sind (Sperrliste)', () => {
  it('erkennt Übersetzer, Wörterbücher und Social/Video — samt Subdomains und Ländervarianten', () => {
    expect(skipCategoryForHost('context.reverso.net')).toBe('translator')
    expect(skipCategoryForHost('translate.yandex.com')).toBe('translator')
    expect(skipCategoryForHost('translate.yandex.ru')).toBe('translator')
    expect(skipCategoryForHost('translate.google.de')).toBe('translator')
    expect(skipCategoryForHost('www.deepl.com')).toBe('translator')
    expect(skipCategoryForHost('dictionary.cambridge.org')).toBe('translator')
    expect(skipCategoryForHost('www.linguee.de')).toBe('translator')
    expect(skipCategoryForHost('www.tiktok.com')).toBe('social')
    expect(skipCategoryForHost('m.twitter.com')).toBe('social')
    expect(skipCategoryForHost('l.instagram.com')).toBe('social')
    expect(skipCategoryForHost('www.pinterest.de')).toBe('social')
    expect(skipCategoryForHost('WWW.TikTok.com.')).toBe('social')
  })

  it('lässt ähnlich klingende, aber echte Quellen durch (keine Teilstring-Treffer)', () => {
    // YouTube ist bewusst frei (Nutzerentscheidung 24.10.2026).
    for (const h of ['www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.cambridge.org', 'netflix.com', 'flix.com', 'maxx.com', 'nottiktok.com', 'yandex.com', 'www.bundesregierung.de', 'de.wikipedia.org', 'translate.example.org', 'www.leo-bw.de', 'dictionary.com']) {
      expect(skipCategoryForHost(h), h).toBeNull()
    }
  })

  it('trennt Treffer und merkt sich übersprungene Hosts je einmal', () => {
    const hits = [
      { url: 'https://context.reverso.net/uebersetzung/a', title: 'A' },
      { url: 'https://www.bundesregierung.de/bfsg', title: 'B' },
      { url: 'https://context.reverso.net/uebersetzung/b', title: 'C' },
      { url: 'https://www.tiktok.com/@x/video/1', title: 'D' },
      { url: 'not a url', title: 'E' },
      { url: 'https://www.gesetze-im-internet.de/bfsg/', title: 'F' }
    ]
    const r = splitSkippedHits(hits)
    expect(r.kept.map(h => h.title)).toEqual(['B', 'E', 'F'])
    expect(r.skipped).toEqual([
      { host: 'context.reverso.net', category: 'translator', count: 2 },
      { host: 'www.tiktok.com', category: 'social', count: 1 }
    ])
  })

  it('übersprungene Treffer belegen keinen der acht Plätze', () => {
    const skippedHits = Array.from({ length: 5 }, (_, i) => ({ title: `S${i}`, url: `https://www.tiktok.com/v/${i}`, snippet: '' }))
    const goodHits = Array.from({ length: 8 }, (_, i) => ({ title: `G${i}`, url: `https://h${i}.example/`, snippet: '' }))
    const { kept } = splitSkippedHits([...skippedHits, ...goodHits])
    expect(candidatesFromHits(kept).length).toBe(8)
  })
})


describe('Verlauf kürzen: keine Antwort ohne ihre Frage (Codex F12)', () => {
  const u = (c: string) => ({ role: 'user' as const, content: c })
  const a = (c: string) => ({ role: 'assistant' as const, content: c })

  it('shortenHistoryToFit: fällt die Frage weg, fällt auch ihre Antwort', () => {
    // Platz nur für die Antwort: vorher blieb [Antwort] stehen.
    const r = shortenHistoryToFit([u('F'.repeat(100)), a('A'.repeat(100))], 50, 160)
    expect(r).toEqual({ history: [], dropped: 2 })
  })

  it('shortenHistoryToFit: behält vollständige Wechsel und zählt die entfernten Nachrichten', () => {
    const h = [u('1'.repeat(40)), a('2'.repeat(40)), u('3'.repeat(40)), a('4'.repeat(40))]
    const r = shortenHistoryToFit(h, 0, 90)
    expect(r?.history.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(r?.history[0].content).toBe('3'.repeat(40))
    expect(r?.dropped).toBe(2)
  })

  it('shortenHistoryToFit: ein Verlauf, der schon mit einer Antwort beginnt, wird bereinigt', () => {
    const r = shortenHistoryToFit([a('verwaist'), u('Frage'), a('Antwort')], 0, 10_000)
    expect(r?.history.map(m => m.content)).toEqual(['Frage', 'Antwort'])
    expect(r?.dropped).toBe(1)
  })

  it('Such-Zweig (applyWebChatBudget) hat dieselbe Regel', () => {
    const history = [u('F'.repeat(2000)), a('A'.repeat(2000)), u('G'.repeat(500)), a('B'.repeat(500))]
    // historyMax 2600: die erste Frage fällt, ihre Antwort darf nicht übrig bleiben.
    const r = applyWebChatBudget({ systemChars: 1000, questionChars: 100, history, pages: ['p'.repeat(3000)], historyMax: 2600 })
    expect(r.history[0]?.role).not.toBe('assistant')
    expect(r.history.map(m => m.role)).toEqual(['user', 'assistant'])
  })
})

describe('Suchwörter aus der Frage, ohne Modell (Vergleich mit Claude, 25.10.2026)', () => {
  it('lässt Füllwörter weg, behält Reihenfolge, Zahlen und Fachwörter', () => {
    expect(searchWordsFromQuestion('Ich will mir selbst ein Balkonkraftwerk mit 8 Modulen installieren was kosten die Module'))
      .toBe('Balkonkraftwerk mit 8 Modulen installieren kosten Module')
    expect(searchWordsFromQuestion('Wie viel Elterngeld bekomme ich wenn ich 3000 brutto verdiene?')).toBe('Elterngeld 3000 brutto verdiene')
  })

  it('ergänzt nie ein Wort: jedes Suchwort stand in der Frage', () => {
    const q = 'Mein Kühlschrank brummt seit gestern ganz laut, ist das gefährlich oder muss der zum Reparieren?'
    const words = searchWordsFromQuestion(q).split(' ')
    for (const w of words) expect(q).toContain(w)
    expect(words).toEqual(['Kühlschrank', 'brummt', 'seit', 'gestern', 'laut', 'gefährlich', 'oder', 'Reparieren'])
  })

  it('Verneinungen bleiben erhalten (Codex F05)', () => {
    expect(searchWordsFromQuestion('Welche Medikamente darf man nicht mit Alkohol nehmen?')).toBe('Medikamente nicht mit Alkohol nehmen')
    expect(searchWordsFromQuestion('Rente ohne Abschläge mit 63')).toBe('Rente ohne Abschläge mit 63')
  })

  it('Vergleich, Zeit und Namen bleiben (Codex F01)', () => {
    expect(searchWordsFromQuestion('Was kostet ein Speicher mit oder ohne Montage?')).toBe('kostet Speicher mit oder ohne Montage')
    expect(searchWordsFromQuestion('Was gilt bei Kündigung nach der Elternzeit?')).toBe('gilt Kündigung nach Elternzeit')
    expect(searchWordsFromQuestion('Wie hoch war das Hochwasser an der Oder 2025?')).toBe('hoch Hochwasser Oder 2025')
  })

  it('englischer Vergleich bleibt erhalten (Codex F05)', () => {
    expect(offerSearchWords('Can you compare the price with or without storage?')).toBe('compare price with or without storage')
  })

  it('Gesprächsauftakt fällt als ganze Wendung, Sachwörter bleiben (Codex F07)', () => {
    expect(searchWordsFromQuestion('Lass uns mal schauen, was eine Wärmepumpe im Altbau kostet')).toBe('Wärmepumpe Altbau kostet')
    expect(searchWordsFromQuestion('Gut Hohenhaus Öffnungszeiten am Sonntag')).toBe('Gut Hohenhaus Öffnungszeiten Sonntag')
    expect(offerSearchWords('Okay, schauen wir mal')).toBeNull()
  })

  it('Angebot nur bei langen Fragen oder Gesprächssätzen (Codex Frage 6, F04)', () => {
    expect(offerSearchWords('Ich will mir selbst ein Balkonkraftwerk mit 8 Modulen installieren was kosten die Module'))
      .toBe('Balkonkraftwerk mit 8 Modulen installieren kosten Module')
    expect(offerSearchWords('Wie hoch ist das Elterngeld 2026?')).toBeNull()
    expect(offerSearchWords('Okay, schauen wir mal: Elterngeld 2025')).toBe('Elterngeld 2025')
    expect(offerSearchWords('Rundfunkbeitrag 2026 Höhe')).toBeNull()
  })

  it('bleibt weniger als zwei Wörter übrig, gilt die Frage unverändert', () => {
    expect(searchWordsFromQuestion('Okay, schauen wir mal')).toBe('Okay, schauen wir mal')
    expect(searchWordsFromQuestion('Was ist ein Leitzins?')).toBe('Was ist ein Leitzins?')
  })

  it('Zahl mit Punkt am Ende bleibt, Satzzeichen fallen weg', () => {
    expect(searchWordsFromQuestion('Was passiert am 1. Mai 2027?')).toBe('passiert 1. Mai 2027')
  })
})

describe('GUI-Test 25.10.2026: weniger Fehlalarm', () => {
  it('Lücke mit Zahl aus der Frage und Einzahl „Auszug“ gilt als benannte Lücke', () => {
    // Seit F44 bewusst strenger: eine Zahl hinter dem Doppelpunkt lässt die Warnung stehen.
    expect(isGapStatement('Dazu steht in den abgerufenen Seiten nichts: der konkrete Betrag für 3.000 € brutto.', 'Wie viel Elterngeld bei 3000 brutto?')).toBe(false)
    expect(isGapStatement('Zum Betrag für 3.000 € brutto steht in den abgerufenen Seiten nichts.', 'Wie viel Elterngeld bei 3000 brutto?')).toBe(true)
    expect(isGapStatement('Ein Stückpreis pro Modul wird in keinem Auszug genannt.')).toBe(true)
    expect(isGapStatement('In den Seiten steht nichts dazu, die Frist endet aber 2027.', 'Frist?')).toBe(false)
  })

  it('Wortverbindung mit Zahl meldet nur die Zahl', () => {
    const src = ['Das Set mit acht Modulen kostet 2.696 Euro.']
    const answer = 'Die 8-Modul-Preise gelten für ein Set mit 2.696 Euro [1].'
    const ex = sentenceExtras(answer, analyzeCitations(answer, src), src, 'Balkonkraftwerk mit 8 Modulen')
    expect(ex[0].missingNumbers).toEqual([])
    expect(ex[0].questionNumbers).toEqual(['8'])
  })
})

describe('Codex-Prüfung F27/F28 (Code-Runde)', () => {
  it('F27: gleiche Ziffern mit anderer Einheit gelten NICHT als Seitenbeleg', () => {
    const src = ['Der 800W-Wechselrichter ist erlaubt.']
    const answer = 'Das 800Wp-Set ist erlaubt [1].'
    const ex = sentenceExtras(answer, analyzeCitations(answer, src), src, 'Ist ein Balkonkraftwerk erlaubt?')
    expect(ex[0].missingNumbers).toEqual(['800 Wp'])
  })

  it('F27: gleiche Einheit bleibt belegt, auch in einer Wortverbindung', () => {
    const src = ['Der 800W-Wechselrichter ist erlaubt.']
    const answer = 'Mit 800W ist es erlaubt [1].'
    expect(sentenceExtras(answer, analyzeCitations(answer, src), src)[0].missingNumbers).toEqual([])
  })

  it('F28: Lücke mit Gegenbehauptung gilt nicht als neutrale Lücke', () => {
    expect(isGapStatement('Die Quelle bestätigt 2027 nicht, 20 Euro sind falsch.', 'Sind es 2027 20 Euro?')).toBe(false)
    expect(isGapStatement('In den Seiten steht nichts zu 2027, der Beitrag steigt.', 'Beitrag 2027?')).toBe(false)
    expect(isGapStatement('In den Seiten steht nichts zum Preis, auch nicht zur Montage.')).toBe(true)
  })
})

describe('Codex-Prüfung F33/F34 (Code-Runde 2)', () => {
  it('F33: Prozent gegen Euro und getrennte Einheiten gelten nicht als belegt', () => {
    const src = ['Der Zuschuss beträgt 20 Euro. Erlaubt sind 800 W.']
    const a1 = 'Der Zuschuss beträgt 20 % [1].'
    expect(sentenceExtras(a1, analyzeCitations(a1, src), src)[0].missingNumbers).toEqual(['20 %'])
    const a2 = 'Erlaubt sind 800 Wp [1].'
    expect(sentenceExtras(a2, analyzeCitations(a2, src), src)[0].missingNumbers).toEqual(['800 Wp'])
  })

  it('F33: gleiche Einheit in anderer Schreibweise und Zahl ohne Einheit bleiben belegt', () => {
    const src = ['Der Zuschuss beträgt 20 € pro Jahr, Laufzeit 8 Jahren.']
    const a = 'Der Zuschuss beträgt 20 Euro, die Laufzeit 8 Jahre, also 20 im Jahr [1].'
    expect(sentenceExtras(a, analyzeCitations(a, src), src)[0].missingNumbers).toEqual([])
  })

  it('F34: Doppelpunkt mit Aussage und erneutes „Quelle“ heben die Warnung nicht auf', () => {
    const q = 'Steigt der Beitrag 2027 auf 20 Euro?'
    expect(isGapStatement('Die Quelle nennt dazu nichts: 2027 steigt der Beitrag auf 20 Euro.', q)).toBe(false)
    expect(isGapStatement('Die Quelle nennt dazu nichts: der Beitrag steigt auf 20 Euro.', q)).toBe(false)
    expect(isGapStatement('Die Quelle nennt dazu nichts, die Quelle bestätigt 20 Euro.', q)).toBe(false)
    expect(isGapStatement('Die Seiten nennen nichts zum Beitrag für 2027.', q)).toBe(true)
  })
})

describe('Codex-Prüfung F38–F41/F44 (Code-Runde 3)', () => {
  const extras = (answer: string, page: string, q = '') => sentenceExtras(answer, analyzeCitations(answer, [page]), [page], q)[0]

  it('F38: Weiterleitungen auf dieselbe Seite zählen einmal, ein eigenständiger Nachrücker wird abgerufen', async () => {
    const got = await runFetchQueue(cands(5), async (c) => ok('Seite', c.index < 3 ? 'https://ziel.example/' : `https://${c.host}/`), { stopReason: () => null, maxUsable: 2, maxAttempts: 5 })
    expect(got.map((e) => e.candidate.index).sort()).toEqual([0, 1, 2, 3])
  })

  it('F39: in einem Bereich gilt die Einheit für beide Zahlen', () => {
    expect(numberUnits('600–800 W')).toEqual(['600w', '800w'])
    expect(extras('Erlaubt sind 600–800 W [1].', 'Möglich sind 600 Wp und 800 W.').missingNumbers).toEqual(['600 W'])
  })

  it('F40: Uhrzeit und Schrägstrichdatum werden als Ganzes verglichen', () => {
    expect(extras('Öffnet 12:30 Uhr [1].', 'Öffnet 12:45 Uhr; Einlass 30 Minuten vorher.').missingNumbers).toEqual(['12:30'])
    expect(extras('Termin am 03/04/2026 [1].', 'Termin am 04/03/2026.').missingNumbers).toEqual(['03/04/2026'])
    expect(extras('Öffnet 12:45 Uhr [1].', 'Öffnet 12:45 Uhr.').missingNumbers).toEqual([])
  })

  it('F41: ausgeschriebene Einheiten und Dezimalpunkt gelten wie Kurzform und Komma', () => {
    expect(extras('Das Kabel ist 3 Meter lang [1].', 'Kabellänge 3 m.').missingNumbers).toEqual([])
    expect(extras('Der Satz liegt bei 5.5 % [1].', 'Der Satz beträgt 5,5 %.').missingNumbers).toEqual([])
    expect(extras('Es sind 3.000 Euro [1].', 'Es sind 3000 €.').missingNumbers).toEqual([])
  })

  it('F44: jede Zahl hinter dem Doppelpunkt lässt die Warnung stehen', () => {
    expect(isGapStatement('Die Quelle nennt dazu nichts: der Beitrag erhöht sich 2027 auf 20 Euro.', 'Steigt der Beitrag 2027 auf 20 Euro?')).toBe(false)
    expect(isGapStatement('Die Seiten nennen nichts dazu: weder den Betrag noch die Frist.')).toBe(true)
  })
})

describe('GUI-Test 25.10.2026: vorangestellte Währung', () => {
  it('„ab €53,90“ auf der Seite belegt „53,90 €“ in der Antwort', () => {
    const src = ['Solarmodule ab €53,90 im Shop.']
    const a = 'Solarmodule gibt es ab 53,90 € pro Modul [1].'
    expect(sentenceExtras(a, analyzeCitations(a, src), src)[0].missingNumbers).toEqual([])
    expect(numberUnits('EUR 20 oder $5')).toEqual(['20eur', '5usd'])
    expect(numberUnits('Preis €1.072 für 8 × 450-Wp-Module')).toContain('1072eur')
  })
})

describe('GUI-Test 25.10.2026: Aufforderungen an den Chat', () => {
  it('„Erstelle mir …“, „Fasse … zusammen“, „Gib mir …“ warnen; echte Suchen nicht', () => {
    for (const q of ['Erstelle mir eine Zusammenfassung der politischen Ereignisse von heute', 'Fasse mir die Nachrichten zusammen', 'Gib mir drei Ideen für ein Abendessen', 'Schreibe eine Absage für Donnerstag', 'Bitte die Öffnungszeiten vom Rathaus', 'Give me the latest news', 'Summarize the EU AI Act'])
      expect(looksConversational(q), q).toBe(true)
    for (const q of ['Liste der UNESCO-Welterbestätten Deutschland', 'Erklärvideo Photosynthese', 'Zusammenfassung politische Ereignisse heute', 'Schreibtisch höhenverstellbar Test', 'Machu Picchu Eintritt 2027', 'Findelkind Rechtslage'])
      expect(looksConversational(q), q).toBe(false)
  })
})

describe('Messung 25.10.2026: Sperrliste und verirrtes </think>', () => {
  it('überspringt Erwachsenenseiten, aber keine Nachrichtenseiten', () => {
    expect(skipCategoryForHost('theporndude.com')).toBe('adult')
    expect(skipCategoryForHost('de.xhamster.com')).toBe('adult')
    expect(skipCategoryForHost('example.xxx')).toBe('adult')
    expect(skipCategoryForHost('www.zdfheute.de')).toBeNull()
    expect(skipCategoryForHost('www.tagesschau.de')).toBeNull()
  })

  it('nimmt die Fassung nach dem letzten </think> statt beider Fassungen', () => {
    const draft = 'Entwurf: Der Beitrag liegt bei 18,36 Euro [1].'
    const final = 'Der Rundfunkbeitrag liegt bei 18,36 Euro pro Haushalt [1].'
    expect(stripStrayThink(`${draft}\n</think>\n\n${final}`)).toBe(final)
  })

  it('behält den Text, wenn nach </think> nichts mehr kommt', () => {
    expect(stripStrayThink('Antwort [1].\n</think>\n')).toBe('Antwort [1].')
  })

  it('entfernt vollständige Nachdenkblöcke und lässt normale Antworten unverändert', () => {
    expect(stripStrayThink('<think>überlegen</think>\nAntwort.')).toBe('Antwort.')
    expect(stripStrayThink('Antwort ohne Marken.')).toBe('Antwort ohne Marken.')
  })
})

describe('Beträge in verschiedenen Schreibweisen (GUI-Test 26.10.2026, Marin-E-Bikes)', () => {
  const answer = 'Rift Zone EL1 kostet $5,199 und EL2 $6,499. [1]'
  const missing = (page: string) => {
    const report = analyzeCitations(answer, [page], { sourceTitles: ['t'] })
    return sentenceExtras(answer, report, [page]).flatMap((e) => e.missingNumbers)
  }

  it('Cent, englische und fehlende Tausendertrenner gelten als derselbe Preis', () => {
    expect(missing('Rift Zone EL1 $5,199.00 USD, Rift Zone EL2 $6,499.00')).toEqual([])
    expect(missing('Rift Zone EL1 Price 5199 USD, EL2 6499 USD')).toEqual([])
    expect(missing('Rift Zone EL1 $5,199 Rift Zone EL2 $6,499')).toEqual([])
  })

  it('„1234 %“ wird von „1,234 %“ nicht freigesprochen (Codex F46)', () => {
    const a = 'Der Anteil stieg um 1234 %. [1]'
    const page = 'Der Anteil stieg um 1,234 % im Jahr.'
    const report = analyzeCitations(a, [page], { sourceTitles: ['t'] })
    expect(sentenceExtras(a, report, [page]).flatMap((e) => e.missingNumbers)).toEqual(['1234 %'])
  })

  it('„1 %“ wird von „1,000 %“ nicht freigesprochen und umgekehrt (Codex F54)', () => {
    const check = (a: string, page: string) => {
      const report = analyzeCitations(a, [page], { sourceTitles: ['t'] })
      return sentenceExtras(a, report, [page]).flatMap((e) => e.missingNumbers)
    }
    expect(check('Die Steigerung lag bei 1 %. [1]', 'Die Steigerung lag bei 1,000 % laut Bericht.')).toEqual(['1 %'])
    expect(check('Die Steigerung lag bei 1000 %. [1]', 'Die Steigerung lag bei 1,000 % laut Bericht.')).toEqual(['1000 %'])
    // Cent bleiben angeglichen
    expect(check('Das Ticket kostet 19,50 €. [1]', 'Das Ticket kostet 19,5 € pro Person.')).toEqual([])
  })

  it('ein anderer Preis bleibt markiert', () => {
    expect(missing('Rift Zone EL1 $5,299.00, Rift Zone EL2 $6,499.00')).toEqual(['5199 $'])
  })

  it('Normalform', () => {
    // eine Komma-Dreiergruppe ist mehrdeutig: nur bei Währung ein Tausender (Codex F46)
    expect(canonNumber('5,199')).toBe('5,199')
    expect(canonNumber('5,199', true)).toBe('5199')
    expect(canonNumber('5,199.50')).toBe('5199,50')
    expect(canonNumber('5.199,00')).toBe('5199,00')
    expect(canonNumber('1,000,000')).toBe('1000000')
    expect(canonNumber('5.5')).toBe('5,5')
    expect(canonNumber('18,36')).toBe('18,36')
    expect(canonNumber('2026')).toBe('2026')
    expect(canonNumber('5.4.296')).toBe('5.4.296')
  })
})

describe('Modellwissen und Quellenverweise (26.10.2026)', () => {
  const src = ['Der Raspberry Pi 5 mit 8GB kostet 81 Euro bei Digitalo.', 'Die UNO Q kostet 59 Dollar.']
  it('„laut Auszug 2“ ist keine Sachzahl', () => {
    const answer = 'Laut Auszug 2 kostet die UNO Q 59 Dollar [2].'
    const report = analyzeCitations(answer, src)
    expect(sentenceExtras(answer, report, src)[0].missingNumbers).toEqual([])
  })
  it('Verweis auf eine Nummer außerhalb der Quellenliste bleibt eine Zahl', () => {
    expect(withoutSourceMentions('Quelle 7 nennt das', 2)).toContain('7')
    expect(withoutSourceMentions('Auszug 1 und 2 nennen das', 2).trim()).toBe('nennen das')
  })
  it('Zahl in einem Satz ohne Nummer wird als „ohne Quelle“ markiert, Einordnung ohne Zahl nicht', () => {
    const answer = 'Die UNO Q kostet 59 Dollar [2]. Für den Pi braucht man zusätzlich ein Netzteil für 12 Euro. Für Physical Computing ist die UNO Q einfacher.'
    const report = analyzeCitations(answer, src)
    const ex = sentenceExtras(answer, report, src)
    expect(ex[1].unsourcedNumbers).toEqual(['12 €'])
    expect(ex[2].unsourcedNumbers).toBeUndefined()
  })
  it('Zahlen aus der Frage zählen in Sätzen ohne Nummer nicht als ungedeckt', () => {
    const answer = 'Für einen Klassensatz von 15 Geräten lohnt sich die einfachere Lösung.'
    const report = analyzeCitations(answer, src)
    expect(sentenceExtras(answer, report, src, 'Was brauche ich für 15 Geräte?')[0].unsourcedNumbers).toBeUndefined()
  })
  it('Tabellenkopf und Zeilennamen sind Etiketten, keine Modellwissen-Aussagen', () => {
    const answer = '| | Raspberry Pi 5 | Arduino UNO Q |\n|---|---|---|\n| **Preis** | kostet 81 Euro [1] | 59 Dollar [2] |\n| **Lernen** | Bietet sich für Linux-Einsteiger an. | Gut für Hardwareprojekte. |'
    const report = analyzeCitations(answer, src)
    const ex = sentenceExtras(answer, report, src)
    const textOf = (k: number) => answer.slice(report.sentences[k].start, report.sentences[k].end)
    const labels = report.sentences.map((_, k) => k).filter((k) => ex[k].label).map(textOf)
    expect(labels).toEqual(expect.arrayContaining(['Raspberry Pi 5', 'Arduino UNO Q']))
    expect(labels.some((l) => l.includes('Linux-Einsteiger'))).toBe(false)
  })
  it('kurze Zellen mit Menge, Preis oder Jahr sind keine Etiketten', () => {
    const answer = '| Modell | Preis | Jahr |\n|---|---|---|\n| 8 GB RAM | 189 € | seit 2023 |'
    const report = analyzeCitations(answer, src)
    const ex = sentenceExtras(answer, report, src)
    const textOf = (k: number) => answer.slice(report.sentences[k].start, report.sentences[k].end)
    const labels = report.sentences.map((_, k) => k).filter((k) => ex[k].label).map(textOf)
    expect(labels).toEqual(['Modell', 'Preis', 'Jahr'])
  })
  it('eine Nummer je Tabellenzeile gilt für alle Zellen der Zeile, die Rangspalte ist ein Etikett', () => {
    const pages = ['Black Afgano 2009 8.1 3121 Bewertungen', 'Duro 2007 8.1 1330']
    const answer = '| # | Duft | Jahr | Stimmen |\n|---|---|---|---|\n| 1 | Black Afgano [1] | 2009 | 3121 |\n| 2 | Duro [2] | 2007 | 9999 |'
    const report = analyzeCitations(answer, pages)
    const ex = sentenceExtras(answer, report, pages)
    const at = (t: string) => report.sentences.findIndex((s) => answer.slice(s.start, s.end).trim() === t)
    expect(report.sentences[at('3121')].refs).toEqual([1])
    expect(ex[at('3121')].missingNumbers).toEqual([])
    expect(ex[at('3121')].unsourcedNumbers).toBeUndefined()
    // geerbte Nummer prüft die Zahl gegen genau diese Seite
    expect(ex[at('9999')].missingNumbers).toEqual(['9999'])
    // Rangspalte: weder Modellwissen-Zahl noch Befund
    expect(ex[at('2')].unsourcedNumbers).toBeUndefined()
    expect(ex[at('2')].missingNumbers ?? []).toEqual([])
  })
  it('Nummer in Inline-Code oder Linkziel belegt die Zeile nicht (Codex F01)', () => {
    const pages = ['9999']
    for (const answer of ['| Code | Wert |\n|---|---|\n| `[1]` | 9999 |', '| Link | Wert |\n|---|---|\n| [X](https://x.test/[1]) | 9999 |']) {
      const report = analyzeCitations(answer, pages)
      const k = report.sentences.findIndex((s) => answer.slice(s.start, s.end).trim() === '9999')
      expect(report.sentences[k].refs).toEqual([])
      expect(sentenceExtras(answer, report, pages)[k].unsourcedNumbers).toEqual(['9999'])
    }
  })
  it('Zeile mit mehreren Quellen vererbt nichts (Codex F05)', () => {
    const pages = ['P 9999', 'etwas ganz anderes']
    const answer = '| A | B | C |\n|---|---|---|\n| P [1] | Falsch [2] | 9999 |'
    const report = analyzeCitations(answer, pages)
    const k = report.sentences.findIndex((s) => answer.slice(s.start, s.end).trim() === '9999')
    expect(report.sentences[k].refs).toEqual([])
    expect(supportingSources(report)).not.toContain(2)
  })
  it('Zahl in Spalte eins ohne Rang-Kopf bleibt eine Angabe (Codex F02)', () => {
    const pages = ['GB']
    const answer = '| Größe | Einheit |\n|---|---|\n| 8 | GB [1] |'
    const report = analyzeCitations(answer, pages)
    const ex = sentenceExtras(answer, report, pages)
    const k = report.sentences.findIndex((s) => answer.slice(s.start, s.end).trim() === '8')
    expect(ex[k].label).toBeUndefined()
    expect(ex[k].missingNumbers).toEqual(['8'])
  })
  it('reine Fettzeile ist ein Abschnittstitel, kein Modellwissen (Codex F08)', () => {
    const answer = 'Black Afgano ist beliebt [1].\n\n**Einordnung**\n\nDas ist eine Einschätzung.'
    const report = analyzeCitations(answer, ['Black Afgano ist beliebt'])
    const k = report.sentences.findIndex((s) => answer.slice(s.start, s.end).includes('Einordnung'))
    expect(report.sentences[k].status).toBe('unchecked')
    expect(report.summary.uncited).toBe(1)
  })
  it('fett gesetzter Tatsachensatz bleibt prüfpflichtig (Codex F09)', () => {
    const answer = 'Einleitung [1].\n\n**Der Preis beträgt 199 €.**'
    const pages = ['Einleitung ohne Preis']
    const report = analyzeCitations(answer, pages)
    const k = report.sentences.findIndex((s) => answer.slice(s.start, s.end).includes('199'))
    expect(k).toBeGreaterThanOrEqual(0)
    expect(report.sentences[k].status).toBe('uncited')
    expect(sentenceExtras(answer, report, pages)[k].unsourcedNumbers).toEqual(['199 €'])
  })
  it('Pipe-Prosa über der Tabelle ist kein Rang-Kopf, echter Rang-Kopf ohne führendes | schon (Codex F12)', () => {
    const pages = ['Test GB']
    const fake = 'Rang | früher\nGröße | Einheit\n--- | ---\n8 | GB [1]'
    let report = analyzeCitations(fake, pages)
    let k = report.sentences.findIndex((s) => fake.slice(s.start, s.end).trim() === '8')
    expect(sentenceExtras(fake, report, pages)[k].label).toBeUndefined()
    const real = 'Rang | Einheit\n--- | ---\n8 | GB [1]'
    report = analyzeCitations(real, pages)
    k = report.sentences.findIndex((s) => real.slice(s.start, s.end).trim() === '8')
    expect(sentenceExtras(real, report, pages)[k].label).toBe(true)
  })
  it('reine Bestätigungen sind kein Suchauftrag, Fragen schon (Codex F07)', () => {
    for (const t of ['Danke', 'danke!', 'Ok, super', 'Alles klar.', 'Vielen Dank 🙂', 'thanks', 'Vielen lieben Dank', 'Herzlichen Dank', 'Merci beaucoup', 'Thank you so much']) expect(isAcknowledgement(t)).toBe(true)
    for (const t of ['ok, und der Preis?', 'Danke, und welcher ist am günstigsten?', 'Gut oder schlecht?', '', 'Super 8', 'Top 10', 'OK 2026']) expect(isAcknowledgement(t)).toBe(false)
  })
  it('ohne Nummer in der Zeile bleibt eine Zahl ohne Quelle', () => {
    const pages = ['Black Afgano 2009']
    const answer = '| Duft | Jahr |\n|---|---|\n| Black Afgano | 2009 |'
    const report = analyzeCitations(answer, pages)
    const ex = sentenceExtras(answer, report, pages)
    const k = report.sentences.findIndex((s) => answer.slice(s.start, s.end).trim() === '2009')
    expect(report.sentences[k].refs).toEqual([])
    expect(ex[k].unsourcedNumbers).toEqual(['2009'])
  })
  it('Zahl aus dem Seitentitel gilt als Seitenzahl, wenn der Titel mitgegeben wird', () => {
    const pages = ['Raspberry Pi 5 (8 GB RAM), 189,00 €\nIn den Warenkorb']
    const answer = 'Ein Händler listet das Modell mit 8 GB RAM für 189 € [1].'
    const report = analyzeCitations(answer, pages)
    expect(sentenceExtras(answer, report, pages)[0].missingNumbers).toEqual([])
  })
  it('F61: kurze Aussagen in Inhaltsspalten und außerhalb von Tabellen sind keine Etiketten', () => {
    const answer = '| Board | Preis | Urteil |\n|---|---|---|\n| Raspberry Pi 5 | Kostet weniger | Nicht empfehlenswert |\n| Preis 59 | x [1] | y [1] |\n\nNicht empfehlenswert'
    const report = analyzeCitations(answer, src)
    const ex = sentenceExtras(answer, report, src)
    const textOf = (k: number) => answer.slice(report.sentences[k].start, report.sentences[k].end).trim()
    const labels = report.sentences.map((_, k) => k).filter((k) => ex[k].label).map(textOf)
    expect(labels).toEqual(['Board', 'Preis', 'Urteil', 'Raspberry Pi 5'])
  })
  it('F63: „Treffer 2“ ist eine Sachangabe und wird weiter geprüft', () => {
    expect(withoutSourceMentions('Er erzielte Treffer 2 in der Nachspielzeit', 2)).toContain('2')
    const answer = 'Er erzielte Treffer 2 in der Nachspielzeit [1].'
    const pages = ['Er erzielte einen Treffer in der Nachspielzeit.']
    const report = analyzeCitations(answer, pages)
    expect(sentenceExtras(answer, report, pages)[0].missingNumbers).toEqual(['2'])
  })
})


describe('Runde 9: Zuordnung, Lücken, Cloud-Budget (Codex F65/F66/F69)', () => {
  const filler = (n: number) => ' Lieferbar in zwei bis drei Werktagen, Versand aus Deutschland.'.repeat(n)

  it('F65: Preis und Variante weit auseinander → Zuordnung ungeprüft', () => {
    const page = `Raspberry Pi 5 mit 4 GB RAM, Starterset.${filler(8)} Raspberry Pi 5 mit 16 GB RAM ab 179,89 Euro.`
    const answer = 'Für die Variante mit 4 GB RAM werden 179,89 Euro genannt [1].'
    const report = analyzeCitations(answer, [page])
    expect(sentenceExtras(answer, report, [page])[0].apartNumbers).toEqual(['4 GB', '179,89 €'])
  })

  it('F65: Preis und Variante beieinander → kein Hinweis', () => {
    const page = `${filler(8)} Raspberry Pi 5 mit 4 GB RAM ab 64,90 Euro.${filler(8)}`
    const answer = 'Die Variante mit 4 GB RAM kostet 64,90 Euro [1].'
    const report = analyzeCitations(answer, [page])
    expect(sentenceExtras(answer, report, [page])[0].apartNumbers).toBeUndefined()
  })

  it('F65: ohne Preis oder mit fehlender Zahl kein Zuordnungshinweis (dort meldet „Zahl“)', () => {
    const page = `Raspberry Pi 5 mit 4 GB RAM.${filler(8)} Speicherkarte 32 GB.`
    const a1 = 'Es gibt 4 GB RAM und eine 32 GB Karte [1].'
    expect(sentenceExtras(a1, analyzeCitations(a1, [page]), [page])[0].apartNumbers).toBeUndefined()
    const a2 = 'Die 4 GB Variante kostet 99 Euro [1].'
    const x2 = sentenceExtras(a2, analyzeCitations(a2, [page]), [page])[0]
    expect(x2.missingNumbers).toEqual(['99 €'])
    expect(x2.apartNumbers).toBeUndefined()
  })

  it('F69: „die abgerufenen Angaben nennen nicht“ ist eine benannte Lücke', () => {
    expect(isGapStatement('Einen Europreis für den UNO Q nennen die abgerufenen Angaben nicht.')).toBe(true)
    expect(isGapStatement('Zur Klassenstufe fand ich keine Quelle.')).toBe(true)
    expect(isGapStatement('Die Angaben nennen keinen Europreis, aber 59 Euro sind üblich.')).toBe(false)
  })

  it('„59 US-Dollar“ ist ein Betrag in USD', () => {
    expect(numberUnits('im US-Shop 59 US-Dollar')).toEqual(['59usd'])
    expect(numberUnits('59 Dollars')).toEqual(['59usd'])
  })

  it('F66: Cloud ohne gemeldetes Fenster bekommt das größere Budget, lokal bleibt es', () => {
    expect(webChatCharBudget(null, true)).toBeGreaterThan(webChatCharBudget(null))
    expect(webChatCharBudget(8192, true)).toBe(webChatCharBudget(8192))
  })
})

describe('webChatWideLimits (großer Rahmen bei bekanntem Cloud-Fenster)', () => {
  it('Haiku/DeepSeek über OpenRouter (128 000 nach Abschlag): gedeckelter großer Rahmen', () => {
    const l = webChatWideLimits(128_000)!
    expect(l.totalChars).toBe(WEB_CHAT_WIDE.totalMax)
    expect(l.sourcesMax).toBe(WEB_CHAT_WIDE.totalMax - WEB_CHAT_WIDE.overhead)
    expect(l.pageChars).toBeGreaterThan(8_000)
    expect(l.loopExcerptChars).toBeGreaterThan(3_000)
  })

  it('mittleres Fenster: Rahmen folgt dem Fenster, mit Antwortreserve', () => {
    const l = webChatWideLimits(40_000)!
    expect(l.totalChars).toBe((40_000 - WEB_CHAT_WIDE.answerTokens) * 3)
    expect(l.totalChars).toBeGreaterThan(WEB_CHAT_CLOUD_BUDGET)
  })

  it('kleines oder unbrauchbares Fenster: kein großer Rahmen, es bleibt beim Alten', () => {
    expect(webChatWideLimits(16_000)).toBeNull()
    expect(webChatWideLimits(0)).toBeNull()
    expect(webChatWideLimits(Number.NaN)).toBeNull()
  })
})
