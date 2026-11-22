import { describe, it, expect } from 'vitest'
import { decideMainNavigation } from './mainNavigation'

const MAC_APP = 'file:///Applications/MindGraph%20Notes.app/Contents/Resources/app.asar/out/renderer/index.html'
const WIN_APP = 'file:///C:/Program%20Files/MindGraph%20Notes/resources/app.asar/out/renderer/index.html'
const DEV_APP = 'http://localhost:5173'

describe('decideMainNavigation', () => {
  it('lässt das App-Dokument selbst zu, auch mit Anker oder Query', () => {
    expect(decideMainNavigation(MAC_APP, MAC_APP)).toBe('allow')
    expect(decideMainNavigation(MAC_APP + '#/notiz', MAC_APP)).toBe('allow')
    expect(decideMainNavigation(WIN_APP + '?x=1', WIN_APP)).toBe('allow')
    expect(decideMainNavigation('http://localhost:5173/', DEV_APP)).toBe('allow')
    expect(decideMainNavigation('http://localhost:5173/index.html#a', DEV_APP)).toBe('allow')
  })

  it('gibt Web- und Mail-Adressen an das Betriebssystem', () => {
    expect(decideMainNavigation('https://example.org/a', MAC_APP)).toBe('external')
    expect(decideMainNavigation('http://example.org', WIN_APP)).toBe('external')
    expect(decideMainNavigation('mailto:a@example.org', MAC_APP)).toBe('external')
    expect(decideMainNavigation('https://example.org', DEV_APP)).toBe('external')
  })

  it('verwirft fremde lokale Dateien — relativer Link aus dem Vault-Chat', () => {
    expect(decideMainNavigation('file:///Users/Shared/x.html', MAC_APP)).toBe('block')
    expect(decideMainNavigation('file:///C:/Users/Public/x.html', WIN_APP)).toBe('block')
    // Nachbardatei im selben Ordner wie index.html
    expect(decideMainNavigation(MAC_APP.replace('index.html', 'transport.html'), MAC_APP)).toBe('block')
  })

  it('verwirft Netzlaufwerke (Windows-UNC über file://host/)', () => {
    expect(decideMainNavigation('file://angreifer.example/share/x.html', WIN_APP)).toBe('block')
    expect(decideMainNavigation('file://angreifer.example/C:/Program%20Files/MindGraph%20Notes/resources/app.asar/out/renderer/index.html', WIN_APP)).toBe('block')
  })

  it('hält in der Entwicklung fremde Ports und Dateien aus dem Fenster', () => {
    // Anderer Port = andere Seite → Browser, nicht ins Fenster.
    expect(decideMainNavigation('http://localhost:5174/', DEV_APP)).toBe('external')
    expect(decideMainNavigation('file:///etc/passwd', DEV_APP)).toBe('block')
  })

  it('verwirft gefährliche und kaputte Adressen', () => {
    for (const u of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'blob:file:///abc', 'mindgraph-preview://x/y', 'vscode://file/x', 'kein url', '']) {
      expect(decideMainNavigation(u, MAC_APP), u).toBe('block')
    }
    expect(decideMainNavigation(MAC_APP, 'kaputt')).toBe('block')
  })
})
