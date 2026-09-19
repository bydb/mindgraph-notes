import { describe, it, expect } from 'vitest'
import { reserveFreeNoteName } from './noteFileName'

describe('reserveFreeNoteName (F40)', () => {
  it('freier Basisname wird genommen', async () => {
    expect(await reserveFreeNoteName('A', async () => false)).toBe('A.md')
  })
  it('erster freier Suffix nach belegten Namen', async () => {
    const taken = new Set(['A.md', 'A (2).md', 'A (3).md'])
    expect(await reserveFreeNoteName('A', async (f) => taken.has(f))).toBe('A (4).md')
  })
  it('Basisname und alle Suffixe bis (20) belegt → null, nie ein ungeprüfter Kandidat', async () => {
    const checked: string[] = []
    const result = await reserveFreeNoteName('A', async (f) => { checked.push(f); return true })
    expect(result).toBeNull()
    expect(checked).toHaveLength(20)
    expect(checked[19]).toBe('A (20).md')
  })
})
