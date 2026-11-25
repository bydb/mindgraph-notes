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

/**
 * Obergrenze der Grafikeinheit aus dem Ollama-Log (`msg="gpu memory" … available="24.5 GiB"`),
 * jüngste Zeile. Modell und Kontext liegen bei gemeinsamem Speicher auf der Grafikeinheit; was
 * darüber hinausgeht, passt nicht, egal wie viele Programme geschlossen sind. null = nicht gefunden.
 */
export function gpuLimitFromLog(logText: string): number | null {
  let found: number | null = null
  for (const line of logText.split('\n')) {
    if (!line.includes('gpu memory')) continue
    const m = /\bavailable="([\d.]+) (MiB|GiB)"/.exec(line)
    if (!m) continue
    const bytes = Number(m[1]) * (m[2] === 'GiB' ? 1024 ** 3 : 1024 ** 2)
    if (Number.isFinite(bytes) && bytes > 0) found = Math.round(bytes)
  }
  return found
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
  /** Pfad des Programmbündels (`…/Name.app`) — der Schlüssel, über den beendet wird. */
  path?: string
}

/** Nur hier liegen Programme, die ein Nutzer als Programm kennt und schließen kann. */
const PROGRAM_FOLDER = /^\/(Applications|System\/Applications|Users\/[^/]+\/Applications)\//

/**
 * `ps -axo pid=,rss=,comm=` je Programmbündel zusammengefasst (alle Hilfsprozesse eines
 * `.app`-Bündels zählen zum Programm). Liefert Ollama getrennt, weil dessen Anteil das Modell ist.
 *
 * In die Liste kommt nur, was ein Nutzer schließen kann: Bündel unter `/Applications`,
 * `/System/Applications` (Kalender, Mail …) und `~/Applications`. Nicht `~/Library` (Hintergrund-
 * Helfer, Updater, Sync-Dienste), keine Projektordner, die zufällig auf `.app` enden, keine
 * Systemdienste — die Karte schlug real „WindowServer“ zum Schließen vor. `ownPath` ist das
 * Bündel der App selbst.
 *
 * Gruppiert wird nach dem BÜNDELPFAD, nicht nach dem Namen: zwei Programme gleichen Namens an
 * verschiedenen Orten bleiben zwei Einträge (vorher vermischt, beendet wurde nur eins).
 *
 * `footprints` (aus `top`, je Prozessnummer) gewinnt gegen die Größe aus `ps`, wenn sie höher ist:
 * `ps` zählt nur, was gerade im Arbeitsspeicher liegt. Die Zahl ist damit eine OBERGRENZE dessen,
 * was das Beenden freigibt — sie enthält Ausgelagertes und zählt geteilten Speicher je Hilfsprozess.
 */
export function groupProcesses(psText: string, ownPath = '', footprints?: Map<number, number>): { apps: ProcessGroup[]; ollamaBytes: number } {
  const groups = new Map<string, ProcessGroup>()
  let ollamaBytes = 0
  for (const line of psText.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)
    if (!m) continue
    const bytes = Math.max(Number(m[2]) * 1024, footprints?.get(Number(m[1])) ?? 0)
    const command = m[3].trim()
    const bundle = /^(.*?\/([^/]+)\.app)\//.exec(command)
    const name = bundle ? bundle[2] : command.split('/').pop() || command
    if (/ollama/i.test(name) || /\/ollama(\s|$)/i.test(command)) { ollamaBytes += bytes; continue }
    if (!bundle || !PROGRAM_FOLDER.test(command) || bundle[1] === ownPath) continue
    const group = groups.get(bundle[1])
    if (group) group.bytes += bytes
    else groups.set(bundle[1], { name, bytes, path: bundle[1] })
  }
  return { apps: [...groups.values()].sort((a, b) => b.bytes - a.bytes), ollamaBytes }
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
  /** Größter gemessener Füllstand — darüber ist die Gerade hochgerechnet. */
  maxTokens: number
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Gerade durch die Wertepaare — über Mediane (Theil-Sen), damit EIN Ausreißer sie nicht kippt:
 * ein kurzer Aufruf, der mit der Größe eines langen Laufs davor gepaart wurde, hätte die
 * Ausgleichsgerade auf Dauer verdorben. null, solange sie nichts taugt: unter drei Paaren, Spanne
 * unter 4 000 Token, eine Steigung außerhalb dessen, was ein Kontext kosten kann (10 KB–1 MB je
 * Token), oder mehr als ein Viertel der Paare weit neben der Geraden (dann streut es, statt zu
 * messen).
 */
