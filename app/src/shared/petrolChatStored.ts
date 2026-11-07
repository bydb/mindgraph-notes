/**
 * Gespeicherte Gespräche des Petrol-Chats: Datenvertrag (Teil 1, Rev. 2 Punkt 1, Rev. 3 Punkt 9,
 * Rev. 8 Schritt 1, Rev. 9 in docs/codex-collab/chat-verlauf-notizen-bilder.md).
 *
 * Gespeichert wird eine EIGENE Projektion, nie der Laufzeittyp (Codex F01). Jede Struktur hat
 * genau EIN Schema (`S`), das zwei Dinge kann:
 * - `copy` (Speichern) übernimmt nur die dort genannten Felder, auf jeder Ebene (Codex F59).
 *   Ein neues Laufzeitfeld landet also nicht still auf der Platte, auch nicht verschachtelt.
 * - `check` (Laden) verlangt genau diese Felder mit dem richtigen Typ, auf jeder Ebene (F60).
 *   Was die Anzeige liest, ist damit geprüft; unbekannte und geerbte Schlüssel fallen durch (F68).
 *
 * Was bewusst wegfällt:
 * - `excerpt` der Webquellen. Die Seitenauszüge liegen nur im Main-Speicher (fremde Webseiten
 *   auf der Platte; Rev. 2 Punkt 1). Titel, Adresse und Prüfbericht bleiben.
 * - `snapshotId` / `followUpSnapshotId` — nach dem Laden ist jede Kennung verfallen. Sie werden zu
 *   `hadSnapshot` / `wasFollowUp` (Rev. 3 Punkt 9), es wird keine künstliche Kennung erzeugt.
 * - `dataBase64` der Bilder. Die Bytes liegen als eigene Mediendatei neben dem Gespräch.
 *
 * Laden ist streng (`parseStoredChat`): Eine ungültige Nachricht, eine doppelte Bild-ID (F65)
 * oder eine Antwort ohne Frage davor (F64) macht das ganze Gespräch „nicht lesbar“. Einzelne
 * Nachrichten still wegzulassen hieße, eine Frage ohne ihre Antwort (oder umgekehrt) wieder in
 * den Verlauf fürs Modell zu stellen.
 */

import type { PetrolChatMessage } from './petrolChat'
import type { ChatImage, ChatImageDelivery } from './chatImages'
import { CHAT_IMAGE_CONTRACT, CHAT_IMAGE_MAX_PER_MESSAGE, CHAT_IMAGE_MAX_SIDE } from './chatImages'
import type { WebChatResult, WebFetchFailure, WebSource } from './webChat'

export const STORED_CHAT_VERSION = 1
/** Obergrenze je Gespräch — schützt Laden und Liste vor einer aufgeblähten Datei. */
export const STORED_CHAT_MAX_MESSAGES = 2000
export const STORED_CHAT_TITLE_MAX = 60
/** Gesprächs-ID: vom Main vergeben, 32 Hexzeichen. */
export const CHAT_ID_RE = /^[0-9a-f]{32}$/
/** Bild-ID wie im Bildvertrag (`shared/chatImages.ts`). Auch Dateiname der Mediendatei. */
export const CHAT_IMAGE_ID_RE = /^[\w-]{1,64}$/

export type StoredWebSource = Omit<WebSource, 'excerpt'>

export type StoredWebResult = Omit<WebChatResult, 'sources' | 'snapshotId'> & { sources: StoredWebSource[] }

/** Bild ohne Bytes — die liegen in `media/<id>.jpg` (verschlüsselt). */
export type StoredChatImage = Omit<ChatImage, 'dataBase64'>

export interface StoredChatMessage {
  role: 'user' | 'assistant'
  content: string
  at: number
  model?: string
  stopped?: boolean
  error?: boolean
  origin?: 'web'
  webQuery?: string
  webDeep?: boolean
  webSentQueries?: string[]
  followUp?: boolean
  wasFollowUp?: boolean
  web?: StoredWebResult
  hadSnapshot?: boolean
  webTopicsUsed?: number
  learning?: boolean
  appNote?: 'old-web-source'
  /** Alle Bilder der Frage — auch solche, deren Datei beim letzten Laden fehlte (F71). */
  images?: StoredChatImage[]
  imageDelivery?: Record<string, ChatImageDelivery>
  imagesDropped?: number
  imagesWithheld?: { count: number; reason: string }
  imageRecipients?: Record<string, string[]>
  webPartial?: { sources: StoredWebSource[]; failures: WebFetchFailure[]; notFetched: number }
}

