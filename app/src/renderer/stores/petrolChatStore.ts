// Chat im Agent-Tab („Mit Petrol chatten“, Stufe 1 aus docs/codex-collab/chat-und-agent.md).
//
// Bereich = Tab-ID, wie im noteAgentStore. Seit Teil 1 (docs/codex-collab/
// chat-verlauf-notizen-bilder.md, Rev. 4/8/9) FÜHRT DER MAIN DAS GESPRÄCH: Verlauf fürs Modell,
// Themenfragen, Verlaufsbilder, Bruchstück beim Stopp und das Speichern liegen dort. Der Store
// ist der Anzeige-Spiegel: er hält die Gesprächs-ID, zeigt die Frage sofort an, sammelt die
// Textstücke zur Anzeige und übernimmt am Ende die Nachrichten, die der Main zurückgibt.
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
import type { WebFetchFailure, WebSource } from '../../shared/webChat'
import { asksAboutOldWebSources, completedTurns, HISTORY_LIMIT, lastVisibleAnswerIsWeb, webTopicQuestions } from '../utils/chatHistory'
import { planImageHistory, type ChatImage } from '../../shared/chatImages'
import type { PetrolChatMessage, PetrolChatStorageMode, PetrolChatStorageState, PetrolConvResult } from '../../shared/petrolChat'
import { useUIStore } from './uiStore'

// Laufzeittyp liegt seit Teil 1 in shared/ (der Main führt das Gespräch, Rev. 4/Rev. 8).
export type { PetrolChatMessage } from '../../shared/petrolChat'

/** Fortschritt der laufenden Webanfrage — nur Anzeige, keine Quelle der Wahrheit. */
export interface PetrolWebProgressState {
  phase: 'plan' | 'search' | 'pick' | 'fetch' | 'model'
  hosts: string[]
  /** Nur „gründlich“: bisher gesendete Suchanfragen (Anzeige während des Laufs). */
  queries?: string[]
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
  /** So viele ältere Bilder gingen bei dieser Anfrage nicht mehr mit — auch für den Stopp (F57). */
  imagesDropped?: number
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
  /** „Gründlich suchen“ für die nächste Webfrage; geht nach jedem Senden aus (eine Wahl je Frage, R1). */
  webDeep: boolean
  /** Nachfrage zu einer fertigen Webantwort; null = nicht gewählt. Der Renderer kennt nur die Kennung. */
  followUp: { snapshotId: string } | null
  webProgress: PetrolWebProgressState | null
  /**
   * Snapshot-Kennungen, deren Auszüge der Main nicht mehr hält (drei Stunden, Obergrenze, Neustart).
   * „Hiermit weiterfragen“ und „Erneut senden“ einer Nachfrage gehen damit nicht mehr (Codex F02/F03).
   */
  goneSnapshots: string[]
  /** Bilder für die nächste Nachricht, schon aufbereitet. */
  draftImages: ChatImage[]
  /** Gespräch im Main: ID und der Vault, an den es gebunden ist (Rev. 9 Punkt 26). null = noch keins. */
  conv: { id: string; vault: string | null } | null
  /**
   * Wird das Gespräch gespeichert? null = noch nicht bekannt; 'failed' = letzter Speicherversuch
   * gescheitert, das Gespräch lebt gerade nur im Main-Speicher (F83).
   */
  storage: PetrolChatStorageMode | 'failed' | null
}

export interface PetrolSendOptions {
  model: string
  backend: 'ollama' | 'lm-studio'
  lmStudioPort?: number
  cloud: { model: string; provider: CloudProviderId } | null
  run: PetrolActiveRun
  /** Gesetzt = Websuche mit genau diesen Suchwörtern, bzw. `deep` = Modell plant die Suche. */
  web?: { query: string; deep?: boolean }
  /** Gesetzt = Nachfrage aus eingefrorenen Auszügen, ohne neue Suche. */
  followUp?: { snapshotId: string }
  /** Bilder dieser Frage (Entwurf oder „Erneut senden“). Nicht mit Websuche/Nachfrage. */
  images?: ChatImage[]
  /** Offener Vault — das Gespräch hängt fest daran (Rev. 9 Punkt 26). */
  vaultPath: string | null
}

