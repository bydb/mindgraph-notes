/**
 * EXIF-Drehung für Bilder, die der Main ohne Canvas aufbereitet (Agent liest Bilder, Rev. 7
 * Punkt 24). Electrons `nativeImage` öffnet JPEG/PNG, wendet die Drehung aus der Kamera aber
 * NICHT an (gemessen 02.11.2026: JPEG mit Orientation 6 kam ungedreht an). Ein hochkant
 * fotografiertes Blatt ginge sonst quer in die Texterkennung.
 */

/** Orientation-Tag (1–8) aus einem JPEG, 1 wenn keiner da oder unlesbar. */
export function jpegExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1
  let i = 2
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1]
    if (marker === 0xda || marker === 0xd9) return 1
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (len < 2) return 1
    if (marker === 0xe1 && len >= 16 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66) {
      return readTiffOrientation(bytes, i + 10, Math.min(bytes.length, i + 2 + len))
    }
    i += 2 + len
  }
  return 1
}

function readTiffOrientation(b: Uint8Array, start: number, end: number): number {
  const little = b[start] === 0x49 && b[start + 1] === 0x49
  if (!little && !(b[start] === 0x4d && b[start + 1] === 0x4d)) return 1
  const u16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1])
  const u32 = (o: number) => (little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000 : b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]))
  if (start + 8 > end) return 1
  const ifd = start + u32(start + 4)
  if (ifd + 2 > end) return 1
  const count = u16(ifd)
  for (let k = 0; k < count; k++) {
    const e = ifd + 2 + k * 12
    if (e + 12 > end) return 1
    if (u16(e) === 0x0112) {
      const v = u16(e + 8)
      return v >= 1 && v <= 8 ? v : 1
    }
  }
  return 1
}

/**
 * Dreht/spiegelt ein 4-Byte-Pixelbild (BGRA/RGBA, Zeile für Zeile) nach EXIF-Orientation.
 * Gibt neue Maße zurück; bei 5–8 tauschen Breite und Höhe.
 */
export function orientPixels(src: Uint8Array, width: number, height: number, orientation: number): { data: Uint8Array; width: number; height: number } {
  if (orientation <= 1 || orientation > 8) return { data: src, width, height }
  const swap = orientation >= 5
  const w2 = swap ? height : width
  const h2 = swap ? width : height
  const out = new Uint8Array(src.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nx: number
      let ny: number
      switch (orientation) {
        case 2: nx = width - 1 - x; ny = y; break
        case 3: nx = width - 1 - x; ny = height - 1 - y; break
        case 4: nx = x; ny = height - 1 - y; break
        case 5: nx = y; ny = x; break
        case 6: nx = height - 1 - y; ny = x; break
        case 7: nx = height - 1 - y; ny = width - 1 - x; break
        default: nx = y; ny = width - 1 - x; break // 8
      }
      const s = (y * width + x) * 4
      const d = (ny * w2 + nx) * 4
      out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3]
    }
  }
  return { data: out, width: w2, height: h2 }
}
