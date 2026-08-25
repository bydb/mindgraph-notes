import { describe, expect, it } from 'vitest'
import { ollamaMessageToWire } from './chatClient'

describe('ollamaMessageToWire', () => {
  it('erhält Thinking zusammen mit dem Assistant-Tool-Aufruf', () => {
    expect(ollamaMessageToWire({
      role: 'assistant',
      content: '',
      thinking: 'flüchtiger Denkzustand',
      tool_calls: [{ id: 'tc-1', name: 'note_read', arguments: { path: 'Quelle.md' } }]
    })).toEqual({
      role: 'assistant',
      content: '',
      thinking: 'flüchtiger Denkzustand',
      tool_calls: [{ function: { name: 'note_read', arguments: { path: 'Quelle.md' } } }]
    })
  })

  it('schreibt ohne Thinking-Feld auch keines auf den Wire', () => {
    expect(ollamaMessageToWire({ role: 'assistant', content: 'fertig' })).toEqual({
      role: 'assistant',
      content: 'fertig'
    })
  })
})
