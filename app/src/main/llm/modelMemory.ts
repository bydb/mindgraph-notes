// Was ein lokales Modell wirklich an Speicher belegt (Rechnung und Anlass: shared/memoryPicture.ts).
//
// Nach jedem lokalen Ollama-Aufruf merkt sich die App ein Wertepaar: Token im Kontext und die
// Größe, die Ollama für das geladene Modell meldet (`/api/ps`). Daraus ergibt sich mit der Zeit,
// was das Modell leer und je Token kostet. Nur zwei Zahlen je Paar, in userData — kein Inhalt,
// kein Dateiname, nie im Vault.

import path from 'path'
import { promises as fs } from 'fs'
import { app } from 'electron'
import { OLLAMA_LOCAL_URL } from '../rag/localModel'
import { addMemorySample, fitModelMemory, type MeasuredModelMemory, type MemorySample } from '../../shared/memoryPicture'

type Store = Record<string, MemorySample[]>

let cache: Store | null = null
let writing: Promise<void> = Promise.resolve()

function storePath(): string {
  return path.join(app.getPath('userData'), 'model-memory.json')
}

async function load(): Promise<Store> {
  if (cache) return cache
  try {
    const json = JSON.parse(await fs.readFile(storePath(), 'utf8')) as unknown
    cache = json && typeof json === 'object' && !Array.isArray(json) ? json as Store : {}
  } catch {
    cache = {}
  }
  return cache
}

/** Wertepaar für das gerade benutzte Modell aufnehmen. Schlägt still fehl — es ist nur eine Messung. */
export async function sampleModelMemory(model: string, contextTokens: number): Promise<void> {
  if (process.env.VITEST || !model || !(contextTokens > 0)) return
  try {
    const res = await fetch(`${OLLAMA_LOCAL_URL}/api/ps`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return
    const json = await res.json() as { models?: Array<{ name?: string; model?: string; size?: number }> }
    const wanted = model.includes(':') ? model : `${model}:latest`
    const hit = (json.models ?? []).find(m => m.name === model || m.name === wanted || m.model === model || m.model === wanted)
    if (typeof hit?.size !== 'number' || hit.size <= 0) return
    const store = await load()
    const before = store[model] ?? []
    const next = addMemorySample(before, { tokens: Math.round(contextTokens), bytes: hit.size })
    if (next === before) return
    store[model] = next
    writing = writing.then(() => fs.writeFile(storePath(), JSON.stringify(store), 'utf8')).catch(() => undefined)
    await writing
  } catch {
    // Ollama nicht erreichbar oder Ablage nicht schreibbar: keine Messung, kein Fehler.
  }
}

/** Eigene Messung für das Modell, sobald genug Wertepaare da sind. */
export async function measuredModelMemory(model: string): Promise<MeasuredModelMemory | null> {
  try {
    return fitModelMemory((await load())[model] ?? [])
  } catch {
    return null
  }
}
