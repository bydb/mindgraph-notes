// Kalender-Termine aus E-Mails: Datenmodell, Prüfung und .ics-Erzeugung.
//
// Reine Logik, prozessübergreifend. Kein fs, kein fetch, kein Electron — damit
// Main (Datei schreiben, EventKit) und Renderer (Prüfkarte) dieselbe Rechnung
// benutzen und sie testbar bleibt.
//
// WARUM ÜBERHAUPT .ics, wo es doch `calendar-create-event` gibt: Der EventKit-Weg
// läuft nur unter macOS und braucht eine Systemfreigabe. Eine .ics-Datei nimmt
// jeder Kalender auf jedem Betriebssystem an, und das Kalenderprogramm fragt beim
// Öffnen selbst nochmal nach — die Bestätigung ist also eingebaut.

/** Ein Termin, wie ihn die Prüfkarte anzeigt und der Nutzer ihn korrigieren kann. */
export interface CalendarEventDraft {
  title: string
  /** Startzeitpunkt als ISO-String. */
  startIso: string
  durationMinutes: number
  /** Ort im eigentlichen Sinn — Adresse oder Raum. Gehört NICHT in die Notizen. */
  location?: string
  /** Link zur Videokonferenz. Eigenes Feld, damit Kalender ihn als Verknüpfung anbieten. */
  url?: string
  notes?: string
  /**
   * Ganztägig. `startIso` trägt dann nur den TAG — als lokaler Mittag, nicht
   * Mitternacht: Mittag übersteht Sommerzeit-Lücken und eine verrutschte Stunde,
   * ohne auf den Nachbartag zu kippen. `durationMinutes` zählt dann nicht.
   */
  allDay?: boolean
  /** Letzter Tag (einschließlich) eines ganztägigen Termins, JJJJ-MM-TT. Ohne Angabe eintägig. */
  endDate?: string
}

/**
 * Erinnerungen in Minuten VOR dem Termin.
 *
 * Zwei statt einer: eine am Vortag zum Vorbereiten, eine kurz vorher zum
 * Hingehen. Bei einer reinen Videokonferenz ist die erste überflüssig, bei einem
 * Termin mit Anfahrt die zweite zu spät — beide zu setzen ist der Kompromiss, der
 * in keinem der beiden Fälle schadet.
 */
export const DEFAULT_REMINDER_MINUTES = [1440, 15]

/**
 * Ganztägige Termine beginnen rechnerisch um Mitternacht. „15 Minuten vorher"
 * wäre 23:45 Uhr am Vorabend, „ein Tag vorher" Mitternacht — beides unbrauchbar.
 * 15 Stunden vor Mitternacht ist 9 Uhr am Vortag.
 */
export const ALL_DAY_REMINDER_MINUTES = [900]

export function reminderMinutesFor(draft: Pick<CalendarEventDraft, 'allDay'>): number[] {
  return draft.allDay ? ALL_DAY_REMINDER_MINUTES : DEFAULT_REMINDER_MINUTES
}

/** Länger als ein Monat ist kein Termin mehr, sondern ein Lesefehler. */
export const MAX_ALL_DAY_SPAN_DAYS = 31

/** Sinnvolle Grenzen. 5 Minuten ist die kürzeste Besprechung, 12 Stunden ein voller Tag. */
export const MIN_DURATION_MINUTES = 5
export const MAX_DURATION_MINUTES = 720
export const DEFAULT_DURATION_MINUTES = 60

// Erkennt Links der verbreiteten Konferenzdienste. Bewusst eine Allowlist und
// nicht „irgendeine URL": In einer Mail stehen auch Abmelde-Links, Impressum und
// Werbebanner — die als Konferenzlink in den Kalender zu schreiben wäre schlimmer
// als gar kein Link.
const MEETING_HOST_PATTERN = /\b(?:zoom\.us|zoom\.com|teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|webex\.com|gotomeeting\.com|whereby\.com|bigbluebutton|bbb\.[a-z0-9.-]+|jitsi\.[a-z0-9.-]+|meet\.jit\.si|nextcloud\.[a-z0-9.-]+\/call|element\.io|zoom-x\.de|dfnconf\.de|conf\.dfn\.de|edudip\.com|vc\.schule)/i

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi

