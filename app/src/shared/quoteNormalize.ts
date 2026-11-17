/**
 * Typografische Anführungszeichen auf die geraden Formen zurückführen. Der Lesen-Modus
 * wandelt Wikilinks erst NACH dem Markdown-Rendern um — der Typograph hat aus `You'll` im
 * Linkziel dann schon `You’ll` gemacht, und die Notiz war nicht mehr zu finden (real,
 * 20.09.2026, Readwise-Artikel mit Apostroph im Titel).
 */
export function straightenQuotes(text: string): string {
  return text.replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').normalize('NFC')
}
