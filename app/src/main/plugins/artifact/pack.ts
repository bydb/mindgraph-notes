// Plugin-Artefakt-Packer (A0/3) — erzeugt ein deterministisches, signiertes `.mgxplugin`
// (tar.gz). Geteilt von Tests UND später vom Template-Build. Wendet dieselben Format-/Pfadregeln
// an wie der Verifier (format.ts). Siehe docs/plugin-artifact-format-plan.md.
//
// node-tar (ESM) wird dynamisch importiert (Repo-Muster für ESM-only Node-Deps im Main-Prozess).

import { createHash, sign as cryptoSign, type KeyObject } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import {
  canonicalJsonBytes,
  assertArtifactPath,
  INTEGRITY_FILE,
  SIG_FILE,
  MANIFEST_FILE,
  SIG_FORMAT_VERSION,
  SIG_ALGORITHM,
  INTEGRITY_FORMAT_VERSION,
  INTEGRITY_ALGORITHM,
  type IntegrityDoc,
  type IntegrityEntry,
} from './format'
import { assertSelfContainedEsm } from './esmCheck'

export interface PackFile {
  path: string
  content: Buffer
}

export interface PackInput {
  /** Nutzdateien inkl. `manifest.json`; OHNE integrity.json/.sig (werden hier erzeugt). */
  files: PackFile[]
  /** Ed25519-Privatschlüssel (KeyObject). Test: Dev-Key; CI: Prod-Key. */
  signKey: KeyObject
  keyId: string
}

const byPath = (a: { path: string }, b: { path: string }): number =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0

/**
 * Baut ein signiertes Artefakt-Tarball als Buffer. Schritte exakt nach ADR-Build-Reihenfolge:
 * Pfade prüfen → integrity.json (sortiert) → rohe Bytes signieren → deterministisches tar.gz.
 */
export async function packPluginArtifact(input: PackInput): Promise<Buffer> {
  const seen = new Set<string>()
  for (const f of input.files) {
    assertArtifactPath(f.path)
    if (f.path === INTEGRITY_FILE || f.path === SIG_FILE) {
      throw new Error(`'${f.path}' darf nicht als Nutzdatei übergeben werden (wird erzeugt)`)
    }
    if (seen.has(f.path)) throw new Error(`Doppelter Pfad '${f.path}'`)
    seen.add(f.path)
  }
  if (!seen.has(MANIFEST_FILE)) throw new Error(`'${MANIFEST_FILE}' fehlt in den Nutzdateien`)

  // Single-File-ESM-Vertrag des Renderer-Entries erzwingen (ADR §5.3, F12) — Build-Zeit-Gate, damit ein
  // nicht-selbstenthaltenes Bundle gar nicht erst signiert/verteilt wird (der Loader scheitert sonst erst
  // nach Top-Level-Seiteneffekten). Manifest-/Pfad-Validität prüft danach der Verifier; hier nur best-effort.
  const manifestFile = input.files.find((f) => f.path === MANIFEST_FILE)
  if (manifestFile) {
    let rendererRel: unknown
    try {
      rendererRel = (JSON.parse(manifestFile.content.toString('utf8')) as { entrypoints?: { renderer?: unknown } })
        ?.entrypoints?.renderer
    } catch {
      rendererRel = undefined // ungültiges Manifest → der Verifier lehnt es ab, kein ESM-Check nötig
    }
    if (typeof rendererRel === 'string') {
      const rf = input.files.find((f) => f.path === rendererRel)
      if (rf) assertSelfContainedEsm(rf.content.toString('utf8'), rendererRel)
    }
  }

  const payload = [...input.files].sort(byPath)
  const entries: IntegrityEntry[] = payload.map((f) => ({
    path: f.path,
    size: f.content.length,
    sha256: createHash('sha256').update(f.content).digest('hex'),
  }))
  const integrity: IntegrityDoc = {
    formatVersion: INTEGRITY_FORMAT_VERSION,
    algorithm: INTEGRITY_ALGORITHM,
    files: entries,
  }
  const integrityBytes = canonicalJsonBytes(integrity)
  const signature = cryptoSign(null, integrityBytes, input.signKey)
  const sigBytes = canonicalJsonBytes({
    formatVersion: SIG_FORMAT_VERSION,
    algorithm: SIG_ALGORITHM,
    keyId: input.keyId,
    signature: signature.toString('base64'),
  })

  const all: PackFile[] = [
    ...payload,
    { path: INTEGRITY_FILE, content: integrityBytes },
    { path: SIG_FILE, content: sigBytes },
  ]
  const dir = mkdtempSync(join(tmpdir(), 'mgxpack-'))
  try {
    for (const f of all) {
      const abs = join(dir, f.path)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, f.content)
    }
    const tar = await import('tar')
    const outPath = join(dir, '__artifact.tgz')
    const tarPaths = all.map((f) => f.path).sort()
    // portable: entfernt uid/gid/mtime-Nichtdeterminismus; explizite Dateipfade → keine Dir-Einträge.
    await tar.create({ gzip: { level: 9 }, portable: true, cwd: dir, file: outPath }, tarPaths)
    return readFileSync(outPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
