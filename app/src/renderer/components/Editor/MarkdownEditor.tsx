import React, { useEffect, useRef, useCallback, useState, useMemo, memo } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem/mhchem.js'  // Chemie-Support (mhchem)
import mermaid from 'mermaid'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { extractLinks, extractTags, extractTitle, extractHeadings, extractBlocks } from '../../utils/linkExtractor'
import { WikilinkAutocomplete, AutocompleteMode, BlockSelectionInfo } from './WikilinkAutocomplete'
import { livePreviewExtension } from './extensions/livePreview'
import { imageHandlingExtension } from './extensions/imageHandling'
import { AIContextMenu, AIResult } from './AIContextMenu'
import { AIImageDialog } from './AIImageDialog'
import { insertAIResultWithFootnote } from '../../utils/aiFootnote'
import { isImageFile, findImageInVault } from '../../utils/imageUtils'

// Mermaid initialisieren
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
})

// Formatierungs-Kontextmenü Komponente
interface FormatMenuProps {
  x: number
  y: number
  onFormat: (type: string) => void
  onClose: () => void
}

const FormatMenu: React.FC<FormatMenuProps> = memo(({ x, y, onFormat, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState({ x, y })

  // Position anpassen um im Viewport zu bleiben
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const padding = 8
      let newX = x
      let newY = y

      // Rechter Rand
      if (x + rect.width + padding > window.innerWidth) {
        newX = window.innerWidth - rect.width - padding
      }
      // Unterer Rand
      if (y + rect.height + padding > window.innerHeight) {
        newY = window.innerHeight - rect.height - padding
      }
      // Mindestens am Rand
      newX = Math.max(padding, newX)
      newY = Math.max(padding, newY)

      if (newX !== x || newY !== y) {
        setAdjustedPos({ x: newX, y: newY })
      }
    }
  }, [x, y])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const formatOptions = [
    { type: 'cut', label: 'Ausschneiden', icon: '✂️', shortcut: 'Cmd+X' },
    { type: 'copy', label: 'Kopieren', icon: '📋', shortcut: 'Cmd+C' },
    { type: 'paste', label: 'Einfügen', icon: '📥', shortcut: 'Cmd+V' },
    { type: 'divider', label: '', icon: '', shortcut: '' },
    { type: 'bold', label: 'Fett', icon: 'B', shortcut: 'Cmd+B' },
    { type: 'italic', label: 'Kursiv', icon: 'I', shortcut: 'Cmd+I' },
    { type: 'code', label: 'Code', icon: '</>', shortcut: 'Cmd+`' },
    { type: 'strikethrough', label: 'Durchgestrichen', icon: 'S', shortcut: '' },
    { type: 'link', label: 'Link', icon: '🔗', shortcut: '' },
    { type: 'wikilink', label: 'Wikilink', icon: '[[]]', shortcut: '' },
    { type: 'divider', label: '', icon: '', shortcut: '' },
    { type: 'task', label: 'Task', icon: '☐', shortcut: '' },
    { type: 'task-reminder', label: 'Task mit Reminder', icon: '⏰', shortcut: '' },
    { type: 'footnote', label: 'Fußnote', icon: '¹', shortcut: '' },
    { type: 'divider', label: '', icon: '', shortcut: '' },
    { type: 'heading1', label: 'Überschrift 1', icon: 'H1', shortcut: '' },
    { type: 'heading2', label: 'Überschrift 2', icon: 'H2', shortcut: '' },
    { type: 'heading3', label: 'Überschrift 3', icon: 'H3', shortcut: '' },
    { type: 'divider', label: '', icon: '', shortcut: '' },
    { type: 'quote', label: 'Zitat', icon: '❝', shortcut: '' },
    { type: 'callout-note', label: 'Callout: Note', icon: '📝', shortcut: '' },
    { type: 'callout-tip', label: 'Callout: Tip', icon: '💡', shortcut: '' },
    { type: 'callout-warning', label: 'Callout: Warning', icon: '⚠️', shortcut: '' },
    { type: 'callout-summary', label: 'Callout: Summary', icon: '📄', shortcut: '' },
  ]

  return (
    <div
      ref={menuRef}
      className="format-menu"
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 1000
      }}
    >
      {formatOptions.map((option, index) => (
        option.type === 'divider' ? (
          <div key={index} className="format-menu-divider" />
        ) : (
          <button
            key={option.type}
            className="format-menu-item"
            onClick={() => onFormat(option.type)}
            title={option.shortcut || option.label}
          >
            <span className="format-menu-icon">{option.icon}</span>
            <span className="format-menu-label">{option.label}</span>
            {option.shortcut && <span className="format-menu-shortcut">{option.shortcut}</span>}
          </button>
        )
      ))}
    </div>
  )
})

FormatMenu.displayName = 'FormatMenu'

// Markdown-it instance mit Optionen
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true
})

// Task-Listen Plugin aktivieren (für - [ ] und - [x] Syntax)
md.use(taskLists, {
  enabled: true,
  label: true,
  labelAfter: true
})

// Fußnoten Plugin aktivieren (für [^1] Syntax)
md.use(footnote)

// LaTeX/Math Plugin mit KaTeX (inkl. Chemie-Support via mhchem)
md.use(texmath, {
  engine: katex,
  delimiters: 'dollars',  // $...$ für inline, $$...$$ für block
  katexOptions: {
    throwOnError: false,
    trust: true,
    strict: false
  }
})

// Custom image renderer für Standard-Markdown ![alt](url) Syntax
const defaultImageRender = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token.attrGet('src') || ''
  const alt = token.content || ''

  // Prüfe ob es ein lokales Bild ist (kein http/https/data URL)
  if (src && !src.startsWith('http') && !src.startsWith('data:')) {
    // Parse Größe aus alt: "alt|300" oder "alt|300x200"
    let width: number | null = null
    let height: number | null = null
    let cleanAlt = alt

    const sizeMatch = alt.match(/^(.*)?\|(\d+)(?:x(\d+))?$/)
    if (sizeMatch) {
      cleanAlt = sizeMatch[1] || ''
      width = parseInt(sizeMatch[2], 10)
      height = sizeMatch[3] ? parseInt(sizeMatch[3], 10) : null
    }

    const style = width ? `style="width: ${width}px${height ? `; height: ${height}px` : ''}"` : ''
    return `<img class="md-image" data-src="${src}" alt="${cleanAlt}" ${style}>`
  }

  // Für externe URLs: Standard-Renderer verwenden
  if (defaultImageRender) {
    return defaultImageRender(tokens, idx, options, env, self)
  }
  return `<img src="${src}" alt="${alt}">`
}

// Custom renderer für [[wikilinks]], ![[embeds]] und ![[images]]
const defaultRender = md.renderer.rules.text || ((tokens, idx) => tokens[idx].content)
md.renderer.rules.text = (tokens, idx, options, env, self) => {
  const content = tokens[idx].content

  // Konvertiere ![[embeds]] - unterscheide zwischen Bildern, PDFs und Notiz-Embeds
  let result = content.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (match, linkText, sizeOrAlias) => {
    // Prüfe ob es sich um ein Bild handelt
    if (isImageFile(linkText)) {
      // Bild-Embed: ![[bild.png]] oder ![[bild.png|300]] oder ![[bild.png|300x200]]
      let width: number | null = null
      let height: number | null = null

      if (sizeOrAlias) {
        const sizeMatch = sizeOrAlias.match(/^(\d+)(?:x(\d+))?$/)
        if (sizeMatch) {
          width = parseInt(sizeMatch[1], 10)
          height = sizeMatch[2] ? parseInt(sizeMatch[2], 10) : null
        }
      }

      const style = width ? `style="width: ${width}px${height ? `; height: ${height}px` : ''}"` : ''
      // Behalte den originalen Pfad - wird später aufgelöst
      return `<img class="md-image" data-src="${linkText}" alt="${linkText}" ${style}>`
    }

    // Prüfe ob es sich um ein PDF handelt
    if (linkText.toLowerCase().endsWith('.pdf')) {
      // PDF-Embed: ![[document.pdf]]
      return `<div class="pdf-embed" data-filename="${linkText}">
        <div class="pdf-embed-loading">Lade PDF: ${linkText}...</div>
      </div>`
    }

    // Notiz-Embed: ![[noteName]] oder ![[noteName#heading]] oder ![[noteName#^blockid]]
    const hashIndex = linkText.indexOf('#')
    const noteName = hashIndex > -1 ? linkText.substring(0, hashIndex) : linkText
    const fragment = hashIndex > -1 ? linkText.substring(hashIndex + 1) : ''
    const isBlock = fragment.startsWith('^')

    return `<div class="wikilink-embed" data-note="${noteName}" data-fragment="${fragment}" data-is-block="${isBlock}">
      <div class="wikilink-embed-loading">Lade ${linkText}...</div>
    </div>`
  })

  // Konvertiere [[wikilinks]] zu klickbaren Links
  result = result.replace(/\[\[([^\]]+)\]\]/g, (_, linkText) => {
    // Parse link: noteName#heading oder noteName#^blockid
    const hashIndex = linkText.indexOf('#')
    const noteName = hashIndex > -1 ? linkText.substring(0, hashIndex) : linkText
    const fragment = hashIndex > -1 ? linkText.substring(hashIndex + 1) : ''

    // Display text: nur Notizname wenn Fragment vorhanden
    const displayText = linkText

    return `<a href="#" class="wikilink" data-link="${noteName}" data-fragment="${fragment}">${displayText}</a>`
  })

  return result
}

