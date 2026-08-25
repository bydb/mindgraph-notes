// Tätigkeitsprotokoll — reines Schema, Aufräumen, Tagesbilanz, Zeitersparnis.
//
// Warum überhaupt eine eigene Ablage: Die Run-Registry (main/noteAgent/runRegistry.ts)
// weiß zwar, welche Ergebnisse übernommen wurden, hält das aber nur im Speicher und
// höchstens acht beendete Läufe je Fenster. Eine Tagesbilanz lässt sich daraus nicht
// rückwirkend bilden — also muss ab jetzt mitgeschrieben werden.
//
// Was hier NICHT hineingehört: Dateinamen, Notiz- und Projekttitel, Transkripte,
// Dokumentinhalte. Ein Dateiname wie „Angebot Müller 2026.xlsx" ist bereits Inhalt.
// Das Protokoll trägt nur Art, Zeitpunkt, Dauer und Status.

import { activeMs as activeTimeOf } from './activeTime'

/**
 * Tätigkeitsart eines Agent-Laufs. Wird aus der WERKZEUGFOLGE abgeleitet, nie aus Text.
 *
 * Ehrliche Grenze: Aus `table-merge` wird nie „Angebotsvergleich" — diese Bezeichnung
 * ist ohne Inhaltskenntnis nicht ableitbar. Wer sie lesen will, vergibt sie selbst,
 * indem er für diese Art eine Referenzzeit hinterlegt.
 */
export type ActivityType = 'table-merge' | 'document' | 'summary' | 'web-research' | 'other'

export const ACTIVITY_TYPES: ActivityType[] = ['table-merge', 'document', 'summary', 'web-research', 'other']

/** Formate, die der Agent als Ergebnis anbieten kann (Spiegel von AgentResultEntry['kind']). */
export type ResultFormat = 'md' | 'xlsx' | 'docx' | 'txt' | 'csv' | 'html' | 'png' | 'jpg'

export type ActivityEvent =
  | {
      at: number
      kind: 'agent-run-finished'
      runId: string
      /** Laufzeit des Agenten = DURCHLAUFZEIT. Nicht die Arbeitszeit des Menschen. */
      durationMs: number
      /** Aktive Zeit beim Formulieren des Auftrags. Fehlt bei Läufen vor dieser Messung. */
      instructionMs?: number
      activityType: ActivityType
      resultCount: number
      status: 'ok' | 'failed' | 'aborted'
    }
  | {
      at: number
      kind: 'agent-result-accepted'
      runId: string
      format: ResultFormat
      /** Aktive Zeit beim Prüfen dieses Ergebnisses (Fenster im Vordergrund, gedeckelt). */
      reviewMs?: number
    }
  | { at: number; kind: 'agent-result-discarded'; runId: string; format: ResultFormat; reviewMs?: number }
  | { at: number; kind: 'task-created'; count: number }
  | {
      at: number
      kind: 'voice-command'
      /** null bei Rückfall/Rückfrage — dort gibt es noch keine Aktion. */
      actionId: string | null
      status: 'ok' | 'clarified' | 'rejected'
      sttMs?: number
      matchMs?: number
      dataMs?: number
    }

export type ActivityEventKind = ActivityEvent['kind']

export const ACTIVITY_RETENTION_DAYS = 90
/** Obergrenze wie in utils/contextMemory.ts — eine Protokolldatei darf nicht unbegrenzt wachsen. */
export const ACTIVITY_MAX_EVENTS = 5000

const KNOWN_KINDS: ActivityEventKind[] = [
  'agent-run-finished',
  'agent-result-accepted',
  'agent-result-discarded',
  'task-created',
  'voice-command'
]

/**
 * Prüft einen einzelnen Eintrag. Wird beim Laden auf JEDEN Eintrag angewandt: Eine
 * halb geschriebene oder von Hand veränderte Datei darf die Bilanz nicht sprengen,
 * sondern nur die kaputten Zeilen verlieren.
 */
export function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  if (typeof e.at !== 'number' || !Number.isFinite(e.at)) return false
  if (typeof e.kind !== 'string' || !KNOWN_KINDS.includes(e.kind as ActivityEventKind)) return false
  if (e.kind === 'agent-run-finished') {
    return typeof e.runId === 'string' && typeof e.durationMs === 'number' && typeof e.activityType === 'string'
  }
  if (e.kind === 'agent-result-accepted' || e.kind === 'agent-result-discarded') {
    return typeof e.runId === 'string' && typeof e.format === 'string'
  }
  if (e.kind === 'task-created') return typeof e.count === 'number'
  return typeof e.status === 'string'
}

