// E-Mail-Decision-Pilot — reine Routing-Policy (docs/codex-collab/email-decision-pilot.md §2).
//
// Hier und NUR hier fällt die Entscheidung `skip | full-analysis | review`. Der Adapter
// liefert Zahlen, diese Datei legt sie aus. Zwei Regeln halten das sauber:
//
//   * Ein technisches `ok` der Engine heißt „gerechnet", nicht „sicher". Unsicherheit ist
//     eine Entscheidung dieser Policy, keine des Modells.
//   * Die Reihenfolge der Stufen ist Teil der Sicherheit. Schutzsignale (Stufe 2) stehen
//     VOR jeder Modellaussage; ohne Kalibrierungsartefakt gibt es gar kein `skip`.
//
// `skip` ist im Piloten hypothetisch: es wird gezählt, nie ausgeführt.

import type { HardSignalKind } from '../emailRelevance'
import {
  DECISION_QUESTIONS,
  POLICY_VERSION,
  RISK_QUESTIONS,
  SUPPORTED_HYPOTHESIS_LANGUAGES,
  type DecisionQuestionId,
  type DecisionResult,
  type DecisionRoute,
} from './types'

// ── Eingaben ─────────────────────────────────────────────────────────────────

/**
 * Deterministische Signale einer Mail — inhaltsfrei, vorab gerechnet (signals.ts).
 * Was hier steht, darf in einen Messdatensatz; was nicht hier steht, ist Inhalt.
 */
export interface PolicySignals {
  /** Mindest-Score aus VIP/Domain/Kontakt (shared/emailRelevance.ts). */
  hardFloor: number
  /** Additiver Schlüsselwort-Zuschlag. */
  hardBoost: number
  /** Arten der zutreffenden harten Signale. Routing-Hinweis, KEINE Authentifizierung:
   *  ein Anzeigename ist absenderkontrolliert, ein bekannter Absender beweist nichts. */
  hardSignalKinds: HardSignalKind[]
  hasAttachments: boolean
  /** In-Reply-To oder References vorhanden — die Mail hängt an einem Vorgang. */
  hasThreadContext: boolean
  /** Deterministisch erkannter Handlungs-/Terminmarker (Frist, Einladung, Termin …). */
  hasActionMarker: boolean
  /** Newsletter-/No-Reply-Merkmal. NUR für die ausdrücklich experimentelle Negativregel. */
  newsletterMarker: boolean
  bodyPresent: boolean
  bodyChars: number
  /** Die Instruktions-Notiz enthält weiche Freitextkriterien. */
  softCriteriaPresent: boolean
  /** Erkannte Sprache. `null` heißt „unbekannt", nicht „Deutsch". */
  language: string | null
}

export function emptyPolicySignals(): PolicySignals {
  return {
    hardFloor: 0,
    hardBoost: 0,
    hardSignalKinds: [],
    hasAttachments: false,
    hasThreadContext: false,
    hasActionMarker: false,
    newsletterMarker: false,
    bodyPresent: false,
    bodyChars: 0,
    softCriteriaPresent: false,
    language: null,
  }
}

/**
 * Kalibrierungsartefakt. Ohne gültiges Artefakt kennt die Policy keine Skip-Schwelle —
 * eine Softmax-Zahl aus einem NLI-Modell ist keine Wahrscheinlichkeit dafür, dass eine
 * Mail gefahrlos übersprungen werden kann.
 */
/**
 * Woran eine Kalibrierung hängt. Eine Temperatur ist keine allgemeine Eigenschaft — sie
 * gehört zu EINEM Modell in EINER Quantisierung mit EINEM Hypothesensatz. Ohne diesen
 * Fingerabdruck ließe sich ein Artefakt auf Ergebnisse eines anderen Modells anwenden,
 * und das Ergebnis sähe genauso gültig aus.
 */
export interface CalibrationFingerprint {
  modelId: string
  modelRevision: string
  quantization: string
  runtime: string
  hypothesisSet: string
  signalsVersion: string
  labelSchema: string
}

