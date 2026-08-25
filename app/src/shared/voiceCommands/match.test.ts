import { describe, it, expect } from 'vitest'
import { matchIntent, matchOrdinal, normalizeUtterance } from './match'
import { INTENTS } from './intents'
import type { AppActionId } from './types'

function expectExecute(input: string, id: AppActionId) {
  const outcome = matchIntent(input)
  expect(outcome.kind, `"${input}" sollte ausgeführt werden, war: ${JSON.stringify(outcome)}`).toBe('execute')
  if (outcome.kind === 'execute') expect(outcome.action.id).toBe(id)
  return outcome
}

describe('normalizeUtterance', () => {
  it('entfernt Satzzeichen und Füllwörter, behält Umlaute', () => {
    expect(normalizeUtterance('Kannst du mir bitte zeigen, was überfällig ist?'))
      .toBe('mir zeigen was überfällig ist')
  })
  it('liefert leeren String für leere Eingabe', () => {
    expect(normalizeUtterance('   ')).toBe('')
    expect(normalizeUtterance('...')).toBe('')
  })
})

describe('Katalog-Beispiele treffen ihre eigene Absicht', () => {
  // Die Beispiele stehen am Intent selbst — wer ein Muster ändert, muss hier vorbei.
  for (const def of INTENTS) {
    for (const example of def.examples) {
      it(`${def.id}: "${example}"`, () => {
        expectExecute(example, def.id)
      })
    }
  }
})

describe('search.notes', () => {
  it('zieht den Suchbegriff aus der Äußerung', () => {
    const outcome = matchIntent('suche nach Lieferantenvertrag Müller')
    expect(outcome.kind).toBe('execute')
    if (outcome.kind === 'execute' && outcome.action.id === 'search.notes') {
      expect(outcome.action.params.query).toBe('lieferantenvertrag müller')
    }
  })
  it('fragt nach, wenn der Suchbegriff fehlt', () => {
    const outcome = matchIntent('suche')
    expect(outcome.kind).toBe('clarify')
    if (outcome.kind === 'clarify') {
      expect(outcome.reason).toBe('missing-param')
      if (outcome.reason === 'missing-param') expect(outcome.param).toBe('query')
    }
  })
})

describe('Schwellen', () => {
  it('führt bei zu geringem Abstand NICHT aus, sondern fragt nach', () => {
    // Trifft das Volltreffer-Muster beider Absichten -> Abstand 0.
    const outcome = matchIntent('suche nach überfälligen Aufgaben')
    expect(outcome.kind).toBe('clarify')
    if (outcome.kind === 'clarify') expect(outcome.reason).toBe('ambiguous-intent')
  })

  it('fragt bei schwachem Einzeltreffer nach, statt zu raten', () => {
    const outcome = matchIntent('übersicht')
    expect(outcome.kind).toBe('clarify')
  })

  it('gibt bei Rückfragen höchstens drei Vorschläge', () => {
    const outcome = matchIntent('suche nach überfälligen Aufgaben')
    if (outcome.kind === 'clarify' && outcome.reason === 'ambiguous-intent') {
      expect(outcome.candidates.length).toBeGreaterThan(1)
      expect(outcome.candidates.length).toBeLessThanOrEqual(3)
    }
  })
})

describe('Ablehnung — diese Sätze dürfen KEINE Absicht auslösen', () => {
  // Der eigentliche Qualitätsnachweis: ein Erkenner, der alles erkennt, erkennt nichts.
  const rejects = [
    'wie war das wetter gestern',
    'schreib eine mail an herrn müller',
    'lies mir die aktuelle notiz vor',
    'öffne projekt müller',
    'wie viele notizen habe ich',
    'mach das licht aus',
    'was steht diese woche an',
    'guten morgen'
  ]
  for (const phrase of rejects) {
    it(`"${phrase}" -> Rückfall`, () => {
      const outcome = matchIntent(phrase)
      expect(outcome.kind, `war: ${JSON.stringify(outcome)}`).toBe('fallback')
      if (outcome.kind === 'fallback') expect(outcome.query).toBe(phrase)
    })
  }

  it('behält den Originalwortlaut für den Rückfall', () => {
    const outcome = matchIntent('Wie war das Wetter gestern?')
    if (outcome.kind === 'fallback') expect(outcome.query).toBe('Wie war das Wetter gestern?')
  })
})

describe('matchOrdinal', () => {
  it('erkennt gesprochene Ordnungszahlen gegen eine offene Liste', () => {
    expect(matchOrdinal('eins', 3)).toBe(0)
    expect(matchOrdinal('die zweite', 3)).toBe(1)
    expect(matchOrdinal('drei', 3)).toBe(2)
    expect(matchOrdinal('first', 3)).toBe(0)
  })
  it('ignoriert Zahlen jenseits der Listenlänge', () => {
    expect(matchOrdinal('drei', 2)).toBeNull()
  })
  it('gibt null zurück, wenn keine Ordnungszahl vorkommt', () => {
    expect(matchOrdinal('dashboard', 3)).toBeNull()
  })
})
