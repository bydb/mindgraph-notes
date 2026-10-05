// Erkennt eine Rückfrage am Ende einer Agent-Antwort („Möchtest du, dass ich …?“).
//
// Der Notiz-Agent soll nicht nachfragen (System-Prompt), tut es aber gelegentlich — real
// am 05.10.2026: Nach einer Ordner-Auswertung endete qwen3.6 mit „Möchtest du, dass ich das
// als eigene Jahresrückblick-Notiz zusammenstelle …?“ statt die Notiz zu schreiben. Der
// Loop schickt den Agenten in diesem Fall einmal zurück. Bewusst grob: geprüft wird nur
// der letzte Absatz, denn eine Frage mitten im Text ist meist Inhalt, keine Rückfrage.

export function endsWithQuestion(text: string): boolean {
  const paragraphs = text.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const last = paragraphs[paragraphs.length - 1]
  if (!last) return false
  // Code-Blöcke und Zitate sind Inhalt, keine Rückfrage.
  if (last.startsWith('```') || last.startsWith('>')) return false
  return /[?？]/.test(last)
}
