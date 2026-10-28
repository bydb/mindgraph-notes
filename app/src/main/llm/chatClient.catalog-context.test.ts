import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] }
}))

const lookup = vi.fn<() => Promise<number | null>>()
vi.mock('./cloudPricing', () => ({
  getModelPricing: vi.fn(async () => null),
  getModelContextLength: () => lookup()
}))

import { catalogContextLength } from './chatClient'

const cloud = { backend: 'openrouter' as const, openrouterModel: 'anthropic/claude-haiku', openrouterApiKey: 'k' }

describe('catalogContextLength (Codex F04)', () => {
  it('liefert den Katalogwert, wenn er rechtzeitig kommt', async () => {
    lookup.mockResolvedValueOnce(200_000)
    await expect(catalogContextLength(cloud, { timeoutMs: 1000 })).resolves.toBe(200_000)
  })

  it('gibt nach der Wartezeit null zurück statt den Start aufzuhalten', async () => {
    lookup.mockReturnValueOnce(new Promise(() => {}))
    const started = Date.now()
    await expect(catalogContextLength(cloud, { timeoutMs: 20 })).resolves.toBeNull()
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('reagiert auf Abbruch', async () => {
    lookup.mockReturnValueOnce(new Promise(() => {}))
    const abort = new AbortController()
    const pending = catalogContextLength(cloud, { timeoutMs: 60_000, signal: abort.signal })
    abort.abort()
    await expect(pending).resolves.toBeNull()
  })

  it('fragt bei lokalen Wegen gar nicht', async () => {
    lookup.mockClear()
    await expect(catalogContextLength({ backend: 'ollama' }, { timeoutMs: 20 })).resolves.toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })
})
