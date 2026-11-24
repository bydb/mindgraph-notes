// Kontextfenster lokaler Agentenläufe, vom Nutzer einstellbar (24.11.2026).
//
// Anlass: 32 768 Token reichen für einen Projektordner mit einem Dutzend Notizen plus Skill nicht;
// wer mehr Arbeitsspeicher hat, soll das Fenster selbst anheben können. Der Wert gilt NUR für
// lokale Ollama-Läufe: Cloud rechnet mit dem Anbieterkatalog, LM Studio ignoriert `num_ctx`.
//
// Nicht gemessen ist, wie die Antwortqualität mit einem vollen großen Fenster sinkt — die
// Oberfläche behauptet dazu nichts. Der Standard bleibt deshalb unverändert.

import { AGENT_NUM_CTX } from './contextGuard'

/** Raststufen des Reglers in Token. Die erste ist der Standard. */
export const AGENT_CONTEXT_STEPS = [32_768, 49_152, 65_536, 98_304, 131_072, 196_608, 262_144] as const

export const AGENT_CONTEXT_DEFAULT = AGENT_NUM_CTX

/** Gespeicherten Wert auf eine Raststufe bringen; alles Unbrauchbare wird zum Standard. */
export function normalizeAgentContextSetting(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= AGENT_CONTEXT_DEFAULT) return AGENT_CONTEXT_DEFAULT
  let best: number = AGENT_CONTEXT_DEFAULT
  for (const step of AGENT_CONTEXT_STEPS) if (step <= value) best = step
  return best
}

/** Stufen, die das Modell hergibt. Unbekanntes Maximum → nur der Standard ist sicher. */
export function availableAgentContextSteps(modelMax: number | null | undefined): number[] {
  if (typeof modelMax !== 'number' || !Number.isFinite(modelMax) || modelMax <= 0) return [AGENT_CONTEXT_DEFAULT]
  const steps = AGENT_CONTEXT_STEPS.filter(s => s <= modelMax)
  return steps.length ? [...steps] : [AGENT_CONTEXT_DEFAULT]
}

export type AgentContextReason =
  /** Standard gewählt — nichts zu tun. */
  | 'default'
  /** Eingestellter Wert gilt. */
  | 'setting'
  /** Das Modell kann weniger als eingestellt — auf sein Maximum begrenzt. */
  | 'model-max'
  /** Maximum des Modells nicht ermittelbar — Standard, weil ein zu großer Wert still gekürzt würde. */
  | 'unknown-max'

export interface AgentContextChoice {
  /** `num_ctx` für den Lauf, oder undefined = der Lauf nimmt seinen eigenen Standard. */
  numCtx?: number
  reason: AgentContextReason
  wanted: number
}

/**
 * Was der Lauf bekommt. Nie kleiner als der Standard; der Loop hebt für Web-/MCP-Läufe ohnehin
 * auf deren eigenes Minimum an.
 */
export function chooseAgentContext(setting: unknown, modelMax: number | null | undefined): AgentContextChoice {
  const wanted = normalizeAgentContextSetting(setting)
  if (wanted <= AGENT_CONTEXT_DEFAULT) return { reason: 'default', wanted }
  if (typeof modelMax !== 'number' || !Number.isFinite(modelMax) || modelMax <= 0) return { reason: 'unknown-max', wanted }
  if (modelMax < wanted) {
    const steps = availableAgentContextSteps(modelMax)
    const numCtx = steps[steps.length - 1]
    return numCtx > AGENT_CONTEXT_DEFAULT ? { numCtx, reason: 'model-max', wanted } : { reason: 'model-max', wanted }
  }
  return { numCtx: wanted, reason: 'setting', wanted }
}

/** Protokollzeile für den Lauf (deutsch wie alle Laufschritte). null = nichts zu melden. */
export function agentContextNote(choice: AgentContextChoice, modelMax: number | null | undefined): string | null {
  const n = (v: number): string => v.toLocaleString('de-DE')
  switch (choice.reason) {
    case 'default': return null
    case 'setting': return `Kontextfenster laut Einstellung: ${n(choice.numCtx ?? choice.wanted)} Token`
    case 'model-max': return `Eingestellt sind ${n(choice.wanted)} Token, das Modell kann höchstens ${n(modelMax ?? 0)} — gerechnet wird mit ${n(choice.numCtx ?? AGENT_CONTEXT_DEFAULT)} Token`
    case 'unknown-max': return `Eingestellt sind ${n(choice.wanted)} Token, aber Ollama nennt für dieses Modell kein Maximum — es bleibt beim Standard`
  }
}
