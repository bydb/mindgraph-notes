// Text-to-Speech via Web Speech API (SpeechSynthesis).
// Nutzt lokale OS-Stimmen (macOS "say"-Voices, Windows SAPI, Linux speech-dispatcher).
// Keine Netzwerk-Requests, keine IPC nötig.

import { useUIStore } from '../../stores/uiStore'
import { useVoiceStore } from '../../stores/voiceStore'

export interface TtsOptions {
  /** Kontext-ID (z. B. 'editor', 'flashcard-front'), wird im voiceStore gesetzt. */
  contextId: string
  /** Override für Voice-URI; sonst aus uiStore.speech.ttsVoice. */
  voiceUri?: string
  /** Override für Rate (0.5 – 2.0); sonst aus uiStore.speech.ttsRate. */
  rate?: number
  /** Override für Pitch (0.5 – 2.0); sonst aus uiStore.speech.ttsPitch. */
  pitch?: number
  onEnd?: () => void
}

/**
 * Liefert verfügbare Stimmen. In Chromium werden Voices asynchron geladen —
 * `voiceschanged` kann nötig sein. Daher hier eine kleine Retry-Logik.
 */
export function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const tryGet = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length > 0) {
        resolve(voices)
      } else {
        // Fallback: warte auf voiceschanged-Event (max. 2 Sekunden)
        const timeout = setTimeout(() => {
          window.speechSynthesis.removeEventListener('voiceschanged', onChange)
          resolve(window.speechSynthesis.getVoices())
        }, 2000)
        const onChange = () => {
          clearTimeout(timeout)
          window.speechSynthesis.removeEventListener('voiceschanged', onChange)
          resolve(window.speechSynthesis.getVoices())
        }
        window.speechSynthesis.addEventListener('voiceschanged', onChange)
      }
    }
    tryGet()
  })
}

/**
 * Entfernt Markdown-Syntax, damit beim Vorlesen nicht "Sternchen", "Unterstrich" usw. gesprochen wird.
 * Hält Wikilinks, Headings, Listen, Code-Blöcke in sprechfreundlicher Form.
 */
