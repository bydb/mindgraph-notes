/**
 * E-Mail-Decision-Pilot — Prüf- und Auswertungs-CLI (Paket A).
 *
 *   node scripts/run-ts.mjs scripts/email-decision-eval.ts --dataset <pfad.jsonl> [--instruction <notiz.md>]
 *
 * Bewusst OHNE npm-Skript: der Pilot ist eingefroren (siehe docs/codex-collab/
 * email-decision-pilot.md). Das Werkzeug bleibt lauffähig, steht aber nicht mehr in der
 * Befehlsliste des Projekts.
 *
 * Ohne `--dataset` erklärt das Werkzeug das Dateiformat. Mit `--validate` prüft es nur.
 *
 * Was dieses Werkzeug tut:
 *   1. Labeldatensatz lesen und streng prüfen (Schema, Widersprüche, doppelte Kennungen).
 *   2. Fehlende Signale aus dem lokalen `content` deterministisch ableiten.
 *   3. Gruppierten Split einfrieren (Manifest mit Seed und Prüfsumme).
 *   4. Vergleichsarme rechnen: nur Regeln · Regeln + experimentelle Negativregel ·
 *      Regeln + NLI (nur wenn der Datensatz Modellergebnisse enthält).
 *   5. Bericht mit Fallzahlen und Unsicherheit ausgeben.
 *
 * Was es NICHT tut: kein Modell laden, kein Netz, keine Mails lesen, nichts in den Vault
 * oder in `emails.json` schreiben. Der Datensatz liegt bewusst außerhalb des Repos; nur
 * die synthetischen Fixtures (`scripts/email-decision-fixtures.jsonl`) sind eingecheckt,
 * und die sind ein Funktionstest, keine Alltagsverteilung.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  parseLabelJsonl,
  signalsUsability,
  RISK_LABEL_FIELDS,
  type LabelRecord,
  type LabelIssue,
  type Ternary,
} from '../src/shared/decision/labels'
import {
  evaluateRoutingPolicy,
  evaluateRuleBaseline,
  isValidCalibration,
  type PolicyCalibration,
  type PolicyDecision,
  type PolicySignals,
} from '../src/shared/decision/emailPolicy'
import { deriveDecisionSignals, hashInstruction, SIGNALS_VERSION } from '../src/shared/decision/signals'
import {
  DEFAULT_SPLIT_RATIOS,
  splitByGroup,
  temporalSubset,
  type SplitRatios,
  type SplitResult,
  type Subset,
} from '../src/shared/decision/split'
import {
  agreementReport,
  expectedCalibrationError,
  brierScore,
  routeReport,
  zeroErrorUpperBound95,
  type ProbabilityPair,
  type RouteReport,
  type RoutedCase,
} from '../src/shared/decision/metrics'
import {
  applyCalibration,
  calibrationMismatch,
  entailmentProbability,
  fitTemperature,
  type CalibrationSample,
} from '../src/shared/decision/calibration'
import {
  DECISION_QUESTIONS,
  HYPOTHESIS_SET_VERSION,
  LABEL_SCHEMA_VERSION,
  POLICY_VERSION,
  type DecisionQuestionId,
  type DecisionResult,
} from '../src/shared/decision/types'
import { parseRelevanceConfig, stripConfigBlock, emptyRelevanceConfig, type RelevanceConfig } from '../src/shared/emailRelevance'

// ── Argumente ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

function num(value: string | boolean | undefined): number | null {
  if (typeof value !== 'string') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseRatios(value: string | boolean | undefined): SplitRatios {
  if (typeof value !== 'string') return DEFAULT_SPLIT_RATIOS
  const parts = value.split(/[/:,]/).map((p) => Number(p.trim()))
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) {
    throw new Error(`--ratios erwartet drei Zahlen, z.B. 60/20/20 (gefunden: ${value})`)
  }
  const sum = parts[0] + parts[1] + parts[2]
  return { dev: parts[0] / sum, cal: parts[1] / sum, holdout: parts[2] / sum }
}

/** Schreibziele, die nach Mail- oder Vaultdaten aussehen, werden abgelehnt. */
function assertWritableTarget(target: string): void {
  const resolved = path.resolve(target)
  const base = path.basename(resolved).toLowerCase()
  if (base === 'emails.json' || base === 'contacts.json') {
    throw new Error(`Das Werkzeug schreibt nicht nach ${base}. Es wertet aus, es verändert keine Maildaten.`)
  }
  if (resolved.split(path.sep).includes('.mindgraph')) {
    throw new Error('Das Werkzeug schreibt nicht in einen .mindgraph-Ordner.')
  }
}

// ── Hilfe ────────────────────────────────────────────────────────────────────