/**
 * Zieht den Konferenzlink aus einem Mailtext.
 *
 * Deterministisch statt per Modell: Ein Sprachmodell erfindet URLs oder kürzt sie,
 * und eine falsche Konferenz-URL merkt man erst, wenn man vor verschlossener Tür
 * steht. Der reguläre Ausdruck kann nur finden, was wirklich dasteht.
 */
export function extractMeetingUrl(text: string): string | undefined {
  if (!text) return undefined
  const matches = text.match(URL_PATTERN)
  if (!matches) return undefined
  for (const raw of matches) {
    // Satzzeichen am Ende gehören nicht zur Adresse.
    const url = raw.replace(/[.,;:!?]+$/, '')
    if (MEETING_HOST_PATTERN.test(url)) return url
  }
  return undefined
}

export interface DraftProblem {
  field: keyof CalendarEventDraft
  message: string
}

/**
 * Prüft und begradigt einen Entwurf. Gibt den bereinigten Entwurf UND die
 * Beanstandungen zurück — die Prüfkarte zeigt beides, statt still zu korrigieren.
 */
export function normalizeDraft(draft: Partial<CalendarEventDraft>): { draft: CalendarEventDraft; problems: DraftProblem[] } {
  const problems: DraftProblem[] = []

  const title = (draft.title || '').trim().replace(/\s+/g, ' ').slice(0, 200)
  if (!title) problems.push({ field: 'title', message: 'Kein Titel erkannt' })

  let startIso = ''
  const parsed = draft.startIso ? new Date(draft.startIso) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    problems.push({ field: 'startIso', message: 'Kein gültiger Startzeitpunkt erkannt' })
  } else {
    startIso = parsed.toISOString()
  }

  const allDay = draft.allDay === true
  let endDate: string | undefined
  if (allDay && startIso && draft.endDate) {
    const startDay = localDateString(new Date(startIso))
    const span = daysBetween(startDay, draft.endDate)
    if (span === undefined || span < 0) {
      problems.push({ field: 'endDate', message: 'Ende liegt vor dem Beginn — als eintägig behandelt' })
    } else if (span > MAX_ALL_DAY_SPAN_DAYS) {
      problems.push({ field: 'endDate', message: `Ende liegt mehr als ${MAX_ALL_DAY_SPAN_DAYS} Tage nach dem Beginn — als eintägig behandelt` })
    } else if (span > 0) {
      endDate = draft.endDate
    }
  }

  let durationMinutes = Math.round(Number(draft.durationMinutes))
  if (allDay) {
    // Zählt bei ganztägigen Terminen nicht; ein gültiger Wert bleibt stehen, damit
    // das Abwählen von „Ganztägig" nicht mit einer Beanstandung beginnt.
    if (!Number.isFinite(durationMinutes) || durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
      durationMinutes = DEFAULT_DURATION_MINUTES
    }
  } else if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    durationMinutes = DEFAULT_DURATION_MINUTES
    problems.push({ field: 'durationMinutes', message: `Keine Dauer erkannt — ${DEFAULT_DURATION_MINUTES} Minuten angenommen` })
  } else if (durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
    const clamped = Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, durationMinutes))
    problems.push({ field: 'durationMinutes', message: `Dauer ${durationMinutes} Minuten unplausibel — auf ${clamped} gesetzt` })
    durationMinutes = clamped
  }

  const location = (draft.location || '').trim().replace(/\s+/g, ' ').slice(0, 300) || undefined

  // Nur echte http(s)-Adressen. Ein Modell, das „siehe Anhang" ins URL-Feld
  // schreibt, soll das nicht als Verknüpfung in den Kalender bekommen.
  let url: string | undefined
  const rawUrl = (draft.url || '').trim()
  if (rawUrl) {
    if (/^https?:\/\/\S+$/i.test(rawUrl)) url = rawUrl
    else problems.push({ field: 'url', message: 'Verworfen: keine gültige Web-Adresse' })
  }

  const notes = (draft.notes || '').trim().slice(0, 2000) || undefined

  const result: CalendarEventDraft = { title, startIso, durationMinutes, location, url, notes }
  if (allDay) {
    result.allDay = true
    if (endDate) result.endDate = endDate
  }
  return { draft: result, problems }
}

