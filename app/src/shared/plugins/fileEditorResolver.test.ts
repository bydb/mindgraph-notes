import { describe, it, expect } from 'vitest'
import {
  normalizeExtension,
  extensionCandidates,
  resolveFileEditors,
  lookupFileEditor,
  WELL_KNOWN_CORE_EXTENSIONS,
  type PluginFileEditors,
} from './fileEditorResolver'

describe('normalizeExtension', () => {
  it('erzwingt genau einen führenden Punkt + lowercase + NFC', () => {
    expect(normalizeExtension('excalidraw')).toBe('.excalidraw')
    expect(normalizeExtension('.EXCALIDRAW')).toBe('.excalidraw')
    expect(normalizeExtension('...Foo')).toBe('.foo')
  })

  it('erhält innere Punkte (Mehrfachendung)', () => {
    expect(normalizeExtension('.pdf.md')).toBe('.pdf.md')
    expect(normalizeExtension('tar.gz')).toBe('.tar.gz')
  })

  it('lehnt Ungültiges ab (leer, nur Punkte, Whitespace, Pfadtrenner)', () => {
    expect(normalizeExtension('')).toBeNull()
    expect(normalizeExtension('...')).toBeNull()
    expect(normalizeExtension('foo bar')).toBeNull()
    expect(normalizeExtension('a/b')).toBeNull()
    expect(normalizeExtension('a\\b')).toBeNull()
  })
})

describe('extensionCandidates', () => {
  it('liefert Suffixe längste zuerst', () => {
    expect(extensionCandidates('zeichnung.excalidraw')).toEqual(['.excalidraw'])
    expect(extensionCandidates('report.pdf.md')).toEqual(['.pdf.md', '.md'])
    expect(extensionCandidates('a.b.c.d')).toEqual(['.b.c.d', '.c.d', '.d'])
  })

  it('ignoriert Pfad-Präfixe', () => {
    expect(extensionCandidates('sub/dir/zeichnung.excalidraw')).toEqual(['.excalidraw'])
  })
})

describe('resolveFileEditors', () => {
  const core = WELL_KNOWN_CORE_EXTENSIONS

  it('mappt eine saubere Beanspruchung kollisionsfrei', () => {
    const plugins: PluginFileEditors[] = [
      { pluginId: 'excalidraw', fileEditors: [{ editorId: 'draw', extensions: ['.excalidraw'] }] },
    ]
    const res = resolveFileEditors(plugins, core)
    expect(res.errors).toEqual([])
    expect(res.byExtension.get('.excalidraw')).toEqual({ pluginId: 'excalidraw', editorId: 'draw' })
  })

  it('lehnt eine Kern-Endung terminal ab (core-collision)', () => {
    const plugins: PluginFileEditors[] = [
      { pluginId: 'evil', fileEditors: [{ editorId: 'x', extensions: ['.md'] }] },
    ]
    const res = resolveFileEditors(plugins, core)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].kind).toBe('core-collision')
    expect(res.byExtension.has('.md')).toBe(false)
  })

  it('lehnt zwei Plugins mit derselben Endung ab (plugin-collision), erste Quelle bleibt', () => {
    const plugins: PluginFileEditors[] = [
      { pluginId: 'a', fileEditors: [{ editorId: 'ea', extensions: ['.draw'] }] },
      { pluginId: 'b', fileEditors: [{ editorId: 'eb', extensions: ['.draw'] }] },
    ]
    const res = resolveFileEditors(plugins, core)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toMatchObject({ kind: 'plugin-collision', pluginId: 'b', otherPluginId: 'a' })
    expect(res.byExtension.get('.draw')).toEqual({ pluginId: 'a', editorId: 'ea' })
  })

  it('normalisiert beanspruchte Endungen (Case/Punkt)', () => {
    const plugins: PluginFileEditors[] = [
      { pluginId: 'p', fileEditors: [{ editorId: 'e', extensions: ['XYZ'] }] },
    ]
    const res = resolveFileEditors(plugins, core)
    expect(res.errors).toEqual([])
    expect(res.byExtension.has('.xyz')).toBe(true)
  })

  it('meldet ungültige Endungen', () => {
    const plugins: PluginFileEditors[] = [
      { pluginId: 'p', fileEditors: [{ editorId: 'e', extensions: ['a b'] }] },
    ]
    const res = resolveFileEditors(plugins, core)
    expect(res.errors[0].kind).toBe('invalid-extension')
  })
})

describe('lookupFileEditor', () => {
  const resolved = resolveFileEditors(
    [{ pluginId: 'excalidraw', fileEditors: [{ editorId: 'draw', extensions: ['.excalidraw'] }] }],
    WELL_KNOWN_CORE_EXTENSIONS,
  )

  it('findet den Anspruch über die Endung', () => {
    expect(lookupFileEditor('skizze.excalidraw', resolved)).toEqual({ pluginId: 'excalidraw', editorId: 'draw' })
  })

  it('liefert null für nicht beanspruchte Dateien', () => {
    expect(lookupFileEditor('notiz.md', resolved)).toBeNull()
    expect(lookupFileEditor('ohneendung', resolved)).toBeNull()
  })
})
