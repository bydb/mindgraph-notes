// Lokale Suche über Absender, Empfänger (An/CC), Betreff und Text.
// Das sichtbare Suchfeld durchsuchte vorher nur Absender und Betreff — und nur
// die bereits gefilterten Mails. Eine gesendete Mail („meine Mail an Frau X
// von gestern") war damit nicht zu finden und galt schnell als nie gesendet.

interface Addr { name?: string; address?: string }

export interface SearchableEmail {
  from: Addr
  to?: Addr[]
  cc?: Addr[]
  subject?: string
  bodyText?: string
  snippet?: string
}

/** Mehrere Wörter = alle müssen vorkommen (in beliebigen Feldern). */
export function emailMatchesQuery(email: SearchableEmail, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const addrs = [email.from, ...(email.to || []), ...(email.cc || [])]
    .map(a => `${a?.name || ''} ${a?.address || ''}`)
    .join(' ')
  const haystack = `${addrs}\n${email.subject || ''}\n${email.bodyText || email.snippet || ''}`.toLowerCase()
  return terms.every(term => haystack.includes(term))
}
