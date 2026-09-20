import { describe, it, expect } from 'vitest'
import { embeddingsCompatible, encodeVaultIndex, decodeVaultIndex, VaultIndexFormatError, VAULT_INDEX_HEADER_SIZE, crc32, identityString, identitiesEqual, excludeKeyFor, isIndexable, matchesFilters, modelSlug, cosineRow, vectorNorm, type VaultIndexContainer, type VaultIndexMeta, type VaultFileMeta } from './vaultIndex'

function sampleMeta(chunkCount = 3, dim = 4): VaultIndexMeta {
  const files: Record<string, VaultFileMeta> = {
    'a/eins.md': { sourceHash: 'h1', mtime: 1, size: 10, kind: 'problem', dateValue: 1000, dateSource: 'filename' },
    'b/zwei.md': { sourceHash: 'h2', mtime: 2, size: 20, kind: null, dateValue: null, dateSource: 'mtime' }
  }
  const chunks = Array.from({ length: chunkCount }, (_, i) => ({
    fileRel: i < 2 ? 'a/eins.md' : 'b/zwei.md',
    chunkIndex: i < 2 ? i : 0,
    heading: `H${i}`,
    sourceStart: i * 10,
    sourceEnd: i * 10 + 5,
    startLine: i + 1,
    chunkHash: `c${i}`,
    text: `Text ${i} mit Umlauten äöü`
  }))
  return {
    identity: { model: 'bge-m3:latest', digest: 'sha256:abc', dim, formatVersion: 1, chunkingVersion: 2, excludeKey: '' },
    createdAt: 123,
    files,
    chunks
  }
}

function sampleContainer(chunkCount = 3, dim = 4): VaultIndexContainer {
  const vectors = new Float32Array(chunkCount * dim)
  for (let i = 0; i < vectors.length; i++) vectors[i] = Math.sin(i) * 0.5
  return { meta: sampleMeta(chunkCount, dim), vectors, generation: 7 }
}

