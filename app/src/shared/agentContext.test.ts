import { describe, expect, it } from 'vitest'
import {
  AGENT_CONTEXT_DEFAULT, agentContextNote, availableAgentContextSteps, chooseAgentContext, normalizeAgentContextSetting
} from './agentContext'

describe('normalizeAgentContextSetting', () => {
  it('macht aus Unbrauchbarem den Standard', () => {
    for (const v of [undefined, null, 'viel', NaN, 0, -5, 1000, 32_768]) {
      expect(normalizeAgentContextSetting(v)).toBe(AGENT_CONTEXT_DEFAULT)
    }
  })
  it('rastet nach unten auf eine Stufe ein', () => {
    expect(normalizeAgentContextSetting(65_536)).toBe(65_536)
    expect(normalizeAgentContextSetting(70_000)).toBe(65_536)
    expect(normalizeAgentContextSetting(9_999_999)).toBe(262_144)
  })
})

describe('availableAgentContextSteps', () => {
  it('bietet ohne bekanntes Maximum nur den Standard', () => {
    expect(availableAgentContextSteps(null)).toEqual([32_768])
    expect(availableAgentContextSteps(undefined)).toEqual([32_768])
  })
  it('endet beim Maximum des Modells', () => {
    expect(availableAgentContextSteps(131_072)).toEqual([32_768, 49_152, 65_536, 98_304, 131_072])
    expect(availableAgentContextSteps(40_000)).toEqual([32_768])
    expect(availableAgentContextSteps(8_192)).toEqual([32_768])
  })
})

describe('chooseAgentContext', () => {
  it('lässt den Standard unangetastet', () => {
    expect(chooseAgentContext(32_768, 262_144)).toEqual({ reason: 'default', wanted: 32_768 })
    expect(chooseAgentContext(undefined, null)).toEqual({ reason: 'default', wanted: 32_768 })
  })
  it('übernimmt den eingestellten Wert, wenn das Modell ihn kann', () => {
    expect(chooseAgentContext(98_304, 262_144)).toEqual({ numCtx: 98_304, reason: 'setting', wanted: 98_304 })
    expect(chooseAgentContext(131_072, 131_072).numCtx).toBe(131_072)
  })
  it('begrenzt auf das Modell', () => {
    expect(chooseAgentContext(262_144, 131_072)).toEqual({ numCtx: 131_072, reason: 'model-max', wanted: 262_144 })
    expect(chooseAgentContext(65_536, 40_000)).toEqual({ reason: 'model-max', wanted: 65_536 })
  })
  it('bleibt ohne bekanntes Maximum beim Standard', () => {
    expect(chooseAgentContext(65_536, null)).toEqual({ reason: 'unknown-max', wanted: 65_536 })
  })
})

describe('agentContextNote', () => {
  it('schweigt beim Standard und nennt sonst die Zahl', () => {
    expect(agentContextNote(chooseAgentContext(32_768, 262_144), 262_144)).toBeNull()
    expect(agentContextNote(chooseAgentContext(65_536, 262_144), 262_144)).toContain('65.536')
    expect(agentContextNote(chooseAgentContext(262_144, 131_072), 131_072)).toContain('131.072')
    expect(agentContextNote(chooseAgentContext(65_536, null), null)).toContain('Standard')
  })
})
