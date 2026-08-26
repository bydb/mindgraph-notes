// Lebenszyklus von Kampagne und Fall (docs/comparison-mode-plan.md, Abschnitte 1–3).
//
// Alles rein: Jede Funktion gibt ein neues Objekt zurück und ändert nichts an ihrer
// Eingabe. Der Grund ist nicht Stilgeschmack — die Zuteilung darf sich nachträglich
// nicht ändern lassen, und das ist am leichtesten zu garantieren, wenn nichts an Ort
// und Stelle beschrieben wird.

import {
  CURRENT_PROTOCOL_VERSION,
  type Campaign,
  type CaseState,
  type ComparisonCase,
  type Quality,
  type Randomization,
  type WorkSession
} from './types'
import { defaultRandomization, drawArm, type RandomSource } from './randomization'

export function createCampaign(params: {
  id: string
  taskClass: string
  inclusionRules: string
  acceptanceDefinition: string
  startedAt: number
  randomization?: Randomization
}): Campaign {
  if (!params.taskClass.trim()) throw new Error('Eine Kampagne braucht eine Aufgabenklasse.')
  // Ohne vorab festgelegten Maßstab bewertet man am Ende die eigene Erwartung.
  if (!params.acceptanceDefinition.trim()) throw new Error('Eine Kampagne braucht eine Akzeptanzdefinition.')
  return {
    id: params.id,
    taskClass: params.taskClass.trim(),
    inclusionRules: params.inclusionRules.trim(),
    acceptanceDefinition: params.acceptanceDefinition.trim(),
    randomization: params.randomization ?? defaultRandomization(),
    protocolVersion: CURRENT_PROTOCOL_VERSION,
    startedAt: params.startedAt
  }
}

/**
 * Legt einen Fall an UND zieht in einem Schritt seinen Weg.
 *
 * Beides zusammen, weil dazwischen keine Lücke entstehen darf: Ein Fall ohne Zuteilung
 * wäre eine Gelegenheit, ihn nach dem Blick auf den Weg wieder zu verwerfen.
 */
export function createCase(params: {
  id: string
  campaign: Campaign
  label: string
  existingCases: readonly ComparisonCase[]
  random: RandomSource
  createdAt: number
}): ComparisonCase {
  if (params.campaign.endedAt !== undefined) throw new Error('Die Kampagne ist beendet — keine neuen Fälle.')
  const zurKampagne = params.existingCases.filter(c => c.campaignId === params.campaign.id)
  const draw = drawArm(zurKampagne.map(c => c.arm), params.random, params.campaign.randomization.bias)
  return {
    id: params.id,
    campaignId: params.campaign.id,
    label: params.label.trim(),
    arm: draw.arm,
    imbalanceAtDraw: draw.imbalance,
    state: 'offen',
    createdAt: params.createdAt,
    sessions: []
  }
}

const TERMINAL: CaseState[] = ['abgeschlossen', 'abgebrochen', 'nicht-messbar']

function assertOffen(c: ComparisonCase): void {
  if (TERMINAL.includes(c.state)) {
    throw new Error(`Fall ${c.id} ist bereits ${c.state} — Endzustände sind endgültig.`)
  }
}

export function startWork(c: ComparisonCase, at: number): ComparisonCase {
  assertOffen(c)
  return c.startedAt === undefined ? { ...c, startedAt: at } : c
}

export function markResultReady(c: ComparisonCase, at: number): ComparisonCase {
  assertOffen(c)
  return c.resultReadyAt === undefined ? { ...c, resultReadyAt: at } : c
}

export function addSession(c: ComparisonCase, session: WorkSession): ComparisonCase {
  assertOffen(c)
  if (session.to < session.from) throw new Error('Eine Arbeitssitzung kann nicht rückwärts laufen.')
  return { ...c, sessions: [...c.sessions, session] }
}

/**
 * Korrigiert eine Sitzung. Der Originalwert und der Grund bleiben erhalten — eine
 * Korrektur ohne Spur wäre von einer Erfindung nicht zu unterscheiden.
 */
export function correctSession(
  c: ComparisonCase,
  index: number,
  neu: { from: number; to: number; reason: string }
): ComparisonCase {
  assertOffen(c)
  const alt = c.sessions[index]
  if (!alt) throw new Error(`Sitzung ${index} gibt es nicht.`)
  if (!neu.reason.trim()) throw new Error('Eine Korrektur braucht einen Grund.')
  if (neu.to < neu.from) throw new Error('Eine Arbeitssitzung kann nicht rückwärts laufen.')
  const korrigiert: WorkSession = {
    ...alt,
    from: neu.from,
    to: neu.to,
    origin: 'korrigiert',
    originalMs: alt.originalMs ?? Math.max(0, alt.to - alt.from),
    correctionReason: neu.reason.trim()
  }
  return { ...c, sessions: c.sessions.map((s, i) => (i === index ? korrigiert : s)) }
}

/** Übernahme oder Verwerfen des MindGraph-Ergebnisses — eine Prozessgröße, keine Qualität. */
export function setAccepted(c: ComparisonCase, accepted: boolean): ComparisonCase {
  assertOffen(c)
  if (c.arm !== 'mindgraph') throw new Error('Eine Übernahmequote gibt es nur im MindGraph-Arm.')
  return { ...c, accepted }
}

export function closeCase(c: ComparisonCase, params: { quality: Quality; at: number }): ComparisonCase {
  assertOffen(c)
  if (c.sessions.length === 0) {
    throw new Error('Ein Fall ohne Arbeitssitzung ist nicht abgeschlossen, sondern nicht messbar.')
  }
  return { ...c, state: 'abgeschlossen', quality: params.quality, closedAt: params.at }
}

export function abortCase(c: ComparisonCase, params: { reason: string; at: number }): ComparisonCase {
  assertOffen(c)
  if (!params.reason.trim()) throw new Error('Ein Abbruch braucht einen Grund.')
  return { ...c, state: 'abgebrochen', stateReason: params.reason.trim(), closedAt: params.at }
}

export function markNotMeasurable(c: ComparisonCase, params: { reason: string; at: number }): ComparisonCase {
  assertOffen(c)
  if (!params.reason.trim()) throw new Error('„Nicht messbar" braucht einen Grund.')
  return { ...c, state: 'nicht-messbar', stateReason: params.reason.trim(), closedAt: params.at }
}

export function endCampaign(campaign: Campaign, at: number): Campaign {
  return campaign.endedAt === undefined ? { ...campaign, endedAt: at } : campaign
}
