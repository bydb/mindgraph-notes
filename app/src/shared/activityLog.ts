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
import { isRunCallTotals, type RunCallTotals } from './llmTelemetry'

/**
 * Tätigkeitsart eines Agent-Laufs. Wird aus der WERKZEUGFOLGE abgeleitet, nie aus Text.
 *
 * Ehrliche Grenze: Aus `table-merge` wird nie „Angebotsvergleich" — diese Bezeichnung
 * ist ohne Inhaltskenntnis nicht ableitbar. Wer sie lesen will, vergibt sie selbst,
 * indem er für diese Art eine Referenzzeit hinterlegt.
 */
export type ActivityType = 'table-merge' | 'document' | 'summary' | 'web-research' | 'email-tasks' | 'other'

export const ACTIVITY_TYPES: ActivityType[] = ['table-merge', 'document', 'summary', 'web-research', 'email-tasks', 'other']

/**
 * Vorgangsarten aus Plugins (Paket 2 der Arbeitsbilanz, docs/codex-collab/
 * modell-leistung-demo-review.md). Anders als Agent-Läufe haben sie keine Übernahme,
 * sondern einen NACHWEISBAREN Abschluss an der Main-Grenze: Speicherdialog erfolgreich,
 * WordPress hat geantwortet, Nutzer hat „verwendet" geklickt. Das Etikett reicht nur so
 * weit wie der Nachweis — „gespeichert" ist nicht „gedruckt", „verwendet" ist nicht
 * „veröffentlicht".
 */
export type JobType = 'attendance-list' | 'wp-post' | 'ig-caption'
export const JOB_TYPES: JobType[] = ['attendance-list', 'wp-post', 'ig-caption']
export type JobOutcome = 'saved' | 'draft' | 'published' | 'used'
export const JOB_OUTCOMES: JobOutcome[] = ['saved', 'draft', 'published', 'used']
/** Was ein Vorgang vorbereitet: Marketing liefert zwei Kanäle (wp-post + ig-caption) aus EINER Vorbereitung. */
export type JobKind = 'marketing' | 'attendance-list'
export const JOB_KINDS: JobKind[] = ['marketing', 'attendance-list']
/** Welche Kanäle eine Vorgangsart abschließen kann — in dieser Reihenfolge wird Aufwand zugeordnet. */
export const JOB_KIND_CHANNELS: Record<JobKind, JobType[]> = {
  marketing: ['wp-post', 'ig-caption'],
  'attendance-list': ['attendance-list']
}

/** Alles, wofür eine Referenzzeit hinterlegt werden kann. */
export type ValuedType = ActivityType | JobType
export const VALUED_TYPES: ValuedType[] = [...ACTIVITY_TYPES, ...JOB_TYPES]
export function isJobType(type: ValuedType): type is JobType {
  return (JOB_TYPES as string[]).includes(type)
}

/**
 * Stabile, inhaltsfreie Kennung aus Teilen (FNV-1a, zweimal mit verschiedenem Start).
 * Für die Teilnehmerliste: gleiche Veranstaltung, gleiche Termine, gleicher Tag = derselbe
 * Vorgang. Ein zweiter Export am selben Tag ist keine zweite Arbeit; am Folgetag (neue
 * Anmeldungen) schon. Ins Protokoll gelangt nur der Hash, nie der Titel.
 */
