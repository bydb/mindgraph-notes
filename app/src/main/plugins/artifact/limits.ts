// Harte Grenzen + Fehlertaxonomie für das Plugin-Artefaktformat (A0/3, ADR
// docs/plugin-artifact-format-plan.md). Rein, ohne I/O — von Verifier UND (Test-)Packer geteilt,
// damit Writer und Verifier nachweislich dieselben Regeln verwenden.

/** Archiv-/Pfadlimits gegen Archive-Bombs und Ressourcen-Erschöpfung (überschreibbar in Tests). */
export interface ArtifactLimits {
  maxFiles: number
  maxArchiveBytes: number
  maxTotalUnpackedBytes: number
  maxFileBytes: number
  maxManifestBytes: number
  maxIntegrityBytes: number
  maxSigBytes: number
  maxPathLength: number
  maxPathDepth: number
  maxSegmentBytes: number
}

/** Default-Limits = ADR-Tabelle. */
export const ARTIFACT_LIMITS: ArtifactLimits = {
  maxFiles: 512,
  maxArchiveBytes: 100 * 1024 * 1024, // 100 MiB komprimiert
  maxTotalUnpackedBytes: 250 * 1024 * 1024, // 250 MiB entpackt (Summe)
  maxFileBytes: 100 * 1024 * 1024, // 100 MiB pro Datei
  maxManifestBytes: 1024 * 1024, // 1 MiB
  maxIntegrityBytes: 1024 * 1024, // 1 MiB
  maxSigBytes: 16 * 1024, // 16 KiB
  maxPathLength: 240,
  maxPathDepth: 8,
  maxSegmentBytes: 100, // USTAR-Namensfeld (kein PAX) → ≤ 100 ASCII-Bytes pro Segment
}

/**
 * Maschinenlesbarer Grund einer Artefakt-Ablehnung — analog zu `PluginErrorKind` (A0/2), aber für
 * die Verpackungs-/Integritätsebene. Jeder Wert entspricht genau einem Prüfschritt im Verifier.
 */
export type ArtifactErrorCode =
  | 'archive-too-large'
  | 'entry-type' // kein reguläres File (Dir/Symlink/Hardlink/Device/PAX/Global-Header)
  | 'path-invalid'
  | 'duplicate-path'
  | 'limit-files'
  | 'limit-file-size'
  | 'limit-total-size'
  | 'json-invalid'
  | 'integrity-invalid'
  | 'sig-invalid'
  | 'sig-unknown-key'
  | 'sig-mismatch'
  | 'hash-mismatch'
  | 'size-mismatch'
  | 'fileset-mismatch'
  | 'manifest-invalid'
  | 'incompatible-api'
  | 'incompatible-app'
  | 'entrypoint-missing'
  // — A1 (Runtime-Loader/Install) —
  | 'id-collision' // ID trifft ein gebündeltes/reserviertes Plugin
  | 'version-conflict' // id@version existiert mit ABWEICHENDEM Inhalt (nicht byte-identisch)
  | 'load-failed' // Entry (main.js) ließ sich nicht als PluginMainEntry laden

/** Terminaler Ablehnungsgrund eines Artefakts. `code` ist die maschinenlesbare Ursache. */
export class ArtifactError extends Error {
  readonly code: ArtifactErrorCode
  constructor(code: ArtifactErrorCode, message: string) {
    super(message)
    this.name = 'ArtifactError'
    this.code = code
  }
}
