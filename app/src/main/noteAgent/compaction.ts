// Verdichten von Gelesenem im Agent-Loop.
//
// Auslöser (11.11.2026): Jedes Leseergebnis blieb bis zum Laufende in voller Länge in der
// Konversation. Bei 32 768 Token war nach sechs bis sieben Notizen Schluss — unabhängig vom
// Modell. Wird der Platz knapp, fasst EIN zusätzlicher Modellaufruf die älteren Leseergebnisse
// auftragsbezogen zusammen; die Originale in der Konversation werden durch die Fassung ersetzt.
//
// Grundsätze:
// - Nie still: Der Loop meldet die Verdichtung als Protokollschritt, und jede ersetzte
//   Nachricht trägt eine Kopfzeile, die dem Modell sagt, dass es eine Fassung vor sich hat.
// - Nie verlieren: Fehlt zu einem Ergebnis ein Abschnitt, ist die Antwort abgeschnitten oder
//   wird die Fassung nicht kleiner, bleibt das Original stehen.
// - Zwischen zwei Runden nur, was das Modell schon gesehen hat. Mitten in einer Runde, wenn
//   sonst ein Leseaufruf abgelehnt würde, auch die Ergebnisse dieser Runde.
// - Gleicher Datenweg: Der Aufruf nutzt dieselben chatOptions wie der Lauf.

import { chatWithTools, type ChatMessage, type ChatOptions } from '../llm/chatClient'
import type { CallUsage } from '../../shared/llmCost'
import { estimateTokens, MIN_OUTPUT_RESERVE } from '../../shared/contextBudget'
import { looksTruncated } from '../../shared/contextGuard'

/** Leseergebnisse, die verdichtet werden dürfen. Schon verdichtete Werkzeuge (folder_digest, collect_table) nicht. */
export const COMPACTABLE_TOOLS = new Set(['note_read', 'read_context_file', 'read_attachment', 'note_search', 'vault_search'])
export const COMPACTED_PREFIX = '[Verdichtet vom Agenten'
/** Kürzere Ergebnisse lohnen den Aufwand nicht. */
const MIN_ITEM_CHARS = 1_200
/** Unter dieser Gesamtgröße (Token, geschätzt) wird gar nicht verdichtet. */
export const MIN_COMPACTION_TOKENS = 2_000
/** Anteil des Fensters, den das Material eines Verdichtungsaufrufs höchstens belegt. */
const COMPACTION_INPUT_SHARE = 0.6

export interface CompactionItem {
  /** Index der tool-Nachricht in `messages`. */
  index: number
  id: string
  label: string
  content: string
  tokens: number
  /** Stand das Ergebnis schon in einem Modellaufruf (vor der letzten Antwort des Modells)? */
  seen: boolean
}

function findCall(messages: ChatMessage[], toolIndex: number): { name: string; arguments: Record<string, unknown> } | null {
  const msg = messages[toolIndex]
  for (let i = toolIndex - 1; i >= 0; i--) {
    const call = messages[i].tool_calls?.find(c => c.id === msg.tool_call_id)
    if (call) return { name: call.name, arguments: (call.arguments ?? {}) as Record<string, unknown> }
  }
  return null
}

function labelFor(messages: ChatMessage[], toolIndex: number): string {
  const call = findCall(messages, toolIndex)
  if (!call) return messages[toolIndex].tool_name ?? 'Leseergebnis'
  const main = ['path', 'file', 'name', 'query'].map(k => call.arguments[k]).find(v => typeof v === 'string' && v) as string | undefined
  return `${call.name}: ${main ?? JSON.stringify(call.arguments).slice(0, 160)}`
}

/**
 * Leseergebnisse auswählen: lang genug, noch nicht verdichtet, älteste zuerst, bis `maxTokens`
 * erreicht ist. Standard: nur was vor der letzten Antwort des Modells steht (schon einmal
 * gesehen). `includeUnseen` nimmt auch die Ergebnisse der laufenden Runde — nötig, wenn ein
 * Modell viele Notizen in EINER Runde anfordert: dann gibt es nichts „Gesehenes“, und ohne
 * Verdichten würden die späteren Leseaufrufe derselben Runde abgelehnt (gemessen 12.11.2026).
 */
