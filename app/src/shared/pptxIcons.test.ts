import { describe, it, expect } from 'vitest'
import { PPTX_ICON_NAMES, iconGlyphXml, insetBox, resolvePptxIcon } from './pptxIcons'
import { PPTX_ICON_GRID, PPTX_ICON_PATHS } from './pptxIcons.generated'

describe('pptxIcons', () => {
  it('findet Symbole trotz Umlaut, Großschreibung, Lucide-Name und nahem Wort', () => {
    expect(resolvePptxIcon('lupe')).toBe('lupe')
    expect(resolvePptxIcon(' Glühbirne ')).toBe('gluehbirne')
    expect(resolvePptxIcon('Schild Haken')).toBe('schild-haken')
    expect(resolvePptxIcon('message-circle')).toBe('sprechblase')
    expect(resolvePptxIcon('Sicherheit')).toBe('schild')
    expect(resolvePptxIcon('einhorn')).toBeNull()
    expect(resolvePptxIcon('')).toBeNull()
    expect(resolvePptxIcon(undefined)).toBeNull()
    // Objekt-Eigenschaften sind keine Symbole.
    expect(resolvePptxIcon('constructor')).toBeNull()
    expect(resolvePptxIcon('toString')).toBeNull()
  })

  it('jeder Pfad beginnt mit einem Ansatzpunkt, kennt nur M/L/C/Z und bleibt im Raster', () => {
    expect(PPTX_ICON_NAMES.length).toBeGreaterThan(60)
    for (const name of PPTX_ICON_NAMES) {
      const parts = PPTX_ICON_PATHS[name].split(' ')
      expect(parts[0][0], name).toBe('M')
      for (const part of parts) {
        expect('MLCZ', `${name}: ${part}`).toContain(part[0])
        const nums = part.slice(1).split(',').filter(Boolean).map(Number)
        expect(nums.length, `${name}: ${part}`).toBe({ M: 2, L: 2, C: 6, Z: 0 }[part[0] as 'M' | 'L' | 'C' | 'Z'])
        for (const v of nums) {
          expect(Number.isInteger(v), `${name}: ${part}`).toBe(true)
          expect(v >= -100 && v <= PPTX_ICON_GRID + 100, `${name}: ${part}`).toBe(true)
        }
      }
    }
  })

  it('zeichnet eine Freihandform mit runder Linie; Strichstärke folgt der Größe', () => {
    const xml = iconGlyphXml(7, 'haken', { x: 100, y: 200, cx: 240000, cy: 240000 }, '<a:srgbClr val="FFFFFF"/>')
    expect(xml).toContain('<a:off x="100" y="200"/><a:ext cx="240000" cy="240000"/>')
    expect(xml).toContain('<a:moveTo><a:pt x="2000" y="600"/></a:moveTo><a:lnTo><a:pt x="900" y="1700"/></a:lnTo>')
    expect(xml).toContain('<a:noFill/><a:ln w="20000" cap="rnd"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:round/></a:ln>')
    expect(iconGlyphXml(1, 'einhorn', { x: 0, y: 0, cx: 10, cy: 10 }, '')).toBe('')
    expect(insetBox({ x: 0, y: 0, cx: 100, cy: 100 }, 0.5)).toEqual({ x: 25, y: 25, cx: 50, cy: 50 })
  })
})
