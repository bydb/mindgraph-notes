// Zählung der Webabrufe: wie oft gelingt ein Abruf, woran scheitert er (lädt erst im Browser,
// gesperrt, Zeitlimit …). Anlass 06.11.2026: Ob sich ein Browser in der App lohnt, entscheidet
// die Häufigkeit im Alltag, nicht ein Einzelfall (docs/codex-collab/web-render-stufe-a.md).
//
// Nur Zähler je Tag und, für Fehlschläge, die Website (Host) — keine Adressen, keine Fragen,
// keine Inhalte. Bleibt auf diesem Rechner (main/webResearch/fetchStats.ts), wird nie gesendet.

import type { WebFetchFailReason } from './webChat'

export type FetchStatKind = 'ok' | WebFetchFailReason
export type FetchStatChannel = 'chat' | 'agent'

export const FETCH_STAT_KINDS: readonly FetchStatKind[] = ['ok', 'browser-only', 'http', 'timeout', 'too-large', 'type', 'blocked', 'empty', 'stopped', 'error']
export const FETCH_STATS_KEEP_DAYS = 30
const MAX_HOSTS_PER_REASON_DAY = 50

type Counts = Partial<Record<FetchStatKind, number>>

export interface FetchStatsDay {
  chat: Counts
  agent: Counts
  /** Fehlschläge je Grund und Website. */
  hosts: Partial<Record<WebFetchFailReason, Record<string, number>>>
}

export interface WebFetchStatsFile {
  version: 1
  days: Record<string, FetchStatsDay>
}

export interface WebFetchStatsSummary {
  /** Erster Tag mit Daten im Zeitraum, sonst null. */
  since: string | null
  chat: Counts
  agent: Counts
  /** Je Fehlgrund die häufigsten Websites, absteigend. */
  topHosts: Partial<Record<WebFetchFailReason, Array<{ host: string; count: number }>>>
}

export const emptyFetchStats = (): WebFetchStatsFile => ({ version: 1, days: {} })

/** Lokales Datum JJJJ-MM-TT — nie `toISOString()` (Vortag nach Mitternacht in UTC+1/+2). */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Host auf eine harmlose, kurze Form bringen; alles andere wird nicht gezählt. */
export function normalizeStatHost(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/\.+$/, '').replace(/^www\./, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && h.length <= 253 ? h : null
}

const isKind = (k: unknown): k is FetchStatKind => typeof k === 'string' && (FETCH_STAT_KINDS as readonly string[]).includes(k)
const isDayKey = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k)
const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 1e9

function cleanCounts(x: unknown): Counts {
  const out: Counts = {}
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (isKind(k) && isCount(v)) out[k] = v
  return out
}

/** Eingelesene Datei streng prüfen; Unbekanntes fällt weg statt die Zählung zu kippen. */
export function parseFetchStats(raw: unknown): WebFetchStatsFile {
  const file = emptyFetchStats()
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) return file
  const days = (raw as { days?: unknown }).days
  if (!days || typeof days !== 'object') return file
  for (const [day, v] of Object.entries(days)) {
    if (!isDayKey(day) || !v || typeof v !== 'object') continue
    const d = v as Record<string, unknown>
    const hosts: FetchStatsDay['hosts'] = {}
    if (d.hosts && typeof d.hosts === 'object') {
      for (const [reason, list] of Object.entries(d.hosts)) {
        if (!isKind(reason) || reason === 'ok' || !list || typeof list !== 'object') continue
        const clean: Record<string, number> = {}
        for (const [h, n] of Object.entries(list).slice(0, MAX_HOSTS_PER_REASON_DAY)) {
          const host = normalizeStatHost(h)
          if (host && isCount(n)) clean[host] = n
        }
        hosts[reason] = clean
      }
    }
    file.days[day] = { chat: cleanCounts(d.chat), agent: cleanCounts(d.agent), hosts }
  }
  return file
}

/** Tage vor dem Aufbewahrungsfenster entfernen. */
export function pruneFetchStats(file: WebFetchStatsFile, today: string, keepDays = FETCH_STATS_KEEP_DAYS): WebFetchStatsFile {
  const cutoff = dayOffset(today, -(keepDays - 1))
  const days: Record<string, FetchStatsDay> = {}
  for (const [day, v] of Object.entries(file.days)) if (day >= cutoff && day <= today) days[day] = v
  return { version: 1, days }
}

function dayOffset(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return localDay(new Date(y, m - 1, d + delta))
}

/** Einen Abruf zählen. Liefert eine neue Datei, die alte bleibt unverändert. */
export function recordFetchStat(
  file: WebFetchStatsFile,
  ev: { channel: FetchStatChannel; kind: FetchStatKind; host: string; day: string }
): WebFetchStatsFile {
  if (!isKind(ev.kind) || !isDayKey(ev.day)) return file
  const prev = file.days[ev.day] ?? { chat: {}, agent: {}, hosts: {} }
  const counts = { ...prev[ev.channel], [ev.kind]: (prev[ev.channel][ev.kind] ?? 0) + 1 }
  let hosts = prev.hosts
  const host = normalizeStatHost(ev.host)
  if (ev.kind !== 'ok' && host) {
    const list = { ...(prev.hosts[ev.kind] ?? {}) }
    if (host in list || Object.keys(list).length < MAX_HOSTS_PER_REASON_DAY) list[host] = (list[host] ?? 0) + 1
    hosts = { ...prev.hosts, [ev.kind]: list }
  }
  return { version: 1, days: { ...file.days, [ev.day]: { ...prev, [ev.channel]: counts, hosts } } }
}

export function summarizeFetchStats(file: WebFetchStatsFile, today: string, keepDays = FETCH_STATS_KEEP_DAYS, topN = 5): WebFetchStatsSummary {
  const days = Object.keys(pruneFetchStats(file, today, keepDays).days).sort()
  const chat: Counts = {}
  const agent: Counts = {}
  const hostSums: Partial<Record<WebFetchFailReason, Map<string, number>>> = {}
  for (const day of days) {
    const d = file.days[day]
    for (const k of FETCH_STAT_KINDS) {
      if (d.chat[k]) chat[k] = (chat[k] ?? 0) + d.chat[k]!
      if (d.agent[k]) agent[k] = (agent[k] ?? 0) + d.agent[k]!
    }
    for (const [reason, list] of Object.entries(d.hosts) as Array<[WebFetchFailReason, Record<string, number>]>) {
      const m = hostSums[reason] ?? new Map<string, number>()
      for (const [h, n] of Object.entries(list)) m.set(h, (m.get(h) ?? 0) + n)
      hostSums[reason] = m
    }
  }
  const topHosts: WebFetchStatsSummary['topHosts'] = {}
  for (const [reason, m] of Object.entries(hostSums) as Array<[WebFetchFailReason, Map<string, number>]>) {
    topHosts[reason] = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topN).map(([host, count]) => ({ host, count }))
  }
  return { since: days[0] ?? null, chat, agent, topHosts }
}
