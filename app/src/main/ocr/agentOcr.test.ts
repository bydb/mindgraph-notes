import { describe, expect, it, vi } from 'vitest'
import { createAgentOcrState, ocrImageForAgent, type OcrReadContext } from './agentOcr'

const on = { visionOcr: { enabled: true, model: 'glm-ocr' } }
const prepare = () => 'B64'

function ctx(state = createAgentOcrState(on), ocr = vi.fn(async () => ({ success: true, content: 'Rechnung 4711' }))): OcrReadContext & { ocr: typeof ocr } {
  return { state, prepare, ocr, onStep: vi.fn() } as OcrReadContext & { ocr: typeof ocr }
}

describe('ocrImageForAgent (Rev. 7 Punkt 24)', () => {
  it('liefert Text mit Vermerk und zählt das Budget', async () => {
    const c = ctx()
    const text = await ocrImageForAgent(Buffer.from('bild-a'), 'scan.jpg', c)
    expect(text).toMatch(/^\[Bild per Texterkennung auf diesem Rechner gelesen/)
    expect(text).toContain('Rechnung 4711')
    expect(c.state.pagesUsed).toBe(1)
    expect(c.onStep).toHaveBeenCalledWith(expect.stringContaining('scan.jpg'))
  })

  it('dieselbe Datei zweimal: eine Erkennung (gemeinsamer Zwischenspeicher, F32)', async () => {
    const c = ctx()
    await ocrImageForAgent(Buffer.from('bild-a'), 'a.jpg', c)
    await ocrImageForAgent(Buffer.from('bild-a'), 'kopie.jpg', c)
    expect(c.ocr).toHaveBeenCalledTimes(1)
    expect(c.state.pagesUsed).toBe(1)
  })

  it('Budget erschöpft: klare Meldung, kein Aufruf', async () => {
    const c = ctx(createAgentOcrState(on, 1))
    await ocrImageForAgent(Buffer.from('a'), 'a.jpg', c)
    await expect(ocrImageForAgent(Buffer.from('b'), 'b.jpg', c)).rejects.toThrow(/Budget/)
    expect(c.ocr).toHaveBeenCalledTimes(1)
  })

  it('Texterkennung aus: Meldung mit nächstem Schritt', async () => {
    await expect(ocrImageForAgent(Buffer.from('a'), 'a.jpg', ctx(createAgentOcrState({})))).rejects.toThrow(/Vision OCR/)
  })

  it('unvollständig und fehlgeschlagen werden benannt, nie still', async () => {
    const part = ctx(undefined, vi.fn(async () => ({ success: true, content: 'Teil', incomplete: true })))
    expect(await ocrImageForAgent(Buffer.from('a'), 'a.jpg', part)).toContain('möglicherweise unvollständig')
    const fail = ctx(undefined, vi.fn(async () => ({ success: false, content: '', error: 'kein Text' })))
    await expect(ocrImageForAgent(Buffer.from('b'), 'b.jpg', fail)).rejects.toThrow(/Texterkennung fehlgeschlagen: kein Text/)
  })

  it('Zeitbudget: nahe am Ende keine neue Seite, sonst Restzeit als Seitenfrist (F48)', async () => {
    const c = ctx(createAgentOcrState(on, 40, 60_000))
    await ocrImageForAgent(Buffer.from('a'), 'a.jpg', c)
    const opts = (c.ocr.mock.calls[0] as unknown as [string, { timeoutMs: number }])[1]
    expect(opts.timeoutMs).toBeLessThanOrEqual(60_000)
    const late = ctx(createAgentOcrState(on, 40, 1_000))
    await expect(ocrImageForAgent(Buffer.from('b'), 'b.jpg', late)).rejects.toThrow(/Zeitbudget/)
    expect(late.ocr).not.toHaveBeenCalled()
  })
})
