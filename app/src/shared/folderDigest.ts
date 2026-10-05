// Ordner-Auswertung mit Frage (Baustein C, docs/codex-collab/agent-rueckblick-unterordner.md).
//
// Die App liest alle passenden Dateien eines angehängten Ordners selbst, lässt das Laufmodell
// sie paketweise mit der Frage des Auftrags auswerten (Befunde mit Fundstelle) und führt die
// Ergebnisse zusammen, bis sie ins Kontextbudget passen. Die Rohtexte laufen nie gesammelt
// durch den Agent-Kontext — dasselbe Prinzip wie collect_table für Tabellen.
//
// Diese Datei ist rein (kein fs, kein Modell): Datierung, Gruppierung, Pakete, Prüfung der
// Fundstellen, Abdeckung. Dateizugriff und Modellaufrufe liegen in main/noteAgent/folderDigest.ts.

import { estimateTokens, linesFittingTokens } from './contextBudget'

export type DigestGroupBy = 'subfolder' | 'month' | 'week' | 'quarter' | 'none'
export const DIGEST_GROUP_BY: DigestGroupBy[] = ['subfolder', 'month', 'week', 'quarter', 'none']

export interface DigestDate {
  year: number
  month: number
  /** null = nur Monat bekannt (z. B. aus dem Ordnerpfad `2026/03`). */
  day: number | null
}

function validDate(y: number, m: number, d: number | null): DigestDate | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12) return null
  if (d === null) return { year: y, month: m, day: null }
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null
  return { year: y, month: m, day: d }
}

/** Frontmatter-Block am Dateianfang (ohne die Trennlinien), sonst ''. */
export function frontmatterOf(text: string): string {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?(\n|$)/.exec(text)
  return m ? m[1] : ''
}

function dateFromString(value: string): DigestDate | null {
  const iso = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(value)
  if (iso) return validDate(+iso[1], +iso[2], +iso[3])
  const compact = /(?<!\d)(\d{4})(\d{2})(\d{2})(?:\d{4})?(?!\d)/.exec(value)
  if (compact) return validDate(+compact[1], +compact[2], +compact[3])
  return null
}

/**
 * Datum einer Datei. Reihenfolge: Frontmatter (`date`, `created`, `id` mit JJJJMMTT…) →
 * Dateiname (`JJJJ-MM-TT`, `JJJJMMTT`) → Ordnerpfad (`2026/03`). Nie die mtime — Sync und
 * Backups verschieben sie. Ungültige Daten (`2026-02-30`) zählen als „ohne Datum“.
 */
export function dateOfFile(relPath: string, text: string): DigestDate | null {
  const fm = frontmatterOf(text)
  for (const key of ['date', 'created', 'id']) {
    const line = new RegExp(`^${key}\\s*:\\s*["']?([^"'\\n]+)`, 'mi').exec(fm)
    if (line) {
      const d = dateFromString(line[1])
      if (d) return d
    }
  }
  const segments = relPath.split('/')
  const fromName = dateFromString(segments[segments.length - 1])
  if (fromName) return fromName
  // Ordnerpfad: ein Jahres-Segment, direkt gefolgt von einem Monats-Segment.
  for (let i = segments.length - 2; i >= 0; i--) {
    if (/^\d{4}$/.test(segments[i]) && i + 1 < segments.length - 1 && /^\d{1,2}$/.test(segments[i + 1])) {
      return validDate(+segments[i], +segments[i + 1], null)
    }
  }
  return null
}

