// Rückfall, wenn keine Absicht sicher genug trifft.
//
// Die Palettensuche allein genügt hier nicht: `fuzzyMatch` prüft eine Subsequenz über
// den GESAMTEN eingegebenen Text. "Was ist heute wichtig?" findet damit in aller Regel
// keine einzige Aktion, und der Nutzer steht vor einer leeren Liste.
//
// Deshalb zwei Dinge: eine garantierte Notizsuche als erster Eintrag (die Liste ist
// dadurch nie leer) und tokenisierte Vorschläge aus dem ECHTEN Aktionsbestand.

const STOPWORDS = new Set([
  'was', 'ist', 'sind', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen',
  'und', 'oder', 'für', 'mit', 'von', 'zum', 'zur', 'auf', 'aus', 'bei', 'ich', 'du',
  'wie', 'wer', 'wo', 'wann', 'noch', 'alle', 'alles', 'mein', 'meine', 'zeig', 'zeige',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'who', 'how', 'where',
  'when', 'are', 'was', 'show', 'all', 'my'
])

/** Umlaute falten, damit Label ("ähnlich") und Keyword ("aehnlich") dieselbe Form haben. */
export function foldUmlauts(text: string): string {
  return text
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
}

export function tokenizeForFallback(text: string): string[] {
  const normalized = foldUmlauts(String(text ?? '').toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of normalized.split(/\s+/u)) {
    if (token.length < 3) continue
    if (STOPWORDS.has(token)) continue
    if (seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}

/** Ab diesem Anteil am Bestand gilt ein Wort als nichtssagend. */
const GENERIC_DF_RATIO = 0.15

/** Was der Rückfall über eine Palettenaktion wissen muss — mehr nicht. */
export interface FallbackCommand {
  id: string
  label: string
  keywords?: string
}

export type FallbackEntry =
  | { kind: 'search-notes'; query: string }
  | { kind: 'command'; id: string; hits: number; score: number }

/**
 * Rangfolge über Selten­heit statt roher Trefferzahl.
 *
 * Erste Fassung zählte nur Treffer — damit verlor "terminal öffnen" gegen jede andere
 * Aktion, deren Label ebenfalls "öffnen" enthält (Dashboard öffnen, Workflow-Canvas
 * öffnen, ...). Ein Wort, das auf viele Aktionen passt, unterscheidet nichts. Deshalb
 * wiegt jedes Token umgekehrt zu seiner Häufigkeit im Bestand: "terminal" trifft eine
 * Aktion und entscheidet, "öffnen" trifft ein Dutzend und zählt praktisch nicht.
 */
export function suggestCommands(
  transcript: string,
  commands: FallbackCommand[],
  limit = 3
): Array<{ id: string; hits: number; score: number }> {
  const tokens = tokenizeForFallback(transcript)
  if (tokens.length === 0 || commands.length === 0) return []

  const haystacks = commands.map(cmd => ({
    id: cmd.id,
    text: foldUmlauts(`${cmd.label ?? ''} ${cmd.keywords ?? ''}`.toLowerCase())
  }))

  // Ein Wort, das auf mehr als ein Siebtel des Bestands passt, benennt nichts mehr.
  // "öffne" trifft fünf von 26 Aktionen — sein Gewicht bleibt trotzdem klar über null,
  // deshalb genügt die Gewichtung allein nicht als Filter.
  const genericCutoff = Math.max(2, commands.length * GENERIC_DF_RATIO)

  const weightOf = new Map<string, number>()
  const generic = new Set<string>()
  for (const token of tokens) {
    const df = haystacks.filter(h => h.text.includes(token)).length
    if (df > genericCutoff) generic.add(token)
    // df = N ergäbe ein negatives Gewicht — deshalb bei 0 abschneiden.
    weightOf.set(token, Math.max(0, Math.log(commands.length / (1 + df))))
  }
  const totalWeight = tokens.reduce((sum, t) => sum + (weightOf.get(t) ?? 0), 0)
  const hasDistinctiveToken = tokens.some(t => !generic.has(t))

  const scored = haystacks.map(h => {
    let hits = 0
    let weight = 0
    let distinctiveHits = 0
    for (const token of tokens) {
      if (!h.text.includes(token)) continue
      hits++
      weight += weightOf.get(token) ?? 0
      if (!generic.has(token)) distinctiveHits++
    }
    // Sind alle Tokens gleich häufig (totalWeight 0), bleibt die Trefferzahl als Rang.
    const score = totalWeight > 0 ? weight / totalWeight : hits / tokens.length
    return { id: h.id, hits, score, distinctiveHits }
  })

  return scored
    // Wer nur auf allgegenwärtige Wörter passt, fliegt raus. Real gesehen:
    // „Öffne eine neue Notiz" schlug „Modell-Leistung öffnen" und „Agent öffnen"
    // vor — Rauschen neben dem einen sinnvollen Treffer „Notiz wechseln".
    // Enthält die Äußerung ÜBERHAUPT kein unterscheidendes Wort, bleibt es bei der
    // Trefferzahl; sonst gäbe es gar keine Vorschläge mehr.
    .filter(s => s.hits > 0 && (!hasDistinctiveToken || s.distinctiveHits > 0))
    .sort((a, b) => b.score - a.score || b.hits - a.hits || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ id, hits, score }) => ({ id, hits, score }))
}

/**
 * Vollständige Rückfallliste. Der erste Eintrag ist IMMER die Notizsuche —
 * das ist die Zusage, dass ein nicht erkannter Satz nie im Nichts endet.
 */
export function buildFallback(
  transcript: string,
  commands: FallbackCommand[],
  limit = 3
): FallbackEntry[] {
  const entries: FallbackEntry[] = [{ kind: 'search-notes', query: String(transcript ?? '').trim() }]
  for (const s of suggestCommands(transcript, commands, limit)) {
    entries.push({ kind: 'command', id: s.id, hits: s.hits, score: s.score })
  }
  return entries
}
