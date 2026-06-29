// A3 (docs/plugin-store-A3-plan.md): mappt einen Plugin-Fehlercode (ArtifactErrorCode aus dem Main,
// app/src/main/plugins/artifact/limits.ts) auf einen Übersetzungs-Key für eine verständliche
// Nutzer-Meldung. Rein, React-/i18n-frei → testbar. Genutzt von Install-per-Repo, Update und
// (retrofit) Datei-Install in der Plugins-Sektion.

const CODE_KEY: Record<string, string> = {
  // Signatur / Integrität — der sicherheitsrelevante Kern
  'sig-mismatch': 'plugins.error.signature',
  'sig-invalid': 'plugins.error.signature',
  'sig-unknown-key': 'plugins.error.signatureKey',
  'hash-mismatch': 'plugins.error.integrity',
  'integrity-invalid': 'plugins.error.integrity',
  'size-mismatch': 'plugins.error.integrity',
  'fileset-mismatch': 'plugins.error.integrity',
  // Kompatibilität
  'incompatible-app': 'plugins.error.incompatibleApp',
  'incompatible-api': 'plugins.error.incompatibleApi',
  // Manifest / Entrypoint
  'manifest-invalid': 'plugins.error.manifestInvalid',
  'entrypoint-missing': 'plugins.error.entrypoint',
  'entrypoint-unsupported': 'plugins.error.entrypoint',
  // Größe
  'archive-too-large': 'plugins.error.tooLarge',
  'limit-file-size': 'plugins.error.tooLarge',
  'limit-total-size': 'plugins.error.tooLarge',
  // Download / Netzwerk (A2)
  'redirect-blocked': 'plugins.error.redirect',
  'download-failed': 'plugins.error.download',
  'download-timeout': 'plugins.error.timeout',
  'rate-limited': 'plugins.error.rateLimited',
  'asset-not-found': 'plugins.error.assetNotFound',
  'asset-ambiguous': 'plugins.error.assetAmbiguous',
  'release-not-found': 'plugins.error.releaseNotFound',
  'repo-ref-invalid': 'plugins.error.repoInvalid',
  // Install / Registry
  'id-collision': 'plugins.error.idCollision',
  'version-conflict': 'plugins.error.versionConflict',
  'workflow-collision': 'plugins.error.workflowCollision',
  'load-failed': 'plugins.error.loadFailed',
}

/** Übersetzungs-Key für einen Plugin-Fehlercode, oder `undefined` wenn unbekannt. Rein. */
export function pluginErrorKey(code: string | undefined | null): string | undefined {
  if (!code) return undefined
  return CODE_KEY[code]
}

/**
 * Verständlicher Fehlertext: bekannter Code → Übersetzung; sonst die rohe Server-Message; sonst eine
 * generische „unbekannt"-Meldung. `translate` ist injizierbar (i18n-frei testbar).
 */
export function pluginErrorText(
  translate: (key: string) => string,
  code: string | undefined | null,
  fallback?: string | null
): string {
  const key = pluginErrorKey(code)
  if (key) return translate(key)
  const raw = (fallback ?? '').trim()
  return raw || translate('plugins.error.unknown')
}
