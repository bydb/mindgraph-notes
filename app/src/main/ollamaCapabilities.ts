import type { OllamaModelInfo } from '../shared/types'
import { isNonGenerativeModel } from '../shared/modelCompatibility'

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface CacheEntry {
  capabilities: string[]
  expiresAt: number
}

interface OllamaCapabilityResolverOptions {
  apiUrl: string
  fetchFn?: FetchFn
  cacheTtlMs?: number
  now?: () => number
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

function normalizeCapabilities(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return [...new Set(
    value
      .filter((capability): capability is string => typeof capability === 'string')
      .map(capability => capability.trim().toLowerCase())
      .filter(Boolean)
  )]
}

/**
 * Normalisiert die Modellliste aus Ollamas `/api/tags`-Antwort. Neuere Ollama-
 * Versionen liefern hier bereits `capabilities`; ältere Antworten bleiben
 * kompatibel und lassen das optionale Feld weg.
 */
export function parseOllamaModels(value: unknown): OllamaModelInfo[] {
  if (!value || typeof value !== 'object') return []
  const models = (value as { models?: unknown }).models
  if (!Array.isArray(models)) return []

  return models.flatMap(model => {
    if (!model || typeof model !== 'object') return []
    const raw = model as { name?: unknown; size?: unknown; capabilities?: unknown }
    if (typeof raw.name !== 'string' || !raw.name.trim()) return []
    // Fehlende Größe darf ein Modell NICHT aus allen Pickern verschwinden lassen —
    // ein Eintrag mit "0 B" ist die deutlich harmlosere Fehlerart.
    const capabilities = normalizeCapabilities(raw.capabilities)
    return [{
      name: raw.name,
      size: typeof raw.size === 'number' ? raw.size : 0,
      ...(capabilities === null ? {} : { capabilities })
    }]
  })
}

/**
 * Ollamas eigene Modellmetadaten sind die primäre Wahrheit für Tool-Calling.
 * Erfolgreiche Antworten (auch `capabilities: []`) werden kurz gecacht; Fehler
 * oder alte Antworten ohne Capability-Feld nicht, damit ein später gestartetes
 * bzw. aktualisiertes Ollama ohne App-Neustart erneut geprüft wird.
 */
export class OllamaCapabilityResolver {
  private readonly apiUrl: string
  private readonly fetchFn: FetchFn
  private readonly cacheTtlMs: number
  private readonly now: () => number
  private readonly cache = new Map<string, CacheEntry>()
  private readonly inFlight = new Map<string, Promise<string[] | null>>()

  constructor(options: OllamaCapabilityResolverOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '')
    this.fetchFn = options.fetchFn ?? fetch
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.now = options.now ?? Date.now
  }

  rememberModels(models: OllamaModelInfo[]): void {
    for (const model of models) {
      if (!model.capabilities) continue
      this.remember(model.name, model.capabilities)
    }
  }

  async supportsTools(model: string, fallback: (model: string) => boolean): Promise<boolean> {
    // Manche Ollama-Manifeste deklarieren `tools` auch für Reranker/Embedding-
    // Modelle. Die Modellrolle ist hier enger als die technische Template-
    // Capability und wird deshalb zuerst geprüft.
    if (isNonGenerativeModel(model)) return false
    const capabilities = await this.capabilitiesFor(model)
    return capabilities === null
      ? fallback(model)
      : capabilities.includes('tools')
  }

  private async capabilitiesFor(model: string): Promise<string[] | null> {
    const name = model.trim()
    if (!name) return null
    const key = name.toLowerCase()
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > this.now()) return cached.capabilities
    if (cached) this.cache.delete(key)

    const pending = this.inFlight.get(key)
    if (pending) return pending

    const probe = this.probe(name)
      .then(capabilities => {
        if (capabilities !== null) this.remember(name, capabilities)
        return capabilities
      })
      .finally(() => {
        this.inFlight.delete(key)
      })
    this.inFlight.set(key, probe)
    return probe
  }

  private remember(model: string, capabilities: string[]): void {
    const normalized = normalizeCapabilities(capabilities)
    if (normalized === null) return
    this.cache.set(model.trim().toLowerCase(), {
      capabilities: normalized,
      expiresAt: this.now() + this.cacheTtlMs
    })
  }

  private async probe(model: string): Promise<string[] | null> {
    try {
      const response = await this.fetchFn(`${this.apiUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(3000)
      })
      if (!response.ok) return null
      const data = await response.json() as { capabilities?: unknown }
      return normalizeCapabilities(data.capabilities)
    } catch {
      return null
    }
  }
}
