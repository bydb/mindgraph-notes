// Lokale Suche über Absender, Empfänger (An/CC), Betreff und Text.
// Das sichtbare Suchfeld durchsuchte vorher nur Absender und Betreff — und nur
// die bereits gefilterten Mails. Eine gesendete Mail („meine Mail an Frau X
// von gestern") war damit nicht zu finden und galt schnell als nie gesendet.
//
// Schreibweisen werden gefaltet: Wer „Grüssner" sucht, meint auch „Grüßner" und
// die Adresse „gruessner@…" (real, 02.10.2026 — eine Kollegin mit „ß" im Namen
// war mit „ss" nicht zu finden). Gesucht wird in ZWEI Faltungen, ein Treffer in
// einer reicht:
//   Umschrift: ü→ue, ö→oe, ä→ae, ß→ss  („Grüssner" = „Grüßner" = „gruessner")
//   Grundform: Akzente weg, ß→ss       („Grussner" = „Grüßner", „Jose" = „José")
// Beide werden auch auf Unicode-Normalform NFC gebracht — macOS liefert Umlaute
// aus Dateinamen und manchen Eingaben zerlegt (u + Trema), sonst trifft
// „ü" kein „ü".

interface Addr { name?: string; address?: string }

export interface SearchableEmail {
  from: Addr
  to?: Addr[]
  cc?: Addr[]
  subject?: string
  bodyText?: string
  snippet?: string
}

const TRANSLIT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', ẞ: 'ss' }

/** Umschrift: Umlaute als ae/oe/ue, ß als ss, übrige Akzente weg. */
export function foldTranslit(s: string): string {
  return stripMarks(s.normalize('NFC').toLowerCase().replace(/[äöüßẞ]/g, c => TRANSLIT[c]))
}

/** Grundform: alle Akzente weg (ü→u), ß als ss. */
export function foldBase(s: string): string {
  return stripMarks(s.normalize('NFC').toLowerCase().replace(/[ßẞ]/g, 'ss'))
}

function stripMarks(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

interface Folded { translit: string; base: string }

// Gefalteter Suchtext je Mail-Objekt — die Suche läuft bei jedem Tastendruck
// über alle Mails samt Text, das Falten soll nicht jedes Mal neu passieren.
// Mails im Store sind unveränderlich (Änderungen ersetzen das Objekt).
const foldedCache = new WeakMap<object, Folded>()

function foldedHaystack(email: SearchableEmail): Folded {
  const hit = foldedCache.get(email)
  if (hit) return hit
  const addrs = [email.from, ...(email.to || []), ...(email.cc || [])]
    .map(a => `${a?.name || ''} ${a?.address || ''}`)
    .join(' ')
  const raw = `${addrs}\n${email.subject || ''}\n${email.bodyText || email.snippet || ''}`
  const folded = { translit: foldTranslit(raw), base: foldBase(raw) }
  foldedCache.set(email, folded)
  return folded
}

/** Mehrere Wörter = alle müssen vorkommen (in beliebigen Feldern). */
export function emailMatchesQuery(email: SearchableEmail, query: string): boolean {
  const terms = query.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const hay = foldedHaystack(email)
  return terms.every(term =>
    hay.translit.includes(foldTranslit(term)) || hay.base.includes(foldBase(term))
  )
}