// Custom fence renderer für Mermaid-Diagramme
const defaultFenceRender = md.renderer.rules.fence
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info.trim().toLowerCase()

  if (info === 'mermaid') {
    const code = token.content.trim()
    const id = `mermaid-${idx}-${Date.now()}`
    return `<div class="mermaid-container"><pre class="mermaid" id="${id}">${code}</pre></div>`
  }

  // Fallback zum Standard-Renderer
  if (defaultFenceRender) {
    return defaultFenceRender(tokens, idx, options, env, self)
  }
  return `<pre><code class="language-${info}">${md.utils.escapeHtml(token.content)}</code></pre>`
}

// Verarbeitet Task-Checkboxen und fügt data-Attribute für Interaktivität hinzu
function processTaskCheckboxes(html: string, sourceContent: string): string {
  // Finde alle Task-Zeilen im Quelltext (in der Reihenfolge wie sie erscheinen)
  const lines = sourceContent.split('\n')
  const taskLines: number[] = []

  for (let i = 0; i < lines.length; i++) {
    // Task-Zeile: beginnt mit - [ ], - [x], * [ ], etc.
    if (/^(\s*[-*+]|\s*\d+\.)\s*\[[x\s]\]/i.test(lines[i])) {
      taskLines.push(i)
    }
  }

  let taskIndex = 0

  // Das markdown-it-task-lists Plugin rendert (OHNE Leerzeichen zwischen Attributen!):
  // <input class="task-list-item-checkbox"type="checkbox" id="...">
  // oder mit checked: <input class="task-list-item-checkbox" checked=""type="checkbox"...>
  // Wir ersetzen das komplett mit unserer Version
  return html.replace(/<input\s+class="task-list-item-checkbox"[^>]*>/gi, (match) => {
    const isChecked = match.includes('checked')
    const lineIndex = taskLines[taskIndex] ?? -1
    taskIndex++

    const checkedAttr = isChecked ? ' checked' : ''
    return `<input class="task-list-item-checkbox task-checkbox" type="checkbox"${checkedAttr} data-line="${lineIndex}" data-checked="${isChecked}">`
  })
}

// Parst YAML-Frontmatter und gibt Titel + restlichen Content zurück
function parseFrontmatter(content: string): { title: string | null; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { title: null, body: content }
  }

  const frontmatter = match[1]
  const body = content.replace(frontmatterRegex, '')

  // Extrahiere Titel aus Frontmatter
  const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  const title = titleMatch ? titleMatch[1] : null

  return { title, body }
}

// Konvertiert Bilder gefolgt von Kursivtext zu Figure mit Caption
function processFigures(html: string): string {
  // Pattern: <img ...> followed (possibly with whitespace) by <em>caption</em>
  // Wrap in <figure> with <figcaption>
  return html.replace(
    /(<img[^>]*class="md-image"[^>]*>)\s*(?:<br\s*\/?>)?\s*<em>([^<]+)<\/em>/gi,
    (match, imgTag, caption) => {
      return `<figure class="md-figure">${imgTag}<figcaption>${caption}</figcaption></figure>`
    }
  )
}

// Konvertiert Obsidian Callouts zu HTML
function processCallouts(content: string): string {
  // Callout Pattern: > [!type] optional title
  // Gefolgt von > content lines
  const calloutRegex = /^>\s*\[!(\w+)\](?:\s+(.+))?\n((?:>.*\n?)*)/gm

  return content.replace(calloutRegex, (match, type, customTitle, body) => {
    const calloutType = type.toLowerCase()
    const title = customTitle || type.charAt(0).toUpperCase() + type.slice(1)

    // Entferne > am Anfang jeder Zeile im Body
    const cleanBody = body
      .split('\n')
      .map((line: string) => line.replace(/^>\s?/, ''))
      .join('\n')
      .trim()

    // Callout Icons
    const icons: Record<string, string> = {
      note: '📝',
      tip: '💡',
      hint: '💡',
      important: '❗',
      warning: '⚠️',
      caution: '⚠️',
      danger: '🔴',
      error: '❌',
      bug: '🐛',
      example: '📋',
      quote: '💬',
      cite: '💬',
      info: 'ℹ️',
      todo: '☑️',
      success: '✅',
      check: '✅',
      done: '✅',
      question: '❓',
      help: '❓',
      faq: '❓',
      attention: '⚡',
      failure: '❌',
      fail: '❌',
      missing: '❌',
      abstract: '📄',
      summary: '📄',
      tldr: '📄'
    }

    const icon = icons[calloutType] || '📌'

    return `<div class="callout callout-${calloutType}">
      <div class="callout-title">${icon} ${title}</div>
      <div class="callout-content">${md.render(cleanBody)}</div>
    </div>\n`
  })
}

type ViewMode = 'edit' | 'preview' | 'live-preview'

// Compartment for live preview extension (created once, reused)
const livePreviewCompartment = new Compartment()

