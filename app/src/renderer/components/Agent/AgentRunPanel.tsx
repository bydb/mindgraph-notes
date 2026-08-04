// Lauf-Anzeige des Notiz-Agenten: Provenienz, Protokoll, Web-Herkunft,
// Ergebnis-Karten mit Vorschau und die Merken-Zeile.
//
// Aus AiActionBar herausgelöst, weil der Agent jetzt zwei Zuhause hat (Macher-Leiste
// unter der Notiz und Agent-Tab). Zwei Implementierungen derselben Karten wären
// zwei Orte für dieselben Fehler.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../utils/translations'
import { ModelLogo } from '../Shared/ModelLogo'
import type { AgentRunUiState } from '../../stores/noteAgentStore'

export interface AgentPreviewResponse {
  success: boolean
  kind?: string
  binary?: boolean
  text?: string
  truncated?: boolean
  error?: string
}

interface Props {
  run: AgentRunUiState
  onCancel: () => void
  onAccept: (resultId: string) => void
  onDiscard: (resultId: string) => void
  onPreview: (resultId: string) => Promise<AgentPreviewResponse>
  onDismiss: () => void
  onRemember: (text: string) => Promise<{ success: boolean; relPath?: string; error?: string }>
}

/**
 * Abschlusstext eines Laufs. Der Store hält nur den Ausgang — übersetzt wird hier,
 * damit dieselbe Logik in beiden Oberflächen identisch aussieht.
 */
export function useAgentFinalText(run: AgentRunUiState): string {
  const { t } = useTranslation()
  if (run.phase !== 'review') return ''
  switch (run.outcome) {
    case 'evicted': return t('aiBar.agent.evicted')
    case 'cancelled': return t('aiBar.agent.cancelled')
    case 'error': return `${t('aiBar.agent.errorPrefix')}: ${run.errorText || '?'}`
    case 'ok':
      // Iterations-Limit sichtbar machen: sonst liest sich der letzte Modelltext
      // („Ich erstelle jetzt…") wie ein laufender Prozess, obwohl der Lauf vorbei ist.
      return [run.text, run.hitMaxIterations ? t('aiBar.agent.maxIterations') : ''].filter(Boolean).join('\n\n')
    default: return ''
  }
}

