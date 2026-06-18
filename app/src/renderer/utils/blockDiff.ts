// Zeilen-/blockweiser Diff (LCS) für die KI-Vorschau. Bewusst zeilenbasiert:
// schützt Wikilinks/`[[…]]`/Inline-Syntax vor Mitten-Drin-Brüchen (passt zu den
// Turndown-/Auto-Heal-Regeln) und ist gut lesbar im Review.

export type DiffOp = { type: 'equal' | 'del' | 'ins'; text: string }

export function diffLines(oldText: string, newText: string): DiffOp[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  const n = a.length
  const m = b.length

  // Schutz gegen O(n*m)-Explosion bei sehr großen Scopes: dann grob ersetzen.
  if (n * m > 4_000_000) {
    return [
      ...a.map(text => ({ type: 'del' as const, text })),
      ...b.map(text => ({ type: 'ins' as const, text }))
    ]
  }

  // LCS-Längen-Tabelle (von hinten).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', text: a[i] }); i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i] }); i++
    } else {
      ops.push({ type: 'ins', text: b[j] }); j++
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] })
  while (j < m) ops.push({ type: 'ins', text: b[j++] })
  return ops
}

export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const op of ops) {
    if (op.type === 'ins') added++
    else if (op.type === 'del') removed++
  }
  return { added, removed }
}
