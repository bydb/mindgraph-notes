/**
 * ProjectRagModal — „Projekt befragen" über das On-demand-RAG.
 *
 * Index-Status + „Index aktualisieren" + Frage-Feld mit Streaming-Antwort und
 * Quellen-Zitaten. Privacy: Embedding + Antwort laufen ausschließlich lokal
 * (siehe main/rag/* + IPC project-rag-*).
 */

import React, { useEffect, useRef, useState } from 'react'
import type { DiscoveredProject } from '../../../shared/types'
import type { RagIndexStatus, RetrievedChunk } from '../../../shared/rag/types'

const baseName = (fileRel: string) => (fileRel.split('/').pop() || fileRel).replace(/\.md$/i, '')

// Löst eine `[[…]]`-Referenz aus dem Antworttext auf eine Quelle auf:
// rein numerisch (`[[1]]`) → n-te Quelle (die Chunks sind im Prompt nummeriert);
// sonst Fuzzy-Match auf den Dateinamen. null = nicht auflösbar (bleibt Klartext).
function resolveSource(inner: string, sources: RetrievedChunk[]): RetrievedChunk | null {
  const t = inner.trim()
  if (/^\d+$/.test(t)) return sources[Number(t) - 1] ?? null
  const norm = (s: string) => s.toLowerCase().replace(/\.md$/i, '').trim()
  const ni = norm(t)
  if (!ni) return null
  return sources.find((s) => {
    const b = norm(baseName(s.fileRel))
    return b === ni || b.includes(ni) || ni.includes(b)
  }) ?? null
}

