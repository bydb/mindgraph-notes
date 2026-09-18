import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

let currentDigest = 'sha256:aaa'
vi.mock('./localModel', () => ({
  resolveLocalModel: async (name: string) => ({ name, digest: currentDigest })
}))
vi.mock('./embed', () => ({
  embedText: async (_m: string, text: string) => (text.includes('alpha') ? [1, 0, 0, 0] : [0, 1, 0, 0])
}))

import { rankCandidates, selectHits, verifyHits, queryVaultIndex, VaultIdentityError } from './vaultRetrieve'
import { sha256Hex } from './vaultStore'
import { chunkMarkdown, canonicalizeMarkdown } from '../../shared/rag/chunking'
import type { VaultIndexContainer, VaultChunkMeta, VaultFileMeta } from '../../shared/rag/vaultIndex'

const assertSafePath = async (p: string) => p
let vault: string

function chunk(fileRel: string, i: number, text: string, extra: Partial<VaultChunkMeta> = {}): VaultChunkMeta {
  return { fileRel, chunkIndex: i, heading: 'H', sourceStart: 0, sourceEnd: text.length, startLine: 1, chunkHash: sha256Hex(text), text, ...extra }
}
function file(sourceHash: string, kind: VaultFileMeta['kind'] = null, dateValue: number | null = null): VaultFileMeta {
  return { sourceHash, mtime: 1, size: 1, kind, dateValue, dateSource: 'mtime' }
}

function container(chunks: VaultChunkMeta[], files: Record<string, VaultFileMeta>, rows: number[][]): VaultIndexContainer {
  const vectors = new Float32Array(rows.flat())
  return {
    meta: { identity: { model: 'bge-m3:latest', digest: 'sha256:aaa', dim: 4, formatVersion: 1, chunkingVersion: 2, excludeKey: '' }, createdAt: 1, files, chunks },
    vectors,
    generation: 1
  }
}

beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-retrieve-'))
  currentDigest = 'sha256:aaa'
})
afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true })
})

describe('rankCandidates + selectHits', () => {
  const c = container(
    [
      chunk('a.md', 0, 'alpha eins'),
      chunk('a.md', 1, 'alpha zwei'),
      chunk('a.md', 2, 'alpha drei'),
      chunk('b.md', 0, 'Alpha   eins'), // exaktes Duplikat nach Normalisierung
      chunk('c.md', 0, 'beta')
    ],
    { 'a.md': file('h', 'problem', 100), 'b.md': file('h', 'info', 200), 'c.md': file('h', null, null) },
    [[1, 0, 0, 0], [0.9, 0.1, 0, 0], [0.8, 0.2, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0]]
  )

  it('rangiert nach Cosine und respektiert Vorfilter', () => {
    const q = new Float32Array([1, 0, 0, 0])
    const all = rankCandidates(c, q, undefined, 10)
    expect(all[0].score).toBeCloseTo(1)
    expect(all.map((r) => r.row)).toContain(4)
    const onlyProblem = rankCandidates(c, q, { kinds: ['problem'] }, 10)
    expect(onlyProblem.every((r) => c.meta.chunks[r.row].fileRel === 'a.md')).toBe(true)
    const folder = rankCandidates(c, q, { folders: ['nix'] }, 10)
    expect(folder).toHaveLength(0)
  })

  it('Dedupe exakt (normalisiert) und Pro-Datei-Deckel in Score-Reihenfolge', () => {
    const q = new Float32Array([1, 0, 0, 0])
    const ranked = rankCandidates(c, q, undefined, 20)
    const sel = selectHits(c, ranked, 8, 2)
    const files = sel.map((s) => s.chunk.fileRel)
    expect(files.filter((f) => f === 'a.md')).toHaveLength(2)
    // b.md ist ein Duplikat von a.md/0 → nicht dabei
    expect(files).not.toContain('b.md')
    expect(files).toContain('c.md')
  })
})

describe('verifyHits — Frische und Relokalisierung', () => {
  it('unveränderte Datei → fresh; geänderte Datei mit eindeutiger Passage → relocated; doppelte Passage → weg', async () => {
    // Die Relokalisierung ist exakt über den Chunk-Text: sie greift, wenn die Sektion
    // mit der Passage unverändert blieb und die Änderung woanders in der Datei liegt.
    // Die Sektion muss länger als minChars (200) sein, sonst wird sie als Mini-Chunk
    // in den Vorgänger gezogen und ist kein eigener Quellen-Chunk.
    const passage = Array.from({ length: 4 }, (_, i) => `Stabile Passage Satz ${i + 1}, die eindeutig bleibt und lang genug ist.`).join(' ')
    const stable = '## Stabil\n\n' + passage
    const filler = Array.from({ length: 20 }, (_, i) => `Vor Satz ${i + 1} mit genug Text für einen Chunk.`).join(' ')

    // a.md: unverändert
    const original = '# A\n\n' + passage + '\n'
    await fs.writeFile(path.join(vault, 'a.md'), original)
    const [ch] = chunkMarkdown(original)
    const chunkA = chunk('a.md', 0, ch.text, { sourceStart: ch.sourceStart, sourceEnd: ch.sourceEnd, startLine: ch.startLine })

    // b.md: Index kennt die Sektion „Stabil"; die Datei bekam davor einen neuen Absatz
    const bNow = '# B\n\nNeu davor.\n\n' + filler + '\n\n' + stable + '\n'
    await fs.writeFile(path.join(vault, 'b.md'), bNow)
    const target = chunkMarkdown(bNow).find((x) => x.text === stable)!
    expect(target).toBeDefined()
    const chunkB = chunk('b.md', 1, stable, { sourceStart: 999, sourceEnd: 1000, startLine: 99, heading: 'Stabil' })

    // c.md: geändert, die Sektion kommt ZWEIMAL vor → nicht eindeutig → weg
    const cNow = '# C\n\n' + filler + '\n\n' + stable + '\n\n' + stable + '\n'
    await fs.writeFile(path.join(vault, 'c.md'), cNow)
    expect(chunkMarkdown(cNow).filter((x) => x.text === stable)).toHaveLength(2)
    const chunkC = chunk('c.md', 1, stable, { heading: 'Stabil' })

    // d.md: fehlt
    const chunkD = chunk('d.md', 0, 'weg')

    const cont = container(
      [chunkA, chunkB, chunkC, chunkD],
      { 'a.md': file(sha256Hex(canonicalizeMarkdown(original))), 'b.md': file('alt'), 'c.md': file('alt'), 'd.md': file('alt') },
      [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]]
    )
    const { hits, staleFiles } = await verifyHits(vault, cont, cont.meta.chunks.map((c) => ({ chunk: c, score: 0.9 })), assertSafePath)
    expect(hits.map((h) => [h.fileRel, h.fresh])).toEqual([['a.md', 'fresh'], ['b.md', 'relocated']])
    const b = hits[1]
    expect(b.sourceStart).toBe(target.sourceStart)
    expect(b.startLine).toBe(target.startLine)
    expect(b.chunkIndex).toBe(target.chunkIndex)
    expect(b.heading).toBe('Stabil')
    expect(b.sourceHash).toBe(sha256Hex(canonicalizeMarkdown(bNow)))
    expect(staleFiles.sort()).toEqual(['b.md', 'c.md', 'd.md'])
  })
})

