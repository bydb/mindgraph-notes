// E-Mail-Decision-Pilot — gruppierter Split (docs/codex-collab/email-decision-pilot.md §3).
//
// Der Split wird EINMAL eingefroren, bevor Hypothesen oder Schwellen angefasst werden.
// Entscheidend ist nicht das Verhältnis, sondern die Gruppengrenze: derselbe Thread und
// dieselbe Newsletter-Vorlage dürfen nicht in Entwicklung UND Holdout liegen. Sonst misst
// der Holdout, wie gut eine bereits gesehene Vorlage wiedererkannt wird.
//
// Die Zuordnung ist deterministisch aus (Seed, Gruppenschlüssel) gehasht — kein Zufall,
// kein Zustand, kein Mischen. Damit ist der Split aus dem Manifest reproduzierbar und
// eine stillschweigende Neuziehung nach einem enttäuschenden Ergebnis fällt auf.

export type Subset = 'dev' | 'cal' | 'holdout'

export const SUBSETS: readonly Subset[] = ['dev', 'cal', 'holdout']

export interface SplitRatios {
  dev: number
  cal: number
  holdout: number
}

export const DEFAULT_SPLIT_RATIOS: SplitRatios = { dev: 0.6, cal: 0.2, holdout: 0.2 }

export interface SplitInputRecord {
  id: string
  group: string
}

export interface SubsetCounts {
  cases: number
  groups: number
}

export interface SplitManifest {
  seed: string
  ratios: SplitRatios
  cases: number
  groups: number
  counts: Record<Subset, SubsetCounts>
  /** Prüfsumme über alle (Gruppe → Teilmenge). Ändert sich die Zuordnung, fällt es auf. */
  checksum: string
}

export interface SplitResult {
  /** Fall-ID → Teilmenge. */
  assignment: Map<string, Subset>
  /** Gruppenschlüssel → Teilmenge. */
  groupAssignment: Map<string, Subset>
  manifest: SplitManifest
}

// ── Hash ─────────────────────────────────────────────────────────────────────
//
// Eigene FNV-1a-Variante statt `stableJobId` aus shared/activityLog.ts: der Split ist ein
// eingefrorenes Messartefakt. Änderte jene Funktion (anderer Zweck, andere Datei) je ihr
// Format, verschöbe sich rückwirkend jeder Holdout. Die Kopie ist hier die billigere Zusage.

