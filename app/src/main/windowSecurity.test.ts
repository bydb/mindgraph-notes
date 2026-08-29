import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SECURE_WEB_PREFERENCES } from './windowSecurity'

describe('SECURE_WEB_PREFERENCES', () => {
  it('pinnt die Isolations-Invarianten explizit', () => {
    expect(SECURE_WEB_PREFERENCES.webSecurity).toBe(true)
    expect(SECURE_WEB_PREFERENCES.nodeIntegrationInSubFrames).toBe(false)
    expect(SECURE_WEB_PREFERENCES.webviewTag).toBe(false)
    expect(SECURE_WEB_PREFERENCES.contextIsolation).toBe(true)
    expect(SECURE_WEB_PREFERENCES.nodeIntegration).toBe(false)
  })

  // Guard gegen Regressionen: kein setWindowOpenHandler darf shell.openExternal aufrufen.
  //
  // Der Handler bekommt keine Angabe darüber, WELCHER Frame das Fenster öffnen wollte
  // (gemessen 29.08.2026: Popup aus dem App-Dokument und Popup aus einem sandboxed
  // iframe liefern identische HandlerDetails, referrer.url jeweils leer). Ein Forward
  // nach draußen ist deshalb immer auch ein Forward für fremdes Vault-HTML aus der
  // HTML-Vorschau. Der bewusste Weg ist der IPC `open-external`; im Renderer kapselt
  // ihn Shared/ExternalLink.
  it('kein setWindowOpenHandler reicht URLs an shell.openExternal weiter', () => {
    const tsFiles: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) tsFiles.push(p)
      }
    }
    walk('src/main')

    let handlers = 0
    for (const f of tsFiles) {
      const src = readFileSync(f, 'utf8')
      let i = src.indexOf('setWindowOpenHandler')
      while (i !== -1) {
        handlers++
        // Rumpf grob eingrenzen: bis zur schließenden Klammer des Aufrufs, großzügig
        // gefasst — lieber zu viel prüfen als zu wenig.
        const body = src.slice(i, i + 600)
        const ende = body.indexOf('\n  })')
        expect(
          (ende === -1 ? body : body.slice(0, ende)).includes('openExternal'),
          `${f}: setWindowOpenHandler darf kein openExternal aufrufen — nutze den IPC open-external`
        ).toBe(false)
        i = src.indexOf('setWindowOpenHandler', i + 1)
      }
    }
    // Sanity: der Scan hat tatsächlich Handler gefunden.
    expect(handlers).toBeGreaterThanOrEqual(2)
  })

  // Guard gegen Regressionen: ein neues Fenster ohne die sichere Basis fällt hier auf.
  it('jedes `new BrowserWindow` im Main-Prozess spreadet SECURE_WEB_PREFERENCES', () => {
    const tsFiles: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) tsFiles.push(p)
      }
    }
    walk('src/main')

    let totalWindows = 0
    for (const f of tsFiles) {
      const src = readFileSync(f, 'utf8')
      const windows = (src.match(/new BrowserWindow\(/g) ?? []).length
      if (windows === 0) continue
      totalWindows += windows
      const spreads = (src.match(/\.\.\.SECURE_WEB_PREFERENCES/g) ?? []).length
      expect(
        spreads,
        `${f}: jedes 'new BrowserWindow' muss '...SECURE_WEB_PREFERENCES' in webPreferences spreaden`
      ).toBeGreaterThanOrEqual(windows)
    }
    // Sanity: der Scan hat tatsächlich Fenster gefunden (sonst wäre der Guard wirkungslos).
    expect(totalWindows).toBeGreaterThanOrEqual(3)
  })
})
