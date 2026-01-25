import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { EditorState, RangeSetBuilder, Facet, StateField, StateEffect } from '@codemirror/state'

// Configuration facet for folding options
export const foldingConfig = Facet.define<{
  headingFolding: boolean
  outlining: boolean
}, { headingFolding: boolean; outlining: boolean }>({
  combine: (values) => {
    if (values.length === 0) return { headingFolding: false, outlining: false }
    return {
      headingFolding: values.some(v => v.headingFolding),
      outlining: values.some(v => v.outlining)
    }
  }
})

// Effect to toggle fold state
const toggleFoldEffect = StateEffect.define<{ from: number; to: number }>()

// Track folded regions
interface FoldedRegion {
  from: number
  to: number
}

const foldedRegionsField = StateField.define<FoldedRegion[]>({
  create: () => [],
  update: (regions, tr) => {
    let newRegions = regions.map(r => ({
      from: tr.changes.mapPos(r.from, 1),
      to: tr.changes.mapPos(r.to, -1)
    })).filter(r => r.from < r.to)

    for (const effect of tr.effects) {
      if (effect.is(toggleFoldEffect)) {
        const { from, to } = effect.value
        const existingIndex = newRegions.findIndex(r => r.from === from && r.to === to)
        if (existingIndex >= 0) {
          newRegions = [...newRegions.slice(0, existingIndex), ...newRegions.slice(existingIndex + 1)]
        } else {
          newRegions = [...newRegions, { from, to }]
        }
      }
    }
    return newRegions
  }
})

// Find the end of a heading section
function findHeadingSectionEnd(state: EditorState, headingLine: number, headingLevel: number): number {
  const doc = state.doc
  const totalLines = doc.lines

  for (let i = headingLine + 1; i <= totalLines; i++) {
    const line = doc.line(i)
    const text = line.text

    const headingMatch = text.match(/^(#{1,6})\s/)
    if (headingMatch) {
      const nextLevel = headingMatch[1].length
      if (nextLevel <= headingLevel) {
        return doc.line(i - 1).to
      }
    }
  }

  return doc.length
}

// Find foldable heading regions
function findHeadingFolds(state: EditorState): FoldedRegion[] {
  const folds: FoldedRegion[] = []
  const doc = state.doc

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const text = line.text

    const headingMatch = text.match(/^(#{1,6})\s+.+/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const sectionEnd = findHeadingSectionEnd(state, i, level)

      if (sectionEnd > line.to) {
        folds.push({
          from: line.from,
          to: sectionEnd
        })
      }
    }
  }

  return folds
}

// Find foldable list regions
function findOutlineFolds(state: EditorState): FoldedRegion[] {
  const folds: FoldedRegion[] = []
  const doc = state.doc
  const processedLines = new Set<number>()

  for (let i = 1; i <= doc.lines; i++) {
    if (processedLines.has(i)) continue

    const line = doc.line(i)
    const text = line.text

    const listMatch = text.match(/^(\s*)([-*+]|\d+\.)\s/)
    if (listMatch) {
      const baseIndent = listMatch[1].length
      let endLine = i
      let hasChildren = false

      for (let j = i + 1; j <= doc.lines; j++) {
        const nextLine = doc.line(j)
        const nextText = nextLine.text

        if (nextText.trim() === '') continue

        const nextListMatch = nextText.match(/^(\s*)([-*+]|\d+\.)\s/)
        if (nextListMatch) {
          const nextListIndent = nextListMatch[1].length
          if (nextListIndent > baseIndent) {
            hasChildren = true
            endLine = j
            processedLines.add(j)
          } else {
            break
          }
        } else {
          const nextIndentMatch = nextText.match(/^(\s*)/)
          const nextIndent = nextIndentMatch ? nextIndentMatch[1].length : 0
          if (nextIndent > baseIndent) {
            hasChildren = true
            endLine = j
          } else {
            break
          }
        }
      }

      if (hasChildren && endLine > i) {
        folds.push({
          from: line.from,
          to: doc.line(endLine).to
        })
      }
    }
  }

  return folds
}

// Fold toggle widget
class FoldToggleWidget extends WidgetType {
  constructor(
    readonly folded: boolean,
    readonly foldFrom: number,
    readonly foldTo: number
  ) {
    super()
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = `cm-fold-toggle ${this.folded ? 'folded' : 'open'}`
    span.textContent = this.folded ? '▶' : '▼'
    span.title = this.folded ? 'Aufklappen' : 'Zuklappen'

    span.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.dispatch({
        effects: toggleFoldEffect.of({ from: this.foldFrom, to: this.foldTo })
      })
    })

    return span
  }

  eq(other: FoldToggleWidget): boolean {
    return this.folded === other.folded &&
           this.foldFrom === other.foldFrom &&
           this.foldTo === other.foldTo
  }

  ignoreEvent(): boolean {
    return false
  }
}

