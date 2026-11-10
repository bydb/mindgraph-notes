// Log-Ausgaben mit möglichst wenig Personenbezug.
//
// Fehlertexte von Mailservern und Bibliotheken enthalten oft Adressen
// ("550 user x@y unknown"), Namen, Message-IDs oder Zugangsmarken.
// redactForLog() ersetzt, was sich am Muster erkennen lässt. Das ist ein
// Filter, KEINE Garantie: ein Name ohne Adresse oder ein Stück Mailtext in
// einem Fehler rutscht durch. Deshalb gilt zusätzlich: Betreff, Mailinhalt,
// Notiznamen und Modellantworten gar nicht erst loggen.
//
// mailRef()/folderRef() ersetzen Message-ID bzw. Ordnernamen durch eine kurze
// Kennung. Sie ist eine Diagnosehilfe: stabil (zwei Zeilen zur selben Mail
// lassen sich zuordnen), aber weder eindeutig (32 Bit, Kollisionen kommen vor)
// noch anonym im strengen Sinn.
//
// Pur und ohne Node-Abhängigkeit, damit Main und Renderer denselben Helfer nutzen.

/** Vor dem Filtern gekürzt — die Muster laufen nie über beliebig lange Texte. */
const MAX_INPUT_LENGTH = 4000
const MAX_LOG_LENGTH = 2000

// Zeichen, die eine Adresse begrenzen. Bewusst negativ formuliert, damit
// Umlaute und andere Nicht-ASCII-Zeichen im lokalen Teil und in der Domain
// mit erfasst werden.
const EDGE = `\\s<>()\\[\\]"',;:@`
// Der Lookbehind lässt einen Treffer nur an einer Wortgrenze beginnen. Ohne ihn
// tastet die Maschine in einem langen Wort ohne "@" von jeder Position neu ab.
const ADDRESS_RE = new RegExp(`(?<![^${EDGE}])[^${EDGE}]+(?:@|%40)[^${EDGE}]+`, 'giu')
// Alles in spitzen Klammern mit "@": Adresse ODER Message-ID, nicht unterscheidbar.
const ANGLE_RE = /<[^<>\s@]+@[^<>\s@]+>/g
// Anzeigename direkt vor einer Klammeradresse: in Anführungszeichen oder
// ein bis drei großgeschriebene Wörter. Nimmt in Kauf, dass ein großgeschriebenes
// Wort des Fehlertexts mit verschwindet.
const DISPLAY_NAME_RE = /(?:"[^"\n]{1,80}"|(?:\p{Lu}[\p{L}.'-]{0,40},?\s+){1,3})\s*(?=<[^<>\s@]+@[^<>\s@]+>)/gu

const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/g
const AUTH_SCHEME_RE = /\b(Bearer|Basic)\s+[^\s"',;]+/gi
const SECRET_FIELD_RE = /\b(access_token|refresh_token|id_token|client_secret|client_assertion|token|secret|password|passwort|passwd)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi
// OAuth-Rückgabecode nur als URL-Parameter — ein nacktes "code: 1234" ist
// meist ein Fehlercode und bleibt lesbar.
const URL_CODE_RE = /([?&]code=)[^&\s"']+/gi

function textOf(value: unknown): string {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return String(value)
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Macht einen Fehler oder Text logfähig: Marken, Namen vor Adressen, Adressen und Message-IDs werden ersetzt. */
export function redactForLog(value: unknown): string {
  const raw = textOf(value)
  const cut = raw.length > MAX_INPUT_LENGTH
  const redacted = (cut ? raw.slice(0, MAX_INPUT_LENGTH) : raw)
    .replace(JWT_RE, '<marke>')
    .replace(AUTH_SCHEME_RE, (_m, scheme: string) => `${scheme} <marke>`)
    .replace(SECRET_FIELD_RE, (_m, label: string, sep: string) => `${label}${sep}<marke>`)
    .replace(URL_CODE_RE, (_m, prefix: string) => `${prefix}<marke>`)
    .replace(DISPLAY_NAME_RE, '<name> ')
    .replace(ANGLE_RE, '<kennung>')
    .replace(ADDRESS_RE, '<adresse>')
  return cut || redacted.length > MAX_LOG_LENGTH ? `${redacted.slice(0, MAX_LOG_LENGTH)}… (gekürzt)` : redacted
}

/**
 * Nur der erste Satz eines Fehlertexts, bereinigt. Für Meldungen, die für die
 * Oberfläche gebaut sind und hinter dem ersten Satz fremden Text tragen können
 * (z.B. den Anfang einer Modellantwort).
 */
export function firstSentenceForLog(value: unknown, maxLength = 160): string {
  const redacted = redactForLog(value)
  const end = redacted.search(/[.!?](\s|$)/)
  const sentence = end >= 0 ? redacted.slice(0, end + 1) : redacted
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength)}…` : sentence
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Kurze Kennung einer Mail fürs Log. Diagnosehilfe, nicht eindeutig (siehe Dateikopf). */
export function mailRef(id: string | null | undefined): string {
  return id ? `mail#${fnv1a(id)}` : 'mail#unbekannt'
}

// Standardordner sagen nichts über Personen und bleiben lesbar; alles andere
// (oft nach Personen, Fällen, Projekten benannt) wird zur Kennung.
const STANDARD_FOLDERS = new Set([
  'inbox', 'posteingang',
  'sent', 'sent items', 'sent messages', 'gesendet', 'gesendete elemente', 'gesendete objekte',
  'drafts', 'entwürfe', 'entwuerfe',
  'trash', 'papierkorb', 'deleted items', 'gelöschte elemente', 'geloeschte elemente',
  'junk', 'junk-e-mail', 'spam',
  'archive', 'archiv', 'outbox', 'postausgang'
])

/** Ordnername fürs Log: Standardordner im Klartext, eigene Ordner als Kennung. */
export function folderRef(folder: string | null | undefined): string {
  if (!folder) return 'ordner#unbekannt'
  const leaf = folder.replace(/^inbox[./]/i, '').trim().toLowerCase()
  return STANDARD_FOLDERS.has(leaf) || folder.trim().toLowerCase() === 'inbox' ? folder : `ordner#${fnv1a(folder)}`
}