// ─── Ganztägig: Rechnen mit Kalendertagen ────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Lokaler Kalendertag eines Zeitpunkts als JJJJ-MM-TT. */
export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseLocalDate(value: string): Date | undefined {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(year, month - 1, day, 12, 0, 0, 0)
  // Kein stilles Weiterrollen: 31.02. ist kein Tag.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return undefined
  return d
}

/** Ganze Tage von `from` bis `to` (beide JJJJ-MM-TT); undefined bei ungültigem Datum. */
export function daysBetween(from: string, to: string): number | undefined {
  const a = parseLocalDate(from)
  const b = parseLocalDate(to)
  if (!a || !b) return undefined
  // Beide stehen auf Mittag — eine Sommerzeit-Stunde verfälscht das Runden nicht.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** ISO-Zeitstempel für einen ganztägigen Termin: lokaler Mittag des Tages. */
export function localDateToAllDayIso(date: string): string | undefined {
  return parseLocalDate(date)?.toISOString()
}

/**
 * Erster und letzter Tag eines ganztägigen Termins, dazu der Tag DANACH —
 * .ics und EventKit rechnen das Ende ausschließend.
 */
export function allDayRange(draft: CalendarEventDraft): { firstDay: string; lastDay: string; dayAfter: string } | undefined {
  const start = new Date(draft.startIso)
  if (Number.isNaN(start.getTime())) return undefined
  const firstDay = localDateString(start)
  const span = draft.endDate ? daysBetween(firstDay, draft.endDate) : 0
  const lastDay = span !== undefined && span > 0 && span <= MAX_ALL_DAY_SPAN_DAYS ? draft.endDate! : firstDay
  const last = parseLocalDate(lastDay)!
  const after = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1, 12, 0, 0, 0)
  return { firstDay, lastDay, dayAfter: localDateString(after) }
}

// ─── Belegprüfung: steht das wirklich in der Mail? ───────────────────────────
//
// Anlass (18.09.2026): Eine „Save the Date"-Mail nannte zwei Tage und KEINE
// Uhrzeit. Das Modell lieferte trotz „Erfinde nichts" 09:00 Uhr und 60 Minuten,
// und die Prüfkarte zeigte beides ohne jede Warnung. Deshalb dieselbe Regel wie
// beim Konferenzlink: Was im Kalender landet, muss im Text zu finden sein.

/** Steht die Uhrzeit (HH:MM) in irgendeiner üblichen Schreibweise im Text? */
export function isTimeStatedInText(time: string, text: string): boolean {
  const m = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!m || !text) return false
  const hour = Number(m[1])
  const minute = Number(m[2])
  const hourForms = [String(hour), pad2(hour)]
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const meridiem = hour < 12 ? 'a' : 'p'
  const mm = pad2(minute)
  const patterns: RegExp[] = []
  for (const h of new Set(hourForms)) {
    // 14:30 — und 14.30 nur mit „Uhr"/„h" dahinter, sonst trifft „09.03.2027".
    patterns.push(new RegExp(`(?<![\\d:.])${h}:${mm}(?![\\d])`))
    patterns.push(new RegExp(`(?<![\\d:.])${h}\\.${mm}\\s*(?:Uhr|h\\b)`, 'i'))
    patterns.push(new RegExp(`(?<![\\d:.])${h}\\s*Uhr\\s*${mm}(?!\\d)`, 'i'))
    if (minute === 0) patterns.push(new RegExp(`(?<![\\d:.])${h}\\s*(?:Uhr|h\\b|o'clock)`, 'i'))
  }
  patterns.push(new RegExp(`(?<![\\d:.])0?${h12}[:.]${mm}\\s*${meridiem}\\.?m`, 'i'))
  if (minute === 0) patterns.push(new RegExp(`(?<![\\d:.])0?${h12}\\s*${meridiem}\\.?m\\b`, 'i'))
  return patterns.some(p => p.test(text))
}