export interface PolicyCalibration {
  id: string
  fingerprint: CalibrationFingerprint
  /**
   * Sprachen, für die das Artefakt TATSÄCHLICH gemessen wurde — nicht, für die es gelten
   * soll. Andere Sprachen → `review`. Die Liste ist abgeleitet aus `temperature`.
   */
  languages: string[]
  /**
   * Temperatur je SPRACHE und Frage (Temperature Scaling auf den Logits, calibration.ts).
   *
   * Sprachgetrennt, weil eine Temperatur keine Eigenschaft des Modells ist, sondern die
   * seiner Ausgabeverteilung auf EINER Eingabeverteilung. Ein mehrsprachiges NLI-Modell
   * ist auf Deutsch anders sicher als auf Englisch; eine gemeinsam bestimmte Temperatur
   * gälte dann für beide Sprachen nicht ganz — und beide Sprachen sähen kalibriert aus.
   */
  temperature: Record<string, Record<DecisionQuestionId, number>>
  /** Ab dieser kalibrierten Entailment-Wahrscheinlichkeit gilt eine Risikofrage als JA. */
  riskPositive: number
  /** Unter diesem Wert gilt eine Risikofrage als ausreichend sicheres NEIN. */
  riskNegative: number
  /** Mindestsicherheit für die Klasse „unpersönliche Information". */
  impersonalPositive: number
  /**
   * Datengrundlage. Eine Schwelle ohne Fallzahl ist keine Aussage. `cases`/`groups` sind
   * bewusst das MINIMUM über die vier Fragen: ein Artefakt ist so belastbar wie seine
   * schwächste Frage, nicht wie seine stärkste.
   */
  fittedOn: {
    cases: number
    groups: number
    subset: 'cal'
    /** Fallzahl je Sprache und Frage — die eigentliche Datengrundlage. */
    perLanguage?: Record<string, Record<DecisionQuestionId, { cases: number; groups: number }>>
  }
}

export function isValidCalibration(c: PolicyCalibration | null | undefined): c is PolicyCalibration {
  if (!c || typeof c !== 'object') return false
  if (typeof c.id !== 'string' || c.id.trim() === '') return false
  if (!Array.isArray(c.languages) || c.languages.length === 0) return false
  if (!c.languages.every((l) => typeof l === 'string' && l.trim() !== '')) return false
  const fp = c.fingerprint
  if (!fp || typeof fp !== 'object') return false
  for (const f of ['modelId', 'modelRevision', 'quantization', 'runtime', 'hypothesisSet', 'signalsVersion', 'labelSchema'] as const) {
    if (typeof fp[f] !== 'string' || fp[f].trim() === '') return false
  }
  if (!c.temperature || typeof c.temperature !== 'object') return false
  // Jede freigegebene Sprache braucht ihre eigenen vier Temperaturen. Eine Sprache in der
  // Liste ohne eigene Kalibrierung wäre eine Freigabe ohne Messung.
  for (const lang of c.languages) {
    const perQuestion = c.temperature[lang]
    if (!perQuestion || typeof perQuestion !== 'object') return false
    for (const q of DECISION_QUESTIONS) {
      const t = perQuestion[q]
      if (!Number.isFinite(t) || t <= 0) return false
    }
  }
  if (Object.keys(c.temperature).length !== c.languages.length) return false
  const inUnit = (x: number): boolean => Number.isFinite(x) && x >= 0 && x <= 1
  if (!inUnit(c.riskPositive) || !inUnit(c.riskNegative) || !inUnit(c.impersonalPositive)) return false
  // Ein Negativ-Schwellwert über dem Positiv-Schwellwert wäre ein Loch: derselbe Wert
  // würde „sicher nein" und „ja" gleichzeitig bedeuten.
  if (c.riskNegative > c.riskPositive) return false
  if (!c.fittedOn || c.fittedOn.subset !== 'cal') return false
  if (!Number.isFinite(c.fittedOn.cases) || c.fittedOn.cases <= 0) return false
  if (!Number.isFinite(c.fittedOn.groups) || c.fittedOn.groups <= 0) return false
  return true
}

export interface PolicyInput {
  /** Ausdrückliche Neu-/Einzelanalyse durch den Nutzer — schlägt jede Messung. */
  explicitRequest: boolean
  signals: PolicySignals
  /** Ergebnis der Engine. `null` = kein Modellergebnis (z.B. der Arm „nur Regeln"). */
  decision: DecisionResult | null
  calibration: PolicyCalibration | null
  /**
   * Sind die weichen Freitextkriterien der Instruktions-Notiz abgedeckt?
   * Im ersten Piloten IMMER false — vier generische Fragen ersetzen kein beliebiges
   * persönliches Kriterium. Die dadurch verlorene Einsparung wird im Bericht ausgewiesen.
   */
  softCriteriaCovered?: boolean
}

// ── Ausgabe ──────────────────────────────────────────────────────────────────

export type PolicyReasonCode =
  | 'explicit-request'
  | 'hard-signal-positive'
  | 'attachment'
  | 'thread-context'
  | 'action-marker'
  | 'invalid-input'
  | 'body-missing'
  | 'model-not-run'
  | 'technical-abstain'
  | 'coverage-incomplete'
  | 'soft-criteria-uncovered'
  | 'language-unsupported'
  | 'calibration-missing'
  | 'calibration-language-mismatch'
  | 'calibration-scores-missing'
  | 'model-risk-positive'
  | 'model-risk-uncertain'
  | 'impersonal-uncertain'
  | 'calibrated-negative'
  | 'experimental-negative-rule'

