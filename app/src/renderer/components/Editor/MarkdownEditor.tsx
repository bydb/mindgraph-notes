import React, { useEffect, useRef, useCallback, useState, useMemo, memo } from 'react'
import type { NoteAgentAttachment } from '../../../shared/types'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle, LanguageDescription } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css as cssLanguage } from '@codemirror/lang-css'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import texmath from 'markdown-it-texmath'
import TurndownService from 'turndown'
import { tables as turndownTables } from 'turndown-plugin-gfm'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem/mhchem.js'  // Chemie-Support (mhchem)
import mermaid from 'mermaid'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useUIStore, MARKETING_DEFAULTS } from '../../stores/uiStore'
import { usePluginConfig } from '../../plugins/config'
import { useTabStore } from '../../stores/tabStore'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from '../../utils/translations'
import { sanitizeHtml, escapeHtml } from '../../utils/sanitize'
import { extractLinks, extractTags, extractTitle, extractHeadings, extractBlocks, resolvePluginFileLink } from '../../utils/linkExtractor'
import { resolvePluginEmbedTarget, buildPluginEmbedFrame, mountPluginEmbedBody, parsePluginEmbedSize } from '../../utils/pluginEmbeds'
import { WikilinkAutocomplete, AutocompleteMode, BlockSelectionInfo } from './WikilinkAutocomplete'
import { SlashCommandMenu } from './SlashCommandMenu'
import { livePreviewExtension } from './extensions/livePreview'
import { imageHandlingExtension } from './extensions/imageHandling'
import { languageToolExtension, setLanguageToolMatches, setCorrectionHighlights, setLtErrorClickHandler, type LanguageToolMatch, type LanguageToolPopupMatch } from './extensions/languageTool'
import { AiActionBar, type AiProposalMeta, type AgentUiStep, type AgentUiResult } from './AiActionBar'
import { diffLines } from '../../utils/blockDiff'
import { ModelLogo } from '../Shared/ModelLogo'
import { HumanIcon } from '../Shared/HumanIcon'
import { dataviewExtension, setDataviewNotes, setDataviewLanguage, setDataviewViewMode, setNoteClickHandler } from './extensions/dataview'
import { useDataviewStore } from '../../stores/dataviewStore'
import { PropertiesPanel } from './PropertiesPanel'
import { FormattingToolbar } from './FormattingToolbar'
import { AIContextMenu, AIResult } from './AIContextMenu'
import { AIImageDialog } from './AIImageDialog'
import { PublishToWordPressModal } from './PublishToWordPressModal'
import { insertAIResultWithFootnote } from '../../utils/aiFootnote'
import {
  ANNO_COLORS,
  AnnoColorDef,
  computePageFromRange,
  findQuoteLocation,
  getFrontmatterField,
  noteBaseName,
  annotationRelPathFor,
  buildAnnotationFileHeader,
  buildAnnotationBlock,
  makeAnnotationId,
  parseAnnotationAnchors,
  applyStoredHighlights
} from '../../utils/annotations'
import { isImageFile, findImageInVault, getFilePathsFromDataTransfer, extractImageFromDataTransfer, fileToBase64 } from '../../utils/imageUtils'
import { highlightCode } from '../../utils/highlightSetup'
import { speak, stopSpeaking } from '../../utils/voice/tts'
import { startDictation, type DictationHandle } from '../../utils/voice/stt'
import { useIsModuleEnabled } from '../../utils/modules'
import { useVoiceStore } from '../../stores/voiceStore'
import { getNoteKind, stripNoteKindMarker, setAiProvenanceInContent, getAiProvenance, addTagToFrontmatter, getFrontmatterTags } from '../../utils/noteKind'
import { isBrainNote, brainNoteLabel } from '../../utils/brainNote'
import { BrainIcon } from '../BrainIcon'
import { readClipboardText, writeClipboardText } from '../../utils/clipboard'
import { cloudRoutesForFeature, cloudProviderForSentinel, type CloudProviderId } from '../../../shared/llmBackend'

// Stabile leere Referenz für die Kontext-Datei-Selektion (kein neues Array pro Render —
// bekannte Loop-Falle bei Zustand/React, siehe CLAUDE.md Workflow-Canvas-Lehren).
const EMPTY_AGENT_ATTACHMENTS: NoteAgentAttachment[] = []

// Notiz-Agent Phase 2: UI-Zustand eines Agent-Laufs, pro Notiz gekeyt.
interface AgentRunUiState {
  runId: string | null
  phase: 'idle' | 'running' | 'review'
  steps: AgentUiStep[]
  results: AgentUiResult[]
  finalText: string
}
const EMPTY_AGENT_RUN: AgentRunUiState = { runId: null, phase: 'idle', steps: [], results: [], finalText: '' }

const markdownCodeLanguages = [
  LanguageDescription.of({
    name: 'javascript',
    alias: ['js', 'node', 'nodejs', 'mjs', 'cjs'],
    support: javascript(),
  }),
  LanguageDescription.of({
    name: 'typescript',
    alias: ['ts', 'cts', 'mts'],
    support: javascript({ typescript: true }),
  }),
  LanguageDescription.of({
    name: 'jsx',
    support: javascript({ jsx: true }),
  }),
  LanguageDescription.of({
    name: 'tsx',
    support: javascript({ jsx: true, typescript: true }),
  }),
  LanguageDescription.of({
    name: 'html',
    alias: ['xml'],
    support: html(),
  }),
  LanguageDescription.of({
    name: 'css',
    support: cssLanguage(),
  }),
]

// Akzeptiert "Start"/"Startzeit" bzw. "Ende"/"Endzeit", die Zeit außerhalb (**Start:** 07:53)
// ODER innerhalb der Fett-Markierung (**Startzeit: 07:53**), optional als Listenpunkt, inkl. NBSP.
function parseWorkTimeLine(line: string, label: 'Start' | 'Ende'): number | null {
  const labelPattern = label === 'Start' ? 'Start(?:zeit)?' : 'End(?:e|zeit)'
  const match = line.match(new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*|__)?${labelPattern}\\s*:\\s*(?:\\*\\*|__)?\\s*(\\d{1,2})[:.](\\d{2})\\s*(?:\\*\\*|__)?\\s*$`, 'i'))
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

function formatWorkDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
}

// Liest eine "**Pause:** 30 min"-Zeile im angegebenen Zeilenfenster; 0 wenn keine gefunden.
function parseWorkTimePause(lines: string[], from: number, to: number): number {
  for (let i = Math.max(0, from); i <= to && i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:[-*]\s*)?(?:\*\*|__)?Pause\s*:\s*(?:\*\*|__)?\s*(\d+)\s*min/i)
    if (m) return Number(m[1])
  }
  return 0
}

function updateWorkTimeFields(content: string): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  let changed = false

  for (let startIndex = 0; startIndex < lines.length; startIndex++) {
    const startMinutes = parseWorkTimeLine(lines[startIndex], 'Start')
    if (startMinutes === null) continue

    const endMinutes = parseWorkTimeLine(lines[startIndex + 1] ?? '', 'Ende')
    if (endMinutes === null) continue

    // Arbeitszeit-Zeile in den nächsten Zeilen suchen (eine Pause-/Leerzeile darf dazwischen liegen)
    let workTimeIndex = -1
    let workTimePrefix = ''
    for (let i = startIndex + 2; i <= startIndex + 5 && i < lines.length; i++) {
      const m = lines[i].match(/^(\s*(?:[-*]\s*)?(?:\*\*|__)?Arbeitszeit\s*:\s*(?:\*\*|__)?\s*).*$/i)
      if (m) {
        workTimeIndex = i
        workTimePrefix = m[1]
        break
      }
      // Bei der nächsten Start-Zeile abbrechen, um nicht in den Folgetag zu greifen
      if (parseWorkTimeLine(lines[i], 'Start') !== null) break
    }
    if (workTimeIndex === -1) continue

    // Pause kann vor der Arbeitszeit-Zeile (Start/Ende/Pause/Arbeitszeit) oder darunter
    // (Arbeitszeit/Leerzeile/Pause) stehen → großzügiges Fenster um den Block herum.
    const pauseMinutes = parseWorkTimePause(lines, startIndex + 1, workTimeIndex + 2)
    const grossMinutes = endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : endMinutes + (24 * 60) - startMinutes
    const durationMinutes = Math.max(0, grossMinutes - pauseMinutes)
    // Genau ein Leerzeichen vor dem Wert — turndown strippt den Template-Space sonst → "…:**9h 12m"
    const prefix = workTimePrefix.replace(/[ \t\u00a0]+$/, '')
    const nextLine = `${prefix} ${formatWorkDuration(durationMinutes)}`

    if (lines[workTimeIndex] !== nextLine) {
      lines[workTimeIndex] = nextLine
      changed = true
    }
  }

  return changed ? lines.join(newline) : content
}

// Mermaid initialisieren
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
})

// Formatierungs-Kontextmenü Komponente
interface FormatMenuProps {
  x: number
  y: number
  onFormat: (type: string) => void
  onClose: () => void
  previewMode?: boolean
  onOpenAI?: () => void
}

const FormatMenu: React.FC<FormatMenuProps> = memo(({ x, y, onFormat, onClose, previewMode, onOpenAI }) => {
  const { t } = useTranslation()
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

  const svgProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  const icons = {
    cut: <svg {...svgProps}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
    copy: <svg {...svgProps}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
    paste: <svg {...svgProps}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
    bold: <svg {...svgProps}><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>,
    italic: <svg {...svgProps}><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>,
    code: <svg {...svgProps}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
    strikethrough: <svg {...svgProps}><line x1="4" y1="12" x2="20" y2="12"/><path d="M16 4c-1.5 0-3 .5-3 2 0 3 6 3 6 6 0 1.5-1.5 2-3 2"/><path d="M8 20c1.5 0 3-.5 3-2 0-3-6-3-6-6 0-1.5 1.5-2 3-2"/></svg>,
    link: <svg {...svgProps}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    wikilink: <svg {...svgProps}><rect x="2" y="6" width="7" height="12" rx="1"/><rect x="15" y="6" width="7" height="12" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/></svg>,
    task: <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 12l2 2 4-4"/></svg>,
    taskReminder: <svg {...svgProps}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    footnote: <svg {...svgProps}><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/><circle cx="17" cy="6" r="3" fill="currentColor" stroke="none"/></svg>,
    heading: <svg {...svgProps}><path d="M4 4v16"/><path d="M20 4v16"/><path d="M4 12h16"/></svg>,
    quote: <svg {...svgProps}><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>,
    note: <svg {...svgProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    tip: <svg {...svgProps}><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>,
    warning: <svg {...svgProps}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    summary: <svg {...svgProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
  }

  const formatOptions = previewMode ? [
    { type: 'copy', label: t('format.copy'), icon: icons.copy, shortcut: 'Cmd+C' },
  ] : [
    { type: 'cut', label: t('format.cut'), icon: icons.cut, shortcut: 'Cmd+X' },
    { type: 'copy', label: t('format.copy'), icon: icons.copy, shortcut: 'Cmd+C' },
    { type: 'paste', label: t('format.paste'), icon: icons.paste, shortcut: 'Cmd+V' },
    { type: 'divider', label: '', icon: '', shortcut: '' },
    { type: 'bold', label: t('format.bold'), icon: icons.bold, shortcut: 'Cmd+B' },
    { type: 'italic', label: t('format.italic'), icon: icons.italic, shortcut: 'Cmd+I' },
    { type: 'code', label: t('format.code'), icon: icons.code, shortcut: 'Cmd+`' },
    { type: 'strikethrough', label: t('format.strikethrough'), icon: icons.strikethrough, shortcut: '' },
    { type: 'link', label: t('format.link'), icon: icons.link, shortcut: '' },
    { type: 'wikilink', label: t('format.wikilink'), icon: icons.wikilink, shortcut: '' },
    { type: 'divider', label: '', icon: '', shortcut: '' },
    { type: 'task', label: t('format.task'), icon: icons.task, shortcut: '' },
    { type: 'task-reminder', label: t('format.taskReminder'), icon: icons.taskReminder, shortcut: '' },
    { type: 'footnote', label: t('format.footnote'), icon: icons.footnote, shortcut: '' },
    { type: 'divider', label: '', icon: '', shortcut: '' },
    { type: 'heading1', label: t('format.heading1'), icon: icons.heading, shortcut: '' },
    { type: 'heading2', label: t('format.heading2'), icon: icons.heading, shortcut: '' },
    { type: 'heading3', label: t('format.heading3'), icon: icons.heading, shortcut: '' },
    { type: 'divider', label: '', icon: '', shortcut: '' },
    { type: 'quote', label: t('format.quote'), icon: icons.quote, shortcut: '' },
    { type: 'callout-note', label: 'Callout: Note', icon: icons.note, shortcut: '' },
    { type: 'callout-tip', label: 'Callout: Tip', icon: icons.tip, shortcut: '' },
    { type: 'callout-warning', label: 'Callout: Warning', icon: icons.warning, shortcut: '' },
    { type: 'callout-summary', label: 'Callout: Summary', icon: icons.summary, shortcut: '' },
  ]

  return (
    <div
      ref={menuRef}
      className="format-menu"
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 1000
      }}
    >
      {onOpenAI && (
        <>
          <button
            className="format-menu-item"
            onClick={() => { onOpenAI(); onClose() }}
            title={t('ai.assistant')}
          >
            <span className="format-menu-icon">🤖</span>
            <span className="format-menu-label">{t('ai.assistant')}</span>
            <span className="format-menu-shortcut">Cmd+Shift+A</span>
          </button>
          <div className="format-menu-divider" />
        </>
      )}
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
  breaks: true,
  highlight: highlightCode
})

// Task-Listen Plugin aktivieren (für - [ ] und - [x] Syntax)
// WICHTIG: label:false. Mit label:true+labelAfter:true rendert das Plugin den Task-Text
// DOPPELT — einmal als gerendertes Inline-Content, einmal als Rohtext im <label
// class="task-list-item-label">. Im WYSIWYG-Roundtrip (Lesen-Modus → turndown) serialisiert
// Turndown BEIDE Kopien → exponentielle Verdopplung des Task-Textes bei jedem (Auto-)Speichern
// (2→4→8→16…) plus Backslash-Wachstum auf `**`/`__`. Betraf nur Task-Zeilen. Empirisch
// reproduziert; label:false liefert genau EINE Kopie. Die Checkbox bleibt klickbar über
// `data-line` (processTaskCheckboxes + Click-Handler) — das native <label>-Klick-Toggle
// brauchen wir nicht (der App-Handler arbeitet ohnehin auf der Markdown-Quelle).
md.use(taskLists, {
  enabled: true,
  label: false
})

// Fußnoten Plugin aktivieren (für [^1] Syntax)
md.use(footnote)

// LaTeX/Math Plugin mit KaTeX (inkl. Chemie-Support via mhchem)
// Beide Delimiter-Formate: $...$ und \(...\)
const katexOptions = { throwOnError: false, trust: false, strict: false }
md.use(texmath, { engine: katex, delimiters: 'dollars', katexOptions })
md.use(texmath, { engine: katex, delimiters: 'brackets', katexOptions })

const wysiwygTurndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

// GFM-Tabellen müssen den WYSIWYG-Roundtrip überstehen. Ohne diese Regel hat Turndown
// keine Tabellen-Behandlung und flacht das gerenderte <table> zu Einzelzeilen ab
// (Datenverlust). Nur `tables` einbinden — NICHT das volle `gfm`-Bundle, dessen
// `taskListItems` mit der Custom-`taskCheckbox`-Regel unten kollidieren würde.
wysiwygTurndown.use(turndownTables)

// Turndown's Default-Escape macht aus `[`, `]` und `\` Backslash-Escapes — im
// WYSIWYG-Roundtrip zerstört das Wikilinks und Task-Datumsmarker
// (`(@[[2026-05-08]])`) und verdoppelt bei jedem Commit die Backslashes
// (Korruptionsmuster 0 → 1 → 3 → 7 …). Auch `_` escapen wir nicht, weil es in
// Dateinamen/Identifiern omnipräsent ist. Block-Start-Marker (Headings, Quotes,
// Listen) bleiben escaped, damit Klartext nicht plötzlich zu Block-Syntax wird.
wysiwygTurndown.escape = (input: string) =>
  input
    // Idempotent: ein bereits escaptes `\*` NICHT erneut zu `\\*` verdoppeln (sonst
    // Backslash-Wachstum bei jedem Roundtrip auf schon leicht beschädigten Notizen).
    .replace(/(?<!\\)\*/g, '\\*')
    .replace(/^-/g, '\\-')
    .replace(/^\+ /g, '\\+ ')
    .replace(/^(=+)/g, '\\$1')
    .replace(/^(#{1,6}) /g, '\\$1 ')
    .replace(/`/g, '\\`')
    .replace(/^~~~/g, '\\~~~')
    .replace(/^>/g, '\\>')
    .replace(/^(\d+)\. /g, '$1\\. ')

wysiwygTurndown.addRule('wikilink', {
  filter: (node) => node.nodeName === 'A' && (node as HTMLElement).classList.contains('wikilink'),
  replacement: (content, node) => {
    const el = node as HTMLElement
    const target = el.getAttribute('data-link') || content
    const fragment = el.getAttribute('data-fragment') || ''
    const linkTarget = `${target}${fragment ? `#${fragment}` : ''}`
    return content && content !== linkTarget ? `[[${linkTarget}|${content}]]` : `[[${linkTarget}]]`
  }
})

wysiwygTurndown.addRule('taskCheckbox', {
  filter: (node) => node.nodeName === 'INPUT' && (node as HTMLInputElement).type === 'checkbox',
  replacement: (_content, node) => ((node as HTMLInputElement).checked ? '[x] ' : '[ ] ')
})

wysiwygTurndown.addRule('wikiImage', {
  filter: (node) => {
    if (node.nodeName !== 'IMG') return false
    const el = node as HTMLElement
    const dataSrc = el.getAttribute('data-src')
    const src = el.getAttribute('src') || ''
    const alt = el.getAttribute('alt') || ''
    return Boolean(dataSrc) || (src.startsWith('data:image') && isImageFile(alt))
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const src = el.getAttribute('data-src') || el.getAttribute('alt') || ''
    const width = (el as HTMLImageElement).style.width?.replace('px', '')
    return src ? `![[${src}${width ? `|${width}` : ''}]]` : ''
  }
})

wysiwygTurndown.addRule('math', {
  filter: (node) => node.nodeName === 'SPAN' && (node as HTMLElement).classList.contains('katex'),
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent || ''
    if (!tex) return ''

    const display = Boolean(el.closest('.katex-display'))
    return display ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`
  }
})

// Embed-Rekonstruktion: Die markdown-it-Renderer ersetzen `![[file.pdf]]`, ` ```mermaid`-Blöcke etc.
// durch dekorierte DOM-Container. Beim WYSIWYG-Roundtrip müssen wir die Original-Syntax aus den
// data-Attributen wiederherstellen, sonst gehen die Embeds beim Speichern verloren.
wysiwygTurndown.addRule('pdfEmbed', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('pdf-embed'),
  replacement: (_content, node) => {
    const filename = (node as HTMLElement).getAttribute('data-filename') || ''
    return filename ? `\n\n![[${filename}]]\n\n` : ''
  }
})

wysiwygTurndown.addRule('officeEmbed', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('office-embed'),
  replacement: (_content, node) => {
    const filename = (node as HTMLElement).getAttribute('data-filename') || ''
    return filename ? `\n\n![[${filename}]]\n\n` : ''
  }
})

// Plugin-Embed (R2): rekonstruiert ![[datei.ext]] aus data-filename — der gemountete
// Plugin-Inhalt (SVG etc.) darf NIE in die Markdown-Quelle wandern. Die Größen-Syntax
// (data-width/data-height) muss den Roundtrip überleben, sonst verliert jeder WYSIWYG-Save sie.
wysiwygTurndown.addRule('pluginEmbed', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('plugin-embed'),
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const filename = el.getAttribute('data-filename') || ''
    const width = el.getAttribute('data-width')
    const height = el.getAttribute('data-height')
    const sizeSuffix = width ? `|${width}${height ? `x${height}` : ''}` : ''
    return filename ? `\n\n![[${filename}${sizeSuffix}]]\n\n` : ''
  }
})

wysiwygTurndown.addRule('mermaidContainer', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('mermaid-container'),
  replacement: (_content, node) => {
    const el = node as HTMLElement
    // Nach Mermaid-Render ist der <pre>-Inhalt durch SVG ersetzt → data-source nutzen
    const source = el.getAttribute('data-source') ||
      el.querySelector('pre.mermaid')?.textContent?.trim() || ''
    return source ? `\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\n` : ''
  }
})

