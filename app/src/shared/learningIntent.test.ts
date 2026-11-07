import { describe, expect, it } from 'vitest'
import { looksLikeLearning } from './learningIntent'

describe('looksLikeLearning', () => {
  it.each([
    'ich schreib nächste woche ne klausur über die französische revolution',
    'Wir schreiben morgen Bio-Test, erklär mir Photosynthese',
    'Ich muss für das Abi Integralrechnung wiederholen',
    'Hilf mir, die unregelmäßigen Verben zu lernen',
    'Ich halte morgen ein Referat über Vulkane',
    'frag mich ab',
    'Stoff für die 10. Klasse',
    'quiz me on the French revolution'
  ])('erkennt: %s', (m) => expect(looksLikeLearning([m])).toBe(true))

  it.each([
    'Formuliere freundlicher: Ich brauche das bis morgen.',
    'Wie hoch ist der Eiffelturm?',
    'Welche Sehenswürdigkeiten sollte man in Paris besuchen?',
    'Schreib mir ein Gedicht über den Herbst',
    'Gib mir Ideen für ein Teamevent',
    'Wie schreibe ich eine gute Bewerbung?',
    'Teste bitte, ob der Link geht'
  ])('nicht: %s', (m) => expect(looksLikeLearning([m])).toBe(false))
})
