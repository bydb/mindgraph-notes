import { Extension } from '@codemirror/state'
import { languageToolTheme } from './theme'
import {
  languageToolMatchesField,
  createLanguageToolDecorationPlugin
} from './plugin'

/**
 * Configuration for LanguageTool Extension
 */
export interface LanguageToolConfig {
  enabled?: boolean
}

/**
 * LanguageTool Extension for CodeMirror
 *
 * Provides grammar and spell checking with visual error underlines:
 * - Spelling errors: Red wavy underline
 * - Grammar errors: Blue wavy underline
 * - Style/typography: Yellow wavy underline
 *
 * Usage:
 * ```typescript
 * import { languageToolExtension, setLanguageToolMatches } from './extensions/languageTool'
 *
 * const extensions = [
 *   // ... other extensions
 *   languageToolExtension({ enabled: true })
 * ]
 *
 * // To update matches after checking:
 * view.dispatch({
 *   effects: setLanguageToolMatches.of(matches)
 * })
 * ```
 */
export function languageToolExtension(config: LanguageToolConfig = {}): Extension {
  if (config.enabled === false) {
    return []
  }

  return [
    languageToolMatchesField,
    languageToolTheme,
    createLanguageToolDecorationPlugin()
  ]
}

// Re-exports
export { setLanguageToolMatches, languageToolMatchesField, setLtErrorClickHandler } from './plugin'
export { languageToolTheme } from './theme'
export type { LanguageToolMatch, ErrorCategory, LanguageToolPopupMatch } from './types'
export { getCategoryType } from './types'
