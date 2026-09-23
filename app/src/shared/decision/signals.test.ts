// Tests der deterministischen Signale. Sie entscheiden, welche Mail GAR NICHT erst beim
// Modell landet — ein übersehener Terminmarker ist hier der teure Fehler, ein zu breiter
// Marker kostet nur Einsparung.
import { describe, it, expect } from 'vitest'
import {
  deriveDecisionSignals,
  detectLanguage,
  hasDateMention,
  hasIcsAttachment,
  hasNewsletterMarker,
  matchedActionMarkers,
} from './signals'
import { emptyRelevanceConfig, type RelevanceConfig } from '../emailRelevance'

const CFG: RelevanceConfig = {
  ...emptyRelevanceConfig(),
  vipSenders: [{ name: 'Wichtige Person', email: 'vip@example.org', weight: 90 }],
  domains: [{ domain: 'beispiel-amt.de', weight: 80 }],
  keywords: [{ term: 'Medienzentrum', weight: 20 }],
}

describe('hasDateMention', () => {
  it('erkennt deutsche, ISO- und ausgeschriebene Datumsangaben', () => {
    expect(hasDateMention('Bitte bis 12.03.2026 melden')).toBe(true)
    expect(hasDateMention('Termin am 12.3. um 9:00 Uhr')).toBe(true)
    expect(hasDateMention('deadline 2026-03-12')).toBe(true)
    expect(hasDateMention('am 12. März findet es statt')).toBe(true)
    expect(hasDateMention('on March 12 we meet')).toBe(false) // Monat ohne Tagangabe davor
    expect(hasDateMention('meeting at 14:30')).toBe(false) // ohne Uhr/am/pm keine Zeitangabe
    expect(hasDateMention('um 14:30 Uhr')).toBe(true)
  })

  it('verwechselt Versionsnummern und Beträge nicht mit Daten', () => {
    expect(hasDateMention('Version 3.4 ist da')).toBe(false)
    expect(hasDateMention('Der Preis liegt bei 12,50 Euro')).toBe(false)
  })

  it('prüft zeilenweise — ein Muster darf keine Zeilengrenze überspringen', () => {
    expect(hasDateMention('12.\n3.2026')).toBe(false)
  })
})

describe('matchedActionMarkers', () => {
  it('findet Frist-, Handlungs- und Terminwörter in Betreff und Body', () => {
    expect(matchedActionMarkers('Erinnerung: Rückmeldung nötig', '')).toContain('erinnerung')
    expect(matchedActionMarkers('', 'bitte um kurze Rückmeldung')).toContain('bitte um')
    expect(matchedActionMarkers('Invitation', 'please confirm your attendance')).toContain('please confirm')
  })

  it('bleibt bei einer harmlosen Mail leer', () => {
    expect(matchedActionMarkers('Hallo', 'Ich wollte nur Danke sagen.')).toEqual([])
  })
})

describe('hasNewsletterMarker', () => {
  it('erkennt Absender- und Body-Merkmale', () => {
    expect(hasNewsletterMarker({ from: { address: 'no-reply@shop.example' } })).toBe(true)
    expect(hasNewsletterMarker({ from: { address: 'newsletter@verlag.example' } })).toBe(true)
    expect(
      hasNewsletterMarker({ from: { address: 'info@verein.example' }, bodyText: 'Hier können Sie den Newsletter abmelden.' }),
    ).toBe(true)
  })

  it('markiert eine persönliche Mail nicht', () => {
    expect(hasNewsletterMarker({ from: { address: 'kollegin@beispiel-amt.de' }, bodyText: 'Kurze Frage zum Termin.' })).toBe(false)
  })
})

describe('hasIcsAttachment', () => {
  it('erkennt Kalenderanhänge unabhängig von Groß-/Kleinschreibung', () => {
    expect(hasIcsAttachment(['Termin.ICS'])).toBe(true)
    expect(hasIcsAttachment(['bericht.pdf'])).toBe(false)
    expect(hasIcsAttachment(undefined)).toBe(false)
  })
})

describe('detectLanguage', () => {
  it('erkennt Deutsch und Englisch bei genügend Text', () => {
    expect(detectLanguage('Sehr geehrte Damen und Herren, bitte teilen Sie uns die Unterlagen mit freundlichen Grüßen mit.')).toBe('de')
    expect(detectLanguage('Dear team, please find the report attached and let us know if you have any questions. Best regards.')).toBe('en')
  })

  it('sagt bei zu wenig oder mehrdeutigem Text ausdrücklich nichts', () => {
    expect(detectLanguage('OK')).toBe(null)
    expect(detectLanguage('Bonjour, veuillez trouver ci-joint le document demandé pour la réunion de demain matin.')).toBe(null)
  })
})

describe('deriveDecisionSignals', () => {
  it('übernimmt die harten Signale aus dem bestehenden Hybrid-Scorer', () => {
    const s = deriveDecisionSignals(
      { from: { address: 'vip@example.org' }, subject: 'Hallo', bodyText: 'kurzer Text ohne alles' },
      CFG,
      { softCriteriaPresent: false },
    )
    expect(s.hardFloor).toBe(90)
    expect(s.hardSignalKinds).toContain('vip')
  })

  it('zählt Thread, Anhang und Marker getrennt', () => {
    const s = deriveDecisionSignals(
      {
        from: { address: 'fremd@example.net' },
        subject: 'Re: Unterlagen',
        bodyText: 'Bitte bis zum 12.03.2026 zurücksenden.',
        attachmentNames: ['formular.pdf'],
        inReplyTo: '<abc@example.net>',
      },
      CFG,
      { softCriteriaPresent: true },
    )
    expect(s.hasThreadContext).toBe(true)
    expect(s.hasAttachments).toBe(true)
    expect(s.hasActionMarker).toBe(true)
    expect(s.softCriteriaPresent).toBe(true)
  })

  it('leere Mail: bodyPresent false, Sprache unbekannt', () => {
    const s = deriveDecisionSignals({ from: { address: 'x@y.example' }, subject: '', bodyText: '   ' }, CFG, {
      softCriteriaPresent: false,
    })
    expect(s.bodyPresent).toBe(false)
    expect(s.bodyChars).toBe(0)
    expect(s.language).toBe(null)
  })

  it('eine ausdrücklich gesetzte Sprache schlägt die Erkennung — auch null', () => {
    const text = 'Sehr geehrte Damen und Herren, bitte senden Sie uns die Unterlagen mit freundlichen Grüßen.'
    expect(deriveDecisionSignals({ from: {}, bodyText: text }, CFG, { softCriteriaPresent: false }).language).toBe('de')
    expect(
      deriveDecisionSignals({ from: {}, bodyText: text }, CFG, { softCriteriaPresent: false, language: null }).language,
    ).toBe(null)
  })
})