/** Retention: erst nach Alter, dann auf die Obergrenze — die jüngsten Einträge bleiben. */
export function pruneActivityEvents(events: ActivityEvent[], nowMs: number): ActivityEvent[] {
  const cutoff = nowMs - ACTIVITY_RETENTION_DAYS * 86_400_000
  const kept = events.filter(e => e.at >= cutoff)
  return kept.length > ACTIVITY_MAX_EVENTS ? kept.slice(kept.length - ACTIVITY_MAX_EVENTS) : kept
}

/**
 * Tätigkeitsart aus den erfolgreich gelaufenen Werkzeugen.
 *
 * Reihenfolge ist Absicht: Ein Web-Lauf schreibt am Ende auch eine Notiz, und eine
 * Tabellenauswertung liest vorher Dateien. Entscheidend ist das kennzeichnende
 * Werkzeug, nicht das letzte.
 */
export function deriveActivityType(tools: Iterable<string>): ActivityType {
  const used = new Set(tools)
  if (used.has('collect_table') || used.has('write_xlsx')) return 'table-merge'
  if (used.has('web_search') || used.has('web_fetch')) return 'web-research'
  if (used.has('write_docx') || used.has('fill_docx_form') || used.has('write_html')) return 'document'
  if (used.has('write_note')) return 'summary'
  return 'other'
}

export interface AcceptedRun {
  runId: string
  activityType: ActivityType
  /** Durchlaufzeit des Agenten — Kontext, NIE Abzug. */
  durationMs: number
  /**
   * Aktive Arbeitszeit des Menschen (Auftrag + Prüfung). `null` heißt „nicht erfasst"
   * und schließt den Lauf von der Bewertung aus — eine 0 würde die volle Referenzzeit
   * als Ersparnis ausweisen und wäre damit die unehrlichste aller Zahlen.
   */
  activeMs: number | null
  /** Von der Auftragserteilung bis zur Übernahme — „Ergebnis nach". */
  elapsedMs: number
  /** Anzahl übernommener Ergebnisse aus diesem Lauf. */
  accepted: number
}

export interface ActivitySummary {
  from: number
  to: number
  tasksCreated: number
  acceptedTotal: number
  acceptedByFormat: Partial<Record<ResultFormat, number>>
  discardedTotal: number
  voiceCommands: number
  runsFinished: number
  runsFailed: number
  /**
   * Läufe mit mindestens einem übernommenen Ergebnis — die einzige Grundlage der
   * Zeitersparnis. Ein Lauf, dessen Ergebnisse alle verworfen wurden, hat keine Zeit
   * gespart, egal wie lange er lief.
   */
  acceptedRuns: AcceptedRun[]
}

export interface ActivityRange {
  from: number
  /** exklusiv */
  to: number
}

/**
 * Bilanz für einen Zeitraum.
 *
 * `events` ist bewusst die GESAMTE Liste, nicht nur der Zeitraum: Ein Lauf kann um
 * 23:58 enden und die Übernahme um 00:03 erfolgen. Gezählt wird die Übernahme (die
 * liegt im Zeitraum), die Dauer stammt aber vom zugehörigen Lauf — der wird deshalb
 * über den gesamten Bestand gesucht.
 */