export function selectCompactable(messages: ChatMessage[], maxTokens: number, includeUnseen = false): CompactionItem[] {
  let lastAssistant = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') { lastAssistant = i; break }
  }
  const items: CompactionItem[] = []
  let total = 0
  const end = includeUnseen ? messages.length : lastAssistant
  for (let i = 0; i < end; i++) {
    const m = messages[i]
    if (m.role !== 'tool' || !m.tool_name || !COMPACTABLE_TOOLS.has(m.tool_name)) continue
    const content = m.content ?? ''
    if (content.length < MIN_ITEM_CHARS || content.startsWith(COMPACTED_PREFIX) || /^(Tool-)?Fehler:/.test(content)) continue
    const tokens = estimateTokens(content)
    if (total + tokens > maxTokens) break
    total += tokens
    items.push({ index: i, id: `K${items.length + 1}`, label: labelFor(messages, i), content, tokens, seen: i < lastAssistant })
  }
  return items
}

export function buildCompactionMessages(instruction: string, items: CompactionItem[]): ChatMessage[] {
  const system = [
    'Du verdichtest Arbeitsmaterial für einen Agenten, der den folgenden Auftrag bearbeitet.',
    'Unten stehen Leseergebnisse, jedes mit einer Kennung.',
    'Schreibe zu JEDEM Leseergebnis genau einen Abschnitt. Der Abschnitt beginnt mit einer Zeile, die nur aus „### “ und der Kennung besteht.',
    'Halte im Abschnitt fest, was der Agent für den Auftrag aus diesem Ergebnis braucht: Kernaussagen, Zahlen, Namen, Daten, Quellenangaben, offene Punkte.',
    'Wichtige Formulierungen übernimmst du wörtlich in Anführungszeichen. Alles andere gibst du in eigenen Worten wieder.',
    'Erfinde nichts und ergänze nichts aus eigenem Wissen. Was im Ergebnis nicht steht, steht auch nicht im Abschnitt.',
    'Bei Suchergebnissen behältst du die Pfade der Treffer, die zum Auftrag passen.',
    'Höchstens etwa 120 Wörter je Abschnitt. Keine Einleitung, kein Schlusswort.',
    'Beende jeden Abschnitt mit EINER Zeile, die mit „Nicht übernommen:“ beginnt, und nenne dort höchstens sechs Stichworte zu Themen, die du weggelassen hast — nur Themen, keine Werte, keine Sätze. Hast du nichts weggelassen, schreibe „Nicht übernommen: nichts“.'
  ].join('\n')
  const material = items.map(it => `### ${it.id} — ${it.label}\n${it.content}`).join('\n\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: `AUFTRAG DES NUTZERS:\n${instruction}\n\nLESEERGEBNISSE:\n\n${material}` }
  ]
}

/** Antwort in Abschnitte je Kennung zerlegen. Unbekannte Kennungen und leere Abschnitte fallen weg. */
export function parseCompaction(text: string, ids: string[]): Map<string, string> {
  const wanted = new Set(ids)
  const out = new Map<string, string>()
  let current: string | null = null
  let buffer: string[] = []
  const flush = (): void => {
    if (current && wanted.has(current) && !out.has(current)) {
      const body = buffer.join('\n').trim()
      if (body) out.set(current, body)
    }
    buffer = []
  }
  for (const line of text.split('\n')) {
    const head = /^\s*#{1,4}\s*\**\s*(K\d+)\b/.exec(line)
    if (head) { flush(); current = head[1]; continue }
    if (current) buffer.push(line)
  }
  flush()
  return out
}

