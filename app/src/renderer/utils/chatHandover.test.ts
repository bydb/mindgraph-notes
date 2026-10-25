import { describe, it, expect } from 'vitest'
import { buildChatHandover, formatHandoverTranscript, type HandoverMessage } from './chatHandover'

const u = (content: string, extra: Partial<HandoverMessage> = {}): HandoverMessage => ({ role: 'user', content, ...extra })
const a = (content: string, extra: Partial<HandoverMessage> = {}): HandoverMessage => ({ role: 'assistant', content, ...extra })

const labels = {
  user: 'Nutzer', petrol: 'Petrol', webAnswer: '(Webantwort nicht übernommen)', omitted: '(ausgelassen)',
  clippedMark: '(gekürzt)', topicOnly: '(zum Webthema, ohne Quellen)', dropped: (n: number) => `(${n} frühere Wechsel ausgelassen)`
}

describe('Übergabe Chat → Auftrag mit ganzem Gespräch', () => {
  // Der reale Fall vom 25.10.2026: „aus den beiden Infos“ braucht die beiden früheren Wechsel.
  it('nimmt alle Wechsel bis zur gewählten Antwort mit, Ziel ist deren Frage', () => {
    const m = [u('Wie hoch ist der Eiffelturm'), a('330 m'), u('Höchstes Gebäude in New York?'), a('One WTC'), u('Baue aus den beiden Infos eine Tabelle'), a('| … |'), u('Danke'), a('Gern')]
    const h = buildChatHandover(m, 5)
    expect(h.goal).toBe('Baue aus den beiden Infos eine Tabelle')
    expect(h.turns.map(t => t.question)).toEqual(['Wie hoch ist der Eiffelturm', 'Höchstes Gebäude in New York?', 'Baue aus den beiden Infos eine Tabelle'])
    expect(h.turns[0].answer).toBe('330 m')
    expect(h.clipped).toBe(false)
    const text = formatHandoverTranscript(h, labels)
    expect(text).toContain('Nutzer: Wie hoch ist der Eiffelturm\n\nPetrol: 330 m')
    expect(text).not.toContain('Danke')
  })

  it('Webantworten gehen nie mit, nur die Frage (Codex F03)', () => {
    const m = [u('Leitzins aktuell?', { origin: 'web' }), a('2,0 % [1]', { origin: 'web' }), u('Erkläre den Begriff'), a('Der Leitzins ist …')]
    const h = buildChatHandover(m, 3)
    expect(h.turns[0]).toEqual({ question: 'Leitzins aktuell?', answer: null, answerNote: 'web' })
    expect(formatHandoverTranscript(h, labels)).not.toContain('[1]')
    expect(h.webTurns).toBe(1)
  })

  it('Antwort zu einem früheren Webthema behält ihren Herkunftshinweis (Codex F08)', () => {
    const m = [u('Leitzins?', { origin: 'web' }), a('2 % [1]', { origin: 'web' }), u('Und was heißt das?'), a('Er bestimmt …', { webTopicsUsed: 1 })]
    const h = buildChatHandover(m, 3)
    expect(h.turns[1].topicOnly).toBe(true)
    expect(formatHandoverTranscript(h, labels)).toContain('Petrol (zum Webthema, ohne Quellen): Er bestimmt')
  })

  it('abgebrochene, fehlerhafte und App-Antworten fallen weg; Frage ohne Antwort verschiebt nichts', () => {
    const m = [u('A'), a('halb', { stopped: true }), u('B', { stopped: true }), u('C'), a('Fehler', { error: true }), u('D'), a('alt', { appNote: 'old-web-source' }), u('E'), a('ok')]
    const h = buildChatHandover(m, 8)
    expect(h.turns.map(t => t.question)).toEqual(['E'])
  })

  it('kürzt zuerst ältere Antworten, die letzte bleibt', () => {
    const long = 'x'.repeat(1400)
    const m = [u('q1'), a(long), u('q2'), a(long), u('q3'), a('letzte')]
    const h = buildChatHandover(m, 5, 1600)
    expect(h.turns[0].answerNote).toBe('omitted')
    expect(h.turns[2].answer).toBe('letzte')
    expect(h.turns.map(t => t.question)).toEqual(['q1', 'q2', 'q3'])
    expect(h.clipped).toBe(true)
  })

  it('lässt älteste Wechsel ganz weg, wenn auch Fragen nicht mehr passen, und zählt sie', () => {
    const q = (n: number) => `${n} ${'q'.repeat(500)}`
    const m = [u(q(1)), a('a'), u(q(2)), a('a'), u(q(3)), a('a'), u(q(4)), a('Antwort')]
    const h = buildChatHandover(m, 7, 1200)
    expect(h.droppedTurns).toBeGreaterThan(0)
    expect(h.turns[h.turns.length - 1].answer).toBe('Antwort')
    expect(formatHandoverTranscript(h, labels)).toMatch(/^\(\d frühere Wechsel ausgelassen\)/)
  })

  it('kappt die letzte Antwort bei 6000 Zeichen und markiert das', () => {
    const h = buildChatHandover([u('q'), a('y'.repeat(7000))], 1, 20000)
    expect(h.turns[0].answerClipped).toBe(true)
    expect(h.turns[0].answer!.length).toBeLessThan(6100)
    expect(formatHandoverTranscript(h, labels)).toContain('(gekürzt)')
  })
})
