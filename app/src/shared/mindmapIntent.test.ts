import { describe, it, expect } from 'vitest'
import { asksForMindmap } from './mindmapIntent'

describe('asksForMindmap', () => {
  it('erkennt die üblichen Schreibweisen', () => {
    expect(asksForMindmap('Erstelle eine Mindmap zum Thema Hochtouren')).toBe(true)
    expect(asksForMindmap('Mind-Map zu meinen Projekten')).toBe(true)
    expect(asksForMindmap('eine mind map bitte')).toBe(true)
    expect(asksForMindmap('Zeichne Mindmaps für beide Kapitel')).toBe(true)
  })

  it('schweigt bei anderen Aufträgen', () => {
    expect(asksForMindmap('Fasse die Notiz zusammen')).toBe(false)
    expect(asksForMindmap('Erstelle eine Landkarte der Projekte')).toBe(false)
  })

  it('zählt verneinte Erwähnungen nicht (Codex F02)', () => {
    expect(asksForMindmap('Bitte keine Mindmap, nur eine Notiz')).toBe(false)
    expect(asksForMindmap('Statt einer Mind-Map lieber eine Tabelle')).toBe(false)
    expect(asksForMindmap('ohne Mindmap')).toBe(false)
    expect(asksForMindmap('no mind map please')).toBe(false)
  })

  it('findet einen späteren echten Wunsch trotz früherer Verneinung', () => {
    expect(asksForMindmap('Keine Mindmap aus der alten Notiz, sondern eine neue Mindmap zum Thema')).toBe(true)
  })

  it('erkennt Begriffsnetz und Vier-Felder-Matrix (gleiches Werkzeug)', () => {
    expect(asksForMindmap('Erstelle ein Begriffsnetz zur Photosynthese')).toBe(true)
    expect(asksForMindmap('Concept-Map zum Kapitel 3')).toBe(true)
    expect(asksForMindmap('Ordne die Aufgaben in einer Vier-Felder-Matrix')).toBe(true)
    expect(asksForMindmap('Bitte kein Begriffsnetz')).toBe(false)
    expect(asksForMindmap('Mach eine SWOT-Analyse als Notiz')).toBe(false)
  })

  it('verlangt Wortgrenzen', () => {
    expect(asksForMindmap('Lege es in die Mindmappe')).toBe(false)
  })
})
