// Hybrid E-Mail-Relevanz-Scoring (Prototyp).
//
// Designprinzip: FAKTEN gehören in den Code, SEMANTIK ins Modell.
// Die "harten" Signale (VIP-Absender, Domain, Schlüsselwort, Antwort-Häufigkeit) sind
// deterministisch — sie werden hier gerechnet, nicht vom LLM geraten. Das LLM liefert
// nur noch die semantische Beurteilung (relevanceScore + matchedCriteria-Checkliste).
// combineRelevance() führt beides zusammen:
//   finalScore = max(llmScore, hardFloor)   — außer Injection-Veto (llmScore===0 gewinnt).
//
// Das löst die drei Kernprobleme des reinen LLM-Scorings:
//   1) Nicht-Determinismus harter Regeln (Namen/Domain raten) → jetzt exakter Code.
//   2) Widerspruch "Zähl-Bänder vs. 90%-Override" → Override ist ein Code-Floor, kein Prompt-Rätsel.
//   3) Keine Erklärbarkeit → reasons[] sagt, WARUM eine Mail so bewertet wurde.
//
// Single-Source, prozessübergreifend (Main-Runner + ggf. Renderer-Vorschau), rein & testbar.
// Bewusst ohne fs/Netzwerk/Imports — nur Daten rein, Ergebnis raus.

export interface VipSender { name?: string; email?: string; weight: number }
export interface DomainRule { domain: string; weight: number }
export interface KeywordRule { term: string; weight: number }
export interface ReplyHistoryConfig {
  highCount: number
  highWeight: number
  mediumCount: number
  mediumWeight: number
  windowDays: number
}
export interface RelevanceConfig {
  vipSenders: VipSender[]
  domains: DomainRule[]
  keywords: KeywordRule[]
  replyHistory: ReplyHistoryConfig
}

export const DEFAULT_REPLY_HISTORY: ReplyHistoryConfig = {
  highCount: 3,
  highWeight: 75,
  mediumCount: 1,
  mediumWeight: 60,
  windowDays: 90,
}
export const DEFAULT_VIP_WEIGHT = 90
export const DEFAULT_DOMAIN_WEIGHT = 80
// Keyword ist ein BOOST (additiv auf den LLM-Score), KEIN Floor — sonst hebt eine
// Erwähnung in Signatur/Adresse (z.B. "Medienzentrum" in einer UPS-Lieferadresse)
// irrelevante Mails über die Schwelle. Ein korrektes niedriges LLM-Urteil bleibt niedrig.
export const DEFAULT_KEYWORD_BOOST = 20
export const MAX_KEYWORD_BOOST = 30
export const DEFAULT_RELEVANCE_THRESHOLD = 30

/** Fence-Tag des optionalen Konfig-Blocks in der Instruktions-Notiz. */
export const RELEVANCE_CONFIG_FENCE = 'email-relevance-config'

export function emptyRelevanceConfig(): RelevanceConfig {
  return { vipSenders: [], domains: [], keywords: [], replyHistory: { ...DEFAULT_REPLY_HISTORY } }
}

// ─── Konfig aus der Instruktions-Notiz lesen ─────────────────────────────────
// Der User behält EINE Klartext-Notiz. Der Block ```email-relevance-config``` trägt die
// deterministischen Regeln, der Rest der Notiz bleibt weiche Kriterien fürs LLM.

/** Zieht den Inhalt des ```email-relevance-config```-Blocks (ohne Fences). null wenn keiner da. */
export function extractConfigBlock(instruction: string): string | null {
  if (!instruction) return null
  const re = new RegExp('```\\s*' + RELEVANCE_CONFIG_FENCE + '\\s*\\n([\\s\\S]*?)```', 'i')
  const m = instruction.match(re)
  return m ? m[1] : null
}

/** Entfernt den Konfig-Block, damit das LLM nur die weichen Kriterien sieht. */
export function stripConfigBlock(instruction: string): string {
  if (!instruction) return instruction
  const re = new RegExp('```\\s*' + RELEVANCE_CONFIG_FENCE + '\\s*\\n[\\s\\S]*?```', 'gi')
  return instruction.replace(re, '').trim()
}

const EMAIL_RE = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i

function parseWeight(line: string, fallback: number): { text: string; weight: number } {
  const m = line.match(/=\s*(\d{1,3})\s*$/)
  if (m && m.index !== undefined) {
    const w = Math.max(0, Math.min(100, parseInt(m[1], 10)))
    return { text: line.slice(0, m.index).trim(), weight: w }
  }
  return { text: line.trim(), weight: fallback }
}

