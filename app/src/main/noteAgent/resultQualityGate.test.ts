import { describe, expect, it } from 'vitest'
import { createNoteAgentRegistry, type NoteAgentContext } from './skills'
import type { AgentRun } from './runRegistry'

const writeNote = createNoteAgentRegistry().get('write_note')!

function makeCtx(instruction: string): NoteAgentContext {
  const run = {
    abort: new AbortController(),
    sources: new Set<string>(),
    status: 'running',
    instruction
  } as unknown as AgentRun
  return { senderId: 1, run, allowedTools: new Set(['write_note']) }
}

describe('write_note — deterministisches Qualitätsgate', () => {
  it('weist stehengebliebene Platzhalter vor dem Staging zurück', async () => {
    const res = await writeNote.run({
      file_name: 'entscheidung.md',
      markdown: '# Entscheidung\n\n## Fazit\nNoch auszufüllen.'
    }, makeCtx('Erstelle eine fertige Entscheidungsvorlage.'))

    expect(res.ok).toBe(false)
    expect(res.content).toContain('Automatische Qualitätsprüfung')
    expect(res.content).toContain('Stehengebliebener Platzhalter')
  })

  it('setzt eine in der Nutzeranweisung geforderte Anzahl durch', async () => {
    const res = await writeNote.run({
      file_name: 'entscheidung.md',
      markdown: '# Entscheidung\n\n## Rückfrageentwürfe\n\n### Alpha\n**Betreff:** Lieferzeit'
    }, makeCtx('Erstelle drei konkrete Rückfragen als Entwurf.'))

    expect(res.ok).toBe(false)
    expect(res.content).toContain('3 Entwürfe gefordert, 1 erkannt')
  })

  it('lässt nur die Nutzeranweisung die Platzhalterprüfung abschalten', async () => {
    // Der Auftrag verlangt ein fertiges Ergebnis; ein Anhang kann daran nichts drehen,
    // weil die Prüfung ausschliesslich ctx.run.instruction liest.
    const res = await writeNote.run({
      file_name: 'entscheidung.md',
      markdown: '# Entscheidung\n\nNoch auszufüllen.'
    }, makeCtx('Erstelle ein fertiges Ergebnis.'))

    expect(res.ok).toBe(false)
    expect(res.content).toContain('Stehengebliebener Platzhalter')
  })
})
