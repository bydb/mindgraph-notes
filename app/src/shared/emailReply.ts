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

type Recipient = { name: string; address: string }

/** Konto, von dem eine Antwort/Weiterleitung ausgeht: das Konto, auf dem die Mail
 *  ankam. Nur wenn es dieses Konto nicht mehr gibt, das erste. Vorher nahmen
 *  Antworten, Allen antworten, Weiterleiten und „Als Antwort verwenden" (KI-Chat)
 *  immer `accounts[0]` — eine auf Konto B empfangene Mail ging von Konto A raus. */
export function resolveReplyAccountId(
  email: { accountId?: string },
  accounts: Array<{ id: string }>
): string {
  if (email.accountId && accounts.some(a => a.id === email.accountId)) return email.accountId
  return accounts[0]?.id || ''
}

/** Antwortziel: Reply-To vor From. Liefert zusätzlich `redirect`, wenn die
 *  Antwort dadurch NICHT an den Absender geht — das Compose-Fenster zeigt das an.
 *  Reply-To-Einträge ohne Adresse zählen nicht; ohne brauchbares Reply-To gilt From. */
export function resolveReplyTarget(
  email: Pick<EmailMessage, 'from'> & { replyTo?: Recipient[] }
): { to: Recipient[]; redirect?: { replyTo: string; from: string } } {
  const replyTo = (email.replyTo || []).filter(r => (r.address || '').trim())
  if (replyTo.length === 0) return { to: [email.from] }
  const fromAddr = (email.from.address || '').trim().toLowerCase()
  const sameAsFrom = replyTo.length === 1 && replyTo[0].address.trim().toLowerCase() === fromAddr
  if (sameAsFrom) return { to: [email.from] }
  return {
    to: replyTo,
    redirect: { replyTo: replyTo.map(r => r.address.trim()).join(', '), from: email.from.address }
  }
}

/** Empfänger für „Allen antworten": An = Antwortziel (Reply-To, sonst Absender) + übrige An-Empfänger, CC = übrige CC —
 *  jeweils ohne eigene Adressen und ohne Duplikate. Auch von der Button-Sichtbarkeit
 *  in der Detail-Ansicht genutzt (Reply-All nur zeigen, wenn es mehr als den Absender gibt). */
export function collectReplyAllRecipients(
  email: Pick<EmailMessage, 'from' | 'to' | 'cc'> & { replyTo?: Recipient[] },
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
  const primary = resolveReplyTarget(email).to
  const to = [...primary, ...(email.to || [])].filter(keep)
  const cc = (email.cc || []).filter(keep)
  // Antwort auf eine eigene Mail: alle Kandidaten gefiltert → wenigstens das Antwortziel behalten
  if (to.length === 0 && cc.length === 0) to.push(primary[0])
  return { to, cc }
}
