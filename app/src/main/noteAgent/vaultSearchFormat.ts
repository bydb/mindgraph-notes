// Werkzeugantwort von `vault_search` — pur und getestet.
//
// Grenzen (Codex F06): Jede Werkzeugantwort bleibt über alle Iterationen im Verlauf. Deshalb
// harte Obergrenzen für Trefferzahl, Zeichen je Auszug und die ganze Antwort, jeweils mit
// sichtbarer Kürzungsmarke. Ehrlichkeit (F04/F05): Ein Auszug ist GESEHEN, nicht die ganze
// Notiz; „keine Treffer“ heißt nur „nichts Frisches über der Schwelle im Index“.

import type { VaultQueryResult } from '../rag/vaultRetrieve'

export const VAULT_SEARCH_MAX_QUERY = 300
export const VAULT_SEARCH_DEFAULT_RESULTS = 5
export const VAULT_SEARCH_MAX_RESULTS = 8
export const VAULT_SEARCH_MAX_EXCERPT = 600
export const VAULT_SEARCH_MAX_TOTAL = 4_000

const CUT = ' … [gekürzt]'

export function clampResults(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return VAULT_SEARCH_DEFAULT_RESULTS
  return Math.max(1, Math.min(VAULT_SEARCH_MAX_RESULTS, Math.floor(n)))
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > VAULT_SEARCH_MAX_EXCERPT ? flat.slice(0, VAULT_SEARCH_MAX_EXCERPT) + CUT : flat
}

export function formatVaultSearchResult(result: Pick<VaultQueryResult, 'hits' | 'belowFloor' | 'noFreshSource'>): { content: string; paths: string[] } {
  if (result.hits.length === 0) {
    const why = result.noFreshSource
      ? 'Es gab Kandidaten, aber sie sind nicht mehr aktuell (die Notizen haben sich seit dem Index geändert).'
      : 'Kein Treffer lag über der Relevanzschwelle.'
    return {
      content: `Keine frischen Treffer im Vault-Index. ${why} Das heißt NICHT, dass es im Vault nichts dazu gibt — versuche note_search mit 1-3 Stichworten.`,
      paths: []
    }
  }
  const lines: string[] = ['Treffer der Suche nach Bedeutung (Auszüge, nicht die ganzen Notizen):']
  const paths: string[] = []
  let used = lines[0].length
  let shown = 0
  for (const hit of result.hits) {
    const head = `${shown + 1}. ${hit.fileRel}${hit.heading ? ` — ${hit.heading}` : ''} (Relevanz ${hit.score.toFixed(2)})`
    const body = `   „${excerpt(hit.text)}“`
    if (used + head.length + body.length + 2 > VAULT_SEARCH_MAX_TOTAL) {
      lines.push(`… [gekürzt: ${result.hits.length - shown} weitere Treffer passen nicht ins Antwortbudget]`)
      break
    }
    lines.push(head, body)
    used += head.length + body.length + 2
    paths.push(hit.fileRel)
    shown++
  }
  lines.push('Lies relevante Notizen mit note_read (Pfad wie oben), bevor du dich auf sie stützt. Fehlt etwas, ergänze mit note_search.')
  return { content: lines.join('\n'), paths }
}
