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
  itemType: string
  abstractNote?: string
  DOI?: string
  URL?: string
  publicationTitle?: string
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

// Generiert Markdown-Zitation im Format (Autor, Jahr, "Titel")
export function generateCitation(result: ZoteroSearchResult): string {
  const { item } = result
  const authors = formatAuthors(item)
  const year = formatYear(item)

  // Kürze den Titel auf max 50 Zeichen
  let shortTitle = item.title || ''
  if (shortTitle.length > 50) {
    shortTitle = shortTitle.substring(0, 47) + '...'
  }

  if (year && shortTitle) {
    return `(${authors}, ${year}, "${shortTitle}")`
  } else if (year) {
    return `(${authors}, ${year})`
  } else if (shortTitle) {
    return `(${authors}, "${shortTitle}")`
  }
  return `(${authors})`
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
  const { item, citekey } = result
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
