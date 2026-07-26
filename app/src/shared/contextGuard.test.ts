import { describe, it, expect } from 'vitest'
import { looksTruncated, contextTruncationMessage, AGENT_NUM_CTX, AGENT_NUM_CTX_WEB } from './contextGuard'

describe('looksTruncated', () => {
  it('meldet nichts, wenn der Server keine Prompt-Token liefert', () => {
    // Kein Signal = keine Aussage. Ein Backend ohne usage-Feld darf keinen Lauf killen.
    expect(looksTruncated({ promptTokens: undefined, sentChars: 500_000 })).toBe(false)
    expect(looksTruncated({ promptTokens: 0, sentChars: 500_000 })).toBe(false)
  })

  it('erkennt den Rückgang gegenüber dem vorherigen Durchlauf', () => {
    // Der reale Fall: 106 → 59 Token, während die Historie gewachsen ist.
    expect(looksTruncated({ promptTokens: 59, previousPromptTokens: 106, sentChars: 60_000 })).toBe(true)
  })

  it('toleriert kleines Tokenizer-Rauschen nach unten', () => {
    expect(looksTruncated({ promptTokens: 980, previousPromptTokens: 1000, sentChars: 3_900 })).toBe(false)
  })

  it('lässt die normal wachsende Konversation durch', () => {
    expect(looksTruncated({ promptTokens: 4_000, previousPromptTokens: 1_200, sentChars: 12_000 })).toBe(false)
  })

  it('erkennt Überlauf schon im ERSTEN Durchlauf ohne Vorwert', () => {
    // 60.000 Zeichen gesendet, aber nur 59 Token verarbeitet.
    expect(looksTruncated({ promptTokens: 59, sentChars: 60_000 })).toBe(true)
  })

  it('wertet Tool-Schemata nicht als Kürzung', () => {
    // Prompt-Token liegen wegen der Tool-Definitionen ÜBER der Zeichen-Schätzung —
    // die Prüfung darf nur nach unten schlagen.
    expect(looksTruncated({ promptTokens: 3_000, sentChars: 4_000 })).toBe(false)
  })

  it('bricht bei kurzen Konversationen nicht grundlos ab', () => {
    // Kurzer erster Aufruf: 233 Zeichen → Untergrenze ~58, gemeldet 91 (realer Messwert).
    expect(looksTruncated({ promptTokens: 91, sentChars: 233 })).toBe(false)
  })
})

describe('Kontext-Konstanten', () => {
  it('deckt der Web-Wert den Worst Case der Recherche ab', () => {
    // 10 Fetches à 8.000 Zeichen + 8 Suchen à 8 Treffer à ~800 Zeichen ≈ 144.000
    // Zeichen ≈ 48.000 Token bei 3 Zeichen/Token.
    const worstCaseTokens = (10 * 8_000 + 8 * 8 * 800) / 3
    expect(AGENT_NUM_CTX_WEB).toBeGreaterThan(worstCaseTokens)
    expect(AGENT_NUM_CTX_WEB).toBeGreaterThan(AGENT_NUM_CTX)
  })
})

describe('contextTruncationMessage', () => {
  it('nennt Ursache und konkrete Abhilfe', () => {
    const msg = contextTruncationMessage(59, 15_000)
    expect(msg).toContain('gekürzt')
    expect(msg).toContain('59')
    expect(msg).toContain('Anhänge')
  })

  it('empfiehlt NICHT die Server-Einstellung — der Agent sendet num_ctx selbst', () => {
    // Regression zu einem realen Doku-Fehler: Die erste Fassung riet zu
    // OLLAMA_CONTEXT_LENGTH, das der explizit gesendete Request-Wert übersteuert.
    expect(contextTruncationMessage(59, 15_000, 65_536)).not.toMatch(/OLLAMA_CONTEXT_LENGTH/)
  })

  it('nennt das angeforderte Fenster, wenn trotz num_ctx gekürzt wurde', () => {
    // Dann ist das Modell-Maximum kleiner als angefordert — anderes Modell nötig.
    const msg = contextTruncationMessage(59, 15_000, 65_536)
    expect(msg).toContain('65.536')
    expect(msg).toContain('Maximum des Modells')
  })
})
