import { describe, it, expect } from 'vitest'
import { validateCatalog, validateCatalogSemantics } from './validation'
import type { CatalogDocument } from './manifest'

const valid: CatalogDocument = {
  catalogVersion: 1,
  plugins: [
    { id: 'mindgraph-demo', name: 'MindGraph Demo', repo: 'bydb/mindgraph-plugin-demo', description: 'x', author: 'bydb', category: 'productivity' },
  ],
}

describe('validateCatalog', () => {
  it('akzeptiert ein gültiges Katalog-Dokument', () => {
    expect(validateCatalog(valid).valid).toBe(true)
  })
  it('verlangt catalogVersion === 1', () => {
    expect(validateCatalog({ ...valid, catalogVersion: 2 }).valid).toBe(false)
  })
  it('verlangt id/name/repo je Eintrag', () => {
    expect(validateCatalog({ catalogVersion: 1, plugins: [{ id: 'x', name: 'X' }] }).valid).toBe(false)
    expect(validateCatalog({ catalogVersion: 1, plugins: [{ name: 'X', repo: 'o/r' }] }).valid).toBe(false)
  })
  it('lehnt falsches id-Pattern + unbekannte Felder ab', () => {
    expect(validateCatalog({ catalogVersion: 1, plugins: [{ id: 'INVALID', name: 'X', repo: 'o/r' }] }).valid).toBe(false)
    expect(validateCatalog({ catalogVersion: 1, plugins: [{ id: 'x', name: 'X', repo: 'o/r', extra: 1 }] }).valid).toBe(false)
  })
  it('erlaubt fehlende optionale Felder (nur id/name/repo Pflicht)', () => {
    expect(validateCatalog({ catalogVersion: 1, plugins: [{ id: 'x', name: 'X', repo: 'o/r' }] }).valid).toBe(true)
  })
})

describe('validateCatalogSemantics', () => {
  it('akzeptiert eindeutige ids', () => {
    expect(validateCatalogSemantics(valid).valid).toBe(true)
  })
  it('lehnt doppelte ids ab', () => {
    const dup: CatalogDocument = {
      catalogVersion: 1,
      plugins: [
        { id: 'a', name: 'A', repo: 'o/a' },
        { id: 'a', name: 'A2', repo: 'o/a2' },
      ],
    }
    const r = validateCatalogSemantics(dup)
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toMatch(/Doppelte/)
  })
})
