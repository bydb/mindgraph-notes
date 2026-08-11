// Bild-Generierung (Google Nano Banana) — Core-Service des image-generation-Moduls.
//
// Aus der edoobox-Marketing-Vertikale herausgelöst (Paket 2 der Modul-Entflechtung):
// die Generierung ist kein edoobox-Feature, sondern ein eigenständiges Opt-in-Modul,
// das der Marketing-Tab UND der Notiz-Agent nutzen. Der API-Key liegt via
// safeStorage verschlüsselt im userData-Verzeichnis — vorher lag er im Klartext in
// der Renderer-Config (localStorage). Cloud-Transparenz: eigener Google-Key des
// Nutzers, Modul default aus (Opt-in + Transparenz statt Enforcement).

import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

const IMAGE_MODEL = 'gemini-3.1-flash-image'
const INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const INTERACTIONS_API_REVISION = '2026-05-20'
// gemini-3.1-flash-image liefert AUSSCHLIESSLICH JPEG. `image/png` beantwortet die
// API mit HTTP 400 ("not supported for 'response_format.mime_type'") — also jeder
// Aufruf schlägt fehl, nicht nur manche. Real gegen die API verifiziert (11.08.2026);
// die allgemeine Doku listet PNG, dieses Modell unterstützt es nicht. Der Wert darf
// nur zusammen mit den Dateiendungen der Aufrufer geändert werden.
const IMAGE_MIME = 'image/jpeg'
const IMAGE_EXT = '.jpg'

interface InteractionContent {
  type?: string
  data?: string
  text?: string
  mime_type?: string
}

interface InteractionStep {
  type?: string
  content?: InteractionContent[]
  error?: { message?: string }
  turn_complete_reason?: string
}

interface ImageInteractionResponse {
  steps?: InteractionStep[]
  // Der Abbruchgrund taucht in Googles Beispielen auf OBERSTER Ebene auf, in anderen
  // Beispielen am Schritt. Welche Variante ein Sicherheitsblock liefert, ist offen —
  // deshalb werden beide gelesen (ein echter Block liess sich nicht provozieren:
  // verbotene EINGABEN beantwortet die API bereits mit HTTP 400).
  turn_complete_reason?: string
  status?: string
}

export interface ImageGenResult {
  success: boolean
  imageBase64?: string
  /** MIME-Typ der gelieferten Bytes (aktuell immer image/jpeg) — Aufrufer wählen danach Endung und Data-URL. */
  mimeType?: string
  /** Passende Dateiendung inkl. Punkt (aktuell immer .jpg). */
  fileExtension?: string
  error?: string
}

function getImagenKeyPath(): string {
  // Dateiname aus Kompatibilitätsgründen behalten: bestehende Nutzer sollen
  // ihren bereits verschlüsselt gespeicherten Google-AI-Key nicht neu eingeben.
  return path.join(app.getPath('userData'), 'imagen-key.enc')
}

function extractImageData(data: ImageInteractionResponse): { data: string; mimeType: string } | null {
  for (const step of data.steps ?? []) {
    if (step.type !== 'model_output') continue
    for (const content of step.content ?? []) {
      if (content.type === 'image' && typeof content.data === 'string' && content.data.length > 0) {
        return { data: content.data, mimeType: content.mime_type || IMAGE_MIME }
      }
    }
  }
  return null
}

function explainMissingImage(data: ImageInteractionResponse): string {
  const reasons: string[] = []
  const messages: string[] = []

  if (data.turn_complete_reason) reasons.push(data.turn_complete_reason)
  for (const step of data.steps ?? []) {
    if (step.turn_complete_reason) reasons.push(step.turn_complete_reason)
    if (step.error?.message) messages.push(step.error.message)
    for (const content of step.content ?? []) {
      if (content.type === 'text' && content.text?.trim()) messages.push(content.text.trim())
    }
  }

  const reason = [...new Set(reasons)].join(', ')
  const message = [...new Set(messages)].join(' ')
  if (reason && message) return `Bildgenerierung blockiert (${reason}): ${message}`
  if (reason) return `Bildgenerierung blockiert (${reason}). Bitte den Bild-Prompt neutraler formulieren.`
  if (message) return `Bildgenerierung fehlgeschlagen: ${message}`
  return 'Nano Banana hat kein Bild zurückgegeben. Möglicherweise wurde das Motiv durch einen Sicherheitsfilter blockiert; bitte den Bild-Prompt neutraler formulieren.'
}

export async function saveImagenKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: 'safeStorage nicht verfügbar' }
    }
    const encrypted = safeStorage.encryptString(apiKey)
    await fs.writeFile(getImagenKeyPath(), encrypted)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function loadImagenKey(): Promise<string | null> {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const encrypted = await fs.readFile(getImagenKeyPath())
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

export async function deleteImagenKey(): Promise<{ success: boolean }> {
  try {
    await fs.unlink(getImagenKeyPath())
    return { success: true }
  } catch {
    return { success: true } // Datei war ohnehin weg
  }
}

/**
 * Generiert ein Bild via Google Nano Banana. Der Key wird Main-seitig geladen und
 * verlässt den Main-Prozess nicht. Liefert Base64-PNG (keine Temp-Datei).
 */
export async function generateImage(
  prompt: string,
  options?: { aspectRatio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' }
): Promise<ImageGenResult> {
  try {
    const apiKey = await loadImagenKey()
    if (!apiKey) {
      return { success: false, error: 'Kein Google-AI-Studio-API-Key hinterlegt (Einstellungen → KI → Bild-Generierung)' }
    }
    const res = await fetch(INTERACTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Api-Revision': INTERACTIONS_API_REVISION,
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        input: [{ type: 'text', text: prompt }],
        response_format: {
          type: 'image',
          mime_type: IMAGE_MIME,
          aspect_ratio: options?.aspectRatio ?? '16:9',
          image_size: '1K',
        },
      }),
      signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) {
      const text = await res.text()
      return { success: false, error: `Google-Bild-API-Fehler (${res.status}): ${text.slice(0, 300)}` }
    }
    const data = await res.json() as ImageInteractionResponse
    const image = extractImageData(data)
    if (!image) return { success: false, error: explainMissingImage(data) }
    return {
      success: true,
      imageBase64: image.data,
      mimeType: image.mimeType,
      fileExtension: image.mimeType === 'image/png' ? '.png' : IMAGE_EXT,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Bildgenerierung fehlgeschlagen' }
  }
}
