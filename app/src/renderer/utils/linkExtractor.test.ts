import { describe, it, expect } from 'vitest'
import { resolvePluginFileLink } from './linkExtractor'
import type { FileEntry } from '../../shared/types'

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
