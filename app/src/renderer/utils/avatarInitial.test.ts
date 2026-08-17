import { describe, it, expect } from 'vitest'
import { avatarInitial } from './avatarInitial'

describe('avatarInitial', () => {
  it('REGRESSION: Emoji am Anfang ergibt kein halbes Zeichen mehr', () => {
    // Der reale Fall: charAt(0) lieferte hier die erste Hälfte des Surrogatpaars,
    // angezeigt als Fragezeichen im Rhombus.
    const name = '🏫 - Medienzentrum Kontaktformular'
    // Beleg für die Ursache: die alte Zeile lieferte die erste Hälfte des Surrogatpaars,
    // ein für sich nicht darstellbares Zeichen.
    expect(name.charAt(0)).toBe('\uD83C')
    expect(avatarInitial(name, 'kontakt@medienzentrum.de')).toBe('M')
  })

  it('nimmt den ersten Buchstaben eines gewöhnlichen Namens', () => {
    expect(avatarInitial('Julia Eff', 'julia@example.org')).toBe('J')
  })

  it('überspringt Satzzeichen und Leerzeichen', () => {
    expect(avatarInitial('  "Stefan Jahn"', 'stefan@example.org')).toBe('S')
  })

  it('behält Umlaute und Akzente', () => {
    expect(avatarInitial('Änne Müller')).toBe('Ä')
    expect(avatarInitial('émile')).toBe('É')
  })

  it('nimmt eine Ziffer, wenn der Name mit einer anfängt', () => {
    expect(avatarInitial('360 Grad Medien')).toBe('3')
  })

  it('fällt auf die Adresse zurück, wenn der Name nur Emoji enthält', () => {
    expect(avatarInitial('📬📨', 'post@example.org')).toBe('P')
  })

  it('liefert leer, wenn nirgends ein Zeichen zu finden ist — Oberfläche zeigt dann ein Symbol', () => {
    expect(avatarInitial('📬', '')).toBe('')
    expect(avatarInitial(undefined, undefined)).toBe('')
    expect(avatarInitial(null, null)).toBe('')
  })

  it('gibt genau EIN Zeichen zurück, auch wenn Großschreiben zwei ergibt', () => {
    // „ß".toUpperCase() ist „SS" — im Avatar-Kreis ist Platz für ein Zeichen.
    expect([...avatarInitial('ßeta')].length).toBe(1)
  })
})
