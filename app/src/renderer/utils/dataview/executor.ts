/**
 * Dataview Query Executor
 * Executes parsed queries against the note collection
 */

import type {
  Note,
  NoteFrontmatter,
  DataviewQuery,
  DataviewResult,
  DataviewResultRow,
  DataviewFromClause,
  DataviewExpression,
  DataviewSort,
  NoteQueryMetadata
} from '../../../shared/types'
import { buildNoteQueryMetadata, getMetadataValue, normalizeValue, parseFrontmatter } from '../metadataExtractor'
import { executeFunction } from './functions'

export interface ExecutorOptions {
  tagIndex?: Map<string, Set<string>>       // tag -> noteIds
  folderIndex?: Map<string, Set<string>>    // folder -> noteIds
  frontmatterCache?: Map<string, NoteFrontmatter>  // noteId -> frontmatter
}

/**
 * Execute a Dataview query against a collection of notes
 */
export function executeQuery(
  query: DataviewQuery,
  notes: Note[],
  options: ExecutorOptions = {}
): DataviewResult {
  const startTime = Date.now()

  try {
    // Step 1: FROM - Filter by source
    let candidates = filterBySource(notes, query.from, options)

    // Step 2: Build metadata for each candidate
    const rows: DataviewResultRow[] = candidates.map(note => {
      // Use cached frontmatter if available, otherwise parse from content
      const frontmatter = options.frontmatterCache?.get(note.id) ?? parseFrontmatter(note.content)
      return {
        note,
        metadata: buildNoteQueryMetadata(note, frontmatter)
      }
    })

    // Step 3: WHERE - Filter by expression
    let filteredRows = rows
    if (query.where) {
      console.log('[Executor] WHERE clause, checking', rows.length, 'rows')
      if (rows.length > 0) {
        // Debug first row's metadata
        const firstRow = rows[0]
        console.log('[Executor] Sample note:', firstRow.note.title)
        console.log('[Executor] Sample frontmatter:', firstRow.metadata.frontmatter)
      }
      filteredRows = rows.filter(row => evaluateExpression(query.where!, row.metadata))
      console.log('[Executor] After WHERE filter:', filteredRows.length, 'rows')
    }

    // Step 4: SORT - Sort results
    if (query.sort && query.sort.length > 0) {
      filteredRows = sortRows(filteredRows, query.sort)
    }

    // Step 5: LIMIT - Limit results
    if (query.limit && query.limit > 0) {
      filteredRows = filteredRows.slice(0, query.limit)
    }

    // Step 6: Extract column values for TABLE queries
    if (query.type === 'TABLE' && query.fields) {
      for (const row of filteredRows) {
        row.values = {}
        for (const field of query.fields) {
          row.values[field] = getMetadataValue(row.metadata, field)
        }
      }
    }

    return {
      type: query.type,
      rows: filteredRows,
      columns: query.fields,
      executionTime: Date.now() - startTime
    }
  } catch (error) {
    return {
      type: query.type,
      rows: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime: Date.now() - startTime
    }
  }
}

/**
 * Filter notes by FROM clause (tags, folders, links)
 */
