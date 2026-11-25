// Speicherbild für lokale Modelle (25.11.2026): Wie viel Arbeitsspeicher belegen Programme und
// Modell, und wie viele Token Kontext passen daneben noch hinein, bevor das System auslagert?
//
// Anlass: Auf einem Rechner mit 32 GB passte ein 27B-Modell neben den Alltagsprogrammen schon ohne
// Kontext nicht mehr in den Speicher — jeder Agentenlauf lief in der Auslagerung, ohne dass die
// Oberfläche das zeigte. Hier steht nur die Rechnung (pur, getestet); gemessen wird im Main
// (`main/noteAgent/memoryPicture.ts`).
//
// Was gerechnet und was gemessen ist:
// - Belegung, Auslagerung und Programme sind gemessen.
// - Die Kosten je Token stammen aus Ollamas eigener Vorausrechnung im Log („full_context_bytes“).
//   Am gefüllten Fenster nachgemessen ist das nicht — die Oberfläche sagt deshalb „rund“ und nennt
//   die Quelle. Ohne diese Zeile gibt es keine Token-Zahl, nie eine geratene.
// - Nur für gemeinsamen Speicher (Apple Silicon). Mit eigener Grafikkarte liegt das Modell im
//   Grafikspeicher, dann stimmt das Bild nicht.

export interface OllamaContextProjection {
  /** Fenster, für das Ollama gerechnet hat (`num_ctx` des Ladevorgangs). */
  contextLength: number
  /** Speicher für dieses Fenster, wenn es voll ist. */
  fullContextBytes: number
  /** Rechenpuffer, den Ollama zusätzlich reserviert. */
  workspaceBytes: number
}

const RUNNER_START = /starting mlx runner subprocess.*\bmodel=(\S+)/
const PARALLELISM = /MLX automatic parallelism/

function numberAfter(line: string, key: string): number | null {
  const m = new RegExp(`(?:^|\\s)${key}=(\\d+)`).exec(line)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Jüngste Vorausrechnung für das Modell aus dem Ollama-Log. Die Zeile nennt das Modell nicht selbst;
 * es steht in der Startzeile des Runners davor. null = nichts gefunden oder Format unbekannt.
 */
export function latestContextProjection(logText: string, model: string): OllamaContextProjection | null {
  let current = ''
  let found: OllamaContextProjection | null = null
  for (const line of logText.split('\n')) {
    const start = RUNNER_START.exec(line)
    if (start) { current = start[1]; continue }
    if (current !== model || !PARALLELISM.test(line)) continue
    const contextLength = numberAfter(line, 'projected_context_length') ?? numberAfter(line, 'context_length')
    const fullContextBytes = numberAfter(line, 'full_context_bytes')
    if (!contextLength || !fullContextBytes) continue
    found = { contextLength, fullContextBytes, workspaceBytes: numberAfter(line, 'workspace') ?? 0 }
  }
  return found
}

/**
 * Kosten je Token aus dem Aufbau eines GGUF-Modells (`model_info` aus `/api/show`): je Schicht mit
 * Aufmerksamkeit ein Schlüssel- und ein Wertvektor je KV-Kopf, 16 Bit je Zahl (Ollamas Vorgabe;
 * mit 8-Bit-Zwischenspeicher wäre es die Hälfte — die Rechnung bleibt dann auf der sicheren Seite).
 * `head_count_kv` steht je Schicht (Liste, 0 = Schicht ohne Aufmerksamkeit) oder einmal für alle.
 * null = Angaben fehlen (MLX-Modelle nennen sie nicht).
 *
 * Gegenprobe (qwen3.5:4b, 24.11.2026): gerechnet 32 KB je Token, gemessen 2,9 → 4,0 GB zwischen
 * 4k und 32k Fenster, also rund 38 KB — der Rest sind Puffer, die nicht am Token hängen.
 */
export function kvBytesPerTokenFromShow(show: unknown): number | null {
  const info = (show as { model_info?: unknown } | null)?.model_info
  if (!info || typeof info !== 'object') return null
  const pick = (suffix: string): unknown => {
    for (const [key, value] of Object.entries(info as Record<string, unknown>)) {
      if (key.endsWith(suffix) && !key.includes('.vision.') && !key.includes('.audio.')) return value
    }
    return undefined
  }
  const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
  const kv = pick('.attention.head_count_kv')
  const blocks = num(pick('.block_count'))
  let kvHeads: number | null = null
  if (Array.isArray(kv)) {
    const sum = kv.reduce<number>((total, n) => total + (typeof n === 'number' && n > 0 ? n : 0), 0)
    kvHeads = sum > 0 ? sum : null
  } else if (num(kv) && blocks) {
    kvHeads = (kv as number) * blocks
  }
  if (!kvHeads) return null
  const heads = num(pick('.attention.head_count'))
  const embedding = num(pick('.embedding_length'))
  const perHead = heads && embedding ? embedding / heads : null
  const keyLength = num(pick('.attention.key_length')) ?? perHead
  const valueLength = num(pick('.attention.value_length')) ?? perHead
  if (!keyLength || !valueLength) return null
  return kvHeads * (keyLength + valueLength) * 2
}

/** Belegter Speicher aus `vm_stat`: Programme + fest belegt + komprimiert. null = nicht lesbar. */
export function usedBytesFromVmStat(text: string): number | null {
  const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1])
  const pages = (label: string): number | null => {
    const m = new RegExp(`${label}:\\s+(\\d+)\\.`).exec(text)
    return m ? Number(m[1]) : null
  }
  const anonymous = pages('Anonymous pages')
  const wired = pages('Pages wired down')
  const compressor = pages('Pages occupied by compressor')
  if (!pageSize || anonymous == null || wired == null || compressor == null) return null
  const purgeable = pages('Pages purgeable') ?? 0
  return Math.max(0, anonymous - purgeable + wired + compressor) * pageSize
}

