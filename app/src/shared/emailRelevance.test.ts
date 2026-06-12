// Regressionstests für den Hybrid-Relevanz-Scorer.
// Die Datei ist bewusst pur (kein fs/Netzwerk) — genau deshalb ist sie testbar,
// und genau diese Logik (Floor vs. Boost, Injection-Veto-Ausnahme, Fenster, Dedup)
// kippt bei Umbauten sonst still.
import { describe, it, expect } from 'vitest'
import {
  parseRelevanceConfig,
  stripConfigBlock,
  upsertConfigBlock,
  serializeConfigBlockInner,
  emptyRelevanceConfig,
  buildReplyStats,
  computeHardSignals,
  combineRelevance,
  isSentMail,
  isSentFolderName,
  DEFAULT_REPLY_HISTORY,
  DEFAULT_VIP_WEIGHT,
  DEFAULT_KEYWORD_BOOST,
  MAX_KEYWORD_BOOST,
  VIP_NAME_BOOST,
  DEFAULT_RELEVANCE_THRESHOLD,
} from './emailRelevance'

const CONFIG_NOTE = `# Email-Instruktionen

Weiche Kriterien für das LLM stehen hier.

\`\`\`email-relevance-config
VIP-Absender:
- Santina Peotsch <s.peotsch@bildung.hessen.de>
- jens.schuhmacher@bildung.hessen.de = 95
- Nur Name Ohne Adresse

Domains:
- bildung.hessen.de
- example.org = 70

Schlüsselwörter:
- Medienzentrum
- Fortbildung = 25
\`\`\`

Noch mehr weiche Kriterien.`

describe('parseRelevanceConfig', () => {
  const cfg = parseRelevanceConfig(CONFIG_NOTE)

  it('liest VIPs mit Name+Adresse, Gewicht und Name-only', () => {
    expect(cfg.vipSenders).toHaveLength(3)
    expect(cfg.vipSenders[0]).toEqual({ name: 'Santina Peotsch', email: 's.peotsch@bildung.hessen.de', weight: DEFAULT_VIP_WEIGHT })
    expect(cfg.vipSenders[1].email).toBe('jens.schuhmacher@bildung.hessen.de')
    expect(cfg.vipSenders[1].weight).toBe(95)
    expect(cfg.vipSenders[2]).toEqual({ name: 'Nur Name Ohne Adresse', email: undefined, weight: DEFAULT_VIP_WEIGHT })
  })

  it('liest Domains und Keywords mit Default- und expliziten Gewichten', () => {
    expect(cfg.domains).toEqual([
      { domain: 'bildung.hessen.de', weight: 80 },
      { domain: 'example.org', weight: 70 },
    ])
    expect(cfg.keywords).toEqual([
      { term: 'Medienzentrum', weight: DEFAULT_KEYWORD_BOOST },
      { term: 'Fortbildung', weight: 25 },
    ])
  })

  it('liefert leere Config ohne Block', () => {
    expect(parseRelevanceConfig('nur weiche Kriterien')).toEqual(emptyRelevanceConfig())
  })
})

