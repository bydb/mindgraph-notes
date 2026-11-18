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

describe('write_excalidraw: Diagrammart-Weiche (Mindmap, Matrix, Begriffsnetz)', () => {
  const tool = registry.get('write_excalidraw')!
  const ctx = (): NoteAgentContext => makeCtx(['write_excalidraw'])

  it('unbekannte Art wird mit den erlaubten Werten abgelehnt', async () => {
    const res = await tool.run({ file_name: 'x.excalidraw', diagram: 'venn' }, ctx())
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/"mindmap", "matrix" und "begriffsnetz"/)
  })

  it('ohne Angabe bleibt es die Mindmap (alte Aufrufe ohne diagram)', async () => {
    const res = await tool.run({ file_name: 'x.excalidraw', title: 'Thema' }, ctx())
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/"branches" fehlt/)
  })

  it('Matrix: fehlende Felder und falsche Feldzahl werden benannt', async () => {
    expect((await tool.run({ file_name: 'm.excalidraw', diagram: 'matrix' }, ctx())).content).toMatch(/"quadrants" fehlt/)
    const res = await tool.run({ file_name: 'm.excalidraw', diagram: 'matrix', quadrants: JSON.stringify([{ title: 'A' }, { title: 'B' }]) }, ctx())
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/Vier-Felder-Matrix wurde nicht erzeugt: 2 Felder — eine Vier-Felder-Matrix hat genau 4/)
    expect(res.content).toMatch(/diagram: "matrix"/)
  })

  it('Matrix: unlesbare oder falsch getypte Achse wird abgelehnt, nicht still weggelassen (F02)', async () => {
    const quadrants = [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }]
    const asText = await tool.run({ file_name: 'm.excalidraw', diagram: 'matrix', quadrants, x_axis: 'Dringlichkeit' }, ctx())
    expect(asText.ok).toBe(false)
    expect(asText.content).toMatch(/"x_axis" ist kein gültiges JSON/)
    const broken = await tool.run({ file_name: 'm.excalidraw', diagram: 'matrix', quadrants, y_axis: '{"label":"Wichtigkeit"' }, ctx())
    expect(broken.ok).toBe(false)
    expect(broken.content).toMatch(/"y_axis"/)
    const wrongType = await tool.run({ file_name: 'm.excalidraw', diagram: 'matrix', quadrants, x_axis: ['Dringlichkeit'] }, ctx())
    expect(wrongType.ok).toBe(false)
    expect(wrongType.content).toMatch(/"x_axis" muss ein Objekt mit label, low und high sein/)
  })

  it('Begriffsnetz: Listen als JSON-Text werden gelesen, Fehler nennen die Art', async () => {
    const res = await tool.run({
      file_name: 'b.excalidraw', diagram: 'begriffsnetz',
      concepts: JSON.stringify([{ text: 'A' }, { text: 'B' }, { text: 'C' }]),
      relations: JSON.stringify([{ from: 'A', to: 'B', label: 'r' }, { from: 'B', to: 'A', label: 's' }])
    }, ctx())
    expect(res.ok).toBe(false)
    expect(res.content).toMatch(/Das Begriffsnetz wurde nicht erzeugt: Begriff „C" hat keine Beziehung/)
    expect((await tool.run({ file_name: 'b.excalidraw', diagram: 'begriffsnetz', concepts: [{ text: 'A' }] }, ctx())).content).toMatch(/"relations" fehlt/)
  })
})