export interface StoredChatHeader {
  version: typeof STORED_CHAT_VERSION
  id: string
  title: string
  /** Vom Nutzer umbenannt: der Titel folgt dann nicht mehr der ersten Frage. */
  titleEdited?: boolean
  /** Angeheftet: steht oben in der Liste, die Aufbewahrung löscht es nicht (Nutzer 05.11.2026). */
  pinned?: boolean
  /** Archiviert: aus der Liste genommen, bleibt gespeichert, läuft normal ab. */
  archived?: boolean
  createdAt: number
  /** Zeitpunkt der letzten Nachricht — Grundlage der Aufbewahrung. */
  updatedAt: number
  /** Modell bzw. Weg der letzten Antwort (nur Anzeige in der Liste). */
  model?: string
}

export interface StoredChat extends StoredChatHeader {
  messages: StoredChatMessage[]
}

// ---------------------------------------------------------------------------------------------
// Schema: ein Objekt für Kopieren (Speichern) und Prüfen (Laden)

interface S {
  check(x: unknown): boolean
  copy(x: unknown): unknown
  /** Feld darf fehlen. */
  optional?: true
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

const prim = (pred: (x: unknown) => boolean): S => ({ check: pred, copy: x => x })
const str = prim(x => typeof x === 'string')
const num = prim(x => typeof x === 'number' && Number.isFinite(x))
const nat = prim(x => typeof x === 'number' && Number.isInteger(x) && x >= 0)
const bool = prim(x => typeof x === 'boolean')
const yes = prim(x => x === true)
const oneOf = (...vals: unknown[]): S => prim(x => vals.includes(x))
const maybe = (s: S): S => ({ check: x => x === undefined || s.check(x), copy: x => (x === undefined ? undefined : s.copy(x)), optional: true })
const orNull = (s: S): S => ({ check: x => x === null || s.check(x), copy: x => (x === null ? null : s.copy(x)) })

const list = (item: S, max = 10_000): S => ({
  check: x => Array.isArray(x) && x.length <= max && x.every(y => item.check(y)),
  copy: x => (Array.isArray(x) ? x.map(y => item.copy(y)) : x)
})

/** Bild-ID: Muster aus dem Bildvertrag, aber nie ein Name aus `Object.prototype` (`__proto__` passt auf `\w`). */
export function isStoredImageId(x: unknown): x is string {
  return typeof x === 'string' && CHAT_IMAGE_ID_RE.test(x) && !(x in Object.prototype)
}

/** Schlüssel → Wert; Schlüssel müssen die Prüfung bestehen (keine geerbten oder fremden Namen). */
const dict = (key: (k: string) => boolean, val: S, max = 100): S => ({
  check: x => isObj(x) && Object.keys(x).length <= max && Object.keys(x).every(key) && Object.values(x).every(v => val.check(v)),
  copy: x => (isObj(x) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, val.copy(v)])) : x)
})

/** Genau diese Felder. Unbekannte Schlüssel — auch `__proto__`, `constructor` — sind ungültig (F68). */
const shape = (fields: Record<string, S>): S => ({
  check: x => {
    if (!isObj(x)) return false
    for (const k of Object.keys(x)) if (!Object.hasOwn(fields, k)) return false
    for (const [k, s] of Object.entries(fields)) {
      if (!Object.hasOwn(x, k) && !s.optional) return false
      if (!s.check(x[k])) return false
    }
    return true
  },
  copy: x => {
    if (!isObj(x)) return x
    const out: Record<string, unknown> = {}
    for (const [k, s] of Object.entries(fields)) {
      if (!Object.hasOwn(x, k) || x[k] === undefined) continue
      out[k] = s.copy(x[k])
    }
    return out
  }
})

