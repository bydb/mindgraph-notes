import { describe, expect, it } from 'vitest'
import { INFOGRAPHIC_PROMPT_MAX_CHARS, infographicPromptError, parseImageMode } from './imageMode'

describe('parseImageMode', () => {
  it('nimmt Illustration, wenn kein Modus kommt', () => {
    expect(parseImageMode(undefined)).toEqual({ mode: 'illustration' })
    expect(parseImageMode('')).toEqual({ mode: 'illustration' })
    expect(parseImageMode('  ')).toEqual({ mode: 'illustration' })
  })

  it('erkennt die Infografik in üblichen Schreibweisen', () => {
    for (const raw of ['infografik', 'Infografik', 'infografik ', 'info-grafik', 'INFOGRAPHIC', 'info graphic']) {
      expect(parseImageMode(raw)).toEqual({ mode: 'infografik' })
    }
  })

  it('lehnt Unbekanntes ab, statt still ein textloses Bild zu machen', () => {
    const res = parseImageMode('diagramm')
    expect(res).toHaveProperty('error')
    expect((res as { error: string }).error).toContain('"infografik"')
    expect(parseImageMode(42)).toHaveProperty('error')
  })
})

describe('infographicPromptError', () => {
  it('lässt einen normalen Prompt durch', () => {
    expect(infographicPromptError('A clean vertical infographic, title "Roboter im Alltag".')).toBeNull()
  })

  it('lehnt zu viele Wörter ab', () => {
    expect(infographicPromptError(Array(401).fill('wort').join(' '))).toMatch(/401 Wörter/)
  })

  it('lehnt eine lange Kette ohne Leerraum ab, die die Wortzählung übersieht', () => {
    expect(infographicPromptError('a,'.repeat(INFOGRAPHIC_PROMPT_MAX_CHARS))).toMatch(/Zeichen/)
  })
})
