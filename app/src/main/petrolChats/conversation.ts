// Der Main führt das Petrol-Gespräch (Teil 1, Rev. 4 Punkt 12, Rev. 8 Schritt 3, Rev. 9 Punkt
// 26/27 in docs/codex-collab/chat-verlauf-notizen-bilder.md).
//
// Bis 1.2 schickte der Renderer den Verlauf, die Themenfragen und die Bildbytes älterer Fragen
// mit; der Main glaubte ihm. Jetzt kennt der Renderer nur Gesprächs-ID, neue Frage, gewählten Weg
// und die NEUEN Bilder. Verlauf fürs Modell, Ausschluss der Webwechsel, Themenfragen, die feste
// App-Antwort zu alten Quellen und die Regel für Verlaufsbilder entscheidet der Main aus seinen
// eigenen Daten — dieselben reinen Funktionen wie vorher (shared/chatHistory.ts,
// shared/chatImages.ts), nur auf der richtigen Seite der Grenze.
//
// - Ein Gespräch hängt fest an (Absender, kanonischem Vault, ID). Eine Anfrage mit anderem Vault
//   oder unbekannter ID wird abgelehnt (F66).
// - Je Anfrage sammelt der Main den ganzen Wechsel: Textstücke, Webfortschritt, Bildzustellung.
//   Beim Stopp schließt er ihn GENAU EINMAL ab und bildet das Bruchstück daraus (F67). Ein spätes
//   Ergebnis desselben Wechsels trägt nur noch die gesendeten Suchanfragen nach.
// - Nach jedem Abschluss wird gespeichert (`PetrolChatStorage`), in einer Kette je Gespräch.
//   Ohne Vault oder ohne Schlüssel läuft das Gespräch nur im Speicher.
//
// Die Modellaufrufe selbst (`runChat`, `runWeb`) werden eingespielt — in der App die bestehenden
// Handler mit allen Prüfungen (Cloud-Freigabe, Bild-Prüfstelle, Abbruch), in Tests Attrappen.

import type { PetrolChatMessage, PetrolChatStorageMode, PetrolChatStorageState, PetrolConvSendRequest } from '../../shared/petrolChat'
import {
  asksAboutOldWebSources,
  chatHistoryForModel,
  completedTurns,
  HISTORY_LIMIT,
  lastVisibleAnswerIsWeb,
  webTopicQuestions
} from '../../shared/chatHistory'
import {
  CHAT_IMAGE_CONTRACT,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MAX_PER_MESSAGE,
  CHAT_IMAGE_MAX_SIDE,
  planImageHistory,
  type ChatImage,
  type ChatImageDelivery,
  type ChatImageWire
} from '../../shared/chatImages'
import type { WebChatResult, WebFetchFailure, WebSource } from '../../shared/webChat'
import { buildStoredChat, CHAT_ID_RE, isStoredImageId, restoreMessage, type StoredChatHeader } from '../../shared/petrolChatStored'
import type { PetrolChatStorage } from './storage'
import { CLOUD_PROVIDER_META, shortenCloudModelId } from '../../shared/llmBackend'

// ---------------------------------------------------------------------------------------------
// Verträge zu den Modellaufrufen

export interface ChatRunInput {
  /** Fenster der Anfrage — zusammen mit `requestId` der Schlüssel (F82). */
  senderId: number
  requestId: string
  model: string
  backend: 'ollama' | 'lm-studio'
  lmStudioPort?: number
  cloud: { model: string; provider: 'openrouter' | 'llmbase' } | null
  messages: Array<{ role: 'user' | 'assistant'; content: string; imageIds?: string[] }>
  images: ChatImageWire[]
  webTopics: Array<{ text: string; clipped: boolean }>
}
export interface ChatRunResult {
  success: boolean
  response?: string
  error?: string
  imageDelivery?: Record<string, ChatImageDelivery>
}

export interface WebRunInput {
  senderId: number
  requestId: string
  question: string
  query: string
  deep?: boolean
  /** Gesprächs-ID — bindet die eingefrorenen Auszüge an dieses Gespräch (Rev. 3 Punkt 11). */
  scopeId: string
  snapshotId?: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  model: string
  backend: 'ollama' | 'lmstudio'
  lmStudioPort?: number
  cloud: { model: string; provider: 'openrouter' | 'llmbase' } | null
  webTopics?: Array<{ text: string; clipped: boolean }>
}
export interface WebRunResult {
  success: boolean
  result?: WebChatResult
  error?: string
}

/** Fortschritt einer Webanfrage, wie ihn `petrol-chat-progress` meldet. */
export interface WebProgressEvent {
  phase?: string
  host?: string | null
  query?: string | null
  sources?: WebSource[]
  failures?: WebFetchFailure[]
  notFetched?: number
}

/** Was der Lauf unterwegs meldet — der Main sammelt es für den Stopp (F67). */
export interface TurnTap {
  chunk(delta: string): void
  progress(p: WebProgressEvent): void
}

