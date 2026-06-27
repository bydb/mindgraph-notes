// Import-Wall — die Architektur-Grenze für `src/plugins/**` (Plan Entscheidung #3, Phase 1).
//
// Plugins dürfen NIE rohes fs/net/electron/child_process importieren — alles läuft über den
// Capability-Host. Das Projekt hat kein ESLint; statt dafür eines einzuführen, erzwingt dieser
// dependency-freie Scan-Test dieselbe Regel im bestehenden vitest-Lauf. (Echte Isolation bleibt
// Phase 2 = utilityProcess; das hier ist Entkopplung, KEINE Sandbox.)

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGINS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../plugins')

// Rohe Plattform-Module, die hinter dem Capability-Host liegen müssen.
const FORBIDDEN = [
  'fs', 'fs/promises',
  'net', 'tls', 'dns',
  'http', 'https', 'http2',
  'child_process',
  'electron',
  'node:fs', 'node:fs/promises',
  'node:net', 'node:tls', 'node:dns',
  'node:http', 'node:https',
  'node:child_process',
]

function collectSources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full))
    } else if (['.ts', '.tsx'].includes(extname(name)) && !name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

/** Statische `from '…'`, `import('…')` und `require('…')`-Spezifizierer. */
function importedSpecifiers(source: string): string[] {
  const specs: string[] = []
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(source))) specs.push(m[1])
  }
  return specs
}

describe('Plugin-Import-Wall', () => {
  it('kein Plugin importiert rohes fs/net/electron/child_process', () => {
    const files = collectSources(PLUGINS_DIR)
    // Sicherstellen, dass der Scan überhaupt etwas findet (sonst grünt der Test fälschlich).
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const specs = importedSpecifiers(readFileSync(file, 'utf-8'))
      for (const spec of specs) {
        if (FORBIDDEN.includes(spec)) {
          violations.push(`${file.replace(PLUGINS_DIR, 'src/plugins')} → '${spec}'`)
        }
      }
    }
    expect(violations, `Verbotene Importe:\n${violations.join('\n')}`).toEqual([])
  })
})
