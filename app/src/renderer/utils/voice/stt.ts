// Speech-to-Text via MediaRecorder (Renderer).
// Standardmäßig läuft Whisper komplett im Renderer (transformers.js + ONNX);
// optional kann ein lokal installiertes Whisper-CLI über den Main-Prozess genutzt werden.

import { useUIStore } from '../../stores/uiStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { transcribeWithTransformers } from './transformersStt'

export interface DictationHandle {
  /** Stoppt die Aufnahme und liefert das Transkript (leeren String bei Abbruch). */
  stop: () => Promise<string>
  /** Bricht die Aufnahme ab, ohne zu transkribieren. */
  cancel: () => void
}

export interface DictationCallbacks {
  contextId: string
  onStart?: () => void
  onTranscript?: (text: string) => void
  onError?: (error: string) => void
}

function pickMimeType(): string {
  // Reihenfolge: am besten unterstützte Whisper-freundliche Formate zuerst
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/wav'
  ]
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

function extensionFor(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

/**
 * Startet eine Diktat-Session. Stream + MediaRecorder werden erst nach
 * erfolgreicher Mikrofon-Freigabe gestartet.
 */
export async function startDictation(cb: DictationCallbacks): Promise<DictationHandle> {
  const voiceStore = useVoiceStore.getState()
  const settings = useUIStore.getState().speech

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    voiceStore.setError(message)
    throw new Error(message)
  }

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  let canceled = false

  // Input-Device-Info für Debug
  const audioTrack = stream.getAudioTracks()[0]
  const trackLabel = audioTrack?.label ?? 'unknown'
  console.log(`[stt] recording from device: "${trackLabel}" (mime=${mimeType}), trackMuted=${audioTrack?.muted}, trackEnabled=${audioTrack?.enabled}, readyState=${audioTrack?.readyState}`)

  // Audio-Level-Analyse: RMS-Peak messen, damit wir stille Aufnahmen erkennen.
  // analyserUsable=false bedeutet, dass die Pegelmessung nicht funktioniert hat (z.B. weil
  // der AudioContext suspended ist und der Browser ihn auch nach resume() nicht startet).
  // In dem Fall wird der Peak-Check beim Stop übersprungen — die MediaRecorder-Aufnahme
  // selbst läuft unabhängig vom AudioContext und enthält trotzdem Audio.
  let peakLevel = 0
  let analyserUsable = false
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let rafId = 0
  try {
    audioCtx = new AudioContext()
    // Chromium startet den AudioContext nicht zuverlässig automatisch — auch nach
    // getUserMedia kann er im 'suspended'-State bleiben, was die analyser-Daten konstant
    // auf 0 hält. Konsequenz: "Kein Audio erkannt (Pegel 0.000)" trotz funktionierendem Mic.
    // Resume() ohne await, weil ein Reject hier nicht die Aufnahme blockieren soll.
    audioCtx.resume().then(() => {
      console.log(`[stt] AudioContext state after resume: ${audioCtx?.state}`)
    }).catch(err => {
      console.warn('[stt] AudioContext.resume() rejected:', err)
    })
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    const buffer = new Float32Array(analyser.fftSize)
    const tick = () => {
      if (!analyser || !audioCtx) return
      if (audioCtx.state === 'running') analyserUsable = true
      analyser.getFloatTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
      const rms = Math.sqrt(sum / buffer.length)
      if (rms > peakLevel) peakLevel = rms
      rafId = requestAnimationFrame(tick)
    }
    tick()
  } catch (err) {
    console.warn('[stt] audio level analyser setup failed:', err)
  }

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  const cleanup = () => {
    if (rafId) cancelAnimationFrame(rafId)
    if (audioCtx) audioCtx.close().catch(() => {})
    stream.getTracks().forEach(t => t.stop())
  }

  const stop = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      recorder.onstop = async () => {
        cleanup()
        if (canceled) {
          voiceStore.setIdle()
          resolve('')
          return
        }
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
        console.log(`[stt] recording stopped; blob size=${blob.size} bytes; peak RMS=${peakLevel.toFixed(4)} (near 0 = stille); analyserUsable=${analyserUsable}`)
        if (blob.size < 512) {
          voiceStore.setIdle()
          voiceStore.setError('Aufnahme zu kurz. Bitte mindestens eine Sekunde sprechen.')
          resolve('')
          return
        }
        // Peak-Check nur wenn der AudioContext lief — sonst ist `peakLevel === 0` kein
        // Beweis für Stille, sondern ein Indiz, dass die Analyser-Pipeline nicht aktiv war.
        // Die MediaRecorder-Aufnahme selbst läuft davon unabhängig und enthält trotzdem Audio;
        // wir geben sie an Whisper, statt fälschlich „Kein Audio erkannt" zu melden.
        if (analyserUsable && peakLevel < 0.005) {
          voiceStore.setIdle()
          voiceStore.setError(`Kein Audio erkannt (Pegel ${peakLevel.toFixed(3)}). Prüfe macOS → Ton → Eingabe (${trackLabel}).`)
          resolve('')
          return
        }
        try {
          let text: string
          if (settings.sttEngine === 'whisper-cli') {
            voiceStore.setTranscribing(cb.contextId)
            const buffer = await blob.arrayBuffer()
            const result = await window.electronAPI.voiceTranscribe(buffer, extensionFor(mimeType), {
              command: settings.whisperCommand || 'auto',
              model: settings.whisperModel || 'base',
              language: settings.sttLanguage || 'auto'
            })
            console.log('[stt] whisper-cli result:', result)
            if (!result.success) {
              const msg = result.error ?? 'Transkription fehlgeschlagen'
              voiceStore.setIdle()
              voiceStore.setError(msg)
              cb.onError?.(msg)
              reject(new Error(msg))
              return
            }
            text = (result.text ?? '').trim()
          } else {
            // 'transformers' — läuft im Renderer, kein lokales Whisper nötig.
            text = await transcribeWithTransformers(blob, {
              model: settings.transformersModel || 'base',
              language: settings.sttLanguage || 'auto',
              contextId: cb.contextId
            })
            console.log('[stt] transformers result:', text)
          }
          voiceStore.setIdle()
          if (text) {
            cb.onTranscript?.(text)
          } else {
            voiceStore.setError('Keine Sprache erkannt. Bitte lauter oder länger sprechen.')
          }
          resolve(text)
        } catch (err) {
          voiceStore.setIdle()
          const msg = err instanceof Error ? err.message : String(err)
          voiceStore.setError(msg)
          cb.onError?.(msg)
          reject(err instanceof Error ? err : new Error(msg))
        }
      }
      try {
        if (recorder.state !== 'inactive') recorder.stop()
        else resolve('')
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  const cancel = () => {
    canceled = true
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } finally {
      cleanup()
      voiceStore.setIdle()
    }
  }

  recorder.onerror = (event) => {
    cleanup()
    const msg = (event as unknown as { error?: { message?: string } }).error?.message ?? 'MediaRecorder-Fehler'
    voiceStore.setError(msg)
    voiceStore.setIdle()
    cb.onError?.(msg)
  }

  recorder.start(250)
  voiceStore.setRecording(cb.contextId)
  cb.onStart?.()

  return { stop, cancel }
}