function isoWeek(d: DigestDate): string {
  const date = new Date(Date.UTC(d.year, d.month - 1, d.day!))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export const NO_DATE_GROUP = 'ohne Datum'

/**
 * Gruppe einer Datei. `subfolder`: der Unterordner direkt unter `base` (Dateien direkt in
 * `base` landen in „(direkt)“). Zeitgruppen brauchen ein Datum; „week“ braucht einen Tag.
 */
export function groupOf(relPath: string, date: DigestDate | null, groupBy: DigestGroupBy, base = ''): string {
  if (groupBy === 'none') return 'alle'
  if (groupBy === 'subfolder') {
    const rest = base ? relPath.slice(base.length + 1) : relPath
    const parts = rest.split('/')
    return parts.length > 1 ? (base ? `${base}/${parts[0]}` : parts[0]) : '(direkt)'
  }
  if (!date) return NO_DATE_GROUP
  const mm = String(date.month).padStart(2, '0')
  if (groupBy === 'month') return `${date.year}-${mm}`
  if (groupBy === 'quarter') return `${date.year}-Q${Math.ceil(date.month / 3)}`
  if (date.day === null) return NO_DATE_GROUP
  return isoWeek(date)
}

/** Liegt das Datum im Zeitraum? Nur Monat bekannt: zählt, wenn sich der Monat überschneidet. */
export function inDateRange(date: DigestDate | null, from?: string, to?: string): boolean {
  if (!from && !to) return true
  if (!date) return false
  const lo = `${date.year}-${String(date.month).padStart(2, '0')}-${date.day === null ? '31' : String(date.day).padStart(2, '0')}`
  const hi = `${date.year}-${String(date.month).padStart(2, '0')}-${date.day === null ? '01' : String(date.day).padStart(2, '0')}`
  if (from && lo < from) return false
  if (to && hi > to) return false
  return true
}

export interface DigestSource {
  /** Pfad relativ zum Ordner. */
  relPath: string
  group: string
  text: string
}

export interface DigestPiece {
  /** Fundstellen-Kennung: Pfad, bei geteilten Dateien `Pfad#n`. */
  ref: string
  relPath: string
  text: string
}

export interface DigestPackage {
  group: string
  pieces: DigestPiece[]
  tokens: number
}

/**
 * Pakete bauen: je Gruppe Dateien zusammenfassen, solange sie in `maxTokens` passen;
 * eine Datei größer als ein Paket wird an Zeilengrenzen in Abschnitte geteilt
 * (Fundstelle `Pfad#n`) — nie gekürzt.
 */
export function buildPackages(sources: DigestSource[], maxTokens: number): DigestPackage[] {
  const budget = Math.max(200, maxTokens)
  const byGroup = new Map<string, DigestSource[]>()
  for (const s of sources) {
    if (!byGroup.has(s.group)) byGroup.set(s.group, [])
    byGroup.get(s.group)!.push(s)
  }
  const out: DigestPackage[] = []
  for (const [group, files] of byGroup) {
    let current: DigestPackage = { group, pieces: [], tokens: 0 }
    const flush = (): void => {
      if (current.pieces.length) out.push(current)
      current = { group, pieces: [], tokens: 0 }
    }
    for (const f of files) {
      const pieces = splitIntoPieces(f, budget)
      for (const p of pieces) {
        const t = estimateTokens(p.text) + estimateTokens(p.ref) + 8
        if (current.tokens + t > budget && current.pieces.length) flush()
        current.pieces.push(p)
        current.tokens += t
      }
    }
    flush()
  }
  return out
}

function splitIntoPieces(f: DigestSource, budget: number): DigestPiece[] {
  if (estimateTokens(f.text) + 20 <= budget) return [{ ref: f.relPath, relPath: f.relPath, text: f.text }]
  const max = budget - 40
  // Eine einzelne Zeile über dem Budget (minifiziertes HTML, lange CSV-Zeile) wird an
  // Zeichengrenzen geteilt — sonst sprengt sie das Paket (F42). Die Stücke ergeben
  // zusammengesetzt wieder genau die Zeile.
  const lines = f.text.split('\n').flatMap(line => (estimateTokens(line) > max ? splitLongLine(line, max) : [line]))
  const pieces: DigestPiece[] = []
  let start = 0
  while (start < lines.length) {
    let take = linesFittingTokens(lines.slice(start), max)
    if (take === 0) take = 1
    pieces.push({ ref: '', relPath: f.relPath, text: lines.slice(start, start + take).join('\n') })
    start += take
  }
  return pieces.map((p, i) => ({ ...p, ref: `${f.relPath}#${i + 1}` }))
}

/**
 * Eine überlange Zeile in Stücke teilen, die jeweils in `maxTokens` passen. Jedes Stück
 * ist so groß wie möglich (binäre Suche) — dadurch landen nie zwei Stücke derselben Zeile
 * im selben Abschnitt, und `split('\n')`/`join('\n')` fügt keinen falschen Umbruch ein.
 */
export function splitLongLine(line: string, maxTokens: number): string[] {
  const out: string[] = []
  let rest = line
  while (rest.length > 0) {
    let lo = 1
    let hi = rest.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (estimateTokens(rest.slice(0, mid)) <= maxTokens) lo = mid
      else hi = mid - 1
    }
    out.push(rest.slice(0, lo))
    rest = rest.slice(lo)
  }
  return out
}

export const NO_FINDINGS = 'KEINE BEFUNDE'

export interface ValidatedFindings {
  kept: string[]
  /** Befunde ohne oder mit fremder Fundstelle — verworfen und gezählt (F14). */
  dropped: number
}

/**
 * Fundstellen deterministisch prüfen: Jede Befund-Zeile (`- …`) muss mindestens eine
 * Fundstelle `[Pfad]` bzw. `[Pfad#n]` aus `allowedRefs` tragen. Alles andere fliegt raus
 * und wird gezählt. Inhaltlich geprüft wird hier nichts — das sagt die Abdeckung ehrlich.
 */
