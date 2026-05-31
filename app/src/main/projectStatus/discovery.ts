/**
 * Discovery: findet markierte Projekte und berechnet ihren Stand.
 *
 * Markierung = Existenz von `<Projektordner>/_STATUS.md` mit gültigem
 * Frontmatter (keywords + priority).
 *
 * Brain-Signal-Alter: durchsucht die letzten 60 Brain-Tage nach Keywords.
 * Das Frontmatter der Brain-Datei wird übersprungen — sonst matched z. B.
 * "Ollama" im `generated_by:` jeden einzelnen Tag.
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { GENERIC_STOPWORDS } from '../../shared/projectMatch'
import type {
  DiscoveredProject,
  ProjectStatusMarker,
  ProjectPriority
} from './types'

const DEFAULT_BRAIN_FOLDER = '800 - 🧠 brain'
const MAX_BRAIN_LOOKBACK_DAYS = 60

// ────────────────────────────────────────────────────────────────────────────
// ISO-Wochen-Tag-Helfer
// ────────────────────────────────────────────────────────────────────────────

export function getISOWeekTag(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

// ────────────────────────────────────────────────────────────────────────────
// Frontmatter-Parser für _STATUS.md
// ────────────────────────────────────────────────────────────────────────────

/**
 * Minimaler YAML-Frontmatter-Parser für die _STATUS.md-Struktur.
 * Unterstützt:
 *   - `keywords: foo, bar, baz`    (inline-Liste, komma-separiert)
 *   - `keywords:` + folgende `  - foo`-Zeilen (YAML-Liste)
 *   - `priority: high` / `med` / `low`
 *   - `project: <Name>`
 */
export function parseStatusMarker(content: string): ProjectStatusMarker | null {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith('---')) return null

  const afterOpen = trimmed.slice(3).replace(/^\s*\n/, '')
  const fmEnd = afterOpen.indexOf('\n---')
  if (fmEnd === -1) return null

  const fm = afterOpen.slice(0, fmEnd)
  const lines = fm.split('\n')

  let project = ''
  let keywords: string[] = []
  let priority: ProjectPriority = 'med'

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) {
      i++
      continue
    }
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()

    if (key === 'project') {
      project = unquote(value)
    } else if (key === 'priority') {
      const v = unquote(value).toLowerCase()
      if (v === 'high' || v === 'med' || v === 'low') {
        priority = v as ProjectPriority
      }
    } else if (key === 'keywords') {
      if (value) {
        // Inline-Form: keywords: foo, bar, baz
        keywords = value
          .split(',')
          .map(s => unquote(s.trim()))
          .filter(s => s.length > 0)
      } else {
        // List-Form: keywords:\n  - foo\n  - bar
        i++
        while (i < lines.length) {
          const ln = lines[i]
          const m = ln.match(/^\s+-\s+(.+)$/)
          if (!m) break
          keywords.push(unquote(m[1].trim()))
          i++
        }
        continue
      }
    }
    i++
  }

  if (keywords.length === 0) return null
  return { project: project || '(unnamed)', keywords, priority }
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value.charAt(0)
    const last = value.charAt(value.length - 1)
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

// ────────────────────────────────────────────────────────────────────────────
// Frontmatter-Serializer für `mark`
// ────────────────────────────────────────────────────────────────────────────

export function buildStatusMarkerFile(
  marker: ProjectStatusMarker,
  language: 'de' | 'en' = 'de'
): string {
  const kwInline = marker.keywords
    .map(k => k.includes(',') ? `"${k.replace(/"/g, '\\"')}"` : k)
    .join(', ')

  const heading = `# ${marker.project} · Status`
  const placeholder = language === 'de'
    ? '*(noch nicht crystallisiert — beim nächsten Lauf wird `_STATUS-<Woche>.md` erzeugt)*'
    : '*(not yet crystallized — next run will create `_STATUS-<week>.md`)*'

  return `---
type: project-status
project: ${marker.project}
keywords: ${kwInline}
priority: ${marker.priority}
---
${heading}

${placeholder}
`
}

// ────────────────────────────────────────────────────────────────────────────
// Brain-Signal-Alter
// ────────────────────────────────────────────────────────────────────────────

const BRAIN_FILE_RE = /^(\d{2})\.md$/

interface BrainFileInfo {
  date: string             // YYYY-MM-DD
  fullPath: string
}

/**
 * Listet Brain-Dateien der letzten N Tage sortiert vom neuesten zum ältesten.
 */
