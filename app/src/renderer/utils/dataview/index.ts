/**
 * Dataview Query System - Public API
 *
 * A Dataview-like query system for MindGraph Notes.
 * Supports LIST, TABLE, and TASK queries with FROM, WHERE, SORT, and LIMIT clauses.
 *
 * Example usage:
 *
 * ```dataview
 * LIST FROM #project
 * ```
 *
 * ```dataview
 * TABLE status, deadline, priority
 * FROM "Work/Projects"
 * WHERE !completed AND priority >= 2
 * SORT deadline ASC
 * LIMIT 10
 * ```
 */

export { Parser, ParseError } from './parser'
export { Lexer, type Token, type TokenType } from './lexer'
export { executeQuery, type ExecutorOptions } from './executor'
export { executeFunction, hasFunction } from './functions'
export { renderResult, type RendererOptions } from './renderer'

import { Parser, ParseError } from './parser'
import { executeQuery, ExecutorOptions } from './executor'
import { renderResult, RendererOptions } from './renderer'
import type { Note, DataviewQuery, DataviewResult } from '../../../shared/types'

/**
 * Parse and execute a Dataview query in one step
 */
export function runQuery(
  queryString: string,
  notes: Note[],
  executorOptions?: ExecutorOptions
): DataviewResult {
  try {
    const parser = new Parser()
    const query = parser.parse(queryString)
    return executeQuery(query, notes, executorOptions)
  } catch (error) {
    if (error instanceof ParseError) {
      return {
        type: 'LIST',
        rows: [],
        error: `Parse error at position ${error.position}: ${error.message}`
      }
    }
    return {
      type: 'LIST',
      rows: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Parse, execute, and render a Dataview query in one step
 */
export function runAndRenderQuery(
  queryString: string,
  notes: Note[],
  executorOptions?: ExecutorOptions,
  renderOptions?: RendererOptions
): string {
  const result = runQuery(queryString, notes, executorOptions)
  return renderResult(result, renderOptions)
}

/**
 * Parse a query without executing it (for validation)
 */
export function parseQuery(queryString: string): DataviewQuery | { error: string } {
  try {
    const parser = new Parser()
    return parser.parse(queryString)
  } catch (error) {
    if (error instanceof ParseError) {
      return { error: `Parse error at position ${error.position}: ${error.message}` }
    }
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Check if a string is a valid Dataview query
 */
export function isValidQuery(queryString: string): boolean {
  const result = parseQuery(queryString)
  return !('error' in result)
}
