// E-Mail-Decision-Pilot — Labelschema und Prüfung (§3 des Bauplans).
//
// Goldstandard sind MANUELLE Labels, nicht die heutige LLM-Ausgabe. Deren Urteil läuft
// als eigener Vergleichsarm mit (`baseline`) und wird nie als Wahrheit verrechnet —
// sonst misst der Pilot nur, wie gut ein kleines Modell ein großes nachahmt.
//
// Ablage: eine JSONL-Datei pro Datensatz, eine Zeile pro Mail, bewusst AUSSERHALB des
// Repos. Echte Mailinhalte stehen nur im `content`-Feld dieses lokalen Datensatzes;
// in Messberichte und in den Ergebnisspeicher gehen sie nie.

import type { DecisionQuestionId, DecisionResult, NliTriple, QuestionScores } from './types'
import { ABSTAIN_REASONS, DECISION_QUESTIONS, LABEL_SCHEMA_VERSION } from './types'
import type { PolicySignals } from './emailPolicy'
import type { DecisionSignalSource } from './signals'
import { SIGNALS_VERSION, shortHash } from './signals'

export type Ternary = 'yes' | 'no' | 'unclear'
export const TERNARY_VALUES: readonly Ternary[] = ['yes', 'no', 'unclear']

export type LabelField = 'important' | 'needsReply' | 'hasActionOrDate' | 'urgent' | 'safeToSkip'
export const LABEL_FIELDS: readonly LabelField[] = [
  'important',
  'needsReply',
  'hasActionOrDate',
  'urgent',
  'safeToSkip',
]

/** Die drei Felder, deren Ja jedes Überspringen verbietet. */
export const RISK_LABEL_FIELDS: readonly LabelField[] = ['needsReply', 'hasActionOrDate', 'urgent']

export type GoldLabels = Record<LabelField, Ternary>

export type LabelSource = 'real-local' | 'synthetic'

/**
 * Format der Fallkennung: kurzes lokales Pseudonym. Kein `@`, kein Leerzeichen, keine
 * spitzen Klammern — damit kann weder eine Message-ID noch eine Betreffzeile als Kennung
 * durchrutschen und später in einem Bericht stehen.
 */
export const LABEL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/

export interface SignalsMeta {
  /** Version der Signallogik, mit der die Werte entstanden sind (`SIGNALS_VERSION`). */
  signalsVersion: string
  /** Hash der Instruktions-Notiz zum Zeitpunkt der Berechnung (`hashInstruction`). */
  instructionHash: string
}

export interface LabelRecord {
  /** Schemaversion. Ein Datensatz mit fremder Version wird nicht stillschweigend gelesen. */
  schema: string
  /**
   * Lokale, stabile Fallkennung. Sie ist das EINZIGE Feld dieses Datensatzes, das in einen
   * Bericht gelangt, und deshalb auf ein Pseudonym-Format eingeschränkt (`LABEL_ID_PATTERN`):
   * eine Message-ID oder eine Betreffzeile wird abgelehnt, nicht stillschweigend gedruckt.
   */
  id: string
  /**
   * Gruppenschlüssel (Thread/Vorlage) — die Splitgrenze. Er darf inhaltsnah sein (er enthält
   * den normalisierten Betreff) und bleibt deshalb im lokalen Datensatz; in Berichte geht
   * nur seine ANZAHL, nie sein Wert. `stripForReport` entfernt ihn.
   */
  group: string
  /** Empfangszeitpunkt (ISO) für den zeitlichen Nachtest. */
  receivedAt: string
  source: LabelSource
  labels: GoldLabels
  /** Kurze lokale Begründung. Bleibt im Datensatz, nie im Bericht. */
  rationale?: string
  labeler?: string
  /** Zweitbewertung derselben Mail (Teilmenge) — Grundlage der Übereinstimmungsprüfung. */
  secondLabels?: GoldLabels
  secondLabeler?: string
  language?: string | null
  /** Mailinhalt. NUR lokal bzw. synthetisch. */
  content?: DecisionSignalSource
  /**
   * Vorab gerechnete Signale. Fehlen sie, leitet die Auswertung sie aus `content` ab.
   * Nur zusammen mit `signalsMeta` verwertbar: ohne Herkunft ist nicht entscheidbar, ob sie
   * zur heutigen Signallogik und zur heutigen Instruktions-Notiz passen.
   */
  signals?: PolicySignals
  /** Herkunft vorgerechneter Signale. Ohne sie gelten `signals` als nicht verwertbar. */
  signalsMeta?: SignalsMeta
  /** Ergebnis der lokalen Engine (füllt Paket B). */
  decision?: DecisionResult
  /** Heutige Vollanalyse als Vergleichsarm — kein Goldstandard. */
  baseline?: {
    relevant?: boolean
    relevanceScore?: number
    needsReply?: boolean
    replyUrgency?: string
    /** Der Lauf ist fehlgeschlagen. Fehlversuche zählen mit, sie verschwinden nicht. */
    failed?: boolean
  }
}

