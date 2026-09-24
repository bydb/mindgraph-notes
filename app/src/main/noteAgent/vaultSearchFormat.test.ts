import { describe, expect, it } from 'vitest'
import { clampResults, formatVaultSearchResult, VAULT_SEARCH_MAX_EXCERPT, VAULT_SEARCH_MAX_RESULTS, VAULT_SEARCH_MAX_TOTAL } from './vaultSearchFormat'
import type { VaultHit } from '../rag/vaultRetrieve'

function hit(fileRel: string, text: string, score = 0.7): VaultHit {
  return { fileRel, chunkIndex: 0, heading: 'Abschnitt', text, score, sourceStart: 0, sourceEnd: text.length, startLine: 1, sourceHash: 'h', chunkHash: 'c', fresh: 'fresh' as VaultHit['fresh'], kind: null, dateValue: null }
}

describe('vault_search — Antwortformat', () => {
  it('„keine Treffer“ behauptet nie, dass es nichts gibt, und verweist auf note_search', () => {
    const r = formatVaultSearchResult({ hits: [], belowFloor: true, noFreshSource: false })
    expect(r.content).toContain('NICHT, dass es im Vault nichts dazu gibt')
    expect(r.content).toContain('note_search')
    expect(r.paths).toEqual([])
  })

  it('unterscheidet „nicht mehr aktuell“ von „unter der Schwelle“', () => {
    expect(formatVaultSearchResult({ hits: [], belowFloor: false, noFreshSource: true }).content).toContain('nicht mehr aktuell')
  })

  it('kürzt lange Auszüge sichtbar', () => {
    const r = formatVaultSearchResult({ hits: [hit('a.md', 'x'.repeat(VAULT_SEARCH_MAX_EXCERPT + 50))], belowFloor: false, noFreshSource: false })
    expect(r.content).toContain('[gekürzt]')
    expect(r.paths).toEqual(['a.md'])
  })

  it('hält das Gesamtbudget ein und meldet weggelassene Treffer', () => {
    const hits = Array.from({ length: 20 }, (_, i) => hit(`n${i}.md`, 'y'.repeat(VAULT_SEARCH_MAX_EXCERPT)))
    const r = formatVaultSearchResult({ hits, belowFloor: false, noFreshSource: false })
    expect(r.content.length).toBeLessThanOrEqual(VAULT_SEARCH_MAX_TOTAL + 300)
    expect(r.content).toMatch(/weitere Treffer passen nicht/)
    expect(r.paths.length).toBeLessThan(20)
  })

  it('begrenzt die Trefferzahl', () => {
    expect(clampResults(50)).toBe(VAULT_SEARCH_MAX_RESULTS)
    expect(clampResults(0)).toBe(1)
    expect(clampResults('abc')).toBeGreaterThan(0)
  })
})
