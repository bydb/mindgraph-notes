import { describe, it, expect } from 'vitest'
import {
  canonicalJsonString,
  canonicalJsonBytes,
  parseUtf8Json,
  artifactPathError,
  assertArtifactPath,
  validateIntegrityDoc,
  validateSigEnvelope,
  type IntegrityDoc,
} from './format'
import { ArtifactError, ARTIFACT_LIMITS } from './limits'

describe('kanonische JSON-Bytes', () => {
  it('ist JSON.stringify(v,null,2) + LF, ohne BOM', () => {
    const s = canonicalJsonString({ b: 1, a: 2 })
    expect(s).toBe('{\n  "b": 1,\n  "a": 2\n}\n')
    const buf = canonicalJsonBytes({ x: 1 })
    expect(buf[0]).not.toBe(0xef) // kein BOM
    expect(buf[buf.length - 1]).toBe(0x0a) // endet auf LF
  })
})

describe('parseUtf8Json', () => {
  it('akzeptiert gültiges JSON', () => {
    expect(parseUtf8Json(Buffer.from('{"a":1}', 'utf8'), 'json-invalid', 'x')).toEqual({ a: 1 })
  })
  it('lehnt BOM ab', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}', 'utf8')])
    expect(() => parseUtf8Json(withBom, 'json-invalid', 'x')).toThrow(/BOM/)
  })
  it('lehnt kaputtes JSON ab', () => {
    expect(() => parseUtf8Json(Buffer.from('{nope', 'utf8'), 'json-invalid', 'x')).toThrow(/JSON/)
  })
})

describe('artifactPathError / assertArtifactPath', () => {
  it('akzeptiert gültige relative lowercase-Pfade', () => {
    for (const p of ['main.js', 'assets/icon.png', 'a/b/c/d.txt', '..js', 'manifest.json']) {
      expect(artifactPathError(p), p).toBeNull()
    }
  })

  it('lehnt die typischen Angriffe ab', () => {
    expect(artifactPathError('')).toMatch(/leer/)
    expect(artifactPathError('/abs/main.js')).toMatch(/absolut/)
    expect(artifactPathError('a\\b.js')).toMatch(/Backslash/)
    expect(artifactPathError('Main.js')).toMatch(/Großbuchstaben/)
    expect(artifactPathError('a b.js')).toMatch(/unerlaubte Zeichen/)
    expect(artifactPathError('./main.js')).toMatch(/führendes/)
    expect(artifactPathError('../main.js')).toMatch(/'\.\.'-Segment/)
    expect(artifactPathError('a/../b.js')).toMatch(/'\.\.'-Segment/)
    expect(artifactPathError('a/./b.js')).toMatch(/'\.'-Segment/)
    expect(artifactPathError('a//b.js')).toMatch(/leeres Pfadsegment/)
    expect(artifactPathError('a/b/c.js/')).toMatch(/leeres Pfadsegment/)
  })

  it('erzwingt Längen-, Tiefen- und Segment-Limits', () => {
    expect(artifactPathError('a'.repeat(241))).toMatch(/länger als 240/)
    expect(artifactPathError('a/b/c/d/e/f/g/h/i.js')).toMatch(/Pfadtiefe/) // 9 Segmente
    expect(artifactPathError('x'.repeat(101) + '.js')).toMatch(/100 ASCII-Bytes/) // Segment-Länge 104
    expect(artifactPathError('s'.repeat(101))).toMatch(/100 ASCII-Bytes/)
  })

  it('assertArtifactPath wirft ArtifactError(path-invalid)', () => {
    expect(() => assertArtifactPath('../x')).toThrowError(ArtifactError)
    try {
      assertArtifactPath('/x')
    } catch (e) {
      expect((e as ArtifactError).code).toBe('path-invalid')
    }
  })
})

const validIntegrity = (): IntegrityDoc => ({
  formatVersion: 1,
  algorithm: 'sha256',
  files: [
    { path: 'main.js', size: 10, sha256: 'a'.repeat(64) },
    { path: 'manifest.json', size: 20, sha256: 'b'.repeat(64) },
  ],
})

