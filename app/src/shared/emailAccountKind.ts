// Kontoart eines Mailkontos, erkennbar an der Form der Konto-ID.
//
// Microsoft-365-Konten tragen eine ID, die der Main aus Mandant und Objekt-ID
// ableitet (`ms-` + 24 Hex-Zeichen, main/email/microsoftAuth.ts). Die Kontoart
// folgt aus dieser Form, nicht aus einem Feld, das der Renderer setzen könnte,
// und nicht aus dem Vorhandensein einer Ablagedatei: so bleibt ein
// Microsoft-Konto eines, auch wenn seine Ablage fehlt, und fällt nie auf den
// Passwortweg (Codex F02/F03, docs/codex-collab/microsoft-abschnitt-4a-review.md).
// Pur, für Main und Renderer.

export const MICROSOFT_ACCOUNT_ID_RE = /^ms-[0-9a-f]{24}$/

export function isMicrosoftAccountId(accountId: unknown): accountId is string {
  return typeof accountId === 'string' && MICROSOFT_ACCOUNT_ID_RE.test(accountId)
}

/**
 * Welchen Transportweg nimmt eine ausgehende Mail?
 *
 * Entschieden wird an BEIDEN Konto-IDs, die der Renderer mitschickt
 * (`accountId` und `account.id`): Ist eine davon ein Microsoft-Konto, darf die
 * Mail nie in den SMTP-Zweig — dort liefe der Gesendet-Append mit
 * Verbindungsangaben des Renderers. Passen die beiden nicht zusammen, wird gar
 * nicht gesendet. Je Aufruf gibt es damit genau einen Weg oder eine Absage.
 */
export function chooseSendTransport(accountId: unknown, embeddedAccountId: unknown): 'smtp' | 'graph' | 'mismatch' {
  const primary = isMicrosoftAccountId(accountId)
  const embedded = isMicrosoftAccountId(embeddedAccountId)
  if (!primary && !embedded) return 'smtp'
  if (!primary) return 'mismatch'
  // Eingebettete ID fehlt oder ist dieselbe: Graph. Jede andere eingebettete ID ist ein Widerspruch.
  if (embeddedAccountId === undefined || embeddedAccountId === null || embeddedAccountId === '' || embeddedAccountId === accountId) return 'graph'
  return 'mismatch'
}
