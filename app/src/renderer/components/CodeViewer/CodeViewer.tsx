import React, { useEffect, useState, useMemo } from 'react'
import { detectLanguage } from '../../utils/codeLanguages'
import { highlightCode } from '../../utils/highlightSetup'
import { sanitizeHtml } from '../../utils/sanitize'

interface CodeViewerProps {
  vaultPath: string
  relativePath: string
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ vaultPath, relativePath }) => {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [vscodeMsg, setVscodeMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setError(null)

    const load = async (): Promise<void> => {
      try {
        const fullPath = `${vaultPath}/${relativePath}`
        const text = await window.electronAPI.readFile(fullPath) as string
        if (!cancelled) setContent(text ?? '')
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }
    load()

    return () => { cancelled = true }
  }, [vaultPath, relativePath])

  const language = useMemo(() => detectLanguage(relativePath), [relativePath])

  const highlighted = useMemo(() => {
    if (content === null) return ''
    const raw = highlightCode(content, language || 'plaintext')
    return sanitizeHtml(raw)
  }, [content, language])

  const lineCount = useMemo(() => {
    if (content === null) return 0
    return content.split('\n').length
  }, [content])

  const handleCopy = async (): Promise<void> => {
    if (content === null) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: stumm ignorieren
    }
  }

  const fileName = relativePath.split(/[/\\]/).pop() || relativePath

  return (
    <div className="code-viewer">
      <div className="code-viewer-header">
        <div className="code-viewer-title">
          <span className="code-viewer-filename">{fileName}</span>
          {language && <span className="code-viewer-lang">{language}</span>}
        </div>
        <div className="code-viewer-actions">
          <span className="code-viewer-lines">{lineCount} Zeilen</span>
          <button
            className="code-viewer-action-btn"
            onClick={async () => {
              const result = await window.electronAPI.openInVSCode(`${vaultPath}/${relativePath}`)
              if (!result.success && result.error) {
                setVscodeMsg(result.error)
                setTimeout(() => setVscodeMsg(null), 6000)
              }
            }}
            title="In VS Code öffnen"
          >
            In VS Code öffnen
          </button>
          <button
            className="code-viewer-action-btn"
            onClick={handleCopy}
            disabled={content === null}
            title="Inhalt kopieren"
          >
            {copied ? '✓ Kopiert' : 'Kopieren'}
          </button>
        </div>
      </div>

      {error && (
        <div className="code-viewer-error">
          Fehler beim Laden: {error}
        </div>
      )}

      {vscodeMsg && (
        <div className="code-viewer-error">
          {vscodeMsg}
        </div>
      )}

      {content === null && !error && (
        <div className="code-viewer-loading">Lade…</div>
      )}

      {content !== null && (
        <div className="code-viewer-body">
          <div className="code-viewer-linenums" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <pre className="code-viewer-pre">
            <code
              className={`hljs language-${language || 'plaintext'}`}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          </pre>
        </div>
      )}
    </div>
  )
}