export function summarizeActivity(events: ActivityEvent[], range: ActivityRange): ActivitySummary {
  const inRange = (at: number): boolean => at >= range.from && at < range.to

  const runById = new Map<string, Extract<ActivityEvent, { kind: 'agent-run-finished' }>>()
  for (const e of events) if (e.kind === 'agent-run-finished') runById.set(e.runId, e)

  // Erste Übernahme je Lauf über den GESAMTEN Bestand, nicht nur über den Zeitraum.
  // Ein Lauf darf zwei Ergebnisse liefern (Tabelle plus begleitende Notiz). Werden die
  // an verschiedenen Tagen übernommen, bekäme sonst JEDER dieser Tage die volle
  // Referenzzeit gutgeschrieben — für dieselbe eine Arbeit. Die Gutschrift gehört an
  // den Tag der ersten Übernahme; jede weitere zählt als Ergebnis, nicht als Arbeit.
  const firstAcceptedAt = new Map<string, number>()
  // Prüfzeit je Lauf über ALLE Übernahmen summieren: Ein Lauf mit zwei Ergebnissen
  // wurde auch zweimal geprüft, und beides ist Arbeitszeit des Nutzers.
  const reviewMsByRun = new Map<string, number | null>()
  for (const e of events) {
    if (e.kind !== 'agent-result-accepted') continue
    const known = firstAcceptedAt.get(e.runId)
    if (known === undefined || e.at < known) firstAcceptedAt.set(e.runId, e.at)
    if (typeof e.reviewMs === 'number') {
      reviewMsByRun.set(e.runId, (reviewMsByRun.get(e.runId) ?? 0) + e.reviewMs)
    } else if (!reviewMsByRun.has(e.runId)) {
      reviewMsByRun.set(e.runId, null)
    }
  }

  const summary: ActivitySummary = {
    from: range.from,
    to: range.to,
    tasksCreated: 0,
    acceptedTotal: 0,
    acceptedByFormat: {},
    discardedTotal: 0,
    voiceCommands: 0,
    runsFinished: 0,
    runsFailed: 0,
    acceptedRuns: []
  }

  const acceptedByRun = new Map<string, number>()

  for (const e of events) {
    if (!inRange(e.at)) continue
    switch (e.kind) {
      case 'task-created':
        summary.tasksCreated += e.count
        break
      case 'agent-result-accepted':
        summary.acceptedTotal += 1
        summary.acceptedByFormat[e.format] = (summary.acceptedByFormat[e.format] ?? 0) + 1
        acceptedByRun.set(e.runId, (acceptedByRun.get(e.runId) ?? 0) + 1)
        break
      case 'agent-result-discarded':
        summary.discardedTotal += 1
        break
      case 'voice-command':
        if (e.status === 'ok') summary.voiceCommands += 1
        break
      case 'agent-run-finished':
        summary.runsFinished += 1
        if (e.status !== 'ok') summary.runsFailed += 1
        break
    }
  }

  for (const [runId, accepted] of acceptedByRun) {
    const run = runById.get(runId)
    // Ohne zugehörigen Lauf keine Dauer — dann zählt die Übernahme, aber sie trägt
    // keine Zeitersparnis. Lieber eine Lücke als eine erfundene Dauer.
    if (!run) continue
    // Nur am Tag der ersten Übernahme gutschreiben (siehe oben).
    const first = firstAcceptedAt.get(runId)
    if (first === undefined || !inRange(first)) continue
    const review = reviewMsByRun.get(runId) ?? null
    // Laufbeginn rückwärts aus Ende minus Dauer — der Ledger speichert kein Startdatum.
    const startedAt = run.at - run.durationMs
    summary.acceptedRuns.push({
      runId,
      activityType: run.activityType,
      durationMs: run.durationMs,
      activeMs: activeTimeOf({ instructionMs: run.instructionMs, reviewMs: review ?? undefined }),
      elapsedMs: Math.max(0, first - startedAt),
      accepted
    })
  }

  return summary
}

export type ReferenceMinutes = Partial<Record<ActivityType, number>>

export interface SavedTimeLine {
  activityType: ActivityType
  /** Bewertete Läufe dieser Art (übernommen UND mit gemessener Arbeitszeit). */
  runs: number
  /** Referenzzeit des Nutzers: aktive Arbeitszeit von Hand, in Minuten. */
  referenceMinutes: number
  /** Gemessene aktive Arbeitszeit (Auftrag + Prüfung), auf Minuten gerundet. */
  activeMinutes: number
  /** Rohwert, damit die Karte bei unter einer Minute nicht „0 min" schreibt. */
  activeMs: number
  /** Durchlaufzeit des Agenten — Kontext neben der Rechnung, nie im Abzug. */
  runtimeMinutes: number
  runtimeMs: number
  /** Von der Auftragserteilung bis zur Übernahme. */
  elapsedMinutes: number
  elapsedMs: number
  savedMinutes: number
}

export interface SavedTime {
  totalMinutes: number
  lines: SavedTimeLine[]
  /** Arten, für die Läufe vorliegen, aber keine Referenzzeit hinterlegt ist. */
  unpricedTypes: ActivityType[]
  /**
   * Läufe, deren aktive Arbeitszeit nicht gemessen wurde (ältere Läufe). Sie bleiben
   * unbewertet und werden gezählt, damit die Karte den Unterschied zwischen „nichts
   * gespart" und „nicht gemessen" benennen kann.
   */
  unmeasuredRuns: number
}

