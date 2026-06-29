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