/** Nach einem Unterscheidungsfeld (`kind`) gewählte Form. */
const byKind = (variants: Record<string, S>): S => {
  const pick = (x: unknown): S | null => (isObj(x) && typeof x.kind === 'string' && Object.hasOwn(variants, x.kind) ? variants[x.kind] : null)
  return { check: x => !!pick(x)?.check(x), copy: x => (pick(x) ?? prim(() => false)).copy(x) }
}

// --- Web

const storedSource = shape({ n: nat, title: str, url: str, host: str, fetchedAt: str, originalChars: nat, truncated: bool, titleFromPage: maybe(bool) })
const failure = shape({ host: str, reason: oneOf('timeout', 'stopped', 'empty', 'too-large', 'http', 'type', 'blocked', 'browser-only', 'error'), url: maybe(str) })
const provenance = shape({
  searchProvider: orNull(str),
  searchOk: bool,
  fetchAttempts: nat,
  fetchOk: nat,
  contactedHosts: list(str, 100),
  route: oneOf('local', 'cloud', 'unverified', null),
  routeLabel: str,
  endedIn: maybe(oneOf('search', 'fetch', 'model'))
})
const report = shape({
  refs: list(shape({ n: nat, start: nat, end: nat, valid: bool })),
  sentences: list(shape({
    start: nat,
    end: nat,
    refs: list(nat, 100),
    status: oneOf('cited-high', 'cited-low', 'cited-unchecked', 'cited-invalid', 'uncited', 'transition', 'unchecked'),
    coverage: orNull(num),
    quotes: list(shape({ text: str, found: bool }), 100)
  })),
  usedSources: list(nat, 100),
  summary: shape({ sentences: nat, cited: nat, uncited: nat, low: nat, invalidRefs: nat, quotesNotFound: nat, unchecked: nat })
})
const strs = list(str, 100)
const extra = shape({
  missingNumbers: strs,
  questionNumbers: maybe(strs),
  unsourcedNumbers: maybe(strs),
  label: maybe(bool),
  apartNumbers: maybe(strs),
  negation: bool,
  gap: maybe(bool)
})
const deep = shape({
  queries: list(shape({ text: str, origin: oneOf('plan', 'guard', 'fallback', 'fallback-words', 'retry'), ok: bool, hits: nat, withoutNumbers: maybe(strs) }), 100),
  rejected: list(shape({ text: str, reason: oneOf('empty', 'too-long', 'duplicate', 'over-limit', 'url', 'email', 'control', 'id') }), 100),
  limited: list(oneOf('plan-failed', 'retry-plan-failed', 'pick-failed', 'no-search', 'guard-skipped', 'timeout', 'budget', 'window', 'pages', 'loop-error', 'loop-iterations', 'loop-context', 'loop-fallback'), 100),
  loop: maybe(bool),
  topics: maybe(strs),
  candidates: nat,
  picked: nat,
  searches: nat,
  fetches: nat,
  maxPages: nat,
  unused: strs,
  terms: shape({ missing: strs, similar: strs }),
  numbersNotInQueries: maybe(strs),
  hits: maybe(list(shape({ title: str, host: str, url: str, round: oneOf(1, 2), status: oneOf('read', 'unused', 'duplicate', 'failed', 'not-tried', 'not-picked') }), 200))
})
const storedWeb = shape({
  kind: oneOf('answer', 'nothing-readable', 'error', 'stopped'),
  answer: maybe(str),
  sources: list(storedSource, 100),
  report: maybe(report),
  extras: maybe(list(extra)),
  failures: list(failure, 100),
  notFetched: nat,
  unfetchedHits: maybe(list(shape({ title: str, host: str, url: str }), 100)),
  provenance,
  error: maybe(str),
  basis: maybe(shape({ kind: oneOf('snapshot') })),
  historyDropped: maybe(nat),
  snapshotGone: maybe(bool),
  skipped: maybe(list(shape({ host: str, category: oneOf('translator', 'social', 'adult'), count: nat }), 100)),
  deep: maybe(deep)
})

// --- Bilder

