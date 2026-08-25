// Reproduzierbare Laufparameter für LLM-Aufrufe.
//
// Das Profil beschreibt EINEN Lauf explizit (Thinking-Modus, Sampling) und wird
// vom Aufrufer übergeben — es gibt bewusst KEINE modellabhängige Automatik.
// Welcher Modus für welches Modell besser ist, entscheidet der Benchmark, nicht
// eine Heuristik im Produktcode. Das Profil enthält keine Nutzerdaten;
// Thinking-Inhalte selbst bleiben flüchtiger Konversationszustand.

export type AgentChatBackend = 'ollama' | 'lmstudio' | 'openrouter' | 'llmbase'
export type OllamaThinkingMode = 'preserve' | 'off'

export interface LlmExecutionProfile {
  id: string
  ollama: {
    thinkingMode: OllamaThinkingMode
    temperature: number
    topP: number
  }
}

export interface ResolvedOllamaExecutionProfile {
  think?: boolean
  preserveThinking: boolean
  temperature?: number
  topP?: number
}

/** Übersetzt das tiefe Profil in die kleinen Wire-Entscheidungen des Ollama-Adapters. */
export function resolveOllamaExecutionProfile(
  profile?: LlmExecutionProfile
): ResolvedOllamaExecutionProfile {
  if (!profile) return { preserveThinking: false }
  return {
    think: profile.ollama.thinkingMode !== 'off',
    preserveThinking: profile.ollama.thinkingMode === 'preserve',
    temperature: profile.ollama.temperature,
    topP: profile.ollama.topP
  }
}
