// Websuche im Petrol-Chat: Suche + Seitenabrufe einer Anfrage (Stufe 1b,
// docs/codex-collab/chat-websuche.md, E2).
//
// Kein Agenten-Loop und kein Modell, das URLs wählt: die App sucht mit den Suchwörtern,
// die der Nutzer gesehen hat, und ruft nur Treffer DIESES Laufs ab (F01). Ein Signal trägt
// Stopp und Netzfrist für Suche und alle Abrufe (F02, F03); die Netzfrist ist bestmöglich,
// weil die Aufbereitung der Seiten im selben Thread läuft. Die Abhängigkeiten sind
// injizierbar, damit Abbruch, Frist und Warteschlange ohne Netz prüfbar sind.

import { fetchAndExtract, FetchExtractError, PageTooLargeError } from '../webResearch/fetchExtract'
import { webSearch } from '../webResearch/providers'
import type { WebResearchConfig, WebSearchHit } from '../../shared/webResearch'
import {
  candidatesFromHits,
  runFetchQueue,
  splitSkippedHits,
  type WebSkippedHit,
  WEB_CHAT_NET_DEADLINE_MS,
  type QueueEntry,
  type WebChatCandidate,
  type WebFetchOutcome,
  type WebFetchFailReason
} from '../../shared/webChat'

export type WebChatPhase = 'search' | 'fetch'

export interface WebGatherDeps {
  search: (query: string, signal: AbortSignal) => Promise<WebSearchHit[]>
  fetchPage: (url: string, signal: AbortSignal) => Promise<WebFetchOutcome>
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface WebGatherResult {
  /** Suche wurde tatsächlich an den Anbieter geschickt. */
  searchTriggered: boolean
  searchOk: boolean
  searchError?: string
  candidates: WebChatCandidate[]
  /** Treffer, die nicht abgerufen wurden, weil sie keine Sachquelle sind (Übersetzer, Social/Video). */
  skipped: WebSkippedHit[]
  entries: QueueEntry[]
  contactedHosts: string[]
  stoppedBy: 'timeout' | 'stopped' | null
  /** Phase, in der Stopp oder Frist griffen. */
  stoppedIn?: WebChatPhase
}

export async function gatherWebSources(
  query: string,
  deps: WebGatherDeps,
  opts: { signal: AbortSignal; deadlineMs?: number; onPhase?: (phase: WebChatPhase, detail: { started?: number; host?: string }) => void }
): Promise<WebGatherResult> {
  const net = new AbortController()
  let timedOut = false
  const onUserAbort = () => net.abort()
  if (opts.signal.aborted) net.abort()
  else opts.signal.addEventListener('abort', onUserAbort, { once: true })
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const timer = setTimer(() => { timedOut = true; net.abort() }, opts.deadlineMs ?? WEB_CHAT_NET_DEADLINE_MS)
  const stopReason = (): 'timeout' | 'stopped' | null => (opts.signal.aborted ? 'stopped' : timedOut ? 'timeout' : null)

  const result: WebGatherResult = {
    searchTriggered: false,
    searchOk: false,
    candidates: [],
    skipped: [],
    entries: [],
    contactedHosts: [],
    stoppedBy: null
  }
  try {
    if (stopReason()) {
      result.stoppedBy = stopReason()
      result.stoppedIn = 'search'
      return result
    }
    opts.onPhase?.('search', {})
    result.searchTriggered = true
    let hits: WebSearchHit[]
    try {
      hits = await deps.search(query, net.signal)
    } catch (err) {
      const stop = stopReason()
      if (stop) {
        result.stoppedBy = stop
        result.stoppedIn = 'search'
      } else {
        result.searchError = err instanceof Error ? err.message : String(err)
      }
      return result
    }
    // Ein später Sucherfolg nach Stopp/Frist startet keine Abrufe mehr.
    const stopAfterSearch = stopReason()
    if (stopAfterSearch) {
      result.stoppedBy = stopAfterSearch
      result.stoppedIn = 'search'
      return result
    }
    result.searchOk = true
    const split = splitSkippedHits(hits)
    result.skipped = split.skipped
    result.candidates = candidatesFromHits(split.kept)
    let started = 0
    result.entries = await runFetchQueue(result.candidates, (c) => deps.fetchPage(c.url, net.signal), {
      stopReason,
      onStart: (c) => {
        started++
        result.contactedHosts.push(c.host)
        opts.onPhase?.('fetch', { started, host: c.host })
      }
    })
    const stop = stopReason()
    if (stop) {
      result.stoppedBy = stop
      result.stoppedIn = 'fetch'
    }
    return result
  } finally {
    clearTimer(timer)
    opts.signal.removeEventListener('abort', onUserAbort)
  }
}

/** Fehler eines Abrufs auf einen benennbaren Grund abbilden (Anzeige „Nicht abgerufen: …“). */
export function fetchFailReason(err: unknown): WebFetchFailReason {
  if (err instanceof PageTooLargeError) return 'too-large'
  if (err instanceof FetchExtractError) return 'http'
  const msg = err instanceof Error ? err.message : String(err)
  if (/Inhaltstyp/i.test(msg)) return 'type'
  if (/Zeitüberschreitung|timeout/i.test(msg)) return 'timeout'
  if (/unzulässig|Ungültige|privat|abgelehnt|Weiterleitung|blockiert|nicht erlaubt/i.test(msg)) return 'blocked'
  return 'error'
}

/** Standard-Abhängigkeiten: Anbieter-Suche und lokaler Abruf über den gepinnten Egress. */
export function defaultWebGatherDeps(config: WebResearchConfig, apiKey: string | null): WebGatherDeps {
  return {
    search: (query, signal) => webSearch(query, { config, apiKey, signal }),
    fetchPage: async (url, signal) => {
      const startedAt = Date.now()
      try {
        const r = await fetchAndExtract(url, { signal, markTruncation: false, rejectTruncatedBody: true })
        // Aufbereitung läuft synchron im Main-Thread — Dauer protokollieren (erst messen, F03).
        console.log(`[PetrolWeb] Seite aufbereitet in ${Date.now() - startedAt} ms (${r.originalChars} Zeichen)`)
        return {
          ok: true,
          title: r.record.title,
          finalUrl: r.record.finalUrl,
          fetchedAt: r.record.fetchedAt,
          text: r.markdown,
          originalChars: r.originalChars,
          truncated: r.truncated
        }
      } catch (err) {
        return { ok: false, reason: fetchFailReason(err) }
      }
    }
  }
}