export interface LabelIssue {
  /** 1-basierte Zeile in der JSONL-Datei. */
  line: number
  id: string | null
  severity: 'error' | 'warning'
  code:
    | 'invalid-json'
    | 'schema-mismatch'
    | 'missing-field'
    | 'invalid-value'
    | 'duplicate-id'
    | 'contradiction'
    | 'content-missing'
    | 'stale-signals'
  detail: string
}

export interface LabelParseResult {
  records: LabelRecord[]
  issues: LabelIssue[]
  /** Gelesene nicht-leere Zeilen. */
  lines: number
}

function isTernary(v: unknown): v is Ternary {
  return typeof v === 'string' && (TERNARY_VALUES as readonly string[]).includes(v)
}

function isIsoDate(v: unknown): boolean {
  return typeof v === 'string' && Number.isFinite(Date.parse(v))
}

// ── Prüfung der verschachtelten Strukturen ───────────────────────────────────
//
// Die JSONL-Zeile ist UNTRUSTED: sie kommt aus einer Datei, die jemand von Hand oder mit
// einem Skript geschrieben hat, möglicherweise gegen eine ältere Fassung dieses Schemas.
// Ein `as LabelRecord` darauf wäre eine Behauptung, keine Prüfung — und die teuerste
// Stelle dafür: ein veraltetes `signals`-Objekt kann in der Messung ein `skip` erzeugen,
// das die Policy nie zugelassen hätte, und ein unbekanntes Feld kann Mailtext tragen.
// Deshalb wird jedes Objekt NEU AUFGEBAUT; was hier nicht aufgezählt ist, fällt weg.

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isUnit = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1

function validateSignals(v: unknown): PolicySignals | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (!isNum(r.hardFloor) || r.hardFloor < 0 || !isNum(r.hardBoost) || r.hardBoost < 0) return null
  if (!Array.isArray(r.hardSignalKinds) || !r.hardSignalKinds.every(isStr)) return null
  for (const f of ['hasAttachments', 'hasThreadContext', 'hasActionMarker', 'newsletterMarker', 'bodyPresent', 'softCriteriaPresent']) {
    if (!isBool(r[f])) return null
  }
  if (!isNum(r.bodyChars) || r.bodyChars < 0) return null
  if (r.language !== null && !isStr(r.language)) return null
  return {
    hardFloor: r.hardFloor,
    hardBoost: r.hardBoost,
    hardSignalKinds: r.hardSignalKinds as PolicySignals['hardSignalKinds'],
    hasAttachments: r.hasAttachments as boolean,
    hasThreadContext: r.hasThreadContext as boolean,
    hasActionMarker: r.hasActionMarker as boolean,
    newsletterMarker: r.newsletterMarker as boolean,
    bodyPresent: r.bodyPresent as boolean,
    bodyChars: r.bodyChars,
    softCriteriaPresent: r.softCriteriaPresent as boolean,
    language: r.language as string | null,
  }
}

