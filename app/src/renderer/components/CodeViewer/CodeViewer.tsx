import React, { useEffect, useRef, useState, useMemo } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import {
  syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput,
  foldGutter, foldKeymap, indentUnit, LanguageDescription
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { languages } from '@codemirror/language-data'
import { tags } from '@lezer/highlight'
import { detectLanguage } from '../../utils/codeLanguages'
import { writeClipboardText } from '../../utils/clipboard'
import { useTranslation } from '../../utils/translations'

interface CodeViewerProps {
  vaultPath: string
  relativePath: string
}

const AUTOSAVE_DELAY = 800

// Syntax-Farben über CSS-Variablen (Light/Dark in CodeViewer.css)
const codeHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--code-keyword)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--code-string)' },
  { tag: [tags.comment, tags.blockComment, tags.lineComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [tags.number, tags.bool, tags.atom, tags.null, tags.unit], color: 'var(--code-number)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: 'var(--code-function)' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.self], color: 'var(--code-type)' },
  { tag: [tags.propertyName, tags.attributeName, tags.definition(tags.propertyName)], color: 'var(--code-property)' },
  { tag: [tags.definition(tags.variableName), tags.variableName], color: 'var(--code-variable)' },
  { tag: [tags.operator, tags.operatorKeyword, tags.punctuation, tags.separator], color: 'var(--code-operator)' },
  { tag: [tags.meta, tags.processingInstruction, tags.annotation, tags.modifier], color: 'var(--code-meta)' },
  { tag: [tags.tagName, tags.angleBracket], color: 'var(--code-tag)' },
  { tag: tags.heading, color: 'var(--code-keyword)', fontWeight: 'bold' },
  { tag: [tags.link, tags.url], color: 'var(--accent-color)' },
  { tag: tags.invalid, color: 'var(--error-color, #e5534b)' }
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, "JetBrains Mono", "SF Mono", Menlo, monospace)',
    lineHeight: '1.6',
    overflow: 'auto'
  },
  '.cm-content': {
    padding: '12px 0',
    caretColor: 'var(--text-primary)'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-muted)',
    border: 'none',
    paddingLeft: '8px'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--bg-tertiary)'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--bg-tertiary) 45%, transparent)'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--accent-color) 25%, transparent)'
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--text-primary)'
  },
  '.cm-panels': {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border-color)'
  },
  '.cm-panels input, .cm-panels button, .cm-panels label': {
    fontSize: '12px',
    color: 'var(--text-primary)'
  },
  '.cm-textfield': {
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px'
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px'
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--accent-color) 30%, transparent)'
  },
  '.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--accent-color) 55%, transparent)'
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)'
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent-color)',
    color: 'var(--accent-on, #fff)'
  }
})

type SaveState = 'clean' | 'dirty' | 'saving' | 'error'

