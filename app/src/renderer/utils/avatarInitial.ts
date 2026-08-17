/**
 * Erstes anzeigbares Zeichen für den Avatar-Kreis im Posteingang.
 *
 * Vorher stand dort `(name || address).charAt(0)`. `charAt` liefert die erste
 * UTF-16-Einheit — ein Emoji besteht aber aus zwei davon (Surrogatpaar), also blieb eine
 * halbe übrig. Anzeigen lässt sich das nicht, das System zeigt das Ersatzzeichen U+FFFD,
 * in der Liste sichtbar als Fragezeichen im Rhombus. Real aufgetreten beim Absender
 * „🏫 - Medienzentrum Kontaktformular" (WordPress-Kontaktformular).
 *
 * Gesucht wird deshalb code-punkt-weise das erste Zeichen, das ein Buchstabe oder eine
 * Ziffer ist; Emojis, Anführungszeichen und Bindestriche werden übersprungen. Erst im
 * Namen, dann in der Adresse. Findet sich nirgends etwas, kommt ein leerer String zurück
 * — die Oberfläche zeigt dann ihr Umschlag-Symbol statt eines Buchstabens.
 */
export function avatarInitial(name?: string | null, address?: string | null): string {
  for (const quelle of [name, address]) {
    if (!quelle) continue
    // for…of iteriert über Code-Punkte, nicht über UTF-16-Einheiten — genau der Unterschied,
    // an dem charAt(0) gescheitert ist.
    for (const zeichen of quelle) {
      if (!/\p{L}|\p{N}/u.test(zeichen)) continue
      // Großschreiben kann mehrere Zeichen ergeben („ß" → „SS"); im Kreis ist Platz für eins.
      return [...zeichen.toLocaleUpperCase()][0] ?? zeichen
    }
  }
  return ''
}
