import { describe, expect, it } from 'vitest'
import {
  carryKeptLine, classifySkillVersion, compactSkillDiff, diffSkillLines, fingerprintText, normalizeSkillText, parseSkillVersionsManifest
} from './skillUpdate'

const KEEP = '^- Vorlage: '

describe('normalizeSkillText', () => {
  it('BOM, Windows-Zeilenenden und Leerzeilen am Ende ändern den Text nicht', () => {
    expect(normalizeSkillText('﻿a\r\nb\r\n\r\n')).toBe('a\nb\n')
    expect(normalizeSkillText('a\nb')).toBe('a\nb\n')
  })
})

describe('fingerprintText', () => {
  it('die behaltene Zeile zählt nicht mit, jede andere schon', () => {
    const a = '# T\n- Vorlage: `Skills/x/Muster.pptx`\nText\n'
    const b = '# T\n- Vorlage: `Vorlagen/Haus.potx`\nText\n'
    expect(fingerprintText(a, KEEP)).toBe(fingerprintText(b, KEEP))
    expect(fingerprintText(a, KEEP)).not.toBe(fingerprintText(a.replace('Text', 'Anderer Text'), KEEP))
    expect(fingerprintText(a)).not.toBe(fingerprintText(b))
  })

  it('nur die ERSTE passende Zeile wird ausgenommen', () => {
    const a = '- Vorlage: eins\n- Vorlage: zwei\n'
    expect(fingerprintText(a, KEEP)).not.toBe(fingerprintText('- Vorlage: eins\n- Vorlage: drei\n', KEEP))
  })

  it('ein kaputtes Muster wirkt wie keines', () => {
    expect(fingerprintText('a\n', '(')).toBe(fingerprintText('a\n'))
  })
})

describe('classifySkillVersion', () => {
  it('aktuell, veraltet (bekannte ältere Fassung), angepasst (unbekannt)', () => {
    expect(classifySkillVersion('c', 'c', ['a', 'b', 'c'])).toBe('current')
    expect(classifySkillVersion('a', 'c', ['a', 'b', 'c'])).toBe('outdated')
    expect(classifySkillVersion('x', 'c', ['a', 'b', 'c'])).toBe('modified')
  })

  it('aktuell gilt auch, wenn die Liste die Fassung der App nicht kennt', () => {
    expect(classifySkillVersion('c', 'c', [])).toBe('current')
  })
})

describe('carryKeptLine', () => {
  it('übernimmt die Zeile des Nutzers in die neue Fassung', () => {
    const r = carryKeptLine('# Neu\n- Vorlage: `Skills/x/Muster.pptx`\nNeuer Text\n', '# Alt\n- Vorlage: `Vorlagen/Haus.potx`\nAlter Text\n', KEEP)
    expect(r.text).toBe('# Neu\n- Vorlage: `Vorlagen/Haus.potx`\nNeuer Text\n')
    expect(r.carried).toBe('- Vorlage: `Vorlagen/Haus.potx`')
  })

  it('gleiche Zeile oder fehlende Zeile: neue Fassung bleibt, nichts gilt als übernommen', () => {
    expect(carryKeptLine('- Vorlage: a\n', '- Vorlage: a\n', KEEP)).toEqual({ text: '- Vorlage: a\n', carried: null })
    expect(carryKeptLine('ohne\n', '- Vorlage: a\n', KEEP)).toEqual({ text: 'ohne\n', carried: null })
    expect(carryKeptLine('- Vorlage: a\n', 'ohne\n', KEEP)).toEqual({ text: '- Vorlage: a\n', carried: null })
    expect(carryKeptLine('- Vorlage: a\r\n', '- Vorlage: b\n')).toEqual({ text: '- Vorlage: a\n', carried: null })
  })
})

describe('diffSkillLines', () => {
  it('meldet entfallene und neue Zeilen in Lesereihenfolge', () => {
    expect(diffSkillLines('a\nb\nc\n', 'a\nx\nc\nd\n')).toEqual([
      { type: 'same', text: 'a' }, { type: 'del', text: 'b' }, { type: 'add', text: 'x' }, { type: 'same', text: 'c' }, { type: 'add', text: 'd' }
    ])
  })

  it('gleiche Texte haben keinen Unterschied, auch bei anderen Zeilenenden', () => {
    expect(diffSkillLines('a\r\nb\r\n', 'a\nb\n').every(l => l.type === 'same')).toBe(true)
  })

  it('zusammengesetzt ergeben die Zeilen wieder beide Fassungen', () => {
    const oldT = 'eins\nzwei\ndrei\nvier\n', newT = 'null\neins\ndrei\nfünf\nvier\n'
    const d = diffSkillLines(oldT, newT)
    expect(d.filter(l => l.type !== 'add').map(l => l.text).join('\n') + '\n').toBe(oldT)
    expect(d.filter(l => l.type !== 'del').map(l => l.text).join('\n') + '\n').toBe(newT)
  })
})

describe('compactSkillDiff', () => {
  it('zeigt Änderungen mit Umgebung und markiert Lücken', () => {
    const same = (n: number) => Array.from({ length: n }, (_, i) => `z${i}`)
    const d = diffSkillLines([...same(10), 'alt', ...same(10)].join('\n'), [...same(10), 'neu', ...same(10)].join('\n'))
    const c = compactSkillDiff(d, 1)
    expect(c.filter(l => l && l.type !== 'same')).toHaveLength(2)
    expect(c.filter(l => l && l.type === 'same')).toHaveLength(2)
    expect(c[c.length - 1]).not.toBeNull()
  })

  it('ohne Änderung bleibt nichts übrig', () => {
    expect(compactSkillDiff(diffSkillLines('a\nb\n', 'a\nb\n'))).toEqual([])
  })
})

describe('parseSkillVersionsManifest', () => {
  it('nimmt nur gültige Ordnernamen und 64-stellige Prüfsummen', () => {
    const h = 'a'.repeat(64)
    const m = parseSkillVersionsManifest({ skills: { protokoll: { hashes: [h, 'kurz', 5], keepLine: '^x' }, '../raus': { hashes: [h] }, leer: {} } })
    expect(m.skills).toEqual({ protokoll: { keepLine: '^x', hashes: [h] } })
  })

  it('unbrauchbare Eingaben ergeben ein leeres Manifest', () => {
    for (const raw of [null, 'x', [], { skills: [] }, { skills: null }]) expect(parseSkillVersionsManifest(raw).skills).toEqual({})
  })
})
