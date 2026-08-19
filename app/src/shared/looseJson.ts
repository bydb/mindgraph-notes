// Toleranter JSON-Parser für Modell-Antworten.
//
// Lokale Modelle liefern selten exakt das, was man ihnen sagt. Beobachtete Muster:
// Code-Fences, Vorrede, `<think>`-Blöcke, nachgestelltes Geschwätz — und, real am
// 19.08.2026 mit qwen3.8:27b-mlx bei temperature 0.7 gemessen, die **doppelte
// Ausgabe derselben Antwort**, getrennt durch ein herrenloses `</think>` ohne
// öffnendes Gegenstück:
//
//     { "relevanceScore": 15, … }
//     </think>
//     { "relevanceScore": 15, … }
//
// Daran ist der bisherige Parser gescheitert: Er schnitt von der ersten `{` bis
// zur LETZTEN `}` und fing damit beide Objekte ein — zwei JSON-Objekte
// hintereinander sind kein gültiges JSON. Ergebnis: `null`, die Mail wurde nicht
// analysiert. Der Schnitt bis zur letzten `}` bleibt als Kandidat erhalten (er
// repariert abgeschnittenes Geschwätz drumherum), bekommt aber die einzeln
// geschlossenen Objekte zur Seite gestellt.

/**
 * Findet in sich geschlossene `{…}`-Objekte auf oberster Ebene.
 *
 * Zählt Klammern und kennt dabei Zeichenketten und Escapes — eine `}` in einem
 * String-Wert beendet also kein Objekt. Bricht nach `limit` Funden ab, damit ein
 * Modell, das hundertfach dasselbe wiederholt, keine Arbeit erzeugt.
 */
export function findBalancedJsonObjects(text: string, limit = 5): string[] {
  const found: string[] = []
  let i = 0
  while (i < text.length && found.length < limit) {
    if (text[i] !== '{') { i++; continue }
    let depth = 0
    let inString = false
    let escaped = false
    let end = -1
    for (let j = i; j < text.length; j++) {
      const ch = text[j]
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { if (inString) escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) { end = j; break }
      }
    }
    if (end === -1) break        // ab hier ist nichts mehr geschlossen
    found.push(text.slice(i, end + 1))
    i = end + 1
  }
  return found
}

const TRAILING_COMMA = /,\s*([}\]])/g

/**
 * Zieht das erste brauchbare JSON-Objekt aus einer Modell-Antwort.
 * `null`, wenn nichts parsebar ist — der Aufrufer entscheidet über Retry oder Skip.
 */
export function parseLooseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  let s = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  const candidates: string[] = [s]
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const block = s.slice(start, end + 1)
    candidates.push(block)
    candidates.push(block.replace(TRAILING_COMMA, '$1'))
  }
  for (const obj of findBalancedJsonObjects(s)) {
    candidates.push(obj)
    candidates.push(obj.replace(TRAILING_COMMA, '$1'))
  }

  // Ein leeres `{}` ist zwar gültiges JSON, aber inhaltlich ein Fehlschlag — es
  // kommt real vor (gemma auf langen Mails). Es wird deshalb nur genommen, wenn
  // kein Kandidat mit Inhalt gefunden wurde; sonst gewönne bei doppelter Ausgabe
  // ein leeres erstes Objekt gegen ein vollständiges zweites.
  let empty: Record<string, unknown> | null = null
  for (const candidate of candidates) {
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    const obj = parsed as Record<string, unknown>
    if (Object.keys(obj).length > 0) return obj
    if (!empty) empty = obj
  }
  return empty
}
