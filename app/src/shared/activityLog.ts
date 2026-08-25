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
      durationMs: number
      activityType: ActivityType
      resultCount: number
      status: 'ok' | 'failed' | 'aborted'
    }
  | { at: number; kind: 'agent-result-accepted'; runId: string; format: ResultFormat }
  | { at: number; kind: 'agent-result-discarded'; runId: string; format: ResultFormat }
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
  durationMs: number
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
    summary.acceptedRuns.push({
      runId,
      activityType: run.activityType,
      durationMs: run.durationMs,
      accepted
    })
  }

  return summary
}

export type ReferenceMinutes = Partial<Record<ActivityType, number>>

export interface SavedTimeLine {
  activityType: ActivityType
  /** Läufe dieser Art mit übernommenem Ergebnis. */
  runs: number
  referenceMinutes: number
  /** Tatsächliche Laufzeit dieser Läufe, auf ganze Minuten gerundet. */
  durationMinutes: number
  /**
   * Rohe Laufzeit. Nötig, weil ein 15-Sekunden-Lauf auf 0 Minuten rundet und die Karte
   * sonst „abzüglich 0 min Laufzeit" schreibt — das liest sich wie ein Fehler.
   */
  durationMs: number
  savedMinutes: number
}

export interface SavedTime {
  totalMinutes: number
  lines: SavedTimeLine[]
  /** Arten, für die Läufe vorliegen, aber keine Referenzzeit hinterlegt ist. */
  unpricedTypes: ActivityType[]
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
  const byType = new Map<ActivityType, { runs: number; durationMs: number; saved: number }>()

  for (const run of summary.acceptedRuns) {
    const ref = reference[run.activityType]
    const bucket = byType.get(run.activityType) ?? { runs: 0, durationMs: 0, saved: 0 }
    bucket.runs += 1
    bucket.durationMs += run.durationMs
    if (typeof ref === 'number' && ref > 0) {
      // Nie negativ: Ein Lauf, der länger dauert als die Referenzzeit, hat keine Zeit
      // gekostet, die MindGraph zu verantworten hätte — er hat nur nichts gespart.
      bucket.saved += Math.max(0, ref - run.durationMs / 60_000)
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
      durationMinutes: Math.round(bucket.durationMs / 60_000),
      durationMs: bucket.durationMs,
      savedMinutes: Math.round(bucket.saved)
    })
  }

  return {
    totalMinutes: lines.reduce((sum, line) => sum + line.savedMinutes, 0),
    lines,
    unpricedTypes: unpriced
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
