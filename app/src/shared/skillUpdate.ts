// Skill-Updater: pure Bausteine (Main + Renderer + Tests).
//
// Problem (24.11.2026): Die App überschreibt einen vorhandenen Skill-Ordner nie. Wer einen
// mitgelieferten Skill einmal installiert hat, behält diese Fassung für immer — auch wenn ein
// Release ihn verbessert. Sichtbar war das nirgends.
//
// Lösung: Die App liefert je mitgeliefertem Skill die Prüfsummen ALLER je ausgelieferten
// Fassungen mit (`resources/starter-skills/skill-versions.json`, erzeugt von
// `scripts/skill-versions.mjs` aus der Git-Historie). Damit lässt sich unterscheiden:
//   - `current`  — entspricht der Fassung dieser App
//   - `outdated` — entspricht einer FRÜHER ausgelieferten Fassung → gefahrlos ersetzbar
//   - `modified` — unbekannter Text → der Nutzer hat ihn angepasst → nur nach Bestätigung
//
// „Behaltene Zeile“ (`keepLine`): Manche Skills tragen eine Zeile, die der Nutzer absichtlich
// ändert (Pfad zur eigenen Vorlage). Sie zählt für die Prüfsumme nicht mit und wird beim
// Aktualisieren aus der alten Fassung übernommen. Sonst gälte jeder, der nur seinen Pfad
// eingetragen hat, als „angepasst“, und ein Update setzte den Pfad zurück.

export type SkillUpdateState = 'current' | 'outdated' | 'modified'

export interface SkillVersionEntry {
  /** Regex (Quelltext) für die eine Zeile, die der Nutzer anpasst; multiline, erste Fundstelle. */
  keepLine?: string
  /** SHA-256 (hex) aller je ausgelieferten Fassungen, jeweils über `fingerprintText`. */
  hashes: string[]
}

export interface SkillVersionsManifest {
  version: 1
  skills: Record<string, SkillVersionEntry>
}

export const SKILL_VERSIONS_FILE = 'skill-versions.json'
const KEEP_TOKEN = '\u0000KEEP\u0000'

/** BOM weg, Zeilenenden auf \n, Leerzeilen am Ende weg — Editoren ändern das, der Inhalt bleibt. */
export function normalizeSkillText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '') + '\n'
}

function keepRegex(keepLine: string | undefined): RegExp | null {
  if (!keepLine) return null
  try {
    return new RegExp(keepLine)
  } catch {
    return null // kaputtes Muster im Manifest: wie „keine behaltene Zeile“
  }
}

/** Index der ersten Zeile, die auf das Muster passt, sonst -1. */
function keptLineIndex(lines: string[], re: RegExp | null): number {
  if (!re) return -1
  return lines.findIndex(l => re.test(l))
}

/** Der Text, über den die Prüfsumme läuft: normalisiert, behaltene Zeile durch ein festes Zeichen ersetzt. */
export function fingerprintText(text: string, keepLine?: string): string {
  const lines = normalizeSkillText(text).split('\n')
  const i = keptLineIndex(lines, keepRegex(keepLine))
  if (i >= 0) lines[i] = KEEP_TOKEN
  return lines.join('\n')
}

export function classifySkillVersion(vaultHash: string, currentHash: string, knownHashes: readonly string[]): SkillUpdateState {
  if (vaultHash === currentHash) return 'current'
  return knownHashes.includes(vaultHash) ? 'outdated' : 'modified'
}

/**
 * Neue Fassung mit der behaltenen Zeile der alten. Fehlt die Zeile in einer der beiden
 * Fassungen, bleibt die neue unverändert — dann gibt es nichts zu übernehmen.
 */
export function carryKeptLine(newText: string, oldText: string, keepLine?: string): { text: string; carried: string | null } {
  const next = normalizeSkillText(newText)
  const re = keepRegex(keepLine)
  if (!re) return { text: next, carried: null }
  const newLines = next.split('\n')
  const oldLines = normalizeSkillText(oldText).split('\n')
  const ni = keptLineIndex(newLines, re)
  const oi = keptLineIndex(oldLines, re)
  if (ni < 0 || oi < 0 || newLines[ni] === oldLines[oi]) return { text: next, carried: null }
  newLines[ni] = oldLines[oi]
  return { text: newLines.join('\n'), carried: oldLines[oi].trim() }
}

export interface SkillDiffLine {
  type: 'same' | 'add' | 'del'
  text: string
}

// Obergrenze für den Zeilenvergleich: LCS braucht n×m Speicher. Eine SKILL.md hat einige
// hundert Zeilen; darüber gibt es keinen Vergleich, nur „alt weg, neu da“.
const DIFF_MAX_CELLS = 4_000_000

/** Zeilenweiser Vergleich (längste gemeinsame Teilfolge). `del` = nur alt, `add` = nur neu. */
export function diffSkillLines(oldText: string, newText: string): SkillDiffLine[] {
  const a = normalizeSkillText(oldText).split('\n')
  const b = normalizeSkillText(newText).split('\n')
  a.pop(); b.pop() // leeres Element nach dem abschließenden \n
  const n = a.length, m = b.length
  if (n * m > DIFF_MAX_CELLS) {
    return [...a.map(text => ({ type: 'del' as const, text })), ...b.map(text => ({ type: 'add' as const, text }))]
  }
  const w = m + 1
  const lcs = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1])
    }
  }
  const out: SkillDiffLine[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++ }
    else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) out.push({ type: 'del', text: a[i++] })
    else out.push({ type: 'add', text: b[j++] })
  }
  while (i < n) out.push({ type: 'del', text: a[i++] })
  while (j < m) out.push({ type: 'add', text: b[j++] })
  return out
}

/** Nur die geänderten Stellen mit `context` Zeilen Umgebung; Lücken als `null`. */
export function compactSkillDiff(lines: SkillDiffLine[], context = 2): Array<SkillDiffLine | null> {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, idx) => {
    if (l.type === 'same') return
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true
  })
  const out: Array<SkillDiffLine | null> = []
  let gap = false
  lines.forEach((l, idx) => {
    if (keep[idx]) { out.push(l); gap = false }
    else if (!gap && out.length > 0) { out.push(null); gap = true }
  })
  while (out.length && out[out.length - 1] === null) out.pop()
  return out
}

export function parseSkillVersionsManifest(raw: unknown): SkillVersionsManifest {
  const empty: SkillVersionsManifest = { version: 1, skills: {} }
  if (!raw || typeof raw !== 'object') return empty
  const skills = (raw as { skills?: unknown }).skills
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) return empty
  for (const [name, value] of Object.entries(skills as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{1,60}$/.test(name) || !value || typeof value !== 'object') continue
    const v = value as { keepLine?: unknown; hashes?: unknown }
    if (!Array.isArray(v.hashes)) continue
    const hashes = v.hashes.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h))
    empty.skills[name] = { ...(typeof v.keepLine === 'string' && v.keepLine ? { keepLine: v.keepLine } : {}), hashes }
  }
  return empty
}
