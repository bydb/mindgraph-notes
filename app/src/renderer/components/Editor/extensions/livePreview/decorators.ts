import { Decoration, DecorationSet, EditorView } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { SyntaxNode } from '@lezer/common'
import {
  WikilinkWidget,
  CheckboxWidget,
  CalloutIconWidget,
  HorizontalRuleWidget,
  LinkWidget,
  TagWidget,
  ImageWidget,
  PdfEmbedWidget,
} from './widgets'
import { parseObsidianEmbedSyntax } from '../../../../utils/imageUtils'

/**
 * Get text content for a node range
 */
function getText(view: EditorView, from: number, to: number): string {
  return view.state.doc.sliceString(from, to)
}

/**
 * Create decoration to hide syntax markers
 */
function hideDecoration(from: number, to: number): { from: number; to: number; decoration: Decoration } {
  return {
    from,
    to,
    decoration: Decoration.replace({}),
  }
}

/**
 * Create decoration with a CSS class for formatting
 */
function markDecoration(
  from: number,
  to: number,
  className: string
): { from: number; to: number; decoration: Decoration } {
  return {
    from,
    to,
    decoration: Decoration.mark({ class: className }),
  }
}

/**
 * Create widget decoration
 */
function widgetDecoration(
  from: number,
  to: number,
  widget: import('@codemirror/view').WidgetType
): { from: number; to: number; decoration: Decoration } {
  return {
    from,
    to,
    decoration: Decoration.replace({ widget }),
  }
}

/**
 * Decoration builder context
 */
interface DecoratorContext {
  view: EditorView
  cursorLines: Set<number>
  decorations: Array<{ from: number; to: number; decoration: Decoration }>
  vaultPath: string
}

/**
 * Check if a position is on a cursor line
 */
function isOnCursorLine(ctx: DecoratorContext, from: number, to: number): boolean {
  const doc = ctx.view.state.doc
  const startLine = doc.lineAt(from).number
  const endLine = doc.lineAt(to).number
  for (let line = startLine; line <= endLine; line++) {
    if (ctx.cursorLines.has(line)) return true
  }
  return false
}

/**
 * Add decoration if not on cursor line
 */
function addDecoration(
  ctx: DecoratorContext,
  from: number,
  to: number,
  decoration: Decoration
): void {
  ctx.decorations.push({ from, to, decoration })
}

/**
 * Decorate ATX headers (# Heading)
 */
export function decorateHeader(ctx: DecoratorContext, node: SyntaxNode): void {
  if (isOnCursorLine(ctx, node.from, node.to)) return

  const text = getText(ctx.view, node.from, node.to)
  const match = text.match(/^(#{1,6})\s+/)
  if (!match) return

  const markerEnd = node.from + match[0].length
  const level = match[1].length

  // Hide the marker (# symbols and space)
  addDecoration(ctx, node.from, markerEnd, Decoration.replace({}))

  // Apply header styling to content
  addDecoration(
    ctx,
    markerEnd,
    node.to,
    Decoration.mark({ class: `lp-header-${level}` })
  )
}

/**
 * Decorate emphasis (bold/italic)
 */
export function decorateEmphasis(ctx: DecoratorContext, node: SyntaxNode): void {
  if (isOnCursorLine(ctx, node.from, node.to)) return

  const text = getText(ctx.view, node.from, node.to)

  // Determine if bold or italic based on markers
  const isBold = text.startsWith('**') || text.startsWith('__')
  const isItalic = !isBold && (text.startsWith('*') || text.startsWith('_'))

  if (isBold) {
    // Bold: hide ** markers on both sides
    addDecoration(ctx, node.from, node.from + 2, Decoration.replace({}))
    addDecoration(ctx, node.to - 2, node.to, Decoration.replace({}))
    addDecoration(
      ctx,
      node.from + 2,
      node.to - 2,
      Decoration.mark({ class: 'lp-bold' })
    )
  } else if (isItalic) {
    // Italic: hide * markers on both sides
    addDecoration(ctx, node.from, node.from + 1, Decoration.replace({}))
    addDecoration(ctx, node.to - 1, node.to, Decoration.replace({}))
    addDecoration(
      ctx,
      node.from + 1,
      node.to - 1,
      Decoration.mark({ class: 'lp-italic' })
    )
  }
}

/**
 * Decorate strong emphasis (bold)
 */
export function decorateStrongEmphasis(ctx: DecoratorContext, node: SyntaxNode): void {
  if (isOnCursorLine(ctx, node.from, node.to)) return

  // Hide ** markers on both sides
  addDecoration(ctx, node.from, node.from + 2, Decoration.replace({}))
  addDecoration(ctx, node.to - 2, node.to, Decoration.replace({}))
  addDecoration(
    ctx,
    node.from + 2,
    node.to - 2,
    Decoration.mark({ class: 'lp-bold' })
  )
}

/**
 * Decorate inline code
 */
export function decorateInlineCode(ctx: DecoratorContext, node: SyntaxNode): void {
  if (isOnCursorLine(ctx, node.from, node.to)) return

  const text = getText(ctx.view, node.from, node.to)
  const markerLen = text.startsWith('``') ? 2 : 1

  // Hide backticks
  addDecoration(ctx, node.from, node.from + markerLen, Decoration.replace({}))
  addDecoration(ctx, node.to - markerLen, node.to, Decoration.replace({}))
  addDecoration(
    ctx,
    node.from + markerLen,
    node.to - markerLen,
    Decoration.mark({ class: 'lp-inline-code' })
  )
}

/**
 * Decorate strikethrough
 */
export function decorateStrikethrough(ctx: DecoratorContext, node: SyntaxNode): void {
  if (isOnCursorLine(ctx, node.from, node.to)) return

  // Hide ~~ markers
  addDecoration(ctx, node.from, node.from + 2, Decoration.replace({}))
  addDecoration(ctx, node.to - 2, node.to, Decoration.replace({}))
  addDecoration(
    ctx,
    node.from + 2,
    node.to - 2,
    Decoration.mark({ class: 'lp-strikethrough' })
  )
}

/**
 * Decorate standard markdown links [text](url)
 */
export function decorateLink(ctx: DecoratorContext, node: SyntaxNode): void {
  if (isOnCursorLine(ctx, node.from, node.to)) return

  const text = getText(ctx.view, node.from, node.to)
  const match = text.match(/^\[([^\]]*)\]\(([^)]*)\)$/)
  if (!match) return

  const [, linkText, url] = match
  addDecoration(
    ctx,
    node.from,
    node.to,
    Decoration.replace({ widget: new LinkWidget(linkText, url) })
  )
}