const imageId = prim(isStoredImageId)
const side = prim(x => typeof x === 'number' && Number.isInteger(x) && x > 0 && x <= CHAT_IMAGE_MAX_SIDE)
const storedImage = shape({ v: oneOf(CHAT_IMAGE_CONTRACT), id: imageId, name: str, mime: oneOf('image/jpeg'), width: side, height: side, byteLength: nat })
const delivery = byKind({
  image: shape({ kind: oneOf('image'), route: oneOf('local', 'cloud'), target: str }),
  'history-dropped': shape({ kind: oneOf('history-dropped'), reason: maybe(str) }),
  rejected: shape({ kind: oneOf('rejected'), reason: str })
})

// --- Nachricht und Gespräch

const storedMessage = shape({
  role: oneOf('user', 'assistant'),
  content: str,
  at: num,
  model: maybe(str),
  stopped: maybe(yes),
  error: maybe(yes),
  origin: maybe(oneOf('web')),
  webQuery: maybe(str),
  webDeep: maybe(yes),
  webSentQueries: maybe(strs),
  followUp: maybe(yes),
  wasFollowUp: maybe(yes),
  web: maybe(storedWeb),
  hadSnapshot: maybe(yes),
  webTopicsUsed: maybe(nat),
  learning: maybe(yes),
  appNote: maybe(oneOf('old-web-source')),
  images: maybe(list(storedImage, CHAT_IMAGE_MAX_PER_MESSAGE)),
  imageDelivery: maybe(dict(isStoredImageId, delivery)),
  imagesDropped: maybe(nat),
  imagesWithheld: maybe(shape({ count: nat, reason: str })),
  imageRecipients: maybe(dict(isStoredImageId, list(str, 20))),
  webPartial: maybe(shape({ sources: list(storedSource, 100), failures: list(failure, 100), notFetched: nat }))
})
const storedChat = shape({
  version: oneOf(STORED_CHAT_VERSION),
  id: prim(x => typeof x === 'string' && CHAT_ID_RE.test(x)),
  title: prim(x => typeof x === 'string' && x.length <= 200),
  titleEdited: maybe(yes),
  pinned: maybe(yes),
  archived: maybe(yes),
  createdAt: num,
  updatedAt: num,
  model: maybe(str),
  messages: list(storedMessage, STORED_CHAT_MAX_MESSAGES)
})

// ---------------------------------------------------------------------------------------------
// Laufzeit → gespeichert

/**
 * Projektion über das Schema (F59): Auszüge, Kennungen und Bildbytes stehen in keinem Schema
 * und fallen deshalb auf jeder Ebene weg. Davor werden nur die Merkmale aus den Kennungen gebildet.
 */
export function toStoredMessage(m: PetrolChatMessage): StoredChatMessage {
  const pre: Record<string, unknown> = { ...m }
  if (m.followUpSnapshotId || m.wasFollowUp) pre.wasFollowUp = true
  if (m.web?.snapshotId || m.hadSnapshot) pre.hadSnapshot = true
  // Leere Listen und `false`-Merkmale bringen nichts und machten die Rundreise unstabil.
  for (const k of ['stopped', 'error', 'webDeep', 'followUp', 'learning'] as const) if (!m[k]) delete pre[k]
  if (!m.webSentQueries?.length) delete pre.webSentQueries
  // Ein beim Laden fehlendes Bild bleibt gespeichert ein Bild (F71): `imagesMissing` gibt es nur
  // zur Laufzeit. Sonst ginge der Verweis beim nächsten Speichern verloren, und das Aufräumen
  // löschte eine Datei, die nur vorübergehend nicht lesbar war.
  const all = [...(m.images ?? []), ...(m.imagesMissing ?? [])]
  delete pre.imagesMissing
  if (all.length) pre.images = all
  else delete pre.images
  if (m.origin !== 'web') delete pre.origin
  if (m.appNote !== 'old-web-source') delete pre.appNote
  return storedMessage.copy(pre) as StoredChatMessage
}

/** Bild-IDs eines Gesprächs, deren Bytes als Mediendatei gebraucht werden. */
export function imageIdsIn(messages: readonly { images?: readonly { id: string }[] }[]): string[] {
  return [...new Set(messages.flatMap(m => m.images?.map(i => i.id) ?? []))]
}

