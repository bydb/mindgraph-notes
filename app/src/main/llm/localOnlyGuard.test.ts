// „KI nur auf diesem Rechner": Guard selbst + Durchsetzung im chatClient (Chat, Tool-Use, Cloud-Stream).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const netFetch = vi.fn()
vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => netFetch(...args) },
  BrowserWindow: { getAllWindows: () => [] },
}))

import {
  configureLocalOnlyGuard, isLocalOnlyInSettings, isLocalOnlyActive, localOnlyState,
  assertCloudAllowed, assertLocalOllamaModel, LocalOnlyError
} from './localOnlyGuard'
import { chat, chatWithTools, streamCloudChat } from './chatClient'
import { isCloudModel, rememberRemoteOllamaModels } from '../../shared/modelCompatibility'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// /api/tags wie Ollama ihn liefert: ein echtes lokales Modell, ein Cloud-Modell mit neutralem
// Namen (nur remote_host verrät es), ein Cloud-Modell mit Endung.
const TAGS = {
  models: [
    { name: 'qwen3:8b', size: 5, digest: 'sha256:aaa' },
    { name: 'gpt-oss:120b', size: 0, digest: 'sha256:bbb', remote_model: 'gpt-oss:120b', remote_host: 'https://ollama.com:443' },
    { name: 'deepseek-v3.1:671b-cloud', size: 0, digest: 'sha256:ccc', remote_host: 'https://ollama.com:443' },
  ]
}

let localOnly = false
const fetchMock = vi.fn(async (url: string) => {
  if (String(url).endsWith('/api/tags')) return jsonResponse(TAGS)
  return jsonResponse({})
})

