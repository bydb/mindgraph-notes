// Größengeprüftes Einlesen eines `.mgxplugin`-Archivs von der Platte (A1, IPC-Grenze).
//
// Der Verifier limitiert die ENTPACKTE Größe streamend, liest aber einen fertigen Buffer. An der
// IPC-Grenze würde `fs.readFile` ein riesiges File ZUERST komplett in den RAM lesen (OOM-Vektor),
// bevor irgendein Limit greift. Darum hier: erst `stat`, gegen `maxArchiveBytes` (komprimiertes
// Limit) prüfen, und nur dann lesen.
import { stat, readFile } from 'node:fs/promises'
import { ARTIFACT_LIMITS, ArtifactError, type ArtifactLimits } from '../artifact/limits'

/** Schmale FS-Abstraktion — per DI injizierbar, damit Tests die Reihenfolge (stat VOR readFile)
 *  ohne Module-Mocking prüfen können. Produktion nutzt den Default (Node `fs/promises`). */
export interface ArchiveFs {
  stat: (p: string) => Promise<{ isFile(): boolean; size: number }>
  readFile: (p: string) => Promise<Buffer>
}
const NODE_FS: ArchiveFs = { stat, readFile }

/**
 * Liest die Datei `path`, nachdem ihre Größe gegen `limits.maxArchiveBytes` geprüft wurde.
 * Wirft `ArtifactError('archive-too-large')` für zu große bzw. `ArtifactError('entry-type')` für
 * nicht-reguläre Dateien — beide BEVOR auch nur ein Byte in den Speicher gelesen wird.
 */
export async function readArchiveFileCapped(
  path: string,
  limits: ArtifactLimits = ARTIFACT_LIMITS,
  fs: ArchiveFs = NODE_FS
): Promise<Buffer> {
  const st = await fs.stat(path)
  if (!st.isFile()) {
    throw new ArtifactError('entry-type', `Kein reguläres File: '${path}'`)
  }
  if (st.size > limits.maxArchiveBytes) {
    throw new ArtifactError(
      'archive-too-large',
      `Archiv (${st.size} Bytes) überschreitet das Limit von ${limits.maxArchiveBytes} Bytes`
    )
  }
  return fs.readFile(path)
}