/** Stufe der Policy, die entschieden hat (§2, Reihenfolge 1–5). */
export type PolicyStage = 1 | 2 | 3 | 4 | 5

export interface PolicyDecision {
  route: DecisionRoute
  stage: PolicyStage
  /** Der ausschlaggebende Code. */
  reasonCode: PolicyReasonCode
  /** Weitere zutreffende Codes — rein informativ, nie generierter Text. */
  notes: PolicyReasonCode[]
  policyVersion: string
}

function decide(
  route: DecisionRoute,
  stage: PolicyStage,
  codes: PolicyReasonCode[],
): PolicyDecision {
  return { route, stage, reasonCode: codes[0], notes: codes.slice(1), policyVersion: POLICY_VERSION }
}

// ── Stufen ───────────────────────────────────────────────────────────────────

/** Stufe 2: positive Schutzsignale. Sie stehen vor jeder Modellaussage. */
export function positiveProtectionCodes(s: PolicySignals): PolicyReasonCode[] {
  const codes: PolicyReasonCode[] = []
  // Defensiv gegen kaputte Eingaben: eine Schutzstufe darf nicht werfen. Ein Absturz im
  // Schattenbetrieb wäre schlimmer als ein `review` — er zieht den beobachteten Pfad mit.
  // Strukturfehler fängt zusätzlich Stufe 3 (`invalid-input`) ab.
  if (!s || typeof s !== 'object') return codes
  const hardPositive =
    (Number.isFinite(s.hardFloor) && s.hardFloor > 0) ||
    (Number.isFinite(s.hardBoost) && s.hardBoost > 0) ||
    (Array.isArray(s.hardSignalKinds) && s.hardSignalKinds.length > 0)
  if (hardPositive) codes.push('hard-signal-positive')
  if (s.hasAttachments) codes.push('attachment')
  if (s.hasThreadContext) codes.push('thread-context')
  if (s.hasActionMarker) codes.push('action-marker')
  return codes
}

/** Eingabe, der nicht zu trauen ist — fail-closed nach `review`, nie nach `skip`. */
function invalidInput(s: PolicySignals): boolean {
  if (!s || typeof s !== 'object') return true
  if (!Number.isFinite(s.hardFloor) || !Number.isFinite(s.hardBoost)) return true
  if (!Number.isFinite(s.bodyChars) || s.bodyChars < 0) return true
  if (!Array.isArray(s.hardSignalKinds)) return true
  if (s.bodyPresent && s.bodyChars === 0) return true
  return false
}

/** Stufe 3: alles, was eine Negativaussage unbrauchbar macht. */
function blockerCodes(input: PolicyInput): PolicyReasonCode[] {
  const codes: PolicyReasonCode[] = []
  const s = input.signals
  if (invalidInput(s)) codes.push('invalid-input')
  if (!s.bodyPresent || s.bodyChars === 0) codes.push('body-missing')

  if (input.decision === null) {
    codes.push('model-not-run')
  } else if (input.decision.status === 'abstain') {
    codes.push('technical-abstain')
  } else if (!input.decision.coverage.complete) {
    // Abgeschnittener Text ist kein Negativbeweis: der weggefallene Absatz ist genau der,
    // in dem die Frist steht. Keine Chunk-Aggregation im ersten Piloten.
    codes.push('coverage-incomplete')
  }

  if (s.softCriteriaPresent && input.softCriteriaCovered !== true) codes.push('soft-criteria-uncovered')
  if (!s.language || !SUPPORTED_HYPOTHESIS_LANGUAGES.includes(s.language)) codes.push('language-unsupported')

  if (!isValidCalibration(input.calibration)) {
    codes.push('calibration-missing')
  } else if (s.language && !input.calibration.languages.includes(s.language)) {
    codes.push('calibration-language-mismatch')
  }
  return codes
}

// ── Hauptregel ───────────────────────────────────────────────────────────────

/**
 * Die hypothetische Routing-Policy in der festgelegten Reihenfolge. Rein: gleiche
 * Eingabe, gleiche Ausgabe, kein Zeitbezug, kein Zufall.
 */
