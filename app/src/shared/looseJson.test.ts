import { describe, it, expect } from 'vitest'
import { parseLooseJsonObject, findBalancedJsonObjects } from './looseJson'

describe('findBalancedJsonObjects', () => {
  it('findet zwei aufeinanderfolgende Objekte getrennt', () => {
    expect(findBalancedJsonObjects('{"a":1}\n{"b":2}')).toEqual(['{"a":1}', '{"b":2}'])
  })
  it('lässt sich von Klammern in Zeichenketten nicht täuschen', () => {
    expect(findBalancedJsonObjects('{"a":"}{"}')).toEqual(['{"a":"}{"}'])
  })
  it('lässt sich von maskierten Anführungszeichen nicht täuschen', () => {
    expect(findBalancedJsonObjects('{"a":"sagt \\"}\\" dazu"}')).toEqual(['{"a":"sagt \\"}\\" dazu"}'])
  })
  it('ignoriert ein nicht geschlossenes Objekt am Ende', () => {
    expect(findBalancedJsonObjects('{"a":1} {"b":')).toEqual(['{"a":1}'])
  })
  it('deckelt bei limit', () => {
    expect(findBalancedJsonObjects('{}{}{}{}{}{}{}', 3)).toHaveLength(3)
  })
})

describe('parseLooseJsonObject — bisheriges Verhalten', () => {
  it('parst blankes JSON', () => {
    expect(parseLooseJsonObject('{"a":1}')).toEqual({ a: 1 })
  })
  it('entfernt Code-Fences', () => {
    expect(parseLooseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('entfernt <think>-Blöcke', () => {
    expect(parseLooseJsonObject('<think>überlege</think>{"a":1}')).toEqual({ a: 1 })
  })
  it('schneidet Vorrede und Nachrede weg', () => {
    expect(parseLooseJsonObject('Hier ist das Ergebnis: {"a":1} — passt das?')).toEqual({ a: 1 })
  })
  it('repariert Trailing-Commas', () => {
    expect(parseLooseJsonObject('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] })
  })
  it('gibt null zurück, wenn nichts parsebar ist', () => {
    expect(parseLooseJsonObject('völlig ohne JSON')).toBeNull()
    expect(parseLooseJsonObject('')).toBeNull()
  })
  it('weist Arrays und Skalare ab — erwartet wird ein Objekt', () => {
    expect(parseLooseJsonObject('[1,2,3]')).toBeNull()
    expect(parseLooseJsonObject('42')).toBeNull()
  })
})

describe('parseLooseJsonObject — doppelte Ausgabe', () => {
  // Echte Antwort von qwen3.8:27b-mlx, temperature 0.7, aus dem Sweep vom
  // 19.08.2026. Der alte Parser lieferte hier null → Mail nicht analysiert.
  const echteAntwort = `{
  "relevanceScore": 15,
  "sentiment": "neutral",
  "summary": "Ein Newsletter des Lehrmittel-Verlags.",
  "extractedInfo": [],
  "needsReply": false
}
</think>

{
  "relevanceScore": 15,
  "sentiment": "neutral",
  "summary": "Ein Newsletter des Lehrmittel-Verlags.",
  "extractedInfo": [],
  "needsReply": false
}`

  it('kommt mit doppelter Antwort und herrenlosem </think> zurecht', () => {
    const parsed = parseLooseJsonObject(echteAntwort)
    expect(parsed).not.toBeNull()
    expect(parsed).toMatchObject({ relevanceScore: 15, sentiment: 'neutral', needsReply: false })
  })

  it('nimmt bei doppelter Ausgabe das inhaltsvolle, nicht das leere Objekt', () => {
    expect(parseLooseJsonObject('{}\n{"relevanceScore":80}')).toEqual({ relevanceScore: 80 })
  })

  it('gibt ein leeres Objekt zurück, wenn es das einzige ist', () => {
    // Wichtig: {} ist ein bekanntes Fehlerbild (gemma auf langen Mails). Der
    // Aufrufer unterscheidet leeres Objekt von null und darf das nicht verlieren.
    expect(parseLooseJsonObject('{}')).toEqual({})
  })

  it('verkraftet ein einzelnes schließendes </think> ohne Öffner vor dem JSON', () => {
    expect(parseLooseJsonObject('denkt nach…</think>\n{"a":1}')).toEqual({ a: 1 })
  })
})