function filterBySource(
  notes: Note[],
  from: DataviewFromClause | undefined,
  options: ExecutorOptions
): Note[] {
  if (!from) {
    return notes
  }

  let result = new Set<Note>()
  let isFirst = true

  // Filter by tags
  if (from.tags && from.tags.length > 0) {
    const tagMatches = new Set<Note>()

    for (const tag of from.tags) {
      // Use index if available
      if (options.tagIndex) {
        const noteIds = options.tagIndex.get(tag) || options.tagIndex.get(tag.toLowerCase())
        if (noteIds) {
          for (const note of notes) {
            if (noteIds.has(note.id)) {
              tagMatches.add(note)
            }
          }
        }
      } else {
        // Fallback to linear search
        for (const note of notes) {
          if (note.tags.some(t => t.toLowerCase() === tag.toLowerCase())) {
            tagMatches.add(note)
          }
        }
      }
    }

    if (isFirst) {
      result = tagMatches
      isFirst = false
    } else {
      // Intersect with existing results
      result = new Set([...result].filter(n => tagMatches.has(n)))
    }
  }

  // Filter by folders
  if (from.folders && from.folders.length > 0) {
    const folderMatches = new Set<Note>()

    for (const folder of from.folders) {
      const normalizedFolder = folder.replace(/^\/|\/$/g, '') // Remove leading/trailing slashes
      console.log('[Executor] Filtering by folder:', normalizedFolder)

      // Use index if available
      if (options.folderIndex) {
        const noteIds = options.folderIndex.get(normalizedFolder)
        console.log('[Executor] Index lookup result:', noteIds?.size || 0, 'notes')
        console.log('[Executor] Checking against', notes.length, 'notes')
        if (noteIds && notes.length > 0) {
          console.log('[Executor] Sample index ID:', Array.from(noteIds)[0])
          console.log('[Executor] Sample note ID:', notes[0].id)
          for (const note of notes) {
            if (noteIds.has(note.id)) {
              folderMatches.add(note)
            }
          }
          console.log('[Executor] Folder matches after index lookup:', folderMatches.size)
        }
      } else {
        // Fallback to linear search - check if path contains the folder
        console.log('[Executor] Fallback search, sample note path:', notes[0]?.path)
        for (const note of notes) {
          const notePath = note.path
          // Check if note is in this folder (or a subfolder)
          // Support both relative and absolute paths
          if (notePath.includes(normalizedFolder + '/') || notePath.includes(normalizedFolder)) {
            folderMatches.add(note)
          }
        }
        console.log('[Executor] Folder matches:', folderMatches.size)
      }
    }

    if (isFirst) {
      result = folderMatches
      isFirst = false
    } else {
      result = new Set([...result].filter(n => folderMatches.has(n)))
    }
  }

  // Filter by links
  if (from.links) {
    const linkMatches = new Set<Note>()

    if (from.links.from && from.links.from.length > 0) {
      // Find notes that link FROM specified notes (outgoing links)
      for (const linkTarget of from.links.from) {
        const sourceNote = notes.find(n =>
          n.title.toLowerCase() === linkTarget.toLowerCase() ||
          n.path.toLowerCase().includes(linkTarget.toLowerCase())
        )

        if (sourceNote) {
          // Get all notes that this note links to
          for (const note of notes) {
            if (sourceNote.outgoingLinks.some(link =>
              note.title.toLowerCase() === link.toLowerCase() ||
              note.path.toLowerCase().includes(link.toLowerCase())
            )) {
              linkMatches.add(note)
            }
          }
        }
      }
    }

    if (from.links.to && from.links.to.length > 0) {
      // Find notes that link TO specified notes (incoming links)
      for (const linkTarget of from.links.to) {
        const targetNote = notes.find(n =>
          n.title.toLowerCase() === linkTarget.toLowerCase()
        )

        if (targetNote) {
          for (const note of notes) {
            if (note.incomingLinks.includes(targetNote.id)) {
              linkMatches.add(note)
            }
          }
        }
      }
    }

    if (isFirst) {
      result = linkMatches
      isFirst = false
    } else {
      result = new Set([...result].filter(n => linkMatches.has(n)))
    }
  }

  return isFirst ? notes : Array.from(result)
}

/**
 * Evaluate a WHERE expression against note metadata
 */
function evaluateExpression(expr: DataviewExpression, metadata: NoteQueryMetadata): boolean {
  switch (expr.type) {
    case 'comparison':
      return evaluateComparison(expr, metadata)

    case 'logical':
      const left = evaluateExpression(expr.left, metadata)
      const right = evaluateExpression(expr.right, metadata)
      return expr.operator === 'AND' ? left && right : left || right

    case 'not':
      return !evaluateExpression(expr.expression, metadata)

    case 'function':
      // Function calls in boolean context are truthy checks
      const result = executeFunction(expr.name, metadata, resolveArgs(expr.args, metadata))
      return !!result

    case 'field':
      // Field reference - truthy check
      const value = getMetadataValue(metadata, expr.name)
      return !!value

    case 'literal':
      return !!expr.value

    default:
      return false
  }
}

/**
 * Evaluate a comparison expression
 */
