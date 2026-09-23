// E-Mail-Decision-Pilot — deterministische Signale einer Mail.
//
// Alles hier ist Code, kein Modell: harte Signale (wiederverwendet aus
// shared/emailRelevance.ts), Handlungs-/Terminmarker, Newsletter-Merkmal, Sprache.
// Diese Werte sind inhaltsfrei genug für einen Messdatensatz und gehen so in die
// Policy — der Mailtext selbst bleibt beim Labeln lokal.
//
// Zwei bewusste Entscheidungen:
//
//   * Die Markerlisten sind breit. Jeder Treffer schickt die Mail zur Vollanalyse, kostet
//     also Einsparung und keine Sicherheit. Die verlorene Einsparung steht im Bericht;
//     ein übersehener Termin stünde nirgends.
//   * Die Spracherkennung ist eine Stoppwort-Abzählung und sagt bei Gleichstand
//     `null` = unbekannt. Unbekannt heißt in der Policy `review`, nicht „Deutsch".
//
// Keine Regex darf über Zeilengrenzen laufen (siehe die Sprachausgabe-Lehre in CLAUDE.md):
// gesucht wird mit `includes` auf einer kleingeschriebenen Zeichenkette, Datumsmuster
// laufen zeilenweise.

import {
  computeHardSignals,
  type RelevanceConfig,
  type SenderReplyInfo,
} from '../emailRelevance'
import type { PolicySignals } from './emailPolicy'

export interface DecisionSignalSource {
  subject?: string
  bodyText?: string
  from: { name?: string; address?: string }
  hasAttachments?: boolean
  attachmentNames?: string[]
  inReplyTo?: string
  references?: string[]
}

// ── Handlungs- und Terminmarker ──────────────────────────────────────────────

/** Deutsche und englische Marker. Version gehört zur Auswertung (siehe SIGNALS_VERSION). */
export const ACTION_MARKERS: readonly string[] = [
  // Frist / Fälligkeit
  'frist', 'bis zum', 'bis spätestens', 'spätestens', 'fällig', 'zahlbar bis', 'mahnung',
  'deadline', 'due date', 'due by', 'payable by', 'overdue',
  // Rückmeldung / Handlung
  'rückmeldung', 'rueckmeldung', 'bitte um', 'bitte bestätigen', 'bitte bestaetigen',
  'bitte antworten', 'ihre antwort', 'unterschrift', 'unterschreiben', 'freigabe',
  'please confirm', 'please reply', 'please respond', 'your response', 'signature required',
  'approval needed', 'action required', 'rsvp',
  // Termin
  'termin', 'einladung', 'besprechung', 'sitzung', 'verschoben', 'abgesagt', 'absage',
  'zusage', 'anmeldung bis', 'kalendereintrag',
  'invitation', 'meeting', 'appointment', 'rescheduled', 'cancelled', 'canceled',
  'calendar invite',
  // Erinnerung
  'erinnerung', 'reminder',
]

/** Newsletter-/Automatikmerkmale. NUR für die experimentelle Negativregel. */
export const NEWSLETTER_SENDER_MARKERS: readonly string[] = [
  'no-reply', 'noreply', 'no_reply', 'donotreply', 'do-not-reply',
  'newsletter', 'mailer', 'mailing', 'bounce', 'notifications', 'notification',
]
export const NEWSLETTER_BODY_MARKERS: readonly string[] = [
  'abbestellen', 'newsletter abmelden', 'vom newsletter', 'list-unsubscribe',
  'unsubscribe', 'manage your preferences', 'diese e-mail wurde automatisch',
  'diese nachricht wurde automatisch', 'automatically generated', 'do not reply to this',
]

/** Version der hier festgelegten Listen/Heuristiken — Teil der Messidentität. */
export const SIGNALS_VERSION = 'email-decision-signals@1'