/** Belegte Auslagerung aus `sysctl -n vm.swapusage` („used = 4257.62M“). null = nicht lesbar. */
export function swapUsedBytes(text: string): number | null {
  const m = /used\s*=\s*([\d.]+)([KMG])/.exec(text)
  if (!m) return null
  const factor = m[2] === 'G' ? 1024 ** 3 : m[2] === 'M' ? 1024 ** 2 : 1024
  return Math.round(Number(m[1]) * factor)
}

export interface ProcessGroup {
  name: string
  bytes: number
  /** Pfad des Programmbündels (`…/Name.app`), wenn es eins ist — nur solche lassen sich sauber beenden. */
  path?: string
}

/**
 * `ps -axo rss=,comm=` je Programm zusammengefasst (alle Hilfsprozesse eines `.app`-Bündels
 * zählen zum Programm). Liefert Ollama getrennt, weil dessen Anteil das Modell ist.
 *
 * In die Liste kommt nur, was ein Nutzer schließen kann: Programme unter `/Applications`,
 * `/System/Applications` (Kalender, Mail …) und im Benutzerordner. Systemdienste (Fensterdarstellung, Spotlight …) gehören nicht hinein — die Karte
 * schlug real „WindowServer“ zum Schließen vor. `ownName` ist die App selbst.
 */