type Section = 'vip' | 'domain' | 'keyword' | null
function sectionOf(line: string): Section {
  const l = line.toLowerCase()
  if (/vip|absender|sender|steuerungs/.test(l)) return 'vip'
  if (/domain|server/.test(l)) return 'domain'
  if (/keyword|schlüsselw|schluesselw|stichwort|begriff/.test(l)) return 'keyword'
  return null
}

// Tolerantes Listen-Format (liest sich wie die bestehende Notiz):
//   VIP-Absender:
//   - Santina Peotsch <s.peotsch@bildung.hessen.de>
//   - jens.schuhmacher@bildung.hessen.de = 95
//   Domains:
//   - bildung.hessen.de
//   Schlüsselwörter:
//   - Medienzentrum
export function parseRelevanceConfig(instruction: string): RelevanceConfig {
  const cfg = emptyRelevanceConfig()
  const block = extractConfigBlock(instruction)
  if (!block) return cfg
  let section: Section = null
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const listMatch = line.match(/^[-*]\s+(.*)$/)
    if (!listMatch) {
      const s = sectionOf(line)
      if (s) section = s
      continue
    }
    const entry = listMatch[1].trim()
    if (!entry || !section) continue
    if (section === 'vip') {
      const { text, weight } = parseWeight(entry, DEFAULT_VIP_WEIGHT)
      const em = text.match(EMAIL_RE)
      const email = em ? em[1].toLowerCase() : undefined
      const name = text.replace(/<[^>]*>/g, '').replace(EMAIL_RE, '').replace(/[<>]/g, '').trim() || undefined
      if (email || name) cfg.vipSenders.push({ name, email, weight })
    } else if (section === 'domain') {
      const { text, weight } = parseWeight(entry, DEFAULT_DOMAIN_WEIGHT)
      const domain = text.replace(/^@/, '').toLowerCase().trim()
      if (domain) cfg.domains.push({ domain, weight })
    } else if (section === 'keyword') {
      const { text, weight } = parseWeight(entry, DEFAULT_KEYWORD_BOOST)
      if (text) cfg.keywords.push({ term: text, weight })
    }
  }
  return cfg
}

// ─── Antwort-Häufigkeit: das stärkste, im Code verfügbare Relevanzsignal ─────
// "Menschen, denen ich tatsächlich antworte" — aus dem Mailbestand (emails.json) gerechnet.

export interface SenderReplyInfo { sentTo: number; received: number; frequency: 'high' | 'medium' | 'none' }

interface MailLike {
  from?: { address?: string }
  to?: { address?: string }[]
  date?: string
  sent?: boolean
}

/** address(lowercased) → Statistik, gerechnet über den gesamten Bestand im Zeitfenster. */
export function buildReplyStats(emails: MailLike[], cfg: ReplyHistoryConfig, nowMs: number): Map<string, SenderReplyInfo> {
  const windowMs = cfg.windowDays * 86400000
  const sentTo = new Map<string, number>()
  const received = new Map<string, number>()
  for (const m of emails) {
    const t = m.date ? Date.parse(m.date) : NaN
    // Unparsebares/fehlendes Datum NICHT mitzählen (sonst würde es das Fenster umgehen).
    if (Number.isNaN(t) || nowMs - t > windowMs) continue
    if (m.sent) {
      for (const r of m.to || []) {
        const a = r.address?.toLowerCase().trim()
        if (a) sentTo.set(a, (sentTo.get(a) || 0) + 1)
      }
    } else {
      const a = m.from?.address?.toLowerCase().trim()
      if (a) received.set(a, (received.get(a) || 0) + 1)
    }
  }
  const out = new Map<string, SenderReplyInfo>()
  for (const a of new Set<string>([...sentTo.keys(), ...received.keys()])) {
    const s = sentTo.get(a) || 0
    const r = received.get(a) || 0
    const frequency: SenderReplyInfo['frequency'] =
      s >= cfg.highCount ? 'high' : s >= cfg.mediumCount ? 'medium' : 'none'
    out.set(a, { sentTo: s, received: r, frequency })
  }
  return out
}

// ─── Harte Signale berechnen ─────────────────────────────────────────────────

export type HardSignalKind = 'vip' | 'domain' | 'keyword' | 'reply'
export type HardSignalMode = 'floor' | 'boost'
export interface HardSignal { kind: HardSignalKind; label: string; weight: number; mode: HardSignalMode }
// floor = Identitäts-/Verhaltens-Signale (VIP/Domain/Kontakt) → setzen Mindest-Score.
// boost = Keyword → additiver Zuschlag (gedeckelt), kein Mindest-Score.
export interface HardSignalResult { floor: number; boost: number; signals: HardSignal[] }