export function stableJobId(parts: string[]): string {
  const fnv = (seed: number): string => {
    let h = seed >>> 0
    const text = parts.join('\u0000')
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }
  return fnv(2166136261) + fnv(0x9e3779b9)
}

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
      /**
       * Verbrauch des Laufs: Aufrufe, Token, Rechenzeit, Cloud-Kosten — summiert über alle
       * Modellaufrufe mit dieser runId (shared/llmTelemetry.ts summarizeRunCalls). Fehlt bei
       * Läufen vor dieser Messung und bei Läufen ohne einen einzigen Modellaufruf.
       */
      llm?: RunCallTotals
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
      /** Verbrauch des Durchlaufs über alle analysierten Mails (siehe agent-run-finished). */
      llm?: RunCallTotals
    }
  | { at: number; kind: 'task-created'; count: number }
  | {
      /**
       * Der Nutzer hat eine Referenzzeit geändert. Die Zeitbilanz bewertet ALLE Läufe mit
       * der heutigen Referenz — wer 30 auf 20 Minuten ändert, schreibt damit rückwirkend
       * jede Woche um. Das ist gewollt, muss aber in der Kurve sichtbar sein
       * (docs/measurement-history-plan.md § 7). null = keine Referenz hinterlegt.
       */
      at: number
      kind: 'reference-changed'
      activityType: ValuedType
      fromMinutes: number | null
      toMinutes: number | null
    }
  | {
      /**
       * Ein Plugin-Vorgang wurde vorbereitet (z.B. Marketing-Texte erzeugt). Geschrieben
       * vom Plugin-Main-Code über die Host-Fähigkeit `activity`; der Kern setzt Zeit und
       * Plugin-ID und hängt den Modellverbrauch der Vorbereitung an (runId = jobId).
       * Ohne folgendes `job-outcome` zählt der Vorgang als „vorbereitet, nicht
       * abgeschlossen" — gezählt, nie mit Minuten bewertet. Generieren ist kein Ergebnis.
       */
      at: number
      kind: 'job-started'
      jobId: string
      jobKind: JobKind
      pluginId: string
      model?: string
      llm?: RunCallTotals
    }
  | {
      /**
       * Nachweisbarer Abschluss eines Kanals. Gutschrift je (jobId, jobType) genau einmal
       * beim ersten Abschluss; ein zweiter Abschluss (Entwurf → veröffentlicht) ändert nur
       * das Etikett. `activeMs` ist die Vordergrundzeit des GANZEN Vorgangs bis zu diesem
       * Abschluss (der Renderer misst, der Kern schreibt) — sie wird je Vorgang einmal
       * abgezogen, nicht je Kanal.
       */
      at: number
      kind: 'job-outcome'
      jobId: string
      jobType: JobType
      outcome: JobOutcome
      pluginId: string
      activeMs?: number
    }
  | {
      /**
       * Vorbereitung aufgegeben: erneut generiert, Generierung gescheitert. Trägt die bis
       * dahin gemessene Vordergrundzeit — ein Fehlversuch ist Arbeitszeit (Regel 6). Zählt
       * nur, wenn der Vorgang KEINEN Abschluss hat; sonst ist die Zeit schon verbucht.
       */
      at: number
      kind: 'job-abandoned'
      jobId: string
      pluginId: string
      activeMs?: number
    }
  | {
      /**
       * Manuelle Zeitkorrektur (Paket 3, Review F02): Der Nutzer trägt Nacharbeit nach, die
       * die App nicht sehen konnte (Excel, Word, Browser). Vertrauensklasse wie die
       * Referenzminuten — eine Angabe des Nutzers, keine Messung; sie wird deshalb überall
       * als „nachgetragen" ausgewiesen. Die Rohmessung bleibt unverändert gespeichert.
       * `targetId` = runId eines Agent-Laufs, id eines Mail-Durchgangs oder jobId eines Vorgangs.
       */
      at: number
      kind: 'time-correction'
      targetId: string
      extraMs: number
      source: 'manual'
    }
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

/**
 * Ein Jahr, wie das Telemetrie-Logbuch (shared/llmTelemetry.ts). Bis 09/2026 waren es 90
 * Tage — die 12-Monats-Ansicht der Messgeschichte zeigte dann Aufrufe für ein Jahr, aber
 * Zeitgewinn nur für ein Quartal, ohne das zu sagen.
 */
export const ACTIVITY_RETENTION_DAYS = 365
/** Obergrenze danach — eine Protokolldatei darf nicht unbegrenzt wachsen. Rund 150 Byte je Eintrag → unter 3 MB. */
export const ACTIVITY_MAX_EVENTS = 20_000

// Jede Art, die isActivityEvent unten prüft, MUSS hier stehen. `reference-changed` fehlte
// von 0.11.3 bis 0.11.4: Der Main-Prozess schrieb das Ereignis, der Ledger warf es beim
// nächsten Lesen weg, und weil Anhängen = lesen → anhängen → schreiben ist, löschte der
// nächste beliebige Eintrag es endgültig aus der Datei. Der Test „kennt jede Art"
// in activityLog.test.ts hält die Liste mit dem Typ zusammen.
const KNOWN_KINDS: ActivityEventKind[] = [
  'agent-run-finished',
  'agent-result-accepted',
  'agent-result-discarded',
  'task-created',
  'email-tasks-extracted',
  'reference-changed',
  'job-started',
  'job-outcome',
  'job-abandoned',
  'time-correction',
  'voice-command'
]