interface PetrolChatState {
  scopes: Record<string, PetrolChatScope>
  /** Bereich, dessen Antwort gerade streamt — es gibt höchstens eine Anfrage zugleich. */
  activeScope: string | null
  scope: (id: string) => PetrolChatScope
  setMode: (id: string, mode: AgentTabMode) => void
  setDraft: (id: string, text: string) => void
  setDraftImages: (id: string, images: ChatImage[]) => void
  setModel: (id: string, patch: Partial<Pick<PetrolChatScope, 'localModel' | 'cloudProvider'>>) => void
  setWeb: (id: string, patch: Partial<Pick<PetrolChatScope, 'webArmed' | 'webQuery' | 'webDeep'>>) => void
  /** Fragt den Main, welche Snapshots dieses Gesprächs noch abrufbar sind, und merkt sich die übrigen. */
  checkSnapshots: (id: string) => Promise<void>
  /** „Hiermit weiterfragen“: Kennung setzen oder aufheben. Schaltet den Globus aus. */
  setFollowUp: (id: string, snapshotId: string | null) => void
  /** Prüfergebnis des Weges nachtragen, wenn beim Senden noch „wird geprüft“ galt (Codex F28). */
  resolveActiveRoute: (id: string, routeKey: string, routeText: string, routeKind: PetrolActiveRun['routeKind']) => void
  send: (id: string, text: string, opts: PetrolSendOptions) => Promise<void>
  /** Bricht die laufende Antwort ab; was schon da war, bleibt als Bruchstück stehen. */
  stop: (id: string) => void
  clear: (id: string) => void
  dispose: (id: string) => void
  /** Vault gewechselt: laufende Antwort stoppen, Gespräch schließen, leer neu beginnen. */
  vaultChanged: (id: string, vaultPath: string | null) => void
  /**
   * Gespeichertes Gespräch in diesem Tab öffnen (Liste, Schritt 4). Eine laufende Antwort wird
   * vorher gestoppt; das bisherige Gespräch geschlossen (gespeichert bleibt es). Fehlertext oder null.
   */
  openConversation: (id: string, convId: string, vaultPath: string | null) => Promise<string | null>
  /** Bildbytes eines geladenen Gesprächs bei Bedarf holen (Rev. 9 Punkt 29). */
  loadImage: (id: string, imageId: string) => Promise<void>
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
    webArmed: useUIStore.getState().petrolWebSticky === true,
    webQuery: null,
    webDeep: false,
    followUp: null,
    webProgress: null,
    goneSnapshots: [],
    draftImages: [],
    conv: null,
    storage: null
  }
}

/** So viele Kennungen prüft `petrol-chat-snapshots-alive` je Aufruf (Grenze im Main). */
export const SNAPSHOT_CHECK_MAX = 200

/** Alle Snapshot-Kennungen, auf die sich ein Gespräch noch beziehen kann: Antworten und Nachfragen. */
export function snapshotIdsIn(messages: readonly PetrolChatMessage[]): string[] {
  const ids = new Set<string>()
  for (const m of messages) {
    if (m.web?.snapshotId) ids.add(m.web.snapshotId)
    if (m.followUpSnapshotId) ids.add(m.followUpSnapshotId)
  }
  return [...ids]
}

// Kennung der laufenden Anfrage. Nur ihre Stücke und ihr Ergebnis zählen.
let requestSeq = 0
let currentRequest: string | null = null
let listening = false
/** Bereiche, deren Gespräch gerade im Main angelegt wird (mit dem Vault) — kein zweites Senden dazwischen. */
const opening = new Map<string, string | null>()
/** Wem die Öffnungs-Sperre gehört (Generation des Öffnens) — nur der Besitzer gibt sie frei. */
const openingOwner = new Map<string, number>()
/**
 * Generation je Bereich: zählt bei „Neues Gespräch“, Vault-Wechsel und Tab schließen hoch. Ein
 * spätes Ergebnis einer älteren Generation wird verworfen (F78).
 */