const lc = (s: string | undefined): string => (s || '').toLowerCase()

export function computeHardSignals(
  email: { from: { name?: string; address?: string }; subject?: string; bodyText?: string },
  cfg: RelevanceConfig,
  reply?: SenderReplyInfo,
): HardSignalResult {
  const signals: HardSignal[] = []
  const fromAddr = lc(email.from.address)
  const fromName = lc(email.from.name)

  // VIP-Absender (exakter Address-Match ODER Name-Enthält-Match) → Floor
  for (const v of cfg.vipSenders) {
    const emailHit = !!v.email && fromAddr === v.email.toLowerCase()
    const nameHit = !!v.name && fromName.length > 0 && fromName.includes(v.name.toLowerCase())
    if (emailHit || nameHit) {
      signals.push({ kind: 'vip', label: `VIP-Absender: ${v.name || v.email}`, weight: v.weight, mode: 'floor' })
      break // ein VIP-Treffer reicht
    }
  }
  // Domain (exakte Domain oder Subdomain) → Floor
  for (const d of cfg.domains) {
    const dom = d.domain.toLowerCase()
    if (fromAddr.endsWith('@' + dom) || fromAddr.endsWith('.' + dom)) {
      signals.push({ kind: 'domain', label: `Domain: ${d.domain}`, weight: d.weight, mode: 'floor' })
      break
    }
  }
  // Schlüsselwörter (Betreff + Body, case-insensitiv) → Boost, kein Floor
  const haystack = lc((email.subject || '') + '\n' + (email.bodyText || ''))
  for (const k of cfg.keywords) {
    const term = k.term.toLowerCase().trim()
    if (term && haystack.includes(term)) {
      signals.push({ kind: 'keyword', label: `Schlüsselwort: ${k.term}`, weight: k.weight, mode: 'boost' })
    }
  }
  // Antwort-Häufigkeit → Floor (bekannter Kontakt)
  if (reply && reply.frequency !== 'none') {
    const weight = reply.frequency === 'high' ? cfg.replyHistory.highWeight : cfg.replyHistory.mediumWeight
    signals.push({ kind: 'reply', label: `Häufiger Kontakt (${reply.sentTo}× geantwortet)`, weight, mode: 'floor' })
  }

  const floor = signals.filter((s) => s.mode === 'floor').reduce((mx, s) => Math.max(mx, s.weight), 0)
  const boost = Math.min(MAX_KEYWORD_BOOST, signals.filter((s) => s.mode === 'boost').reduce((sum, s) => sum + s.weight, 0))
  return { floor, boost, signals }
}

// ─── Zusammenführung ─────────────────────────────────────────────────────────

export interface CombinedRelevance {
  relevanceScore: number
  relevant: boolean
  reasons: string[]
  hardFloor: number
}

export function combineRelevance(
  llmScore: number | null,
  hard: HardSignalResult,
  matchedCriteria: string[],
  threshold: number = DEFAULT_RELEVANCE_THRESHOLD,
): CombinedRelevance {
  // null/kaputt (z.B. gemma liefert {}) → wie 0 behandeln, aber Floor greift trotzdem.
  const hasLlmScore = typeof llmScore === 'number' && Number.isFinite(llmScore)
  const safeLlm = hasLlmScore ? Math.max(0, Math.min(100, Math.round(llmScore as number))) : 0
  // „Bekannte Identität gewinnt": Floor-Signale (VIP/Domain/Kontakt) gelten IMMER — auch wenn
  // das LLM 0 (Injection-Verdacht) meldet. Schwache lokale Modelle flaggen echte Kollegen-Mails
  // fälschlich als Injection; ein bekannter Absender soll dann nicht verschwinden. Der
  // Injection-Hinweis bleibt in der summary sichtbar — der User beurteilt die Mail selbst.
  // Keyword ist nur ein additiver Boost (gedeckelt), kein Floor → hebt irrelevante Mails
  // (z.B. "Medienzentrum" in einer Lieferadresse) nicht über die Schwelle.
  const base = Math.max(safeLlm, hard.floor)
  const relevanceScore = Math.min(100, base + hard.boost)
  const reasons = [...hard.signals.map((s) => s.label), ...matchedCriteria.filter(Boolean)]
  return { relevanceScore, relevant: relevanceScore >= threshold, reasons, hardFloor: hard.floor }
}
