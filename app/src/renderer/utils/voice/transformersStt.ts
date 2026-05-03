// Transcription-Pfad, der komplett im Renderer läuft (transformers.js + ONNX).
// Audio wird hier zu 16-kHz-mono-Float32Array dekodiert und an einen Web Worker
// geschickt, der das Whisper-Modell ausführt.

import { useVoiceStore } from '../../stores/voiceStore'
import type { TransformersWhisperModel } from '../../stores/uiStore'

const MODEL_ID: Record<TransformersWhisperModel, string> = {
  // Xenova/* sind die etablierten ONNX-Konvertierungen, die zuverlässig funktionieren.
  tiny: 'Xenova/whisper-tiny',
  base: 'Xenova/whisper-base',
  small: 'Xenova/whisper-small'
}

let workerInstance: Worker | null = null
let workerModel: string | null = null
let loadingModel: string | null = null
let loadingPromise: Promise<void> | null = null

function getWorker(): Worker {
  if (workerInstance) return workerInstance
  workerInstance = new Worker(new URL('./transformersWorker.ts', import.meta.url), { type: 'module' })
  workerInstance.onerror = (event) => {
    console.error('[transformersStt] worker error:', event.message ?? event)
  }
  return workerInstance
}

interface WorkerMessage {
  type: 'progress' | 'ready' | 'result' | 'error'
  status?: string
  file?: string
  loaded?: number
  total?: number
  percent?: number | null
  text?: string
  error?: string
  model?: string
}

function postAndWait<T extends WorkerMessage>(
  worker: Worker,
  request: object,
  resolveType: WorkerMessage['type'],
  onProgress?: (m: WorkerMessage) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent<WorkerMessage>) => {
      const data = event.data
      if (data.type === 'error') {
        worker.removeEventListener('message', handler)
        reject(new Error(data.error ?? 'Worker-Fehler'))
        return
      }
      if (data.type === 'progress') {
        onProgress?.(data)
        return
      }
      if (data.type === resolveType) {
        worker.removeEventListener('message', handler)
        resolve(data as T)
      }
    }
    worker.addEventListener('message', handler)
    worker.postMessage(request)
  })
}

/**
 * Lädt das Whisper-Modell, falls noch nicht im Worker geladen.
 * Beim ersten Aufruf wird das Modell von HuggingFace heruntergeladen (50–250 MB).
 */
export async function ensureTransformersModel(model: TransformersWhisperModel): Promise<void> {
  const voiceStore = useVoiceStore.getState()
  const modelId = MODEL_ID[model]
  if (workerModel === modelId) return
  if (loadingPromise && loadingModel === modelId) return loadingPromise

  const worker = getWorker()
  voiceStore.setLoading(`Whisper-Modell wird geladen (${model}) …`, 0)

  loadingModel = modelId
  loadingPromise = (async () => {
    await postAndWait(worker, { type: 'load', model: modelId }, 'ready', (m) => {
      const percent = typeof m.percent === 'number'
        ? m.percent
        : (typeof m.loaded === 'number' && typeof m.total === 'number' && m.total > 0
          ? (m.loaded / m.total) * 100
          : null)
      const label = m.status === 'ready' || m.status === 'done'
        ? 'Modell wird initialisiert …'
        : (m.file ? `Lade ${m.file} …` : `Lade ${model} …`)
      voiceStore.setLoading(label, percent)
    })
    workerModel = modelId
  })()

  try {
    await loadingPromise
    voiceStore.setIdle()
  } catch (err) {
    workerModel = null
    voiceStore.setIdle()
    throw err
  } finally {
    if (loadingModel === modelId) {
      loadingModel = null
      loadingPromise = null
    }
  }
}

export function isTransformersModelReady(model: TransformersWhisperModel): boolean {
  return workerModel === MODEL_ID[model]
}

/**
 * Konvertiert beliebigen Audio-Blob (WebM/Ogg/MP4 …) in 16-kHz-mono-Float32Array.
 * Nutzt das Browser-eigene `decodeAudioData` und resampelt via OfflineAudioContext.
 */
async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()

  // Wir brauchen einen "echten" AudioContext zum Dekodieren — OfflineAudioContext kann das auch,
  // aber decodeAudioData mit fixer Sample-Rate ist plattformabhängig. Sicherer: erst dekodieren,
  // dann via OfflineAudioContext auf 16 kHz resampeln.
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    ctx.close().catch(() => {})
  }

  const targetSampleRate = 16000
  if (decoded.sampleRate === targetSampleRate && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0).slice()
  }

  // Auf 1 Kanal mischen (mono-Mix) und auf 16 kHz resampeln.
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetSampleRate), targetSampleRate)
  const source = offline.createBufferSource()
  // Wenn die Quelle stereo ist, mischen wir links+rechts beim Rendern. Web Audio macht das automatisch,
  // wenn der Ziel-Context 1 Kanal hat.
  source.buffer = decoded
  source.connect(offline.destination)
  source.start(0)
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

export interface TransformersTranscribeOptions {
  model: TransformersWhisperModel
  language: string
  contextId: string
}

/**
 * Vollständige Transkription für einen Audio-Blob (z. B. aus MediaRecorder).
 * Lädt das Modell beim ersten Aufruf, transkribiert und gibt den Text zurück.
 */
export async function transcribeWithTransformers(
  blob: Blob,
  opts: TransformersTranscribeOptions
): Promise<string> {
  const voiceStore = useVoiceStore.getState()
  await ensureTransformersModel(opts.model)

  voiceStore.setTranscribing(opts.contextId)
  console.log(`[transformersStt] decoding ${blob.size} bytes (${blob.type}) to 16kHz mono`)
  const samples = await decodeTo16kMono(blob)
  console.log(`[transformersStt] decoded ${samples.length} samples = ${(samples.length / 16000).toFixed(2)}s`)

  const worker = getWorker()
  const result = await postAndWait<{ type: 'result'; text: string }>(
    worker,
    { type: 'transcribe', samples, language: opts.language },
    'result'
  )
  return (result.text ?? '').trim()
}