export const CodeViewer: React.FC<CodeViewerProps> = ({ vaultPath, relativePath }) => {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [vscodeMsg, setVscodeMsg] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('clean')
  const [lineCount, setLineCount] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  const language = useMemo(() => detectLanguage(relativePath), [relativePath])
  const fileName = relativePath.split(/[/\\]/).pop() || relativePath

  useEffect(() => {
    // Alles pfad-gebunden in dieser Closure halten: beim Datei-Wechsel läuft der
    // Render (neuer Pfad) VOR dem Cleanup (alter Inhalt) — Refs auf den Pfad
    // würden den alten Inhalt in die neue Datei schreiben.
    const fullPath = `${vaultPath}/${relativePath}`
    let cancelled = false
    let view: EditorView | null = null
    let lastSaved = ''
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    setLoaded(false)
    setError(null)
    setSaveState('clean')

    const saveNow = async (): Promise<void> => {
      if (!view) return
      const content = view.state.doc.toString()
      if (content === lastSaved) return

      if (!cancelled) setSaveState('saving')
      try {
        await window.electronAPI.writeFile(fullPath, content)
        lastSaved = content
        if (!cancelled && view) {
          // Nur auf clean setzen, wenn zwischenzeitlich nichts Neues getippt wurde
          setSaveState(view.state.doc.toString() === content ? 'clean' : 'dirty')
        }
      } catch (err) {
        console.error('[CodeViewer] Fehler beim Speichern:', err)
        if (!cancelled) setSaveState('error')
      }
    }

    const scheduleSave = (): void => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => { saveNow() }, AUTOSAVE_DELAY)
    }

    const init = async (): Promise<void> => {
      let text = ''
      try {
        text = (await window.electronAPI.readFile(fullPath) as string) ?? ''
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
        return
      }
      if (cancelled || !containerRef.current) return

      lastSaved = text
      const languageCompartment = new Compartment()

      const state = EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          foldGutter(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          rectangularSelection(),
          crosshairCursor(),
          history(),
          indentOnInput(),
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          highlightSelectionMatches(),
          search({ top: true }),
          syntaxHighlighting(codeHighlightStyle),
          editorTheme,
          languageCompartment.of([]),
          keymap.of([
            { key: 'Mod-s', run: () => { saveNow(); return true } },
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setLineCount(update.state.doc.lines)
              setSaveState(update.state.doc.toString() === lastSaved ? 'clean' : 'dirty')
              scheduleSave()
            }
          })
        ]
      })

      view = new EditorView({ state, parent: containerRef.current })
      viewRef.current = view
      setLineCount(state.doc.lines)
      setLoaded(true)

      // Sprache asynchron nachladen (language-data lädt Pakete lazy)
      const desc = LanguageDescription.matchFilename(languages, fileName)
      if (desc) {
        desc.load().then((support) => {
          if (!cancelled && view) {
            view.dispatch({ effects: languageCompartment.reconfigure(support) })
          }
        }).catch((err) => {
          console.warn('[CodeViewer] Sprach-Modul konnte nicht geladen werden:', err)
        })
      }
    }
    init()

    return () => {
      cancelled = true
      if (saveTimer) clearTimeout(saveTimer)
      if (viewRef.current === view) viewRef.current = null
      if (view) {
        // Ungespeicherte Änderungen beim Schließen/Tabwechsel nicht verlieren
        const content = view.state.doc.toString()
        if (content !== lastSaved) {
          window.electronAPI.writeFile(fullPath, content).catch((err: unknown) => {
            console.error('[CodeViewer] Fehler beim Speichern (unmount):', err)
          })
        }
        view.destroy()
        view = null
      }
    }
    // fileName ist aus relativePath abgeleitet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, relativePath])

  const handleCopy = async (): Promise<void> => {
    const view = viewRef.current
    if (!view) return
    try {
      await writeClipboardText(view.state.doc.toString())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: stumm ignorieren
    }
  }

  return (
    <div className="code-viewer">
      <div className="code-viewer-header">
        <div className="code-viewer-title">
          <span className="code-viewer-filename">{fileName}</span>
          {language && <span className="code-viewer-lang">{language}</span>}
          {saveState === 'dirty' && (
            <span className="code-viewer-dirty" title={t('codeEditor.unsaved')}>●</span>
          )}
          {saveState === 'error' && (
            <span className="code-viewer-save-error">{t('codeEditor.saveError')}</span>
          )}
        </div>
        <div className="code-viewer-actions">
          <span className="code-viewer-lines">{lineCount} {t('codeEditor.lines')}</span>
          <button
            className="code-viewer-action-btn"
            onClick={async () => {
              const result = await window.electronAPI.openInVSCode(`${vaultPath}/${relativePath}`)
              if (!result.success && result.error) {
                setVscodeMsg(result.error)
                setTimeout(() => setVscodeMsg(null), 6000)
              }
            }}
            title={t('fileTree.openInVSCode')}
          >
            {t('fileTree.openInVSCode')}
          </button>
          <button
            className="code-viewer-action-btn"
            onClick={handleCopy}
            disabled={!loaded}
            title={t('codeEditor.copy')}
          >
            {copied ? t('codeEditor.copied') : t('codeEditor.copy')}
          </button>
        </div>
      </div>

      {error && (
        <div className="code-viewer-error">
          {t('codeEditor.loadError')}: {error}
        </div>
      )}

      {vscodeMsg && (
        <div className="code-viewer-error">
          {vscodeMsg}
        </div>
      )}

      {!loaded && !error && (
        <div className="code-viewer-loading">{t('codeEditor.loading')}</div>
      )}

      <div className="code-viewer-editor" ref={containerRef} />
    </div>
  )
}
