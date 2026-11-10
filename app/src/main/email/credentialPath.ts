// Dateiname der verschlüsselten Zugangsdaten eines Mailkontos.
//
// Die Konto-ID kommt über IPC vom Renderer. Bis 10.11.2026 ging sie ungeprüft
// in den Pfad `email-<id>.enc`: mit einer ID wie `x/../openrouter` zeigte der
// Pfad auf eine ANDERE Geheimnisdatei im Profil, und `email-load-password`
// gab deren entschlüsselten Inhalt an den Renderer zurück (ebenso konnte
// `email-save-password` solche Dateien überschreiben). Deshalb: nur IDs aus
// Buchstaben, Ziffern, Binde- und Unterstrich; alles andere ist kein Konto.

/** Erlaubte Konto-IDs. Die App vergibt `email-<Zeitstempel>`. */
export const EMAIL_ACCOUNT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/

export function isSafeEmailAccountId(accountId: unknown): accountId is string {
  return typeof accountId === 'string' && EMAIL_ACCOUNT_ID_RE.test(accountId)
}

/**
 * Konto-IDs von Microsoft-365-Konten (abgeleitet aus Mandant und Objekt-ID,
 * siehe microsoftAuth.ts). Die Kontoart folgt aus der FORM der ID, nicht aus
 * dem Vorhandensein einer Ablagedatei: so bleibt ein Microsoft-Konto auch dann
 * ein Microsoft-Konto, wenn seine Ablage fehlt oder unlesbar ist, und kann nie
 * auf den Passwortweg fallen (Codex F02, F03).
 */
export const MICROSOFT_ACCOUNT_ID_RE = /^ms-[0-9a-f]{24}$/

export function isMicrosoftAccountId(accountId: unknown): accountId is string {
  return typeof accountId === 'string' && MICROSOFT_ACCOUNT_ID_RE.test(accountId)
}

/**
 * Wirft bei einer ID, die nicht nach Konto aussieht — nie einen Pfad daraus bauen.
 * Wirft auch für Microsoft-Konten: für sie gibt es kein Passwort, weder zu lesen
 * noch zu schreiben.
 */
export function emailCredentialFileName(accountId: unknown): string {
  if (!isSafeEmailAccountId(accountId)) throw new Error('Ungültige Konto-ID')
  if (isMicrosoftAccountId(accountId)) throw new Error('Microsoft-Konten haben kein Passwort')
  return `email-${accountId}.enc`
}