const imageMetaKey = (i: StoredChatImage): string => JSON.stringify([i.v, i.id, i.name, i.mime, i.width, i.height, i.byteLength])

/**
 * Angaben je Bild-ID im Gespräch. Dieselbe ID darf mehrfach vorkommen — „Erneut senden“ hängt
 * dasselbe Bild an eine neue Frage (F77) —, dann ist es EIN unveränderliches Bild mit EINER
 * Mediendatei. Weichen die Angaben unter einer ID ab, wären es zwei Bilder (F65): `conflict`.
 */
export function imageMetaIn(messages: readonly { images?: readonly StoredChatImage[] }[]): { meta: Map<string, StoredChatImage>; conflict: string | null } {
  const meta = new Map<string, StoredChatImage>()
  for (const m of messages) {
    for (const i of m.images ?? []) {
      const prev = meta.get(i.id)
      if (prev && imageMetaKey(prev) !== imageMetaKey(i)) return { meta, conflict: i.id }
      if (!prev) meta.set(i.id, { v: i.v, id: i.id, name: i.name, mime: i.mime, width: i.width, height: i.height, byteLength: i.byteLength })
    }
  }
  return { meta, conflict: null }
}

/**
 * Wechselfolge: am Anfang keine Antwort, nie zwei Antworten hintereinander (F64). Zwei Fragen
 * hintereinander nur, wenn die erste gestoppt ist (F69) — sonst stünde sie als offene Frage im
 * Verlauf fürs Modell (`completedTurns` entfernt nur gestoppte).
 */
function validSequence(messages: readonly { role: string; stopped?: boolean }[]): boolean {
  return messages.every((m, i) => {
    const next = messages[i + 1]
    if (m.role === 'user') return !(next?.role === 'user' && !m.stopped)
    return i > 0 && messages[i - 1].role === 'user'
  })
}

// ---------------------------------------------------------------------------------------------
// gespeichert → Laufzeit

/**
 * Nach dem Laden: Auszüge leer, Kennungen weg, nur `hadSnapshot`/`wasFollowUp` erhalten.
 * `bytes` liefert die Bilddaten aus `media/`. Fehlt ein Bild oder ist es nicht lesbar, steht es
 * in `imagesMissing` statt in `images` (F63): Es geht nie mit leeren Bytes an ein Modell, und die
 * Anzeige kann es benennen. Gespeichert bleibt es ein Bild (F71, `toStoredMessage`); kommt die
 * Datei wieder (vorübergehender Lesefehler), ist es beim nächsten Laden wieder da.
 */
export function restoreMessage(m: StoredChatMessage, bytes: (imageId: string) => string | null, opts: { lazy?: boolean } = {}): PetrolChatMessage {
  const { web, webPartial, images, ...rest } = m
  const out: PetrolChatMessage = { ...rest, restored: true }
  if (web) out.web = { ...web, sources: web.sources.map(s => ({ ...s, excerpt: '' })) }
  if (webPartial) out.webPartial = { ...webPartial, sources: webPartial.sources.map(s => ({ ...s, excerpt: '' })) }
  const present: ChatImage[] = []
  const missing: StoredChatImage[] = []
  for (const i of images ?? []) {
    // Bei Bedarf (Rev. 9 Punkt 29, F91): Bild bleibt ein Bild, die Bytes kommen später.
    if (opts.lazy) { present.push({ ...i, dataBase64: '' }); continue }
    const data = bytes(i.id)
    if (data) present.push({ ...i, dataBase64: data })
    else missing.push(i)
  }
  if (present.length) out.images = present
  if (missing.length) out.imagesMissing = missing
  return out
}

// ---------------------------------------------------------------------------------------------
// Titel und Aufbewahrung

