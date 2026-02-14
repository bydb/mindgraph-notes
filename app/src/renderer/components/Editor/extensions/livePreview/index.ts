import { Extension, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView } from '@codemirror/view'
import { createLivePreviewPlugin } from './plugin'
import { livePreviewTheme } from './theme'

/**
 * Configuration for Live Preview Extension
 */
export interface LivePreviewConfig {
  vaultPath?: string
}

// StateEffect to update vaultPath
export const setVaultPath = StateEffect.define<string>()

// StateField to store vaultPath
export const vaultPathField = StateField.define<string>({
  create() {
    return ''
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setVaultPath)) {
        return effect.value
      }
    }
    return value
  }
})

/**
 * Live Preview Extension for CodeMirror
 *
 * Provides Obsidian-style live preview where:
 * - Markdown formatting is rendered (bold, italic, headers, etc.)
 * - Syntax markers are hidden (**text** shows as bold text)
 * - When cursor is on a line, raw markdown is shown for that line only
 * - Images are rendered inline (![[image.png|300]])
 *
 * Usage:
 * ```typescript
 * import { livePreviewExtension } from './extensions/livePreview'
 *
 * const extensions = [
 *   // ... other extensions
 *   ...(viewMode === 'live-preview' ? [livePreviewExtension({ vaultPath })] : [])
 * ]
 * ```
 */
/**
 * StateField that hides YAML frontmatter (--- ... ---) in live preview.
 * Uses a StateField (not a ViewPlugin) so replace decorations CAN span line breaks.
 */
const frontmatterField = StateField.define<DecorationSet>({
  create(state) {
    return buildFrontmatterDecorations(state.doc.toString())
  },
  update(value, tr) {
    if (tr.docChanged) {
      return buildFrontmatterDecorations(tr.newDoc.toString())
    }
    return value
  },
  provide: f => EditorView.decorations.from(f)
})

function buildFrontmatterDecorations(doc: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  if (doc.startsWith('---')) {
    const endIdx = doc.indexOf('\n---', 3)
    if (endIdx !== -1) {
      // Include the closing --- and the newline after it
      let end = endIdx + 4 // length of '\n---'
      if (doc[end] === '\n') end++ // skip trailing newline
      builder.add(0, end, Decoration.replace({}))
    }
  }
  return builder.finish()
}

export function livePreviewExtension(config: LivePreviewConfig = {}): Extension {
  return [
    vaultPathField.init(() => config.vaultPath || ''),
    livePreviewTheme,
    frontmatterField,
    createLivePreviewPlugin()
  ]
}

// Re-export for direct access if needed
export { createLivePreviewPlugin as livePreviewPlugin } from './plugin'
export { livePreviewTheme } from './theme'
