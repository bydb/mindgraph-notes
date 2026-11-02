/**
 * Bild für den Petrol-Chat aufbereiten (Rev. 7 Punkt 20): Drehung aus der Kamera anwenden,
 * lange Seite höchstens 1600 px, als JPEG neu kodieren. Das Neukodieren entfernt EXIF-Daten
 * (GPS-Position, Gerät, Aufnahmezeit); der Main prüft das am Ergebnis noch einmal nach.
 * Originalbytes gehen nie hinaus.
 */

import {
  CHAT_IMAGE_CONTRACT,
  CHAT_IMAGE_INPUT_MAX_BYTES,
  CHAT_IMAGE_JPEG_QUALITY,
  CHAT_IMAGE_MAX_BYTES,
  fitImageSize,
  isUnsupportedImageType,
  type ChatImage
} from '../../shared/chatImages'

let seq = 0

export async function prepareChatImage(file: File): Promise<ChatImage | { error: string }> {
  const name = file.name || 'Bild'
  if (isUnsupportedImageType(name, file.type)) {
    return { error: `${name}: HEIC kann die App nicht lesen. Am iPhone „Kompatibel“ als Format wählen oder als JPEG exportieren.` }
  }
  if (!file.type.startsWith('image/')) return { error: `${name} ist kein Bild.` }
  if (file.size > CHAT_IMAGE_INPUT_MAX_BYTES) return { error: `${name} ist größer als 25 MB.` }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return { error: `${name} lässt sich nicht öffnen.` }
  }
  try {
    const size = fitImageSize(bitmap.width, bitmap.height)
    const canvas = new OffscreenCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return { error: `${name}: Bild konnte nicht aufbereitet werden.` }
    // Transparente PNGs bekämen sonst schwarzen Hintergrund.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: CHAT_IMAGE_JPEG_QUALITY })
    if (blob.size > CHAT_IMAGE_MAX_BYTES) return { error: `${name} ist auch verkleinert noch zu groß.` }
    const dataBase64 = await blobToBase64(blob)
    return {
      v: CHAT_IMAGE_CONTRACT,
      id: `img-${Date.now().toString(36)}-${++seq}`,
      name,
      mime: 'image/jpeg',
      width: size.width,
      height: size.height,
      byteLength: blob.size,
      dataBase64
    }
  } finally {
    bitmap.close()
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