async function listRecentBrainFiles(
  vaultPath: string,
  brainFolderRel: string,
  maxDays: number
): Promise<BrainFileInfo[]> {
  const brainAbs = path.join(vaultPath, brainFolderRel)
  const result: BrainFileInfo[] = []
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - maxDays)

  // Brain-Pfad-Struktur: <root>/<YYYY>/<MM>/<DD>.md
  let years: string[]
  try {
    years = (await fs.readdir(brainAbs)).filter(y => /^\d{4}$/.test(y))
  } catch {
    return []
  }

  for (const year of years) {
    const yearPath = path.join(brainAbs, year)
    let months: string[]
    try {
      months = (await fs.readdir(yearPath)).filter(m => /^\d{2}$/.test(m))
    } catch {
      continue
    }
    for (const month of months) {
      const monthPath = path.join(yearPath, month)
      let files: string[]
      try {
        files = await fs.readdir(monthPath)
      } catch {
        continue
      }
      for (const file of files) {
        const dm = file.match(BRAIN_FILE_RE)
        if (!dm) continue
        const day = dm[1]
        const dateStr = `${year}-${month}-${day}`
        const fileDate = new Date(`${dateStr}T00:00:00Z`)
        if (isNaN(fileDate.getTime())) continue
        if (fileDate < cutoff) continue
        if (fileDate > today) continue // Zukunft ignorieren
        result.push({ date: dateStr, fullPath: path.join(monthPath, file) })
      }
    }
  }

  result.sort((a, b) => (a.date < b.date ? 1 : -1)) // descending
  return result
}

/**
 * Strippt das YAML-Frontmatter eines Markdown-Inhalts.
 * Wichtig, damit "Ollama" in `generated_by: "ollama:..."` keinen Treffer auslöst.
 */
export function stripFrontmatter(content: string): string {
  const t = content.trimStart()
  if (!t.startsWith('---')) return content
  const afterOpen = t.slice(3).replace(/^\s*\n/, '')
  const end = afterOpen.indexOf('\n---')
  if (end === -1) return content
  return afterOpen.slice(end + 4).replace(/^\s*\n/, '')
}

/** Prüft, ob mindestens ein Keyword (case-insensitive) im Inhalt vorkommt. */
function matchesAnyKeyword(content: string, keywords: string[]): string[] {
  const lower = content.toLowerCase()
  const hits: string[] = []
  for (const kw of keywords) {
    const k = kw.toLowerCase()
    if (k && lower.includes(k)) hits.push(kw)
  }
  return hits
}

/**
 * Sucht das jüngste Brain-Signal (Tag mit ≥1 Keyword-Treffer im Body)
 * innerhalb der letzten 60 Tage. Liefert Datum oder null.
 */
export async function findLastBrainSignal(
  vaultPath: string,
  brainFolderRel: string,
  keywords: string[]
): Promise<{ date: string | null; ageDays: number | null }> {
  if (keywords.length === 0) return { date: null, ageDays: null }

  const recent = await listRecentBrainFiles(vaultPath, brainFolderRel, MAX_BRAIN_LOOKBACK_DAYS)
  for (const f of recent) {
    let raw: string
    try {
      raw = await fs.readFile(f.fullPath, 'utf-8')
    } catch {
      continue
    }
    const body = stripFrontmatter(raw)
    if (matchesAnyKeyword(body, keywords).length > 0) {
      const fileDate = new Date(`${f.date}T00:00:00Z`)
      const today = new Date()
      const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
      const ageDays = Math.round((todayUTC.getTime() - fileDate.getTime()) / 86400000)
      return { date: f.date, ageDays }
    }
  }
  return { date: null, ageDays: null }
}

// ────────────────────────────────────────────────────────────────────────────
// Hauptfunktion: discoverProjects
// ────────────────────────────────────────────────────────────────────────────

/**
 * Findet alle Ordner unter `<vaultPath>/<projectsFolderRel>/*`, die ein
 * gültiges `_STATUS.md` enthalten. Liefert sortiert nach Priority, dann Name.
 */
