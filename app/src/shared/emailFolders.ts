// Papierkorb-Erkennung aus der Ordnerliste eines Kontos — analog zur
// Gesendet-Erkennung im Main-Prozess (`findSentMailbox`): erst SPECIAL-USE
// (RFC 6154), dann bekannte Namen. Ohne erkannten Papierkorb gibt es keinen
// Löschen-Knopf; „Löschen" ist in MindGraph immer ein Verschieben, nie ein
// Expunge.

export interface FolderLike {
  path: string
  name?: string
  specialUse?: string
  selectable?: boolean
}

const TRASH_NAMES = [
  'INBOX.Trash',
  'INBOX.Papierkorb',
  'Trash',
  'Papierkorb',
  'Deleted Items',
  'Deleted Messages',
  'Gelöschte Objekte',
  'Gelöschte Elemente',
  'Gelöschte Nachrichten',
  'INBOX.Deleted Items',
  '[Gmail]/Papierkorb',
  '[Gmail]/Trash',
  '[Gmail]/Bin'
]

export function findTrashFolder<T extends FolderLike>(folders: T[] | undefined): T | null {
  if (!folders || folders.length === 0) return null
  const usable = folders.filter(f => f.selectable !== false && f.path)
  const bySpecialUse = usable.find(f => f.specialUse === '\\Trash')
  if (bySpecialUse) return bySpecialUse
  const lowered = usable.map(f => ({ f, key: (f.path || f.name || '').toLowerCase() }))
  for (const candidate of TRASH_NAMES) {
    const hit = lowered.find(e => e.key === candidate.toLowerCase())
    if (hit) return hit.f
  }
  return null
}
