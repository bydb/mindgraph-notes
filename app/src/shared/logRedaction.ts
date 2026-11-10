// Log-Ausgaben ohne personenbezogene Inhalte.
//
// Fehlertexte von Mailservern und Bibliotheken enthalten oft Adressen
// ("550 user x@y unknown"), Message-IDs oder Zugangsmarken. redactForLog()
// macht solche Texte logfähig, mailRef() ersetzt eine Message-ID durch eine
// kurze, stabile Kennung: zwei Logzeilen zur selben Mail bleiben zuordenbar,
// ohne dass Absenderdomain oder Postfach im Log stehen.
//
// Pur und ohne Node-Abhängigkeit, damit Main und Renderer denselben Helfer nutzen.

const MAX_LOG_LENGTH = 2000

// Reihenfolge zählt: erst Marken (enthalten Punkte und könnten sonst als
// Teil einer Adresse durchgehen), dann Message-IDs in spitzen Klammern, dann Adressen.
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/g
const BEARER_RE = /\b(Bearer|access_token|refresh_token|id_token|client_secret|code)(["'\s:=]+)[A-Za-z0-9._~+/-]{16,}=*/gi
const MESSAGE_ID_RE = /<[^<>\s@]+@[^<>\s@]+>/g
const ADDRESS_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g

function textOf(value: unknown): string {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return String(value)
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Macht einen Fehler oder Text logfähig: Marken, Message-IDs und Adressen werden ersetzt. */
export function redactForLog(value: unknown): string {
  const redacted = textOf(value)
    .replace(JWT_RE, '<marke>')
    .replace(BEARER_RE, (_m, label: string, sep: string) => `${label}${sep}<marke>`)
    .replace(MESSAGE_ID_RE, '<message-id>')
    .replace(ADDRESS_RE, '<adresse>')
  return redacted.length > MAX_LOG_LENGTH ? `${redacted.slice(0, MAX_LOG_LENGTH)}… (gekürzt)` : redacted
}

/** Kurze, stabile Kennung einer Mail fürs Log (FNV-1a über die Message-ID). */
export function mailRef(id: string | null | undefined): string {
  const input = id || ''
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `mail#${(hash >>> 0).toString(16).padStart(8, '0')}`
}
