import {
  ViewPlugin,
  ViewUpdate,
  DecorationSet,
  EditorView,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import {
  createDecoratorContext,
  buildDecorationSet,
  decorateHeader,
  decorateEmphasis,
  decorateStrongEmphasis,
  decorateInlineCode,
  decorateStrikethrough,
  decorateLink,
  decorateBlockquote,
  decorateTaskList,
  decorateHorizontalRule,
  decorateTextContent,
} from './decorators'
import { vaultPathField } from './index'

/**
 * Get all line numbers where the cursor(s) are positioned
 */
function getCursorLines(view: EditorView): Set<number> {
  const lines = new Set<number>()
  for (const range of view.state.selection.ranges) {
    // Add all lines in the selection range
    const startLine = view.state.doc.lineAt(range.from).number
    const endLine = view.state.doc.lineAt(range.to).number
    for (let line = startLine; line <= endLine; line++) {
      lines.add(line)
    }
  }
  return lines
}

/**
 * Check if the document structure changed (not just cursor)
 */
function docOrViewportChanged(update: ViewUpdate): boolean {
  return (
    update.docChanged ||
    update.viewportChanged ||
    update.selectionSet
  )
}

/**
 * Build decorations for the visible viewport
 */
function buildDecorations(view: EditorView): DecorationSet {
  const cursorLines = getCursorLines(view)
  const vaultPath = view.state.field(vaultPathField, false) || ''
  const ctx = createDecoratorContext(view, cursorLines, vaultPath)

  // Process wikilinks and tags first from raw text (since they're not in syntax tree)
  // Do this line by line for the viewport
  const { from: viewportFrom, to: viewportTo } = view.viewport
  const doc = view.state.doc

  // Iterate through each line in viewport
  const startLineNum = doc.lineAt(viewportFrom).number
  const endLineNum = doc.lineAt(viewportTo).number

  for (let lineNum = startLineNum; lineNum <= endLineNum; lineNum++) {
    const line = doc.line(lineNum)
    decorateTextContent(ctx, line.from, line.to)
  }

  // Iterate through syntax tree for structured elements
  syntaxTree(view.state).iterate({
    from: viewportFrom,
    to: viewportTo,
    enter(node) {
      const nodeType = node.type.name

      switch (nodeType) {
        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6':
        case 'SetextHeading1':
        case 'SetextHeading2':
          decorateHeader(ctx, node.node)
          break

        case 'Emphasis':
          decorateEmphasis(ctx, node.node)
          break

        case 'StrongEmphasis':
          decorateStrongEmphasis(ctx, node.node)
          break

        case 'InlineCode':
          decorateInlineCode(ctx, node.node)
          break

        case 'Strikethrough':
          decorateStrikethrough(ctx, node.node)
          break

        case 'Link':
          decorateLink(ctx, node.node)
          break

        case 'Blockquote':
          decorateBlockquote(ctx, node.node)
          break

        case 'ListItem':
          // Check if it's a task list item
          const listItemText = view.state.doc.sliceString(node.from, node.to)
          if (/^\s*[-*+]\s+\[[ xX]\]/.test(listItemText)) {
            decorateTaskList(ctx, node.node)
          }
          break

        case 'HorizontalRule':
          decorateHorizontalRule(ctx, node.node)
          break
      }
    },
  })

  return buildDecorationSet(ctx.decorations)
}

/**
 * Live Preview ViewPlugin
 * Manages cursor-aware decorations for Obsidian-style live preview
 */
export function createLivePreviewPlugin() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view)
      }

      update(update: ViewUpdate) {
        if (docOrViewportChanged(update)) {
          this.decorations = buildDecorations(update.view)
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  )
}
