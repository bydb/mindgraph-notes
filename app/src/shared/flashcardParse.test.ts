import { describe, expect, it } from 'vitest'
import { parseFlashcardReply } from './flashcardParse'

const card = { front: 'Wer trug die Steuerlast?', back: 'Der Dritte Stand', topic: 'Stände' }

describe('parseFlashcardReply', () => {
  it('Objekt mit cards (JSON-Modus der Cloud-Anbieter)', () => {
    expect(parseFlashcardReply(JSON.stringify({ cards: [card, card] }), 12)).toHaveLength(2)
  })
  it('nacktes Array, auch in Fences und mit Prosa', () => {
    expect(parseFlashcardReply('Hier:\n```json\n' + JSON.stringify([card]) + '\n```', 12)).toEqual([card])
    expect(parseFlashcardReply('Karten: ' + JSON.stringify([card]) + ' fertig', 12)).toEqual([card])
  })
  it('eine einzelne Karte als Objekt (real: LLMBase/deepseek im JSON-Modus)', () => {
    expect(parseFlashcardReply('{"front":"Wie viel Prozent?","back":"Über 95 %","topic":"Stände" }', 12)).toEqual([{ front: 'Wie viel Prozent?', back: 'Über 95 %', topic: 'Stände' }])
  })
  it('kappt, verwirft leere Karten, liefert bei Unsinn eine leere Liste', () => {
    expect(parseFlashcardReply(JSON.stringify({ cards: [card, card, card] }), 2)).toHaveLength(2)
    expect(parseFlashcardReply(JSON.stringify({ cards: [{ front: '', back: 'x' }, card] }), 12)).toEqual([card])
    expect(parseFlashcardReply('keine Karten heute', 12)).toEqual([])
  })
})