/** Obergrenze je Nachtrag — ein Tippfehler „480" statt „48" soll nicht eine Woche gutschreiben. */
export const MAX_CORRECTION_MS = 8 * 60 * 60_000

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
    if (e.llm !== undefined && !isRunCallTotals(e.llm)) return false
    return typeof e.runId === 'string' && typeof e.durationMs === 'number' && typeof e.activityType === 'string'
  }
  if (e.kind === 'agent-result-accepted' || e.kind === 'agent-result-discarded') {
    return typeof e.runId === 'string' && typeof e.format === 'string'
  }
  if (e.kind === 'task-created') return typeof e.count === 'number'
  if (e.kind === 'reference-changed') {
    const minuten = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)
    return typeof e.activityType === 'string' && minuten(e.fromMinutes) && minuten(e.toMinutes)
  }
  if (e.kind === 'job-started') {
    if (e.llm !== undefined && !isRunCallTotals(e.llm)) return false
    if (e.model !== undefined && typeof e.model !== 'string') return false
    return isJobId(e.jobId) && (JOB_KINDS as string[]).includes(e.jobKind as string) && typeof e.pluginId === 'string'
  }
  if (e.kind === 'time-correction') {
    return typeof e.targetId === 'string' && e.targetId.length > 0 && e.targetId.length <= 200
      && typeof e.extraMs === 'number' && Number.isFinite(e.extraMs) && e.extraMs > 0 && e.extraMs <= MAX_CORRECTION_MS
      && e.source === 'manual'
  }
  if (e.kind === 'job-abandoned') {
    if (e.activeMs !== undefined && !(typeof e.activeMs === 'number' && Number.isFinite(e.activeMs) && e.activeMs >= 0)) return false
    return isJobId(e.jobId) && typeof e.pluginId === 'string'
  }
  if (e.kind === 'job-outcome') {
    if (e.activeMs !== undefined && !(typeof e.activeMs === 'number' && Number.isFinite(e.activeMs) && e.activeMs >= 0)) return false
    return isJobId(e.jobId)
      && (JOB_TYPES as string[]).includes(e.jobType as string)
      && (JOB_OUTCOMES as string[]).includes(e.outcome as string)
      && typeof e.pluginId === 'string'
  }
  if (e.kind === 'email-tasks-extracted') {
    // Vollständig prüfen: Eine von Hand beschädigte Zeile ohne `emails` rutschte sonst
    // durch und erzeugte beim Summieren NaN — die Tagesbilanz wäre danach unlesbar.
    const zahl = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0
    if (!zahl(e.emails) || !zahl(e.tasks) || !zahl(e.durationMs)) return false
    if (e.waitingMs !== undefined && !zahl(e.waitingMs)) return false
    if (e.model !== undefined && typeof e.model !== 'string') return false
    if (e.llm !== undefined && !isRunCallTotals(e.llm)) return false
    return typeof e.id === 'string'
  }
  return typeof e.status === 'string'
}

/** Kennung eines Vorgangs: kurz, druckbar, ohne Inhalte. Ein Titel wäre bereits Inhalt. */
export function isJobId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{4,64}$/.test(value)
}

/**
 * Was ein Plugin an den Kern meldet — und was der Kern daraus macht. Das Plugin liefert
 * nur die fachlichen Felder; Zeit und Plugin-ID setzt der Kern, damit ein Plugin weder
 * Geschichte rückdatieren noch für ein anderes Plugin schreiben kann. `null` = ungültig.
 */
export type PluginActivityEntry =
  | { kind: 'job-started'; jobId: string; jobKind: JobKind; model?: string }
  | { kind: 'job-outcome'; jobId: string; jobType: JobType; outcome: JobOutcome; activeMs?: number }
  | { kind: 'job-abandoned'; jobId: string; activeMs?: number }

export function pluginActivityEvent(pluginId: string, entry: unknown, nowMs: number): ActivityEvent | null {
  if (!entry || typeof entry !== 'object' || !pluginId) return null
  const e = entry as Record<string, unknown>
  if (e.kind === 'job-started') {
    const candidate = { at: nowMs, kind: 'job-started', jobId: e.jobId, jobKind: e.jobKind, pluginId, ...(typeof e.model === 'string' ? { model: e.model } : {}) }
    return isActivityEvent(candidate) ? candidate : null
  }
  if (e.kind === 'job-outcome') {
    const candidate = {
      at: nowMs, kind: 'job-outcome', jobId: e.jobId, jobType: e.jobType, outcome: e.outcome, pluginId,
      ...(typeof e.activeMs === 'number' ? { activeMs: Math.max(0, Math.round(e.activeMs)) } : {})
    }
    return isActivityEvent(candidate) ? candidate : null
  }
  if (e.kind === 'job-abandoned') {
    const candidate = {
      at: nowMs, kind: 'job-abandoned', jobId: e.jobId, pluginId,
      ...(typeof e.activeMs === 'number' ? { activeMs: Math.max(0, Math.round(e.activeMs)) } : {})
    }
    return isActivityEvent(candidate) ? candidate : null
  }
  return null
}

