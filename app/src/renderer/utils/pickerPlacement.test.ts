import { describe, it, expect } from 'vitest'
import { choosePlacement, PICKER_HEIGHT_ESTIMATE } from './pickerPlacement'

describe('choosePlacement', () => {
  it('bleibt oben, wenn dort das ganze Panel passt (Macher-Leiste am unteren Rand)', () => {
    expect(choosePlacement(600, 40).placement).toBe('above')
    expect(choosePlacement(PICKER_HEIGHT_ESTIMATE, 0).placement).toBe('above')
  })

  it('klappt nach unten, wenn oben zu wenig Platz ist (Agent-Tab, Zeile knapp unter der Überschrift)', () => {
    expect(choosePlacement(210, 600).placement).toBe('below')
  })

  it('klappt nach unten, auch wenn unten in Summe weniger Platz ist — das Suchfeld bleibt sichtbar', () => {
    // Der real gemeldete Fall: flaches Fenster, oben 253 px, unten 218 px. Oben
    // geklappt wird das Suchfeld abgeschnitten, unten nur die Trefferliste.
    expect(choosePlacement(253, 218).placement).toBe('below')
  })

  it('bleibt oben, wenn unten nicht einmal Suchfeld plus zwei Treffer passen', () => {
    expect(choosePlacement(180, 60).placement).toBe('above')
  })

  it('deckelt die Höhe auf den verfügbaren Platz', () => {
    expect(choosePlacement(253, 218).maxHeight).toBe(218)
    expect(choosePlacement(180, 60).maxHeight).toBe(180)
  })
})
