import { describe, expect, it } from 'vitest'
import { checkSignoff, enforceSignoff } from './emailSignoff'

const SENDER = 'Max Beispiel'
const SIG = '\n\n--\nE-Mail: max@example.org\nMusterstraße 1'

describe('checkSignoff', () => {
  it('erkennt einen fremden Namen unter der Grußformel', () => {
    const body = `Hallo,\n\nleider kann ich nicht.\n\nViele Grüße\nErika Fremd${SIG}`
    expect(checkSignoff(body, SENDER)).toEqual({ status: 'foreign', found: 'Erika Fremd' })
  })

  it('erkennt einen fremden Namen nach Leerzeile', () => {
    const body = `Text.\n\nFreundliche Grüße\n\nErika Fremd${SIG}`
    expect(checkSignoff(body, SENDER).status).toBe('foreign')
  })

  it('lässt den eigenen Namen durch — voll, nur Vorname, mit Zusatz', () => {
    expect(checkSignoff(`Text\n\nViele Grüße\nMax Beispiel${SIG}`, SENDER).status).toBe('ok')
    expect(checkSignoff(`Text\n\nViele Grüße\nMax${SIG}`, SENDER).status).toBe('ok')
    expect(checkSignoff(`Text\n\nLiebe Grüße\ndein Max`, SENDER).status).toBe('ok')
    expect(checkSignoff(`Text\n\nMit freundlichen Grüßen\nM. Beispiel, Leitung`, SENDER).status).toBe('ok')
  })

  it('gleicher Vorname, fremder Nachname ist fremd', () => {
    expect(checkSignoff(`Text\n\nViele Grüße\nMax Fremd`, SENDER).status).toBe('foreign')
  })

  it('fremder Vorname allein ist fremd', () => {
    expect(checkSignoff(`Hallo Tom,\n\ndanke.\n\nLG\nErika`, SENDER).status).toBe('foreign')
  })

  it('meldet eine Grußformel ohne Namen', () => {
    expect(checkSignoff(`Text\n\nViele Grüße${SIG}`, SENDER).status).toBe('missing-name')
    expect(checkSignoff(`Text\n\nViele Grüße\nPS: Die Unterlagen folgen morgen.`, SENDER).status).toBe('missing-name')
  })

  it('ohne Grußformel gibt es nichts zu prüfen', () => {
    expect(checkSignoff(`Danke, passt!${SIG}`, SENDER).status).toBe('none')
  })

  it('eine Grußformel mitten im Text zählt nicht', () => {
    const body = 'Viele Grüße\nsoll ich ausrichten.\nZeile\nZeile\nZeile\nZeile'
    expect(checkSignoff(body, SENDER).status).toBe('none')
  })

  it('prüft nur den eigenen Text, nicht Zitat oder Signatur', () => {
    const body = `Danke!\n\nViele Grüße\nMax\n\nAm 1.1.2026 schrieb Erika Fremd <e@example.org>:\n> Hallo\n> Viele Grüße\n> Erika Fremd`
    expect(checkSignoff(body, SENDER).status).toBe('ok')
    const quotedOnly = `Kurz: ja.\n\nAm 1.1.2026 schrieb Erika Fremd <e@example.org>:\n> Viele Grüße\n> Erika Fremd`
    expect(checkSignoff(quotedOnly, SENDER).status).toBe('none')
  })

  it('ohne bekannten Absendernamen wird nichts beanstandet', () => {
    expect(checkSignoff(`Text\n\nViele Grüße\nErika Fremd`, '').status).toBe('ok')
  })

  it('kennt englische Formeln', () => {
    expect(checkSignoff(`Text\n\nBest regards,\nErika Fremd`, SENDER).status).toBe('foreign')
  })
})

describe('enforceSignoff', () => {
  it('ersetzt den fremden Namen und lässt Signatur und Rest stehen', () => {
    const body = `Hallo,\n\nText.\n\nViele Grüße\nErika Fremd${SIG}`
    expect(enforceSignoff(body, SENDER)).toBe(`Hallo,\n\nText.\n\nViele Grüße\n${SENDER}${SIG}`)
  })

  it('ergänzt einen fehlenden Namen', () => {
    expect(enforceSignoff(`Text.\n\nViele Grüße${SIG}`, SENDER)).toBe(`Text.\n\nViele Grüße\n${SENDER}${SIG}`)
  })

  it('lässt eine richtige Unterschrift und Mails ohne Grußformel unverändert', () => {
    const ok = `Text.\n\nViele Grüße\nMax${SIG}`
    expect(enforceSignoff(ok, SENDER)).toBe(ok)
    expect(enforceSignoff('Danke!', SENDER)).toBe('Danke!')
  })

  it('das Ergebnis besteht die Prüfung', () => {
    const fixed = enforceSignoff(`Text.\n\nFreundliche Grüße\n\nErika Fremd${SIG}`, SENDER)
    expect(checkSignoff(fixed, SENDER).status).toBe('ok')
  })
})
