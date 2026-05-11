/**
 * Zotero Integration Service
 *
 * Kommuniziert mit Better BibTeX for Zotero über IPC (Main-Prozess).
 * Voraussetzung: Zotero muss laufen und Better BibTeX installiert sein.
 */

export interface ZoteroItem {
  key: string
  citekey: string
  title: string
  creators: Array<{
    firstName?: string
    lastName?: string
    name?: string
    creatorType: string
  }>
  date?: string
  year?: string
  dateParts?: number[]
  itemType: string
  abstractNote?: string
  DOI?: string
  URL?: string
  publicationTitle?: string
  genre?: string
  number?: string
  archive?: string
  journalAbbreviation?: string
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  place?: string
  tags?: Array<{ tag: string }>
}

export interface ZoteroSearchResult {
  item: ZoteroItem
  citekey: string
}

export type CitationStyle = string

export interface CitationStyleOption {
  id: CitationStyle
  label: string
  description: string
  format?: string
}

export const CITATION_STYLE_OPTIONS: CitationStyleOption[] = [
  { id: 'mindgraph', label: 'MindGraph', description: 'Autor, Jahr, Titel' },
  { id: 'bibtex', label: 'BibTeX', description: '@citekey' },
  { id: 'pandoc', label: 'Pandoc', description: '[@citekey]' }
]

export const DEFAULT_CITATION_STYLE = 'http://www.zotero.org/styles/apa'

// Prüft ob Zotero/Better BibTeX läuft (via IPC -> Main Process)
export async function isZoteroAvailable(): Promise<boolean> {
  try {
    return await window.electronAPI.zoteroCheck()
  } catch (error) {
    console.error('[Zotero] Connection error:', error)
    return false
  }
}

// Sucht in Zotero nach Items (via IPC -> Main Process)
export async function searchZotero(query: string): Promise<ZoteroSearchResult[]> {
  if (!query.trim()) return []

  try {
    const results = await window.electronAPI.zoteroSearch(query)
    return results as ZoteroSearchResult[]
  } catch (error) {
    console.error('[Zotero] Search error:', error)
    return []
  }
}

export async function listCitationStyles(): Promise<CitationStyleOption[]> {
  try {
    const styles = await window.electronAPI.zoteroListCitationStyles()
    return styles.length > 0 ? styles : CITATION_STYLE_OPTIONS
  } catch (error) {
    console.error('[Zotero] Citation style list error:', error)
    return CITATION_STYLE_OPTIONS
  }
}

// Formatiert Autoren für Anzeige
export function formatAuthors(item: ZoteroItem): string {
  if (!item.creators || item.creators.length === 0) return 'Unbekannt'

  const authors = item.creators.filter(c => c.creatorType === 'author')
  if (authors.length === 0) return 'Unbekannt'

  if (authors.length === 1) {
    const a = authors[0]
    return a.lastName || a.name || 'Unbekannt'
  }

  if (authors.length === 2) {
    return `${authors[0].lastName || authors[0].name} & ${authors[1].lastName || authors[1].name}`
  }

  return `${authors[0].lastName || authors[0].name} et al.`
}

// Formatiert Jahr für Anzeige
export function formatYear(item: ZoteroItem): string {
  if (item.year) return item.year
  if (item.date) {
    const match = item.date.match(/\d{4}/)
    return match ? match[0] : ''
  }
  return ''
}

function getAuthorNames(item: ZoteroItem): string[] {
  return item.creators
    ?.filter(c => c.creatorType === 'author')
    .map(c => c.lastName || c.name)
    .filter((name): name is string => Boolean(name?.trim())) || []
}

