import { describe, expect, it } from 'vitest'
import { classifyRoute, evaluateCloudGate, hasCloudConsent, NOTE_AGENT_CLOUD_CONSENT_VERSION } from './agentRoute'

describe('classifyRoute — lokal, Cloud oder nicht geprüft', () => {
  it('OpenRouter und LLMBase sind immer Cloud', () => {
    expect(classifyRoute('openrouter', 'anthropic/claude-sonnet-4.5')).toMatchObject({ kind: 'cloud', providerLabel: 'OpenRouter' })
    expect(classifyRoute('llmbase', 'x')).toMatchObject({ kind: 'cloud', providerLabel: 'LLMBase' })
  })

  it('Ollama gilt nur nach erfolgreicher Prüfung als lokal', () => {
    expect(classifyRoute('ollama', 'qwen3.8:27b-mlx', { ok: true })).toMatchObject({ kind: 'local', providerLabel: 'Ollama' })
  })

  it('Ollama ohne Prüfergebnis ist nicht geprüft, nie lokal', () => {
    expect(classifyRoute('ollama', 'qwen3.8:27b-mlx')).toMatchObject({ kind: 'unverified', reason: 'not-checked' })
  })

  it('Cloud-Tag und remote_host machen aus Ollama einen Cloud-Weg', () => {
    expect(classifyRoute('ollama', 'qwen3.5:cloud', { ok: false, reason: 'cloud-tag' })).toMatchObject({ kind: 'cloud', provider: 'ollama-cloud', providerLabel: 'ollama.com' })
    // Neutraler Name, aber laut Metadaten entfernt — genau der Fall, den die Namensheuristik verfehlte.
    expect(classifyRoute('ollama', 'mein-modell', { ok: false, reason: 'remote' })).toMatchObject({ kind: 'cloud', provider: 'ollama-cloud' })
  })

  it('übrige Prüffehler sind „nicht geprüft“ mit Grund', () => {
    for (const reason of ['missing', 'ambiguous', 'no-digest', 'unreachable']) {
      expect(classifyRoute('ollama', 'm', { ok: false, reason })).toMatchObject({ kind: 'unverified', reason })
    }
  })

  it('LM Studio ist nie „lokal“ — erreichbar ist kein Nachweis des Ausführungsorts', () => {
    expect(classifyRoute('lmstudio', 'qwen/qwen3.5-4b')).toMatchObject({ kind: 'unverified', providerLabel: 'LM Studio' })
  })
})

describe('hasCloudConsent', () => {
  it('verlangt mindestens die aktuelle Version', () => {
    expect(hasCloudConsent(undefined)).toBe(false)
    expect(hasCloudConsent(0)).toBe(false)
    expect(hasCloudConsent('1')).toBe(false)
    expect(hasCloudConsent(NOTE_AGENT_CLOUD_CONSENT_VERSION)).toBe(true)
  })
})

describe('evaluateCloudGate — Main-seitige Cloud-Freigabe', () => {
  const or = (features: string[], model = 'anthropic/claude-sonnet-4.5') => ({
    enabled: true, hasApiKey: true, model, cloudModules: [], cloudFeatures: features as never, moduleModelOverrides: {}
  })
  const orRoute = classifyRoute('openrouter', 'anthropic/claude-sonnet-4.5')
  const ollamaCloud = classifyRoute('ollama', 'qwen3.5:cloud', { ok: false, reason: 'cloud-tag' })

  it('lokale und ungeprüfte Wege brauchen keine Freigabe', () => {
    expect(evaluateCloudGate(classifyRoute('ollama', 'm', { ok: true }), undefined, {})).toEqual({ ok: true })
    expect(evaluateCloudGate(classifyRoute('lmstudio', 'm'), undefined, {})).toEqual({ ok: true })
  })

  it('OpenRouter ohne Feature-Opt-in → optin', () => {
    expect(evaluateCloudGate(orRoute, 'anthropic/claude-sonnet-4.5', { ollama: { openrouter: or([]) }, noteAgentCloudConsentVersion: 1 })).toEqual({ ok: false, code: 'optin' })
  })

  it('ein vom Renderer untergeschobenes anderes Modell fällt durch', () => {
    expect(evaluateCloudGate(orRoute, 'openai/gpt-x', { ollama: { openrouter: or(['note-agent']) }, noteAgentCloudConsentVersion: 1 })).toEqual({ ok: false, code: 'optin' })
  })

  it('Opt-in ohne Zustimmung → consent; mit Zustimmung → ok', () => {
    const ui = { ollama: { openrouter: or(['note-agent']) } }
    expect(evaluateCloudGate(orRoute, 'anthropic/claude-sonnet-4.5', ui)).toEqual({ ok: false, code: 'consent' })
    expect(evaluateCloudGate(orRoute, 'anthropic/claude-sonnet-4.5', { ...ui, noteAgentCloudConsentVersion: NOTE_AGENT_CLOUD_CONSENT_VERSION })).toEqual({ ok: true })
  })

  it('Ollama-Cloud braucht die Zustimmung, aber keinen Anbieter-Opt-in', () => {
    expect(evaluateCloudGate(ollamaCloud, undefined, {})).toEqual({ ok: false, code: 'consent' })
    expect(evaluateCloudGate(ollamaCloud, undefined, { noteAgentCloudConsentVersion: 1 })).toEqual({ ok: true })
  })
})

