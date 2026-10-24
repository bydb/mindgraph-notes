import { describe, it, expect } from 'vitest'
import { asksAboutOldWebSources, chatHistoryForModel, completedTurns, webTopicQuestions, type HistoryMessage, type WebTopicMessage } from './chatHistory'

const VAULT_TEXT = 'Vertraulicher Notizinhalt aus dem Vault'

describe('Verlauf für das Modell (Privacy, F22/F38)', () => {
  it('Webwechsel des Petrol-Chats fehlen samt Frage im Verlauf (Websuche F09)', () => {
    const msgs: HistoryMessage[] = [
      { role: 'user', content: 'Wie hoch ist der Beitrag?', origin: 'web' },
      { role: 'assistant', content: 'Laut Seite 18 Euro [1].', origin: 'web' },
      { role: 'user', content: 'Was stand in Quelle 1?' }
    ]
    const history = chatHistoryForModel(completedTurns(msgs))
    expect(history).toEqual([{ role: 'user', content: 'Was stand in Quelle 1?' }])
    expect(JSON.stringify(history)).not.toContain('[1]')
  })

  it('Vault-Frage und Vault-Antwort fehlen im Verlauf, auch nach einem Anbieterwechsel', () => {
    const msgs: HistoryMessage[] = [
      { role: 'user', content: 'Hallo' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Was steht zur Synchronisation?', origin: 'vault-rag' },
      { role: 'assistant', content: `${VAULT_TEXT} [1]`, origin: 'vault-rag' },
      { role: 'user', content: 'Und nun eine normale Frage' }
    ]
    // Der Anbieter ist für den Verlauf irrelevant — dieselbe Funktion liefert für Cloud und lokal.
    const history = chatHistoryForModel(msgs)
    expect(history).toEqual([
      { role: 'user', content: 'Hallo' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Und nun eine normale Frage' }
    ])
    expect(JSON.stringify(history)).not.toContain(VAULT_TEXT)
    expect(JSON.stringify(history)).not.toContain('Synchronisation')
  })

  it('Begrenzung auf die letzten Nachrichten greift NACH dem Ausschluss', () => {
    const msgs: HistoryMessage[] = []
    for (let i = 0; i < 12; i++) msgs.push({ role: 'user', content: `n${i}` })
    for (let i = 0; i < 12; i++) msgs.push({ role: 'assistant', content: `v${i}`, origin: 'vault-rag' })
    const history = chatHistoryForModel(msgs, 10)
    expect(history).toHaveLength(10)
    expect(history.every((m) => m.content.startsWith('n'))).toBe(true)
  })

  it('gibt nur Rolle und Inhalt weiter, keine Zitate oder Vault-Pfade', () => {
    const msgs = [{ role: 'assistant' as const, content: 'x', vaultPath: '/v', citations: { hits: [] } }]
    expect(Object.keys(chatHistoryForModel(msgs)[0])).toEqual(['role', 'content'])
  })
})

describe('completedTurns (Petrol-Chat, Codex F27)', () => {
  it('lässt abgebrochene Antworten samt Frage weg', () => {
    const msgs = [
      { role: 'user' as const, content: 'Frage 1' },
      { role: 'assistant' as const, content: 'Antwort 1' },
      { role: 'user' as const, content: 'Lange Geschichte' },
      { role: 'assistant' as const, content: 'Es war einm', stopped: true },
      { role: 'user' as const, content: 'Frage 3' }
    ]
    expect(completedTurns(msgs).map(m => m.content)).toEqual(['Frage 1', 'Antwort 1', 'Frage 3'])
  })
  it('lässt Fehler samt Frage weg', () => {
    const msgs = [
      { role: 'user' as const, content: 'Frage 1' },
      { role: 'assistant' as const, content: 'Ollama nicht erreichbar', error: true }
    ]
    expect(completedTurns(msgs)).toEqual([])
  })
  it('lässt eine vor dem ersten Wort gestoppte Frage weg (F31)', () => {
    const msgs = [
      { role: 'user' as const, content: 'Frage 1' },
      { role: 'assistant' as const, content: 'Antwort 1' },
      { role: 'user' as const, content: 'Gestoppt', stopped: true }
    ]
    expect(completedTurns(msgs).map(m => m.content)).toEqual(['Frage 1', 'Antwort 1'])
  })
  it('behält normale Wechsel unverändert', () => {
    const msgs = [
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'b' }
    ]
    expect(completedTurns(msgs)).toEqual(msgs)
  })
})

describe('Thema früherer Webfragen (chat-webthema-im-verlauf, Weg 1)', () => {
  const ok = { kind: 'answer', report: { usedSources: [1] } }
  it('nimmt nur Fragen erfolgreicher Webwechsel, nie Antworten', () => {
    const msgs: WebTopicMessage[] = [
      { role: 'user', content: 'Rutherford 8. Klasse', origin: 'web' },
      { role: 'assistant', content: 'Antwort [1]', origin: 'web', web: ok },
      { role: 'user', content: 'Nichts gefunden?', origin: 'web' },
      { role: 'assistant', content: '', origin: 'web', web: { kind: 'nothing-readable' } },
      { role: 'user', content: 'gestoppt', origin: 'web', stopped: true },
      { role: 'user', content: 'Fehler', origin: 'web' },
      { role: 'assistant', content: 'x', origin: 'web', error: true },
      { role: 'user', content: 'Frag mich ab' }
    ]
    expect(webTopicQuestions(msgs)).toEqual([{ text: 'Rutherford 8. Klasse', clipped: false }])
  })

  it('höchstens drei, die neuesten, mit Kürzungsmarke', () => {
    const msgs: WebTopicMessage[] = []
    for (let i = 0; i < 5; i++) {
      msgs.push({ role: 'user', content: `F${i} ${'x'.repeat(i === 4 ? 600 : 3)}`, origin: 'web' })
      msgs.push({ role: 'assistant', content: 'a', origin: 'web', web: ok })
    }
    const t = webTopicQuestions(msgs)
    expect(t.map((x) => x.text.slice(0, 2))).toEqual(['F2', 'F3', 'F4'])
    expect(t[2]).toMatchObject({ clipped: true })
    expect(t[2].text.length).toBe(500)
  })

  it('erkennt Fragen nach alten Quellen', () => {
    expect(asksAboutOldWebSources('Was stand in Quelle 1?')).toBe(true)
    expect(asksAboutOldWebSources('Erklär mir [3] genauer')).toBe(true)
    expect(asksAboutOldWebSources('Was stand auf der Seite?')).toBe(true)
    expect(asksAboutOldWebSources('Wie war das in deiner letzten Antwort?')).toBe(true)
    expect(asksAboutOldWebSources('Frag mich mal ab')).toBe(false)
    expect(asksAboutOldWebSources('Welche Quellen gibt es zum Thema allgemein?')).toBe(false)
  })
})
