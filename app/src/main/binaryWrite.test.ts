import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { writeBinaryFileSafe } from './binaryWrite'

let vault: string
beforeEach(async () => { vault = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-binwrite-')) })
afterEach(async () => { await fs.rm(vault, { recursive: true, force: true }) })

async function backups(): Promise<string[]> {
  const root = path.join(vault, '.mindgraph', 'backups')
  try {
    const out: string[] = []
    for (const day of await fs.readdir(root)) {
      const dir = path.join(root, day, 'reMarkable', 'pdf')
      for (const f of await fs.readdir(dir)) out.push(path.join(dir, f))
    }
    return out
  } catch {
    return []
  }
}

describe('writeBinaryFileSafe', () => {
  const target = () => path.join(vault, 'reMarkable', 'pdf', 'Heft.pdf')

  it('legt neue Dateien samt Ordner an, ohne Backup', async () => {
    await writeBinaryFileSafe(vault, target(), new Uint8Array([1, 2]))
    expect([...await fs.readFile(target())]).toEqual([1, 2])
    expect(await backups()).toEqual([])
  })

  it('sichert die alte Fassung vor dem Ersetzen', async () => {
    await writeBinaryFileSafe(vault, target(), new Uint8Array([1, 2]))
    await writeBinaryFileSafe(vault, target(), new Uint8Array([3, 4, 5]))
    expect([...await fs.readFile(target())]).toEqual([3, 4, 5])
    const b = await backups()
    expect(b).toHaveLength(1)
    expect(path.basename(b[0])).toMatch(/^Heft\.pdf\.\d{8}-\d{6}-\d{3}-[0-9a-f]{6}\.bak$/)
    expect([...await fs.readFile(b[0])]).toEqual([1, 2])
  })

  it('schreibt identische Bytes nicht und legt kein Backup an', async () => {
    await writeBinaryFileSafe(vault, target(), new Uint8Array([1, 2]))
    await writeBinaryFileSafe(vault, target(), new Uint8Array([1, 2]))
    expect(await backups()).toEqual([])
  })

  it('hinterlässt keine Zwischendateien', async () => {
    await writeBinaryFileSafe(vault, target(), new Uint8Array([1]))
    await writeBinaryFileSafe(vault, target(), new Uint8Array([2]))
    expect(await fs.readdir(path.dirname(target()))).toEqual(['Heft.pdf'])
  })
  it('übersteht zwei gleichzeitige Writes auf dieselbe Datei', async () => {
    await writeBinaryFileSafe(vault, target(), new Uint8Array([1]))
    await Promise.all([
      writeBinaryFileSafe(vault, target(), new Uint8Array([2, 2])),
      writeBinaryFileSafe(vault, target(), new Uint8Array([3, 3, 3])),
    ])
    const final = [...await fs.readFile(target())]
    expect([[2, 2], [3, 3, 3]]).toContainEqual(final)
    expect(await fs.readdir(path.dirname(target()))).toEqual(['Heft.pdf'])
    expect((await backups()).length).toBeGreaterThanOrEqual(1)
  })
})
