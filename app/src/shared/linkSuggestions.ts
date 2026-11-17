/**
 * Vorschläge für die `[[`-Vervollständigung: alle Vault-Dateien, nicht nur Notizen
 * (docs/codex-collab/filetree-drag-link.md, Schritt A). Vorher kamen nur `.md`-Notizen
 * mit ihrem H1-Titel — PDFs, Bilder und Office-Dateien ließen sich so nicht verlinken.
 *
 * Notizen werden über alle drei Namen gefunden (H1, Dateiname, Frontmatter-Titel,
 * `noteSearchNames`), andere Dateien über Dateinamen und Pfad. Das eingefügte Ziel
 * bestimmt `buildFileLinkTarget` — dieselbe Regel wie beim Ziehen aus dem Dateibaum.
 */

import { matchNoteName, noteSearchNames, fileNameFromPath } from './noteSearchNames'
import { buildFileLinkTarget, vaultFileKind, type LinkTargetContext, type VaultFileKind } from './fileLinkTarget'

export interface LinkSuggestionNote {
  path: string
  title: string
  content: string
}

export interface LinkSuggestion {
  path: string
  kind: VaultFileKind
  /** Angezeigter Name: der getroffene Name (bei Notizen ggf. Dateiname statt H1). */
  label: string
  /** Einzufügendes Ziel ohne `[[ ]]`; null, wenn der Name nicht verlinkbar ist. */
  target: string | null
  /** Zeichen, die das Verlinken verhindern (nur wenn target null). */
  blockedBy?: string[]
}

export interface LinkSuggestionResult {
  items: LinkSuggestion[]
  /** true, wenn die Eingabe genau einen vorhandenen Namen trifft — dann keine Neuanlage anbieten. */
  exactMatch: boolean
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function withoutExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/** 0 = exakt, 1 = Anfang, 2 = enthält, 3 = nur im Pfad; null = kein Treffer. */
function score(name: string, path: string, q: string): number | null {
  const n = name.toLowerCase()
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  if (n.includes(q)) return 2
  if (path.toLowerCase().includes(q)) return 3
  return null
}

export function suggestLinkTargets(
  query: string,
  allPaths: readonly string[],
  notes: readonly LinkSuggestionNote[],
  limit = 20
): LinkSuggestionResult {
  const q = query.trim().toLowerCase()
  const notesByPath = new Map(notes.map(n => [n.path, n]))
  const ctx: LinkTargetContext = { allPaths, notes }
  let exactMatch = false

  const scored: Array<{ s: number; isNote: boolean; order: number; item: Omit<LinkSuggestion, 'target' | 'blockedBy'> }> = []
  allPaths.forEach((path, order) => {
    const kind = vaultFileKind(path)
    if (kind === 'note') {
      const note = notesByPath.get(path) ?? { path, title: fileNameFromPath(path), content: '' }
      if (!q) {
        scored.push({ s: 0, isNote: true, order, item: { path, kind, label: note.title || fileNameFromPath(path) } })
        return
      }
      // Exakter Treffer auf irgendeinen Namen der Notiz?
      if (noteSearchNames(note).some(name => name.text.toLowerCase() === q)) exactMatch = true
      const hit = matchNoteName(note, q)
      if (hit) {
        scored.push({ s: score(hit.text, path, q) ?? 2, isNote: true, order, item: { path, kind, label: hit.text } })
      } else if (path.toLowerCase().includes(q)) {
        scored.push({ s: 3, isNote: true, order, item: { path, kind, label: note.title || fileNameFromPath(path) } })
      }
      return
    }
    const name = baseName(path)
    if (!q) {
      scored.push({ s: 0, isNote: false, order, item: { path, kind, label: name } })
      return
    }
    if (name.toLowerCase() === q || withoutExtension(name).toLowerCase() === q) exactMatch = true
    const s = score(name, path, q)
    if (s !== null) scored.push({ s, isNote: false, order, item: { path, kind, label: name } })
  })

  scored.sort((a, b) => a.s - b.s || Number(b.isNote) - Number(a.isNote) || a.order - b.order)

  const items = scored.slice(0, limit).map(({ item }) => {
    const r = buildFileLinkTarget(item.path, ctx)
    return r.ok ? { ...item, target: r.target } : { ...item, target: null, blockedBy: r.chars }
  })
  return { items, exactMatch }
}

/**
 * Markierung in Vorschlagslisten: gesperrte Einträge (z. B. `#` im Dateinamen) werden
 * übersprungen. Vorher stand die Markierung auf dem gesperrten ersten Eintrag und Enter
 * tat nichts (Test, 17.11.2026). Ohne wählbaren Eintrag bleibt der Ausgangsindex.
 */
export function firstSelectableIndex(items: ReadonlyArray<{ disabled?: boolean }>): number {
  const i = items.findIndex(it => !it.disabled)
  return i === -1 ? 0 : i
}

export function stepSelectableIndex(items: ReadonlyArray<{ disabled?: boolean }>, from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < items.length; i += dir) {
    if (!items[i].disabled) return i
  }
  return from
}