const TIME_MENTION = /(?<![\d:.])(?:[01]?\d|2[0-3]):[0-5]\d(?!\d)|(?<![\d:.])(?:[01]?\d|2[0-3])(?:\.[0-5]\d)?\s*Uhr/gi
const DURATION_PHRASE = /(?<!\d)\d+(?:[.,]\d+)?\s*(?:Minuten|Min\.?|Stunden?|Std\.?|hours?|hrs?|minutes?|mins?)(?![a-zäöü])/i

/**
 * Lässt sich aus dem Text überhaupt eine Dauer ablesen? Dafür braucht es zwei
 * verschiedene Uhrzeiten (Beginn und Ende) oder eine ausgeschriebene Dauer.
 */
export function hasDurationEvidence(text: string): boolean {
  if (!text) return false
  if (DURATION_PHRASE.test(text)) return true
  const mentions = new Set((text.match(TIME_MENTION) || []).map(t => t.replace(/\s+/g, '').toLowerCase()))
  return mentions.size >= 2
}

const MONTH_NAMES: string[][] = [
  ['januar', 'jan', 'january'], ['februar', 'feb', 'february'], ['märz', 'maerz', 'mrz', 'mar', 'march'],
  ['april', 'apr'], ['mai', 'may'], ['juni', 'jun', 'june'], ['juli', 'jul', 'july'],
  ['august', 'aug'], ['september', 'sep', 'sept'], ['oktober', 'okt', 'october', 'oct'],
  ['november', 'nov'], ['dezember', 'dez', 'december', 'dec'],
]

/** Steht der Tag (JJJJ-MM-TT) als Datum im Text — „10.03.", „10. März", „March 10", ISO? */
export function isDateStatedInText(date: string, text: string): boolean {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m || !text) return false
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return false
  if (text.includes(date)) return true
  const names = MONTH_NAMES[month - 1].join('|')
  const patterns = [
    new RegExp(`(?<!\\d)0?${day}\\.\\s?0?${month}\\.(?:\\d{2,4})?(?!\\d)`),
    new RegExp(`(?<!\\d)0?${day}\\.?\\s*(?:${names})(?![a-zäöü])`, 'i'),
    new RegExp(`(?<![a-zäöü])(?:${names})\\.?\\s+0?${day}(?:st|nd|rd|th)?(?!\\d)`, 'i'),
    new RegExp(`(?<!\\d)0?${day}/0?${month}(?!\\d)|(?<!\\d)0?${month}/0?${day}(?!\\d)`),
  ]
  return patterns.some(p => p.test(text))
}

/**
 * Setzt getrennte Modellfelder fuer lokales Datum und lokale Uhrzeit sicher zu
 * einem ISO-Zeitstempel zusammen. JavaScript rollt ungueltige Werte sonst still
 * weiter (`31.02.` wird Maerz); fuer einen Kalendertermin waere das fatal.
 */
export function localDateTimeToIso(date: string, time: string): string | undefined {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!dateMatch || !timeMatch) return undefined

  const [, yearRaw, monthRaw, dayRaw] = dateMatch
  const [, hourRaw, minuteRaw] = timeMatch
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined
  }

  const local = new Date(year, month - 1, day, hour, minute, 0, 0)
  // Komponentenvergleich faengt Monats-/Tages-Rollover und nicht existente lokale
  // Uhrzeiten (z. B. waehrend einer DST-Luecke) ab.
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  ) {
    return undefined
  }
  return local.toISOString()
}

// ─── .ics ────────────────────────────────────────────────────────────────────