function evaluateComparison(
  expr: DataviewExpression & { type: 'comparison' },
  metadata: NoteQueryMetadata
): boolean {
  // Handle function comparisons
  if (expr.field.startsWith('__func__')) {
    const funcValue = expr.value as { funcExpr: DataviewExpression; compareValue: unknown }
    if (funcValue.funcExpr && funcValue.funcExpr.type === 'function') {
      const funcResult = executeFunction(
        funcValue.funcExpr.name,
        metadata,
        resolveArgs(funcValue.funcExpr.args, metadata)
      )
      return compareValues(funcResult, expr.operator, funcValue.compareValue)
    }
    return false
  }

  const fieldValue = getMetadataValue(metadata, expr.field)
  let compareValue = expr.value

  // If compare value is a function expression, evaluate it
  if (typeof compareValue === 'object' && compareValue !== null && 'type' in (compareValue as object)) {
    const exprValue = compareValue as DataviewExpression
    if (exprValue.type === 'function') {
      compareValue = executeFunction(exprValue.name, metadata, resolveArgs(exprValue.args, metadata))
    }
  }

  return compareValues(fieldValue, expr.operator, compareValue)
}

/**
 * Compare two values with an operator
 */
function compareValues(fieldValue: unknown, operator: string, compareValue: unknown): boolean {
  // Normalize values for comparison
  const normalizedField = normalizeValue(fieldValue)
  const normalizedCompare = normalizeValue(compareValue)

  switch (operator) {
    case '=':
      if (normalizedField === undefined || normalizedField === null) {
        return normalizedCompare === undefined || normalizedCompare === null
      }
      return normalizedField === normalizedCompare

    case '!=':
      if (normalizedField === undefined || normalizedField === null) {
        return normalizedCompare !== undefined && normalizedCompare !== null
      }
      return normalizedField !== normalizedCompare

    case '>':
      if (normalizedField === undefined || normalizedField === null) return false
      return normalizedField > normalizedCompare!

    case '<':
      if (normalizedField === undefined || normalizedField === null) return false
      return normalizedField < normalizedCompare!

    case '>=':
      if (normalizedField === undefined || normalizedField === null) return false
      return normalizedField >= normalizedCompare!

    case '<=':
      if (normalizedField === undefined || normalizedField === null) return false
      return normalizedField <= normalizedCompare!

    case 'contains':
      if (Array.isArray(fieldValue)) {
        if (typeof compareValue === 'string') {
          return fieldValue.some(item =>
            String(item).toLowerCase().includes(compareValue.toLowerCase())
          )
        }
        return fieldValue.includes(compareValue)
      }
      if (typeof fieldValue === 'string') {
        return fieldValue.toLowerCase().includes(String(compareValue).toLowerCase())
      }
      return false

    default:
      return false
  }
}

/**
 * Resolve function arguments (replace field references with values)
 */
function resolveArgs(args: unknown[], metadata: NoteQueryMetadata): unknown[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      // Check if it's a special keyword
      if (arg === 'today' || arg === 'now') {
        return arg
      }
      // Could be a field path - we keep it as string and let the function resolve it
      return arg
    }
    if (typeof arg === 'object' && arg !== null && 'type' in arg) {
      const expr = arg as DataviewExpression
      if (expr.type === 'function') {
        return executeFunction(expr.name, metadata, resolveArgs(expr.args as unknown[], metadata))
      }
      if (expr.type === 'field') {
        return getMetadataValue(metadata, expr.name)
      }
    }
    return arg
  })
}

/**
 * Sort result rows by sort criteria
 */
function sortRows(rows: DataviewResultRow[], sorts: DataviewSort[]): DataviewResultRow[] {
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const aValue = getMetadataValue(a.metadata, sort.field)
      const bValue = getMetadataValue(b.metadata, sort.field)

      const normalizedA = normalizeValue(aValue)
      const normalizedB = normalizeValue(bValue)

      // Handle null/undefined
      if (normalizedA === undefined || normalizedA === null) {
        if (normalizedB === undefined || normalizedB === null) continue
        return sort.direction === 'ASC' ? 1 : -1
      }
      if (normalizedB === undefined || normalizedB === null) {
        return sort.direction === 'ASC' ? -1 : 1
      }

      // Compare
      let comparison = 0
      if (normalizedA < normalizedB) comparison = -1
      else if (normalizedA > normalizedB) comparison = 1

      if (comparison !== 0) {
        return sort.direction === 'DESC' ? -comparison : comparison
      }
    }
    return 0
  })
}
