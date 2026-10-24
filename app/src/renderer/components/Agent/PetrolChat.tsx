// Chat im Agent-Tab („Mit Petrol chatten“, Stufe 1 aus docs/codex-collab/chat-und-agent.md).
//
// Gebaut als Schwester der Auftragskarte (gleiche .agent-card-Bausteine): Verlauf, Eingabe,
// im leeren Zustand Beispiele, unten die Modellzeile mit Weg-Marke. Kein Zielordner,
// keine Befugnisse, keine Notizen: der Main verwirft für chatMode 'petrol' Kontext und
// Anhänge, die Zusage „liest keine Notizen von selbst“ steht deshalb fest in der Zeile.
// Cloud wie im Notiz-Chat (Nutzerentscheidung 23.10.2026): dasselbe Opt-in
// ('notes-chat'), der Weg steht sichtbar unter der Eingabe.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'
import { useUIStore } from '../../stores/uiStore'
import { useNotesStore, createNoteFromFile } from '../../stores/notesStore'
import { useNoteAgentStore } from '../../stores/noteAgentStore'
import { usePetrolChatStore, type PetrolChatMessage } from '../../stores/petrolChatStore'
import { useTranslation, type TranslationKey } from '../../utils/translations'
import { sanitizeHtml } from '../../utils/sanitize'
import { writeClipboardText } from '../../utils/clipboard'
import { reserveFreeNoteName } from '../../utils/noteFileName'
import { ModelPicker } from '../Shared/ModelPicker'
import { cloudRoutesForFeature, cloudProviderForSentinel } from '../../../shared/llmBackend'
import { setAiProvenanceInContent } from '../../../shared/aiProvenance'
import { VAULT_CHAT_ANSWER_TYPE } from '../../../shared/rag/indexPolicy'
import type { AgentRoute } from '../../../shared/agentRoute'

