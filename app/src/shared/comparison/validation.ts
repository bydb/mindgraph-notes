// Prüfung der gespeicherten Kampagnen und Fälle.
//
// Gleiche Begründung wie beim Tätigkeitsprotokoll: Eine halb geschriebene oder von Hand
// veränderte Datei darf nur die kaputten Einträge verlieren, nicht die ganze Kampagne.
// Hier wiegt das schwerer — ein durchgerutschter Fall ohne Weg würde die Zuteilung
// verfälschen, und genau die lässt sich nachträglich nicht mehr reparieren.

import {
  QUALITY_LEVELS,
  type Campaign,
  type ComparisonCase,
  type WorkSession
} from './types'

const ARMS = ['konventionell', 'mindgraph']
const STATES = ['offen', 'abgeschlossen', 'abgebrochen', 'nicht-messbar']
const KINDS = ['auftrag', 'vordergrund', 'pruefung', 'nacharbeit', 'rueckfallarbeit']
const ORIGINS = ['vordergrund-automatisch', 'gestoppt', 'nachgetragen', 'korrigiert']

const istZeit = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0
const istText = (v: unknown): boolean => typeof v === 'string' && v.length > 0

export function isWorkSession(value: unknown): value is WorkSession {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  if (!KINDS.includes(s.kind as string) || !ORIGINS.includes(s.origin as string)) return false
  if (!istZeit(s.from) || !istZeit(s.to)) return false
  if (s.originalMs !== undefined && !istZeit(s.originalMs)) return false
  if (s.correctionReason !== undefined && typeof s.correctionReason !== 'string') return false
  // Eine korrigierte Sitzung ohne Spur wäre von einer Erfindung nicht zu unterscheiden.
  if (s.origin === 'korrigiert' && (!istZeit(s.originalMs) || !istText(s.correctionReason))) return false
  return true
}

export function isCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  if (!istText(c.id) || !istText(c.taskClass) || !istText(c.acceptanceDefinition)) return false
  if (typeof c.inclusionRules !== 'string') return false
  if (!istZeit(c.startedAt)) return false
  if (c.endedAt !== undefined && !istZeit(c.endedAt)) return false
  if (typeof c.protocolVersion !== 'number') return false
  const r = c.randomization as Record<string, unknown> | undefined
  if (!r || r.method !== 'efron-biased-coin') return false
  return typeof r.bias === 'number' && r.bias >= 0.5 && r.bias < 1
}

export function isComparisonCase(value: unknown): value is ComparisonCase {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  if (!istText(c.id) || !istText(c.campaignId) || typeof c.label !== 'string') return false
  // Ein Fall ohne gültigen Weg ist unbrauchbar: Er ließe sich nachträglich zuteilen.
  if (!ARMS.includes(c.arm as string)) return false
  if (typeof c.imbalanceAtDraw !== 'number' || !Number.isFinite(c.imbalanceAtDraw)) return false
  if (!STATES.includes(c.state as string)) return false
  if (!istZeit(c.createdAt)) return false
  for (const feld of ['startedAt', 'resultReadyAt', 'closedAt']) {
    if (c[feld] !== undefined && !istZeit(c[feld])) return false
  }
  if (!Array.isArray(c.sessions) || !c.sessions.every(isWorkSession)) return false
  if (c.accepted !== undefined && typeof c.accepted !== 'boolean') return false
  if (c.quality !== undefined && !QUALITY_LEVELS.includes(c.quality as never)) return false
  // Endzustände ohne Grund sind später nicht mehr erklärbar.
  if ((c.state === 'abgebrochen' || c.state === 'nicht-messbar') && !istText(c.stateReason)) return false
  return true
}