export function validateFindings(modelText: string, allowedRefs: Iterable<string>): ValidatedFindings {
  const allowed = new Set(Array.from(allowedRefs, r => r.toLowerCase()))
  const kept: string[] = []
  let dropped = 0
  for (const raw of modelText.split('\n')) {
    const line = raw.trim()
    if (!/^[-*•]\s+/.test(line)) continue
    const refs = Array.from(line.matchAll(/\[([^\]\n]+)\]/g), m => m[1].trim().toLowerCase())
    // Nur genau die Fundstellen, die es gibt — ein erfundenes `Datei#999` fliegt raus (F41).
    if (refs.length > 0 && refs.every(r => allowed.has(r))) {
      kept.push(`- ${line.replace(/^[-*•]\s+/, '')}`)
    } else {
      dropped++
    }
  }
  return { kept, dropped }
}

/** Alle Fundstellen in Befund-Zeilen — die erlaubte Menge beim Zusammenführen (F41). */
export function refsInFindings(lines: string[]): string[] {
  return lines.flatMap(l => Array.from(l.matchAll(/\[([^\]\n]+)\]/g), m => m[1].trim()))
}

/** Befunde in Bündel teilen, die jeweils in `maxTokens` passen (für das Zusammenführen). */
export function chunkByTokens(lines: string[], maxTokens: number): string[][] {
  const chunks: string[][] = []
  let start = 0
  while (start < lines.length) {
    let take = linesFittingTokens(lines.slice(start), maxTokens)
    if (take === 0) take = 1
    chunks.push(lines.slice(start, start + take))
    start += take
  }
  return chunks
}

export type DigestFileStatus =
  | { relPath: string; status: 'ausgewertet' }
  | { relPath: string; status: 'abschnitte'; parts: number }
  | { relPath: string; status: 'teilweise'; detail: string }
  | { relPath: string; status: 'ausgelassen'; reason: string }
  | { relPath: string; status: 'fehler'; reason: string }

export interface DigestCoverage {
  found: number
  files: DigestFileStatus[]
  /** Vorab ausgefiltert (Unterordner, Format), nur gezählt — gehören zu `found` (F39). */
  excluded?: Array<{ reason: string; count: number }>
  /** Einträge im Ordner, die gar nicht als lesbare Datei zählen (andere Formate, versteckt, Verknüpfung). */
  notReadable?: { otherFormats: number; hidden: number; symlinks: number }
  droppedFindings: number
  /** Gesetzt, wenn die Auswertung nicht alle Gruppen geschafft hat. */
  incomplete?: string
}

/** Abdeckung in Zahlen. Die Summe der Zeilen geht immer auf die Zahl gefundener Dateien auf. */
export function formatCoverage(c: DigestCoverage, maxListed = 20): string {
  const count = (s: DigestFileStatus['status']) => c.files.filter(f => f.status === s).length
  const skipped = c.files.filter((f): f is Extract<DigestFileStatus, { status: 'ausgelassen' }> => f.status === 'ausgelassen')
  const reasons = new Map<string, number>()
  for (const f of skipped) reasons.set(f.reason, (reasons.get(f.reason) ?? 0) + 1)
  let excludedTotal = 0
  for (const e of c.excluded ?? []) {
    if (e.count <= 0) continue
    excludedTotal += e.count
    reasons.set(e.reason, (reasons.get(e.reason) ?? 0) + e.count)
  }
  const lines = [
    `ABDECKUNG: ${c.found} Dateien gefunden — ${count('ausgewertet')} vollständig ausgewertet, ${count('abschnitte')} in Abschnitten vollständig ausgewertet, ${count('teilweise')} nur teilweise lesbar, ${skipped.length + excludedTotal} ausgelassen, ${count('fehler')} nicht lesbar.`
  ]
  if (reasons.size) lines.push(`Ausgelassen: ${Array.from(reasons, ([r, n]) => `${n} × ${r}`).join(', ')}.`)
  const nr = c.notReadable
  if (nr && nr.otherFormats + nr.hidden + nr.symlinks > 0) {
    const parts = [
      nr.otherFormats ? `${nr.otherFormats} in nicht lesbaren Formaten` : '',
      nr.hidden ? `${nr.hidden} versteckte` : '',
      nr.symlinks ? `${nr.symlinks} Verknüpfungen` : ''
    ].filter(Boolean)
    lines.push(`Außerdem im Ordner, nicht mitgezählt und nicht gelesen: ${parts.join(', ')}.`)
  }
  const notFull = c.files.filter(f => f.status === 'teilweise' || f.status === 'fehler')
  if (notFull.length) {
    lines.push('Nicht vollständig gelesen:')
    for (const f of notFull.slice(0, maxListed)) {
      lines.push(`- ${f.relPath}: ${f.status === 'teilweise' ? f.detail : f.reason}`)
    }
    if (notFull.length > maxListed) lines.push(`- … ${notFull.length - maxListed} weitere`)
  }
  if (c.droppedFindings) lines.push(`${c.droppedFindings} Befunde ohne gültige Fundstelle wurden verworfen.`)
  if (c.incomplete) lines.push(`UNVOLLSTÄNDIG: ${c.incomplete}`)
  return lines.join('\n')
}
