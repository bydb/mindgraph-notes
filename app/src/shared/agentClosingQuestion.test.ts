import { describe, expect, it } from 'vitest'
import { endsWithQuestion } from './agentClosingQuestion'

describe('endsWithQuestion', () => {
  it('erkennt eine Rückfrage im letzten Absatz, auch wenn danach noch ein Satz folgt', () => {
    expect(endsWithQuestion('Ich habe 88 Einträge ausgewertet.\n\nMöchtest du, dass ich das als Notiz zusammenstelle? Ich kann es auch ergänzen.')).toBe(true)
    expect(endsWithQuestion('Fertig. Soll ich noch eine PDF erstellen?')).toBe(true)
  })

  it('eine Frage weiter oben oder als Inhalt zählt nicht', () => {
    expect(endsWithQuestion('Die Leitfrage war: Was hat geklappt?\n\nDie Notiz liegt im Zielordner.')).toBe(false)
    expect(endsWithQuestion('Ergebnis:\n\n> Warum ist das so?')).toBe(false)
    expect(endsWithQuestion('')).toBe(false)
  })
})
