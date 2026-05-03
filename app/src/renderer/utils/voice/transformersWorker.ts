/// <reference lib="webworker" />
// Web Worker, der Whisper über @huggingface/transformers ausführt.
// Audio wird auf dem Main-Thread bereits in 16-kHz-mono-Float32Array dekodiert
// und nur die rohen Samples hierhin geschickt — der Worker hat kein AudioContext.

import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

// Wir laden Modelle nur aus dem HF-Hub und cachen sie im Browser-Cache (IndexedDB).
env.allowLocalModels = false
env.useBrowserCache = true
// Single-thread WASM — Electron-Renderer hat ohne COOP/COEP-Headers keinen
// SharedArrayBuffer, was mehrthread-WASM blockieren würde.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1
}

type LoadMessage = {
  type: 'load'
  model: string  // z. B. 'Xenova/whisper-base'
}

type TranscribeMessage = {
  type: 'transcribe'
  /** Float32Array mit 16-kHz-mono-Samples */
  samples: Float32Array
  /** Sprachcode wie 'de', 'en', 'auto'. */
  language: string
}

type IncomingMessage = LoadMessage | TranscribeMessage

let pipelineInstance: AutomaticSpeechRecognitionPipeline | null = null
let loadedModel: string | null = null
let loadingPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null

async function ensurePipeline(model: string): Promise<AutomaticSpeechRecognitionPipeline> {
  if (pipelineInstance && loadedModel === model) return pipelineInstance
  if (loadingPromise && loadedModel === model) return loadingPromise

  loadedModel = model
  console.log('[whisper-worker] starting pipeline load:', model)
  loadingPromise = (async () => {
    const instance = await pipeline('automatic-speech-recognition', model, {
      // Encoder bleibt quantisiert (~25 MB), Decoder läuft als fp32 (~150 MB),
      // weil der Xenova-q8-Decoder mit aktuellem onnxruntime-web `MatMulNBits`-
      // Scales vermisst und das Modell sonst gar nicht startet.
      dtype: { encoder_model: 'q8', decoder_model_merged: 'fp32' },
      // WASM-Backend; läuft auf jeder Hardware ohne WebGPU/COOP-COEP-Setup.
      device: 'wasm',
      progress_callback: (progress: { status?: string; file?: string; loaded?: number; total?: number; progress?: number }) => {
        // Status-Werte: 'initiate' | 'download' | 'progress' | 'done' | 'ready'
        self.postMessage({
          type: 'progress',
          status: progress.status,
          file: progress.file,
          loaded: progress.loaded,
          total: progress.total,
          percent: typeof progress.progress === 'number' ? progress.progress : null
        })
      }
    }) as AutomaticSpeechRecognitionPipeline
    console.log('[whisper-worker] pipeline ready')
    pipelineInstance = instance
    return instance
  })()

  return loadingPromise
}

self.onmessage = async (event: MessageEvent<IncomingMessage>) => {
  const message = event.data
  try {
    if (message.type === 'load') {
      await ensurePipeline(message.model)
      self.postMessage({ type: 'ready', model: message.model })
      return
    }
    if (message.type === 'transcribe') {
      if (!pipelineInstance || !loadedModel) {
        self.postMessage({ type: 'error', error: 'Pipeline noch nicht geladen' })
        return
      }
      const opts: { language?: string; task: 'transcribe'; chunk_length_s?: number; stride_length_s?: number } = {
        task: 'transcribe',
        // Längere Diktate werden in 30-s-Chunks zerlegt.
        chunk_length_s: 30,
        stride_length_s: 5
      }
      if (message.language && message.language !== 'auto') {
        opts.language = message.language
      }
      const result = await pipelineInstance(message.samples, opts)
      const text = Array.isArray(result)
        ? result.map(r => (typeof r === 'object' && r !== null && 'text' in r ? String((r as { text: string }).text) : '')).join(' ')
        : (result && typeof result === 'object' && 'text' in result ? String((result as { text: string }).text) : '')
      self.postMessage({ type: 'result', text: text.trim() })
      return
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err)
    })
  }
}

export {}
