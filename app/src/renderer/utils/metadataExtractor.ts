import type { Note, NoteFrontmatter, InlineField, FileMetadata, NoteQueryMetadata } from '../../shared/types'

/**
 * Parse YAML frontmatter from note content
 * Supports common YAML types: strings, numbers, booleans, arrays, dates
 */
export function parseFrontmatter(content: string): NoteFrontmatter {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return {}
  }

  const yamlContent = match[1]
  const result: NoteFrontmatter = {}

  // Parse line by line
  const lines = yamlContent.split('\n')
  let currentKey: string | null = null
  let arrayValues: string[] = []
  let inArray = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip empty lines
    if (!line.trim()) continue

    // Check for array item (starts with -)
    if (inArray && /^\s+-\s+(.*)$/.test(line)) {
      const itemMatch = line.match(/^\s+-\s+(.*)$/)
      if (itemMatch) {
        arrayValues.push(parseValue(itemMatch[1].trim()) as string)
      }
      continue
    } else if (inArray) {
      // End of array
      if (currentKey) {
        result[currentKey.toLowerCase()] = arrayValues
      }
      inArray = false
      arrayValues = []
    }

    // Check for key: value (support Unicode characters like umlauts)
    const keyValueMatch = line.match(/^([a-zA-ZäöüÄÖÜß_][\wäöüÄÖÜß-]*)\s*:\s*(.*)$/)
    if (keyValueMatch) {
      const key = keyValueMatch[1].toLowerCase()
      const rawValue = keyValueMatch[2].trim()

      // Check if this starts an array
      if (rawValue === '' || rawValue === '[]') {
        // Could be start of array (next lines with -) or empty value
        currentKey = key
        inArray = rawValue === ''
        arrayValues = []

        // Handle empty array []
        if (rawValue === '[]') {
          result[key] = []
        }
        continue
      }

      // Check for inline array: [item1, item2]
      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const arrayContent = rawValue.slice(1, -1)
        const items = parseInlineArray(arrayContent)
        result[key] = items
        continue
      }

      // Parse single value
      result[key] = parseValue(rawValue)
      currentKey = key
    }
  }

  // Handle trailing array
  if (inArray && currentKey) {
    result[currentKey.toLowerCase()] = arrayValues
  }

  return result
}

/**
 * Parse a YAML value to the appropriate JS type
 */
function parseValue(value: string): unknown {
  // Remove surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }

  // Boolean
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false

  // Null
  if (value.toLowerCase() === 'null' || value === '~') return null

  // Number
  const num = Number(value)
  if (!isNaN(num) && value !== '') {
    return num
  }

  // ISO Date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value + 'T00:00:00')
    if (!isNaN(date.getTime())) {
      return date
    }
  }

  // ISO DateTime
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const date = new Date(value)
    if (!isNaN(date.getTime())) {
      return date
    }
  }

  // Return as string
  return value
}

/**
 * Parse inline array content: "item1, item2, item3"
 */
function parseInlineArray(content: string): unknown[] {
  const items: unknown[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''

  for (let i = 0; i < content.length; i++) {
    const char = content[i]

    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true
      quoteChar = char
      current += char
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false
      current += char
    } else if (!inQuotes && char === ',') {
      if (current.trim()) {
        items.push(parseValue(current.trim()))
      }
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) {
    items.push(parseValue(current.trim()))
  }

  return items
}

/**
 * Extract inline fields from note content
 * Formats: Key:: Value and [key:: value]
 * (v2 feature - currently returns empty array)
 */
export function extractInlineFields(content: string): InlineField[] {
  const fields: InlineField[] = []
  const lines = content.split('\n')

  // Skip frontmatter
  let inFrontmatter = false
  let startLine = 0

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (i === 0) {
        inFrontmatter = true
      } else if (inFrontmatter) {
        startLine = i + 1
        break
      }
    }
  }

  // Simple inline field pattern: Key:: Value (at end of line or standalone)
  // Support Unicode characters like umlauts
  const inlinePattern = /([a-zA-ZäöüÄÖÜß_][\wäöüÄÖÜß-]*)::[\s]*([^\]]*?)(?:\]|$)/g

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    let match

    // Pattern: Key:: Value (support Unicode)
    const simpleMatch = line.match(/([a-zA-ZäöüÄÖÜß_][\wäöüÄÖÜß-]*)::[\s]*(.+)$/)
    if (simpleMatch) {
      fields.push({
        key: simpleMatch[1].toLowerCase(),
        value: simpleMatch[2].trim(),
        line: i
      })
      continue
    }

    // Pattern: [key:: value]
    inlinePattern.lastIndex = 0
    while ((match = inlinePattern.exec(line)) !== null) {
      if (match[1] && match[2]) {
        fields.push({
          key: match[1].toLowerCase(),
          value: match[2].trim(),
          line: i
        })
      }
    }
  }

  return fields
}

/**
 * Build complete NoteQueryMetadata from a Note
 */
export function buildNoteQueryMetadata(note: Note, frontmatter?: NoteFrontmatter): NoteQueryMetadata {
  // Parse frontmatter if not provided
  const fm = frontmatter ?? parseFrontmatter(note.content)

  // Extract inline fields
  const inlineFields = extractInlineFields(note.content)

  // Build fields record from inline fields
  const fields: Record<string, unknown> = {}
  for (const field of inlineFields) {
    // If same key appears multiple times, make it an array
    if (fields[field.key]) {
      if (Array.isArray(fields[field.key])) {
        (fields[field.key] as string[]).push(field.value)
      } else {
        fields[field.key] = [fields[field.key] as string, field.value]
      }
    } else {
      fields[field.key] = field.value
    }
  }

  // Build file metadata
  const pathParts = note.path.split('/')
  const fileName = pathParts.pop() || note.path
  const folder = pathParts.join('/') || '/'

  const file: FileMetadata = {
    name: fileName.replace(/\.md$/, ''),
    path: note.path,
    folder,
    ext: '.md',
    ctime: note.createdAt,
    mtime: note.modifiedAt,
    tags: note.tags,
    outlinks: note.outgoingLinks,
    inlinks: note.incomingLinks
  }

  return {
    file,
    frontmatter: fm,
    fields
  }
}

/**
 * Get a value from metadata using dot notation (e.g., "file.name", "status")
 */
export function getMetadataValue(metadata: NoteQueryMetadata, path: string): unknown {
  // Handle file.* fields
  if (path.startsWith('file.')) {
    const key = path.slice(5) as keyof FileMetadata
    return metadata.file[key]
  }

  // Check frontmatter first, then inline fields
  if (metadata.frontmatter[path] !== undefined) {
    return metadata.frontmatter[path]
  }

  if (metadata.fields[path] !== undefined) {
    return metadata.fields[path]
  }

  return undefined
}

/**
 * Normalize a value for comparison (handle dates, strings, etc.)
 */
export function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'string') {
    // Try to parse as date
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(value + 'T00:00:00')
      if (!isNaN(date.getTime())) {
        return date.getTime()
      }
    }
    return value.toLowerCase()
  }
  return value
}
