import { describe, it, expect } from 'vitest'
import {
  DEEP_LIMITS, checkQuestionTerms, looksLikeBareFollowUp, maxPagesForPlace, mergeCandidatesRoundRobin,
  numbersMissingInQueries, parsePickReply, parsePlanReply, stripUnaskedDates, previousWebQuestion, questionTerms, withPreviousQuestion,
  asksForMorePages, asksForDeeperSearch, offerPreviousTopic, applyPreviousTopic
} from './webChatDeep'

describe('Suchplan prüfen (R1, F04)', () => {
  it('liest JSON auch zwischen Text und Codezaun', () => {
    const p = parsePlanReply('Gern:\n```json\n{"queries": ["Balkonkraftwerk 8 Module Preis", "Balkonkraftwerk 2000 Wp Grenze"]}\n```')
    expect(p?.queries).toEqual(['Balkonkraftwerk 8 Module Preis', 'Balkonkraftwerk 2000 Wp Grenze'])
  })

  it('verwirft zu lange, doppelte und überzählige Anfragen mit Grund, kürzt nie', () => {
    const long = 'x '.repeat(80).trim()
    const p = parsePlanReply(JSON.stringify({ queries: ['A B', long, 'a b', 'C D', 'E F'] }))
    expect(p?.queries).toEqual(['A B', 'C D'])
    expect(p?.rejected.map((r) => r.reason)).toEqual(['too-long', 'duplicate', 'over-limit'])
    expect(p?.rejected[0].text).toBe(long)
  })

  it('null bei fehlendem oder kaputtem JSON (Rückfall nötig)', () => {
    expect(parsePlanReply('Ich würde nach Preisen suchen.')).toBeNull()
    expect(parsePlanReply('{"queries": "nur ein Text"}')).toBeNull()
    expect(parsePlanReply('{"queries": [""]}')?.queries).toEqual([])
  })
})

describe('Seitenwahl prüfen (keine URLs, F18)', () => {
  it('nur gültige Nummern, Wahlreihenfolge, ohne Dubletten, höchstens max', () => {
    expect(parsePickReply('{"pick": [3, 1, 3, 99, "2", 0]}', 5)).toEqual([2, 0, 1])
    expect(parsePickReply('{"pick": [1,2,3,4,5,6]}', 8, 5)).toHaveLength(5)
  })

  it('eine URL statt Nummer wird ignoriert', () => {
    expect(parsePickReply('{"pick": ["https://boese.example"]}', 4)).toBeNull()
  })
})

describe('Kandidaten reihum (R4, F05)', () => {
  const hit = (u: string) => ({ title: u, url: `https://${u}/`, snippet: '' })
  it('wechselt zwischen den Anfragen und führt Dubletten mit Herkunft zusammen', () => {
    const c = mergeCandidatesRoundRobin([[hit('a.de'), hit('b.de'), hit('c.de')], [hit('x.de'), hit('a.de')]])
    expect(c.map((k) => k.host)).toEqual(['a.de', 'x.de', 'b.de', 'c.de'])
    expect(c[0].from).toEqual([0, 1])
  })

  it('schließt bereits versuchte Adressen aus und deckelt', () => {
    const c = mergeCandidatesRoundRobin([[hit('a.de'), hit('b.de'), hit('c.de')]], 2, new Set(['https://a.de/']))
    expect(c.map((k) => k.host)).toEqual(['b.de', 'c.de'])
  })
})

describe('Seitenzahl nach Platz (S4)', () => {
  it('Mindestlänge 1500 je Seite, höchstens 4', () => {
    expect(maxPagesForPlace(20000)).toBe(DEEP_LIMITS.maxPages)
    expect(maxPagesForPlace(3200)).toBe(2)
    expect(maxPagesForPlace(1000)).toBe(0)
  })
})

