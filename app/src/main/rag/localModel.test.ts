import { describe, it, expect, beforeEach } from 'vitest'
import { resolveLocalModel, listLocalModels, invalidateLocalModelCache, LocalModelError } from './localModel'

const TAGS = {
  models: [
    { name: 'bge-m3:latest', size: 1, digest: 'sha256:aaa' },
    { name: 'qwen3.5:cloud', size: 0, digest: 'sha256:bbb', remote_model: 'qwen3.5', remote_host: 'https://ollama.com' },
    { name: 'neutral:latest', size: 0, digest: 'sha256:ccc', remote_host: 'https://ollama.com' },
    { name: 'nodigest:latest', size: 5 },
    { name: 'dup:7b', size: 1, digest: 'sha256:ddd' }
  ]
}

function fetchWith(body: unknown, calls: { n: number }, ok = true) {
  return async () => {
    calls.n++
    return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response
  }
}

async function reason(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof LocalModelError ? e.reason : 'other'
  }
}

describe('resolveLocalModel', () => {
  beforeEach(() => invalidateLocalModelCache())

  it('löst einen Namen ohne Tag auf :latest auf und liefert den Digest', async () => {
    const calls = { n: 0 }
    const r = await resolveLocalModel('bge-m3', { fetchFn: fetchWith(TAGS, calls) })
    expect(r).toEqual({ name: 'bge-m3:latest', digest: 'sha256:aaa' })
    expect(calls.n).toBe(1)
  })

  it('lehnt Cloud-Tags ab, ohne Ollama zu fragen', async () => {
    const calls = { n: 0 }
    expect(await reason(resolveLocalModel('qwen3.5:cloud', { fetchFn: fetchWith(TAGS, calls) }))).toBe('cloud-tag')
    expect(await reason(resolveLocalModel('gpt-oss:120b-cloud', { fetchFn: fetchWith(TAGS, calls) }))).toBe('cloud-tag')
    expect(calls.n).toBe(0)
  })

  it('lehnt neutral benannte Modelle mit Remote-Metadaten ab', async () => {
    expect(await reason(resolveLocalModel('neutral', { fetchFn: fetchWith(TAGS, { n: 0 }) }))).toBe('remote')
  })

  it('lehnt fehlende Modelle und Modelle ohne Digest ab', async () => {
    expect(await reason(resolveLocalModel('gibtsnicht', { fetchFn: fetchWith(TAGS, { n: 0 }) }))).toBe('missing')
    expect(await reason(resolveLocalModel('nodigest', { fetchFn: fetchWith(TAGS, { n: 0 }) }))).toBe('no-digest')
    expect(await reason(resolveLocalModel('', { fetchFn: fetchWith(TAGS, { n: 0 }) }))).toBe('empty')
  })

  it('exakter Tag trifft nur exakt', async () => {
    const r = await resolveLocalModel('dup:7b', { fetchFn: fetchWith(TAGS, { n: 0 }) })
    expect(r.name).toBe('dup:7b')
    expect(await reason(resolveLocalModel('dup', { fetchFn: fetchWith(TAGS, { n: 0 }) }))).toBe('missing')
  })

  it('Ollama nicht erreichbar → unreachable, kein stiller Rückfall', async () => {
    const failing = async () => {
      throw new Error('ECONNREFUSED')
    }
    expect(await reason(resolveLocalModel('bge-m3', { fetchFn: failing }))).toBe('unreachable')
    expect(await reason(resolveLocalModel('bge-m3', { fetchFn: fetchWith(TAGS, { n: 0 }, false) }))).toBe('unreachable')
  })

  it('cached die Liste 15 s, fresh erzwingt Neuladen', async () => {
    const calls = { n: 0 }
    let t = 1000
    const now = () => t
    const fetchFn = fetchWith(TAGS, calls)
    await listLocalModels({ fetchFn, now })
    await listLocalModels({ fetchFn, now })
    expect(calls.n).toBe(1)
    await listLocalModels({ fetchFn, now, fresh: true })
    expect(calls.n).toBe(2)
    t += 20_000
    await listLocalModels({ fetchFn, now })
    expect(calls.n).toBe(3)
  })

  it('Digest-Wechsel nach pull wird bei fresh sichtbar', async () => {
    const a = await resolveLocalModel('bge-m3', { fetchFn: fetchWith(TAGS, { n: 0 }) })
    const changed = { models: [{ name: 'bge-m3:latest', size: 1, digest: 'sha256:NEU' }] }
    const b = await resolveLocalModel('bge-m3', { fetchFn: fetchWith(changed, { n: 0 }), fresh: true })
    expect(a.digest).not.toBe(b.digest)
  })
})