const USAGE = `
E-Mail-Decision-Pilot — Auswertung (Paket A, ohne Modell lauffähig)

  node scripts/run-ts.mjs scripts/email-decision-eval.ts --dataset <pfad.jsonl> [Optionen]

Optionen
  --dataset <pfad>            JSONL mit manuellen Labels (liegt außerhalb des Repos).
  --instruction <pfad>        Instruktions-Notiz: harte Regeln + weiche Kriterien.
  --validate                  Nur prüfen, nichts rechnen.
  --seed <text>               Split-Seed (Standard: email-decision-pilot@1).
  --ratios 60/20/20           Entwicklung/Kalibrierung/Holdout.
  --subset dev|cal|holdout    Nur eine Teilmenge auswerten (Standard: alle, einzeln).
  --temporal-cutoff <ISO>     Zusätzlicher zeitlich getrennter Nachtest ab diesem Stichtag.
  --experimental-negative-rule  Zusätzlicher Arm mit Newsletter-Negativregel (nur auf cal).
  --sweep                     Schwellen-Übersicht auf dem KALIBRIERUNGSTEIL (Erkundung).
  --min-language-cases <n>    Mindestfallzahl je Sprache und Frage (Standard 20).
  --min-language-groups <n>   Mindestgruppenzahl je Sprache und Frage (Standard 8).
  --risk-positive <0..1>      Schwelle „Modell sieht Risiko" (ohne Angabe: kein NLI-Arm).
  --risk-negative <0..1>      Schwelle „sicheres Nein".
  --impersonal-positive <0..1>  Schwelle „unpersönliche Information".
  --out <pfad.md>             Bericht zusätzlich als Datei.
  --json <pfad.json>          Maschinenlesbarer Bericht.

Dateiformat (eine Zeile = eine Mail, JSON)
  {
    "schema": "${LABEL_SCHEMA_VERSION}",
    "id": "lokale-kennung",
    "group": "thread:<id>  oder  tpl:<domain>:<normalisierter betreff>",
    "receivedAt": "2026-09-01T08:00:00Z",
    "source": "real-local" | "synthetic",
    "labels": {
      "important": "yes|no|unclear",
      "needsReply": "yes|no|unclear",
      "hasActionOrDate": "yes|no|unclear",
      "urgent": "yes|no|unclear",
      "safeToSkip": "yes|no|unclear"
    },
    "rationale": "kurze eigene Begründung (bleibt lokal)",
    "secondLabels": { … },            // Zweitbewertung einer Teilmenge
    "content": { "subject": …, "bodyText": …, "from": {…},
                 "attachmentNames": […], "inReplyTo": …, "references": […] },
    "signals": { … },                  // optional; sonst aus content abgeleitet
    "decision": { … },                 // Ergebnis der lokalen Engine (Paket B)
    "baseline": { "relevant": true, "needsReply": false, "failed": false }
  }

Regeln für die Labels
  * "safeToSkip": "yes" nur, wenn durch das Weglassen der Analyse KEINE benötigte
    Information, Zusammenfassung, Aufgabe oder Termin fehlt. Unklar blockiert.
  * Die heutige LLM-Ausgabe gehört nach "baseline" — sie ist ein Vergleichsarm,
    kein Goldstandard.
  * Gruppenschlüssel trennt Threads und Newsletter-Vorlagen. Ohne ihn ist jeder
    Holdout wertlos.
`

// ── Datensatz vorbereiten ────────────────────────────────────────────────────

export interface PreparedCase {
  record: LabelRecord
  signals: PolicySignals
  subset: Subset
}

export interface InstructionContext {
  config: RelevanceConfig
  softCriteriaPresent: boolean
  /** Hash der Notiz — entscheidet, ob vorgerechnete Signale noch gelten. */
  hash: string
  name: string | null
}

export function loadInstruction(file: string | undefined): InstructionContext {
  if (!file) return { config: emptyRelevanceConfig(), softCriteriaPresent: false, hash: hashInstruction(''), name: null }
  const text = fs.readFileSync(file, 'utf-8')
  return {
    config: parseRelevanceConfig(text),
    softCriteriaPresent: stripConfigBlock(text).trim().length > 0,
    hash: hashInstruction(text),
    name: path.basename(file),
  }
}

export interface PrepareResult {
  cases: PreparedCase[]
  /** Fälle ohne verwertbare Grundlage, nach Grund getrennt. Keine stille Auslassung. */
  excluded: Array<{ id: string; reason: string }>
  /** Wie viele Signale aus `content` neu gerechnet wurden. */
  recomputed: number
  /** Wie viele vorgerechnete Signale übernommen wurden. */
  imported: number
}

/**
 * Signale beschaffen. Reihenfolge ist Absicht:
 *
 *   1. Liegt `content` vor, werden die Signale IMMER neu gerechnet. Inhalt schlägt
 *      Vorrechnung — sonst entscheidet eine alte Zahl gegen die heutige Regel.
 *   2. Nur Zahlen da: sie gelten ausschließlich mit passender Signalversion UND passendem
 *      Hash der Instruktions-Notiz. Sonst fällt der Fall aus der Auswertung heraus, sichtbar.
 *
 * Der Grund für die Strenge: `softCriteriaPresent: false` aus einem alten Datensatz nimmt
 * einer Mail den Blocker `soft-criteria-uncovered` — der Bericht schriebe im Kopf „weiche
 * Kriterien vorhanden" und verteilte darunter Skips.
 */
export function prepare(
  records: readonly LabelRecord[],
  split: SplitResult,
  instruction: InstructionContext,
): PrepareResult {
  const cases: PreparedCase[] = []
  const excluded: Array<{ id: string; reason: string }> = []
  let recomputed = 0
  let imported = 0
  for (const record of records) {
    let signals: PolicySignals | undefined
    if (record.content) {
      signals = deriveDecisionSignals(record.content, instruction.config, {
        softCriteriaPresent: instruction.softCriteriaPresent,
        language: record.language,
      })
      recomputed++
    } else {
      const usability = signalsUsability(record, instruction.hash)
      if (!usability.usable) {
        excluded.push({
          id: record.id,
          reason:
            usability.reason === 'no-signals'
              ? 'weder Inhalt noch verwertbare Signale'
              : usability.reason === 'version-mismatch'
                ? `Signale aus einer anderen Signalversion (erwartet ${SIGNALS_VERSION})`
                : 'Signale zu einer anderen Instruktions-Notiz gerechnet',
        })
        continue
      }
      signals = {
        ...(record.signals as PolicySignals),
        // Niemals herabsetzen: was die heutige Notiz an weichen Kriterien hat, gilt.
        softCriteriaPresent: (record.signals as PolicySignals).softCriteriaPresent || instruction.softCriteriaPresent,
      }
      imported++
    }
    cases.push({ record, signals, subset: split.assignment.get(record.id) as Subset })
  }
  return { cases, excluded, recomputed, imported }
}

// ── Arme ─────────────────────────────────────────────────────────────────────

