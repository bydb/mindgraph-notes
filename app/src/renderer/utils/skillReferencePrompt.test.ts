import { describe, it, expect } from 'vitest'
import { skillReferencePromptCandidates, type PromptRun } from './skillReferencePrompt'

const A = { id: 'sk-00000000000000a1', label: 'Präsentation nach Vorlage' }
const B = { id: 'sk-00000000000000b2', label: 'Brief' }

function run(over: Partial<PromptRun> = {}): PromptRun {
  return { phase: 'review', results: [{ state: 'accepted' }], skills: [A], ...over }
}

describe('skillReferencePromptCandidates', () => {
  it('fragt nach einem übernommenen Skill-Lauf ohne Referenz', () => {
    expect(skillReferencePromptCandidates(run(), {}, [])).toEqual([A])
  })

  it('fragt nicht, solange noch eine Karte offen ist', () => {
    expect(skillReferencePromptCandidates(run({ results: [{ state: 'accepted' }, { state: 'pending' }] }), {}, [])).toEqual([])
  })

  it('fragt nicht nach einem komplett verworfenen Lauf', () => {
    expect(skillReferencePromptCandidates(run({ results: [{ state: 'discarded' }] }), {}, [])).toEqual([])
  })

  it('fragt nicht ohne Skill, im Lauf oder ohne Ergebnis', () => {
    expect(skillReferencePromptCandidates(run({ skills: [] }), {}, [])).toEqual([])
    expect(skillReferencePromptCandidates(run({ phase: 'running' }), {}, [])).toEqual([])
    expect(skillReferencePromptCandidates(run({ results: [] }), {}, [])).toEqual([])
  })

  it('fragt nicht, wenn schon ein Skill des Laufs eine Referenz hat', () => {
    expect(skillReferencePromptCandidates(run({ skills: [A, B] }), { [B.id]: { minutes: 30, label: 'Brief' } }, [])).toEqual([])
  })

  it('lässt „nicht mehr fragen"-Skills weg', () => {
    expect(skillReferencePromptCandidates(run({ skills: [A, B] }), {}, [A.id])).toEqual([B])
    expect(skillReferencePromptCandidates(run(), {}, [A.id])).toEqual([])
  })
})