/** RFC 5545: Backslash, Semikolon, Komma und Zeilenumbrüche müssen maskiert werden. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * RFC 5545 begrenzt Zeilen auf 75 Oktette; Fortsetzungen beginnen mit einem
 * Leerzeichen. Gezählt wird in BYTES, nicht in Zeichen — ein Umlaut belegt zwei,
 * ein Emoji vier. Nach Zeichen zu falten erzeugt bei deutschen Orts- und
 * Titelangaben zu lange Zeilen, die manche Kalender abweisen.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const out: string[] = []
  let current = ''
  let currentBytes = 0
  let first = true
  for (const char of line) {
    const size = encoder.encode(char).length
    const limit = first ? 75 : 74   // Fortsetzungszeilen tragen ein führendes Leerzeichen
    if (currentBytes + size > limit) {
      out.push(current)
      current = ''
      currentBytes = 0
      first = false
    }
    current += char
    currentBytes += size
  }
  if (current) out.push(current)
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join('\r\n')
}

/** Zeitstempel in UTC-Grundform, wie ihn .ics erwartet: 20260824T120000Z */
export function toIcsUtc(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

export interface BuildIcsOptions {
  /** Erinnerungen in Minuten vor dem Termin. Leeres Array = keine. */
  reminderMinutes?: number[]
  /** Für die UID. Ohne Angabe wird aus Titel und Start ein stabiler Wert gebildet. */
  uid?: string
  /** Zeitstempel für DTSTAMP. Ohne Angabe der Startzeitpunkt — hält die Ausgabe reproduzierbar. */
  stamp?: Date
}

/**
 * Baut eine vollständige .ics-Datei mit genau einem Termin.
 *
 * Erzeugt bewusst UTC-Zeiten statt einer Zeitzonen-Definition: Ein eigener
 * VTIMEZONE-Block ist die häufigste Fehlerquelle in selbstgebauten .ics-Dateien,
 * und UTC verstehen alle Kalender richtig. Die Anzeige rechnet der Kalender
 * ohnehin in die Zeitzone des Nutzers zurück.
 */
export function buildIcs(draft: CalendarEventDraft, options: BuildIcsOptions = {}): string {
  const start = new Date(draft.startIso)
  if (Number.isNaN(start.getTime())) throw new Error('Ungültiger Startzeitpunkt')
  const end = new Date(start.getTime() + draft.durationMinutes * 60_000)
  const range = draft.allDay ? allDayRange(draft) : undefined
  const stamp = options.stamp ?? start
  const uid = options.uid || `${toIcsUtc(start)}-${hashString(draft.title)}@mindgraph-notes`

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MindGraph Notes//Termin aus E-Mail//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(stamp)}`,
    // Ganztägig: reine Kalendertage ohne Zeitzone, Ende ausschließend (RFC 5545).
    range ? `DTSTART;VALUE=DATE:${range.firstDay.replace(/-/g, '')}` : `DTSTART:${toIcsUtc(start)}`,
    range ? `DTEND;VALUE=DATE:${range.dayAfter.replace(/-/g, '')}` : `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(draft.title)}`,
  ]
  if (draft.location) lines.push(`LOCATION:${escapeIcsText(draft.location)}`)
  if (draft.url) lines.push(`URL:${escapeIcsText(draft.url)}`)

  // Der Konferenzlink steht zusätzlich in der Beschreibung: Nicht jeder Kalender
  // zeigt das URL-Feld an, und dann sucht man am Terminbeginn vergeblich.
  const description = [draft.notes, draft.url ? `Videokonferenz: ${draft.url}` : '']
    .filter(Boolean)
    .join('\n\n')
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`)

  for (const minutes of options.reminderMinutes ?? reminderMinutesFor(draft)) {
    if (!Number.isFinite(minutes) || minutes < 0) continue
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(draft.title)}`,
      `TRIGGER:-PT${Math.round(minutes)}M`,
      'END:VALARM',
    )
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')
  // RFC 5545 schreibt CRLF vor. Manche Kalender sind nachsichtig, andere nicht.
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

/** Kurzer, stabiler Hash für die UID — keine Sicherheitsfunktion. */
function hashString(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

/** Dateiname für die .ics: lesbar, ohne Zeichen, die Dateisysteme nicht mögen. */
export function icsFileName(draft: CalendarEventDraft): string {
  const start = new Date(draft.startIso)
  const datePart = Number.isNaN(start.getTime())
    ? 'Termin'
    : `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  const titlePart = (draft.title || 'Termin')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return `${datePart} ${titlePart}.ics`.replace(/\s+/g, ' ')
}
