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
