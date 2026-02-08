import * as path from 'path'
import * as fs from 'fs/promises'
import AdmZip from 'adm-zip'
import initSqlJs from 'sql.js'

export interface AnkiImportResult {
  cards: Array<{
    front: string
    back: string
    topic: string
    sourceNote: string
  }>
  mediaCount: number
  deckNames: string[]
}

interface AnkiModel {
  name: string
  flds: Array<{ name: string; ord: number }>
  tmpls: Array<{ name: string; qfmt: string; afmt: string; ord: number }>
  type: number // 0 = standard, 1 = cloze
}

interface AnkiDeck {
  name: string
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function parseAnkiPackage(
  filePath: string,
  vaultPath: string
): Promise<AnkiImportResult> {
  const zip = new AdmZip(filePath)
  const entries = zip.getEntries()

  // Find SQLite database
  const dbEntry = entries.find(
    (e) =>
      e.entryName === 'collection.anki2' ||
      e.entryName === 'collection.anki21' ||
      e.entryName === 'collection.anki21b'
  )
  if (!dbEntry) throw new Error('No Anki database found in .apkg file')

  // Media mapping
  const mediaEntry = entries.find((e) => e.entryName === 'media')
  let mediaMapping: Record<string, string> = {}
  if (mediaEntry) {
    try {
      mediaMapping = JSON.parse(mediaEntry.getData().toString('utf-8'))
    } catch {
      /* ignore bad media json */
    }
  }

  // Init sql.js
  const SQL = await initSqlJs()
  const db = new SQL.Database(dbEntry.getData())

  try {
    // Parse collection metadata
    const colRows = db.exec('SELECT models, decks FROM col')
    if (!colRows.length || !colRows[0].values.length) {
      throw new Error('Empty collection table')
    }

    const models: Record<string, AnkiModel> = JSON.parse(
      colRows[0].values[0][0] as string
    )
    const decks: Record<string, AnkiDeck> = JSON.parse(
      colRows[0].values[0][1] as string
    )

    // Extract media files
    const mediaCount = await extractMedia(zip, mediaMapping, vaultPath, entries)

    // Parse cards
    const cards = parseCards(db, models, decks, mediaMapping)

    const deckNames = [...new Set(cards.map((c) => c.topic))]
    return { cards, mediaCount, deckNames }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Card parsing
// ---------------------------------------------------------------------------

function parseCards(
  db: ReturnType<InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>['prototype']['constructor']>,
  models: Record<string, AnkiModel>,
  decks: Record<string, AnkiDeck>,
  mediaMapping: Record<string, string>
): AnkiImportResult['cards'] {
  const rows = db.exec(
    'SELECT c.ord, c.did, n.flds, n.mid FROM cards c JOIN notes n ON c.nid = n.id'
  )
  if (!rows.length) return []

  const cards: AnkiImportResult['cards'] = []

  for (const row of rows[0].values) {
    const ord = row[0] as number
    const did = String(row[1])
    const flds = (row[2] as string).split('\x1f')
    const mid = String(row[3])

    const model = models[mid]
    if (!model) continue

    const deck = decks[did]
    const deckName = deck ? cleanDeckName(deck.name) : 'Anki Import'

    let front = ''
    let back = ''

    if (model.type === 1) {
      // Cloze model
      const result = convertCloze(flds, model, ord)
      front = result.front
      back = result.back
    } else {
      // Standard model
      const tmpl = model.tmpls.find((t) => t.ord === ord) || model.tmpls[0]
      if (!tmpl) continue
      const result = renderTemplate(flds, model, tmpl, mediaMapping)
      front = result.front
      back = result.back
    }

    // Clean up
    front = stripHtml(front, mediaMapping).trim()
    back = stripHtml(back, mediaMapping).trim()

    if (!front && !back) continue

    cards.push({
      front,
      back,
      topic: deckName,
      sourceNote: `Anki Import: ${deckName}`
    })
  }

  return cards
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

function renderTemplate(
  fields: string[],
  model: AnkiModel,
  tmpl: { qfmt: string; afmt: string },
  _mediaMapping: Record<string, string>
): { front: string; back: string } {
  const fieldMap: Record<string, string> = {}
  for (const fld of model.flds) {
    fieldMap[fld.name] = fields[fld.ord] || ''
  }

  let front = substituteFields(tmpl.qfmt, fieldMap)
  let back = substituteFields(tmpl.afmt, fieldMap)

  // Replace {{FrontSide}} in answer with rendered front
  back = back.replace(/\{\{FrontSide\}\}/gi, front)

  return { front, back }
}

function substituteFields(
  template: string,
  fieldMap: Record<string, string>
): string {
  let result = template

  // Handle conditional sections: {{#FieldName}}...{{/FieldName}}
  result = result.replace(
    /\{\{#(.+?)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, fieldName, content) => {
      const value = fieldMap[fieldName.trim()]
      return value && value.trim() ? content : ''
    }
  )

  // Handle inverted conditionals: {{^FieldName}}...{{/FieldName}}
  result = result.replace(
    /\{\{\^(.+?)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, fieldName, content) => {
      const value = fieldMap[fieldName.trim()]
      return !value || !value.trim() ? content : ''
    }
  )

  // Replace {{FieldName}} and {{type:FieldName}}
  result = result.replace(/\{\{(?:type:)?(.+?)\}\}/g, (_match, fieldName) => {
    const trimmed = fieldName.trim()
    if (trimmed === 'FrontSide') return '{{FrontSide}}' // preserve for later
    return fieldMap[trimmed] || ''
  })

  return result
}

// ---------------------------------------------------------------------------
// Cloze conversion
// ---------------------------------------------------------------------------

function convertCloze(
  fields: string[],
  model: AnkiModel,
  ord: number
): { front: string; back: string } {
  // Cloze uses the first field typically
  const text = fields[0] || ''
  const clozeNum = ord + 1 // Anki ord is 0-based, cloze numbers are 1-based

  // Front: replace target cloze with [...] or [hint], show others as plain text
  let front = text.replace(
    /\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g,
    (_match, num, answer, hint) => {
      if (parseInt(num) === clozeNum) {
        return hint ? `[${hint}]` : '[...]'
      }
      return answer // show other clozes as plain text
    }
  )

  // Back: reveal target cloze answer, show others as plain text
  let back = text.replace(
    /\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g,
    (_match, _num, answer) => {
      return answer
    }
  )

  // Add extra fields to back if present
  if (fields.length > 1 && model.flds.length > 1) {
    const extraField = model.flds.find(
      (f) => f.name.toLowerCase() === 'extra' || f.name.toLowerCase() === 'back extra'
    )
    if (extraField && fields[extraField.ord]) {
      back += '\n\n' + fields[extraField.ord]
    }
  }

  return { front, back }
}

// ---------------------------------------------------------------------------
// HTML → plain text / basic markdown
// ---------------------------------------------------------------------------

function stripHtml(
  html: string,
  mediaMapping: Record<string, string>
): string {
  let text = html

  // Convert images to markdown
  text = text.replace(
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    (_match, src) => {
      // Resolve media filename
      const filename = resolveMediaFilename(src, mediaMapping)
      return `![](attachments/${filename})`
    }
  )

  // Bold
  text = text.replace(/<\/?(?:b|strong)>/gi, '**')

  // Italic
  text = text.replace(/<\/?(?:i|em)>/gi, '*')

  // Line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n\n')
  text = text.replace(/<\/li>/gi, '\n')

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = decodeHtmlEntities(text)

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/[ \t]+/g, ' ')

  return text.trim()
}

function resolveMediaFilename(
  src: string,
  mediaMapping: Record<string, string>
): string {
  // src might be a number (referencing media mapping) or a filename
  if (mediaMapping[src]) return mediaMapping[src]

  // Check reverse: src is already the filename
  for (const [, filename] of Object.entries(mediaMapping)) {
    if (filename === src) return filename
  }

  return src
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(parseInt(dec)))
}

// ---------------------------------------------------------------------------
// Media extraction
// ---------------------------------------------------------------------------

async function extractMedia(
  zip: AdmZip,
  mediaMapping: Record<string, string>,
  vaultPath: string,
  entries: AdmZip.IZipEntry[]
): Promise<number> {
  if (Object.keys(mediaMapping).length === 0) return 0

  const attachmentsDir = path.join(vaultPath, 'attachments')
  await fs.mkdir(attachmentsDir, { recursive: true })

  let count = 0

  for (const [numId, filename] of Object.entries(mediaMapping)) {
    // Only extract image files
    const ext = path.extname(filename).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'].includes(ext)) {
      continue
    }

    const entry = entries.find((e) => e.entryName === numId)
    if (!entry) continue

    const targetPath = path.join(attachmentsDir, filename)

    // Avoid overwriting existing files
    try {
      await fs.access(targetPath)
      // File exists, skip
    } catch {
      // File doesn't exist, write it
      await fs.writeFile(targetPath, entry.getData())
      count++
    }
  }

  return count
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanDeckName(name: string): string {
  // Anki uses "::" as deck hierarchy separator
  // Take the last part as the topic name
  const parts = name.split('::')
  return parts[parts.length - 1].trim()
}
