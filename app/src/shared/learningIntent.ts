// Will jemand im Petrol-Chat etwas lernen? Dann bietet der Chat „Lernkarten“ an (Nutzer 07.11.2026:
// „erst dann die Karteikartenfunktion anbieten“).
//
// Erste Quelle ist die Websuche-Entscheidung (`learn` in main/llm/petrolRoute.ts, gemessen: qwen3.8
// 40/40, qwen3.5:4b 38/40). Sie läuft aber nur mit eingeschaltetem Globus. Für den Rest diese
// Wortprüfung über die eigenen Nachrichten des Nutzers — bewusst eng: lieber den Knopf einmal zu
// wenig zeigen als unter jeder Mail-Formulierung.

const LEARN_PATTERNS: RegExp[] = [
  /\b(?:klausur|klassenarbeit|prüfung|pruefung|abitur|abi|examen|testat|lernzettel|karteikarten?|vokabeln?)\b/iu,
  /\b(?:test|referat|hausaufgabe)\b.{0,40}\b(?:schreib|morgen|nächste|naechste|vorbereit|halte)/iu,
  /\b(?:schreib|schreiben|haben|hab)\w*\b.{0,30}\b(?:test|arbeit)\b/iu,
  /\b(?:halte\w*|vorbereit\w*)\b.{0,30}\b(?:referat|test|klausur)\b/iu,
  /\b(?:lernen|lerne|wiederholen|auswendig|abfragen|abhören)\b/iu,
  /\bfrag\w*\s+mich\s+(?:ab|aus)\b/iu,
  /\b\d{1,2}\.\s*klasse\b/iu,
  /\b(?:exam|quiz me|study for|flashcards?)\b/iu
]

/** Spricht eine der Nachrichten des Nutzers vom Lernen? */
export function looksLikeLearning(userMessages: readonly string[]): boolean {
  return userMessages.some((m) => LEARN_PATTERNS.some((re) => re.test(m)))
}