beforeEach(() => {
  localOnly = false
  configureLocalOnlyGuard(async () => ({ ollama: { localOnly } }))
  fetchMock.mockClear()
  netFetch.mockReset()
  netFetch.mockResolvedValue(jsonResponse({ message: { role: 'assistant', content: 'ok' }, done: true }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  configureLocalOnlyGuard(null)
  vi.unstubAllGlobals()
  rememberRemoteOllamaModels([])
})

describe('isLocalOnlyInSettings', () => {
  it('nur ein echtes true zählt', () => {
    expect(isLocalOnlyInSettings({ ollama: { localOnly: true } })).toBe(true)
    expect(isLocalOnlyInSettings({ ollama: { localOnly: 'true' } })).toBe(false)
    expect(isLocalOnlyInSettings({ ollama: {} })).toBe(false)
    expect(isLocalOnlyInSettings({})).toBe(false)
    expect(isLocalOnlyInSettings(null)).toBe(false)
  })
  it('ohne Konfiguration: aus (Verhalten wie vor 11/2026)', async () => {
    configureLocalOnlyGuard(null)
    expect(await isLocalOnlyActive()).toBe(false)
  })
  it('Einstellungen nicht lesbar: Stand unbekannt, Cloud gesperrt mit eigener Meldung (Codex F27)', async () => {
    configureLocalOnlyGuard(async () => { throw new Error('kaputt') })
    expect(await localOnlyState()).toBe('unknown')
    expect(await isLocalOnlyActive()).toBe(true)
    await expect(assertCloudAllowed('OpenRouter')).rejects.toThrow(/Einstellungen lassen sich gerade nicht lesen/)
  })
  it('liest den Schalter bei jedem Aufruf frisch', async () => {
    expect(await isLocalOnlyActive()).toBe(false)
    localOnly = true
    expect(await isLocalOnlyActive()).toBe(true)
  })
})

describe('assertCloudAllowed / assertLocalOllamaModel', () => {
  it('ohne localOnly: Cloud erlaubt, Modell ungeprüft (kein /api/tags-Abruf)', async () => {
    await expect(assertCloudAllowed()).resolves.toBeUndefined()
    expect(await assertLocalOllamaModel('gpt-oss:120b')).toBe('gpt-oss:120b')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('mit localOnly: Cloud-Anbieter abgewiesen', async () => {
    localOnly = true
    await expect(assertCloudAllowed('OpenRouter')).rejects.toBeInstanceOf(LocalOnlyError)
  })
  it('mit localOnly: neutral benanntes Cloud-Modell (remote_host) abgewiesen', async () => {
    localOnly = true
    await expect(assertLocalOllamaModel('gpt-oss:120b')).rejects.toThrow(/entfernten Host/)
  })
  it('mit localOnly: Cloud-Endung und nicht installiertes Modell abgewiesen', async () => {
    localOnly = true
    await expect(assertLocalOllamaModel('deepseek-v3.1:671b-cloud')).rejects.toThrow(LocalOnlyError)
    await expect(assertLocalOllamaModel('gibtsnicht:1b')).rejects.toThrow(/nicht installiert/)
  })
  it('mit localOnly: lokales Modell mit Digest geht durch; Liste wird frisch geholt', async () => {
    localOnly = true
    expect(await assertLocalOllamaModel('qwen3:8b')).toBe('qwen3:8b')
    expect(await assertLocalOllamaModel('qwen3:8b')).toBe('qwen3:8b')
    expect(fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/api/tags')).length).toBe(2)
  })
})

describe('chatClient setzt localOnly durch', () => {
  it('chat() mit OpenRouter wird abgewiesen, bevor etwas gesendet wird', async () => {
    localOnly = true
    await expect(chat([{ role: 'user', content: 'x' }], { backend: 'openrouter', openrouterApiKey: 'k', openrouterModel: 'm', telemetryModule: 'chat' }))
      .rejects.toBeInstanceOf(LocalOnlyError)
    expect(netFetch).not.toHaveBeenCalled()
  })
  it('chatWithTools() mit LLMBase wird abgewiesen', async () => {
    localOnly = true
    await expect(chatWithTools([{ role: 'user', content: 'x' }], [], { backend: 'llmbase', llmbaseApiKey: 'k', llmbaseModel: 'm', telemetryModule: 'chat' }))
      .rejects.toBeInstanceOf(LocalOnlyError)
    expect(netFetch).not.toHaveBeenCalled()
  })
  it('streamCloudChat() wird abgewiesen', async () => {
    localOnly = true
    await expect(streamCloudChat([{ role: 'user', content: 'x' }], { backend: 'openrouter', apiKey: 'k', model: 'm', telemetryModule: 'chat' }, () => {}))
      .rejects.toBeInstanceOf(LocalOnlyError)
  })
  it('Ollama-Chat mit remote_host-Modell wird abgewiesen, bevor /api/chat läuft', async () => {
    localOnly = true
    await expect(chat([{ role: 'user', content: 'x' }], { backend: 'ollama', ollamaModel: 'gpt-oss:120b', telemetryModule: 'chat' }))
      .rejects.toBeInstanceOf(LocalOnlyError)
    expect(netFetch).not.toHaveBeenCalled()
  })
  it('Ollama-Chat mit lokalem Modell läuft', async () => {
    localOnly = true
    const res = await chat([{ role: 'user', content: 'x' }], { backend: 'ollama', ollamaModel: 'qwen3:8b', telemetryModule: 'chat' })
    expect(res.text).toBe('ok')
    const body = JSON.parse((netFetch.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.model).toBe('qwen3:8b')
  })
  it('ohne localOnly bleibt ein ausdrücklich gewähltes Cloud-Modell nutzbar (Verhalten wie bisher)', async () => {
    const res = await chat([{ role: 'user', content: 'x' }], { backend: 'ollama', ollamaModel: 'gpt-oss:120b', telemetryModule: 'chat' })
    expect(res.text).toBe('ok')
  })
  it('Auto-Pick nimmt kein neutral benanntes Cloud-Modell', async () => {
    const tags = { models: [TAGS.models[1], { name: 'llama3.1:8b', size: 5, digest: 'sha256:ddd' }] }
    fetchMock.mockImplementation(async (url: string) => String(url).endsWith('/api/tags') ? jsonResponse(tags) : jsonResponse({}))
    await chat([{ role: 'user', content: 'x' }], { backend: 'ollama', telemetryModule: 'chat' })
    const body = JSON.parse((netFetch.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.model).toBe('llama3.1:8b')
  })
})

describe('rememberRemoteOllamaModels — Cloud-Kennzeichnung auch ohne localOnly', () => {
  it('kennzeichnet remote_host-Modelle mit neutralem Namen als Cloud', () => {
    expect(isCloudModel('gpt-oss:120b')).toBe(false)
    rememberRemoteOllamaModels([{ name: 'gpt-oss:120b', remoteHost: 'https://ollama.com:443' }, { name: 'qwen3:8b' }])
    expect(isCloudModel('gpt-oss:120b')).toBe(true)
    expect(isCloudModel('qwen3:8b')).toBe(false)
  })
  it('`:latest` gilt auch ohne Tag', () => {
    rememberRemoteOllamaModels([{ name: 'kimi:latest', remoteModel: 'kimi' }])
    expect(isCloudModel('kimi')).toBe(true)
  })
  it('neue Liste ersetzt die alte; Namensregel bleibt', () => {
    rememberRemoteOllamaModels([{ name: 'gpt-oss:120b', remoteHost: 'h' }])
    rememberRemoteOllamaModels([])
    expect(isCloudModel('gpt-oss:120b')).toBe(false)
    expect(isCloudModel('qwen3.5:cloud')).toBe(true)
  })
})
