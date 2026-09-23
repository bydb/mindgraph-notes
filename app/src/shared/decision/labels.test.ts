// Tests des Labelschemas. Der Goldstandard ist die einzige Wahrheit im Piloten — ein
// widersprüchliches Label („gefahrlos überspringbar" neben „braucht Antwort") würde
// später eine Freigabe rechtfertigen, die niemand so gemeint hat.
import { describe, it, expect } from 'vitest'
import {
  LABEL_FIELDS,
  goldHasRisk,
  goldIsImportant,
  goldSafeToSkip,
  labelContradictions,
  makeEmptyLabels,
  parseLabelJsonl,
  serializeLabelJsonl,
  stripForReport,
  signalsUsability,
  LABEL_ID_PATTERN,
  validateLabelRecord,
  type GoldLabels,
  type LabelRecord,
} from './labels'
import { LABEL_SCHEMA_VERSION } from './types'

function labels(over: Partial<GoldLabels> = {}): GoldLabels {
  return { important: 'no', needsReply: 'no', hasActionOrDate: 'no', urgent: 'no', safeToSkip: 'yes', ...over }
}

function record(over: Partial<LabelRecord> = {}): LabelRecord {
  return {
    schema: LABEL_SCHEMA_VERSION,
    id: 'case-1',
    group: 'tpl:example.org:newsletter',
    receivedAt: '2026-09-01T08:00:00Z',
    source: 'synthetic',
    labels: labels(),
    content: { from: { address: 'newsletter@example.org' }, subject: 'Newsletter', bodyText: 'Text' },
    ...over,
  }
}

describe('labelContradictions', () => {
  it('lässt ein sauberes Label durch', () => {
    expect(labelContradictions(labels())).toEqual([])
  })

  it('erkennt „überspringbar" neben jedem Risiko-Ja', () => {
    expect(labelContradictions(labels({ needsReply: 'yes' })).length).toBe(1)
    expect(labelContradictions(labels({ hasActionOrDate: 'yes' })).length).toBe(1)
    expect(labelContradictions(labels({ urgent: 'yes' })).length).toBe(1)
    expect(labelContradictions(labels({ important: 'yes' })).length).toBe(1)
  })

  it('unklar blockiert genauso wie ja — Unsicherheit ist kein Freibrief', () => {
    expect(labelContradictions(labels({ needsReply: 'unclear' })).length).toBe(1)
  })

  it('unklare Wichtigkeit blockiert ebenfalls (F12)', () => {
    expect(labelContradictions(labels({ important: 'unclear' })).length).toBe(1)
    const { record: r, issues } = validateLabelRecord(record({ labels: labels({ important: 'unclear' }) }), 1)
    expect(r).toBe(null)
    expect(issues.some((i) => i.code === 'contradiction' && i.detail.includes('important=unclear'))).toBe(true)
  })

  it('ohne safeToSkip=yes ist nichts widersprüchlich', () => {
    expect(labelContradictions(labels({ safeToSkip: 'no', needsReply: 'yes', urgent: 'unclear' }))).toEqual([])
  })
})

