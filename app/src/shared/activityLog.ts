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
export type ActivityType = 'table-merge' | 'document' | 'summary' | 'web-research' | 'email-tasks' | 'other'

export const ACTIVITY_TYPES: ActivityType[] = ['table-merge', 'document', 'summary', 'web-research', 'email-tasks', 'other']

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
      /** Modell des Laufs (lokaler Tag oder `<provider>/<modell>`). Macht Läufe vergleichbar. */
      model?: string
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
      /**
       * Wartezeit AM BILDSCHIRM während des Laufs (Fenster im Vordergrund). Nur EINMAL
       * je Lauf gesetzt — sie gehört dem Lauf, nicht dem einzelnen Ergebnis.
       *
       * Erst damit taucht die Modellwahl in der Zahl auf: Wer vierzehn Minuten vor dem
       * Bildschirm wartet, hat diese Zeit verloren; wer wegklickt, nicht.
       */
      waitingMs?: number
    }
  | {
      at: number
      kind: 'agent-result-discarded'
      runId: string
      format: ResultFormat
      reviewMs?: number
      waitingMs?: number
    }
  | {
      /**
       * Aufgabenextraktion aus Mails. Kein Agent-Lauf: Es gibt keine Übernahme, die
       * Aufgaben entstehen mit der Notiz. Gezählt wird ein Durchgang, der Aufgaben
       * gefunden hat — mit Modell, Laufzeit und Wartezeit am Bildschirm.
       */
      at: number
      kind: 'email-tasks-extracted'
      /** Opaker Anker, damit der Renderer NUR die Vordergrundzeit nachtragen kann. */
      id: string
      emails: number
      tasks: number
      durationMs: number
      model?: string
      waitingMs?: number
    }
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
  'email-tasks-extracted',
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
  if (e.kind === 'email-tasks-extracted') {
    // Vollständig prüfen: Eine von Hand beschädigte Zeile ohne `emails` rutschte sonst
    // durch und erzeugte beim Summieren NaN — die Tagesbilanz wäre danach unlesbar.
    const zahl = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0
    if (!zahl(e.emails) || !zahl(e.tasks) || !zahl(e.durationMs)) return false
    if (e.waitingMs !== undefined && !zahl(e.waitingMs)) return false
    if (e.model !== undefined && typeof e.model !== 'string') return false
    return typeof e.id === 'string'
  }
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
  /** Modell des Laufs — erst damit lassen sich Läufe vergleichen. */
  model?: string
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
  /** Aufgaben, die aus Mails erkannt wurden (eigener Weg, ohne Übernahme-Schritt). */
  emailTasks: number
  /** Mails, die dafür analysiert wurden — ohne sie ist die Aufgabenzahl nicht einzuordnen. */
  emailsAnalyzed: number
  emailRuns: number
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
  // Vordergrundzeit gehört dem LAUF, nicht dem einzelnen Ergebnis: höchstens einmal je Lauf.
  const foregroundMsByRun = new Map<string, number>()
  for (const e of events) {
    // BEIDE Entscheidungen zählen. Wer ein Ergebnis prüft und verwirft, hat gearbeitet —
    // und weil die Zeiten an der ERSTEN Entscheidung hängen, lägen sie bei „erst
    // verwerfen, dann übernehmen" sonst nur am verworfenen Ereignis. Der übernommene
    // Lauf sähe dadurch günstiger aus, als er war.
    if (e.kind !== 'agent-result-accepted' && e.kind !== 'agent-result-discarded') continue
    if (e.kind === 'agent-result-accepted') {
      const known = firstAcceptedAt.get(e.runId)
      if (known === undefined || e.at < known) firstAcceptedAt.set(e.runId, e.at)
    }
    if (typeof e.reviewMs === 'number') {
      reviewMsByRun.set(e.runId, (reviewMsByRun.get(e.runId) ?? 0) + e.reviewMs)
    } else if (!reviewMsByRun.has(e.runId)) {
      reviewMsByRun.set(e.runId, null)
    }
    if (typeof e.waitingMs === 'number' && !foregroundMsByRun.has(e.runId)) {
      foregroundMsByRun.set(e.runId, e.waitingMs)
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
    emailTasks: 0,
    emailsAnalyzed: 0,
    emailRuns: 0,
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
      case 'email-tasks-extracted':
        summary.emailTasks += e.tasks
        summary.emailsAnalyzed += e.emails
        summary.emailRuns += 1
        // Ein Durchgang, der Aufgaben gefunden hat, ist ein bewertbarer Vorgang: Er
        // ersetzt das Durchsehen der Mails und das Herausschreiben von Hand. Eine
        // Übernahme gibt es hier nicht — die Aufgaben entstehen mit der Notiz.
        if (e.tasks > 0) {
          summary.acceptedRuns.push({
            runId: `mail-${e.at}`,
            activityType: 'email-tasks',
            model: e.model,
            durationMs: e.durationMs,
            activeMs: typeof e.waitingMs === 'number' ? e.waitingMs : null,
            elapsedMs: e.durationMs,
            accepted: e.tasks
          })
        }
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
      model: run.model,
      durationMs: run.durationMs,
      activeMs: activeTimeOf({
        instructionMs: run.instructionMs,
        reviewMs: review ?? undefined,
        waitingMs: foregroundMsByRun.get(runId)
      }),
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
  /** Modelle, mit denen diese Vorgänge liefen — nach Häufigkeit, ohne Dopplungen. */
  models: string[]
  savedMinutes: number
}

export interface ModelComparisonRow {
  activityType: ActivityType
  model: string
  runs: number
  /** Median der aktiven Zeit je Vorgang — robuster als der Mittelwert bei wenigen Läufen. */
  medianActiveMinutes: number
  /** Rohwert, damit ein Sekunden-Vorgang nicht als „0 min" erscheint. */
  medianActiveMs: number
  meanActiveMinutes: number
  medianRuntimeMinutes: number
  medianRuntimeMs: number
}

function median(werte: number[]): number {
  if (werte.length === 0) return 0
  const sortiert = [...werte].sort((a, b) => a - b)
  const mitte = Math.floor(sortiert.length / 2)
  return sortiert.length % 2 === 1 ? sortiert[mitte] : (sortiert[mitte - 1] + sortiert[mitte]) / 2
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
  /**
   * Je Tätigkeitsart und Modell, absteigend nach Anzahl. Nur damit lassen sich zwei
   * Modelle wirklich gegeneinander lesen — eine zusammengefasste Zeile mit beiden
   * Namen sagt über keines von beiden etwas aus.
   */
  byModel: ModelComparisonRow[]
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
    models: Map<string, number>
  }>()
  let unmeasuredRuns = 0
  const perModel = new Map<string, { activityType: ActivityType; model: string; active: number[]; runtime: number[] }>()

  for (const run of summary.acceptedRuns) {
    // Ohne gemessene Arbeitszeit keine Bewertung. Eine 0 anzunehmen hieße, die volle
    // Referenzzeit als Ersparnis auszuweisen — die unehrlichste aller Möglichkeiten.
    if (run.activeMs === null) {
      unmeasuredRuns += 1
      continue
    }
    const ref = reference[run.activityType]
    const bucket = byType.get(run.activityType)
      ?? { runs: 0, activeMs: 0, runtimeMs: 0, elapsedMs: 0, saved: 0, models: new Map<string, number>() }
    bucket.runs += 1
    bucket.activeMs += run.activeMs
    bucket.runtimeMs += run.durationMs
    bucket.elapsedMs += run.elapsedMs
    if (run.model) {
      bucket.models.set(run.model, (bucket.models.get(run.model) ?? 0) + 1)
      const key = `${run.activityType}\u0000${run.model}`
      const roh = perModel.get(key) ?? { activityType: run.activityType, model: run.model, active: [], runtime: [] }
      roh.active.push(run.activeMs)
      roh.runtime.push(run.durationMs)
      perModel.set(key, roh)
    }
    if (typeof ref === 'number' && ref > 0) {
      // Abgezogen wird die AKTIVE Zeit, nicht die Laufzeit: Wer während des Laufs etwas
      // anderes erledigt, hat diese Minuten nicht aufgewendet.
      //
      // BEWUSST NICHT bei null gekappt: Ein Vorgang, der länger dauert als von Hand,
      // ist ein Verlust und muss als Verlust dastehen. Die Kappung machte die Kennzahl
      // systematisch positiv — als Effizienznachweis wäre sie damit wertlos, weil sie
      // nur gewinnen und nie verlieren kann.
      bucket.saved += ref - run.activeMs / 60_000
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
      models: [...bucket.models.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
      savedMinutes: Math.round(bucket.saved)
    })
  }

  const byModel: ModelComparisonRow[] = [...perModel.values()]
    .map(roh => ({
      activityType: roh.activityType,
      model: roh.model,
      runs: roh.active.length,
      medianActiveMinutes: Math.round(median(roh.active) / 60_000),
      medianActiveMs: median(roh.active),
      meanActiveMinutes: Math.round(roh.active.reduce((a, b) => a + b, 0) / roh.active.length / 60_000),
      medianRuntimeMinutes: Math.round(median(roh.runtime) / 60_000),
      medianRuntimeMs: median(roh.runtime)
    }))
    .sort((a, b) => b.runs - a.runs || a.model.localeCompare(b.model))

  return {
    totalMinutes: lines.reduce((sum, line) => sum + line.savedMinutes, 0),
    lines,
    unpricedTypes: unpriced,
    unmeasuredRuns,
    byModel
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
  // Auch ein Minus wird gezeigt. Eine Anzeige, die nur gewinnen kann, glaubt niemand.
  if (saved.lines.length > 0 && saved.totalMinutes !== 0) {
    return { kind: 'minutes', minutes: saved.totalMinutes }
  }
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