/**
 * Kennt das Protokoll das Ziel einer Zeitkorrektur? Nur Läufe, Mail-Durchgänge und Vorgänge,
 * die es gibt, dürfen Nacharbeit bekommen — sonst ließe sich Zeit an eine erfundene Kennung
 * hängen, die nie bewertet wird, aber die Datei füllt.
 */
export function isCorrectionTargetKnown(events: ActivityEvent[], targetId: string): boolean {
  return events.some(e =>
    (e.kind === 'agent-run-finished' && e.runId === targetId)
    || (e.kind === 'email-tasks-extracted' && e.id === targetId)
    || (e.kind === 'job-outcome' && e.jobId === targetId)
    || (e.kind === 'job-abandoned' && e.jobId === targetId))
}

/**
 * Rohmessung plus Nachtrag. Ohne Messung bleibt der Lauf unbewertet — auch mit Nachtrag
 * (Review F13): Das Formular fragt nach ZUSÄTZLICHER Nacharbeit, nicht nach der gesamten
 * Arbeitszeit. Ein Nachtrag auf eine unbekannte Basis würde die Lücke durch eine kleine
 * Zahl ersetzen und die volle Referenz als Ersparnis ausweisen.
 */
function withCorrection(activeMs: number | null, correctedMs: number): number | null {
  if (activeMs === null || correctedMs <= 0) return activeMs
  return activeMs + correctedMs
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
  /** Zeitpunkt der (ersten) Übernahme bzw. des Abschlusses — für Listen und Nachträge. */
  at: number
  activityType: ValuedType
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
  /** Manuell nachgetragene Zeit (in activeMs bereits enthalten). */
  correctedMs?: number
}

/**
 * Ein Lauf ohne übernommenes Ergebnis: verworfen, gescheitert, abgebrochen oder nie
 * entschieden. Er hat keine Zeit gespart, aber Zeit gekostet — Auftrag formulieren,
 * am Bildschirm warten, Ergebnis prüfen und verwerfen. Bis 09/2026 fiel diese Zeit
 * aus der Bilanz; die Kennzahl war damit systematisch zu hoch, weil sie nur die
 * geglückten Versuche sah.
 */
export interface DiscardedRun {
  runId: string
  at: number
  activityType: ActivityType
  model?: string
  /** Aktive Zeit wie bei AcceptedRun; `null` = nicht gemessen, wird gezählt, nie bewertet. */
  activeMs: number | null
  /** `discarded` heißt auch: Lauf beendet, kein Ergebnis je übernommen. */
  reason: 'discarded' | 'failed' | 'aborted'
  correctedMs?: number
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
  /**
   * Läufe, die im Zeitraum endeten und deren Ergebnis NIE übernommen wurde. Sie gehen
   * mit ihrer aktiven Zeit als Abzug in die Zeitbilanz — Fehlversuche sind Arbeitszeit.
   * Zugeordnet zum Tag des Lauf-Endes, nicht zum Tag des Verwerfens.
   */
  discardedRuns: DiscardedRun[]
  /**
   * Plugin-Vorgänge im Zeitraum. `completed` zählt je (jobId, jobType) EINMAL, mit dem
   * jeweils letzten Etikett; `prepared` sind Vorbereitungen ohne Abschluss und ohne
   * Aufgabe. Die Zeitbewertung läuft über `jobRuns` — auf VORGANGSEBENE, nicht je Kanal.
   */
  jobs: JobsSummary
  jobRuns: JobRun[]
}

export interface JobsSummary {
  completed: Partial<Record<JobType, Partial<Record<JobOutcome, number>>>>
  completedTotal: number
  prepared: number
  /** Aufgegebene Vorbereitungen (erneut generiert, gescheitert) — Fehlversuche mit Zeit. */
  abandoned: number
}

/**
 * Ein Vorgang als Bewertungseinheit. Anders als ein Kanal-Lauf trägt er ALLE im Zeitraum
 * erstmals abgeschlossenen Kanäle und die aktive Zeit des ganzen Vorgangs EINMAL:
 * gespart = Σ Referenz(bepreiste Kanäle) − aktive Zeit. Damit kann die gemeinsame
 * Vorbereitung nicht mehr verschwinden, wenn dem ersten Kanal die Referenz fehlt
 * (Review F10) — sie wird gegen die Kanäle gerechnet, die eine Referenz haben.
 */