describe('Wörterabgleich (S2, F10, F17)', () => {
  it('Prüfbegriffe: Zahlen, Fachwörter, Kürzel; keine Füllwörter', () => {
    expect(questionTerms('Unterschied zwischen ETF und Fonds bei den Kosten?')).toEqual(['Unterschied', 'zwischen', 'ETF', 'Fonds', 'Kosten'])
    expect(questionTerms('Wie viel Elterngeld bei 3.000 Euro brutto?')).toEqual(['Elterngeld', '3000', 'Euro', 'brutto'])
  })

  it('wörtlich gefunden → nichts; nur ähnlich → similar; gar nicht → missing', () => {
    const r = checkQuestionTerms('Balkonkraftwerk mit 8 Modulen, was kosten die Module?', [
      'Ein Balkonkraftwerk mit 4 Modul-Paneelen kostet ab 600 Euro.'
    ])
    expect(r.missing).toEqual(['8'])
    expect(r.similar).toEqual(expect.arrayContaining(['Modulen', 'Module', 'kosten']))
  })

  it('deutsche Tausender gleich, Komma-Schreibweise nicht (F17)', () => {
    expect(checkQuestionTerms('Elterngeld bei 3000 brutto', ['Bei 3.000 € brutto ergibt sich … Elterngeld']).missing).toEqual([])
    expect(checkQuestionTerms('Elterngeld bei 3000 brutto', ['Elterngeld brutto 3,000']).missing).toEqual(['3000'])
  })

  it('leere Liste behauptet nichts — gibt nur keine Fehlwörter zurück', () => {
    expect(checkQuestionTerms('Rundfunkbeitrag 2027', ['Der Rundfunkbeitrag 2027 beträgt …'])).toEqual({ missing: [], similar: [] })
  })
})

describe('Nachfrage ohne Bezug: nur Hinweis (S1, F09, F16)', () => {
  it('erkennt kurze Anschlussfragen, nicht lange selbständige', () => {
    expect(looksLikeBareFollowUp('Und 2027?')).toBe(true)
    expect(looksLikeBareFollowUp('Was kostet es?')).toBe(true)
    expect(looksLikeBareFollowUp('Wie lange ist ein Brief der Deutschen Post unterwegs?')).toBe(false)
  })

  it('vorige Frage = letzte beantwortete Webfrage des Nutzers, nicht gestoppt/gescheitert/Nachfrage', () => {
    const msgs = [
      { role: 'user', origin: 'web', content: 'Rundfunkbeitrag 2026' },
      { role: 'assistant', origin: 'web', content: 'x' },
      { role: 'user', origin: 'web', content: 'Gescheitert' },
      { role: 'assistant', origin: 'web', content: '', error: true },
      { role: 'user', origin: 'web', content: 'Nachfrage', followUp: true },
      { role: 'assistant', origin: 'web', content: 'y' }
    ]
    expect(previousWebQuestion(msgs)).toBe('Rundfunkbeitrag 2026')
    expect(withPreviousQuestion('Rundfunkbeitrag 2026', 'Und 2027?')).toBe('Rundfunkbeitrag 2026 – Und 2027?')
  })
})

