// Regression 1.2.4 (07.11.2026): Die Instanzsperre griff auf das Profilverzeichnis zu, bevor der
// App-Name gesetzt war — Electron fror userData auf den Paketnamen „mindgraph-notes“ ein, die App
// öffnete ein fremdes Profil. Der Name muss im Quelltext vor jedem Zugriff auf userData stehen,
// außer im Dev-Block, der das Profil ausdrücklich selbst setzt.

import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(path.join(__dirname, 'index.ts'), 'utf-8')
const nameAt = src.indexOf("app.name = 'MindGraph Notes'")

describe('App-Name vor dem Profilzugriff (Regression 1.2.4)', () => {
  it('der Name wird genau einmal gesetzt', () => {
    expect(nameAt).toBeGreaterThan(0)
    expect(src.indexOf("app.name = 'MindGraph Notes'", nameAt + 1)).toBe(-1)
  })

  it('steht vor der Instanzsperre', () => {
    const lockAt = src.indexOf('app.requestSingleInstanceLock(')
    expect(lockAt).toBeGreaterThan(0)
    expect(nameAt).toBeLessThan(lockAt)
  })

  it('vor dem Namen greift nur der Dev-Block auf userData zu', () => {
    const before = src.slice(0, nameAt)
    const devBlock = before.slice(before.indexOf('if (!app.isPackaged) {'))
    const outsideDev = before.slice(0, before.indexOf('if (!app.isPackaged) {'))
    expect(outsideDev).not.toMatch(/getPath\(\s*['"]userData['"]\s*\)|requestSingleInstanceLock|safeStorage\./)
    expect(devBlock).toContain("app.setPath('userData'")
  })
})
