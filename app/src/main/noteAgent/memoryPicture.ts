// Speicherbild für lokale Modelle: liest Belegung, Auslagerung, Programme und Ollamas eigene
// Vorausrechnung vom Rechner (Rechnung und Grenzen: shared/memoryPicture.ts).
//
// Nur Zahlen, keine Inhalte: `vm_stat`, `sysctl vm.swapusage`, `ps` (Größe und Programmname) und
// aus dem Ollama-Log allein die Zeile mit der Speicher-Vorausrechnung. Nur macOS auf Apple Silicon —
// mit eigener Grafikkarte liegt das Modell im Grafikspeicher, das Bild wäre dort falsch.

import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { app } from 'electron'
import { OLLAMA_LOCAL_URL } from '../rag/localModel'
import { ollamaLoadedModel } from './localContext'
import { measuredModelMemory } from '../llm/modelMemory'
import { reopenableApps } from './memoryRelief'
import {
  groupProcesses, kvBytesPerTokenFromShow, latestContextProjection, memoryPicture, swapUsedBytes, usedBytesFromVmStat,
  type MemoryPicture, type OllamaContextProjection, type ProcessGroup
} from '../../shared/memoryPicture'

const LOG_TAIL_BYTES = 2 * 1024 * 1024
const TOP_APPS = 8
const MIN_APP_BYTES = 150 * 1024 * 1024

function run(file: string, args: string[]): Promise<string> {
  return new Promise(resolve => {
    execFile(file, args, { timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout))
  })
}

async function logTail(file: string): Promise<string> {
  try {
    const handle = await fs.open(file, 'r')
    try {
      const { size } = await handle.stat()
      const length = Math.min(size, LOG_TAIL_BYTES)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, size - length)
      return buffer.toString('utf8')
    } finally {
      await handle.close()
    }
  } catch {
    return ''
  }
}

// Ollama dreht sein Log bei jedem Neustart weiter; die Vorausrechnung eines Modells steht dann
// im Vorgänger oder gar nicht mehr. Deshalb: aktuelles Log, sonst der Vorgänger, sonst der zuletzt
// gesehene Wert aus der eigenen Ablage (nur die drei Zahlen je Modellname).
function projectionCachePath(): string {
  return path.join(app.getPath('userData'), 'memory-projections.json')
}

async function readProjectionCache(): Promise<Record<string, OllamaContextProjection>> {
  try {
    const json = JSON.parse(await fs.readFile(projectionCachePath(), 'utf8')) as unknown
    return json && typeof json === 'object' ? json as Record<string, OllamaContextProjection> : {}
  } catch {
    return {}
  }
}

async function contextProjection(model: string): Promise<OllamaContextProjection | null> {
  const dir = path.join(os.homedir(), '.ollama', 'logs')
  const found = latestContextProjection(await logTail(path.join(dir, 'server.log')), model)
    ?? latestContextProjection(await logTail(path.join(dir, 'server-1.log')), model)
  const cache = await readProjectionCache()
  if (!found) {
    const kept = cache[model]
    return kept && kept.contextLength > 0 && kept.fullContextBytes > 0 ? kept : null
  }
  const before = cache[model]
  if (!before || before.contextLength !== found.contextLength || before.fullContextBytes !== found.fullContextBytes) {
    await fs.writeFile(projectionCachePath(), JSON.stringify({ ...cache, [model]: found }), 'utf8').catch(() => undefined)
  }
  return found
}

/** Größe der Modellgewichte laut `/api/tags`. null = nicht ermittelbar. */
async function modelWeightsBytes(model: string): Promise<number | null> {
  try {
    const res = await fetch(`${OLLAMA_LOCAL_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const json = await res.json() as { models?: Array<{ name?: string; model?: string; size?: number }> }
    const wanted = model.includes(':') ? model : `${model}:latest`
    const hit = (json.models ?? []).find(m => m.name === model || m.name === wanted || m.model === model || m.model === wanted)
    return typeof hit?.size === 'number' && hit.size > 0 ? hit.size : null
  } catch {
    return null
  }
}

/** Kosten je Token aus dem Modellaufbau (`/api/show`) — nur GGUF nennt die nötigen Angaben. */
async function architectureBytesPerToken(model: string): Promise<number | null> {
  try {
    const res = await fetch(`${OLLAMA_LOCAL_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(5000)
    })
    return res.ok ? kvBytesPerTokenFromShow(await res.json()) : null
  } catch {
    return null
  }
}

export type MemoryPictureResult =
  | { supported: false }
  | {
      supported: true
      picture: MemoryPicture
      /** Belegte Auslagerung; null = nicht lesbar. */
      swapUsedBytes: number | null
      /** Größte Programme außer Ollama. */
      apps: ProcessGroup[]
      /** Fenster, für das Ollamas Vorausrechnung gilt; null = keine gefunden. */
      projectionContext: number | null
      /** Programme, die über „Platz schaffen“ beendet wurden und sich wieder öffnen lassen. */
      reopenable: string[]
    }

export async function readMemoryPicture(model: string): Promise<MemoryPictureResult> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') return { supported: false }
  const [vm, swap, ps, projection, weights, loaded, architecture, measured] = await Promise.all([
    run('/usr/bin/vm_stat', []),
    run('/usr/sbin/sysctl', ['-n', 'vm.swapusage']),
    run('/bin/ps', ['-axo', 'rss=,comm=']),
    contextProjection(model),
    modelWeightsBytes(model),
    ollamaLoadedModel(model),
    architectureBytesPerToken(model),
    measuredModelMemory(model)
  ])
  const usedBytes = usedBytesFromVmStat(vm)
  if (usedBytes == null) return { supported: false }
  // Die App schlägt sich nicht selbst zum Schließen vor.
  const ownName = /\/([^/]+)\.app\//.exec(process.execPath)?.[1] ?? ''
  const { apps, ollamaBytes } = groupProcesses(ps, ownName)
  // Geladen: der größere Wert aus Prozessmessung und Ollamas Angabe — die Prozessgröße erfasst
  // den Grafikanteil nicht immer vollständig.
  const loadedBytes = loaded ? Math.max(ollamaBytes, loaded.sizeBytes) : null
  return {
    supported: true,
    picture: memoryPicture({ totalBytes: os.totalmem(), usedBytes, modelBytes: weights, loadedBytes, projection, architectureBytesPerToken: architecture, measured }),
    swapUsedBytes: swapUsedBytes(swap),
    apps: apps.filter(a => a.bytes >= MIN_APP_BYTES).slice(0, TOP_APPS),
    projectionContext: projection?.contextLength ?? null,
    reopenable: reopenableApps()
  }
}