describe('validateIntegrityDoc', () => {
  it('akzeptiert ein gültiges, sortiertes Dokument', () => {
    expect(validateIntegrityDoc(validIntegrity()).files).toHaveLength(2)
  })

  it('lehnt falsche formatVersion/algorithm ab', () => {
    expect(() => validateIntegrityDoc({ ...validIntegrity(), formatVersion: 2 })).toThrow(/formatVersion/)
    expect(() => validateIntegrityDoc({ ...validIntegrity(), algorithm: 'sha1' })).toThrow(/algorithm/)
  })

  it('lehnt Fremd-Keys ab (top-level und Eintrag)', () => {
    expect(() => validateIntegrityDoc({ ...validIntegrity(), extra: 1 })).toThrow(/erwartet/)
    const bad = validIntegrity()
    ;(bad.files[0] as unknown as Record<string, unknown>).mode = 0o755
    expect(() => validateIntegrityDoc(bad)).toThrow(/erwartet \{path, size, sha256\}/)
  })

  it('lehnt ungültige size/sha256 ab', () => {
    expect(() => validateIntegrityDoc({ ...validIntegrity(), files: [{ path: 'a.js', size: -1, sha256: 'a'.repeat(64) }] })).toThrow(/size/)
    expect(() => validateIntegrityDoc({ ...validIntegrity(), files: [{ path: 'a.js', size: 1.5, sha256: 'a'.repeat(64) }] })).toThrow(/size/)
    expect(() => validateIntegrityDoc({ ...validIntegrity(), files: [{ path: 'a.js', size: 1, sha256: 'A'.repeat(64) }] })).toThrow(/sha256/) // uppercase
    expect(() => validateIntegrityDoc({ ...validIntegrity(), files: [{ path: 'a.js', size: 1, sha256: 'a'.repeat(63) }] })).toThrow(/sha256/) // zu kurz
  })

  it('lehnt unsortierte und doppelte Pfade ab', () => {
    const unsorted = { ...validIntegrity(), files: [validIntegrity().files[1], validIntegrity().files[0]] }
    expect(() => validateIntegrityDoc(unsorted)).toThrow(/sortiert/)
    const dup = { ...validIntegrity(), files: [validIntegrity().files[0], validIntegrity().files[0]] }
    expect(() => validateIntegrityDoc(dup)).toThrow(/sortiert|eindeutig/)
  })

  it('lehnt ungültige Pfade im Eintrag ab', () => {
    expect(() => validateIntegrityDoc({ ...validIntegrity(), files: [{ path: '../x', size: 1, sha256: 'a'.repeat(64) }] })).toThrow(/path/)
  })
})

const sigB64 = (n = 64) => Buffer.alloc(n).toString('base64')
const validSig = () => ({ formatVersion: 1, algorithm: 'ed25519', keyId: 'k1', signature: sigB64() })

describe('validateSigEnvelope', () => {
  it('akzeptiert eine gültige Hülle und liefert 64 Byte Signatur', () => {
    const { envelope, signature } = validateSigEnvelope(validSig())
    expect(envelope.keyId).toBe('k1')
    expect(signature).toHaveLength(64)
  })

  it('lehnt falsche formatVersion/algorithm/leere keyId ab', () => {
    expect(() => validateSigEnvelope({ ...validSig(), formatVersion: 2 })).toThrow(/formatVersion/)
    expect(() => validateSigEnvelope({ ...validSig(), algorithm: 'rsa' })).toThrow(/algorithm/)
    expect(() => validateSigEnvelope({ ...validSig(), keyId: '' })).toThrow(/keyId/)
  })

  it('lehnt nicht-kanonisches Base64 und falsche Länge ab', () => {
    expect(() => validateSigEnvelope({ ...validSig(), signature: 'not base64!!' })).toThrow(/Base64/)
    expect(() => validateSigEnvelope({ ...validSig(), signature: sigB64(32) })).toThrow(/64 Bytes/)
  })

  it('lehnt Fremd-Keys ab', () => {
    expect(() => validateSigEnvelope({ ...validSig(), kid: 'x' })).toThrow(/erwartet/)
  })
})

describe('Limits-Konstanten', () => {
  it('entsprechen der ADR-Tabelle', () => {
    expect(ARTIFACT_LIMITS.maxFiles).toBe(512)
    expect(ARTIFACT_LIMITS.maxSegmentBytes).toBe(100)
    expect(ARTIFACT_LIMITS.maxPathDepth).toBe(8)
  })
})
