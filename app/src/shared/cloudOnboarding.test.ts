import { describe, it, expect } from 'vitest'
import {
  applyCloudOnboarding, isChatCloudModel, isFreeCloudModel, looksLikeApiKey, recommendCloudModel, shouldSuggestCloud,
  ONBOARDING_CLOUD_FEATURES
} from './cloudOnboarding'
import { DEFAULT_LLMBASE_SETTINGS, cloudRoutesForFeature, defaultCloudRoute, hasAiRouteFor } from './llmBackend'

describe('shouldSuggestCloud', () => {
  it('schlägt den Anbieter-Weg nur bei knappem Speicher ohne lokales Modell vor', () => {
    expect(shouldSuggestCloud(8, false)).toBe(true)
    expect(shouldSuggestCloud(8, true)).toBe(false)
    expect(shouldSuggestCloud(16, false)).toBe(false)
    expect(shouldSuggestCloud(null, false)).toBe(false)
  })
})

describe('recommendCloudModel', () => {
  // IDs wie im Live-Katalog vom 13.11.2026
  const llmbase = [
    { id: 'openai/gpt-oss-120b' }, { id: 'deepseek/deepseek-v4.1-flash' }, { id: 'deepseek/deepseek-v4-pro' },
    { id: 'moonshotai/kimi-k3' }, { id: 'qwen/qwen3.8-27b' }, { id: 'qwen/qwen3-embedding-8b' }
  ]
  it('nimmt den günstigen Allrounder, wenn es ihn gibt', () => {
    expect(recommendCloudModel(llmbase)).toBe('deepseek/deepseek-v4.1-flash')
  })
  it('nimmt die neueste Version einer Familie und keine Sondertarife oder Aliasse', () => {
    expect(recommendCloudModel([
      { id: 'deepseek/deepseek-v4-flash' }, { id: 'deepseek/deepseek-v4.1-flash' },
      { id: 'deepseek/deepseek-v4.1-flash:batch' }, { id: '~deepseek/deepseek-flash-latest' },
      { id: 'deepseek/deepseek-v4-flash-vision-exp' }, { id: 'deepseek/deepseek-v4.1-flash-1017' }
    ])).toBe('deepseek/deepseek-v4.1-flash')
  })
  it('fällt auf die nächste Familie zurück', () => {
    expect(recommendCloudModel([{ id: 'qwen/qwen3.8-27b' }, { id: 'moonshotai/kimi-k3' }])).toBe('qwen/qwen3.8-27b')
  })
  it('schlägt nichts vor, wenn keine bekannte Familie im Katalog steht', () => {
    expect(recommendCloudModel([{ id: 'foo/bar-1' }, { id: 'qwen/qwen3-embedding-8b' }])).toBeNull()
  })
  it('bleibt mit freeOnly bei kostenlosen Modellen', () => {
    const models = [
      { id: 'deepseek/deepseek-v4.1-flash', promptPrice: '0.0000003' },
      { id: 'qwen/qwen3.8-27b:free', promptPrice: '0' }
    ]
    expect(recommendCloudModel(models, { freeOnly: true })).toBe('qwen/qwen3.8-27b:free')
    expect(recommendCloudModel([models[0]], { freeOnly: true })).toBeNull()
  })
})

describe('isFreeCloudModel / looksLikeApiKey', () => {
  it('erkennt kostenlose Modelle an Endung oder Preis', () => {
    expect(isFreeCloudModel({ id: 'a/b:free' })).toBe(true)
    expect(isFreeCloudModel({ id: 'a/b', promptPrice: '0' })).toBe(true)
    expect(isFreeCloudModel({ id: 'a/b', promptPrice: '0.000001' })).toBe(false)
    expect(isFreeCloudModel({ id: 'a/b' })).toBe(false)
  })
  it('hält Embedding-Modelle aus der Auswahl', () => {
    expect(isChatCloudModel({ id: 'qwen/qwen3-embedding-8b' })).toBe(false)
    expect(isChatCloudModel({ id: 'qwen/qwen3.8-27b' })).toBe(true)
  })
  it('weist Sätze, Adressen und Kurzes als Schlüssel ab', () => {
    expect(looksLikeApiKey('sk-or-v1-0123456789abcdef0123')).toBe(true)
    expect(looksLikeApiKey('https://openrouter.ai/keys')).toBe(false)
    expect(looksLikeApiKey('mein schluessel steht hier')).toBe(false)
    expect(looksLikeApiKey('kurz')).toBe(false)
  })
})

describe('applyCloudOnboarding', () => {
  it('gibt die vier Funktionen frei, aber nie den E-Mail-Assistenten', () => {
    const next = applyCloudOnboarding({ ...DEFAULT_LLMBASE_SETTINGS }, ' qwen/qwen3.8-27b ')
    expect(next.enabled).toBe(true)
    expect(next.model).toBe('qwen/qwen3.8-27b')
    expect(next.cloudFeatures.sort()).toEqual([...ONBOARDING_CLOUD_FEATURES].sort())
    expect(next.cloudFeatures).not.toContain('email-draft')
  })
  it('behält eine früher erteilte Mail-Freigabe, statt sie zu streichen', () => {
    const next = applyCloudOnboarding({ ...DEFAULT_LLMBASE_SETTINGS, cloudFeatures: ['email-draft'] }, 'm')
    expect(next.cloudFeatures).toContain('email-draft')
  })
})

describe('defaultCloudRoute / hasAiRouteFor', () => {
  const ready = applyCloudOnboarding({ ...DEFAULT_LLMBASE_SETTINGS }, 'qwen/qwen3.8-27b')
  const llm = { enabled: true, selectedModel: '', llmbase: ready, openrouter: { ...DEFAULT_LLMBASE_SETTINGS } }
  const routes = cloudRoutesForFeature('notes-chat', llm)

  it('nimmt ohne lokales Modell den freigegebenen Anbieter', () => {
    expect(defaultCloudRoute(routes, { localChosen: false, hasLocalModel: false })?.provider).toBe('llmbase')
  })
  it('bleibt lokal, wenn ein lokales Modell da ist und kein Standardweg gesetzt wurde', () => {
    expect(defaultCloudRoute(routes, { localChosen: false, hasLocalModel: true })).toBeNull()
  })
  it('folgt dem Standardweg auch neben einem lokalen Modell', () => {
    expect(defaultCloudRoute(routes, { preferred: 'llmbase', localChosen: false, hasLocalModel: true })?.provider).toBe('llmbase')
  })
  it('überstimmt nie eine lokale Wahl im Tab', () => {
    expect(defaultCloudRoute(routes, { preferred: 'llmbase', localChosen: true, hasLocalModel: true })).toBeNull()
  })
  it('ignoriert einen Standardweg ohne Freigabe für die Funktion', () => {
    expect(defaultCloudRoute(cloudRoutesForFeature('email-draft', llm), { preferred: 'llmbase', localChosen: false, hasLocalModel: false })).toBeNull()
  })
  it('meldet eine Funktion als nutzbar, wenn nur der Anbieter eingerichtet ist', () => {
    expect(hasAiRouteFor('quiz', llm)).toBe(true)
    expect(hasAiRouteFor('email-draft', llm)).toBe(false)
    expect(hasAiRouteFor('quiz', { ...llm, enabled: false })).toBe(false)
  })
})