describe('stripConfigBlock / upsertConfigBlock (Round-Trip)', () => {
  it('entfernt den Block, weiche Kriterien bleiben', () => {
    const soft = stripConfigBlock(CONFIG_NOTE)
    expect(soft).not.toContain('email-relevance-config')
    expect(soft).toContain('Weiche Kriterien für das LLM')
    expect(soft).toContain('Noch mehr weiche Kriterien.')
  })

  it('Round-Trip parse → serialize → parse ist verlustfrei', () => {
    const cfg = parseRelevanceConfig(CONFIG_NOTE)
    const reparsed = parseRelevanceConfig('```email-relevance-config\n' + serializeConfigBlockInner(cfg) + '\n```')
    expect(reparsed).toEqual(cfg)
  })

  it('upsert ersetzt bestehenden Block ohne den Rest anzutasten', () => {
    const cfg = emptyRelevanceConfig()
    cfg.keywords.push({ term: 'Neu', weight: DEFAULT_KEYWORD_BOOST })
    const updated = upsertConfigBlock(CONFIG_NOTE, cfg)
    expect(updated).toContain('- Neu')
    expect(updated).not.toContain('Medienzentrum')
    expect(updated).toContain('Noch mehr weiche Kriterien.')
    expect(updated.match(/```email-relevance-config/g)).toHaveLength(1)
  })
})

describe('isSentMail / isSentFolderName', () => {
  it('erkennt sent-Flag und die bekannten Sent-Ordnernamen', () => {
    expect(isSentMail({ sent: true })).toBe(true)
    for (const f of ['Sent', 'Gesendet', 'INBOX.Sent', 'INBOX.Gesendet', 'Sent Items', 'Gesendete Objekte']) {
      expect(isSentFolderName(f)).toBe(true)
    }
    expect(isSentFolderName('INBOX')).toBe(false)
    expect(isSentMail({ folder: 'INBOX' })).toBe(false)
    expect(isSentMail({})).toBe(false)
  })
})

describe('buildReplyStats', () => {
  const now = Date.parse('2026-06-12T12:00:00Z')
  const d = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString()

  it('zählt lokale UND IMAP-Sent-Folder-Mails als gesendet, dedupliziert gegen persistierte Evidenz', () => {
    const emails = [
      { sent: true, date: d(5), to: [{ address: 'Anna@Example.de ' }] },
      { folder: 'INBOX.Gesendet', date: d(10), to: [{ address: 'anna@example.de' }] },
      { from: { address: 'anna@example.de' }, date: d(2) },
    ]
    // d(10) doppelt (live + persistiert) → zählt einmal; d(100) außerhalb des 90d-Fensters
    const persisted = new Map([
      ['anna@example.de', [d(10), d(60), d(100)]],
      ['bob@example.de', [d(20)]],
    ])
    const stats = buildReplyStats(emails, DEFAULT_REPLY_HISTORY, now, persisted)
    expect(stats.get('anna@example.de')).toEqual({ sentTo: 3, received: 1, frequency: 'high' })
    expect(stats.get('bob@example.de')).toEqual({ sentTo: 1, received: 0, frequency: 'medium' })
  })

  it('ignoriert Mails ohne parsebares Datum', () => {
    const stats = buildReplyStats(
      [{ sent: true, date: 'kaputt', to: [{ address: 'x@y.de' }] }, { sent: true, to: [{ address: 'x@y.de' }] }],
      DEFAULT_REPLY_HISTORY,
      now,
    )
    expect(stats.get('x@y.de')).toBeUndefined()
  })
})

describe('computeHardSignals', () => {
  const cfg = parseRelevanceConfig(CONFIG_NOTE)

  it('Adress-Match → Floor mit konfiguriertem Gewicht', () => {
    const hard = computeHardSignals({ from: { name: 'Egal', address: 'jens.schuhmacher@bildung.hessen.de' } }, cfg)
    // Adresse matcht VIP (95) UND Domain (80) → höchster Floor gewinnt
    expect(hard.floor).toBe(95)
  })

  it('reiner Name-Match → nur Boost (Spoofing-Schutz), kein Floor', () => {
    const hard = computeHardSignals({ from: { name: 'Santina Peotsch', address: 'attacker@evil.com' } }, cfg)
    expect(hard.floor).toBe(0)
    expect(hard.boost).toBe(VIP_NAME_BOOST)
    expect(hard.signals[0].label).toContain('Adresse unbestätigt')
  })

  it('Domain matcht exakt und als Subdomain, nicht als Suffix-Lookalike', () => {
    expect(computeHardSignals({ from: { address: 'a@bildung.hessen.de' } }, cfg).floor).toBe(80)
    expect(computeHardSignals({ from: { address: 'a@mz.bildung.hessen.de' } }, cfg).floor).toBe(80)
    expect(computeHardSignals({ from: { address: 'a@evilbildung.hessen.de' } }, cfg).floor).toBe(0)
  })

  it('Keywords boosten additiv, gedeckelt auf MAX_KEYWORD_BOOST', () => {
    const hard = computeHardSignals(
      { from: { address: 'x@y.de' }, subject: 'Fortbildung im Medienzentrum', bodyText: '' },
      cfg,
    )
    expect(hard.floor).toBe(0)
    expect(hard.boost).toBe(MAX_KEYWORD_BOOST) // 20 + 25 → Cap 30
  })

  it('Antwort-Häufigkeit → Floor', () => {
    const hard = computeHardSignals({ from: { address: 'x@y.de' } }, cfg, { sentTo: 4, received: 2, frequency: 'high' })
    expect(hard.floor).toBe(DEFAULT_REPLY_HISTORY.highWeight)
  })
})

describe('combineRelevance', () => {
  const noSignals = { floor: 0, boost: 0, signals: [] }

  it('Floor gewinnt auch gegen explizites LLM-0 (bekannte Identität schlägt Injection-Veto)', () => {
    const c = combineRelevance(0, { floor: 90, boost: 0, signals: [] }, [])
    expect(c.relevanceScore).toBe(90)
    expect(c.relevant).toBe(true)
  })

  it('Name-only-Boost hebt weder Injection-Veto noch irrelevante Mails über die Schwelle', () => {
    const spoofed = { floor: 0, boost: VIP_NAME_BOOST, signals: [] }
    expect(combineRelevance(0, spoofed, []).relevant).toBe(false) // LLM 0 + 15 < 30
    expect(combineRelevance(10, spoofed, []).relevant).toBe(false) // LLM 10 + 15 < 30
  })

  it('kaputter LLM-Score (null) → Floor greift, ohne Floor → 0', () => {
    expect(combineRelevance(null, { floor: 60, boost: 0, signals: [] }, []).relevanceScore).toBe(60)
    expect(combineRelevance(null, noSignals, []).relevanceScore).toBe(0)
  })

  it('Boost ist additiv auf den LLM-Score, Gesamt-Cap 100, Schwelle inklusiv', () => {
    expect(combineRelevance(50, { floor: 0, boost: 20, signals: [] }, []).relevanceScore).toBe(70)
    expect(combineRelevance(95, { floor: 0, boost: 30, signals: [] }, []).relevanceScore).toBe(100)
    expect(combineRelevance(DEFAULT_RELEVANCE_THRESHOLD, noSignals, []).relevant).toBe(true)
    expect(combineRelevance(DEFAULT_RELEVANCE_THRESHOLD - 1, noSignals, []).relevant).toBe(false)
  })

  it('reasons = Signal-Labels + matchedCriteria', () => {
    const c = combineRelevance(
      50,
      { floor: 80, boost: 0, signals: [{ kind: 'domain', label: 'Domain: bildung.hessen.de', weight: 80, mode: 'floor' }] },
      ['Termine & Fristen'],
    )
    expect(c.reasons).toEqual(['Domain: bildung.hessen.de', 'Termine & Fristen'])
  })
})
