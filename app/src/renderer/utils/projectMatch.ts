import type { DiscoveredProject, ProjectSynonymCache } from '../../shared/types'

export interface ProjectMatch {
  project: DiscoveredProject
  hitCount: number
  matchedTerms: string[]
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, med: 1, low: 2 }

/**
 * Wörter, die fast in jeder Mail vorkommen und keine Projekt-Identifikation
 * leisten. Werden vor dem Match-Vorgang rausgefiltert, egal ob aus
 * _STATUS.md-Keywords oder LLM-Synonymen.
 */
const GENERIC_STOPWORDS = new Set<string>([
  'information', 'informationen', 'info', 'infos',
  'raum', 'räume', 'raeume',
  'frau', 'mann', 'herr', 'damen', 'herren',
  'hallo', 'liebe', 'lieber', 'liebes',
  'email', 'mail', 'e-mail', 'nachricht', 'nachrichten',
  'tag', 'woche', 'monat', 'jahr', 'datum', 'uhrzeit', 'zeit',
  'termin', 'beispiel', 'punkt',
  'datei', 'dokument',
  'gespraech', 'gesprach',
  'ok', 'ja', 'nein', 'danke', 'gruss', 'grüsse',
  // Häufige Crystallizer-Füllwörter (keine Projekt-Identifikatoren):
  'nach', 'teilnahme', 'fragt', 'fragen', 'frage', 'antwort', 'antwortet',
  'einen', 'eine', 'einer', 'eines',
  'sendet', 'senden', 'gesendet', 'schickt', 'schicken',
  'erstentwurf', 'entwurf', 'entwürfe',
  'bitte', 'gerne', 'kurz', 'noch',
  'macht', 'machen', 'gemacht',
  'soll', 'sollen', 'sollte', 'will', 'wollen', 'wollte',
  'kommt', 'kommen', 'kam',
  'geht', 'gehen', 'ging'
])

const SUBJECT_WEIGHT = 5

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isStopword(term: string): boolean {
  return GENERIC_STOPWORDS.has(term.toLowerCase().trim())
}

function effectiveTerms(
  project: DiscoveredProject,
  synonymsByFolder: Record<string, ProjectSynonymCache>
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return
    if (isStopword(trimmed)) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(trimmed)
  }
  for (const kw of project.marker?.keywords || []) push(kw)
  const cache = synonymsByFolder[project.folderRel]
  if (cache) {
    for (const syn of cache.synonyms || []) push(syn)
  }
  return out
}

export function matchEmailToProjects(
  email: { subject?: string; bodyText?: string },
  projects: DiscoveredProject[],
  synonymsByFolder: Record<string, ProjectSynonymCache> = {}
): ProjectMatch[] {
  const subject = email.subject || ''
  const body = email.bodyText || ''
  if (!subject.trim() && !body.trim()) return []

  const matches: ProjectMatch[] = []

  for (const project of projects) {
    const terms = effectiveTerms(project, synonymsByFolder)
    if (terms.length === 0) continue

    let hitCount = 0
    const matched: string[] = []
    for (const term of terms) {
      const re = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi')
      const subjectHits = subject.match(re)?.length || 0
      const bodyHits = body.match(re)?.length || 0
      const termHits = subjectHits * SUBJECT_WEIGHT + bodyHits
      if (termHits > 0) {
        hitCount += termHits
        matched.push(term)
      }
    }

    if (hitCount > 0) matches.push({ project, hitCount, matchedTerms: matched })
  }

  // hitCount ist primäres Signal (Subject-Hits sind 5× gewichtet),
  // Priority nur als Tiebreaker. Vorher dominierte Priority bedingungslos —
  // dadurch gewannen `high`-Projekte mit schwachen Stopwort-artigen Keywords
  // gegen `med`-Projekte mit eindeutigen Subject-Treffern.
  matches.sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount
    const pa = PRIORITY_ORDER[a.project.marker.priority] ?? 99
    const pb = PRIORITY_ORDER[b.project.marker.priority] ?? 99
    return pa - pb
  })

  return matches
}
