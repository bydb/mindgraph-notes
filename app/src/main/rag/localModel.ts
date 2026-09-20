/**
 * Lokale Modellauflösung über `/api/tags` (Vault-Chat-Plan Rev. 3, Entscheidungen 3 + 4).
 *
 * `localhost:11434` allein beweist nichts: Ollama-Cloud-Modelle laufen über
 * denselben Port, die Inferenz aber bei Ollama. `isCloudModel` prüft nur den
 * Namen. Hier gilt fail-closed über die Metadaten der Modellliste:
 *   - Cloud-Suffix im Namen           → abgelehnt
 *   - `remote_model` / `remote_host`  → abgelehnt (auch bei neutralem Namen)
 *   - nicht in der Liste / mehrdeutig → abgelehnt („nicht auflösbar heißt nicht lokal")
 *   - ohne Digest                     → abgelehnt (die Index-Identität braucht ihn)
 *
 * Der Digest kommt aus `/api/tags` (`ListModelResponse`), nicht aus `/api/show`.
 */

import type { OllamaModelInfo } from '../../shared/types'
import { isCloudModel } from '../../shared/modelCompatibility'
import { parseOllamaModels } from '../ollamaCapabilities'

export const OLLAMA_LOCAL_URL = 'http://localhost:11434'

export type LocalModelRejection =
  | 'empty'
  | 'cloud-tag'
  | 'remote'
  | 'missing'
  | 'ambiguous'
  | 'no-digest'
  | 'unreachable'

export class LocalModelError extends Error {
  constructor(public reason: LocalModelRejection, public model: string, message: string) {
    super(message)
    this.name = 'LocalModelError'
  }
}

export interface LocalModel {
  /** Exakt aufgelöster Name aus der Liste (z.B. `bge-m3:latest`). */
  name: string
  digest: string
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface LocalModelOptions {
  fetchFn?: FetchFn
  now?: () => number
  /** Liste neu laden, auch wenn der Cache noch gilt (Digest-Prüfung vor/nach Läufen). */
  fresh?: boolean
  timeoutMs?: number
}

const CACHE_TTL_MS = 15_000

let cache: { at: number; models: OllamaModelInfo[] } | null = null
let inFlight: Promise<OllamaModelInfo[]> | null = null

export function invalidateLocalModelCache(): void {
  cache = null
}

export async function listLocalModels(opts: LocalModelOptions = {}): Promise<OllamaModelInfo[]> {
  const now = opts.now ?? Date.now
  if (!opts.fresh && cache && now() - cache.at < CACHE_TTL_MS) return cache.models
  if (inFlight && !opts.fresh) return inFlight
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchFn)
  const task = (async () => {
    let response: Response
    try {
      response = await fetchFn(`${OLLAMA_LOCAL_URL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5000)
      })
    } catch (err) {
      throw new LocalModelError('unreachable', '', `Ollama ist nicht erreichbar (${err instanceof Error ? err.message : String(err)})`)
    }
    if (!response.ok) throw new LocalModelError('unreachable', '', `Ollama antwortet mit HTTP ${response.status}`)
    const models = parseOllamaModels(await response.json())
    cache = { at: now(), models }
    return models
  })()
  inFlight = task
  try {
    return await task
  } finally {
    if (inFlight === task) inFlight = null
  }
}

/**
 * Löst einen Modellnamen auf ein nachweislich lokales Modell auf oder wirft
 * `LocalModelError`. Ein Name ohne Tag (`bge-m3`) trifft `bge-m3:latest`.
 */
export async function resolveLocalModel(name: string, opts: LocalModelOptions = {}): Promise<LocalModel> {
  const wanted = (name ?? '').trim()
  if (!wanted) throw new LocalModelError('empty', wanted, 'Kein Modell angegeben')
  if (isCloudModel(wanted)) {
    throw new LocalModelError('cloud-tag', wanted, `„${wanted}" ist ein Ollama-Cloud-Modell — Inhalte würden den Rechner verlassen`)
  }
  const models = await listLocalModels(opts)
  const candidates = models.filter(
    (m) => m.name === wanted || (!wanted.includes(':') && m.name === `${wanted}:latest`)
  )
  if (candidates.length === 0) {
    throw new LocalModelError('missing', wanted, `Modell „${wanted}" ist in Ollama nicht installiert`)
  }
  if (candidates.length > 1) {
    throw new LocalModelError('ambiguous', wanted, `Modell „${wanted}" ist mehrdeutig (${candidates.map((c) => c.name).join(', ')})`)
  }
  const m = candidates[0]
  if (m.remoteModel || m.remoteHost || isCloudModel(m.name)) {
    throw new LocalModelError('remote', wanted, `„${m.name}" läuft laut Ollama auf einem entfernten Host (${m.remoteHost ?? m.remoteModel ?? 'cloud'}) — nicht lokal`)
  }
  if (!m.digest) {
    throw new LocalModelError('no-digest', wanted, `Ollama meldet für „${m.name}" keinen Digest — Identität nicht prüfbar`)
  }
  return { name: m.name, digest: m.digest }
}

/** Nutzerfreundliche Meldung mit nächstem Schritt. */
export function describeLocalModelError(err: unknown): string {
  if (err instanceof LocalModelError) {
    switch (err.reason) {
      case 'cloud-tag':
      case 'remote':
        return `${err.message}. Bitte ein lokales Modell wählen (Einstellungen → KI & Modelle).`
      case 'missing':
        return `${err.message}. Bitte per Ollama pullen oder ein anderes Modell wählen.`
      case 'unreachable':
        return `${err.message}. Läuft Ollama?`
      default:
        return err.message
    }
  }
  return err instanceof Error ? err.message : String(err)
}
