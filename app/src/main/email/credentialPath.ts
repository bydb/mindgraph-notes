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

/** Wirft bei einer ID, die nicht nach Konto aussieht — nie einen Pfad daraus bauen. */
export function emailCredentialFileName(accountId: unknown): string {
  if (!isSafeEmailAccountId(accountId)) throw new Error('Ungültige Konto-ID')
  return `email-${accountId}.enc`
}