export async function discoverProjects(
  vaultPath: string,
  projectsFolderRel: string,
  brainFolderRel: string = DEFAULT_BRAIN_FOLDER
): Promise<DiscoveredProject[]> {
  const projectsAbs = path.join(vaultPath, projectsFolderRel)
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(projectsAbs, { withFileTypes: true })
  } catch {
    return []
  }

  const weekTag = getISOWeekTag()
  const draftFileRe = new RegExp(`^_STATUS-${escapeRegExp(weekTag)}(?: \\(\\d+\\))?\\.md$`)

  const result: DiscoveredProject[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const folderAbs = path.join(projectsAbs, entry.name)
    const statusFile = path.join(folderAbs, '_STATUS.md')

    let statusContent: string
    try {
      statusContent = await fs.readFile(statusFile, 'utf-8')
    } catch {
      continue // kein Marker → kein Eintrag
    }

    const marker = parseStatusMarker(statusContent)
    if (!marker) continue

    // Letztes Brain-Signal
    const signal = await findLastBrainSignal(vaultPath, brainFolderRel, marker.keywords)

    // Drafts der aktuellen Woche finden (`_STATUS-2026-W21.md`, `(2)`, `(3)` ...)
    const currentWeekDrafts = await listCurrentWeekDrafts(folderAbs, path.join(projectsFolderRel, entry.name), draftFileRe)
    const draftRel = currentWeekDrafts[0] || null

    result.push({
      folderName: entry.name,
      folderRel: path.join(projectsFolderRel, entry.name),
      marker: {
        project: marker.project || entry.name,
        keywords: marker.keywords,
        priority: marker.priority
      },
      lastBrainSignal: signal,
      currentWeekDraft: draftRel,
      currentWeekDrafts
    })
  }

  // Sortierung: priority desc, dann Name
  const prioRank: Record<ProjectPriority, number> = { high: 0, med: 1, low: 2 }
  result.sort((a, b) => {
    const p = prioRank[a.marker.priority] - prioRank[b.marker.priority]
    if (p !== 0) return p
    return a.folderName.localeCompare(b.folderName, 'de')
  })

  return result
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function listCurrentWeekDrafts(
  folderAbs: string,
  folderRel: string,
  draftFileRe: RegExp
): Promise<string[]> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(folderAbs, { withFileTypes: true })
  } catch {
    return []
  }

  const drafts: { rel: string; mtimeMs: number }[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!draftFileRe.test(entry.name)) continue
    const full = path.join(folderAbs, entry.name)
    try {
      const stat = await fs.stat(full)
      drafts.push({ rel: path.join(folderRel, entry.name), mtimeMs: stat.mtimeMs })
    } catch {
      // Wenn ein Draft zwischen readdir und stat verschwindet, ignorieren.
    }
  }

  drafts.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return drafts.map(d => d.rel)
}

// ────────────────────────────────────────────────────────────────────────────
// Keyword-Vorschlag: aus Ordnerinhalt ableiten
// ────────────────────────────────────────────────────────────────────────────

/**
 * Erzeugt Keyword-Vorschläge aus den Dateinamen im Projektordner.
 * Heuristik:
 *   - Wörter aus Filenames (außer Generika wie "Notizen", "Dokumentation")
 *   - ZK-IDs (12-stellige Zahlen am Anfang) als eigene Keywords
 *   - Ordnername selbst (ohne ID-Präfix)
 */
// Erweitert die geteilte GENERIC_STOPWORDS-Basis (shared/projectMatch.ts: Generika +
// Domänen-/Anrede-Begriffe) um Wörter, die NUR bei der Keyword-Ableitung aus
// Dateinamen stören (Artikel, Datei-/Struktur-Begriffe). Eine Quelle für die
// Domänen-/Generika-Begriffe — sie hier nicht erneut auflisten.
const STOPWORDS = new Set<string>([
  ...GENERIC_STOPWORDS,
  // Artikel / Funktionswörter (de/en)
  'die', 'der', 'das', 'und', 'oder', 'mit', 'für', 'fur', 'von', 'zur', 'zum',
  'the', 'and', 'for', 'with', 'from', 'into', 'over',
  // Datei- / Dokument-Struktur (nur für Dateinamen-Vorschläge relevant)
  'notiz', 'notizen', 'note', 'notes',
  'dokumentation', 'documentation', 'doc', 'docs',
  'files', 'file', 'pdf', 'screenshot',
  'projekt', 'projekte', 'project', 'projects',
  'inventar', 'inventory', 'liste', 'list', 'kompakt', 'kompakte', 'übersicht'
])

export async function suggestKeywords(
  vaultPath: string,
  projectFolderRel: string
): Promise<string[]> {
  const folderAbs = path.join(vaultPath, projectFolderRel)
  const folderName = path.basename(folderAbs)

  let files: string[]
  try {
    files = await fs.readdir(folderAbs)
  } catch {
    return []
  }

  const suggestions = new Set<string>()

  // 1) Ordnername minus "<NN> - " Präfix
  const nameWithoutId = folderName.replace(/^\d+\s*-\s*/, '').trim()
  if (nameWithoutId && nameWithoutId.length >= 3) {
    suggestions.add(nameWithoutId)
  }

  // 2) Wörter aus Dateinamen
  const wordCounts = new Map<string, number>()
  for (const file of files) {
    if (file.startsWith('_STATUS') || file.startsWith('.')) continue
    const base = path.basename(file, path.extname(file))
    // Strip ZK-ID Präfix
    const stripped = base.replace(/^\d{8,}\s*-\s*/, '').replace(/^[^\p{L}\p{N}]+\s+/u, '')
    const tokens = stripped.split(/[\s\-_.]+/).filter(t => t.length >= 4)
    for (const t of tokens) {
      const norm = t.normalize('NFC')
      if (STOPWORDS.has(norm.toLowerCase())) continue
      if (/^\d+$/.test(norm)) continue // reine Zahlen
      wordCounts.set(norm, (wordCounts.get(norm) || 0) + 1)
    }
  }

  // Top-5 nach Häufigkeit
  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)
  for (const w of topWords) suggestions.add(w)

  return Array.from(suggestions).slice(0, 8)
}
