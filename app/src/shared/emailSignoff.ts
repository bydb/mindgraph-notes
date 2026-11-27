/**
 * Wer unterschreibt die Mail?
 *
 * Anlass (27.11.2026): Der E-Mail-Assistent schrieb „fertige“ Antworten, ohne zu wissen,
 * wer der Absender ist, und setzte einen Namen aus dem Kontext unter den Text. Zwei Mails
 * gingen mit fremdem Namen hinaus. Der Prompt nennt den Namen seitdem — aber ein Prompt
 * ist keine Garantie. Diese Prüfung ist die feste Grenze dahinter: Steht unter der
 * Grußformel ein Name, der nicht zum Absenderkonto gehört, wird der KI-Entwurf korrigiert
 * und der Versand gesperrt (Schreibfenster UND Main).
 *
 * Erkannt wird nur, was sich sicher erkennen lässt: die LETZTE Grußformel im eigenen Text
 * (vor Signatur und Zitat) und die Zeile danach. Eine Mail ohne Grußformel bleibt unberührt.
 */

export type SignoffStatus =
  /** Keine Grußformel am Ende gefunden — nichts zu prüfen. */
  | 'none'
  /** Grußformel ohne Namenszeile darunter. */
  | 'missing-name'
  /** Der Name unter der Grußformel gehört zum Absender. */
  | 'ok'
  /** Unter der Grußformel steht ein anderer Name. */
  | 'foreign'

export interface SignoffCheck {
  status: SignoffStatus
  /** Die gefundene Namenszeile (bei 'ok' und 'foreign'). */
  found?: string
}

const GREETING = new RegExp(
  '^(?:' +
    '(?:mit\\s+)?(?:(?:viele[nmr]?|liebe[nmr]?|beste[nmr]?|herzliche[nmr]?|herzlichste[nmr]?|freundliche[nmr]?|sch[oö]ne[nmr]?|sonnige[nmr]?|kollegiale[nmr]?|nette[nmr]?|vielen|lieben)\\s+)*' +
    '(?:gr[uü](?:ß|ss)(?:e|en)?|gruess(?:e|en)?)\\b.*' +
    '|mfg|lg|vg|bg' +
    '|(?:best|kind|warm)\\s+regards|regards|best\\s+wishes|best|cheers|sincerely|yours\\s+sincerely|yours\\s+faithfully|hochachtungsvoll' +
  ')[\\s,.!]*$',
  'i'
)

/** Wörter, die neben dem Namen stehen dürfen, ohne selbst Name zu sein. */
const FILLERS = new Set(['dein', 'deine', 'ihr', 'ihre', 'euer', 'eure', 'your', 'yours'])

/** Höchstens so viele Textzeilen dürfen der Grußformel folgen, sonst steht sie mitten im Text. */
const MAX_LINES_AFTER_GREETING = 4

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(tok => tok.length >= 2)
}

/** Zeilen des eigenen Textes: alles vor Signatur-Trenner, Zitat oder Weiterleitungskopf. */
function ownLines(body: string): string[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const end = lines.findIndex(line => {
    const trimmed = line.trim()
    return trimmed === '--'
      || trimmed.startsWith('>')
      || /^-{5,}\s*Weitergeleitete Nachricht/i.test(trimmed)
      || /^-{5,}\s*Forwarded message/i.test(trimmed)
      || /^Am .+ schrieb .+:$/.test(trimmed)
      || /^On .+ wrote:$/.test(trimmed)
  })
  return end === -1 ? lines : lines.slice(0, end)
}

/** Sieht die Zeile wie ein Name aus (und nicht wie ein Satz, ein PS oder eine Telefonnummer)? */
function looksLikeName(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 60) return false
  if (/[\d:?!@/]/.test(trimmed)) return false
  if (/\.\s*$/.test(trimmed) && !/\b\p{L}\.\s*$/u.test(trimmed)) return false
  const words = trimmed.split(/\s+/)
  return words.length <= 5
}

interface Located {
  lines: string[]
  /** Index der Grußzeile in `lines`. */
  greeting: number
  /** Index der Namenszeile, -1 wenn keine. */
  name: number
}

function locate(body: string): Located | null {
  const lines = ownLines(body)
  let greeting = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (trimmed.length <= 60 && GREETING.test(trimmed)) { greeting = i; break }
  }
  if (greeting === -1) return null
  const following = lines.slice(greeting + 1).map((line, offset) => ({ line, index: greeting + 1 + offset })).filter(e => e.line.trim())
  if (following.length > MAX_LINES_AFTER_GREETING) return null
  const first = following[0]
  const name = first && looksLikeName(first.line) ? first.index : -1
  return { lines, greeting, name }
}

/** Gehört die Namenszeile zum Absender? Nachname genügt; sonst müssen alle Wörter vom Absender stammen. */
function belongsToSender(nameLine: string, senderName: string): boolean {
  const own = tokens(senderName)
  if (own.length === 0) return true
  const found = tokens(nameLine).filter(tok => !FILLERS.has(tok))
  if (found.length === 0) return true
  const lastName = own[own.length - 1]
  if (own.length > 1 && found.includes(lastName)) return true
  return found.every(tok => own.includes(tok))
}

/** Prüft die Unterschrift im eigenen Text gegen den Namen des Absenderkontos. */
export function checkSignoff(body: string, senderName: string | undefined | null): SignoffCheck {
  const sender = (senderName ?? '').trim()
  const located = locate(body ?? '')
  if (!located) return { status: 'none' }
  if (located.name === -1) return { status: 'missing-name' }
  const found = located.lines[located.name].trim()
  if (!sender) return { status: 'ok', found }
  return { status: belongsToSender(found, sender) ? 'ok' : 'foreign', found }
}

/**
 * Setzt den Namen des Absenders unter die Grußformel: ersetzt einen fremden Namen,
 * ergänzt einen fehlenden. Ohne Grußformel oder ohne Absendernamen bleibt der Text, wie er ist.
 */
export function enforceSignoff(body: string, senderName: string | undefined | null): string {
  const sender = (senderName ?? '').trim()
  if (!sender) return body
  const check = checkSignoff(body, sender)
  if (check.status === 'ok' || check.status === 'none') return body
  const normalized = body.replace(/\r\n?/g, '\n')
  const located = locate(normalized)
  if (!located) return body
  const all = normalized.split('\n')
  if (check.status === 'foreign') {
    all[located.name] = sender
  } else {
    all.splice(located.greeting + 1, 0, sender)
  }
  return all.join('\n')
}