function validateSignalsMeta(v: unknown): SignalsMeta | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (!isStr(r.signalsVersion) || !isStr(r.instructionHash)) return null
  return { signalsVersion: r.signalsVersion, instructionHash: r.instructionHash }
}

function validateTriple(v: unknown): NliTriple | null {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) return null
  return [v[0], v[1], v[2]] as NliTriple
}

function validateQuestionScores(v: unknown): QuestionScores | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const logits = validateTriple(r.logits)
  const probs = validateTriple(r.probs)
  if (!logits || !probs) return null
  // Wahrscheinlichkeiten müssen welche sein: im Einheitsintervall und zusammen 1. Ohne
  // diese Prüfung wäre „0,9 Entailment" aus einer fremden Quelle nicht nachvollziehbar.
  if (!probs.every(isUnit)) return null
  if (Math.abs(probs[0] + probs[1] + probs[2] - 1) > 1e-3) return null
  const out: QuestionScores = { logits, probs }
  if (r.calibrated !== undefined) {
    if (!isUnit(r.calibrated)) return null
    out.calibrated = r.calibrated
  }
  return out
}

function validateArtifacts(v: unknown): DecisionResult['artifacts'] | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  for (const f of ['hypothesisSet', 'modelId', 'modelRevision', 'quantization', 'runtime']) {
    if (!isStr(r[f])) return null
  }
  if (r.calibration !== null && !isStr(r.calibration)) return null
  return {
    hypothesisSet: r.hypothesisSet as string,
    modelId: r.modelId as string,
    modelRevision: r.modelRevision as string,
    quantization: r.quantization as string,
    calibration: r.calibration as string | null,
    runtime: r.runtime as string,
  }
}

function validateDecision(v: unknown): DecisionResult | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const artifacts = validateArtifacts(r.artifacts)
  if (!artifacts || !isNum(r.durationMs) || r.durationMs < 0) return null

  if (r.status === 'abstain') {
    if (!isStr(r.reason) || !(ABSTAIN_REASONS as readonly string[]).includes(r.reason)) return null
    return { status: 'abstain', reason: r.reason as DecisionResult extends { reason: infer R } ? R : never, durationMs: r.durationMs, artifacts }
  }
  if (r.status !== 'ok') return null
  const coverage = r.coverage as Record<string, unknown> | undefined
  if (!coverage || typeof coverage !== 'object') return null
  if (!isBool(coverage.complete)) return null
  for (const f of ['promptTokens', 'maxTokens', 'bodyChars', 'bodyCharsUsed']) {
    if (!isNum(coverage[f]) || (coverage[f] as number) < 0) return null
  }
  const questionsRaw = r.questions as Record<string, unknown> | undefined
  if (!questionsRaw || typeof questionsRaw !== 'object') return null
  const questions = {} as Record<DecisionQuestionId, QuestionScores>
  for (const q of DECISION_QUESTIONS) {
    const scores = validateQuestionScores(questionsRaw[q])
    if (!scores) return null
    questions[q] = scores
  }
  if (!isNum(r.pairs) || !isNum(r.tokens)) return null
  return {
    status: 'ok',
    questions,
    coverage: {
      complete: coverage.complete,
      promptTokens: coverage.promptTokens as number,
      maxTokens: coverage.maxTokens as number,
      bodyChars: coverage.bodyChars as number,
      bodyCharsUsed: coverage.bodyCharsUsed as number,
    },
    pairs: r.pairs,
    tokens: r.tokens,
    durationMs: r.durationMs,
    artifacts,
  }
}

