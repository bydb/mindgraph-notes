import { describe, it, expect } from 'vitest'
import {
  extractMeetingUrl, normalizeDraft, localDateTimeToIso, buildIcs, foldIcsLine, toIcsUtc, icsFileName,
  DEFAULT_DURATION_MINUTES, type CalendarEventDraft,
} from './calendarEvent'

const BASE: CalendarEventDraft = {
  title: 'Modul 8',
  startIso: '2026-08-24T12:00:00.000Z',
  durationMinutes: 90,
}

describe('extractMeetingUrl', () => {
  it('findet einen Zoom-Link im Fließtext', () => {
    const text = 'Wir treffen uns hier: https://us02web.zoom.us/j/123456789?pwd=abc — bis dann!'
    expect(extractMeetingUrl(text)).toBe('https://us02web.zoom.us/j/123456789?pwd=abc')
  })

  it('findet Teams, Meet und BigBlueButton', () => {
    expect(extractMeetingUrl('https://teams.microsoft.com/l/meetup-join/xyz')).toContain('teams.microsoft.com')
    expect(extractMeetingUrl('Link: https://meet.google.com/abc-defg-hij')).toContain('meet.google.com')
    expect(extractMeetingUrl('https://bbb.schule.de/b/abc-def')).toContain('bbb.schule.de')
  })

  it('ignoriert Abmelde- und Impressumslinks', () => {
    // Der eigentliche Grund für die Allowlist: In jeder Rundmail stehen Links,
    // die niemand als Konferenzlink im Kalender haben will.
    const text = 'Abmelden: https://newsletter.example.com/unsubscribe?id=9 · Impressum: https://example.com/impressum'
    expect(extractMeetingUrl(text)).toBeUndefined()
  })

  it('nimmt den Konferenzlink auch, wenn andere Links davor stehen', () => {
    const text = 'Impressum https://example.com/impressum und Zugang https://meet.jit.si/Projektrunde'
    expect(extractMeetingUrl(text)).toBe('https://meet.jit.si/Projektrunde')
  })

  it('schneidet Satzzeichen am Ende ab', () => {
    expect(extractMeetingUrl('Zugang: https://meet.google.com/abc-defg-hij.')).toBe('https://meet.google.com/abc-defg-hij')
  })

  it('verkraftet leeren Text', () => {
    expect(extractMeetingUrl('')).toBeUndefined()
  })
})

describe('normalizeDraft', () => {
  it('meldet fehlenden Titel und fehlenden Start, statt sie zu erfinden', () => {
    const { problems } = normalizeDraft({ durationMinutes: 60 })
    expect(problems.map(p => p.field)).toContain('title')
    expect(problems.map(p => p.field)).toContain('startIso')
  })

  it('nimmt 60 Minuten an, wenn keine Dauer erkannt wurde — und sagt es', () => {
    const { draft, problems } = normalizeDraft({ title: 'X', startIso: BASE.startIso })
    expect(draft.durationMinutes).toBe(DEFAULT_DURATION_MINUTES)
    expect(problems.find(p => p.field === 'durationMinutes')?.message).toMatch(/60 Minuten angenommen/)
  })

  it('begrenzt unplausible Dauern und weist darauf hin', () => {
    const { draft, problems } = normalizeDraft({ ...BASE, durationMinutes: 5000 })
    expect(draft.durationMinutes).toBe(720)
    expect(problems.find(p => p.field === 'durationMinutes')?.message).toMatch(/unplausibel/)
  })

  it('verwirft eine URL, die keine ist', () => {
    // Real erwartbar: Das Modell schreibt "siehe Anhang" ins URL-Feld.
    const { draft, problems } = normalizeDraft({ ...BASE, url: 'siehe Anhang' })
    expect(draft.url).toBeUndefined()
    expect(problems.find(p => p.field === 'url')).toBeTruthy()
  })

  it('behält eine gültige URL', () => {
    expect(normalizeDraft({ ...BASE, url: 'https://meet.jit.si/x' }).draft.url).toBe('https://meet.jit.si/x')
  })

  it('meldet keine Beanstandung bei vollständigen Daten', () => {
    expect(normalizeDraft(BASE).problems).toHaveLength(0)
  })
})

describe('localDateTimeToIso', () => {
  it('interpretiert Datum und Uhrzeit in der lokalen Zeitzone', () => {
    expect(localDateTimeToIso('2026-09-24', '14:00')).toBe(new Date(2026, 8, 24, 14, 0).toISOString())
  })

  it('akzeptiert eine einstellige Stunde', () => {
    expect(localDateTimeToIso('2026-09-24', '9:05')).toBe(new Date(2026, 8, 24, 9, 5).toISOString())
  })

  it('weist kalendarisch ungueltige Daten statt stillen Rollovers ab', () => {
    expect(localDateTimeToIso('2026-02-31', '14:00')).toBeUndefined()
    expect(localDateTimeToIso('2026-13-01', '14:00')).toBeUndefined()
  })

  it('weist fehlende und ungueltige Uhrzeiten ab, statt 09:00 anzunehmen', () => {
    expect(localDateTimeToIso('2026-09-24', '')).toBeUndefined()
    expect(localDateTimeToIso('2026-09-24', '25:00')).toBeUndefined()
    expect(localDateTimeToIso('2026-09-24', '12:60')).toBeUndefined()
  })
})

