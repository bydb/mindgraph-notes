import { describe, it, expect } from 'vitest'
import { normalizeWorkFocus, shouldOpenAgentOnStart, isStartDecisionDue, agentDefaultModel } from './workFocus'

describe('normalizeWorkFocus', () => {
  it('lässt gültige Werte durch', () => {
    expect(normalizeWorkFocus('agent')).toBe('agent')
    expect(normalizeWorkFocus('notes')).toBe('notes')
  })
  it('fällt bei fehlendem, altem oder fremdem Wert auf notes zurück', () => {
    for (const raw of [undefined, null, '', 'office', 'learning', 'Agent', 1, {}, ['agent']]) {
      expect(normalizeWorkFocus(raw)).toBe('notes')
    }
  })
})

describe('Startentscheidung', () => {
  it('springt nur bei agent nach erfolgreichem Startladen', () => {
    expect(shouldOpenAgentOnStart('agent', 'ready')).toBe(true)
    expect(shouldOpenAgentOnStart('notes', 'ready')).toBe(false)
    for (const load of ['pending', 'none', 'failed'] as const) {
      expect(shouldOpenAgentOnStart('agent', load)).toBe(false)
    }
  })
  it('gilt als gefallen, sobald das Startladen nicht mehr aussteht', () => {
    expect(isStartDecisionDue('pending')).toBe(false)
    expect(isStartDecisionDue('ready')).toBe(true)
    expect(isStartDecisionDue('none')).toBe(true)
    expect(isStartDecisionDue('failed')).toBe(true)
  })
})

describe('agentDefaultModel', () => {
  it('nimmt den Modul-Override vor dem globalen Modell', () => {
    expect(agentDefaultModel({ selectedModel: 'a', moduleModelOverrides: { 'note-agent': 'b' } })).toBe('b')
  })
  it('fällt auf das globale Modell zurück', () => {
    expect(agentDefaultModel({ selectedModel: 'a', moduleModelOverrides: { brain: 'x' } })).toBe('a')
    expect(agentDefaultModel({ selectedModel: 'a', moduleModelOverrides: { 'note-agent': '' } })).toBe('a')
  })
  it('liefert leer, wenn nichts gewählt ist', () => {
    expect(agentDefaultModel({ selectedModel: '' })).toBe('')
    expect(agentDefaultModel({ selectedModel: '   ' })).toBe('')
    expect(agentDefaultModel({})).toBe('')
  })
})