function validateContent(v: unknown): DecisionSignalSource | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const from = r.from as Record<string, unknown> | undefined
  if (!from || typeof from !== 'object' || Array.isArray(from)) return null
  if (from.name !== undefined && !isStr(from.name)) return null
  if (from.address !== undefined && !isStr(from.address)) return null
  if (r.subject !== undefined && !isStr(r.subject)) return null
  if (r.bodyText !== undefined && !isStr(r.bodyText)) return null
  if (r.hasAttachments !== undefined && !isBool(r.hasAttachments)) return null
  if (r.attachmentNames !== undefined && (!Array.isArray(r.attachmentNames) || !r.attachmentNames.every(isStr))) return null
  if (r.inReplyTo !== undefined && !isStr(r.inReplyTo)) return null
  if (r.references !== undefined && (!Array.isArray(r.references) || !r.references.every(isStr))) return null
  const out: DecisionSignalSource = { from: {} }
  if (from.name !== undefined) out.from.name = from.name as string
  if (from.address !== undefined) out.from.address = from.address as string
  if (r.subject !== undefined) out.subject = r.subject as string
  if (r.bodyText !== undefined) out.bodyText = r.bodyText as string
  if (r.hasAttachments !== undefined) out.hasAttachments = r.hasAttachments as boolean
  if (r.attachmentNames !== undefined) out.attachmentNames = r.attachmentNames as string[]
  if (r.inReplyTo !== undefined) out.inReplyTo = r.inReplyTo as string
  if (r.references !== undefined) out.references = r.references as string[]
  return out
}

function validateBaseline(v: unknown): LabelRecord['baseline'] | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (r.relevant !== undefined && !isBool(r.relevant)) return null
  if (r.relevanceScore !== undefined && !isNum(r.relevanceScore)) return null
  if (r.needsReply !== undefined && !isBool(r.needsReply)) return null
  if (r.replyUrgency !== undefined && !isStr(r.replyUrgency)) return null
  if (r.failed !== undefined && !isBool(r.failed)) return null
  const out: NonNullable<LabelRecord['baseline']> = {}
  if (r.relevant !== undefined) out.relevant = r.relevant as boolean
  if (r.relevanceScore !== undefined) out.relevanceScore = r.relevanceScore
  if (r.needsReply !== undefined) out.needsReply = r.needsReply as boolean
  // `replyUrgency` ist eine Modellausgabe und damit beliebiger Text: nur bekannte Stufen
  // übernehmen, sonst stünde hier ein Freitext aus einer untrusted Mail.
  if (r.replyUrgency === 'low' || r.replyUrgency === 'medium' || r.replyUrgency === 'high') out.replyUrgency = r.replyUrgency
  if (r.failed !== undefined) out.failed = r.failed as boolean
  return out
}

function validateLabels(v: unknown): GoldLabels | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  const out = {} as GoldLabels
  for (const f of LABEL_FIELDS) {
    if (!isTernary(r[f])) return null
    out[f] = r[f]
  }
  return out
}

/**
 * Widerspruchsprüfung. `safeToSkip: yes` neben einem Risiko-Ja ist kein Grenzfall,
 * sondern ein Fehler im Label — und genau der Fehler, der später eine Skip-Freigabe
 * rechtfertigen würde, die niemand so gemeint hat.
 *
 * `unclear` zählt dabei wie ein Ja, und zwar in ALLEN vier Feldern einschließlich
 * `important`. Ein Fall „weiß ich nicht, ob wichtig — aber gefahrlos überspringbar" ist in
 * sich widersprüchlich: unklare Wichtigkeit ist genau die Unsicherheit, die jedes
 * Überspringen blockieren soll. Stünde sie hier durch, wäre sie später unsichtbar — sie
 * zählte als positives Kalibrierungsziel und erschiene nicht unter den übersprungenen
 * wichtigen Mails, weil dort nur `important=yes` gezählt wird.
 */
export function labelContradictions(labels: GoldLabels): string[] {
  const out: string[] = []
  if (labels.safeToSkip === 'yes') {
    for (const f of [...RISK_LABEL_FIELDS, 'important' as const]) {
      if (labels[f] === 'yes') out.push(`safeToSkip=yes trotz ${f}=yes`)
      if (labels[f] === 'unclear') out.push(`safeToSkip=yes trotz ${f}=unclear`)
    }
  }
  return out
}