export function evaluateRoutingPolicy(input: PolicyInput): PolicyDecision {
  // 1 — Der Nutzer hat ausdrücklich analysieren lassen.
  if (input.explicitRequest) return decide('full-analysis', 1, ['explicit-request'])

  // 2 — Positive Schutzsignale.
  const positives = positiveProtectionCodes(input.signals)
  if (positives.length > 0) return decide('full-analysis', 2, positives)

  // 3 — Gründe, aus denen ein Nein nichts wert wäre.
  const blockers = blockerCodes(input)
  if (blockers.length > 0) return decide('review', 3, blockers)

  // Ab hier ist `decision` ein `ok` und `calibration` gültig (Stufe 3 hätte sonst gegriffen).
  const decision = input.decision as Extract<DecisionResult, { status: 'ok' }>
  const cal = input.calibration as PolicyCalibration

  // Ein kalibrierter Wert ist eine Wahrscheinlichkeit. „Endlich" genügt als Prüfung NICHT:
  // drei Risikowerte von -1 lägen unter jeder Negativschwelle und eine 2 über jeder
  // Positivschwelle — eine beschädigte oder fremd erzeugte Eingabe sähe damit besonders
  // sicher aus statt ungültig. Die Policy ist die gemeinsame Grenze für spätere Pakete;
  // was sie hier nicht prüft, prüft dann niemand.
  const calibratedOf = (q: DecisionQuestionId): number | null => {
    const v = decision.questions?.[q]?.calibrated
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  for (const q of DECISION_QUESTIONS) {
    const v = calibratedOf(q)
    if (v === null) return decide('review', 3, ['calibration-scores-missing'])
    if (v < 0 || v > 1) return decide('review', 3, ['invalid-input', 'calibration-scores-missing'])
  }

  // 4 — Das Modell sieht Antwort-/Handlungsbedarf oder Dringlichkeit.
  const risky = RISK_QUESTIONS.filter((q) => (calibratedOf(q) as number) >= cal.riskPositive)
  if (risky.length > 0) return decide('full-analysis', 4, ['model-risk-positive'])

  // 5 — Nur ein durchgehend sicheres Nein plus sichere Informationsklasse erlaubt `skip`.
  const uncertain = RISK_QUESTIONS.filter((q) => (calibratedOf(q) as number) > cal.riskNegative)
  if (uncertain.length > 0) return decide('review', 5, ['model-risk-uncertain'])
  if ((calibratedOf('impersonalInfo') as number) < cal.impersonalPositive) {
    return decide('review', 5, ['impersonal-uncertain'])
  }
  return decide('skip', 5, ['calibrated-negative'])
}

// ── Ehrliche Regel-Baseline ──────────────────────────────────────────────────

export interface RuleBaselineOptions {
  /**
   * Ausdrücklich EXPERIMENTELL: Newsletter-/No-Reply-Merkmal als Negativregel.
   * Aus dem Fehlen positiver Regeln folgt keine Irrelevanz — diese Regel behauptet das
   * Gegenteil und darf deshalb nur auf dem Kalibrierungssatz verglichen werden.
   */
  experimentalNegativeRule?: boolean
  explicitRequest?: boolean
}

/**
 * Codes, die die experimentelle Negativregel übergehen DARF: genau die beiden, die nur
 * besagen, dass in diesem Arm kein Modell gelaufen ist. Alles andere bleibt stehen.
 *
 * Der Unterschied ist nicht formal. Übergeht die Regel auch `body-missing`,
 * `language-unsupported`, `coverage-incomplete` oder `soft-criteria-uncovered`, dann
 * behandelt sie FEHLENDE Daten als Negativbeleg — eine Mail ohne lesbaren Text wäre dann
 * „unwichtig, weil nichts drinsteht". Damit wäre der Arm keine Obergrenze einer reinen
 * Regel-Politik mehr, sondern ein Stressarm mit geschönter Coverage.
 */
const MODEL_ONLY_BLOCKERS: readonly PolicyReasonCode[] = ['model-not-run', 'calibration-missing']

/**
 * „Nur Regeln" als Vergleichsarm: positive Schutzregeln → Vollanalyse, sonst `review`.
 * Das ist derselbe Weg wie oben mit `decision: null` — bewusst, damit die Baseline nicht
 * versehentlich großzügiger wird als die Policy.
 */
export function evaluateRuleBaseline(
  signals: PolicySignals,
  options: RuleBaselineOptions = {},
): PolicyDecision {
  const base = evaluateRoutingPolicy({
    explicitRequest: options.explicitRequest === true,
    signals,
    decision: null,
    calibration: null,
  })
  if (base.route !== 'review' || options.experimentalNegativeRule !== true) return base
  if (!signals.newsletterMarker) return base
  const codes = [base.reasonCode, ...base.notes]
  if (!codes.every((c) => MODEL_ONLY_BLOCKERS.includes(c))) return base
  // Stufe 2, weil es eine Regelentscheidung ist — die übergangenen Codes bleiben als
  // Notizen sichtbar, damit im Bericht steht, worüber diese Regel hinweggeht.
  return decide('skip', 2, ['experimental-negative-rule', ...codes])
}
