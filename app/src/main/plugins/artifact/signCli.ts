// Offizieller Plugin-Signierer (zentral, trusted). Läuft AUSSCHLIESSLICH im geschützten
// mindgraph-notes-Environment `release-signing`; bekommt den Prod-Privatkey NIE aus Plugin-Repo-Code.
//
// Sicherheitsmodell: liest das Build-Artefakt-Verzeichnis als reine DATEN (führt NIE Plugin-Code aus),
// validiert hart, leitet den Public Key aus dem Secret ab und vergleicht ihn byte-genau mit
// OFFICIAL_KEYS (falsches Secret ⇒ Abbruch), packt+signiert kanonisch (pack.ts) und prüft das fertige
// Archiv NOCHMALS über den echten Verifier gegen OFFICIAL_KEYS. Reine Funktion (kein Top-Level-Run) →
// als gebündeltes Single-CJS committet + adversarial getestet; der CLI-Entry liegt in signCli.main.ts.

import { createPublicKey, type KeyObject } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateManifest, validateManifestSemantics } from '@mindgraph/plugin-api/validation'
import type { PluginManifest } from '@mindgraph/plugin-api'
import { packPluginArtifact } from './pack'
import { verifyPluginArtifact, assertEntrypointsPresent } from './verify'
import { keyringFromSpkiMap, OFFICIAL_KEYS } from '../runtime/keyring'
import { MANIFEST_FILE } from './format'

/** keyId des offiziellen Release-Signierschlüssels (Public Key gepinnt in OFFICIAL_KEYS). */
export const SIGNER_KEY_ID = 'mindgraph-release-2026-01'

// Compat-Gate des Post-Verify ist appVersion-abhängig; Signierung darf nicht an der Ziel-App-Version
// scheitern (das ist Install-Zeit). API-Kompat (von appVersion unabhängig) wird trotzdem geprüft.
const POST_VERIFY_APP_VERSION = '9999.0.0'

export class SignError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignError'
  }
}

export interface SignInput {
  /** Verzeichnis mit `manifest.json` + deklarierten Entrypoints (Build-Output, reine DATEN). */
  artifactDir: string
  /** Erwartetes `owner/repo` (Workflow-Input). */
  expectedRepo: string
  /** Erwartete Version `X.Y.Z` (aus dem Tag). */
  expectedVersion: string
  /** Ed25519-Privatschlüssel (aus dem Secret PLUGIN_SIGNING_KEY). */
  signKey: KeyObject
  /** Default: {@link SIGNER_KEY_ID}. */
  keyId?: string
}

const normPem = (pem: string): string => pem.replace(/\r\n/g, '\n').trim()

/** `owner/repo` aus einer github.com-Repo-URL (Manifest-Feld `repo`). */
function repoSlugFromUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new SignError(`manifest.repo ist keine gültige URL: '${url}'`)
  }
  if (u.hostname.toLowerCase() !== 'github.com') throw new SignError(`manifest.repo ist kein github.com-Repo: '${url}'`)
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new SignError(`manifest.repo ohne owner/repo: '${url}'`)
  return `${parts[0]}/${parts[1].replace(/\.git$/, '')}`
}

/**
 * Validiert ein Build-Artefakt streng und gibt das signierte `.mgxplugin` zurück. Wirft `SignError`
 * (bzw. `ArtifactError` aus pack/verify) bei jedem Verstoß — signiert nur, was alle Prüfungen besteht.
 */
export async function signPlugin(
  input: SignInput,
  deps: { officialKeys?: Record<string, string>; appVersion?: string } = {}
): Promise<Buffer> {
  const keyId = input.keyId ?? SIGNER_KEY_ID
  const officialKeys = deps.officialKeys ?? OFFICIAL_KEYS
  const appVersion = deps.appVersion ?? POST_VERIFY_APP_VERSION

  // (3) KEY-BINDING: Public Key aus dem Secret ableiten und byte-genau mit OFFICIAL_KEYS vergleichen.
  const official = officialKeys[keyId]
  if (!official) throw new SignError(`Kein OFFICIAL_KEYS-Eintrag für keyId '${keyId}'`)
  const derivedPub = createPublicKey(input.signKey).export({ type: 'spki', format: 'pem' }).toString()
  if (normPem(derivedPub) !== normPem(official)) {
    throw new SignError(`Secret-Public-Key ≠ OFFICIAL_KEYS['${keyId}'] — falscher Signierschlüssel.`)
  }

  // Manifest als DATEN lesen + Schema/Semantik validieren.
  let manifest: PluginManifest
  try {
    manifest = JSON.parse(readFileSync(join(input.artifactDir, MANIFEST_FILE), 'utf8')) as PluginManifest
  } catch {
    throw new SignError(`${MANIFEST_FILE} fehlt oder ist kein gültiges JSON`)
  }
  const schema = validateManifest(manifest)
  if (!schema.valid) throw new SignError(`Manifest ungültig: ${schema.errors.join('; ')}`)
  const sem = validateManifestSemantics(manifest)
  if (!sem.valid) throw new SignError(`Manifest-Semantik ungültig: ${sem.errors.join('; ')}`)

  // (4) Version + Repo semantisch binden.
  if (manifest.version !== input.expectedVersion) {
    throw new SignError(`manifest.version '${manifest.version}' ≠ Tag-Version '${input.expectedVersion}'`)
  }
  if (!manifest.repo) throw new SignError('manifest.repo fehlt — für offizielle Signierung erforderlich.')
  const slug = repoSlugFromUrl(manifest.repo)
  if (slug.toLowerCase() !== input.expectedRepo.toLowerCase()) {
    throw new SignError(`manifest.repo '${slug}' ≠ Input-Repo '${input.expectedRepo}'`)
  }

  // (4) Dateimenge EXAKT = manifest.json + deklarierte Entrypoints; nur reguläre Dateien.
  const expected = new Set<string>([MANIFEST_FILE])
  for (const k of ['main', 'renderer', 'styles'] as const) {
    const ep = manifest.entrypoints?.[k]
    if (ep) expected.add(ep)
  }
  const actual = readdirSync(input.artifactDir)
  for (const name of actual) {
    if (!lstatSync(join(input.artifactDir, name)).isFile()) {
      throw new SignError(`Nicht-reguläre Datei im Artefakt: '${name}'`)
    }
  }
  const actualSet = new Set(actual)
  for (const e of expected) if (!actualSet.has(e)) throw new SignError(`Erwartete Datei fehlt: '${e}'`)
  for (const a of actualSet) if (!expected.has(a)) throw new SignError(`Unerwartete Datei im Artefakt: '${a}'`)

  const payloadSet = new Set([...expected].filter((p) => p !== MANIFEST_FILE))
  assertEntrypointsPresent(manifest, payloadSet)

  const files = [...expected].map((p) => ({ path: p, content: readFileSync(join(input.artifactDir, p)) }))

  // Kanonisch packen + signieren.
  const archive = await packPluginArtifact({ files, signKey: input.signKey, keyId })

  // (3b) Fertiges Archiv NOCHMALS über den echten Verifier prüfen — gegen OFFICIAL_KEYS.
  const quarantineDir = mkdtempSync(join(tmpdir(), 'mgxsign-'))
  try {
    const verified = await verifyPluginArtifact(archive, {
      keyring: keyringFromSpkiMap(officialKeys),
      appVersion,
      quarantineDir,
    })
    if (verified.id !== manifest.id || verified.version !== manifest.version) {
      throw new SignError('Post-Verify: id/version des Archivs weichen vom Manifest ab')
    }
  } finally {
    rmSync(quarantineDir, { recursive: true, force: true })
  }
  return archive
}
