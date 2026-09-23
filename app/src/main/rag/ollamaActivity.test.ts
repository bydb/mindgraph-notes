import { describe, it, expect, beforeEach } from 'vitest'
import {
  beginOllamaActivity,
  ollamaForegroundCount,
  waitForOllamaIdle,
  withOllamaActivity,
  wrapIpcWithOllamaActivity,
  onOllamaActivityChange,
  ollamaActivityInternals
} from './ollamaActivity'

describe('ollamaActivity', () => {
  beforeEach(() => ollamaActivityInternals.reset())

  it('zählt Beginn und Ende, Ende ist idempotent', () => {
    const end = beginOllamaActivity('a')
    const end2 = beginOllamaActivity('b')
    expect(ollamaForegroundCount()).toBe(2)
    end()
    end()
    expect(ollamaForegroundCount()).toBe(1)
    end2()
    expect(ollamaForegroundCount()).toBe(0)
  })

  it('withOllamaActivity räumt auch bei Fehlern auf', async () => {
    await expect(withOllamaActivity('x', async () => {
      expect(ollamaForegroundCount()).toBe(1)
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(ollamaForegroundCount()).toBe(0)
  })

  it('wrapIpcWithOllamaActivity reicht Argumente und Ergebnis durch', async () => {
    const wrapped = wrapIpcWithOllamaActivity('h', async (a: number, b: number) => {
      expect(ollamaForegroundCount()).toBe(1)
      return a + b
    })
    expect(await wrapped(2, 3)).toBe(5)
    expect(ollamaForegroundCount()).toBe(0)
  })

  it('waitForOllamaIdle löst sofort bei 0 und sonst beim letzten Ende auf', async () => {
    await waitForOllamaIdle()
    const end = beginOllamaActivity('a')
    let resolved = false
    const p = waitForOllamaIdle().then(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false)
    end()
    await p
    expect(resolved).toBe(true)
  })

  it('waitForOllamaIdle bricht per Signal ab', async () => {
    const end = beginOllamaActivity('a')
    const ctl = new AbortController()
    const p = waitForOllamaIdle(ctl.signal)
    ctl.abort(new Error('stop'))
    await expect(p).rejects.toThrow('stop')
    end()
  })

  it('Zuhörer bekommen Änderungen, Abmeldung wirkt', () => {
    const seen: number[] = []
    const off = onOllamaActivityChange((n) => seen.push(n))
    const end = beginOllamaActivity('a')
    end()
    off()
    beginOllamaActivity('b')()
    expect(seen).toEqual([1, 0])
  })
})

describe('wrapIpcWithOllamaActivity — Cloud-Läufe halten den Indexer nicht an (F19)', () => {
  beforeEach(() => ollamaActivityInternals.reset())

  const fakeEvent = {} as never

  /** Meldet, wie hoch der Zähler WÄHREND des Laufs stand — darauf kommt es an. */
  function probe(usesLocal?: (...args: [unknown, boolean]) => boolean) {
    let during = -1
    const wrapped = wrapIpcWithOllamaActivity(
      'probe',
      async (_event: unknown, _cloud: boolean) => {
        during = ollamaForegroundCount()
        return 'fertig'
      },
      usesLocal
    )
    return { wrapped, seen: () => during }
  }

  it('ohne Prüfung zählt wie bisher die ganze Laufzeit', async () => {
    const { wrapped, seen } = probe()
    await expect(wrapped(fakeEvent, true)).resolves.toBe('fertig')
    expect(seen()).toBe(1)
    expect(ollamaForegroundCount()).toBe(0)
  })

  it('Prüfung false: der Lauf zählt nicht, das Ergebnis kommt trotzdem', async () => {
    const { wrapped, seen } = probe((_event, cloud) => !cloud)
    await expect(wrapped(fakeEvent, true)).resolves.toBe('fertig')
    expect(seen()).toBe(0)
    expect(ollamaForegroundCount()).toBe(0)
  })

  it('Prüfung true: der Lauf zählt', async () => {
    const { wrapped, seen } = probe((_event, cloud) => !cloud)
    await wrapped(fakeEvent, false)
    expect(seen()).toBe(1)
  })

  it('eine werfende Prüfung gilt als lokal — fail-closed', async () => {
    const { wrapped, seen } = probe(() => {
      throw new Error('kaputt')
    })
    await expect(wrapped(fakeEvent, true)).resolves.toBe('fertig')
    expect(seen()).toBe(1)
  })

  it('der Zähler bleibt auch beim nicht gezählten Lauf sauber, wenn der Handler wirft', async () => {
    const wrapped = wrapIpcWithOllamaActivity(
      'probe',
      async (_event: unknown, _cloud: boolean) => {
        throw new Error('Handler kaputt')
      },
      () => false
    )
    await expect(wrapped(fakeEvent, true)).rejects.toThrow('Handler kaputt')
    expect(ollamaForegroundCount()).toBe(0)
  })
})
