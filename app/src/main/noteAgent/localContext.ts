// Kontextfenster lokaler Agentenläufe: was Ollama über das Modell weiß (shared/agentContext.ts).
// Nur Abfragen am lokalen Dienst, keine Inhalte.

import os from 'os'
import { OLLAMA_LOCAL_URL } from '../rag/localModel'
import { contextLengthFromShow } from '../../shared/webChat'

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

/** Größtes Fenster, das das Modell laut `/api/show` kann. null = nicht ermittelbar. */
export async function ollamaModelContextMax(model: string, fetchFn: FetchFn = fetch): Promise<number | null> {
  if (!model.trim()) return null
  try {
    const res = await fetchFn(`${OLLAMA_LOCAL_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(5000)
    })
    return res.ok ? contextLengthFromShow(await res.json()) : null
  } catch {
    return null
  }
}

export interface LoadedModelInfo {
  /** Belegter Speicher insgesamt (Gewichte + Kontext), Bytes. */
  sizeBytes: number
  /** Davon auf der Grafikeinheit, Bytes. */
  vramBytes: number
  /** Fenster, mit dem das Modell gerade geladen ist (fehlt bei alten Ollama-Versionen). */
  contextLength: number | null
}

/** Pur: Eintrag des Modells aus der Antwort von `/api/ps`. */
export function loadedModelFromPs(json: unknown, model: string): LoadedModelInfo | null {
  const models = (json as { models?: unknown } | null)?.models
  if (!Array.isArray(models)) return null
  const wanted = model.includes(':') ? model : `${model}:latest`
  for (const raw of models) {
    const m = raw as { name?: unknown; model?: unknown; size?: unknown; size_vram?: unknown; context_length?: unknown }
    if (m.name !== model && m.name !== wanted && m.model !== model && m.model !== wanted) continue
    if (typeof m.size !== 'number' || m.size <= 0) return null
    return {
      sizeBytes: m.size,
      vramBytes: typeof m.size_vram === 'number' ? m.size_vram : 0,
      contextLength: typeof m.context_length === 'number' && m.context_length > 0 ? m.context_length : null
    }
  }
  return null
}

/** Ist das Modell gerade geladen, und wie viel Speicher belegt es? null = nicht geladen/unbekannt. */
export async function ollamaLoadedModel(model: string, fetchFn: FetchFn = fetch): Promise<LoadedModelInfo | null> {
  if (!model.trim()) return null
  try {
    const res = await fetchFn(`${OLLAMA_LOCAL_URL}/api/ps`, { signal: AbortSignal.timeout(3000) })
    return res.ok ? loadedModelFromPs(await res.json(), model) : null
  } catch {
    return null
  }
}

export interface AgentContextInfo {
  modelMax: number | null
  loaded: LoadedModelInfo | null
  totalRamBytes: number
}

export async function agentContextInfo(model: string): Promise<AgentContextInfo> {
  const [modelMax, loaded] = await Promise.all([ollamaModelContextMax(model), ollamaLoadedModel(model)])
  return { modelMax, loaded, totalRamBytes: os.totalmem() }
}