export function fitModelMemory(samples: MemorySample[]): MeasuredModelMemory | null {
  const clean = samples.filter(s => Number.isFinite(s.tokens) && Number.isFinite(s.bytes) && s.tokens > 0 && s.bytes > 0)
  if (clean.length < 3) return null
  const tokens = clean.map(s => s.tokens)
  const maxTokens = Math.max(...tokens)
  if (maxTokens - Math.min(...tokens) < 4000) return null
  const slopes: number[] = []
  for (let i = 0; i < clean.length; i++) {
    for (let j = i + 1; j < clean.length; j++) {
      const span = clean[j].tokens - clean[i].tokens
      if (Math.abs(span) >= SAMPLE_BUCKET_TOKENS) slopes.push((clean[j].bytes - clean[i].bytes) / span)
    }
  }
  if (slopes.length < 2) return null
  const bytesPerToken = median(slopes)
  const baseBytes = median(clean.map(s => s.bytes - bytesPerToken * s.tokens))
  if (!(bytesPerToken >= 10 * 1024) || !(bytesPerToken <= 1024 * 1024) || !(baseBytes > 0)) return null
  const bound = Math.max(0.3 * 1024 ** 3, 0.02 * baseBytes)
  const off = clean.filter(s => Math.abs(s.bytes - baseBytes - bytesPerToken * s.tokens) > bound).length
  if (off > clean.length / 4) return null
  return { baseBytes, bytesPerToken, samples: clean.length, maxTokens }
}

/** Speicher je Prozessnummer aus `top -l 1 -stats pid,mem` („447M“, „17G“, „512K+“). */
export function footprintsFromTop(text: string): Map<number, number> {
  const out = new Map<number, number>()
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+([\d.]+)([KMG])[+-]?\s*$/.exec(line)
    if (!m) continue
    const factor = m[3] === 'G' ? 1024 ** 3 : m[3] === 'M' ? 1024 ** 2 : 1024
    out.set(Number(m[1]), Math.round(Number(m[2]) * factor))
  }
  return out
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
  /** So viel darf die Grafikeinheit laut Ollama höchstens belegen; null = unbekannt. */
  gpuLimitBytes?: number | null
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
  /**
   * Was das Modell mit leerem Kontext braucht: Messung, sonst Gewichte — plus Rechenpuffer nur,
   * solange es nicht geladen ist. Geladen steht fest, was es belegt; der Puffer aus der
   * Vorausrechnung landete sonst als „Kontext“ im Balken.
   */
  baseModelBytes: number | null
  /** Frei neben Programmen, Modell und Rechenpuffer. Negativ = so viel wird schon ohne Kontext ausgelagert. */
  freeBytes: number | null
  bytesPerToken: number | null
  tokenSource: TokenCostSource | null
  /** Token, die noch in den Arbeitsspeicher passen. null = nicht berechenbar. */
  tokensFit: number | null
  /** Obergrenze der Grafikeinheit für Modell plus Kontext; null = unbekannt. */
  gpuLimitBytes: number | null
  /** Grundlage der eigenen Messung, wenn sie gilt. */
  measured: { samples: number; maxTokens: number } | null
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
  const baseModelBytes = unloadedBytes == null ? null : unloadedBytes + (measured || loaded ? 0 : input.projection?.workspaceBytes ?? 0)
  const freeBytes = modelBytes == null ? null : input.totalBytes - otherBytes - modelBytes - bufferBytes
  const architecture = input.architectureBytesPerToken && input.architectureBytesPerToken > 0 ? input.architectureBytesPerToken : null
  const bytesPerToken = measured
    ? measured.bytesPerToken
    : input.projection ? input.projection.fullContextBytes / input.projection.contextLength : architecture
  const tokenSource: TokenCostSource | null = measured ? 'measured' : input.projection ? 'projection' : architecture ? 'architecture' : null
  const tokensFit = freeBytes == null || !bytesPerToken ? null : Math.max(0, Math.floor(freeBytes / bytesPerToken))
  const gpuLimitBytes = input.gpuLimitBytes && input.gpuLimitBytes > 0 ? input.gpuLimitBytes : null
  return {
    totalBytes: input.totalBytes, otherBytes, modelBytes, bufferBytes, loaded, baseModelBytes, freeBytes, bytesPerToken, tokenSource, tokensFit,
    gpuLimitBytes, measured: measured ? { samples: measured.samples, maxTokens: measured.maxTokens } : null
  }
}

// ─── Platz schaffen ─────────────────────────────────────────────────────────────

/** Unter diesem freien Rest gilt „passt“ nur als „passt knapp“: macOS lagert schon vor 100 % aus. */
export const RELIEF_MARGIN_BYTES = 1024 ** 3

