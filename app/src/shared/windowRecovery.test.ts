import { describe, expect, it } from 'vitest'
import {
  AUTO_RELOAD_WINDOW_MS,
  MAX_AUTO_RELOADS,
  decideRendererRecovery,
  decideResumeAction,
  formatLifecycleLine
} from './windowRecovery'

describe('decideRendererRecovery', () => {
  const now = 10_000_000

  it('lädt nach Absturz, Kill oder Speichermangel neu', () => {
    for (const reason of ['crashed', 'killed', 'oom', 'abnormal-exit', 'memory-eviction', 'launch-failed']) {
      const d = decideRendererRecovery(reason, [], now, false)
      expect(d.action).toBe('reload')
      expect(d.recentReloads).toEqual([now])
    }
  })

  it('tut nichts bei regulärem Ende oder beim Beenden der App', () => {
    expect(decideRendererRecovery('clean-exit', [], now, false).action).toBe('none')
    expect(decideRendererRecovery('crashed', [], now, true).action).toBe('none')
  })

  it('fragt statt zu laden, sobald das Kontingent im Zeitfenster aufgebraucht ist', () => {
    const prev = Array.from({ length: MAX_AUTO_RELOADS }, (_, i) => now - 1000 * (i + 1))
    const d = decideRendererRecovery('crashed', prev, now, false)
    expect(d.action).toBe('ask')
    expect(d.recentReloads).toHaveLength(MAX_AUTO_RELOADS)
  })

  it('vergisst Neuladungen außerhalb des Zeitfensters', () => {
    const old = Array.from({ length: MAX_AUTO_RELOADS }, () => now - AUTO_RELOAD_WINDOW_MS - 1)
    const d = decideRendererRecovery('crashed', old, now, false)
    expect(d.action).toBe('reload')
    expect(d.recentReloads).toEqual([now])
  })

  it('ignoriert Zeitstempel aus der Zukunft (Uhr nach dem Aufwachen zurückgestellt)', () => {
    const future = Array.from({ length: MAX_AUTO_RELOADS }, () => now + 60_000)
    expect(decideRendererRecovery('crashed', future, now, false).action).toBe('reload')
  })
})

describe('decideResumeAction', () => {
  it('unterscheidet weg / abgestürzt / lebendig', () => {
    expect(decideResumeAction({ windowAlive: false, rendererCrashed: true })).toBe('none')
    expect(decideResumeAction({ windowAlive: true, rendererCrashed: true })).toBe('recover')
    expect(decideResumeAction({ windowAlive: true, rendererCrashed: false })).toBe('repaint')
  })
})

describe('formatLifecycleLine', () => {
  it('schreibt eine Zeile mit lokaler Zeit und ohne Zeilenumbrüche im Detail', () => {
    const line = formatLifecycleLine(new Date(2026, 9, 1, 9, 5, 3), 'render-process-gone', 'reason=oom\nexit=1')
    expect(line).toMatch(/^2026-10-01 09:05:03 [+-]\d{4} render-process-gone reason=oom exit=1\n$/)
  })

  it('lässt das Detail weg, wenn es leer ist', () => {
    expect(formatLifecycleLine(new Date(2026, 9, 1, 9, 5, 3), 'resume')).toMatch(/ resume\n$/)
  })
})