const generations = new Map<string, number>()
const generation = (id: string) => generations.get(id) ?? 0
const bumpGeneration = (id: string) => generations.set(id, generation(id) + 1)
/** Wechselnummer je Bereich: nur das Ergebnis des neuesten Wechsels ersetzt die Anzeige (F79). */
const turnSeqs = new Map<string, number>()
const turnSeq = (id: string) => turnSeqs.get(id) ?? 0
/** Laufender Stopp je Bereich — eine neue Frage wartet, bis der Main ihn abgeschlossen hat (F79). */
const stopping = new Map<string, Promise<void>>()
/** Bilder, deren Bytes gerade geholt werden (je Bereich + Bild). */
const imageLoads = new Set<string>()
const IMAGE_LOADS_MAX = 3
let imageLoadsActive = 0
const imageWaiters: Array<() => void> = []
function imageSlot(): Promise<void> {
  if (imageLoadsActive < IMAGE_LOADS_MAX) { imageLoadsActive++; return Promise.resolve() }
  return new Promise(r => imageWaiters.push(() => { imageLoadsActive++; r() }))
}
function releaseImageSlot(): void {
  imageLoadsActive = Math.max(0, imageLoadsActive - 1)
  imageWaiters.shift()?.()
}

/** Speicherzustand nach einer Antwort des Mains (F83): „unverändert“ ändert nichts. */
function nextStorage(prev: PetrolChatScope['storage'], state: PetrolChatStorageState): PetrolChatScope['storage'] {
  if (state === 'saved') return 'on'
  if (state === 'unchanged') return prev
  return state
}

/**
 * Gespräch im Main schließen: eine laufende Antwort stoppt und wird gespeichert, die Auszüge des
 * Gesprächs fallen weg (Rev. 3 Punkt 11). Gespeichert bleibt es.
 */
function closeConv(conv: { id: string } | null): void {
  if (conv) void window.electronAPI.petrolConvClose(conv.id).catch(() => { /* Main schon weg */ })
}

/**
 * Antworten des Mains tragen keine Bildbytes (`withoutImageBytes`) — der Renderer hat jedes Bild
 * schon. Hier werden sie aus der eigenen Anzeige wieder eingesetzt.
 */
export function withLocalImageBytes(messages: readonly PetrolChatMessage[], local: readonly PetrolChatMessage[], extra: readonly ChatImage[] = []): PetrolChatMessage[] {
  const bytes = new Map<string, string>()
  for (const m of local) for (const i of m.images ?? []) if (i.dataBase64) bytes.set(i.id, i.dataBase64)
  for (const i of extra) if (i.dataBase64) bytes.set(i.id, i.dataBase64)
  return messages.map(m => (m.images?.length ? { ...m, images: m.images.map(i => (i.dataBase64 ? i : { ...i, dataBase64: bytes.get(i.id) ?? '' })) } : m))
}

