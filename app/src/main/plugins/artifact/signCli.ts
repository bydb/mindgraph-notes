// Offizieller Plugin-Signierer (zentral, trusted). Läuft AUSSCHLIESSLICH im geschützten
// mindgraph-notes-Environment `release-signing`; bekommt den Prod-Privatkey NIE aus Plugin-Repo-Code.
//
// Sicherheitsmodell: liest das Build-Artefakt-Verzeichnis als reine DATEN (führt NIE Plugin-Code aus),
// validiert hart, leitet den Public Key aus dem Secret ab und vergleicht ihn byte-genau mit
// OFFICIAL_KEYS (falsches Secret ⇒ Abbruch), packt+signiert kanonisch (pack.ts) und prüft das fertige
// Archiv NOCHMALS über den echten Verifier gegen OFFICIAL_KEYS. Reine Funktion (kein Top-Level-Run) →
// als gebündeltes Single-CJS committet + adversarial getestet; der CLI-Entry liegt in signCli.main.ts.

import { createPublicKey, type KeyObject } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateManifest, validateManifestSemantics } from '@mindgraph/plugin-api/validation'
import type { PluginManifest } from '@mindgraph/plugin-api'
import { packPluginArtifact } from './pack'
import { verifyPluginArtifact, assertEntrypointsPresent, readPluginDirFiles } from './verify'
import { keyringFromSpkiMap, OFFICIAL_KEYS } from '../runtime/keyring'
import { MANIFEST_FILE } from './format'
import { ARTIFACT_LIMITS } from './limits'
import { parseRepoRef, parseRepoUrl } from '../download'

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

  // (P1) Build-Artefakt ist UNTRUSTED: bounded + symlink-frei + mit DENSELBEN Limits wie der Verifier
  // einlesen (lstat-Größencheck VOR readFileSync) → kein OOM/DoS auf dem privilegierten Runner, bevor
  // gepackt und der Schlüssel genutzt wird. (P2) Der Walker läuft rekursiv und liefert POSIX-relative
  // Pfade → verschachtelte Entrypoints wie `dist/main.js` werden korrekt erfasst statt fälschlich abgelehnt.
  const present = readPluginDirFiles(input.artifactDir, ARTIFACT_LIMITS)

  // Manifest aus der (gecappten) Map als DATEN lesen + Schema/Semantik validieren.
  const manifestBuf = present.get(MANIFEST_FILE)
  if (!manifestBuf) throw new SignError(`${MANIFEST_FILE} fehlt im Artefakt`)
  let manifest: PluginManifest
  try {
    manifest = JSON.parse(manifestBuf.toString('utf8')) as PluginManifest
  } catch {
    throw new SignError(`${MANIFEST_FILE} ist kein gültiges JSON`)
  }
  const schema = validateManifest(manifest)
  if (!schema.valid) throw new SignError(`Manifest ungültig: ${schema.errors.join('; ')}`)
  const sem = validateManifestSemantics(manifest)
  if (!sem.valid) throw new SignError(`Manifest-Semantik ungültig: ${sem.errors.join('; ')}`)

  // (4) Version + Repo semantisch binden. Repo-Identität über die A2-Parser (parseRepoUrl/parseRepoRef)
  // — exakt dieselbe Normalisierung wie der Update-Checker, damit Signierer und Update dieselbe Identität sehen.
  if (manifest.version !== input.expectedVersion) {
    throw new SignError(`manifest.version '${manifest.version}' ≠ Tag-Version '${input.expectedVersion}'`)
  }
  if (!manifest.repo) throw new SignError('manifest.repo fehlt — für offizielle Signierung erforderlich.')
  const manifestRef = parseRepoUrl(manifest.repo)
  const wantRef = parseRepoRef(input.expectedRepo)
  if (
    manifestRef.owner.toLowerCase() !== wantRef.owner.toLowerCase() ||
    manifestRef.repo.toLowerCase() !== wantRef.repo.toLowerCase()
  ) {
    throw new SignError(
      `manifest.repo '${manifestRef.owner}/${manifestRef.repo}' ≠ Input-Repo '${wantRef.owner}/${wantRef.repo}'`
    )
  }

  // (4) Dateimenge EXAKT = manifest.json + deklarierte Entrypoints (POSIX-relativ verglichen).
  const expected = new Set<string>([MANIFEST_FILE])
  for (const k of ['main', 'renderer', 'styles'] as const) {
    const ep = manifest.entrypoints?.[k]
    if (ep) expected.add(ep)
  }
  for (const e of expected) if (!present.has(e)) throw new SignError(`Erwartete Datei fehlt: '${e}'`)
  for (const p of present.keys()) if (!expected.has(p)) throw new SignError(`Unerwartete Datei im Artefakt: '${p}'`)

  const payloadSet = new Set([...expected].filter((p) => p !== MANIFEST_FILE))
  assertEntrypointsPresent(manifest, payloadSet)

  const files = [...expected].map((p) => ({ path: p, content: present.get(p)! }))

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
