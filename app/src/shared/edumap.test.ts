import { describe, it, expect } from 'vitest'
import { buildEdumap, toEdumapText, EdumapInputError, EDUMAP_LIMITS, EDUMAP_COLORS } from './edumap'

function box(n: number) {
  return { title: `Box ${n}`, content: 'Inhalt' }
}

describe('buildEdumap', () => {
  it('baut das Gerüst eines echten Edumaps-Exports', () => {
    const res = buildEdumap({
      title: 'Klimawandel 8b',
      columns: [
        { title: 'Material', color: 'blau', boxes: [{ title: 'Erklärvideo', content: 'https://example.org/video' }] },
        { title: 'Eure Fragen', color: 'orange', annotation: 'Welche Frage hast du zum Video?' }
      ],
      hint: 'Bitte eine Box pro Person, nur Vorname.'
    })
    const map = JSON.parse(res.json)
    expect(Object.keys(map)).toEqual(['mapdata', 'paths', 'labels'])
    expect(map.mapdata.title).toBe('Klimawandel 8b')
    expect(map.mapdata.language).toBe('de')
    expect(map.mapdata.mapfont).toBe('18') // Arial
    expect(map.paths).toHaveLength(2)
    expect(map.paths[0].color).toBe(EDUMAP_COLORS.blau)
    expect(map.paths[0].boxes[0]).toEqual({
      title: 'Erklärvideo',
      content: 'https://example.org/video',
      subject: null,
      booktime: null,
      booklimit: '0',
      color: null,
      flags: '0',
      position: null,
      showdate: null,
      extras: null
    })
    expect(map.paths[1].boxes).toEqual([])
    expect(map.paths[1].annotation).toBe('Welche Frage hast du zum Video?')
    expect(map.labels).toHaveLength(1)
    expect(res.openColumnCount).toBe(1)
    expect(res.boxCount).toBe(1)
  })

  it('lässt labels ohne Hinweis leer', () => {
    const map = JSON.parse(buildEdumap({ title: 'T', columns: [{ title: 'A', boxes: [box(1)] }] }).json)
    expect(map.labels).toEqual([])
  })

  it('lehnt eine leere Spalte ohne Arbeitsauftrag ab', () => {
    expect(() => buildEdumap({ title: 'T', columns: [{ title: 'Leer' }] })).toThrow(/Arbeitsauftrag/)
  })

  it('lehnt überladene Maps ab, statt still zu kürzen', () => {
    const tooManyColumns = Array.from({ length: EDUMAP_LIMITS.maxColumns + 1 }, (_, i) => ({ title: `S${i}`, boxes: [box(i)] }))
    expect(() => buildEdumap({ title: 'T', columns: tooManyColumns })).toThrow(EdumapInputError)

    const tooManyBoxes = [{ title: 'S', boxes: Array.from({ length: EDUMAP_LIMITS.maxBoxesPerColumn + 1 }, (_, i) => box(i)) }]
    expect(() => buildEdumap({ title: 'T', columns: tooManyBoxes })).toThrow(/pro Spalte/)

    const longBox = [{ title: 'S', boxes: [{ title: 'B', content: 'x'.repeat(EDUMAP_LIMITS.maxBoxContentChars + 1) }] }]
    expect(() => buildEdumap({ title: 'T', columns: longBox })).toThrow(/kürzen/)
  })

  it('sammelt alle Probleme in einer Meldung', () => {
    try {
      buildEdumap({ title: '', columns: [{ title: '', boxes: [{ title: '' }] }] })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(EdumapInputError)
      expect((e as EdumapInputError).issues.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('übernimmt Hex-Farben und meldet unbekannte Farbnamen', () => {
    const res = buildEdumap({
      title: 'T',
      columns: [{ title: 'S', boxes: [{ title: 'A', color: '#93e9be' }, { title: 'B', color: 'lila' }] }]
    })
    const map = JSON.parse(res.json)
    expect(map.paths[0].boxes[0].color).toBe('#93E9BE')
    expect(map.paths[0].boxes[1].color).toBeNull()
    expect(res.notes[0]).toContain('lila')
  })

  it('akzeptiert Grün mit Umlaut', () => {
    const map = JSON.parse(buildEdumap({ title: 'T', columns: [{ title: 'S', color: 'Grün', boxes: [box(1)] }] }).json)
    expect(map.paths[0].color).toBe(EDUMAP_COLORS.gruen)
  })
})

describe('toEdumapText', () => {
  it('wandelt Markdown-Links in die Edumaps-Schreibweise', () => {
    expect(toEdumapText('Siehe [Handreichung](https://example.org/a.pdf).')).toBe('Siehe {Handreichung}{https://example.org/a.pdf}.')
  })

  it('macht Überschriften zu fetten Zeilen und *-Listen zu --Listen', () => {
    expect(toEdumapText('## Ablauf\n* Einstieg\n* Arbeitsphase')).toBe('**Ablauf**\n- Einstieg\n- Arbeitsphase')
  })

  it('lässt nackte URLs und fetten Text unverändert', () => {
    expect(toEdumapText('**Wichtig:** https://example.org')).toBe('**Wichtig:** https://example.org')
  })
})
