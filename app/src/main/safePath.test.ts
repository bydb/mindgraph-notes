import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { canonicalizeAllowingMissing } from './safePath'

let root = ''
let realRoot = ''
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-safepath-'))
  realRoot = await fs.realpath(root)
  await fs.mkdir(path.join(root, 'vault', 'vorhanden'), { recursive: true })
  await fs.mkdir(path.join(root, 'aussen'), { recursive: true })
  await fs.symlink(path.join(root, 'aussen'), path.join(root, 'vault', 'link-nach-aussen'))
})
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('canonicalizeAllowingMissing (F39)', () => {
  it('vorhandener Pfad → realpath', async () => {
    expect(await canonicalizeAllowingMissing(path.join(root, 'vault', 'vorhanden'))).toBe(path.join(realRoot, 'vault', 'vorhanden'))
  })
  it('zweistufig fehlender Zielordner wird an den tiefsten vorhandenen Vorfahren gehängt', async () => {
    const p = path.join(root, 'vault', 'Bereich', 'Notizen', 'neu.md')
    expect(await canonicalizeAllowingMissing(p)).toBe(path.join(realRoot, 'vault', 'Bereich', 'Notizen', 'neu.md'))
  })
  it('Symlink nach außen im vorhandenen Teil wird aufgelöst (und kann dann außerhalb erkannt werden)', async () => {
    const p = path.join(root, 'vault', 'link-nach-aussen', 'x', 'y.md')
    expect(await canonicalizeAllowingMissing(p)).toBe(path.join(realRoot, 'aussen', 'x', 'y.md'))
  })
  it('`..` durch fehlende Segmente hindurch landet sichtbar außerhalb (der Aufrufer weist es ab)', async () => {
    const out = await canonicalizeAllowingMissing(path.join(root, 'vault', 'fehlt', '..', '..', 'aussen', 'z.md'))
    expect(out).toBe(path.join(realRoot, 'aussen', 'z.md'))
    expect(out.startsWith(path.join(realRoot, 'vault') + path.sep)).toBe(false)
  })
})