function formatApaAuthors(item: ZoteroItem): string {
  const authors = getAuthorNames(item)
  if (authors.length === 0) return 'Unbekannt'
  if (authors.length === 1) return authors[0]
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`
  return `${authors[0]} et al.`
}

function formatApaReferenceAuthors(item: ZoteroItem): string {
  const authors = item.creators?.filter(c => c.creatorType === 'author') || []
  if (authors.length === 0) return 'Unbekannt'

  const formattedAuthors = authors.map(author => {
    if (author.name) return author.name

    const lastName = author.lastName || 'Unbekannt'
    const initials = author.firstName
      ?.split(/\s+/)
      .filter(Boolean)
      .map(name => `${name.charAt(0).toUpperCase()}.`)
      .join(' ')

    return initials ? `${lastName}, ${initials}` : lastName
  })

  if (formattedAuthors.length === 1) return formattedAuthors[0]
  if (formattedAuthors.length === 2) return `${formattedAuthors[0]}, & ${formattedAuthors[1]}`
  return `${formattedAuthors.slice(0, -1).join(', ')}, & ${formattedAuthors[formattedAuthors.length - 1]}`
}

function formatMlaAuthors(item: ZoteroItem): string {
  const authors = getAuthorNames(item)
  if (authors.length === 0) return 'Unbekannt'
  if (authors.length === 1) return authors[0]
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`
  return `${authors[0]} et al.`
}

function shortenTitle(title: string, maxLength = 50): string {
  if (title.length <= maxLength) return title
  return title.substring(0, maxLength - 3) + '...'
}

