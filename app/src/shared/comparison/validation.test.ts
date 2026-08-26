import { describe, it, expect } from 'vitest'
import { isCampaign, isComparisonCase, isWorkSession } from './validation'

const T0 = new Date('2026-08-26T09:00:00').getTime()

const kampagne = {
  id: 'k1', taskClass: 'Angebotsauswertung', inclusionRules: '', acceptanceDefinition: 'vollständig',
  randomization: { method: 'efron-biased-coin', bias: 2 / 3 }, protocolVersion: 1, startedAt: T0
}
const fall = {
  id: 'f1', campaignId: 'k1', label: 'A', arm: 'mindgraph', imbalanceAtDraw: 0,
  state: 'offen', createdAt: T0, sessions: []
}

describe('isCampaign', () => {
  it('verlangt Aufgabenklasse und Akzeptanzdefinition', () => {
    expect(isCampaign(kampagne)).toBe(true)
    expect(isCampaign({ ...kampagne, acceptanceDefinition: '' })).toBe(false)
    expect(isCampaign({ ...kampagne, taskClass: '' })).toBe(false)
  })

  it('weist eine Zuteilungswahrscheinlichkeit von 1 ab', () => {
    expect(isCampaign({ ...kampagne, randomization: { method: 'efron-biased-coin', bias: 1 } })).toBe(false)
  })
})

describe('isComparisonCase', () => {
  it('weist einen Fall ohne gültigen Weg ab', () => {
    // Sonst ließe sich ein Fall nachträglich zuteilen — genau das darf nie möglich sein.
    expect(isComparisonCase({ ...fall, arm: undefined })).toBe(false)
    expect(isComparisonCase({ ...fall, arm: 'egal' })).toBe(false)
    expect(isComparisonCase(fall)).toBe(true)
  })

  it('verlangt bei Abbruch und „nicht messbar" einen Grund', () => {
    expect(isComparisonCase({ ...fall, state: 'abgebrochen' })).toBe(false)
    expect(isComparisonCase({ ...fall, state: 'abgebrochen', stateReason: 'storniert' })).toBe(true)
    expect(isComparisonCase({ ...fall, state: 'nicht-messbar' })).toBe(false)
  })

  it('lässt nur die vier Qualitätsstufen zu', () => {
    expect(isComparisonCase({ ...fall, quality: 4 })).toBe(true)
    expect(isComparisonCase({ ...fall, quality: 5 })).toBe(false)
  })
})

describe('isWorkSession', () => {
  const s = { kind: 'auftrag', from: T0, to: T0 + 1000, origin: 'gestoppt' }

  it('nimmt eine einfache Sitzung an', () => {
    expect(isWorkSession(s)).toBe(true)
  })

  it('verlangt bei einer Korrektur Originalwert UND Grund', () => {
    expect(isWorkSession({ ...s, origin: 'korrigiert' })).toBe(false)
    expect(isWorkSession({ ...s, origin: 'korrigiert', originalMs: 5000 })).toBe(false)
    expect(isWorkSession({ ...s, origin: 'korrigiert', originalMs: 5000, correctionReason: 'Telefonat' })).toBe(true)
  })

  it('weist unbekannte Arten und Herkünfte ab', () => {
    expect(isWorkSession({ ...s, kind: 'kaffee' })).toBe(false)
    expect(isWorkSession({ ...s, origin: 'geschätzt' })).toBe(false)
  })
})
