// Die Notiz zeigt auf das Bild, das der Lauf WIRKLICH erzeugt hat.
//
// Nano Banana liefert JPEG; das Modell tauft sein Bild in der Notiz aber gern
// "titelbild.png". Ohne Korrektur wären Bild und Notiz je für sich in Ordnung —
// und das ![[…]] dazwischen tot.

import { describe, it, expect } from 'vitest'
import { repairImageEmbeds, type NoteAgentContext } from './skills'
import type { AgentRun, AgentResultEntry } from './runRegistry'

function ctxWithImages(...names: string[]): NoteAgentContext {
  const results = new Map<string, AgentResultEntry>()
  names.forEach((suggestedName, i) => {
    const kind = suggestedName.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
    results.set(`r${i}`, { suggestedName, kind } as unknown as AgentResultEntry)
  })
  return { senderId: 1, run: { results } as unknown as AgentRun }
}

describe('repairImageEmbeds', () => {
  it('zieht die Endung auf den tatsächlich erzeugten Dateinamen nach', () => {
    const md = 'Text\n\n![[Titelbild.png]]\n\nMehr Text'
    expect(repairImageEmbeds(md, ctxWithImages('Titelbild.jpg')))
      .toBe('Text\n\n![[Titelbild.jpg]]\n\nMehr Text')
  })

  it('behält Größen- und Anker-Zusätze hinter dem Dateinamen', () => {
    expect(repairImageEmbeds('![[Titelbild.png|400]]', ctxWithImages('Titelbild.jpg')))
      .toBe('![[Titelbild.jpg|400]]')
  })

  it('rührt Einbettungen ohne passendes Ergebnis nicht an', () => {
    const md = '![[Fremdes Bild.png]]'
    expect(repairImageEmbeds(md, ctxWithImages('Titelbild.jpg'))).toBe(md)
    expect(repairImageEmbeds(md, ctxWithImages())).toBe(md)
  })

  it('lässt eine bereits korrekte Einbettung unverändert', () => {
    expect(repairImageEmbeds('![[Titelbild.jpg]]', ctxWithImages('Titelbild.jpg')))
      .toBe('![[Titelbild.jpg]]')
  })

  it('greift auch bei abweichender Groß-/Kleinschreibung', () => {
    expect(repairImageEmbeds('![[titelbild.PNG]]', ctxWithImages('Titelbild.jpg')))
      .toBe('![[Titelbild.jpg]]')
  })

  it('fasst normale Wikilinks und Nicht-Bild-Ergebnisse nicht an', () => {
    const md = '[[Titelbild.png]] und ![[Tabelle.xlsx]]'
    expect(repairImageEmbeds(md, ctxWithImages('Titelbild.jpg'))).toBe(md)
  })

  // Die Schreibweise aus dem echten Lauf vom 11.08.2026 (qwen3.6).
  it('korrigiert auch das Markdown-Bild ![alt](datei.png)', () => {
    expect(repairImageEmbeds('![Der Wasserkreislauf](wasserkreislauf_cover.png)', ctxWithImages('wasserkreislauf_cover.jpg')))
      .toBe('![Der Wasserkreislauf](wasserkreislauf_cover.jpg)')
  })

  it('lässt einen Markdown-Link auf ein fremdes Bild in Ruhe', () => {
    const md = '![Foto](urlaub.png)'
    expect(repairImageEmbeds(md, ctxWithImages('Titelbild.jpg'))).toBe(md)
  })
})
