// Tests des gruppierten Splits. Die eine Zusage, die dieser Code geben muss: eine Gruppe
// liegt vollständig in EINER Teilmenge. Fällt sie, misst der Holdout Wiedererkennung
// statt Übertragbarkeit — und das sieht man dem Ergebnis nicht an.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SPLIT_RATIOS,
  assignSubset,
  deriveGroupKey,
  groupFraction,
  isValidRatios,
  normalizeSubjectKey,
  splitByGroup,
  temporalSubset,
  type SplitInputRecord,
} from './split'

function dataset(n: number, groupsCount: number): SplitInputRecord[] {
  return Array.from({ length: n }, (_, i) => ({ id: `case-${i}`, group: `g-${i % groupsCount}` }))
}

describe('groupFraction', () => {
  it('ist deterministisch und liegt in [0,1)', () => {
    for (const g of ['a', 'thread:<x@y>', 'tpl:example.org:newsletter kw #']) {
      const f = groupFraction('seed-1', g)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
      expect(groupFraction('seed-1', g)).toBe(f)
    }
  })

  it('ein anderer Seed ergibt eine andere Zuordnung', () => {
    const a = Array.from({ length: 50 }, (_, i) => assignSubset('seed-1', `g-${i}`))
    const b = Array.from({ length: 50 }, (_, i) => assignSubset('seed-2', `g-${i}`))
    expect(a).not.toEqual(b)
  })

  it('streut ungefähr nach den Verhältnissen (1000 Gruppen)', () => {
    const counts = { dev: 0, cal: 0, holdout: 0 }
    for (let i = 0; i < 1000; i++) counts[assignSubset('seed-verteilung', `g-${i}`)]++
    expect(counts.dev / 1000).toBeGreaterThan(0.53)
    expect(counts.dev / 1000).toBeLessThan(0.67)
    expect(counts.cal / 1000).toBeGreaterThan(0.14)
    expect(counts.holdout / 1000).toBeGreaterThan(0.14)
  })
})

describe('splitByGroup', () => {
  it('hält jede Gruppe in genau einer Teilmenge', () => {
    const records = dataset(600, 80)
    const { assignment, manifest } = splitByGroup(records, 'seed-x')
    const perGroup = new Map<string, Set<string>>()
    for (const r of records) {
      const set = perGroup.get(r.group) || new Set<string>()
      set.add(assignment.get(r.id) as string)
      perGroup.set(r.group, set)
    }
    for (const [group, subsets] of perGroup) {
      expect(subsets.size, `Gruppe ${group} überbrückt Teilmengen`).toBe(1)
    }
    expect(manifest.groups).toBe(80)
    expect(manifest.cases).toBe(600)
    expect(manifest.counts.dev.cases + manifest.counts.cal.cases + manifest.counts.holdout.cases).toBe(600)
  })

  it('ist reproduzierbar: gleiche Eingabe, gleiche Prüfsumme', () => {
    const records = dataset(120, 30)
    const a = splitByGroup(records, 'seed-y')
    const b = splitByGroup([...records].reverse(), 'seed-y')
    expect(b.manifest.checksum).toBe(a.manifest.checksum)
  })

  it('eine geänderte Gruppenzuordnung ändert die Prüfsumme', () => {
    const a = splitByGroup(dataset(120, 30), 'seed-y')
    const b = splitByGroup(dataset(120, 31), 'seed-y')
    expect(b.manifest.checksum).not.toBe(a.manifest.checksum)
  })

  it('verweigert fehlenden Seed und ungültige Verhältnisse', () => {
    expect(() => splitByGroup(dataset(10, 5), '')).toThrow(/Seed/)
    expect(() => splitByGroup(dataset(10, 5), 'seed', { dev: 0.6, cal: 0.6, holdout: 0.2 })).toThrow(/Verhältnis/)
    expect(() => splitByGroup(dataset(10, 5), 'seed', { dev: 1, cal: 0, holdout: 0 })).toThrow(/Verhältnis/)
  })

  it('verweigert Fälle ohne Gruppenschlüssel', () => {
    expect(() => splitByGroup([{ id: 'a', group: '' }], 'seed')).toThrow(/Gruppenschlüssel/)
  })

  it('leerer Datensatz ergibt ein leeres, aber gültiges Manifest', () => {
    const { manifest } = splitByGroup([], 'seed')
    expect(manifest.cases).toBe(0)
    expect(manifest.groups).toBe(0)
    expect(manifest.ratios).toEqual(DEFAULT_SPLIT_RATIOS)
  })
})

describe('isValidRatios', () => {
  it('prüft Summe und Positivität', () => {
    expect(isValidRatios({ dev: 0.6, cal: 0.2, holdout: 0.2 })).toBe(true)
    expect(isValidRatios({ dev: 0.5, cal: 0.2, holdout: 0.2 })).toBe(false)
    expect(isValidRatios({ dev: 0.6, cal: 0, holdout: 0.4 })).toBe(false)
    expect(isValidRatios({ dev: Number.NaN, cal: 0.2, holdout: 0.2 })).toBe(false)
  })
})

describe('normalizeSubjectKey / deriveGroupKey', () => {
  it('zieht Antwort- und Weiterleitungspräfixe ab', () => {
    expect(normalizeSubjectKey('Re: AW: Unterlagen')).toBe('unterlagen')
    expect(normalizeSubjectKey('WG: Fwd: Rückfrage')).toBe('rückfrage')
    expect(normalizeSubjectKey('Re[2]: Bericht')).toBe('bericht')
  })

  it('führt fortlaufende Newsletter-Ausgaben zusammen', () => {
    expect(normalizeSubjectKey('Newsletter KW 38')).toBe(normalizeSubjectKey('Newsletter KW 39'))
  })

  it('Threadwurzel schlägt Betreff', () => {
    const a = deriveGroupKey({ threadRoot: '<root@example.org>', subject: 'Etwas', from: { address: 'a@x.example' } })
    const b = deriveGroupKey({ threadRoot: '<root@example.org>', subject: 'Ganz anders', from: { address: 'b@y.example' } })
    expect(a).toBe(b)
  })

  it('ohne Thread trennt die Absenderdomain', () => {
    const a = deriveGroupKey({ subject: 'Newsletter', from: { address: 'x@a.example' } })
    const b = deriveGroupKey({ subject: 'Newsletter', from: { address: 'x@b.example' } })
    expect(a).not.toBe(b)
  })

  it('fällt bei fehlenden Angaben auf feste Platzhalter zurück', () => {
    expect(deriveGroupKey({})).toBe('tpl:unknown:no-subject')
  })
})

describe('temporalSubset', () => {
  it('nimmt nur Fälle ab dem Stichtag', () => {
    const records = [
      { id: 'alt', receivedAt: '2026-01-05T10:00:00Z' },
      { id: 'genau', receivedAt: '2026-06-01T00:00:00Z' },
      { id: 'neu', receivedAt: '2026-08-20T08:00:00Z' },
      { id: 'kaputt', receivedAt: 'irgendwann' },
    ]
    expect(temporalSubset(records, '2026-06-01T00:00:00Z')).toEqual(['genau', 'neu'])
  })

  it('verweigert einen ungültigen Stichtag', () => {
    expect(() => temporalSubset([], 'morgen')).toThrow(/Stichtag/)
  })
})
