import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import {
  loadVaultIndexFile,
  writeVaultIndexAtomic,
  cleanupVaultIndexTemps,
  listVaultIndexFiles,
  removeOtherVaultIndexes,
  vaultIndexPath,
  vaultIndexFileName,
  stagingDirFor,
  saveCheckpoint,
  loadCheckpoint,
  writeSegment,
  loadSegment,
  readCanonicalFile,
  sha256Hex
} from './vaultStore'
import type { VaultIndexIdentity, VaultIndexMeta } from '../../shared/rag/vaultIndex'

let tmp: string
const identity: VaultIndexIdentity = { model: 'bge-m3:latest', digest: 'sha256:abc', dim: 3, formatVersion: 1, chunkingVersion: 2, excludeKey: '' }

function meta(chunkCount: number): VaultIndexMeta {
  return {
    identity,
    createdAt: 1,
    files: { 'a.md': { sourceHash: 'h', mtime: 1, size: 1, kind: null, dateValue: null, dateSource: 'mtime' } },
    chunks: Array.from({ length: chunkCount }, (_, i) => ({
      fileRel: 'a.md', chunkIndex: i, heading: '', sourceStart: 0, sourceEnd: 1, startLine: 1, chunkHash: `c${i}`, text: `t${i}`
    }))
  }
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-vaultstore-'))
})
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('Container schreiben und laden', () => {
  it('Roundtrip über mehrere Vektor-Teile, atomar (keine Temp-Datei bleibt)', async () => {
    const file = vaultIndexPath(tmp, identity)
    const parts = [new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6, 7, 8, 9])]
    const { bytes } = await writeVaultIndexAtomic(file, meta(3), parts, 5)
    const st = await fs.stat(file)
    expect(st.size).toBe(bytes)
    const names = await fs.readdir(path.dirname(file))
    expect(names.some((n) => n.includes('.tmp-'))).toBe(false)

    const loaded = await loadVaultIndexFile(file)
    expect(loaded?.generation).toBe(5)
    expect(loaded?.meta.chunks).toHaveLength(3)
    expect(Array.from(loaded!.vectors)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('abgeschnittene Datei → null, gekipptes Byte → null, fehlende Datei → null', async () => {
    const file = vaultIndexPath(tmp, identity)
    await writeVaultIndexAtomic(file, meta(1), [new Float32Array([1, 2, 3])], 1)
    const bytes = await fs.readFile(file)
    await fs.writeFile(file, bytes.subarray(0, bytes.length - 2))
    expect(await loadVaultIndexFile(file)).toBeNull()
    const bad = Buffer.from(bytes)
    bad[bad.length - 1] ^= 0xff
    await fs.writeFile(file, bad)
    expect(await loadVaultIndexFile(file)).toBeNull()
    expect(await loadVaultIndexFile(path.join(tmp, 'nein.ragbin'))).toBeNull()
  })

  it('Vektorzahl muss zu chunkCount × dim passen', async () => {
    const file = vaultIndexPath(tmp, identity)
    await expect(writeVaultIndexAtomic(file, meta(2), [new Float32Array([1, 2, 3])], 1)).rejects.toThrow(/Vektorzahl/)
  })

  it('Dateiname ist dateinamensicher und identitätsgebunden', () => {
    const a = vaultIndexFileName(identity)
    const b = vaultIndexFileName({ ...identity, digest: 'sha256:other' })
    const c = vaultIndexFileName({ ...identity, excludeKey: '400 - Archiv/' })
    expect(a).toMatch(/^vault-bge-m3-latest--[0-9a-f]{12}\.ragbin$/)
    expect(new Set([a, b, c]).size).toBe(3)
    expect(stagingDirFor('/ud', '/vault', identity)).not.toBe(stagingDirFor('/ud', '/vault', { ...identity, digest: 'x' }))
  })

  it('Temp-Reste werden entfernt, andere Container nach Commit gelöscht', async () => {
    const dir = path.join(tmp, '.mindgraph', 'rag')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'vault-x--000000000000.ragbin.tmp-123-ab'), 'x')
    expect(await cleanupVaultIndexTemps(dir)).toBe(1)

    const keep = vaultIndexPath(tmp, identity)
    const old = vaultIndexPath(tmp, { ...identity, digest: 'sha256:old' })
    await writeVaultIndexAtomic(keep, meta(1), [new Float32Array([1, 2, 3])], 2)
    await writeVaultIndexAtomic(old, meta(1), [new Float32Array([1, 2, 3])], 1)
    expect((await listVaultIndexFiles(dir)).map((f) => f.generation).sort()).toEqual([1, 2])
    await removeOtherVaultIndexes(dir, keep)
    const left = await listVaultIndexFiles(dir)
    expect(left).toHaveLength(1)
    expect(left[0].file).toBe(keep)
  })
})

describe('Staging', () => {
  it('Checkpoint und Segment: Roundtrip, fremde Identität wird verworfen', async () => {
    const staging = path.join(tmp, 'staging')
    await saveCheckpoint(staging, { identity, files: { 'a.md': 'h' }, segments: [{ name: 'seg-00000.ragbin', chunkCount: 1 }], updatedAt: 1 })
    expect((await loadCheckpoint(staging, identity))?.files).toEqual({ 'a.md': 'h' })
    expect(await loadCheckpoint(staging, { ...identity, digest: 'x' })).toBeNull()

    await writeSegment(staging, 'seg-00000.ragbin', { meta: meta(1), vectors: new Float32Array([1, 2, 3]), generation: 1 })
    expect((await loadSegment(staging, 'seg-00000.ragbin', identity))?.meta.chunks).toHaveLength(1)
    expect(await loadSegment(staging, 'seg-00000.ragbin', { ...identity, dim: 4 })).toBeNull()
    expect(await loadSegment(staging, 'fehlt.ragbin', identity)).toBeNull()
  })
})

describe('readCanonicalFile', () => {
  it('kanonisiert (BOM, CRLF) und hasht die kanonische Form', async () => {
    const f = path.join(tmp, 'n.md')
    await fs.writeFile(f, '﻿# A\r\nText\r\n', 'utf-8')
    const r = await readCanonicalFile(f)
    expect(r.canonical).toBe('# A\nText\n')
    expect(r.sourceHash).toBe(sha256Hex('# A\nText\n'))
    expect(r.size).toBeGreaterThan(0)
  })
})
