/**
 * Laufzeittyp einer Nachricht im Petrol-Chat. Liegt in `shared/`, weil ab Teil 1 der Main das
 * Gespräch führt und speichert (Rev. 4 Punkt 12 und Rev. 8,
 * docs/codex-collab/chat-verlauf-notizen-bilder.md). Gespeichert wird NICHT dieser Typ, sondern
 * die Projektion `StoredChatMessage` (`shared/petrolChatStored.ts`, Rev. 2 Punkt 1).
 */

import type { WebChatResult, WebFetchFailure, WebSource } from './webChat'
import type { ChatImage, ChatImageDelivery } from './chatImages'

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
  /** Nur Frage: „gründlich“ — die Suchanfragen hat das Modell geplant (stehen an der Antwort). */
  webDeep?: boolean
  /** Nur gestoppte „gründliche“ Frage: Suchanfragen, die bis zum Stopp gesendet waren (F25). */
  webSentQueries?: string[]
  /** Frage zu eingefrorenen Auszügen, ohne neue Suche. */
  followUp?: boolean
  /** Kennung der Auszüge, an die diese Frage gebunden wurde — für „Erneut senden“. */
  followUpSnapshotId?: string
  /**
   * Nur geladene Frage: war an Auszüge gebunden, deren Kennung nicht gespeichert wird
   * (Rev. 3 Punkt 9). Kein „Erneut senden“, sondern der Hinweis `followUpGoneHint`.
   */
  wasFollowUp?: boolean
  /** Nur Antwort: Ergebnis aus dem Main (Quellen, Prüfbericht, Provenienz). */
  web?: WebChatResult
  /**
   * Nur geladene Antwort: hatte eingefrorene Auszüge (`web.snapshotId`), die nach dem Laden nicht
   * mehr da sind (Rev. 3 Punkt 9). Der Knopf zeigt deaktiviert „Seiten nicht mehr da“.
   */
  hadSnapshot?: boolean
  /** Nur Antwort ohne Websuche: so viele frühere Webfragen gingen als Thema mit (Weg 1). */
  webTopicsUsed?: number
  /**
   * Feste App-Antwort statt Modell: Frage nach Inhalt einer alten Webantwort/Quelle, die das
   * Modell nicht sieht (Codex F01, chat-webthema-im-verlauf.md).
   */
  appNote?: 'old-web-source'
  /** Nur Frage: angehängte Bilder (aufbereitet, Rev. 7 Punkt 20). */
  images?: ChatImage[]
  /**
   * Nur geladene Frage: Bilder, deren Mediendatei fehlt oder nicht lesbar ist (Codex F63). Ohne
   * Bytes — sie gehen nie an ein Modell, die Marke benennt sie.
   */
  imagesMissing?: Array<Omit<ChatImage, 'dataBase64'>>
  /** Nur Frage: was der Main mit jedem Bild gemacht hat (gesendet, abgelehnt). */
  imageDelivery?: Record<string, ChatImageDelivery>
  /** Nur Antwort: so viele ältere Bilder gingen bei dieser Anfrage nicht mehr mit (Codex F53). */
  imagesDropped?: number
  /** Nur Antwort: ältere Bilder, die der gewählte Weg nicht annahm — ohne sie gefragt (Grund vom Main). */
  imagesWithheld?: { count: number; reason: string }
  /** Nur Frage: an wen jedes Bild bisher ging — auch mit späteren Folgefragen (Verlaufsbilder). */
  imageRecipients?: Record<string, string[]>
  /**
   * Aus der Ablage geladen (Teil 1, Rev. 9 Punkt 28): Auszüge und Snapshot-Kennungen fehlen; die
   * Prüfung je Satz zeigt das Ergebnis vom Zeitpunkt der Antwort. Nie gespeichert (kein Feld im
   * Speicherformat).
   */
  restored?: boolean
  /** Nur gestoppte Webantwort: Quellen, die bis zum Stopp feststanden. */
  webPartial?: { sources: WebSource[]; failures: WebFetchFailure[]; notFetched: number }
  at: number
}

// ---------------------------------------------------------------------------------------------
// Gespräch im Main (Teil 1, Rev. 4 Punkt 12): was über die IPC-Grenze geht.

/** Renderer → Main. Kein Verlauf, keine Themenfragen, keine Herkunft — die kennt der Main selbst. */
export interface PetrolConvSendRequest {
  requestId: string
  question: string
  kind: 'chat' | 'web' | 'follow-up'
  web?: { query: string; deep?: boolean }
  followUpSnapshotId?: string
  /** Bilder dieser Frage, aufbereitet (neu oder „Erneut senden“). */
  images?: ChatImage[]
  model: string
  backend: 'ollama' | 'lm-studio'
  lmStudioPort?: number
  cloud: { model: string; provider: 'openrouter' | 'llmbase' } | null
}

/** no-encryption / basic-text: kein Schlüssel, es wird nicht gespeichert. memory: kein Vault. */
export type PetrolChatStorageMode = 'on' | 'memory' | 'no-encryption' | 'basic-text'
export type PetrolChatStorageState = 'saved' | 'unchanged' | 'failed' | Exclude<PetrolChatStorageMode, 'on'>

export type PetrolConvResult =
  | { ok: true; messages: PetrolChatMessage[]; storage: PetrolChatStorageState }
  | { ok: false; error: string }

export type PetrolConvOpenResult =
  | { ok: true; id: string; title?: string; messages: PetrolChatMessage[]; storage: PetrolChatStorageMode }
  | { ok: false; error: string }

export interface PetrolConvListItem {
  id: string
  title: string
  updatedAt: number
  model?: string
  /** Nicht entschlüsselbar oder kein gültiges Gespräch — nur Löschen möglich. */
  unreadable?: boolean
  pinned?: boolean
  archived?: boolean
}

export type PetrolConvListResult =
  | { ok: true; storage: PetrolChatStorageMode; items: PetrolConvListItem[] }
  | { ok: false; error: string }