function toRoutedCase(c: PreparedCase, decision: PolicyDecision, engine: DecisionResult | null): RoutedCase {
  return {
    id: c.record.id,
    group: c.record.group,
    subset: c.subset,
    source: c.record.source,
    labels: c.record.labels,
    route: decision.route,
    reasonCode: decision.reasonCode,
    notes: decision.notes,
    decisionStatus: engine ? engine.status : 'none',
    coverageComplete: engine && engine.status === 'ok' ? engine.coverage.complete : null,
    baselineFailed: c.record.baseline?.failed === true,
  }
}

export function armRules(cases: readonly PreparedCase[], experimental: boolean): RoutedCase[] {
  return cases.map((c) =>
    toRoutedCase(c, evaluateRuleBaseline(c.signals, { experimentalNegativeRule: experimental }), null),
  )
}

const CURRENT_VERSIONS = { signalsVersion: SIGNALS_VERSION, labelSchema: LABEL_SCHEMA_VERSION }

export function armNli(cases: readonly PreparedCase[], calibration: PolicyCalibration | null): RoutedCase[] {
  return cases.map((c) => {
    const raw = c.record.decision ?? null
    // `applyCalibration` wendet ein Artefakt nur an, wenn es zu diesem Ergebnis gehört
    // (Modell, Revision, Quantisierung, Runtime, Hypothesensatz). Passt es nicht, bleibt
    // das Ergebnis unkalibriert und die Policy landet auf `calibration-scores-missing`.
    const engine =
      raw && calibration ? applyCalibration(raw, calibration, { ...CURRENT_VERSIONS, language: c.signals.language }) : raw
    const decision = evaluateRoutingPolicy({
      explicitRequest: false,
      signals: c.signals,
      decision: engine,
      calibration,
    })
    return toRoutedCase(c, decision, engine)
  })
}

// ── Kalibrierung ─────────────────────────────────────────────────────────────

/**
 * Zielgröße je Frage. `impersonalInfo` wird gegen `safeToSkip` kalibriert — das ist die
 * Größe, für die diese Frage im Gate überhaupt gebraucht wird. Das ist eine Entscheidung
 * und keine Selbstverständlichkeit: das Modell wird nach „Newsletter?" gefragt, bewertet
 * wird an „gefahrlos überspringbar?".
 */
const QUESTION_TARGET: Record<DecisionQuestionId, keyof LabelRecord['labels']> = {
  needsReply: 'needsReply',
  hasActionOrDate: 'hasActionOrDate',
  urgent: 'urgent',
  impersonalInfo: 'safeToSkip',
}

function ternaryToY(v: Ternary): 0 | 1 | null {
  if (v === 'yes') return 1
  if (v === 'no') return 0
  return null // `unclear` wird ausgelassen, nicht als Nein gezählt.
}

function usableForQuestion(c: PreparedCase, q: DecisionQuestionId, language: string): boolean {
  const d = c.record.decision
  if (!d || d.status !== 'ok' || !d.questions[q]) return false
  if (c.signals.language !== language) return false
  return ternaryToY(c.record.labels[QUESTION_TARGET[q]]) !== null
}

export function calibrationSamples(cases: readonly PreparedCase[], q: DecisionQuestionId, language: string): CalibrationSample[] {
  const out: CalibrationSample[] = []
  for (const c of cases) {
    if (!usableForQuestion(c, q, language)) continue
    const d = c.record.decision as Extract<DecisionResult, { status: 'ok' }>
    out.push({ logits: d.questions[q].logits, y: ternaryToY(c.record.labels[QUESTION_TARGET[q]]) as 0 | 1 })
  }
  return out
}

export interface Thresholds {
  riskPositive: number
  riskNegative: number
  impersonalPositive: number
}

interface CalibrationOutcome {
  calibration: PolicyCalibration | null
  notes: string[]
}

/** Fingerabdruck aus den Ergebnissen selbst — und Widerspruch, wenn sie nicht zusammenpassen. */
export function fingerprintOf(calCases: readonly PreparedCase[]): { fingerprint: PolicyCalibration['fingerprint'] | null; note: string | null } {
  const seen = new Map<string, PreparedCase['record']['decision']>()
  for (const c of calCases) {
    const d = c.record.decision
    if (!d || d.status !== 'ok') continue
    const a = d.artifacts
    seen.set([a.modelId, a.modelRevision, a.quantization, a.runtime, a.hypothesisSet].join('|'), d)
  }
  if (seen.size === 0) return { fingerprint: null, note: 'Keine auswertbaren Modellergebnisse im Kalibrierungsteil.' }
  if (seen.size > 1) {
    return {
      fingerprint: null,
      note: `Die Kalibrierungsdaten stammen aus ${seen.size} verschiedenen Modell-/Hypothesen-Ständen. Eine Temperatur über gemischte Stände ist keine Kalibrierung.`,
    }
  }
  const a = [...seen.values()][0]!.artifacts
  return {
    fingerprint: {
      modelId: a.modelId,
      modelRevision: a.modelRevision,
      quantization: a.quantization,
      runtime: a.runtime,
      hypothesisSet: a.hypothesisSet,
      signalsVersion: SIGNALS_VERSION,
      labelSchema: LABEL_SCHEMA_VERSION,
    },
    note: null,
  }
}

/**
 * Mindestumfang, damit eine Sprache überhaupt freigegeben wird. Das ist KEINE
 * Qualitätsaussage und keine Skip-Schwelle — nur die Grenze, unterhalb derer eine
 * Temperatur offensichtlich nichts misst. Mit `--min-language-cases` absenkbar; wer sie
 * absenkt, liest es im Bericht.
 */
export const DEFAULT_MIN_LANGUAGE_CASES = 20
export const DEFAULT_MIN_LANGUAGE_GROUPS = 8

