// Abgleich zwischen Vault-Index und Vault — reine Vergleichsregel, getestet.
//
// Anlass: Der Index folgt dem Datei-Watcher. Was sich ändert, während die App zu ist (Sync von
// einem anderen Gerät, anderer Editor, verpasste Ereignisse im Ruhezustand), blieb draußen, bis
// dieselbe Datei wieder angefasst wurde. Der Abgleich beim Öffnen und nach einem Sync findet
// genau diese Dateien — ohne Modell und ohne den Index neu zu schreiben, wenn sich nichts
// geändert hat (Codex F10: ein voller Lauf lädt das Embedding-Modell und schreibt den ganzen
// Container neu; für den häufigen Fall „nichts geändert“ ist das Verschwendung).

export interface ScannedHash {
  rel: string
  /** Prüfsumme des kanonischen Inhalts; `null`, wenn die Datei nicht lesbar war. */
  sourceHash: string | null
  /** Abgeleitete KI-Notiz (Chat-Antwort, Brain-Tag) — gehört laut Policy nie in den Index. */
  derived: boolean
}

export interface ReconcileDiff {
  added: string[]
  modified: string[]
  removed: string[]
}

export function diffIndexAgainstVault(indexFiles: Record<string, { sourceHash: string }>, scanned: ScannedHash[]): ReconcileDiff {
  const added: string[] = []
  const modified: string[] = []
  const removed: string[] = []
  const seen = new Set<string>()
  for (const f of scanned) {
    seen.add(f.rel)
    const inIndex = indexFiles[f.rel]
    if (f.sourceHash === null) {
      // Unlesbar: nicht raten. Steht sie im Index, bleibt sie dort, bis sie wieder lesbar ist.
      continue
    }
    if (f.derived) {
      // Abgeleitete Notiz im Index (ältere Policy) → heraus; sonst ignorieren.
      if (inIndex) removed.push(f.rel)
      continue
    }
    if (!inIndex) added.push(f.rel)
    else if (inIndex.sourceHash !== f.sourceHash) modified.push(f.rel)
  }
  for (const rel of Object.keys(indexFiles)) {
    if (!seen.has(rel)) removed.push(rel)
  }
  return { added, modified, removed }
}

export function diffSize(d: ReconcileDiff): number {
  return d.added.length + d.modified.length + d.removed.length
}