function sentenceWithPeriod(text?: string): string {
  const trimmed = text?.trim()
  if (!trimmed) return ''
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function formatApaReferenceDate(item: ZoteroItem): string {
  const parts = item.dateParts
  if (parts?.[0]) {
    const [year, month, day] = parts
    const monthNames = [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember'
    ]

    if (month && day) return `${year}, ${monthNames[month - 1]} ${day}`
    if (month) return `${year}, ${monthNames[month - 1]}`
    return `${year}`
  }

  return formatYear(item) || 'n.d.'
}

function isArxivIdentifier(value?: string): boolean {
  return Boolean(value?.trim().match(/^arxiv:/i))
}

function formatApaTitle(item: ZoteroItem): string {
  const title = item.title?.trim()
  if (!title) return ''

  const arxivIdentifier = [item.genre, item.number, item.archive]
    .find(value => isArxivIdentifier(value))

  if (arxivIdentifier) {
    return `${title} (${arxivIdentifier}).`
  }

  if (item.genre) {
    return `${title} [${item.genre}].`
  }

  return sentenceWithPeriod(title)
}

function formatApaSource(item: ZoteroItem): string {
  if (item.publicationTitle) return sentenceWithPeriod(item.publicationTitle)
  if (
    item.publisher?.toLowerCase() === 'arxiv' ||
    item.archive?.toLowerCase() === 'arxiv' ||
    isArxivIdentifier(item.genre) ||
    isArxivIdentifier(item.number)
  ) {
    return 'arXiv.'
  }
  if (item.publisher) return sentenceWithPeriod(item.publisher)
  return ''
}

function formatApaReference(result: ZoteroSearchResult): string {
  const { item } = result
  const parts = [
    `${sentenceWithPeriod(formatApaReferenceAuthors(item))} (${formatApaReferenceDate(item)}).`,
    formatApaTitle(item)
  ]
  const source = formatApaSource(item)
  if (source) parts.push(source)

  if (item.DOI) {
    parts.push(`https://doi.org/${item.DOI}`)
  } else if (item.URL) {
    parts.push(item.URL)
  }

  return parts.filter(Boolean).join(' ')
}

// Generiert Markdown-Zitation im Format (Autor, Jahr, "Titel")
export function generateCitation(result: ZoteroSearchResult, style: CitationStyle = 'mindgraph'): string {
  const { item } = result
  const authors = formatAuthors(item)
  const year = formatYear(item)
  const title = item.title || ''
  const shortTitle = shortenTitle(title)

  switch (style) {
    case 'mla':
      return `(${formatMlaAuthors(item)})`
    case 'chicago':
      if (shortTitle) return `${formatApaAuthors(item)}, "${shortTitle}"`
      return formatApaAuthors(item)
    case 'bibtex':
      return `@${result.citekey}`
    case 'pandoc':
      return `[@${result.citekey}]`
    case 'mindgraph':
    default:
      break
  }

  // Kürze den Titel auf max 50 Zeichen
  if (year && shortTitle) {
    return `(${authors}, ${year}, "${shortTitle}")`
  } else if (year) {
    return `(${authors}, ${year})`
  } else if (shortTitle) {
    return `(${authors}, "${shortTitle}")`
  }
  return `(${authors})`
}

export async function generateStyledCitation(result: ZoteroSearchResult, style: CitationStyle): Promise<string> {
  if (style === 'mindgraph' || style === 'bibtex' || style === 'pandoc') {
    return generateCitation(result, style)
  }

  try {
    const bibliography = await window.electronAPI.zoteroFormatBibliography(result.citekey, style, 'de-DE')
    if (bibliography) return bibliography
  } catch (error) {
    console.error('[Zotero] Styled citation error:', error)
  }

  if (style.endsWith('/apa') || style === 'apa') {
    return formatApaReference(result)
  }

  return generateCitation(result, 'mindgraph')
}

// Generiert Literaturnotiz-Template
export function generateLiteratureNote(result: ZoteroSearchResult): string {
  const { item, citekey } = result
  const authors = formatAuthors(item)
  const year = formatYear(item)

  let note = `---
title: "${item.title}"
citekey: ${citekey}
authors: ${item.creators?.map(c => c.lastName || c.name).join(', ') || 'Unbekannt'}
year: ${year}
type: ${item.itemType}
tags: [literatur${item.tags?.map(t => `, ${t.tag}`).join('') || ''}]
---

**Autoren:** ${authors}
**Jahr:** ${year}
**Typ:** ${item.itemType}
`

  if (item.publicationTitle) {
    note += `**Quelle:** ${item.publicationTitle}\n`
  }

  if (item.DOI) {
    note += `**DOI:** [${item.DOI}](https://doi.org/${item.DOI})\n`
  }

  if (item.URL) {
    note += `**URL:** ${item.URL}\n`
  }

  note += `
## Abstract

${item.abstractNote || '*Kein Abstract verfügbar*'}

## Zitate

`

  return note
}

// Generiert Literaturnotiz-Template mit Annotationen
export function generateLiteratureNoteWithAnnotations(result: ZoteroSearchResult, annotations: string[]): string {
  const { item, citekey } = result
  const authors = formatAuthors(item)
  const year = formatYear(item)

  let note = `---
title: "${item.title}"
citekey: ${citekey}
authors: ${item.creators?.map(c => c.lastName || c.name).join(', ') || 'Unbekannt'}
year: ${year}
type: ${item.itemType}
tags: [literatur${item.tags?.map(t => `, ${t.tag}`).join('') || ''}]
---

**Autoren:** ${authors}
**Jahr:** ${year}
**Typ:** ${item.itemType}
`

  if (item.publicationTitle) {
    note += `**Quelle:** ${item.publicationTitle}\n`
  }

  if (item.DOI) {
    note += `**DOI:** [${item.DOI}](https://doi.org/${item.DOI})\n`
  }

  if (item.URL) {
    note += `**URL:** ${item.URL}\n`
  }

  note += `
## Abstract

${item.abstractNote || '*Kein Abstract verfügbar*'}

## Zitate

`

  // Füge Annotationen hinzu - jedes Zitat als separater Blockquote
  if (annotations && annotations.length > 0) {
    for (const annotation of annotations) {
      // Teile den Annotation-Text in einzelne Zitate auf
      const quotes = annotation.split(/(?=„)|(?="[A-Z])/).filter(q => q.trim())

      const processQuote = (quoteText: string) => {
        const trimmedQuote = quoteText.trim()
        if (!trimmedQuote || trimmedQuote.match(/^Anmerkungen$/i) || trimmedQuote.match(/^\(\d+\.\d+\.\d+/)) {
          return
        }

        // Jede Zeile des Zitats mit > prefixen
        const quotedLines = trimmedQuote.split('\n').map(line => `> ${line}`).join('\n')
        note += `${quotedLines}\n\n`
      }

      if (quotes.length > 1) {
        for (const quote of quotes) {
          processQuote(quote)
        }
      } else {
        processQuote(annotation)
      }
    }
  } else {
    note += `*Keine Annotationen gefunden*\n`
  }

  return note
}

// Generiert Dateinamen für Literaturnotiz
export function generateLiteratureNoteFilename(result: ZoteroSearchResult): string {
  const { item } = result
  const year = formatYear(item)
  const firstAuthor = item.creators?.[0]?.lastName || item.creators?.[0]?.name || 'Unknown'

  // Bereinige den Titel für Dateinamen
  const cleanTitle = item.title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 50)

  return `${year} - ${firstAuthor} - ${cleanTitle}.md`
}