describe('Bitte um weitere Seiten (chat-nachfrage-weitere-seiten.md, F02)', () => {
  it('erkennt kurze Bitten auf Deutsch und Englisch', () => {
    for (const q of ['Schaue bitte auf weiteren Seiten', 'andere Quellen bitte', 'Gibt es mehr Quellen?', 'Schau woanders', 'look for more sources', 'Try other pages', 'Search elsewhere',
      // Codex F13: längere Bitte mit Rückbezug
      'Kannst du bitte noch auf anderen aktuellen amtlichen Seiten dazu nachsehen?'])
      expect(asksForMorePages(q), q).toBe(true)
  })

  it('schweigt bei Suchen ohne Bitte und bei langen eigenständigen Fragen', () => {
    for (const q of ['Rundfunkbeitrag 2026 Höhe', 'Seitenwind Fahrrad', 'Mehrseitige Formulare barrierefrei', '',
      // Codex F13: eigenständige Fragen ohne Rückbezug
      'Welche anderen Quellen erklären die Anmeldung in Marburg?',
      // Codex F23: „bitte“/„auch“ sind kein Rückbezug, ein eigenes Thema macht die Frage selbständig
      'Welche anderen Quellen erklären auch die Anmeldung in Marburg?',
      'Bitte suche andere Quellen zur Anmeldung in Marburg',
      'Andere Quellen zur Anmeldung',
      // Codex F33: Verweiswort, aber eigenes Thema im selben Satz
      'Welche anderen Quellen gibt es dazu, wie man in Marburg ein Gewerbe anmeldet?',
      'Welche weiteren Seiten der Stadtverwaltung erklären die Anmeldung eines Zweitwohnsitzes in Marburg genau und vollständig?'])
      expect(asksForMorePages(q), q).toBe(false)
  })

  it('bietet die vorige Frage an — Bitte um Seiten in beiden Modi, bloße Nachfrage nur bei gründlich', () => {
    const prev = 'Parfüms von Alessandro Gualtieri 2023 bis 2026'
    expect(offerPreviousTopic(prev, 'Schaue bitte auf weiteren Seiten', false)).toBe(true)
    expect(offerPreviousTopic(prev, 'Schaue bitte auf weiteren Seiten', true)).toBe(true)
    expect(offerPreviousTopic(prev, 'Und 2027?', false)).toBe(false)
    expect(offerPreviousTopic(prev, 'Und 2027?', true)).toBe(true)
    expect(offerPreviousTopic(null, 'andere Quellen', false)).toBe(false)
    expect(offerPreviousTopic(prev, 'Was kostet eine Bahncard 50?', true)).toBe(false)
  })

  it('setzt die Vorfrage nur dort voran, wo sie noch fehlt (Codex F12/F22)', () => {
    const prev = 'Parfüms von Alessandro Gualtieri 2023 bis 2026'
    const ask = 'Schaue bitte auf weiteren Seiten'
    // kein eigenes Suchfeld: nur der Entwurf
    expect(applyPreviousTopic(prev, ask, null)).toEqual({ draft: `${prev} – ${ask}`, webQuery: null })
    // offenes Suchfeld ohne Thema: beide
    expect(applyPreviousTopic(prev, ask, 'weitere Seiten')).toEqual({ draft: `${prev} – ${ask}`, webQuery: `${prev} – weitere Seiten` })
    // Suchfeld trägt das Thema schon (z. B. nach Eingabe): nicht verdoppeln
    expect(applyPreviousTopic(prev, ask, `${prev.toLowerCase()} Erscheinungsjahr`).webQuery).toBe(`${prev.toLowerCase()} Erscheinungsjahr`)
  })

  it('achtet auch auf das offene Suchfeld und auf eine selbst vorangestellte Vorfrage (Codex F32)', () => {
    const prev = 'Parfüms von Alessandro Gualtieri 2023 bis 2026'
    const typed = `${prev} – Schaue auf weiteren Seiten`
    // Vorfrage selbst getippt, Suchfeld noch ohne Thema: weiter anbieten
    expect(offerPreviousTopic(prev, typed, false, 'weitere Seiten')).toBe(true)
    // beides mit Thema: nicht mehr
    expect(offerPreviousTopic(prev, typed, false, `${prev} weitere Seiten`)).toBe(false)
    // kein eigenes Suchfeld: der Entwurf genügt
    expect(offerPreviousTopic(prev, typed, false, null)).toBe(false)
  })

  it('überspringt Webfragen ohne eigenes Thema (GUI-Test 26.10.2026)', () => {
    const msgs = [
      { role: 'user', origin: 'web', content: 'Welche neuen Parfüms hat Gualtieri herausgebracht' },
      { role: 'assistant', origin: 'web', content: 'x' },
      { role: 'user', origin: 'web', content: 'suche bitte noch gründlicher' },
      { role: 'assistant', origin: 'web', content: 'y' }
    ]
    expect(previousWebQuestion(msgs)).toBe('Welche neuen Parfüms hat Gualtieri herausgebracht')
    expect(offerPreviousTopic(previousWebQuestion(msgs), 'suche bitte noch gründlicher', false)).toBe(true)
  })

  it('nimmt kein älteres Webthema, wenn danach eine Antwort ohne Web kam (Codex F33)', () => {
    const msgs = [
      { role: 'user', origin: 'web', content: 'Rundfunkbeitrag 2026' },
      { role: 'assistant', origin: 'web', content: 'x' },
      { role: 'user', content: 'Erklär mir Photosynthese' },
      { role: 'assistant', content: 'Photosynthese ist …' }
    ]
    expect(previousWebQuestion(msgs)).toBeNull()
    // gestoppte Nicht-Web-Antwort zählt nicht als Bezug
    expect(previousWebQuestion([...msgs.slice(0, 3), { role: 'assistant', content: 'Photo', stopped: true }])).toBe('Rundfunkbeitrag 2026')
  })

  it('verschwindet, sobald die vorige Frage im Feld steht', () => {
    const prev = 'Parfüms von Alessandro Gualtieri 2023 bis 2026'
    const draft = withPreviousQuestion(prev, 'Schaue bitte auf weiteren Seiten')
    expect(offerPreviousTopic(prev, draft, false)).toBe(false)
    expect(offerPreviousTopic(prev, draft, true)).toBe(false)
  })
})