export function groupProcesses(psText: string, ownName = ''): { apps: ProcessGroup[]; ollamaBytes: number } {
  const sums = new Map<string, number>()
  const paths = new Map<string, string>()
  let ollamaBytes = 0
  for (const line of psText.split('\n')) {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line)
    if (!m) continue
    const bytes = Number(m[1]) * 1024
    const command = m[2].trim()
    const bundle = /^(.*?\/([^/]+)\.app)\//.exec(command)
    const name = bundle ? bundle[2] : command.split('/').pop() || command
    if (/ollama/i.test(name) || /\/ollama(\s|$)/i.test(command)) { ollamaBytes += bytes; continue }
    if (name === ownName || !/^\/(Applications|System\/Applications|Users)\//.test(command)) continue
    sums.set(name, (sums.get(name) ?? 0) + bytes)
    if (bundle && !paths.has(name)) paths.set(name, bundle[1])
  }
  const apps = [...sums]
    .map(([name, bytes]): ProcessGroup => (paths.has(name) ? { name, bytes, path: paths.get(name) } : { name, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
  return { apps, ollamaBytes }
}

// ─── Selbst gemessen ────────────────────────────────────────────────────────────
//
// Ollamas Vorausrechnung ist für MLX-Modelle deutlich zu hoch: für qwen3.8:27b-mlx nennt sie
// 170 KB je Token plus 4 GB Rechenpuffer, gemessen wurden am 25.11.2026 rund 73 KB je Token und
// kein sichtbarer Puffer (17,2 GB bei 22 Token, 19,1 GB bei 28 056 Token, linear). Deshalb merkt
// sich die App nach jedem lokalen Aufruf ein Wertepaar (Token im Kontext, belegter Speicher laut
// `/api/ps`) und rechnet daraus selbst. Bei GGUF-Modellen ändert sich die Größe mit dem Füllstand
// nicht (das Fenster ist beim Laden schon belegt) — dort ergibt die Anpassung nichts, und es
// bleibt beim Modellaufbau.

export interface MemorySample { tokens: number; bytes: number }

export interface MeasuredModelMemory {
  /** Speicher des geladenen Modells mit leerem Kontext. */
  baseBytes: number
  bytesPerToken: number
  samples: number
}

const SAMPLE_BUCKET_TOKENS = 1000
const MAX_SAMPLES = 40

/** Wertepaar aufnehmen: je 1 000-Token-Stufe bleibt das jüngste, höchstens `MAX_SAMPLES`. */
export function addMemorySample(samples: MemorySample[], sample: MemorySample): MemorySample[] {
  if (!(sample.tokens > 0) || !(sample.bytes > 0)) return samples
  const bucket = Math.floor(sample.tokens / SAMPLE_BUCKET_TOKENS)
  const kept = samples.filter(s => Math.floor(s.tokens / SAMPLE_BUCKET_TOKENS) !== bucket)
  return [...kept, sample].slice(-MAX_SAMPLES)
}

/**
 * Gerade durch die Wertepaare. null, solange sie nichts taugt: unter drei Paaren, Spanne unter
 * 4 000 Token, oder eine Steigung außerhalb dessen, was ein Kontext kosten kann (10 KB–1 MB je
 * Token; darunter fällt GGUF mit gleichbleibender Größe).
 */
export function fitModelMemory(samples: MemorySample[]): MeasuredModelMemory | null {
  if (samples.length < 3) return null
  const tokens = samples.map(s => s.tokens)
  if (Math.max(...tokens) - Math.min(...tokens) < 4000) return null
  const n = samples.length
  const meanX = tokens.reduce((a, b) => a + b, 0) / n
  const meanY = samples.reduce((a, s) => a + s.bytes, 0) / n
  let sxx = 0
  let sxy = 0
  for (const s of samples) { sxx += (s.tokens - meanX) ** 2; sxy += (s.tokens - meanX) * (s.bytes - meanY) }
  const bytesPerToken = sxy / sxx
  const baseBytes = meanY - bytesPerToken * meanX
  if (!(bytesPerToken >= 10 * 1024) || !(bytesPerToken <= 1024 * 1024) || !(baseBytes > 0)) return null
  return { baseBytes, bytesPerToken, samples: n }
}

export interface MemoryPictureInput {
  totalBytes: number
  /** Gemessen belegt, Modell eingeschlossen, falls geladen. */
  usedBytes: number
  /** Größe der Modellgewichte laut Ollama; null = unbekannt. */
  modelBytes: number | null
  /** Ist das Modell gerade geladen, und wie viel belegt es dann (gemessen bzw. laut `/api/ps`)? */
  loadedBytes: number | null
  projection: OllamaContextProjection | null
  /** Kosten je Token aus dem Modellaufbau, falls Ollama keine Vorausrechnung liefert (GGUF). */
  architectureBytesPerToken?: number | null
  /** Eigene Messung; gewinnt gegen Vorausrechnung und Modellaufbau. */
  measured?: MeasuredModelMemory | null
}

/** Woher die Kosten je Token stammen. */
export type TokenCostSource = 'measured' | 'projection' | 'architecture'

export interface MemoryPicture {
  totalBytes: number
  /** System und Programme ohne das Modell. */
  otherBytes: number
  /** Modell: geladen der gemessene Anteil, sonst die Gewichte. null = Größe unbekannt. */
  modelBytes: number | null
  /**
   * Rechenpuffer, den Ollama laut Vorausrechnung zusätzlich reserviert (nur ungeladen, sonst 0).
   * Getrennt vom Modell: ob er im Lauf ganz belegt wird, ist nicht gemessen — geladen belegte
   * qwen3.8:27b-mlx 17,2 GB, nicht Gewichte plus Puffer.
   */
  bufferBytes: number
  loaded: boolean
  /** Was das Modell mit leerem Kontext braucht (Messung, sonst Gewichte plus Rechenpuffer). null = unbekannt. */
  baseModelBytes: number | null
  /** Frei neben Programmen, Modell und Rechenpuffer. Negativ = so viel wird schon ohne Kontext ausgelagert. */
  freeBytes: number | null
  bytesPerToken: number | null
  tokenSource: TokenCostSource | null
  /** Token, die noch in den Arbeitsspeicher passen. null = nicht berechenbar. */
  tokensFit: number | null
}

/** Mindestens so viel gilt als „System“, auch wenn die Abzüge mehr ergäben (Messungenauigkeit). */
const MIN_OTHER_BYTES = 2 * 1024 ** 3

export function memoryPicture(input: MemoryPictureInput): MemoryPicture {
  const measured = input.measured ?? null
  const loaded = input.loadedBytes != null && input.loadedBytes > 0
  const otherBytes = loaded
    ? Math.max(MIN_OTHER_BYTES, input.usedBytes - (input.loadedBytes as number))
    : input.usedBytes
  const bufferBytes = loaded || measured ? 0 : input.projection?.workspaceBytes ?? 0
  const unloadedBytes = measured ? measured.baseBytes : input.modelBytes
  const modelBytes = loaded ? input.usedBytes - otherBytes : unloadedBytes
  const baseModelBytes = unloadedBytes == null ? null : unloadedBytes + (measured ? 0 : input.projection?.workspaceBytes ?? 0)
  const freeBytes = modelBytes == null ? null : input.totalBytes - otherBytes - modelBytes - bufferBytes
  const architecture = input.architectureBytesPerToken && input.architectureBytesPerToken > 0 ? input.architectureBytesPerToken : null
  const bytesPerToken = measured
    ? measured.bytesPerToken
    : input.projection ? input.projection.fullContextBytes / input.projection.contextLength : architecture
  const tokenSource: TokenCostSource | null = measured ? 'measured' : input.projection ? 'projection' : architecture ? 'architecture' : null
  const tokensFit = freeBytes == null || !bytesPerToken ? null : Math.max(0, Math.floor(freeBytes / bytesPerToken))
  return { totalBytes: input.totalBytes, otherBytes, modelBytes, bufferBytes, loaded, baseModelBytes, freeBytes, bytesPerToken, tokenSource, tokensFit }
}

// ─── Platz schaffen ─────────────────────────────────────────────────────────────

export interface ReliefPlan {
  targetTokens: number
  /** Modell mit gefülltem Zielfenster. */
  needBytes: number
  /** So viel dürfen System und Programme höchstens belegen. */
  allowedOtherBytes: number
  /** Fehlt, damit das Zielfenster ohne Auslagerung passt. 0 = passt. */
  deficitBytes: number
  /** Vorschlag: größte beendbare Programme, bis die Lücke gedeckt ist. */
  picks: ProcessGroup[]
  pickedBytes: number
  /** Deckt der Vorschlag die Lücke? */
  enough: boolean
}

/**
 * Was müsste weg, damit ein volles Fenster von `targetTokens` neben dem Modell in den
 * Arbeitsspeicher passt? null = nicht berechenbar (Modellgröße oder Kosten je Token unbekannt).
 * Vorgeschlagen werden nur Programme mit Bündelpfad — nur die lassen sich sauber beenden.
 */
export function reliefPlan(picture: MemoryPicture, apps: ProcessGroup[], targetTokens: number): ReliefPlan | null {
  if (picture.baseModelBytes == null || !picture.bytesPerToken) return null
  const needBytes = Math.round(picture.baseModelBytes + picture.bytesPerToken * targetTokens)
  const allowedOtherBytes = picture.totalBytes - needBytes
  const deficitBytes = Math.max(0, picture.otherBytes - allowedOtherBytes)
  const picks: ProcessGroup[] = []
  let pickedBytes = 0
  for (const app of apps) {
    if (pickedBytes >= deficitBytes) break
    if (!app.path) continue
    picks.push(app)
    pickedBytes += app.bytes
  }
  return { targetTokens, needBytes, allowedOtherBytes, deficitBytes, picks, pickedBytes, enough: pickedBytes >= deficitBytes }
}

/** Speicher für einen gefüllten Kontext dieser Größe. null = Kosten je Token unbekannt. */
export function contextBytes(picture: MemoryPicture, tokens: number): number | null {
  return picture.bytesPerToken ? Math.round(picture.bytesPerToken * tokens) : null
}

/** Auf Tausender abgerundet — die Zahl ist eine Rechnung, keine Messung. */
export function roundTokens(tokens: number): number {
  return Math.floor(tokens / 1000) * 1000
}
