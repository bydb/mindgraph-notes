// Prüfung der Auswertungs-CLI selbst — nicht nur ihrer Bausteine.
//
// Drei Dinge entscheiden sich erst HIER, in der Verdrahtung, und genau dort saßen die
// Befunde der Prüfrunde: woher die Signale kommen (F09), woran die Kalibrierung hängt
// (F10) und was die experimentelle Negativregel übergehen darf (F11). Die Daten dieser
// Datei sind im Test erzeugt — sie sind eine Funktionsprobe, keine Messung.
import { describe, it, expect } from 'vitest'
import {
  armNli,
  armRules,
  fitCalibration,
  prepare,
  DEFAULT_MIN_LANGUAGE_CASES,
  type InstructionContext,
  type Thresholds,
} from './email-decision-eval'
import { parseLabelJsonl, type LabelRecord } from '../src/shared/decision/labels'
import { hashInstruction, SIGNALS_VERSION } from '../src/shared/decision/signals'
import { splitByGroup, type SplitResult } from '../src/shared/decision/split'
import { emptyRelevanceConfig, parseRelevanceConfig } from '../src/shared/emailRelevance'
import { DECISION_QUESTIONS, LABEL_SCHEMA_VERSION, type DecisionQuestionId, type NliTriple } from '../src/shared/decision/types'

const NOTE_WITH_SOFT = '# Instruktionen\n\nAlles zum Medienzentrum ist wichtig.\n'
const INSTR_SOFT: InstructionContext = {
  config: parseRelevanceConfig(NOTE_WITH_SOFT),
  softCriteriaPresent: true,
  hash: hashInstruction(NOTE_WITH_SOFT),
  name: 'test.md',
}
const INSTR_NONE: InstructionContext = {
  config: emptyRelevanceConfig(),
  softCriteriaPresent: false,
  hash: hashInstruction(''),
  name: null,
}

const DE_BODY =
  'Sehr geehrte Damen und Herren, wir teilen Ihnen mit, dass die Unterlagen vorliegen und nicht weiter bearbeitet werden. Mit freundlichen Gruessen'

function baseRecord(over: Partial<LabelRecord> = {}): LabelRecord {
  const raw = {
    schema: LABEL_SCHEMA_VERSION,
    id: 'case-1',
    group: 'g1',
    receivedAt: '2026-03-01T08:00:00Z',
    source: 'synthetic',
    labels: { important: 'no', needsReply: 'no', hasActionOrDate: 'no', urgent: 'no', safeToSkip: 'yes' },
    ...over,
  }
  const parsed = parseLabelJsonl(JSON.stringify(raw))
  if (parsed.records.length !== 1) {
    throw new Error('Testdatensatz ist selbst ungültig: ' + parsed.issues.map((i) => i.detail).join(' | '))
  }
  return parsed.records[0]
}

function splitOf(records: readonly LabelRecord[], subset: 'dev' | 'cal' | 'holdout' = 'cal'): SplitResult {
  const real = splitByGroup(records.map((r) => ({ id: r.id, group: r.group })), 'test-seed')
  // Für diese Prüfungen soll die Teilmenge feststehen, nicht der Hash entscheiden.
  for (const r of records) real.assignment.set(r.id, subset)
  return real
}