/** Titel = erste Frage, ohne Modellaufruf (Teil 1). */
export function chatTitle(messages: readonly { role: string; content: string }[]): string {
  const first = messages.find(m => m.role === 'user' && m.content.trim())
  const t = (first?.content ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return 'Neues Gespräch'
  return t.length > STORED_CHAT_TITLE_MAX ? `${t.slice(0, STORED_CHAT_TITLE_MAX - 1).trimEnd()}…` : t
}

/** Vom Nutzer gesetzter Titel: Leerraum zusammengefasst, höchstens 120 Zeichen, nie leer. */
export function sanitizeChatTitle(v: unknown): string | null {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.slice(0, 120)
}

export type ChatRetentionDays = 30 | 90 | 365 | 0
/** 0 = nie löschen. */
export const CHAT_RETENTION_OPTIONS: readonly ChatRetentionDays[] = [30, 90, 365, 0]
export const CHAT_RETENTION_DEFAULT: ChatRetentionDays = 90

export function normalizeRetention(v: unknown): ChatRetentionDays {
  return CHAT_RETENTION_OPTIONS.includes(v as ChatRetentionDays) ? (v as ChatRetentionDays) : CHAT_RETENTION_DEFAULT
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Abgelaufen, gemessen an der letzten Nachricht (Teil 1: „seit letzter Nachricht“). */
export function isChatExpired(updatedAt: number, retention: ChatRetentionDays, now: number): boolean {
  if (retention === 0) return false
  return now - updatedAt > retention * DAY_MS
}

// ---------------------------------------------------------------------------------------------
// Laden (streng) und Bauen

/** Gültiges Gespräch oder null („nicht lesbar“). Nimmt nur, was genau dem Vertrag entspricht. */
export function parseStoredChat(x: unknown): StoredChat | null {
  if (!storedChat.check(x)) return null
  const c = x as StoredChat
  if (!validSequence(c.messages) || imageMetaIn(c.messages).conflict) return null
  return c
}

/** Kopf ohne Nachrichten — für die Liste. */
export function chatHeader(c: StoredChat): StoredChatHeader {
  const h: StoredChatHeader = { version: c.version, id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt }
  if (c.titleEdited) h.titleEdited = true
  if (c.pinned) h.pinned = true
  if (c.archived) h.archived = true
  if (c.model !== undefined) h.model = c.model
  return h
}

/**
 * Kürzt auf die letzten `max` Nachrichten, aber nur an einer Wechselgrenze (F64): Eine Antwort,
 * deren Frage wegfiele, fällt mit weg.
 */
export function trimToTurns<T extends { role: string }>(messages: readonly T[], max = STORED_CHAT_MAX_MESSAGES): T[] {
  let start = Math.max(0, messages.length - max)
  while (start < messages.length && messages[start].role === 'assistant') start++
  return messages.slice(start)
}

export class StoredChatError extends Error {}

/**
 * Baut das zu speichernde Gespräch aus Laufzeitnachrichten; Titel folgt der ersten Frage, solange
 * nicht umbenannt. Ergibt das kein gültiges Gespräch (Daten außerhalb des Vertrags, doppelte
 * Bild-ID), wirft es `StoredChatError` — geschrieben wird nur, was `parseStoredChat` wieder lädt.
 */
export function buildStoredChat(prev: Pick<StoredChatHeader, 'id' | 'createdAt'> & Partial<Pick<StoredChatHeader, 'title' | 'titleEdited' | 'pinned' | 'archived'>>, messages: readonly PetrolChatMessage[], now: number): StoredChat {
  const stored = trimToTurns(messages).map(toStoredMessage)
  const lastAnswer = [...stored].reverse().find(m => m.role === 'assistant' && m.model)
  const last = stored[stored.length - 1]
  const out: StoredChat = {
    version: STORED_CHAT_VERSION,
    id: prev.id,
    title: prev.titleEdited && prev.title ? prev.title : chatTitle(stored),
    createdAt: prev.createdAt,
    updatedAt: last ? Math.max(last.at, prev.createdAt) : now,
    messages: stored
  }
  if (prev.titleEdited && prev.title) out.titleEdited = true
  if (prev.pinned) out.pinned = true
  if (prev.archived) out.archived = true
  if (lastAnswer?.model) out.model = lastAnswer.model
  const dup = imageMetaIn(stored).conflict
  if (dup) throw new StoredChatError(`Bild-ID mit zwei verschiedenen Bildern: ${dup}`)
  if (!parseStoredChat(out)) throw new StoredChatError('Gespräch entspricht nicht dem Speicherformat.')
  return out
}