export function validateLabelRecord(value: unknown, line: number): { record: LabelRecord | null; issues: LabelIssue[] } {
  const issues: LabelIssue[] = []
  const push = (severity: LabelIssue['severity'], code: LabelIssue['code'], detail: string, id: string | null = null): void => {
    issues.push({ line, id, severity, code, detail })
  }
  // Fehlertexte nennen FELDNAMEN, nie Werte. Ein Wert aus dieser Datei kann eine
  // Betreffzeile sein, und Fehlertexte landen in der Konsole und im Bericht.
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    push('error', 'invalid-json', 'Zeile ist kein JSON-Objekt.')
    return { record: null, issues }
  }
  const raw = value as Record<string, unknown>

  const id = isStr(raw.id) && LABEL_ID_PATTERN.test(raw.id) ? raw.id : null
  if (!id) {
    push(
      'error',
      isStr(raw.id) ? 'invalid-value' : 'missing-field',
      'Feld `id` fehlt oder ist kein lokales Pseudonym (erlaubt: A-Z a-z 0-9 . _ : -, höchstens 64 Zeichen). ' +
        'Eine Message-ID oder Betreffzeile als Kennung wird abgelehnt — sie stünde später im Bericht.',
    )
  }
  if (raw.schema !== LABEL_SCHEMA_VERSION) {
    push('error', 'schema-mismatch', `Feld \`schema\` ist nicht \`${LABEL_SCHEMA_VERSION}\`.`, id)
  }
  if (!isStr(raw.group) || raw.group.trim() === '' || raw.group.length > 300) {
    push('error', 'missing-field', 'Feld `group` fehlt, ist leer oder zu lang — ohne Gruppenschlüssel kein gruppierter Split.', id)
  }
  if (!isIsoDate(raw.receivedAt)) {
    push('error', 'invalid-value', 'Feld `receivedAt` ist kein gültiger ISO-Zeitpunkt.', id)
  }
  if (raw.source !== 'real-local' && raw.source !== 'synthetic') {
    push('error', 'invalid-value', 'Feld `source` muss `real-local` oder `synthetic` sein.', id)
  }
  const labels = validateLabels(raw.labels)
  if (!labels) {
    push('error', raw.labels === undefined ? 'missing-field' : 'invalid-value', 'Feld `labels` fehlt oder enthält einen Wert außerhalb yes|no|unclear.', id)
  }
  let secondLabels: GoldLabels | undefined
  if (raw.secondLabels !== undefined) {
    const parsed = validateLabels(raw.secondLabels)
    if (!parsed) push('error', 'invalid-value', 'Feld `secondLabels` enthält einen Wert außerhalb yes|no|unclear.', id)
    else secondLabels = parsed
  }

  // Verschachtelte Strukturen: vorhanden heißt gültig, sonst Fehler. Stillschweigend
  // weglassen wäre schlimmer — die Auswertung liefe dann mit weniger Daten weiter, ohne
  // dass jemand es merkt.
  let signals: PolicySignals | undefined
  if (raw.signals !== undefined) {
    const parsed = validateSignals(raw.signals)
    if (!parsed) push('error', 'invalid-value', 'Feld `signals` hat nicht die Form von PolicySignals.', id)
    else signals = parsed
  }
  let signalsMeta: SignalsMeta | undefined
  if (raw.signalsMeta !== undefined) {
    const parsed = validateSignalsMeta(raw.signalsMeta)
    if (!parsed) push('error', 'invalid-value', 'Feld `signalsMeta` braucht `signalsVersion` und `instructionHash`.', id)
    else signalsMeta = parsed
  }
  let decision: DecisionResult | undefined
  if (raw.decision !== undefined) {
    const parsed = validateDecision(raw.decision)
    if (!parsed) push('error', 'invalid-value', 'Feld `decision` hat nicht die Form eines DecisionResult (Tripel, Wahrscheinlichkeiten, Abdeckung, Artefakte).', id)
    else decision = parsed
  }
  let content: DecisionSignalSource | undefined
  if (raw.content !== undefined) {
    const parsed = validateContent(raw.content)
    if (!parsed) push('error', 'invalid-value', 'Feld `content` hat nicht die erwartete Form.', id)
    else content = parsed
  }
  let baseline: LabelRecord['baseline']
  if (raw.baseline !== undefined) {
    const parsed = validateBaseline(raw.baseline)
    if (!parsed) push('error', 'invalid-value', 'Feld `baseline` hat nicht die erwartete Form.', id)
    else baseline = parsed
  }
  if (raw.language !== undefined && raw.language !== null && !isStr(raw.language)) {
    push('error', 'invalid-value', 'Feld `language` muss ein Text oder null sein.', id)
  }
  if (raw.rationale !== undefined && !isStr(raw.rationale)) {
    push('error', 'invalid-value', 'Feld `rationale` muss ein Text sein.', id)
  }
  for (const f of ['labeler', 'secondLabeler']) {
    if (raw[f] !== undefined && !isStr(raw[f])) push('error', 'invalid-value', `Feld \`${f}\` muss ein Text sein.`, id)
  }

  // Vorgerechnete Signale ohne Herkunft sind nicht verwertbar: niemand kann sagen, ob sie
  // zur heutigen Signallogik und zur heutigen Instruktions-Notiz gehören.
  if (signals && !signalsMeta) {
    push('error', 'stale-signals', 'Feld `signals` ohne `signalsMeta` — ohne Herkunft ist nicht prüfbar, ob die Werte noch gelten.', id)
  }

  if (!id || !labels || issues.some((i) => i.severity === 'error')) return { record: null, issues }

  // Neu aufgebaut, nicht gecastet: unbekannte Felder aus der Datei existieren ab hier nicht.
  const record: LabelRecord = {
    schema: LABEL_SCHEMA_VERSION,
    id,
    group: raw.group as string,
    receivedAt: raw.receivedAt as string,
    source: raw.source as LabelSource,
    labels,
  }
  if (isStr(raw.rationale)) record.rationale = raw.rationale
  if (isStr(raw.labeler)) record.labeler = raw.labeler
  if (isStr(raw.secondLabeler)) record.secondLabeler = raw.secondLabeler
  if (secondLabels) record.secondLabels = secondLabels
  if (raw.language !== undefined) record.language = raw.language as string | null
  if (content) record.content = content
  if (signals) record.signals = signals
  if (signalsMeta) record.signalsMeta = signalsMeta
  if (decision) record.decision = decision
  if (baseline) record.baseline = baseline

  for (const detail of labelContradictions(record.labels)) {
    push('error', 'contradiction', detail, id)
  }
  if (record.secondLabels) {
    for (const detail of labelContradictions(record.secondLabels)) {
      push('error', 'contradiction', 'Zweitbewertung: ' + detail, id)
    }
  }
  if (!record.content && !record.signals) {
    push(
      'warning',
      'content-missing',
      'Weder `content` noch `signals` vorhanden — für diesen Fall lässt sich keine Route berechnen.',
      id,
    )
  }
  if (issues.some((i) => i.severity === 'error')) return { record: null, issues }
  return { record, issues }
}