export interface ConversationDeps {
  storage: Pick<PetrolChatStorage, 'save' | 'load' | 'loadImage' | 'unavailableReason' | 'newChatId'> | null
  runChat(input: ChatRunInput, tap: TurnTap): Promise<ChatRunResult>
  runWeb(input: WebRunInput, tap: TurnTap): Promise<WebRunResult>
  /** Bricht die laufende Anfrage im Main ab (dieselbe Kennung wie `petrol-chat-abort`). */
  abort(senderId: number, requestId: string): void
  /** Gesprächsbereich der Snapshots vergessen (verworfenes Gespräch, Tab zu). */
  dropSnapshots(senderId: number, scopeId: string): void
  now?(): number
  newId?(): string
  log?(message: string): void
}

// ---------------------------------------------------------------------------------------------
// Anfrage aus dem Renderer

export type SendRequest = PetrolConvSendRequest

/**
 * Wer die Antwort geschrieben hat, wie es an der Antwort steht und gespeichert wird — vom Main
 * aus dem gewählten Weg gebildet, nicht vom Renderer übernommen (F80). Gleiche Form wie die
 * Wegauswahl (`cloudRoutesForFeature`).
 */
export function answerLabel(req: Pick<SendRequest, 'model' | 'cloud'>): string {
  if (req.cloud) return `${CLOUD_PROVIDER_META[req.cloud.provider].label} · ${shortenCloudModelId(req.cloud.model)}`
  return req.model
}

export type StorageState = PetrolChatStorageState

export type SendResult =
  | { ok: true; messages: PetrolChatMessage[]; storage: StorageState }
  | { ok: false; error: string }

export interface OpenResult {
  ok: true
  id: string
  title?: string
  messages: PetrolChatMessage[]
  /** Wird dieses Gespräch gespeichert? 'memory' = kein Vault. */
  storage: PetrolChatStorageMode
}

// ---------------------------------------------------------------------------------------------

interface Turn {
  requestId: string
  questionAt: number
  kind: SendRequest['kind']
  deep: boolean
  label: string
  text: string
  webTopics: number
  imagesDropped: number
  progress: { sources?: WebSource[]; failures?: WebFetchFailure[]; notFetched?: number; queries: string[] }
  /** Abgeschlossen (fertig, Fehler oder Stopp) — danach ändert der Lauf nur noch Suchanfragen. */
  done: boolean
}

interface Conversation {
  id: string
  senderId: number
  /** Kanonischer Vault-Pfad; null = kein Vault, nur im Speicher. */
  vault: string | null
  createdAt: number
  title?: string
  titleEdited?: boolean
  pinned?: boolean
  archived?: boolean
  messages: PetrolChatMessage[]
  turn: Turn | null
  saving: Promise<unknown>
  /** Geschlossen: speichert nie mehr — sonst legte ein spätes Ergebnis ein gelöschtes Gespräch neu an (F88). */
  closed?: boolean
}

const QUESTION_MAX = 8000

export class PetrolConversations {
  private readonly items = new Map<string, Conversation>()
  /** Laufende Löschungen: `vault|id` bzw. `vault|*` — Öffnen und Anlegen warten nicht, sie scheitern (F88). */
  private readonly deleting = new Set<string>()
  private readonly now: () => number

  constructor(private readonly deps: ConversationDeps) {
    this.now = deps.now ?? Date.now
  }

  private key(senderId: number, id: string): string {
    return `${senderId}:${id}`
  }

  private storageFor(vault: string | null): PetrolChatStorageMode {
    if (!vault || !this.deps.storage) return 'memory'
    return this.deps.storage.unavailableReason() ?? 'on'
  }

  private isDeleting(vault: string | null, id?: string): boolean {
    return !!vault && (this.deleting.has(`${vault}|*`) || (!!id && this.deleting.has(`${vault}|${id}`)))
  }

  /** Löschen beginnt: bis `endDelete` lässt sich nichts davon öffnen oder neu anlegen (F88). */
  beginDelete(vault: string, id: string | null): void {
    this.deleting.add(`${vault}|${id ?? '*'}`)
  }
  endDelete(vault: string, id: string | null): void {
    this.deleting.delete(`${vault}|${id ?? '*'}`)
  }

  /** Neues, leeres Gespräch. Gespeichert wird es erst mit der ersten Nachricht. */
  create(senderId: number, vault: string | null): OpenResult | { ok: false; error: string } {
    if (this.isDeleting(vault)) return { ok: false, error: 'Die Gespräche dieses Vaults werden gerade gelöscht.' }
    const id = this.deps.storage?.newChatId() ?? this.deps.newId?.() ?? ''
    if (!CHAT_ID_RE.test(id)) throw new Error('Gesprächs-ID ungültig.')
    this.items.set(this.key(senderId, id), { id, senderId, vault, createdAt: this.now(), messages: [], turn: null, saving: Promise.resolve() })
    return { ok: true, id, messages: [], storage: this.storageFor(vault) }
  }