const MONTHS_DE = ['januar', 'februar', 'märz', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

// Zeilenweise geprüft: 12.03., 12.3.2026, 2026-03-12, 12. März
const DATE_NUMERIC = /\b\d{1,2}\.\s?\d{1,2}\.(\s?\d{2,4})?\b/
const DATE_ISO = /\b\d{4}-\d{2}-\d{2}\b/
const DATE_SLASH = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/
const DAY_MONTH = new RegExp('\\b\\d{1,2}\\.?\\s+(' + [...MONTHS_DE, ...MONTHS_EN].join('|') + ')\\b')
const CLOCK = /\b\d{1,2}[:.]\d{2}\s?(uhr|am|pm)\b/

export function hasDateMention(text: string): boolean {
  for (const line of text.split('\n')) {
    const l = line.toLowerCase()
    if (DATE_NUMERIC.test(l) || DATE_ISO.test(l) || DATE_SLASH.test(l) || DAY_MONTH.test(l) || CLOCK.test(l)) {
      return true
    }
  }
  return false
}

export function matchedActionMarkers(subject: string, bodyText: string): string[] {
  const haystack = (subject + '\n' + bodyText).toLowerCase()
  return ACTION_MARKERS.filter((m) => haystack.includes(m))
}

export function hasIcsAttachment(names: readonly string[] | undefined): boolean {
  return (names || []).some((n) => typeof n === 'string' && n.toLowerCase().trim().endsWith('.ics'))
}

export function hasNewsletterMarker(email: DecisionSignalSource): boolean {
  const addr = (email.from?.address || '').toLowerCase()
  const local = addr.split('@')[0] || ''
  if (NEWSLETTER_SENDER_MARKERS.some((m) => local.includes(m))) return true
  const haystack = ((email.subject || '') + '\n' + (email.bodyText || '')).toLowerCase()
  return NEWSLETTER_BODY_MARKERS.some((m) => haystack.includes(m))
}

// ── Sprache ──────────────────────────────────────────────────────────────────

const STOPWORDS_DE = ['der', 'die', 'das', 'und', 'nicht', 'ich', 'sie', 'wir', 'ist', 'sind', 'für', 'mit', 'ein', 'eine', 'auf', 'wird', 'werden', 'haben', 'bitte', 'sehr', 'geehrte', 'freundlichen', 'grüßen']
const STOPWORDS_EN = ['the', 'and', 'you', 'your', 'for', 'with', 'this', 'that', 'are', 'not', 'please', 'dear', 'regards', 'from', 'have', 'will', 'we', 'our']

/**
 * Grobe Sprachbestimmung über Stoppwörter. Absichtlich streng: ohne deutlichen
 * Vorsprung und ohne Mindestzahl an Treffern gibt es `null`. Eine falsch behauptete
 * Sprache würde eine Kalibrierung auf einen Text anwenden, für den sie nie gemessen wurde.
 */
export function detectLanguage(text: string): 'de' | 'en' | null {
  const tokens = text.toLowerCase().split(/[^a-zäöüß]+/).filter(Boolean)
  if (tokens.length < 12) return null
  let de = 0
  let en = 0
  for (const t of tokens) {
    if (STOPWORDS_DE.includes(t)) de++
    if (STOPWORDS_EN.includes(t)) en++
  }
  if (de + en < 3) return null
  if (de >= en * 2 && de >= 3) return 'de'
  if (en >= de * 2 && en >= 3) return 'en'
  return null
}

// ── Zusammenbau ──────────────────────────────────────────────────────────────

export interface DeriveSignalOptions {
  /** Antwort-Häufigkeit dieses Absenders (shared/emailRelevance.ts). */
  reply?: SenderReplyInfo
  /** Enthält die Instruktions-Notiz weiche Freitextkriterien? */
  softCriteriaPresent: boolean
  /** Sprache überschreiben (z.B. aus einem Labeldatensatz). */
  language?: string | null
}

export function deriveDecisionSignals(
  email: DecisionSignalSource,
  cfg: RelevanceConfig,
  options: DeriveSignalOptions,
): PolicySignals {
  const subject = email.subject || ''
  const bodyText = email.bodyText || ''
  const hard = computeHardSignals({ from: email.from || {}, subject, bodyText }, cfg, options.reply)
  const attachmentNames = email.attachmentNames || []
  const hasAttachments = email.hasAttachments === true || attachmentNames.length > 0
  const actionMarkers = matchedActionMarkers(subject, bodyText)
  const body = bodyText.trim()

  return {
    hardFloor: hard.floor,
    hardBoost: hard.boost,
    hardSignalKinds: hard.signals.map((s) => s.kind),
    hasAttachments,
    hasThreadContext: !!(email.inReplyTo && email.inReplyTo.trim()) || (email.references || []).length > 0,
    hasActionMarker:
      actionMarkers.length > 0 || hasDateMention(subject + '\n' + bodyText) || hasIcsAttachment(attachmentNames),
    newsletterMarker: hasNewsletterMarker(email),
    bodyPresent: body.length > 0,
    bodyChars: body.length,
    softCriteriaPresent: options.softCriteriaPresent === true,
    language:
      options.language !== undefined
        ? options.language
        : detectLanguage(subject + '\n' + bodyText),
  }
}

// ── Stabile, inhaltsfreie Kurz-Hashes ────────────────────────────────────────

function fnv1a(text: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * 16 Hex-Zeichen aus zwei FNV-1a-Durchläufen. Kein Geheimnisschutz — ein Hash über einen
 * kurzen bekannten Text ist rückrechenbar. Zweck ist Wiedererkennung: „ist das noch
 * dieselbe Instruktionsnotiz?", nicht Verbergen.
 */
export function shortHash(text: string): string {
  return fnv1a(text, 2166136261).toString(16).padStart(8, '0') + fnv1a(text, 0x9e3779b9).toString(16).padStart(8, '0')
}

/**
 * Kennung der Instruktions-Notiz. Zeilenenden und Rand werden vereinheitlicht, damit ein
 * geänderter Zeilenumbruch nicht als geänderte Regel gilt — jede inhaltliche Änderung
 * dagegen schon.
 */
export function hashInstruction(instruction: string): string {
  return shortHash((instruction || '').replace(/\r\n/g, '\n').trim())
}
