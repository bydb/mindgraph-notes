// Lernkarten aus einer Chat-Antwort (Petrol-Chat, 07.11.2026, Schülertest „Klausur Französische
// Revolution“): der Text, aus dem der vorhandene Karten-Erzeuger (`flashcards-generate`, Prinzip
// „eine Karte, ein Fakt“) Karten macht, und die Herkunftsangabe der Karten.

const MAX_SOURCE_CHARS = 12_000

/**
 * Frage + Antwort als Quelltext für die Karten. Quellennummern („[2]“) und Zeichen der Satzprüfung
 * fliegen raus — sonst landen sie auf der Karte. Die Frage steht davor, damit Karten zum Thema der
 * Frage entstehen und nicht zu Nebensätzen der Antwort.
 */
export function chatAnswerCardSource(question: string, answer: string): string {
  const body = answer
    .replace(/\r\n?/g, '\n')
    .replace(/(?<!\\)\[\d{1,3}\]/g, '')
    .replace(/[-]/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  const q = question.replace(/\s+/g, ' ').trim()
  const text = q ? `Frage: ${q}\n\n${body}` : body
  return text.length > MAX_SOURCE_CHARS ? text.slice(0, MAX_SOURCE_CHARS) : text
}

/**
 * Herkunft auf der Karte. Die Kartenansichten zeigen nur den letzten Pfadteil
 * (`sourceNote.split('/').pop()`), deshalb ohne Schrägstrich.
 */
export function chatCardSourceLabel(question: string): string {
  const q = question.replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').trim()
  const short = q.length > 60 ? `${q.slice(0, 59).replace(/\s+\S*$/, '')} …` : q
  return `Petrol-Chat – ${short || 'Antwort'}`
}
