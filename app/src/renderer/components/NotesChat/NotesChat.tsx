import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { sanitizeHtml } from '../../utils/sanitize'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useUIStore } from '../../stores/uiStore'
import { useIsModuleEnabled } from '../../utils/modules'
import { useTranslation } from '../../utils/translations'
import { writeClipboardText } from '../../utils/clipboard'
import { ModelPicker } from '../Shared/ModelPicker'
import { PanelHeader } from '../Shared/PanelHeader'
import { ContextAttachmentRow } from '../Shared/ContextAttachmentRow'
import { cloudRoutesForFeature, cloudProviderForSentinel, type CloudProviderId } from '../../../shared/llmBackend'
import { isCloudModel } from '../../../shared/modelCompatibility'
import { setAiProvenanceInContent, todayIsoDate } from '../../../shared/aiProvenance'
import type { NoteAgentAttachment, VaultRagHitDto } from '../../../shared/types'
import { replaceCitationRefs, type CitationReport, type SentenceCheck } from '../../../shared/rag/citations'
import { citationMarkdownPlugin, markCitationRefs, type CitationEnv } from '../../utils/citationMarkdown'
import { createSourceOpener, findNoteByVaultPath, type SourceJumpDeps } from '../../utils/sourceJump'
import { chatHistoryForModel } from '../../utils/chatHistory'
import { reserveFreeNoteName } from '../../utils/noteFileName'
import { createVaultRequester, type VaultRequester } from '../../utils/vaultRequest'
import { useTabStore } from '../../stores/tabStore'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
})

let notesChatMermaidCounter = 0

// Minimales Un-/Escaping fürs Wikilink-Linkifying (arbeitet auf bereits sanitisiertem HTML).
function ncUnescape(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}
function ncEscapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Wandelt `[[Titel]]` im gerenderten HTML in klickbare Spans um — aber NUR, wenn
// der Link auf eine existierende Notiz auflösbar ist (sonst bleibt es Klartext,
// kein toter Link). Die Auflösung liefert die Notiz-ID, die der Klick-Handler nutzt.
function linkifyWikilinks(html: string, resolve: (text: string) => string | null): string {
  return html.replace(/\[\[([^\]\n]+?)\]\]/g, (full, inner: string) => {
    const id = resolve(ncUnescape(inner))
    if (!id) return full
    return `<span class="nc-wikilink" role="link" tabindex="0" data-note-id="${ncEscapeAttr(id)}">${inner}</span>`
  })
}

interface VaultCitations {
  hits: VaultRagHitDto[]
  report: CitationReport
  excludeMismatch: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  question?: string      // Die vorherige User-Frage (nur bei assistant)
  model?: string         // Das verwendete Modell (nur bei assistant)
  timestamp?: Date       // Zeitpunkt der Antwort (nur bei assistant)
  /** Vault-Antworten tragen Notiz- und Mail-Text: nie in den Verlauf des normalen Chats (F22). */
  origin?: 'vault-rag'
  vaultPath?: string
  citations?: VaultCitations
}

interface OllamaModel {
  name: string
  size: number
}

// 'vault' ersetzt 'all', sobald das RAG-Modul an ist: der Modus Alle nahm die ersten 50 Notizen der Liste.
type ContextMode = 'current' | 'folder' | 'all' | 'project' | 'vault'
type ChatMode = 'direct' | 'socratic' | 'grill'

interface ProjectOption {
  folderRel: string
  folderName: string
}

interface NotesChatProps {
  onClose: () => void
  /** Von außen angeforderter Kontextmodus (Einstieg „Vault befragen“); nonce für Wiederholung. */
  modeRequest?: { mode: 'vault'; nonce: number } | null
}

