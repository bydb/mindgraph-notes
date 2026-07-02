import { describe, it, expect } from 'vitest'
import { parsePluginEmbedSize } from './pluginEmbeds'

// Größen-Syntax für Plugin-Embeds: ![[datei.ext|400]] / ![[datei.ext|400x300]] —
// gleiche Semantik wie Bild-Embeds. Alles Nicht-Numerische ist ein Alias, keine Größe.
describe('parsePluginEmbedSize', () => {
  it('parst reine Breite', () => {
    expect(parsePluginEmbedSize('400')).toEqual({ width: 400, height: null })
  })

  it('parst Breite x Höhe', () => {
    expect(parsePluginEmbedSize('400x300')).toEqual({ width: 400, height: 300 })
  })

  it('toleriert Whitespace', () => {
    expect(parsePluginEmbedSize(' 640x480 ')).toEqual({ width: 640, height: 480 })
  })

  it('lehnt Alias-Text ab', () => {
    expect(parsePluginEmbedSize('meine Skizze')).toBeNull()
  })

  it('lehnt gemischte Angaben ab', () => {
    expect(parsePluginEmbedSize('400px')).toBeNull()
    expect(parsePluginEmbedSize('x300')).toBeNull()
    expect(parsePluginEmbedSize('400x')).toBeNull()
  })

  it('behandelt leer/undefined als keine Größe', () => {
    expect(parsePluginEmbedSize('')).toBeNull()
    expect(parsePluginEmbedSize(null)).toBeNull()
    expect(parsePluginEmbedSize(undefined)).toBeNull()
  })
})