/**
 * Sind vorgerechnete Signale heute noch verwertbar? Antwort ist ein Grund, kein `boolean` —
 * die Auswertung soll sagen können, WARUM sie einen Fall auslässt.
 *
 * Inhalt schlägt Vorrechnung: liegt `content` vor, werden die Signale ohnehin neu gerechnet.
 * Diese Prüfung gilt dem Fall, in dem nur noch die Zahlen da sind.
 */
export function signalsUsability(
  record: LabelRecord,
  currentInstructionHash: string,
): { usable: boolean; reason: 'ok' | 'no-signals' | 'version-mismatch' | 'instruction-mismatch' } {
  if (!record.signals || !record.signalsMeta) return { usable: false, reason: 'no-signals' }
  if (record.signalsMeta.signalsVersion !== SIGNALS_VERSION) return { usable: false, reason: 'version-mismatch' }
  if (record.signalsMeta.instructionHash !== currentInstructionHash) return { usable: false, reason: 'instruction-mismatch' }
  return { usable: true, reason: 'ok' }
}

export function parseLabelJsonl(text: string): LabelParseResult {
  const records: LabelRecord[] = []
  const issues: LabelIssue[] = []
  const seen = new Set<string>()
  const rawLines = text.split('\n')
  let lines = 0
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (!line || line.startsWith('//')) continue
    lines++
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (err) {
      issues.push({
        line: i + 1,
        id: null,
        severity: 'error',
        code: 'invalid-json',
        // Absichtlich ohne den Zeileninhalt: er wäre ein Mailauszug im Fehlertext.
        detail: `JSON nicht lesbar (${err instanceof Error ? err.name : 'Fehler'}).`,
      })
      continue
    }
    const { record, issues: recIssues } = validateLabelRecord(parsed, i + 1)
    issues.push(...recIssues)
    if (!record) continue
    if (seen.has(record.id)) {
      issues.push({ line: i + 1, id: record.id, severity: 'error', code: 'duplicate-id', detail: 'Doppelte Fallkennung.' })
      continue
    }
    seen.add(record.id)
    records.push(record)
  }
  return { records, issues, lines }
}