// Folded content placeholder
class FoldedPlaceholderWidget extends WidgetType {
  constructor(readonly lines: number) {
    super()
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-folded-placeholder'
    span.textContent = ` ... ${this.lines} Zeilen`
    return span
  }

  eq(other: FoldedPlaceholderWidget): boolean {
    return this.lines === other.lines
  }
}

// Helper to get all foldable regions
function getAllFolds(state: EditorState): FoldedRegion[] {
  const config = state.facet(foldingConfig)
  const allFolds: FoldedRegion[] = []

  if (config.headingFolding) {
    allFolds.push(...findHeadingFolds(state))
  }
  if (config.outlining) {
    allFolds.push(...findOutlineFolds(state))
  }

  allFolds.sort((a, b) => a.from - b.from)

  // Remove duplicates
  const uniqueFolds: FoldedRegion[] = []
  for (const fold of allFolds) {
    if (!uniqueFolds.some(f => f.from === fold.from)) {
      uniqueFolds.push(fold)
    }
  }

  return uniqueFolds
}

// StateField for decorations (can handle line-spanning replacements)
const foldDecorationsField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update: (decorations, tr) => {
    if (tr.docChanged || tr.effects.some(e => e.is(toggleFoldEffect))) {
      return buildDecorations(tr.state)
    }
    return decorations.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field)
})

function buildDecorations(state: EditorState): DecorationSet {
  const config = state.facet(foldingConfig)

  if (!config.headingFolding && !config.outlining) {
    return Decoration.none
  }

  const foldedRegions = state.field(foldedRegionsField)
  const allFolds = getAllFolds(state)

  const decorationItems: { from: number; to: number; decoration: Decoration }[] = []

  for (const fold of allFolds) {
    const isFolded = foldedRegions.some(r => r.from === fold.from && r.to === fold.to)
    const line = state.doc.lineAt(fold.from)

    // Toggle widget
    decorationItems.push({
      from: line.from,
      to: line.from,
      decoration: Decoration.widget({
        widget: new FoldToggleWidget(isFolded, fold.from, fold.to),
        side: -1
      })
    })

    // Replace decoration for folded content
    if (isFolded && line.to < fold.to) {
      const startLine = line.number
      const endLine = state.doc.lineAt(fold.to).number
      const hiddenLines = endLine - startLine

      decorationItems.push({
        from: line.to,
        to: fold.to,
        decoration: Decoration.replace({
          widget: new FoldedPlaceholderWidget(hiddenLines),
          block: false
        })
      })
    }
  }

  // Sort decorations
  decorationItems.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from
    const aIsWidget = a.from === a.to
    const bIsWidget = b.from === b.to
    if (aIsWidget && !bIsWidget) return -1
    if (!aIsWidget && bIsWidget) return 1
    return a.to - b.to
  })

  const builder = new RangeSetBuilder<Decoration>()
  for (const item of decorationItems) {
    builder.add(item.from, item.to, item.decoration)
  }

  return builder.finish()
}

// Theme for folding UI
const foldingTheme = EditorView.baseTheme({
  '.cm-fold-toggle': {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    marginRight: '2px',
    marginLeft: '-18px',
    color: 'var(--text-muted, #666)',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: '10px',
    lineHeight: '14px',
    textAlign: 'center',
    borderRadius: '2px',
    transition: 'all 0.15s ease'
  },
  '.cm-fold-toggle:hover': {
    color: 'var(--accent-color, #007acc)',
    background: 'var(--bg-tertiary, rgba(0,0,0,0.1))'
  },
  '.cm-fold-toggle.folded': {
    color: 'var(--accent-color, #007acc)'
  },
  '.cm-folded-placeholder': {
    display: 'inline',
    padding: '1px 6px',
    marginLeft: '4px',
    background: 'var(--bg-tertiary, #2a2a2a)',
    color: 'var(--text-muted, #888)',
    borderRadius: '3px',
    fontSize: '11px',
    fontStyle: 'italic'
  },
  '.cm-line': {
    paddingLeft: '20px !important'
  }
})

// Main extension factory
export function markdownFoldingExtension(options: {
  headingFolding?: boolean
  outlining?: boolean
} = {}) {
  const { headingFolding = false, outlining = false } = options

  if (!headingFolding && !outlining) {
    return []
  }

  return [
    foldingConfig.of({ headingFolding, outlining }),
    foldedRegionsField,
    foldDecorationsField,
    foldingTheme
  ]
}