export interface JobRun {
  jobId: string
  at: number
  jobKind: JobKind
  /** Im Zeitraum erstmals abgeschlossene Kanäle. Leer = aufgegeben (abandoned) ohne Abschluss. */
  channels: JobType[]
  /** Aktive Zeit des Vorgangs: Maximum aus Abschlüssen und Aufgeben; null = nicht gemessen. */
  activeMs: number | null
  /**
   * Kanäle, die VOR dem Zeitraum erstmals abgeschlossen wurden. Ob die Zeit dort schon
   * verbucht ist, hängt von der Referenz ab (nur ein bepreister Kanal verbucht) — das
   * entscheidet estimateSavedMinutes, nicht die Zusammenfassung (Review F12).
   */
  earlierChannels: JobType[]
  abandoned: boolean
  model?: string
  correctedMs?: number
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

  // Nachträge je Ziel über den GESAMTEN Bestand — sie gehören zum Lauf, nicht zum Tag der Eingabe.
  const correctionByTarget = new Map<string, number>()
  for (const e of events) {
    if (e.kind === 'time-correction') correctionByTarget.set(e.targetId, (correctionByTarget.get(e.targetId) ?? 0) + e.extraMs)
  }
  const corrected = (targetId: string): number => correctionByTarget.get(targetId) ?? 0

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
    acceptedRuns: [],
    discardedRuns: [],
    jobs: { completed: {}, completedTotal: 0, prepared: 0, abandoned: 0 },
    jobRuns: []
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
        // Über den GESAMTEN Bestand geprüft: Eine Übernahme am Folgetag macht aus dem
        // Lauf keinen Fehlversuch. Alles andere — verworfen, gescheitert, abgebrochen,
        // nie entschieden — hat Arbeitszeit gekostet und nichts geliefert.
        if (!firstAcceptedAt.has(e.runId)) {
          summary.discardedRuns.push({
            runId: e.runId,
            at: e.at,
            activityType: e.activityType,
            model: e.model,
            activeMs: withCorrection(activeTimeOf({
              instructionMs: e.instructionMs,
              reviewMs: reviewMsByRun.get(e.runId) ?? undefined,
              waitingMs: foregroundMsByRun.get(e.runId)
            }), corrected(e.runId)),
            reason: e.status === 'ok' ? 'discarded' : e.status,
            ...(corrected(e.runId) > 0 ? { correctedMs: corrected(e.runId) } : {})
          })
        }
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
            runId: e.id,
            at: e.at,
            activityType: 'email-tasks',
            model: e.model,
            durationMs: e.durationMs,
            activeMs: withCorrection(typeof e.waitingMs === 'number' ? e.waitingMs : null, corrected(e.id)),
            elapsedMs: e.durationMs,
            accepted: e.tasks,
            ...(corrected(e.id) > 0 ? { correctedMs: corrected(e.id) } : {})
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
      at: first,
      activityType: run.activityType,
      model: run.model,
      durationMs: run.durationMs,
      activeMs: withCorrection(activeTimeOf({
        instructionMs: run.instructionMs,
        reviewMs: review ?? undefined,
        waitingMs: foregroundMsByRun.get(runId)
      }), corrected(runId)),
      elapsedMs: Math.max(0, first - startedAt),
      accepted,
      ...(corrected(runId) > 0 ? { correctedMs: corrected(runId) } : {})
    })
  }

  summarizeJobs(events, range, summary, corrected)
  return summary
}

/**
 * Plugin-Vorgänge: Gutschrift je (jobId, jobType) genau einmal, beim ersten Abschluss.
 * Die Zeit gehört dem VORGANG: Sie wird im Zeitraum des ersten Abschlusses verbucht;
 * ein späterer Kanal am Folgetag bringt seine Referenz, aber keinen zweiten Abzug.
 * Eine aufgegebene Vorbereitung ohne jeden Abschluss ist ein Fehlversuch mit Zeit.
 */