// Rendert den Antworttext und macht `[[…]]`-Zitate, die auf eine Quelle zeigen,
// klickbar (öffnet die Notiz). Nicht auflösbare Refs bleiben Klartext.
function renderAnswerWithLinks(
  text: string,
  sources: RetrievedChunk[],
  onOpen: (fileRel: string) => void
): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const src = resolveSource(m[1], sources)
    if (src) {
      out.push(
        <button
          key={`lnk-${key++}`}
          type="button"
          className="psw-rag-inline-link"
          onClick={() => onOpen(src.fileRel)}
          title={baseName(src.fileRel)}
        >
          {baseName(src.fileRel)}
        </button>
      )
    } else {
      out.push(m[0])
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface ProjectRagModalProps {
  vaultPath: string
  project: DiscoveredProject
  embedModel: string
  chatModel: string
  lang: 'de' | 'en'
  onClose: () => void
  onOpenSource: (fileRel: string) => void
}

export const ProjectRagModal: React.FC<ProjectRagModalProps> = ({
  vaultPath,
  project,
  embedModel,
  chatModel,
  lang,
  onClose,
  onOpenSource
}) => {
  const de = lang === 'de'
  const [status, setStatus] = useState<RagIndexStatus | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<RetrievedChunk[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const refreshStatus = async () => {
    try {
      const s = await window.electronAPI.projectRagStatus(vaultPath, project.folderRel, embedModel)
      setStatus(s)
    } catch {
      setStatus(null)
    }
  }

  useEffect(() => {
    refreshStatus()
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.folderRel, embedModel])

  const handleIndex = async () => {
    setError(null)
    setIndexing(true)
    setProgress({ done: 0, total: 0 })
    window.electronAPI.onProjectRagIndexProgress((p) => setProgress(p))
    try {
      const res = await window.electronAPI.projectRagIndex(vaultPath, project.folderRel, embedModel)
      if (!res.success) setError(res.error || (de ? 'Index-Aufbau fehlgeschlagen' : 'Index build failed'))
      await refreshStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : de ? 'Unbekannter Fehler' : 'Unknown error')
    } finally {
      setIndexing(false)
      setProgress(null)
    }
  }

  const handleAsk = async () => {
    const q = query.trim()
    if (!q || streaming) return
    setError(null)
    setAnswer('')
    setSources([])
    setStreaming(true)
    // Stream-Listener frisch registrieren (dieses Modal besitzt den Kanal für die
    // Anfrage). streamDone-Backstop: falls eine andere Fläche den Kanal übernimmt
    // und „done" verloren geht, finalisieren wir nach dem await (P1, Codex-Review).
    let streamDone = false
    window.electronAPI.onProjectRagAnswerChunk((chunk) => setAnswer((prev) => prev + chunk))
    window.electronAPI.onProjectRagAnswerSources((s) => setSources(s))
    window.electronAPI.onProjectRagAnswerDone(() => { streamDone = true; setStreaming(false) })
    try {
      const res = await window.electronAPI.projectRagAnswer(
        vaultPath,
        project.folderRel,
        q,
        embedModel,
        chatModel,
        lang
      )
      if (!res.success) {
        setError(res.error || (de ? 'Antwort fehlgeschlagen' : 'Answer failed'))
        setStreaming(false)
      } else if (!streamDone) {
        setAnswer((prev) => prev || res.response || '')
        if (res.sources) setSources(res.sources)
        setStreaming(false)
      }
      await refreshStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : de ? 'Unbekannter Fehler' : 'Unknown error')
      setStreaming(false)
    }
  }

  const sourceLabel = (c: RetrievedChunk): string => {
    const base = (c.fileRel.split('/').pop() || c.fileRel).replace(/\.md$/i, '')
    return c.heading ? `${base} § ${c.heading}` : base
  }

  const statusLine = (() => {
    if (!status) return de ? 'Status wird geladen …' : 'Loading status …'
    if (!status.exists) return de ? 'Noch nicht indexiert.' : 'Not indexed yet.'
    const base = de
      ? `${status.chunkCount} Abschnitte aus ${status.fileCount} Datei${status.fileCount === 1 ? '' : 'en'}`
      : `${status.chunkCount} chunks from ${status.fileCount} file${status.fileCount === 1 ? '' : 's'}`
    const stale = status.stale ? (de ? ' · veraltet' : ' · stale') : ''
    return base + stale
  })()

  const needsIndex = !status?.exists

  return (
    <div className="psw-modal-backdrop" onClick={onClose}>
      <div className="psw-modal psw-modal--review" onClick={(e) => e.stopPropagation()}>
        <div className="psw-modal-header">
          <h2>
            {de ? '💬 Projekt befragen' : '💬 Ask project'}
            <span className="psw-modal-subtitle">{project.folderName}</span>
          </h2>
          <button className="psw-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="psw-modal-body">
          <div className="psw-rag-statusbar">
            <span className="psw-rag-status" title={status?.model || ''}>
              {statusLine}
            </span>
            <button
              className="psw-btn psw-btn--ghost psw-btn--small"
              onClick={handleIndex}
              disabled={indexing}
              title={de ? 'Embeddings des Projektordners neu berechnen (nur geänderte Dateien)' : 'Re-embed the project folder (changed files only)'}
            >
              {indexing
                ? progress && progress.total > 0
                  ? `… ${progress.done}/${progress.total}`
                  : (de ? 'indexiere …' : 'indexing …')
                : status?.stale || needsIndex
                  ? (de ? '⟳ Index aktualisieren' : '⟳ Update index')
                  : (de ? '⟳ Neu indexieren' : '⟳ Re-index')}
            </button>
          </div>

          <p className="psw-rag-privacy">
            🔒 {de ? 'Embedding & Antwort laufen lokal über Ollama.' : 'Embedding & answer run locally via Ollama.'}
          </p>

          <div className="psw-rag-ask">
            <textarea
              ref={inputRef}
              className="psw-input psw-rag-input"
              rows={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleAsk()
                }
              }}
              placeholder={de ? 'Was möchtest du über dieses Projekt wissen? (⌘/Strg+Enter)' : 'What do you want to know about this project? (⌘/Ctrl+Enter)'}
            />
            <button
              className="psw-btn psw-btn--primary"
              onClick={handleAsk}
              disabled={streaming || !query.trim()}
            >
              {streaming ? (de ? 'antwortet …' : 'answering …') : (de ? 'Fragen' : 'Ask')}
            </button>
          </div>

          {error && <div className="psw-error">{error}</div>}

          {(answer || streaming) && (
            <div className="psw-rag-answer">
              <div className="psw-rag-answer-text">{renderAnswerWithLinks(answer, sources, onOpenSource)}{streaming && <span className="psw-rag-cursor">▍</span>}</div>
            </div>
          )}

          {sources.length > 0 && (
            <div className="psw-rag-sources">
              <div className="psw-rag-sources-title">{de ? 'Quellen' : 'Sources'}</div>
              <ul className="psw-rag-sources-list">
                {sources.map((c, i) => (
                  <li key={`${c.fileRel}-${c.chunkIndex}-${i}`}>
                    <button
                      type="button"
                      className="psw-rag-source-link"
                      onClick={() => onOpenSource(c.fileRel)}
                      title={de ? 'Notiz öffnen' : 'Open note'}
                    >
                      📄 {sourceLabel(c)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="psw-modal-footer">
          <button className="psw-btn psw-btn--primary" onClick={onClose}>
            {de ? 'Schließen' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