interface Props {
  tabId: string
  /** Wechselt den Tab auf „Auftrag“ (Umschalter liegt in der AgentView). */
  onSwitchToTask: () => void
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

function renderMarkdown(text: string): string {
  return sanitizeHtml(md.render(text))
}

// Links aus Modelltext: das Hauptfenster verweigert jedes neue Fenster (setWindowOpenHandler →
// deny), `target=_blank` liefe ins Leere (Codex F15). Geöffnet wird nur nach bewusstem Klick
// über den freigegebenen IPC `open-external` (Allowlist http/https/mailto, wie ExternalLink).
const OPENABLE = /^(https?:|mailto:)/i
function onAnswerClick(e: React.MouseEvent<HTMLDivElement>) {
  const a = (e.target as HTMLElement).closest('a')
  if (!a) return
  e.preventDefault()
  const href = a.getAttribute('href') ?? ''
  if (OPENABLE.test(href)) void window.electronAPI.openExternal(href)
}

/** Obergrenze für den Text, der beim Übergang in den Auftragsentwurf wandert. */
const MAKE_TASK_MAX_CHARS = 6000
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)} …` : text)

export function PetrolChat({ tabId, onSwitchToTask }: Props) {
  const { t } = useTranslation()
  const ollama = useUIStore(s => s.ollama)
  const notesRootFolder = useUIStore(s => s.notesRootFolder)
  const vaultPath = useNotesStore(s => s.vaultPath)
  const scope = usePetrolChatStore(s => s.scopes[tabId])
  const activeScope = usePetrolChatStore(s => s.activeScope)
  const runPhase = useNoteAgentStore(s => s.scopes[tabId]?.run.phase ?? 'idle')
  const chat = usePetrolChatStore.getState

  const messages = scope?.messages ?? EMPTY_MESSAGES
  const streaming = scope?.streaming ?? null
  const draft = scope?.draft ?? ''
  const localModel = scope?.localModel ?? ''
  const busy = activeScope === tabId
  const busyElsewhere = !!activeScope && activeScope !== tabId

  // Modelle des aktiven Backends (Ollama bzw. LM Studio), wie im Notiz-Chat.
  const [models, setModels] = useState<Array<{ name: string }>>([])
  useEffect(() => {
    if (!ollama.enabled) return
    let cancelled = false
    ;(async () => {
      try {
        const list = ollama.backend === 'lm-studio'
          ? await window.electronAPI.lmstudioModels(ollama.lmStudioPort)
          : await window.electronAPI.ollamaModels()
        if (!cancelled && Array.isArray(list)) setModels(list)
      } catch (e) {
        console.warn('[PetrolChat] Modell-Liste laden fehlgeschlagen:', e)
      }
    })()
    return () => { cancelled = true }
  }, [ollama.enabled, ollama.backend, ollama.lmStudioPort])

  const cloudRoutes = useMemo(() => cloudRoutesForFeature('notes-chat', ollama), [ollama])
  const activeCloudRoute = scope?.cloudProvider ? (cloudRoutes.find(r => r.provider === scope.cloudProvider) ?? null) : null
  const model = localModel || ollama.selectedModel || ''
  const pickerValue = activeCloudRoute ? activeCloudRoute.sentinel : model
  const hasModel = !!activeCloudRoute || !!model

  // Modellweg aus dem Main — dieselbe Einstufung wie auf der Auftragskarte (lokal nur
  // nach Prüfung der Ollama-Metadaten). Das Zustimmungs-Gate des Agenten gilt hier nicht.
  const routeKey = `${ollama.backend}|${model}|${activeCloudRoute ? `${activeCloudRoute.provider}:${activeCloudRoute.model}` : ''}`
  // route: null = Prüfung gescheitert (Ollama nicht erreichbar o. Ä.) — eigener Hinweis statt
  // dauerhaft „wird geprüft“ (Codex F33).
  const [route, setRoute] = useState<{ key: string; route: AgentRoute | null } | null>(null)
  useEffect(() => {
    if (!hasModel) return
    let cancelled = false
    window.electronAPI.noteAgentRoutePreflight({
      model,
      localBackend: ollama.backend === 'lm-studio' ? 'lmstudio' : 'ollama',
      cloud: activeCloudRoute ? { model: activeCloudRoute.model, provider: activeCloudRoute.provider } : null
    }).then(r => {
      if (!cancelled) setRoute({ key: routeKey, route: r.success && r.route ? r.route : null })
    }).catch(() => {
      if (!cancelled) setRoute({ key: routeKey, route: null })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, hasModel])
  const routeSettled = route?.key === routeKey
  const currentRoute = routeSettled ? route.route : null
  const runtime = ollama.backend === 'lm-studio' ? 'LM Studio' : 'Ollama'
  const selectedRouteText = !routeSettled ? t('agentCard.routeChecking')
    : !currentRoute ? t('petrolChat.routeFailed')
    : currentRoute.kind === 'cloud' ? t('agentCard.routeCloud', { provider: currentRoute.providerLabel })
    : currentRoute.kind === 'local' ? t('agentCard.routeVerified', { runtime })
    : currentRoute.provider === 'lmstudio' ? t('agentCard.routeLmStudio')
    : t('agentCard.routeLocal', { runtime })
  const selectedRouteKind = !routeSettled ? 'checking' : currentRoute?.kind ?? 'unverified'
  // Während einer Antwort zeigt die Zeile den Weg DIESER Anfrage, eingefroren beim Senden —
  // nicht, was gerade in den Einstellungen steht (Codex F18).
  const active = busy ? scope?.active ?? null : null
  // Wer direkt nach der Modellwahl sendet, friert „wird geprüft“ ein; das Ergebnis wird
  // nachgetragen, sobald es für genau diesen Weg vorliegt (Codex F28).
  useEffect(() => {
    if (busy && routeSettled) chat().resolveActiveRoute(tabId, routeKey, selectedRouteText, selectedRouteKind)
  }, [busy, routeSettled, routeKey, selectedRouteText, selectedRouteKind, tabId, chat])
  const routeText = active ? active.routeText : selectedRouteText
  const routeKind = active ? active.routeKind : selectedRouteKind

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [draft, messages.length === 0])
  // Mitscrollen, solange man unten ist — wer hochgescrollt hat, wird nicht zurückgerissen.
  const stickToBottom = useRef(true)
  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages.length, streaming])

  // `text` gesetzt = „Erneut senden“ einer gescheiterten Frage; der laufende Entwurf bleibt dann
  // stehen (der Store leert den Entwurf beim Senden synchron, deshalb danach zurücklegen).
  const send = (text?: string) => {
    const question = text ?? draft
    if (!question.trim() || busy || busyElsewhere || !hasModel) return
    const keep = text !== undefined ? draft : ''
    stickToBottom.current = true
    void chat().send(tabId, question, {
      model,
      backend: ollama.backend === 'lm-studio' ? 'lm-studio' : 'ollama',
      lmStudioPort: ollama.lmStudioPort,
      cloud: activeCloudRoute ? { model: activeCloudRoute.model, provider: activeCloudRoute.provider } : null,
      run: { label: activeCloudRoute ? activeCloudRoute.label : model, routeText: selectedRouteText, routeKind: selectedRouteKind, routeKey }
    })
    if (keep) chat().setDraft(tabId, keep)
  }

  const applyChip = (text: string) => {
    chat().setDraft(tabId, text)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(text.length, text.length)
    })
  }

  // Antwort-Aktionen
  const [copiedAt, setCopiedAt] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const questionFor = (msg: PetrolChatMessage): string => {
    const i = messages.indexOf(msg)
    for (let j = i - 1; j >= 0; j--) if (messages[j].role === 'user') return messages[j].content
    return ''
  }
  const copy = async (msg: PetrolChatMessage) => {
    try {
      await writeClipboardText(msg.content)
      setCopiedAt(msg.at)
      setTimeout(() => setCopiedAt(c => (c === msg.at ? null : c)), 2000)
    } catch (e) {
      console.warn('[PetrolChat] Kopieren fehlgeschlagen:', e)
    }
  }
  // Wie „Als Notiz speichern“ im Notiz-Chat: Standard-Notizordner, nie überschreiben,
  // KI-Herkunft im Frontmatter, `ki-typ`, damit der Vault-Index die Antwort nicht als Quelle nimmt.
  const saveAsNote = async (msg: PetrolChatMessage) => {
    const vault = vaultPath
    if (!vault) return
    setSaveError(null)
    try {
      const question = questionFor(msg)
      const safeTitle = question.replace(/\s+/g, ' ')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/[\\/:*?"<>|#[\]]/g, '')
        .trim()
        .substring(0, 60)
        // Kein Punkt am Ende: sonst heißt die Datei „…Frage..md“.
        .replace(/[.\s]+$/, '') || t('petrolChat.answerTitle')
      const d = new Date(msg.at)
      const stamp = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]
        .map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0'))).join('')
      const folder = notesRootFolder.trim().replace(/^\/+|\/+$/g, '')
      if (folder) await window.electronAPI.ensureDir(`${vault}/${folder}`)
      const relFor = (name: string) => (folder ? `${folder}/${name}` : name)
      const frontmatter = `---\ntitle: "${safeTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\ncreated: ${d.toISOString()}\nki-typ: ${VAULT_CHAT_ANSWER_TYPE}\n---\n\n`
      const quote = question ? `\n\n---\n> [!quote] KI-generiert\n> **Frage:** *${question.replace(/\s+/g, ' ').slice(0, 300)}*\n> **Modell:** ${msg.model || '?'}` : ''
      let content = `${frontmatter}${msg.content}${quote}\n`
      if (msg.model) content = setAiProvenanceInContent(content, msg.model, d.toISOString().slice(0, 10))
      // Freien Namen suchen und exklusiv anlegen (Codex F16): zwischen Prüfung und Schreiben
      // kann ein zweiter Klick oder ein zweites Fenster denselben Namen nehmen — dann scheitert
      // `write-file-new` mit `exists`, und der nächste Name wird versucht. Nie überschreiben.
      const taken = new Set<string>()
      let relativePath: string | null = null
      for (let attempt = 0; attempt < 5 && !relativePath; attempt++) {
        const fileName = await reserveFreeNoteName(`${stamp} - ${safeTitle}`, async name => {
          if (taken.has(name)) return true
          const existing = await window.electronAPI.readFileOptional(`${vault}/${relFor(name)}`)
          return existing !== null && existing !== undefined
        })
        if (!fileName) break
        const res = await window.electronAPI.writeFileNew(`${vault}/${relFor(fileName)}`, content)
        if (res.success) relativePath = relFor(fileName)
        else if (res.exists) taken.add(fileName)
        else throw new Error(res.error || 'write-file-new')
      }
      if (!relativePath) { setSaveError(t('petrolChat.saveFailed')); return }
      const filePath = `${vault}/${relativePath}`
      // Vault inzwischen gewechselt (Codex F17): die Datei liegt richtig in A, aber sie gehört
      // nicht in die Dateiliste von B.
      if (useNotesStore.getState().vaultPath === vault) {
        const note = await createNoteFromFile(filePath, relativePath, content)
        // Nach dem await erneut prüfen — der Wechsel kann genau in die Wartezeit fallen (Codex F26).
        if (useNotesStore.getState().vaultPath === vault) useNotesStore.getState().addNote(note)
      }
      setSavedAt(msg.at)
      setTimeout(() => setSavedAt(c => (c === msg.at ? null : c)), 2000)
    } catch (e) {
      console.error('[PetrolChat] Speichern fehlgeschlagen:', e)
      setSaveError(t('petrolChat.saveFailed'))
    }
  }
  // Stufe 1: der Übergang füllt nur den Auftragsentwurf vor und schaltet um. Den Rest
  // (Zielordner, Befugnisse, Start) entscheidet der Nutzer auf der Karte wie bisher.
  // Frage UND Antwort wandern mit (Codex F19) — eine Antwort wie „Erstens …“ ist ohne die
  // Frage kein brauchbarer Auftrag. Ein schon begonnener Auftragsentwurf wird nicht still
  // ersetzt: der Nutzer wählt Ersetzen, Anhängen oder Abbrechen.
  const [makeFor, setMakeFor] = useState<number | null>(null)
  const makeTaskText = (msg: PetrolChatMessage) => t('petrolChat.makeTaskDraft', {
    question: clip(questionFor(msg).trim(), 1000),
    answer: clip(msg.content.trim(), MAKE_TASK_MAX_CHARS)
  })
  const applyMakeTask = (msg: PetrolChatMessage, how: 'replace' | 'append') => {
    const agent = useNoteAgentStore.getState()
    const existing = (agent.scopes[tabId]?.draft ?? '').trim()
    agent.setPickedExample(tabId, null)
    agent.setDraft(tabId, how === 'append' && existing ? `${existing}\n\n${makeTaskText(msg)}` : makeTaskText(msg))
    setMakeFor(null)
    onSwitchToTask()
  }
  const makeTask = (msg: PetrolChatMessage) => {
    const existing = (useNoteAgentStore.getState().scopes[tabId]?.draft ?? '').trim()
    if (existing) setMakeFor(msg.at)
    else applyMakeTask(msg, 'replace')
  }

  const empty = messages.length === 0 && streaming === null
  const turns = toTurns(messages)
  // Laufende Antwort hängt an der letzten Frage (sie steht schon im Verlauf).
  const lastTurn = turns[turns.length - 1]
  const routeClass = routeKind === 'local' ? '' : routeKind === 'cloud' ? 'is-out' : 'is-muted'

  const answerFoot = (msg: PetrolChatMessage) => (
    <div className="petrol-turn-foot">
      <span className="petrol-turn-model">
        {[msg.model, msg.stopped ? t('petrolChat.stopped') : ''].filter(Boolean).join(' · ')}
      </span>
      <div className="petrol-turn-actions">
        <button type="button" className="agent-card-btn" onClick={() => void copy(msg)}>{copiedAt === msg.at ? t('petrolChat.copied') : t('petrolChat.copy')}</button>
        {vaultPath && <button type="button" className="agent-card-btn" onClick={() => void saveAsNote(msg)}>{savedAt === msg.at ? t('petrolChat.saved') : t('petrolChat.saveNote')}</button>}
        <button type="button" className="agent-card-btn is-accent" onClick={() => makeTask(msg)}>{t('petrolChat.makeTask')}</button>
      </div>
      {makeFor === msg.at && (
        <div className="petrol-turn-confirm" role="group" aria-label={t('petrolChat.makeTaskExisting')}>
          <span>{t('petrolChat.makeTaskExisting')}</span>
          <div className="petrol-turn-actions">
            <button type="button" className="agent-card-btn" onClick={() => setMakeFor(null)}>{t('petrolChat.makeTaskCancel')}</button>
            <button type="button" className="agent-card-btn" onClick={() => applyMakeTask(msg, 'append')}>{t('petrolChat.makeTaskAppend')}</button>
            <button type="button" className="agent-card-btn is-primary" onClick={() => applyMakeTask(msg, 'replace')}>{t('petrolChat.makeTaskReplace')}</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    // Dieselbe Karte wie der Auftrag (.agent-card): Verlauf, Eingabe und Modellzeile sind
    // Abschnitte darin (Codex-Optikprüfung F03/F14, docs/codex-collab/chat-optik.md).
    <div className={`agent-card petrol-chat ${empty ? 'is-empty' : 'has-turns'}`}>
      {runPhase !== 'idle' && (
        <div className="petrol-chat-taskhint">
          <span>{t(runPhase === 'running' ? 'petrolChat.taskRunning' : 'petrolChat.taskWaiting')}</span>
          <button type="button" className="agent-card-link-btn is-strong" onClick={onSwitchToTask}>{t('petrolChat.showTask')}</button>
        </div>
      )}

      {!empty && (
        <div
          className="petrol-chat-list"
          ref={listRef}
          onScroll={e => {
            const el = e.currentTarget
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
        >
          {turns.map((turn, i) => {
            const isLive = streaming !== null && turn === lastTurn && !turn.answer
            return (
              <div key={turn.question?.at ?? turn.answer?.at ?? i} className="petrol-turn">
                {turn.question && (
                  <div className="petrol-turn-q">
                    <span className="petrol-turn-q-text">{turn.question.content}</span>
                    {turn.question.stopped && <span className="petrol-turn-flag">{t('petrolChat.stopped')}</span>}
                  </div>
                )}
                {turn.answer?.error ? (
                  <div className="petrol-turn-error">
                    <span>{turn.answer.content ? t('petrolChat.error', { error: turn.answer.content }) : t('petrolChat.errorEmpty')}</span>
                    {turn.question && (
                      <button type="button" className="agent-card-btn" onClick={() => send(turn.question!.content)} disabled={busy || busyElsewhere || !hasModel}>
                        {t('petrolChat.retry')}
                      </button>
                    )}
                  </div>
                ) : turn.answer ? (
                  <>
                    <div className="petrol-turn-a" onClick={onAnswerClick} dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.answer.content) }} />
                    {answerFoot(turn.answer)}
                  </>
                ) : isLive ? (
                  <>
                    {streaming
                      ? <div className="petrol-turn-a" onClick={onAnswerClick} dangerouslySetInnerHTML={{ __html: renderMarkdown(streaming) }} />
                      : <div className="petrol-turn-a"><div className="petrol-msg-wait" aria-label={t('petrolChat.waiting')}><span /><span /><span /></div></div>}
                    <div className="petrol-turn-foot">
                      <span className="petrol-turn-model">{active?.label ?? ''}</span>
                      <span className="petrol-turn-model">{t('petrolChat.writing')}</span>
                    </div>
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <div className="petrol-chat-compose">
        <div className="petrol-chat-input">
          <textarea
            ref={inputRef}
            rows={empty ? 3 : 1}
            value={draft}
            placeholder={t(empty ? 'petrolChat.placeholder' : 'petrolChat.placeholderReply')}
            aria-label={t('petrolChat.placeholder')}
            title={t('petrolChat.sendKeys')}
            onChange={e => chat().setDraft(tabId, e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
            }}
          />
          {busy ? (
            <button type="button" className="petrol-chat-send is-stop" onClick={() => chat().stop(tabId)} aria-label={t('petrolChat.stop')} title={t('petrolChat.stop')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          ) : (
            <button type="button" className="petrol-chat-send" onClick={() => send()} disabled={!draft.trim() || busyElsewhere || !hasModel} aria-label={t('petrolChat.send')} title={t('petrolChat.send')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          )}
        </div>
        <span className="agent-card-help">{t('petrolChat.sendKeys')}</span>
        {saveError && <div className="petrol-chat-note is-error">{saveError}</div>}
        {!hasModel && <div className="petrol-chat-note">{t('petrolChat.noModel')}</div>}
        {busyElsewhere && <div className="petrol-chat-note">{t('petrolChat.busyElsewhere')}</div>}
      </div>

      {/* Beispiele nur im leeren Zustand, wie auf der Auftragskarte: ein Klick füllt nur den Text. */}
      {empty && (
        <div className="agent-card-examples">
          <span className="agent-card-eyebrow">{t('agentCard.examplesTitle')}</span>
          <div className="agent-card-examples-grid">
            {CHAT_EXAMPLES.map(ex => (
              <button key={ex.title} type="button" className="agent-card-example" onClick={() => applyChip(t(ex.text))}>
                <span className="agent-card-example-icon" aria-hidden="true"><ChatGlyph icon={ex.icon} /></span>
                <span className="agent-card-example-body">
                  <span className="agent-card-example-title">{t(ex.title)}</span>
                  <span className="agent-card-example-meta">
                    {t(ex.from)} <span aria-hidden="true">&rarr;</span> <span className="is-accent">{t(ex.to)}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modell + Weg wie in der Auftragskarte: beschriftete Zeile, Weg als Marke. */}
      {/* „Neues Gespräch“ ist eine Gesprächsaktion und steht deshalb hier, nicht an der Eingabe (F15). */}
      <div className={`agent-card-row ${empty ? 'is-two-col' : ''}`}>
        <span className="agent-card-label">{t('agentCard.rowModel')}</span>
        <div className="agent-card-value">
          <ModelPicker
            value={pickerValue}
            models={[...cloudRoutes.map(r => ({ name: r.sentinel })), ...models]}
            onChange={name => {
              const provider = cloudProviderForSentinel(name)
              if (provider) chat().setModel(tabId, { cloudProvider: provider })
              else chat().setModel(tabId, { cloudProvider: null, localModel: name })
            }}
            getLabel={name => cloudRoutes.find(r => r.sentinel === name)?.label ?? name}
            disabled={busy}
            ariaLabel={t('petrolChat.modelLabel')}
            maxWidth={360}
          />
          {hasModel && (
            <div className="agent-card-tags">
              <span className={`agent-card-route ${routeClass}`}>{routeText}</span>
              <span className="agent-card-route is-muted">{t('petrolChat.noNotes')}</span>
            </div>
          )}
        </div>
        {!empty && (
          <button type="button" className="agent-card-btn" onClick={() => chat().clear(tabId)}>{t('petrolChat.newChat')}</button>
        )}
      </div>
    </div>
  )
}

interface Turn { question?: PetrolChatMessage; answer?: PetrolChatMessage }

/** Verlauf → Wechsel aus Frage und Antwort (oder Fehler); eine gestoppte Frage steht allein. */
function toTurns(messages: PetrolChatMessage[]): Turn[] {
  const out: Turn[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ question: m })
    else {
      const last = out[out.length - 1]
      if (last && !last.answer && !last.question?.stopped) last.answer = m
      else out.push({ answer: m })
    }
  }
  return out
}

type ChatIcon = 'rewrite' | 'idea' | 'explain'
const CHAT_EXAMPLES: Array<{ icon: ChatIcon; title: TranslationKey; text: TranslationKey; from: TranslationKey; to: TranslationKey }> = [
  { icon: 'rewrite', title: 'petrolChat.chip1', text: 'petrolChat.chip1Text', from: 'petrolChat.chip1From', to: 'petrolChat.chip1To' },
  { icon: 'idea', title: 'petrolChat.chip2', text: 'petrolChat.chip2Text', from: 'petrolChat.chip2From', to: 'petrolChat.chip2To' },
  { icon: 'explain', title: 'petrolChat.chip3', text: 'petrolChat.chip3Text', from: 'petrolChat.chip3From', to: 'petrolChat.chip3To' }
]

function ChatGlyph({ icon }: { icon: ChatIcon }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (icon) {
    case 'rewrite': return <svg {...common}><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
    case 'idea': return <svg {...common}><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>
    case 'explain': return <svg {...common}><path d="M4 5h16v11H9l-5 4z"/><path d="M10 9.5a2 2 0 1 1 2.6 1.9c-.4.1-.6.5-.6.9v.2M12 14.5h.01"/></svg>
  }
}

const EMPTY_MESSAGES: PetrolChatMessage[] = []
