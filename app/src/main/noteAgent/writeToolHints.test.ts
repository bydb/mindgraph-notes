// Regression 30.07.2026 — die Fehler-Schleife im Notiz-Agenten.
//
// Ablauf des realen Fehlers (kimi-k3 über OpenRouter, Web-Lauf mit dem Skill
// „Wissenschaftliche Webseite"): write_html war im Web-Lauf gesperrt, der Skill verlangte
// es trotzdem. Das Modell rief write_note mit `seite.html` auf und bekam die Ablehnung
// „benutze write_html" — ein Werkzeug, das dieser Lauf gar nicht hatte. Es wiederholte
// exakt denselben Aufruf, bis ein Netzabbruch den Lauf beendete.
//
// Dauerhafte Regel: eine Ablehnung darf NUR auf Werkzeuge verweisen, die der Lauf besitzt.

import { describe, it, expect } from 'vitest'
import { createNoteAgentRegistry, type NoteAgentContext } from './skills'
import type { AgentRun } from './runRegistry'

const registry = createNoteAgentRegistry()
const writeNote = registry.get('write_note')!

function makeCtx(allowedTools?: string[]): NoteAgentContext {
  const run = {
    abort: new AbortController(),
    sources: new Set<string>(),
    status: 'running'
  } as unknown as AgentRun
  return { senderId: 1, run, allowedTools: allowedTools ? new Set(allowedTools) : undefined }
}

describe('write_note lehnt .html modus-bewusst ab', () => {
  it('mit verfügbarem write_html verweist die Meldung auf write_html', async () => {
    const res = await writeNote.run(
      { file_name: 'seite.html', markdown: '<p>x</p>' },
      makeCtx(['write_note', 'write_html'])
    )
    expect(res.ok).toBe(false)
    expect(res.content).toContain('write_html')
  })

  it('OHNE write_html verweist die Meldung auf .md — nie auf ein fehlendes Werkzeug', async () => {
    const res = await writeNote.run(
      { file_name: 'seite.html', markdown: '<p>x</p>' },
      makeCtx(['write_note'])
    )
    expect(res.ok).toBe(false)
    expect(res.content).not.toContain('write_html')
    expect(res.content).toContain('.md')
  })

  it('.htm zählt genauso', async () => {
    const res = await writeNote.run({ file_name: 'seite.htm', markdown: 'x' }, makeCtx(['write_note']))
    expect(res.ok).toBe(false)
    expect(res.content).not.toContain('write_html')
  })
})
