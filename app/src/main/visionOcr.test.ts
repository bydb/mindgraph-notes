import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./llm/telemetry', () => ({ recordLlmRun: () => {} }))
const { extractOcrPage } = await import('./visionOcr')

function streamOf(lines: string[]): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l + '\n'))
      c.close()
    }
  })
  return new Response(body, { status: 200 })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('extractOcrPage (Codex F31)', () => {
  it('Stream ohne done gilt als unvollständig', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamOf([JSON.stringify({ message: { content: 'Rechnung 4711' } })])))
    const r = await extractOcrPage('http://x', 'b64', 'm', 1)
    expect(r).toMatchObject({ success: true, content: 'Rechnung 4711', incomplete: true })
  })

  it('mit done vollständig', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamOf([JSON.stringify({ message: { content: 'Text' } }), JSON.stringify({ done: true, done_reason: 'stop' })])))
    expect(await extractOcrPage('http://x', 'b64', 'm', 1)).toMatchObject({ success: true, incomplete: false })
  })

  it('Abbruch von außen beendet einen laufenden Aufruf', async () => {
    // Wie echtes fetch: Abbruch lässt den laufenden Leser mit AbortError scheitern.
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const enc = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(JSON.stringify({ message: { content: 'Teil' } }) + '\n'))
          init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')))
        }
      })
      return new Response(body, { status: 200 })
    }))
    const ac = new AbortController()
    const p = extractOcrPage('http://x', 'b64', 'm', 1, { signal: ac.signal })
    setTimeout(() => ac.abort(), 20)
    await expect(p).rejects.toThrow('Abgebrochen')
  })

  it('schon abgebrochen: kein Aufruf', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const ac = new AbortController(); ac.abort()
    await expect(extractOcrPage('http://x', 'b64', 'm', 1, { signal: ac.signal })).rejects.toThrow('Abgebrochen')
    expect(f).not.toHaveBeenCalled()
  })
})
