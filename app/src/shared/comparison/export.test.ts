import { describe, it, expect } from 'vitest'
import { toCsv, toMarkdown, type ExportLabels } from './export'
import type { Campaign, ComparisonCase } from './types'

const T0 = new Date('2026-08-20T09:00:00').getTime()
const min = (n: number): number => n * 60_000

const labels: ExportLabels = {
  arm: { konventionell: 'konventionell', mindgraph: 'mit MindGraph' },
  state: { offen: 'offen', abgeschlossen: 'abgeschlossen', abgebrochen: 'abgebrochen', 'nicht-messbar': 'nicht messbar' },
  quality: { 1: 'unbrauchbar', 2: 'wesentliche Mängel', 3: 'kleinere Mängel', 4: 'vollständig brauchbar' },
  origin: { 'vordergrund-automatisch': 'gemessen', gestoppt: 'gestoppt', nachgetragen: 'nachgetragen', korrigiert: 'korrigiert' }
}

const campaign: Campaign = {
  id: 'k1', taskClass: 'Angebotsauswertung', inclusionRules: 'Mindestens drei Angebote',
  acceptanceDefinition: 'Alle Angebote erfasst', randomization: { method: 'efron-biased-coin', bias: 2 / 3 },
  protocolVersion: 1, startedAt: T0
}

function fall(over: Partial<ComparisonCase>): ComparisonCase {
  return {
    id: 'f', campaignId: 'k1', label: 'Angebot Müller', arm: 'mindgraph', imbalanceAtDraw: 0,
    state: 'abgeschlossen', createdAt: T0, closedAt: T0 + min(60), quality: 3,
    sessions: [{ kind: 'auftrag', from: T0, to: T0 + min(10), origin: 'vordergrund-automatisch' }],
    ...over
  }
}

const dreiJeWeg = [
  fall({ id: 'm1' }), fall({ id: 'm2' }), fall({ id: 'm3' }),
  fall({ id: 'k1c', arm: 'konventionell', sessions: [{ kind: 'nacharbeit', from: T0, to: T0 + min(40), origin: 'gestoppt' }] }),
  fall({ id: 'k2c', arm: 'konventionell', sessions: [{ kind: 'nacharbeit', from: T0, to: T0 + min(45), origin: 'gestoppt' }] }),
  fall({ id: 'k3c', arm: 'konventionell', sessions: [{ kind: 'nacharbeit', from: T0, to: T0 + min(38), origin: 'nachgetragen' }] })
]

describe('toMarkdown', () => {
  it('nennt keine Kurzbezeichnung des Nutzers', () => {
    // „Angebot Müller" ist Inhalt und bleibt lokal — im Bericht heißt der Fall „Fall 1".
    const md = toMarkdown(campaign, dreiJeWeg, labels, T0)
    expect(md).not.toContain('Müller')
    expect(md).toContain('Fall 1')
  })

  it('weist die Herkunft jedes Falls aus', () => {
    const md = toMarkdown(campaign, dreiJeWeg, labels, T0)
    expect(md).toContain('gestoppt')
    expect(md).toContain('nachgetragen')
    expect(md).toContain('gemessen')
  })

  it('nennt die Grenzen — sie sind Teil des Berichts, keine Fußnote', () => {
    const md = toMarkdown(campaign, dreiJeWeg, labels, T0)
    expect(md).toContain('nicht verblindet')
    expect(md).toContain('nach Zuteilung')
    expect(md).toMatch(/Signifikanztests/)
  })

  it('zeigt statt einer Kennzahl den Hinweis, wenn zu wenige Fälle abgeschlossen sind', () => {
    const md = toMarkdown(campaign, [fall({ id: 'm1' }), fall({ id: 'k1c', arm: 'konventionell' })], labels, T0)
    expect(md).toContain('Noch keine belastbare Kennzahl')
    expect(md).toContain('es fehlen 4')
  })

  it('führt abgebrochene Fälle mit, statt sie zu verschweigen', () => {
    const mitAbbruch = [...dreiJeWeg, fall({ id: 'x', state: 'abgebrochen', stateReason: 'Vorgang storniert' })]
    const md = toMarkdown(campaign, mitAbbruch, labels, T0)
    expect(md).toContain('Vorgang storniert')
    expect(md).toMatch(/Zugeteilt: 4/)
  })

  it('nennt das Zuteilungsverfahren, damit die Anlage prüfbar ist', () => {
    expect(toMarkdown(campaign, dreiJeWeg, labels, T0)).toContain('efron-biased-coin')
  })
})

describe('toCsv', () => {
  it('schreibt eine Kopfzeile und je Fall eine Zeile', () => {
    const csv = toCsv(campaign, dreiJeWeg, labels).split('\n')
    expect(csv[0]).toContain('Grundlage')
    expect(csv).toHaveLength(7)
  })

  it('maskiert Semikolon und Anführungszeichen im Grund', () => {
    const csv = toCsv(campaign, [fall({ id: 'x', state: 'abgebrochen', stateReason: 'storniert; "kurzfristig"' })], labels)
    expect(csv).toContain('"storniert; ""kurzfristig"""')
  })

  it('nennt auch hier keine Kurzbezeichnung', () => {
    expect(toCsv(campaign, dreiJeWeg, labels)).not.toContain('Müller')
  })
})
