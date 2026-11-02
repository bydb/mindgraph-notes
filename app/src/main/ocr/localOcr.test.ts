import { describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ocrImageLocal } from './localOcr'
import { LocalModelError } from '../rag/localModel'
import { ollamaForegroundCount } from '../rag/ollamaActivity'

const on = { visionOcr: { enabled: true, model: 'glm-ocr' } }
const local = async (name: string) => ({ name: `${name}:latest`, digest: 'd', capabilities: ['completion', 'vision'] })

describe('ocrImageLocal (Codex F28/F31)', () => {
  it('ausgeschaltet oder ohne Modell: Fehler mit nächstem Schritt, kein Aufruf', async () => {
    const extract = vi.fn()
    expect(await ocrImageLocal('b64', { settings: {}, extract })).toMatchObject({ success: false, error: expect.stringMatching(/ausgeschaltet/) })
    expect(await ocrImageLocal('b64', { settings: { visionOcr: { enabled: true, model: ' ' } }, extract })).toMatchObject({ success: false, error: expect.stringMatching(/kein Modell/) })
    expect(extract).not.toHaveBeenCalled()
  })

  it('prüft vor jeder Seite frisch und lehnt Cloud und Nicht-Vision ab', async () => {
    const extract = vi.fn()
    const resolveCloud = vi.fn(async () => { throw new LocalModelError('remote', 'x', 'entfernt') })
    expect(await ocrImageLocal('b64', { settings: on, extract, resolveLocal: resolveCloud })).toMatchObject({ success: false, error: expect.stringMatching(/nur mit Modellen auf diesem Rechner/) })
    expect(resolveCloud).toHaveBeenCalledWith('glm-ocr', { fresh: true })
    const textOnly = async () => ({ name: 'llama3.1:8b', digest: 'd', capabilities: ['completion'] })
    expect(await ocrImageLocal('b64', { settings: on, extract, resolveLocal: textOnly })).toMatchObject({ success: false, error: expect.stringMatching(/keine Bilder/) })
    const unknownCaps = async () => ({ name: 'alt:latest', digest: 'd' })
    expect(await ocrImageLocal('b64', { settings: on, extract, resolveLocal: unknownCaps })).toMatchObject({ success: false, error: expect.stringMatching(/meldet .* nicht/) })
    expect(extract).not.toHaveBeenCalled()
  })

  it('ruft mit aufgelöstem Namen, Signal und Vordergrund-Anmeldung', async () => {
    const ac = new AbortController()
    let during = -1
    const extract = vi.fn(async () => { during = ollamaForegroundCount(); return { success: true, content: 'Text' } })
    const r = await ocrImageLocal('b64', { settings: on, resolveLocal: local, extract, signal: ac.signal, pageNum: 3 })
    expect(r).toEqual({ success: true, content: 'Text' })
    expect(extract).toHaveBeenCalledWith('http://localhost:11434', 'b64', 'glm-ocr:latest', 3, { signal: ac.signal, timeoutMs: undefined })
    expect(during).toBe(1)
    expect(ollamaForegroundCount()).toBe(0)
  })

  it('Abbruch wird als Abbruch gemeldet, nicht als Seitenfehler', async () => {
    const ac = new AbortController()
    const extract = vi.fn(async () => { ac.abort(); throw new Error('This operation was aborted') })
    await expect(ocrImageLocal('b64', { settings: on, resolveLocal: local, extract, signal: ac.signal })).rejects.toThrow('Abgebrochen')
  })

  it('niemand außer dem Einstieg importiert extractOcrPage', () => {
    const root = join(__dirname, '..', '..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.tsx?$/.test(e) || /\.test\.tsx?$/.test(e)) continue
        const rel = relative(root, p)
        if (rel === join('main', 'visionOcr.ts') || rel === join('main', 'ocr', 'localOcr.ts')) continue
        if (/\bextractOcrPage\b/.test(readFileSync(p, 'utf8'))) offenders.push(rel)
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
