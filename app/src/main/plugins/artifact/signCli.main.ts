// CLI-Entry des offiziellen Signierers (Bundle-Target → scripts/sign-plugin.cjs).
// Inputs kommen AUSSCHLIESSLICH aus ENV (nie in Shellcode interpoliert); der Privatkey aus
// PLUGIN_SIGNING_KEY. Schreibt das signierte Archiv. Wird im geschützten Environment via
// `node scripts/sign-plugin.cjs` ausgeführt — KEIN npm-Install, daher keine Dependency-Angriffsfläche.

import { createPrivateKey } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { signPlugin, SignError } from './signCli'
import { ArtifactError } from './limits'

async function main(): Promise<void> {
  const pem = process.env.PLUGIN_SIGNING_KEY
  if (!pem) {
    console.error('::error::PLUGIN_SIGNING_KEY fehlt (Environment release-signing nicht freigegeben?)')
    process.exit(2)
  }
  const artifactDir = process.env.ARTIFACT_DIR
  const expectedRepo = process.env.PLUGIN_REPO
  const expectedVersion = process.env.PLUGIN_VERSION
  const outPath = process.env.OUT_PATH
  if (!artifactDir || !expectedRepo || !expectedVersion || !outPath) {
    console.error('::error::ARTIFACT_DIR, PLUGIN_REPO, PLUGIN_VERSION, OUT_PATH erforderlich (ENV)')
    process.exit(2)
  }
  let signKey
  try {
    signKey = createPrivateKey({ key: pem, format: 'pem' })
  } catch {
    console.error('::error::PLUGIN_SIGNING_KEY ist kein gültiges PEM')
    process.exit(2)
  }
  if (signKey.asymmetricKeyType !== 'ed25519') {
    console.error('::error::PLUGIN_SIGNING_KEY ist kein Ed25519-Schlüssel')
    process.exit(2)
  }
  try {
    const archive = await signPlugin({ artifactDir, expectedRepo, expectedVersion, signKey })
    writeFileSync(outPath, archive)
    console.log(`Signiert: ${outPath} (${archive.length} Bytes, repo=${expectedRepo}, v=${expectedVersion})`)
  } catch (err) {
    // SignError = eigene Vertragsverletzung; ArtifactError = vom Walker/Verifier abgelehntes Artefakt
    // (Symlink, Limit, Pfad, Post-Verify) — beide sind eine bewusste Ablehnung, kein interner Fehler.
    if (err instanceof SignError || err instanceof ArtifactError) {
      console.error(`::error::Signierung abgelehnt: ${err.message}`)
      process.exit(1)
    }
    console.error('::error::Signierung fehlgeschlagen:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

void main()
