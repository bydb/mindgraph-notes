import { describe, it, expect } from 'vitest'
import {
  abortCase, addSession, closeCase, correctSession, createCampaign, createCase,
  endCampaign, markNotMeasurable, setAccepted, startWork
} from './model'
import type { ComparisonCase, WorkSession } from './types'

const T0 = new Date('2026-08-26T09:00:00').getTime()
const zufall = (): number => 0.1   // zieht bei Gleichstand 'mindgraph'

function kampagne() {
  return createCampaign({
    id: 'k1',
    taskClass: 'Angebotsauswertung',
    inclusionRules: 'Mindestens drei Angebote, ein Beschaffungsvorgang',
    acceptanceDefinition: 'Alle Angebote erfasst, Preise korrekt, Empfehlung begründet',
    startedAt: T0
  })
}

function fall(existing: ComparisonCase[] = []): ComparisonCase {
  return createCase({ id: `f${existing.length + 1}`, campaign: kampagne(), label: 'Angebot A', existingCases: existing, random: zufall, createdAt: T0 })
}

const sitzung = (over: Partial<WorkSession> = {}): WorkSession =>
  ({ kind: 'auftrag', from: T0, to: T0 + 60_000, origin: 'vordergrund-automatisch', ...over })

describe('createCampaign', () => {
  it('verlangt eine Akzeptanzdefinition — ohne sie bewertet man die eigene Erwartung', () => {
    expect(() => createCampaign({
      id: 'k', taskClass: 'X', inclusionRules: '', acceptanceDefinition: '   ', startedAt: T0
    })).toThrow(/Akzeptanzdefinition/)
  })

  it('hält die Protokollversion fest', () => {
    expect(kampagne().protocolVersion).toBe(1)
  })
})

describe('createCase', () => {
  it('zieht den Weg beim Anlegen, zusammen mit dem Ungleichstand', () => {
    const c = fall()
    expect(c.arm).toBe('mindgraph')
    expect(c.imbalanceAtDraw).toBe(0)
    expect(c.state).toBe('offen')
  })

  it('zählt nur Fälle DIESER Kampagne für den Ausgleich', () => {
    const fremd: ComparisonCase = { ...fall(), campaignId: 'andere', arm: 'mindgraph' }
    const c = createCase({ id: 'f2', campaign: kampagne(), label: 'B', existingCases: [fremd], random: zufall, createdAt: T0 })
    expect(c.imbalanceAtDraw).toBe(0)
  })

  it('nimmt keine Fälle mehr an, wenn die Kampagne beendet ist', () => {
    const beendet = endCampaign(kampagne(), T0 + 1000)
    expect(() => createCase({ id: 'f2', campaign: beendet, label: 'B', existingCases: [], random: zufall, createdAt: T0 }))
      .toThrow(/beendet/)
  })
})

describe('Endzustände sind endgültig', () => {
  it('lässt einen abgeschlossenen Fall nicht wieder öffnen oder ändern', () => {
    const c = closeCase(addSession(fall(), sitzung()), { quality: 3, at: T0 + 10_000 })
    expect(() => addSession(c, sitzung())).toThrow(/endgültig/)
    expect(() => abortCase(c, { reason: 'doch nicht', at: T0 })).toThrow(/endgültig/)
    expect(() => setAccepted(c, false)).toThrow(/endgültig/)
  })

  it('lässt einen abgebrochenen Fall nicht nachträglich abschließen', () => {
    const c = abortCase(fall(), { reason: 'Vorgang storniert', at: T0 + 5000 })
    expect(() => closeCase(c, { quality: 4, at: T0 + 9000 })).toThrow(/endgültig/)
  })

  it('verlangt für Abbruch und „nicht messbar" einen Grund', () => {
    expect(() => abortCase(fall(), { reason: ' ', at: T0 })).toThrow(/Grund/)
    expect(() => markNotMeasurable(fall(), { reason: '', at: T0 })).toThrow(/Grund/)
  })
})

describe('Zuteilung bleibt unantastbar', () => {
  it('ändert den Weg bei keiner Zustandsänderung', () => {
    const start = fall()
    const nachher = closeCase(addSession(startWork(start, T0 + 1000), sitzung()), { quality: 2, at: T0 + 20_000 })
    expect(nachher.arm).toBe(start.arm)
    expect(nachher.imbalanceAtDraw).toBe(start.imbalanceAtDraw)
    expect(nachher.campaignId).toBe(start.campaignId)
  })

  it('verändert die Eingabe nicht (die Zuteilung darf nirgends überschrieben werden)', () => {
    const start = fall()
    addSession(start, sitzung())
    abortCase(start, { reason: 'x', at: T0 })
    expect(start.sessions).toHaveLength(0)
    expect(start.state).toBe('offen')
  })
})

describe('Korrektur', () => {
  it('behält Originalwert und Grund', () => {
    const c = addSession(fall(), sitzung({ from: T0, to: T0 + 600_000 }))
    const k = correctSession(c, 0, { from: T0, to: T0 + 300_000, reason: 'Telefonat dazwischen' })
    expect(k.sessions[0].origin).toBe('korrigiert')
    expect(k.sessions[0].originalMs).toBe(600_000)
    expect(k.sessions[0].correctionReason).toBe('Telefonat dazwischen')
  })

  it('verlangt einen Grund — eine Korrektur ohne Spur wäre eine Erfindung', () => {
    const c = addSession(fall(), sitzung())
    expect(() => correctSession(c, 0, { from: T0, to: T0 + 1000, reason: '  ' })).toThrow(/Grund/)
  })
})

describe('Abschluss', () => {
  it('lehnt einen Abschluss ohne jede Arbeitssitzung ab', () => {
    // Ein Fall ohne gemessene Arbeit ist nicht „abgeschlossen", sondern nicht messbar.
    expect(() => closeCase(fall(), { quality: 4, at: T0 })).toThrow(/nicht messbar/)
  })

  it('erlaubt die Übernahmequote nur im MindGraph-Arm', () => {
    const konv: ComparisonCase = { ...fall(), arm: 'konventionell' }
    expect(() => setAccepted(konv, true)).toThrow(/MindGraph-Arm/)
  })
})
