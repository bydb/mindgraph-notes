// Chat im Agent-Tab („Mit Petrol chatten“, Stufe 1 aus docs/codex-collab/chat-und-agent.md).
//
// Bereich = Tab-ID, wie im noteAgentStore. Der Verlauf hält, solange die App läuft, und
// überlebt den Tab-Wechsel; beim Schließen des Tabs wird er verworfen. Gespeichert wird
// bewusst noch nichts (Stufe 2: Format, Löschen, Aufbewahrung, Verschlüsselung offen).
//
// Der Chat läuft NICHT über den Agenten-Loop (Codex F01–F05), sondern über den
// streamenden Chat-Aufruf mit chatMode 'petrol' — eigener Systemtext, keine Notizen,
// keine Werkzeuge, kein Eintrag in der Arbeitsbilanz.
//
// Jede Anfrage hat eine Kennung, die der Main an jedes Textstück hängt (Codex F13):
// Stücke einer gestoppten oder verworfenen Antwort werden verworfen, statt in der
// nächsten zu landen. „Stopp“, „Neues Gespräch“ und Tab schließen brechen den Aufruf im
// Main wirklich ab (F14) — sonst rechnete Ollama bzw. die Cloud im Hintergrund weiter.
//
// Websuche (Stufe 1b, docs/codex-collab/chat-websuche.md): mit eingeschaltetem Globus läuft
// die Nachricht über `petrol-chat-web` — Suche, Abrufe und Modell unter derselben Kennung.
// Webwechsel tragen `origin: 'web'` und gehen nie in den Verlauf fürs Modell (F09); der
// Globus geht nach jedem Senden aus.

import { create } from 'zustand'
import type { AgentTabMode } from '../../shared/workFocus'
import type { CloudProviderId } from '../../shared/llmBackend'
import type { WebChatResult, WebFetchFailure, WebSource } from '../../shared/webChat'
import { asksAboutOldWebSources, chatHistoryForModel, completedTurns, lastVisibleAnswerIsWeb, webTopicQuestions } from '../utils/chatHistory'
import { useUIStore } from './uiStore'

export interface PetrolChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Modell bzw. Cloud-Weg, das die Antwort geschrieben hat (nur assistant). */
  model?: string
  /** Per „Stopp“ abgebrochen: bei assistant ein Bruchstück, bei user eine Frage ohne jede Antwort. */
  stopped?: boolean
  /** Fehlertext statt Antwort — geht nie in den Verlauf für das Modell. */
  error?: boolean
  /** Webwechsel (Frage mit Globus + Webantwort): nie im Modellverlauf. */
  origin?: 'web'
  /** Nur Frage: die Suchwörter, die tatsächlich gesendet wurden. */
  webQuery?: string
  /** Frage zu eingefrorenen Auszügen, ohne neue Suche. */
  followUp?: boolean
  /** Kennung der Auszüge, an die diese Frage gebunden wurde — für „Erneut senden“. */
  followUpSnapshotId?: string
  /** Nur Antwort: Ergebnis aus dem Main (Quellen, Prüfbericht, Provenienz). */
  web?: WebChatResult
  /** Nur Antwort ohne Websuche: so viele frühere Webfragen gingen als Thema mit (Weg 1). */
  webTopicsUsed?: number
  /**
   * Feste App-Antwort statt Modell: Frage nach Inhalt einer alten Webantwort/Quelle, die das
   * Modell nicht sieht (Codex F01, chat-webthema-im-verlauf.md).
   */
  appNote?: 'old-web-source'
  /** Nur gestoppte Webantwort: Quellen, die bis zum Stopp feststanden. */
  webPartial?: { sources: WebSource[]; failures: WebFetchFailure[]; notFetched: number }
  at: number
}

/** Fortschritt der laufenden Webanfrage — nur Anzeige, keine Quelle der Wahrheit. */
export interface PetrolWebProgressState {
  phase: 'search' | 'fetch' | 'model'
  hosts: string[]
  sources?: WebSource[]
  failures?: WebFetchFailure[]
  notFetched?: number
}

/** Was die laufende Anfrage tatsächlich benutzt — eingefroren beim Senden (Codex F18). */
export interface PetrolActiveRun {
  label: string
  routeText: string
  routeKind: 'local' | 'cloud' | 'unverified' | 'checking'
  /** Backend|Modell|Cloud der Anfrage — damit ein spätes Prüfergebnis nur DIESEN Weg nachträgt. */
  routeKey: string
  /** Nur Anfrage ohne Websuche: so viele frühere Webfragen gingen als Thema mit (für Stopp, Codex F09). */
  webTopics?: number
}

