import type { EdooboxEvent, EdooboxEventDate, EdooboxSpeaker, EdooboxImportResult } from '../shared/types'
import { randomUUID } from 'crypto'
import path from 'path'

// Label patterns for German Akkreditierungsformulare (fuzzy matching)
// Priority order matters: more specific patterns first
const TABLE_LABEL_PATTERNS: Array<{ field: string; patterns: RegExp[] }> = [
  // Very specific labels first (to avoid false matches)
  { field: 'title', patterns: [/titel des angebots/i, /veranstaltungstitel/i, /titel/i, /thema/i] },
  { field: 'description', patterns: [/text für die veröffentlichung/i, /beschreibung des inhalts/i, /beschreibung/i, /inhalt(?:e)?$/i, /zusammenfassung/i, /abstract/i] },
  { field: 'maxParticipants', patterns: [/teilnehmerzahl/i, /max(?:imale?)?\s*(?:teilnehmer|plätze)/i] },
  { field: 'termine', patterns: [/^termine$/i] },
  { field: 'location', patterns: [/veranstaltungsort/i, /^ort$/i, /standort/i, /location/i] },
  { field: 'speakers', patterns: [/referent/i, /teamer/i, /dozent/i, /sprecher/i] },
  { field: 'contact', patterns: [/verantwortliche/i, /ansprechpartner/i, /kontakt/i] },
  { field: 'category', patterns: [/^kategorie/i, /fachbereich/i, /themenfeld/i] },
  { field: 'price', patterns: [/eigenanteil der teilnehmer/i, /teilnahmegebühr/i, /^preis$/i, /^kosten$/i] },
  { field: 'duration', patterns: [/dauer/i] },
  { field: 'method', patterns: [/methodische gestaltung/i] },
  { field: 'skills', patterns: [/fähigkeiten/i, /fertigkeiten/i] },
  { field: 'prerequisites', patterns: [/voraussetzungen/i] },
  { field: 'subjects', patterns: [/fächer/i, /berufsfelder/i] },
  { field: 'schoolTypes', patterns: [/schulformen/i] },
  { field: 'targetGroups', patterns: [/^zielgruppen$/i] },
  { field: 'partner', patterns: [/kooperationspartner/i] },
  { field: 'notes', patterns: [/^hinweise$/i] },
]

function matchTableLabel(text: string): string | null {
  // Clean: strip parenthesized hints, extra whitespace, trailing colons
  const cleaned = text
    .replace(/\(.*?\)/gs, '')
    .replace(/\n/g, ' ')
    .replace(/[:\s]+$/, '')
    .trim()

  for (const { field, patterns } of TABLE_LABEL_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(cleaned)) {
        return field
      }
    }
  }
  return null
}

function parseDate(text: string): string | null {
  // DD.MM.YYYY
  const match1 = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (match1) {
    return `${match1[3]}-${match1[2].padStart(2, '0')}-${match1[1].padStart(2, '0')}`
  }
  // YYYY-MM-DD
  const match2 = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match2) {
    return match2[0]
  }
  return null
}

