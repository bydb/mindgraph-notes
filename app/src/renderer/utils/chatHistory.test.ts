import { describe, it, expect } from 'vitest'
import { chatHistoryForModel, type HistoryMessage } from './chatHistory'

const VAULT_TEXT = 'Vertraulicher Notizinhalt aus dem Vault'

describe('Verlauf für das Modell (Privacy, F22/F38)', () => {
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
