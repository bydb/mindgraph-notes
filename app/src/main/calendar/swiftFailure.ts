// Übersetzt ein gescheitertes `swift -e …` in eine Meldung mit nächstem Schritt.
//
// Alle Kalender-Wege (lesen, Zugriff anfragen, Termin anlegen) starten ein kleines
// Swift-Programm. Scheitert schon der START von `swift`, steht der Grund nur auf
// der Fehlerausgabe. Anlass (18.09.2026): Nach einem Xcode-Update war die Lizenz
// nicht bestätigt — `swift` endete mit Exit 69, die Prüfkarte zeigte nur
// „Unerwartete Antwort:" ohne jeden Hinweis.
//
// Reine Logik ohne Electron/fs, damit sie testbar bleibt.

const LICENSE_HINT =
  'Die Xcode-Lizenz ist noch nicht bestätigt (meist nach einem Xcode-Update) — deshalb startet das Kalender-Hilfsprogramm nicht. ' +
  'Im Terminal ausführen: sudo xcodebuild -license accept — danach erneut versuchen. ' +
  'Bis dahin funktioniert „Als .ics speichern".'

const TOOLS_HINT =
  'Die Xcode Command Line Tools fehlen. Im Terminal ausführen: xcode-select --install — danach die App neu starten. ' +
  'Bis dahin funktioniert „Als .ics speichern".'

/** Erkennt die bekannten Startprobleme von `swift`; sonst undefined. */
export function explainKnownSwiftProblem(text: string): string | undefined {
  if (!text) return undefined
  if (/xcodebuild -license|agreed to the Xcode license|Xcode and Apple SDKs license/i.test(text)) return LICENSE_HINT
  if (/xcode-select|no developer tools were found|invalid active developer path|ENOENT/i.test(text)) return TOOLS_HINT
  return undefined
}

export interface SwiftFailure {
  stderr: string
  stdout?: string
  code: number | null
  signal: string | null
}

/** Meldung für einen Lauf, der keine der erwarteten Antworten geliefert hat. */
export function explainSwiftFailure(failure: SwiftFailure): string {
  const known = explainKnownSwiftProblem(failure.stderr)
  if (known) return known
  if (failure.signal) {
    return 'Das Kalender-Hilfsprogramm wurde nach zwei Minuten beendet. Wartet macOS auf eine Antwort im Kalender-Zugriffsdialog? Dialog bestätigen und erneut versuchen.'
  }
  // Erste aussagekräftige Zeile reicht — ein Swift-Compilerfehler ist seitenlang.
  const detail = (failure.stderr || failure.stdout || '')
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0)
  const exit = failure.code === null ? '' : ` (Exit ${failure.code})`
  return detail
    ? `Das Kalender-Hilfsprogramm ist gescheitert${exit}: ${detail.slice(0, 300)}`
    : `Das Kalender-Hilfsprogramm hat nichts zurückgemeldet${exit}. „Als .ics speichern" funktioniert unabhängig davon.`
}
