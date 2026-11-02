import { describe, expect, it } from 'vitest'
import { jpegExifOrientation, orientPixels } from './imageOrientation'

function exifJpeg(orientation: number, little: boolean): Uint8Array {
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff])
  const u32 = (v: number) => (little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff])
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)]
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const len = payload.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...payload, 0xff, 0xda, 0, 2, 0xff, 0xd9])
}

describe('jpegExifOrientation', () => {
  it('liest den Tag in beiden Byte-Reihenfolgen', () => {
    for (let o = 1; o <= 8; o++) {
      expect(jpegExifOrientation(exifJpeg(o, false))).toBe(o)
      expect(jpegExifOrientation(exifJpeg(o, true))).toBe(o)
    }
  })
  it('ohne EXIF oder kein JPEG: 1', () => {
    expect(jpegExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1)
    expect(jpegExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1)
  })
})

describe('orientPixels', () => {
  // 2×3-Bild, Pixel tragen ihre Nummer im ersten Kanal:
  // 1 2
  // 3 4
  // 5 6
  const img = new Uint8Array([1, 2, 3, 4, 5, 6].flatMap(v => [v, 0, 0, 255]))
  const grid = (r: { data: Uint8Array; width: number }) => {
    const rows: number[][] = []
    for (let i = 0; i < r.data.length / 4; i++) {
      const y = Math.floor(i / r.width)
      ;(rows[y] ??= []).push(r.data[i * 4])
    }
    return rows
  }
  it('dreht 6 (90° im Uhrzeigersinn) und 8 (gegen den Uhrzeigersinn)', () => {
    expect(grid(orientPixels(img, 2, 3, 6))).toEqual([[5, 3, 1], [6, 4, 2]])
    expect(grid(orientPixels(img, 2, 3, 8))).toEqual([[2, 4, 6], [1, 3, 5]])
  })
  it('3 = 180°, 2 = gespiegelt, 1 = unverändert', () => {
    expect(grid(orientPixels(img, 2, 3, 3))).toEqual([[6, 5], [4, 3], [2, 1]])
    expect(grid(orientPixels(img, 2, 3, 2))).toEqual([[2, 1], [4, 3], [6, 5]])
    expect(orientPixels(img, 2, 3, 1).data).toBe(img)
  })
  it('5 und 7 transponieren', () => {
    expect(grid(orientPixels(img, 2, 3, 5))).toEqual([[1, 3, 5], [2, 4, 6]])
    expect(grid(orientPixels(img, 2, 3, 7))).toEqual([[6, 4, 2], [5, 3, 1]])
  })
})