export function fitCalibration(
  calCases: readonly PreparedCase[],
  thresholds: Thresholds | null,
  limits: { minCases: number; minGroups: number },
): CalibrationOutcome {
  const notes: string[] = []
  const { fingerprint, note: fpNote } = fingerprintOf(calCases)
  if (!fingerprint) {
    if (fpNote) notes.push(fpNote)
    return { calibration: null, notes }
  }
  const temperature: Record<string, Record<DecisionQuestionId, number>> = {}
  const perLanguage: Record<string, Record<DecisionQuestionId, { cases: number; groups: number }>> = {}
  const candidates = [...new Set(calCases.map((c) => c.signals.language).filter((l): l is string => !!l))].sort()
  if (candidates.length === 0) {
    notes.push('Keine Sprache im Kalibrierungsteil eindeutig bestimmt — ohne Sprache gilt kein Artefakt.')
    return { calibration: null, notes }
  }

  for (const lang of candidates) {
    const perQuestion = {} as Record<DecisionQuestionId, number>
    const counts = {} as Record<DecisionQuestionId, { cases: number; groups: number }>
    let ok = true
    for (const q of DECISION_QUESTIONS) {
      const samples = calibrationSamples(calCases, q, lang)
      const groups = new Set(calCases.filter((c) => usableForQuestion(c, q, lang)).map((c) => c.record.group)).size
      counts[q] = { cases: samples.length, groups }
      if (samples.length < limits.minCases || groups < limits.minGroups) {
        notes.push(
          `Sprache \`${lang}\`, Frage \`${q}\`: ${samples.length} Fälle in ${groups} Gruppen — unter der Mindestzahl ` +
            `(${limits.minCases} Fälle / ${limits.minGroups} Gruppen). Diese Sprache wird NICHT freigegeben.`,
        )
        ok = false
        break
      }
      const fit = fitTemperature(samples, { groups })
      if (!fit) {
        notes.push(
          `Sprache \`${lang}\`, Frage \`${q}\`: keine brauchbaren Kalibrierungsdaten (${samples.length} Fälle, beide Klassen nötig).`,
        )
        ok = false
        break
      }
      perQuestion[q] = fit.temperature
      if (fit.atBound) {
        notes.push(
          `Sprache \`${lang}\`, Frage \`${q}\`: Die Temperatur läuft an den Rand des Suchbereichs ` +
            `(${fit.temperature.toFixed(3)}). Das passiert bei perfekt trennbaren oder zu wenigen Daten — ` +
            'eine so gewonnene Skala ist nicht belastbar.',
        )
      }
    }
    if (!ok) continue
    temperature[lang] = perQuestion
    perLanguage[lang] = counts
  }

  const languages = Object.keys(temperature).sort()
  if (languages.length === 0) {
    notes.push('Keine Sprache erreicht den Mindestumfang — es entsteht kein Artefakt und damit kein `skip`.')
    return { calibration: null, notes }
  }
  notes.push(
    'Freigegebene Sprachen (jede mit eigener Temperatur): ' +
      languages
        .map((l) => `${l}=${Math.min(...DECISION_QUESTIONS.map((q) => perLanguage[l][q].cases))} Fälle (schwächste Frage)`)
        .join(' · '),
  )
  const notReleased = candidates.filter((l) => !languages.includes(l))
  if (notReleased.length) {
    notes.push(`Nicht freigegeben und damit weiterhin \`review\`: ${notReleased.join(', ')}.`)
  }
  if (!thresholds) {
    notes.push(
      'Temperaturen sind bestimmt, aber es wurden KEINE Schwellen angegeben (--risk-positive/--risk-negative/--impersonal-positive). ' +
        'Eine Skip-Schwelle wird hier nicht erfunden — ohne sie bleibt der NLI-Arm ohne `skip`.',
    )
    return { calibration: null, notes }
  }
  // Ein Artefakt ist so belastbar wie seine SCHWÄCHSTE Sprache und Frage.
  const allCounts = languages.flatMap((l) => DECISION_QUESTIONS.map((q) => perLanguage[l][q]))
  const calibration: PolicyCalibration = {
    id: `cal-${new Date().toISOString().slice(0, 10)}@${HYPOTHESIS_SET_VERSION}`,
    fingerprint,
    languages,
    temperature,
    riskPositive: thresholds.riskPositive,
    riskNegative: thresholds.riskNegative,
    impersonalPositive: thresholds.impersonalPositive,
    fittedOn: {
      cases: Math.min(...allCounts.map((c) => c.cases)),
      groups: Math.min(...allCounts.map((c) => c.groups)),
      subset: 'cal',
      perLanguage,
    },
  }
  if (!isValidCalibration(calibration)) {
    notes.push('Das erzeugte Kalibrierungsartefakt ist ungültig (Schwellen oder Fingerabdruck prüfen).')
    return { calibration: null, notes }
  }
  return { calibration, notes }
}

// ── Formatierung ─────────────────────────────────────────────────────────────

const pct = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || !Number.isFinite(v) ? 'nicht gemessen' : `${(v * 100).toFixed(digits)} %`

const nz = (v: number | null | undefined, digits = 3): string =>
  v === null || v === undefined || !Number.isFinite(v) ? 'nicht gemessen' : v.toFixed(digits)

