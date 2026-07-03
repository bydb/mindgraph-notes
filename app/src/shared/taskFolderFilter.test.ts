import { describe, it, expect } from 'vitest'
import { isTaskPathExcluded, isTaskFolderExcluded, toggleTaskFolder } from './taskFolderFilter'

const PROJEKTE = '100 - Projekte'
const MINDGRAPH = '100 - Projekte/110 - MindGraph'
const NOTE_IN_MINDGRAPH = '100 - Projekte/110 - MindGraph/Aufgaben.md'
const NOTE_IN_PROJEKTE = '100 - Projekte/Übersicht.md'
const NOTE_WOANDERS = '200 - Bereich/Notiz.md'

describe('isTaskPathExcluded', () => {
  it('ohne Listen ist nichts ausgeschlossen', () => {
    expect(isTaskPathExcluded(NOTE_IN_MINDGRAPH, [], [])).toBe(false)
  })

  it('ausgeschlossener Ordner erfasst den ganzen Teilbaum', () => {
    expect(isTaskPathExcluded(NOTE_IN_PROJEKTE, [PROJEKTE], [])).toBe(true)
    expect(isTaskPathExcluded(NOTE_IN_MINDGRAPH, [PROJEKTE], [])).toBe(true)
    expect(isTaskPathExcluded(NOTE_WOANDERS, [PROJEKTE], [])).toBe(false)
  })

  it('kein Präfix-Falsch-Match auf ähnliche Ordnernamen', () => {
    expect(isTaskPathExcluded('100 - Projekte-Archiv/x.md', [PROJEKTE], [])).toBe(false)
  })

  it('Include-Override unterhalb eines ausgeschlossenen Ordners gewinnt (tiefster Treffer)', () => {
    expect(isTaskPathExcluded(NOTE_IN_MINDGRAPH, [PROJEKTE], [MINDGRAPH])).toBe(false)
    expect(isTaskPathExcluded(NOTE_IN_PROJEKTE, [PROJEKTE], [MINDGRAPH])).toBe(true)
  })

  it('Exclude unterhalb eines Include-Overrides gewinnt wieder', () => {
    const tiefer = '100 - Projekte/110 - MindGraph/Archiv'
    expect(isTaskPathExcluded(`${tiefer}/alt.md`, [PROJEKTE, tiefer], [MINDGRAPH])).toBe(true)
    expect(isTaskPathExcluded(NOTE_IN_MINDGRAPH, [PROJEKTE, tiefer], [MINDGRAPH])).toBe(false)
  })
})

describe('isTaskFolderExcluded', () => {
  it('exakt gelisteter Ordner ist ausgeschlossen', () => {
    expect(isTaskFolderExcluded(PROJEKTE, [PROJEKTE], [])).toBe(true)
  })

  it('Unterordner erbt den Ausschluss des Elternordners', () => {
    expect(isTaskFolderExcluded(MINDGRAPH, [PROJEKTE], [])).toBe(true)
  })

  it('Include-Override macht den Unterordner effektiv eingeschlossen', () => {
    expect(isTaskFolderExcluded(MINDGRAPH, [PROJEKTE], [MINDGRAPH])).toBe(false)
    expect(isTaskFolderExcluded(PROJEKTE, [PROJEKTE], [MINDGRAPH])).toBe(true)
  })
})

describe('toggleTaskFolder', () => {
  it('schließt einen bisher eingeschlossenen Ordner aus', () => {
    const r = toggleTaskFolder(PROJEKTE, [], [])
    expect(r.excluded).toEqual([PROJEKTE])
    expect(r.included).toEqual([])
  })

  it('nimmt einen exakt ausgeschlossenen Ordner wieder auf (Eintrag entfernt, kein Override)', () => {
    const r = toggleTaskFolder(PROJEKTE, [PROJEKTE], [])
    expect(r.excluded).toEqual([])
    expect(r.included).toEqual([])
  })

  it('via Eltern ausgeschlossener Unterordner bekommt einen Include-Override (der Bugfall)', () => {
    const r = toggleTaskFolder(MINDGRAPH, [PROJEKTE], [])
    expect(r.excluded).toEqual([PROJEKTE])
    expect(r.included).toEqual([MINDGRAPH])
    expect(isTaskPathExcluded(NOTE_IN_MINDGRAPH, r.excluded, r.included)).toBe(false)
  })

  it('erneuter Toggle des Unterordners entfernt den Override — wieder via Eltern ausgeschlossen', () => {
    const r = toggleTaskFolder(MINDGRAPH, [PROJEKTE], [MINDGRAPH])
    expect(r.excluded).toEqual([PROJEKTE])
    expect(r.included).toEqual([])
  })

  it('Toggle des Elternordners räumt alle Einträge im Teilbaum auf', () => {
    const tiefer = '100 - Projekte/110 - MindGraph/Archiv'
    const r = toggleTaskFolder(PROJEKTE, [PROJEKTE, tiefer], [MINDGRAPH])
    expect(r.excluded).toEqual([])
    expect(r.included).toEqual([])
  })

  it('räumt Altlasten aus dem bisherigen Doppelklick-Bug auf (Ordner fälschlich in excluded)', () => {
    // Vorher: „Aufnehmen"-Klick fügte den Unterordner zur Ausschlussliste hinzu.
    // Ein Toggle mit der neuen Logik entfernt den Müll-Eintrag und setzt den Override korrekt.
    const r = toggleTaskFolder(MINDGRAPH, [PROJEKTE, MINDGRAPH], [])
    expect(r.excluded).toEqual([PROJEKTE])
    expect(r.included).toEqual([MINDGRAPH])
  })
})