/** Höchstlänge der wörtlichen Belegsätze je Leseergebnis. */
const SALIENT_MAX_CHARS = 500
const SALIENT_MAX_SENTENCE = 260
/** Kennungsartig: Buchstaben und Ziffern in einem Wort („INV-4821“, „R-114“, „B12“). */
const CODE_LIKE = /\p{L}+[-_/]?\d{2,}|\d{2,}[-_/]?\p{L}+/u

/**
 * Sätze des Originals, die Zahlen oder Kennungen tragen — wörtlich, ohne Modell. Sie sind der
 * feste Anker jeder Kurzfassung: Was ein Modell beim Zusammenfassen an Nummern, Beträgen und
 * Daten weglässt, lässt sich nicht rekonstruieren, und im Mess-Harness ließ dasselbe Modell
 * dieselbe Angabe mal stehen, mal weg (12.11.2026, Szenario „nachfrage“). Sätze mit Kennungen
 * zuerst, dann solche mit bloßen Zahlen; in Dokumentreihenfolge, bis das Budget voll ist.
 */
export function salientSentences(text: string, maxChars = SALIENT_MAX_CHARS): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 8 && /\d/.test(s) && !/^#{1,6}\s/.test(s))
  const ranked = sentences.map((s, i) => ({ s, i, rank: CODE_LIKE.test(s) ? 0 : 1 })).sort((a, b) => a.rank - b.rank || a.i - b.i)
  const picked: Array<{ s: string; i: number }> = []
  let used = 0
  for (const { s, i } of ranked) {
    const cut = s.length > SALIENT_MAX_SENTENCE ? `${s.slice(0, SALIENT_MAX_SENTENCE)}…` : s
    if (used + cut.length > maxChars) continue
    picked.push({ s: cut, i })
    used += cut.length
  }
  return picked.sort((a, b) => a.i - b.i).map(p => p.s)
}

/** Nur für gelesene Texte — Suchtreffer sind Listen von Fundstellen, dort trägt die Kurzfassung die Pfade. */
const SALIENT_TOOLS = /^(note_read|read_context_file|read_attachment):/

export function compactedContent(item: CompactionItem, summary: string): string {
  const quotes = SALIENT_TOOLS.test(item.label) ? salientSentences(item.content) : []
  const anchor = quotes.length > 0 ? `\nWörtlich aus dem Original (Sätze mit Zahlen und Kennungen): ${quotes.map(q => `„${q}“`).join(' ')}` : ''
  return compactedBody(item, summary) + anchor
}

/** Feste Obergrenzen je Kurzfassung — im Code, nicht als Bitte an das Modell. */
const SUMMARY_MAX_CHARS = 900
const OMITTED_MAX_CHARS = 180

/**
 * Antwortabschnitt des Modells in Form bringen: Fließtext auf SUMMARY_MAX_CHARS, EINE Zeile
 * „Nicht übernommen:“ auf OMITTED_MAX_CHARS. Ohne diese Grenzen wuchsen Kurzfassungen im
 * Mess-Harness auf das Dreifache (ausufernde, teils doppelte Themenlisten), und bei 28 Notizen
 * blieb kein Platz mehr zum Lesen (12.11.2026, Szenario „gross“).
 */
export function shapeSummary(summary: string): string {
  const lines = summary.split('\n')
  const body: string[] = []
  let omitted = ''
  for (const line of lines) {
    const at = line.search(/Nicht übernommen:/i)
    if (at < 0) { body.push(line); continue }
    if (line.slice(0, at).trim()) body.push(line.slice(0, at).trim())
    if (!omitted) omitted = line.slice(at).replace(/\s+/g, ' ').trim()
  }
  let text = body.join('\n').trim()
  if (text.length > SUMMARY_MAX_CHARS) {
    const cut = text.slice(0, SUMMARY_MAX_CHARS)
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'))
    text = `${cut.slice(0, end > SUMMARY_MAX_CHARS / 2 ? end + 1 : SUMMARY_MAX_CHARS).trim()} …`
  }
  if (omitted.length > OMITTED_MAX_CHARS) omitted = `${omitted.slice(0, OMITTED_MAX_CHARS).replace(/[,;]?\s*\S*$/, '')} …`
  return omitted ? `${text}\n${omitted}` : text
}

