import { describe, expect, it } from 'vitest'
import { checkChatImagesWire, estimateImageTokens, fitImageSize, inspectJpeg, isUnsupportedImageType, planImageHistory } from './chatImages'

function seg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2
  return [0xff, marker, len >> 8, len & 0xff, ...payload]
}

function jpeg(width: number, height: number, opts: { app1?: boolean; app1AfterSof?: boolean } = {}): Uint8Array {
  const app0 = seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0])
  const app1 = seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3])
  const sof = seg(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0])
  const sos = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]
  return new Uint8Array([
    0xff, 0xd8, ...app0,
    ...(opts.app1 ? app1 : []),
    ...sof,
    ...(opts.app1AfterSof ? app1 : []),
    ...sos
  ])
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))

describe('inspectJpeg', () => {
  it('liest Maße aus dem SOF', () => {
    expect(inspectJpeg(jpeg(1600, 1200))).toEqual({ width: 1600, height: 1200, hasMetadata: false })
  })

  it('erkennt EXIF vor und nach dem SOF', () => {
    expect(inspectJpeg(jpeg(10, 10, { app1: true }))?.hasMetadata).toBe(true)
    expect(inspectJpeg(jpeg(10, 10, { app1AfterSof: true }))?.hasMetadata).toBe(true)
  })

  it('lehnt Nicht-JPEG und abgeschnittene Köpfe ab', () => {
    expect(inspectJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(inspectJpeg(jpeg(10, 10).slice(0, 12))).toBeNull()
  })
})

describe('checkChatImagesWire', () => {
  it('nimmt ein sauberes JPEG an', () => {
    const r = checkChatImagesWire([{ id: 'img-1', dataBase64: b64(jpeg(800, 600)) }], 4)
    expect('images' in r && r.images[0]).toMatchObject({ id: 'img-1', width: 800, height: 600 })
  })

  it('lehnt die ganze Anfrage bei einem schlechten Bild ab', () => {
    const ok = { id: 'a', dataBase64: b64(jpeg(800, 600)) }
    expect(checkChatImagesWire([ok, { id: 'b', dataBase64: b64(jpeg(800, 600, { app1: true })) }], 4)).toEqual({ error: expect.stringMatching(/Metadaten/) })
    expect(checkChatImagesWire([ok, { id: 'c', dataBase64: b64(jpeg(2400, 600)) }], 4)).toEqual({ error: expect.stringMatching(/1600/) })
    expect(checkChatImagesWire([ok, { id: 'a', dataBase64: ok.dataBase64 }], 4)).toEqual({ error: expect.stringMatching(/Kennung/) })
    expect(checkChatImagesWire([ok, ok, ok], 2)).toEqual({ error: expect.stringMatching(/Höchstens 2/) })
    expect(checkChatImagesWire([{ id: 'x', dataBase64: 'kein base64!' }], 4)).toEqual({ error: expect.stringMatching(/nicht lesbar/) })
  })

  it('ohne Bilder ist leer, kein Fehler', () => {
    expect(checkChatImagesWire(undefined, 4)).toEqual({ images: [] })
  })
})

describe('Hilfen', () => {
  it('verkleinert nur, wenn nötig', () => {
    expect(fitImageSize(4032, 3024)).toEqual({ width: 1600, height: 1200 })
    expect(fitImageSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('schätzt Bild-Token', () => {
    expect(estimateImageTokens(1600, 1200)).toBe(2560)
  })

  it('erkennt HEIC', () => {
    expect(isUnsupportedImageType('IMG_0001.HEIC', '')).toBe(true)
    expect(isUnsupportedImageType('foto.jpg', 'image/jpeg')).toBe(false)
  })
})

describe('planImageHistory', () => {
  const known = (...ids: string[]) => new Set(ids)
  it('letzte Frage immer, aus dem Verlauf nur die neuesten zwei', () => {
    const r = planImageHistory([
      { role: 'user', content: 'a', imageIds: ['1', '2'] },
      { role: 'assistant', content: 'x' },
      { role: 'user', content: 'b', imageIds: ['3'] },
      { role: 'assistant', content: 'y' },
      { role: 'user', content: 'c', imageIds: ['4', '5', '6'] }
    ], known('1', '2', '3', '4', '5', '6'))
    if ('error' in r) throw new Error(r.error)
    expect(r.messages[4].imageIds).toEqual(['4', '5', '6'])
    expect(r.messages[2].imageIds).toEqual(['3'])
    expect(r.messages[0].imageIds).toEqual(['2'])
    expect(r.messages[0].content).toContain('Zu dieser Nachricht gehörte ein Bild. Die Antwort darauf beruht auf dem Bild und gilt weiter')
    expect(r.dropped).toEqual(['1'])
  })

  it('lehnt unbekannte, doppelte und verwaiste Bilder ab', () => {
    expect(planImageHistory([{ role: 'user', content: 'a', imageIds: ['9'] }], known('1'))).toHaveProperty('error')
    expect(planImageHistory([{ role: 'user', content: 'a', imageIds: ['1', '1'] }], known('1'))).toHaveProperty('error')
    expect(planImageHistory([{ role: 'user', content: 'a' }], known('1'))).toHaveProperty('error')
    expect(planImageHistory([{ role: 'assistant', content: 'a', imageIds: ['1'] }], known('1'))).toHaveProperty('error')
  })
})