describe('prepare — Signalbeschaffung (F09)', () => {
  const STALE_SIGNALS = {
    hardFloor: 0,
    hardBoost: 0,
    hardSignalKinds: [],
    hasAttachments: false,
    hasThreadContext: false,
    hasActionMarker: false,
    newsletterMarker: true,
    bodyPresent: true,
    bodyChars: 300,
    softCriteriaPresent: false,
    language: 'de',
  }

  it('rechnet Signale aus dem Inhalt IMMER neu — Inhalt schlägt Vorrechnung', () => {
    const record = baseRecord({
      content: { from: { address: 'newsletter@shop.example' }, subject: 'Newsletter', bodyText: DE_BODY },
      signals: STALE_SIGNALS,
      signalsMeta: { signalsVersion: SIGNALS_VERSION, instructionHash: INSTR_SOFT.hash },
    } as Partial<LabelRecord>)
    const { cases, recomputed, imported } = prepare([record], splitOf([record]), INSTR_SOFT)
    expect(recomputed).toBe(1)
    expect(imported).toBe(0)
    // Die neue Rechnung kennt die weichen Kriterien der heutigen Notiz.
    expect(cases[0].signals.softCriteriaPresent).toBe(true)
  })

  it('übernimmt vorgerechnete Signale nur mit passender Herkunft', () => {
    const passend = baseRecord({
      id: 'passend',
      signals: STALE_SIGNALS,
      signalsMeta: { signalsVersion: SIGNALS_VERSION, instructionHash: INSTR_NONE.hash },
    } as Partial<LabelRecord>)
    const fremd = baseRecord({
      id: 'fremd',
      group: 'g2',
      signals: STALE_SIGNALS,
      signalsMeta: { signalsVersion: SIGNALS_VERSION, instructionHash: 'ein-anderer-hash' },
    } as Partial<LabelRecord>)
    const alt = baseRecord({
      id: 'alt',
      group: 'g3',
      signals: STALE_SIGNALS,
      signalsMeta: { signalsVersion: 'email-decision-signals@0', instructionHash: INSTR_NONE.hash },
    } as Partial<LabelRecord>)

    const records = [passend, fremd, alt]
    const { cases, excluded, imported } = prepare(records, splitOf(records), INSTR_NONE)
    expect(imported).toBe(1)
    expect(cases.map((c) => c.record.id)).toEqual(['passend'])
    expect(excluded.map((e) => e.id).sort()).toEqual(['alt', 'fremd'])
    // Jeder ausgelassene Fall trägt seinen Grund — keine stille Auslassung.
    expect(excluded.every((e) => e.reason.length > 10)).toBe(true)
  })

  it('setzt `softCriteriaPresent` niemals herab (der Kern von F09)', () => {
    // Derselbe Hash, aber der Datensatz behauptet „keine weichen Kriterien". Selbst dann
    // darf der Blocker nicht verschwinden.
    const record = baseRecord({
      signals: STALE_SIGNALS,
      signalsMeta: { signalsVersion: SIGNALS_VERSION, instructionHash: INSTR_SOFT.hash },
    } as Partial<LabelRecord>)
    const { cases } = prepare([record], splitOf([record]), INSTR_SOFT)
    expect(cases[0].signals.softCriteriaPresent).toBe(true)
    // Und damit endet die Mail bei `review`, nicht bei `skip`.
    expect(armRules(cases, true)[0].route).toBe('review')
  })
})

describe('experimentelle Negativregel in der Auswertung (F11)', () => {
  it('überspringt eine Newsletter-Mail ohne weitere Blocker', () => {
    const record = baseRecord({
      content: { from: { address: 'newsletter@shop.example' }, subject: 'Newsletter', bodyText: DE_BODY },
    } as Partial<LabelRecord>)
    const { cases } = prepare([record], splitOf([record]), INSTR_NONE)
    expect(armRules(cases, false)[0].route).toBe('review')
    expect(armRules(cases, true)[0].route).toBe('skip')
  })

  it('überspringt NICHT, wenn weiche Kriterien im Spiel sind', () => {
    const record = baseRecord({
      content: { from: { address: 'newsletter@shop.example' }, subject: 'Newsletter', bodyText: DE_BODY },
    } as Partial<LabelRecord>)
    const { cases } = prepare([record], splitOf([record]), INSTR_SOFT)
    expect(armRules(cases, true)[0].route).toBe('review')
  })

  it('überspringt NICHT bei fehlendem Text oder unbekannter Sprache', () => {
    for (const content of [
      { from: { address: 'newsletter@shop.example' }, subject: 'Newsletter', bodyText: '   ' },
      { from: { address: 'newsletter@shop.example' }, subject: 'Bonjour', bodyText: 'Veuillez trouver ci-joint le document demande.' },
    ]) {
      const record = baseRecord({ content } as Partial<LabelRecord>)
      const { cases } = prepare([record], splitOf([record]), INSTR_NONE)
      expect(armRules(cases, true)[0].route).toBe('review')
    }
  })
})

// ── Kalibrierungsbau (F10) ───────────────────────────────────────────────────

function decisionOf(values: Record<DecisionQuestionId, number>, modelId = 'probe-modell'): LabelRecord['decision'] {
  const questions: Record<string, { logits: NliTriple; probs: NliTriple }> = {}
  for (const q of DECISION_QUESTIONS) {
    const logits: NliTriple = [values[q], 0, -values[q]]
    const m = Math.max(...logits)
    const ex = logits.map((x) => Math.exp(x - m))
    const sum = ex[0] + ex[1] + ex[2]
    questions[q] = { logits, probs: [ex[0] / sum, ex[1] / sum, ex[2] / sum] as NliTriple }
  }
  return {
    status: 'ok',
    questions: questions as never,
    coverage: { complete: true, promptTokens: 100, maxTokens: 512, bodyChars: 300, bodyCharsUsed: 300 },
    pairs: 4,
    tokens: 400,
    durationMs: 50,
    artifacts: { hypothesisSet: 'h@1', modelId, modelRevision: 'rev1', quantization: 'q8', calibration: null, runtime: 'probe' },
  } as LabelRecord['decision']
}

