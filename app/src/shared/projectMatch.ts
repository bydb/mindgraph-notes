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
 *
 * Geteilte Single-Source: `discovery.suggestKeywords` (Keyword-Vorschläge aus
 * Dateinamen) baut auf dieser Basis auf und ergänzt nur Datei-/Struktur-Begriffe
 * — so kann ein Generikum, das hier steht, gar nicht erst als Keyword
 * vorgeschlagen werden (kein toter Vorschlag).
 */
export const GENERIC_STOPWORDS = new Set<string>([
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
  'geht', 'gehen', 'ging',
  // ── Domänen-Hochfrequenzbegriffe (Schule / Medienzentrum / Verwaltung) ──
  // Kommen in fast jeder Mail dieses Kontexts vor (Betreff, Body, Signatur) und
  // identifizieren KEIN einzelnes Projekt. Bewusst nur als EINZELbegriffe
  // gefiltert: mehrteilige Keywords/Namen ("Digitalwoche Schule",
  // "Geräteverleih") bleiben als Ganzes match-fähig, da isStopword den vollen
  // Term prüft, nicht dessen Bestandteile.
  'schule', 'schulen', 'schüler', 'schueler', 'schülerin', 'schuelerin',
  'lehrer', 'lehrerin', 'lehrkraft', 'lehrkräfte', 'lehrkraefte',
  'kollegium', 'kollegen', 'kolleginnen',
  'unterricht', 'klasse', 'klassen',
  'bildung', 'verwaltung', 'schulamt', 'amt',
  'medien', 'medienzentrum', 'verleih',
  'fortbildung', 'fortbildungen', 'weiterbildung',
  'veranstaltung', 'veranstaltungen', 'tagung', 'tagungen',
  'seminar', 'seminare', 'workshop', 'workshops',
  'anmeldung', 'anmeldungen', 'einladung', 'einladungen',
  'teilnehmer', 'teilnehmerin', 'teilnehmende', 'teilnehmerinnen',
  'antrag', 'anträge', 'antraege', 'formular', 'formulare',
  'rückmeldung', 'rueckmeldung', 'rückmeldungen', 'rueckmeldungen',
  'anhang', 'anhänge', 'anhaenge', 'betreff',
  // Anrede- / Grußformeln (reines Boilerplate):
  'sehr', 'geehrte', 'geehrter', 'geehrten', 'geehrtes',
  'freundlich', 'freundliche', 'freundlichen', 'freundlichem',
  'grüße', 'gruesse', 'grüßen', 'gruessen', 'mfg', 'vielen'
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

// ────────────────────────────────────────────────────────────────────────────
// Konfidenz-Gate
// ────────────────────────────────────────────────────────────────────────────

export type ProjectMatchConfidence = 'high' | 'low' | 'ambiguous' | 'none'

export interface ProjectGateResult {
  /** Verdikt über das Match-Ergebnis als Ganzes. */
  confidence: ProjectMatchConfidence
  /** Bestes Match — gesetzt bei 'high' (autonom) und 'low' (Vorschlag), sonst der Spitzenreiter bei 'ambiguous'. */
  top: ProjectMatch | null
  /** Auswahlkandidaten für die UI (bei 'ambiguous' die Top-N, sonst [top]). */
  candidates: ProjectMatch[]
  /** Trennschärfe zu Platz 2 (0 = Patt, 1 = klar getrennt) — nur Diagnose/Tooltip. */
  margin: number
}

export interface GateOptions {
  marginRatio?: number
  minBodyTerms?: number
  minHitCount?: number
  ambiguityTopN?: number
}

export const PROJECT_MATCH_GATE = {
  /** Verhältnis-Marge: bei gleichem Subject-Tier darf #2 höchstens (1-MARGIN_RATIO)·Score von #1 erreichen, sonst 'ambiguous'. */
  MARGIN_RATIO: 0.5,
  /** Ohne Betreff-Treffer braucht es mindestens so viele distinkte Terme im Body. */
  MIN_BODY_TERMS: 2,
  /** Mindest-hitCount im reinen Body-Pfad — verhindert „1 generisches Wort = Projekt". */
  MIN_HITCOUNT: 2,
  /** Wie viele Kandidaten die UI bei 'ambiguous' anbietet. */
  AMBIGUITY_TOP_N: 3
} as const

/**
 * Konfidenz-Gate über das (bereits sortierte) Ergebnis von matchEmailToProjects.
 * Verhindert, dass jeder Mail zwangsweise das beste Roh-Match zugeordnet wird.
 *
 * Reine Funktion und Single-Source für Renderer (InboxPanel) UND Workflow-Runner.
 * Scores sind projektübergreifend NICHT normalisiert; deshalb ist das primäre
 * Signal der rohe Subject-Treffer (subjectHitCount), und die Trennschärfe zu #2
 * wird als Verhältnis innerhalb desselben Subject-Tiers gebildet, nicht als
 * absolute Differenz.
 *
 * Erwartet `matches` in der Sortierung von matchEmailToProjects
 * (subjectHitCount DESC → hitCount DESC → priority); daher hat matches[0] stets
 * den maximalen subjectHitCount.
 */
export function gateProjectMatch(matches: ProjectMatch[], opts: GateOptions = {}): ProjectGateResult {
  const marginRatio = opts.marginRatio ?? PROJECT_MATCH_GATE.MARGIN_RATIO
  const minBodyTerms = opts.minBodyTerms ?? PROJECT_MATCH_GATE.MIN_BODY_TERMS
  const minHitCount = opts.minHitCount ?? PROJECT_MATCH_GATE.MIN_HITCOUNT
  const topN = opts.ambiguityTopN ?? PROJECT_MATCH_GATE.AMBIGUITY_TOP_N

  if (matches.length === 0) {
    return { confidence: 'none', top: null, candidates: [], margin: 0 }
  }

  const t1 = matches[0]
  const t2 = matches[1] || null

  // (1) Floor — genug Signal überhaupt? Sonst „kein Projekt".
  const hasSubjectAnchor = t1.subjectHitCount >= 1
  const hasBodyFloor = t1.matchedTerms.length >= minBodyTerms && t1.hitCount >= minHitCount
  if (!hasSubjectAnchor && !hasBodyFloor) {
    return { confidence: 'none', top: null, candidates: [], margin: 0 }
  }

  // Vergleichsscore: im Subject-Tier zählt der rohe subjectHitCount, sonst hitCount.
  const score = (m: ProjectMatch): number => (m.subjectHitCount >= 1 ? m.subjectHitCount : m.hitCount)
  const s1 = score(t1)

  // (2) Trennschärfe zu Platz 2.
  let clearLeader: boolean
  let margin: number
  if (!t2) {
    clearLeader = true
    margin = 1
  } else if (t1.subjectHitCount !== t2.subjectHitCount) {
    // Unterschiedlicher Subject-Tier → klar getrennt.
    clearLeader = t1.subjectHitCount > t2.subjectHitCount
    margin = 1
  } else {
    const s2 = score(t2)
    if (s1 === s2) {
      // Echtes Patt (nur Priority-Tiebreaker hat entschieden) → nie klar.
      clearLeader = false
      margin = 0
    } else {
      const ratio = s2 / s1
      margin = 1 - ratio
      clearLeader = ratio <= 1 - marginRatio
    }
  }

  // (3) Verdikt.
  if (!clearLeader) {
    return { confidence: 'ambiguous', top: t1, candidates: matches.slice(0, topN), margin }
  }
  if (hasSubjectAnchor) {
    return { confidence: 'high', top: t1, candidates: [t1], margin }
  }
  // Floor erreicht und klar vorn, aber rein Body-getragen → unverbindlicher Vorschlag.
  return { confidence: 'low', top: t1, candidates: [t1], margin }
}