export function markdownToSpeakable(markdown: string): string {
  return markdown
    // Code-Blöcke entfernen (werden in TTS zu Gekrächze)
    .replace(/```[\s\S]*?```/g, ' … ')
    // Inline-Code: Inhalt behalten, Backticks weg
    .replace(/`([^`]+)`/g, '$1')
    // Bilder entfernen
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // Links: Linktext behalten, URL weg
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Wikilinks: [[Titel|Alias]] → Alias, [[Titel]] → Titel
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // Fett/Kursiv: Marker weg, Text bleibt
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/___([^_]+)___/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Durchgestrichen
    .replace(/~~([^~]+)~~/g, '$1')
    // Überschriften-Hashes weg, Text bleibt (mit Pause davor)
    .replace(/^#{1,6}\s+(.+)$/gm, '$1.')
    // Listen-Marker weg
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // HTML-Kommentare
    .replace(/<!--[\s\S]*?-->/g, '')
    // Callout-Syntax > [!info] …
    .replace(/^>\s*\[![^\]]+\]\s*/gm, '')
    // Einfaches Blockquote-Zeichen
    .replace(/^>\s?/gm, '')
    // Frontmatter entfernen
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    // Tabellen-Separator-Zeilen
    .replace(/^\s*\|[\s:|-]+\|\s*$/gm, '')
    // Mehrfach-Leerzeichen zusammenfassen
    .replace(/[ \t]+/g, ' ')
    // Mehrfache Leerzeilen → einfache Pause
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Aktuell laufendes HTMLAudioElement (ElevenLabs-Pfad), damit stop() es abbrechen kann.
let currentAudio: HTMLAudioElement | null = null
let currentAudioUrl: string | null = null

function disposeCurrentAudio() {
  if (currentAudio) {
    const audio = currentAudio
    // Handler NULLEN, bevor wir stoppen — sonst feuert audio.src='' ein onerror mit MEDIA_ERR_SRC_NOT_SUPPORTED.
    audio.onplay = null
    audio.onended = null
    audio.onerror = null
    try { audio.pause() } catch { /* ignore */ }
    currentAudio = null
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl)
    currentAudioUrl = null
  }
}

/**
 * Startet das Vorlesen. Stoppt vorher alle laufenden Utterances.
 * Gibt `true` zurück, wenn gestartet, `false` bei leerem Text.
 */
export function speak(text: string, opts: TtsOptions): boolean {
  const trimmed = markdownToSpeakable(text).trim()
  if (!trimmed) return false

  // Immer erst stoppen, damit nicht zwei Utterances gleichzeitig laufen
  stopSpeaking()

  const settings = useUIStore.getState().speech

  if (settings.ttsEngine === 'elevenlabs') {
    speakElevenLabs(trimmed, opts).catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      useVoiceStore.getState().setError(`ElevenLabs: ${msg}`)
      useVoiceStore.getState().setIdle()
    })
    return true
  }

  // System-Stimme (Web Speech API)
  const utterance = new SpeechSynthesisUtterance(trimmed)
  utterance.rate = opts.rate ?? settings.ttsRate
  utterance.pitch = opts.pitch ?? settings.ttsPitch

  const voiceUri = opts.voiceUri ?? settings.ttsVoice
  if (voiceUri) {
    const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceUri)
    if (voice) utterance.voice = voice
  }

  utterance.onstart = () => {
    useVoiceStore.getState().setSpeaking(opts.contextId)
  }
  utterance.onend = () => {
    const { activeContextId, setIdle } = useVoiceStore.getState()
    if (activeContextId === opts.contextId) setIdle()
    opts.onEnd?.()
  }
  utterance.onerror = (event) => {
    const { activeContextId, setIdle, setError } = useVoiceStore.getState()
    if (activeContextId === opts.contextId) setIdle()
    if (event.error && event.error !== 'interrupted' && event.error !== 'canceled') {
      setError(`TTS: ${event.error}`)
    }
  }

  window.speechSynthesis.speak(utterance)
  return true
}

async function speakElevenLabs(text: string, opts: TtsOptions): Promise<void> {
  const settings = useUIStore.getState().speech
  if (!settings.elevenlabsVoiceId) {
    throw new Error('Keine ElevenLabs-Stimme ausgewählt')
  }
  // „Transcribing" passt nicht ganz, aber wir zeigen „speaking" erst, wenn Audio läuft.
  useVoiceStore.getState().setTranscribing(opts.contextId)
  const result = await window.electronAPI.elevenlabsSynthesize({
    text,
    voiceId: settings.elevenlabsVoiceId,
    modelId: settings.elevenlabsModel || 'eleven_multilingual_v2',
    stability: settings.elevenlabsStability,
    similarity: settings.elevenlabsSimilarity
  })
  if (!result.success || !result.audio) {
    throw new Error(result.error ?? 'Synthese fehlgeschlagen')
  }
  const bytes = new Uint8Array(result.audio)
  if (bytes.byteLength === 0) {
    throw new Error('Synthese leer (0 Bytes) — API-Key hat evtl. kein text_to_speech-Scope.')
  }
  console.log(`[tts] elevenlabs audio received: ${bytes.byteLength} bytes, first 4 bytes: ${Array.from(bytes.slice(0, 4)).map(b => b.toString(16)).join(' ')}`)
  const blob = new Blob([bytes], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio()
  audio.preload = 'auto'
  audio.src = url
  audio.playbackRate = opts.rate ?? settings.ttsRate
  currentAudio = audio
  currentAudioUrl = url
  audio.onplay = () => {
    console.log('[tts] audio onplay')
    useVoiceStore.getState().setSpeaking(opts.contextId)
  }
  audio.onended = () => {
    console.log('[tts] audio onended')
    if (currentAudio === audio) disposeCurrentAudio()
    const { activeContextId, setIdle } = useVoiceStore.getState()
    if (activeContextId === opts.contextId) setIdle()
    opts.onEnd?.()
  }
  audio.onerror = () => {
    const mediaErr = audio.error
    const codeMap: Record<number, string> = {
      1: 'MEDIA_ERR_ABORTED',
      2: 'MEDIA_ERR_NETWORK',
      3: 'MEDIA_ERR_DECODE',
      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
    }
    const codeName = mediaErr ? codeMap[mediaErr.code] ?? `code ${mediaErr.code}` : 'unknown'
    console.error(`[tts] audio onerror: ${codeName} message="${mediaErr?.message ?? ''}" readyState=${audio.readyState} networkState=${audio.networkState}`)
    if (currentAudio === audio) disposeCurrentAudio()
    const { activeContextId, setIdle, setError } = useVoiceStore.getState()
    if (activeContextId === opts.contextId) setIdle()
    setError(`ElevenLabs-Wiedergabe: ${codeName}${mediaErr?.message ? ' — ' + mediaErr.message : ''}`)
  }

  // Warte, bis der Browser meint, abspielen zu können — robuster als sofort play() zu rufen.
  await new Promise<void>((resolve, reject) => {
    const onCanPlay = () => { cleanup(); resolve() }
    const onLoadErr = () => {
      cleanup()
      const mediaErr = audio.error
      reject(new Error(mediaErr?.message ?? 'canplay load error'))
    }
    const cleanup = () => {
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onLoadErr)
    }
    audio.addEventListener('canplay', onCanPlay, { once: true })
    audio.addEventListener('error', onLoadErr, { once: true })
    audio.load()
  })

  try {
    await audio.play()
  } catch (err) {
    if (currentAudio === audio) disposeCurrentAudio()
    throw err
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel()
    }
  }
  disposeCurrentAudio()
  const { status, setIdle } = useVoiceStore.getState()
  if (status === 'speaking' || status === 'transcribing') setIdle()
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}
