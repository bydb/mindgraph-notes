// ElevenLabs-TTS-Client. Läuft im Main-Process, damit der API-Key nur dort hinfasst wird.
// Dokumentation: https://elevenlabs.io/docs/api-reference/text-to-speech

export interface ElevenLabsVoice {
  voice_id: string
  name: string
  labels?: Record<string, string>
  category?: string
  preview_url?: string
}

const API_BASE = 'https://api.elevenlabs.io/v1'

export async function listVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${API_BASE}/voices`, {
    headers: {
      'xi-api-key': apiKey,
      'Accept': 'application/json'
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = await res.json() as { voices: ElevenLabsVoice[] }
  return json.voices
}

export interface SynthesizeParams {
  text: string
  voiceId: string
  modelId: string
  stability: number
  similarity: number
}

/**
 * Synthetisiert Sprache zu MP3 und liefert einen Buffer zurück.
 * Der Buffer wird über IPC als ArrayBuffer an den Renderer weitergereicht.
 */
export async function synthesize(apiKey: string, params: SynthesizeParams): Promise<Buffer> {
  const url = `${API_BASE}/text-to-speech/${encodeURIComponent(params.voiceId)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: params.text,
      model_id: params.modelId,
      voice_settings: {
        stability: params.stability,
        similarity_boost: params.similarity
      }
    })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = body.slice(0, 300)
    try {
      const parsed = JSON.parse(body)
      message = parsed.detail?.message ?? parsed.detail ?? parsed.error ?? message
      if (typeof message === 'object') message = JSON.stringify(message)
    } catch { /* kein JSON, raw body verwenden */ }
    console.error(`[elevenlabs] synthesize failed: ${res.status} ${message}`)
    throw new Error(`ElevenLabs ${res.status}: ${message}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  const arrayBuffer = await res.arrayBuffer()
  console.log(`[elevenlabs] synthesize ok: ${arrayBuffer.byteLength} bytes, content-type=${contentType}`)
  if (!contentType.includes('audio/')) {
    // Server hat 200 geliefert, aber kein Audio (könnte JSON mit error sein)
    const text = Buffer.from(arrayBuffer).toString('utf-8').slice(0, 300)
    console.error(`[elevenlabs] unexpected content-type body: ${text}`)
    throw new Error(`ElevenLabs: unerwartete Antwort (${contentType}): ${text}`)
  }
  return Buffer.from(arrayBuffer)
}
