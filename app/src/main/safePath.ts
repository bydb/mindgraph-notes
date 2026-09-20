/**
 * Kanonischer Pfad auch für noch nicht existierende Ziele (Codex F39): der tiefste vorhandene
 * Vorfahr wird per `realpath` aufgelöst (Symlinks nach außen fliegen so auf), die fehlenden
 * Segmente werden unverändert angehängt. Vorher galt nur EIN fehlendes Segment — ein zweistufig
 * fehlender Standard-Notizordner (`Bereich/Notizen`) ließ `ensure-dir` mit „Pfad nicht erreichbar“
 * scheitern, bevor das rekursive mkdir laufen konnte. Der Aufrufer prüft danach weiterhin, dass
 * das Ergebnis in einer freigegebenen Vault-Wurzel liegt.
 */
import * as fs from 'fs/promises'
import * as path from 'path'

export async function canonicalizeAllowingMissing(resolved: string): Promise<string> {
  const missing: string[] = []
  // `..`/`.` werden wie vom Dateisystem aufgelöst; der Aufrufer prüft das Ergebnis gegen die
  // freigegebene Wurzel — ein `..` aus dem Vault heraus landet damit sichtbar außerhalb.
  let probe = path.resolve(resolved)
  for (;;) {
    try {
      const real = await fs.realpath(probe)
      return missing.length ? path.join(real, ...missing.reverse()) : real
    } catch {
      const parent = path.dirname(probe)
      if (parent === probe) throw new Error('Pfad nicht erreichbar')
      const segment = path.basename(probe)
      // `..` in fehlenden Segmenten darf den geprüften Vorfahren nicht wieder verlassen.
      if (segment === '..' || segment === '.') throw new Error('Pfad nicht erreichbar')
      missing.push(segment)
      probe = parent
    }
  }
}
