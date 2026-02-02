/**
 * Dataview CodeMirror Extension
 *
 * Provides live rendering of Dataview queries in the editor.
 * When the cursor is outside a dataview block, it shows the rendered results.
 * When the cursor is inside, it shows the raw query for editing.
 */

import { Extension } from '@codemirror/state'
import {
  createDataviewPlugin,
  dataviewNotesField,
  dataviewLanguageField,
  dataviewViewModeField,
  setDataviewNotes,
  setDataviewLanguage,
  setDataviewViewMode,
  setNoteClickHandler
} from './plugin'

export {
  setDataviewNotes,
  setDataviewLanguage,
  setDataviewViewMode,
  setNoteClickHandler,
  dataviewNotesField,
  dataviewLanguageField,
  dataviewViewModeField
}

/**
 * Create the Dataview extension for CodeMirror
 * Note: createDataviewPlugin() returns all necessary fields and plugins
 */
export function dataviewExtension(): Extension {
  return createDataviewPlugin()
}

export default dataviewExtension
