/**
 * Wikilink → Vault-Datei (nicht Notiz) für Klicks: `[[Bericht.pdf]]`, `[[ordner/foto.png]]`.
 * Vorher öffnete ein Klick auf einen solchen Link nichts (Codex F20) — der Klickpfad
 * kannte nur Notizen und Plugin-Dateien.
 *
 * Erst der exakte vault-relative Pfad, dann der Dateiname — aber nur, wenn er eindeutig
 * ist. Bei mehreren gleichnamigen Dateien wird keine geraten.
 */

import { straightenQuotes } from './quoteNormalize'

export type FileLinkResolution =
  | { status: 'found'; path: string }
  | { status: 'ambiguous'; count: number }
  | { status: 'none' }

function key(text: string): string {
  return straightenQuotes(text.trim()).toLowerCase()
}

export function resolveFileLink(linkText: string, allPaths: readonly string[]): FileLinkResolution {
  const wanted = key(linkText.replace(/^\/+/, ''))
  if (!wanted) return { status: 'none' }
  const exact = allPaths.find(p => p === linkText.trim()) ?? allPaths.find(p => key(p) === wanted)
  if (exact) return { status: 'found', path: exact }
  const wantedBase = wanted.slice(wanted.lastIndexOf('/') + 1)
  // Nur ein reiner Dateiname darf per Namen gesucht werden; ein Pfad muss exakt passen.
  if (wantedBase !== wanted) return { status: 'none' }
  const byName = allPaths.filter(p => key(p.slice(p.lastIndexOf('/') + 1)) === wantedBase)
  if (byName.length === 1) return { status: 'found', path: byName[0] }
  if (byName.length > 1) return { status: 'ambiguous', count: byName.length }
  return { status: 'none' }
}
