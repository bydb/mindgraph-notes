// Welche Adressen darf die App an das Betriebssystem zum Öffnen geben (IPC `open-external`)?
// http(s) → Browser, mailto → Mailprogramm. file:, javascript:, eigene Schemata und alles, was
// sich nicht als Adresse zerlegen lässt, bleiben gesperrt. Die Längengrenze hält übergroße
// Eingaben von der OS-Shell fern.

export const EXTERNAL_URL_MAX_CHARS = 8192

export function isOpenableExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > EXTERNAL_URL_MAX_CHARS) return false
  // Steuerzeichen und Leerraum: kein Bestandteil einer echten Adresse, aber Material für Tricks.
  if (/[\u0000- \u007f]/.test(url)) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'mailto:') return true
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0
}