export const usePetrolChatStore = create<PetrolChatState>((set, get) => {
  const patch = (id: string, p: Partial<PetrolChatScope>) =>
    set(s => ({ scopes: { ...s.scopes, [id]: { ...(s.scopes[id] ?? freshScope()), ...p } } }))

  // Verfallene Snapshots vormerken; eine darauf gesetzte Nachfrage fällt weg, statt beim
  // Senden mit „Seiten nicht mehr gespeichert“ zu scheitern.
  const markGone = (id: string, gone: readonly string[]) => {
    const sc = get().scopes[id]
    if (!sc || !gone.length) return
    const fresh = gone.filter(g => !sc.goneSnapshots.includes(g))
    if (!fresh.length) return
    patch(id, {
      goneSnapshots: [...sc.goneSnapshots, ...fresh],
      ...(sc.followUp && fresh.includes(sc.followUp.snapshotId) ? { followUp: null } : {})
    })
  }

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
    // Ein anderes Fenster hat das hier offene Gespräch gelöscht (F90): Anzeige leeren.
    window.electronAPI.onPetrolConvClosed?.(e => {
      for (const [scopeId, sc] of Object.entries(get().scopes)) if (sc.conv?.id === e?.id) get().clear(scopeId)
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
          ...(p.query ? { queries: [...(prev.queries ?? []), p.query] } : {}),
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
    setDraftImages: (id, images) => patch(id, { draftImages: images }),
    setModel: (id, p) => patch(id, p),
    setWeb: (id, p) => patch(id, { ...p, ...(p.webArmed ? { followUp: null } : {}) }),
    checkSnapshots: async id => {
      const sc = get().scopes[id]
      if (!sc) return
      // Neueste zuerst und höchstens so viele, wie der Main prüft — sonst gälte eine gültige
      // Kennung jenseits der Grenze als verfallen (Codex F21). Der Main hält ohnehin nur 30.
      const ids = snapshotIdsIn(sc.messages).filter(x => !sc.goneSnapshots.includes(x)).reverse().slice(0, SNAPSHOT_CHECK_MAX)
      if (!ids.length) return
      let alive: string[]
      try {
        // Bereich der Auszüge ist die Gesprächs-ID (Rev. 3 Punkt 11).
        if (!sc.conv) return
        alive = await window.electronAPI.petrolChatSnapshotsAlive(sc.conv.id, ids)
      } catch {
        return // Main nicht erreichbar: nichts behaupten
      }
      if (!Array.isArray(alive)) return
      markGone(id, ids.filter(x => !alive.includes(x)))
    },
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
      if (!question || get().activeScope || opening.has(id)) return
      // Ein Stopp ist erst fertig, wenn der Main den Wechsel abgeschlossen hat; sonst lehnte der
      // Main die neue Frage ab oder ein spätes Stopp-Ergebnis überschriebe sie (F79).
      const pendingStop = stopping.get(id)
      if (pendingStop) {
        await pendingStop
        if (get().activeScope || opening.has(id)) return
      }
      const gen = generation(id)
      const web = opts.web
      const follow = opts.followUp
      const images = opts.images ?? []
      // Bild und Websuche gehen nicht zusammen (Rev. 7 Punkt 22); die Oberfläche sperrt das schon.
      if (images.length && (web || follow)) return
      ensureListener()
      const vault = opts.vaultPath ?? null
      // Gespräch im Main anlegen bzw. an den Vault binden (Rev. 9 Punkt 26).
      let conv = get().scope(id).conv
      if (!conv || conv.vault !== vault) {
        opening.set(id, vault)
        closeConv(conv)
        let o: Awaited<ReturnType<typeof window.electronAPI.petrolConvOpen>>
        try {
          o = await window.electronAPI.petrolConvOpen(vault, null)
        } catch (e) {
          o = { ok: false, error: e instanceof Error ? e.message : String(e) }
        } finally {
          opening.delete(id)
        }
        // Inzwischen „Neues Gespräch“, Vault gewechselt oder Tab zu: das eben angelegte Gespräch
        // gehört zu nichts mehr (F78).
        if (generation(id) !== gen) {
          if (o.ok) closeConv({ id: o.id })
          return
        }
        if (!o.ok) {
          const before0 = get().scope(id).messages
          patch(id, { messages: [...before0, { role: 'user', content: question, at: Date.now() }, { role: 'assistant', content: o.error, error: true, at: Date.now() + 1 }], draft: '' })
          return
        }
        conv = { id: o.id, vault }
        patch(id, { conv, storage: o.storage, goneSnapshots: [] })
        if (get().activeScope) return
      }
      const req = `petrol-${Date.now().toString(36)}-${++requestSeq}`
      currentRequest = req
      const seq = turnSeq(id) + 1
      turnSeqs.set(id, seq)
      const before = get().scope(id).messages
      // Nur Anzeige: dieselben Regeln wie im Main, damit Stopp-Hinweise und „feste Antwort“ sofort
      // stimmen. Was ans Modell geht, entscheidet der Main (Rev. 4).
      const webTopics = webTopicQuestions(before)
      const appNote = !web && !follow && !images.length && webTopics.length > 0 && asksAboutOldWebSources(question, { topics: webTopics.map(q => q.text), lastAnswerWasWeb: lastVisibleAnswerIsWeb(before) })
      let dropped = 0
      if (!web && !follow && !appNote) {
        const withImages = completedTurns(before).filter(m => m.origin !== 'web').slice(-HISTORY_LIMIT)
          .map(m => ({ role: m.role, content: m.content, imageIds: m.images?.map(i => i.id) ?? [] }))
        withImages.push({ role: 'user', content: question, imageIds: images.map(i => i.id) })
        const plan = planImageHistory(withImages, new Set(withImages.flatMap(m => m.imageIds)))
        if (!('error' in plan)) dropped = plan.dropped.length
      }
      const questionAt = Date.now()
      patch(id, {
        messages: [...before, follow
          ? { role: 'user', content: question, origin: 'web', followUp: true, followUpSnapshotId: follow.snapshotId, at: questionAt }
          : web
            ? { role: 'user', content: question, origin: 'web', ...(web.deep ? { webDeep: true } : { webQuery: web.query }), at: questionAt }
            : { role: 'user', content: question, ...(images.length ? { images } : {}), at: questionAt }],
        streaming: appNote ? null : '',
        active: appNote ? null : { ...opts.run, ...(!web && !follow && webTopics.length ? { webTopics: webTopics.length } : {}), ...(dropped ? { imagesDropped: dropped } : {}) },
        draft: '',
        // Der Globus bleibt, wie er ist (Nutzerwunsch 28.10.2026: sonst musste man ihn bei jeder
        // Frage neu anklicken). Suchfeld und Schalter „gründlich“ starten beim nächsten Mal neu.
        webQuery: null,
        webDeep: false,
        followUp: null,
        webProgress: follow ? { phase: 'model', hosts: [] } : web ? { phase: web.deep ? 'plan' : 'search', hosts: [] } : null
      })
      set({ activeScope: id })
      let res: PetrolConvResult
      try {
        res = await window.electronAPI.petrolConvSend(vault, conv.id, {
          requestId: req,
          question,
          kind: follow ? 'follow-up' : web ? 'web' : 'chat',
          ...(web ? { web: { query: web.query, ...(web.deep ? { deep: true } : {}) } } : {}),
          ...(follow ? { followUpSnapshotId: follow.snapshotId } : {}),
          ...(images.length ? { images } : {}),
          model: opts.model,
          backend: opts.backend,
          ...(opts.lmStudioPort ? { lmStudioPort: opts.lmStudioPort } : {}),
          cloud: opts.cloud ? { model: opts.cloud.model, provider: opts.cloud.provider === 'llmbase' ? 'llmbase' : 'openrouter' } : null
        })
      } catch (e) {
        res = { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
      if (req !== currentRequest) {
        // Gestoppt: der Main hat den Wechsel abgeschlossen. Ein spätes Ergebnis trägt höchstens
        // die gesendeten Suchanfragen nach — übernehmen, solange in diesem Bereich nichts Neues läuft.
        const sc = get().scopes[id]
        if (res.ok && sc && generation(id) === gen && turnSeq(id) === seq && get().activeScope !== id && sc.conv?.id === conv.id) {
          patch(id, { messages: withLocalImageBytes(res.messages, sc.messages), storage: nextStorage(sc.storage, res.storage) })
        }
        return
      }
      currentRequest = null
      const sc = get().scopes[id]
      set({ activeScope: null })
      if (!sc) return
      if (!res.ok) {
        // Der Main hat die Frage gar nicht angenommen (Prüfung) — Fehler sichtbar an der Frage.
        patch(id, { messages: [...sc.messages, { role: 'assistant', content: res.error, error: true, ...(web || follow ? { origin: 'web' as const } : {}), at: Date.now() }], streaming: null, active: null, webProgress: null })
        return
      }
      const messages = withLocalImageBytes(res.messages, sc.messages, images)
      const last = messages[messages.length - 1]
      // Nachfragen beziehen sich von selbst auf diese Antwort (Nutzerwunsch 28.10.2026): wirksam nur
      // bei ausgeschaltetem Globus; der Hinweis über der Eingabe zeigt es und lässt sich wegklicken.
      const snap = last?.role === 'assistant' && last.web?.kind === 'answer' && !last.error ? last.web.snapshotId : undefined
      patch(id, { messages, streaming: null, active: null, webProgress: null, storage: nextStorage(sc.storage, res.storage), ...(snap ? { followUp: { snapshotId: snap } } : {}) })
      if (follow && last?.web?.snapshotGone) markGone(id, [follow.snapshotId])
    },

    stop: id => {
      if (get().activeScope !== id) return
      currentRequest = null
      const sc = get().scope(id)
      // Sofortige Anzeige wie bisher; maßgeblich ist, was der Main abschließt (F67) — das kommt
      // gleich danach und ersetzt diese Anzeige.
      const kept = sc.streaming ?? ''
      const lastRaw = sc.messages[sc.messages.length - 1]
      const sent = sc.webProgress?.queries
      const last = lastRaw?.role === 'user' && sent?.length ? { ...lastRaw, webSentQueries: [...sent] } : lastRaw
      const before = last && last !== lastRaw ? [...sc.messages.slice(0, -1), last] : sc.messages
      const webMark: Partial<PetrolChatMessage> = last?.origin === 'web'
        ? { origin: 'web', webPartial: sc.webProgress?.sources ? { sources: sc.webProgress.sources, failures: sc.webProgress.failures ?? [], notFetched: sc.webProgress.notFetched ?? 0 } : undefined }
        : {
            ...(sc.active?.webTopics ? { webTopicsUsed: sc.active.webTopics } : {}),
            ...(sc.active?.imagesDropped ? { imagesDropped: sc.active.imagesDropped } : {})
          }
      patch(id, {
        streaming: null,
        active: null,
        webProgress: null,
        messages: kept.trim()
          ? [...before, { role: 'assistant', content: kept, model: sc.active?.label, stopped: true, ...webMark, at: Date.now() }]
          : last?.role === 'user'
            ? [...sc.messages.slice(0, -1), { ...last, stopped: true }]
            : before
      })
      set({ activeScope: null })
      const conv = sc.conv
      if (!conv) return
      const gen = generation(id)
      const seq = turnSeq(id)
      const done: Promise<void> = window.electronAPI.petrolConvStop(conv.vault, conv.id).then(res => {
        const now = get().scopes[id]
        // Nur für genau diesen Wechsel: keine neuere Frage, kein neues Gespräch (F79).
        if (res.ok && now && generation(id) === gen && turnSeq(id) === seq && get().activeScope !== id && now.conv?.id === conv.id) {
          patch(id, { messages: withLocalImageBytes(res.messages, now.messages), storage: nextStorage(now.storage, res.storage) })
        }
      }).catch(() => { /* Main schon fertig */ }).finally(() => {
        if (stopping.get(id) === done) stopping.delete(id)
      })
      stopping.set(id, done)
    },

    clear: id => {
      bumpGeneration(id)
      const sc = get().scopes[id]
      if (get().activeScope === id) { currentRequest = null; set({ activeScope: null }) }
      closeConv(sc?.conv ?? null)
      // Neues Gespräch startet wie ein neuer Tab mit dem gemerkten Globus (Codex F06).
      patch(id, { conv: null, messages: [], goneSnapshots: [], streaming: null, active: null, draft: '', webProgress: null, webArmed: useUIStore.getState().petrolWebSticky === true, webQuery: null, webDeep: false, followUp: null })
    },

    dispose: id => {
      bumpGeneration(id)
      const sc = get().scopes[id]
      if (get().activeScope === id) { currentRequest = null; set({ activeScope: null }) }
      closeConv(sc?.conv ?? null)
      set(s => {
        const scopes = { ...s.scopes }
        delete scopes[id]
        return { scopes }
      })
    },

    openConversation: async (id, convId, vaultPath) => {
      // Ab hier ein laufender Vorgang des Tabs (F87): kein Senden, kein zweites Öffnen. Die
      // Generation zählt sofort hoch — ein Tab zu oder Vault-Wechsel währenddessen verwirft ihn.
      if (opening.has(id)) return 'Das Gespräch wird gerade geöffnet.'
      ensureListener()
      bumpGeneration(id)
      const gen = generation(id)
      opening.set(id, vaultPath)
      openingOwner.set(id, gen)
      try {
        if (get().activeScope === id) get().stop(id)
        await stopping.get(id)
        if (generation(id) !== gen) return null
        if (get().activeScope) return 'Gerade läuft eine Antwort.'
        const sc = get().scope(id)
        if (sc.conv?.id === convId && sc.conv.vault === vaultPath) return null
        // Erst das Ziel laden, dann tauschen (F86): scheitert das Öffnen, bleibt das bisherige
        // Gespräch — womöglich nur im Speicher — unberührt.
        let o: Awaited<ReturnType<typeof window.electronAPI.petrolConvOpen>>
        try {
          o = await window.electronAPI.petrolConvOpen(vaultPath, convId)
        } catch (e) {
          o = { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
        if (generation(id) !== gen) {
          if (o.ok) closeConv({ id: o.id })
          return null
        }
        if (!o.ok) return o.error
        closeConv(get().scope(id).conv)
        // Geladene Antworten werden nie still als Nachfrage vorgemerkt (Rev. 9 Punkt 28).
        patch(id, { conv: { id: o.id, vault: vaultPath }, storage: o.storage, messages: o.messages, goneSnapshots: [], streaming: null, active: null, webProgress: null, followUp: null })
        return null
      } finally {
        if (openingOwner.get(id) === gen) { opening.delete(id); openingOwner.delete(id) }
      }
    },

    loadImage: async (id, imageId) => {
      const sc = get().scopes[id]
      const conv = sc?.conv
      const key = `${id}|${imageId}`
      if (!conv || imageLoads.has(key)) return
      imageLoads.add(key)
      const gen = generation(id)
      try {
        // Höchstens drei Bilder gleichzeitig (F91) — ein Gespräch mit vielen Bildern flutet sonst die IPC.
        await imageSlot()
        if (generation(id) !== gen) return
        const data = await window.electronAPI.petrolConvImage(conv.vault, conv.id, imageId)
        const now = get().scopes[id]
        if (!now || generation(id) !== gen || now.conv?.id !== conv.id) return
        patch(id, {
          messages: now.messages.map(m => {
            if (!m.images?.some(i => i.id === imageId && !i.dataBase64)) return m
            if (data) return { ...m, images: m.images.map(i => (i.id === imageId ? { ...i, dataBase64: data } : i)) }
            // Datei fehlt oder passt nicht: als „nicht mehr vorhanden“ benennen, nie als leeres Bild (F63).
            const { dataBase64: _gone, ...meta } = m.images.find(i => i.id === imageId)!
            const rest = m.images.filter(i => i.id !== imageId)
            const n: PetrolChatMessage = { ...m, imagesMissing: [...(m.imagesMissing ?? []), meta] }
            if (rest.length) n.images = rest
            else delete n.images
            return n
          })
        })
      } catch {
        // Marke bleibt ohne Vorschau
      } finally {
        releaseImageSlot()
        imageLoads.delete(key)
      }
    },

    vaultChanged: (id, vaultPath) => {
      const sc = get().scopes[id]
      // Auch während das Gespräch noch angelegt wird (F78): dann zählt der Vault der Öffnung.
      const bound = opening.has(id) ? opening.get(id) ?? null : sc?.conv ? sc.conv.vault : undefined
      if (bound === undefined || bound === vaultPath) return
      get().clear(id)
    }
  }
})