export function serializeLabelJsonl(records: readonly LabelRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '')
}

/**
 * Datensatz für alles, was den lokalen Rechner verlassen oder in einen Bericht wandern
 * könnte. Bewusst als **Allowlist** gebaut, nicht als Kopie mit gelöschten Feldern: eine
 * Kopie mit `delete` nimmt jedes Feld mit, das jemand später hinzufügt oder das über eine
 * fremde JSON-Zeile hereinkommt — und genau das wäre der Weg, auf dem Mailtext in einen
 * Bericht gerät. Was hier nicht ausdrücklich aufgezählt ist, existiert draußen nicht.
 *
 * Nicht enthalten: `content` und `rationale` (Mailtext), `labeler`/`secondLabeler`
 * (Personen) und `group` (enthält den normalisierten Betreff) — statt der Gruppe steht ihr
 * Hash da, denn für Berichte zählt nur, WELCHE Fälle dieselbe Gruppe haben.
 */
export function stripForReport(record: LabelRecord): ReportableRecord {
  const out: ReportableRecord = {
    schema: record.schema,
    id: record.id,
    groupHash: shortHash(record.group),
    receivedAt: record.receivedAt,
    source: record.source,
    labels: { ...record.labels },
  }
  if (record.secondLabels) out.secondLabels = { ...record.secondLabels }
  if (record.language !== undefined) out.language = record.language
  if (record.signals) out.signals = { ...record.signals }
  if (record.signalsMeta) out.signalsMeta = { ...record.signalsMeta }
  if (record.decision) out.decision = record.decision
  if (record.baseline) out.baseline = { ...record.baseline }
  return out
}

export interface ReportableRecord {
  schema: string
  id: string
  groupHash: string
  receivedAt: string
  source: LabelSource
  labels: GoldLabels
  secondLabels?: GoldLabels
  language?: string | null
  signals?: PolicySignals
  signalsMeta?: SignalsMeta
  decision?: DecisionResult
  baseline?: LabelRecord['baseline']
}

export function goldIsImportant(r: LabelRecord): boolean {
  return r.labels.important === 'yes'
}

/** Nur ein ausdrückliches Ja erlaubt Überspringen. `unclear` blockiert. */
export function goldSafeToSkip(r: LabelRecord): boolean {
  return r.labels.safeToSkip === 'yes'
}

export function goldHasRisk(r: LabelRecord): boolean {
  return RISK_LABEL_FIELDS.some((f) => r.labels[f] === 'yes')
}

export function makeEmptyLabels(): GoldLabels {
  return { important: 'unclear', needsReply: 'unclear', hasActionOrDate: 'unclear', urgent: 'unclear', safeToSkip: 'no' }
}