function summarizeJobs(events: ActivityEvent[], range: ActivityRange, summary: ActivitySummary, corrected: (id: string) => number): void {
  const inRange = (at: number): boolean => at >= range.from && at < range.to
  type Outcome = Extract<ActivityEvent, { kind: 'job-outcome' }>
  const startById = new Map<string, Extract<ActivityEvent, { kind: 'job-started' }>>()
  const abandonedById = new Map<string, Extract<ActivityEvent, { kind: 'job-abandoned' }>>()
  const outcomesByJob = new Map<string, Outcome[]>()
  for (const e of events) {
    if (e.kind === 'job-started') startById.set(e.jobId, e)
    if (e.kind === 'job-abandoned') abandonedById.set(e.jobId, e)
    if (e.kind === 'job-outcome') outcomesByJob.set(e.jobId, [...(outcomesByJob.get(e.jobId) ?? []), e])
  }
  // Vorgangsart aus dem Kanal ableiten, wenn kein job-started vorliegt (Teilnehmerliste).
  const kindOf = (jobId: string, channel?: JobType): JobKind =>
    startById.get(jobId)?.jobKind ?? (channel === 'attendance-list' ? 'attendance-list' : 'marketing')

  for (const [jobId, start] of startById) {
    if (outcomesByJob.has(jobId)) continue
    const abandoned = abandonedById.get(jobId)
    if (abandoned) {
      if (!inRange(abandoned.at)) continue
      summary.jobs.abandoned += 1
      summary.jobRuns.push({
        jobId, at: abandoned.at, jobKind: start.jobKind, channels: [], abandoned: true, earlierChannels: [],
        activeMs: withCorrection(typeof abandoned.activeMs === 'number' ? abandoned.activeMs : null, corrected(jobId)),
        model: start.model,
        ...(corrected(jobId) > 0 ? { correctedMs: corrected(jobId) } : {})
      })
    } else if (inRange(start.at)) {
      summary.jobs.prepared += 1
    }
  }
  for (const [jobId, list] of outcomesByJob) {
    const sorted = [...list].sort((a, b) => a.at - b.at)
    // Die Zeit des Vorgangs ist das Maximum ALLER kumulativen Messungen — auch die des
    // Aufgebens nach einem Teilerfolg (Review F16): Wer nach dem WordPress-Abschluss noch
    // vier Minuten an Instagram scheitert, hat diese Minuten gearbeitet.
    const abandonedMs = abandonedById.get(jobId)?.activeMs
    const measured = [...sorted.filter(o => typeof o.activeMs === 'number').map(o => o.activeMs as number),
      ...(typeof abandonedMs === 'number' ? [abandonedMs] : [])]
    const jobActiveMs = measured.length ? Math.max(...measured) : null
    const start = startById.get(jobId)
    const firstByType = new Map<JobType, Outcome>()
    const latestByType = new Map<JobType, Outcome>()
    for (const o of sorted) {
      if (!firstByType.has(o.jobType)) firstByType.set(o.jobType, o)
      latestByType.set(o.jobType, o)
    }
    const channels: JobType[] = []
    const earlierChannels: JobType[] = []
    for (const [type, first] of firstByType) {
      if (first.at < range.from) earlierChannels.push(type)
      if (!inRange(first.at)) continue
      channels.push(type)
      const byType = summary.jobs.completed[type] ?? {}
      const label = latestByType.get(type)!.outcome
      byType[label] = (byType[label] ?? 0) + 1
      summary.jobs.completed[type] = byType
      summary.jobs.completedTotal += 1
    }
    if (channels.length === 0) continue
    summary.jobRuns.push({
      jobId,
      at: sorted[0].at,
      jobKind: kindOf(jobId, channels[0]),
      channels,
      // Ein Nachtrag gehört zum Vorgang; verbucht wird er, wo die Zeit verbucht wird.
      activeMs: withCorrection(jobActiveMs, corrected(jobId)),
      earlierChannels,
      abandoned: false,
      model: start?.model,
      ...(corrected(jobId) > 0 ? { correctedMs: corrected(jobId) } : {})
    })
  }
}

export type ReferenceMinutes = Partial<Record<ValuedType, number>>
/**
 * Woher eine Referenzzeit stammt: geschätzt (Default) oder selbst gestoppt. Die Rechnung
 * ändert sich nicht — aber eine Zahl aus einer Stoppuhr ist eine andere Aussage als eine aus
 * dem Bauch, und die Karte muss sagen, welche von beiden sie gerade verrechnet.
 */
export type ReferenceSource = 'estimated' | 'measured'
export type ReferenceSources = Partial<Record<ValuedType, ReferenceSource>>

export interface SavedTimeLine {
  activityType: ValuedType
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
  /** Fehlversuche dieser Art mit gemessener Zeit — ihr Aufwand steckt bereits in savedMinutes. */
  wastedRuns: number
  wastedMs: number
  wastedMinutes: number
  /** Manuell nachgetragene Zeit dieser Art (in activeMs/wastedMs enthalten) und wie viele Vorgänge sie betrifft. */
  correctedMs: number
  correctedRuns: number
  /** Netto: Referenz je übernommenem Lauf minus aktive Zeit ALLER Läufe dieser Art, auch der Fehlversuche. */
  savedMinutes: number
}

