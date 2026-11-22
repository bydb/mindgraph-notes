import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { starterVaultSources } from './starterVaultSources'

const RES = path.join(__dirname, '..', '..', 'resources')

describe('starterVaultSources', () => {
  it('bisherige Varianten unverändert', () => {
    expect(starterVaultSources('office')).toEqual(['starter-vault-office'])
    expect(starterVaultSources('demo')).toEqual(['starter-vault-demo'])
    expect(starterVaultSources('en')).toEqual(['starter-vault-en'])
    expect(starterVaultSources('de')).toEqual(['starter-vault'])
  })
  it('school = Büro-Vault, darüber die Schul-Willkommensnotiz', () => {
    expect(starterVaultSources('school')).toEqual(['starter-vault-office', 'starter-vault-school'])
  })
  it('alle Quellordner existieren in resources/', () => {
    for (const v of ['office', 'school', 'demo', 'en', 'de']) {
      for (const dir of starterVaultSources(v)) expect(existsSync(path.join(RES, dir)), dir).toBe(true)
    }
  })
  it('die Schul-Willkommensnotiz verlinkt nur Notizen, die der Büro-Vault wirklich enthält', () => {
    const md = readFileSync(path.join(RES, 'starter-vault-school', 'Willkommen.md'), 'utf-8')
    // Inline-Code (`[[Notiz-Titel]]` als Erklärbeispiel) ist kein Link.
    const links = [...md.replace(/`[^`]*`/g, '').matchAll(/\[\[([^\]|#]+)/g)].map(m => m[1].trim())
    expect(links.length).toBeGreaterThan(0)
    for (const l of links) expect(existsSync(path.join(RES, 'starter-vault-office', `${l}.md`)), l).toBe(true)
    expect(md).not.toMatch(/Mittelstand|Kunden/)
  })
})
