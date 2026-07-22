// Bild-Generierung (Google Imagen) — Core-Service des image-generation-Moduls.
//
// Aus der edoobox-Marketing-Vertikale herausgelöst (Paket 2 der Modul-Entflechtung):
// die Generierung ist kein edoobox-Feature, sondern ein eigenständiges Opt-in-Modul,
// das der Marketing-Tab UND (künftig) der Notiz-Agent nutzen. Der API-Key liegt via
// safeStorage verschlüsselt im userData-Verzeichnis — vorher lag er im Klartext in
// der Renderer-Config (localStorage). Cloud-Transparenz: eigener Google-Key des
// Nutzers, Modul default aus (Opt-in + Transparenz statt Enforcement).

import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

const IMAGEN_MODEL = 'imagen-4.0-generate-001'

export interface ImageGenResult {
  success: boolean
  imageBase64?: string
  error?: string
}

function getImagenKeyPath(): string {
  return path.join(app.getPath('userData'), 'imagen-key.enc')
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
 * Generiert ein Bild via Google Imagen. Der Key wird Main-seitig geladen und
 * verlässt den Main-Prozess nicht. Liefert Base64-PNG (keine Temp-Datei).
 */
export async function generateImage(
  prompt: string,
  options?: { aspectRatio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' }
): Promise<ImageGenResult> {
  try {
    const apiKey = await loadImagenKey()
    if (!apiKey) {
      return { success: false, error: 'Kein Imagen-API-Key hinterlegt (Einstellungen → KI → Bild-Generierung)' }
    }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: options?.aspectRatio ?? '16:9',
            safetyFilterLevel: 'block_only_high',
          },
        }),
        signal: AbortSignal.timeout(120000),
      }
    )
    if (!res.ok) {
      const text = await res.text()
      return { success: false, error: `Imagen API Fehler (${res.status}): ${text.slice(0, 200)}` }
    }
    const data = await res.json() as { predictions?: Array<{ bytesBase64Encoded?: string }>; filteredReason?: string }
    const predictions = data.predictions?.filter((pr) => pr.bytesBase64Encoded)
    if (!predictions || predictions.length === 0) {
      return { success: false, error: `Keine Bilder generiert: ${data.filteredReason || JSON.stringify(data).slice(0, 300)}` }
    }
    return { success: true, imageBase64: predictions[0].bytesBase64Encoded }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Bildgenerierung fehlgeschlagen' }
  }
}