describe('foldIcsLine', () => {
  it('lässt kurze Zeilen unangetastet', () => {
    expect(foldIcsLine('SUMMARY:kurz')).toBe('SUMMARY:kurz')
  })

  it('faltet nach BYTES, nicht nach Zeichen', () => {
    // Umlaute belegen zwei Bytes. Nach Zeichen gefaltet wäre die erste Zeile
    // deutlich über 75 Oktetten — manche Kalender weisen das ab.
    const line = 'LOCATION:' + 'ä'.repeat(60)
    const folded = foldIcsLine(line)
    const encoder = new TextEncoder()
    for (const part of folded.split('\r\n')) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75)
    }
  })

  it('beginnt Fortsetzungszeilen mit einem Leerzeichen', () => {
    const folded = foldIcsLine('DESCRIPTION:' + 'a'.repeat(200))
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.slice(1).every(p => p.startsWith(' '))).toBe(true)
  })

  it('verliert beim Falten keinen Inhalt', () => {
    const line = 'DESCRIPTION:' + 'xyz'.repeat(90)
    const rebuilt = foldIcsLine(line).split('\r\n').map((p, i) => (i === 0 ? p : p.slice(1))).join('')
    expect(rebuilt).toBe(line)
  })
})

describe('toIcsUtc', () => {
  it('erzeugt die UTC-Grundform', () => {
    expect(toIcsUtc(new Date('2026-08-24T12:00:00Z'))).toBe('20260824T120000Z')
  })
})

describe('buildIcs', () => {
  const ics = buildIcs({
    ...BASE,
    location: 'Staatliches Schulamt, Breitlacherstraße 92, Frankfurt',
    url: 'https://meet.google.com/abc-defg-hij',
    notes: 'Bitte Laptop mitbringen; Beamer vorhanden',
  })

  it('setzt Start und Ende aus Dauer', () => {
    expect(ics).toContain('DTSTART:20260824T120000Z')
    expect(ics).toContain('DTEND:20260824T133000Z')
  })

  it('schreibt Ort und URL in eigene Felder, nicht in die Notizen', () => {
    expect(ics).toMatch(/LOCATION:Staatliches Schulamt/)
    expect(ics).toContain('URL:https://meet.google.com/abc-defg-hij')
  })

  it('maskiert Semikolon und Komma nach RFC 5545', () => {
    // "Breitlacherstraße 92, Frankfurt" enthält ein Komma; unmaskiert würde der
    // Kalender dort ein zweites Feld beginnen.
    expect(ics).toContain('Breitlacherstraße 92\\, Frankfurt')
    expect(ics).toContain('mitbringen\\; Beamer')
  })

  it('legt zwei Erinnerungen an: Vortag und kurz vorher', () => {
    expect(ics).toContain('TRIGGER:-PT1440M')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2)
  })

  it('wiederholt den Konferenzlink in der Beschreibung', () => {
    // Nicht jeder Kalender zeigt das URL-Feld an.
    expect(ics).toMatch(/DESCRIPTION:[\s\S]*Videokonferenz/)
  })

  it('benutzt CRLF als Zeilenende', () => {
    expect(ics.includes('\r\n')).toBe(true)
    expect(ics.split('\r\n').some(l => l.includes('\n'))).toBe(false)
  })

  it('lässt Erinnerungen weg, wenn keine gewünscht sind', () => {
    expect(buildIcs(BASE, { reminderMinutes: [] })).not.toContain('BEGIN:VALARM')
  })

  it('erzeugt bei gleichen Eingaben dieselbe Datei', () => {
    // Wichtig, damit ein zweiter Klick nicht als zweiter Termin im Kalender landet:
    // Gleiche UID = derselbe Termin.
    expect(buildIcs(BASE)).toBe(buildIcs(BASE))
  })

  it('wirft bei ungültigem Startzeitpunkt, statt eine kaputte Datei zu schreiben', () => {
    expect(() => buildIcs({ ...BASE, startIso: 'morgen' })).toThrow()
  })
})

describe('icsFileName', () => {
  it('stellt das Datum voran', () => {
    expect(icsFileName({ ...BASE, startIso: '2026-08-24T10:00:00' })).toMatch(/^2026-08-24 Modul 8\.ics$/)
  })

  it('entfernt Zeichen, die Dateisysteme nicht mögen', () => {
    expect(icsFileName({ ...BASE, title: 'Modul 8: Teil 1/2 <wichtig>' })).not.toMatch(/[/\\:*?"<>|]/)
  })
})