wysiwygTurndown.addRule('dataviewContainer', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('dataview-preview-container'),
  replacement: (_content, node) => {
    const query = (node as HTMLElement).getAttribute('data-query') || ''
    return query ? `\n\n\`\`\`dataview\n${query}\n\`\`\`\n\n` : ''
  }
})

// Callout-Roundtrip: Liest die in `processCallouts` gesetzten data-Attribute, rekonstruiert
// `> [!type][+-] title\n> body…`. Body-HTML wird rekursiv durch Turndown gejagt und mit
// `> `-Präfix versehen. Ohne diese Regel zerlegt Turndown <details>/<div class="callout">
// in Klartext und der Callout verschwindet bei jedem WYSIWYG-Save.
wysiwygTurndown.addRule('callout', {
  filter: (node) => {
    if (node.nodeName !== 'DETAILS' && node.nodeName !== 'DIV') return false
    return (node as HTMLElement).hasAttribute('data-callout-type')
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const type = el.getAttribute('data-callout-type') || 'note'
    const fold = el.getAttribute('data-callout-fold') || ''
    const title = el.getAttribute('data-callout-title') || ''

    const bodyEl = el.querySelector(':scope > .callout-content') as HTMLElement | null
    let bodyMarkdown = ''
    if (bodyEl) {
      bodyMarkdown = wysiwygTurndown.turndown(bodyEl.innerHTML).trim()
    }

    const titleLine = `> [!${type}]${fold}${title ? ' ' + title : ''}`
    const bodyLines = bodyMarkdown
      ? bodyMarkdown
          .split('\n')
          .map((line) => (line.length > 0 ? `> ${line}` : '>'))
          .join('\n')
      : ''

    return '\n\n' + titleLine + (bodyLines ? '\n' + bodyLines : '') + '\n\n'
  }
})

function stripFrontmatterRaw(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^(---\s*\n[\s\S]*?\n---\s*\n?)/)
  if (!match) return { frontmatter: '', body: content }
  return { frontmatter: match[1], body: content.slice(match[1].length) }
}

function editablePreviewHtmlToMarkdown(root: HTMLElement, currentContent: string): string {
  const clone = root.cloneNode(true) as HTMLElement
  // Nur reine UI-Artefakte entfernen (Copy-Buttons, Fold-Toggles). Die Embed-Container
  // bleiben drin und werden von den Turndown-Regeln in Original-Markdown rekonstruiert.
  clone.querySelectorAll('.code-copy-btn, .fold-toggle').forEach(el => el.remove())
  // Annotation-Highlights auspacken (Overlay-Schicht, gehört nicht in die Markdown-Quelle):
  // <mark class="anno-mark …">Text</mark> → Text
  clone.querySelectorAll('mark.anno-mark').forEach(el => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  })
  // Turndown's blankRule fängt leere Block-Elemente vor den Custom-Rules ab. In Production
  // haben unsere Embeds immer Inhalt (Loading-Spinner, Icons, SVG), aber als Sicherheitsnetz
  // injizieren wir ein Zero-Width-Space, falls ein Container doch mal leer ist.
  clone.querySelectorAll('.pdf-embed, .office-embed, .mermaid-container, .dataview-preview-container, .plugin-embed').forEach(el => {
    if (!el.textContent || !el.textContent.trim()) {
      el.appendChild(document.createTextNode('​'))
    }
  })
  const bodyMarkdown = wysiwygTurndown.turndown(clone).replace(/\n{3,}/g, '\n\n').trim()
  const { frontmatter } = stripFrontmatterRaw(currentContent)
  return `${frontmatter}${bodyMarkdown}${bodyMarkdown ? '\n' : ''}`
}

// Session-Highlight: umschließt die Selektion mit <mark class="anno-mark …">.
// Reine Anzeigeschicht — wird im turndown-Clone wieder ausgepackt (s.u.), berührt
// die Markdown-Quelle also nie. DOM-Mutation via Range löst KEIN onInput aus → kein Commit.
function applyAnnotationHighlight(range: Range, className: string, annoId: string): void {
  const make = () => {
    const mark = document.createElement('mark')
    mark.className = `anno-mark ${className}`
    mark.dataset.annoId = annoId
    return mark
  }
  try {
    range.surroundContents(make())
  } catch {
    // Selektion über Element-/Blockgrenzen: extractContents-Fallback
    try {
      const mark = make()
      mark.appendChild(range.extractContents())
      range.insertNode(mark)
    } catch {
      /* Highlight ist optional — die Annotationen-Datei wurde trotzdem geschrieben */
    }
  }
  window.getSelection()?.removeAllRanges()
}

// Entfernt eine Highlight-Marke aus dem DOM und behält den Text (Auspacken).
function unwrapAnnotationMark(mark: HTMLElement): void {
  const parent = mark.parentNode
  if (!parent) return
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
  parent.removeChild(mark)
  parent.normalize?.()
}

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
    return `<img class="md-image" data-src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(cleanAlt)}" ${style}>`
  }

  // Für externe URLs: Standard-Renderer verwenden
  if (defaultImageRender) {
    return defaultImageRender(tokens, idx, options, env, self)
  }
  return `<img src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(alt)}">`
}

// Custom renderer für [[wikilinks]], ![[embeds]] und ![[images]]
md.renderer.rules.text = (tokens, idx) => {
  const content = tokens[idx].content

  // Konvertiere ![[embeds]] - unterscheide zwischen Bildern, PDFs und Notiz-Embeds
  let result = content.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_match, linkText, sizeOrAlias) => {
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
      return `<img class="md-image" data-src="${md.utils.escapeHtml(linkText)}" alt="${md.utils.escapeHtml(linkText)}" ${style}>`
    }

    // Prüfe ob es sich um ein PDF handelt
    if (linkText.toLowerCase().endsWith('.pdf')) {
      // PDF-Embed: ![[document.pdf]]
      return `<div class="pdf-embed" data-filename="${md.utils.escapeHtml(linkText)}">
        <div class="pdf-embed-loading">Lade PDF: ${md.utils.escapeHtml(linkText)}...</div>
      </div>`
    }

    // Office-Dateien: Excel/Word/PowerPoint — Platzhalter mit Link zum Öffnen
    const lowerLink = linkText.toLowerCase()
    const officeMatch = /\.(xlsx|xls|docx|doc|pptx|ppt)(#.*)?$/.exec(lowerLink)
    if (officeMatch) {
      const ext = officeMatch[1]
      const icon = (ext === 'xlsx' || ext === 'xls') ? '📊' : (ext === 'docx' || ext === 'doc') ? '📝' : '📽️'
      const typeLabel = (ext === 'xlsx' || ext === 'xls') ? 'Excel' : (ext === 'docx' || ext === 'doc') ? 'Word' : 'PowerPoint'
      return `<div class="office-embed" data-filename="${md.utils.escapeHtml(linkText)}" data-ext="${ext}">
        <span class="office-embed-icon">${icon}</span>
        <span class="office-embed-label">${typeLabel}-Datei:</span>
        <span class="office-embed-name">${md.utils.escapeHtml(linkText)}</span>
      </div>`
    }

    // Plugin-Embed (R2): ![[skizze.excalidraw]] — Endung von einem aktiven Renderer-Plugin
    // geclaimt und Datei existiert im Vault. Platzhalter-Div; Hydration mountet den Embed.
    // Größen-Syntax ![[datei.ext|400]] / ![[datei.ext|400x300]] wandert als data-Attribute mit.
    if (resolvePluginEmbedTarget(linkText)) {
      const embedSize = parsePluginEmbedSize(sizeOrAlias)
      const sizeAttrs = embedSize
        ? ` data-width="${embedSize.width}"${embedSize.height ? ` data-height="${embedSize.height}"` : ''}`
        : ''
      return `<div class="plugin-embed" data-filename="${md.utils.escapeHtml(linkText)}"${sizeAttrs}>
        <div class="plugin-embed-loading">Lade ${md.utils.escapeHtml(linkText)}...</div>
      </div>`
    }

    // Notiz-Embed: ![[noteName]] oder ![[noteName#heading]] oder ![[noteName#^blockid]]
    const hashIndex = linkText.indexOf('#')
    const noteName = hashIndex > -1 ? linkText.substring(0, hashIndex) : linkText
    const fragment = hashIndex > -1 ? linkText.substring(hashIndex + 1) : ''
    const isBlock = fragment.startsWith('^')

    return `<div class="wikilink-embed" data-note="${md.utils.escapeHtml(noteName)}" data-fragment="${md.utils.escapeHtml(fragment)}" data-is-block="${isBlock}">
      <div class="wikilink-embed-loading">Lade ${md.utils.escapeHtml(linkText)}...</div>
    </div>`
  })

  // Konvertiere [[wikilinks]] zu klickbaren Links — inklusive Pipe-Alias-Syntax
  // [[target|displayText]] (Obsidian-kompatibel).
  result = result.replace(/\[\[([^\]]+)\]\]/g, (_, linkText) => {
    // Pipe trennt Ziel und Anzeigetext: [[target|display]]
    const pipeIndex = linkText.indexOf('|')
    const targetPart = pipeIndex > -1 ? linkText.substring(0, pipeIndex) : linkText
    const explicitDisplay = pipeIndex > -1 ? linkText.substring(pipeIndex + 1) : null

    // Parse target: noteName#heading oder noteName#^blockid
    const hashIndex = targetPart.indexOf('#')
    const noteName = hashIndex > -1 ? targetPart.substring(0, hashIndex) : targetPart
    const fragment = hashIndex > -1 ? targetPart.substring(hashIndex + 1) : ''

    // Display: explizit gesetzt → den nehmen, sonst den vollen Target-Part (mit Fragment)
    const displayText = explicitDisplay !== null ? explicitDisplay : targetPart

    return `<a href="#" class="wikilink" data-link="${md.utils.escapeHtml(noteName)}" data-fragment="${md.utils.escapeHtml(fragment)}">${md.utils.escapeHtml(displayText)}</a>`
  })

  return result
}

// Custom fence renderer für Mermaid-Diagramme und Dataview
const defaultFenceRender = md.renderer.rules.fence
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info.trim().toLowerCase()

  if (info === 'mermaid') {
    const code = token.content.trim()
    const id = `mermaid-${idx}-${Date.now()}`
    // data-source preserves the original code even after Mermaid replaces the <pre> with SVG —
    // the WYSIWYG round-trip needs it to reconstruct the ```mermaid block.
    return `<div class="mermaid-container" data-source="${md.utils.escapeHtml(code)}"><pre class="mermaid" id="${id}">${code}</pre></div>`
  }

  // Dataview code blocks - render as placeholder, will be processed after render
  if (info === 'dataview') {
    const query = token.content.trim()
    const id = `dataview-${idx}-${Date.now()}`
    return `<div class="dataview-preview-container" id="${id}" data-query="${md.utils.escapeHtml(query)}">
      <div class="dataview-loading"><span class="dataview-spinner"></span></div>
    </div>`
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
    (_match, imgTag, caption) => {
      return `<figure class="md-figure">${imgTag}<figcaption>${caption}</figcaption></figure>`
    }
  )
}

