// Der Limit-Check ist die einzige Stelle, die einen bezahlten Fehlversuch verhindert:
// ElevenLabs rechnet nach Zeichen ab, ein serverseitiger Abbruch am Limit wird
// trotzdem berechnet. Deshalb konservativer Fallback statt „großzügig raten".
import { describe, it, expect } from 'vitest'
import { checkTtsLength, getElevenLabsCharLimit, ELEVENLABS_FALLBACK_CHAR_LIMIT } from './ttsLimits'

describe('getElevenLabsCharLimit', () => {
  it('kennt die dokumentierten Modelle', () => {
    expect(getElevenLabsCharLimit('eleven_multilingual_v2')).toBe(10000)
    expect(getElevenLabsCharLimit('eleven_flash_v2_5')).toBe(40000)
  })

  it('fällt bei unbekannter Modell-ID auf den konservativen Wert zurück', () => {
    expect(getElevenLabsCharLimit('irgendwas-neues')).toBe(ELEVENLABS_FALLBACK_CHAR_LIMIT)
    expect(getElevenLabsCharLimit('')).toBe(ELEVENLABS_FALLBACK_CHAR_LIMIT)
  })
})

describe('checkTtsLength', () => {
  it('lässt Text bis genau zum Limit durch', () => {
    const check = checkTtsLength('x'.repeat(10000), 'eleven_multilingual_v2')
    expect(check.ok).toBe(true)
    expect(check.chars).toBe(10000)
  })

  it('meldet Überlänge mit beiden Zahlen', () => {
    const check = checkTtsLength('x'.repeat(10452), 'eleven_multilingual_v2')
    expect(check.ok).toBe(false)
    expect(check.chars).toBe(10452)
    expect(check.limit).toBe(10000)
  })

  it('meldet leeren Text als nicht sendbar', () => {
    expect(checkTtsLength('', 'eleven_multilingual_v2').ok).toBe(false)
  })
})