/**
 * Decorate wikilinks [[target]] or [[target|alias]]
 */
export function decorateWikilink(ctx: DecoratorContext, from: number, to: number): void {
  if (isOnCursorLine(ctx, from, to)) return

  const text = getText(ctx.view, from, to)
  const match = text.match(/^\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]$/)
  if (!match) return

  const [, target, fragment, alias] = match
  addDecoration(
    ctx,
    from,
    to,
    Decoration.replace({ widget: new WikilinkWidget(target, alias || null, fragment || null) })
  )
}

/**
 * Decorate tags #tag
 */
export function decorateTag(ctx: DecoratorContext, from: number, to: number): void {
  if (isOnCursorLine(ctx, from, to)) return

  const text = getText(ctx.view, from, to)
  if (!text.startsWith('#') || text.match(/^#{1,6}\s/)) return // Not a tag if it's a header

  addDecoration(ctx, from, to, Decoration.replace({ widget: new TagWidget(text) }))
}

/**
 * Decorate blockquotes
 */
export function decorateBlockquote(ctx: DecoratorContext, node: SyntaxNode): void {
  if (isOnCursorLine(ctx, node.from, node.to)) return

  const text = getText(ctx.view, node.from, node.to)

  // Check if this is a callout
  const calloutMatch = text.match(/^>\s*\[!(\w+)\](?:\s*(.*))?/)
  if (calloutMatch) {
    const [fullMatch, type, title] = calloutMatch
    const calloutType = type.toLowerCase()

    // Hide the callout marker line's syntax and replace with icon widget
    const markerEnd = node.from + fullMatch.length
    addDecoration(
      ctx,
      node.from,
      markerEnd,
      Decoration.replace({ widget: new CalloutIconWidget(calloutType, title || null) })
    )

    // Apply callout styling to content after the marker (not overlapping with replace)
    if (markerEnd < node.to) {
      addDecoration(
        ctx,
        markerEnd,
        node.to,
        Decoration.mark({ class: `lp-callout lp-callout-${calloutType}` })
      )
    }
    return
  }

  // Regular blockquote: just hide the > marker and style the rest
  const lineMatch = text.match(/^>\s?/)
  if (lineMatch) {
    const markerEnd = node.from + lineMatch[0].length
    addDecoration(ctx, node.from, markerEnd, Decoration.replace({}))
    // Apply blockquote styling only to content after the marker
    if (markerEnd < node.to) {
      addDecoration(ctx, markerEnd, node.to, Decoration.mark({ class: 'lp-blockquote' }))
    }
  }
}

/**
 * Decorate task list items
 */
export function decorateTaskList(ctx: DecoratorContext, node: SyntaxNode): void {
  if (isOnCursorLine(ctx, node.from, node.to)) return

  const text = getText(ctx.view, node.from, node.to)
  const match = text.match(/^(\s*[-*+]\s+)\[([ xX])\](\s*)/)
  if (!match) return

  const [fullMatch, prefix, checkChar, space] = match
  const isChecked = checkChar.toLowerCase() === 'x'
  const checkboxStart = node.from + prefix.length
  const checkboxEnd = checkboxStart + 3 + space.length // [x] + space

  // Replace checkbox syntax with widget
  addDecoration(
    ctx,
    checkboxStart,
    checkboxEnd,
    Decoration.replace({ widget: new CheckboxWidget(isChecked, checkboxStart) })
  )

  // Apply strikethrough to checked items
  if (isChecked) {
    addDecoration(
      ctx,
      checkboxEnd,
      node.to,
      Decoration.mark({ class: 'lp-task-checked' })
    )
  }
}

/**
 * Decorate horizontal rules
 */
export function decorateHorizontalRule(ctx: DecoratorContext, node: SyntaxNode): void {
  if (isOnCursorLine(ctx, node.from, node.to)) return

  addDecoration(
    ctx,
    node.from,
    node.to,
    Decoration.replace({ widget: new HorizontalRuleWidget() })
  )
}

/**
 * Process text content for wikilinks, image embeds, and tags (since they're not in syntax tree)
 */
export function decorateTextContent(ctx: DecoratorContext, from: number, to: number): void {
  const text = getText(ctx.view, from, to)

  // Find image embeds ![[image.png]] or ![[image.png|300]]
  const imageRegex = /!\[\[[^\]]+\]\]/g
  let match
  while ((match = imageRegex.exec(text)) !== null) {
    const start = from + match.index
    const end = start + match[0].length
    decorateImage(ctx, start, end)
  }

  // Find wikilinks [[...]] (but not image embeds which start with !)
  const wikilinkRegex = /(?<!!)\[\[[^\]]+\]\]/g
  while ((match = wikilinkRegex.exec(text)) !== null) {
    const start = from + match.index
    const end = start + match[0].length
    decorateWikilink(ctx, start, end)
  }

  // Find tags #tag (but not headers)
  const tagRegex = /(?:^|\s)(#[a-zA-Z][a-zA-Z0-9_/-]*)/g
  while ((match = tagRegex.exec(text)) !== null) {
    // Adjust for possible leading whitespace
    const tagStart = from + match.index + (match[0].length - match[1].length)
    const tagEnd = tagStart + match[1].length
    decorateTag(ctx, tagStart, tagEnd)
  }
}

/**
 * Build decoration set from collected decorations (must be sorted by from position)
 */
export function buildDecorationSet(
  decorations: Array<{ from: number; to: number; decoration: Decoration }>
): DecorationSet {
  // Filter out invalid decorations
  const validDecorations = decorations.filter(d => d.from >= 0 && d.to >= d.from)

  // Sort decorations by from position, then by to position
  validDecorations.sort((a, b) => a.from - b.from || a.to - b.to)

  const builder = new RangeSetBuilder<Decoration>()
  let lastTo = -1

  for (const { from, to, decoration } of validDecorations) {
    // Skip decorations that start before the last one ended (overlapping replace decorations)
    // But allow mark decorations to overlap
    if (from < lastTo && decoration.spec.widget) {
      continue
    }
    try {
      builder.add(from, to, decoration)
      if (decoration.spec.widget) {
        lastTo = to
      }
    } catch (e) {
      // Skip decorations that cause errors (e.g., invalid ranges)
      console.warn('LivePreview: Skipping invalid decoration', { from, to }, e)
    }
  }
  return builder.finish()
}

/**
 * Create a new decorator context
 */
export function createDecoratorContext(
  view: EditorView,
  cursorLines: Set<number>,
  vaultPath: string = ''
): DecoratorContext {
  return {
    view,
    cursorLines,
    decorations: [],
    vaultPath,
  }
}

/**
 * Decorate Obsidian-style embeds: ![[image.png]], ![[image.png|300]], ![[document.pdf]]
 * Handles both images and PDFs
 */
export function decorateImage(ctx: DecoratorContext, from: number, to: number): void {
  if (isOnCursorLine(ctx, from, to)) return

  const text = getText(ctx.view, from, to)
  const parsed = parseObsidianEmbedSyntax(text)
  if (!parsed) return

  // Check if it's a PDF embed
  if (parsed.fileName.toLowerCase().endsWith('.pdf')) {
    addDecoration(
      ctx,
      from,
      to,
      Decoration.replace({
        widget: new PdfEmbedWidget(parsed.fileName, ctx.vaultPath)
      })
    )
    return
  }

  // For images
  addDecoration(
    ctx,
    from,
    to,
    Decoration.replace({
      widget: new ImageWidget(
        parsed.fileName,
        parsed.width,
        parsed.height,
        ctx.vaultPath,
        parsed.alt
      )
    })
  )
}
