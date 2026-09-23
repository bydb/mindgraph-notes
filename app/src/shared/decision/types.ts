// E-Mail-Decision-Pilot — fachlicher Vertrag (docs/codex-collab/email-decision-pilot.md §2).
//
// Dieses Modul beschreibt NUR Daten. Es enthält keine Inferenz, kein fs, kein Netz und
// keinen Zustand — damit Policy, Auswertung und (später) der Worker dieselben Begriffe
// benutzen, ohne dass der reine Teil die ONNX-Runtime mitzieht.
//
// Drei Dinge sind hier Absicht und sollten beim Umbau nicht verloren gehen:
//
//   1. `DecisionResult` ist ein TECHNISCHES Ergebnis. `status: 'ok'` heißt „gerechnet",
//      nicht „sicher". Die Unsicherheitsentscheidung trifft allein die Policy
//      (emailPolicy.ts) — sonst wandert eine Schwelle unbemerkt in den Adapter.
//   2. Es werden rohe Entailment/Neutral/Contradiction-Werte transportiert. Die
//      Neutral-Klasse wird NICHT verworfen (die Zero-Shot-Pipeline des installierten
//      Transformers-Pakets tut genau das im Multi-Label-Modus) — ein hoher
//      Entailment-Anteil aus zwei Klassen sagt etwas anderes als aus drei.
//   3. Ergebnisse tragen keine Freitexte. Kein generierter Grund, keine Betreffzeile,
//      kein Body-Ausschnitt, keine Fehlermeldung mit Mailinhalt. Was nicht als fester
//      Code ausdrückbar ist, wird nicht gespeichert.

// ── Versionen der Messidentität ──────────────────────────────────────────────
// Jede Änderung an Fragen, Policy oder Labelschema macht alte Messungen unvergleichbar.
// Die Versionen stehen deshalb an jedem Ergebnis und in jedem Bericht.

export const HYPOTHESIS_SET_VERSION = 'email-decision-q4@1'
export const POLICY_VERSION = 'email-decision-policy@1'
export const LABEL_SCHEMA_VERSION = 'email-decision-labels@1'

// ── Die vier festen Fragen ───────────────────────────────────────────────────

export type DecisionQuestionId = 'needsReply' | 'hasActionOrDate' | 'urgent' | 'impersonalInfo'

export const DECISION_QUESTIONS: readonly DecisionQuestionId[] = [
  'needsReply',
  'hasActionOrDate',
  'urgent',
  'impersonalInfo',
]

/**
 * Risikofragen: Ein Ja (oder ein nicht ausreichend sicheres Nein) verbietet jedes
 * hypothetische Überspringen. `impersonalInfo` gehört bewusst NICHT dazu — sie ist die
 * positive Begründung der Skip-Klasse, nicht ein Risiko.
 */
export const RISK_QUESTIONS: readonly DecisionQuestionId[] = ['needsReply', 'hasActionOrDate', 'urgent']

export interface HypothesisSet {
  version: string
  language: 'de' | 'en'
  hypotheses: Record<DecisionQuestionId, string>
}

// Die Hypothesen sind Teil der Auswertungsversion: wer sie umformuliert, misst ein
// anderes Modell. Sie sind aus der Sicht des EMPFÄNGERS formuliert — „Frage beantworten",
// nicht „Frage stellen" (dieselbe Falle wie bei der Aufgaben-Extraktion).
export const HYPOTHESES_DE: HypothesisSet = {
  version: HYPOTHESIS_SET_VERSION,
  language: 'de',
  hypotheses: {
    needsReply: 'Diese Nachricht erwartet eine Antwort des Empfängers.',
    hasActionOrDate:
      'Diese Nachricht enthält eine Handlung, eine Frist, eine Einladung oder eine Terminänderung für den Empfänger.',
    urgent: 'Diese Nachricht ist zeitkritisch.',
    impersonalInfo:
      'Diese Nachricht ist ein unpersönlicher Newsletter oder eine rein automatische Information.',
  },
}

export const HYPOTHESES_EN: HypothesisSet = {
  version: HYPOTHESIS_SET_VERSION,
  language: 'en',
  hypotheses: {
    needsReply: 'This message expects a reply from the recipient.',
    hasActionOrDate:
      'This message contains an action, a deadline, an invitation or a schedule change for the recipient.',
    urgent: 'This message is time critical.',
    impersonalInfo: 'This message is an impersonal newsletter or a purely automatic notification.',
  },
}

/** Sprachen, für die überhaupt ein Hypothesensatz existiert. Alles andere → `review`. */
export const SUPPORTED_HYPOTHESIS_LANGUAGES: readonly string[] = ['de', 'en']

export function hypothesisSetFor(language: string | null | undefined): HypothesisSet | null {
  if (language === 'de') return HYPOTHESES_DE
  if (language === 'en') return HYPOTHESES_EN
  return null
}

// ── Eingabe der Engine ───────────────────────────────────────────────────────

/**
 * Was der Worker sieht. Bewusst NICHT enthalten: Dateipfade, URLs, Anhangsbytes,
 * Zugangsdaten, Vault-Inhalte, die Message-ID im Klartext. Der Worker bekommt Text und
 * vorberechnete Zahlen — mehr braucht eine NLI-Inferenz nicht, und mehr soll sie nicht
 * anfassen können.
 */