describe('Relokalisierung mit frischen Metadaten (F36)', () => {
  it('geänderte Kategorie im Frontmatter fällt aus dem aktiven Filter, obwohl der Chunk wiedergefunden wird', async () => {
    const body = '# A\n\n' + Array.from({ length: 4 }, (_, i) => `Stabiler Satz ${i + 1}, lang genug für einen Chunk.`).join(' ') + '\n'
    const before = '---\ncategory: red\n---\n' + body
    const after = '---\ncategory: green\n---\n' + body
    await fs.writeFile(path.join(vault, 'a.md'), after)
    const [ch] = chunkMarkdown(before)
    const cont = container(
      [chunk('a.md', 0, ch.text, { sourceStart: ch.sourceStart, sourceEnd: ch.sourceEnd, startLine: ch.startLine })],
      { 'a.md': file('alt', 'problem', null) },
      [[1, 0, 0, 0]]
    )
    const sel = cont.meta.chunks.map((c) => ({ chunk: c, score: 0.9 }))
    const withFilter = await verifyHits(vault, cont, sel, assertSafePath, { kinds: ['problem'] })
    expect(withFilter.hits).toHaveLength(0)
    expect(withFilter.staleFiles).toEqual(['a.md'])
    const without = await verifyHits(vault, cont, sel, assertSafePath)
    expect(without.hits).toHaveLength(1)
    expect(without.hits[0].fresh).toBe('relocated')
    expect(without.hits[0].kind).toBe('solution')
  })
})

describe('queryVaultIndex', () => {
  it('Digest-Abweichung → VaultIdentityError, kein Cosine', async () => {
    const cont = container([chunk('a.md', 0, 'alpha')], { 'a.md': file('h') }, [[1, 0, 0, 0]])
    currentDigest = 'sha256:anders'
    await expect(queryVaultIndex(cont, vault, { query: 'alpha', embedModel: 'bge-m3' }, assertSafePath)).rejects.toThrow(VaultIdentityError)
  })

  it('unter dem Floor → belowFloor ohne Treffer (kein Top-1-Fallback)', async () => {
    const cont = container([chunk('a.md', 0, 'alpha')], { 'a.md': file('h') }, [[1, 0, 0, 0]])
    const r = await queryVaultIndex(cont, vault, { query: 'beta', embedModel: 'bge-m3', minScore: 0.3 }, assertSafePath)
    expect(r.belowFloor).toBe(true)
    expect(r.hits).toHaveLength(0)
    expect(r.bestScore).toBeCloseTo(0)
  })

  it('Treffer über dem Floor, aber Datei geändert und nicht relokalisierbar → noFreshSource', async () => {
    await fs.writeFile(path.join(vault, 'a.md'), '# A\n\nganz anderer Inhalt\n')
    const cont = container([chunk('a.md', 0, 'alpha text')], { 'a.md': file('alt') }, [[1, 0, 0, 0]])
    const r = await queryVaultIndex(cont, vault, { query: 'alpha', embedModel: 'bge-m3' }, assertSafePath)
    expect(r.belowFloor).toBe(false)
    expect(r.noFreshSource).toBe(true)
    expect(r.staleFiles).toEqual(['a.md'])
  })

  it('frischer Treffer wird geliefert', async () => {
    const text = '# A\n\nalpha text hier\n'
    await fs.writeFile(path.join(vault, 'a.md'), text)
    const [ch] = chunkMarkdown(text)
    const cont = container(
      [chunk('a.md', 0, ch.text, { sourceStart: ch.sourceStart, sourceEnd: ch.sourceEnd })],
      { 'a.md': file(sha256Hex(canonicalizeMarkdown(text))) },
      [[1, 0, 0, 0]]
    )
    const r = await queryVaultIndex(cont, vault, { query: 'alpha', embedModel: 'bge-m3' }, assertSafePath)
    expect(r.hits).toHaveLength(1)
    expect(r.hits[0].fresh).toBe('fresh')
    expect(r.identity.digest).toBe('sha256:aaa')
  })
})
