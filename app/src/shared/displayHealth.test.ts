import { describe, it, expect } from 'vitest'
import {
  analyzeDisplayHealth,
  detectLikelyMirroring,
  formatDisplayHealthLine,
  isHardwareAccelerated,
  LOW_REFRESH_HZ_THRESHOLD,
  type DisplayInfo
} from './displayHealth'

const laptop: DisplayInfo = {
  id: 1,
  internal: true,
  width: 1512,
  height: 982,
  scaleFactor: 2,
  refreshHz: 120
}

const beamer: DisplayInfo = {
  id: 2,
  internal: false,
  width: 1920,
  height: 1080,
  scaleFactor: 1,
  refreshHz: 60
}

describe('isHardwareAccelerated', () => {
  it('erkennt aktivierte GPU-Kompositierung', () => {
    expect(isHardwareAccelerated('enabled')).toBe(true)
    expect(isHardwareAccelerated('Enabled_On')).toBe(true)
  })

  it('erkennt Software-Fallbacks', () => {
    expect(isHardwareAccelerated('disabled_software')).toBe(false)
    expect(isHardwareAccelerated('unavailable_software')).toBe(false)
    expect(isHardwareAccelerated('disabled_off')).toBe(false)
  })

  it('meldet unbekannt statt Fehlalarm, wenn nichts gemeldet wird', () => {
    // Wichtig: kein `false`. Sonst warnt die App auf Plattformen, die den Status
    // schlicht nicht liefern, dauerhaft vor einem Problem, das es nicht gibt.
    expect(isHardwareAccelerated(undefined)).toBeNull()
    expect(isHardwareAccelerated('')).toBeNull()
    expect(isHardwareAccelerated('irgendwas_neues')).toBeNull()
  })
})

describe('detectLikelyMirroring', () => {
  it('erkennt deckungsgleiche Auflösungen als Spiegelung', () => {
    expect(detectLikelyMirroring([laptop, { ...beamer, width: laptop.width, height: laptop.height }])).toBe(true)
  })

  it('meldet keine Spiegelung bei erweitertem Schreibtisch', () => {
    expect(detectLikelyMirroring([laptop, beamer])).toBe(false)
  })

  it('meldet keine Spiegelung bei einem einzelnen Display', () => {
    expect(detectLikelyMirroring([laptop])).toBe(false)
  })
})

describe('analyzeDisplayHealth', () => {
  it('bewertet den Normalfall (nur Laptop, GPU aktiv) als unkritisch', () => {
    const health = analyzeDisplayHealth({ displays: [laptop], gpuCompositing: 'enabled' })

    expect(health.risky).toBe(false)
    expect(health.reasons).toEqual([])
    expect(health.externalConnected).toBe(false)
    expect(health.lowestRefreshHz).toBe(120)
  })

  it('flaggt Software-Rendering auch ohne zweiten Bildschirm', () => {
    const health = analyzeDisplayHealth({ displays: [laptop], gpuCompositing: 'disabled_software' })

    expect(health.hardwareAccelerated).toBe(false)
    expect(health.reasons).toContain('software-rendering')
    expect(health.risky).toBe(true)
  })

  it('flaggt niedrige Bildwiederholrate — der AirPlay-/Beamer-Fall', () => {
    const health = analyzeDisplayHealth({
      displays: [laptop, { ...beamer, refreshHz: 30 }],
      gpuCompositing: 'enabled'
    })

    expect(health.lowestRefreshHz).toBe(30)
    expect(health.reasons).toContain('low-refresh-rate')
  })

  it('nimmt genau den Schwellwert noch als in Ordnung hin', () => {
    const health = analyzeDisplayHealth({
      displays: [laptop, { ...beamer, refreshHz: LOW_REFRESH_HZ_THRESHOLD }],
      gpuCompositing: 'enabled'
    })

    expect(health.reasons).not.toContain('low-refresh-rate')
  })

  it('wertet eine nicht gemeldete Rate (0) nicht als 0 Hz', () => {
    // Regressionsschutz: `Math.min` über rohe Werte würde hier 0 liefern und
    // dauerhaft „unter 50 Hz" melden, obwohl gar nichts bekannt ist.
    const health = analyzeDisplayHealth({
      displays: [{ ...laptop, refreshHz: 0 }, beamer],
      gpuCompositing: 'enabled'
    })

    expect(health.lowestRefreshHz).toBe(60)
    expect(health.reasons).not.toContain('low-refresh-rate')
  })

  it('meldet null, wenn kein Display eine Rate liefert', () => {
    const health = analyzeDisplayHealth({
      displays: [{ ...laptop, refreshHz: 0 }],
      gpuCompositing: 'enabled'
    })

    expect(health.lowestRefreshHz).toBeNull()
    expect(health.reasons).not.toContain('low-refresh-rate')
  })

  it('flaggt gemischte Skalierung nur mit zweitem Bildschirm', () => {
    const withBeamer = analyzeDisplayHealth({ displays: [laptop, beamer], gpuCompositing: 'enabled' })
    expect(withBeamer.mixedScaleFactors).toBe(true)
    expect(withBeamer.reasons).toContain('mixed-scale-factors')

    const soloRetina = analyzeDisplayHealth({ displays: [laptop], gpuCompositing: 'enabled' })
    expect(soloRetina.reasons).not.toContain('mixed-scale-factors')
  })

  it('bildet den kompletten Beamer-Ernstfall ab', () => {
    const mirrored = { ...beamer, width: laptop.width, height: laptop.height, refreshHz: 30 }
    const health = analyzeDisplayHealth({
      displays: [laptop, mirrored],
      gpuCompositing: 'disabled_software'
    })

    expect(health.risky).toBe(true)
    expect(health.reasons).toEqual(
      expect.arrayContaining(['software-rendering', 'low-refresh-rate', 'mixed-scale-factors', 'likely-mirroring'])
    )
  })

  it('kommt mit einer leeren Display-Liste klar', () => {
    const health = analyzeDisplayHealth({ displays: [] })

    expect(health.displayCount).toBe(0)
    expect(health.lowestRefreshHz).toBeNull()
    expect(health.hardwareAccelerated).toBeNull()
    expect(health.risky).toBe(false)
  })
})

describe('formatDisplayHealthLine', () => {
  it('macht Software-Rendering im Log sofort sichtbar', () => {
    const health = analyzeDisplayHealth({ displays: [laptop], gpuCompositing: 'disabled_software' })
    const line = formatDisplayHealthLine(health)

    expect(line).toContain('GPU=SOFTWARE')
    expect(line).toContain('software-rendering')
  })

  it('bleibt im Normalfall ohne Risiko-Anhang', () => {
    const line = formatDisplayHealthLine(analyzeDisplayHealth({ displays: [laptop], gpuCompositing: 'enabled' }))

    expect(line).toContain('GPU=hardware')
    expect(line).not.toContain('Risiko')
  })
})
