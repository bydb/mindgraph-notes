// Tagesüberblick für den Notiz-Agenten (Werkzeug day_overview): reine Formatierung.
//
// Plan und Prüfung: docs/codex-collab/agent-tagesueberblick.md. Leitlinie aus dem Review:
// jede Zeile sagt, WAS gezählt wurde und WO — nichts hier behauptet „offen“, „erledigt“ über
// die App hinaus oder Vollständigkeit. Mails stehen bewusst nicht drin (der lokale Mailbestand
// ist ein Ausschnitt, kein Tages-Postfach).

import type { DayLogGap, DayLogSummary } from './dayLog'
import { dayKey } from './dayLog'

export interface DayOverviewData {
  /** JJJJ-MM-TT, lokaler Kalendertag. */
  date: string
  weekday: string
  range: { from: number; to: number }
  /** Tagesprotokoll (shared/dayLog.ts). */
  log:
    | {
        state: 'ok'
        since: number
        summary: DayLogSummary
        /**
         * Text je Eintrag in `summary.tasksChecked` (gleiche Reihenfolge), beim Abruf aus der Notiz
         * gelesen — das Protokoll selbst speichert keinen Aufgabentext. null = steht dort nicht mehr.
         */
        taskTexts: Array<string | null>
        /** Zeiträume dieses Tages, in denen das Protokoll nicht geschrieben werden konnte. */
        gaps: DayLogGap[]
      }
    | { state: 'missing' }
    | { state: 'broken' }
  /** Zähler aus dem Tätigkeitsprotokoll. 'missing' = auf diesem Rechner noch keins, 'broken' = nicht lesbar. */
  activity: { state: 'missing' } | { state: 'broken' } | {
    state: 'ok'
    accepted: number
    runsFinished: number
    runsFailed: number
    emailTasks: number
    emailsAnalyzed: number
    tasksCreatedViaApp: number
    /** Abgeschlossene Plugin-KANÄLE — ein Vorgang kann mehrere haben (Codex F22). */
    pluginChannelsCompleted: number
  }
  /** Brain-Tagesnotizen dieses Tages (Vault-relative Pfade); null = nicht geprüft. */
  brainNotes: string[] | null
}

export const DAY_OVERVIEW_MAX_CHARS = 3000
const MAX_TASKS = 15
const MAX_NOTES = 12
const MAX_FIELD = 140

function clip(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > MAX_FIELD ? `${one.slice(0, MAX_FIELD - 1)}…` : one
}

function list(title: string, items: string[], max: number): string[] {
  const lines = [`${title} (${items.length})`]
  for (const item of items.slice(0, max)) lines.push(`- ${item}`)
  if (items.length > max) lines.push(`- … und ${items.length - max} weitere (nicht gezeigt)`)
  return lines
}

