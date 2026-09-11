// Abgleich BEKANNTER Mails mit dem Server — Flags, Ordner, Verschwinden.
//
// Der Abruf holt Umschläge des ganzen Zeitfensters (billig) und lädt danach
// nur unbekannte Mails mit Text. Bekannte Mails kamen dabei bisher gar nicht
// mehr vor: Extern gelesen, verschoben oder gelöscht blieb unsichtbar, und der
// Zweig „bekannte Mail hat den Ordner gewechselt" war toter Code. Hier wird aus
// denselben Umschlägen (plus Flags) bestimmt, was sich an bekannten Mails
// geändert hat. Löschungen werden NICHT vollzogen, nur markiert
// (`missingOnServer`) — erst anzeigen, dann entscheiden.

type Recipient = { name: string; address: string }

export interface KnownLocalMessage {
  id: string
  accountId?: string
  folder?: string
  uid?: number
  flags?: string[]
  replyTo?: Recipient[]
  /** ISO-Datum der Mail. Nur Mails innerhalb des abgefragten Fensters können
   *  als verschwunden gelten — was älter ist, wurde gar nicht erst abgefragt. */
  date?: string
  missingOnServer?: boolean
  /** Lokale Kopien gesendeter Mails haben oft keine UID und liegen im
   *  Gesendet-Ordner. Sie zählen wie jede andere Mail — ist die Kopie nicht
   *  auf dem Server, ist das eine ehrliche Aussage. */
  sent?: boolean
}

export interface ServerCandidate {
  messageId: string
  uid: number
  flags?: string[]
  /** Reply-To aus dem Umschlag — wird bei bereits importierten Mails nachgetragen. */
  replyTo?: Recipient[]
}

export interface KnownMessageUpdate {
  id: string
  flags?: string[]
  folder?: string
  uid?: number
  replyTo?: Recipient[]
  missingOnServer?: boolean
}

export interface SyncScope {
  accountId: string
  folder: string
  /** Untere Grenze des abgefragten Fensters (ISO). */
  sinceIso: string
}

function sameFlags(a: string[] | undefined, b: string[] | undefined): boolean {
  const sa = [...(a || [])].sort()
  const sb = [...(b || [])].sort()
  if (sa.length !== sb.length) return false
  return sa.every((f, i) => f === sb[i])
}

/**
 * Bestimmt Änderungen an bekannten Mails aus den Umschlägen EINES Kontos und
 * Ordners. Liefert nur echte Unterschiede — leere Liste heißt: nichts zu tun.
 *
 * - Kandidat bekannt UND gehört zu diesem Konto: Flags anders → Flags
 *   übernehmen; UID anders → UID nachziehen (auch im selben Ordner — alte
 *   Gesendet-Kopien mit uid 0 werden so bedienbar); lokal in anderem Ordner →
 *   Ordner nachziehen; eine Mail, die lokal als verschwunden galt, ist damit
 *   wieder da; fehlendes Reply-To wird nachgetragen.
 * - Kandidat bekannt, aber lokal einem ANDEREN Konto zugeordnet → ignorieren.
 *   Dieselbe Message-ID in zwei Konten ist im Schema ein Datensatz; Daten aus
 *   Konto B dürfen den Datensatz von A trotzdem nicht verändern (Ordner, UID
 *   und Flags würden sonst auf das falsche Postfach zeigen).
 * - Lokale Mail dieses Kontos/Ordners im Fenster, aber nicht unter den
 *   Kandidaten → `missingOnServer: true`.
 */
export function diffKnownMessages(
  known: KnownLocalMessage[],
  candidates: ServerCandidate[],
  scope: SyncScope
): KnownMessageUpdate[] {
  const byId = new Map<string, KnownLocalMessage>()
  for (const k of known) byId.set(k.id, k)
  const seenIds = new Set<string>()
  const updates: KnownMessageUpdate[] = []

  for (const c of candidates) {
    const local = byId.get(c.messageId)
    if (!local) continue
    // Fremdes Konto: nicht anfassen (siehe oben). Ohne accountId (sollte es
    // nicht geben) gilt der Datensatz als zu diesem Konto gehörig.
    if (local.accountId && local.accountId !== scope.accountId) continue
    seenIds.add(c.messageId)
    const update: KnownMessageUpdate = { id: c.messageId }
    let changed = false
    if (c.flags && !sameFlags(local.flags, c.flags)) {
      update.flags = [...c.flags]
      changed = true
    }
    const localFolder = local.folder || 'INBOX'
    if (localFolder !== scope.folder) {
      update.folder = scope.folder
      changed = true
    }
    if (c.uid > 0 && c.uid !== local.uid) {
      update.uid = c.uid
      changed = true
    }
    if ((!local.replyTo || local.replyTo.length === 0) && c.replyTo && c.replyTo.length > 0) {
      update.replyTo = c.replyTo.map(r => ({ name: r.name || '', address: r.address }))
      changed = true
    }
    if (local.missingOnServer) {
      update.missingOnServer = false
      changed = true
    }
    if (changed) updates.push(update)
  }

  for (const local of known) {
    if (seenIds.has(local.id)) continue
    if ((local.accountId || '') !== scope.accountId) continue
    if ((local.folder || 'INBOX') !== scope.folder) continue
    if (!local.date || local.date < scope.sinceIso) continue
    if (local.missingOnServer) continue
    updates.push({ id: local.id, missingOnServer: true })
  }

  return updates
}
