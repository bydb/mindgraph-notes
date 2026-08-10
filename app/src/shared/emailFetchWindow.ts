// Auswahl der abzuholenden Mails pro Abruf — und die Frage, ob der Merker
// „zuletzt abgerufen" danach vorrücken darf.
//
// Anlass (real, 07.08.2026): Eine Mail lag im Postfach, in der App fehlte sie
// dauerhaft. Der Abruf holte alle UIDs seit dem letzten Merker, nahm davon die
// `maxPerAccount` neuesten (Standard: 2) und setzte den Merker anschließend
// bedingungslos auf „jetzt".
//
// Zwei Fehler steckten darin:
//
// 1. Die Kappung lief VOR dem Abgleich mit den bereits bekannten Mails. IMAP
//    `SINCE` arbeitet tagesgenau, das Fenster umfasst also praktisch immer den
//    ganzen letzten Tag. Damit wurden Runde für Runde dieselben zwei neuesten —
//    längst bekannten — Nachrichten ausgewählt und beim Verarbeiten wieder
//    verworfen. Ältere, noch unbekannte Mails aus demselben Fenster kamen nie an
//    die Reihe.
// 2. Der Merker rückte auch dann vor, wenn etwas übrig blieb. Was einmal aus den
//    obersten `maxPerAccount` herausfiel, lag beim nächsten Abruf außerhalb des
//    Zeitfensters — endgültig unerreichbar, ohne jede Meldung.
//
// Deshalb hier: erst unbekannte herausfiltern, dann kappen, und der Merker rückt
// nur vor, wenn nichts übrig geblieben ist. Bleibt etwas übrig, bleibt das
// Zeitfenster stehen; die nächste Runde holt die nächsten `maxPerAccount` — die
// eben geholten sind dann bekannt, also geht es voran.

export interface FetchCandidate {
  uid: number
  /** Message-ID aus dem Envelope, mit demselben Fallback wie beim Verarbeiten. */
  messageId: string
}

export interface FetchSelection {
  /** Diese UIDs mit vollem Text laden — die neuesten unbekannten. */
  selectedUids: number[]
  /** Wie viele unbekannte Mails diesmal NICHT drankamen. */
  skippedCount: number
  /** Wie viele Kandidaten bereits bekannt waren (nur für Diagnose/Logs). */
  knownCount: number
}

export function selectFetchBatch(
  candidates: FetchCandidate[],
  knownIds: Set<string>,
  maxPerAccount: number
): FetchSelection {
  const unknown = candidates.filter(c => !knownIds.has(c.messageId))
  // Neueste zuerst — höhere UID heißt bei IMAP später zugestellt.
  const ordered = [...unknown].sort((a, b) => b.uid - a.uid)
  const limit = Math.max(0, maxPerAccount)
  return {
    selectedUids: ordered.slice(0, limit).map(c => c.uid),
    skippedCount: Math.max(0, ordered.length - limit),
    knownCount: candidates.length - unknown.length
  }
}

// Der Merker darf nur vorrücken, wenn das Fenster vollständig abgearbeitet ist.
// Sonst würden die übrig gebliebenen (älteren) Mails aus dem Zeitfenster fallen.
//
// Ausnahme, sonst wäre die Bremse schlimmer als der ursprüngliche Fehler: Wurden
// Mails ausgewählt, kam davon aber KEINE an, ist kein Fortschritt möglich —
// dieselbe Auswahl käme in jeder Runde erneut und der Abruf stünde dauerhaft
// still. Das passiert, wenn eine Nachricht zwischen Umschlag- und Volltextabruf
// vom Server verschwindet. Dann rückt der Merker vor: Eine Mail, die es nicht
// mehr gibt, darf nicht den ganzen Posteingang blockieren.
export function shouldAdvanceCursor(
  skippedCount: number,
  selectedCount: number,
  importedCount: number
): boolean {
  if (skippedCount === 0) return true
  if (selectedCount > 0 && importedCount === 0) return true
  return false
}
