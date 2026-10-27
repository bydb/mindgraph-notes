// Abgeschnittene Modellantworten im Agenten-Loop (Ausgabegrenze erreicht).
//
// Anlass (real, 27.10.2026, run-9d35daa5363b4c31): minimax-m3.1-flash wollte eine ganze
// HTML-Seite in EINEN write_html-Aufruf packen und stieß zweimal an die 8192-Token-Grenze
// des Anbieters. Das abgeschnittene JSON wurde zu leeren Argumenten, das Werkzeug meldete
// „Parameter fehlt", und das Modell schrieb dieselbe lange Seite erneut — je knapp drei
// Minuten ohne Rückmeldung, am Ende „fehlgeschlagen". Der Client meldete `outputCut`,
// der Loop wertete es nicht aus.
//
// Regeln:
// - Abgeschnittene Werkzeugaufrufe werden NIE ausgeführt. Die Argumente sind unvollständig;
//   ein Schreib-Werkzeug könnte sonst eine halbe Datei ablegen.
// - Das Modell erfährt den wahren Grund (Ausgabegrenze), nicht „Parameter fehlt".
// - Nach MAX_OUTPUT_CUTS Abbrüchen IN FOLGE endet der Lauf, statt weiter Minuten zu verbrennen:
//   als Fehler, wenn noch kein Ergebnis steht, sonst mit Vermerk (fertige Ergebnisse bleiben).
// - Die Rückmeldung bleibt im verlangten Format. Ein Rat „lieber eine Notiz" machte aus einem
//   ausdrücklichen HTML-Auftrag still Markdown (Codex F03) — Formatwechsel schlägt nur die
//   Abbruchmeldung dem NUTZER vor.

export const MAX_OUTPUT_CUTS = 2

/** Antwort an jeden abgeschnittenen Werkzeugaufruf (Rolle `tool`). */
export function cutToolCallMessage(toolName: string): string {
  return (
    `Fehler: Deine Antwort wurde an der Ausgabegrenze des Modells abgeschnitten — der Aufruf von ${toolName} kam unvollständig an und wurde NICHT ausgeführt. ` +
    'Wiederhole ihn nicht in derselben Länge, er würde wieder abgeschnitten. Schreibe das Ergebnis deutlich kürzer: weniger Abschnitte, kürzere Texte, ' +
    'keine großen eingebetteten Grafiken oder Datenblöcke. Bleib dabei im verlangten Format und beim selben Werkzeug.'
  )
}

/** Nachricht, wenn eine Antwort ohne erkannten Werkzeugaufruf abgeschnitten wurde. */
export const CUT_TEXT_MESSAGE =
  'Deine letzte Antwort wurde an der Ausgabegrenze des Modells abgeschnitten und ist unvollständig. ' +
  'Falls du gerade ein Werkzeug aufrufen wolltest, kam der Aufruf nicht an. Schreibe deutlich kürzer, bleib im verlangten Format und wiederhole nicht dieselbe lange Ausgabe.'

/** Abschluss, wenn nach fertigem Ergebnis wiederholt abgeschnitten wurde. */
export const CUT_AFTER_RESULT_NOTE =
  'Die bisher erzeugten Ergebnisse sind vollständig. Danach hat das Modell wiederholt die Grenze seiner Ausgabelänge erreicht — ' +
  'falls noch ein weiteres Ergebnis oder eine Zusammenfassung geplant war, fehlt dieser Teil. Bitte bei Bedarf gezielt nachfordern.'

/** Abbruchmeldung nach wiederholtem Abschneiden. */
export function repeatedCutMessage(cuts: number): string {
  return (
    `Das Modell hat ${cuts}-mal die Grenze seiner Ausgabelänge erreicht, ohne das Ergebnis vollständig zu liefern. ` +
    'Der Auftrag verlangt vermutlich zu viel Text in einem Stück: Bitte um ein kürzeres Ergebnis, ein schlichteres Format (z. B. eine Notiz statt einer gestalteten Seite), teile den Auftrag auf oder wähle ein Modell mit längerer Ausgabe.'
  )
}
