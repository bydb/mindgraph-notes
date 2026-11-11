// Bilder im Mailtext: Platzhalter im Schreibfeld ↔ eingebettetes Bild beim Versand.
//
// Das Schreibfeld ist ein reines Textfeld. Ein abgelegter oder eingefügter
// Screenshot steht dort deshalb als Platzhalter im Markdown-Bildstil:
//
//   ![Bildschirmfoto 2026-11-11 14.03.22.png](bild:3f9a1c0b7d2e)
//
// Die Kennung hinter `bild:` verweist auf einen Anhang mit derselben `inlineId`.
// Der Name davor ist nur Beschriftung — er darf sich ändern (Rechtschreibprüfung),
// zugeordnet wird allein über die Kennung.
//
// Regel für alles, was sendet oder anzeigt: Ein Bild-Anhang, dessen Platzhalter
// nicht (mehr) im Text steht, geht NICHT mit. Wer den Platzhalter löscht, hat
// das Bild aus der Mail genommen.

export interface InlineCapableAttachment {
  path: string
  filename: string
  inlineId?: string
}

const TOKEN_SOURCE = '!\\[([^\\]\\n]*)\\]\\(bild:([a-f0-9]{8,32})\\)'
const tokenRegex = (): RegExp => new RegExp(TOKEN_SOURCE, 'g')

export function isInlineImageId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8,32}$/.test(value)
}

/** Grenzen einer Ablage — im Schreibfenster (vor dem Lesen) und im Main (vor dem Schreiben) dieselben. */
export const COMPOSE_STAGE_MAX_FILES = 20
export const COMPOSE_STAGE_MAX_BYTES = 30 * 1024 * 1024
export const COMPOSE_STAGE_MAX_TOTAL_BYTES = 100 * 1024 * 1024

/** Stellen aller gültigen Platzhalter im Text (für die Rechtschreibprüfung: dort nichts ändern). */
export function inlineTokenRanges(body: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  for (const m of (body || '').matchAll(tokenRegex())) {
    ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length })
  }
  return ranges
}

/**
 * Platzhalter, hinter denen kein Bild (mehr) steht: gültige mit unbekannter
 * Kennung (Beschriftung wird genannt) und beschädigte Reste (`](bild:` ohne
 * gültige Form). Leer = der Text ist in Ordnung. Mit so einem Text darf nichts
 * verschickt werden — das Bild fiele still weg oder der rohe Platzhalter
 * stünde in der Mail.
 */
export function findBrokenInlineTokens(body: string, attachments: InlineCapableAttachment[] | undefined): string[] {
  const known = new Set((attachments || []).map(a => a.inlineId).filter(isInlineImageId))
  const broken: string[] = []
  const rest = replaceInlineTokens(body, (id, label) => {
    if (!known.has(id)) broken.push(label || 'Bild')
    return ''
  })
  const stray = rest.match(/\]\(bild:/g)
  if (stray) for (let i = 0; i < stray.length; i++) broken.push('beschädigter Platzhalter')
  return broken
}

/** Platzhalter für das Schreibfeld. Der Name wird so entschärft, dass er die Klammern nicht sprengt. */
export function inlineImageToken(filename: string, inlineId: string): string {
  const label = filename.replace(/[[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim() || 'Bild'
  return `![${label}](bild:${inlineId})`
}

/** Kennungen aller Platzhalter im Text, in Reihenfolge, ohne Doppelte. */
export function referencedInlineIds(body: string): string[] {
  const ids: string[] = []
  for (const m of (body || '').matchAll(tokenRegex())) {
    if (!ids.includes(m[2])) ids.push(m[2])
  }
  return ids
}

/**
 * Ersetzt Platzhalter. `replace` bekommt Kennung und Beschriftung; `null` lässt
 * den Platzhalter unverändert stehen (unbekannte Kennung).
 */
export function replaceInlineTokens(body: string, replace: (inlineId: string, label: string) => string | null): string {
  return (body || '').replace(tokenRegex(), (match, label: string, id: string) => {
    const out = replace(id, label)
    return out === null ? match : out
  })
}

/**
 * Teilt die Anhänge eines Entwurfs: `inline` sind Bilder, deren Platzhalter im
 * Text steht; `regular` sind gewöhnliche Anhänge. Bilder ohne Platzhalter
 * fallen heraus.
 */
export function splitInlineAttachments<T extends InlineCapableAttachment>(body: string, attachments: T[] | undefined): { inline: T[]; regular: T[] } {
  const referenced = new Set(referencedInlineIds(body))
  const inline: T[] = []
  const regular: T[] = []
  const seen = new Set<string>()
  for (const att of attachments || []) {
    if (!att.inlineId) { regular.push(att); continue }
    if (!isInlineImageId(att.inlineId) || !referenced.has(att.inlineId) || seen.has(att.inlineId)) continue
    seen.add(att.inlineId)
    inline.push(att)
  }
  return { inline, regular }
}

/** Was tatsächlich mitgeht: gewöhnliche Anhänge plus Bilder mit Platzhalter. */
export function sendableAttachments<T extends InlineCapableAttachment>(body: string, attachments: T[] | undefined): T[] {
  const { inline, regular } = splitInlineAttachments(body, attachments)
  return [...regular, ...inline]
}

/** Entfernt den Platzhalter eines Bildes samt der Zeile, die er allein belegt. */
export function removeInlineToken(body: string, inlineId: string): string {
  const kept: string[] = []
  for (const line of (body || '').split('\n')) {
    if (!line.includes(`(bild:${inlineId})`)) { kept.push(line); continue }
    const rest = replaceInlineTokens(line, id => id === inlineId ? '' : null)
    if (rest.trim() !== '') kept.push(rest)
  }
  return kept.join('\n')
}

/**
 * Setzt Platzhalter an die Cursorstelle (eine Auswahl wird ersetzt). Jedes Bild
 * bekommt eine eigene Zeile. Liefert den neuen Text und die Cursorstelle danach.
 */
export function insertInlineTokens(body: string, selectionStart: number, selectionEnd: number, tokens: string[]): { body: string; cursor: number } {
  const text = body || ''
  if (tokens.length === 0) return { body: text, cursor: Math.min(Math.max(selectionStart, 0), text.length) }
  const start = Math.min(Math.max(selectionStart, 0), text.length)
  const end = Math.min(Math.max(selectionEnd, start), text.length)
  const before = text.slice(0, start)
  const after = text.slice(end)
  const lead = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
  const trail = after.startsWith('\n') ? '' : '\n'
  const inserted = lead + tokens.join('\n') + trail
  return { body: before + inserted + after, cursor: before.length + inserted.length }
}

/** Reintext-Fassung der Mail: aus dem Platzhalter wird ein lesbarer Hinweis. */
export function inlineTokensToPlainText(body: string, knownIds: Iterable<string>): string {
  const known = new Set(knownIds)
  return replaceInlineTokens(body, (id, label) => known.has(id) ? `[Bild: ${label || 'Bild'}]` : '')
}
