/**
 * Bilder im Petrol-Chat: Laufzeitvertrag und Prüfung der Bytes (Rev. 7 Punkt 20/22,
 * docs/codex-collab/chat-verlauf-notizen-bilder.md).
 *
 * Der Renderer bereitet jedes Bild auf (Drehung angewandt, lange Seite höchstens 1600 px,
 * JPEG neu kodiert — damit fallen EXIF-Daten wie GPS-Position und Gerät weg). Der Main
 * glaubt das nicht, sondern prüft die Bytes selbst, bevor ein Bild in eine Anbieter-Nutzlast
 * geht: JPEG-Kennung, keine EXIF-/XMP-Blöcke, Maße aus dem JPEG-Kopf, Größe.
 *
 * Gespeichert wird in 1.2 nichts. Teil 1 bildet `dataBase64` später auf eine Mediendatei ab;
 * der Dateiname `name` ist reine Anzeige und geht nie an ein Modell.
 */

export const CHAT_IMAGE_CONTRACT = 1
export const CHAT_IMAGE_MAX_SIDE = 1600
export const CHAT_IMAGE_MAX_PER_MESSAGE = 4
/** Ältere Bilder im Verlauf, die bei Folgefragen noch mitgehen (Rev. 2 Punkt 7). */
export const CHAT_IMAGE_MAX_IN_HISTORY = 2
/** Aufbereitet: bei 1600 px und JPEG 0,85 meist 200–600 KB. */
export const CHAT_IMAGE_MAX_BYTES = 3 * 1024 * 1024
/** Eingabedatei vor der Aufbereitung. */
export const CHAT_IMAGE_INPUT_MAX_BYTES = 25 * 1024 * 1024
export const CHAT_IMAGE_JPEG_QUALITY = 0.85

export interface ChatImage {
  v: typeof CHAT_IMAGE_CONTRACT
  id: string
  /** Nur Anzeige an der Marke; geht nie an ein Modell. */
  name: string
  mime: 'image/jpeg'
  width: number
  height: number
  byteLength: number
  dataBase64: string
}

/** Was mit einem Bild in einer Anfrage geschah — vom Main gemeldet, nicht vom Renderer angenommen. */
export type ChatImageDelivery =
  | { kind: 'image'; route: 'local' | 'cloud'; target: string }
  /** Älteres Bild aus dem Verlauf, das bei dieser Anfrage nicht mitging (Grund = Prüfstelle). */
  | { kind: 'history-dropped'; reason?: string }
  | { kind: 'rejected'; reason: string }

/** Was über die IPC-Grenze geht: ohne Dateinamen. */
export interface ChatImageWire {
  id: string
  dataBase64: string
}

/** Token-Schätzung je Bild (Anthropic-Formel Breite × Höhe / 750; bei 1600 × 1200 rund 2560). */
export function estimateImageTokens(width: number, height: number): number {
  return Math.ceil((Math.max(0, width) * Math.max(0, height)) / 750)
}

export interface JpegInfo {
  width: number
  height: number
  /** APP1 (EXIF/XMP) oder APP13 (IPTC/Photoshop) vorhanden. */
  hasMetadata: boolean
}

/**
 * Liest Maße und Metadaten-Blöcke aus einem JPEG. `null`, wenn die Bytes kein
 * vollständiger JPEG-Kopf sind.
 */
export function inspectJpeg(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  let hasMetadata = false
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1]
    // Füllbytes
    if (marker === 0xff) { i++; continue }
    // Marker ohne Länge
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    if (marker === 0xd9 || marker === 0xda) return null // Bilddaten/Ende vor dem SOF
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (len < 2 || i + 2 + len > bytes.length) return null
    if (marker === 0xe1 || marker === 0xed) hasMetadata = true
    // SOF0–SOF15 außer DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (len < 7) return null
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      if (!width || !height) return null
      // Weiter bis zum Bildanfang: Metadaten können auch nach dem SOF stehen.
      let j = i + 2 + len
      while (j + 4 <= bytes.length && bytes[j] === 0xff && bytes[j + 1] !== 0xda && bytes[j + 1] !== 0xd9) {
        const m = bytes[j + 1]
        if (m === 0xff) { j++; continue }
        const l = (bytes[j + 2] << 8) | bytes[j + 3]
        if (l < 2) break
        if (m === 0xe1 || m === 0xed) hasMetadata = true
        j += 2 + l
      }
      return { width, height, hasMetadata }
    }
    i += 2 + len
  }
  return null
}

export function base64ToBytes(b64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) return null
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k)
    return out
  } catch {
    return null
  }
}

export interface CheckedChatImage {
  id: string
  dataBase64: string
  width: number
  height: number
  bytes: number
}

/**
 * Prüft Bilder aus dem Renderer. Ein einziges ungültiges Bild lehnt die ganze Anfrage ab —
 * ein Bild still wegzulassen hieße, das Modell antwortet, als hätte es alles gesehen.
 */
