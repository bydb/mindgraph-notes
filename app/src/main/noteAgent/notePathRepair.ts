// Falsch abgeschriebene Notizpfade abfangen.
//
// Auslöser (11.11.2026): Modelle schreiben Pfade mit Emojis und Sonderzeichen ungenau ab
// („…/💬 KI/…“ wird zu „…/ KI/…“, ein Ordner fehlt, ein Emoji ist vertauscht). Jeder solche
// Fehlgriff kostete einen Leseversuch und Platz im Kontext; in drei von vier Testläufen kam
// er mindestens zweimal vor. Findet note_read die Datei nicht, sucht dieser Helfer im Vault
// nach GENAU EINER Notiz, die gemeint sein muss. Bei mehreren Kandidaten wird nicht geraten.

import { promises as fs } from 'fs'
import * as path from 'path'

const MAX_FILES = 30_000

/** Vergleichsform: nur Buchstaben und Ziffern, klein, ohne Akzent-Varianten (NFKC). */
export function looseKey(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    // Modelle schreiben „Rueckmeldung“ für „Rückmeldung“ und umgekehrt — beides gleich behandeln.
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export interface PathRepair {
  /** Genau eine passende Notiz — vault-relativer Pfad. */
  match?: string
  /** Mehrere passende Notizen (höchstens fünf) — das Modell soll wählen. */
  candidates: string[]
}

/**
 * Passende Notiz zu einem nicht gefundenen Pfad suchen. Reihenfolge: gleicher Dateiname
 * (lose verglichen) — bei mehreren entscheidet der lose verglichene Gesamtpfad, sonst bleibt
 * es bei Kandidaten.
 */
export function repairNotePath(allRelPaths: string[], givenRel: string): PathRepair {
  const wantedName = looseKey(path.basename(givenRel, path.extname(givenRel)))
  if (!wantedName) return { candidates: [] }
  const sameName = allRelPaths.filter(p => looseKey(path.basename(p, path.extname(p))) === wantedName)
  if (sameName.length === 1) return { match: sameName[0], candidates: [] }
  if (sameName.length > 1) {
    const wantedPath = looseKey(givenRel.replace(/\.md$/i, ''))
    const samePath = sameName.filter(p => looseKey(p.replace(/\.md$/i, '')) === wantedPath)
    if (samePath.length === 1) return { match: samePath[0], candidates: [] }
    return { candidates: sameName.slice(0, 5) }
  }
  return { candidates: [] }
}

/** Alle Markdown-Notizen des Vaults (vault-relativ), ohne versteckte Ordner. */
export async function listVaultNotes(vaultPath: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dirAbs: string, dirRel: string): Promise<void> => {
    if (out.length >= MAX_FILES) return
    let entries
    try { entries = await fs.readdir(dirAbs, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(path.join(dirAbs, entry.name), rel)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(rel)
      if (out.length >= MAX_FILES) return
    }
  }
  await walk(vaultPath, '')
  return out
}
