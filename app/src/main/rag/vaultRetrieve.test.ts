import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { INDEX_POLICY_VERSION } from '../../shared/rag/indexPolicy'
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

import { rankCandidates, selectHits, verifyHits, queryVaultIndex, VaultIdentityError, locateSource, rerankLexical, familyKey, selectForQuery } from './vaultRetrieve'
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
    meta: { identity: { model: 'bge-m3:latest', digest: 'sha256:aaa', dim: 4, formatVersion: 1, chunkingVersion: 2, policyVersion: INDEX_POLICY_VERSION, excludeKey: '' }, createdAt: 1, files, chunks },
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
    // Synthetische Vektoren sind hier teils identisch — Near-Duplikat-Schwelle aus, geprüft wird exaktes Dedupe + Deckel.
    const sel = selectHits(c, ranked, 8, 2, 0)
    const files = sel.map((s) => s.chunk.fileRel)
    expect(files.filter((f) => f === 'a.md')).toHaveLength(2)
    // b.md ist ein Duplikat von a.md/0 → nicht dabei
    expect(files).not.toContain('b.md')
    expect(files).toContain('c.md')
  })
})

describe('Altindex-Migration (F42)', () => {
  it('abgeleitete KI-Notizen fallen bei der Frischeprüfung weg, auch wenn ein alter Index sie noch enthält', async () => {
    const text = Array.from({ length: 5 }, (_, i) => `Satz ${i + 1} mit genug Text für einen eigenen Chunk im Index.`).join(' ')
    const brain = `---\ntype: brain-day\ndate: 2026-09-19\n---\n\n${text}\n`
    const answer = `---\ntitle: "Antwort"\nki-typ: vault-chat-antwort\n---\n\n${text}\n`
    const normal = `# Echte Notiz\n\n${text}\n`
    await fs.writeFile(path.join(vault, 'brain.md'), brain)
    await fs.writeFile(path.join(vault, 'antwort.md'), answer)
    await fs.writeFile(path.join(vault, 'echt.md'), normal)
    const mk = (rel: string, content: string) => {
      const c = chunkMarkdown(canonicalizeMarkdown(content))[0]
      return chunk(rel, 0, c.text, { sourceStart: c.sourceStart, sourceEnd: c.sourceEnd, startLine: c.startLine })
    }
    const selected = [mk('brain.md', brain), mk('antwort.md', answer), mk('echt.md', normal)]
      .map((c) => ({ chunk: c, score: 0.9 }))
    const files = Object.fromEntries(selected.map((x) => [x.chunk.fileRel, file(sha256Hex(canonicalizeMarkdown(x.chunk.text)))]))
    const c = container(selected.map((x) => x.chunk), files, selected.map(() => [1, 0, 0, 0]))
    const { hits } = await verifyHits(vault, c, selected, assertSafePath)
    expect(hits.map((h) => h.fileRel)).toEqual(['echt.md'])
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

describe('locateSource (F28)', () => {
  it('fresh, relocated, changed (doppelte Passage), missing', async () => {
    const passage = Array.from({ length: 4 }, (_, i) => `Stabile Passage Satz ${i + 1}, die eindeutig bleibt und lang genug ist.`).join(' ')
    const stable = '## Stabil\n\n' + passage
    const filler = Array.from({ length: 20 }, (_, i) => `Vor Satz ${i + 1} mit genug Text für einen Chunk.`).join(' ')
    const original = '# B\n\n' + filler + '\n\n' + stable + '\n'
    await fs.writeFile(path.join(vault, 'b.md'), original)
    const canon = canonicalizeMarkdown(original)
    const target = chunkMarkdown(original).find((x) => x.text === stable)!
    const ref = { fileRel: 'b.md', sourceHash: sha256Hex(canon), chunkHash: sha256Hex(stable), sourceStart: target.sourceStart, sourceEnd: target.sourceEnd, startLine: target.startLine }

    const fresh = await locateSource(vault, ref, assertSafePath)
    expect(fresh.status).toBe('fresh')

    const changed = '# B\n\nNeu davor.\n\n' + filler + '\n\n' + stable + '\n'
    await fs.writeFile(path.join(vault, 'b.md'), changed)
    const rel = await locateSource(vault, ref, assertSafePath)
    expect(rel.status).toBe('relocated')
    if (rel.status === 'relocated') {
      const t2 = chunkMarkdown(changed).find((x) => x.text === stable)!
      expect(rel.startLine).toBe(t2.startLine)
      expect(rel.heading).toBe('Stabil')
      expect(rel.sourceHash).toBe(sha256Hex(canonicalizeMarkdown(changed)))
    }

    // Zweimal dieselbe Sektion → nicht eindeutig → „geändert" (die Passage hinter dem Füller,
    // sonst zieht der Mini-Chunk-Merge die Überschrift „# B" in den ersten Treffer)
    await fs.writeFile(path.join(vault, 'b.md'), '# B\n\n' + filler + '\n\n' + stable + '\n\n' + stable + '\n')
    expect((await locateSource(vault, ref, assertSafePath)).status).toBe('changed')

    await fs.rm(path.join(vault, 'b.md'))
    expect((await locateSource(vault, ref, assertSafePath)).status).toBe('missing')
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

describe('rerankLexical (Wortabgleich nur zur Umsortierung)', () => {
  it('ein seltenes Fragewort hebt den passenden Chunk über einen knapp ähnlicheren; die Bedeutungsnähe bleibt als score', () => {
    const container = { meta: { chunks: [
      { fileRel: 'brain/2026/07/30.md', heading: 'Heute im Fokus', text: 'Medienzentrum, Termin, Neubewertung erwähnt, Team' },
      { fileRel: 'inbox/Neubewertung Stelle Hitzel.md', heading: '', text: 'Stellenbewertung Stelle Hitzel im ersten Entwurf erstellt' },
      { fileRel: 'x/Fortbildung.md', heading: '', text: 'Medienzentrum Fortbildung' }
    ] } } as unknown as Parameters<typeof rerankLexical>[0]
    const ranked = [{ row: 0, score: 0.60 }, { row: 1, score: 0.58 }, { row: 2, score: 0.57 }]
    const out = rerankLexical(container, 'Wann war die Stellenbewertung der Stelle Hitzel?', ranked, 0.3)
    expect(out[0].row).toBe(1)
    expect(out[0].score).toBe(0.58)
    expect(rerankLexical(container, 'egal', ranked, 0)).toEqual(ranked)
  })
})

describe('selectHits: Near-Duplikate über Dateien hinweg', () => {
  const dim = 4
  const vectors = Float32Array.from([1, 0, 0, 0,  0.999, 0.04, 0, 0,  0, 1, 0, 0])
  const container = { meta: { identity: { dim }, chunks: [
    { fileRel: 'a/_STATUS.md', text: 'Risiken: Termin offen' },
    { fileRel: 'a/_STATUS (2).md', text: 'Risiken: Termin offen.' },
    { fileRel: 'b/Anderes.md', text: 'Etwas ganz anderes' }
  ] }, vectors } as unknown as Parameters<typeof selectHits>[0]
  const ranked = [{ row: 0, score: 0.7 }, { row: 1, score: 0.69 }, { row: 2, score: 0.6 }]
  it('die Kopie mit fast gleichem Embedding wird übersprungen, der andere Chunk rückt nach', () => {
    expect(selectHits(container, ranked, 8, 2, 0.97).map((h) => h.chunk.fileRel)).toEqual(['a/_STATUS.md', 'b/Anderes.md'])
  })
  it('Schwelle 0 = aus: exakte Dedupe greift nicht (Punkt am Ende), aber die „(2)“-Kopie fällt über die Dateifamilie', () => {
    expect(selectHits(container, ranked, 8, 2, 0).map((h) => h.chunk.fileRel)).toEqual(['a/_STATUS.md', 'b/Anderes.md'])
  })
})

describe('familyKey / Deckel pro Dateifamilie', () => {
  it('nur das maschinelle Kopie-Muster „(n)“ gruppiert; eigene Fassungsnamen bleiben getrennt (F45)', () => {
    expect(familyKey('p/_STATUS-2026-W20 (6).md')).toBe(familyKey('p/_STATUS-2026-W20.md'))
    // Vom Nutzer vergebene Namen sind eigenständige Dateien — sie dürfen sich nicht verdrängen.
    expect(familyKey('n/Konzept - alt.md')).not.toBe(familyKey('n/Konzept.md'))
    expect(familyKey('n/Konzept - final.md')).not.toBe(familyKey('n/Konzept - alt.md'))
    expect(familyKey('n/Notiz v2.md')).not.toBe(familyKey('n/Notiz.md'))
    expect(familyKey('n/10000 Euro Erlass - Ueberprueft.md')).not.toBe(familyKey('n/10000 Euro Erlass.md'))
    expect(familyKey('p/_STATUS-2026-W21.md')).not.toBe(familyKey('p/_STATUS-2026-W22.md'))
    expect(familyKey('a/Notiz.md')).not.toBe(familyKey('b/Notiz.md'))
  })
  it('nur die zuerst gewählte Datei einer Familie liefert Quellen; die Kopie bekommt keinen Platz', () => {
    const dim = 2
    const vectors = Float32Array.from([1, 0,  0, 1,  1, 0,  0, 1])
    const container = { meta: { identity: { dim }, chunks: [
      { fileRel: 'p/Erlass.md', text: 'A' }, { fileRel: 'p/Erlass.md', text: 'B' },
      { fileRel: 'p/Erlass (2).md', text: 'C' }, { fileRel: 'q/Anderes.md', text: 'D' }
    ] }, vectors } as unknown as Parameters<typeof selectHits>[0]
    const ranked = [0, 1, 2, 3].map((row, i) => ({ row, score: 0.9 - i * 0.1 }))
    expect(selectHits(container, ranked, 8, 2, 0).map((h) => h.chunk.fileRel)).toEqual(['p/Erlass.md', 'p/Erlass.md', 'q/Anderes.md'])
    // Deckel 3: der dritte Platz der Familie geht NICHT an die Kopie
    expect(selectHits(container, ranked, 8, 3, 0).map((h) => h.chunk.fileRel)).toEqual(['p/Erlass.md', 'p/Erlass.md', 'q/Anderes.md'])
  })
})

describe('selectForQuery — ein Auswahlpfad für App und Messung (F43)', () => {
  const dim = 4
  // 40 Kandidaten: der semantisch beste steht vorn, ein lexikalisch perfekter Treffer auf Rang 35.
  const chunks = Array.from({ length: 40 }, (_, i) => ({
    fileRel: `n/${i}.md`, chunkIndex: 0, heading: '', text: i === 34 ? 'Zirkoniumstifte Regal Vierzehn' : `Allgemeiner Text ${i}`,
    sourceStart: 0, sourceEnd: 10, startLine: 1, sourceHash: `h${i}`, chunkHash: `c${i}`, kind: null, dateValue: null
  }))
  const vectors = new Float32Array(chunks.length * dim)
  // Cosine ignoriert die Länge: die Richtung muss variieren, sonst sind alle Vektoren gleich nah.
  chunks.forEach((_, i) => { vectors[i * dim] = 1; vectors[i * dim + 1] = i * 0.02 })
  const cosineOf = (i: number) => 1 / Math.sqrt(1 + (i * 0.02) ** 2)
  const files = Object.fromEntries(chunks.map((c) => [c.fileRel, { sourceHash: c.sourceHash, mtime: 1, size: 1, kind: null, dateValue: null, dateSource: null }]))
  const container = { meta: { identity: { dim }, createdAt: 1, files, chunks }, vectors } as unknown as Parameters<typeof selectForQuery>[0]
  const q = Float32Array.from([1, 0, 0, 0])
  const opts = { topK: 8, minScore: 0, perFileCap: 2, oversample: 4, excludeFolders: [], lexicalWeight: 0.3, nearDupCosine: 0 }

  it('die Kandidatentiefe ist topK × oversample — ein Treffer dahinter kommt NICHT in die Auswahl', () => {
    const r = selectForQuery(container, q, 'Zirkoniumstifte Regal Vierzehn', opts)
    expect(r.candidatesConsidered).toBe(32)
    expect(r.selected.some((h) => h.chunk.fileRel === 'n/34.md')).toBe(false)
  })
  it('innerhalb der Tiefe hebt der Wortabgleich den passenden Treffer nach vorn', () => {
    const near = { ...container, meta: { ...container.meta, chunks: chunks.map((c, i) => i === 10 ? { ...c, text: 'Zirkoniumstifte Regal Vierzehn' } : c) } } as typeof container
    const r = selectForQuery(near, q, 'Zirkoniumstifte Regal Vierzehn', opts)
    expect(r.selected[0].chunk.fileRel).toBe('n/10.md')
    // `score` bleibt die Bedeutungsnähe, nicht der kombinierte Wert
    expect(r.selected[0].score).toBeCloseTo(cosineOf(10), 5)
  })
  it('unter dem Floor: keine Auswahl, bester Score wird gemeldet', () => {
    const orthogonal = Float32Array.from([0, 0, 1, 0])
    const r = selectForQuery(container, orthogonal, 'egal', { ...opts, minScore: 0.5 })
    expect(r.belowFloor).toBe(true)
    expect(r.selected).toEqual([])
    expect(r.bestScore).toBeCloseTo(0, 5)
  })
})
