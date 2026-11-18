// Erkennt, ob ein Agent-Auftrag eine Mindmap verlangt.
//
// Das Mindmap-Werkzeug (write_excalidraw) gibt es im Web-Lauf nicht — eine Karte hat
// keinen Platz für den Quellenblock. Real am 21.10.2026: Auftrag „Mindmap …“ mit
// eingeschaltetem Globus, heraus kam eine Markdown-Notiz, und nur das Modell erklärte
// (vage), das Werkzeug habe gefehlt. Die Agent-Karte warnt deshalb schon vor dem Start,
// der Loop nennt den Grund danach deterministisch. Bewusst grob: ein Fehlalarm kostet
// einen Hinweissatz, ein verpasster einen ganzen Lauf.

// Verneinung kurz davor („keine Mindmap", „statt einer Mind-Map") zählt nicht — sonst
// behauptet die Abschlussnachricht nach einer korrekt erzeugten Notiz, die Mindmap fehle
// (Codex F02). Geprüft werden höchstens zwei Wörter vor dem Treffer.
const NEGATION = /\b(?:kein\w*|ohne|statt|anstatt|stattdessen|nicht|no|not|without|instead\s+of)\s+(?:\S+\s+){0,2}$/i

// Seit 18.11.2026 auch Begriffsnetz und Vier-Felder-Matrix (gleiches Werkzeug, gleiche Sperre im
// Web-Lauf). „SWOT“ und „Eisenhower“ bewusst NICHT: eine SWOT-Analyse als Notiz ist ein gültiges
// Ergebnis, der Hinweis „Zeichnung fehlt“ wäre dort falsch.
export function asksForMindmap(text: string): boolean {
  const re = /\bmind[\s-]?maps?\b|\bconcept[\s-]?maps?\b|\bbegriffsnetz(?:e|es)?\b|\bvier[\s-]?felder[\s-]?(?:matrix|tafel)\b/gi
  for (const m of text.matchAll(re)) {
    if (!NEGATION.test(text.slice(0, m.index))) return true
  }
  return false
}
