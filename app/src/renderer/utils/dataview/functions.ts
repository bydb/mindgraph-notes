/**
 * Dataview Built-in Functions
 * Functions that can be used in WHERE clauses
 */

import type { NoteQueryMetadata } from '../../../shared/types'
import { getMetadataValue } from '../metadataExtractor'

export type DataviewFunction = (
  metadata: NoteQueryMetadata,
  args: unknown[]
) => unknown

/**
 * contains(field, value) - Check if array/string contains value
 */
function fnContains(metadata: NoteQueryMetadata, args: unknown[]): boolean {
  if (args.length < 2) return false

  const fieldPath = args[0] as string
  const searchValue = args[1]

  const fieldValue = getMetadataValue(metadata, fieldPath)

  if (Array.isArray(fieldValue)) {
    // Check if array contains the value
    if (typeof searchValue === 'string') {
      return fieldValue.some(item =>
        String(item).toLowerCase().includes(searchValue.toLowerCase())
      )
    }
    return fieldValue.includes(searchValue)
  }

  if (typeof fieldValue === 'string') {
    const searchStr = String(searchValue)
    return fieldValue.toLowerCase().includes(searchStr.toLowerCase())
  }

  return false
}

/**
 * date(type) - Returns a date
 * date(today) - Today at midnight
 * date(now) - Current timestamp
 */
function fnDate(_metadata: NoteQueryMetadata, args: unknown[]): Date | null {
  if (args.length === 0) return null

  const type = String(args[0]).toLowerCase()

  if (type === 'today') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }

  if (type === 'now') {
    return new Date()
  }

  // Try to parse as date string
  const parsed = new Date(type)
  if (!isNaN(parsed.getTime())) {
    return parsed
  }

  return null
}

/**
 * length(field) - Returns length of array or string
 */
function fnLength(metadata: NoteQueryMetadata, args: unknown[]): number {
  if (args.length === 0) return 0

  const fieldPath = args[0] as string
  const value = getMetadataValue(metadata, fieldPath)

  if (Array.isArray(value)) {
    return value.length
  }

  if (typeof value === 'string') {
    return value.length
  }

  return 0
}

/**
 * lower(field) - Convert string to lowercase
 */
function fnLower(metadata: NoteQueryMetadata, args: unknown[]): string {
  if (args.length === 0) return ''

  const fieldPath = args[0] as string
  const value = getMetadataValue(metadata, fieldPath)

  if (typeof value === 'string') {
    return value.toLowerCase()
  }

  return String(value ?? '').toLowerCase()
}

/**
 * upper(field) - Convert string to uppercase
 */
function fnUpper(metadata: NoteQueryMetadata, args: unknown[]): string {
  if (args.length === 0) return ''

  const fieldPath = args[0] as string
  const value = getMetadataValue(metadata, fieldPath)

  if (typeof value === 'string') {
    return value.toUpperCase()
  }

  return String(value ?? '').toUpperCase()
}

/**
 * default(field, defaultValue) - Return default value if field is null/undefined
 */
function fnDefault(metadata: NoteQueryMetadata, args: unknown[]): unknown {
  if (args.length < 2) return null

  const fieldPath = args[0] as string
  const defaultValue = args[1]

  const value = getMetadataValue(metadata, fieldPath)

  if (value === undefined || value === null) {
    return defaultValue
  }

  return value
}

/**
 * startswith(field, prefix) - Check if string starts with prefix
 */
function fnStartsWith(metadata: NoteQueryMetadata, args: unknown[]): boolean {
  if (args.length < 2) return false

  const fieldPath = args[0] as string
  const prefix = String(args[1]).toLowerCase()

  const value = getMetadataValue(metadata, fieldPath)

  if (typeof value === 'string') {
    return value.toLowerCase().startsWith(prefix)
  }

  return false
}

/**
 * endswith(field, suffix) - Check if string ends with suffix
 */
function fnEndsWith(metadata: NoteQueryMetadata, args: unknown[]): boolean {
  if (args.length < 2) return false

  const fieldPath = args[0] as string
  const suffix = String(args[1]).toLowerCase()

  const value = getMetadataValue(metadata, fieldPath)

  if (typeof value === 'string') {
    return value.toLowerCase().endsWith(suffix)
  }

  return false
}

/**
 * choice(condition, trueValue, falseValue) - Ternary operator
 */
function fnChoice(metadata: NoteQueryMetadata, args: unknown[]): unknown {
  if (args.length < 3) return null

  const condition = args[0]
  const trueValue = args[1]
  const falseValue = args[2]

  // Evaluate condition
  let condResult: boolean
  if (typeof condition === 'string') {
    // It's a field path
    const value = getMetadataValue(metadata, condition)
    condResult = !!value
  } else {
    condResult = !!condition
  }

  return condResult ? trueValue : falseValue
}

// Function registry
const functions: Record<string, DataviewFunction> = {
  contains: fnContains,
  date: fnDate,
  length: fnLength,
  lower: fnLower,
  upper: fnUpper,
  default: fnDefault,
  startswith: fnStartsWith,
  endswith: fnEndsWith,
  choice: fnChoice,
}

/**
 * Execute a built-in function
 */
export function executeFunction(
  name: string,
  metadata: NoteQueryMetadata,
  args: unknown[]
): unknown {
  const fn = functions[name.toLowerCase()]

  if (!fn) {
    console.warn(`Unknown function: ${name}`)
    return null
  }

  return fn(metadata, args)
}

/**
 * Check if a function exists
 */
export function hasFunction(name: string): boolean {
  return name.toLowerCase() in functions
}