describe('Zahlen der Frage in den Suchanfragen (F24)', () => {
  it('meldet Jahr/Zahl, die in keiner Anfrage steht; Tausender gleich', () => {
    expect(numbersMissingInQueries('Rundfunkbeitrag 2027?', ['Rundfunkbeitrag 2026'])).toEqual(['2027'])
    expect(numbersMissingInQueries('Elterngeld bei 3.000 brutto', ['Elterngeld 3000 brutto'])).toEqual([])
  })
})

describe('Codex-Prüfung F31/F37 (Code-Runde 2)', () => {
  it('F31: Zahl hinter dem zehnten Begriff wird geprüft', () => {
    const q = 'Kosten Rundfunkbeitrag Wohnung Studenten Befreiung Antrag Formular Bescheid Frist Widerspruch Erhöhung 2027'
    expect(questionTerms(q)).toContain('2027')
    expect(numbersMissingInQueries(q, ['Rundfunkbeitrag Erhöhung 2026'])).toEqual(['2027'])
  })

  it('F37: nur ungültige Anfragen → leere Liste mit Gründen', () => {
    const p = parsePlanReply(JSON.stringify({ queries: ['x '.repeat(80).trim()] }))
    expect(p?.queries).toEqual([])
    expect(p?.rejected.map((r) => r.reason)).toEqual(['too-long'])
  })
})

describe('GUI-Test 25.10.2026: Arbeitsanweisungen sind keine Prüfbegriffe', () => {
  it('„Erstelle mir eine Zusammenfassung …“ prüft nur den Inhalt', () => {
    expect(questionTerms('Erstelle mir eine Zusammenfassung der politischen Ereignisse von heute')).toEqual(['politischen', 'Ereignisse', 'heute'])
  })
})

describe('Messung 25.10.2026: kein ungefragtes Datum in der Suchanfrage', () => {
  const q = 'Erstelle mir eine Zusammenfassung der politischen Ereignisse von heute'
  it('entfernt tagesgenaue Daten, wenn die Frage keines nennt', () => {
    expect(stripUnaskedDates('politische Ereignisse heute 2026-10-26', q)).toBe('politische Ereignisse heute')
    expect(stripUnaskedDates('politische Tagesereignisse 25.10.2026 Zusammenfassung aktuell', q)).toBe('politische Tagesereignisse Zusammenfassung aktuell')
    expect(stripUnaskedDates('politische Ereignisse 25 Oktober 2026 Zusammenfassung', q)).toBe('politische Ereignisse Zusammenfassung')
    expect(stripUnaskedDates('politische Ereignisse 25. Oktober', q)).toBe('politische Ereignisse')
  })

  it('lässt Jahre, Preise und Daten aus der Frage stehen', () => {
    expect(stripUnaskedDates('Deutschland Nachrichten 2026', q)).toBe('Deutschland Nachrichten 2026')
    expect(stripUnaskedDates('Rundfunkbeitrag 18,36 Euro', q)).toBe('Rundfunkbeitrag 18,36 Euro')
    expect(stripUnaskedDates('Bundestag 3.10.2026', 'Was beschloss der Bundestag am 3.10.2026?')).toBe('Bundestag 3.10.2026')
  })

  it('parsePlanReply wendet es an und meldet eine nur aus Datum bestehende Anfrage als leer', () => {
    const p = parsePlanReply(JSON.stringify({ queries: ['Politik 2026-10-26', '26.10.2026'] }), 2, q)
    expect(p?.queries).toEqual(['Politik'])
    expect(p?.rejected).toEqual([{ text: '26.10.2026', reason: 'empty' }])
  })
})

describe('Bitte um gründlichere Suche (GUI-Test 26.10.2026)', () => {
  it('erkennt Bitten ohne eigenes Thema', () => {
    for (const q of ['Suche noch gründlicher', 'Recherchiere genauer', 'Bitte gründlicher suchen', 'Schau nochmal genauer nach', 'search more thoroughly', 'dig deeper'])
      expect(asksForDeeperSearch(q), q).toBe(true)
  })
  it('schweigt bei Fragen mit eigenem Thema oder ohne Suchverb', () => {
    for (const q of ['Suche gründlicher nach Mietrecht in Marburg', 'Wie genauer messen?', 'Gründliche Reinigung Backofen', 'Tiefer Brunnen Kosten', ''])
      expect(asksForDeeperSearch(q), q).toBe(false)
  })
  it('bietet in der Schnellsuche die vorige Frage an', () => {
    expect(offerPreviousTopic('Parfüms Gualtieri 2023 bis 2026', 'Suche noch gründlicher', false)).toBe(true)
  })
})
