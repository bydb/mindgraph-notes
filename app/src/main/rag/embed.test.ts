import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { embedText } from './embed'
import { invalidateLocalModelCache } from './localModel'

vi.mock('../llm/telemetry', () => ({ recordLlmRun: () => undefined }))

const local = { models: [{ name: 'neutral:latest', size: 1, digest: 'sha256:aaa' }] }
const remote = { models: [{ name: 'neutral:latest', size: 1, digest: 'sha256:bbb', remote_host: 'https://ollama.com' }] }

let tagsResponses: unknown[] = []
let embeddingCalls = 0

beforeEach(() => {
  invalidateLocalModelCache()
  embeddingCalls = 0
  vi.stubGlobal('fetch', async (url: string) => {
    if (String(url).endsWith('/api/tags')) {
      const body = tagsResponses.shift() ?? local
      return { ok: true, status: 200, json: async () => body } as unknown as Response
    }
    if (String(url).endsWith('/api/embeddings')) {
      embeddingCalls++
      return { ok: true, status: 200, json: async () => ({ embedding: [1, 0] }) } as unknown as Response
    }
    throw new Error(`unerwartet: ${url}`)
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('Embedding-Grenze prüft vor JEDEM Request frisch (F35)', () => {
  it('lokal → Embedding; danach Remote-Metadaten → kein weiterer Embedding-Aufruf', async () => {
    tagsResponses = [local, remote]
    await expect(embedText('neutral', 'Text')).resolves.toEqual([1, 0])
    expect(embeddingCalls).toBe(1)
    await expect(embedText('neutral', 'Notiztext')).rejects.toThrow(/entfernten Host|nicht lokal/)
    expect(embeddingCalls).toBe(1)
  })

  it('Cloud-Tag wird ohne Netzaufruf abgelehnt', async () => {
    tagsResponses = []
    await expect(embedText('qwen3.5:cloud', 'Text')).rejects.toThrow(/Cloud/)
    expect(embeddingCalls).toBe(0)
  })
})
