// Symlink-/Traversal-sichere Auflösung eines Store-Versionspfads (A1, P1-Fix).
// id/version stammen teils aus der UNTRUSTED active.json bzw. dem Manifest → strikt validieren und
// die reale Pfadkette (storeDir, <id>, <version>) auf Symlinkfreiheit + Store-Containment prüfen.
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { ArtifactError } from '../artifact/limits'

// Wie das Manifest-Schema (A0/2): Plugin-ID = lowercase, beginnt mit Buchstabe.
const ID_RE = /^[a-z][a-z0-9-]*$/
// Version = ein einzelnes, separatorfreies Segment (beginnt alphanumerisch). '..'/'.' damit ausgeschlossen.
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/

/**
 * Validiert `id`/`version` als sichere Pfadsegmente und liefert das Zielverzeichnis
 * `storeDir/<id>/<version>`. Existierende Komponenten der Kette dürfen **keine Symlinks** sein und
 * müssen **innerhalb** des (real aufgelösten) Stores liegen. Wirft `ArtifactError('path-invalid')`.
 */
export function assertSafeStoreVersionDir(storeDir: string, id: string, version: string): string {
  if (!ID_RE.test(id)) throw new ArtifactError('path-invalid', `Ungültige/unsichere Plugin-ID '${id}'`)
  if (!VERSION_RE.test(version)) throw new ArtifactError('path-invalid', `Ungültige/unsichere Version '${version}'`)
  const idDir = join(storeDir, id)
  const target = join(idDir, version)
  const realStore = existsSync(storeDir) ? realpathSync(storeDir) : null
  for (const p of [storeDir, idDir, target]) {
    if (!existsSync(p)) continue
    if (lstatSync(p).isSymbolicLink()) {
      throw new ArtifactError('path-invalid', `Symlink im Store-Pfad nicht erlaubt: '${p}'`)
    }
    if (realStore) {
      const real = realpathSync(p)
      if (real !== realStore && !real.startsWith(realStore + sep)) {
        throw new ArtifactError('path-invalid', `Pfad verlässt den Store: '${p}'`)
      }
    }
  }
  return target
}
