import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadOllamaModels } from './ollamaModels'
import { useUIStore } from '../stores/uiStore'
import { isCloudModel, rememberRemoteOllamaModels } from '../../shared/modelCompatibility'

const LIST = [
  { name: 'qwen3:8b', size: 1 },
  { name: 'qwen3.5:cloud', size: 0, remoteHost: 'https://ollama.com:443' },
  { name: 'gpt-oss:120b', size: 0, remoteHost: 'https://ollama.com:443' },
]

function stub() {
  vi.stubGlobal('window', { electronAPI: { ollamaModels: vi.fn(async () => LIST.map(m => ({ ...m }))) } })
}
afterEach(() => {
  vi.unstubAllGlobals()
  rememberRemoteOllamaModels([])
  useUIStore.setState({ ollama: { ...useUIStore.getState().ollama, localOnly: false } })
})

describe('loadOllamaModels', () => {
  it('ohne „nur lokal“: volle Liste, neutral benannte Cloud-Modelle sind gekennzeichnet', async () => {
    stub()
    const models = await loadOllamaModels()
    expect(models.map(m => m.name)).toEqual(['qwen3:8b', 'qwen3.5:cloud', 'gpt-oss:120b'])
    expect(isCloudModel('gpt-oss:120b')).toBe(true)
  })
  it('mit „nur lokal“: Ollama-Cloud-Modelle fehlen in der Liste (auch neutral benannte)', async () => {
    stub()
    useUIStore.setState({ ollama: { ...useUIStore.getState().ollama, localOnly: true } })
    const models = await loadOllamaModels()
    expect(models.map(m => m.name)).toEqual(['qwen3:8b'])
  })
})
