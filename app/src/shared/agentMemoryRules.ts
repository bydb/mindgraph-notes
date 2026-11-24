// Agent-Gedächtnis als Regelliste (24.11.2026). Die Notiz bleibt eine frei editierbare
// Markdown-Datei; hier wird nur gelesen, welche Regeln als Aufzählungspunkte darin stehen,
// damit die Auftragskarte sie ZEIGEN kann statt „wird berücksichtigt“. Geändert wird die Notiz
// nur im Editor — ein eigener Entfernen-Weg aus der Karte brachte mehr Risiko als Nutzen
// (Codex F01–F03, docs/codex-collab/agent-kontextfenster-auftragskarte-gedaechtnis.md). Pur und getestet.

export interface MemoryRule {
  /** Die Zeile genau so, wie sie in der Notiz steht. */
  raw: string
  /** Regeltext ohne Aufzählungszeichen und Datum. */
  text: string
  /** Datum aus „- JJJJ-MM-TT: …“, falls vorhanden. */
  date?: string
}

const BULLET_RE = /^\s*[-*]\s+(?:(\d{4}-\d{2}-\d{2}):\s*)?(\S.*)$/

export function parseMemoryRules(content: string): MemoryRule[] {
  const rules: MemoryRule[] = []
  for (const line of content.split(/\r?\n/)) {
    const m = BULLET_RE.exec(line)
    if (!m) continue
    rules.push({ raw: line, text: m[2].trim(), ...(m[1] ? { date: m[1] } : {}) })
  }
  return rules
}

/**
 * Zeilen, die weder Überschrift noch Regel sind — freier Text, der ebenfalls in jeden Lauf geht.
 * Die zwei Zeilen des Standardkopfs zählen nicht mit.
 */
export function countMemoryFreeLines(content: string): number {
  let n = 0
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || BULLET_RE.test(line)) continue
    if (t.startsWith('Gelernte Regeln aus Agent-Läufen') || t.startsWith('Überholtes einfach löschen')) continue
    n++
  }
  return n
}
