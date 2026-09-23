// Die Fixtures sind Daten, und Daten verrotten still: ein umbenanntes Label oder eine
// verschobene Schemaversion fällt sonst erst auf, wenn jemand die Auswertung braucht.
// Dieser Test liest die eingecheckten Dateien mit demselben Parser wie die CLI.
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseLabelJsonl } from '../src/shared/decision/labels'
import { deriveDecisionSignals } from '../src/shared/decision/signals'
import { evaluateRuleBaseline } from '../src/shared/decision/emailPolicy'
import { emptyRelevanceConfig } from '../src/shared/emailRelevance'
import { splitByGroup } from '../src/shared/decision/split'

const here = path.dirname(new URL(import.meta.url).pathname)
const read = (name: string): string => fs.readFileSync(path.join(here, name), 'utf-8')

describe('synthetische Fixtures', () => {
  const base = parseLabelJsonl(read('email-decision-fixtures.jsonl'))
  const withNli = parseLabelJsonl(read('email-decision-fixtures-synthetic-nli.jsonl'))

  it('sind fehlerfrei nach dem geltenden Schema', () => {
    expect(base.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(withNli.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(base.records.length).toBeGreaterThan(15)
    expect(withNli.records.length).toBe(base.records.length)
  })

  it('sind ausnahmslos als synthetisch gekennzeichnet — hier landen nie echte Mails', () => {
    for (const r of [...base.records, ...withNli.records]) expect(r.source).toBe('synthetic')
    const text = read('email-decision-fixtures.jsonl') + read('email-decision-fixtures-synthetic-nli.jsonl')
    // Erfundene Domains: .example ist für genau diesen Zweck reserviert (RFC 2606).
    for (const m of text.matchAll(/"address":\s*"([^"]+)"/g)) {
      expect(m[1].endsWith('.example'), `Adresse ${m[1]}`).toBe(true)
    }
    expect(text).not.toContain('SYNTHETIC-not-a-real-model'.replace('SYNTHETIC', 'ECHT'))
  })

  it('decken die im Plan genannten Schwerfälle ab', () => {
    const ids = base.records.map((r) => r.id).join(' ')
    for (const marker of [
      'behoerde', 'rechnung', 'mahnung', 'newsletter', 'formularanfrage', 'buchungsbestaetigung',
      'terminabsage', 'ics', 'weiterleitung', 'injection', 'konferenz-en', 'ohne-body', 'franzoesisch',
    ]) {
      expect(ids, `Schwerfall fehlt: ${marker}`).toContain(marker)
    }
  })

  it('enthalten eine Thread-Gruppe über mehrere Mails — sonst prüft der Split nichts', () => {
    const counts = new Map<string, number>()
    for (const r of base.records) counts.set(r.group, (counts.get(r.group) || 0) + 1)
    expect([...counts.values()].some((c) => c > 1)).toBe(true)
  })

  it('laufen ohne Modell durch den Regelarm — und nichts davon wird übersprungen', () => {
    const cfg = emptyRelevanceConfig()
    for (const r of base.records) {
      const signals = deriveDecisionSignals(r.content!, cfg, { softCriteriaPresent: false, language: r.language })
      const decision = evaluateRuleBaseline(signals)
      expect(decision.route, `${r.id} ohne Modell übersprungen`).not.toBe('skip')
    }
  })

  it('lassen sich gruppiert splitten, ohne dass eine Gruppe Teilmengen überbrückt', () => {
    const { assignment } = splitByGroup(base.records.map((r) => ({ id: r.id, group: r.group })), 'email-decision-pilot@1')
    const perGroup = new Map<string, Set<string>>()
    for (const r of base.records) {
      const set = perGroup.get(r.group) || new Set<string>()
      set.add(assignment.get(r.id) as string)
      perGroup.set(r.group, set)
    }
    for (const [, subsets] of perGroup) expect(subsets.size).toBe(1)
  })

  it('kennzeichnen die erfundenen NLI-Werte als solche', () => {
    for (const r of withNli.records) {
      expect(r.decision).toBeDefined()
      expect(r.decision!.artifacts.modelId).toBe('SYNTHETIC-not-a-real-model')
      expect(r.decision!.artifacts.calibration).toBe(null)
    }
  })

  it('enthalten mindestens eine Abstention und einen abgeschnittenen Fall', () => {
    expect(withNli.records.some((r) => r.decision?.status === 'abstain')).toBe(true)
    expect(withNli.records.some((r) => r.decision?.status === 'ok' && !r.decision.coverage.complete)).toBe(true)
  })
})
