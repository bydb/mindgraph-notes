// Symlink-sichere Vault-Pfad-Auflösung für die Telegram-Agent-Tools.
//
// Die frühere rein lexikalische Prüfung (path.resolve + startsWith) hielt
// `../`-Traversal auf, aber nicht Symlinks: ein Link im Vault, der nach außen
// zeigt, sah wie ein Vault-Pfad aus — readFile/writeFile folgten ihm trotzdem.
// Deshalb wird hier zusätzlich der tiefste existierende Teil des Zielpfads
// per realpath kanonisiert und das Containment auf kanonischen Pfaden geprüft.
// Symlinks, die INNERHALB des Vaults bleiben, sind weiterhin erlaubt.

import { promises as fs } from 'fs'
import path from 'path'

/**
 * Kanonisiert den tiefsten existierenden Vorfahren von `p` (oder `p` selbst,
 * falls existent) und hängt die nicht existierenden Restsegmente wieder an.
 * Nicht existierende Segmente können keine Symlinks sein — der existierende
 * Präfix ist der einzige Ort, an dem ein Link nach außen führen kann.
 */
async function canonicalizeDeepestExisting(p: string): Promise<string> {
  let current = p
  const suffix: string[] = []
  for (;;) {
    try {
      const real = await fs.realpath(current)
      return suffix.length > 0 ? path.join(real, ...suffix.reverse()) : real
    } catch {
      const parent = path.dirname(current)
      if (parent === current) throw new Error(`Pfad kann nicht aufgelöst werden: ${p}`)
      suffix.push(path.basename(current))
      current = parent
    }
  }
}

function assertContained(candidate: string, rootReal: string, hint: string): void {
  if (candidate !== rootReal && !candidate.startsWith(rootReal + path.sep)) {
    throw new Error(`Pfad liegt außerhalb des Vaults${hint}.`)
  }
}

/**
 * Löst einen Vault-relativen Pfad auf und garantiert, dass das tatsächliche
 * Ziel (nach Symlink-Auflösung) im Vault liegt. Gibt den kanonischen absoluten
 * Pfad zurück — alle fs-Operationen danach nur mit diesem Rückgabewert.
 * Funktioniert auch für noch nicht existierende Ziele (note_create).
 */
export async function resolveInVaultSafe(vaultRoot: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    throw new Error('Absoluter Pfad nicht erlaubt — bitte Vault-relativen Pfad nutzen.')
  }
  const rootReal = await fs.realpath(path.resolve(vaultRoot))
  const resolved = path.resolve(rootReal, relativePath)
  assertContained(resolved, rootReal, '')
  assertNotAppInternal(resolved, rootReal)
  const real = await canonicalizeDeepestExisting(resolved)
  assertContained(real, rootReal, ' (Symlink)')
  assertNotAppInternal(real, rootReal)
  return real
}

/**
 * `.mindgraph` ist interner App-Speicher (Entwürfe anderer Agent-Läufe, Backups,
 * Indizes): Pfade, die das MODELL wählt, dürfen nicht dorthin — vorher konnte
 * note_read dort Markdown lesen (Codex F03, 10.10.2026). Geprüft wird vor UND nach
 * der Symlink-Auflösung, ohne Groß-/Kleinschreibung (macOS-Dateisysteme sind meist
 * case-insensitiv: `.MindGraph` ist derselbe Ordner).
 *
 * Grenzen (Codex F27/F28, bewusst): Hardlinks erkennt realpath nicht, und gegen
 * einen gleichzeitigen Pfadtausch durch einen anderen lokalen Prozess schützt eine
 * Prüfung vor dem Zugriff nicht — beides setzt Schreibzugriff auf den Rechner voraus.
 * Einzelanhänge und Zielordner wählt der NUTZER, nicht das Modell; sie laufen über
 * assertSafePath und sind hier nicht gemeint.
 */
function assertNotAppInternal(candidate: string, rootReal: string): void {
  if (isAppInternalPath(rootReal, candidate)) {
    throw new Error('Pfad liegt im internen App-Ordner .mindgraph und ist für Werkzeuge gesperrt.')
  }
}

/** Liegt `candidate` (absolut) unterhalb von `<rootReal>/…/.mindgraph`? Rein lexikalisch —
 *  für einen Symlink-sicheren Befund beide Seiten vorher per realpath kanonisieren. */
export function isAppInternalPath(rootReal: string, candidate: string): boolean {
  return path.relative(rootReal, candidate).split(path.sep).some(seg => seg.toLowerCase() === '.mindgraph')
}

/** Symlink-sichere Variante: kanonisiert Vault-Root und Pfad (Zielordner, Projektordner),
 *  bevor geprüft wird — ein Vault-interner Link auf `.mindgraph` zählt als intern. */
export async function isAppInternalRealPath(vaultRoot: string, absPath: string): Promise<boolean> {
  const rootReal = await fs.realpath(path.resolve(vaultRoot))
  const real = await canonicalizeDeepestExisting(path.resolve(absPath))
  return isAppInternalPath(rootReal, real)
}

/**
 * Prüft einen bereits absoluten Pfad (z. B. aus Projekt-Discovery) gegen den
 * Vault — lexikalisch UND nach Symlink-Auflösung. Gibt den kanonischen Pfad zurück.
 */
export async function ensureAbsInVaultSafe(vaultRoot: string, absPath: string): Promise<string> {
  const rootReal = await fs.realpath(path.resolve(vaultRoot))
  const resolved = path.resolve(absPath)
  // Lexikalischer Vorab-Check gegen den unkanonisierten Root: akzeptiere Pfade,
  // die unter dem konfigurierten ODER dem kanonischen Root liegen (der Root
  // selbst darf ein Symlink sein, z. B. Vault via ~/Link).
  const rootResolved = path.resolve(vaultRoot)
  const underConfigured = resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)
  const underReal = resolved === rootReal || resolved.startsWith(rootReal + path.sep)
  if (!underConfigured && !underReal) {
    throw new Error('Pfad liegt außerhalb des Vaults.')
  }
  const real = await canonicalizeDeepestExisting(resolved)
  assertContained(real, rootReal, ' (Symlink)')
  return real
}
