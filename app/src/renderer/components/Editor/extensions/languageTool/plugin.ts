import {
  ViewPlugin,
  ViewUpdate,
  DecorationSet,
  Decoration,
  EditorView,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { LanguageToolMatch, getCategoryType } from './types'

/**
 * Build decorations from LanguageTool matches
 */
export function buildDecorations(
  view: EditorView,
  matches: LanguageToolMatch[]
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const docLength = view.state.doc.length

  // Sort matches by offset to add them in order
  const sortedMatches = [...matches].sort((a, b) => a.offset - b.offset)

  for (const match of sortedMatches) {
    const from = match.offset
    const to = match.offset + match.length

    // Skip if out of bounds
    if (from < 0 || to > docLength || from >= to) continue

    const category = getCategoryType(match.rule.category.id)
    const className = `lt-error-${category}`

    // Store match data in the decoration for later retrieval
    const deco = Decoration.mark({
      class: className,
      attributes: {
        'data-lt-match': JSON.stringify({
          message: match.message,
          shortMessage: match.shortMessage,
          replacements: match.replacements.slice(0, 5), // Limit to 5 suggestions
          category: category,
          ruleId: match.rule.id,
          from,
          to
        })
      }
    })

    builder.add(from, to, deco)
  }

  return builder.finish()
}

/**
 * Create the LanguageTool ViewPlugin
 */
export function createLanguageToolPlugin(initialMatches: LanguageToolMatch[] = []) {
  let currentMatches = initialMatches

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, currentMatches)
      }

      update(update: ViewUpdate) {
        // Rebuild decorations if document changed
        if (update.docChanged) {
          // When document changes, we'd need to re-check
          // For now, just clear decorations on edit
          this.decorations = Decoration.none
        }
      }

      // Method to update matches from outside
      setMatches(matches: LanguageToolMatch[]) {
        currentMatches = matches
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  )
}

/**
 * Update function to refresh decorations with new matches
 */
export function updateDecorations(
  view: EditorView,
  matches: LanguageToolMatch[]
): void {
  const decorations = buildDecorations(view, matches)

  // We dispatch a transaction effect to update decorations
  view.dispatch({
    effects: setLanguageToolMatches.of(matches)
  })
}

// StateEffect for updating matches
import { StateEffect, StateField } from '@codemirror/state'

export const setLanguageToolMatches = StateEffect.define<LanguageToolMatch[]>()

export const languageToolMatchesField = StateField.define<LanguageToolMatch[]>({
  create() {
    return []
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLanguageToolMatches)) {
        return effect.value
      }
    }
    return value
  }
})

// Global click handler that can be set from outside
let onLtErrorClick: ((event: MouseEvent, matchData: string) => void) | null = null

export function setLtErrorClickHandler(handler: ((event: MouseEvent, matchData: string) => void) | null) {
  onLtErrorClick = handler
}

/**
 * Decoration-based ViewPlugin that reads from StateField
 */
export function createLanguageToolDecorationPlugin() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        const matches = view.state.field(languageToolMatchesField, false) || []
        this.decorations = buildDecorations(view, matches)
      }

      update(update: ViewUpdate) {
        // Check if matches changed via effect
        const matchesChanged = update.transactions.some(tr =>
          tr.effects.some(e => e.is(setLanguageToolMatches))
        )

        if (matchesChanged || update.docChanged) {
          const matches = update.state.field(languageToolMatchesField, false) || []
          this.decorations = update.docChanged ? Decoration.none : buildDecorations(update.view, matches)
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown: (event: MouseEvent, view: EditorView) => {
          if (!onLtErrorClick) return false

          // Use CodeMirror's position API instead of DOM traversal,
          // which is unreliable because CM6 may recreate DOM elements
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (pos === null) return false

          const matches = view.state.field(languageToolMatchesField, false) || []
          const clickedMatch = matches.find(m => pos >= m.offset && pos < m.offset + m.length)
          if (!clickedMatch) return false

          const matchData = JSON.stringify({
            message: clickedMatch.message,
            shortMessage: clickedMatch.shortMessage,
            replacements: (clickedMatch.replacements || []).slice(0, 5),
            category: getCategoryType(clickedMatch.rule.category.id),
            ruleId: clickedMatch.rule.id,
            from: clickedMatch.offset,
            to: clickedMatch.offset + clickedMatch.length
          })

          event.preventDefault()
          event.stopPropagation()
          onLtErrorClick(event, matchData)
          return true
        }
      }
    }
  )
}
