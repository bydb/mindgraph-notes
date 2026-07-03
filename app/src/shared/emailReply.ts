import type { EmailMessage } from './types'

/** Alle eigenen Adressen (user + fromAddress aller Accounts), lowercase —
 *  damit Reply-All nicht an die eigene Adresse geht. */
export function collectOwnAddresses(accounts: Array<{ user?: string; fromAddress?: string }>): Set<string> {
  const own = new Set<string>()
  for (const a of accounts) {
    if (a.user && a.user.includes('@')) own.add(a.user.trim().toLowerCase())
    if (a.fromAddress) own.add(a.fromAddress.trim().toLowerCase())
  }
  return own
}

/** Empfänger für „Allen antworten": An = Absender + übrige An-Empfänger, CC = übrige CC —
 *  jeweils ohne eigene Adressen und ohne Duplikate. Auch von der Button-Sichtbarkeit
 *  in der Detail-Ansicht genutzt (Reply-All nur zeigen, wenn es mehr als den Absender gibt). */
export function collectReplyAllRecipients(
  email: Pick<EmailMessage, 'from' | 'to' | 'cc'>,
  ownAddresses: Set<string>
): {
  to: { name: string; address: string }[]
  cc: { name: string; address: string }[]
} {
  const seen = new Set<string>()
  const keep = (r: { name: string; address: string }) => {
    const addr = (r.address || '').trim().toLowerCase()
    if (!addr || ownAddresses.has(addr) || seen.has(addr)) return false
    seen.add(addr)
    return true
  }
  const to = [email.from, ...(email.to || [])].filter(keep)
  const cc = (email.cc || []).filter(keep)
  // Antwort auf eine eigene Mail: alle Kandidaten gefiltert → wenigstens den Absender behalten
  if (to.length === 0 && cc.length === 0) to.push(email.from)
  return { to, cc }
}