export function AgentRunPanel({ run, onCancel, onAccept, onDiscard, onPreview, onDismiss, onRemember }: Props) {
  const { t } = useTranslation()
  const finalText = useAgentFinalText(run)

  // Mitlernen (Stufe 3): Merksatz-Eingabe in der Review-Phase.
  const [rememberText, setRememberText] = useState('')
  const [rememberFeedback, setRememberFeedback] = useState<{ kind: 'saved'; relPath: string } | { kind: 'error'; text: string } | null>(null)
  // true, sobald der Nutzer selbst getippt/geleert hat — dann überschreibt kein Vorschlag mehr.
  const rememberTouched = useRef(false)

  useEffect(() => {
    if (!run.rememberSuggestion || rememberTouched.current || rememberText.trim()) return
    setRememberText(run.rememberSuggestion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.rememberSuggestion])

  // Neuer Lauf → Merken-Zeile zurücksetzen (sonst klebt der Vorschlag des Vorläufers).
  useEffect(() => {
    if (run.phase === 'running') {
      setRememberText('')
      setRememberFeedback(null)
      rememberTouched.current = false
    }
  }, [run.phase])

  const submitRemember = async () => {
    if (!rememberText.trim()) return
    const res = await onRemember(rememberText.trim())
    if (res.success) {
      setRememberText('')
      setRememberFeedback({ kind: 'saved', relPath: res.relPath || 'Skills/Agent-Gedächtnis.md' })
      setTimeout(() => setRememberFeedback(f => (f?.kind === 'saved' ? null : f)), 5000)
    } else {
      setRememberFeedback({ kind: 'error', text: res.error || t('aiBar.agent.rememberError') })
    }
  }

  // Vorschau-Zustand pro Ergebnis-Karte (lazy geladen, gecacht bis Dismiss).
  const [previews, setPreviews] = useState<Record<string, { open: boolean; loading: boolean; text?: string; binary?: boolean; truncated?: boolean; error?: string }>>({})

  const togglePreview = async (resultId: string) => {
    const cur = previews[resultId]
    if (cur?.open) {
      setPreviews(p => ({ ...p, [resultId]: { ...cur, open: false } }))
      return
    }
    if (cur && !cur.loading) {
      setPreviews(p => ({ ...p, [resultId]: { ...cur, open: true } }))
      return
    }
    setPreviews(p => ({ ...p, [resultId]: { open: true, loading: true } }))
    const res = await onPreview(resultId)
    setPreviews(p => ({
      ...p,
      [resultId]: {
        open: true,
        loading: false,
        text: res.text,
        binary: res.binary,
        truncated: res.truncated,
        error: res.success ? undefined : (res.error || '?')
      }
    }))
  }

  if (run.phase === 'idle') return null

  return (
    <div className="ai-bar-agent">
      {/* Provenienz: Modell + Datenweg des Laufs (analog zum Block-Diff-Kopf) */}
      {run.model && (
        <div className="ai-bar-agent-prov" title={run.model}>
          <ModelLogo model={run.model} size={13} />
          <span className="ai-bar-agent-prov-model">{run.model}</span>
          <span className="ai-bar-agent-prov-route">
            · {run.cloudLabel ? `${t('aiBar.agent.provCloud')} (${run.cloudLabel})` : t('aiBar.agent.provLocal')}
          </span>
        </div>
      )}
      {run.steps.length > 0 && (
        <div className="ai-bar-agent-steps">
          {run.steps.map(s => (
            <div key={s.seq} className="ai-bar-agent-step">{s.seq}. {s.skill}{s.summary ? ` — ${s.summary}` : ''}</div>
          ))}
        </div>
      )}
      {run.phase === 'running' && (
        <div className="ai-bar-agent-row">
          <span className="ai-bar-agent-working">{t('aiBar.agent.working')}</span>
          <button type="button" className="ai-bar-cancel" onClick={onCancel}>{t('aiBar.cancel')}</button>
        </div>
      )}
      {run.phase === 'review' && (
        <>
          {finalText && <div className="ai-bar-agent-text">{finalText}</div>}
          {/* Webrecherche-Provenienz: „N Suchen · M Seiten" inkl. Fehlversuchen (P1-1). */}
          {run.web && (run.web.searchCount > 0 || run.web.fetchCount > 0) && (
            <div className="ai-bar-agent-web">
              <div className="ai-bar-agent-web-summary">
                {run.web.searchCount} {t('aiBar.web.searchesLabel')} · {run.web.fetchCount} {t('aiBar.web.pagesLabel')}
              </div>
              {run.web.queries.map((q, i) => (
                <div key={`q${i}`} className="ai-bar-agent-web-item">
                  {t('aiBar.web.searchItem')}: „{q.query}"{q.status !== 'ok' ? ` (${t('aiBar.web.failed')})` : ''}
                </div>
              ))}
              {run.web.fetches.map((f, i) => (
                <div key={`f${i}`} className="ai-bar-agent-web-item" title={f.url}>
                  {t('aiBar.web.pageItem')}: {f.title || f.url}{f.status !== 'ok' ? ` (${t('aiBar.web.failed')})` : ''}
                </div>
              ))}
            </div>
          )}
          {run.results.map(r => (
            <div key={r.resultId} className="ai-bar-agent-card">
              <div className="ai-bar-agent-card-head">
                <span className="ai-bar-agent-card-name" title={r.suggestedName}>{r.suggestedName}</span>
                <span className="ai-bar-agent-card-meta">{r.summary}</span>
              </div>
              {r.sources.length > 0 && (
                <div className="ai-bar-agent-card-sources">{t('aiBar.agent.sources')}: {r.sources.join(', ')}</div>
              )}
              {/* Vorschau vor der Entscheidung: exakt der Inhalt, der bei
                  „Übernehmen" in den Vault geschrieben würde. */}
              {r.state === 'pending' && previews[r.resultId]?.open && (
                <div className="ai-bar-agent-preview">
                  {previews[r.resultId].loading ? (
                    <span className="ai-bar-agent-preview-loading">…</span>
                  ) : previews[r.resultId].error ? (
                    <span className="ai-bar-context-error">{previews[r.resultId].error}</span>
                  ) : previews[r.resultId].binary ? (
                    <span className="ai-bar-agent-preview-binary">{t('aiBar.agent.previewBinary')}</span>
                  ) : (
                    <>
                      <pre>{previews[r.resultId].text}</pre>
                      {previews[r.resultId].truncated && (
                        <div className="ai-bar-agent-preview-truncated">{t('aiBar.agent.previewTruncated')}</div>
                      )}
                    </>
                  )}
                </div>
              )}
              {r.state === 'pending' ? (
                <div className="ai-bar-agent-card-actions">
                  <button type="button" className="ai-bar-cancel ai-bar-agent-preview-btn" onClick={() => void togglePreview(r.resultId)}>
                    {previews[r.resultId]?.open ? t('aiBar.agent.previewHide') : t('aiBar.agent.preview')}
                  </button>
                  <button type="button" className="ai-bar-cancel" onClick={() => onDiscard(r.resultId)}>{t('aiBar.discard')}</button>
                  <button type="button" className="ai-bar-send" onClick={() => onAccept(r.resultId)}>{t('aiBar.agent.accept')}</button>
                </div>
              ) : (
                <div className="ai-bar-agent-card-state">
                  {r.state === 'accepted' ? `${t('aiBar.agent.accepted')}: ${r.finalName || r.suggestedName}` : t('aiBar.agent.discardedState')}
                </div>
              )}
              {r.error && <div className="ai-bar-context-error">{r.error}</div>}
            </div>
          ))}
          {/* Mitlernen (Stufe 3): bestätigter Merksatz → Agent-Gedächtnis-Notiz */}
          <div className="ai-bar-agent-remember">
            <input
              className="ai-bar-context-search"
              placeholder={t('aiBar.agent.rememberPlaceholder')}
              value={rememberText}
              onChange={e => { rememberTouched.current = true; setRememberText(e.target.value); if (rememberFeedback?.kind === 'error') setRememberFeedback(null) }}
              onKeyDown={e => { if (e.key === 'Enter') void submitRemember() }}
            />
            <button type="button" className="ai-bar-cancel" onClick={() => void submitRemember()} disabled={!rememberText.trim()}>
              {t('aiBar.agent.remember')}
            </button>
          </div>
          {rememberFeedback?.kind === 'saved' && (
            <div className="ai-bar-agent-remember-saved">&#10003; {t('aiBar.agent.remembered')} — {rememberFeedback.relPath}</div>
          )}
          {rememberFeedback?.kind === 'error' && (
            <div className="ai-bar-context-error">{rememberFeedback.text}</div>
          )}
          <div className="ai-bar-agent-row">
            <span />
            <button type="button" className="ai-bar-cancel" onClick={onDismiss}>{t('aiBar.agent.close')}</button>
          </div>
        </>
      )}
    </div>
  )
}
