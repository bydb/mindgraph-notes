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

export interface ModelMemoryEntry { digest: string; samples: MemorySample[] }
type Entry = ModelMemoryEntry
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

/** Was Ollama über ein Modell meldet (`/api/ps`, `/api/tags`) — nur die Felder, die hier zählen. */
export interface OllamaModelInfo { name?: string; model?: string; size?: number; digest?: string; details?: { format?: string } }

const isGguf = (info: OllamaModelInfo): boolean => (info.details?.format ?? '').toLowerCase() === 'gguf'
const sameModel = (info: OllamaModelInfo, key: string): boolean => modelMemoryKey(info.name ?? '') === key || modelMemoryKey(info.model ?? '') === key

/**
 * Neuer Ablage-Eintrag nach einem Aufruf, oder null = nichts aufnehmen. Rein, damit die Regeln
 * prüfbar sind: genau ein geladenes Modell, es ist das benutzte, kein GGUF, und ein anderer Digest
 * (Modell unter demselben Namen ersetzt) beginnt von vorn.
 */
export function nextModelMemoryEntry(before: Entry | undefined, loaded: OllamaModelInfo[], model: string, contextTokens: number): Entry | null {
  if (!model || !(contextTokens > 0)) return null
  // Mit zwei geladenen Modellen ist nicht sicher, wem der Speicher gehört — dann keine Messung.
  if (loaded.length !== 1) return null
  const hit = loaded[0]
  if (!sameModel(hit, modelMemoryKey(model))) return null
  if (typeof hit.size !== 'number' || hit.size <= 0 || isGguf(hit)) return null
  const digest = typeof hit.digest === 'string' ? hit.digest : ''
  // Ohne bekannten Digest (ältere Ablage) werden die Paare übernommen und ab jetzt gebunden.
  const samples = before && (before.digest === digest || before.digest === '') ? before.samples : []
  const next = addMemorySample(samples, { tokens: Math.round(contextTokens), bytes: hit.size })
  return next === samples ? null : { digest, samples: next }
}

/**
 * Gelten die abgelegten Paare für das Modell, wie es jetzt installiert ist? null = nein.
 * `installed` ist Ollamas Angabe aus `/api/tags`; fehlt sie, ist nichts nachprüfbar und nichts gilt.
 * `stale` heißt: der Eintrag gehört gelöscht (GGUF aus der ersten Fassung, oder ein ersetztes Modell).
 */
export function usableModelMemory(entry: Entry | undefined, installed: OllamaModelInfo | null): { samples: MemorySample[] | null; stale: boolean } {
  if (!entry) return { samples: null, stale: false }
  if (!installed) return { samples: null, stale: false }
  if (isGguf(installed)) return { samples: null, stale: true }
  const digest = typeof installed.digest === 'string' ? installed.digest : ''
  if (entry.digest && digest && entry.digest !== digest) return { samples: null, stale: true }
  return { samples: entry.samples, stale: false }
}

/** Wertepaar für das gerade benutzte Modell aufnehmen. Schlägt still fehl — es ist nur eine Messung. */
export async function sampleModelMemory(model: string, contextTokens: number): Promise<void> {
  // Im Testlauf kein Netz und keine Ablage; die Regeln selbst prüft `nextModelMemoryEntry`.
  if (process.env.VITEST || !model || !(contextTokens > 0)) return
  try {
    const res = await fetch(`${OLLAMA_LOCAL_URL}/api/ps`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return
    const json = await res.json() as { models?: OllamaModelInfo[] }
    const store = await load()
    const key = modelMemoryKey(model)
    const next = nextModelMemoryEntry(store[key], json.models ?? [], model, contextTokens)
    if (!next) return
    store[key] = next
    await persist(store)
  } catch {
    // Ollama nicht erreichbar oder Ablage nicht schreibbar: keine Messung, kein Fehler.
  }
}

/**
 * Eigene Messung für das Modell, sobald genug Wertepaare da sind — nur wenn sie zum installierten
 * Modell gehört. Vorher galten alte Paare nach einem `ollama pull` weiter, und Paare eines
 * GGUF-Modells aus der ersten Fassung blieben für immer (agy F18).
 */
export async function measuredModelMemory(model: string): Promise<MeasuredModelMemory | null> {
  try {
    const key = modelMemoryKey(model)
    const store = await load()
    if (!store[key]) return null
    const res = await fetch(`${OLLAMA_LOCAL_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
    const json = res.ok ? await res.json() as { models?: OllamaModelInfo[] } : null
    const installed = json?.models?.find(m => sameModel(m, key)) ?? null
    const usable = usableModelMemory(store[key], installed)
    if (usable.stale) {
      delete store[key]
      await persist(store)
    }
    return usable.samples ? fitModelMemory(usable.samples) : null
  } catch {
    return null
  }
}