function fnv1a(text: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** Stabiler Wert in [0,1) für (Seed, Gruppe). 53 Bit aus zwei FNV-Durchläufen. */
export function groupFraction(seed: string, group: string): number {
  const text = seed + '\u0000' + group
  const h1 = fnv1a(text, 2166136261)
  const h2 = fnv1a(text, 0x9e3779b9)
  // h1 liefert die oberen 32 Bit, h2 die unteren 21 — zusammen 53 Bit, exakt in double.
  const value = h1 * 2097152 + (h2 >>> 11)
  return value / 9007199254740992
}

function checksumOf(groupAssignment: Map<string, Subset>): string {
  const parts = [...groupAssignment.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const text = parts.map(([g, s]) => g + '=' + s).join('\n')
  return fnv1a(text, 2166136261).toString(16).padStart(8, '0') + fnv1a(text, 0x9e3779b9).toString(16).padStart(8, '0')
}

// ── Split ────────────────────────────────────────────────────────────────────

export function isValidRatios(r: SplitRatios): boolean {
  const vals = [r.dev, r.cal, r.holdout]
  if (!vals.every((v) => Number.isFinite(v) && v > 0 && v < 1)) return false
  return Math.abs(vals.reduce((a, b) => a + b, 0) - 1) < 1e-9
}

export function assignSubset(seed: string, group: string, ratios: SplitRatios = DEFAULT_SPLIT_RATIOS): Subset {
  const f = groupFraction(seed, group)
  if (f < ratios.dev) return 'dev'
  if (f < ratios.dev + ratios.cal) return 'cal'
  return 'holdout'
}

export function splitByGroup(
  records: readonly SplitInputRecord[],
  seed: string,
  ratios: SplitRatios = DEFAULT_SPLIT_RATIOS,
): SplitResult {
  if (typeof seed !== 'string' || seed.trim() === '') {
    throw new Error('Split-Seed fehlt — ohne Seed ist der Split nicht reproduzierbar.')
  }
  if (!isValidRatios(ratios)) {
    throw new Error('Split-Verhältnis ungültig (alle Teile > 0, Summe 1).')
  }
  const groupAssignment = new Map<string, Subset>()
  const assignment = new Map<string, Subset>()
  const groupsPerSubset: Record<Subset, Set<string>> = { dev: new Set(), cal: new Set(), holdout: new Set() }
  const counts: Record<Subset, SubsetCounts> = {
    dev: { cases: 0, groups: 0 },
    cal: { cases: 0, groups: 0 },
    holdout: { cases: 0, groups: 0 },
  }

  for (const r of records) {
    if (!r.group || typeof r.group !== 'string') {
      throw new Error(`Fall ${r.id} hat keinen Gruppenschlüssel — die Gruppengrenze ist der Zweck des Splits.`)
    }
    let subset = groupAssignment.get(r.group)
    if (!subset) {
      subset = assignSubset(seed, r.group, ratios)
      groupAssignment.set(r.group, subset)
    }
    assignment.set(r.id, subset)
    groupsPerSubset[subset].add(r.group)
    counts[subset].cases++
  }
  for (const s of SUBSETS) counts[s].groups = groupsPerSubset[s].size

  return {
    assignment,
    groupAssignment,
    manifest: {
      seed,
      ratios,
      cases: records.length,
      groups: groupAssignment.size,
      counts,
      checksum: checksumOf(groupAssignment),
    },
  }
}

// ── Gruppenschlüssel ─────────────────────────────────────────────────────────

const SUBJECT_PREFIXES = /^\s*((re|aw|antw|fw|fwd|wg|weitergeleitet)\s*(\[\d+\])?\s*:\s*)+/i

/**
 * Normalisierter Betreff: Antwort-/Weiterleitungspräfixe weg, Ziffern zu `#`.
 * Damit fallen „Newsletter KW 38" und „Newsletter KW 39" in dieselbe Gruppe — genau das
 * ist gewollt, denn beide stammen aus derselben Vorlage.
 */
export function normalizeSubjectKey(subject: string): string {
  return (subject || '')
    .replace(SUBJECT_PREFIXES, '')
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/[^\p{L}\p{N}#]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

export interface GroupKeySource {
  /** Wurzel des Threads (erste Message-ID aus references/inReplyTo), falls bekannt. */
  threadRoot?: string | null
  subject?: string
  from?: { address?: string }
}

/**
 * Gruppenschlüssel für den Split. Threadwurzel schlägt Betreff; sonst Absenderdomain plus
 * normalisierter Betreff. Der Schlüssel darf inhaltsnah sein — er bleibt im lokalen
 * Datensatz; in den Messbericht geht nur seine Anzahl.
 */
export function deriveGroupKey(src: GroupKeySource): string {
  const root = (src.threadRoot || '').trim()
  if (root) return 'thread:' + root.toLowerCase()
  const domain = ((src.from?.address || '').toLowerCase().split('@')[1] || 'unknown').trim()
  const subject = normalizeSubjectKey(src.subject || '')
  return 'tpl:' + domain + ':' + (subject || 'no-subject')
}

// ── Zeitliche Trennung ───────────────────────────────────────────────────────

export interface TemporalRecord {
  id: string
  receivedAt: string
}

/**
 * Zeitlicher Nachtest: Fälle ab `cutoffISO` (einschließlich). Der gruppierte Split
 * beantwortet nicht, ob eine Regel auch auf SPÄTEREN Mails hält — Absender, Vorlagen und
 * eigene Kriterien ändern sich.
 */
export function temporalSubset(records: readonly TemporalRecord[], cutoffISO: string): string[] {
  const cutoff = Date.parse(cutoffISO)
  if (!Number.isFinite(cutoff)) throw new Error('Ungültiger Stichtag für den zeitlichen Nachtest.')
  return records
    .filter((r) => {
      const t = Date.parse(r.receivedAt)
      return Number.isFinite(t) && t >= cutoff
    })
    .map((r) => r.id)
}
