/**
 * Dataview Plugin
 * CodeMirror extension for detecting and rendering dataview code blocks
 * Uses EditorView.decorations.compute() for proper decoration handling
 */

import {
  DecorationSet,
  Decoration,
  EditorView,
  WidgetType
} from '@codemirror/view'
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state'
import type { Note } from '../../../../../shared/types'
import { DataviewWidget, DataviewErrorWidget } from './widget'
import { isValidQuery } from '../../../../utils/dataview'

// Pattern to detect dataview code blocks
const DATAVIEW_BLOCK_REGEX = /^```dataview\s*\n([\s\S]*?)\n```/gm

interface DataviewBlock {
  from: number
  to: number
  query: string
}

/**
 * Find all dataview code blocks in the document
 */
function findDataviewBlocks(doc: string): DataviewBlock[] {
  const blocks: DataviewBlock[] = []
  let match

  DATAVIEW_BLOCK_REGEX.lastIndex = 0
  while ((match = DATAVIEW_BLOCK_REGEX.exec(doc)) !== null) {
    blocks.push({
      from: match.index,
      to: match.index + match[0].length,
      query: match[1].trim()
    })
  }

  return blocks
}

// State effects for updating dataview state
export const setDataviewNotes = StateEffect.define<Note[]>()
export const setDataviewLanguage = StateEffect.define<'de' | 'en'>()
export const setDataviewViewMode = StateEffect.define<'edit' | 'live-preview' | 'preview'>()

// Store notes in state
export const dataviewNotesField = StateField.define<Note[]>({
  create: () => [],
  update: (notes, tr) => {
    for (const e of tr.effects) {
      if (e.is(setDataviewNotes)) return e.value
    }
    return notes
  }
})

// Store language in state
export const dataviewLanguageField = StateField.define<'de' | 'en'>({
  create: () => 'de',
  update: (lang, tr) => {
    for (const e of tr.effects) {
      if (e.is(setDataviewLanguage)) return e.value
    }
    return lang
  }
})

// Store view mode in state - only render results in live-preview mode
export const dataviewViewModeField = StateField.define<'edit' | 'live-preview' | 'preview'>({
  create: () => 'edit',
  update: (mode, tr) => {
    for (const e of tr.effects) {
      if (e.is(setDataviewViewMode)) return e.value
    }
    return mode
  }
})

// Store callback in a mutable reference since we can't store functions in state
let noteClickHandler: ((path: string) => void) | undefined

export function setNoteClickHandler(handler: ((path: string) => void) | undefined) {
  noteClickHandler = handler
}

// Track current selection for cursor-aware rendering
// We need this as a StateField so decorations can react to selection changes
const selectionVersionField = StateField.define<number>({
  create: () => 0,
  update: (version, tr) => {
    if (tr.selectionSet) return version + 1
    return version
  }
})

/**
 * Create decorations for dataview blocks
 * This is called by EditorView.decorations.compute()
 */
function createDecorations(
  state: EditorView['state'],
  notes: Note[],
  language: 'de' | 'en',
  viewMode: 'edit' | 'live-preview' | 'preview',
  onNoteClick?: (notePath: string) => void
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()

  // Only render results in live-preview mode, not in source mode
  if (viewMode === 'edit') {
    return builder.finish()
  }

  const doc = state.doc.toString()
  const blocks = findDataviewBlocks(doc)

  for (const block of blocks) {
    // Check if cursor is within this block (show source instead)
    let cursorInBlock = false
    for (const range of state.selection.ranges) {
      // Check if the selection overlaps with the block
      if (range.from < block.to && range.to > block.from) {
        cursorInBlock = true
        break
      }
      // Check if cursor is on any line within the block
      const blockStartLine = state.doc.lineAt(block.from).number
      const blockEndLine = state.doc.lineAt(block.to).number
      const cursorLine = state.doc.lineAt(range.head).number
      if (cursorLine >= blockStartLine && cursorLine <= blockEndLine) {
        cursorInBlock = true
        break
      }
    }

    if (cursorInBlock) {
      continue
    }

    // Validate query
    const isValid = isValidQuery(block.query)

    // Create appropriate widget
    let widget: WidgetType
    if (!isValid) {
      widget = new DataviewErrorWidget(`Invalid query: ${block.query.slice(0, 50)}...`)
    } else {
      widget = new DataviewWidget(block.query, notes, language, onNoteClick)
    }

    // Hide the code block and show widget
    builder.add(
      block.from,
      block.to,
      Decoration.replace({
        widget,
        inclusive: false
      })
    )
  }

  return builder.finish()
}

/**
 * Dataview decorations using compute()
 * This properly computes decorations based on notes, language, viewMode, and selection
 */
const dataviewDecorations = EditorView.decorations.compute(
  [dataviewNotesField, dataviewLanguageField, dataviewViewModeField, selectionVersionField],
  (state) => {
    const notes = state.field(dataviewNotesField)
    const language = state.field(dataviewLanguageField)
    const viewMode = state.field(dataviewViewModeField)
    // selectionVersionField is accessed to ensure recomputation on selection change
    state.field(selectionVersionField)
    console.log('[Dataview compute] Running with', notes.length, 'notes, viewMode:', viewMode)
    return createDecorations(state, notes, language, viewMode, noteClickHandler)
  }
)

/**
 * Create the complete dataview extension
 */
export function createDataviewExtension() {
  return [
    dataviewNotesField,
    dataviewLanguageField,
    dataviewViewModeField,
    selectionVersionField,
    dataviewDecorations
  ]
}

// Export the old function name for backwards compatibility
export function createDataviewPlugin() {
  return createDataviewExtension()
}
