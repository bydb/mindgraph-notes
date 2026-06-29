import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readArchiveFileCapped, type ArchiveFs } from './readArchive'
import { ARTIFACT_LIMITS } from '../artifact/limits'

const tmpDirs: string[] = []
afterEach(() => { for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'mgx-readarc-'))
  tmpDirs.push(d)
  return d
}

describe('readArchiveFileCapped (echtes node fs)', () => {
  it('liest eine Datei innerhalb des Limits', async () => {
    const dir = tmp()
    const p = join(dir, 'plugin.mgxplugin')
    writeFileSync(p, Buffer.from('hello'))
    const buf = await readArchiveFileCapped(p)
    expect(buf.toString()).toBe('hello')
  })

  it('lehnt eine zu große Datei ab (archive-too-large)', async () => {
    const dir = tmp()
    const p = join(dir, 'big.mgxplugin')
    writeFileSync(p, Buffer.alloc(2048, 0x41))
    const limits = { ...ARTIFACT_LIMITS, maxArchiveBytes: 1024 }
    await expect(readArchiveFileCapped(p, limits)).rejects.toMatchObject({ code: 'archive-too-large' })
  })

  it('lehnt ein Verzeichnis ab (entry-type) — beweist auch stat-vor-read (sonst EISDIR)', async () => {
    const dir = tmp()
    const sub = join(dir, 'adir')
    mkdirSync(sub)
    await expect(readArchiveFileCapped(sub)).rejects.toMatchObject({ code: 'entry-type' })
  })

  it('gated einen Symlink auf eine zu große Zieldatei (stat folgt dem Symlink)', async () => {
    const dir = tmp()
    const target = join(dir, 'target.bin')
    writeFileSync(target, Buffer.alloc(2048, 0x42))
    const link = join(dir, 'link.mgxplugin')
    symlinkSync(target, link)
    const limits = { ...ARTIFACT_LIMITS, maxArchiveBytes: 1024 }
    await expect(readArchiveFileCapped(link, limits)).rejects.toMatchObject({ code: 'archive-too-large' })
  })
})

describe('readArchiveFileCapped (Reihenfolge via injizierter FS)', () => {
  it('ruft readFile NICHT auf, wenn die Größe das Limit überschreitet', async () => {
    const readFile = vi.fn(async () => Buffer.alloc(0))
    const fs: ArchiveFs = { stat: async () => ({ isFile: () => true, size: 999_999 }), readFile }
    const limits = { ...ARTIFACT_LIMITS, maxArchiveBytes: 1024 }
    await expect(readArchiveFileCapped('/x', limits, fs)).rejects.toMatchObject({ code: 'archive-too-large' })
    expect(readFile).not.toHaveBeenCalled() // Reorder-Regression (readFile vor size-Check) fiele hier auf
  })

  it('ruft readFile NICHT auf, wenn es kein reguläres File ist', async () => {
    const readFile = vi.fn(async () => Buffer.alloc(0))
    const fs: ArchiveFs = { stat: async () => ({ isFile: () => false, size: 1 }), readFile }
    await expect(readArchiveFileCapped('/x', ARTIFACT_LIMITS, fs)).rejects.toMatchObject({ code: 'entry-type' })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('liest erst NACH bestandener Größenprüfung', async () => {
    const readFile = vi.fn(async () => Buffer.from('ok'))
    const fs: ArchiveFs = { stat: async () => ({ isFile: () => true, size: 10 }), readFile }
    const buf = await readArchiveFileCapped('/x', ARTIFACT_LIMITS, fs)
    expect(buf.toString()).toBe('ok')
    expect(readFile).toHaveBeenCalledTimes(1)
  })
})
