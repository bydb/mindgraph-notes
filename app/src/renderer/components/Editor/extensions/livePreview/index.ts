import { Extension, StateField, StateEffect } from '@codemirror/state'
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
export function livePreviewExtension(config: LivePreviewConfig = {}): Extension {
  return [
    vaultPathField.init(() => config.vaultPath || ''),
    livePreviewTheme,
    createLivePreviewPlugin()
  ]
}

// Re-export for direct access if needed
export { createLivePreviewPlugin as livePreviewPlugin } from './plugin'
export { livePreviewTheme } from './theme'