export interface DecisionInput {
  /** Kennung dieses Messauftrags (verworfen, sobald die Generation wechselt). */
  jobId: string
  /** Pseudonyme, lokal per HMAC abgeleitete Mailkennung. Nicht anonym, aber inhaltsfrei. */
  emailKey: string
  subject: string
  bodyText: string
  /** Empfängerperspektive: direkt adressiert oder über Verteiler/CC mitgelesen. */
  recipient: { addressedDirectly: boolean; recipientCount: number }
  hasAttachments: boolean
  /** Threadhinweise — nur das Vorhandensein, nicht die Message-IDs selbst. */
  thread: { inReplyTo: boolean; references: number }
  /** Vorab deterministisch gerechnete harte Signale (shared/emailRelevance.ts). */
  hardFloor: number
  hardBoost: number
  /** Version/Hash der Instruktions-Notiz — ändert sie sich, gilt die Messung nicht mehr. */
  instructionHash: string
  /** Sprache, sofern erkannt. `null` heißt „unbekannt", nicht „Deutsch". */
  language: string | null
}

// ── Ergebnis der Engine ──────────────────────────────────────────────────────

export type DecisionStatus = 'ok' | 'abstain'

/**
 * Feste Ursachencodes. Freie Fehlertexte sind verboten: sie enthalten regelmäßig den
 * Mailinhalt, an dem die Runtime gescheitert ist.
 */
export type AbstainReason =
  | 'timeout'
  | 'model-missing'
  | 'invalid-label-mapping'
  | 'non-finite-score'
  | 'unsupported-language'
  | 'incomplete-text'
  | 'aborted'
  | 'technical-error'

export const ABSTAIN_REASONS: readonly AbstainReason[] = [
  'timeout',
  'model-missing',
  'invalid-label-mapping',
  'non-finite-score',
  'unsupported-language',
  'incomplete-text',
  'aborted',
  'technical-error',
]

/** Feste Reihenfolge der NLI-Klassen. Das Label-Mapping des Modells wird dagegen geprüft. */
export type NliTriple = readonly [entailment: number, neutral: number, contradiction: number]

export interface QuestionScores {
  /** Rohe Logits — die eigentliche Messgröße; kalibriert wird später und getrennt. */
  logits: NliTriple
  /** Softmax über alle DREI Klassen. Keine Multi-Label-Normalisierung ohne Neutral. */
  probs: NliTriple
  /**
   * Kalibrierte Entailment-Wahrscheinlichkeit, nur mit Kalibrierungsartefakt.
   * `undefined` heißt „nicht kalibriert" — und damit: kein Skip (siehe Policy).
   */
  calibrated?: number
}

/**
 * Abdeckung der Eingabe. `complete: false` heißt: Prämisse + Hypothese + Spezialtokens
 * passten nicht ins Fenster. Abgeschnittener Text ist kein Negativbeweis — die Policy
 * schickt solche Fälle nach `review`.
 */
export interface DecisionCoverage {
  complete: boolean
  promptTokens: number
  maxTokens: number
  bodyChars: number
  /** Wie viele Zeichen des Bodys tatsächlich im Fenster lagen. */
  bodyCharsUsed: number
}

/** Herkunft eines Ergebnisses. Ohne diese Angaben ist eine Messung nicht zuzuordnen. */
export interface DecisionArtifacts {
  hypothesisSet: string
  modelId: string
  modelRevision: string
  quantization: string
  /** Kennung des Kalibrierungsartefakts oder `null`, wenn ohne Kalibrierung gerechnet. */
  calibration: string | null
  runtime: string
}

export interface DecisionOk {
  status: 'ok'
  questions: Record<DecisionQuestionId, QuestionScores>
  coverage: DecisionCoverage
  /** Anzahl der tatsächlich gerechneten Prämisse/Hypothese-Paare (vier Fragen sind nicht gratis). */
  pairs: number
  tokens: number
  durationMs: number
  artifacts: DecisionArtifacts
}

export interface DecisionAbstain {
  status: 'abstain'
  reason: AbstainReason
  coverage?: DecisionCoverage
  durationMs: number
  artifacts: DecisionArtifacts
}

export type DecisionResult = DecisionOk | DecisionAbstain

/**
 * Das gesamte Interface zur Inferenz. Kein `choice`, kein ordinaler `score`, kein
 * allgemeines „frag das Modell irgendetwas" — ein zweiter konkreter Verbraucher müsste
 * das erst rechtfertigen. `signal` bricht wirklich ab; ein Timeout beendet den Worker,
 * nicht nur das Promise.
 */
export interface DecisionEngine {
  evaluate(input: DecisionInput, signal?: AbortSignal): Promise<DecisionResult>
}

// ── Routen ───────────────────────────────────────────────────────────────────

/**
 * `skip` ist im Piloten AUSSCHLIESSLICH hypothetisch: es wird gemessen, nie ausgeführt.
 * `review` heißt „unsicher" und bedeutet im späteren Gate den Rückfall auf die
 * bisherige Vollanalyse — im Piloten öffnet es keinen Dialog.
 */
export type DecisionRoute = 'skip' | 'full-analysis' | 'review'

export const DECISION_ROUTES: readonly DecisionRoute[] = ['skip', 'full-analysis', 'review']

/** Betriebsart des Piloten. Ein produktives `skip` gibt es hier nicht. */
export type DecisionMode = 'off' | 'shadow'

export const DEFAULT_DECISION_MODE: DecisionMode = 'off'
