import { describe, expect, it } from 'vitest'
import { diffIndexAgainstVault, diffSize } from './reconcile'

const idx = { 'a.md': { sourceHash: 'A' }, 'b.md': { sourceHash: 'B' }, 'c.md': { sourceHash: 'C' } }

describe('diffIndexAgainstVault', () => {
  it('nichts geändert → leer (kein Lauf, kein Neuschreiben)', () => {
    const d = diffIndexAgainstVault(idx, [
      { rel: 'a.md', sourceHash: 'A', derived: false },
      { rel: 'b.md', sourceHash: 'B', derived: false },
      { rel: 'c.md', sourceHash: 'C', derived: false }
    ])
    expect(diffSize(d)).toBe(0)
  })

  it('findet neue, geänderte und gelöschte Dateien', () => {
    const d = diffIndexAgainstVault(idx, [
      { rel: 'a.md', sourceHash: 'A', derived: false },
      { rel: 'b.md', sourceHash: 'B2', derived: false },
      { rel: 'neu.md', sourceHash: 'N', derived: false }
    ])
    expect(d).toEqual({ added: ['neu.md'], modified: ['b.md'], removed: ['c.md'] })
  })

  it('unlesbare Dateien werden weder hinzugefügt noch entfernt', () => {
    const d = diffIndexAgainstVault(idx, [
      { rel: 'a.md', sourceHash: null, derived: false },
      { rel: 'b.md', sourceHash: 'B', derived: false },
      { rel: 'c.md', sourceHash: 'C', derived: false },
      { rel: 'x.md', sourceHash: null, derived: false }
    ])
    expect(diffSize(d)).toBe(0)
  })

  it('abgeleitete KI-Notizen: aus dem Index nehmen, nie aufnehmen', () => {
    const d = diffIndexAgainstVault(idx, [
      { rel: 'a.md', sourceHash: 'A', derived: true },
      { rel: 'b.md', sourceHash: 'B', derived: false },
      { rel: 'c.md', sourceHash: 'C', derived: false },
      { rel: 'brain.md', sourceHash: 'Z', derived: true }
    ])
    expect(d).toEqual({ added: [], modified: [], removed: ['a.md'] })
  })
})