function formatRouteReport(r: RouteReport): string[] {
  const lines: string[] = []
  lines.push(`#### Arm: ${r.arm}`)
  lines.push('')
  lines.push(`- Fälle: ${r.cases} (davon synthetisch: ${r.synthetic}) · unabhängige Gruppen: ${r.groups}`)
  lines.push(
    `- Routen: skip ${r.routeCounts.skip} · Vollanalyse ${r.routeCounts['full-analysis']} · review ${r.routeCounts.review}`,
  )
  lines.push(`- Skip-Coverage: ${pct(r.skipCoverage)} · review-Anteil: ${pct(r.reviewShare)}`)
  lines.push(
    `- **Wichtige Mails, die übersprungen worden wären: ${r.missedImportant.errors} von ${r.missedImportant.cases}** ` +
      `(${r.missedImportant.groups} Gruppen) · Rate ${pct(r.missedImportant.rate)} · ` +
      `obere 95-%-Grenze ${pct(r.missedImportant.upperBound95)} (auf Gruppen: ${pct(r.missedImportant.upperBound95OnGroups)})`,
  )
  for (const rc of r.riskClasses) {
    lines.push(
      `- Risikoklasse \`${rc.field}\`: ${rc.positives.errors} von ${rc.positives.cases} positiven Fällen übersprungen ` +
        `(${rc.positives.groups} Gruppen) · obere 95-%-Grenze ${pct(rc.positives.upperBound95)}`,
    )
  }
  lines.push(
    `- Skip-Kandidaten ohne ausdrückliches „gefahrlos überspringbar": ${r.unsafeSkipCandidates.notSafe} von ` +
      `${r.unsafeSkipCandidates.skips} (davon unklar: ${r.unsafeSkipCandidates.unclear}) · ${pct(r.unsafeSkipCandidates.share)}`,
  )
  lines.push(`- Nur an unberücksichtigten weichen Kriterien hängen geblieben: ${r.reviewOnlyDueToSoftCriteria}`)
  lines.push(
    `- Technisch: Abstention ${r.technical.abstain} · kein Modelllauf ${r.technical.modelNotRun} · ` +
      `unvollständige Abdeckung ${r.technical.coverageIncomplete} · fehlgeschlagene Vergleichsläufe ${r.technical.baselineFailed}`,
  )
  lines.push(`- Ursachencodes: ${r.reasonCodes.map((c) => `${c.code}=${c.count}`).join(' · ') || '—'}`)
  lines.push('')
  return lines
}

function issueLines(issues: readonly LabelIssue[]): string[] {
  return issues.slice(0, 50).map((i) => `- Zeile ${i.line}${i.id ? ` (${i.id})` : ''} · ${i.severity} · ${i.code}: ${i.detail}`)
}

// ── Hauptlauf ────────────────────────────────────────────────────────────────

