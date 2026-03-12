/**
 * Semantic Scholar Integration Service
 *
 * Kommuniziert mit der Semantic Scholar Academic Graph API über IPC (Main-Prozess).
 * Kostenlose API, kein API-Key erforderlich (aber empfohlen für höhere Rate Limits).
 */

export interface SemanticScholarAuthor {
  authorId: string
  name: string
}

export interface SemanticScholarPaper {
  paperId: string
  title: string
  abstract?: string | null
  authors: SemanticScholarAuthor[]
  year?: number | null
  citationCount?: number
  url?: string
  venue?: string
  publicationTypes?: string[]
  openAccessPdf?: {
    url: string
    status: string | null
  } | null
  externalIds?: {
    DOI?: string
    ArXiv?: string
  }
}

export interface SemanticScholarSearchFilters {
  year?: string
  fieldsOfStudy?: string
  minCitationCount?: number
  limit?: number
  openAccessPdf?: boolean
}

export interface SemanticScholarSearchResult {
  total: number
  papers: SemanticScholarPaper[]
}

// Sucht Papers über IPC -> Main Process
export async function searchSemanticScholar(
  query: string,
  filters?: SemanticScholarSearchFilters
): Promise<SemanticScholarSearchResult> {
  if (!query.trim()) return { total: 0, papers: [] }

  try {
    const result = await window.electronAPI.semanticScholarSearch(query, filters)
    return result as SemanticScholarSearchResult
  } catch (error) {
    console.error('[SemanticScholar] Search error:', error)
    return { total: 0, papers: [] }
  }
}

// Holt Paper-Details über IPC -> Main Process
export async function getSemanticScholarPaper(paperId: string): Promise<SemanticScholarPaper | null> {
  try {
    const result = await window.electronAPI.semanticScholarGetPaper(paperId)
    return result as SemanticScholarPaper | null
  } catch (error) {
    console.error('[SemanticScholar] Get paper error:', error)
    return null
  }
}

// Formatiert Autoren für Anzeige
export function formatAuthors(paper: SemanticScholarPaper): string {
  if (!paper.authors || paper.authors.length === 0) return 'Unknown'

  if (paper.authors.length === 1) {
    return paper.authors[0].name
  }

  if (paper.authors.length === 2) {
    return `${paper.authors[0].name} & ${paper.authors[1].name}`
  }

  return `${paper.authors[0].name} et al.`
}

// Formatiert Autoren (Nachnamen) für Anzeige
function getLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1]
}

// Formatiert einen Autorennamen im IEEE-Stil: "J. Doe"
function formatAuthorIEEE(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const lastName = parts[parts.length - 1]
  const initials = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + '.').join(' ')
  return `${initials} ${lastName}`
}

// Generiert Inline-Zitation (IEEE-Style)
export function generateCitation(paper: SemanticScholarPaper): string {
  const authors = paper.authors || []
  const year = paper.year || ''

  let authorStr: string
  if (authors.length === 0) {
    authorStr = 'Unknown'
  } else if (authors.length <= 3) {
    authorStr = authors.map(a => formatAuthorIEEE(a.name)).join(', ')
  } else {
    authorStr = formatAuthorIEEE(authors[0].name) + ' et al.'
  }

  const title = `"${paper.title}"`
  const venue = paper.venue ? ` ${paper.venue},` : ''

  return `${authorStr}, ${title},${venue} ${year}.`
}

// Generiert Literaturnotiz-Template
export function generateLiteratureNote(paper: SemanticScholarPaper): string {
  const authors = paper.authors?.map(a => a.name).join(', ') || 'Unknown'
  const year = paper.year || ''
  const doi = paper.externalIds?.DOI

  let note = `---
title: "${paper.title.replace(/"/g, '\\"')}"
authors: ${authors}
year: ${year}
citations: ${paper.citationCount || 0}
${doi ? `doi: ${doi}` : ''}
tags: [literatur, paper]
---

**Autoren:** ${authors}
**Jahr:** ${year}
**Zitierungen:** ${paper.citationCount || 0}
`

  if (paper.venue) {
    note += `**Venue:** ${paper.venue}\n`
  }

  if (doi) {
    note += `**DOI:** [${doi}](https://doi.org/${doi})\n`
  }

  if (paper.url) {
    note += `**Semantic Scholar:** ${paper.url}\n`
  }

  if (paper.openAccessPdf?.url) {
    note += `**PDF:** ${paper.openAccessPdf.url}\n`
  }

  note += `
## Abstract

${paper.abstract || '*Kein Abstract verfügbar*'}

## Notizen

-
`

  return note
}

// Generiert Dateinamen für Literaturnotiz
export function generateLiteratureNoteFilename(paper: SemanticScholarPaper): string {
  const year = paper.year || 'undated'
  const firstAuthor = paper.authors?.[0]?.name
    ? getLastName(paper.authors[0].name)
    : 'Unknown'

  const cleanTitle = paper.title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 50)

  return `${year} - ${firstAuthor} - ${cleanTitle}.md`
}

// Verfügbare Fachgebiete für Filter
export const FIELDS_OF_STUDY = [
  'Computer Science',
  'Medicine',
  'Biology',
  'Psychology',
  'Physics',
  'Mathematics',
  'Chemistry',
  'Engineering',
  'Economics',
  'Education',
  'Philosophy',
  'Sociology',
  'Political Science',
  'Environmental Science',
  'Business',
  'History',
  'Art',
  'Geography',
  'Linguistics',
  'Law',
  'Materials Science',
  'Geology',
  'Agricultural and Food Sciences'
]
