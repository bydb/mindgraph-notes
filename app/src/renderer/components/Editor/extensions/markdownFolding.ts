import { EditorView } from '@codemirror/view'
import { EditorState, Facet } from '@codemirror/state'
import { foldService, foldGutter, codeFolding } from '@codemirror/language'

// WICHTIG (v0.7.30): Diese Extension nutzte früher eigene In-Content-Widgets
// (Decoration.widget am Zeilenanfang) als Fold-Toggles. Das korrumpierte beim
// schnellen Tippen das Dokument: Enter spaltet die Zeile im contenteditable,
// Live-Preview versteckt im selben Update die "## "-Marker, und das Widget
// erschien/verschwand am selben DOM-Knoten — CodeMirrors DOM-Observer las die
// Eingabe falsch zurück ("## "-Präfixe und Zeilenumbrüche verschwanden, Text
// landete am Dokumentende). Fold-UI gehört deshalb in die GUTTER, nie in den
// Textfluss: foldService + foldGutter + codeFolding sind die dafür gebaute,
// battle-tested CodeMirror-Infrastruktur.

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

// Foldable range for a heading line: from heading line end to section end
// (heading itself stays visible — standard folding UX).
function headingFoldRange(state: EditorState, lineFrom: number): { from: number; to: number } | null {
  const line = state.doc.lineAt(lineFrom)
  const headingMatch = line.text.match(/^(#{1,6})\s+.+/)
  if (!headingMatch) return null

  const level = headingMatch[1].length
  const sectionEnd = findHeadingSectionEnd(state, line.number, level)
  if (sectionEnd <= line.to) return null

  return { from: line.to, to: sectionEnd }
}

// Foldable range for a list item with indented children
function outlineFoldRange(state: EditorState, lineFrom: number): { from: number; to: number } | null {
  const doc = state.doc
  const line = doc.lineAt(lineFrom)
  const listMatch = line.text.match(/^(\s*)([-*+]|\d+\.)\s/)
  if (!listMatch) return null

  const baseIndent = listMatch[1].length
  let endLine = line.number
  let hasChildren = false

  for (let j = line.number + 1; j <= doc.lines; j++) {
    const nextText = doc.line(j).text

    if (nextText.trim() === '') continue

    const nextListMatch = nextText.match(/^(\s*)([-*+]|\d+\.)\s/)
    if (nextListMatch) {
      if (nextListMatch[1].length > baseIndent) {
        hasChildren = true
        endLine = j
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

  if (!hasChildren || endLine <= line.number) return null

  return { from: line.to, to: doc.line(endLine).to }
}

// foldService: CodeMirror fragt pro Zeile nach einem faltbaren Bereich.
const markdownFoldService = foldService.of((state, lineStart) => {
  const config = state.facet(foldingConfig)

  if (config.headingFolding) {
    const range = headingFoldRange(state, lineStart)
    if (range) return range
  }
  if (config.outlining) {
    const range = outlineFoldRange(state, lineStart)
    if (range) return range
  }

  return null
})

// Theme for folding UI (gutter markers + placeholder)
const foldingTheme = EditorView.baseTheme({
  '.cm-foldGutter .cm-gutterElement': {
    color: 'var(--text-muted, #666)',
    cursor: 'pointer',
    fontSize: '10px',
    transition: 'color 0.15s ease'
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: 'var(--accent-color, #007acc)'
  },
  '.cm-foldPlaceholder': {
    display: 'inline-block',
    padding: '1px 6px',
    marginLeft: '4px',
    background: 'var(--bg-tertiary, #2a2a2a)',
    color: 'var(--text-muted, #888)',
    border: 'none',
    borderRadius: '3px',
    fontSize: '11px',
    fontStyle: 'italic'
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
    markdownFoldService,
    codeFolding({ placeholderText: '…' }),
    foldGutter({
      openText: '▼',
      closedText: '▶'
    }),
    foldingTheme
  ]
}