export interface PetrolChatScope {
  mode: AgentTabMode
  messages: PetrolChatMessage[]
  /** Text der laufenden Antwort; null = keine Anfrage unterwegs. */
  streaming: string | null
  active: PetrolActiveRun | null
  draft: string
  /** Gewähltes lokales Modell ('' = Standardmodell aus den Einstellungen). */
  localModel: string
  cloudProvider: CloudProviderId | null
  /** Globus für die nächste Nachricht; geht nach jedem Senden aus. */
  webArmed: boolean
  /** Suchwörter im Feld; null = noch nicht bearbeitet (Vorschlag = Frage). */
  webQuery: string | null
  /** Nachfrage zu einer fertigen Webantwort; null = nicht gewählt. Der Renderer kennt nur die Kennung. */
  followUp: { snapshotId: string } | null
  webProgress: PetrolWebProgressState | null
}

export interface PetrolSendOptions {
  model: string
  backend: 'ollama' | 'lm-studio'
  lmStudioPort?: number
  cloud: { model: string; provider: CloudProviderId } | null
  run: PetrolActiveRun
  /** Gesetzt = Websuche mit genau diesen Suchwörtern. */
  web?: { query: string }
  /** Gesetzt = Nachfrage aus eingefrorenen Auszügen, ohne neue Suche. */
  followUp?: { snapshotId: string }
}

interface PetrolChatState {
  scopes: Record<string, PetrolChatScope>
  /** Bereich, dessen Antwort gerade streamt — es gibt höchstens eine Anfrage zugleich. */
  activeScope: string | null
  scope: (id: string) => PetrolChatScope
  setMode: (id: string, mode: AgentTabMode) => void
  setDraft: (id: string, text: string) => void
  setModel: (id: string, patch: Partial<Pick<PetrolChatScope, 'localModel' | 'cloudProvider'>>) => void
  setWeb: (id: string, patch: Partial<Pick<PetrolChatScope, 'webArmed' | 'webQuery'>>) => void
  /** „Hiermit weiterfragen“: Kennung setzen oder aufheben. Schaltet den Globus aus. */
  setFollowUp: (id: string, snapshotId: string | null) => void
  /** Prüfergebnis des Weges nachtragen, wenn beim Senden noch „wird geprüft“ galt (Codex F28). */
  resolveActiveRoute: (id: string, routeKey: string, routeText: string, routeKind: PetrolActiveRun['routeKind']) => void
  send: (id: string, text: string, opts: PetrolSendOptions) => Promise<void>
  /** Bricht die laufende Antwort ab; was schon da war, bleibt als Bruchstück stehen. */
  stop: (id: string) => void
  clear: (id: string) => void
  dispose: (id: string) => void
}

function freshScope(): PetrolChatScope {
  return {
    mode: useUIStore.getState().agentTabDefaultMode ?? 'task',
    messages: [],
    streaming: null,
    active: null,
    draft: '',
    localModel: '',
    cloudProvider: null,
    webArmed: false,
    webQuery: null,
    followUp: null,
    webProgress: null
  }
}

// Kennung der laufenden Anfrage. Nur ihre Stücke und ihr Ergebnis zählen.
let requestSeq = 0
let currentRequest: string | null = null
let listening = false

/** Laufende Anfrage im Main abbrechen und ungültig machen. */
function abortCurrent(): void {
  const id = currentRequest
  currentRequest = null
  if (id) void window.electronAPI.petrolChatAbort(id).catch(() => { /* Main schon fertig */ })
}

/** Gesprächsbereich im Main vergessen: „Neues Gespräch“ und Tab schließen. */
function dropSnapshots(id: string): void {
  void window.electronAPI.petrolChatSnapshotsDrop?.(id).catch(() => { /* Main schon weg */ })
}

