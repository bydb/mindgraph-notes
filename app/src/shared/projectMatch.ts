import type { DiscoveredProject, ProjectSynonymCache } from './types'

export interface ProjectMatch {
  project: DiscoveredProject
  hitCount: number
  subjectHitCount: number
  matchedTerms: string[]
}

interface MatchTerm {
  term: string
  /** Erlaubt Treffer am Anfang deutscher Komposita, z.B. "Mars" in "Marslandschaft". */
  compoundPrefix: boolean
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

function stripFolderPrefix(name: string): string {
  return name
    .replace(/^\s*\d+\s*[-–—]\s*/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function splitIdentityTokens(value: string): string[] {
  return stripFolderPrefix(value)
    .split(/[^\p{L}\p{N}]+/gu)
    .map(s => s.trim())
    .filter(s => s.length >= 4 && !isStopword(s))
}

function countMatches(text: string, term: string, compoundPrefix = false): number {
  if (!text.trim()) return 0
  const escaped = escapeRegex(term)
  if (!compoundPrefix) {
    return text.match(new RegExp(`\\b${escaped}\\b`, 'gi'))?.length || 0
  }
  const matches = text.match(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}[\\p{L}\\p{N}]*`, 'giu'))
  return matches?.length || 0
}

function effectiveTerms(
  project: DiscoveredProject,
  synonymsByFolder: Record<string, ProjectSynonymCache>
): MatchTerm[] {
  const seen = new Set<string>()
  const out: MatchTerm[] = []
  const push = (term: string, compoundPrefix = false) => {
    const trimmed = term.trim()
    if (!trimmed) return
    if (isStopword(trimmed)) return
    const key = `${trimmed.toLowerCase()}::${compoundPrefix ? 'compound' : 'exact'}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ term: trimmed, compoundPrefix })
  }

  for (const kw of project.marker?.keywords || []) push(kw)

  const cache = synonymsByFolder[project.folderRel]
  if (cache) {
    for (const syn of cache.synonyms || []) push(syn)
  }

  // Projektname und Ordnername sind starke Identitätssignale. Gerade bei
  // deutschen Komposita steht im Betreff oft "Marslandschaft", während das
  // Projekt "Mars Abenteuer" heißt. Deshalb dürfen einzelne Namens-Tokens im
  // Subject als Kompositum-Präfix matchen.
  const identityNames = [project.marker?.project || '', project.folderName || '']
  for (const name of identityNames) {
    const cleanName = stripFolderPrefix(name)
    push(cleanName)
    for (const token of splitIdentityTokens(cleanName)) {
      push(token, true)
    }
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
    let subjectHitCount = 0
    const matched: string[] = []
    for (const term of terms) {
      const subjectHits = countMatches(subject, term.term, term.compoundPrefix)
      const bodyHits = term.compoundPrefix
        ? 0
        : countMatches(body, term.term, false)
      const termHits = subjectHits * SUBJECT_WEIGHT + bodyHits
      if (termHits > 0) {
        hitCount += termHits
        subjectHitCount += subjectHits
        matched.push(term.term)
      }
    }

    if (hitCount > 0) matches.push({ project, hitCount, subjectHitCount, matchedTerms: matched })
  }

  // Subject-Hits sind das stärkste Signal. Body-/Signatur-Treffer können
  // zahlreich sein ("Medienzentrum", "Rückmeldung" etc.), dürfen aber keinen
  // eindeutigen Betreff wie "Roll-Up Marslandschaft" überstimmen.
  // Priority ist nur Tiebreaker.
  matches.sort((a, b) => {
    if (b.subjectHitCount !== a.subjectHitCount) return b.subjectHitCount - a.subjectHitCount
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount
    const pa = PRIORITY_ORDER[a.project.marker.priority] ?? 99
    const pb = PRIORITY_ORDER[b.project.marker.priority] ?? 99
    return pa - pb
  })

  return matches
}