describe('validateLabelRecord', () => {
  it('nimmt einen vollständigen Datensatz an', () => {
    const { record: r, issues } = validateLabelRecord(record(), 1)
    expect(r).not.toBe(null)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('weist fremde Schemaversion ab, statt sie stillschweigend zu lesen', () => {
    const { record: r, issues } = validateLabelRecord({ ...record(), schema: 'email-decision-labels@0' }, 1)
    expect(r).toBe(null)
    expect(issues.some((i) => i.code === 'schema-mismatch')).toBe(true)
  })

  it('verlangt jedes der fünf Labels als yes|no|unclear', () => {
    for (const f of LABEL_FIELDS) {
      const broken = record({ labels: { ...labels(), [f]: 'maybe' } as unknown as GoldLabels })
      const { record: r, issues } = validateLabelRecord(broken, 1)
      expect(r, `Label ${f} durchgelassen`).toBe(null)
      // Der Fehlertext nennt das Feld `labels`, aber nicht den gefundenen Wert — Werte aus
      // dieser Datei können Mailtext sein.
      expect(issues.some((i) => i.code === 'invalid-value' && i.detail.includes('`labels`'))).toBe(true)
      expect(issues.every((i) => !i.detail.includes('maybe'))).toBe(true)
    }
  })

  it('verlangt ein vollständiges Labelobjekt, nicht nur einzelne Felder', () => {
    const { record: r } = validateLabelRecord(record({ labels: { important: 'no' } as unknown as GoldLabels }), 1)
    expect(r).toBe(null)
  })

  it('verlangt Gruppenschlüssel, Zeitpunkt und Quelle', () => {
    expect(validateLabelRecord(record({ group: '' }), 1).record).toBe(null)
    expect(validateLabelRecord(record({ receivedAt: 'gestern' }), 1).record).toBe(null)
    expect(validateLabelRecord(record({ source: 'echt' as unknown as LabelRecord['source'] }), 1).record).toBe(null)
  })

  it('meldet einen Fall ohne Inhalt und ohne Signale als Warnung, nicht als Fehler', () => {
    const { record: r, issues } = validateLabelRecord(record({ content: undefined }), 7)
    expect(r).not.toBe(null)
    expect(issues.some((i) => i.severity === 'warning' && i.code === 'content-missing')).toBe(true)
    expect(issues[0].line).toBe(7)
  })

  it('prüft auch die Zweitbewertung', () => {
    const { record: r, issues } = validateLabelRecord(
      record({ secondLabels: labels({ needsReply: 'yes' }) }),
      1,
    )
    expect(r).toBe(null)
    expect(issues.some((i) => i.code === 'contradiction' && i.detail.startsWith('Zweitbewertung'))).toBe(true)
  })

  it('weist alles ab, was kein Objekt ist', () => {
    expect(validateLabelRecord('[]', 1).record).toBe(null)
    expect(validateLabelRecord([record()], 1).record).toBe(null)
    expect(validateLabelRecord(null, 1).record).toBe(null)
  })
})

describe('parseLabelJsonl', () => {
  it('liest mehrere Zeilen, überspringt Leerzeilen und Kommentare', () => {
    const text = ['// Kommentar', '', JSON.stringify(record()), JSON.stringify(record({ id: 'case-2' }))].join('\n')
    const res = parseLabelJsonl(text)
    expect(res.records.map((r) => r.id)).toEqual(['case-1', 'case-2'])
    expect(res.lines).toBe(2)
    expect(res.issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('meldet kaputtes JSON mit Zeilennummer — ohne den Zeileninhalt zu zitieren', () => {
    const res = parseLabelJsonl(JSON.stringify(record()) + '\n{ kaputt')
    expect(res.records.length).toBe(1)
    const issue = res.issues.find((i) => i.code === 'invalid-json')
    expect(issue?.line).toBe(2)
    expect(issue?.detail).not.toContain('kaputt')
  })

  it('erkennt doppelte Kennungen', () => {
    const res = parseLabelJsonl([JSON.stringify(record()), JSON.stringify(record())].join('\n'))
    expect(res.records.length).toBe(1)
    expect(res.issues.some((i) => i.code === 'duplicate-id')).toBe(true)
  })

  it('überlebt die Runde durch die Serialisierung', () => {
    const res = parseLabelJsonl(serializeLabelJsonl([record(), record({ id: 'case-2' })]))
    expect(res.records.length).toBe(2)
    expect(res.issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('stripForReport', () => {
  it('entfernt Mailtext, Personen und den inhaltsnahen Gruppenschlüssel', () => {
    const stripped = stripForReport(
      record({
        rationale: 'Steht im dritten Absatz',
        labeler: 'Jochen',
        group: 'tpl:firma.example:gehaltsabrechnung mai',
      }),
    )
    const json = JSON.stringify(stripped)
    expect(json).not.toContain('Absatz')
    expect(json).not.toContain('Jochen')
    expect(json).not.toContain('gehaltsabrechnung')
    expect(stripped.groupHash).toMatch(/^[0-9a-f]{16}$/)
    expect(stripped.labels).toEqual(labels())
  })

  it('nimmt unbekannte Laufzeitfelder NICHT mit — das ist der Punkt der Allowlist', () => {
    const sneaky = { ...record(), bodyTextCopy: 'Sehr geehrte Frau Muster, anbei die Abrechnung' } as unknown as LabelRecord
    expect(JSON.stringify(stripForReport(sneaky))).not.toContain('Muster')
  })

  it('lässt das Original unberührt', () => {
    const original = record()
    stripForReport(original)
    expect(original.content).toBeDefined()
  })
})

describe('Kennungen (F13)', () => {
  it('lehnt Message-IDs und Betreffzeilen als Kennung ab', () => {
    for (const id of [
      '<CAF=abc123@mail.example>',
      'Betreff: Gehaltsabrechnung Mai',
      'chef@firma.example',
      'x'.repeat(65),
      '  ',
    ]) {
      const { record: r, issues } = validateLabelRecord(record({ id }), 1)
      expect(r, `Kennung durchgelassen: ${id}`).toBe(null)
      expect(issues.some((i) => i.detail.includes('Pseudonym'))).toBe(true)
    }
  })

  it('nimmt lokale Pseudonyme an', () => {
    for (const id of ['syn-behoerde-frist', 'case_42', 'mail:2026:0001', 'a']) {
      expect(LABEL_ID_PATTERN.test(id)).toBe(true)
      expect(validateLabelRecord(record({ id }), 1).record).not.toBe(null)
    }
  })

  it('zitiert in Fehlertexten keine Werte aus der Datei', () => {
    const poisoned = {
      ...record(),
      schema: 'Sehr geehrte Frau Muster, anbei die Abrechnung',
      labels: { ...labels(), urgent: 'Betreff: Kündigung' },
    }
    const { issues } = validateLabelRecord(poisoned, 1)
    const text = issues.map((i) => i.detail).join('\n')
    expect(text).not.toContain('Muster')
    expect(text).not.toContain('Kündigung')
    expect(text).toContain('`schema`')
  })
})

describe('verschachtelte Strukturen werden geprüft, nicht gecastet (F09)', () => {
  const SIG = {
    hardFloor: 0,
    hardBoost: 0,
    hardSignalKinds: [],
    hasAttachments: false,
    hasThreadContext: false,
    hasActionMarker: false,
    newsletterMarker: false,
    bodyPresent: true,
    bodyChars: 100,
    softCriteriaPresent: false,
    language: 'de',
  }
  const META = { signalsVersion: 'email-decision-signals@1', instructionHash: 'abcd0123abcd0123' }

  it('nimmt vollständige Signale mit Herkunft an', () => {
    expect(validateLabelRecord(record({ signals: SIG, signalsMeta: META } as Partial<LabelRecord>), 1).record).not.toBe(null)
  })

  it('lehnt Signale ohne Herkunft ab — sonst ist ihr Alter unbekannt', () => {
    const { record: r, issues } = validateLabelRecord(record({ signals: SIG } as Partial<LabelRecord>), 1)
    expect(r).toBe(null)
    expect(issues.some((i) => i.code === 'stale-signals')).toBe(true)
  })

  it('lehnt unvollständige oder falsch typisierte Signale ab', () => {
    for (const broken of [
      { ...SIG, hardFloor: 'viel' },
      { ...SIG, bodyChars: -1 },
      { ...SIG, softCriteriaPresent: undefined },
      { ...SIG, hardSignalKinds: 'vip' },
      { ...SIG, language: 42 },
    ]) {
      const { record: r } = validateLabelRecord(
        record({ signals: broken, signalsMeta: META } as unknown as Partial<LabelRecord>),
        1,
      )
      expect(r).toBe(null)
    }
  })

  it('lehnt ein DecisionResult ab, dessen Wahrscheinlichkeiten keine sind', () => {
    const ok = {
      status: 'ok',
      questions: Object.fromEntries(
        ['needsReply', 'hasActionOrDate', 'urgent', 'impersonalInfo'].map((q) => [q, { logits: [1, 0, 0], probs: [0.5, 0.3, 0.2] }]),
      ),
      coverage: { complete: true, promptTokens: 10, maxTokens: 512, bodyChars: 10, bodyCharsUsed: 10 },
      pairs: 4,
      tokens: 40,
      durationMs: 5,
      artifacts: { hypothesisSet: 'h', modelId: 'm', modelRevision: 'r', quantization: 'q', calibration: null, runtime: 't' },
    }
    expect(validateLabelRecord(record({ decision: ok } as unknown as Partial<LabelRecord>), 1).record).not.toBe(null)

    const summeFalsch = JSON.parse(JSON.stringify(ok))
    summeFalsch.questions.urgent.probs = [0.9, 0.9, 0.9]
    expect(validateLabelRecord(record({ decision: summeFalsch } as unknown as Partial<LabelRecord>), 1).record).toBe(null)

    const ausserhalb = JSON.parse(JSON.stringify(ok))
    ausserhalb.questions.urgent.calibrated = 2
    expect(validateLabelRecord(record({ decision: ausserhalb } as unknown as Partial<LabelRecord>), 1).record).toBe(null)

    const frageFehlt = JSON.parse(JSON.stringify(ok))
    delete frageFehlt.questions.urgent
    expect(validateLabelRecord(record({ decision: frageFehlt } as unknown as Partial<LabelRecord>), 1).record).toBe(null)

    const abstainFalsch = { ...ok, status: 'abstain', reason: 'keine-lust' }
    expect(validateLabelRecord(record({ decision: abstainFalsch } as unknown as Partial<LabelRecord>), 1).record).toBe(null)
  })

  it('übernimmt keine unbekannten Felder aus der Datei', () => {
    const sneaky = { ...record(), bodyTextCopy: 'Sehr geehrte Frau Muster' }
    const { record: r } = validateLabelRecord(sneaky, 1)
    expect(r).not.toBe(null)
    expect(JSON.stringify(r)).not.toContain('Muster')
  })

  it('übernimmt aus `baseline` nur bekannte Dringlichkeitsstufen', () => {
    const { record: r } = validateLabelRecord(
      record({ baseline: { relevant: true, replyUrgency: 'Betreff: sofort anrufen' } } as unknown as Partial<LabelRecord>),
      1,
    )
    expect(r!.baseline!.replyUrgency).toBeUndefined()
    expect(r!.baseline!.relevant).toBe(true)
  })

  it('signalsUsability nennt den Grund, nicht nur ja/nein', () => {
    const withMeta = (meta: typeof META): LabelRecord =>
      validateLabelRecord(record({ signals: SIG, signalsMeta: meta } as Partial<LabelRecord>), 1).record as LabelRecord
    expect(signalsUsability(withMeta(META), 'abcd0123abcd0123').reason).toBe('ok')
    expect(signalsUsability(withMeta(META), 'anderer-hash').reason).toBe('instruction-mismatch')
    expect(signalsUsability(withMeta({ ...META, signalsVersion: 'alt@0' }), 'abcd0123abcd0123').reason).toBe('version-mismatch')
    expect(signalsUsability(record(), 'abcd0123abcd0123').reason).toBe('no-signals')
  })
})

describe('Gold-Prädikate', () => {
  it('nur ein ausdrückliches Ja erlaubt Überspringen', () => {
    expect(goldSafeToSkip(record())).toBe(true)
    expect(goldSafeToSkip(record({ labels: labels({ safeToSkip: 'unclear' }) }))).toBe(false)
    expect(goldSafeToSkip(record({ labels: labels({ safeToSkip: 'no' }) }))).toBe(false)
  })

  it('wichtig und Risiko werden getrennt gelesen', () => {
    expect(goldIsImportant(record({ labels: labels({ safeToSkip: 'no', important: 'yes' }) }))).toBe(true)
    expect(goldHasRisk(record({ labels: labels({ safeToSkip: 'no', urgent: 'yes' }) }))).toBe(true)
    expect(goldHasRisk(record())).toBe(false)
  })

  it('das leere Label steht auf unklar und verbietet Überspringen', () => {
    const empty = makeEmptyLabels()
    expect(empty.safeToSkip).toBe('no')
    expect(labelContradictions(empty)).toEqual([])
  })
})