describe('crc32', () => {
  it('liefert den bekannten Wert für "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('Container: kodieren und dekodieren', () => {
  it('Roundtrip erhält Metadaten, Vektoren und Generation', () => {
    const c = sampleContainer()
    const bytes = encodeVaultIndex(c)
    expect(bytes.length).toBe(VAULT_INDEX_HEADER_SIZE + new TextEncoder().encode(JSON.stringify(c.meta)).length + c.vectors.byteLength)
    const back = decodeVaultIndex(bytes)
    expect(back.generation).toBe(7)
    expect(back.meta).toEqual(c.meta)
    expect(Array.from(back.vectors)).toEqual(Array.from(c.vectors))
  })

  it('leerer Index (0 Chunks) ist gültig', () => {
    const c: VaultIndexContainer = { meta: { ...sampleMeta(0), chunks: [] }, vectors: new Float32Array(0), generation: 1 }
    const back = decodeVaultIndex(encodeVaultIndex(c))
    expect(back.meta.chunks).toEqual([])
    expect(back.vectors.length).toBe(0)
  })

  it('abgeschnittene Datei wird abgelehnt', () => {
    const bytes = encodeVaultIndex(sampleContainer())
    expect(() => decodeVaultIndex(bytes.subarray(0, bytes.length - 1))).toThrow(VaultIndexFormatError)
    expect(() => decodeVaultIndex(bytes.subarray(0, 10))).toThrow(/Header/)
  })

  it('angehängte Bytes werden abgelehnt', () => {
    const bytes = encodeVaultIndex(sampleContainer())
    const longer = new Uint8Array(bytes.length + 3)
    longer.set(bytes)
    expect(() => decodeVaultIndex(longer)).toThrow(/Länge/)
  })

  it('ein gekipptes Byte im Vektorblock wird erkannt', () => {
    const bytes = encodeVaultIndex(sampleContainer())
    const bad = new Uint8Array(bytes)
    bad[bad.length - 2] ^= 0x01
    expect(() => decodeVaultIndex(bad)).toThrow(/Vektor-Prüfsumme/)
  })

  it('ein gekipptes Byte im Metadatenblock wird erkannt', () => {
    const bytes = encodeVaultIndex(sampleContainer())
    const bad = new Uint8Array(bytes)
    bad[VAULT_INDEX_HEADER_SIZE + 5] ^= 0x01
    expect(() => decodeVaultIndex(bad)).toThrow(/Metadaten-Prüfsumme/)
  })

  it('manipulierter Header wird erkannt', () => {
    const bytes = encodeVaultIndex(sampleContainer())
    const bad = new Uint8Array(bytes)
    bad[16] ^= 0x01 // chunkCount
    expect(() => decodeVaultIndex(bad)).toThrow(/Header-Prüfsumme/)
  })

  it('falsches Magic wird erkannt', () => {
    const bytes = encodeVaultIndex(sampleContainer())
    const bad = new Uint8Array(bytes)
    bad[0] = 0x58
    expect(() => decodeVaultIndex(bad)).toThrow(/Magic/)
  })

  it('Vektorzahl ≠ chunkCount × dim wird beim Kodieren abgelehnt', () => {
    const c = sampleContainer()
    c.vectors = new Float32Array(5)
    expect(() => encodeVaultIndex(c)).toThrow(/Vektorzahl/)
  })

  it('funktioniert auch, wenn der Puffer nicht 4-Byte-ausgerichtet ist', () => {
    const bytes = encodeVaultIndex(sampleContainer())
    const shifted = new Uint8Array(bytes.length + 1)
    shifted.set(bytes, 1)
    const back = decodeVaultIndex(shifted.subarray(1))
    expect(back.meta.chunks).toHaveLength(3)
  })
})

describe('Identität', () => {
  it('ist reihenfolgestabil und vergleicht alle Felder', () => {
    const a = sampleMeta().identity
    expect(identitiesEqual(a, { ...a })).toBe(true)
    expect(identitiesEqual(a, { ...a, digest: 'sha256:xyz' })).toBe(false)
    expect(identitiesEqual(a, { ...a, dim: 8 })).toBe(false)
    expect(identitiesEqual(a, { ...a, excludeKey: 'x/' })).toBe(false)
    expect(identityString(a)).toContain('"digest":"sha256:abc"')
  })

  it('excludeKey normalisiert, sortiert und dedupliziert', () => {
    expect(excludeKeyFor(['B/', 'a\\sub', 'a/sub/', ''])).toBe('B/\na/sub/')
  })

  it('modelSlug ist dateinamensicher', () => {
    expect(modelSlug('bge-m3:latest')).toBe('bge-m3-latest')
    expect(modelSlug('mlx-community/qwen:7b')).toBe('mlx-community-qwen-7b')
    expect(modelSlug('')).toBe('model')
  })
})

describe('isIndexable', () => {
  it('nur Markdown, keine versteckten Ordner, keine Vorlagen, keine Ausschlüsse', () => {
    expect(isIndexable('100 - Projekte/x.md', [])).toBe(true)
    expect(isIndexable('x.MD', [])).toBe(true)
    expect(isIndexable('x.txt', [])).toBe(false)
    expect(isIndexable('.mindgraph/rag/x.md', [])).toBe(false)
    expect(isIndexable('.trash/x.md', [])).toBe(false)
    expect(isIndexable('a/.sync-trash/x.md', [])).toBe(false)
    expect(isIndexable('a/.hidden.md', [])).toBe(false)
    expect(isIndexable('Templates/x.md', [])).toBe(false)
    expect(isIndexable('900 - Vorlagen/x.md', [])).toBe(true) // nur exakter Segmentname
    expect(isIndexable('a/templates/b/x.md', [])).toBe(false)
    expect(isIndexable('400 - Archiv/x.md', ['400 - Archiv'])).toBe(false)
    expect(isIndexable('400 - Archiv/x.md', ['400 - Archiv/'])).toBe(false)
    expect(isIndexable('400 - Archiv-neu/x.md', ['400 - Archiv'])).toBe(true)
    expect(isIndexable('a\\b\\x.md', ['a/b'])).toBe(false)
    expect(isIndexable('', [])).toBe(false)
  })
})

describe('matchesFilters', () => {
  const file: VaultFileMeta = { sourceHash: 'h', mtime: 0, size: 0, kind: 'solution', dateValue: 5000, dateSource: 'frontmatter' }
  it('ohne Filter immer wahr', () => {
    expect(matchesFilters('a/x.md', file, undefined)).toBe(true)
    expect(matchesFilters('a/x.md', file, {})).toBe(true)
  })
  it('Ordnerpräfix', () => {
    expect(matchesFilters('a/x.md', file, { folders: ['a'] })).toBe(true)
    expect(matchesFilters('ab/x.md', file, { folders: ['a'] })).toBe(false)
    expect(matchesFilters('b/x.md', file, { folders: ['a', 'b/'] })).toBe(true)
  })
  it('Kategorie', () => {
    expect(matchesFilters('a/x.md', file, { kinds: ['solution'] })).toBe(true)
    expect(matchesFilters('a/x.md', file, { kinds: ['problem'] })).toBe(false)
    expect(matchesFilters('a/x.md', { ...file, kind: null }, { kinds: ['problem'] })).toBe(false)
  })
  it('Zeitbereich, ohne Datum fällt die Datei raus', () => {
    expect(matchesFilters('a/x.md', file, { dateFrom: 1000, dateTo: 9000 })).toBe(true)
    expect(matchesFilters('a/x.md', file, { dateFrom: 6000 })).toBe(false)
    expect(matchesFilters('a/x.md', file, { dateTo: 4000 })).toBe(false)
    expect(matchesFilters('a/x.md', { ...file, dateValue: null }, { dateFrom: 0 })).toBe(false)
    expect(matchesFilters('a/x.md', { ...file, dateValue: null }, { dateFrom: null, dateTo: null })).toBe(true)
  })
})

describe('cosineRow', () => {
  it('rechnet Cosine über eine Zeile ohne Kopie', () => {
    const vectors = new Float32Array([1, 0, 0, 1, 0, 1, 0, 0])
    const q = new Float32Array([1, 0, 0, 1])
    const n = vectorNorm(q)
    expect(cosineRow(vectors, 0, 4, q, n)).toBeCloseTo(1)
    expect(cosineRow(vectors, 1, 4, q, n)).toBeCloseTo(0)
  })
})

describe('Ordner-Abgleich in Vergleichsform (Variantenselektor, NFC, node_modules)', () => {
  it('Ausschluss mit U+FE0F trifft den Ordner ohne — und umgekehrt', () => {
    expect(isIndexable('400 - 🏛 Archiv/2021/x.md', ['400 - 🏛\uFE0F Archiv'])).toBe(false)
    expect(isIndexable('400 - 🏛\uFE0F Archiv/2021/x.md', ['400 - 🏛 Archiv'])).toBe(false)
    expect(isIndexable('401 - Aktiv/x.md', ['400 - 🏛\uFE0F Archiv'])).toBe(true)
  })
  it('NFD- und NFC-Schreibweise eines Umlauts gelten als derselbe Ordner', () => {
    expect(isIndexable('Bu\u0308ro/x.md', ['B\u00fcro'])).toBe(false)
  })
  it('beide Schreibweisen ergeben denselben Ausschluss-Schlüssel (Identität)', () => {
    expect(excludeKeyFor(['400 - 🏛\uFE0F Archiv'])).toBe(excludeKeyFor(['400 - 🏛 Archiv']))
  })
  it('node_modules ist nie indexierbar, Ordnerfilter der Abfrage nutzt dieselbe Vergleichsform', () => {
    expect(isIndexable('Projekt/node_modules/jsonfile/CHANGELOG.md', [])).toBe(false)
    const file = { sourceHash: 'h', mtime: 0, size: 1, chunkCount: 1 } as unknown as Parameters<typeof matchesFilters>[1]
    expect(matchesFilters('400 - 🏛 Archiv/x.md', file, { folders: ['400 - 🏛\uFE0F Archiv'] })).toBe(true)
  })
})

describe('embeddingsCompatible', () => {
  const base = { model: 'bge-m3', digest: 'sha256:a', dim: 1024, formatVersion: 1, chunkingVersion: 2, excludeKey: '' }
  it('andere Ausschlussliste: Embeddings bleiben wiederverwendbar, Identität ist trotzdem verschieden', () => {
    const other = { ...base, excludeKey: '400 - Archiv/' }
    expect(embeddingsCompatible(base, other)).toBe(true)
    expect(identitiesEqual(base, other)).toBe(false)
  })
  it('anderer Digest, andere Dimension oder Version: nicht wiederverwendbar', () => {
    expect(embeddingsCompatible(base, { ...base, digest: 'sha256:b' })).toBe(false)
    expect(embeddingsCompatible(base, { ...base, dim: 768 })).toBe(false)
    expect(embeddingsCompatible(base, { ...base, chunkingVersion: 3 })).toBe(false)
  })
})