export function checkChatImagesWire(raw: unknown, maxCount: number): { images: CheckedChatImage[] } | { error: string } {
  if (raw === undefined || raw === null) return { images: [] }
  if (!Array.isArray(raw)) return { error: 'Bilder: ungültiges Format.' }
  if (raw.length > maxCount) return { error: `Höchstens ${maxCount} Bilder je Anfrage.` }
  const seen = new Set<string>()
  const images: CheckedChatImage[] = []
  for (const item of raw) {
    const id = (item as ChatImageWire | null)?.id
    const data = (item as ChatImageWire | null)?.dataBase64
    if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id) || seen.has(id)) return { error: 'Bilder: ungültige Kennung.' }
    if (typeof data !== 'string' || data.length > Math.ceil(CHAT_IMAGE_MAX_BYTES / 3) * 4) return { error: 'Bild ist zu groß.' }
    const bytes = base64ToBytes(data)
    if (!bytes) return { error: 'Bild ist nicht lesbar.' }
    const info = inspectJpeg(bytes)
    if (!info) return { error: 'Bild ist kein aufbereitetes JPEG.' }
    if (info.hasMetadata) return { error: 'Bild enthält noch Metadaten (EXIF) und wird nicht gesendet.' }
    if (Math.max(info.width, info.height) > CHAT_IMAGE_MAX_SIDE) return { error: `Bild ist größer als ${CHAT_IMAGE_MAX_SIDE} px.` }
    seen.add(id)
    images.push({ id, dataBase64: data, width: info.width, height: info.height, bytes: bytes.length })
  }
  return { images }
}

/** Neue Maße für die Aufbereitung: lange Seite höchstens `maxSide`, nie vergrößern. */
export function fitImageSize(width: number, height: number, maxSide = CHAT_IMAGE_MAX_SIDE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= maxSide) return { width, height }
  const f = maxSide / long
  return { width: Math.max(1, Math.round(width * f)), height: Math.max(1, Math.round(height * f)) }
}

/** HEIC/HEIF kann Chromium nicht dekodieren — vorher ablehnen statt mit leerem Bild zu scheitern. */
export function isUnsupportedImageType(name: string, mime: string): boolean {
  return /\.(heic|heif)$/i.test(name) || /image\/hei[cf]/i.test(mime)
}

/**
 * Vermerk für das Modell an einer früheren Frage, deren Bild jetzt nicht mitgeht. Muss klar
 * sagen, dass es das Bild GAB und die damalige Antwort darauf beruht — ein knappes „nicht
 * mitgeschickt“ las Haiku 5.5 als „es gab nie ein Bild“ und erklärte die richtige frühere
 * Antwort für erfunden (Abnahme 02.11.2026).
 */
export function imageOmittedNote(count: number): string {
  const what = count === 1 ? 'ein Bild' : `${count} Bilder`
  return `[Zu dieser Nachricht gehörte ${what}. Die Antwort darauf beruht auf dem Bild und gilt weiter; das Bild wird bei dieser Anfrage nur nicht noch einmal mitgeschickt. Fragen zu Einzelheiten, die in der früheren Antwort nicht stehen, kannst du nicht beantworten — dann um erneutes Anhängen bitten.]`
}

export interface ImageHistoryMessage {
  role: string
  content: string
  imageIds?: string[]
}

export interface PlannedImageMessage {
  role: string
  content: string
  /** Bilder, die mit dieser Nachricht wirklich ans Modell gehen. */
  imageIds: string[]
}

/**
 * Welche Bilder gehen in dieser Anfrage mit (Rev. 2 Punkt 7, vom Main selbst nachgezählt):
 * alle Bilder der letzten Frage, aus dem Verlauf davor nur die neuesten
 * `maxHistory`. Ältere werden durch einen sichtbaren Vermerk im Text ersetzt, damit das
 * Modell weiß, dass dort ein Bild war, das es jetzt nicht sieht.
 */
export function planImageHistory(
  messages: readonly ImageHistoryMessage[],
  known: ReadonlySet<string>,
  maxHistory = CHAT_IMAGE_MAX_IN_HISTORY
): { messages: PlannedImageMessage[]; sent: string[]; dropped: string[] } | { error: string } {
  let lastUser = -1
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { lastUser = i; break }
  const referenced = new Set<string>()
  for (const m of messages) {
    const ids = m.imageIds ?? []
    if (!Array.isArray(ids)) return { error: 'Bilder: ungültiges Format.' }
    if (ids.length && m.role !== 'user') return { error: 'Bilder: nur an eigenen Nachrichten.' }
    for (const id of ids) {
      if (typeof id !== 'string' || !known.has(id) || referenced.has(id)) return { error: 'Bilder: Verweis passt nicht zu den gesendeten Bildern.' }
      referenced.add(id)
    }
  }
  if (referenced.size !== known.size) return { error: 'Bilder: gesendetes Bild ohne Nachricht.' }
  let historyLeft = maxHistory
  const sent: string[] = []
  const dropped: string[] = []
  const out: PlannedImageMessage[] = new Array(messages.length)
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const ids = m.imageIds ?? []
    if (!ids.length) { out[i] = { role: m.role, content: m.content, imageIds: [] }; continue }
    if (i === lastUser) {
      sent.push(...ids)
      out[i] = { role: m.role, content: m.content, imageIds: [...ids] }
      continue
    }
    // Neueste zuerst: von hinten in der Nachricht.
    const keep: string[] = []
    for (let k = ids.length - 1; k >= 0; k--) {
      if (historyLeft > 0) { keep.unshift(ids[k]); historyLeft-- } else dropped.push(ids[k])
    }
    sent.push(...keep)
    const lost = ids.length - keep.length
    const note = lost > 0 ? `\n${imageOmittedNote(lost)}` : ''
    out[i] = { role: m.role, content: m.content + note, imageIds: keep }
  }
  return { messages: out, sent, dropped }
}