export interface ModelComparisonRow {
  activityType: ValuedType
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
  unpricedTypes: ValuedType[]
  /**
   * Läufe, deren aktive Arbeitszeit nicht gemessen wurde (ältere Läufe). Sie bleiben
   * unbewertet und werden gezählt, damit die Karte den Unterschied zwischen „nichts
   * gespart" und „nicht gemessen" benennen kann.
   */
  unmeasuredRuns: number
  /** Fehlversuche mit Messung und Referenz — ihr Aufwand ist in totalMinutes abgezogen. */
  wastedRuns: number
  /** Vorgänge mit manuellem Nachtrag — die Zahl ist dort keine reine Messung mehr. */
  correctedRuns: number
  correctedMs: number
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
 * Abgezogen wird die AKTIVE Arbeitszeit: Auftrag formulieren, Vordergrundzeit während
 * des Laufs, Ergebnis prüfen. Die Laufzeit des Agenten steht daneben, nie im Abzug.
 * Deshalb nennt die Karte ihre Grundlage offen, statt die Zahl wie eine Messung
 * aussehen zu lassen.
 *
 * Fehlversuche zählen mit: Ein Lauf ohne übernommenes Ergebnis bekommt keine Referenz
 * gutgeschrieben, seine aktive Zeit wird aber abgezogen. Ohne diesen Abzug kann die
 * Kennzahl nur gewinnen — wer dreimal scheitert und einmal trifft, sähe nur den Treffer.
 */
export function estimateSavedMinutes(summary: ActivitySummary, reference: ReferenceMinutes): SavedTime {
  const byType = new Map<ValuedType, {
    runs: number; activeMs: number; runtimeMs: number; elapsedMs: number; saved: number
    wastedRuns: number; wastedMs: number; correctedMs: number; correctedRuns: number
    models: Map<string, number>
  }>()
  const leer = () => ({
    runs: 0, activeMs: 0, runtimeMs: 0, elapsedMs: 0, saved: 0, wastedRuns: 0, wastedMs: 0, correctedMs: 0, correctedRuns: 0,
    models: new Map<string, number>()
  })
  const merkeNachtrag = (bucket: ReturnType<typeof leer>, ms: number | undefined): void => {
    if (ms && ms > 0) { bucket.correctedMs += ms; bucket.correctedRuns += 1 }
  }
  let unmeasuredRuns = 0
  const unpricedJobTypes: ValuedType[] = []
  const perModel = new Map<string, { activityType: ValuedType; model: string; active: number[]; runtime: number[] }>()

  for (const run of summary.acceptedRuns) {
    // Ohne gemessene Arbeitszeit keine Bewertung. Eine 0 anzunehmen hieße, die volle
    // Referenzzeit als Ersparnis auszuweisen — die unehrlichste aller Möglichkeiten.
    if (run.activeMs === null) {
      unmeasuredRuns += 1
      continue
    }
    const ref = reference[run.activityType]
    const bucket = byType.get(run.activityType) ?? leer()
    bucket.runs += 1
    bucket.activeMs += run.activeMs
    merkeNachtrag(bucket, run.correctedMs)
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

  for (const run of summary.discardedRuns) {
    // Dieselbe Regel wie oben: nicht gemessen ist nicht null, sondern gezählt.
    if (run.activeMs === null) {
      unmeasuredRuns += 1
      continue
    }
    const bucket = byType.get(run.activityType) ?? leer()
    bucket.wastedRuns += 1
    bucket.wastedMs += run.activeMs
    merkeNachtrag(bucket, run.correctedMs)
    if (run.model) bucket.models.set(run.model, (bucket.models.get(run.model) ?? 0) + 1)
    // Abzug nur, wo auch eine Gutschrift möglich wäre (Referenz vorhanden). Ohne
    // Referenz würde die Art nur Verluste zeigen und nie Gewinne — sie bleibt
    // „nicht bewertbar", mitsamt ihren Fehlversuchen.
    const ref = reference[run.activityType]
    if (typeof ref === 'number' && ref > 0) bucket.saved -= run.activeMs / 60_000
    byType.set(run.activityType, bucket)
  }

  // Vorgänge: gespart = Σ Referenz(bepreiste Kanäle) − aktive Zeit, je Vorgang EINMAL.
  // Anzeige bleibt je Kanal-Zeile: jede bepreiste Zeile bekommt ihre Referenz-Gutschrift,
  // die aktive Zeit steht bei der ersten bepreisten Zeile. Ohne jede Referenz bleibt der
  // Vorgang „nicht bewertbar" — auch sein Aufwand wird dann nicht abgezogen (wie bei
  // Agent-Läufen ohne Referenz).
  for (const job of summary.jobRuns) {
    const kandidaten = job.abandoned ? JOB_KIND_CHANNELS[job.jobKind] : job.channels
    const bepreist = kandidaten.filter(type => typeof reference[type] === 'number' && (reference[type] as number) > 0)
    if (bepreist.length === 0) {
      for (const type of kandidaten) if (!unpricedJobTypes.includes(type)) unpricedJobTypes.push(type)
      continue
    }
    if (job.activeMs === null) {
      unmeasuredRuns += 1
      continue
    }
    // Zeit nur einmal: verbucht ist sie dort, wo ein BEPREISTER Kanal zuerst abgeschlossen
    // wurde. Ein früherer Kanal ohne Referenz hat nichts verbucht — dann ist sie heute fällig.
    // So stimmt die Summe der Abschnitte mit dem Gesamtzeitraum überein (Review F12).
    const bookedEarlier = job.earlierChannels.some(type => typeof reference[type] === 'number' && (reference[type] as number) > 0)
    const activeMs = bookedEarlier ? 0 : job.activeMs
    const traeger = bepreist[0]
    if (job.abandoned) {
      const bucket = byType.get(traeger) ?? leer()
      bucket.wastedRuns += 1
      bucket.wastedMs += activeMs
      merkeNachtrag(bucket, bookedEarlier ? 0 : job.correctedMs)
      bucket.saved -= activeMs / 60_000
      if (job.model) bucket.models.set(job.model, (bucket.models.get(job.model) ?? 0) + 1)
      byType.set(traeger, bucket)
      continue
    }
    for (const type of bepreist) {
      const bucket = byType.get(type) ?? leer()
      bucket.runs += 1
      bucket.saved += reference[type] as number
      if (job.model) bucket.models.set(job.model, (bucket.models.get(job.model) ?? 0) + 1)
      byType.set(type, bucket)
    }
    const bucket = byType.get(traeger)!
    bucket.activeMs += activeMs
    merkeNachtrag(bucket, bookedEarlier ? 0 : job.correctedMs)
    bucket.saved -= activeMs / 60_000
    if (job.model) {
      const key = `${traeger}\u0000${job.model}`
      const roh = perModel.get(key) ?? { activityType: traeger, model: job.model, active: [], runtime: [] }
      roh.active.push(activeMs)
      roh.runtime.push(0)
      perModel.set(key, roh)
    }
  }

  const lines: SavedTimeLine[] = []
  const unpriced: ValuedType[] = [...unpricedJobTypes]
  for (const type of VALUED_TYPES) {
    const bucket = byType.get(type)
    if (!bucket) continue
    const ref = reference[type]
    if (typeof ref !== 'number' || ref <= 0) {
      if (!unpriced.includes(type)) unpriced.push(type)
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
      wastedRuns: bucket.wastedRuns,
      wastedMs: bucket.wastedMs,
      wastedMinutes: Math.round(bucket.wastedMs / 60_000),
      correctedMs: bucket.correctedMs,
      correctedRuns: bucket.correctedRuns,
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
    wastedRuns: lines.reduce((sum, line) => sum + line.wastedRuns, 0),
    correctedRuns: lines.reduce((sum, line) => sum + line.correctedRuns, 0),
    correctedMs: lines.reduce((sum, line) => sum + line.correctedMs, 0),
    byModel
  }
}

/**
 * Was die Statusleiste anzeigt — als Entscheidung, nicht als fertiger Text: Die
 * Übersetzung gehört in den Renderer, die Regel gehört hierher und ist so prüfbar.
 *
 * Rangfolge: Minuten schlagen Zähler, Übernahmen schlagen Aufgaben, Aufgaben schlagen
 * erkannte Mail-Aufgaben. `none` heißt
 * „nichts zu sagen" — dann steht in der Leiste nichts, statt einer Null. Eine Null ist
 * eine Aussage über einen Tag, an dem noch gar nichts passiert ist.
 */
export type ImpactBadge =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'accepted'; count: number }
  | { kind: 'jobs'; count: number }
  | { kind: 'tasks'; count: number }
  | { kind: 'email-tasks'; count: number }
  | { kind: 'none' }

export function impactBadge(summary: ActivitySummary, saved: SavedTime): ImpactBadge {
  // Auch ein Minus wird gezeigt. Eine Anzeige, die nur gewinnen kann, glaubt niemand.
  if (saved.lines.length > 0 && saved.totalMinutes !== 0) {
    return { kind: 'minutes', minutes: saved.totalMinutes }
  }
  if (summary.acceptedTotal > 0) return { kind: 'accepted', count: summary.acceptedTotal }
  if (summary.jobs.completedTotal > 0) return { kind: 'jobs', count: summary.jobs.completedTotal }
  if (summary.tasksCreated > 0) return { kind: 'tasks', count: summary.tasksCreated }
  // Ohne diesen Rückfall verschwand ein Tag, an dem NUR Mail-Aufgaben erkannt wurden,
  // vollständig aus der Leiste — obwohl gerade das der häufigste Fall ist.
  if (summary.emailTasks > 0) return { kind: 'email-tasks', count: summary.emailTasks }
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