/** 2n deutsche Fälle, je zur Hälfte positiv und negativ — genug für eine Temperatur. */
function germanCalSet(n: number, modelId = 'probe-modell'): LabelRecord[] {
  const out: LabelRecord[] = []
  for (let i = 0; i < n; i++) {
    for (const positive of [true, false]) {
      const v = positive ? 1.2 : -1.2
      out.push(
        baseRecord({
          id: `de-${i}-${positive ? 'p' : 'n'}`,
          group: `g-${i}-${positive ? 'p' : 'n'}`,
          language: 'de',
          labels: positive
            ? { important: 'yes', needsReply: 'yes', hasActionOrDate: 'yes', urgent: 'yes', safeToSkip: 'no' }
            : { important: 'no', needsReply: 'no', hasActionOrDate: 'no', urgent: 'no', safeToSkip: 'yes' },
          content: { from: { address: 'x@y.example' }, subject: 'Betreff', bodyText: DE_BODY },
          decision: decisionOf(
            { needsReply: v, hasActionOrDate: v, urgent: v, impersonalInfo: positive ? -1.2 : 1.2 },
            modelId,
          ),
        } as Partial<LabelRecord>),
      )
    }
  }
  return out
}

const LIMITS = { minCases: 10, minGroups: 6 }
const THRESHOLDS: Thresholds = { riskPositive: 0.6, riskNegative: 0.2, impersonalPositive: 0.6 }

describe('fitCalibration (F10)', () => {
  it('baut ein Artefakt mit Fingerabdruck aus den Ergebnissen selbst', () => {
    const records = germanCalSet(8)
    const { cases } = prepare(records, splitOf(records), INSTR_NONE)
    const { calibration } = fitCalibration(cases, THRESHOLDS, LIMITS)
    expect(calibration).not.toBe(null)
    expect(calibration!.fingerprint.modelId).toBe('probe-modell')
    expect(calibration!.fingerprint.quantization).toBe('q8')
    expect(calibration!.fingerprint.signalsVersion).toBe(SIGNALS_VERSION)
    expect(calibration!.languages).toEqual(['de'])
    expect(Object.keys(calibration!.temperature)).toEqual(['de'])
    expect(calibration!.fittedOn.subset).toBe('cal')
  })

  it('verweigert gemischte Modellstände — eine Temperatur darüber ist keine', () => {
    const records = [...germanCalSet(4, 'modell-a'), ...germanCalSet(4, 'modell-b').map((r) => ({ ...r, id: r.id + '-b', group: r.group + '-b' }))]
    const { cases } = prepare(records, splitOf(records), INSTR_NONE)
    const { calibration, notes } = fitCalibration(cases, THRESHOLDS, LIMITS)
    expect(calibration).toBe(null)
    expect(notes.join(' ')).toContain('verschiedenen Modell-')
  })

  it('gibt eine Sprache unter dem Mindestumfang nicht frei', () => {
    const records = germanCalSet(3)
    const { cases } = prepare(records, splitOf(records), INSTR_NONE)
    const { calibration, notes } = fitCalibration(cases, THRESHOLDS, { minCases: DEFAULT_MIN_LANGUAGE_CASES, minGroups: 8 })
    expect(calibration).toBe(null)
    expect(notes.join(' ')).toContain('NICHT freigegeben')
  })

  it('ohne ausdrückliche Schwellen entsteht kein Artefakt — und damit kein skip', () => {
    const records = germanCalSet(8)
    const { cases } = prepare(records, splitOf(records), INSTR_NONE)
    const { calibration, notes } = fitCalibration(cases, null, LIMITS)
    expect(calibration).toBe(null)
    expect(notes.join(' ')).toContain('wird hier nicht erfunden')
    expect(armNli(cases, null).every((r) => r.route !== 'skip')).toBe(true)
  })
})

describe('armNli — der ganze Weg bis skip', () => {
  const records = germanCalSet(8)
  const prepared = prepare(records, splitOf(records), INSTR_NONE)
  const { calibration } = fitCalibration(prepared.cases, THRESHOLDS, LIMITS)

  it('überspringt die unauffälligen Fälle und nur diese', () => {
    expect(calibration).not.toBe(null)
    const routed = armNli(prepared.cases, calibration)
    const skipped = routed.filter((r) => r.route === 'skip')
    expect(skipped.length).toBeGreaterThan(0)
    // Kein einziger gold-wichtiger Fall darunter — die Kernzusage des Piloten.
    expect(skipped.every((r) => r.labels.important === 'no' && r.labels.safeToSkip === 'yes')).toBe(true)
    expect(routed.filter((r) => r.labels.important === 'yes').every((r) => r.route === 'full-analysis')).toBe(true)
  })

  it('wendet ein Artefakt eines anderen Modells nicht an', () => {
    const fremd = { ...calibration!, fingerprint: { ...calibration!.fingerprint, modelId: 'anderes-modell' } }
    const routed = armNli(prepared.cases, fremd)
    expect(routed.every((r) => r.route !== 'skip')).toBe(true)
    expect(routed.some((r) => [r.reasonCode, ...r.notes].includes('calibration-scores-missing'))).toBe(true)
  })
})