// Callout Icons
const calloutIcons: Record<string, string> = {
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

// Konvertiert Obsidian Callouts zu HTML (mit Verschachtelung und Markdown im Titel)
function processCallouts(content: string): string {
  // Callout Pattern: > [!type](+|-) optional title
  // Gefolgt von > content lines
  const calloutRegex = /^>\s*\[!(\w+)\]([+-])?(?:\s+(.+))?\n((?:>.*\n?)*)/gm

  const result = content.replace(calloutRegex, (_match, type, foldModifier, customTitle, body) => {
    const calloutType = type.toLowerCase()
    const title = customTitle || type.charAt(0).toUpperCase() + type.slice(1)
    const isFoldable = foldModifier === '+' || foldModifier === '-'
    const isCollapsed = foldModifier === '-'

    // Entferne ein > am Anfang jeder Zeile im Body
    const cleanBody = body
      .split('\n')
      .map((line: string) => line.replace(/^>\s?/, ''))
      .join('\n')
      .trim()

    // Rekursiv verschachtelte Callouts verarbeiten
    const processedBody = processCallouts(cleanBody)

    const icon = calloutIcons[calloutType] || '📌'
    const escapedType = md.utils.escapeHtml(calloutType)
    // Titel wird als Inline-Markdown gerendert (für Bold, Links, Code etc.)
    const renderedTitle = md.renderInline(title)
    const renderedBody = md.render(processedBody)

    // Roundtrip-Metadaten: Beim WYSIWYG-Speichern liest die Turndown-`callout`-Regel
    // diese Attribute, um `> [!type][+-] title`-Markdown rekonstruieren zu können.
    // Ohne sie strippt Turndown's Default-Behandlung von <details>/<div> die Callout-
    // Struktur stillschweigend (Bug: lange Callouts mit mehrzeiligem Body wurden zu
    // Klartext mit Emoji-Präfix reduziert).
    const escapedTitle = md.utils.escapeHtml(customTitle || '')
    const foldAttr = isFoldable ? (isCollapsed ? '-' : '+') : ''
    const dataAttrs = `data-callout-type="${escapedType}" data-callout-fold="${foldAttr}" data-callout-title="${escapedTitle}"`

    if (isFoldable) {
      return `<details class="callout callout-${escapedType}"${isCollapsed ? '' : ' open'} ${dataAttrs}>
      <summary class="callout-title">${icon} ${renderedTitle}<span class="callout-fold-indicator"></span></summary>
      <div class="callout-content">${renderedBody}</div>
    </details>\n`
    }

    return `<div class="callout callout-${escapedType}" ${dataAttrs}>
      <div class="callout-title">${icon} ${renderedTitle}</div>
      <div class="callout-content">${renderedBody}</div>
    </div>\n`
  })

  return result
}

type ViewMode = 'edit' | 'preview' | 'live-preview'

// Compartment for live preview extension (created once, reused)
const livePreviewCompartment = new Compartment()
// Compartment for dataview extension
const dataviewCompartment = new Compartment()

interface MarkdownEditorProps {
  noteId?: string  // Optional: spezifische Notiz anzeigen (für Text-Split)
  isSecondary?: boolean  // Ist dies das sekundäre Panel im Text-Split?
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ noteId, isSecondary = false }) => {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const editablePreviewRef = useRef<HTMLDivElement>(null)
  // Aktive Plugin-Embed-Mounts der Preview, per Platzhalter-Element getrackt (R2).
  const pluginEmbedMountsRef = useRef(new Map<Element, { dispose: () => void }>())
  const viewRef = useRef<EditorView | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const previewEditTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isPreviewDomEditingRef = useRef(false)
  // Fokuswechsel (z.B. vom Lesen-Modus zur Macher-Leiste) dürfen keinen
  // HTML→Markdown-Roundtrip auslösen. Nur echte DOM-Änderungen werden committed.
  const isPreviewDomDirtyRef = useRef(false)
  const lastSavedContentRef = useRef<string>('')
  const isExternalUpdateRef = useRef(false)
  const currentNoteIdRef = useRef<string | null>(null)  // Track current note ID for async operations
  const dictationHandleRef = useRef<DictationHandle | null>(null)  // Aktive Diktat-Session, falls vorhanden

  const { vaultPath, selectedNoteId, secondarySelectedNoteId, notes, updateNote, selectNote, selectSecondaryNote, addNote, fileTree, setFileTree, navigateBack, navigateForward, canNavigateBack, canNavigateForward } = useNotesStore(
    useShallow(s => ({ vaultPath: s.vaultPath, selectedNoteId: s.selectedNoteId, secondarySelectedNoteId: s.secondarySelectedNoteId, notes: s.notes, updateNote: s.updateNote, selectNote: s.selectNote, selectSecondaryNote: s.selectSecondaryNote, addNote: s.addNote, fileTree: s.fileTree, setFileTree: s.setFileTree, navigateBack: s.navigateBack, navigateForward: s.navigateForward, canNavigateBack: s.canNavigateBack, canNavigateForward: s.canNavigateForward }))
  )
  const { pendingTemplateInsert, setPendingTemplateInsert, pendingAgentContext, setPendingAgentContext, ollama, editorHeadingFolding, outlineStyle, editorShowWordCount, editorHeaderActions, languageTool, setLanguageTool, editorDefaultView, showFormattingToolbar, setShowFormattingToolbar, showRawEditor, readingModeHintDismissed, setReadingModeHintDismissed } = useUIStore(
    useShallow(s => ({ pendingTemplateInsert: s.pendingTemplateInsert, setPendingTemplateInsert: s.setPendingTemplateInsert, pendingAgentContext: s.pendingAgentContext, setPendingAgentContext: s.setPendingAgentContext, ollama: s.ollama, editorHeadingFolding: s.editorHeadingFolding, outlineStyle: s.outlineStyle, editorShowWordCount: s.editorShowWordCount, editorHeaderActions: s.editorHeaderActions, languageTool: s.languageTool, setLanguageTool: s.setLanguageTool, editorDefaultView: s.editorDefaultView, showFormattingToolbar: s.showFormattingToolbar, setShowFormattingToolbar: s.setShowFormattingToolbar, showRawEditor: s.showRawEditor, readingModeHintDismissed: s.readingModeHintDismissed, setReadingModeHintDismissed: s.setReadingModeHintDismissed }))
  )
  const [marketing] = usePluginConfig('marketing', MARKETING_DEFAULTS)

  // Verwende die übergebene noteId oder die primary/secondary Selection
  const effectiveNoteId = noteId ?? (isSecondary ? secondarySelectedNoteId : selectedNoteId)
  const selectedNote = notes.find(n => n.id === effectiveNoteId)

  // Voice: Sprache-Modul + aktueller Status für Preview-Vorlese-Button
  const speechEnabled = useIsModuleEnabled('speech')
  const voiceStatus = useVoiceStore(s => s.status)
  const voiceContext = useVoiceStore(s => s.activeContextId)
  const isPreviewSpeaking = (voiceStatus === 'speaking' || voiceStatus === 'transcribing') && voiceContext === 'preview'

  const [isSaving, setIsSaving] = useState(false)
  // Initial-Wert aus dem konfigurierten Standardmodus, damit der erste Render
  // schon im richtigen Modus ist (nicht erst nach dem Notiz-Load-Effekt).
  const [viewMode, setViewMode] = useState<ViewMode>(editorDefaultView)
  const [previewContent, setPreviewContent] = useState('')
  const [contentVersion, setContentVersion] = useState(0)
  const loadedImagesRef = useRef<Map<string, string>>(new Map())
  const [imagesLoadedVersion, setImagesLoadedVersion] = useState(0)
  const [formatMenu, setFormatMenu] = useState<{ x: number; y: number; ai?: { selectedText: string; selectionStart: number; selectionEnd: number } } | null>(null)
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false)
  const [foldedHeadings, setFoldedHeadings] = useState<Set<string>>(new Set())
  const [aiMenu, setAiMenu] = useState<{ x: number; y: number; selectedText: string; selectionStart: number; selectionEnd: number } | null>(null)
  // Macher-Leiste: Anweisung → KI-Vorschlag als Block-Diff → Übernehmen/Verwerfen.
  const [aiBarOpen, setAiBarOpen] = useState(false)
  const [aiPhase, setAiPhase] = useState<'idle' | 'generating' | 'review'>('idle')
  const [aiProposal, setAiProposal] = useState<(AiProposalMeta & { from: number; to: number; newText: string }) | null>(null)
  // Ambienter Copilot: Tag-Vorschläge auf Knopf → bestätigen ins Frontmatter.
  const [aiTagSuggestions, setAiTagSuggestions] = useState<string[]>([])
  const [aiTagsLoading, setAiTagsLoading] = useState(false)
  // Modellwahl für die Macher-Leiste (lokales Override; '' = globales Standardmodell).
  const [aiModel, setAiModel] = useState('')
  const [aiModels, setAiModels] = useState<Array<{ name: string }>>([])
  // Cloud (OpenRouter/LLMBase) für Inline-Notiz-KI: pro Provider ein Eintrag im
  // Modell-Dropdown. Der Notiz-Agent (Modus B) hat ein EIGENES Cloud-Opt-in — der
  // Provider-Eintrag im Picker erscheint, sobald dort eines der beiden Features
  // freigeschaltet ist; welcher Pfad ihn nutzen darf, prüft der jeweilige Submit
  // (Modus A: note-edit, B: note-agent).
  const noteEditRoutes = useMemo(() => cloudRoutesForFeature('note-edit', ollama), [ollama])
  const agentRoutes = useMemo(() => cloudRoutesForFeature('note-agent', ollama), [ollama])
  const cloudPickerRoutes = useMemo(
    () => [...noteEditRoutes, ...agentRoutes.filter(r => !noteEditRoutes.some(n => n.provider === r.provider))],
    [noteEditRoutes, agentRoutes]
  )
  const defaultAiCloudProvider = cloudPickerRoutes[0]?.provider ?? null
  const [aiCloudProvider, setAiCloudProvider] = useState<CloudProviderId | null>(null)
  useEffect(() => { setAiCloudProvider(defaultAiCloudProvider) }, [defaultAiCloudProvider])
  const activeAiCloudRoute = aiCloudProvider
    ? (cloudPickerRoutes.find(r => r.provider === aiCloudProvider) ?? null)
    : null
  // Notiz-Agent Phase 1: Kontext-Dateien, flüchtig und strikt auf die Note-ID gekeyt —
  // der Editor bleibt bei Notizwechsel gemountet (docs/note-agent-harness-plan.md §1/F08).
  const [agentAttachmentsByNote, setAgentAttachmentsByNote] = useState<Record<string, NoteAgentAttachment[]>>({})
  const [agentAttachError, setAgentAttachError] = useState<string | null>(null)
  const agentAttachments = (effectiveNoteId && agentAttachmentsByNote[effectiveNoteId]) || EMPTY_AGENT_ATTACHMENTS
  // Notiz-Agent Phase 2: Zielordner + Lauf-Zustand pro Notiz; runId→noteId fürs Event-Routing.
  const [agentTargetByNote, setAgentTargetByNote] = useState<Record<string, string>>({})
  const agentTargetFolder = (effectiveNoteId && agentTargetByNote[effectiveNoteId]) || ''
  const [agentRunByNote, setAgentRunByNote] = useState<Record<string, AgentRunUiState>>({})
  const agentRunState = (effectiveNoteId && agentRunByNote[effectiveNoteId]) || EMPTY_AGENT_RUN
  const agentRunNoteRef = useRef(new Map<string, string>())
  const [showAIImageDialog, setShowAIImageDialog] = useState(false)
  const [showPublishWpModal, setShowPublishWpModal] = useState(false)
  const [previewToolbar, setPreviewToolbar] = useState<{ x: number; y: number } | null>(null)
  const [previewLinkInput, setPreviewLinkInput] = useState<{ kind: 'url' | 'wiki'; value: string } | null>(null)
  const [previewWikilinkIndex, setPreviewWikilinkIndex] = useState(0)
  const savedPreviewRangeRef = useRef<Range | null>(null)

  // LanguageTool State
  const [ltMatches, setLtMatches] = useState<LanguageToolMatch[]>([])
  const [ltIsChecking, setLtIsChecking] = useState(false)
  const [ltStatus, setLtStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [ltErrorMessage, setLtErrorMessage] = useState<string | null>(null)
  const [ltPopup, setLtPopup] = useState<{ x: number; y: number; match: LanguageToolPopupMatch } | null>(null)
  const ltCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // One-click Auto-Korrektur (wie im Mail-Compose): wendet die beste Korrektur auf
  // alle Treffer an. Funktioniert in allen Modi inkl. Lesen, da auf dem Markdown gearbeitet wird.
  const [ltAutoCorrecting, setLtAutoCorrecting] = useState(false)
  const [ltCorrectedCount, setLtCorrectedCount] = useState(0)
  const ltCorrectedTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Wikilink Hover Preview State
  const [hoverPreview, setHoverPreview] = useState<{
    x: number
    y: number
    noteName: string
    html: string
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

  // Slash Command Menu State
  const [slashMenu, setSlashMenu] = useState<{
    isOpen: boolean
    triggerPos: number
    query: string
  } | null>(null)

  // Dataview: Update notes in extension and rebuild indexes when notes change
  const dataviewRebuildIndexes = useDataviewStore(s => s.rebuildIndexes)
  const language = useUIStore(s => s.language)

  useEffect(() => {
    // Rebuild dataview indexes when notes change
    if (notes.length > 0) {
      dataviewRebuildIndexes(notes)
    }
  }, [notes, dataviewRebuildIndexes])

  useEffect(() => {
    // Update dataview extension with current notes
    console.log('[MarkdownEditor] Notes effect - viewRef:', !!viewRef.current, 'notes:', notes.length)
    if (viewRef.current && notes.length > 0) {
      console.log('[MarkdownEditor] Dispatching setDataviewNotes with', notes.length, 'notes')
      viewRef.current.dispatch({
        effects: setDataviewNotes.of(notes)
      })
    }
  }, [notes])

  useEffect(() => {
    // Update dataview language
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: setDataviewLanguage.of(language)
      })
    }
  }, [language])

  useEffect(() => {
    // Update dataview view mode - only show results in live-preview mode
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: setDataviewViewMode.of(viewMode)
      })
    }
  }, [viewMode])

  // Set up note click handler for dataview
  useEffect(() => {
    setNoteClickHandler((notePath: string) => {
      const note = notes.find(n => n.path === notePath)
      if (note) {
        selectNote(note.id)
      }
    })
  }, [notes, selectNote])

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
    // In Preview-Modus: Kontextmenü wird per DOM erzeugt, nicht über React
    if (!viewRef.current) {
      setFormatMenu(null)
      return
    }

    const view = viewRef.current
    const { from, to } = view.state.selection.main
    const selectedText = view.state.doc.sliceString(from, to)

    // Clipboard-Aktionen
    if (type === 'copy') {
      if (selectedText) {
        await writeClipboardText(selectedText)
      }
      setFormatMenu(null)
      return
    }

    if (type === 'cut') {
      if (selectedText) {
        await writeClipboardText(selectedText)
        view.dispatch({
          changes: { from, to, insert: '' }
        })
      }
      setFormatMenu(null)
      return
    }

    if (type === 'paste') {
      try {
        const clipboardText = await readClipboardText()
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

    // Voice: vorlesen (Auswahl oder ganze Notiz)
    if (type === 'voice-speak') {
      const textToRead = selectedText.trim() || view.state.doc.toString()
      if (textToRead.trim()) speak(textToRead, { contextId: 'editor' })
      setFormatMenu(null)
      return
    }
    if (type === 'voice-stop') {
      stopSpeaking()
      setFormatMenu(null)
      return
    }

    // Voice: diktieren (Toggle)
    if (type === 'voice-dictate') {
      setFormatMenu(null)
      try {
        const handle = await startDictation({
          contextId: 'editor',
          onTranscript: (text) => {
            const v = viewRef.current
            if (!v) return
            const cursor = v.state.selection.main
            const insertText = cursor.from === cursor.to ? text : text
            v.dispatch({
              changes: { from: cursor.from, to: cursor.to, insert: insertText },
              selection: { anchor: cursor.from + insertText.length }
            })
            v.focus()
          }
        })
        dictationHandleRef.current = handle
      } catch (err) {
        console.error('[voice-dictate] start failed:', err)
      }
      return
    }
    if (type === 'voice-dictate-stop') {
      setFormatMenu(null)
      const handle = dictationHandleRef.current
      dictationHandleRef.current = null
      if (handle) {
        try { await handle.stop() } catch (err) { console.error('[voice-dictate] stop failed:', err) }
      }
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
      case 'bulletList': {
        const bulletLines = view.state.doc.sliceString(
          view.state.doc.lineAt(from).from,
          view.state.doc.lineAt(to).to
        )
        const lineFrom = view.state.doc.lineAt(from).from
        const lineTo = view.state.doc.lineAt(to).to
        const lines = bulletLines.split('\n')
        const allBullets = lines.every(l => /^\s*- /.test(l))
        const toggled = allBullets
          ? lines.map(l => l.replace(/^(\s*)- /, '$1')).join('\n')
          : lines.map(l => /^\s*- /.test(l) ? l : `- ${l}`).join('\n')
        view.dispatch({
          changes: { from: lineFrom, to: lineTo, insert: toggled },
          selection: { anchor: lineFrom + toggled.length }
        })
        setFormatMenu(null)
        view.focus()
        return
      }
      case 'numberedList': {
        const numLines = view.state.doc.sliceString(
          view.state.doc.lineAt(from).from,
          view.state.doc.lineAt(to).to
        )
        const numLineFrom = view.state.doc.lineAt(from).from
        const numLineTo = view.state.doc.lineAt(to).to
        const nLines = numLines.split('\n')
        const allNumbered = nLines.every(l => /^\s*\d+\.\s/.test(l))
        const numToggled = allNumbered
          ? nLines.map(l => l.replace(/^(\s*)\d+\.\s/, '$1')).join('\n')
          : nLines.map((l, i) => /^\s*\d+\.\s/.test(l) ? l : `${i + 1}. ${l}`).join('\n')
        view.dispatch({
          changes: { from: numLineFrom, to: numLineTo, insert: numToggled },
          selection: { anchor: numLineFrom + numToggled.length }
        })
        setFormatMenu(null)
        view.focus()
        return
      }
      case 'horizontalRule':
        replacement = `\n---\n`
        cursorOffset = 0
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
    if (content.length === 0 && lastSavedContentRef.current.length > 0) {
      console.error('[MarkdownEditor] Blocked empty autosave for non-empty note:', selectedNote.path)
      return
    }

    setIsSaving(true)

    try {
      const fullPath = `${vaultPath}/${selectedNote.path}`
      await window.electronAPI.writeFile(fullPath, content)

      lastSavedContentRef.current = content

      // Update note in store - markiere als externes Update
      const fileName = selectedNote.path.split('/').pop() || selectedNote.path
      isExternalUpdateRef.current = true
      const newTitle = extractTitle(content, fileName)
      updateNote(selectedNote.id, {
        content,
        title: newTitle,
        outgoingLinks: extractLinks(content),
        tags: extractTags(content),
        headings: extractHeadings(content),
        blocks: extractBlocks(content),
        modifiedAt: new Date()
      })

      // Tab-Titel synchronisieren
      useTabStore.getState().updateTabTitle(selectedNote.id, newTitle)

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

  // Handle properties panel changes
  const handlePropertiesChange = useCallback((newContent: string) => {
    // Update CodeMirror editor content
    if (viewRef.current) {
      const currentContent = viewRef.current.state.doc.toString()
      if (currentContent !== newContent) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: newContent
          }
        })
      }
    }
    // Trigger save
    saveContent(newContent)
  }, [saveContent])

  // LanguageTool: Text prüfen (YAML-Header wird ausgeschlossen)
  const checkLanguageTool = useCallback(async () => {
    if (!viewRef.current || !languageTool.enabled) return

    const content = viewRef.current.state.doc.toString()
    if (!content.trim()) {
      setLtMatches([])
      setLtStatus('idle')
      setLtErrorMessage(null)
      viewRef.current.dispatch({
        effects: setLanguageToolMatches.of([])
      })
      return
    }

    // Strip YAML frontmatter from check (but remember offset for positioning)
    let textToCheck = content
    let frontmatterOffset = 0
    const yamlMatch = content.match(/^---\n[\s\S]*?\n---\n/)
    if (yamlMatch) {
      frontmatterOffset = yamlMatch[0].length
      textToCheck = content.substring(frontmatterOffset)
    }

    if (!textToCheck.trim()) {
      setLtMatches([])
      setLtStatus('idle')
      setLtErrorMessage(null)
      viewRef.current.dispatch({
        effects: setLanguageToolMatches.of([])
      })
      return
    }

    setLtIsChecking(true)
    setLtErrorMessage(null)
    try {
      const mode = languageTool.mode || 'local'
      const result = await window.electronAPI.languagetoolAnalyze(
        textToCheck,
        languageTool.language === 'auto' ? undefined : languageTool.language,
        mode,
        mode === 'local' ? languageTool.url : undefined,
        mode === 'api' ? languageTool.apiUsername : undefined,
        mode === 'api' ? languageTool.apiKey : undefined
      )

      if (result.success && result.matches) {
        // Adjust offsets to account for stripped frontmatter
        const adjustedMatches = result.matches.map(match => ({
          ...match,
          offset: match.offset + frontmatterOffset
        }))

        const ignoredRules = languageTool.ignoredRules || []
        const filteredMatches = adjustedMatches
          .map(match => {
            const matchText = content.substring(match.offset, match.offset + match.length)
            // Drop replacements whose only difference is leading/trailing whitespace —
            // those look identical to the original text in the suggestion button and
            // tricked users into accepting silent newline insertions/removals.
            const meaningful = (match.replacements || []).filter(
              r => r.value.trim() !== matchText.trim()
            )
            return { ...match, replacements: meaningful }
          })
          .filter(match => {
            // Drop matches with no meaningful replacements left
            if (!match.replacements || match.replacements.length === 0) return false
            // Drop user-ignored rules
            const matchText = content.substring(match.offset, match.offset + match.length)
            return !ignoredRules.some(r => r.ruleId === match.rule.id && r.text === matchText)
          })

        setLtMatches(filteredMatches)
        setLtStatus('ok')
        // Update CodeMirror decorations
        if (viewRef.current) {
          viewRef.current.dispatch({
            effects: setLanguageToolMatches.of(filteredMatches)
          })
        }
      } else {
        setLtStatus('error')
        setLtErrorMessage(result.error || t('languagetool.error'))
        console.error('[LanguageTool] Error:', result.error)
      }
    } catch (error) {
      setLtStatus('error')
      setLtErrorMessage(error instanceof Error ? error.message : t('languagetool.error'))
      console.error('[LanguageTool] Check failed:', error)
    } finally {
      setLtIsChecking(false)
    }
  }, [languageTool.enabled, languageTool.language, languageTool.url, languageTool.mode, languageTool.apiUsername, languageTool.apiKey, languageTool.ignoredRules, t])

  // LanguageTool: Auto-Check bei Änderungen
  useEffect(() => {
    if (!languageTool.enabled || !languageTool.autoCheck || viewMode === 'preview') return

    // Clear previous timeout
    if (ltCheckTimeoutRef.current) {
      clearTimeout(ltCheckTimeoutRef.current)
    }

    // Set new timeout when content changes
    const handleChange = () => {
      if (ltCheckTimeoutRef.current) {
        clearTimeout(ltCheckTimeoutRef.current)
      }
      ltCheckTimeoutRef.current = setTimeout(checkLanguageTool, languageTool.autoCheckDelay)
    }

    // Initial check
    handleChange()

    return () => {
      if (ltCheckTimeoutRef.current) {
        clearTimeout(ltCheckTimeoutRef.current)
      }
    }
  }, [languageTool.enabled, languageTool.autoCheck, languageTool.autoCheckDelay, previewContent, viewMode, checkLanguageTool])

  // Voice: Bei Notizwechsel oder Unmount TTS stoppen und laufende Diktate abbrechen.
  useEffect(() => {
    return () => {
      stopSpeaking()
      const handle = dictationHandleRef.current
      dictationHandleRef.current = null
      if (handle) handle.cancel()
    }
  }, [selectedNoteId])

  // LanguageTool: Clear matches when note changes
  useEffect(() => {
    setLtMatches([])
    setLtStatus('idle')
    setLtErrorMessage(null)
    setLtPopup(null)
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: setLanguageToolMatches.of([])
      })
    }
  }, [effectiveNoteId])

  // LanguageTool: Apply suggestion
  const applyLtSuggestion = useCallback((replacement: string, from: number, to: number) => {
    const view = viewRef.current
    if (!view) return

    // Cursor erhalten: bisherige Position durch die Korrektur mappen, ohne ans Ende des
    // korrigierten Worts zu springen. Lag der Cursor in der korrigierten Range, landet er
    // hinter der Einfügung; sonst bleibt er relativ wo er war.
    const prev = view.state.selection.main
    const lengthDiff = replacement.length - (to - from)
    const mapPos = (pos: number): number => {
      if (pos <= from) return pos
      if (pos >= to) return pos + lengthDiff
      return from + replacement.length
    }

    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: mapPos(prev.anchor), head: mapPos(prev.head) },
      scrollIntoView: false,
    })
    setLtPopup(null)
    view.focus()

    // Re-check after applying
    if (languageTool.autoCheck) {
      setTimeout(checkLanguageTool, 500)
    }
  }, [languageTool.autoCheck, checkLanguageTool])

  // LanguageTool: Ignore a match (remove from list and persist)
  const ignoreLtMatch = useCallback((from: number, to: number, ruleId: string, text: string) => {
    // Remove the match from the list
    const newMatches = ltMatches.filter(m => !(m.offset === from && m.offset + m.length === to))
    setLtMatches(newMatches)

    // Update CodeMirror decorations
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: setLanguageToolMatches.of(newMatches)
      })
    }

    // Persist the ignored rule (only if not already ignored)
    const alreadyIgnored = languageTool.ignoredRules?.some(r => r.ruleId === ruleId && r.text === text)
    if (!alreadyIgnored) {
      setLanguageTool({
        ignoredRules: [...(languageTool.ignoredRules || []), { ruleId, text }]
      })
    }

    setLtPopup(null)
  }, [ltMatches, languageTool.ignoredRules, setLanguageTool])

  // LanguageTool: Setup click handler for error elements via CodeMirror extension
  useEffect(() => {
    if (!languageTool.enabled) {
      setLtErrorClickHandler(null)
      return
    }

    setLtErrorClickHandler((event: MouseEvent, matchData: string) => {
      try {
        const match = JSON.parse(matchData) as LanguageToolPopupMatch
        setLtPopup({
          x: event.clientX,
          y: event.clientY,
          match
        })
      } catch (err) {
        console.error('[LanguageTool] Failed to parse match data:', err)
      }
    })

    return () => {
      setLtErrorClickHandler(null)
    }
  }, [languageTool.enabled])

  // LanguageTool: Close popup when clicking outside
  useEffect(() => {
    if (!ltPopup) return
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.lt-popup')) return
      setLtPopup(null)
    }
    // Delay so the opening mousedown doesn't immediately close it
    const timer = setTimeout(() => document.addEventListener('mousedown', handleOutsideClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [ltPopup])

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

  // ===== Macher-Leiste: Anweisung → KI-Vorschlag (Block-Diff) → Übernehmen/Verwerfen =====
  const aiActionLabel = (preset: string | null, instruction: string): string => {
    switch (preset) {
      case 'rewrite': return 'Umschreiben'
      case 'shorten': return 'Kürzen'
      case 'structure': return 'Strukturieren'
      case 'tone': return 'Ton anpassen'
      default: return instruction ? `„${instruction.slice(0, 40)}${instruction.length > 40 ? '…' : ''}"` : 'Bearbeiten'
    }
  }

  // ── Notiz-Agent Phase 1: Kontext-Dateien für die Macher-Leiste ──────────────
  const agentAddAttachments = useCallback((noteId: string, added: NoteAgentAttachment[]) => {
    setAgentAttachmentsByNote(prev => ({ ...prev, [noteId]: [...(prev[noteId] || []), ...added] }))
  }, [])

  const agentAttachFromDialog = useCallback(async () => {
    if (!effectiveNoteId) return
    setAgentAttachError(null)
    const res = await window.electronAPI.noteAgentAttachDialog()
    if (res.attachments.length > 0) agentAddAttachments(effectiveNoteId, res.attachments)
    if (res.errors.length > 0) setAgentAttachError(res.errors.join(' · '))
  }, [effectiveNoteId, agentAddAttachments])

  const agentAttachFolderFromDialog = useCallback(async () => {
    if (!effectiveNoteId) return
    setAgentAttachError(null)
    const res = await window.electronAPI.noteAgentAttachFolderDialog()
    if (res.attachments.length > 0) agentAddAttachments(effectiveNoteId, res.attachments)
    if (res.errors.length > 0) setAgentAttachError(res.errors.join(' · '))
  }, [effectiveNoteId, agentAddAttachments])

  const agentAttachVaultFile = useCallback(async (relPath: string) => {
    if (!effectiveNoteId || !vaultPath) return
    setAgentAttachError(null)
    const res = await window.electronAPI.noteAgentAttachVaultFile(vaultPath, relPath)
    if (res.attachments.length > 0) agentAddAttachments(effectiveNoteId, res.attachments)
    if (res.errors.length > 0) setAgentAttachError(res.errors.join(' · '))
  }, [effectiveNoteId, vaultPath, agentAddAttachments])

  const agentDetach = useCallback(async (id: string) => {
    if (!effectiveNoteId) return
    setAgentAttachError(null)
    await window.electronAPI.noteAgentDetach(id)
    setAgentAttachmentsByNote(prev => ({
      ...prev,
      [effectiveNoteId]: (prev[effectiveNoteId] || []).filter(a => a.id !== id)
    }))
  }, [effectiveNoteId])

  // ── Notiz-Agent Phase 2 (Modus B): Zielordner, Lauf, Ergebnis-Karten ────────
  const agentSetTargetFolder = useCallback((rel: string | null) => {
    if (!effectiveNoteId) return
    setAgentTargetByNote(prev => {
      const next = { ...prev }
      if (rel) next[effectiveNoteId] = rel
      else delete next[effectiveNoteId]
      return next
    })
  }, [effectiveNoteId])

  // Sender-gebundene Events vom Main: Routing über runId→noteId; Events fremder
  // oder verworfener Läufe werden ignoriert (F10). Nur der Primär-Editor lauscht —
  // preload erlaubt einen Listener pro Channel.
  useEffect(() => {
    if (isSecondary) return
    window.electronAPI.onNoteAgentProgress(p => {
      const noteId = agentRunNoteRef.current.get(p.runId)
      if (!noteId) return
      setAgentRunByNote(prev => {
        const cur = prev[noteId]
        if (!cur || cur.runId !== p.runId) return prev
        return { ...prev, [noteId]: { ...cur, steps: [...cur.steps, { seq: p.seq, skill: p.skill, summary: p.summary }] } }
      })
    })
    window.electronAPI.onNoteAgentDone(p => {
      const noteId = agentRunNoteRef.current.get(p.runId)
      if (!noteId) return
      setAgentRunByNote(prev => {
        const cur = prev[noteId]
        if (!cur || cur.runId !== p.runId) return prev
        return {
          ...prev,
          [noteId]: {
            ...cur,
            phase: 'review',
            results: p.results.map(r => ({ ...r, state: 'pending' as const })),
            // Iterations-Limit sichtbar machen: sonst liest sich der letzte Modelltext
            // („Ich erstelle jetzt…") wie ein laufender Prozess, obwohl der Lauf vorbei ist.
            finalText: p.ok
              ? [p.text || '', p.hitMaxIterations ? t('aiBar.agent.maxIterations') : ''].filter(Boolean).join('\n\n')
              : p.cancelled
                ? t('aiBar.agent.cancelled')
                : `${t('aiBar.agent.errorPrefix')}: ${p.error || '?'}`
          }
        }
      })
    })
    // C02: Main hat einen alten Lauf aus der Retention evakuiert — dessen Karten
    // sind nicht mehr übernehmbar; als abgelaufen markieren statt „Unbekannter Lauf".
    window.electronAPI.onNoteAgentRunEvicted(p => {
      const noteId = agentRunNoteRef.current.get(p.runId)
      if (!noteId) return
      agentRunNoteRef.current.delete(p.runId)
      setAgentRunByNote(prev => {
        const cur = prev[noteId]
        if (!cur || cur.runId !== p.runId) return prev
        return { ...prev, [noteId]: { ...cur, phase: 'review', results: [], finalText: t('aiBar.agent.evicted') } }
      })
    })
  }, [isSecondary, t])

  const agentRunStart = useCallback(async (instruction: string) => {
    if (!effectiveNoteId || !vaultPath || !agentTargetFolder) return
    setAgentAttachError(null)
    // Cloud-Routing nur mit eigenem 'note-agent'-Opt-in (Entscheidung 7): der
    // Cloud-Eintrag im Picker allein reicht nicht — der gewählte Provider muss
    // note-agent explizit freigeschaltet haben.
    let cloud: { model: string; provider: CloudProviderId } | null = null
    if (activeAiCloudRoute) {
      const agentRoute = agentRoutes.find(r => r.provider === activeAiCloudRoute.provider)
      if (!agentRoute) {
        setAgentAttachError(t('aiBar.agent.cloudNotEnabled'))
        return
      }
      cloud = { model: agentRoute.model, provider: agentRoute.provider }
    }
    const view = viewRef.current
    const noteContent = view ? view.state.doc.toString() : (selectedNote?.content || '')
    const model = aiModel || ollama.selectedModel
    const res = await window.electronAPI.noteAgentRun({
      vaultPath,
      noteId: effectiveNoteId,
      noteContent,
      instruction,
      model,
      attachmentIds: agentAttachments.map(a => a.id),
      targetFolderRel: agentTargetFolder,
      cloud
    })
    if (!res.success || !res.runId) {
      setAgentAttachError(res.error || 'Start fehlgeschlagen')
      return
    }
    agentRunNoteRef.current.set(res.runId, effectiveNoteId)
    setAgentRunByNote(prev => ({
      ...prev,
      [effectiveNoteId]: { runId: res.runId ?? null, phase: 'running', steps: [], results: [], finalText: '' }
    }))
  }, [effectiveNoteId, vaultPath, agentTargetFolder, activeAiCloudRoute, agentRoutes, ollama, aiModel, agentAttachments, selectedNote, t])

  const agentRunCancel = useCallback(() => {
    const run = effectiveNoteId ? agentRunByNote[effectiveNoteId] : undefined
    if (run?.runId) void window.electronAPI.noteAgentCancel(run.runId)
  }, [effectiveNoteId, agentRunByNote])

  const agentResultPatch = useCallback((noteId: string, resultId: string, patch: Partial<AgentUiResult>) => {
    setAgentRunByNote(prev => {
      const cur = prev[noteId]
      if (!cur) return prev
      return { ...prev, [noteId]: { ...cur, results: cur.results.map(r => (r.resultId === resultId ? { ...r, ...patch } : r)) } }
    })
  }, [])

  const agentResultAccept = useCallback(async (resultId: string) => {
    const noteId = effectiveNoteId
    const run = noteId ? agentRunByNote[noteId] : undefined
    if (!noteId || !run?.runId) return
    const res = await window.electronAPI.noteAgentAcceptResult(run.runId, resultId)
    if (res.success) agentResultPatch(noteId, resultId, { state: 'accepted', finalName: res.fileName, error: undefined })
    else agentResultPatch(noteId, resultId, { error: res.error })
  }, [effectiveNoteId, agentRunByNote, agentResultPatch])

  const agentResultDiscard = useCallback(async (resultId: string) => {
    const noteId = effectiveNoteId
    const run = noteId ? agentRunByNote[noteId] : undefined
    if (!noteId || !run?.runId) return
    const res = await window.electronAPI.noteAgentDiscardResult(run.runId, resultId)
    if (res.success) agentResultPatch(noteId, resultId, { state: 'discarded', error: undefined })
    else agentResultPatch(noteId, resultId, { error: res.error })
  }, [effectiveNoteId, agentRunByNote, agentResultPatch])

  // Mitlernen (Stufe 3): Merksatz in die Agent-Gedächtnis-Notiz (Skills/Agent-Gedächtnis.md).
  // Feedback (Erfolg + Fehler) rendert die AiActionBar direkt an der Merken-Zeile.
  const agentRemember = useCallback(async (text: string): Promise<{ success: boolean; relPath?: string; error?: string }> => {
    if (!vaultPath) return { success: false, error: 'Kein Vault geöffnet' }
    return window.electronAPI.noteAgentRemember(vaultPath, text)
  }, [vaultPath])

  const agentRunDismiss = useCallback(() => {
    if (!effectiveNoteId) return
    setAgentRunByNote(prev => {
      const next = { ...prev }
      delete next[effectiveNoteId]
      return next
    })
  }, [effectiveNoteId])

  // Entscheidung 12: Notizwechsel während 'running' bricht den Lauf ab —
  // Review-Karten bleiben dagegen ihrer Notiz zugeordnet.
  const prevAgentNoteRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevAgentNoteRef.current
    prevAgentNoteRef.current = effectiveNoteId ?? null
    if (isSecondary || !prev || prev === effectiveNoteId) return
    const run = agentRunByNote[prev]
    if (run?.phase === 'running' && run.runId) void window.electronAPI.noteAgentCancel(run.runId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveNoteId, isSecondary])

  // „Mit KI bearbeiten" (z.B. aus dem PDF-Viewer): sobald die Ziel-Notiz aktiv ist,
  // die Datei als Kontext anhängen und die Macher-Leiste öffnen.
  useEffect(() => {
    if (!pendingAgentContext || isSecondary || !effectiveNoteId) return
    if (pendingAgentContext.noteId !== effectiveNoteId) return
    const fileName = pendingAgentContext.relPath.split('/').pop()
    const alreadyAttached = (agentAttachmentsByNote[effectiveNoteId] || []).some(a => a.name === fileName)
    setPendingAgentContext(null)
    setAiBarOpen(true)
    if (!alreadyAttached) void agentAttachVaultFile(pendingAgentContext.relPath)
  }, [pendingAgentContext, setPendingAgentContext, isSecondary, effectiveNoteId, agentAttachmentsByNote, agentAttachVaultFile])

  const aiGenerate = useCallback(async (instruction: string, preset: string | null) => {
    const view = viewRef.current
    if (!view || !ollama.enabled) return
    const model = aiModel || ollama.selectedModel
    // Cloud-Routing (note-edit): aktiv, wenn der im Dropdown gewählte Provider
    // note-edit freigeschaltet hat.
    const noteEditRoute = activeAiCloudRoute
      ? (noteEditRoutes.find(r => r.provider === activeAiCloudRoute.provider) ?? null)
      : null
    // Cloud im Picker gewählt, aber note-edit dort nicht freigeschaltet (nur note-agent):
    // nicht stillschweigend lokal ausweichen — klare Meldung.
    if (activeAiCloudRoute && !noteEditRoute) {
      setAgentAttachError(t('aiBar.context.cloudNotEnabledEdit'))
      setAiPhase('idle')
      return
    }
    if (!model && !noteEditRoute) return

    // Scope: Auswahl, sonst der ganze Body (Frontmatter ausgeklammert).
    const sel = view.state.selection.main
    let from = sel.from
    let to = sel.to
    if (from === to) {
      const content = view.state.doc.toString()
      const fm = content.match(/^---\n[\s\S]*?\n---\n/)
      from = fm ? fm[0].length : 0
      to = view.state.doc.length
    }
    const oldText = view.state.doc.sliceString(from, to)
    if (!oldText.trim()) return

    let action: 'summarize' | 'improve' | 'custom' = 'custom'
    let customPrompt = instruction.trim()
    if (preset === 'rewrite') { action = 'improve'; customPrompt = instruction.trim() }
    else if (preset === 'shorten') { action = 'summarize'; customPrompt = '' }
    else if (preset === 'structure') { action = 'custom'; customPrompt = `Strukturiere den folgenden Text klarer (sinnvolle Überschriften/Listen, Inhalt und Sprache beibehalten). Gib NUR den überarbeiteten Markdown zurück, ohne Kommentar.${instruction ? '\nZusätzlich: ' + instruction : ''}` }
    else if (preset === 'tone') { action = 'custom'; customPrompt = `Überarbeite den Ton des folgenden Textes (klar, freundlich-professionell, Inhalt beibehalten). Gib NUR den überarbeiteten Markdown zurück, ohne Kommentar.${instruction ? '\nVorgabe: ' + instruction : ''}` }
    else { action = 'custom'; customPrompt = instruction.trim() }

    if (action === 'custom' && !customPrompt) return

    setAiPhase('generating')
    try {
      const req = {
        model,
        prompt: action === 'custom' ? customPrompt : '',
        action: action as 'translate' | 'summarize' | 'continue' | 'improve' | 'custom' | 'ocr-cleanup',
        originalText: oldText,
        customPrompt: action === 'custom' ? customPrompt : undefined,
        // Notiz-Agent Phase 1: Main-seitig registrierte Kontext-Dateien mitgeben.
        contextAttachmentIds: agentAttachments.length > 0 ? agentAttachments.map(a => a.id) : undefined
      }
      // Cloud-Routing (OpenRouter/LLMBase) für Inline-Notiz-KI — nur wenn 'note-edit' per zweitem Opt-in frei.
      const cloud = noteEditRoute ? { model: noteEditRoute.model, provider: noteEditRoute.provider } : null
      const response = cloud
        ? await window.electronAPI.ollamaGenerate({ ...req, cloud })
        : ollama.backend === 'lm-studio'
          ? await window.electronAPI.lmstudioGenerate({ ...req, port: ollama.lmStudioPort })
          : await window.electronAPI.ollamaGenerate(req)
      const result = response as AIResult
      if (!result.success || !result.result) {
        // Fehler sichtbar machen (z.B. fail-closed bei nicht lesbarer Kontext-Datei).
        if (result.error) setAgentAttachError(result.error)
        setAiPhase('idle')
        return
      }
      const newText = result.result.trim()
      const ops = diffLines(oldText, newText)
      setAiProposal({
        from,
        to,
        newText,
        ops,
        action: aiActionLabel(preset, instruction),
        // result.model trägt bei Cloud-Routing `openrouter/<modell>` — sonst das lokale Modell.
        model: result.model || model,
        date: (result.timestamp || '').slice(0, 10)
      })
      setAiPhase('review')
    } catch (e) {
      console.error('[AI-Bar] Generierung fehlgeschlagen:', e)
      setAiPhase('idle')
    }
  }, [ollama, aiModel, activeAiCloudRoute, noteEditRoutes, agentAttachments, t])

  const aiAcceptProposal = useCallback(() => {
    const view = viewRef.current
    const p = aiProposal
    if (!view || !p) return
    const content = view.state.doc.toString()
    // 1. Scope ersetzen, 2. durable Provenienz (Modell/Datum) ins Frontmatter.
    const afterScope = content.slice(0, p.from) + p.newText + content.slice(p.to)
    const finalContent = setAiProvenanceInContent(afterScope, p.model, p.date || new Date().toISOString().slice(0, 10))
    // Frontmatter wird oben eingefügt → Scope verschiebt sich um diesen Delta.
    const fmDelta = finalContent.length - afterScope.length
    const newFrom = p.from + fmDelta
    const newTo = newFrom + p.newText.length
    view.dispatch({
      changes: { from: 0, to: content.length, insert: finalContent },
      effects: setCorrectionHighlights.of([{ from: newFrom, to: newTo }]),
      scrollIntoView: false
    })
    // Lesen-Modus: Vorschau neu rendern.
    if (viewMode === 'preview') {
      isPreviewDomEditingRef.current = false
      setPreviewContent(finalContent)
    }
    setTimeout(() => viewRef.current?.dispatch({ effects: setCorrectionHighlights.of([]) }), 4000)
    setAiProposal(null)
    setAiPhase('idle')
    setAiBarOpen(false)
  }, [aiProposal, viewMode])

  const aiDiscardProposal = useCallback(() => {
    setAiProposal(null)
    setAiPhase('idle')
  }, [])

  const aiSuggestTags = useCallback(async () => {
    const view = viewRef.current
    if (!view || !ollama.enabled || !ollama.selectedModel) return
    const content = view.state.doc.toString()
    const fm = content.match(/^---\n[\s\S]*?\n---\n/)
    const body = (fm ? content.slice(fm[0].length) : content).slice(0, 6000)
    if (!body.trim()) return
    const existing = new Set(getFrontmatterTags(content).map(t => t.toLowerCase()))
    setAiTagsLoading(true)
    try {
      const req = {
        model: ollama.selectedModel,
        prompt: 'Schlage 3–7 prägnante Themen-Tags für den folgenden Text vor. Nur die Tags, kommagetrennt, kleingeschrieben, ohne # und ohne Erklärung.',
        action: 'custom' as const,
        originalText: body,
        customPrompt: 'Schlage 3–7 prägnante Themen-Tags für den folgenden Text vor. Nur die Tags, kommagetrennt, kleingeschrieben, ohne # und ohne Erklärung.'
      }
      const response = ollama.backend === 'lm-studio'
        ? await window.electronAPI.lmstudioGenerate({ ...req, port: ollama.lmStudioPort })
        : await window.electronAPI.ollamaGenerate(req)
      const result = response as AIResult
      if (result.success && result.result) {
        const tags = result.result
          .split(/[,\n]+/)
          .map(s => s.trim().replace(/^[#\-*\d.\s]+/, '').replace(/\s+/g, '-').toLowerCase())
          .filter(t => t.length >= 2 && t.length <= 40 && !existing.has(t))
        setAiTagSuggestions(Array.from(new Set(tags)).slice(0, 7))
      }
    } catch (e) {
      console.error('[AI-Bar] Tag-Vorschläge fehlgeschlagen:', e)
    } finally {
      setAiTagsLoading(false)
    }
  }, [ollama])

  const aiAcceptTag = useCallback((tag: string) => {
    const view = viewRef.current
    if (!view) return
    const content = view.state.doc.toString()
    const next = addTagToFrontmatter(content, tag)
    if (next !== content) {
      view.dispatch({ changes: { from: 0, to: content.length, insert: next }, scrollIntoView: false })
      if (viewMode === 'preview') {
        isPreviewDomEditingRef.current = false
        setPreviewContent(next)
      }
    }
    setAiTagSuggestions(prev => prev.filter(t => t !== tag))
  }, [viewMode])

  const aiDismissTag = useCallback((tag: string) => {
    setAiTagSuggestions(prev => prev.filter(t => t !== tag))
  }, [])

  // Modell-Liste laden, sobald die Leiste geöffnet wird (für den Modell-Picker).
  useEffect(() => {
    if (!aiBarOpen || aiModels.length > 0 || !ollama.enabled) return
    let cancelled = false
    ;(async () => {
      try {
        const list = ollama.backend === 'lm-studio'
          ? await window.electronAPI.lmstudioModels(ollama.lmStudioPort)
          : await window.electronAPI.ollamaModels()
        if (!cancelled && Array.isArray(list)) setAiModels(list)
      } catch (e) {
        console.error('[AI-Bar] Modell-Liste laden fehlgeschlagen:', e)
      }
    })()
    return () => { cancelled = true }
  }, [aiBarOpen, aiModels.length, ollama.enabled, ollama.backend, ollama.lmStudioPort])

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
    if (!editorRef.current || !effectiveNoteId) return

    // Läufe dieses Effects sind abbrechbar: Der Guard über currentNoteIdRef fängt nur den
    // NOTIZWECHSEL während des async Loads ab — nicht den Doppel-Lauf für DIESELBE Notiz
    // (StrictMode-Remount, schnelle Re-Selektion X→Y→X). Ohne cancelled-Flag hängen dann
    // ZWEI EditorViews gestapelt im DOM: oben die verwaiste (stale, kein viewRef), unten die
    // echte — sichtbar erst beim Wechsel Lesen→Schreiben, weil preview den Container versteckt.
    let cancelled = false

    // Speichere die aktuelle Note ID im ref für async Prüfung
    currentNoteIdRef.current = effectiveNoteId

    // Clear image cache when note changes
    loadedImagesRef.current.clear()

    // Finde die Notiz direkt im useEffect (nicht die gecachte selectedNote Variable)
    const currentNote = notes.find(n => n.id === effectiveNoteId)
    if (!currentNote) return

    console.log('[MarkdownEditor] Loading note:', effectiveNoteId, 'path:', currentNote.path)

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

    // DOM-Element explizit leeren um sicherzustellen, dass kein alter Content bleibt
    if (editorRef.current) {
      editorRef.current.innerHTML = ''
    }

    // Content von Datei laden (nicht aus Store!)
    const loadAndCreateEditor = async () => {
      // Speichere die ID zum Zeitpunkt des Starts
      const noteIdAtStart = effectiveNoteId
      const notePath = currentNote.path

      let content = ''

      try {
        const fullPath = `${vaultPath}/${notePath}`
        console.log('[MarkdownEditor] Reading file:', fullPath)
        content = await window.electronAPI.readFile(fullPath)
        lastSavedContentRef.current = content
      } catch (error) {
        console.error('Fehler beim Laden:', error)
        content = currentNote.content
        lastSavedContentRef.current = content
      }

      // Abbrechen wenn dieser Lauf abgebrochen wurde oder sich die Notiz geändert hat (ref!)
      if (cancelled || currentNoteIdRef.current !== noteIdAtStart) {
        console.log('[MarkdownEditor] Run cancelled or note changed during load, aborting. Was:', noteIdAtStart, 'Now:', currentNoteIdRef.current)
        return
      }

      console.log('[MarkdownEditor] Setting content for:', noteIdAtStart, 'length:', content.length)

      // Notizwechsel: das "wird gerade im Lesen-Modus editiert"-Guard IMMER lösen, sonst
      // bleibt es von einem vorherigen Commit (refreshPreview=false) auf true hängen und
      // der innerHTML-Effekt rendert den neuen Body nicht — Titel neu, Body alt (v0.7.x-Bug).
      isPreviewDomEditingRef.current = false
      isPreviewDomDirtyRef.current = false
      if (previewEditTimeoutRef.current) {
        clearTimeout(previewEditTimeoutRef.current)
        previewEditTimeoutRef.current = null
      }

      // Set preview content and apply configured default view mode
      setPreviewContent(content)
      // Leere bzw. frisch erstellte Notizen (nur "# Titel") direkt im Schreiben-Modus
      // öffnen: im Lesen-Modus würde getipptes Markdown vom Turndown-Roundtrip
      // escaped (\## …) und ist damit dauerhaft kaputt — Erstkontakt-Falle.
      const isEffectivelyEmpty = content.replace(/^#\s.*$/m, '').trim() === ''
      setViewMode(editorDefaultView === 'preview' && isEffectivelyEmpty ? 'live-preview' : editorDefaultView)
      setContentVersion(v => v + 1)

      if (!editorRef.current) return

      const state = EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          history(),
          markdown({ codeLanguages: markdownCodeLanguages }),
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
          imageHandlingExtension({
            vaultPath: vaultPath || '',
            getImagesFolder: () => useUIStore.getState().imagesFolder || '.attachments'
          }),
          // Live Preview extension compartment (starts empty, can be reconfigured)
          livePreviewCompartment.of([]),
          // Dataview extension for live query rendering
          dataviewCompartment.of(dataviewExtension()),
          // LanguageTool extension for grammar/spell checking
          languageToolExtension({ enabled: languageTool.enabled }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newContent = update.state.doc.toString()
              const contentWithWorkTime = updateWorkTimeFields(newContent)
              if (contentWithWorkTime !== newContent) {
                update.view.dispatch({
                  changes: {
                    from: 0,
                    to: newContent.length,
                    insert: contentWithWorkTime
                  }
                })
                return
              }

              handleDocChange(newContent)
              if (!isPreviewDomEditingRef.current) {
                setPreviewContent(newContent)
              }
            }

            // Slash Command & Wikilink Autocomplete Trigger-Erkennung
            if (update.docChanged || update.selectionSet) {
              const cursor = update.state.selection.main.head
              const line = update.state.doc.lineAt(cursor)
              const textBefore = line.text.slice(0, cursor - line.from)

              // Slash Command Detection (VOR Wikilink, da / am Zeilenanfang oder nach Leerzeichen)
              const slashMatch = textBefore.match(/(?:^|\s)\/([\w-]*)$/)
              if (slashMatch) {
                const slashPos = cursor - slashMatch[0].length + (slashMatch[0].startsWith('/') ? 0 : 1)
                setSlashMenu({
                  isOpen: true,
                  triggerPos: slashPos,
                  query: slashMatch[1]
                })
                // Close wikilink autocomplete if open. Funktionales Update zwingend:
                // `autocomplete` im Listener-Closure ist der Stand bei Editor-Erstellung
                // (immer null) — ein direkter Read würde das Schließen dauerhaft skippen.
                setAutocomplete(prev => (prev ? null : prev))
                return
              }

              // Close slash menu if no match
              setSlashMenu(null)

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
                // Einzelnes # am Zeilenanfang ist meist eine werdende Überschrift —
                // Popup erst öffnen, sobald ein Tag-Zeichen folgt (#tag geht weiterhin,
                // "## " und "# " öffnen nie und Enter tippt ungestört weiter).
                const couldBeHeading = lineText === '#'

                if (!isHeading && !couldBeHeading) {
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

              // Schließen wenn kein Match. Funktionales Update zwingend (stale closure,
              // siehe oben) — sonst bleibt das Popup offen und fängt Enter/Tab ab.
              setAutocomplete(prev => (prev ? null : prev))
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

      // Nochmalige Prüfung direkt vor Editor-Erstellung
      if (cancelled || currentNoteIdRef.current !== noteIdAtStart || !editorRef.current) {
        console.log('[MarkdownEditor] Run cancelled or note changed before editor creation, aborting. Was:', noteIdAtStart, 'Now:', currentNoteIdRef.current)
        return
      }

      // Defensiv: falls doch schon eine View existiert (Doppel-Lauf-Restrisiko), erst aufräumen —
      // new EditorView({parent}) hängt sonst kommentarlos eine ZWEITE View in den Container.
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
      editorRef.current.innerHTML = ''

      const view = new EditorView({
        state,
        parent: editorRef.current
      })

      viewRef.current = view
      console.log('[MarkdownEditor] Editor created successfully for:', noteIdAtStart)

      // Dispatch current notes and viewMode to the dataview extension
      if (notes.length > 0) {
        console.log('[MarkdownEditor] Editor created, dispatching', notes.length, 'notes, viewMode:', viewMode)
        view.dispatch({
          effects: [
            setDataviewNotes.of(notes),
            setDataviewLanguage.of(language),
            setDataviewViewMode.of(viewMode)
          ]
        })
      }
    }

    loadAndCreateEditor()

    return () => {
      // In-flight-Load dieses Laufs verwerfen + View zerstören: verhindert die verwaiste
      // Zweit-View beim Doppel-Lauf (s.o.). viewRef auf null setzen, damit der Unmount-
      // Cleanup unten nicht doppelt destroy() ruft.
      cancelled = true
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
      if (editorRef.current) {
        editorRef.current.innerHTML = ''
      }
    }
  }, [effectiveNoteId]) // Bei Notizwechsel neu erstellen (effectiveNoteId statt selectedNoteId für Text-Split Support)

  // Externe Updates (z.B. durch Graph-Verbindungen) im Editor anzeigen
  useEffect(() => {
    if (!viewRef.current || !selectedNote || isExternalUpdateRef.current) return

    const currentEditorContent = viewRef.current.state.doc.toString()

    // Editor ist Autorität, solange lokale Änderungen nicht persistiert sind
    // (Debounce-Save ausstehend oder Doc dem letzten Save voraus). Sonst
    // überschreibt der Save→Watcher→Store-Roundtrip beim schnellen Tippen das
    // Doc mit veraltetem Disk-Stand: frische Zeichen verschwinden und der
    // Cursor springt ans Dokumentende. Die isExternalUpdateRef-Schutzfrist
    // (100 ms) ist kürzer als die Watcher-Latenz und reicht allein nicht.
    if (saveTimeoutRef.current || currentEditorContent !== lastSavedContentRef.current) return

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

          if (!viewRef.current) return

          // Re-Check nach dem async read: während readFile lief, kann der User
          // weitergetippt haben — dann gewinnt der Editor (siehe Guard oben).
          const nowContent = viewRef.current.state.doc.toString()
          if (saveTimeoutRef.current || nowContent !== lastSavedContentRef.current) return

          if (fileContent !== nowContent) {
            lastSavedContentRef.current = fileContent
            setPreviewContent(fileContent)
            viewRef.current.dispatch({
              changes: {
                from: 0,
                to: nowContent.length,
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
      if (previewEditTimeoutRef.current) {
        clearTimeout(previewEditTimeoutRef.current)
      }
      if (viewRef.current) {
        viewRef.current.destroy()
      }
    }
  }, [])

  // Live writing mode: Cmd/Ctrl-click opens wikilinks, normal click keeps editing.
  useEffect(() => {
    const handleLivePreviewWikilinkOpen = (e: CustomEvent<{ target: string; fragment: string }>) => {
      const linkText = e.detail.target
      const fragment = e.detail.fragment || ''
      if (!linkText) return

      const linkedNote = notes.find(n => {
        const titleLower = n.title.toLowerCase()
        const linkLower = linkText.toLowerCase()
        const fileNameWithoutExt = n.path.split('/').pop()?.replace('.md', '').toLowerCase() || ''
        return titleLower === linkLower || fileNameWithoutExt === linkLower
      })
      if (!linkedNote) {
        // Kein Notiz-Treffer: Plugin-Datei (z.B. [[skizze.excalidraw]]) im Plugin-Editor öffnen
        const pluginFile = resolvePluginFileLink(linkText, fileTree)
        if (pluginFile) {
          useTabStore.getState().openPluginEditorTab(
            pluginFile.pluginEditor.pluginId,
            pluginFile.path,
            pluginFile.pluginEditor.editorId,
            pluginFile.name
          )
        }
        return
      }

      if (isSecondary) {
        selectSecondaryNote(linkedNote.id)
      } else {
        selectNote(linkedNote.id)
      }

      if (!fragment || !vaultPath) return

      setTimeout(async () => {
        try {
          const fullPath = `${vaultPath}/${linkedNote.path}`
          const content = await window.electronAPI.readFile(fullPath)
          const lines = content.split('\n')
          let targetLine = -1

          if (fragment.startsWith('^')) {
            const blockId = fragment.substring(1)
            targetLine = lines.findIndex(line =>
              line.match(new RegExp(`\\^${blockId}\\s*$`))
            )
          } else {
            targetLine = lines.findIndex(line => {
              const match = line.match(/^#{1,6}\s+(.+)$/)
              return match && match[1].trim().toLowerCase() === fragment.toLowerCase()
            })
          }

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

    window.addEventListener('live-preview-wikilink-open', handleLivePreviewWikilinkOpen as EventListener)
    return () => {
      window.removeEventListener('live-preview-wikilink-open', handleLivePreviewWikilinkOpen as EventListener)
    }
  }, [notes, fileTree, isSecondary, selectNote, selectSecondaryNote, vaultPath])

  const updatePreviewToolbarPosition = useCallback(() => {
    const root = editablePreviewRef.current
    if (!root) return

    // Solange der User die Link-URL eingibt, Toolbar an Ort und Stelle lassen.
    if (previewLinkInput !== null) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !root.contains(selection.anchorNode)) {
      setPreviewToolbar(null)
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) {
      setPreviewToolbar(null)
      return
    }

    setPreviewToolbar({
      x: Math.max(12, Math.min(window.innerWidth - 260, rect.left + rect.width / 2 - 120)),
      y: Math.max(56, rect.top - 42)
    })
  }, [previewLinkInput])

  const commitEditablePreview = useCallback((refreshPreview: boolean) => {
    const root = editablePreviewRef.current
    const view = viewRef.current
    if (!root || !view) return
    if (!isPreviewDomDirtyRef.current) {
      if (refreshPreview) isPreviewDomEditingRef.current = false
      return
    }

    const currentContent = view.state.doc.toString()
    const turndowned = editablePreviewHtmlToMarkdown(root, currentContent)
    // Arbeitszeit auch im WYSIWYG-/Lesen-Pfad berechnen — sonst überschreibt dieser
    // turndown-Roundtrip einen zuvor (im Editor) berechneten Wert wieder mit leer.
    const nextContent = updateWorkTimeFields(turndowned)
    if (nextContent === currentContent) {
      isPreviewDomDirtyRef.current = false
      if (refreshPreview) isPreviewDomEditingRef.current = false
      return
    }

    // Hat die Berechnung den Inhalt verändert, MUSS die Vorschau neu rendern: damit der
    // berechnete Wert sichtbar wird und der nächste Roundtrip ihn nicht erneut löscht.
    const mustRefresh = refreshPreview || nextContent !== turndowned

    isPreviewDomEditingRef.current = true
    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: nextContent }
    })
    saveContent(nextContent)
    isPreviewDomDirtyRef.current = false

    if (mustRefresh) {
      isPreviewDomEditingRef.current = false
      setPreviewContent(nextContent)
    }
  }, [saveContent])

  // One-Klick-Auto-Korrektur wie im Mail-Compose: prüft den Text per LanguageTool und
  // wendet die beste Korrektur auf ALLE Treffer an (back-to-front, disjunkt). Arbeitet auf
  // dem Markdown-Dokument → funktioniert in allen Modi inkl. Lesen (Vorschau rendert neu).
  const autoCorrectLanguageTool = useCallback(async () => {
    const view = viewRef.current
    if (!view || !languageTool.enabled || ltAutoCorrecting) return

    // Im Lesen-Modus offene contentEditable-Änderungen zuerst ins Dokument schreiben.
    if (viewMode === 'preview') {
      commitEditablePreview(false)
    }

    const content = view.state.doc.toString()
    if (!content.trim()) return

    // Frontmatter ausklammern, Offsets später zurückrechnen.
    let textToCheck = content
    let frontmatterOffset = 0
    const yamlMatch = content.match(/^---\n[\s\S]*?\n---\n/)
    if (yamlMatch) {
      frontmatterOffset = yamlMatch[0].length
      textToCheck = content.substring(frontmatterOffset)
    }

    if (ltCorrectedTimeoutRef.current) {
      clearTimeout(ltCorrectedTimeoutRef.current)
      ltCorrectedTimeoutRef.current = null
    }
    setLtAutoCorrecting(true)
    setLtCorrectedCount(0)
    try {
      const mode = languageTool.mode || 'local'
      const result = await window.electronAPI.languagetoolAnalyze(
        textToCheck,
        languageTool.language === 'auto' ? undefined : languageTool.language,
        mode,
        mode === 'local' ? languageTool.url : undefined,
        mode === 'api' ? languageTool.apiUsername : undefined,
        mode === 'api' ? languageTool.apiKey : undefined
      )
      if (!result.success || !result.matches || result.matches.length === 0) {
        return
      }

      const ignoredRules = languageTool.ignoredRules || []
      const candidates = result.matches
        .map(m => ({ ...m, offset: m.offset + frontmatterOffset }))
        .map(m => {
          const matchText = content.substring(m.offset, m.offset + m.length)
          const meaningful = (m.replacements || []).filter(r => r.value.trim() !== matchText.trim())
          return { match: m, matchText, replacement: meaningful[0]?.value }
        })
        .filter(c => c.replacement !== undefined && !ignoredRules.some(r => r.ruleId === c.match.rule.id && r.text === c.matchText))
        .sort((a, b) => a.match.offset - b.match.offset)

      // Überlappende Treffer entfernen (CM-Changes müssen disjunkt sein) — frühesten behalten.
      const picks: typeof candidates = []
      let lastEnd = -1
      for (const c of candidates) {
        if (c.match.offset >= lastEnd) {
          picks.push(c)
          lastEnd = c.match.offset + c.match.length
        }
      }
      if (picks.length === 0) return

      const changes = picks.map(c => ({
        from: c.match.offset,
        to: c.match.offset + c.match.length,
        insert: c.replacement as string
      }))
      // Highlight-Ranges in Koordinaten NACH den Changes (kumulativer Versatz).
      let shift = 0
      const highlights = picks.map(c => {
        const insert = c.replacement as string
        const from = c.match.offset + shift
        const to = from + insert.length
        shift += insert.length - c.match.length
        return { from, to }
      })

      // Alte Unterstreichungen leeren (Text ändert sich) + Changes + grünes Aufblitzen.
      view.dispatch({
        changes,
        effects: [setLanguageToolMatches.of([]), setCorrectionHighlights.of(highlights)],
        scrollIntoView: false
      })
      setLtMatches([])

      // Lesen-Modus: Vorschau explizit neu rendern (Guard isPreviewDomEditingRef lösen).
      if (viewMode === 'preview') {
        isPreviewDomEditingRef.current = false
        setPreviewContent(view.state.doc.toString())
      }

      setLtCorrectedCount(picks.length)
      ltCorrectedTimeoutRef.current = setTimeout(() => {
        setLtCorrectedCount(0)
        viewRef.current?.dispatch({ effects: setCorrectionHighlights.of([]) })
        ltCorrectedTimeoutRef.current = null
      }, 4300)
    } catch (err) {
      console.error('[LanguageTool] Auto-Korrektur fehlgeschlagen:', err)
    } finally {
      setLtAutoCorrecting(false)
    }
  }, [languageTool, viewMode, ltAutoCorrecting, commitEditablePreview])

  const rememberPreviewSelection = useCallback(() => {
    const root = editablePreviewRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (root.contains(range.commonAncestorContainer)) {
      savedPreviewRangeRef.current = range.cloneRange()
    }
  }, [])

  const insertTextInPreviewAtSelection = useCallback((text: string): boolean => {
    const root = editablePreviewRef.current
    if (viewMode !== 'preview' || !root || !text) return false

    const selection = window.getSelection()
    const activeRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    const range = activeRange && root.contains(activeRange.commonAncestorContainer)
      ? activeRange.cloneRange()
      : savedPreviewRangeRef.current

    if (!range || !root.contains(range.commonAncestorContainer)) return false

    root.focus()
    selection?.removeAllRanges()
    selection?.addRange(range)

    if (document.queryCommandSupported?.('insertText')) {
      document.execCommand('insertText', false, text)
    } else {
      range.deleteContents()
      const textNode = document.createTextNode(text)
      range.insertNode(textNode)
      range.setStartAfter(textNode)
      range.setEndAfter(textNode)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }

    rememberPreviewSelection()
    isPreviewDomDirtyRef.current = true
    commitEditablePreview(true)
    return true
  }, [commitEditablePreview, rememberPreviewSelection, viewMode])

  // Listen for insert-text-at-cursor events (e.g. from Zotero citations)
  useEffect(() => {
    const handleInsertText = (e: CustomEvent<string>) => {
      const text = e.detail
      if (!viewRef.current || !text) return

      if (insertTextInPreviewAtSelection(text)) return

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
  }, [insertTextInPreviewAtSelection])

  // Listen for insert-footnote events (from Zotero citations as footnotes)
  useEffect(() => {
    const handleInsertFootnote = (e: CustomEvent<{ citation: string; citekey: string }>) => {
      const { citation } = e.detail
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

      if (insertTextInPreviewAtSelection(footnoteRef)) {
        const updatedContent = view.state.doc.toString()
        view.dispatch({
          changes: { from: updatedContent.length, to: updatedContent.length, insert: footnoteDefinition }
        })
        const finalContent = view.state.doc.toString()
        setPreviewContent(finalContent)
        saveContent(finalContent)
        return
      }

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
  }, [insertTextInPreviewAtSelection, saveContent])

  const scheduleEditablePreviewCommit = useCallback(() => {
    isPreviewDomEditingRef.current = true
    isPreviewDomDirtyRef.current = true
    updatePreviewToolbarPosition()
    if (previewEditTimeoutRef.current) clearTimeout(previewEditTimeoutRef.current)
    previewEditTimeoutRef.current = setTimeout(() => {
      commitEditablePreview(false)
    }, 1200)
  }, [commitEditablePreview, updatePreviewToolbarPosition])

  // Lesen-Modus Drag&Drop: document-level capture-Listener.
  // Wichtig in Electron: ohne preventDefault auf dragover **am Window** öffnet macOS die
  // gedroppte Datei via Quick Look / Vorschau — der Drop kommt nie im JS an. Daher prevent
  // wir dragover GLOBAL wenn Files dabei sind, sobald wir im Preview-Modus sind. Den Drop
  // selbst behandeln wir nur, wenn er innerhalb des Editable landet — ansonsten reicht der
  // dragover-Prevent, damit macOS nichts macht und der Drop verpufft.
  useEffect(() => {
    if (viewMode !== 'preview') return
    const editable = editablePreviewRef.current
    if (!editable) return

    const isInsidePreview = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false
      return editable.contains(target)
    }

    const onDragOver = (e: DragEvent) => {
      const dt = e.dataTransfer
      if (!dt) return
      const hasFiles = dt.types.includes('Files') || dt.types.includes('text/uri-list')
      if (!hasFiles) return
      // Hart blocken — Default + andere capture-listener (z.B. CodeMirro im hidden Editor).
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      dt.dropEffect = 'copy'
    }

    const onDrop = async (e: DragEvent) => {
      const dt = e.dataTransfer
      if (!dt) return
      const hasFiles = dt.types.includes('Files') || dt.types.includes('text/uri-list')
      if (!hasFiles) return
      // Hart blocken — verhindert macOS Quick Look + andere Listener.
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (!isInsidePreview(e.target)) return
      if (!vaultPath) return

      type DocCaret = Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
      const dropRange: Range | null = (document as DocCaret).caretRangeFromPoint?.(e.clientX, e.clientY) ?? null
      const imagesFolder = useUIStore.getState().imagesFolder || '.attachments'

      // Strategie 1: file://-Pfade aus dataTransfer (klappt bei manchen Drag-Quellen,
      // bei Finder-Drops in Electron 40 oft leer).
      const paths = getFilePathsFromDataTransfer(dt)
      const directImgPath = paths.find(p => isImageFile(p))

      let relPath: string | null = null
      let fileName: string | null = null

      try {
        if (directImgPath) {
          const result = await window.electronAPI.copyImageToAttachments(vaultPath, directImgPath, imagesFolder)
          if (!result.success) {
            console.error('[PreviewDrop] Copy by path failed:', result.error)
            return
          }
          relPath = result.relativePath || null
          fileName = result.fileName || null
        } else {
          // Strategie 2: File-Objekt aus dataTransfer.files → Base64 → main writes it.
          // Das ist der Pfad, der auch im CodeMirror-Modus für Finder-Drops greift.
          const imageFile = await extractImageFromDataTransfer(dt)
          if (!imageFile) {
            console.log('[PreviewDrop] No image file in dataTransfer')
            return
          }
          const base64 = await fileToBase64(imageFile)
          const result = await window.electronAPI.writeImageFromBase64(vaultPath, base64, imageFile.name || 'dropped-image', imagesFolder)
          if (!result.success) {
            console.error('[PreviewDrop] Write base64 failed:', result.error)
            return
          }
          relPath = result.relativePath || null
          fileName = result.fileName || null
        }

        if (!relPath) return

        // Sofortige Bildanzeige: Bild als Data-URL laden und src setzen.
        // Ohne src würde das <img> erst nach Re-Render aus Markdown sichtbar werden.
        // Außerdem den Cache prefillen, damit der reguläre Image-Loader nach dem Commit
        // den Wert nicht erneut von Disk lesen muss.
        let dataUrl = ''
        try {
          const r = await window.electronAPI.readImageAsDataUrl(`${vaultPath}/${relPath}`)
          if (r.success && r.dataUrl) {
            dataUrl = r.dataUrl
            loadedImagesRef.current.set(relPath, r.dataUrl)
          }
        } catch (loadErr) {
          console.warn('[PreviewDrop] Sofort-Load fehlgeschlagen, src bleibt leer:', loadErr)
        }

        const img = document.createElement('img')
        img.setAttribute('class', 'md-image')
        img.setAttribute('data-src', relPath)
        img.setAttribute('alt', fileName || '')
        if (dataUrl) img.setAttribute('src', dataUrl)

        // markdown-it im Lesen-Modus parst `Text![[file]]` NICHT als Image-Wikilink —
        // das `!` muss durch Whitespace vom vorigen Text getrennt sein. Daher Bracketing
        // mit Leerzeichen vor und nach dem Bild, falls nicht schon Whitespace da ist.
        const needsLeadingSpace = (() => {
          if (!dropRange) return false
          const node = dropRange.startContainer
          if (node.nodeType !== Node.TEXT_NODE) return false
          const offset = dropRange.startOffset
          if (offset === 0) return false
          const prev = (node as Text).data[offset - 1]
          return !!prev && !/\s/.test(prev)
        })()
        const needsTrailingSpace = (() => {
          if (!dropRange) return false
          const node = dropRange.startContainer
          if (node.nodeType !== Node.TEXT_NODE) return false
          const offset = dropRange.startOffset
          const text = (node as Text).data
          if (offset >= text.length) return false
          const next = text[offset]
          return !!next && !/\s/.test(next)
        })()

        if (dropRange && editable.contains(dropRange.startContainer)) {
          const fragment = document.createDocumentFragment()
          if (needsLeadingSpace) fragment.appendChild(document.createTextNode(' '))
          fragment.appendChild(img)
          if (needsTrailingSpace) fragment.appendChild(document.createTextNode(' '))
          dropRange.insertNode(fragment)
          const sel = window.getSelection()
          if (sel) {
            const after = document.createRange()
            after.setStartAfter(img)
            after.collapse(true)
            sel.removeAllRanges()
            sel.addRange(after)
          }
        } else {
          // Fallback: ans Ende; Block-Image braucht Leerzeile davor
          editable.appendChild(document.createTextNode(' '))
          editable.appendChild(img)
        }

        // Sofort committen statt 1.2s zu warten — sonst sieht der User das Bild nicht
        // im Markdown-Source und ein anschließender Modus-Wechsel würde es verlieren.
        isPreviewDomDirtyRef.current = true
        commitEditablePreview(true)
      } catch (err) {
        console.error('[PreviewDrop] Error:', err)
      }
    }

    document.addEventListener('dragover', onDragOver, { capture: true })
    document.addEventListener('drop', onDrop, { capture: true })
    return () => {
      document.removeEventListener('dragover', onDragOver, { capture: true } as EventListenerOptions)
      document.removeEventListener('drop', onDrop, { capture: true } as EventListenerOptions)
    }
  }, [viewMode, vaultPath, commitEditablePreview])

  const applyPreviewCommand = useCallback((command: string, value?: string) => {
    editablePreviewRef.current?.focus()
    document.execCommand(command, false, value)
    scheduleEditablePreviewCommit()
    updatePreviewToolbarPosition()
  }, [scheduleEditablePreviewCommit, updatePreviewToolbarPosition])

  const openPreviewLinkInput = useCallback((kind: 'url' | 'wiki') => {
    // Range jetzt speichern — sobald das Input fokussiert ist, geht die Selection
    // im editable verloren und das spätere Einfügen hätte kein Ziel mehr.
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    savedPreviewRangeRef.current = sel.getRangeAt(0).cloneRange()
    setPreviewLinkInput({ kind, value: '' })
    setPreviewWikilinkIndex(0)
  }, [])

  // Wikilink-Vorschläge analog zum CodeMirror-Autocomplete: Filter über notes,
  // dazu ggf. eine "Neue Notiz erstellen"-Option, falls der Query keinen exakten
  // Treffer hat. Nur aktiv wenn das Wikilink-Input offen ist.
  const previewWikilinkSuggestions = useMemo(() => {
    if (previewLinkInput?.kind !== 'wiki') return [] as Array<{ id: string; label: string; sublabel: string; value: string; isCreate: boolean }>
    const q = previewLinkInput.value.toLowerCase().trim()
    const matching = notes
      .filter(n => {
        if (!q) return true
        return n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
      })
      .slice(0, 8)
      .map(n => ({ id: n.id, label: n.title, sublabel: n.path, value: n.title, isCreate: false }))

    const exactMatch = q.length > 0 && notes.some(n => {
      const titleLower = n.title.toLowerCase()
      const fileLower = n.path.split('/').pop()?.replace('.md', '').toLowerCase() || ''
      return titleLower === q || fileLower === q
    })

    if (q && !exactMatch) {
      matching.unshift({
        id: '__create__',
        label: previewLinkInput.value.trim(),
        sublabel: 'Neue Notiz erstellen',
        value: previewLinkInput.value.trim(),
        isCreate: true
      })
    }
    return matching
  }, [previewLinkInput, notes])

  const insertPreviewWikilink = useCallback((target: string, displayFromRange: string) => {
    const safeTarget = target.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const display = displayFromRange.trim() || target
    const safeDisplay = display.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    document.execCommand('insertHTML', false,
      `<a href="#" class="wikilink" data-link="${safeTarget}" data-fragment="">${safeDisplay}</a>`)
  }, [])

  const confirmPreviewLink = useCallback((overrideValue?: string, overrideIsCreate?: boolean) => {
    const range = savedPreviewRangeRef.current
    const state = previewLinkInput
    if (!state) return
    const value = (overrideValue ?? state.value).trim()
    const isCreate = overrideIsCreate ?? false

    setPreviewLinkInput(null)
    savedPreviewRangeRef.current = null
    if (!range || !value) return

    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    editablePreviewRef.current?.focus()
    const rangeText = range.toString()

    if (state.kind === 'url') {
      document.execCommand('createLink', false, value)
    } else {
      insertPreviewWikilink(value, rangeText)

      // Wenn eine neue Notiz angelegt werden soll: physisch im Vault erstellen,
      // analog zum bestehenden CodeMirror-Autocomplete-Flow.
      if (isCreate && vaultPath) {
        ;(async () => {
          try {
            const currentFolder = selectedNote?.path
              ? selectedNote.path.substring(0, selectedNote.path.lastIndexOf('/'))
              : ''
            const fileName = value.endsWith('.md') ? value : `${value}.md`
            const relativePath = currentFolder ? `${currentFolder}/${fileName}` : fileName
            const fullPath = `${vaultPath}/${relativePath}`
            const initialContent = `# ${value}\n\n`
            await window.electronAPI.writeFile(fullPath, initialContent)
            const newNote = await createNoteFromFile(fullPath, relativePath, initialContent)
            addNote(newNote)
            const tree = await window.electronAPI.readDirectory(vaultPath)
            setFileTree(tree)
          } catch (error) {
            console.error('Fehler beim Erstellen der neuen Notiz:', error)
          }
        })()
      }
    }
    scheduleEditablePreviewCommit()
  }, [previewLinkInput, scheduleEditablePreviewCommit, insertPreviewWikilink, vaultPath, selectedNote, addNote, setFileTree])

  const cancelPreviewLink = useCallback(() => {
    setPreviewLinkInput(null)
    savedPreviewRangeRef.current = null
  }, [])

  // Beim Tippen den Auswahl-Index zurücksetzen, damit immer das oberste Item highlighted ist.
  useEffect(() => {
    setPreviewWikilinkIndex(0)
  }, [previewLinkInput?.value, previewWikilinkSuggestions.length])

  // Handle wikilink and checkbox clicks in preview
  // Annotation löschen: Block per id aus der Sidecar-Datei entfernen + Marke auspacken.
  const deleteAnnotationById = useCallback(async (mark: HTMLElement) => {
    const annoId = mark.dataset.annoId
    if (!annoId || !selectedNote || !vaultPath) return
    const relPath = annotationRelPathFor(selectedNote.path)
    try {
      await window.electronAPI.deleteAnnotation(vaultPath, relPath, annoId)
      unwrapAnnotationMark(mark)
    } catch (err) {
      console.error('[Annotation] Löschen fehlgeschlagen:', err)
    }
  }, [selectedNote, vaultPath])

  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Klick auf ein Annotations-Highlight → kleines Löschmenü (per DOM, bewahrt Position)
    const annoMark = target.closest('.anno-mark') as HTMLElement | null
    if (annoMark) {
      e.preventDefault()
      e.stopPropagation()
      document.getElementById('anno-delete-menu')?.remove()
      const menu = document.createElement('div')
      menu.id = 'anno-delete-menu'
      menu.className = 'format-menu'
      menu.style.position = 'fixed'
      menu.style.left = `${e.clientX}px`
      menu.style.top = `${e.clientY}px`
      menu.style.zIndex = '10000'
      menu.onmousedown = ev => ev.preventDefault()
      const delBtn = document.createElement('button')
      delBtn.className = 'format-menu-item'
      delBtn.innerHTML = '<span class="format-menu-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></span><span class="format-menu-label">' + t('anno.delete') + '</span>'
      delBtn.onclick = async () => { menu.remove(); await deleteAnnotationById(annoMark) }
      menu.appendChild(delBtn)
      const container = target.closest('.editor-container') || document.body
      container.appendChild(menu)
      const rect = menu.getBoundingClientRect()
      if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`
      if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`
      const handleOutside = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node)) {
          menu.remove()
          document.removeEventListener('mousedown', handleOutside)
        }
      }
      setTimeout(() => document.addEventListener('mousedown', handleOutside), 0)
      return
    }

    // Copy code block to clipboard
    const copyButton = target.closest('.code-copy-btn') as HTMLButtonElement | null
    if (copyButton) {
      e.preventDefault()
      e.stopPropagation()

      const pre = copyButton.closest('pre')
      const code = pre?.querySelector('code')
      const codeText = code?.textContent ?? ''

      if (!codeText) return

      writeClipboardText(codeText)
        .then(() => {
          const copyLabel = t('format.copy')
          const copiedLabel = t('settings.sync.copied')
          copyButton.textContent = copiedLabel
          copyButton.classList.add('copied')

          window.setTimeout(() => {
            copyButton.textContent = copyLabel
            copyButton.classList.remove('copied')
          }, 1200)
        })
        .catch((error) => {
          console.error('Failed to copy code block:', error)
        })

      return
    }

    // Office-Embed Click: öffnet die Datei im OfficeViewer
    const officeEmbed = target.closest('.office-embed') as HTMLElement | null
    if (officeEmbed) {
      e.preventDefault()
      const filename = officeEmbed.getAttribute('data-filename') || ''
      const ext = (officeEmbed.getAttribute('data-ext') || '').toLowerCase()
      const officeType: 'excel' | 'word' | 'powerpoint' | null =
        ext === 'xlsx' || ext === 'xls' ? 'excel' :
        ext === 'docx' || ext === 'doc' ? 'word' :
        ext === 'pptx' || ext === 'ppt' ? 'powerpoint' : null
      if (!filename || !officeType || !vaultPath) return

      // Suche die Datei im Vault (relative zum Notizverzeichnis, dann root, dann fuzzy)
      const noteDir = selectedNote?.path ? selectedNote.path.substring(0, selectedNote.path.lastIndexOf('/')) : ''
      const candidates = [
        noteDir ? `${noteDir}/${filename}` : null,
        filename,
      ].filter(Boolean) as string[]
      ;(async () => {
        for (const rel of candidates) {
          try {
            await window.electronAPI.readFileBinary(`${vaultPath}/${rel}`)
            useNotesStore.getState().selectOffice(rel, officeType)
            return
          } catch {
            // next
          }
        }
        const found = await window.electronAPI.findImageInVault(vaultPath, filename)
        if (found.success && found.path) {
          const rel = found.path.startsWith(vaultPath + '/') ? found.path.slice(vaultPath.length + 1) : found.path
          useNotesStore.getState().selectOffice(rel, officeType)
        }
      })()
      return
    }

    // Externe Links (Markdown [text](url)) — im contentEditable folgt der Browser
    // einem Klick nicht automatisch; daher hier explizit via shell.openExternal öffnen.
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (anchor && !anchor.classList.contains('wikilink')) {
      const href = anchor.getAttribute('href') || ''
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        e.preventDefault()
        e.stopPropagation()
        if (window.electronAPI?.openExternal) {
          window.electronAPI.openExternal(href)
        } else {
          window.open(href, '_blank', 'noopener,noreferrer')
        }
        return
      }
    }

    // Wikilink click handling — closest() statt direkter classList-Check, damit auch
    // verschachtelte Formatierung im Linktext (z.B. fett/kursiv) den Wikilink trifft.
    // Im Lesen-Modus öffnet jeder Klick die Notiz (analog zu externen Links).
    const wikilinkEl = (target.closest('.wikilink') as HTMLAnchorElement | null)
    if (wikilinkEl) {
      e.preventDefault()
      e.stopPropagation()
      const linkText = wikilinkEl.getAttribute('data-link')
      const fragment = wikilinkEl.getAttribute('data-fragment') || ''

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
        } else {
          // Kein Notiz-Treffer: Plugin-Datei (z.B. [[skizze.excalidraw]]) im Plugin-Editor öffnen
          const pluginFile = resolvePluginFileLink(linkText, fileTree)
          if (pluginFile) {
            useTabStore.getState().openPluginEditorTab(
              pluginFile.pluginEditor.pluginId,
              pluginFile.path,
              pluginFile.pluginEditor.editorId,
              pluginFile.name
            )
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
      return
    }
  }, [notes, fileTree, selectNote, selectSecondaryNote, isSecondary, vaultPath, previewContent, saveContent, t, deleteAnnotationById])

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

    // Embed cached images directly into HTML so they survive React re-renders
    let finalHtml = withFoldableHeadings
    if (loadedImagesRef.current.size > 0) {
      finalHtml = finalHtml.replace(/(<img\s+class="md-image"\s+)data-src="([^"]+)"/g, (match, prefix, dataSrc) => {
        const cachedUrl = loadedImagesRef.current.get(dataSrc)
        if (cachedUrl) {
          return `${prefix}data-src="${dataSrc}" src="${cachedUrl}"`
        }
        return match
      })
    }

    return {
      frontmatterTitle: title,
      renderedMarkdown: finalHtml
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewContent, processHeadingFolds, imagesLoadedVersion])

  // Add copy buttons to fenced code blocks in preview mode
  useEffect(() => {
    if (viewMode !== 'preview' || !previewRef.current) return

    const applyCodeCopyButtons = () => {
      const root = previewRef.current
      if (!root) return

      const codeBlocks = root.querySelectorAll('pre > code')
      for (const codeBlock of Array.from(codeBlocks)) {
        const pre = codeBlock.parentElement as HTMLElement | null
        if (!pre || pre.querySelector('.code-copy-btn')) continue

        const copyButton = document.createElement('button')
        copyButton.type = 'button'
        copyButton.className = 'code-copy-btn'
        copyButton.textContent = t('format.copy')
        copyButton.setAttribute('aria-label', t('format.copy'))

        pre.classList.add('code-copy-enabled')
        pre.appendChild(copyButton)
      }
    }

    applyCodeCopyButtons()

    // Embedded note/content rendering mutates the preview DOM after initial render.
    const observer = new MutationObserver(() => applyCodeCopyButtons())
    observer.observe(previewRef.current, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [viewMode, renderedMarkdown, t, contentVersion])

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

  // Dataview queries in preview mode
  const dataviewExecuteQuery = useDataviewStore(s => s.executeQuery)
  useEffect(() => {
    console.log('[Dataview Effect] viewMode:', viewMode, 'previewRef:', !!previewRef.current)
    if (viewMode !== 'preview' || !previewRef.current) return

    const processDataviewBlocks = () => {
      const dataviewContainers = previewRef.current?.querySelectorAll('.dataview-preview-container:not([data-processed])')
      console.log('[Dataview Effect] Found containers:', dataviewContainers?.length || 0)
      if (!dataviewContainers || dataviewContainers.length === 0) return

      // Import renderResult for rendering
      import('../../utils/dataview').then(({ renderResult }) => {
        for (const container of Array.from(dataviewContainers)) {
          const query = container.getAttribute('data-query')
          console.log('[Dataview Effect] Processing query:', query?.slice(0, 50))
          if (!query) continue

          try {
            // Execute query using the store (has frontmatter cache)
            const result = dataviewExecuteQuery(query, notes)
            const html = renderResult(result, { language })
            console.log('[Dataview Effect] Result HTML length:', html.length, 'rows:', result.rows?.length)
            container.innerHTML = sanitizeHtml(html)
            container.setAttribute('data-processed', 'true')

          // Add click handlers for note links
          const links = container.querySelectorAll('.dataview-link')
          for (const link of Array.from(links)) {
            link.addEventListener('click', (e) => {
              e.preventDefault()
              const notePath = (link as HTMLElement).dataset.notePath
              if (notePath) {
                const note = notes.find(n => n.path === notePath)
                if (note) {
                  selectNote(note.id)
                }
              }
            })
          }
          } catch (error) {
            console.error('Dataview rendering error:', error)
            container.innerHTML = `<div class="dataview-error">Error: ${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}</div>`
            container.setAttribute('data-processed', 'true')
          }
        }
      })
    }

    // Delay to let the DOM update
    const timer = setTimeout(processDataviewBlocks, 50)
    return () => clearTimeout(timer)
  }, [renderedMarkdown, viewMode, notes, language, selectNote, dataviewExecuteQuery, contentVersion])

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
          embedEl.innerHTML = `<div class="wikilink-embed-error">Notiz "${escapeHtml(noteName)}" nicht gefunden</div>`
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
                <a href="#" class="wikilink" data-link="${escapeHtml(noteName)}" data-fragment="${escapeHtml(fragment)}">${escapeHtml(noteName)}${fragment ? '#' + escapeHtml(fragment) : ''}</a>
              </div>
              <div class="wikilink-embed-body">${sanitizeHtml(renderedEmbed)}</div>
            </div>
          `
        } catch (error) {
          console.error('Fehler beim Laden des Embeds:', error)
          embedEl.innerHTML = `<div class="wikilink-embed-error">Fehler beim Laden von "${escapeHtml(noteName)}"</div>`
        }
      }
    }

    // Kurze Verzögerung um sicherzustellen dass das DOM bereit ist
    const timer = setTimeout(processEmbeds, 50)
    return () => clearTimeout(timer)
  }, [renderedMarkdown, viewMode, notes, vaultPath, contentVersion])


  // Load images in preview mode — resolves data-src to data URLs and caches them
  useEffect(() => {
    if (viewMode !== 'preview' || !vaultPath) return

    // Find all uncached image sources from the raw rendered HTML
    const uncachedSources: string[] = []
    const dataSrcRegex = /data-src="([^"]+)"/g
    let match
    while ((match = dataSrcRegex.exec(renderedMarkdown)) !== null) {
      if (!loadedImagesRef.current.has(match[1])) {
        uncachedSources.push(match[1])
      }
    }
    if (uncachedSources.length === 0) return

    const noteDir = selectedNote?.path ? selectedNote.path.substring(0, selectedNote.path.lastIndexOf('/')) : ''
    let cancelled = false

    const loadImages = async () => {
      let newImagesLoaded = false

      for (const dataSrc of uncachedSources) {
        if (cancelled) return

        try {
          const possiblePaths = [
            dataSrc.startsWith('/') ? dataSrc : null,
            noteDir ? `${vaultPath}/${noteDir}/${dataSrc}` : null,
            `${vaultPath}/${dataSrc}`,
            `${vaultPath}/.attachments/${dataSrc}`,
            `${vaultPath}/attachments/${dataSrc}`,
            `${vaultPath}/assets/${dataSrc}`,
            `${vaultPath}/images/${dataSrc}`,
          ].filter(Boolean) as string[]

          let loaded = false
          for (const imagePath of possiblePaths) {
            const result = await window.electronAPI.readImageAsDataUrl(imagePath)
            if (result.success && result.dataUrl) {
              loadedImagesRef.current.set(dataSrc, result.dataUrl)
              newImagesLoaded = true
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
                loadedImagesRef.current.set(dataSrc, result.dataUrl)
                newImagesLoaded = true
                loaded = true
              }
            }
          }
        } catch (error) {
          console.error('[Preview] Image load error:', error)
        }
      }

      // Trigger re-render to embed cached images into renderedMarkdown
      if (newImagesLoaded && !cancelled) {
        setImagesLoadedVersion(v => v + 1)
      }
    }

    const timer = setTimeout(loadImages, 50)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [renderedMarkdown, viewMode, vaultPath, selectedNote?.path, fileTree, contentVersion])

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
                <span class="pdf-embed-filename">${escapeHtml(filename)}</span>
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
                <span>PDF nicht gefunden: ${escapeHtml(filename)}</span>
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
  }, [renderedMarkdown, viewMode, vaultPath, selectedNote?.path, contentVersion])

  useEffect(() => {
    const editable = editablePreviewRef.current
    if (!editable || isPreviewDomEditingRef.current) return
    editable.innerHTML = sanitizeHtml(renderedMarkdown)
  }, [renderedMarkdown, contentVersion])

  // Plugin-Embeds (R2) in der Preview hydratisieren: mountet den vom Renderer-Plugin registrierten
  // Read-only-Embed in die .plugin-embed-Platzhalter. MUSS NACH dem innerHTML-Effect definiert sein
  // (Effects laufen in Definitionsreihenfolge — vorher gäbe es die frischen Platzhalter noch nicht).
  // Mounts werden per Element-Identität getrackt statt pro Lauf neu gebaut: während des WYSIWYG-
  // Editierens ändert sich renderedMarkdown bei jedem Tastendruck, das DOM bleibt aber stehen
  // (isPreviewDomEditingRef) — ein Dispose/Remount pro Keystroke wäre teuer und flackerte.
  useEffect(() => {
    const mounts = pluginEmbedMountsRef.current

    // Verwaiste Mounts wegräumen (innerHTML-Replace hat die Elemente aus dem DOM genommen).
    for (const [el, entry] of [...mounts]) {
      if (!el.isConnected) {
        entry.dispose()
        mounts.delete(el)
      }
    }

    if (viewMode !== 'preview' || !previewRef.current) return

    const embedElements = previewRef.current.querySelectorAll('.plugin-embed')
    for (const embedEl of Array.from(embedElements)) {
      const filename = embedEl.getAttribute('data-filename')
      if (!filename || mounts.has(embedEl)) continue

      embedEl.textContent = '' // Loading-Platzhalter verwerfen

      const target = resolvePluginEmbedTarget(filename)
      if (!target) {
        const err = document.createElement('div')
        err.className = 'plugin-embed-hint'
        err.textContent = `Datei "${filename}" nicht gefunden`
        embedEl.appendChild(err)
        mounts.set(embedEl, { dispose: () => {} })
        continue
      }

      const { pluginId, editorId } = target.pluginEditor
      const widthAttr = parseInt(embedEl.getAttribute('data-width') || '', 10)
      const heightAttr = parseInt(embedEl.getAttribute('data-height') || '', 10)
      const embedSize = Number.isFinite(widthAttr)
        ? { width: widthAttr, height: Number.isFinite(heightAttr) ? heightAttr : null }
        : null
      const { frame, body } = buildPluginEmbedFrame(filename, () => {
        useTabStore.getState().openPluginEditorTab(pluginId, target.path, editorId, target.name)
      }, embedSize)
      embedEl.appendChild(frame)
      mounts.set(embedEl, { dispose: mountPluginEmbedBody(body, pluginId, editorId, target.path) })
    }
  }, [renderedMarkdown, viewMode, fileTree, contentVersion])

  // Unmount-Cleanup für Plugin-Embed-Mounts (das Tracking oben disposed nur verwaiste Elemente).
  useEffect(() => {
    const mounts = pluginEmbedMountsRef.current
    return () => {
      for (const [, entry] of mounts) entry.dispose()
      mounts.clear()
    }
  }, [])

  // Phase 2: gespeicherte Annotationen beim Öffnen wieder als Highlight-Overlay einfärben.
  // Liest die co-lokierte Sidecar-Datei und verankert die Zitate im frisch gerenderten
  // Preview-DOM. Die Markdown-Quelle bleibt unangetastet; läuft nach jedem Render erneut.
  useEffect(() => {
    if (viewMode !== 'preview') return
    const root = editablePreviewRef.current
    if (!root || !selectedNote || !vaultPath) return
    let cancelled = false
    const abs = `${vaultPath}/${annotationRelPathFor(selectedNote.path)}`
    // readFileOptional: die Sidecar-Datei fehlt bei den meisten Notizen — das ist
    // der Normalfall und darf keinen Error-Log im Main-Prozess erzeugen.
    window.electronAPI.readFileOptional(abs)
      .then(content => {
        if (cancelled || !content || isPreviewDomEditingRef.current) return
        const anchors = parseAnnotationAnchors(content)
        if (anchors.length) applyStoredHighlights(root, anchors)
      })
      .catch(() => { /* Lesefehler → nichts einzufärben */ })
    return () => { cancelled = true }
  }, [renderedMarkdown, contentVersion, viewMode, selectedNote?.path, vaultPath])

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
        const { body } = parseFrontmatter(content)
        const withCallouts = processCallouts(body)
        const html = processFigures(md.render(withCallouts))

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
          html,
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

  // Bewusster Moduswechsel (Button oder Cmd+E) erledigt den einmaligen
  // Lesemodus-Hinweis — der Nutzer hat den Mechanismus dann gefunden.
  const markModeHintSeen = () => {
    if (!readingModeHintDismissed) setReadingModeHintDismissed(true)
  }

  const handleSetViewMode = (mode: ViewMode) => {
    markModeHintSeen()
    setViewMode(mode)
  }

  // Toggle view mode (cycles depending on showRawEditor setting)
  const toggleViewMode = () => {
    markModeHintSeen()
    setViewMode(prev => {
      if (showRawEditor) {
        // Full cycle: edit -> live-preview -> preview -> edit
        if (prev === 'edit') return 'live-preview'
        if (prev === 'live-preview') return 'preview'
        return 'edit'
      } else {
        // Simplified: live-preview <-> preview
        return prev === 'preview' ? 'live-preview' : 'preview'
      }
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

  // Annotation aus dem Lesen-Modus: Zitat + Zitation an die co-lokierte Sammeldatei
  // anhängen und die Stelle sitzungsweise einfärben. Quelle bleibt unverändert (Overlay).
  const annotateSelection = useCallback(async (quote: string, range: Range, colorDef: AnnoColorDef) => {
    if (!selectedNote || !vaultPath) return
    const root = editablePreviewRef.current
    const content = viewRef.current?.state.doc.toString() ?? previewContent
    const page = root ? computePageFromRange(root, range) : null
    const loc = findQuoteLocation(content, quote)
    const now = new Date()
    const id = makeAnnotationId(now)
    const sourceNoteName = noteBaseName(selectedNote.path)
    const anchor = {
      id,
      color: colorDef.key,
      page,
      quote,
      prefix: loc?.prefix ?? '',
      suffix: loc?.suffix ?? '',
      occ: loc?.occ ?? 1
    }
    const block = buildAnnotationBlock({ quote, color: colorDef, page, sourceNoteName, anchor, now })
    const header = buildAnnotationFileHeader({
      sourceNoteName,
      sourcePdf: getFrontmatterField(content, 'source'),
      now
    })
    const relPath = annotationRelPathFor(selectedNote.path)
    try {
      await window.electronAPI.appendAnnotation(vaultPath, relPath, block, header)
      applyAnnotationHighlight(range, colorDef.className, id)
    } catch (err) {
      console.error('[Annotation] Append fehlgeschlagen:', err)
    }
  }, [selectedNote, vaultPath, previewContent])

  // Preview-Kontextmenü: Per DOM erzeugen um React-Rerender zu vermeiden (bewahrt Selektion)
  const handlePreviewContextMenu = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection()
    const selectedText = selection?.toString() || ''
    if (!selectedText) return

    e.preventDefault()

    // Range jetzt klonen — Klicks im Menü würden die Live-Selektion sonst verlieren.
    const annoRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null

    // Vorheriges Menü entfernen
    document.getElementById('preview-copy-menu')?.remove()

    const menu = document.createElement('div')
    menu.id = 'preview-copy-menu'
    menu.className = 'format-menu'
    menu.style.position = 'fixed'
    menu.style.left = `${e.clientX}px`
    menu.style.top = `${e.clientY}px`
    menu.style.zIndex = '10000'
    menu.onmousedown = (ev) => ev.preventDefault()

    const copyBtn = document.createElement('button')
    copyBtn.className = 'format-menu-item'
    copyBtn.innerHTML = '<span class="format-menu-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span><span class="format-menu-label">' + t('format.copy') + '</span><span class="format-menu-shortcut">Cmd+C</span>'
    copyBtn.onclick = async () => {
      await writeClipboardText(selectedText)
      menu.remove()
    }
    menu.appendChild(copyBtn)

    // Annotieren ▸ Farben (Zotero-artig): hängt das Zitat + Zitation an die
    // co-lokierte „… - Annotationen.md" an und färbt die Stelle sitzungsweise ein.
    if (selectedNote && vaultPath && annoRange) {
      const divider = document.createElement('div')
      divider.className = 'format-menu-divider'
      menu.appendChild(divider)

      const annoRow = document.createElement('div')
      annoRow.className = 'format-menu-item anno-menu-row'
      const label = document.createElement('span')
      label.className = 'format-menu-label'
      label.textContent = t('anno.annotate')
      annoRow.appendChild(label)

      const swatches = document.createElement('span')
      swatches.className = 'anno-swatches'
      ANNO_COLORS.forEach((colorDef: AnnoColorDef) => {
        const btn = document.createElement('button')
        btn.className = `anno-swatch ${colorDef.className}`
        btn.title = t(colorDef.labelKey)
        btn.onclick = async () => {
          menu.remove()
          await annotateSelection(selectedText, annoRange, colorDef)
        }
        swatches.appendChild(btn)
      })
      annoRow.appendChild(swatches)
      menu.appendChild(annoRow)
    }

    // In editor-container einfügen für korrekte CSS-Variablen
    const container = (e.target as HTMLElement).closest('.editor-container') || document.body
    container.appendChild(menu)
    const rect = menu.getBoundingClientRect()
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`

    // Klick außerhalb schließt Menü
    const handleOutside = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove()
        document.removeEventListener('mousedown', handleOutside)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', handleOutside), 0)
  }, [t, selectedNote, vaultPath, annotateSelection])

  const handleEditorContextMenu = useCallback((e: React.MouseEvent) => {
    if (viewMode === 'preview' || !viewRef.current) return

    e.preventDefault()

    const view = viewRef.current
    const { from, to } = view.state.selection.main
    const selectedText = view.state.doc.sliceString(from, to)

    // Alt+Rechtsklick mit Text selektiert und Ollama verfügbar: direkt AI-Menü
    if (e.altKey && selectedText.length > 0 && ollama.enabled && ollama.selectedModel) {
      setAiMenu({
        x: e.clientX,
        y: e.clientY,
        selectedText,
        selectionStart: from,
        selectionEnd: to
      })
      setFormatMenu(null)
      return
    }

    // Normaler Rechtsklick: Format-Menü (mit optionalem KI-Eintrag, wenn Text selektiert + Ollama aktiv)
    const aiInfo = selectedText.length > 0 && ollama.enabled && ollama.selectedModel
      ? { selectedText, selectionStart: from, selectionEnd: to }
      : undefined
    setFormatMenu({ x: e.clientX, y: e.clientY, ai: aiInfo })
    setAiMenu(null)
  }, [viewMode, ollama.enabled, ollama.selectedModel])

  // Tastenkombinationen: Cmd+Shift+F = Format-Menü, Cmd+Shift+A = AI-Menü
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode === 'preview' || !viewRef.current) return

      const view = viewRef.current
      const { from } = view.state.selection.main
      const coords = view.coordsAtPos(from)

      // Cmd+Shift+F für Format-Menü
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        if (coords) {
          setFormatMenu({ x: coords.left, y: coords.top })
          setAiMenu(null)
        }
      }

      // Cmd+Shift+A öffnet die Macher-Leiste unten (Auswahl = Scope, sonst ganze Notiz).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault()
        if (ollama.enabled && ollama.selectedModel) {
          setAiBarOpen(true)
          setFormatMenu(null)
          setAiMenu(null)
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
  const handleExportDocx = useCallback(async () => {
    if (!selectedNote) return
    const baseName = (selectedNote.path.split('/').pop() || 'notiz').replace(/\.md$/, '')
    // selectedNote.content can still be an empty cache placeholder until the
    // editor lazy-loads it — read fresh from disk so the export is never blank.
    let content = selectedNote.content
    if (vaultPath) {
      try {
        const fileContent = await window.electronAPI.readFile(`${vaultPath}/${selectedNote.path}`)
        if (fileContent) content = fileContent
      } catch {
        // keep whatever the store has
      }
    }
    const res = await window.electronAPI.officeExportDocx(content, baseName)
    if (res.success) {
      console.log('DOCX exportiert nach:', res.filePath)
    } else if (!res.canceled) {
      console.error('DOCX Export fehlgeschlagen:', res.error)
    }
  }, [selectedNote, vaultPath])

  const handleExportPDF = useCallback(async (pdfStyle: 'standard' | 'remarkable-book' = 'standard') => {
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
      frontmatterTitle || selectedNote.title,
      vaultPath || undefined,
      selectedNote.path || undefined,
      pdfStyle
    )

    if (result.success) {
      console.log('PDF exportiert nach:', result.path)
    } else if (result.error !== 'Abgebrochen') {
      console.error('PDF Export fehlgeschlagen:', result.error)
    }
  }, [selectedNote, frontmatterTitle, renderedMarkdown, vaultPath])

  if (!selectedNote) {
    return (
      <div className="editor-empty">
        <p>{t('editor.placeholder.select')}</p>
        <p className="hint">{t('editor.placeholder.create')}</p>
      </div>
    )
  }
  const selectedNoteKind = getNoteKind(selectedNote)
  const selectedNoteIsBrain = isBrainNote(selectedNote)
  const selectedNoteDisplayTitle = selectedNoteIsBrain
    ? brainNoteLabel(selectedNote)
    : selectedNoteKind ? stripNoteKindMarker(selectedNote.title) : selectedNote.title

  return (
    <div className="editor-container">
      <div className="editor-header">
        {!isSecondary && (
          <div className="editor-nav-buttons">
            <button
              className="nav-btn"
              onClick={navigateBack}
              disabled={!canNavigateBack()}
              title={t('editor.back')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button
              className="nav-btn"
              onClick={navigateForward}
              disabled={!canNavigateForward()}
              title={t('editor.forward')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        )}
        <h3 title={selectedNoteDisplayTitle}>
          {selectedNoteIsBrain ? (
            <BrainIcon size={15} title={t('brain.noteLabel')} />
          ) : selectedNoteKind && (
            <span
              className={`note-kind-dot note-kind-${selectedNoteKind.id}`}
              title={selectedNoteKind.label}
              aria-label={selectedNoteKind.label}
            />
          )}
          {selectedNoteDisplayTitle}
        </h3>
        {!isSecondary && ollama.enabled && (() => {
          const prov = getAiProvenance(previewContent)
          return prov ? (
            <span className="note-authorship note-authorship-ai" title={`${t('editor.aiEdited')} · ${prov.model}${prov.date ? ' · ' + prov.date : ''}`}>
              <ModelLogo model={prov.model} size={13} />
              <span>{t('editor.aiEdited')}</span>
            </span>
          ) : (
            <span className="note-authorship note-authorship-human" title={t('aiBar.byYouTitle')}>
              <HumanIcon size={12} />
              <span>{t('aiBar.byYou')}</span>
            </span>
          )
        })()}
        <div className="editor-header-right">
          {isSaving && <span className="saving-indicator">{t('editor.saving')}</span>}
          {isSecondary && (
            <button
              className="close-secondary-btn"
              onClick={() => selectSecondaryNote(null)}
              title={t('editor.closeSecondaryPanel')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          {/* LanguageTool Check Button */}
          {editorHeaderActions.languageTool && languageTool.enabled && viewMode !== 'preview' && (
            <button
              className={`lt-check-btn ${ltIsChecking ? 'checking' : ''}`}
              onClick={checkLanguageTool}
              disabled={ltIsChecking}
              title={ltErrorMessage || (ltStatus === 'ok'
                ? (ltMatches.length > 0
                  ? t('languagetool.errorsFound', { count: ltMatches.length })
                  : t('languagetool.noErrors'))
                : t('languagetool.check'))}
            >
              {ltIsChecking ? (
                <svg width="16" height="16" viewBox="0 0 16 16" className="lt-spinner">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 10" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {ltIsChecking
                ? t('languagetool.checking')
                : ltStatus === 'ok' && ltMatches.length === 0
                  ? t('languagetool.noErrors')
                  : t('languagetool.check')}
              {ltStatus === 'error' && (
                <span className="lt-error-badge">!</span>
              )}
              {ltStatus !== 'error' && ltMatches.length > 0 && (
                <span className="lt-error-badge">{ltMatches.length}</span>
              )}
            </button>
          )}
          {editorHeaderActions.languageTool && languageTool.enabled && (
            <button
              className={`lt-check-btn lt-autocorrect-btn ${ltAutoCorrecting ? 'checking' : ''} ${ltCorrectedCount > 0 ? 'corrected' : ''}`}
              onClick={autoCorrectLanguageTool}
              disabled={ltAutoCorrecting}
              title={t('languagetool.autoCorrectHint')}
            >
              {ltAutoCorrecting ? (
                <svg width="16" height="16" viewBox="0 0 16 16" className="lt-spinner">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 10" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M1.5 8.5L4.5 11.5L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8.5 10.5L10 12L14.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {ltAutoCorrecting
                ? t('languagetool.autoCorrecting')
                : ltCorrectedCount > 0
                  ? t('languagetool.corrected', { count: ltCorrectedCount })
                  : t('languagetool.autoCorrect')}
            </button>
          )}
          {viewMode !== 'preview' && (
            <button
              className={`formatting-toolbar-toggle ${showFormattingToolbar ? 'active' : ''}`}
              onClick={() => setShowFormattingToolbar(!showFormattingToolbar)}
              title={showFormattingToolbar ? t('toolbar.hide') : t('toolbar.show')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16"/>
                <path d="M4 12h10"/>
                <path d="M4 18h6"/>
              </svg>
            </button>
          )}
          {editorHeaderActions.pdf && <button
            className="export-btn"
            onClick={() => handleExportPDF('standard')}
            title={t('editor.exportPdf')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 10V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            PDF
          </button>}
          {editorHeaderActions.remarkable && <button
            className="export-btn"
            onClick={() => handleExportPDF('remarkable-book')}
            title={t('editor.exportPdfRemarkable')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M6 5.5h4M6 8h4M6 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            reMarkable
          </button>}
          {editorHeaderActions.docx && <button
            className="export-btn"
            onClick={handleExportDocx}
            title={t('editor.exportDocx')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 10V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            DOCX
          </button>}
          {editorHeaderActions.wordpress && marketing.enabled && marketing.wordpressUrl && (
            <button
              className="export-btn"
              onClick={() => setShowPublishWpModal(true)}
              title={t('editor.publishWp')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2.5 8h11M8 2.5c1.8 2 2.8 3.8 2.8 5.5S9.8 11.5 8 13.5M8 2.5C6.2 4.5 5.2 6.3 5.2 8S6.2 11.5 8 13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              WP
            </button>
          )}
          <div className="view-mode-toggle">
            {showRawEditor && (
              <button
                className={`toggle-btn ${viewMode === 'edit' ? 'active' : ''}`}
                onClick={() => handleSetViewMode('edit')}
                title={t('editor.modeMarkdown')}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <button
              className={`toggle-btn ${viewMode === 'live-preview' ? 'active' : ''}`}
              onClick={() => handleSetViewMode('live-preview')}
              title={t('editor.modeWrite')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3C4.5 3 1.5 8 1.5 8C1.5 8 4.5 13 8 13C11.5 13 14.5 8 14.5 8C14.5 8 11.5 3 8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M11.5 2.5L13.5 4.5L10 8L8.5 6.5L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className={`toggle-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => handleSetViewMode('preview')}
              title={t('editor.modeRead')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3C4.5 3 1.5 8 1.5 8C1.5 8 4.5 13 8 13C11.5 13 14.5 8 14.5 8C14.5 8 11.5 3 8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Einmaliger Hinweis für den Default-Lesemodus: Notizen öffnen read-only,
          ohne diesen Hinweis wirkt das Dokument „eingefroren", bis man Cmd+E kennt. */}
      {viewMode === 'preview' && !readingModeHintDismissed && (
        <div className="reading-mode-hint">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 7.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="5.2" r="0.9" fill="currentColor"/>
          </svg>
          <span className="reading-mode-hint-text">{t('editor.readingModeHint')}</span>
          <button
            className="reading-mode-hint-switch"
            onClick={() => handleSetViewMode('live-preview')}
          >
            {t('editor.readingModeHint.switch')}
          </button>
          <button
            className="reading-mode-hint-dismiss"
            onClick={() => setReadingModeHintDismissed(true)}
          >
            {t('editor.readingModeHint.dismiss')}
          </button>
        </div>
      )}

      {/* Properties Panel for editing frontmatter */}
      {viewMode !== 'preview' && (
        <PropertiesPanel
          content={viewRef.current?.state.doc.toString() || selectedNote?.content || ''}
          onContentChange={handlePropertiesChange}
          collapsed={propertiesCollapsed}
          onToggleCollapsed={() => setPropertiesCollapsed(!propertiesCollapsed)}
        />
      )}

      {/* Formatting Toolbar */}
      {showFormattingToolbar && viewMode !== 'preview' && (
        <FormattingToolbar
          onFormat={applyFormat}
          viewRef={viewRef}
        />
      )}

      <div
        className={`editor-content ${viewMode !== 'preview' ? 'visible' : 'hidden'} ${viewMode === 'live-preview' ? 'live-preview-mode' : ''}`}
        ref={editorRef}
        onContextMenu={handleEditorContextMenu}
      />
      <div
        className={`editor-preview ${viewMode === 'preview' ? 'visible' : 'hidden'}${outlineStyle !== 'default' ? ` outline-${outlineStyle}` : ''}`}
        onClick={handlePreviewClick}
        onContextMenu={handlePreviewContextMenu}
        ref={previewRef}
      >
        {previewToolbar && viewMode === 'preview' && (
          <div
            className="preview-edit-toolbar"
            style={{ left: previewToolbar.x, top: previewToolbar.y }}
            onMouseDown={e => e.preventDefault()}
          >
            {previewLinkInput !== null ? (
              <>
                <input
                  type={previewLinkInput.kind === 'url' ? 'url' : 'text'}
                  className="preview-edit-toolbar-input"
                  placeholder={previewLinkInput.kind === 'url' ? 'https://...' : t('editor.noteName')}
                  autoFocus
                  value={previewLinkInput.value}
                  onChange={e => setPreviewLinkInput({ kind: previewLinkInput.kind, value: e.target.value })}
                  onKeyDown={e => {
                    // Wikilink-Modus: Pfeiltasten navigieren durch die Vorschläge,
                    // Enter wählt das aktuelle Item (oder fügt den freien Text ein, wenn keine Items).
                    if (previewLinkInput.kind === 'wiki' && previewWikilinkSuggestions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setPreviewWikilinkIndex(i => Math.min(i + 1, previewWikilinkSuggestions.length - 1))
                        return
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setPreviewWikilinkIndex(i => Math.max(i - 1, 0))
                        return
                      }
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (previewLinkInput.kind === 'wiki' && previewWikilinkSuggestions[previewWikilinkIndex]) {
                        const item = previewWikilinkSuggestions[previewWikilinkIndex]
                        confirmPreviewLink(item.value, item.isCreate)
                      } else {
                        confirmPreviewLink()
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelPreviewLink()
                    }
                  }}
                />
                <button onClick={() => confirmPreviewLink()} title={previewLinkInput.kind === 'url' ? t('editor.insertLink') : t('editor.insertWikilink')}>✓</button>
                <button onClick={cancelPreviewLink} title={t('editor.cancel')}>✕</button>
                {previewLinkInput.kind === 'wiki' && previewWikilinkSuggestions.length > 0 && (
                  <div className="preview-wikilink-suggestions wikilink-autocomplete">
                    <div className="wikilink-autocomplete-list">
                      {previewWikilinkSuggestions.map((item, idx) => (
                        <div
                          key={item.id}
                          className={`wikilink-autocomplete-item ${idx === previewWikilinkIndex ? 'selected' : ''} ${item.isCreate ? 'create-new' : ''}`}
                          onMouseDown={e => {
                            // mousedown statt click — sonst stiehlt der Klick den Fokus,
                            // und der Input-onBlur cancelt vor dem Confirm.
                            e.preventDefault()
                            confirmPreviewLink(item.value, item.isCreate)
                          }}
                          onMouseEnter={() => setPreviewWikilinkIndex(idx)}
                        >
                          <span className={`wikilink-autocomplete-icon ${item.isCreate ? 'create-new' : ''}`}>
                            {item.isCreate ? '➕' : '📄'}
                          </span>
                          <span className="wikilink-autocomplete-label">{item.label}</span>
                          {item.sublabel && (
                            <span className={`wikilink-autocomplete-sublabel ${item.isCreate ? 'create-new' : ''}`}>{item.sublabel}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <button onClick={() => applyPreviewCommand('bold')} title={t('editor.bold')}>B</button>
                <button onClick={() => applyPreviewCommand('italic')} title={t('editor.italic')}><em>I</em></button>
                <button onClick={() => applyPreviewCommand('formatBlock', 'h1')} title={t('editor.heading1')}>H1</button>
                <button onClick={() => applyPreviewCommand('formatBlock', 'h2')} title={t('editor.heading2')}>H2</button>
                <button onClick={() => applyPreviewCommand('insertUnorderedList')} title={t('editor.bulletList')}>•</button>
                <button onClick={() => applyPreviewCommand('insertOrderedList')} title={t('editor.numberedList')}>1.</button>
                <button onClick={() => openPreviewLinkInput('url')} title={t('editor.externalLink')}>🔗</button>
                <button onClick={() => openPreviewLinkInput('wiki')} title={t('editor.wikilink')}>[[ ]]</button>
              </>
            )}
          </div>
        )}
        {speechEnabled && viewMode === 'preview' && (
          <div className="voice-preview-controls">
            <button
              className={`voice-preview-btn${isPreviewSpeaking ? ' active' : ''}`}
              onMouseDown={e => e.preventDefault() /* Selection im Preview erhalten */}
              onClick={() => {
                if (isPreviewSpeaking) {
                  stopSpeaking()
                  return
                }
                const sel = window.getSelection()
                let text = ''
                if (sel && previewRef.current && sel.rangeCount > 0) {
                  // Selection nur verwenden, wenn sie innerhalb der Preview liegt.
                  const range = sel.getRangeAt(0)
                  if (previewRef.current.contains(range.commonAncestorContainer)) {
                    text = sel.toString().trim()
                  }
                }
                if (!text) text = previewContent
                if (text) speak(text, { contextId: 'preview' })
              }}
              title={isPreviewSpeaking ? t('voice.stop') : t('voice.speak')}
              aria-label={isPreviewSpeaking ? t('voice.stop') : t('voice.speak')}
            >
              {isPreviewSpeaking ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="6" width="12" height="12" rx="1"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
              )}
            </button>
          </div>
        )}
        {frontmatterTitle && (
          <h1 className="frontmatter-title">{frontmatterTitle}</h1>
        )}
        <div
          ref={editablePreviewRef}
          className="editor-preview-editable"
          contentEditable={viewMode === 'preview'}
          suppressContentEditableWarning
          spellCheck
          onFocus={() => {
            rememberPreviewSelection()
            updatePreviewToolbarPosition()
          }}
          onInput={scheduleEditablePreviewCommit}
          onKeyUp={() => {
            rememberPreviewSelection()
            updatePreviewToolbarPosition()
          }}
          onMouseUp={() => {
            rememberPreviewSelection()
            updatePreviewToolbarPosition()
          }}
          onBlur={(e) => {
            // Wenn der Fokus innerhalb der Toolbar landet (z.B. URL-Input), nicht committen
            // und Toolbar nicht ausblenden — der User ist mitten in einer Aktion.
            const next = e.relatedTarget as HTMLElement | null
            if (next && next.closest('.preview-edit-toolbar')) return

            if (previewEditTimeoutRef.current) {
              clearTimeout(previewEditTimeoutRef.current)
              previewEditTimeoutRef.current = null
            }
            commitEditablePreview(true)
            setPreviewToolbar(null)
          }}
        />
      </div>

      {/* Editor Footer mit Statistiken */}
      {editorShowWordCount && (
        <div className="editor-footer">
          <span className="editor-stat" title={t('editor.words')}>
            {documentStats.words} {t('editor.words')}
          </span>
          <span className="editor-stat" title={t('editor.charactersTooltip')}>
            {documentStats.characters} {t('editor.characters')}
          </span>
          <span className="editor-stat" title={t('editor.readTime')}>
            ~{documentStats.readingTimeMinutes} {t('editor.readTimeMin')}
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
          previewMode={viewMode === 'preview'}
          onOpenAI={formatMenu.ai ? () => {
            const ai = formatMenu.ai!
            setAiMenu({ x: formatMenu.x, y: formatMenu.y, selectedText: ai.selectedText, selectionStart: ai.selectionStart, selectionEnd: ai.selectionEnd })
          } : undefined}
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

      {/* Publish to WordPress Modal */}
      {showPublishWpModal && selectedNote && vaultPath && (
        <PublishToWordPressModal
          note={selectedNote}
          vaultPath={vaultPath}
          fileTree={fileTree}
          onClose={() => setShowPublishWpModal(false)}
        />
      )}

      {/* Slash Command Menu */}
      {slashMenu?.isOpen && (
        <SlashCommandMenu
          view={viewRef.current}
          isOpen={slashMenu.isOpen}
          triggerPos={slashMenu.triggerPos}
          query={slashMenu.query}
          onClose={() => setSlashMenu(null)}
          onExecute={() => setSlashMenu(null)}
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
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(hoverPreview.html) }}
          />
        </div>
      )}

      {/* LanguageTool Error Popup */}
      {ltPopup && (
        <div
          className="lt-popup"
          style={{
            position: 'fixed',
            left: ltPopup.x,
            top: ltPopup.y,
            zIndex: 1001
          }}
        >
          <div className="lt-popup-header">
            <span className={`lt-popup-icon lt-${ltPopup.match.category}`}>
              {ltPopup.match.category === 'spelling' ? '📝' :
               ltPopup.match.category === 'grammar' ? '📖' :
               ltPopup.match.category === 'style' ? '✨' : '📌'}
            </span>
            <span className="lt-popup-message">{ltPopup.match.shortMessage || ltPopup.match.message}</span>
            <button
              className="lt-popup-close"
              onClick={() => setLtPopup(null)}
            >
              ✕
            </button>
          </div>
          {ltPopup.match.message !== ltPopup.match.shortMessage && (
            <div className="lt-popup-detail">{ltPopup.match.message}</div>
          )}
          {ltPopup.match.replacements && ltPopup.match.replacements.length > 0 && (
            <div className="lt-popup-suggestions">
              <div className="lt-popup-suggestions-label">{t('languagetool.suggestions')}:</div>
              <div className="lt-popup-suggestions-list">
                {ltPopup.match.replacements.slice(0, 5).map((r, i) => (
                  <button
                    key={i}
                    className="lt-suggestion-btn"
                    onClick={() => applyLtSuggestion(r.value, ltPopup.match.from, ltPopup.match.to)}
                  >
                    {r.value}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            className="lt-ignore-btn"
            onClick={() => {
              const text = viewRef.current?.state.doc.sliceString(ltPopup.match.from, ltPopup.match.to) || ''
              ignoreLtMatch(ltPopup.match.from, ltPopup.match.to, ltPopup.match.ruleId, text)
            }}
          >
            {t('languagetool.ignore')}
          </button>
        </div>
      )}
      {!isSecondary && (
        <AiActionBar
          open={aiBarOpen}
          onOpenChange={setAiBarOpen}
          phase={aiPhase}
          proposal={aiProposal}
          onGenerate={aiGenerate}
          onAccept={aiAcceptProposal}
          onDiscard={aiDiscardProposal}
          tagSuggestions={aiTagSuggestions}
          tagsLoading={aiTagsLoading}
          onSuggestTags={aiSuggestTags}
          onAcceptTag={aiAcceptTag}
          onDismissTag={aiDismissTag}
          model={activeAiCloudRoute ? activeAiCloudRoute.sentinel : (aiModel || ollama.selectedModel)}
          models={[...cloudPickerRoutes.map(r => ({ name: r.sentinel })), ...aiModels]}
          onModelChange={(name) => {
            const provider = cloudProviderForSentinel(name)
            if (provider) { setAiCloudProvider(provider) }
            else { setAiCloudProvider(null); setAiModel(name) }
          }}
          getModelLabel={(name) => cloudPickerRoutes.find(r => r.sentinel === name)?.label ?? name}
          attachments={agentAttachments}
          onAttachDialog={agentAttachFromDialog}
          onAttachFolderDialog={agentAttachFolderFromDialog}
          onAttachVaultFile={agentAttachVaultFile}
          onDetach={agentDetach}
          attachError={agentAttachError}
          targetFolder={agentTargetFolder}
          onTargetFolderChange={agentSetTargetFolder}
          agentPhase={agentRunState.phase}
          agentSteps={agentRunState.steps}
          agentResults={agentRunState.results}
          agentFinalText={agentRunState.finalText}
          onAgentRun={agentRunStart}
          onAgentCancel={agentRunCancel}
          onAgentAccept={agentResultAccept}
          onAgentDiscard={agentResultDiscard}
          onAgentDismiss={agentRunDismiss}
          onRemember={agentRemember}
        />
      )}
    </div>
  )
}
