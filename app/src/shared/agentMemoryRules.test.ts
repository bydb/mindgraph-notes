import { describe, expect, it } from 'vitest'
import { countMemoryFreeLines, parseMemoryRules } from './agentMemoryRules'

const NOTE = `# Agent-Gedächtnis

Gelernte Regeln aus Agent-Läufen — fließen in jeden Lauf ein. Frei editierbar:
Überholtes einfach löschen.

- 2026-10-24: Jede Sachaussage mit Quelle belegen.

- 2026-11-07: Tabellen im Excel-Format.
`

describe('parseMemoryRules', () => {
  it('liest Regeln mit und ohne Datum', () => {
    expect(parseMemoryRules(NOTE).map(r => [r.date, r.text])).toEqual([
      ['2026-10-24', 'Jede Sachaussage mit Quelle belegen.'],
      ['2026-11-07', 'Tabellen im Excel-Format.']
    ])
    expect(parseMemoryRules('* Kurz antworten\n  - eingerückt')).toEqual([
      { raw: '* Kurz antworten', text: 'Kurz antworten' },
      { raw: '  - eingerückt', text: 'eingerückt' }
    ])
  })
  it('hält Überschrift, Kopf und leere Punkte nicht für Regeln', () => {
    expect(parseMemoryRules('# Titel\n\nText\n- \n-ohne Leerzeichen')).toEqual([])
  })
})

describe('countMemoryFreeLines', () => {
  it('zählt nur freien Text, nicht den Standardkopf', () => {
    expect(countMemoryFreeLines(NOTE)).toBe(0)
    expect(countMemoryFreeLines(NOTE + '\nImmer duzen.\nNie Tabellen.\n')).toBe(2)
  })
})