function compactedBody(item: CompactionItem, summary: string): string {
  return `${COMPACTED_PREFIX} — Original ${item.content.length.toLocaleString('de-DE')} Zeichen (${item.label}). Schweigt die Kurzfassung zu etwas, lies die Quelle erneut, statt „keins“ oder einen Wert zu schreiben.]\n${shapeSummary(summary)}`
}

export interface CompactionOutcome {
  /** Zahl der ersetzten Leseergebnisse. 0 = Aufruf gemacht, aber nichts Brauchbares erhalten. */
  count: number
  /** Geschätzte Token der ersetzten Originale bzw. der neuen Fassungen. */
  removedTokens: number
  addedTokens: number
  /** Anteil von `removedTokens`, den das Modell noch nicht gesehen hatte (nur geschätzt verbucht). */
  removedUnseenTokens: number
}

/**
 * Leseergebnisse in `messages` durch eine auftragsbezogene Fassung ersetzen (in place).
 * null = es gab nichts zu verdichten (kein Modellaufruf). `count: 0` = der Aufruf lief, brachte
 * aber nichts Verwertbares — `messages` ist dann unverändert, und der Aufrufer zählt den
 * Fehlversuch, damit er nicht bei jedem Leseaufruf erneut einen Modellaufruf verschenkt.
 */
interface DigestParams {
  instruction: string
  chatOptions: ChatOptions
  window: number
  runId: string
  recordUsage: (usage: CallUsage | null) => void
}

/**
 * EIN Modellaufruf: Kurzfassung je Kennung. Leere Map = Aufruf lief, brachte aber nichts
 * Verwertbares (Fehler, abgeschnitten, gekürzter Prompt, keine Abschnitte).
 */
async function digestItems(items: CompactionItem[], params: DigestParams): Promise<Map<string, string>> {
  const { chatOptions, window } = params
  const request = buildCompactionMessages(params.instruction, items)
  const sentChars = request.reduce((n, m) => n + (m.content?.length ?? 0), 0)
  let result
  try {
    result = await chatWithTools(request, [], { ...chatOptions, telemetryModule: 'note-agent', telemetryRunId: params.runId })
  } catch (e) {
    if (chatOptions.signal?.aborted) throw e
    // Verdichten ist eine Hilfe, keine Pflicht: bei Fehler bleibt alles stehen, wie es war.
    return new Map()
  }
  params.recordUsage(result.usage ?? null)
  if (chatOptions.signal?.aborted) throw new Error('Abgebrochen')
  // Gekürzter Prompt oder abgeschnittene Antwort: nichts übernehmen.
  if (result.outputCut === true) return new Map()
  if (looksTruncated({ promptTokens: result.promptTokens, sentChars })) return new Map()
  if (typeof result.promptTokens === 'number' && result.promptTokens > window - MIN_OUTPUT_RESERVE) return new Map()
  return parseCompaction(result.text, items.map(it => it.id))
}

/**
 * Leseergebnisse in `messages` durch eine auftragsbezogene Fassung ersetzen (in place).
 * null = es gab nichts zu verdichten (kein Modellaufruf). `count: 0` = der Aufruf lief, brachte
 * aber nichts Verwertbares — `messages` ist dann unverändert, und der Aufrufer zählt den
 * Fehlversuch, damit er nicht bei jedem Leseaufruf erneut einen Modellaufruf verschenkt.
 */