interface MarkdownEditorProps {
  noteId?: string  // Optional: spezifische Notiz anzeigen (für Text-Split)
  isSecondary?: boolean  // Ist dies das sekundäre Panel im Text-Split?
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ noteId, isSecondary = false }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedContentRef = useRef<string>('')
  const isExternalUpdateRef = useRef(false)

  const { vaultPath, selectedNoteId, secondarySelectedNoteId, notes, updateNote, selectNote, selectSecondaryNote, addNote, fileTree, setFileTree, navigateBack, navigateForward, canNavigateBack, canNavigateForward } = useNotesStore()
  const { pendingTemplateInsert, setPendingTemplateInsert, ollama, editorHeadingFolding, editorOutlining, outlineStyle, editorShowWordCount } = useUIStore()

  // Verwende die übergebene noteId oder die primary/secondary Selection
  const effectiveNoteId = noteId ?? (isSecondary ? secondarySelectedNoteId : selectedNoteId)
  const selectedNote = notes.find(n => n.id === effectiveNoteId)

  const [isSaving, setIsSaving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('edit')
  const [previewContent, setPreviewContent] = useState('')
  const [formatMenu, setFormatMenu] = useState<{ x: number; y: number } | null>(null)
  const [foldedHeadings, setFoldedHeadings] = useState<Set<string>>(new Set())
  const [aiMenu, setAiMenu] = useState<{ x: number; y: number; selectedText: string; selectionStart: number; selectionEnd: number } | null>(null)
  const [showAIImageDialog, setShowAIImageDialog] = useState(false)

  // Wikilink Hover Preview State
  const [hoverPreview, setHoverPreview] = useState<{
    x: number
    y: number
    noteName: string
    content: string
    title: string
    showAbove?: boolean
  } | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeWikilinkRef = useRef<HTMLElement | null>(null)

  // Wikilink Autocomplete State
  const [autocomplete, setAutocomplete] = useState<{
    isOpen: boolean
    mode: AutocompleteMode
    targetNote: string | null
    triggerPos: number
    query: string
    wikilinkStart: number  // Position von [[ - wichtig für korrektes Einfügen bei Mausklick
  } | null>(null)

  // Template in aktuelle Notiz einfügen (Cmd+Shift+T)
  useEffect(() => {
    if (!pendingTemplateInsert || !viewRef.current) return

    const view = viewRef.current
    const { content, cursorPosition } = pendingTemplateInsert

    // An Cursor-Position einfügen
    const cursor = view.state.selection.main.head
    view.dispatch({
      changes: { from: cursor, to: cursor, insert: content },
      selection: cursorPosition !== undefined
        ? { anchor: cursor + cursorPosition }
        : { anchor: cursor + content.length }
    })

    view.focus()
    setPendingTemplateInsert(null)
  }, [pendingTemplateInsert, setPendingTemplateInsert])

  // Formatierung anwenden
  const applyFormat = useCallback(async (type: string) => {
    const view = viewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    const selectedText = view.state.doc.sliceString(from, to)

    // Clipboard-Aktionen
    if (type === 'copy') {
      if (selectedText) {
        await navigator.clipboard.writeText(selectedText)
      }
      setFormatMenu(null)
      return
    }

    if (type === 'cut') {
      if (selectedText) {
        await navigator.clipboard.writeText(selectedText)
        view.dispatch({
          changes: { from, to, insert: '' }
        })
      }
      setFormatMenu(null)
      return
    }

    if (type === 'paste') {
      try {
        const clipboardText = await navigator.clipboard.readText()
        view.dispatch({
          changes: { from, to, insert: clipboardText },
          selection: { anchor: from + clipboardText.length }
        })
      } catch (error) {
        console.error('Fehler beim Einfügen:', error)
      }
      setFormatMenu(null)
      return
    }

    let replacement = ''
    let cursorOffset = 0

    switch (type) {
      case 'bold':
        replacement = `**${selectedText}**`
        cursorOffset = selectedText ? 0 : 2
        break
      case 'italic':
        replacement = `*${selectedText}*`
        cursorOffset = selectedText ? 0 : 1
        break
      case 'code':
        replacement = `\`${selectedText}\``
        cursorOffset = selectedText ? 0 : 1
        break
      case 'strikethrough':
        replacement = `~~${selectedText}~~`
        cursorOffset = selectedText ? 0 : 2
        break
      case 'link':
        replacement = `[${selectedText}](url)`
        cursorOffset = selectedText ? -1 : 1
        break
      case 'wikilink':
        replacement = `[[${selectedText}]]`
        cursorOffset = selectedText ? 0 : 2
        break
      case 'heading1':
        replacement = `# ${selectedText}`
        break
      case 'heading2':
        replacement = `## ${selectedText}`
        break
      case 'heading3':
        replacement = `### ${selectedText}`
        break
      case 'quote':
        replacement = `> ${selectedText}`
        break
      case 'callout-note':
        replacement = `> [!note] Notiz\n> ${selectedText || 'Inhalt hier...'}`
        break
      case 'callout-tip':
        replacement = `> [!tip] Tipp\n> ${selectedText || 'Inhalt hier...'}`
        break
      case 'callout-warning':
        replacement = `> [!warning] Warnung\n> ${selectedText || 'Inhalt hier...'}`
        break
      case 'callout-summary':
        replacement = `> [!summary] Zusammenfassung\n> ${selectedText || 'Inhalt hier...'}`
        break
      case 'task':
        replacement = `- [ ] ${selectedText || 'Aufgabe'}`
        break
      case 'task-reminder': {
        // Generiere Datum für morgen 10:00
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const year = tomorrow.getFullYear()
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
        const day = String(tomorrow.getDate()).padStart(2, '0')
        replacement = `- [ ] ${selectedText || 'Aufgabe'} (@[[${year}-${month}-${day}]] 10:00)`
        break
      }
      case 'footnote': {
        // Finde die nächste freie Fußnoten-Nummer
        const docContent = view.state.doc.toString()
        const existingFootnotes = docContent.match(/\[\^(\d+)\]/g) || []
        const usedNumbers = existingFootnotes.map(fn => parseInt(fn.match(/\d+/)?.[0] || '0'))
        let nextNumber = 1
        while (usedNumbers.includes(nextNumber)) {
          nextNumber++
        }

        // Füge Referenz an Cursor-Position ein
        const footnoteRef = `[^${nextNumber}]`
        // Definition am Ende - mit Platzhalter für den Fußnotentext
        const footnoteDefinition = `\n\n[^${nextNumber}]: `

        // Berechne neue Positionen nach dem Einfügen
        const docLength = view.state.doc.length
        const refLength = footnoteRef.length
        const selectionDiff = to - from // Länge des ersetzten Textes

        // Neue Position für Cursor: Am Ende der Fußnoten-Definition
        // docLength - selectionDiff + refLength + footnoteDefinition.length
        const newCursorPos = docLength - selectionDiff + refLength + footnoteDefinition.length

        view.dispatch({
          changes: [
            { from, to, insert: footnoteRef },
            { from: docLength, to: docLength, insert: footnoteDefinition }
          ],
          selection: { anchor: newCursorPos }
        })
        setFormatMenu(null)
        view.focus()
        return
      }
      default:
        return
    }

    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + replacement.length - cursorOffset }
    })

    setFormatMenu(null)
    view.focus()
  }, [])

  // Speichern
  const saveContent = useCallback(async (content: string) => {
    if (!selectedNote || !vaultPath) return
    if (content === lastSavedContentRef.current) return

    setIsSaving(true)

    try {
      const fullPath = `${vaultPath}/${selectedNote.path}`
      await window.electronAPI.writeFile(fullPath, content)

      lastSavedContentRef.current = content

      // Update note in store - markiere als externes Update
      const fileName = selectedNote.path.split('/').pop() || selectedNote.path
      isExternalUpdateRef.current = true
      updateNote(selectedNote.id, {
        content,
        title: extractTitle(content, fileName),
        outgoingLinks: extractLinks(content),
        tags: extractTags(content),
        headings: extractHeadings(content),
        blocks: extractBlocks(content),
        modifiedAt: new Date()
      })

      // Reset flag nach kurzer Verzögerung
      setTimeout(() => {
        isExternalUpdateRef.current = false
      }, 100)

    } catch (error) {
      console.error('Fehler beim Speichern:', error)
    } finally {
      setIsSaving(false)
    }
  }, [selectedNote, vaultPath, updateNote])

  // Debounced save bei Änderungen
  const handleDocChange = useCallback((content: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveContent(content)
    }, 500)
  }, [saveContent])

  // Wikilink Autocomplete Selection Handler
  const handleAutocompleteSelect = useCallback(async (value: string, mode: AutocompleteMode, blockInfo?: BlockSelectionInfo) => {
    if (!viewRef.current || !autocomplete) return

    // Tag-Modus: Einfach den Tag einfügen
    if (mode === 'tag') {
      const view = viewRef.current
      const start = autocomplete.wikilinkStart
      const cursor = view.state.selection.main.head

      // Tag mit # einfügen (ersetze #query durch #value)
      const insertion = `#${value}`
      view.dispatch({
        changes: { from: start, to: cursor, insert: insertion },
        selection: { anchor: start + insertion.length }
      })

      setAutocomplete(null)
      view.focus()
      return
    }

    // Neue Notiz erstellen wenn angefordert
    if (blockInfo?.createNewNote && blockInfo.newNoteName && vaultPath) {
      try {
        // Bestimme den aktuellen Ordner basierend auf der ausgewählten Notiz
        const currentFolder = selectedNote?.path
          ? selectedNote.path.substring(0, selectedNote.path.lastIndexOf('/'))
          : ''

        // Erstelle Dateiname und Pfad
        const fileName = blockInfo.newNoteName.endsWith('.md')
          ? blockInfo.newNoteName
          : `${blockInfo.newNoteName}.md`
        const relativePath = currentFolder ? `${currentFolder}/${fileName}` : fileName
        const fullPath = `${vaultPath}/${relativePath}`

        // Initialer Inhalt mit Titel
        const initialContent = `# ${blockInfo.newNoteName}\n\n`

        // Datei erstellen
        await window.electronAPI.writeFile(fullPath, initialContent)
        console.log(`Neue Notiz erstellt: ${relativePath}`)

        // Notiz zum Store hinzufügen
        const newNote = await createNoteFromFile(fullPath, relativePath, initialContent)
        addNote(newNote)

        // FileTree aktualisieren
        const tree = await window.electronAPI.readDirectory(vaultPath)
        setFileTree(tree)
      } catch (error) {
        console.error('Fehler beim Erstellen der neuen Notiz:', error)
      }
    }

    // Wenn eine neue Block-ID generiert werden muss, erst in Zieldatei einfügen
    if (blockInfo?.needsBlockId && blockInfo.targetNotePath && blockInfo.targetLine !== undefined && blockInfo.generatedId) {
      try {
        const fullPath = `${vaultPath}/${blockInfo.targetNotePath}`
        const targetContent = await window.electronAPI.readFile(fullPath)
        const lines = targetContent.split('\n')

        // Block-ID am Ende der Zeile einfügen
        if (blockInfo.targetLine < lines.length) {
          const originalLine = lines[blockInfo.targetLine]
          // Entferne trailing whitespace und füge Block-ID hinzu
          lines[blockInfo.targetLine] = originalLine.trimEnd() + ` ^${blockInfo.generatedId}`

          // Datei speichern
          const newContent = lines.join('\n')
          await window.electronAPI.writeFile(fullPath, newContent)

          console.log(`Block-ID ^${blockInfo.generatedId} in ${blockInfo.targetNotePath} eingefügt`)
        }
      } catch (error) {
        console.error('Fehler beim Einfügen der Block-ID:', error)
        // Trotzdem fortfahren mit dem Wikilink
      }
    }

    const view = viewRef.current

    // Verwende die gespeicherte Startposition statt der aktuellen Cursor-Position
    // Dies ist wichtig, weil beim Mausklick der Cursor sich verschoben haben könnte
    const start = autocomplete.wikilinkStart

    // Suche das Ende des aktuellen Wikilink-Texts (alles bis ]] oder Zeilenende)
    const docLength = view.state.doc.length
    let end = start
    const content = view.state.doc.toString()

    // Finde das Ende: Suche nach ]] oder nimm die Position nach dem Query
    for (let i = start; i < docLength && i < start + 200; i++) {
      const char = content[i]
      // Stoppe bei Zeilenumbruch
      if (char === '\n') {
        end = i
        break
      }
      // Prüfe auf ]]
      if (char === ']' && content[i + 1] === ']') {
        end = i + 2
        break
      }
      end = i + 1
    }

    // Kompletten Wikilink einfügen
    const insertion = `[[${value}]]`
    view.dispatch({
      changes: { from: start, to: end, insert: insertion },
      selection: { anchor: start + insertion.length }
    })

    setAutocomplete(null)
    view.focus()
  }, [autocomplete, vaultPath, selectedNote, addNote, setFileTree])

  // AI Result Handler - Fügt Ergebnis mit Fußnote ein
  const handleAIResult = useCallback((result: AIResult) => {
    if (!result.success || !result.result || !viewRef.current || !aiMenu) {
      console.error('[AI] Fehler:', result.error)
      setAiMenu(null)
      return
    }

    const view = viewRef.current
    const currentContent = view.state.doc.toString()

    // Ergebnis mit Fußnote einfügen
    const { newContent, newCursorPos } = insertAIResultWithFootnote(
      currentContent,
      aiMenu.selectionStart,
      aiMenu.selectionEnd,
      result
    )

    // Editor aktualisieren
    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: newContent },
      selection: { anchor: newCursorPos }
    })

    setAiMenu(null)
    view.focus()
  }, [aiMenu])

  // AI-generiertes Bild einfügen
  const handleAIImageInsert = useCallback((markdownImage: string) => {
    if (!viewRef.current) return

    const view = viewRef.current
    const { from } = view.state.selection.main

    // Bild an Cursor-Position einfügen mit Zeilenumbrüchen
    const insertText = `\n${markdownImage}\n`

    view.dispatch({
      changes: { from, to: from, insert: insertText },
      selection: { anchor: from + insertText.length }
    })

    view.focus()
  }, [])

  // Editor erstellen/zerstören bei Notizwechsel
  useEffect(() => {
    if (!editorRef.current || !selectedNote) return

    // Alten Editor zerstören
    if (viewRef.current) {
      // Vorher speichern falls nötig
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      viewRef.current.destroy()
      viewRef.current = null
    }

    // Content von Datei laden (nicht aus Store!)
    const loadAndCreateEditor = async () => {
      let content = selectedNote.content

      try {
        const fullPath = `${vaultPath}/${selectedNote.path}`
        content = await window.electronAPI.readFile(fullPath)
        lastSavedContentRef.current = content
      } catch (error) {
        console.error('Fehler beim Laden:', error)
        lastSavedContentRef.current = selectedNote.content
      }

      // Set preview content
      setPreviewContent(content)

      if (!editorRef.current) return

      const state = EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          history(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle),
          keymap.of([
            // Tab/Shift+Tab for list indentation (outlining)
            {
              key: 'Tab',
              run: (view) => {
                const { state } = view
                const line = state.doc.lineAt(state.selection.main.head)
                const lineText = line.text

                // Check if line is a list item
                const listMatch = lineText.match(/^(\s*)([-*+]|\d+\.)\s/)
                if (listMatch) {
                  // Indent: add 2 spaces at the beginning
                  view.dispatch({
                    changes: { from: line.from, to: line.from, insert: '  ' },
                    selection: { anchor: state.selection.main.head + 2 }
                  })
                  return true
                }
                // Default tab behavior (insert tab/spaces)
                view.dispatch({
                  changes: { from: state.selection.main.head, to: state.selection.main.head, insert: '  ' },
                  selection: { anchor: state.selection.main.head + 2 }
                })
                return true
              }
            },
            {
              key: 'Shift-Tab',
              run: (view) => {
                const { state } = view
                const line = state.doc.lineAt(state.selection.main.head)
                const lineText = line.text

                // Check if line starts with spaces (can be outdented)
                const indentMatch = lineText.match(/^(\s{2,})/)
                if (indentMatch) {
                  // Outdent: remove 2 spaces from the beginning
                  const spacesToRemove = Math.min(2, indentMatch[1].length)
                  view.dispatch({
                    changes: { from: line.from, to: line.from + spacesToRemove, insert: '' },
                    selection: { anchor: Math.max(line.from, state.selection.main.head - spacesToRemove) }
                  })
                  return true
                }
                return true
              }
            },
            ...defaultKeymap,
            ...historyKeymap
          ]),
          // Image handling for drag & drop and paste
          imageHandlingExtension({ vaultPath: vaultPath || '' }),
          // Live Preview extension compartment (starts empty, can be reconfigured)
          livePreviewCompartment.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newContent = update.state.doc.toString()
              handleDocChange(newContent)
              setPreviewContent(newContent)
            }

            // Wikilink Autocomplete Trigger-Erkennung
            if (update.docChanged || update.selectionSet) {
              const cursor = update.state.selection.main.head
              const line = update.state.doc.lineAt(cursor)
              const textBefore = line.text.slice(0, cursor - line.from)

              // [[Note#^ öffnet Block-Autocomplete (muss vor heading geprüft werden)
              const blockMatch = textBefore.match(/\[\[([^\]#]+)#\^([^\]]*)$/)
              if (blockMatch) {
                setAutocomplete({
                  isOpen: true,
                  mode: 'block',
                  targetNote: blockMatch[1],
                  triggerPos: cursor - blockMatch[2].length,
                  query: blockMatch[2],
                  wikilinkStart: cursor - blockMatch[0].length
                })
                return
              }

              // [[Note# öffnet Heading-Autocomplete
              const headingMatch = textBefore.match(/\[\[([^\]#]+)#([^\]^]*)$/)
              if (headingMatch) {
                setAutocomplete({
                  isOpen: true,
                  mode: 'heading',
                  targetNote: headingMatch[1],
                  triggerPos: cursor - headingMatch[2].length,
                  query: headingMatch[2],
                  wikilinkStart: cursor - headingMatch[0].length
                })
                return
              }

              // [[ öffnet Note-Autocomplete
              const noteMatch = textBefore.match(/\[\[([^\]#]*)$/)
              if (noteMatch) {
                setAutocomplete({
                  isOpen: true,
                  mode: 'note',
                  targetNote: null,
                  triggerPos: cursor - noteMatch[1].length,
                  query: noteMatch[1],
                  wikilinkStart: cursor - noteMatch[0].length
                })
                return
              }

              // # öffnet Tag-Autocomplete (aber nicht am Zeilenanfang = Überschrift, nicht nach [ = Wikilink-Fragment)
              const tagMatch = textBefore.match(/(?:^|[^\[#])#([a-zA-Z0-9_\-/äöüÄÖÜß]*)$/)
              if (tagMatch) {
                // Prüfe ob es keine Überschrift ist (# am Zeilenanfang mit Leerzeichen danach)
                const lineStart = textBefore.lastIndexOf('\n') + 1
                const lineText = textBefore.substring(lineStart)
                const isHeading = /^#{1,6}\s/.test(lineText)

                if (!isHeading) {
                  setAutocomplete({
                    isOpen: true,
                    mode: 'tag',
                    targetNote: null,
                    triggerPos: cursor - tagMatch[1].length,
                    query: tagMatch[1],
                    wikilinkStart: cursor - tagMatch[1].length - 1 // -1 für das #
                  })
                  return
                }
              }

              // Schließen wenn kein Match
              if (autocomplete?.isOpen) {
                setAutocomplete(null)
              }
            }
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              fontSize: '14px'
            },
            '.cm-scroller': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              overflow: 'auto'
            },
            '.cm-content': {
              padding: '16px'
            },
            '.cm-line': {
              padding: '0 8px'
            }
          })
        ]
      })

      const view = new EditorView({
        state,
        parent: editorRef.current
      })

      viewRef.current = view
    }

    loadAndCreateEditor()

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [selectedNoteId]) // Nur bei Notizwechsel neu erstellen

  // Externe Updates (z.B. durch Graph-Verbindungen) im Editor anzeigen
  useEffect(() => {
    if (!viewRef.current || !selectedNote || isExternalUpdateRef.current) return

    const currentEditorContent = viewRef.current.state.doc.toString()

    // Nur aktualisieren wenn der Content sich unterscheidet UND
    // es nicht vom Editor selbst kommt
    if (selectedNote.content !== currentEditorContent &&
        selectedNote.content !== lastSavedContentRef.current) {

      // Content wurde extern geändert (z.B. durch Graph)
      // Lade den aktuellen Datei-Content
      const loadExternalChanges = async () => {
        if (!vaultPath) return

        try {
          const fullPath = `${vaultPath}/${selectedNote.path}`
          const fileContent = await window.electronAPI.readFile(fullPath)

          if (fileContent !== currentEditorContent && viewRef.current) {
            lastSavedContentRef.current = fileContent
            setPreviewContent(fileContent)
            viewRef.current.dispatch({
              changes: {
                from: 0,
                to: currentEditorContent.length,
                insert: fileContent
              }
            })
          }
        } catch (error) {
          console.error('Fehler beim Laden externer Änderungen:', error)
        }
      }

      loadExternalChanges()
    }
  }, [selectedNote?.content, selectedNote?.modifiedAt])

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      if (viewRef.current) {
        viewRef.current.destroy()
      }
    }
  }, [])

  // Listen for insert-text-at-cursor events (e.g. from Zotero citations)
  useEffect(() => {
    const handleInsertText = (e: CustomEvent<string>) => {
      const text = e.detail
      if (!viewRef.current || !text) return

      const view = viewRef.current
      const { from, to } = view.state.selection.main

      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length }
      })

      // Focus the editor
      view.focus()
    }

    window.addEventListener('insert-text-at-cursor', handleInsertText as EventListener)
    return () => {
      window.removeEventListener('insert-text-at-cursor', handleInsertText as EventListener)
    }
  }, [])

  // Listen for insert-footnote events (from Zotero citations as footnotes)
  useEffect(() => {
    const handleInsertFootnote = (e: CustomEvent<{ citation: string; citekey: string }>) => {
      const { citation, citekey } = e.detail
      if (!viewRef.current || !citation) return

      const view = viewRef.current
      const docContent = view.state.doc.toString()

      // Finde die nächste freie Fußnoten-Nummer
      const existingFootnotes = docContent.match(/\[\^(\d+)\]/g) || []
      const usedNumbers = existingFootnotes.map(fn => parseInt(fn.match(/\d+/)?.[0] || '0'))
      let nextNumber = 1
      while (usedNumbers.includes(nextNumber)) {
        nextNumber++
      }

      const footnoteRef = `[^${nextNumber}]`
      const footnoteDefinition = `\n\n[^${nextNumber}]: ${citation}`

      const { from, to } = view.state.selection.main
      const docLength = view.state.doc.length

      // Einfügen: Referenz an Cursor, Definition am Ende
      view.dispatch({
        changes: [
          { from, to, insert: footnoteRef },
          { from: docLength, to: docLength, insert: footnoteDefinition }
        ],
        selection: { anchor: from + footnoteRef.length }
      })

      view.focus()
    }

    window.addEventListener('insert-footnote', handleInsertFootnote as EventListener)
    return () => {
      window.removeEventListener('insert-footnote', handleInsertFootnote as EventListener)
    }
  }, [])

  // Handle wikilink and checkbox clicks in preview
  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Wikilink click handling
    if (target.classList.contains('wikilink')) {
      e.preventDefault()
      const linkText = target.getAttribute('data-link')
      const fragment = target.getAttribute('data-fragment') || ''

      if (linkText) {
        // Find note by title or filename
        const linkedNote = notes.find(n => {
          const titleLower = n.title.toLowerCase()
          const linkLower = linkText.toLowerCase()
          const fileNameWithoutExt = n.path.split('/').pop()?.replace('.md', '').toLowerCase() || ''
          return titleLower === linkLower || fileNameWithoutExt === linkLower
        })

        if (linkedNote) {
          // In sekundärem Panel: Note dort öffnen, sonst im primären
          if (isSecondary) {
            selectSecondaryNote(linkedNote.id)
          } else {
            selectNote(linkedNote.id)
          }

          // Wenn Fragment vorhanden, nach kurzer Verzögerung zur Position scrollen
          if (fragment) {
            setTimeout(async () => {
              try {
                const fullPath = `${vaultPath}/${linkedNote.path}`
                const content = await window.electronAPI.readFile(fullPath)
                const lines = content.split('\n')

                let targetLine = -1

                if (fragment.startsWith('^')) {
                  // Block-Referenz: Suche nach ^blockid
                  const blockId = fragment.substring(1)
                  targetLine = lines.findIndex(line =>
                    line.match(new RegExp(`\\^${blockId}\\s*$`))
                  )
                } else {
                  // Heading-Referenz: Suche nach ## Heading
                  targetLine = lines.findIndex(line => {
                    const match = line.match(/^#{1,6}\s+(.+)$/)
                    return match && match[1].trim().toLowerCase() === fragment.toLowerCase()
                  })
                }

                // Scrolle im Editor zur Zeile
                if (targetLine >= 0 && viewRef.current) {
                  const view = viewRef.current
                  const lineInfo = view.state.doc.line(targetLine + 1)
                  view.dispatch({
                    selection: { anchor: lineInfo.from },
                    scrollIntoView: true
                  })
                }
              } catch (error) {
                console.error('Fehler beim Navigieren zum Fragment:', error)
              }
            }, 100)
          }
        }
      }
      return
    }

    // Checkbox click handling
    if (target.classList.contains('task-checkbox') || target.classList.contains('task-list-item-checkbox') || (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox')) {
      const lineIndexStr = target.getAttribute('data-line')
      if (lineIndexStr === null || lineIndexStr === '-1') return

      const lineIndex = parseInt(lineIndexStr, 10)
      const lines = previewContent.split('\n')

      if (lineIndex >= 0 && lineIndex < lines.length) {
        const line = lines[lineIndex]

        // Toggle checkbox state
        let newLine: string
        if (/\[\s\]/.test(line)) {
          // Unchecked -> Checked
          newLine = line.replace(/\[\s\]/, '[x]')
        } else if (/\[x\]/i.test(line)) {
          // Checked -> Unchecked
          newLine = line.replace(/\[x\]/i, '[ ]')
        } else {
          return
        }

        lines[lineIndex] = newLine
        const newContent = lines.join('\n')

        // Update preview content
        setPreviewContent(newContent)

        // Update editor if available
        if (viewRef.current) {
          const currentContent = viewRef.current.state.doc.toString()
          viewRef.current.dispatch({
            changes: {
              from: 0,
              to: currentContent.length,
              insert: newContent
            }
          })
        }

        // SOFORT speichern (ohne Debounce) für instant Canvas-Update
        saveContent(newContent)
      }
    }
  }, [notes, selectNote, selectSecondaryNote, isSecondary, vaultPath, previewContent, saveContent])

  // Process headings to add fold toggles
  const processHeadingFolds = useCallback((html: string): string => {
    if (!editorHeadingFolding) return html

    // Wrap content in a container for easier manipulation
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
    const container = doc.body.firstChild as HTMLElement

    if (!container) return html

    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    let headingIndex = 0

    headings.forEach((heading) => {
      const level = parseInt(heading.tagName[1])
      const headingId = `fold-heading-${headingIndex++}`
      heading.setAttribute('data-fold-id', headingId)

      // Add fold toggle button
      const toggle = doc.createElement('span')
      toggle.className = 'fold-toggle'
      toggle.setAttribute('data-fold-target', headingId)
      toggle.setAttribute('data-fold-level', level.toString())
      toggle.textContent = '▼'
      toggle.title = 'Abschnitt zuklappen'
      heading.insertBefore(toggle, heading.firstChild)

      // Wrap following content until next heading of same or higher level
      const wrapper = doc.createElement('div')
      wrapper.className = 'fold-content'
      wrapper.setAttribute('data-fold-parent', headingId)

      let sibling = heading.nextElementSibling
      const siblings: Element[] = []

      while (sibling) {
        const siblingTagName = sibling.tagName.toLowerCase()
        if (/^h[1-6]$/.test(siblingTagName)) {
          const siblingLevel = parseInt(siblingTagName[1])
          if (siblingLevel <= level) break
        }
        siblings.push(sibling)
        sibling = sibling.nextElementSibling
      }

      if (siblings.length > 0) {
        heading.after(wrapper)
        siblings.forEach(s => wrapper.appendChild(s))
      }
    })

    return container.innerHTML
  }, [editorHeadingFolding])

  // Rendered markdown (mit Frontmatter-Titel, Callouts, Figures und interaktiven Checkboxen)
  const { frontmatterTitle, renderedMarkdown } = useMemo(() => {
    const { title, body } = parseFrontmatter(previewContent)
    const withCallouts = processCallouts(body)
    const htmlContent = md.render(withCallouts)
    const withFigures = processFigures(htmlContent)
    const withInteractiveCheckboxes = processTaskCheckboxes(withFigures, previewContent)
    const withFoldableHeadings = processHeadingFolds(withInteractiveCheckboxes)
    return {
      frontmatterTitle: title,
      renderedMarkdown: withFoldableHeadings
    }
  }, [previewContent, processHeadingFolds])

  // Wort- und Zeichenzähler
  const documentStats = useMemo(() => {
    const text = previewContent || ''

    // Entferne Frontmatter für Statistik
    let cleanText = text
    if (cleanText.startsWith('---')) {
      const endOfFrontmatter = cleanText.indexOf('---', 3)
      if (endOfFrontmatter !== -1) {
        cleanText = cleanText.substring(endOfFrontmatter + 3)
      }
    }

    // Zeichen (ohne Leerzeichen und Zeilenumbrüche für "echte" Zeichen)
    const characters = cleanText.length
    const charactersNoSpaces = cleanText.replace(/\s/g, '').length

    // Wörter (einfache Methode: Split auf Whitespace, filter leere)
    const words = cleanText.trim().split(/\s+/).filter(w => w.length > 0).length

    // Lesezeit (durchschnittlich 250 Wörter pro Minute)
    const readingTimeMinutes = Math.ceil(words / 250)

    return { words, characters, charactersNoSpaces, readingTimeMinutes }
  }, [previewContent])

  // Handle fold toggles in preview
  useEffect(() => {
    if (viewMode !== 'preview' || !previewRef.current || !editorHeadingFolding) return

    const handleFoldToggle = (e: Event) => {
      const toggle = e.target as HTMLElement
      if (!toggle.classList.contains('fold-toggle')) return

      const foldId = toggle.getAttribute('data-fold-target')
      if (!foldId) return

      const content = previewRef.current?.querySelector(`[data-fold-parent="${foldId}"]`)
      if (!content) return

      const isFolded = content.classList.contains('folded')

      if (isFolded) {
        content.classList.remove('folded')
        toggle.textContent = '▼'
        toggle.title = 'Abschnitt zuklappen'
        toggle.classList.remove('folded')
        setFoldedHeadings(prev => {
          const newSet = new Set(prev)
          newSet.delete(foldId)
          return newSet
        })
      } else {
        content.classList.add('folded')
        toggle.textContent = '▶'
        toggle.title = 'Abschnitt aufklappen'
        toggle.classList.add('folded')
        setFoldedHeadings(prev => {
          const newSet = new Set(prev)
          newSet.add(foldId)
          return newSet
        })
      }
    }

    previewRef.current.addEventListener('click', handleFoldToggle)

    // Restore fold states
    foldedHeadings.forEach(foldId => {
      const toggle = previewRef.current?.querySelector(`[data-fold-target="${foldId}"]`)
      const content = previewRef.current?.querySelector(`[data-fold-parent="${foldId}"]`)
      if (toggle && content) {
        content.classList.add('folded')
        toggle.textContent = '▶'
        toggle.classList.add('folded')
      }
    })

    return () => {
      previewRef.current?.removeEventListener('click', handleFoldToggle)
    }
  }, [viewMode, renderedMarkdown, editorHeadingFolding, foldedHeadings])

  // Mermaid-Diagramme rendern nach Content-Update
  useEffect(() => {
    if (viewMode === 'preview') {
      // Kurze Verzögerung damit das DOM aktualisiert ist
      const timer = setTimeout(async () => {
        try {
          // Alle Mermaid-Container finden und rendern
          const mermaidElements = document.querySelectorAll('.mermaid:not([data-processed])')
          if (mermaidElements.length > 0) {
            await mermaid.run({
              nodes: mermaidElements as NodeListOf<HTMLElement>
            })
          }
        } catch (error) {
          console.error('Mermaid rendering error:', error)
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [renderedMarkdown, viewMode])

  // Prozessiere Wikilink-Embeds in der Preview
  useEffect(() => {
    if (viewMode !== 'preview' || !previewRef.current) return

    const processEmbeds = async () => {
      const embedElements = previewRef.current?.querySelectorAll('.wikilink-embed')
      if (!embedElements || embedElements.length === 0) return

      for (const embedEl of Array.from(embedElements)) {
        const noteName = embedEl.getAttribute('data-note')
        const fragment = embedEl.getAttribute('data-fragment') || ''
        const isBlock = embedEl.getAttribute('data-is-block') === 'true'

        if (!noteName) continue

        // Finde die Zielnotiz
        const targetNote = notes.find(n => {
          const titleLower = n.title.toLowerCase()
          const nameLower = noteName.toLowerCase()
          const fileNameWithoutExt = n.path.split('/').pop()?.replace('.md', '').toLowerCase() || ''
          return titleLower === nameLower || fileNameWithoutExt === nameLower
        })

        if (!targetNote || !vaultPath) {
          embedEl.innerHTML = `<div class="wikilink-embed-error">Notiz "${noteName}" nicht gefunden</div>`
          continue
        }

        try {
          const fullPath = `${vaultPath}/${targetNote.path}`
          const content = await window.electronAPI.readFile(fullPath)
          let embedContent = ''

          if (fragment && isBlock) {
            // Block-Embed: Nur den spezifischen Block zeigen
            const blockId = fragment.substring(1) // Entferne ^
            const lines = content.split('\n')
            const blockLine = lines.find(line => line.match(new RegExp(`\\^${blockId}\\s*$`)))

            if (blockLine) {
              // Entferne die Block-ID aus dem angezeigten Content
              embedContent = blockLine.replace(/\s*\^[a-zA-Z0-9-_]+\s*$/, '')
            } else {
              embedContent = `Block ^${blockId} nicht gefunden`
            }
          } else if (fragment) {
            // Heading-Embed: Inhalt unter der Überschrift bis zur nächsten gleichen/höheren Ebene
            const lines = content.split('\n')
            let startLine = -1
            let headingLevel = 0

            // Finde die Überschrift
            for (let i = 0; i < lines.length; i++) {
              const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
              if (match && match[2].trim().toLowerCase() === fragment.toLowerCase()) {
                startLine = i
                headingLevel = match[1].length
                break
              }
            }

            if (startLine >= 0) {
              // Sammle Inhalt bis zur nächsten gleichen/höheren Überschrift
              const contentLines = [lines[startLine]]
              for (let i = startLine + 1; i < lines.length; i++) {
                const match = lines[i].match(/^(#{1,6})\s+/)
                if (match && match[1].length <= headingLevel) break
                contentLines.push(lines[i])
              }
              embedContent = contentLines.join('\n')
            } else {
              embedContent = `Überschrift "${fragment}" nicht gefunden`
            }
          } else {
            // Ganze Notiz einbetten (ohne Frontmatter)
            embedContent = content.replace(/^---[\s\S]*?---\n*/m, '')
          }

          // Render den Content als Markdown
          const renderedEmbed = md.render(embedContent)
          embedEl.innerHTML = `
            <div class="wikilink-embed-content">
              <div class="wikilink-embed-header">
                <span class="wikilink-embed-icon">📎</span>
                <a href="#" class="wikilink" data-link="${noteName}" data-fragment="${fragment}">${noteName}${fragment ? '#' + fragment : ''}</a>
              </div>
              <div class="wikilink-embed-body">${renderedEmbed}</div>
            </div>
          `
        } catch (error) {
          console.error('Fehler beim Laden des Embeds:', error)
          embedEl.innerHTML = `<div class="wikilink-embed-error">Fehler beim Laden von "${noteName}"</div>`
        }
      }
    }

    // Kurze Verzögerung um sicherzustellen dass das DOM bereit ist
    const timer = setTimeout(processEmbeds, 50)
    return () => clearTimeout(timer)
  }, [renderedMarkdown, viewMode, notes, vaultPath])

  // Load images in preview mode
  useEffect(() => {
    if (viewMode !== 'preview' || !previewRef.current || !vaultPath) return

    const loadImages = async () => {
      const imageElements = previewRef.current?.querySelectorAll('img.md-image[data-src]')
      if (!imageElements || imageElements.length === 0) return

      // Get current note's directory for relative path resolution
      const noteDir = selectedNote?.path ? selectedNote.path.substring(0, selectedNote.path.lastIndexOf('/')) : ''

      for (const imgEl of Array.from(imageElements)) {
        const dataSrc = imgEl.getAttribute('data-src')
        if (!dataSrc || imgEl.getAttribute('src')) continue // Already loaded

        try {
          // Try multiple possible locations for the image
          const possiblePaths = [
            // Absoluter Pfad (wenn bereits vollständig)
            dataSrc.startsWith('/') ? dataSrc : null,
            // Im gleichen Ordner wie die Notiz
            noteDir ? `${vaultPath}/${noteDir}/${dataSrc}` : null,
            // Im Vault-Root
            `${vaultPath}/${dataSrc}`,
            // In .attachments/
            `${vaultPath}/.attachments/${dataSrc}`,
            // In attachments/ (ohne Punkt)
            `${vaultPath}/attachments/${dataSrc}`,
            // In assets/
            `${vaultPath}/assets/${dataSrc}`,
            // In images/
            `${vaultPath}/images/${dataSrc}`,
          ].filter(Boolean) as string[]

          let loaded = false
          for (const imagePath of possiblePaths) {
            const result = await window.electronAPI.readImageAsDataUrl(imagePath)
            if (result.success && result.dataUrl) {
              imgEl.setAttribute('src', result.dataUrl)
              imgEl.removeAttribute('data-src')
              loaded = true
              break
            }
          }

          // Fallback: Obsidian-style vault-wide search
          if (!loaded && fileTree.length > 0) {
            const foundPath = findImageInVault(dataSrc, fileTree)
            if (foundPath) {
              const result = await window.electronAPI.readImageAsDataUrl(`${vaultPath}/${foundPath}`)
              if (result.success && result.dataUrl) {
                imgEl.setAttribute('src', result.dataUrl)
                imgEl.removeAttribute('data-src')
                loaded = true
              }
            }
          }

          if (!loaded) {
            // Show error placeholder
            const errorText = document.createElement('span')
            errorText.className = 'md-image-error'
            errorText.textContent = `[Image not found: ${dataSrc}]`
            imgEl.replaceWith(errorText)
          }
        } catch (error) {
          console.error('[Preview] Image load error:', error)
        }
      }
    }

    const timer = setTimeout(loadImages, 50)
    return () => clearTimeout(timer)
  }, [renderedMarkdown, viewMode, vaultPath, selectedNote?.path, fileTree])

  // Load PDFs in preview mode
  useEffect(() => {
    if (viewMode !== 'preview' || !previewRef.current || !vaultPath) return

    const loadPdfs = async () => {
      const pdfElements = previewRef.current?.querySelectorAll('.pdf-embed[data-filename]')
      if (!pdfElements || pdfElements.length === 0) return

      // Get current note's directory for relative path resolution
      const noteDir = selectedNote?.path ? selectedNote.path.substring(0, selectedNote.path.lastIndexOf('/')) : ''

      for (const pdfEl of Array.from(pdfElements)) {
        const filename = pdfEl.getAttribute('data-filename')
        if (!filename || pdfEl.getAttribute('data-loaded')) continue

        try {
          // Try multiple possible locations for the PDF
          const possiblePaths = [
            noteDir ? `${vaultPath}/${noteDir}/${filename}` : null,
            `${vaultPath}/${filename}`,
            `${vaultPath}/.attachments/${filename}`,
            `${vaultPath}/attachments/${filename}`,
          ].filter(Boolean) as string[]

          let pdfBase64: string | null = null
          let foundPath: string | null = null

          for (const pdfPath of possiblePaths) {
            try {
              pdfBase64 = await window.electronAPI.readFileBinary(pdfPath)
              foundPath = pdfPath
              break
            } catch {
              // Try next path
            }
          }

          // Fallback: vault-wide search
          if (!pdfBase64) {
            const searchResult = await window.electronAPI.findImageInVault(vaultPath, filename)
            if (searchResult.success && searchResult.path) {
              try {
                pdfBase64 = await window.electronAPI.readFileBinary(searchResult.path)
                foundPath = searchResult.path
              } catch {
                // Failed to read
              }
            }
          }

          if (pdfBase64 && foundPath) {
            // Convert base64 to blob URL
            const byteCharacters = atob(pdfBase64)
            const byteNumbers = new Array(byteCharacters.length)
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i)
            }
            const byteArray = new Uint8Array(byteNumbers)
            const blob = new Blob([byteArray], { type: 'application/pdf' })
            const blobUrl = URL.createObjectURL(blob)

            // Replace loading placeholder with actual PDF embed
            pdfEl.innerHTML = `
              <div class="pdf-embed-header">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 1C3.45 1 3 1.45 3 2V14C3 14.55 3.45 15 4 15H12C12.55 15 13 14.55 13 14V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z" fill="#ffebee" stroke="#e53935" stroke-width="0.8"/>
                  <text x="8" y="11" text-anchor="middle" font-size="5" font-weight="bold" fill="#e53935">PDF</text>
                </svg>
                <span class="pdf-embed-filename">${filename}</span>
              </div>
              <iframe class="pdf-embed-frame" src="${blobUrl}" style="width: 100%; height: 70vh; min-height: 500px; border: none;"></iframe>
            `
            pdfEl.setAttribute('data-loaded', 'true')
          } else {
            // Show error
            pdfEl.innerHTML = `
              <div class="pdf-embed-error">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 1C3.45 1 3 1.45 3 2V14C3 14.55 3.45 15 4 15H12C12.55 15 13 14.55 13 14V5.41C13 5.15 12.89 4.9 12.71 4.71L10.29 2.29C10.1 2.11 9.85 2 9.59 2H4Z" fill="#ffebee" stroke="#e53935" stroke-width="0.8"/>
                  <text x="8" y="11" text-anchor="middle" font-size="5" font-weight="bold" fill="#e53935">PDF</text>
                </svg>
                <span>PDF nicht gefunden: ${filename}</span>
              </div>
            `
          }
        } catch (error) {
          console.error('[Preview] PDF load error:', error)
        }
      }
    }

    const timer = setTimeout(loadPdfs, 100)
    return () => clearTimeout(timer)
  }, [renderedMarkdown, viewMode, vaultPath, selectedNote?.path])

  // Wikilink Hover Preview
  useEffect(() => {
    if (viewMode !== 'preview' || !previewRef.current) return

    const clearAllTimeouts = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = null
      }
    }

    const showPreview = async (target: HTMLElement, noteName: string) => {
      // Find the linked note
      const linkedNote = notes.find(n => {
        const titleLower = n.title.toLowerCase()
        const linkLower = noteName.toLowerCase()
        const fileNameWithoutExt = n.path.split('/').pop()?.replace('.md', '').toLowerCase() || ''
        return titleLower === linkLower || fileNameWithoutExt === linkLower
      })

      if (!linkedNote || !vaultPath) {
        return
      }

      try {
        const fullPath = `${vaultPath}/${linkedNote.path}`
        const content = await window.electronAPI.readFile(fullPath)

        // Extract first meaningful content (skip frontmatter and get first ~500 chars)
        let previewText = content
        // Remove frontmatter
        if (previewText.startsWith('---')) {
          const endOfFrontmatter = previewText.indexOf('---', 3)
          if (endOfFrontmatter !== -1) {
            previewText = previewText.substring(endOfFrontmatter + 3).trim()
          }
        }
        // Limit to first ~500 characters
        if (previewText.length > 500) {
          previewText = previewText.substring(0, 500) + '...'
        }

        // Position the preview near the link
        const rect = target.getBoundingClientRect()
        const previewHeight = 300 // approximate max height
        const previewWidth = 400
        const gap = 8

        // Calculate x position (don't go off right edge)
        let x = rect.left
        if (x + previewWidth > window.innerWidth - 20) {
          x = window.innerWidth - previewWidth - 20
        }
        if (x < 20) x = 20

        // Calculate y position - prefer below, but show above if not enough space
        let y: number
        let showAbove = false

        if (rect.bottom + gap + previewHeight > window.innerHeight - 20) {
          // Not enough space below, show above
          y = rect.top - gap
          showAbove = true
        } else {
          // Show below
          y = rect.bottom + gap
        }

        setHoverPreview({
          x,
          y,
          noteName,
          content: previewText,
          title: linkedNote.title,
          showAbove
        })
      } catch (error) {
        console.error('Fehler beim Laden der Hover-Preview:', error)
      }
    }

    const scheduleHide = () => {
      clearAllTimeouts()
      hideTimeoutRef.current = setTimeout(() => {
        // Check if mouse is over wikilink or preview
        const hoverPreviewEl = document.querySelector('.wikilink-hover-preview')
        const isOverPreview = hoverPreviewEl && hoverPreviewEl.matches(':hover')
        const isOverWikilink = activeWikilinkRef.current && activeWikilinkRef.current.matches(':hover')

        if (!isOverPreview && !isOverWikilink) {
          setHoverPreview(null)
          activeWikilinkRef.current = null
        }
      }, 150)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // Check if we're over a wikilink
      if (target.classList.contains('wikilink')) {
        const noteName = target.getAttribute('data-link')
        if (!noteName) return

        // Cancel any pending hide
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current)
          hideTimeoutRef.current = null
        }

        // If this is a new wikilink, show preview after delay
        if (activeWikilinkRef.current !== target) {
          activeWikilinkRef.current = target
          clearAllTimeouts()

          hoverTimeoutRef.current = setTimeout(() => {
            showPreview(target, noteName)
          }, 400)
        }
      }
    }

    const handleMouseLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const relatedTarget = e.relatedTarget as HTMLElement | null

      // Check if leaving a wikilink
      if (target.classList.contains('wikilink')) {
        // Check if moving to the preview popup
        const hoverPreviewEl = document.querySelector('.wikilink-hover-preview')
        if (relatedTarget && hoverPreviewEl && hoverPreviewEl.contains(relatedTarget)) {
          // Moving to preview, don't hide
          return
        }
        scheduleHide()
      }
    }

    const previewEl = previewRef.current
    previewEl.addEventListener('mousemove', handleMouseMove)
    previewEl.addEventListener('mouseout', handleMouseLeave)

    return () => {
      previewEl.removeEventListener('mousemove', handleMouseMove)
      previewEl.removeEventListener('mouseout', handleMouseLeave)
      clearAllTimeouts()
    }
  }, [viewMode, notes, vaultPath])

  // Toggle view mode (cycles: edit -> live-preview -> preview -> edit)
  const toggleViewMode = () => {
    setViewMode(prev => {
      if (prev === 'edit') return 'live-preview'
      if (prev === 'live-preview') return 'preview'
      return 'edit'
    })
  }

  // Reconfigure live preview extension when view mode changes
  useEffect(() => {
    if (!viewRef.current) return

    const extension = viewMode === 'live-preview'
      ? livePreviewExtension({ vaultPath: vaultPath || '' })
      : []
    viewRef.current.dispatch({
      effects: livePreviewCompartment.reconfigure(extension)
    })
  }, [viewMode, vaultPath])

  // Keyboard shortcuts for toggle and formatting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        toggleViewMode()
      }
      // Formatierungs-Shortcuts im Edit- und Live-Preview-Modus
      if ((viewMode === 'edit' || viewMode === 'live-preview') && viewRef.current && (e.metaKey || e.ctrlKey)) {
        switch (e.key) {
          case 'b':
            e.preventDefault()
            applyFormat('bold')
            break
          case 'i':
            e.preventDefault()
            applyFormat('italic')
            break
          case 'k':
            e.preventDefault()
            applyFormat('link')
            break
          case '`':
            e.preventDefault()
            applyFormat('code')
            break
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, applyFormat])

  // Rechtsklick = Format-Menü, Alt+Rechtsklick = AI-Menü (bei Textauswahl)
  const handleEditorContextMenu = useCallback((e: React.MouseEvent) => {
    if (viewMode === 'preview' || !viewRef.current) return

    e.preventDefault()

    const view = viewRef.current
    const { from, to } = view.state.selection.main
    const selectedText = view.state.doc.sliceString(from, to)

    // Alt+Rechtsklick mit Text selektiert und Ollama verfügbar: AI-Menü anzeigen
    if (e.altKey && selectedText.length > 0 && ollama.enabled && ollama.selectedModel) {
      setAiMenu({
        x: e.clientX,
        y: e.clientY,
        selectedText,
        selectionStart: from,
        selectionEnd: to
      })
      setFormatMenu(null)
    } else {
      // Normaler Rechtsklick: Format-Menü anzeigen
      setFormatMenu({ x: e.clientX, y: e.clientY })
      setAiMenu(null)
    }
  }, [viewMode, ollama.enabled, ollama.selectedModel])

  // Tastenkombinationen: Cmd+Shift+F = Format-Menü, Cmd+Shift+A = AI-Menü
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode === 'preview' || !viewRef.current) return

      const view = viewRef.current
      const { from, to } = view.state.selection.main
      const coords = view.coordsAtPos(from)

      // Cmd+Shift+F für Format-Menü
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        if (coords) {
          setFormatMenu({ x: coords.left, y: coords.top })
          setAiMenu(null)
        }
      }

      // Cmd+Shift+A für AI-Menü (nur bei Textauswahl und Ollama aktiv)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault()
        const selectedText = view.state.doc.sliceString(from, to)
        if (selectedText.length > 0 && ollama.enabled && ollama.selectedModel && coords) {
          setAiMenu({
            x: coords.left,
            y: coords.top,
            selectedText,
            selectionStart: from,
            selectionEnd: to
          })
          setFormatMenu(null)
        }
      }

      // Cmd+Shift+I für KI-Bildgenerierung
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'i') {
        e.preventDefault()
        if (ollama.enabled) {
          setShowAIImageDialog(true)
          setFormatMenu(null)
          setAiMenu(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, ollama.enabled, ollama.selectedModel])

  // Refresh editor when switching to edit or live-preview mode
  useEffect(() => {
    if ((viewMode === 'edit' || viewMode === 'live-preview') && viewRef.current) {
      // Force CodeMirror to recalculate its layout
      requestAnimationFrame(() => {
        viewRef.current?.requestMeasure()
      })
    }
  }, [viewMode])

  // PDF Export
  const handleExportPDF = useCallback(async () => {
    if (!selectedNote) return

    const fileName = selectedNote.path.split('/').pop() || 'notiz.md'

    // Erstelle vollständigen HTML-Inhalt mit Titel
    let htmlContent = ''
    if (frontmatterTitle) {
      htmlContent += `<h1>${frontmatterTitle}</h1>`
    }
    htmlContent += renderedMarkdown

    const result = await window.electronAPI.exportPDF(
      fileName,
      htmlContent,
      frontmatterTitle || selectedNote.title
    )

    if (result.success) {
      console.log('PDF exportiert nach:', result.path)
    } else if (result.error !== 'Abgebrochen') {
      console.error('PDF Export fehlgeschlagen:', result.error)
    }
  }, [selectedNote, frontmatterTitle, renderedMarkdown])

  if (!selectedNote) {
    return (
      <div className="editor-empty">
        <p>Wähle eine Notiz aus der Sidebar</p>
        <p className="hint">oder erstelle eine neue mit Cmd+N</p>
      </div>
    )
  }

  return (
    <div className="editor-container">
      <div className="editor-header">
        {!isSecondary && (
          <div className="editor-nav-buttons">
            <button
              className="nav-btn"
              onClick={navigateBack}
              disabled={!canNavigateBack()}
              title="Zurück (Cmd+[)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button
              className="nav-btn"
              onClick={navigateForward}
              disabled={!canNavigateForward()}
              title="Vorwärts (Cmd+])"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        )}
        <h3>{selectedNote.title}</h3>
        <div className="editor-header-right">
          {isSaving && <span className="saving-indicator">Speichern...</span>}
          {isSecondary && (
            <button
              className="close-secondary-btn"
              onClick={() => selectSecondaryNote(null)}
              title="Sekundäres Panel schließen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          <button
            className="export-btn"
            onClick={handleExportPDF}
            title="Als PDF exportieren"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 10V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            PDF
          </button>
          <div className="view-mode-toggle">
            <button
              className={`toggle-btn ${viewMode === 'edit' ? 'active' : ''}`}
              onClick={() => setViewMode('edit')}
              title="Bearbeiten (Cmd+E)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className={`toggle-btn ${viewMode === 'live-preview' ? 'active' : ''}`}
              onClick={() => setViewMode('live-preview')}
              title="Live Preview (Cmd+E)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3C4.5 3 1.5 8 1.5 8C1.5 8 4.5 13 8 13C11.5 13 14.5 8 14.5 8C14.5 8 11.5 3 8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M11.5 2.5L13.5 4.5L10 8L8.5 6.5L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className={`toggle-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
              title="Vorschau (Cmd+E)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3C4.5 3 1.5 8 1.5 8C1.5 8 4.5 13 8 13C11.5 13 14.5 8 14.5 8C14.5 8 11.5 3 8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div
        className={`editor-content ${viewMode !== 'preview' ? 'visible' : 'hidden'} ${viewMode === 'live-preview' ? 'live-preview-mode' : ''}`}
        ref={editorRef}
        onContextMenu={handleEditorContextMenu}
      />
      <div
        className={`editor-preview ${viewMode === 'preview' ? 'visible' : 'hidden'}${outlineStyle !== 'default' ? ` outline-${outlineStyle}` : ''}`}
        onClick={handlePreviewClick}
        ref={previewRef}
      >
        {frontmatterTitle && (
          <h1 className="frontmatter-title">{frontmatterTitle}</h1>
        )}
        <div dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
      </div>

      {/* Editor Footer mit Statistiken */}
      {editorShowWordCount && (
        <div className="editor-footer">
          <span className="editor-stat" title="Wörter">
            {documentStats.words} Wörter
          </span>
          <span className="editor-stat" title="Zeichen (mit/ohne Leerzeichen)">
            {documentStats.characters} Zeichen
          </span>
          <span className="editor-stat" title="Geschätzte Lesezeit">
            ~{documentStats.readingTimeMinutes} min Lesezeit
          </span>
        </div>
      )}

      {/* Formatierungs-Kontextmenü */}
      {formatMenu && (
        <FormatMenu
          x={formatMenu.x}
          y={formatMenu.y}
          onFormat={applyFormat}
          onClose={() => setFormatMenu(null)}
        />
      )}

      {/* KI-Kontextmenü */}
      {aiMenu && (
        <AIContextMenu
          x={aiMenu.x}
          y={aiMenu.y}
          selectedText={aiMenu.selectedText}
          onClose={() => setAiMenu(null)}
          onResult={handleAIResult}
        />
      )}

      {/* KI-Bildgenerierung Dialog */}
      {showAIImageDialog && (
        <AIImageDialog
          onClose={() => setShowAIImageDialog(false)}
          onInsert={handleAIImageInsert}
        />
      )}

      {/* Wikilink Autocomplete */}
      {autocomplete?.isOpen && (
        <WikilinkAutocomplete
          view={viewRef.current}
          isOpen={autocomplete.isOpen}
          mode={autocomplete.mode}
          targetNote={autocomplete.targetNote}
          triggerPos={autocomplete.triggerPos}
          query={autocomplete.query}
          onClose={() => setAutocomplete(null)}
          onSelect={handleAutocompleteSelect}
        />
      )}

      {/* Wikilink Hover Preview */}
      {hoverPreview && (
        <div
          className={`wikilink-hover-preview ${hoverPreview.showAbove ? 'show-above' : ''}`}
          style={{
            position: 'fixed',
            left: hoverPreview.x,
            ...(hoverPreview.showAbove
              ? { bottom: window.innerHeight - hoverPreview.y }
              : { top: hoverPreview.y }),
            zIndex: 1000
          }}
          onMouseLeave={(e) => {
            // Check if moving back to a wikilink
            const relatedTarget = e.relatedTarget as HTMLElement | null
            if (relatedTarget && relatedTarget.classList.contains('wikilink')) {
              return // Don't hide, let the wikilink handler manage it
            }
            setHoverPreview(null)
            activeWikilinkRef.current = null
          }}
        >
          <div className="wikilink-hover-preview-header">
            <span className="wikilink-hover-preview-icon">📄</span>
            <span className="wikilink-hover-preview-title">{hoverPreview.title}</span>
          </div>
          <div
            className="wikilink-hover-preview-content"
            dangerouslySetInnerHTML={{ __html: md.render(hoverPreview.content) }}
          />
        </div>
      )}
    </div>
  )
}
