/**
 * Empfängerlisten aus freiem Text lesen (An/CC/BCC im Schreibfenster).
 *
 * Auslöser (09.11.2026): Eine Liste mit einer Adresse pro Zeile in „An:“ eingefügt
 * ergab EINE Adresse — das einzeilige Eingabefeld wirft die Umbrüche weg, und der
 * alte Parser nahm den ganzen Text als Adresse, sobald irgendwo ein „@“ stand.
 *
 * Regeln:
 * - Trenner sind Zeilenumbruch, Komma, Semikolon — aber nicht innerhalb von
 *   "…" oder <…> (`"Müller, Hans" <h@x.de>` bleibt ein Empfänger). Ein Segment ohne
 *   „@“ direkt vor einem `Name <adresse>` gehört zum Namen (`Müller, Hans <h@x.de>`).
 * - Ein Segment ohne <…> wird zusätzlich an Leerraum (auch Tab) zerlegt; jedes Token
 *   mit „@“ ist ein Kandidat. So gehen leerzeichengetrennte Listen und Tabellenzeilen
 *   „Name<Tab>Adresse“; steht genau eine Adresse am Ende, werden die Wörter davor der Name.
 * - Nichts geht still verloren: was keine gültige Adresse ist, kommt in `rest` und
 *   bleibt im Eingabefeld stehen.
 */

export interface Recipient {
  name: string
  address: string
}

export interface ParsedRecipients {
  recipients: Recipient[]
  /** Nicht erkannte Teile, mit ", " verbunden — bleibt im Eingabefeld. */
  rest: string
  /** Die nicht erkannten Teile einzeln (für den Hinweis). */
  invalid: string[]
}

// Bewusst schlicht: lokal@domain.tld, kein Leerzeichen, genau ein @, TLD ≥ 2 Zeichen.
// Umlaut-Domains (IDN) sind erlaubt. Keine RFC-5322-Vollständigkeit — Ziel ist,
// Klumpen wie „a@x.deb@y.de“ abzuweisen, nicht exotische Adressen.
const ADDRESS_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/u

export function isValidEmailAddress(address: string): boolean {
  if (!ADDRESS_RE.test(address)) return false
  const domain = address.slice(address.indexOf('@') + 1)
  if (domain.startsWith('.') || domain.includes('..')) return false
  const local = address.slice(0, address.indexOf('@'))
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  return true
}

/** Trennt an \n , ; — nicht innerhalb von "…" oder <…>. */
function splitSegments(text: string): string[] {
  const segments: string[] = []
  let current = ''
  let inQuotes = false
  let inAngle = false
  for (const ch of text) {
    if (ch === '"' && !inAngle) inQuotes = !inQuotes
    else if (ch === '<' && !inQuotes) inAngle = true
    else if (ch === '>' && !inQuotes) inAngle = false
    if (!inQuotes && !inAngle && (ch === '\n' || ch === '\r' || ch === ',' || ch === ';')) {
      segments.push(current)
      current = ''
      continue
    }
    current += ch
  }
  segments.push(current)
  return segments.map(s => s.trim()).filter(Boolean)
}

/** Randzeichen aus Kopien (Webseite, Fließtext) und mailto: entfernen. */
function cleanAddress(token: string): string {
  let t = token.trim()
  t = t.replace(/^mailto:/i, '')
  t = t.replace(/^[<("'[]+/, '').replace(/[>)"'\].:!?]+$/, '')
  t = t.replace(/\?.*$/, '') // mailto:a@b.de?subject=…
  return t.trim()
}

function cleanName(name: string): string {
  return name.trim().replace(/^"(.*)"$/s, '$1').replace(/\\"/g, '"').trim()
}

function parseSegment(segment: string): { recipients: Recipient[]; invalid: string[] } {
  // Name <adresse> / "Name" <adresse> / <adresse>
  const angle = segment.match(/^(.*?)<([^<>]*)>\s*$/s)
  if (angle) {
    const address = cleanAddress(angle[2])
    if (isValidEmailAddress(address)) {
      return { recipients: [{ name: cleanName(angle[1]), address }], invalid: [] }
    }
    return { recipients: [], invalid: [segment] }
  }

  const tokens = segment.split(/\s+/).filter(Boolean)
  const withAt = tokens.filter(tok => tok.includes('@'))
  if (withAt.length === 0) return { recipients: [], invalid: [segment] }

  const recipients: Recipient[] = []
  const invalid: string[] = []
  for (const tok of withAt) {
    const address = cleanAddress(tok)
    if (isValidEmailAddress(address)) recipients.push({ name: '', address })
    else invalid.push(tok)
  }
  // Genau eine Adresse plus Wörter davor („Hans Müller hans@x.de“) → Wörter als Name.
  if (recipients.length === 1 && invalid.length === 0 && tokens.length > 1 && tokens[tokens.length - 1].includes('@')) {
    recipients[0].name = cleanName(tokens.slice(0, -1).join(' '))
  }
  return { recipients, invalid }
}

export function parseRecipientList(text: string): ParsedRecipients {
  const recipients: Recipient[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  const segments = splitSegments(text)
  for (let i = 0; i < segments.length; i++) {
    let segment = segments[i]
    // „Müller, Hans <h@x.de>“ ohne Anführungszeichen: das Komma hat den Namen zerteilt.
    const next = segments[i + 1]
    if (!segment.includes('@') && next && /^[^@<]+<[^<>]+@[^<>]+>$/.test(next)) {
      segment = `${segment}, ${next}`
      i++
    }
    const parsed = parseSegment(segment)
    for (const r of parsed.recipients) {
      const key = r.address.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      recipients.push(r)
    }
    invalid.push(...parsed.invalid)
  }
  return { recipients, invalid, rest: invalid.join(', ') }
}

/** Hängt nur Empfänger an, deren Adresse noch nicht in `existing` steht. */
export function mergeRecipients(existing: Recipient[], added: Recipient[]): Recipient[] {
  const seen = new Set(existing.map(r => r.address.toLowerCase()))
  const out = [...existing]
  for (const r of added) {
    const key = r.address.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/** Steht der Text mitten in "…" oder <…>? Dann schließt ein getipptes Komma
 *  keinen Eintrag ab (`"Müller, Hans" <…>`). */
export function hasOpenRecipientGroup(text: string): boolean {
  let inQuotes = false
  let inAngle = false
  for (const ch of text) {
    if (ch === '"' && !inAngle) inQuotes = !inQuotes
    else if (ch === '<' && !inQuotes) inAngle = true
    else if (ch === '>' && !inQuotes) inAngle = false
  }
  return inQuotes || inAngle
}

/** Mehr als ein Eintrag? (Umbruch, Trenner oder mehrere „@“.) Dann nicht als
 *  Suchbegriff für Kontaktvorschläge behandeln, sondern als Liste übernehmen. */
export function looksLikeRecipientList(text: string): boolean {
  if (/[\r\n]/.test(text)) return true
  if ((text.match(/@/g) || []).length > 1) return true
  return /[,;]/.test(text) && text.includes('@') && !hasOpenRecipientGroup(text)
}
