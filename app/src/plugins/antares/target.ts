// Prüft die Antares-Koordinaten (Serveradresse + Kontext), BEVOR Zugangsdaten gelesen werden.
// Seit 11/2026 sind beide Felder leer vorbelegt (vorher stand dort der Server eines bestimmten
// Medienzentrums): ein neues Medienzentrum, das die Adresse nicht ändert, hätte seine
// Zugangsdaten sonst an einen fremden Server geschickt. Pur, ohne Netz — getestet.

export interface AntaresTarget {
  baseUrl: string
  context: string
}

export function validateAntaresTarget(baseUrl: unknown, context: unknown): AntaresTarget {
  const rawUrl = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  const ctx = typeof context === 'string' ? context.trim() : ''
  if (!rawUrl) throw new Error('Antares-Serveradresse fehlt — bitte in den Einstellungen eintragen.')
  if (!ctx) throw new Error('Antares-Kontext fehlt — bitte in den Einstellungen eintragen.')
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Antares-Serveradresse ist keine gültige Adresse.')
  }
  if (url.protocol !== 'https:') throw new Error('Antares-Serveradresse muss mit https:// beginnen.')
  if (url.username || url.password) throw new Error('Antares-Serveradresse darf keine Zugangsdaten enthalten.')
  return { baseUrl: rawUrl.replace(/\/+$/, ''), context: ctx }
}

/**
 * Reihenfolge der Prüfungen vor dem Verbindungstest (Live-GUI-Befund G03): zuerst das ZIEL
 * (Adresse + Kontext), dann die Zugangsdaten — sonst tippt ein neues Medienzentrum Benutzer und
 * Passwort ein, bevor feststeht, wohin sie gehen. Liefert die erste Fehlermeldung oder null. Pur.
 */
export function antaresTestPrecheck(
  cfg: { baseUrl: unknown; context: unknown },
  creds: { username: string; password: string },
  missingCredsMessage: string
): string | null {
  try {
    validateAntaresTarget(cfg.baseUrl, cfg.context)
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  if (!creds.username || !creds.password) return missingCredsMessage
  return null
}