function hhmm(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatDayOverview(data: DayOverviewData, maxChars = DAY_OVERVIEW_MAX_CHARS): string {
  const out: string[] = []
  out.push(`TAGESÜBERBLICK ${data.weekday}, ${data.date} — lokaler Kalendertag, gemessen in MindGraph auf diesem Rechner.`)
  out.push('')

  if (data.log.state === 'missing') {
    out.push('TAGESPROTOKOLL: nicht gemessen — es wird auf diesem Rechner noch nicht geführt (beginnt mit dem nächsten Speichern einer Notiz).')
  } else if (data.log.state === 'broken') {
    out.push('TAGESPROTOKOLL: nicht lesbar — über abgehakte Aufgaben und gespeicherte Notizen ist keine Aussage möglich.')
  } else if (data.log.since >= data.range.to) {
    out.push(`TAGESPROTOKOLL: für diesen Tag nicht gemessen — es wird erst seit ${dayKey(data.log.since)} geführt.`)
  } else {
    const s = data.log.summary
    if (data.log.since > data.range.from) {
      out.push(`Hinweis: Das Tagesprotokoll begann an diesem Tag um ${hhmm(data.log.since)} Uhr; davor ist nichts gemessen.`)
    }
    for (const g of data.log.gaps) {
      out.push(`Hinweis: Von ${hhmm(Math.max(g.from, data.range.from))} bis ${hhmm(Math.min(g.to, data.range.to - 1))} Uhr konnte das Protokoll nicht geschrieben werden; für diese Zeit ist nichts gemessen.`)
    }
    const texts = data.log.taskTexts
    out.push(...list('CHECKBOXEN AUF ERLEDIGT GESETZT — Wortlaut aus dem heutigen Stand der Notiz', s.tasksChecked.map((t, i) =>
      `${texts[i] ? clip(texts[i] as string) : '(Text steht nicht mehr in der Notiz)'} — Notiz: ${clip(t.note)}`), MAX_TASKS))
    out.push(...list('NOTIZEN ANGELEGT', s.notesCreated.map(clip), MAX_NOTES))
    out.push(...list('NOTIZEN GESPEICHERT (schon vorhanden)', s.notesSaved.map(clip), MAX_NOTES))
    if (s.notesMoved.length > 0) {
      out.push(...list('NOTIZEN UMBENANNT ODER VERSCHOBEN', s.notesMoved.map(m => `${clip(m.from)} → ${clip(m.to)}`), MAX_NOTES))
    }
  }
  out.push('')

  out.push('APP-LÄUFE (Tätigkeitsprotokoll dieses Rechners)')
  if (data.activity.state === 'broken') {
    out.push('- nicht lesbar — keine verlässliche Bilanz verfügbar')
  } else if (data.activity.state === 'missing') {
    out.push('- nicht gemessen — auf diesem Rechner gibt es noch kein Tätigkeitsprotokoll')
  } else {
    const a = data.activity
    const rows: Array<[number, string]> = [
      [a.accepted, `an diesem Tag übernommene Agent-Ergebnisse: ${a.accepted}`],
      [a.runsFinished, `an diesem Tag beendete Agent-Läufe: ${a.runsFinished}${a.runsFailed > 0 ? ` (davon fehlgeschlagen: ${a.runsFailed})` : ''}`],
      [a.emailTasks, `aus Mails erkannte Aufgaben: ${a.emailTasks} (in ${a.emailsAnalyzed} analysierten Mails; erkannt, nicht erledigt)`],
      [a.tasksCreatedViaApp, `über den Aufgaben-Dialog angelegte Aufgaben: ${a.tasksCreatedViaApp}`],
      [a.pluginChannelsCompleted, `abgeschlossene Plugin-Kanäle: ${a.pluginChannelsCompleted} (ein Vorgang kann mehrere Kanäle haben)`]
    ]
    const shown = rows.filter(([n]) => n > 0)
    if (shown.length === 0) out.push('- keine Einträge an diesem Tag')
    else for (const [, text] of shown) out.push(`- ${text}`)
  }
  out.push('')

  out.push('BRAIN-TAGESNOTIZ (vom Modell erzeugte Zusammenfassung, kein Messwert)')
  if (data.brainNotes === null) out.push('- nicht geprüft (Brain-Ordner nicht lesbar)')
  else if (data.brainNotes.length === 0) out.push('- für diesen Tag wurde keine gefunden')
  else for (const p of data.brainNotes) out.push(`- vorhanden: ${clip(p)} (mit note_read lesbar)`)
  out.push('')

  out.push('NICHT ENTHALTEN: Mails, Kalender, Arbeit außerhalb von MindGraph und Änderungen auf anderen Geräten (Sync). Notizen aus Importen, dem Telegram-Bot und automatischen Abgleichen können fehlen. Ob etwas noch offen ist, steht hier nicht. „Checkbox auf erledigt gesetzt“ ist ein Klick in der Notiz, kein Nachweis, dass die Sache erledigt ist. Eine 0 oder ein leerer Abschnitt heißt „nichts gemessen“, nicht „nichts getan“.')

  const text = out.join('\n')
  if (text.length <= maxChars) return text
  // Sichtbar kürzen, nie still und nie mitten in einer Zeile (Codex F23): es bleiben nur GANZE
  // Zeilen stehen, die Schlusszeile mit den Grenzen ist im Budget reserviert. Ein halber
  // Aufgabentext oder Pfad sähe für das Modell wie ein vollständiger Befund aus.
  const last = out[out.length - 1]
  const body = out.slice(0, -1)
  const tailFor = (dropped: number) => `[… gekürzt: ${dropped} Zeilen passen nicht ins Budget und fehlen hier]\n${last}`
  const kept: string[] = []
  let used = 0
  for (let i = 0; i < body.length; i++) {
    const tail = tailFor(body.length - i - 1)
    if (used + body[i].length + 1 + tail.length > maxChars) break
    kept.push(body[i])
    used += body[i].length + 1
  }
  const tail = tailFor(body.length - kept.length)
  const result = kept.length > 0 ? `${kept.join('\n')}\n${tail}` : tail
  // Reicht das Budget nicht einmal für den Schluss, bleibt eine ehrliche Kurzmeldung.
  return result.length <= maxChars ? result : `[Tagesüberblick ${data.date}: Budget zu klein, nichts gezeigt]`.slice(0, Math.max(0, maxChars))
}

/** Datum prüfen: gültiger Kalendertag, nicht in der Zukunft. Liefert eine Fehlermeldung oder null. */
export function dayOverviewDateError(isoDate: string, range: { from: number; to: number } | null, now: number): string | null {
  if (!range) return `Fehler: „${isoDate.slice(0, 20)}“ ist kein gültiges Datum. Erwartet wird JJJJ-MM-TT.`
  if (range.from > now) return `Fehler: ${isoDate} liegt in der Zukunft — dafür gibt es keine Messung.`
  return null
}
