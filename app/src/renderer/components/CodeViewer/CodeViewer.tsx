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
import { buildHtmlPreviewUrl, isHtmlPreviewable } from '../../../shared/htmlPreview'

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
  // Externe Änderung bei ungespeichertem Puffer: Banner statt stillem Überschreiben.
  const [externalConflict, setExternalConflict] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Save-Trigger aus der Effect-Closure (pfad-gebunden), damit der Vorschau-
  // Wechsel ungespeicherte Änderungen vor dem iframe-Load wegschreibt.
  const saveNowRef = useRef<(() => Promise<void>) | null>(null)
  const resolveConflictRef = useRef<((keepMine: boolean) => Promise<void>) | null>(null)

  const language = useMemo(() => detectLanguage(relativePath), [relativePath])
  const fileName = relativePath.split(/[/\\]/).pop() || relativePath

  // HTML-Vorschau: sandboxed iframe über mindgraph-preview:// (shared/htmlPreview.ts).
  // Default ist Vorschau — wie bei Notizen (Lesen zuerst, Editieren einen Klick entfernt).
  const isHtml = useMemo(() => isHtmlPreviewable(relativePath), [relativePath])
  const [viewMode, setViewMode] = useState<'code' | 'preview'>(isHtml ? 'preview' : 'code')
  const [previewNonce, setPreviewNonce] = useState(0)
  const previewUrl = useMemo(
    () => (isHtml ? buildHtmlPreviewUrl(vaultPath, relativePath) : ''),
    [isHtml, vaultPath, relativePath]
  )

  const showPreview = async (): Promise<void> => {
    await saveNowRef.current?.()
    setPreviewNonce((n) => n + 1)
    setViewMode('preview')
  }

  useEffect(() => {
    // Alles pfad-gebunden in dieser Closure halten: beim Datei-Wechsel läuft der
    // Render (neuer Pfad) VOR dem Cleanup (alter Inhalt) — Refs auf den Pfad
    // würden den alten Inhalt in die neue Datei schreiben.
    const fullPath = `${vaultPath}/${relativePath}`
    let cancelled = false
    let view: EditorView | null = null
    let lastSaved = ''
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    // Guard gegen den Stale-Puffer-Clobber (real: externe Reparatur zweimal überschrieben):
    // mtime der Version, die dieser Editor zuletzt gelesen/geschrieben hat. Alles Neuere
    // auf der Platte ist eine externe Änderung.
    let lastKnownMtime = 0
    let conflict = false

    setLoaded(false)
    setError(null)
    setSaveState('clean')
    setExternalConflict(false)
    setViewMode(isHtmlPreviewable(relativePath) ? 'preview' : 'code')
    setPreviewNonce((n) => n + 1)

    const readDiskMtime = async (): Promise<number> => {
      const stats = await window.electronAPI.getFileStats(fullPath)
      return new Date(stats.modifiedAt).getTime()
    }

    // Externe Version in den Editor übernehmen (nur bei sauberem Puffer oder auf Klick).
    const adoptDiskVersion = async (): Promise<void> => {
      const mtime = await readDiskMtime()
      const disk = (await window.electronAPI.readFile(fullPath) as string) ?? ''
      if (cancelled || !view) return
      lastSaved = disk
      lastKnownMtime = mtime
      if (view.state.doc.toString() !== disk) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: disk } })
      }
      setSaveState('clean')
      setPreviewNonce((n) => n + 1)
    }

    const saveNow = async (force = false): Promise<void> => {
      if (!view) return
      if (conflict && !force) return
      const content = view.state.doc.toString()
      if (content === lastSaved) return

      // Vor dem Schreiben prüfen, ob die Platte inzwischen eine fremde Version trägt —
      // sonst überschreibt der Editor-Puffer externe Writes (Claude, VS Code, Sync).
      if (!force) {
        try {
          if (await readDiskMtime() > lastKnownMtime) {
            const disk = (await window.electronAPI.readFile(fullPath) as string) ?? ''
            if (disk !== lastSaved && disk !== content) {
              conflict = true
              if (!cancelled) setExternalConflict(true)
              return
            }
          }
        } catch { /* stat fehlgeschlagen (Datei neu/gelöscht) — normaler Write-Versuch */ }
      }

      if (!cancelled) setSaveState('saving')
      try {
        await window.electronAPI.writeFile(fullPath, content)
        lastSaved = content
        try { lastKnownMtime = await readDiskMtime() } catch { /* unkritisch */ }
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
    saveNowRef.current = saveNow

    // Poll + Fokus-Check auf externe Änderungen: sauberer Puffer → still neu laden
    // (wie VS Code), ungespeicherte Änderungen → Konflikt-Banner, Autosave pausiert.
    const checkExternal = async (): Promise<void> => {
      if (cancelled || !view || conflict) return
      try {
        const mtime = await readDiskMtime()
        if (mtime <= lastKnownMtime) return
        const disk = (await window.electronAPI.readFile(fullPath) as string) ?? ''
        if (cancelled || !view) return
        const current = view.state.doc.toString()
        if (disk === current) {
          lastSaved = disk
          lastKnownMtime = mtime
        } else if (current === lastSaved) {
          await adoptDiskVersion()
        } else {
          conflict = true
          setExternalConflict(true)
        }
      } catch { /* Datei evtl. gerade gelöscht/umbenannt — nichts erzwingen */ }
    }
    const pollTimer = setInterval(() => { checkExternal() }, 2500)
    const onFocus = (): void => { checkExternal() }
    window.addEventListener('focus', onFocus)

    const resolveConflict = async (keepMine: boolean): Promise<void> => {
      conflict = false
      if (!cancelled) setExternalConflict(false)
      try {
        if (keepMine) await saveNow(true)
        else await adoptDiskVersion()
      } catch (err) {
        console.error('[CodeViewer] Konflikt-Auflösung fehlgeschlagen:', err)
        if (!cancelled) setSaveState('error')
      }
    }
    resolveConflictRef.current = resolveConflict

    const init = async (): Promise<void> => {
      let text = ''
      try {
        // mtime VOR dem Inhalt lesen: ändert sich die Datei dazwischen, ist die
        // gespeicherte mtime älter → der nächste Poll lädt schlimmstenfalls einmal
        // zu viel neu, verpasst aber nie eine externe Änderung.
        try { lastKnownMtime = await readDiskMtime() } catch { /* Datei evtl. brandneu */ }
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
      clearInterval(pollTimer)
      window.removeEventListener('focus', onFocus)
      if (saveNowRef.current === saveNow) saveNowRef.current = null
      if (resolveConflictRef.current === resolveConflict) resolveConflictRef.current = null
      if (viewRef.current === view) viewRef.current = null
      if (view) {
        // Ungespeicherte Änderungen beim Schließen/Tabwechsel nicht verlieren —
        // aber NIE über eine extern geänderte Datei schreiben (der Clobber-Vektor):
        // bei ungelöstem Konflikt oder neuerer Platten-Version wird übersprungen.
        const content = view.state.doc.toString()
        if (content !== lastSaved && !conflict) {
          window.electronAPI.getFileStats(fullPath)
            .then((stats) => {
              if (new Date(stats.modifiedAt).getTime() > lastKnownMtime) {
                console.warn('[CodeViewer] Unmount-Save übersprungen — Datei wurde extern geändert:', fullPath)
                return
              }
              return window.electronAPI.writeFile(fullPath, content)
            })
            .catch((err: unknown) => {
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
          {isHtml && (
            <div className="code-viewer-mode-toggle">
              <button
                className={`code-viewer-action-btn${viewMode === 'preview' ? ' active' : ''}`}
                onClick={() => { showPreview() }}
                title={t('codeEditor.preview')}
              >
                {t('codeEditor.preview')}
              </button>
              <button
                className={`code-viewer-action-btn${viewMode === 'code' ? ' active' : ''}`}
                onClick={() => setViewMode('code')}
                title={t('codeEditor.code')}
              >
                {t('codeEditor.code')}
              </button>
            </div>
          )}
          {isHtml && viewMode === 'preview' && (
            <button
              className="code-viewer-action-btn"
              onClick={() => setPreviewNonce((n) => n + 1)}
              title={t('codeEditor.reloadPreview')}
            >
              {t('codeEditor.reloadPreview')}
            </button>
          )}
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

      {externalConflict && (
        <div className="code-viewer-conflict">
          <span>{t('codeEditor.externalChange')}</span>
          <div className="code-viewer-conflict-actions">
            <button
              className="code-viewer-action-btn"
              onClick={() => { resolveConflictRef.current?.(false) }}
            >
              {t('codeEditor.conflictReload')}
            </button>
            <button
              className="code-viewer-action-btn"
              onClick={() => { resolveConflictRef.current?.(true) }}
            >
              {t('codeEditor.conflictKeepMine')}
            </button>
          </div>
        </div>
      )}

      {!loaded && !error && viewMode === 'code' && (
        <div className="code-viewer-loading">{t('codeEditor.loading')}</div>
      )}

      {/* Editor bleibt im Vorschau-Modus gemountet (hält Doc + Autosave), nur versteckt */}
      <div
        className={`code-viewer-editor${viewMode === 'preview' ? ' code-viewer-editor--hidden' : ''}`}
        ref={containerRef}
      />

      {/* Sandbox OHNE allow-same-origin: opaque Origin, kein Zugriff auf App/Storage.
          allow-popups: target=_blank-Links landen via setWindowOpenHandler im System-Browser. */}
      {isHtml && viewMode === 'preview' && !error && (
        <iframe
          key={previewNonce}
          className="code-viewer-preview"
          src={previewUrl}
          sandbox="allow-scripts allow-forms allow-popups"
          title={fileName}
        />
      )}
    </div>
  )
}
