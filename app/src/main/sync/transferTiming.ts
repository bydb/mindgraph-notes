/**
 * Zeitregeln für Übertragungen über die Relay-Verbindung — reine Logik, ohne Socket.
 *
 * Anlass (22.09.2026, real, zweimal): Beim Erstabgleich eines Zweitgeräts scheiterten
 * 200 bzw. 194 Downloads. Ursache war KEINE Netzstörung, sondern die App selbst: Die
 * Mailliste (34 MB, als Nachricht ~45 MB) ging gerade hoch, und währenddessen
 *  1. blieb das Lebenszeichen (Ping) hinter dem Upload in der Sendewarteschlange stecken —
 *     kein Pong binnen 30 s, die App hielt die Verbindung für tot und KAPPTE sie selbst;
 *     alle Downloads in der Warteschlange fielen mit „Not connected" um;
 *  2. lief die feste 30-s-Frist auf die Upload-Bestätigung ab, obwohl die Daten noch
 *     unterwegs waren. Der Konflikt blieb stehen und wiederholte sich alle fünf Minuten.
 *
 * Was sich messen lässt — und was nicht (mit dem echten `ws` 8.21 nachgemessen):
 *  - EMPFANG ist messbar: `socket.bytesRead` wächst Schritt für Schritt, während ein
 *    großer Rahmen ankommt, lange bevor `ws` die Nachricht als Ganzes liefert.
 *  - SENDEN ist NICHT messbar: `bufferedAmount` steht sofort auf der vollen Rahmengröße
 *    und fällt erst, wenn der Rahmen komplett ans Betriebssystem übergeben ist;
 *    `bytesWritten` zählt Bytes, die noch im Puffer liegen — einschließlich der eigenen
 *    Pings. Beides als „Fortschritt" zu lesen war der Fehler des zweiten Entwurfs: Er ließ
 *    die 34-MB-Mailliste weiter scheitern UND hielt eine tote Verbindung für ewig lebendig.
 *
 * Deshalb: Empfangene Bytes beweisen, dass die Gegenseite lebt. Für das Senden gibt es
 * keinen Beweis, nur eine ehrliche Frist aus der Größe.
 */

/**
 * Lebt die Verbindung? Ein Pong beweist es. Empfangene Bytes beweisen es genauso — sie
 * kommen von der Gegenseite, nichts anderes kann sie erzeugen. Eigene gesendete Bytes
 * beweisen NICHTS (s. oben). Läuft ein Upload, dessen Frist noch nicht abgelaufen ist,
 * wird die Verbindung so lange geschont: Der Ping hängt hinter dem Rahmen, und die
 * Frist des Uploads ist die Grenze dieser Schonung.
 */
export function socketLooksAlive(input: {
  pongSeen: boolean
  bytesReadBefore: number
  bytesReadNow: number
  uploadInFlightWithinDeadline: boolean
}): boolean {
  if (input.pongSeen) return true
  if (input.bytesReadNow > input.bytesReadBefore) return true
  return input.uploadInFlightWithinDeadline
}

/** Feste Frist, wenn nichts mehr unterwegs ist — die Antwort selbst ist klein. */
export const TRANSFER_IDLE_TIMEOUT_MS = 30_000
/** Harte Obergrenze je Übertragung, damit ein Waiter nie ewig hängt. */
export const TRANSFER_HARD_CAP_MS = 15 * 60_000
/**
 * Angenommene MINDEST-Geschwindigkeit für Fristen aus der Größe. Bewusst niedrig
 * (2 Mbit/s): Die Frist soll nur echte Ausfälle fangen, nicht langsame Leitungen.
 */
export const ASSUMED_MIN_BYTES_PER_SECOND = 256 * 1024

/**
 * Frist für eine Übertragung bekannter Größe: Grundfrist plus die Zeit, die die Daten
 * bei der angenommenen Mindestgeschwindigkeit brauchen — gedeckelt.
 *
 * Für UPLOADS ist das die einzige Regel, weil Sendefortschritt nicht messbar ist. Für
 * DOWNLOADS ist es der Ausgangswert; solange Bytes ankommen, läuft die Frist neu an.
 */
export function transferTimeoutMs(expectedBytes: number | undefined): number {
  if (!expectedBytes || expectedBytes <= 0 || !Number.isFinite(expectedBytes)) {
    return TRANSFER_IDLE_TIMEOUT_MS
  }
  // base64 in JSON: die Nachricht ist um ein Drittel größer als die Datei.
  const wireBytes = Math.ceil(expectedBytes * 4 / 3)
  const transfer = Math.ceil(wireBytes / ASSUMED_MIN_BYTES_PER_SECOND) * 1000
  return Math.min(TRANSFER_IDLE_TIMEOUT_MS + transfer, TRANSFER_HARD_CAP_MS)
}

/**
 * Entscheidung einer Empfangs-Wache: weiter warten, oder abbrechen — und warum.
 *
 * Der Deckel wird ZUERST geprüft. Im zweiten Entwurf stand er hinter der
 * Fortschrittsbehandlung, und jeder Takt mit Fortschritt sprang vorher zurück — der
 * „harte" Deckel galt nie (Codex, F15).
 */
export function receiveWatchVerdict(input: {
  startedAt: number
  now: number
  lastProgressAt: number
  bytesReadBefore: number
  bytesReadNow: number
}): { verdict: 'wait' | 'progress' | 'idle-timeout' | 'hard-cap' } {
  if (input.now - input.startedAt >= TRANSFER_HARD_CAP_MS) return { verdict: 'hard-cap' }
  if (input.bytesReadNow > input.bytesReadBefore) return { verdict: 'progress' }
  if (input.now - input.lastProgressAt >= TRANSFER_IDLE_TIMEOUT_MS) return { verdict: 'idle-timeout' }
  return { verdict: 'wait' }
}