export const usePetrolChatStore = create<PetrolChatState>((set, get) => {
  const patch = (id: string, p: Partial<PetrolChatScope>) =>
    set(s => ({ scopes: { ...s.scopes, [id]: { ...(s.scopes[id] ?? freshScope()), ...p } } }))

  const ensureListener = () => {
    if (listening) return
    listening = true
    window.electronAPI.onPetrolChatChunk(chunk => {
      if (!chunk || chunk.requestId !== currentRequest) return
      const id = get().activeScope
      if (!id) return
      const sc = get().scopes[id]
      if (!sc || sc.streaming === null) return
      patch(id, { streaming: sc.streaming + chunk.delta })
    })
    window.electronAPI.onPetrolChatProgress(p => {
      if (!p || p.requestId !== currentRequest) return
      const id = get().activeScope
      if (!id) return
      const sc = get().scopes[id]
      if (!sc || sc.streaming === null) return
      const prev = sc.webProgress ?? { phase: p.phase, hosts: [] }
      patch(id, {
        webProgress: {
          ...prev,
          phase: p.phase,
          hosts: p.host ? [...prev.hosts, p.host] : prev.hosts,
          ...(p.sources ? { sources: p.sources, failures: p.failures ?? [], notFetched: p.notFetched ?? 0 } : {})
        }
      })
    })
  }

  return {
    scopes: {},
    activeScope: null,
    scope: id => get().scopes[id] ?? freshScope(),
    setMode: (id, mode) => patch(id, { mode }),
    setDraft: (id, text) => patch(id, { draft: text }),
    setModel: (id, p) => patch(id, p),
    setWeb: (id, p) => patch(id, { ...p, ...(p.webArmed ? { followUp: null } : {}) }),
    setFollowUp: (id, snapshotId) => patch(id, {
      followUp: snapshotId ? { snapshotId } : null,
      ...(snapshotId ? { webArmed: false, webQuery: null } : {})
    }),
    resolveActiveRoute: (id, routeKey, routeText, routeKind) => {
      const active = get().scopes[id]?.active
      if (!active || active.routeKind !== 'checking' || active.routeKey !== routeKey) return
      patch(id, { active: { ...active, routeText, routeKind } })
    },

    send: async (id, text, opts) => {
      const question = text.trim()
      if (!question || get().activeScope) return
      ensureListener()
      const req = `petrol-${Date.now().toString(36)}-${++requestSeq}`
      currentRequest = req
      const before = get().scope(id).messages
      const history = chatHistoryForModel(completedTurns(before))
      const web = opts.web
      const follow = opts.followUp
      // Thema früherer Webfragen (Weg 1): nur eigene Fragen erfolgreicher Webwechsel.
      const webTopics = webTopicQuestions(before)
      // Frage nach einer alten Antwort/Quelle ohne Globus und ohne ausdrückliche Nachfrage:
      // feste Antwort, kein Modellaufruf. Beide Nachrichten tragen origin 'web'.
      if (!web && !follow && webTopics.length > 0 && asksAboutOldWebSources(question, { topics: webTopics.map(q => q.text), lastAnswerWasWeb: lastVisibleAnswerIsWeb(before) })) {
        currentRequest = null
        patch(id, {
          messages: [...before,
            { role: 'user', content: question, origin: 'web', at: Date.now() },
            { role: 'assistant', content: '', origin: 'web', appNote: 'old-web-source', at: Date.now() + 1 }],
          draft: ''
        })
        return
      }
      patch(id, {
        messages: [...before, follow
          ? { role: 'user', content: question, origin: 'web', followUp: true, followUpSnapshotId: follow.snapshotId, at: Date.now() }
          : web
            ? { role: 'user', content: question, origin: 'web', webQuery: web.query, at: Date.now() }
            : { role: 'user', content: question, at: Date.now() }],
        streaming: '',
        active: !web && !follow && webTopics.length ? { ...opts.run, webTopics: webTopics.length } : opts.run,
        draft: '',
        // Globus nach jedem Senden aus; das Suchfeld und die Nachfrage starten beim nächsten Mal neu.
        webArmed: false,
        webQuery: null,
        followUp: null,
        webProgress: follow ? { phase: 'model', hosts: [] } : web ? { phase: 'search', hosts: [] } : null
      })
      set({ activeScope: id })
      if (web || follow) {
        let wres: Awaited<ReturnType<typeof window.electronAPI.petrolChatWeb>>
        try {
          wres = await window.electronAPI.petrolChatWeb({
            requestId: req,
            question,
            query: follow ? '' : web!.query,
            scopeId: id,
            ...(follow ? { snapshotId: follow.snapshotId } : {}),
            history,
            model: opts.model,
            backend: opts.backend === 'lm-studio' ? 'lmstudio' : 'ollama',
            lmStudioPort: opts.lmStudioPort,
            cloud: opts.cloud ? { model: opts.cloud.model, provider: opts.cloud.provider === 'llmbase' ? 'llmbase' : 'openrouter' } : null,
            // Themenfragen sind keine Sachbasis. Bei der Nachfrage bleiben sie draußen (F03).
            ...(follow ? {} : { webTopics })
          })
        } catch (e) {
          wres = { success: false, error: e instanceof Error ? e.message : String(e) }
        }
        if (req !== currentRequest) return
        currentRequest = null
        const sc = get().scopes[id]
        set({ activeScope: null })
        if (!sc) return
        const r = wres.result
        const next: PetrolChatMessage = !wres.success || !r
          ? { role: 'assistant', content: wres.error || '', error: true, origin: 'web', at: Date.now() }
          : r.kind === 'answer'
            ? { role: 'assistant', content: r.answer ?? '', model: opts.run.label, origin: 'web', web: r, at: Date.now() }
            : r.kind === 'nothing-readable'
              ? { role: 'assistant', content: '', model: opts.run.label, origin: 'web', web: r, at: Date.now() }
              : { role: 'assistant', content: r.error || '', error: true, origin: 'web', web: r, at: Date.now() }
        patch(id, { messages: [...sc.messages, next], streaming: null, active: null, webProgress: null })
        return
      }
      const messages = [...history, { role: 'user' as const, content: question }]
      let res: { success: boolean; response?: string; error?: string }
      try {
        res = opts.cloud || opts.backend !== 'lm-studio'
          ? await window.electronAPI.ollamaChat(opts.model, messages, '', 'petrol', opts.cloud, undefined, req, webTopics)
          : await window.electronAPI.lmstudioChat(opts.model, messages, '', 'petrol', opts.lmStudioPort, undefined, req, webTopics)
      } catch (e) {
        res = { success: false, error: e instanceof Error ? e.message : String(e) }
      }
      if (req !== currentRequest) return
      currentRequest = null
      const sc = get().scopes[id]
      set({ activeScope: null })
      if (!sc) return
      const partial = sc.streaming ?? ''
      const answer = res.success ? (res.response || partial) : ''
      const next: PetrolChatMessage = res.success && answer.trim()
        ? { role: 'assistant', content: answer, model: opts.run.label, ...(webTopics.length ? { webTopicsUsed: webTopics.length } : {}), at: Date.now() }
        : { role: 'assistant', content: res.error || '', error: true, at: Date.now() }
      patch(id, { messages: [...sc.messages, next], streaming: null, active: null })
    },

    stop: id => {
      if (get().activeScope !== id) return
      abortCurrent()
      const sc = get().scope(id)
      // Was bis hierher kam, bleibt stehen — als abgebrochen markiert, nicht still verworfen.
      // Kam noch gar nichts, wird die Frage selbst als abgebrochen markiert; sonst ginge sie
      // als offene Frage mit der nächsten ans Modell (Codex F31).
      const kept = sc.streaming ?? ''
      const last = sc.messages[sc.messages.length - 1]
      // Webanfrage: das Bruchstück behält die Quellen, die beim Stopp feststanden — ohne
      // Prüfung, aber nachvollziehbar, woraus es stammt.
      const webMark: Partial<PetrolChatMessage> = last?.origin === 'web'
        ? { origin: 'web', webPartial: sc.webProgress?.sources ? { sources: sc.webProgress.sources, failures: sc.webProgress.failures ?? [], notFetched: sc.webProgress.notFetched ?? 0 } : undefined }
        // Normale Anfrage mit Themenkontext: das Bruchstück behält den Hinweis (Codex F09).
        : sc.active?.webTopics ? { webTopicsUsed: sc.active.webTopics } : {}
      patch(id, {
        streaming: null,
        active: null,
        webProgress: null,
        messages: kept.trim()
          ? [...sc.messages, { role: 'assistant', content: kept, model: sc.active?.label, stopped: true, ...webMark, at: Date.now() }]
          : last?.role === 'user'
            ? [...sc.messages.slice(0, -1), { ...last, stopped: true }]
            : sc.messages
      })
      set({ activeScope: null })
    },

    clear: id => {
      if (get().activeScope === id) { abortCurrent(); set({ activeScope: null }) }
      dropSnapshots(id)
      patch(id, { messages: [], streaming: null, active: null, draft: '', webProgress: null, webArmed: false, webQuery: null, followUp: null })
    },

    dispose: id => {
      if (get().activeScope === id) { abortCurrent(); set({ activeScope: null }) }
      dropSnapshots(id)
      set(s => {
        const scopes = { ...s.scopes }
        delete scopes[id]
        return { scopes }
      })
    }
  }
})
