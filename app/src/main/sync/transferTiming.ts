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
 * Beide Regeln hatten dieselbe falsche Annahme: „30 Sekunden ohne Antwort = tot". Für eine
 * Verbindung, die gerade 45 MB schiebt, ist das falsch. Maßstab ist deshalb FORTSCHRITT,
 * nicht Antwortzeit.
 */

/** Übertragene Bytes eines Sockets, beide Richtungen. */
export interface TransferCounters {
  bytesRead: number
  bytesWritten: number
}

/**
 * Lebt die Verbindung? Ein Pong beweist es. Ohne Pong beweist es auch, dass seit der
 * letzten Prüfung Bytes geflossen sind — in irgendeine Richtung: Beim Upload hängt der
 * Ping hinter den Daten, beim Download hängt der Pong des Servers hinter seiner großen
 * Nachricht. In beiden Fällen ist die Leitung nicht tot, sondern voll.
 *
 * Tot ist sie erst, wenn weder Pong noch ein einziges Byte angekommen ist.
 */
export function socketLooksAlive(
  pongSeen: boolean,
  before: TransferCounters,
  now: TransferCounters
): boolean {
  if (pongSeen) return true
  return now.bytesRead > before.bytesRead || now.bytesWritten > before.bytesWritten
}

/** Feste Frist, wenn nichts mehr unterwegs ist — die Antwort selbst ist klein. */
export const TRANSFER_IDLE_TIMEOUT_MS = 30_000
/** Harte Obergrenze je Übertragung, damit ein Waiter nie ewig hängt. */
export const TRANSFER_HARD_CAP_MS = 15 * 60_000
/**
 * Angenommene MINDEST-Geschwindigkeit für die Frist beim Empfang. Bewusst niedrig
 * (2 Mbit/s): Die Frist soll nur echte Ausfälle fangen, nicht langsame Leitungen.
 * Beim Senden wird nicht geraten, dort ist der Fortschritt messbar (bufferedAmount).
 */
export const ASSUMED_MIN_BYTES_PER_SECOND = 256 * 1024

/**
 * Frist für eine Übertragung bekannter Größe: Grundfrist plus die Zeit, die die Daten
 * bei der angenommenen Mindestgeschwindigkeit brauchen — gedeckelt.
 *
 * Für Downloads gibt es keinen Fortschrittsmesser: `ws` liefert eine Nachricht erst,
 * wenn sie vollständig ist. Also muss die Größe die Frist bestimmen. Sie steht im
 * Server-Manifest, bevor der Download beginnt.
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
