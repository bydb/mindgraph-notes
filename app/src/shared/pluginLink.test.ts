import { describe, expect, it } from 'vitest'
import { classifyPluginLink } from './pluginLink'

describe('classifyPluginLink', () => {
  it('erkennt Wikilinks samt Alias und Abschnitt', () => {
    expect(classifyPluginLink('[[Projektplan]]')).toEqual({ kind: 'note', target: 'Projektplan', fragment: '' })
    expect(classifyPluginLink('[[Projektplan|der Plan]]')).toEqual({ kind: 'note', target: 'Projektplan', fragment: '' })
    expect(classifyPluginLink('[[100 - Projekte/Plan#Termine|Plan]]')).toEqual({
      kind: 'note',
      target: '100 - Projekte/Plan',
      fragment: 'Termine',
    })
  })

  it('nimmt Vault-Pfade und Namen ohne Klammern, auch Plugin-Dateien', () => {
    expect(classifyPluginLink('Projekte/Plan.md')).toEqual({ kind: 'note', target: 'Projekte/Plan.md', fragment: '' })
    expect(classifyPluginLink('skizze.excalidraw')).toEqual({ kind: 'note', target: 'skizze.excalidraw', fragment: '' })
    // Excalidraw hielt „/…“ für einen lokalen Link und navigierte das App-Fenster weg — hier ist es ein Vault-Pfad.
    expect(classifyPluginLink('/Projekte/Plan')).toEqual({ kind: 'note', target: 'Projekte/Plan', fragment: '' })
  })

  it('schickt http(s) und mailto nach außen, www ohne Schema als https', () => {
    expect(classifyPluginLink('https://example.org/a?b=1')).toEqual({ kind: 'external', url: 'https://example.org/a?b=1' })
    expect(classifyPluginLink('HTTP://example.org')).toEqual({ kind: 'external', url: 'HTTP://example.org' })
    expect(classifyPluginLink('mailto:info@example.org')).toEqual({ kind: 'external', url: 'mailto:info@example.org' })
    expect(classifyPluginLink('www.example.org/x')).toEqual({ kind: 'external', url: 'https://www.example.org/x' })
  })

  it('lehnt andere Schemata ab', () => {
    for (const link of ['file:///etc/passwd', 'javascript:alert(1)', 'about:blank', 'data:text/html,x', 'C:\\Windows']) {
      expect(classifyPluginLink(link).kind).toBe('refused')
    }
  })

  it('lehnt Leeres, Nicht-Text und Pfade aus dem Vault heraus ab', () => {
    expect(classifyPluginLink('').kind).toBe('refused')
    expect(classifyPluginLink('   ').kind).toBe('refused')
    expect(classifyPluginLink('[[ ]]').kind).toBe('refused')
    expect(classifyPluginLink(42).kind).toBe('refused')
    expect(classifyPluginLink('../geheim.md').kind).toBe('refused')
    expect(classifyPluginLink('[[a/../../b]]').kind).toBe('refused')
  })
})