  /**
   * Gespeichertes Gespräch öffnen (oder ein schon offenes desselben Absenders). Ein offenes
   * Gespräch unter einem anderen Vault wird nie zurückgegeben (F66).
   */
  async open(senderId: number, vault: string | null, id: string): Promise<OpenResult | { ok: false; error: string }> {
    if (!CHAT_ID_RE.test(id)) return { ok: false, error: 'Gesprächs-ID ungültig.' }
    if (this.isDeleting(vault, id)) return { ok: false, error: 'Dieses Gespräch wird gerade gelöscht.' }
    const open = this.items.get(this.key(senderId, id))
    if (open) {
      if (open.vault !== vault) return { ok: false, error: 'Dieses Gespräch gehört zu einem anderen Vault.' }
      return { ok: true, id, title: open.title, messages: open.messages, storage: this.storageFor(vault) }
    }
    // Ein Gespräch ist nur in EINEM Fenster offen (F89): zwei Kopien würden sich beim Speichern
    // gegenseitig überschreiben.
    if (this.openSender(vault, id) !== null) return { ok: false, error: 'Dieses Gespräch ist in einem anderen Fenster offen.' }
    if (!vault || !this.deps.storage) return { ok: false, error: 'Gespräch nicht gefunden.' }
    const r = await this.deps.storage.load(vault, id, { media: false })
    if (r.kind === 'missing') return { ok: false, error: 'Gespräch nicht gefunden.' }
    if (r.kind === 'unreadable') return { ok: false, error: 'Dieses Gespräch ist nicht lesbar.' }
    // Während des Ladens gelöscht oder anderswo geöffnet?
    if (this.isDeleting(vault, id)) return { ok: false, error: 'Dieses Gespräch wird gerade gelöscht.' }
    if (this.openSender(vault, id) !== null && !this.items.has(this.key(senderId, id))) return { ok: false, error: 'Dieses Gespräch ist in einem anderen Fenster offen.' }
    const already = this.items.get(this.key(senderId, id))
    if (already) return { ok: true, id, title: already.title, messages: already.messages, storage: this.storageFor(vault) }
    // Bilder bei Bedarf (F91): Bytes liest der Main erst, wenn eine Marke oder das Modell sie braucht.
    const messages = r.chat.messages.map(m => restoreMessage(m, () => null, { lazy: true }))
    const conv: Conversation = {
      id, senderId, vault, createdAt: r.chat.createdAt, title: r.chat.title,
      ...(r.chat.titleEdited ? { titleEdited: true } : {}), ...(r.chat.pinned ? { pinned: true } : {}), ...(r.chat.archived ? { archived: true } : {}),
      messages, turn: null, saving: Promise.resolve()
    }
    this.items.set(this.key(senderId, id), conv)
    return { ok: true, id, title: conv.title, messages, storage: this.storageFor(vault) }
  }

  /** Offene Gesprächs-IDs eines Vaults — das Aufräumen fasst sie nicht an. */
  openIds(vault: string): Set<string> {
    return new Set([...this.items.values()].filter(c => c.vault === vault).map(c => c.id))
  }

  private get(senderId: number, vault: string | null, id: unknown): Conversation | { error: string } {
    if (typeof id !== 'string' || !CHAT_ID_RE.test(id)) return { error: 'Gesprächs-ID ungültig.' }
    const conv = this.items.get(this.key(senderId, id))
    if (!conv) return { error: 'Gespräch nicht offen.' }
    if (conv.vault !== vault) return { error: 'Dieses Gespräch gehört zu einem anderen Vault.' }
    return conv
  }