export interface ReliefPlan {
  targetTokens: number
  /** Modell mit gefülltem Zielfenster. */
  needBytes: number
  /** So viel dürfen System und Programme höchstens belegen (kann negativ sein — dann `impossible`). */
  allowedOtherBytes: number
  /** Fehlt, damit das Zielfenster in den Arbeitsspeicher passt. 0 = passt rechnerisch. */
  deficitBytes: number
  /** Bleibt bei vollem Fenster frei. */
  freeBytes: number
  /**
   * Das Fenster passt auf diesem Rechner gar nicht, auch wenn alle Programme zu sind:
   * 'memory' = Modell und Fenster brauchen mehr, als nach dem Mindestbedarf des Systems bleibt;
   * 'gpu' = mehr, als die Grafikeinheit belegen darf. Dann gibt es keine Schließvorschläge.
   */
  impossible: 'memory' | 'gpu' | null
  /** Passt rechnerisch, aber mit weniger als `RELIEF_MARGIN_BYTES` Rest. */
  tight: boolean
  /** Vorschlag: größte beendbare Programme, bis die Lücke gedeckt wäre. */
  picks: ProcessGroup[]
  /** Summe der Vorschläge — eine Obergrenze (siehe `groupProcesses`), keine zugesagte Ersparnis. */
  pickedBytes: number
}

/**
 * Was müsste weg, damit ein volles Fenster von `targetTokens` neben dem Modell in den
 * Arbeitsspeicher passt? null = nicht berechenbar (Modellgröße oder Kosten je Token unbekannt).
 * Bedarf und Lücke kommen aus `memoryBar` — Balken, Kopfzeile und Plan können sich so nicht
 * widersprechen.
 */
export function reliefPlan(picture: MemoryPicture, apps: ProcessGroup[], targetTokens: number): ReliefPlan | null {
  if (picture.modelBytes == null || !picture.bytesPerToken) return null
  const bar = memoryBar(picture, targetTokens)
  const needBytes = bar.modelBytes + bar.bufferBytes + bar.contextBytes
  const allowedOtherBytes = picture.totalBytes - needBytes
  const deficitBytes = bar.overBytes
  const impossible = picture.gpuLimitBytes != null && needBytes > picture.gpuLimitBytes ? 'gpu'
    : allowedOtherBytes < MIN_OTHER_BYTES ? 'memory' : null
  const picks: ProcessGroup[] = []
  let pickedBytes = 0
  if (!impossible) {
    for (const app of apps) {
      if (pickedBytes >= deficitBytes) break
      if (!app.path) continue
      picks.push(app)
      pickedBytes += app.bytes
    }
  }
  return {
    targetTokens, needBytes, allowedOtherBytes, deficitBytes, freeBytes: bar.freeBytes, impossible,
    tight: deficitBytes === 0 && !impossible && bar.freeBytes < RELIEF_MARGIN_BYTES, picks, pickedBytes
  }
}

/** Speicher für einen gefüllten Kontext dieser Größe. null = Kosten je Token unbekannt. */
export function contextBytes(picture: MemoryPicture, tokens: number): number | null {
  return picture.bytesPerToken ? Math.round(picture.bytesPerToken * tokens) : null
}

export interface MemoryBar {
  otherBytes: number
  modelBytes: number
  bufferBytes: number
  /** Was das gefüllte Zielfenster zusätzlich braucht. */
  contextBytes: number
  /** Bleibt auch bei vollem Fenster frei. */
  freeBytes: number
  /** Ragt über den Arbeitsspeicher hinaus. */
  overBytes: number
  /** Länge des ganzen Balkens: Arbeitsspeicher oder Bedarf, je nachdem, was größer ist. */
  scaleBytes: number
}

/**
 * Abschnitte des Speicherbalkens für ein GEFÜLLTES Fenster von `targetTokens`. Ist das Modell
 * geladen, steckt der schon belegte Kontext in dessen Größe — dann zählt als Kontext nur, was
 * bis zum vollen Fenster dazukommt. Eine Quelle für Karte und Modell-Menü.
 */
export function memoryBar(picture: MemoryPicture, targetTokens: number): MemoryBar {
  const modelBytes = picture.modelBytes ?? 0
  const full = picture.modelBytes == null ? null : contextBytes(picture, targetTokens)
  const context = full == null ? 0
    : picture.loaded && picture.baseModelBytes != null ? Math.max(0, picture.baseModelBytes + full - modelBytes)
      : full
  const needed = picture.otherBytes + modelBytes + picture.bufferBytes + context
  return {
    otherBytes: picture.otherBytes,
    modelBytes,
    bufferBytes: picture.bufferBytes,
    contextBytes: context,
    freeBytes: Math.max(0, picture.totalBytes - needed),
    overBytes: Math.max(0, needed - picture.totalBytes),
    scaleBytes: Math.max(picture.totalBytes, needed)
  }
}

/** Auf Tausender abgerundet — die Zahl ist eine Rechnung, keine Messung. */
export function roundTokens(tokens: number): number {
  return Math.floor(tokens / 1000) * 1000
}