/**
 * Geschätzte Zeitersparnis.
 *
 * Grundregel des Entwurfs: Die Zahl darf NUR auf einer vom Nutzer selbst eingetragenen
 * Vergleichsdauer beruhen. Ohne Referenzzeit für eine Art wird für diese Art nichts
 * behauptet — sie taucht als `unpricedTypes` auf, damit die Karte den Unterschied
 * zwischen „null gespart" und „nicht bewertbar" benennen kann.
 *
 * Abgezogen wird die reine Laufzeit. Das Formulieren des Auftrags und das Prüfen des
 * Ergebnisses stecken NICHT darin — deshalb nennt die Karte ihre Grundlage offen,
 * statt die Zahl wie eine Messung aussehen zu lassen.
 */
export function estimateSavedMinutes(summary: ActivitySummary, reference: ReferenceMinutes): SavedTime {
  const byType = new Map<ActivityType, {
    runs: number; activeMs: number; runtimeMs: number; elapsedMs: number; saved: number
  }>()
  let unmeasuredRuns = 0

  for (const run of summary.acceptedRuns) {
    // Ohne gemessene Arbeitszeit keine Bewertung. Eine 0 anzunehmen hieße, die volle
    // Referenzzeit als Ersparnis auszuweisen — die unehrlichste aller Möglichkeiten.
    if (run.activeMs === null) {
      unmeasuredRuns += 1
      continue
    }
    const ref = reference[run.activityType]
    const bucket = byType.get(run.activityType)
      ?? { runs: 0, activeMs: 0, runtimeMs: 0, elapsedMs: 0, saved: 0 }
    bucket.runs += 1
    bucket.activeMs += run.activeMs
    bucket.runtimeMs += run.durationMs
    bucket.elapsedMs += run.elapsedMs
    if (typeof ref === 'number' && ref > 0) {
      // Abgezogen wird die AKTIVE Zeit, nicht die Laufzeit: Wer während des Laufs etwas
      // anderes erledigt, hat diese Minuten nicht aufgewendet. Nie negativ — ein Vorgang,
      // der länger dauert als von Hand, hat nichts gespart, aber auch nichts gekostet.
      bucket.saved += Math.max(0, ref - run.activeMs / 60_000)
    }
    byType.set(run.activityType, bucket)
  }

  const lines: SavedTimeLine[] = []
  const unpriced: ActivityType[] = []
  for (const type of ACTIVITY_TYPES) {
    const bucket = byType.get(type)
    if (!bucket) continue
    const ref = reference[type]
    if (typeof ref !== 'number' || ref <= 0) {
      unpriced.push(type)
      continue
    }
    lines.push({
      activityType: type,
      runs: bucket.runs,
      referenceMinutes: ref,
      activeMinutes: Math.round(bucket.activeMs / 60_000),
      activeMs: bucket.activeMs,
      runtimeMinutes: Math.round(bucket.runtimeMs / 60_000),
      runtimeMs: bucket.runtimeMs,
      elapsedMinutes: Math.round(bucket.elapsedMs / 60_000),
      elapsedMs: bucket.elapsedMs,
      savedMinutes: Math.round(bucket.saved)
    })
  }

  return {
    totalMinutes: lines.reduce((sum, line) => sum + line.savedMinutes, 0),
    lines,
    unpricedTypes: unpriced,
    unmeasuredRuns
  }
}

/**
 * Was die Statusleiste anzeigt — als Entscheidung, nicht als fertiger Text: Die
 * Übersetzung gehört in den Renderer, die Regel gehört hierher und ist so prüfbar.
 *
 * Rangfolge: Minuten schlagen Zähler, Übernahmen schlagen Aufgaben. `none` heißt
 * „nichts zu sagen" — dann steht in der Leiste nichts, statt einer Null. Eine Null ist
 * eine Aussage über einen Tag, an dem noch gar nichts passiert ist.
 */
export type ImpactBadge =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'accepted'; count: number }
  | { kind: 'tasks'; count: number }
  | { kind: 'none' }

export function impactBadge(summary: ActivitySummary, saved: SavedTime): ImpactBadge {
  if (saved.totalMinutes > 0) return { kind: 'minutes', minutes: saved.totalMinutes }
  if (summary.acceptedTotal > 0) return { kind: 'accepted', count: summary.acceptedTotal }
  if (summary.tasksCreated > 0) return { kind: 'tasks', count: summary.tasksCreated }
  return { kind: 'none' }
}

/** Tagesgrenzen in der LOKALEN Zeitzone — ein Arbeitstag endet nicht um 02:00 UTC. */
export function localDayRange(nowMs: number): ActivityRange {
  const start = new Date(nowMs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime())
  end.setDate(end.getDate() + 1)
  return { from: start.getTime(), to: end.getTime() }
}
