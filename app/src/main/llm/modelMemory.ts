// Was ein lokales Modell wirklich an Speicher belegt (Rechnung und Anlass: shared/memoryPicture.ts).
//
// Nach einem lokalen Ollama-Aufruf merkt sich die App ein Wertepaar: Token im Kontext und die
// Größe, die Ollama für das geladene Modell meldet (`/api/ps`). Daraus ergibt sich mit der Zeit,
// was das Modell leer und je Token kostet. Nur zwei Zahlen je Paar, in userData — kein Inhalt,
// kein Dateiname, nie im Vault.
//
// Was NICHT gemessen wird (Prüfung agy F04, docs/codex-collab/speicherbild.md):
// - GGUF-Modelle: dort hängt die Größe am Fenster des Ladevorgangs, nicht am Füllstand. Weil die
//   App je Aufrufstelle andere Fenster setzt, ergäbe das eine scheinbar saubere, falsche Gerade.
//   Für GGUF bleibt es beim Modellaufbau.
// - Aufrufe, deren Token-Zahl nicht stimmt (verdeckter Denk-Anteil, siehe `hiddenThinking`).
// - Wechselt das Modell unter demselben Namen (`ollama pull`), beginnt die Messung neu (Digest).

import path from 'path'
import { promises as fs } from 'fs'
import { app } from 'electron'
import { OLLAMA_LOCAL_URL } from '../rag/localModel'
import { addMemorySample, fitModelMemory, type MeasuredModelMemory, type MemorySample } from '../../shared/memoryPicture'

interface Entry { digest: string; samples: MemorySample[] }
type Store = Record<string, Entry>

let loading: Promise<Store> | null = null
let writing: Promise<void> = Promise.resolve()

function storePath(): string {
  return path.join(app.getPath('userData'), 'model-memory.json')
}

/** Ein Modell, ein Eintrag: `name` und `name:latest` sind dasselbe. */
export function modelMemoryKey(model: string): string {
  const name = model.trim()
  return name.includes(':') ? name : `${name}:latest`
}

function isSample(value: unknown): value is MemorySample {
  const s = value as MemorySample | null
  return !!s && typeof s.tokens === 'number' && typeof s.bytes === 'number' && Number.isFinite(s.tokens) && Number.isFinite(s.bytes) && s.tokens > 0 && s.bytes > 0
}

/** Ablage lesen und alles Unbrauchbare verwerfen (auch die erste Fassung: reine Liste je Modell). */
export function parseModelMemoryStore(text: string): Store {
  const store: Store = {}
  let json: unknown
  try { json = JSON.parse(text) } catch { return store }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return store
  for (const [name, raw] of Object.entries(json as Record<string, unknown>)) {
    const entry = raw as { digest?: unknown; samples?: unknown } | unknown[]
    const list = Array.isArray(entry) ? entry : Array.isArray(entry?.samples) ? entry.samples : null
    if (!list) continue
    const digest = !Array.isArray(entry) && typeof entry.digest === 'string' ? entry.digest : ''
    store[modelMemoryKey(name)] = { digest, samples: list.filter(isSample) }
  }
  return store
}

function load(): Promise<Store> {
  // Eine gemeinsame Ladung: zwei gleichzeitige Aufrufe lasen sonst je eine eigene Kopie.
  loading ??= fs.readFile(storePath(), 'utf8').then(parseModelMemoryStore, () => ({}))
  return loading
}

async function persist(store: Store): Promise<void> {
  const file = storePath()
  const tmp = `${file}.${process.pid}.tmp`
  // Erst daneben schreiben, dann tauschen: ein Abbruch lässt die alte Datei stehen.
  writing = writing.then(async () => {
    await fs.writeFile(tmp, JSON.stringify(store), 'utf8')
    await fs.rename(tmp, file)
  }).catch(() => undefined)
  await writing
}

/** Wertepaar für das gerade benutzte Modell aufnehmen. Schlägt still fehl — es ist nur eine Messung. */
export async function sampleModelMemory(model: string, contextTokens: number): Promise<void> {
  if (process.env.VITEST || !model || !(contextTokens > 0)) return
  try {
    const res = await fetch(`${OLLAMA_LOCAL_URL}/api/ps`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return
    const json = await res.json() as { models?: Array<{ name?: string; model?: string; size?: number; digest?: string; details?: { format?: string } }> }
    const loaded = json.models ?? []
    // Mit zwei geladenen Modellen ist nicht sicher, wem der Speicher gehört — dann keine Messung.
    if (loaded.length !== 1) return
    const key = modelMemoryKey(model)
    const hit = loaded[0]
    if (modelMemoryKey(hit.name ?? '') !== key && modelMemoryKey(hit.model ?? '') !== key) return
    if (typeof hit.size !== 'number' || hit.size <= 0 || hit.details?.format === 'gguf') return
    const digest = typeof hit.digest === 'string' ? hit.digest : ''
    const store = await load()
    const before = store[key]
    // Ohne bekannten Digest (ältere Ablage) werden die Paare übernommen und ab jetzt gebunden.
    const samples = before && (before.digest === digest || before.digest === '') ? before.samples : []
    const next = addMemorySample(samples, { tokens: Math.round(contextTokens), bytes: hit.size })
    if (next === samples) return
    store[key] = { digest, samples: next }
    await persist(store)
  } catch {
    // Ollama nicht erreichbar oder Ablage nicht schreibbar: keine Messung, kein Fehler.
  }
}

/** Eigene Messung für das Modell, sobald genug Wertepaare da sind. */
export async function measuredModelMemory(model: string): Promise<MeasuredModelMemory | null> {
  try {
    return fitModelMemory((await load())[modelMemoryKey(model)]?.samples ?? [])
  } catch {
    return null
  }
}
