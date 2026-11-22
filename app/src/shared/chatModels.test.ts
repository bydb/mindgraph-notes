// Fähigkeiten wie von Ollama 0.40.10 gemeldet (28.10.2026).
import { describe, it, expect, afterEach } from 'vitest'
import { chatModelsOnly, firstChatModel, isChatModel, isKnownNonChatModel, withoutCloudModels } from './chatModels'
import { rememberRemoteOllamaModels } from './modelCompatibility'

const installed = [
  { name: 'bge-m3:latest', capabilities: ['embedding'] },
  { name: 'qwen3.5:4b', capabilities: ['completion', 'vision', 'tools', 'thinking'] },
  { name: 'x/flux2-klein:latest', capabilities: ['image'] },
  { name: 'dengcao/Qwen3-Reranker-0.6B:Q8_0', capabilities: ['tools', 'thinking', 'completion'] },
  { name: 'llama3.1:8b', capabilities: ['completion', 'tools'] }
]

describe('isChatModel', () => {
  it('nimmt nur Modelle mit completion', () => {
    expect(chatModelsOnly(installed).map(m => m.name)).toEqual(['qwen3.5:4b', 'llama3.1:8b'])
  })

  it('schließt Reranker aus, obwohl sie completion melden', () => {
    expect(isChatModel(installed[3])).toBe(false)
  })

  it('behält Modelle ohne gemeldete Fähigkeiten (alte Ollama-Versionen, LM Studio)', () => {
    expect(isChatModel({ name: 'qwen/qwen3.5-4b' })).toBe(true)
    expect(isChatModel({ name: 'bge-m3' })).toBe(true)
  })

  it('erkennt Embedding-Modelle auch ohne Fähigkeiten am Namen', () => {
    expect(isChatModel({ name: 'text-embedding-nomic-embed-text-v1.5' })).toBe(false)
    expect(isChatModel({ name: 'nomic-embed-text:latest' })).toBe(false)
  })
})

describe('firstChatModel', () => {
  it('wählt nicht das erste Listenmodell, wenn es ein Embedding-Modell ist', () => {
    expect(firstChatModel(installed)).toBe('qwen3.5:4b')
  })

  it('liefert leer, wenn kein Chat-Modell installiert ist', () => {
    expect(firstChatModel([installed[0], installed[2]])).toBe('')
  })
})

describe('isKnownNonChatModel', () => {
  it('meldet ein gespeichertes Embedding-Modell', () => {
    expect(isKnownNonChatModel('bge-m3:latest', installed)).toBe(true)
  })

  it('schweigt bei Chat-Modellen, leerem Wert und nicht installierten Modellen', () => {
    expect(isKnownNonChatModel('qwen3.5:4b', installed)).toBe(false)
    expect(isKnownNonChatModel('', installed)).toBe(false)
    expect(isKnownNonChatModel('gibtsnicht:1b', installed)).toBe(false)
  })
})

describe('withoutCloudModels — „KI nur auf diesem Rechner“ (G02)', () => {
  const list = [{ name: 'qwen3:8b' }, { name: 'qwen3.5:cloud' }, { name: 'ministral-3:14b-cloud' }, { name: 'gpt-oss:120b' }]
  afterEach(() => rememberRemoteOllamaModels([]))

  it('ohne den Schalter bleibt die Liste unverändert', () => {
    expect(withoutCloudModels(list, false).map(m => m.name)).toEqual(list.map(m => m.name))
  })
  it('mit dem Schalter fallen Modelle mit Cloud-Endung weg', () => {
    expect(withoutCloudModels(list, true).map(m => m.name)).toEqual(['qwen3:8b', 'gpt-oss:120b'])
  })
  it('auch neutral benannte Cloud-Modelle (remote_host) fallen weg', () => {
    rememberRemoteOllamaModels([{ name: 'gpt-oss:120b', remoteHost: 'https://ollama.com:443' }])
    expect(withoutCloudModels(list, true).map(m => m.name)).toEqual(['qwen3:8b'])
  })
})