function main(): number {
  const args = parseArgs(process.argv.slice(2))
  const datasetPath = typeof args.dataset === 'string' ? args.dataset : null
  if (!datasetPath) {
    console.log(USAGE)
    return 0
  }
  if (!fs.existsSync(datasetPath)) {
    console.error(`Datensatz nicht gefunden: ${datasetPath}`)
    return 1
  }
  // Schreibziele vorab prüfen, nicht erst nach dem Rechnen — ein abgelehntes Ziel soll
  // nicht wie ein geglückter Lauf aussehen, dem nur das Speichern fehlte.
  if (typeof args.out === 'string') assertWritableTarget(args.out)
  if (typeof args.json === 'string') assertWritableTarget(args.json)

  const parsed = parseLabelJsonl(fs.readFileSync(datasetPath, 'utf-8'))
  const errors = parsed.issues.filter((i) => i.severity === 'error')
  const warnings = parsed.issues.filter((i) => i.severity === 'warning')

  const out: string[] = []
  out.push('# E-Mail-Decision-Pilot — Auswertung (Paket A)')
  out.push('')
  out.push(`Datensatz: \`${path.basename(datasetPath)}\` · Zeilen: ${parsed.lines} · gelesen: ${parsed.records.length}`)
  out.push(
    `Versionen: Labelschema \`${LABEL_SCHEMA_VERSION}\` · Policy \`${POLICY_VERSION}\` · ` +
      `Hypothesen \`${HYPOTHESIS_SET_VERSION}\` · Signale \`${SIGNALS_VERSION}\``,
  )
  out.push('')
  out.push('## Prüfung')
  out.push('')
  out.push(`- Fehler: ${errors.length} · Warnungen: ${warnings.length}`)
  if (parsed.issues.length) out.push(...issueLines(parsed.issues))
  out.push('')

  if (errors.length > 0) {
    console.log(out.join('\n'))
    console.error('\nAbbruch: Der Datensatz enthält Fehler. Ein fehlerhafter Goldstandard ist keine Messgrundlage.')
    return 1
  }
  if (args.validate === true) {
    console.log(out.join('\n'))
    console.log('\nNur geprüft (--validate). Keine Auswertung gerechnet.')
    return 0
  }
  if (parsed.records.length === 0) {
    console.log(out.join('\n'))
    console.error('\nAbbruch: keine Fälle im Datensatz.')
    return 1
  }

  // Split einfrieren.
  const seed = typeof args.seed === 'string' ? args.seed : 'email-decision-pilot@1'
  const ratios = parseRatios(args.ratios)
  const split = splitByGroup(
    parsed.records.map((r) => ({ id: r.id, group: r.group })),
    seed,
    ratios,
  )
  const instruction = loadInstruction(typeof args.instruction === 'string' ? args.instruction : undefined)
  const { cases, excluded, recomputed, imported } = prepare(parsed.records, split, instruction)

  out.push('## Split')
  out.push('')
  out.push(`- Seed: \`${seed}\` · Verhältnis ${pct(ratios.dev, 0)}/${pct(ratios.cal, 0)}/${pct(ratios.holdout, 0)}`)
  out.push(`- Fälle: ${split.manifest.cases} · Gruppen: ${split.manifest.groups} · Prüfsumme: \`${split.manifest.checksum}\``)
  for (const s of ['dev', 'cal', 'holdout'] as Subset[]) {
    out.push(`- ${s}: ${split.manifest.counts[s].cases} Fälle in ${split.manifest.counts[s].groups} Gruppen`)
  }
  out.push(
    `- Instruktions-Notiz: ${instruction.name ? `\`${instruction.name}\`` : 'keine angegeben'} · Hash \`${instruction.hash}\` · ` +
      `weiche Freitextkriterien: ${instruction.softCriteriaPresent ? 'vorhanden (blockieren jedes skip)' : 'keine'}`,
  )
  out.push(
    `- Signale: ${recomputed} aus dem Inhalt neu gerechnet · ${imported} vorgerechnet übernommen ` +
      '(Inhalt schlägt Vorrechnung — eine alte Zahl darf nicht gegen die heutige Regel entscheiden).',
  )
  if (excluded.length) {
    out.push(`- **Nicht ausgewertet: ${excluded.length} Fälle.** Gründe:`)
    const byReason = new Map<string, string[]>()
    for (const e of excluded) byReason.set(e.reason, [...(byReason.get(e.reason) || []), e.id])
    for (const [reason, ids] of byReason) {
      out.push(`  - ${reason}: ${ids.length} (${ids.slice(0, 10).join(', ')}${ids.length > 10 ? ' …' : ''})`)
    }
  }
  out.push('')

  const syntheticShare = cases.filter((c) => c.record.source === 'synthetic').length / Math.max(1, cases.length)
  if (syntheticShare > 0) {
    out.push(
      `> **Hinweis:** ${pct(syntheticShare)} der Fälle sind synthetisch. Synthetische und ausgewählte ` +
        'Schwerfälle prüfen die Funktion, sie ergeben KEINE Alltagsverteilung — Coverage- und ' +
        'Fehlerzahlen daraus sind nicht auf den Posteingang übertragbar.',
    )
    out.push('')
  }

  // Kalibrierung (nur wenn Modellergebnisse vorliegen).
  const withDecisions = cases.filter((c) => c.record.decision).length
  const thresholds: Thresholds | null =
    num(args['risk-positive']) !== null && num(args['risk-negative']) !== null && num(args['impersonal-positive']) !== null
      ? {
          riskPositive: num(args['risk-positive']) as number,
          riskNegative: num(args['risk-negative']) as number,
          impersonalPositive: num(args['impersonal-positive']) as number,
        }
      : null

  const limits = {
    minCases: num(args['min-language-cases']) ?? DEFAULT_MIN_LANGUAGE_CASES,
    minGroups: num(args['min-language-groups']) ?? DEFAULT_MIN_LANGUAGE_GROUPS,
  }
  let calibration: PolicyCalibration | null = null
  out.push('## Kalibrierung')
  out.push('')
  if (withDecisions === 0) {
    out.push('- Der Datensatz enthält keine Modellergebnisse (`decision`). Kalibrierung und NLI-Arm entfallen.')
    out.push('- Das ist der erwartete Stand von Paket A: die lokale Inferenz entsteht erst in Paket B.')
  } else {
    const calCases = cases.filter((c) => c.subset === 'cal')
    const fit = fitCalibration(calCases, thresholds, limits)
    calibration = fit.calibration
    out.push(`- Grundlage: ${calCases.length} Fälle aus dem Kalibrierungsteil (${new Set(calCases.map((c) => c.record.group)).size} Gruppen).`)
    out.push('- Ziel je Frage: `needsReply`/`hasActionOrDate`/`urgent` gegen das gleichnamige Label, `impersonalInfo` gegen `safeToSkip`.')
    out.push('- `unclear` wird ausgelassen, nicht als Nein gezählt.')
    out.push(
      `- Kalibriert wird je SPRACHE getrennt. Mindestumfang pro Sprache und Frage: ` +
        `${limits.minCases} Fälle in ${limits.minGroups} Gruppen` +
        (limits.minCases !== DEFAULT_MIN_LANGUAGE_CASES || limits.minGroups !== DEFAULT_MIN_LANGUAGE_GROUPS
          ? ' — **vom Standard abgesenkt/angehoben** (Standard: ' +
            `${DEFAULT_MIN_LANGUAGE_CASES}/${DEFAULT_MIN_LANGUAGE_GROUPS}). Zahlen darunter messen nichts.`
          : '.'),
    )
    for (const n of fit.notes) out.push(`- ${n}`)
    if (calibration) {
      out.push(`- Artefakt \`${calibration.id}\` · Fingerabdruck: Modell \`${calibration.fingerprint.modelId}\` ` +
        `(${calibration.fingerprint.modelRevision}, ${calibration.fingerprint.quantization}, ${calibration.fingerprint.runtime}), ` +
        `Hypothesen \`${calibration.fingerprint.hypothesisSet}\``)
      for (const lang of calibration.languages) {
        out.push(
          `- Temperaturen (${lang}): ` +
            DECISION_QUESTIONS.map((q) => `${q}=${nz(calibration!.temperature[lang][q], 2)}`).join(' · '),
        )
      }
      out.push(`- Datengrundlage (schwächste Sprache/Frage): ${calibration.fittedOn.cases} Fälle in ${calibration.fittedOn.groups} Gruppen.`)
      out.push(
        `- Schwellen (vom Nutzer gesetzt): riskPositive ${nz(calibration.riskPositive, 2)} · ` +
          `riskNegative ${nz(calibration.riskNegative, 2)} · impersonalPositive ${nz(calibration.impersonalPositive, 2)}`,
      )
    }
  }
  out.push('')

  // Arme rechnen, je Teilmenge.
  const wanted = typeof args.subset === 'string' ? [args.subset as Subset] : (['dev', 'cal', 'holdout'] as Subset[])
  out.push('## Arme')
  out.push('')
  const jsonReport: Record<string, unknown> = {
    dataset: path.basename(datasetPath),
    versions: { label: LABEL_SCHEMA_VERSION, policy: POLICY_VERSION, hypotheses: HYPOTHESIS_SET_VERSION, signals: SIGNALS_VERSION },
    split: split.manifest,
    syntheticShare,
    arms: [] as unknown[],
  }

  for (const subset of wanted) {
    const subsetCases = cases.filter((c) => c.subset === subset)
    out.push(`### Teilmenge ${subset} — ${subsetCases.length} Fälle`)
    out.push('')
    if (subsetCases.length === 0) {
      out.push('Keine Fälle in dieser Teilmenge.')
      out.push('')
      continue
    }
    const reports: RouteReport[] = [routeReport('nur Regeln', armRules(subsetCases, false))]
    // Die experimentelle Negativregel läuft NUR auf dem Kalibrierungsteil. Sie behauptet
    // das Gegenteil dessen, was die Schutzregeln können („kein positives Signal, also
    // irrelevant") — so etwas gehört erkundet, nicht im Holdout mitgemessen.
    if (args['experimental-negative-rule'] === true && subset === 'cal') {
      reports.push(routeReport('Regeln + experimentelle Negativregel (nur cal)', armRules(subsetCases, true)))
    }
    if (withDecisions > 0) {
      reports.push(routeReport(calibration ? 'Regeln + NLI (kalibriert)' : 'Regeln + NLI (ohne Artefakt)', armNli(subsetCases, calibration)))
    }
    for (const r of reports) {
      out.push(...formatRouteReport(r))
      ;(jsonReport.arms as unknown[]).push({ subset, ...r })
    }
  }

  // ── Zeitlich getrennter Nachtest ───────────────────────────────────────────
  // Der gruppierte Split beantwortet nicht, ob eine Regel auch auf SPÄTEREN Mails hält:
  // Absender, Vorlagen und die eigenen Kriterien ändern sich. Diese Fälle überlappen
  // bewusst mit den Teilmengen — es ist ein zweiter Schnitt durch dieselben Daten, kein
  // vierter Teil des Splits, und deshalb getrennt ausgewiesen.
  if (typeof args['temporal-cutoff'] === 'string') {
    const cutoff = args['temporal-cutoff'] as string
    out.push('## Zeitlich getrennter Nachtest')
    out.push('')
    let laterIds: string[] = []
    try {
      laterIds = temporalSubset(
        cases.map((c) => ({ id: c.record.id, receivedAt: c.record.receivedAt })),
        cutoff,
      )
    } catch (err) {
      out.push(`- ${err instanceof Error ? err.message : String(err)}`)
    }
    const later = cases.filter((c) => laterIds.includes(c.record.id))
    const laterGroups = new Set(later.map((c) => c.record.group)).size
    out.push(`- Stichtag: \`${cutoff}\` · ${later.length} Fälle in ${laterGroups} Gruppen (überlappt mit dev/cal/holdout).`)
    if (later.length === 0) {
      out.push('- Keine Fälle ab diesem Stichtag — der Nachtest sagt hier nichts.')
    } else {
      const trainedGroups = new Set(cases.filter((c) => c.subset !== 'holdout' && !laterIds.includes(c.record.id)).map((c) => c.record.group))
      const overlap = [...new Set(later.map((c) => c.record.group))].filter((g) => trainedGroups.has(g)).length
      if (overlap > 0) {
        out.push(
          `- **${overlap} dieser Gruppen kommen auch vor dem Stichtag vor.** Für diese Gruppen misst der Nachtest ` +
            'Wiedererkennung, nicht Übertragbarkeit.',
        )
      }
      for (const r of [
        routeReport('nur Regeln (nach Stichtag)', armRules(later, false)),
        ...(withDecisions > 0 ? [routeReport('Regeln + NLI (nach Stichtag)', armNli(later, calibration))] : []),
      ]) {
        out.push(...formatRouteReport(r))
        ;(jsonReport.arms as unknown[]).push({ subset: 'temporal', ...r })
      }
    }
    out.push('')
  }

  // Vergleichsarm: heutige Vollanalyse.
  const withBaseline = cases.filter((c) => c.record.baseline)
  out.push('## Vergleichsarm: heutige Vollanalyse')
  out.push('')
  if (withBaseline.length === 0) {
    out.push('- Keine `baseline`-Felder im Datensatz — die heutige Ausgabe wurde nicht miterfasst.')
  } else {
    const failed = withBaseline.filter((c) => c.record.baseline?.failed).length
    const comparable = withBaseline.filter((c) => c.record.labels.important !== 'unclear' && !c.record.baseline?.failed)
    const agree = comparable.filter((c) => (c.record.baseline?.relevant === true) === (c.record.labels.important === 'yes')).length
    const missed = comparable.filter((c) => c.record.labels.important === 'yes' && c.record.baseline?.relevant !== true)
    out.push(`- Fälle mit heutiger Ausgabe: ${withBaseline.length} · davon fehlgeschlagen: ${failed} (zählen mit, nicht weg)`)
    out.push(`- Übereinstimmung „relevant" mit dem Label „wichtig": ${agree} von ${comparable.length} (${pct(comparable.length ? agree / comparable.length : null)})`)
    out.push(`- Vom heutigen Verfahren als nicht relevant bewertete wichtige Mails: ${missed.length}`)
    out.push('- Das ist ein Vergleich, keine Bewertung des Goldstandards: die heutige Ausgabe ist nie die Wahrheit.')
  }
  out.push('')

  // Zweitbewertung.
  const doubled = cases
    .filter((c) => c.record.secondLabels)
    .map((c) => ({ id: c.record.id, labels: c.record.labels, secondLabels: c.record.secondLabels! }))
  out.push('## Zweitbewertung')
  out.push('')
  if (doubled.length === 0) {
    out.push('- Keine zweite manuelle Bewertung im Datensatz. Ohne sie ist unbekannt, wie stabil der Goldstandard ist.')
  } else {
    for (const a of agreementReport(doubled)) {
      out.push(
        `- \`${a.field}\`: ${a.agreed}/${a.cases} einig (${pct(a.agreementRate)}) · Kappa ${nz(a.kappa, 2)}` +
          (a.disagreedIds.length ? ` · uneinig: ${a.disagreedIds.slice(0, 10).join(', ')}` : ''),
      )
    }
    out.push('- Uneinige Fälle gehören geklärt und das Ergebnis dokumentiert, nicht gemittelt.')
  }
  out.push('')

  // Schwellen-Erkundung auf dem Kalibrierungsteil.
  if (args.sweep === true && withDecisions > 0) {
    out.push('## Schwellen-Übersicht (Erkundung, nur Kalibrierungsteil)')
    out.push('')
    out.push('Keine Empfehlung: Diese Tabelle zeigt, wie Coverage und Fehler mit der Schwelle wandern.')
    out.push('Eine Schwelle wird erst vor einem produktiven Gate gewählt — vom Nutzer, mit Risikobudget.')
    out.push('')
    out.push('| riskNegative | impersonalPositive | skip | wichtige übersprungen | obere 95-%-Grenze |')
    out.push('|---|---|---|---|---|')
    const calCases = cases.filter((c) => c.subset === 'cal')
    for (const rn of [0.02, 0.05, 0.1, 0.2]) {
      for (const ip of [0.8, 0.9, 0.95]) {
        const probe = fitCalibration(calCases, { riskPositive: 0.6, riskNegative: rn, impersonalPositive: ip }, limits).calibration
        if (!probe) continue
        const r = routeReport('probe', armNli(calCases, probe))
        out.push(
          `| ${rn} | ${ip} | ${r.routeCounts.skip} (${pct(r.skipCoverage)}) | ` +
            `${r.missedImportant.errors}/${r.missedImportant.cases} | ${pct(r.missedImportant.upperBound95)} |`,
        )
      }
    }
    out.push('')
  }

  // Kalibrierungsgüte.
  if (withDecisions > 0 && calibration) {
    out.push('## Kalibrierungsgüte (Holdout)')
    out.push('')
    const holdout = cases.filter((c) => c.subset === 'holdout')
    for (const q of DECISION_QUESTIONS) {
      const pairs: ProbabilityPair[] = []
      for (const c of holdout) {
        const d = c.record.decision
        if (!d || d.status !== 'ok' || !d.questions[q]) continue
        const y = ternaryToY(c.record.labels[QUESTION_TARGET[q]])
        if (y === null) continue
        const lang = c.signals.language
        // Nur Fälle in einer freigegebenen Sprache — für andere gibt es keine Temperatur,
        // und eine fremde anzuwenden wäre genau der Fehler, den die Trennung verhindert.
        if (!lang || !calibration.temperature[lang]) continue
        pairs.push({ p: entailmentProbability(d.questions[q].logits, calibration.temperature[lang][q]), y })
      }
      const ece = expectedCalibrationError(pairs, 10)
      out.push(
        `- \`${q}\`: ${pairs.length} Fälle · Brier ${nz(brierScore(pairs))} · ECE ${nz(ece.ece)} (10 gleich breite Bins)`,
      )
    }
    out.push('- Rohwerte bleiben im Datensatz erhalten; kalibriert wurde ausschließlich auf dem Kalibrierungsteil.')
    out.push('')
  }

  // Was diese Zahlen NICHT sagen.
  out.push('## Grenzen dieser Auswertung')
  out.push('')
  const importantHoldout = cases.filter((c) => c.subset === 'holdout' && c.record.labels.important === 'yes')
  const importantGroups = new Set(importantHoldout.map((c) => c.record.group)).size
  out.push(
    `- Im Holdout liegen ${importantHoldout.length} als wichtig gelabelte Fälle in ${importantGroups} Gruppen. ` +
      `Ohne einen einzigen Fehler wäre die obere 95-%-Grenze der Fehlerrate ${pct(zeroErrorUpperBound95(importantHoldout.length))} ` +
      `(auf Gruppen gerechnet ${pct(zeroErrorUpperBound95(importantGroups))}). Für „unter 1 %" braucht es 299 solche Fälle.`,
  )
  out.push('- Laufzeit, Speicher und Energie sind hier nicht gemessen — das gehört auf den Zielrechner (Paket B/C).')
  out.push('- Es wurde kein Modell geladen, kein Netz benutzt und keine Maildatei verändert.')
  out.push(
    '- Die weichen Freitextkriterien sind in diesem Piloten NICHT abgedeckt. Solange sie vorhanden sind, ' +
      'endet jede Mail in der Policy und in allen hier gerechneten Armen spätestens bei `review` — ' +
      'die dadurch verlorene Einsparung steht oben je Arm.',
  )
  if (!args['temporal-cutoff']) {
    out.push(
      '- Kein zeitlich getrennter Nachtest gerechnet. Ob die Regeln auch auf SPÄTEREN Mails halten, ' +
        'ist damit offen — dafür `--temporal-cutoff <ISO>` setzen.',
    )
  }
  for (const f of RISK_LABEL_FIELDS) {
    const n = cases.filter((c) => c.record.labels[f] === 'unclear').length
    if (n > 0) out.push(`- \`${f}\` ist in ${n} Fällen unklar gelabelt. Unklar blockiert Skip und wird nicht als Nein gerechnet.`)
  }
  out.push('')

  const text = out.join('\n')
  console.log(text)

  if (typeof args.out === 'string') {
    fs.writeFileSync(args.out, text, 'utf-8')
    console.log(`\nBericht geschrieben: ${args.out}`)
  }
  if (typeof args.json === 'string') {
    fs.writeFileSync(args.json, JSON.stringify(jsonReport, null, 2), 'utf-8')
    console.log(`Maschinenlesbarer Bericht geschrieben: ${args.json}`)
  }
  return 0
}

// Im Testlauf NICHT ausführen: diese Datei wird dort importiert, um ihre Funktionen
// (Signalbeschaffung, Kalibrierungsbau, Arme) direkt zu prüfen. Ohne die Sperre liefe bei
// jedem Import der ganze Auswertungslauf samt `process.exit` los.
if (!process.env.VITEST) {
  try {
    process.exit(main())
  } catch (err) {
    console.error(`Fehler: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