function parseTime(text: string): string | null {
  const match = text.match(/(\d{1,2})[:.h](\d{2})/)
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`
  }
  return null
}

function parseMaxParticipants(text: string): number | null {
  // Try "maximal: 24" pattern first
  const maxMatch = text.match(/maximal[:\s]*(\d+)/i)
  if (maxMatch) return parseInt(maxMatch[1], 10)
  // Fall back to last number
  const numbers = text.match(/\d+/g)
  return numbers ? parseInt(numbers[numbers.length - 1], 10) : null
}

function parsePrice(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d{1,2})?)/)
  if (match) {
    return parseFloat(match[1].replace(',', '.'))
  }
  return null
}

/** Stop pattern: known sub-labels that appear after the value we want */
const SUB_LABEL_STOP = /(?:Straße|PLZ|Tel\.?-?Nr|E-Mail|Pers\.?-?Nr|Dienststelle|Raum|Bezeichnung|Kontoinhaber|IBAN|BIC)/

function extractAfterLabel(text: string, labelRegex: RegExp): string {
  const match = text.match(labelRegex)
  if (!match) return ''
  let value = match[1].trim()
  // Cut off at the next known sub-label
  const stopMatch = value.match(SUB_LABEL_STOP)
  if (stopMatch) {
    value = value.slice(0, stopMatch.index).trim()
  }
  return value
}

function parseSpeakersFromCell(text: string): EdooboxSpeaker[] {
  const speakers: EdooboxSpeaker[] = []

  // Look for "Name, Vorname: Lastname, Firstname" patterns
  const nameRegex = /Name,\s*Vorname:\s*(.+?)(?=Straße|Tel|E-Mail|Pers|Dienst|Name,\s*Vorname:|$)/gi
  let m: RegExpExecArray | null
  while ((m = nameRegex.exec(text)) !== null) {
    const nameValue = m[1].trim()
    if (!nameValue || nameValue.length < 2) continue
    speakers.push({ name: nameValue })
  }

  return speakers
}

function parseContactFromCell(text: string): string {
  const name = extractAfterLabel(text, /Name,\s*Vorname:\s*(.+)/i)
  return name || text.replace(/\n/g, ' ').trim()
}

function parseLocationFromCell(text: string): string {
  const parts: string[] = []

  const bezeichnung = extractAfterLabel(text, /Bezeichnung:\s*(.+)/i)
  if (bezeichnung) parts.push(bezeichnung)

  const strasse = extractAfterLabel(text, /Straße:\s*(.+)/i)
  if (strasse) parts.push(strasse)

  const plzOrt = extractAfterLabel(text, /PLZ\/Ort:\s*(.+)/i)
  if (plzOrt) parts.push(plzOrt)

  const raum = extractAfterLabel(text, /Raum:\s*(.+)/i)
  if (raum) parts.push(`Raum: ${raum}`)

  return parts.length > 0 ? parts.join(', ') : text.replace(/\n/g, ' ').trim()
}

/** Parse "am: DD.MM.YYYY von HH:MM Uhr bis HH:MM Uhr" patterns from Termine rows */
function parseTermineRows(rows: string[][]): EdooboxEventDate[] {
  const dates: EdooboxEventDate[] = []

  for (const row of rows) {
    // Join all cells in the row
    const text = row.join(' ')

    // Match "am: DD.MM.YYYY von HH:MM bis HH:MM"
    const dateStr = parseDate(text)
    if (!dateStr) continue

    // Extract times: "von HH:MM" and "bis HH:MM"
    const vonMatch = text.match(/von\s+(\d{1,2}[:.]\d{2})/i)
    const bisMatch = text.match(/bis\s+(\d{1,2}[:.]\d{2})/i)

    dates.push({
      date: dateStr,
      startTime: (vonMatch && parseTime(vonMatch[1])) || '09:00',
      endTime: (bisMatch && parseTime(bisMatch[1])) || '17:00'
    })
  }

  return dates
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

export async function parseAkkreditierungsformular(filePath: string): Promise<EdooboxImportResult> {
  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml({ path: filePath })
  const html = result.value

  const warnings: string[] = []
  const fields: Record<string, string> = {}

  // --- Strategy 1: Parse HTML tables (label cell + value cell) ---
  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || []
  let terminRows: string[][] = []
  let inTermine = false

  for (const table of tables) {
    const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []

    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [])
        .map(c => stripHtml(c))
        .filter(c => c.length > 0)

      if (cells.length === 0) continue

      const labelText = cells[0]
      const valueText = cells.length > 1 ? cells[1] : ''

      // Check if we're in the Termine section (collect date rows)
      if (inTermine) {
        // Termine rows continue until a new labeled row (like "Anmeldeschluss" or "Veranstaltungsort")
        const field = matchTableLabel(labelText)
        if (field && field !== 'termine') {
          inTermine = false
          // Process collected rows
          // Fall through to normal processing below
        } else if (labelText.match(/^am:/i) || parseDate(cells.join(' '))) {
          terminRows.push(cells)
          continue
        } else {
          inTermine = false
        }
      }

      const field = matchTableLabel(labelText)
      if (!field) continue

      // Special handling for Termine
      if (field === 'termine') {
        inTermine = true
        terminRows = []
        // The first row might already contain date data
        if (valueText && parseDate(valueText)) {
          terminRows.push(cells)
        }
        continue
      }

      // Skip if no value
      if (!valueText) continue

      // Don't overwrite already-found fields (first match wins)
      if (fields[field]) continue

      fields[field] = valueText
    }
  }

  // --- Strategy 2: Fallback line-by-line parsing for non-table documents ---
  if (Object.keys(fields).length === 0) {
    const lines = html
      .replace(/<img[^>]*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Try "Label: Value" on same line
      const colonMatch = line.match(/^([^:]{2,40}):\s*(.+)$/)
      if (colonMatch) {
        const field = matchTableLabel(colonMatch[1])
        if (field && colonMatch[2].trim()) {
          fields[field] = colonMatch[2].trim()
          continue
        }
      }

      // Try label on one line, value on next
      const field = matchTableLabel(line)
      if (field && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim()
        if (nextLine && !matchTableLabel(nextLine)) {
          fields[field] = nextLine
          i++
        }
      }
    }
  }

  // --- Build event ---
  const dates = parseTermineRows(terminRows)

  if (dates.length === 0) {
    // Try to parse date from date field (fallback)
    if (fields.termine) {
      const d = parseDate(fields.termine)
      if (d) {
        dates.push({ date: d, startTime: '09:00', endTime: '17:00' })
      }
    }
  }

  if (dates.length === 0) {
    warnings.push('Kein Datum gefunden — bitte manuell ergänzen')
    dates.push({ date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '17:00' })
  }

  const title = fields.title || ''
  if (!title) {
    warnings.push('Kein Titel gefunden — bitte manuell ergänzen')
  }

  // Parse speakers from the raw cell text
  const speakers = fields.speakers ? parseSpeakersFromCell(fields.speakers) : []

  // Parse location
  const location = fields.location ? parseLocationFromCell(fields.location) : undefined

  // Parse contact
  const contact = fields.contact ? parseContactFromCell(fields.contact) : undefined

  // Parse maxParticipants
  const maxParticipants = fields.maxParticipants ? (parseMaxParticipants(fields.maxParticipants) ?? undefined) : undefined

  // Parse price from eigenanteil field
  let price: number | undefined
  if (fields.price) {
    // "Nein" means no cost
    if (/nein/i.test(fields.price)) {
      price = 0
    } else {
      price = parsePrice(fields.price) ?? undefined
    }
  }

  const event: EdooboxEvent = {
    id: randomUUID(),
    title,
    description: fields.description || '',
    maxParticipants,
    dates,
    location,
    speakers,
    contact,
    price,
    category: fields.category || undefined,
    status: 'imported',
    importedAt: new Date().toISOString(),
    sourceFile: path.basename(filePath)
  }

  if (!fields.description) warnings.push('Keine Beschreibung gefunden')
  if (!fields.location) warnings.push('Kein Ort gefunden')
  if (speakers.length === 0) warnings.push('Keine Referenten gefunden')

  return { event, warnings }
}
