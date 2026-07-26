import { describe, expect, it, vi } from 'vitest'
import {
  OllamaCapabilityResolver,
  parseOllamaModels
} from './ollamaCapabilities'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('parseOllamaModels', () => {
  it('reicht die von /api/tags gemeldeten Capabilities durch', () => {
    expect(parseOllamaModels({
      models: [
        {
          name: 'gemma4:12b-mlx',
          size: 12,
          capabilities: ['completion', 'tools', 'thinking']
        }
      ]
    })).toEqual([
      {
        name: 'gemma4:12b-mlx',
        size: 12,
        capabilities: ['completion', 'tools', 'thinking']
      }
    ])
  })

  it('behält Modelle ohne Größenangabe statt sie aus den Pickern zu werfen', () => {
    expect(parseOllamaModels({
      models: [
        { name: 'ohne-groesse:latest', capabilities: ['completion', 'tools'] },
        { name: '   ', size: 1 },
        { name: 'mit-groesse:latest', size: 7 }
      ]
    })).toEqual([
      { name: 'ohne-groesse:latest', size: 0, capabilities: ['completion', 'tools'] },
      { name: 'mit-groesse:latest', size: 7 }
    ])
  })

  it('filtert ungültige Capability-Werte statt ihnen zu vertrauen', () => {
    expect(parseOllamaModels({
      models: [
        {
          name: 'modell:latest',
          size: 42,
          capabilities: ['TOOLS', null, 7, ' thinking ']
        }
      ]
    })).toEqual([
      {
        name: 'modell:latest',
        size: 42,
        capabilities: ['tools', 'thinking']
      }
    ])
  })
})

describe('OllamaCapabilityResolver', () => {
  it('nutzt /api/show autoritativ und cached das Ergebnis pro Modell', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      capabilities: ['completion', 'tools', 'thinking']
    }))
    const resolver = new OllamaCapabilityResolver({
      apiUrl: 'http://ollama.test',
      fetchFn
    })

    await expect(resolver.supportsTools('gemma4:12b-mlx', () => false)).resolves.toBe(true)
    await expect(resolver.supportsTools('gemma4:12b-mlx', () => false)).resolves.toBe(true)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith(
      'http://ollama.test/api/show',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ model: 'gemma4:12b-mlx' })
      })
    )
  })

  it('behandelt gemeldete Capabilities ohne tools als autoritatives Nein', async () => {
    const resolver = new OllamaCapabilityResolver({
      apiUrl: 'http://ollama.test',
      fetchFn: vi.fn(async () => jsonResponse({
        capabilities: ['completion']
      }))
    })

    await expect(resolver.supportsTools('qwen3-reranker:latest', () => true)).resolves.toBe(false)
  })

  it('sperrt nicht-generative Reranker auch bei irreführender tools-Capability', async () => {
    const resolver = new OllamaCapabilityResolver({
      apiUrl: 'http://ollama.test',
      fetchFn: vi.fn(async () => jsonResponse({
        capabilities: ['completion', 'tools']
      }))
    })

    await expect(
      resolver.supportsTools('dengcao/Qwen3-Reranker-0.6B:Q8_0', () => true)
    ).resolves.toBe(false)
  })

  it('verwendet bei nicht verfügbaren Metadaten den Fallback und cached Fehler nicht', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('Ollama nicht erreichbar')
    })
    const resolver = new OllamaCapabilityResolver({
      apiUrl: 'http://ollama.test',
      fetchFn
    })

    await expect(resolver.supportsTools('bekannt:latest', model => model.startsWith('bekannt'))).resolves.toBe(true)
    await expect(resolver.supportsTools('unbekannt:latest', () => false)).resolves.toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('fragt nach Ablauf der Cache-TTL erneut nach', async () => {
    let capabilities = ['completion', 'tools']
    const fetchFn = vi.fn(async () => jsonResponse({ capabilities }))
    let now = 1_000
    const resolver = new OllamaCapabilityResolver({
      apiUrl: 'http://ollama.test',
      fetchFn,
      cacheTtlMs: 60_000,
      now: () => now
    })

    await expect(resolver.supportsTools('modell:latest', () => false)).resolves.toBe(true)
    now += 59_000
    await expect(resolver.supportsTools('modell:latest', () => false)).resolves.toBe(true)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // Modell wurde zwischenzeitlich ersetzt — nach TTL-Ablauf muss das auffallen.
    capabilities = ['completion']
    now += 2_000
    await expect(resolver.supportsTools('modell:latest', () => true)).resolves.toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('nutzt den Fallback bei HTTP-Fehlern (z.B. 404 für ein LM-Studio-Modell)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'model not found' }, 404))
    const resolver = new OllamaCapabilityResolver({
      apiUrl: 'http://ollama.test',
      fetchFn
    })

    await expect(resolver.supportsTools('qwen/qwen3.5-4b', () => true)).resolves.toBe(true)
    await expect(resolver.supportsTools('unbekannt/modell', () => false)).resolves.toBe(false)
    // 404 darf nicht gecacht werden — ein später gezogenes Modell muss auffallen.
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('nutzt vorab aus /api/tags bekannte Capabilities ohne /api/show', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ capabilities: [] }))
    const resolver = new OllamaCapabilityResolver({
      apiUrl: 'http://ollama.test',
      fetchFn
    })
    resolver.rememberModels(parseOllamaModels({
      models: [
        {
          name: 'gemma4:latest',
          size: 1,
          capabilities: ['completion', 'tools']
        }
      ]
    }))

    await expect(resolver.supportsTools('gemma4:latest', () => false)).resolves.toBe(true)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
