import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/private/tmp/mg-image-gen-test' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    decryptString: () => 'debug-api-key',
    encryptString: (value: string) => Buffer.from(value),
  },
}))

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(async () => Buffer.from('encrypted')),
    writeFile: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
  },
}))

import { generateImage } from './imagenService'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Nano-Banana-Bildgenerierung', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('nutzt Gemini 3.1 Flash Image über das aktuelle Interactions-Schema', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      id: 'int_test',
      steps: [{
        type: 'model_output',
        content: [{ type: 'image', mime_type: 'image/jpeg', data: 'aW1hZ2U=' }],
      }],
    }))

    await expect(generateImage('A conference room', { aspectRatio: '4:3' })).resolves.toEqual({
      success: true,
      imageBase64: 'aW1hZ2U=',
      mimeType: 'image/jpeg',
      fileExtension: '.jpg',
    })

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(String(url)).not.toContain('debug-api-key')
    expect(init?.headers).toEqual(expect.objectContaining({
      'Api-Revision': '2026-05-20',
      'Content-Type': 'application/json',
      'x-goog-api-key': 'debug-api-key',
    }))
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'gemini-3.1-flash-image',
      input: [{ type: 'text', text: 'A conference room' }],
      response_format: {
        // image/png beantwortet gemini-3.1-flash-image mit HTTP 400 — real verifiziert.
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: '4:3',
        image_size: '1K',
      },
    })
  })

  it('meldet den Abbruchgrund auch, wenn er auf oberster Ebene steht', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      id: 'int_top_level',
      status: 'completed',
      turn_complete_reason: 'GENERATED_IMAGE_MINORS',
      steps: [{ type: 'model_output', content: [] }],
    }))

    await expect(generateImage('A youth workshop')).resolves.toEqual({
      success: false,
      error: 'Bildgenerierung blockiert (GENERATED_IMAGE_MINORS). Bitte den Bild-Prompt neutraler formulieren.',
    })
  })

  it('macht einen Safety-Block samt Grund sichtbar', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      id: 'int_filtered',
      steps: [{
        type: 'model_output',
        turn_complete_reason: 'GENERATED_IMAGE_MINORS',
        content: [{ type: 'text', text: 'The generated image appeared to include minors.' }],
      }],
    }))

    const result = await generateImage('Teenagers at a youth conference')

    expect(result).toEqual({
      success: false,
      error: 'Bildgenerierung blockiert (GENERATED_IMAGE_MINORS): The generated image appeared to include minors.',
    })
  })

  it('liefert bei einer leeren Erfolgsantwort eine hilfreiche Meldung statt {}', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'int_empty', steps: [] }))

    await expect(generateImage('An abstract education symbol')).resolves.toEqual({
      success: false,
      error: 'Nano Banana hat kein Bild zurückgegeben. Möglicherweise wurde das Motiv durch einen Sicherheitsfilter blockiert; bitte den Bild-Prompt neutraler formulieren.',
    })
  })
})
