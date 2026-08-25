import { describe, expect, it } from 'vitest'
import { resolveOllamaExecutionProfile, type LlmExecutionProfile } from './agentExecutionProfile'

function profile(thinkingMode: 'preserve' | 'off'): LlmExecutionProfile {
  return {
    id: `test-${thinkingMode}`,
    ollama: { thinkingMode, temperature: 1, topP: 0.95 }
  }
}

describe('resolveOllamaExecutionProfile', () => {
  it('übersetzt Preserve in explizite, reproduzierbare Ollama-Parameter', () => {
    expect(resolveOllamaExecutionProfile(profile('preserve'))).toEqual({
      think: true,
      preserveThinking: true,
      temperature: 1,
      topP: 0.95
    })
  })

  it('schaltet Thinking bei Modus off ab, ohne es in die History zu übernehmen', () => {
    expect(resolveOllamaExecutionProfile(profile('off'))).toEqual({
      think: false,
      preserveThinking: false,
      temperature: 1,
      topP: 0.95
    })
  })

  it('lässt ohne Profil die Backend-Defaults unangetastet', () => {
    expect(resolveOllamaExecutionProfile()).toEqual({ preserveThinking: false })
  })
})