export async function compactReadResults(params: DigestParams & {
  messages: ChatMessage[]
  includeUnseen?: boolean
}): Promise<CompactionOutcome | null> {
  const { messages, window } = params
  const items = selectCompactable(messages, Math.floor(window * COMPACTION_INPUT_SHARE), params.includeUnseen === true)
  const total = items.reduce((n, it) => n + it.tokens, 0)
  if (items.length === 0 || total < MIN_COMPACTION_TOKENS) return null

  const sections = await digestItems(items, params)
  let count = 0
  let removedTokens = 0
  let addedTokens = 0
  let removedUnseenTokens = 0
  for (const item of items) {
    const summary = sections.get(item.id)
    if (!summary) continue
    const content = compactedContent(item, summary)
    const tokens = estimateTokens(content)
    // Nur ersetzen, wenn es sich lohnt — sonst bleibt das Original.
    if (tokens > item.tokens * 0.6) continue
    messages[item.index] = { ...messages[item.index], content }
    count++
    removedTokens += item.tokens
    if (!item.seen) removedUnseenTokens += item.tokens
    addedTokens += tokens
  }
  return { count, removedTokens, addedTokens, removedUnseenTokens }
}

/** Werkzeuge, deren Quelle sich für einen Folgeauftrag neu lesen lässt (Suchen nicht — die sind flüchtig). */
const REFRESHABLE_TOOLS = new Set(['note_read', 'read_context_file', 'read_attachment'])

export interface RefreshOutcome {
  /** Kurzfassungen, die für den neuen Auftrag erneuert wurden. */
  count: number
  /** Kurzfassungen, die unverändert blieben (Quelle nicht lesbar oder Aufruf ohne Ergebnis). */
  kept: number
  /** Geschätzte Token aller betroffenen Kurzfassungen vorher und nachher. */
  beforeTokens: number
  afterTokens: number
}

/**
 * Folgeauftrag („Antworten und weitermachen“): Die Kurzfassungen im übernommenen Verlauf wurden
 * für den FRÜHEREN Auftrag gemacht. Fragt der Nachtrag nach etwas anderem, schweigen sie dazu —
 * und ein Modell schrieb real „keins“, wo die Kurzfassung nur schwieg (Mess-Harness 12.11.2026,
 * Szenario „nachfrage“; ein Warnhinweis im Text half beim kleinen Modell nicht). Deshalb liest
 * die App die Quellen selbst neu (`reread`) und erstellt die Kurzfassungen für den NEUEN Auftrag,
 * paketweise, damit das Material je Aufruf ins Fenster passt.
 */
export async function refreshCompacted(params: DigestParams & {
  messages: ChatMessage[]
  reread: (toolName: string, args: Record<string, unknown>) => Promise<string | null>
}): Promise<RefreshOutcome> {
  const { messages, window } = params
  const outcome: RefreshOutcome = { count: 0, kept: 0, beforeTokens: 0, afterTokens: 0 }
  const maxTokens = Math.floor(window * COMPACTION_INPUT_SHARE)
  const pending: number[] = []
  messages.forEach((m, i) => { if (m.role === 'tool' && (m.content ?? '').startsWith(COMPACTED_PREFIX)) pending.push(i) })

  let batch: CompactionItem[] = []
  let batchTokens = 0
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return
    const sections = await digestItems(batch, params)
    for (const item of batch) {
      const old = messages[item.index].content ?? ''
      const summary = sections.get(item.id)
      const content = summary ? compactedContent(item, summary) : old
      if (summary) outcome.count++; else outcome.kept++
      outcome.afterTokens += estimateTokens(content)
      messages[item.index] = { ...messages[item.index], content }
    }
    batch = []
    batchTokens = 0
  }

  for (const index of pending) {
    const old = messages[index].content ?? ''
    outcome.beforeTokens += estimateTokens(old)
    const call = findCall(messages, index)
    const raw = call && REFRESHABLE_TOOLS.has(call.name) ? await params.reread(call.name, call.arguments).catch(() => null) : null
    if (!raw) {
      outcome.kept++
      outcome.afterTokens += estimateTokens(old)
      continue
    }
    const tokens = estimateTokens(raw)
    if (batch.length > 0 && batchTokens + tokens > maxTokens) await flush()
    batch.push({ index, id: `K${batch.length + 1}`, label: labelFor(messages, index), content: raw, tokens, seen: true })
    batchTokens += tokens
  }
  await flush()
  return outcome
}
