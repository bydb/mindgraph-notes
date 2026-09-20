import { describe, it, expect } from 'vitest'
import { resolvePluginFileLink, findNoteForWikilink, straightenQuotes } from './linkExtractor'
import type { FileEntry, Note } from '../../shared/types'

const excalidrawClaim = { pluginId: 'mindgraph-excalidraw', editorId: 'excalidraw' }

const tree: FileEntry[] = [
  { name: 'Notiz.md', path: 'Notiz.md', isDirectory: false, fileType: 'markdown' },
  { name: 'skizze.excalidraw', path: 'skizze.excalidraw', isDirectory: false, fileType: 'plugin', pluginEditor: excalidrawClaim },
  {
    name: 'Projekte',
    path: 'Projekte',
    isDirectory: true,
    children: [
      { name: 'plan.excalidraw', path: 'Projekte/plan.excalidraw', isDirectory: false, fileType: 'plugin', pluginEditor: excalidrawClaim },
      { name: 'skizze.excalidraw', path: 'Projekte/skizze.excalidraw', isDirectory: false, fileType: 'plugin', pluginEditor: excalidrawClaim },
    ],
  },
]

describe('resolvePluginFileLink', () => {
  it('findet Plugin-Datei per Dateiname (case-insensitive)', () => {
    expect(resolvePluginFileLink('Skizze.Excalidraw', tree)?.path).toBe('skizze.excalidraw')
  })

  it('findet Plugin-Datei in Unterordnern', () => {
    expect(resolvePluginFileLink('plan.excalidraw', tree)?.path).toBe('Projekte/plan.excalidraw')
  })

  it('voller Pfad-Match schlägt Namens-Match bei Duplikaten', () => {
    expect(resolvePluginFileLink('Projekte/skizze.excalidraw', tree)?.path).toBe('Projekte/skizze.excalidraw')
  })

  it('ohne Endung kein Treffer — [[skizze]] bleibt Notiz-Semantik', () => {
    expect(resolvePluginFileLink('skizze', tree)).toBeNull()
  })

  it('ignoriert Nicht-Plugin-Dateien und leere Links', () => {
    expect(resolvePluginFileLink('Notiz.md', tree)).toBeNull()
    expect(resolvePluginFileLink('  ', tree)).toBeNull()
  })
})

describe('Wikilink mit typografischem Apostroph (Lesen-Modus nach Typograph)', () => {
  it('findet die Notiz, obwohl der Link „You’ll“ statt „You\'ll“ trägt', () => {
    const note = { id: 'w', title: 'Want to Remember', path: "500 - Readwise/Articles/Want to Remember Everything You'll Ever Learn.md", content: '' } as unknown as Note
    expect(findNoteForWikilink("500 - Readwise/Articles/Want to Remember Everything You’ll Ever Learn", [note])?.id).toBe('w')
    expect(straightenQuotes('„Zitat“ ‚a‘')).toBe('"Zitat" \'a\'')
  })
})
