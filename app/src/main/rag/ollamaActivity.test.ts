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