export const NotesChat: React.FC<NotesChatProps> = ({ onClose, modeRequest }) => {
  const { t } = useTranslation()
  const { notes, selectedNoteId, vaultPath, selectedPdfPath, selectedOfficePath } = useNotesStore()
  const { ollama: llmSettings } = useUIStore()
  const language = useUIStore(s => s.language)
  const lang: 'de' | 'en' = language === 'en' ? 'en' : 'de'
  const projectsRootFolder = useUIStore(s => s.projectsRootFolder)
  const projectRagEnabled = useIsModuleEnabled('project-rag')
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [isBackendAvailable, setIsBackendAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [contextMode, setContextMode] = useState<ContextMode>('current')
  useEffect(() => {
    if (modeRequest?.mode === 'vault') setContextMode('vault')
  }, [modeRequest])
  const [chatMode, setChatMode] = useState<ChatMode>('direct')
  // Cloud für Notes-Chat (OpenRouter/LLMBase): nur verfügbar, wenn in den Einstellungen
  // per zweitem Opt-in freigeschaltet. Default erster verfügbarer Provider; pro Sitzung umschaltbar.
  const cloudRoutes = cloudRoutesForFeature('notes-chat', llmSettings)
  const defaultCloudProvider = cloudRoutes[0]?.provider ?? null
  const [cloudChatProvider, setCloudChatProvider] = useState<CloudProviderId | null>(null)
  useEffect(() => { setCloudChatProvider(defaultCloudProvider) }, [defaultCloudProvider])
  const activeCloudRoute = cloudChatProvider ? (cloudRoutes.find(r => r.provider === cloudChatProvider) ?? null) : null
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [projectList, setProjectList] = useState<ProjectOption[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  // Kontrollierte Übernahme in den Vault: Feedback-Zustand pro Nachricht + Fehlerzeile.
  const [savedIndex, setSavedIndex] = useState<number | null>(null)
  const [appendedIndex, setAppendedIndex] = useState<number | null>(null)
  const [transferError, setTransferError] = useState<string | null>(null)
  const notesRootFolder = useUIStore(s => s.notesRootFolder)
  // Notiz-Agent Phase 1: Kontext-Dateien (PDF/Tabelle/…) für Fragen im Chat.
  // Panel-Sitzungs-Zustand — bewusst nicht pro Notiz gekeyt (der Chat ist die Einheit).
  const [chatAttachments, setChatAttachments] = useState<NoteAgentAttachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Eingabefeld wächst mit dem Inhalt (bis max-height aus dem CSS greift, dann interner Scroll)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [inputValue])

  // Markdown-Renderer für Chat-Nachrichten
  const md = useMemo(() => {
    const instance = new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true
    })
    const katexOptions = { throwOnError: false, trust: false, strict: false, displayMode: false }
    instance.use(texmath, { engine: katex, delimiters: 'dollars', katexOptions })
    instance.use(texmath, { engine: katex, delimiters: 'brackets', katexOptions })
    // Zitat-Hochzahlen als Inline-Token — nur in Text, nie in Code/Links (Codex F25).
    instance.use(citationMarkdownPlugin)

    const defaultFence = instance.renderer.rules.fence
    instance.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx]
      const info = token.info.trim().toLowerCase()
      if (info === 'mermaid') {
        notesChatMermaidCounter++
        const id = `notes-chat-mermaid-${notesChatMermaidCounter}-${Date.now()}`
        return `<div class="mermaid-container"><pre class="mermaid" id="${id}">${token.content.trim()}</pre></div>`
      }
      if (defaultFence) return defaultFence(tokens, idx, options, env, self)
      return `<pre><code class="language-${info}">${instance.utils.escapeHtml(token.content)}</code></pre>`
    }
    return instance
  }, [])

  // Aktuelle Notiz
  const currentNote = notes.find(n => n.id === selectedNoteId)

  // Verfügbare Ordner extrahieren
  const folders = Array.from(new Set(
    notes
      .map(n => n.path.split('/').slice(0, -1).join('/'))
      .filter(p => p.length > 0)
  )).sort()

  // Backend (Ollama oder LM Studio) und Modelle prüfen
  useEffect(() => {
    const checkBackend = async () => {
      setIsLoading(true)
      try {
        let available = false
        let modelList: OllamaModel[] = []

        if (llmSettings.backend === 'lm-studio') {
          available = await window.electronAPI.lmstudioCheck(llmSettings.lmStudioPort)
          if (available) {
            modelList = await window.electronAPI.lmstudioModels(llmSettings.lmStudioPort)
          }
        } else {
          available = await window.electronAPI.ollamaCheck()
          if (available) {
            modelList = await window.electronAPI.ollamaModels()
          }
        }

        setIsBackendAvailable(available)
        setModels(modelList)

        if (available && modelList.length > 0) {
          // Bevorzugt das in den Settings ausgewählte Modell, sonst intelligent auswählen
          if (llmSettings.selectedModel && modelList.some(m => m.name === llmSettings.selectedModel)) {
            setSelectedModel(llmSettings.selectedModel)
          } else {
            // Standard-Modell auswählen (bevorzugt llama3, mistral, oder das erste)
            const preferredModels = ['llama3', 'llama3.2', 'mistral', 'qwen']
            const preferred = modelList.find(m =>
              preferredModels.some(p => m.name.toLowerCase().includes(p))
            )
            if (preferred) {
              setSelectedModel(preferred.name)
            } else {
              setSelectedModel(modelList[0].name)
            }
          }
        }
      } catch (err) {
        console.error('[NotesChat] Error checking backend:', err)
      } finally {
        setIsLoading(false)
      }
    }

    checkBackend()
  }, [llmSettings.backend, llmSettings.lmStudioPort, llmSettings.selectedModel])

  // Auto-scroll zu neuen Nachrichten (scrollt nur den Container, nicht das ganze Fenster)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  // Mermaid-Diagramme rendern (nur auf finalen messages, nicht während Streaming)
  useEffect(() => {
    if (!messagesContainerRef.current) return
    const els = messagesContainerRef.current.querySelectorAll('.mermaid:not([data-processed])')
    if (els.length === 0) return
    const timeoutId = setTimeout(async () => {
      try {
        await mermaid.run({ nodes: els as NodeListOf<HTMLElement> })
        els.forEach(el => el.setAttribute('data-processed', 'true'))
      } catch (error) {
        console.error('[NotesChat] Mermaid render error:', error)
      }
    }, 50)
    return () => clearTimeout(timeoutId)
  }, [messages])

  // Add copy buttons to markdown code blocks in chat messages
  useEffect(() => {
    if (!messagesContainerRef.current) return

    const applyCodeCopyButtons = () => {
      const root = messagesContainerRef.current
      if (!root) return

      const codeBlocks = root.querySelectorAll('.notes-chat-message-content pre > code')
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
  }, [messages, streamingContent, t])

  // Löst einen Wikilink-Text auf eine Notiz-ID auf (Titel- bzw. Dateinamen-Match).
  const resolveNoteId = useCallback((text: string): string | null => {
    const norm = (s: string) => (s || '').toLowerCase().replace(/\.md$/i, '').trim()
    const t = norm(text)
    if (!t) return null
    const base = (p: string) => norm(p.split('/').pop() || '')
    let n = notes.find(x => norm(x.title) === t)
    if (!n) n = notes.find(x => base(x.path) === t)
    if (!n) n = notes.find(x => { const b = base(x.path); return b !== '' && (b.includes(t) || t.includes(b)) })
    return n ? n.id : null
  }, [notes])

  // Quellen tragen den exakten vault-relativen Pfad — hier darf nichts unscharf sein.
  // Die Wikilink-Auflösung (resolveNoteId) vergleicht zuletzt „enthält" und traf bei
  // einer Mail-Notiz „…/2026-07-01 …" die Brain-Tagesnotiz „01.md" (real, 18.09.2026).
  // Exakt heißt: Notizpfad gegen den Vault relativiert und gleich, kein Suffix-Raten (F28).
  const resolveSourceNoteId = useCallback((fileRel: string): string | null => {
    if (!vaultPath) return null
    return findNoteByVaultPath(notes, fileRel, vaultPath)?.id ?? null
  }, [notes, vaultPath])

  // Quellenklick (F28): Hash im Main prüfen, Stelle relokalisieren, Sprungziel an Notiz
  // und Fassung binden. Geändert → Notiz öffnet oben mit sichtbarem Hinweis; fehlt → nur Hinweis.
  const [sourceNotice, setSourceNotice] = useState<string | null>(null)
  const sourceNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSourceNotice = useCallback((text: string) => {
    setSourceNotice(text)
    if (sourceNoticeTimer.current) clearTimeout(sourceNoticeTimer.current)
    sourceNoticeTimer.current = setTimeout(() => setSourceNotice(null), 7000)
  }, [])
  useEffect(() => {
    const onJump = (e: Event) => {
      const detail = (e as CustomEvent<{ status: 'ok' | 'changed' }>).detail
      if (detail?.status === 'changed') showSourceNotice(t('notesChat.vaultSourceChanged'))
    }
    window.addEventListener('mindgraph:sourceJump', onJump)
    return () => window.removeEventListener('mindgraph:sourceJump', onJump)
  }, [showSourceNotice, t])
  // Klick-Token, Vault-Bindung und exakte Auflösung liegen in `sourceJump.ts` (testbar, F28).
  const sourceDepsRef = useRef<SourceJumpDeps | null>(null)
  sourceDepsRef.current = {
    getVaultPath: () => useNotesStore.getState().vaultPath,
    locate: (v, ref) => window.electronAPI.vaultRagLocateSource(v, ref),
    resolveNoteId: (fileRel, v) => findNoteByVaultPath(useNotesStore.getState().notes, fileRel, v)?.id ?? null,
    selectNote: (id) => useNotesStore.getState().selectNote(id),
    setPendingTarget: (target) => useTabStore.getState().setPendingSourceTarget(target),
    notify: (kind, detail) => {
      if (kind === 'other-vault') showSourceNotice(t('notesChat.vaultOtherVault'))
      else if (kind === 'missing') showSourceNotice(t('notesChat.vaultSourceMissing'))
      else if (kind === 'changed') showSourceNotice(t('notesChat.vaultSourceChanged'))
      else if (kind === 'relocated') showSourceNotice(t('notesChat.vaultSourceRelocated'))
      else showSourceNotice((lang === 'de' ? 'Fehler: ' : 'Error: ') + (detail ?? ''))
    }
  }
  const openSourceRef = useRef(createSourceOpener({
    getVaultPath: () => sourceDepsRef.current!.getVaultPath(),
    locate: (v, ref) => sourceDepsRef.current!.locate(v, ref),
    resolveNoteId: (f, v) => sourceDepsRef.current!.resolveNoteId(f, v),
    selectNote: (id) => sourceDepsRef.current!.selectNote(id),
    setPendingTarget: (target) => sourceDepsRef.current!.setPendingTarget(target),
    notify: (kind, detail) => sourceDepsRef.current!.notify(kind, detail)
  }))
  const openSource = useCallback((msg: ChatMessage, hit: VaultRagHitDto) => openSourceRef.current(msg, hit), [])
  // Vault-Wechsel räumt ein noch nicht konsumiertes Sprungziel auf.
  useEffect(() => {
    const target = useTabStore.getState().pendingSourceTarget
    if (target && target.vaultPath !== vaultPath) useTabStore.getState().setPendingSourceTarget(null)
  }, [vaultPath])

  // Vault-Antwort: Zitat-Hochzahlen entstehen an den Spannen des Prüfers (dieselbe
  // Ersetzung wie der Export) als Markdown-Token — keine Ersetzung im fertigen HTML (F25).
  const renderMessageHtml = (msg: ChatMessage): string => {
    if (!msg.citations) return linkifyWikilinks(sanitizeHtml(md.render(msg.content)), resolveNoteId)
    const { hits, report } = msg.citations
    const sameVault = msg.vaultPath === vaultPath
    const env: CitationEnv = {
      cites: {
        resolve: (n) => {
          const hit = hits[n - 1]
          if (!hit) return null
          return { noteId: sameVault ? resolveSourceNoteId(hit.fileRel) : null, fileRel: hit.fileRel }
        }
      }
    }
    return linkifyWikilinks(sanitizeHtml(md.render(markCitationRefs(msg.content, report), env)), resolveNoteId)
  }

  const renderVaultFooter = (msg: ChatMessage) => {
    const c = msg.citations
    if (!c) return null
    const sameVault = msg.vaultPath === vaultPath
    const { report, hits } = c
    const flagged = flaggedSentences(report)
    const flagClass = (status: string) =>
      status === 'uncited' ? 'is-uncited' : status === 'cited-low' ? 'is-low' : status === 'cited-invalid' ? 'is-invalid' : 'is-quote'
    return (
      <div className="nc-vault-footer">
        <h5>{t('notesChat.vaultSources')}</h5>
        <ol className="nc-vault-sources">
          {hits.map((h, i) => {
            const base = (h.fileRel.split('/').pop() || h.fileRel).replace(/\.md$/i, '')
            const id = sameVault ? resolveSourceNoteId(h.fileRel) : null
            return (
              <li key={i}>
                <span className="nc-source-n">[{i + 1}]</span>
                {id
                  ? <span className="nc-source-link" role="link" tabIndex={0} data-note={id} data-cite={i + 1} title={h.fileRel}>{base}</span>
                  : <span title={sameVault ? h.fileRel : t('notesChat.vaultOtherVault')}>{base}</span>}
                <span className="nc-source-meta">
                  {h.heading ? ` › ${h.heading}` : ''} · {lang === 'de' ? 'Zeile' : 'line'} {h.startLine}
                  {h.fresh === 'relocated' ? ` · ${t('notesChat.vaultRelocated')}` : ''}
                </span>
              </li>
            )
          })}
        </ol>
        <h5>{t('notesChat.vaultCheck')}</h5>
        <div className="nc-vault-summary">
          {t('notesChat.vaultCheckSummary', {
            sentences: report.summary.sentences, uncited: report.summary.uncited, low: report.summary.low,
            invalid: report.summary.invalidRefs, quotes: report.summary.quotesNotFound
          })}
        </div>
        {report.summary.unchecked > 0 && <div className="nc-vault-summary">{t('notesChat.vaultUnchecked', { n: report.summary.unchecked })}</div>}
        {flagged.length > 0 && (
          <ul className="nc-vault-flags">
            {flagged.map((sn, i) => {
              const status = sn.status === 'cited-high' || sn.status === 'cited-unchecked' ? 'quote' : sn.status
              const text = msg.content.slice(sn.start, sn.end).replace(/\s+/g, ' ')
              return (
                <li key={i}>
                  <span className={`nc-flag ${flagClass(status)}`} />
                  <span className="nc-flag-text">
                    <b>{flagLabelFor(sn)}:</b> {text.length > 140 ? `${text.slice(0, 140)}…` : text}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {c.excludeMismatch && <div className="nc-vault-legend">{t('notesChat.vaultExcludeMismatch')}</div>}
        <div className="nc-vault-legend">{t('notesChat.vaultLegend')}</div>
      </div>
    )
  }

  const handleMessagesClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement

    // Quellen-Fußnote oder Zitat-Hochzahl → Quelle mit Frischeprüfung öffnen (F28).
    const source = target.closest('.nc-cite[data-note], .nc-source-link[data-note]') as HTMLElement | null
    if (source) {
      e.preventDefault()
      e.stopPropagation()
      const msgEl = source.closest('[data-msg-index]') as HTMLElement | null
      const idx = msgEl ? Number(msgEl.getAttribute('data-msg-index')) : -1
      const n = Number(source.getAttribute('data-cite') ?? source.textContent?.replace(/\D/g, ''))
      const msg = messages[idx]
      const hit = msg?.citations?.hits[n - 1]
      if (msg && hit) void openSource(msg, hit)
      return
    }

    // Klickbarer Wikilink → Notiz im Editor öffnen (Chat-Panel bleibt offen).
    const wikilink = target.closest('.nc-wikilink') as HTMLElement | null
    if (wikilink) {
      e.preventDefault()
      e.stopPropagation()
      const id = wikilink.getAttribute('data-note-id')
      if (id) useNotesStore.getState().selectNote(id)
      return
    }

    const copyButton = target.closest('.code-copy-btn') as HTMLButtonElement | null
    if (!copyButton) return

    e.preventDefault()
    e.stopPropagation()

    const pre = copyButton.closest('pre')
    const code = pre?.querySelector('code')
    const codeText = code?.textContent ?? ''
    if (!codeText) return

    writeClipboardText(codeText)
      .then(() => {
        copyButton.textContent = t('settings.sync.copied')
        copyButton.classList.add('copied')

        window.setTimeout(() => {
          copyButton.textContent = t('format.copy')
          copyButton.classList.remove('copied')
        }, 1200)
      })
      .catch((error) => {
        console.error('[NotesChat] Copy code block failed:', error)
      })
  }, [t, messages, openSource])

  // Letzte Projekt-RAG-Quellen (werden nach dem Streaming an die Antwort gehängt)
  const lastSourcesRef = useRef<Array<{ fileRel: string; heading: string }>>([])
  // Laufende Vault-Anfrage — Abbruch und Abmeldung bei Panel-Schließen, Chat-Leeren und
  // Vault-Wechsel (Codex F29); der Abbruch setzt auch Streaming-Zustand und Puffer zurück (F41).
  // Lebenszyklus in `utils/vaultRequest.ts` (testbar); die Abhängigkeiten lesen den aktuellen
  // Render-Stand über eine Ref.
  const vaultDepsRef = useRef<{ vaultPath: string | null; userMessage: string; lang: 'de' | 'en' }>({ vaultPath: null, userMessage: '', lang })
  const vaultRequesterRef = useRef<VaultRequester | null>(null)
  if (!vaultRequesterRef.current) {
    const finish = (content: string, extra: Partial<ChatMessage> = {}) => {
      const d = vaultDepsRef.current
      setStreamingContent('')
      setIsStreaming(false)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content,
        question: d.userMessage,
        timestamp: new Date(),
        origin: 'vault-rag',
        vaultPath: d.vaultPath ?? undefined,
        ...extra
      }])
    }
    vaultRequesterRef.current = createVaultRequester({
      subscribeChunk: (cb) => window.electronAPI.onVaultRagAnswerChunk(cb),
      subscribeDone: (cb) => window.electronAPI.onVaultRagAnswerDone(cb),
      answer: (v, q, id, language) => window.electronAPI.vaultRagAnswer(v, q, id, language),
      cancelRemote: (id) => { void window.electronAPI.vaultRagAnswerCancel(id) },
      onChunk: (chunk) => setStreamingContent(prev => prev + chunk),
      onDone: (payload) => {
        const d = vaultDepsRef.current
        switch (payload.kind) {
          case 'answer':
            finish(payload.answer, { model: payload.model, citations: { hits: payload.hits, report: payload.report, excludeMismatch: payload.excludeMismatch } })
            break
          case 'not-found':
            finish(t('notesChat.vaultNotFound'), { model: payload.model })
            break
          case 'no-fresh-source':
            finish(t('notesChat.vaultNoFreshSource'), { model: payload.model })
            break
          case 'cancelled':
            finish(t('notesChat.vaultCancelled'))
            break
          case 'error':
            finish((d.lang === 'de' ? 'Fehler: ' : 'Error: ') + payload.error)
            break
        }
      },
      onFailure: (error) => {
        const d = vaultDepsRef.current
        finish((d.lang === 'de' ? 'Fehler: ' : 'Error: ') + error + (/Kein Vault-Index|No vault index/i.test(error) ? ` ${t('notesChat.vaultNoIndexHint')}` : ''))
      },
      // Lokaler Abbruch: Eingabe wieder frei, kein alter Antwortteil (F41).
      onReset: () => { setStreamingContent(''); setIsStreaming(false) }
    })
  }
  const cancelVaultRequest = useCallback(() => { vaultRequesterRef.current?.cancel() }, [])
  useEffect(() => () => cancelVaultRequest(), [cancelVaultRequest])
  useEffect(() => { cancelVaultRequest() }, [vaultPath, cancelVaultRequest])

  // Streaming-Listener einrichten — sowohl normaler Notiz-Chat als auch
  // Projekt-RAG speisen denselben streamingContent/isStreaming-Fluss (nur jeweils
  // ein Kanal feuert pro Nachricht).
  // Hinweis: Die Projekt-RAG-Listener werden NICHT hier (bei Mount) registriert,
  // sondern frisch pro Anfrage in sendMessage — sonst kann eine andere Fläche
  // (Dashboard „Projekt befragen"-Modal) sie via removeAllListeners abräumen und
  // dieser Chat bekäme kein „done"/„chunk" mehr (P1, Codex-Review).
  useEffect(() => {
    window.electronAPI.onOllamaChatChunk((chunk) => {
      setStreamingContent(prev => prev + chunk)
    })
    window.electronAPI.onOllamaChatDone(() => {
      setIsStreaming(false)
    })
  }, [])

  // Letzte User-Frage speichern für Metadaten
  const lastUserQuestion = useRef<string>('')

  // Projekte für den „Projekt"-Kontextmodus laden
  useEffect(() => {
    if (!vaultPath || !projectsRootFolder) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await window.electronAPI.projectStatusDiscover(vaultPath, projectsRootFolder)
        if (!cancelled && res?.success && Array.isArray(res.projects)) {
          setProjectList(res.projects.map((p) => ({ folderRel: p.folderRel, folderName: p.folderName })))
        }
      } catch {
        /* Projekte optional — Modus bleibt nutzbar, Dropdown leer */
      }
    })()
    return () => { cancelled = true }
  }, [vaultPath, projectsRootFolder])

  // Wenn Streaming endet, Nachricht zu Messages hinzufügen
  useEffect(() => {
    if (!isStreaming && streamingContent) {
      let content = streamingContent
      if (lastSourcesRef.current.length > 0) {
        const lines = lastSourcesRef.current.map(s => {
          const base = (s.fileRel.split('/').pop() || s.fileRel).replace(/\.md$/i, '')
          return `- [[${base}]]${s.heading ? ` § ${s.heading}` : ''}`
        })
        content += `\n\n---\n**${lang === 'de' ? 'Quellen' : 'Sources'}:**\n${lines.join('\n')}`
        lastSourcesRef.current = []
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content,
        question: lastUserQuestion.current,
        model: selectedModel,
        timestamp: new Date()
      }])
      setStreamingContent('')
    }
  }, [isStreaming, streamingContent, selectedModel, lang])

  // Kontext-Text basierend auf Modus generieren
  const getContextText = useCallback(async (): Promise<string> => {
    if (!vaultPath) return ''

    let relevantNotes = notes

    switch (contextMode) {
      case 'current':
        if (currentNote) {
          relevantNotes = [currentNote]
        } else {
          return ''
        }
        break
      case 'folder':
        if (selectedFolder) {
          relevantNotes = notes.filter(n => n.path.startsWith(selectedFolder + '/') || n.path === selectedFolder)
        } else {
          return ''
        }
        break
      case 'all':
        // Alle Notizen (limitiert auf die ersten 50 um Kontext nicht zu sprengen)
        relevantNotes = notes.slice(0, 50)
        break
    }

    // Lade Inhalte für Notizen ohne Content
    const notesNeedingContent = relevantNotes.filter(n => !n.content)
    if (notesNeedingContent.length > 0) {
      const paths = notesNeedingContent.map(n => n.path)
      const contents = await window.electronAPI.readFilesBatch(vaultPath, paths)
      for (const note of notesNeedingContent) {
        if (contents[note.path]) {
          (note as any)._loadedContent = contents[note.path]
        }
      }
    }

    // Kontext-Text erstellen
    const contextParts: string[] = []
    for (const note of relevantNotes) {
      const content = note.content || (note as any)._loadedContent || ''
      if (content.trim()) {
        contextParts.push(`## ${note.title}\n${content}`)
      }
    }

    // Limitiere Kontext auf ~50000 Zeichen
    let context = contextParts.join('\n\n---\n\n')
    if (context.length > 50000) {
      context = context.slice(0, 50000) + '\n\n[... weitere Notizen gekürzt ...]'
    }

    return context
  }, [contextMode, currentNote, selectedFolder, notes, vaultPath])

  // Notiz-Agent Phase 1: Kontext-Dateien anhängen/entfernen (Main-Registry via IPC).
  const attachFromDialog = useCallback(async () => {
    setAttachError(null)
    const res = await window.electronAPI.noteAgentAttachDialog()
    if (res.attachments.length > 0) setChatAttachments(prev => [...prev, ...res.attachments])
    if (res.errors.length > 0) setAttachError(res.errors.join(' · '))
  }, [])

  const attachFolderFromDialog = useCallback(async () => {
    setAttachError(null)
    const res = await window.electronAPI.noteAgentAttachFolderDialog()
    if (res.attachments.length > 0) setChatAttachments(prev => [...prev, ...res.attachments])
    if (res.errors.length > 0) setAttachError(res.errors.join(' · '))
  }, [])

  const attachVaultFile = useCallback(async (relPath: string) => {
    if (!vaultPath) return
    setAttachError(null)
    const res = await window.electronAPI.noteAgentAttachVaultFile(vaultPath, relPath)
    if (res.attachments.length > 0) setChatAttachments(prev => [...prev, ...res.attachments])
    if (res.errors.length > 0) setAttachError(res.errors.join(' · '))
  }, [vaultPath])

  const detachFile = useCallback(async (id: string) => {
    setAttachError(null)
    await window.electronAPI.noteAgentDetach(id)
    setChatAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  // Auto-Kontext: die links geöffnete PDF-/Office-Datei wandert automatisch als Chip
  // in den Chat — „aktuell geöffnet = Kontext", wie bei einer Notiz. Der Auto-Chip
  // folgt der Auswahl (alter wird entfernt, neuer angehängt); manuell angehängte
  // Chips bleiben unberührt. Entfernt der Nutzer den Auto-Chip, kommt er für dieselbe
  // Datei nicht wieder (Ref merkt sich den Pfad).
  const autoCtxRef = useRef<{ path: string; id: string | null } | null>(null)
  useEffect(() => {
    if (!vaultPath || contextMode === 'project') return
    // Auch bei ausgewählter PDF-Begleitnotiz (<name>.pdf.md) das Quell-PDF mitnehmen —
    // die Companion ist oft fast leer, die Fragen zielen auf das PDF.
    const companionSource = currentNote?.sourcePdf
      || (currentNote && /\.pdf\.md$/i.test(currentNote.path) ? currentNote.path.slice(0, -3) : null)
    const openFile = selectedPdfPath || selectedOfficePath || companionSource || null
    const prev = autoCtxRef.current
    if (openFile === (prev?.path ?? null)) return
    if (prev?.id) void detachFile(prev.id)
    autoCtxRef.current = openFile ? { path: openFile, id: null } : null
    if (!openFile) return
    const normalizedOpenFile = openFile.replace(/\\/g, '/')
    if (chatAttachments.some(a => a.insideVault && a.name.replace(/\\/g, '/') === normalizedOpenFile)) return // bereits manuell angehängt
    void (async () => {
      const res = await window.electronAPI.noteAgentAttachVaultFile(vaultPath, openFile)
      if (res.attachments.length > 0) {
        setChatAttachments(prevA => [...prevA, ...res.attachments])
        if (autoCtxRef.current?.path === openFile) autoCtxRef.current.id = res.attachments[0].id
      }
      if (res.errors.length > 0) setAttachError(res.errors.join(' · '))
    })()
    // chatAttachments bewusst nicht in den Deps — der Pfad-Vergleich oben verhindert
    // Mehrfach-Attach, und Änderungen an den Chips sollen den Auto-Chip nicht triggern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPdfPath, selectedOfficePath, currentNote, vaultPath, contextMode, detachFile])

  // Nachricht senden
  const sendMessage = async () => {
    // selectedModel ist bei Cloud-Routing (OpenRouter) optional — dann zählt das Cloud-Modell.
    const cloudChatActive = !!activeCloudRoute
    if (!inputValue.trim() || (!selectedModel && !cloudChatActive) || isStreaming) return

    const userMessage = inputValue.trim()
    lastUserQuestion.current = userMessage
    setInputValue('')
    // Im Vault-Modus trägt auch die FRAGE die Herkunft: sie bezieht sich auf lokale
    // Notizen und darf nicht später über einen Cloud-Anbieter rausgehen (Codex F24).
    setMessages(prev => [...prev, contextMode === 'vault' && vaultPath
      ? { role: 'user', content: userMessage, origin: 'vault-rag', vaultPath }
      : { role: 'user', content: userMessage }])
    setIsStreaming(true)
    setStreamingContent('')

    // Vault-Pfad (Phase 2, klein): einzelne Frage an den Vault-Index, Antwort mit
    // Nummern-Zitaten, Zitatprüfung im Main. Jedes Ereignis trägt die requestId.
    if (contextMode === 'vault') {
      if (!vaultPath) { setIsStreaming(false); return }
      vaultDepsRef.current = { vaultPath, userMessage, lang }
      vaultRequesterRef.current?.start(vaultPath, userMessage, lang)
      return
    }

    // Projekt-RAG-Pfad: semantisches Retrieval + verankerte Antwort (nur lokal).
    if (contextMode === 'project') {
      if (!vaultPath || !selectedProject) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: lang === 'de' ? 'Bitte zuerst ein Projekt wählen.' : 'Please select a project first.'
        }])
        setIsStreaming(false)
        return
      }
      try {
        lastSourcesRef.current = []
        // Stream-Listener FRISCH registrieren → dieser Chat besitzt den Kanal für
        // diese Anfrage (falls eine andere Fläche ihn zwischenzeitlich übernahm).
        let streamDone = false
        window.electronAPI.onProjectRagAnswerChunk((chunk) => setStreamingContent(prev => prev + chunk))
        window.electronAPI.onProjectRagAnswerSources((sources) => {
          lastSourcesRef.current = sources.map(s => ({ fileRel: s.fileRel, heading: s.heading }))
        })
        window.electronAPI.onProjectRagAnswerDone(() => { streamDone = true; setIsStreaming(false) })

        const embedModel = llmSettings.projectRagEmbeddingModel || 'bge-m3'
        const res = await window.electronAPI.projectRagAnswer(
          vaultPath, selectedProject, userMessage, embedModel, selectedModel, lang
        )
        if (!res.success) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: (lang === 'de' ? 'Fehler: ' : 'Error: ') + (res.error || (lang === 'de' ? 'Unbekannt' : 'Unknown'))
          }])
          setIsStreaming(false)
        } else if (!streamDone) {
          // Backstop: „done" ging verloren (Kanal von anderer Fläche überschrieben).
          // Der await ist nach Stream-Ende aufgelöst → Volltext nachziehen, falls keine
          // Chunks ankamen, damit der Streaming-Ende-Effekt die Antwort rendert.
          setStreamingContent(prev => prev || res.response || '')
          setIsStreaming(false)
        }
      } catch (err) {
        console.error('[NotesChat] Projekt-RAG Fehler:', err)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: lang === 'de' ? 'Fehler bei der Projekt-Abfrage.' : 'Project query failed.'
        }])
        setIsStreaming(false)
      }
      return
    }

    try {
      const context = await getContextText()
      // Angehängte Kontext-Dateien zählen als Kontext — auch ohne passende Notizen.
      const attachmentIds = chatAttachments.length > 0 ? chatAttachments.map(a => a.id) : undefined
      if (!context && !attachmentIds) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Keine Notizen zum Chatten verfügbar. Wähle eine Notiz aus oder ändere den Kontext-Modus.'
        }])
        setIsStreaming(false)
        return
      }

      // Nur die letzten 10 Nachrichten für den Chat-Verlauf — Vault-Antworten IMMER
      // ausgeschlossen (sie tragen Notiz-/Mail-Text und könnten sonst über einen
      // Cloud-Anbieter den Rechner verlassen, Codex F22), unabhängig vom Anbieter.
      const recentMessages = chatHistoryForModel(messages)
      recentMessages.push({ role: 'user', content: userMessage })

      // Cloud-Routing (OpenRouter): nur wenn freigeschaltet UND in dieser Sitzung gewählt.
      const cloud = activeCloudRoute ? { model: activeCloudRoute.model, provider: activeCloudRoute.provider } : null

      // Backend-basierte API-Auswahl (Cloud hat Vorrang, wenn gewählt)
      let res: { success?: boolean; error?: string } | undefined
      if (cloud) {
        res = await window.electronAPI.ollamaChat(selectedModel, recentMessages, context, chatMode, cloud, attachmentIds)
      } else if (llmSettings.backend === 'lm-studio') {
        res = await window.electronAPI.lmstudioChat(selectedModel, recentMessages, context, chatMode, llmSettings.lmStudioPort, attachmentIds)
      } else {
        res = await window.electronAPI.ollamaChat(selectedModel, recentMessages, context, chatMode, null, attachmentIds)
      }
      // Fehler sichtbar machen (z.B. fail-closed bei nicht lesbarer Kontext-Datei).
      if (res && res.success === false && res.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: (lang === 'de' ? 'Fehler: ' : 'Error: ') + res.error }])
        setIsStreaming(false)
      }
    } catch (err) {
      console.error('[NotesChat] Error sending message:', err)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Fehler beim Senden der Nachricht. Bitte versuche es erneut.'
      }])
      setIsStreaming(false)
    }
  }

  // Enter zum Senden (Shift+Enter für neue Zeile)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Chat leeren
  const clearChat = () => {
    cancelVaultRequest()
    setMessages([])
    setStreamingContent('')
    setIsStreaming(false)
  }

  // Provenienz-Callout (KI-generiert: Frage, Modell, Datum) — eine Quelle für
  // Kopieren, „Als Notiz speichern" und „An Notiz anhängen".
  // KI-Provenienz ins Frontmatter (Badge im Lesen-Modus). Ohne bekanntes Modell
  // bleibt die Notiz ungestempelt — ein leeres Badge wäre irreführender als keines.
  const stampAi = (content: string, msg: ChatMessage): string => {
    if (!msg.model) return content
    const date = msg.timestamp ? msg.timestamp.toISOString().slice(0, 10) : todayIsoDate()
    return setAiProvenanceInContent(content, msg.model, date)
  }

  // Fußnoten für Vault-Antworten (Codex F27): Marker nur aus dem Prüfer-Report, Fußnoten-IDs
  // eindeutig pro Antwort (mehrfaches Anhängen kollidiert nicht), Wikilink mit vollem
  // vault-relativen Pfad (gleichnamige Dateien in verschiedenen Ordnern bleiben unterscheidbar),
  // Prüfdetails pro markiertem Satz statt nur Summen.
  const flaggedSentences = (report: CitationReport): SentenceCheck[] =>
    report.sentences.filter(s => s.status === 'uncited' || s.status === 'cited-low' || s.status === 'cited-invalid' || s.quotes.some(q => !q.found))
  const flagLabelFor = (sn: SentenceCheck): string => {
    const parts: string[] = []
    if (sn.status === 'uncited') parts.push(t('notesChat.vaultStatusUncited'))
    if (sn.status === 'cited-low') parts.push(t('notesChat.vaultStatusLow'))
    if (sn.status === 'cited-invalid') parts.push(t('notesChat.vaultStatusInvalid'))
    if (sn.quotes.some(q => !q.found)) parts.push(t('notesChat.vaultStatusQuote'))
    return parts.join(', ')
  }
  const withVaultFootnotes = (msg: ChatMessage): string => {
    if (!msg.citations) return msg.content
    const { hits, report } = msg.citations
    // ID pro Einfügevorgang (Zeit + Zufall): dieselbe Antwort zweimal angehängt kollidiert nicht.
    const fid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    const body = replaceCitationRefs(msg.content, report, (n) => `[^q${fid}-${n}]`)
    // Wikilinks können `|` und `]` nicht tragen: solche Pfade werden unverändert, aber
    // unverlinkt als Code ausgegeben — keine „ähnliche" Schreibweise, die ins Leere zeigt.
    const sourceLink = (rel: string) => {
      const noExt = rel.replace(/\.md$/i, '')
      const base = noExt.split('/').pop() || noExt
      return /[|\]]/.test(noExt) ? `\`${rel}\`` : `[[${noExt}|${base}]]`
    }
    const lines = hits.map((h, i) => `[^q${fid}-${i + 1}]: ${sourceLink(h.fileRel)}${h.heading ? ` › ${h.heading}` : ''} (${lang === 'de' ? 'Zeile' : 'line'} ${h.startLine})`)
    const summary = t('notesChat.vaultCheckSummary', {
      sentences: report.summary.sentences, uncited: report.summary.uncited, low: report.summary.low,
      invalid: report.summary.invalidRefs, quotes: report.summary.quotesNotFound
    })
    const details = flaggedSentences(report).map(sn => {
      const text = msg.content.slice(sn.start, sn.end).replace(/\s+/g, ' ')
      return `> - **${flagLabelFor(sn)}:** ${text.length > 160 ? `${text.slice(0, 160)}…` : text}`
    })
    const unchecked = report.summary.unchecked > 0 ? `\n> ${t('notesChat.vaultUnchecked', { n: report.summary.unchecked })}` : ''
    return `${body}\n\n${lines.join('\n')}\n\n> ${t('notesChat.vaultCheck')}: ${summary}${unchecked}${details.length ? `\n${details.join('\n')}` : ''}\n> ${t('notesChat.vaultLegend')}`
  }
  // Export in einen anderen Vault: Wikilinks zeigten ins Leere → blockieren, nicht still speichern.
  const blockedByOtherVault = (msg: ChatMessage): boolean => {
    if (msg.citations && msg.vaultPath !== vaultPath) {
      setTransferError(t('notesChat.vaultOtherVault'))
      return true
    }
    return false
  }

  const buildProvenanceBlock = (msg: ChatMessage): string => {
    const dateStr = msg.timestamp
      ? msg.timestamp.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : ''
    const timeStr = msg.timestamp
      ? msg.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : ''
    let block = '\n\n---\n'
    block += `> [!quote] KI-generiert\n`
    if (msg.question) {
      block += `> **Frage:** *${msg.question}*\n`
    }
    block += `> **Modell:** ${msg.model || 'unbekannt'} | ${dateStr}, ${timeStr}`
    return block
  }

  // Nachricht kopieren mit Metadaten
  const copyMessage = async (msg: ChatMessage, index: number) => {
    try {
      await writeClipboardText(withVaultFootnotes(msg) + buildProvenanceBlock(msg))
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (err) {
      console.error('[NotesChat] Copy failed:', err)
    }
  }

  // „Als neue Notiz speichern": legt die Antwort samt Provenienz-Callout als
  // Notiz im Standard-Notizordner an (gleicher Zielort wie „Neue Notiz" in der
  // Sidebar) und öffnet sie — die Übernahme ist damit sofort sichtbar.
  const saveAsNote = async (msg: ChatMessage, index: number) => {
    if (!vaultPath) return
    setTransferError(null)
    if (blockedByOtherVault(msg)) return
    try {
      const rawTitle = (msg.question || '').replace(/\s+/g, ' ').trim()
      const safeTitle = rawTitle
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/[\\/:*?"<>|#[\]]/g, '')
        .trim()
        .substring(0, 60) || t('notesChat.aiAnswerTitle')
      const d = msg.timestamp || new Date()
      const stamp = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
        String(d.getHours()).padStart(2, '0'),
        String(d.getMinutes()).padStart(2, '0')
      ].join('')
      const targetFolder = notesRootFolder.trim().replace(/^\/+|\/+$/g, '')
      // Zielordner VOR der Kollisionsprüfung anlegen: fehlt er in diesem Vault (Standard-
      // Notizordner eines anderen Vaults), wies `readFileOptional` den Pfad ab und die
      // Übernahme scheiterte (real, 19.09.2026, Modelltest-Vault).
      if (targetFolder) {
        await window.electronAPI.ensureDir(`${vaultPath}/${targetFolder}`)
      }

      // Kollision vermeiden: jeder Kandidat wird vor der Wahl geprüft, nie überschreiben (F40).
      const relFor = (name: string) => (targetFolder ? `${targetFolder}/${name}` : name)
      const fileName = await reserveFreeNoteName(`${stamp} - ${safeTitle}`, async (name) => {
        const existing = await window.electronAPI.readFileOptional(`${vaultPath}/${relFor(name)}`)
        return existing !== null && existing !== undefined
      })
      if (!fileName) {
        setTransferError(t('notesChat.saveAsNoteNoFreeName'))
        return
      }
      const relativePath = relFor(fileName)

      const frontmatter = `---\ntitle: "${safeTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\ncreated: ${d.toISOString()}\n---\n\n`
      // Frontmatter-Stempel fürs KI-Badge im Lesen-Modus; der Provenienz-Callout im
      // Body bleibt zusätzlich (er trägt die gestellte Frage).
      const content = stampAi(
        `${frontmatter}${withVaultFootnotes(msg)}${buildProvenanceBlock(msg)}\n`,
        msg
      )
      const filePath = `${vaultPath}/${relativePath}`
      await window.electronAPI.writeFile(filePath, content)
      const note = await createNoteFromFile(filePath, relativePath, content)
      const store = useNotesStore.getState()
      store.addNote(note)
      store.selectNote(note.id)
      setSavedIndex(index)
      setTimeout(() => setSavedIndex(null), 2000)
    } catch (err) {
      console.error('[NotesChat] Save as note failed:', err)
      setTransferError(t('notesChat.transferFailed'))
    }
  }

  // „An aktuelle Notiz anhängen": liest den Notiz-Inhalt frisch von Platte
  // (Store-Content kann Cache-bedingt leer sein), hängt Antwort + Provenienz an
  // und aktualisiert den Store — gleiches Muster wie der PDF-Companion-Append.
  const appendToCurrentNote = async (msg: ChatMessage, index: number) => {
    if (!vaultPath || !currentNote) return
    setTransferError(null)
    if (blockedByOtherVault(msg)) return
    try {
      const filePath = `${vaultPath}/${currentNote.path}`
      const existing = await window.electronAPI.readFile(filePath)
      const sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
      const newContent = stampAi(
        `${existing}${sep}${withVaultFootnotes(msg)}${buildProvenanceBlock(msg)}\n`,
        msg
      )
      await window.electronAPI.writeFile(filePath, newContent)
      useNotesStore.getState().updateNote(currentNote.id, { content: newContent })
      setAppendedIndex(index)
      setTimeout(() => setAppendedIndex(null), 2000)
    } catch (err) {
      console.error('[NotesChat] Append to note failed:', err)
      setTransferError(t('notesChat.transferFailed'))
    }
  }

  // Kontext-Info Text
  const getContextInfo = (): string => {
    switch (contextMode) {
      case 'current': {
        if (currentNote) return `${t('notesChat.notePrefix')}: ${currentNote.title}`
        // Geöffnete PDF-/Office-Datei zählt als aktueller Kontext (Auto-Chip).
        const openFile = selectedPdfPath || selectedOfficePath
        if (openFile) return `${t('notesChat.filePrefix')}: ${openFile.split('/').pop()}`
        return t('notesChat.noNoteSelected')
      }
      case 'folder':
        if (selectedFolder) {
          const count = notes.filter(n => n.path.startsWith(selectedFolder + '/') || n.path === selectedFolder).length
          return `${t('notesChat.folderPrefix')}: ${selectedFolder} (${count} ${t('notesChat.notesCount')})`
        }
        return t('notesChat.noFolderSelected')
      case 'all':
        return `${t('notesChat.allNotes')} (${Math.min(notes.length, 50)} ${t('notesChat.ofNotes')} ${notes.length})`
      case 'vault':
        return t('notesChat.vaultMode')
      case 'project': {
        if (!selectedProject) return lang === 'de' ? 'Kein Projekt gewählt' : 'No project selected'
        const proj = projectList.find(p => p.folderRel === selectedProject)
        return `${lang === 'de' ? 'Projekt' : 'Project'}: ${proj?.folderName || selectedProject}`
      }
    }
  }

  return (
    <div className="notes-chat-panel">
      <PanelHeader
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        }
        title="Notes Chat"
        onClose={onClose}
        closeTitle={t('panel.close')}
      />

      {isLoading ? (
        <div className="notes-chat-loading">
          <div className="notes-chat-spinner"></div>
          <p>Prüfe {llmSettings.backend === 'lm-studio' ? 'LM Studio' : 'Ollama'}...</p>
        </div>
      ) : !isBackendAvailable && cloudRoutes.length === 0 ? (
        <div className="notes-chat-unavailable">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>{llmSettings.backend === 'lm-studio' ? 'LM Studio' : 'Ollama'} nicht verfügbar</p>
          <span>
            {llmSettings.backend === 'lm-studio'
              ? 'Starte LM Studio und lade ein Modell'
              : 'Starte Ollama für den Chat mit deinen Notizen'}
          </span>
        </div>
      ) : models.length === 0 && cloudRoutes.length === 0 ? (
        <div className="notes-chat-unavailable">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <p>Kein Chat-Modell</p>
          <span>
            {llmSettings.backend === 'lm-studio'
              ? 'Lade ein Modell in LM Studio'
              : 'Installiere z.B.: ollama pull llama3.2'}
          </span>
        </div>
      ) : (
        <>
          {/* Einstellungen */}
          <div className="notes-chat-settings">
            <div className="notes-chat-model-row">
              <label>Modell:</label>
              <ModelPicker
                value={activeCloudRoute ? activeCloudRoute.sentinel : selectedModel}
                models={[...cloudRoutes.map(r => ({ name: r.sentinel })), ...models]}
                onChange={(name) => {
                  const provider = cloudProviderForSentinel(name)
                  if (provider) { setCloudChatProvider(provider) }
                  else { setCloudChatProvider(null); setSelectedModel(name) }
                }}
                getLabel={(name) => cloudRoutes.find(r => r.sentinel === name)?.label ?? name}
                disabled={isStreaming}
                ariaLabel="Modell"
              />
            </div>

            <div className="notes-chat-context-row">
              <label>Kontext:</label>
              <div className="notes-chat-context-buttons">
                <button
                  className={contextMode === 'current' ? 'active' : ''}
                  onClick={() => setContextMode('current')}
                  disabled={isStreaming}
                  title="Aktuelle Notiz"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </button>
                <button
                  className={contextMode === 'folder' ? 'active' : ''}
                  onClick={() => setContextMode('folder')}
                  disabled={isStreaming}
                  title="Ordner"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                {projectRagEnabled ? (
                  <button
                    className={`has-label ${contextMode === 'vault' ? 'active' : ''}`}
                    onClick={() => setContextMode('vault')}
                    disabled={isStreaming}
                    title={t('notesChat.vaultMode')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                      <path d="m9 10 2 2 4-4"/>
                    </svg>
                    <span>{t('notesChat.vaultLabel')}</span>
                  </button>
                ) : (
                  <button
                    className={contextMode === 'all' ? 'active' : ''}
                    onClick={() => setContextMode('all')}
                    disabled={isStreaming}
                    title="Alle Notizen"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </button>
                )}
                {projectRagEnabled && (
                  <button
                    className={contextMode === 'project' ? 'active' : ''}
                    onClick={() => setContextMode('project')}
                    disabled={isStreaming}
                    title={lang === 'de' ? 'Projekt (semantisches RAG, lokal)' : 'Project (semantic RAG, local)'}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="2.5"/>
                    </svg>
                  </button>
                )}
              </div>
              {contextMode === 'folder' && (
                <select
                  className="notes-chat-folder-select"
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  disabled={isStreaming}
                >
                  <option value="">{t('notesChat.selectFolder')}</option>
                  {folders.map(folder => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              )}
              {contextMode === 'project' && (
                <select
                  className="notes-chat-folder-select"
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  disabled={isStreaming}
                >
                  <option value="">{lang === 'de' ? 'Projekt wählen…' : 'Choose project…'}</option>
                  {projectList.map(p => (
                    <option key={p.folderRel} value={p.folderRel}>
                      {p.folderName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="notes-chat-context-info">
              {getContextInfo()}
            </div>

            <div className="notes-chat-mode">
              <label>{t('notesChat.modeLabel')}</label>
              <div className="notes-chat-mode-buttons">
                <button
                  className={chatMode === 'direct' ? 'active' : ''}
                  onClick={() => setChatMode('direct')}
                  disabled={isStreaming}
                  title={t('notesChat.modeDirectTitle')}
                >
                  {t('notesChat.modeDirect')}
                </button>
                <button
                  className={chatMode === 'socratic' ? 'active' : ''}
                  onClick={() => setChatMode('socratic')}
                  disabled={isStreaming}
                  title={t('notesChat.socraticMode')}
                >
                  {t('notesChat.modeSocratic')}
                </button>
                <button
                  className={chatMode === 'grill' ? 'active' : ''}
                  onClick={() => setChatMode('grill')}
                  disabled={isStreaming}
                  title={t('notesChat.grillMode')}
                >
                  {t('notesChat.modeGrill')}
                </button>
              </div>
            </div>
          </div>

          {sourceNotice && <div className="nc-source-notice" role="status">{sourceNotice}</div>}
          {/* Chat-Nachrichten */}
          <div className="notes-chat-messages" ref={messagesContainerRef} onClick={handleMessagesClick}>
            {messages.length === 0 && !streamingContent ? (
              <div className="notes-chat-welcome">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>{t('notesChat.askQuestions')}</p>
                <span>{t('notesChat.aiContext')}</span>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`notes-chat-message ${msg.role}`} data-msg-index={idx}>
                    <div
                      className="notes-chat-message-content markdown-content"
                      dangerouslySetInnerHTML={{ __html: renderMessageHtml(msg) }}
                    />
                    {msg.citations && renderVaultFooter(msg)}
                    {msg.role === 'assistant' && (
                      <div className="notes-chat-msg-actions">
                        <button
                          className={`notes-chat-copy ${copiedIndex === idx ? 'copied' : ''}`}
                          onClick={() => copyMessage(msg, idx)}
                          title={copiedIndex === idx ? 'Kopiert!' : 'Kopieren'}
                        >
                          {copiedIndex === idx ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                          )}
                        </button>
                        <button
                          className={`notes-chat-copy ${savedIndex === idx ? 'copied' : ''}`}
                          onClick={() => saveAsNote(msg, idx)}
                          title={savedIndex === idx ? t('notesChat.saveAsNoteDone') : t('notesChat.saveAsNote')}
                        >
                          {savedIndex === idx ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="12" y1="18" x2="12" y2="12"/>
                              <line x1="9" y1="15" x2="15" y2="15"/>
                            </svg>
                          )}
                        </button>
                        {currentNote && (
                          <button
                            className={`notes-chat-copy ${appendedIndex === idx ? 'copied' : ''}`}
                            onClick={() => appendToCurrentNote(msg, idx)}
                            title={appendedIndex === idx ? t('notesChat.appendToNoteDone') : `${t('notesChat.appendToNote')}: ${currentNote.title}`}
                          >
                            {appendedIndex === idx ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 10 20 15 15 20"/>
                                <path d="M4 4v7a4 4 0 0 0 4 4h12"/>
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {streamingContent && (
                  <div className="notes-chat-message assistant streaming">
                    <div
                      className="notes-chat-message-content markdown-content"
                      dangerouslySetInnerHTML={{ __html: linkifyWikilinks(sanitizeHtml(md.render(streamingContent)), resolveNoteId) + '<span class="notes-chat-cursor">|</span>' }}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Notiz-Agent Phase 1: Kontext-Dateien (PDF/Tabelle/…) für Fragen im Chat.
              Im Projekt-Modus ausgeblendet — Projekt-RAG hat seinen eigenen Retrieval-Pfad. */}
          {contextMode !== 'project' && (
            <div className="notes-chat-context">
              <ContextAttachmentRow
                attachments={chatAttachments}
                onAttachDialog={attachFromDialog}
                onAttachFolderDialog={attachFolderFromDialog}
                onAttachVaultFile={attachVaultFile}
                onDetach={detachFile}
                disabled={isStreaming}
                attachError={attachError}
                cloudSelected={!!activeCloudRoute || isCloudModel(selectedModel)}
              />
            </div>
          )}

          {/* Fehler bei der Vault-Übernahme (Als Notiz speichern / Anhängen) */}
          {transferError && (
            <div className="notes-chat-transfer-error">{transferError}</div>
          )}

          {/* Eingabe */}
          <div className="notes-chat-input-area">
            {messages.length > 0 && (
              <button
                className="notes-chat-clear"
                onClick={clearChat}
                disabled={isStreaming}
                title={t('notesChat.clearChat')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            )}
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('notesChat.inputPlaceholder')}
              disabled={isStreaming}
              rows={1}
            />
            <button
              className="notes-chat-send"
              onClick={sendMessage}
              disabled={!inputValue.trim() || isStreaming}
              title={t('common.send')}
            >
              {isStreaming ? (
                <div className="notes-chat-spinner-small"></div>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