  /** Eine Frage stellen. Antwortet erst nach dem Abschluss des Wechsels (fertig, Fehler, Stopp). */
  async send(senderId: number, vault: string | null, id: unknown, req: SendRequest): Promise<SendResult> {
    const conv = this.get(senderId, vault, id)
    if ('error' in conv) return { ok: false, error: conv.error }
    if (conv.turn && !conv.turn.done) return { ok: false, error: 'In diesem Gespräch läuft schon eine Antwort.' }
    const question = typeof req.question === 'string' ? req.question.trim() : ''
    if (!question || question.length > QUESTION_MAX) return { ok: false, error: 'Die Frage ist leer oder zu lang.' }
    const imgCheck = this.checkNewImages(conv, req.images ?? [])
    if (imgCheck) return { ok: false, error: imgCheck }
    // Eine Bild-ID, die dieses Gespräch schon kennt, meint SEIN Bild („Erneut senden“): Der Main
    // nimmt immer die eigenen Bytes, nie die mitgeschickten (F94) — auch wenn der Renderer sie noch
    // nicht geholt hat (Punkt 29).
    const ownIds = new Set(conv.messages.flatMap(m => [...(m.images ?? []), ...(m.imagesMissing ?? [])]).map(i => i.id))
    const images: ChatImage[] = []
    for (const i of req.images ?? []) {
      const data = ownIds.has(i.id) ? await this.ensureBytes(conv, i.id) : i.dataBase64
      if (!data) return { ok: false, error: 'Dieses Bild ist nicht mehr vorhanden.' }
      images.push({ ...i, dataBase64: data })
    }
    const web = req.kind === 'web' ? req.web : undefined
    if (req.kind === 'web' && !web) return { ok: false, error: 'Websuche ohne Suchwörter.' }
    const follow = req.kind === 'follow-up' ? req.followUpSnapshotId : undefined
    if (req.kind === 'follow-up' && !follow) return { ok: false, error: 'Nachfrage ohne Kennung.' }
    // Bild und Websuche gehen nicht zusammen (Rev. 7 Punkt 22).
    if (images.length && req.kind !== 'chat') return { ok: false, error: 'Bilder gehen nicht zusammen mit der Websuche.' }

    const before = conv.messages
    const label = answerLabel(req)
    const history = chatHistoryForModel(completedTurns(before))
    const webTopics = webTopicQuestions(before)

    // Frage nach einer alten Antwort/Quelle ohne Globus und ohne Nachfrage: feste Antwort, kein
    // Modellaufruf (chat-webthema-im-verlauf.md F01/F08). Beide Nachrichten tragen origin 'web'.
    if (req.kind === 'chat' && !images.length && webTopics.length > 0 && asksAboutOldWebSources(question, { topics: webTopics.map(q => q.text), lastAnswerWasWeb: lastVisibleAnswerIsWeb(before) })) {
      const at = this.now()
      conv.messages = [...before,
        { role: 'user', content: question, origin: 'web', at },
        { role: 'assistant', content: '', origin: 'web', appNote: 'old-web-source', at: at + 1 }]
      return { ok: true, messages: conv.messages, storage: await this.save(conv) }
    }

    const questionAt = this.now()
    const userMsg: PetrolChatMessage = follow
      ? { role: 'user', content: question, origin: 'web', followUp: true, followUpSnapshotId: follow, at: questionAt }
      : web
        ? { role: 'user', content: question, origin: 'web', ...(web.deep ? { webDeep: true } : { webQuery: web.query }), at: questionAt }
        : { role: 'user', content: question, ...(images.length ? { images } : {}), at: questionAt }
    conv.messages = [...before, userMsg]
    const turn: Turn = {
      requestId: req.requestId, questionAt, kind: req.kind, deep: !!web?.deep, label,
      text: '', webTopics: req.kind === 'chat' ? webTopics.length : 0, imagesDropped: 0, progress: { queries: [] }, done: false
    }
    conv.turn = turn
    const tap: TurnTap = {
      chunk: delta => { if (!turn.done && typeof delta === 'string') turn.text += delta },
      progress: p => {
        if (turn.done || !p) return
        if (typeof p.query === 'string' && p.query) turn.progress.queries.push(p.query)
        if (Array.isArray(p.sources)) {
          turn.progress.sources = p.sources
          turn.progress.failures = Array.isArray(p.failures) ? p.failures : []
          turn.progress.notFetched = typeof p.notFetched === 'number' ? p.notFetched : 0
        }
      }
    }

    if (req.kind !== 'chat') {
      let wres: WebRunResult
      try {
        wres = await this.deps.runWeb({
          senderId,
          requestId: req.requestId,
          question,
          query: follow ? '' : web!.query,
          ...(web?.deep ? { deep: true } : {}),
          scopeId: conv.id,
          ...(follow ? { snapshotId: follow } : {}),
          history,
          model: req.model,
          backend: req.backend === 'lm-studio' ? 'lmstudio' : 'ollama',
          lmStudioPort: req.lmStudioPort,
          cloud: req.cloud,
          // Themenfragen sind keine Sachbasis. Bei der Nachfrage bleiben sie draußen (F03).
          ...(follow ? {} : { webTopics })
        }, tap)
      } catch (e) {
        wres = { success: false, error: e instanceof Error ? e.message : String(e) }
      }
      if (turn.done) {
        // Gestoppt: nur die tatsächlich gesendeten Suchanfragen nachtragen (F35, F67).
        const sent = wres.result?.deep?.queries.map(q => q.text) ?? []
        if (turn.deep && sent.length) {
          conv.messages = conv.messages.map(m => (m.role === 'user' && m.at === questionAt ? { ...m, webSentQueries: sent } : m))
          await this.save(conv)
        }
        return { ok: true, messages: conv.messages, storage: 'unchanged' }
      }
      turn.done = true
      conv.turn = null
      const r = wres.result
      const next: PetrolChatMessage = !wres.success || !r
        ? { role: 'assistant', content: wres.error || '', error: true, origin: 'web', at: this.now() }
        : r.kind === 'answer'
          ? { role: 'assistant', content: r.answer ?? '', model: label, origin: 'web', web: r, at: this.now() }
          : r.kind === 'nothing-readable'
            ? { role: 'assistant', content: '', model: label, origin: 'web', web: r, at: this.now() }
            : { role: 'assistant', content: r.error || '', error: true, origin: 'web', web: r, at: this.now() }
      conv.messages = [...conv.messages, next]
      return { ok: true, messages: conv.messages, storage: await this.save(conv) }
    }

    // Verlauf mit Bildverweisen: letzte Frage alle, davor die neuesten zwei (Rev. 2 Punkt 7).
    // Die Bytes älterer Bilder hat der Main selbst; der Renderer schickt sie nicht mehr.
    const withImages = completedTurns(before)
      .filter(m => m.origin !== 'web')
      .slice(-HISTORY_LIMIT)
      .map(m => ({ role: m.role, content: m.content, imageIds: m.images?.map(i => i.id) ?? [], images: m.images ?? [] }))
    withImages.push({ role: 'user', content: question, imageIds: images.map(i => i.id), images })
    const known = new Map(withImages.flatMap(m => m.images.map(i => [i.id, i] as const)))
    const plan = planImageHistory(withImages, new Set(known.keys()))
    if (!('error' in plan)) turn.imagesDropped = plan.dropped.length
    let res: ChatRunResult
    if ('error' in plan) {
      res = { success: false, error: plan.error }
    } else {
      const messages = known.size
        ? plan.messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content, ...(m.imageIds.length ? { imageIds: m.imageIds } : {}) }))
        : [...history, { role: 'user' as const, content: question }]
      // Verlaufsbilder eines geladenen Gesprächs: erst jetzt von der Platte, und nur die mitgehenden (F91).
      const wire: Array<{ id: string; dataBase64: string }> = []
      for (const i of plan.sent) wire.push({ id: i, dataBase64: known.get(i)!.dataBase64 || (await this.ensureBytes(conv, i)) || '' })
      try {
        if (wire.some(w => !w.dataBase64)) throw new Error('Ein Bild aus dem Verlauf ist nicht mehr lesbar. Nichts wurde gesendet.')
        res = await this.deps.runChat({ senderId, requestId: req.requestId, model: req.model, backend: req.backend, lmStudioPort: req.lmStudioPort, cloud: req.cloud, messages, images: wire, webTopics }, tap)
      } catch (e) {
        res = { success: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
    if (turn.done) return { ok: true, messages: conv.messages, storage: 'unchanged' }
    turn.done = true
    conv.turn = null
    // Rückmeldung je Bild: die Frage behält, was wirklich ans Modell ging; jedes gesendete Bild —
    // auch ein älteres aus dem Verlauf — trägt danach alle Empfänger.
    const delivery = res.imageDelivery ?? {}
    const sentTo = Object.entries(delivery).filter(([, d]) => d.kind === 'image') as Array<[string, Extract<ChatImageDelivery, { kind: 'image' }>]>
    conv.messages = conv.messages.map(m => {
      if (m.role !== 'user' || !m.images?.length) return m
      let n = m
      if (m.at === questionAt && res.imageDelivery && images.length) n = { ...n, imageDelivery: res.imageDelivery }
      const mine = sentTo.filter(([imgId]) => m.images!.some(i => i.id === imgId))
      if (!mine.length) return n
      const rec = { ...(n.imageRecipients ?? {}) }
      for (const [imgId, d] of mine) rec[imgId] = [...new Set([...(rec[imgId] ?? []), d.target])]
      return { ...n, imageRecipients: rec }
    })
    const withheld = Object.values(delivery).filter((d): d is Extract<ChatImageDelivery, { kind: 'history-dropped' }> => d.kind === 'history-dropped')
    const answer = res.success ? (res.response || turn.text) : ''
    const next: PetrolChatMessage = res.success && answer.trim()
      ? {
          role: 'assistant', content: answer, model: label,
          ...(webTopics.length ? { webTopicsUsed: webTopics.length } : {}),
          ...(turn.imagesDropped ? { imagesDropped: turn.imagesDropped } : {}),
          ...(withheld.length ? { imagesWithheld: { count: withheld.length, reason: withheld[0].reason ?? '' } } : {}),
          at: this.now()
        }
      : { role: 'assistant', content: res.error || '', error: true, at: this.now() }
    conv.messages = [...conv.messages, next]
    return { ok: true, messages: conv.messages, storage: await this.save(conv) }
  }

  /**
   * Stopp: Anfrage im Main abbrechen und den Wechsel genau einmal abschließen (F67). Was bis
   * hierher kam, bleibt als Bruchstück stehen. Kam noch gar nichts, wird die Frage selbst als
   * gestoppt markiert — sonst ginge sie als offene Frage mit der nächsten ans Modell (F31).
   */
  async stop(senderId: number, vault: string | null, id: unknown): Promise<SendResult> {
    const conv = this.get(senderId, vault, id)
    if ('error' in conv) return { ok: false, error: conv.error }
    const turn = conv.turn
    if (!turn || turn.done) return { ok: true, messages: conv.messages, storage: 'unchanged' }
    turn.done = true
    conv.turn = null
    this.deps.abort(senderId, turn.requestId)
    const kept = turn.text
    const idx = conv.messages.findIndex(m => m.role === 'user' && m.at === turn.questionAt)
    const q = idx >= 0 ? conv.messages[idx] : null
    const sent = turn.progress.queries
    const question = q && turn.deep && sent.length ? { ...q, webSentQueries: [...sent] } : q
    const isWeb = turn.kind !== 'chat'
    const mark: Partial<PetrolChatMessage> = isWeb
      ? { origin: 'web', ...(turn.progress.sources ? { webPartial: { sources: turn.progress.sources, failures: turn.progress.failures ?? [], notFetched: turn.progress.notFetched ?? 0 } } : {}) }
      : { ...(turn.webTopics ? { webTopicsUsed: turn.webTopics } : {}), ...(turn.imagesDropped ? { imagesDropped: turn.imagesDropped } : {}) }
    const head = idx >= 0 ? conv.messages.slice(0, idx) : conv.messages
    if (question && kept.trim()) {
      conv.messages = [...head, question, { role: 'assistant', content: kept, model: turn.label, stopped: true, ...mark, at: this.now() }]
    } else if (question) {
      conv.messages = [...head, { ...question, stopped: true }]
    }
    return { ok: true, messages: conv.messages, storage: await this.save(conv) }
  }

  /** Umbenennen (Liste, Schritt 4). Leer = wieder die erste Frage. */
  async rename(senderId: number, vault: string | null, id: unknown, title: string | null): Promise<SendResult> {
    return this.update(senderId, vault, id, { title })
  }

  /**
   * Titel, Anheften, Archivieren (Liste). `title: null` = wieder die erste Frage; fehlende Felder
   * bleiben, wie sie sind. Ein Gespräch ohne Nachricht wird nicht gespeichert.
   */
  async update(senderId: number, vault: string | null, id: unknown, patch: { title?: string | null; pinned?: boolean; archived?: boolean }): Promise<SendResult> {
    const conv = this.get(senderId, vault, id)
    if ('error' in conv) return { ok: false, error: conv.error }
    if (patch.title !== undefined) {
      if (patch.title) { conv.title = patch.title; conv.titleEdited = true } else { delete conv.title; delete conv.titleEdited }
    }
    if (patch.pinned !== undefined) { if (patch.pinned) conv.pinned = true; else delete conv.pinned }
    // Archivieren löst das Anheften: sonst entginge ein archiviertes Gespräch dauerhaft der Aufbewahrung (F14).
    if (patch.archived !== undefined) { if (patch.archived) { conv.archived = true; delete conv.pinned } else delete conv.archived }
    return { ok: true, messages: conv.messages, storage: conv.messages.length ? await this.save(conv) : 'unchanged' }
  }

  /**
   * Gespräch schließen (Tab zu, „Neues Gespräch“, anderes Gespräch geöffnet). Läuft noch eine
   * Antwort, wird sie gestoppt und gespeichert. Die Snapshots eines Gesprächs ohne Nachricht
   * (verworfen) fallen weg; die eines gespeicherten bleiben, solange der Tab sie noch braucht.
   */
  async close(senderId: number, id: unknown, opts: { dropSnapshots: boolean } = { dropSnapshots: true }): Promise<void> {
    if (typeof id !== 'string' || !CHAT_ID_RE.test(id)) return
    const conv = this.items.get(this.key(senderId, id))
    if (!conv) return
    if (conv.turn && !conv.turn.done) await this.stop(senderId, conv.vault, id)
    await conv.saving.catch(() => undefined)
    conv.closed = true
    this.items.delete(this.key(senderId, id))
    if (opts.dropSnapshots) this.deps.dropSnapshots(senderId, id)
  }

  /** Fenster zu: alles dieses Absenders. */
  async dropSender(senderId: number): Promise<void> {
    for (const c of [...this.items.values()]) if (c.senderId === senderId) await this.close(senderId, c.id)
  }

  /** „Alle löschen“: offene Gespräche dieses Vaults schließen (laufende stoppen). Liefert die Fenster (F90). */
  async closeVault(vault: string): Promise<Array<{ senderId: number; id: string }>> {
    const hit = [...this.items.values()].filter(c => c.vault === vault).map(c => ({ senderId: c.senderId, id: c.id }))
    for (const c of hit) await this.close(c.senderId, c.id)
    return hit
  }

  /**
   * Bildbytes eines Bildes in diesem Gespräch — für Bildmarken geladener Gespräche, die ihre
   * Bytes erst bei Bedarf holen (Rev. 9 Punkt 29, F85). Nur Bilder dieses Gesprächs.
   */
  async imageBytes(senderId: number, vault: string | null, id: unknown, imageId: unknown): Promise<string | null> {
    const conv = this.get(senderId, vault, id)
    if ('error' in conv || typeof imageId !== 'string') return null
    return this.ensureBytes(conv, imageId)
  }

  /**
   * Bytes eines Bildes dieses Gesprächs: aus dem Speicher, sonst einmal von der Platte (F91).
   * Fehlt die Datei oder passt sie nicht, wandert das Bild nach `imagesMissing` (F63).
   */
  private async ensureBytes(conv: Conversation, imageId: string): Promise<string | null> {
    let meta: ChatImage | undefined
    for (const m of conv.messages) for (const i of m.images ?? []) if (i.id === imageId) { if (i.dataBase64) return i.dataBase64; meta = i }
    if (!meta || !conv.vault || !this.deps.storage) return null
    const data = await this.deps.storage.loadImage(conv.vault, conv.id, meta).catch(() => null)
    conv.messages = conv.messages.map(m => {
      if (!m.images?.some(i => i.id === imageId)) return m
      if (data) return { ...m, images: m.images.map(i => (i.id === imageId ? { ...i, dataBase64: data } : i)) }
      const { dataBase64: _drop, ...gone } = m.images.find(i => i.id === imageId)!
      const rest = m.images.filter(i => i.id !== imageId)
      const n: PetrolChatMessage = { ...m, imagesMissing: [...(m.imagesMissing ?? []), gone] }
      if (rest.length) n.images = rest
      else delete n.images
      return n
    })
    return data
  }

  /** Gespräch in allen Fenstern schließen (vor dem Löschen). Liefert die Fenster (F90). */
  async closeEverywhere(vault: string, id: string): Promise<number[]> {
    const senders = [...this.items.values()].filter(c => c.id === id && c.vault === vault).map(c => c.senderId)
    for (const s of senders) await this.close(s, id)
    return senders
  }

  /** Welches Fenster hat dieses Gespräch offen? null = keins. */
  openSender(vault: string | null, id: string): number | null {
    for (const c of this.items.values()) if (c.id === id && c.vault === vault) return c.senderId
    return null
  }

  /** Ist dieses Gespräch gerade in diesem Fenster offen? */
  isOpen(senderId: number, id: string): boolean {
    return this.items.has(this.key(senderId, id))
  }

  /** Kopf für die Liste eines offenen Gesprächs (Schritt 4). */
  header(senderId: number, id: string): Pick<StoredChatHeader, 'id' | 'title' | 'createdAt'> | null {
    const c = this.items.get(this.key(senderId, id))
    return c ? { id: c.id, title: c.title ?? '', createdAt: c.createdAt } : null
  }

  /**
   * Neue Bilder prüfen, bevor sie ins Gespräch kommen. Die Bytes prüft die Bild-Prüfstelle beim
   * Senden; hier geht es um den Vertrag und um die Eindeutigkeit der ID im Gespräch (Rev. 9
   * Punkt 27): dieselbe ID nur für dasselbe Bild („Erneut senden“).
   */
  private checkNewImages(conv: Conversation, images: unknown): string | null {
    if (!Array.isArray(images)) return 'Bilder: ungültiges Format.'
    if (images.length > CHAT_IMAGE_MAX_PER_MESSAGE) return `Höchstens ${CHAT_IMAGE_MAX_PER_MESSAGE} Bilder je Nachricht.`
    const seen = new Set<string>()
    const existing = new Map(conv.messages.flatMap(m => [...(m.images ?? []), ...(m.imagesMissing ?? [])]).map(i => [i.id, i] as const))
    for (const raw of images) {
      const i = raw as Partial<ChatImage>
      const ok = i && typeof i === 'object' && i.v === CHAT_IMAGE_CONTRACT && isStoredImageId(i.id) && typeof i.name === 'string' && i.name.length <= 255
        && i.mime === 'image/jpeg' && Number.isInteger(i.width) && Number.isInteger(i.height) && i.width! > 0 && i.height! > 0
        && i.width! <= CHAT_IMAGE_MAX_SIDE && i.height! <= CHAT_IMAGE_MAX_SIDE && Number.isInteger(i.byteLength) && i.byteLength! > 0
        && i.byteLength! <= CHAT_IMAGE_MAX_BYTES && typeof i.dataBase64 === 'string'
      if (!ok) return 'Bilder: ungültiges Bild.'
      if (seen.has(i.id!)) return 'Bilder: dasselbe Bild zweimal in einer Nachricht.'
      seen.add(i.id!)
      const prev = existing.get(i.id!)
      // Ohne Bytes nur ein Bild, das dieses Gespräch schon kennt („Erneut senden“, Punkt 29).
      if (!i.dataBase64 && !prev) return 'Bilder: ungültiges Bild.'
      if (prev && (prev.width !== i.width || prev.height !== i.height || prev.byteLength !== i.byteLength || prev.name !== i.name)) {
        return 'Bilder: Kennung schon für ein anderes Bild vergeben.'
      }
    }
    return null
  }

  /** Speichern in einer Kette je Gespräch. Fehler stoppen das Gespräch nicht, sie werden gemeldet. */
  private save(conv: Conversation): Promise<StorageState> {
    const job = conv.saving.catch(() => undefined).then(async (): Promise<StorageState> => {
      if (conv.closed) return 'unchanged'
      const state = this.storageFor(conv.vault)
      if (state !== 'on') return state
      if (!conv.messages.length) return 'unchanged'
      try {
        const chat = buildStoredChat({ id: conv.id, createdAt: conv.createdAt, title: conv.title, titleEdited: conv.titleEdited, pinned: conv.pinned, archived: conv.archived }, conv.messages, this.now())
        const bytes: Record<string, string> = {}
        for (const m of conv.messages) for (const i of m.images ?? []) if (i.dataBase64) bytes[i.id] = i.dataBase64
        return (await this.deps.storage!.save(conv.vault!, chat, bytes)) ? 'saved' : 'unchanged'
      } catch (e) {
        this.deps.log?.(`[petrol-chats] Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
        return 'failed'
      }
    })
    conv.saving = job
    return job
  }
}

// ---------------------------------------------------------------------------------------------
// IPC-Grenze

const SNAPSHOT_ID_RE = /^[0-9a-f]{32}$/
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max

/**
 * Anfrage aus dem Renderer, streng gelesen. Kein Verlauf, keine Themen, keine Herkunft —
 * gibt es nicht mehr im Vertrag (Rev. 4). Unbekannte Felder werden ignoriert.
 */
export function parseSendRequest(raw: unknown): SendRequest | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Anfrage ungültig.' }
  const r = raw as Record<string, unknown>
  if (!isStr(r.requestId, 100) || !r.requestId) return { error: 'Anfrage ohne Kennung.' }
  if (!isStr(r.question, QUESTION_MAX)) return { error: 'Die Frage ist leer oder zu lang.' }
  const kind = r.kind === 'web' || r.kind === 'follow-up' ? r.kind : r.kind === 'chat' ? 'chat' : null
  if (!kind) return { error: 'Anfrage ungültig.' }
  if (!isStr(r.model, 300)) return { error: 'Modell fehlt.' }
  const backend = r.backend === 'lm-studio' ? 'lm-studio' : 'ollama'
  const port = typeof r.lmStudioPort === 'number' && Number.isInteger(r.lmStudioPort) && r.lmStudioPort > 0 && r.lmStudioPort < 65536 ? r.lmStudioPort : undefined
  let cloud: SendRequest['cloud'] = null
  if (r.cloud && typeof r.cloud === 'object') {
    const c = r.cloud as Record<string, unknown>
    if (!isStr(c.model, 300) || !c.model.trim()) return { error: 'Cloud-Modell ungültig.' }
    cloud = { model: c.model, provider: c.provider === 'llmbase' ? 'llmbase' : 'openrouter' }
  }
  // `runLabel` aus älteren Renderern wird ignoriert: das Label bildet der Main (F80).
  const out: SendRequest = { requestId: r.requestId, question: r.question, kind, model: r.model, backend, cloud }
  if (port) out.lmStudioPort = port
  if (kind === 'web') {
    const w = r.web as Record<string, unknown> | undefined
    if (!w || typeof w !== 'object' || !isStr(w.query, 2000)) return { error: 'Websuche ohne Suchwörter.' }
    out.web = { query: w.query, ...(w.deep === true ? { deep: true } : {}) }
  }
  if (kind === 'follow-up') {
    if (typeof r.followUpSnapshotId !== 'string' || !SNAPSHOT_ID_RE.test(r.followUpSnapshotId)) return { error: 'Nachfrage ohne gültige Kennung.' }
    out.followUpSnapshotId = r.followUpSnapshotId
  }
  if (r.images !== undefined) {
    if (!Array.isArray(r.images)) return { error: 'Bilder: ungültiges Format.' }
    out.images = r.images as ChatImage[]
  }
  return out
}

/**
 * Antwort an den Renderer ohne Bildbytes: Er hat jedes Bild schon (angehängt oder beim Öffnen
 * bekommen); sonst ginge bei jeder Antwort jedes Bild des Gesprächs erneut über die Grenze.
 */
export function withoutImageBytes(messages: readonly PetrolChatMessage[]): PetrolChatMessage[] {
  return messages.map(m => (m.images?.length ? { ...m, images: m.images.map(i => ({ ...i, dataBase64: '' })) } : m))
}
