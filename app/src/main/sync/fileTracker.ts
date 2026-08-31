import fs from 'fs/promises'
import path from 'path'
import { hashContent } from './crypto'

export interface FileInfo {
  hash: string
  size: number
  modifiedAt: number
  syncedAt: number | null
  /**
   * Hash des Inhalts, den der Server für diesen Pfad BESTÄTIGT hat (Upload-Ack bzw.
   * gerade heruntergeladener Stand). Bewusst getrennt von `hash` (= Stand auf der
   * Platte) und von `syncedAt` (= Uhrzeit).
   *
   * Grund: „Hat sich lokal etwas geändert?" wurde vorher über `modifiedAt > syncedAt`
   * beantwortet — ein Uhrzeit-Vergleich. Ein einziger falsch gesetzter Stempel machte
   * eine lokale Änderung dauerhaft unsichtbar, und diffManifests schob den älteren
   * Server-Stand still darüber (kein Backup, keine Konfliktkopie — real passiert am
   * 09.06.2026, abgehakte Aufgaben standen danach wieder offen). Über den Hash ist die
   * Frage exakt und unabhängig von Uhren, Laufzeiten und Doppel-Writes beantwortbar.
   *
   * Optional: Manifeste aus älteren Versionen haben das Feld nicht — dort gilt weiter
   * die Zeitstempel-Regel, bis der Hash einmal gesetzt wurde.
   */
  syncedHash?: string | null
}

export interface FileManifest {
  files: Record<string, FileInfo>
  tombstones?: Record<string, number>  // exact path → deletion timestamp
  tombstonePrefixes?: Record<string, number>  // path prefix → deletion timestamp (for deleted folders)
  /** Im Dialog bestätigte Löschungen, die noch nicht auf dem Server vollzogen sind. */
  confirmedDeletions?: ConfirmedDeletions
  lastSyncTime: number
  vaultId: string
}

export function isTombstoned(filePath: string, manifest?: FileManifest): boolean {
  if (!manifest) return false
  if (manifest.tombstones?.[filePath]) return true
  if (manifest.tombstonePrefixes) {
    for (const prefix of Object.keys(manifest.tombstonePrefixes)) {
      if (filePath.startsWith(prefix)) return true
    }
  }
  return false
}

const EXCLUDE_PATTERNS = [
  '.DS_Store',
  'Thumbs.db',
  '*.tmp',
  '~*',
  '.mindgraph/sync-manifest.json',
  '.project-synonyms.json',
  '.trash',
  '.sync-trash'
]

const INCLUDE_EXTENSIONS = new Set([
  '.md',
  '.canvas',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.pdf',
  '.bmp'
])

const INCLUDE_DIRS = new Set([
  '.mindgraph',
  '.attachments'
])

/** Die alte Mailliste. Ab Fassung 2 liegt der Bestand in `email-store.json`;
 *  `emails.json` wird von dieser App nur noch EINMAL gelesen (Übernahme des
 *  Altbestands) und danach nie wieder angefasst.
 *
 *  Sie ist aber die ARBEITSDATEI von Geräten, die noch die alte Fassung fahren.
 *  Deshalb zwei Regeln, die zusammengehören:
 *   1. Nicht synchronisieren — sonst überschriebe ein Download die lokale
 *      Altdatei, bevor sie übernommen wurde.
 *   2. Ihr Verschwinden aus dem Manifest NICHT als Löschung deuten (s.
 *      `NEVER_PROPAGATE_DELETE`) — sonst löscht das aktualisierte Gerät sie auf
 *      dem Server, und das noch nicht aktualisierte löscht sie daraufhin bei
 *      sich. Regel 1 ohne Regel 2 wäre schlimmer als gar nichts zu tun. */
export const LEGACY_EMAIL_STORE_REL_PATH = '.mindgraph/emails.json'

/** Pfade, deren Fehlen im lokalen Manifest NIE als Löschung gilt.
 *
 *  Normalerweise heißt „war mal synchronisiert, ist lokal weg" = der Nutzer hat
 *  gelöscht. Für Dateien, die eine neue App-Fassung bloß nicht mehr anfasst,
 *  stimmt das nicht — dort ist das Fehlen eine Entscheidung des Programms, keine
 *  des Nutzers. Solche Pfade werden schlicht in Ruhe gelassen. */
export const NEVER_PROPAGATE_DELETE = new Set<string>([LEGACY_EMAIL_STORE_REL_PATH])

function shouldExclude(relativePath: string, fileName: string): boolean {
  if (EXCLUDE_PATTERNS.includes(fileName)) return true
  if (relativePath === '.mindgraph/sync-manifest.json') return true
  if (relativePath === '.mindgraph/notes-cache.json') return true
  if (relativePath === LEGACY_EMAIL_STORE_REL_PATH) return true
  if (relativePath.startsWith('.mindgraph/backups/') || relativePath.startsWith('.mindgraph\\backups\\')) return true
  // Projekt-RAG-Indizes sind geräte-lokal abgeleitete Daten (große Embeddings,
  // modellabhängig) — wie die Backups vom Sync ausgeschlossen.
  if (relativePath.startsWith('.mindgraph/rag/') || relativePath.startsWith('.mindgraph\\rag\\')) return true
  // Smart-Connections-Embedding-Caches: ebenfalls geräte-lokal ableitbar UND größenkritisch —
  // embeddings-bge-m3-latest.json wuchs auf 83 MB und sprengte nach base64 (×4/3 ≈ 106 MiB)
  // das 100-MiB-ws-maxPayload des Sync-Servers → Verbindungsabbruch + Retry-Endlosschleife.
  if (relativePath.startsWith('.mindgraph/embeddings-') || relativePath.startsWith('.mindgraph\\embeddings-')) return true
  // Notiz-Agent-Staging: unbestätigte Agent-Outputs (Phase 2) bleiben geräte-lokal —
  // NICHTS davon darf vor der menschlichen Abnahme auf andere Geräte syncen
  // (docs/note-agent-harness-plan.md, F03).
  if (relativePath.startsWith('.mindgraph/agent-staging/') || relativePath.startsWith('.mindgraph\\agent-staging\\')) return true
  if (relativePath.startsWith('.trash/') || relativePath.startsWith('.trash\\')) return true
  if (relativePath.startsWith('.sync-trash/') || relativePath.startsWith('.sync-trash\\')) return true
  if (fileName.startsWith('~')) return true
  if (fileName.endsWith('.tmp')) return true
  if (fileName.includes('.sync-conflict-')) return true
  return false
}

export interface ExcludeConfig {
  folders: string[]
  extensions: string[]
}

function shouldInclude(relativePath: string, excludeConfig?: ExcludeConfig): boolean {
  const ext = path.extname(relativePath).toLowerCase()
  const topDir = relativePath.split(/[/\\]/)[0]

  // Check user exclude extensions
  if (excludeConfig?.extensions.length) {
    const normalizedExts = excludeConfig.extensions.map(e => e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`)
    if (normalizedExts.includes(ext)) return false
  }

  // Check user exclude folders
  if (excludeConfig?.folders.length) {
    const pathParts = relativePath.split(/[/\\]/)
    for (const folder of excludeConfig.folders) {
      if (pathParts.includes(folder)) return false
    }
  }

  // Files in root with allowed extensions
  if (INCLUDE_EXTENSIONS.has(ext)) return true
  // JSON files inside .mindgraph
  if (topDir === '.mindgraph' && ext === '.json') return true
  // Files inside .attachments
  if (topDir === '.attachments') return true

  return false
}

export function isSyncable(relativePath: string, excludeConfig?: ExcludeConfig): boolean {
  const fileName = path.basename(relativePath)
  if (shouldExclude(relativePath, fileName)) return false
  return shouldInclude(relativePath, excludeConfig)
}

async function walkDirectory(
  dirPath: string,
  basePath: string,
  files: Map<string, { absPath: string }>,
  excludeConfig?: ExcludeConfig
): Promise<void> {
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
  try {
    const raw = await fs.readdir(dirPath, { withFileTypes: true })
    entries = raw.map(e => ({
      name: typeof e.name === 'string' ? e.name : String(e.name),
      isDirectory: () => e.isDirectory(),
      isFile: () => e.isFile()
    }))
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/')

    if (shouldExclude(relativePath, entry.name)) continue

    if (entry.isDirectory()) {
      // Check user exclude folders
      if (excludeConfig?.folders.length && excludeConfig.folders.includes(entry.name)) {
        continue
      }

      const topDir = relativePath.split('/')[0]
      // Only recurse into known dirs or top-level non-hidden dirs
      if (INCLUDE_DIRS.has(topDir) || !entry.name.startsWith('.')) {
        await walkDirectory(fullPath, basePath, files, excludeConfig)
      }
    } else if (entry.isFile()) {
      if (shouldInclude(relativePath, excludeConfig)) {
        files.set(relativePath, { absPath: fullPath })
      }
    }
  }
}

export async function buildManifest(
  vaultPath: string,
  vaultId: string,
  excludeConfig?: ExcludeConfig
): Promise<FileManifest> {
  const filesMap = new Map<string, { absPath: string }>()
  await walkDirectory(vaultPath, vaultPath, filesMap, excludeConfig)

  const files: Record<string, FileInfo> = {}

  for (const [relativePath, { absPath }] of filesMap) {
    try {
      const [content, stats] = await Promise.all([
        fs.readFile(absPath),
        fs.stat(absPath)
      ])
      files[relativePath] = {
        hash: hashContent(content),
        size: stats.size,
        modifiedAt: Math.floor(stats.mtimeMs),
        syncedAt: null,
        syncedHash: null
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return {
    files,
    lastSyncTime: 0,
    vaultId
  }
}

export interface ManifestDiff {
  toUpload: string[]
  toDownload: string[]
  conflicts: string[]
  toDeleteLocal: string[]
  toDeleteRemote: string[]
  /** Lokale Dateien über maxUploadSize — kommen NIE in toUpload/conflicts. Ein Upload
   *  über dem Server-Payload-Limit killt die WS-Verbindung, der Auto-Sync retryt dieselbe
   *  Datei endlos und alles dahinter in der Queue synct nie. Kaller loggt diese Liste. */
  skippedTooLarge: string[]
}

export function diffManifests(
  local: FileManifest,
  remote: FileManifest,
  previousLocal?: FileManifest,
  serverTombstones?: Record<string, { deletedAt: number }>,
  maxUploadSize?: number
): ManifestDiff {
  const toUpload: string[] = []
  const toDownload: string[] = []
  const conflicts: string[] = []
  const toDeleteLocal: string[] = []
  const toDeleteRemote: string[] = []
  const skippedTooLarge: string[] = []

  const tooLarge = (f: FileInfo | undefined): boolean =>
    maxUploadSize !== undefined && !!f && f.size > maxUploadSize

  const allPaths = new Set([
    ...Object.keys(local.files),
    ...Object.keys(remote.files)
  ])

  for (const filePath of allPaths) {
    const localFile = local.files[filePath]
    const remoteFile = remote.files[filePath]

    if (localFile && !remoteFile) {
      // Only exists locally
      if (localFile.syncedAt !== null) {
        // Was previously synced, now deleted remotely
        toDeleteLocal.push(filePath)
      } else if (serverTombstones?.[filePath]) {
        // Server has a tombstone for this file — it was deleted by another client.
        // Even though our manifest is fresh (syncedAt === null), don't re-upload.
        toDeleteLocal.push(filePath)
      } else if (tooLarge(localFile)) {
        // Zu groß für einen Upload — melden statt in die Queue (s. skippedTooLarge)
        skippedTooLarge.push(filePath)
      } else {
        // New local file, upload
        toUpload.push(filePath)
      }
    } else if (!localFile && remoteFile) {
      // Diese Datei fasst die App nicht mehr an (s. NEVER_PROPAGATE_DELETE). Ihr
      // Fehlen im lokalen Manifest ist deshalb KEINE Löschung durch den Nutzer:
      // weder herunterladen noch auf dem Server löschen, einfach liegen lassen.
      // Ohne diesen Zweig würde das aktualisierte Gerät die alte Mailliste auf
      // dem Server löschen — und das noch nicht aktualisierte Gerät zöge daraus
      // den Schluss, sie auch lokal zu löschen. Genau dessen Arbeitsdatei.
      if (NEVER_PROPAGATE_DELETE.has(filePath)) continue

      // Only exists remotely — was it previously synced locally and then deleted by the user?
      const previousFile = previousLocal?.files[filePath]
      if (previousFile && previousFile.syncedAt !== null) {
        // File was synced before but deleted locally → delete on server
        toDeleteRemote.push(filePath)
      } else if (isTombstoned(filePath, previousLocal)) {
        // File was intentionally deleted before → delete on server
        toDeleteRemote.push(filePath)
      } else {
        // New remote file, download
        toDownload.push(filePath)
      }
    } else if (localFile && remoteFile) {
      if (localFile.hash === remoteFile.hash) {
        // Identical — mark as synced so future deletion detection works
        // without relying on server tombstones (which get purged)
        if (localFile.syncedAt === null) {
          localFile.syncedAt = Date.now()
        }
        // Beide Seiten tragen denselben Inhalt: damit ist er nachweislich bestätigt.
        localFile.syncedHash = localFile.hash
        continue
      }

      // Bevorzugt inhaltsbasiert entscheiden (s. FileInfo.syncedHash). Nur wenn der
      // bestätigte Hash fehlt — Manifest einer älteren Version — fällt die Entscheidung
      // auf den alten Zeitstempel-Vergleich zurück.
      const syncedHash = localFile.syncedHash
      const localChanged = syncedHash != null
        ? localFile.hash !== syncedHash
        : localFile.syncedAt === null || localFile.modifiedAt > localFile.syncedAt
      const remoteChanged = syncedHash != null
        ? remoteFile.hash !== syncedHash
        : remoteFile.modifiedAt > (localFile.syncedAt || 0)

      if (localChanged && tooLarge(localFile)) {
        // Upload unmöglich (Payload-Limit); Download würde den neueren lokalen Stand
        // überschreiben → weder noch, nur melden. Lokale Datei bleibt unangetastet.
        skippedTooLarge.push(filePath)
      } else if (localChanged && remoteChanged) {
        // Both changed = conflict
        conflicts.push(filePath)
      } else if (localChanged) {
        toUpload.push(filePath)
      } else {
        toDownload.push(filePath)
      }
    }
  }

  return { toUpload, toDownload, conflicts, toDeleteLocal, toDeleteRemote, skippedTooLarge }
}

/**
 * Schwellen der Löschbremse.
 *
 * Die frühere Regel verlangte `Anteil > 10% UND Anzahl >= 10` — beides zugleich.
 * Damit rutschten zwei reale Fälle durch:
 *   - 49 von 7181 Dateien (0,7 %) → Anteil zu klein, lief still durch
 *   - 9 von 20 Dateien (45 %)     → Anzahl zu klein, lief still durch
 * Jetzt reicht EIN Kriterium zum Blockieren.
 */
export const DELETION_GUARD = {
  /** Ab so vielen unerklärten Löschungen wird unabhängig vom Anteil blockiert. */
  ABSOLUTE: 25,
  RATIO: 0.1,
  /** Untergrenze für die Anteilsregel — sonst blockiert ein 3-Dateien-Vault dauernd. */
  MIN_FOR_RATIO: 3
}

export interface DeletionAssessment {
  /** Löschungen, deren Inhalt im selben Lauf unter anderem Namen wandert = Umbenennung. */
  renames: string[]
  /**
   * Löschungen, deren Inhalt auf der überlebenden Seite schon unter einem anderen Pfad
   * liegt — der Pfad verschwindet, der Inhalt nicht.
   */
  preserved: string[]
  /** Vom Nutzer im Dialog bestätigte Löschungen — kein Verdachtsfall. */
  intentional: string[]
  /** Alles andere — echter Verlust, wenn die Annahme falsch ist. */
  unmatched: string[]
  blocked: boolean
  reason: 'absolute' | 'ratio' | null
}

/**
 * Bewertet anstehende Löschungen, bevor sie ausgeführt werden.
 *
 * Kernidee: Eine Löschung, deren Inhalt im selben Durchlauf unter einem anderen
 * Pfad in die Gegenrichtung übertragen wird, ist eine Umbenennung/Verschiebung —
 * kein Datenverlust. Solche Fälle dürfen die Bremse nicht auslösen (real: ein Vault,
 * dessen Umlaut-Dateinamen beim Kopieren zwischen zwei Macs anders codiert wurden —
 * 1434 Dateien sahen aus wie „gelöscht + neu"). Erst was danach übrig bleibt, wird
 * an den Schwellen gemessen.
 *
 * @param hashOf              Inhalts-Hash der zu löschenden Datei
 * @param compensatingHashes  Hashes der Dateien, die im selben Lauf in die
 *                            Gegenrichtung gehen (Uploads bei Server-Löschungen,
 *                            Downloads bei lokalen Löschungen)
 */
export function assessDeletions(params: {
  deletions: string[]
  totalFiles: number
  hashOf: (path: string) => string | undefined
  /**
   * Hashes der Dateien, die im selben Lauf in die Gegenrichtung gehen — als
   * ZÄHLENDE Liste, nicht als Set. Jeder Eintrag entlastet genau EINE Löschung.
   *
   * Vorher stand hier ein Set: ein einziger Hash entschuldigte damit beliebig viele
   * gelöschte Dateien gleichen Inhalts. Bei leeren Notizen oder identischen Vorlagen
   * ist das real — eine neu angelegte leere Notiz hätte 300 gelöschte leere Notizen
   * als „Umbenennung" durchgewinkt und die Löschbremse komplett ausgehebelt.
   */
  compensatingHashes: Iterable<string>
  /**
   * Hat der Nutzer diesen Pfad in der App ausdrücklich zum Löschen bestätigt?
   *
   * Die Bremse schützt gegen ÜBERRASCHENDE Massenlöschungen (kaputtes Manifest,
   * NFC/NFD-Umlaute, Verbindungsabbruch). Eine Löschung, die der Nutzer im Dialog
   * bestätigt hat, ist keine Überraschung. Ohne diese Unterscheidung blockierte die
   * Bremse jeden großen Ordner, den jemand bewusst gelöscht hat — die App meldete
   * „wird beim nächsten Sync nachgezogen", und genau das passierte dann nie.
   * Löschungen aus dem Finder laufen weiterhin durch die Bremse.
   */
  isIntentional?: (path: string) => boolean
  /**
   * Liegt dieser Inhalt auf der überlebenden Seite noch unter einem ANDEREN Pfad?
   * (Bei Server-Löschungen: irgendwo lokal. Bei lokalen Löschungen: irgendwo auf dem Server.)
   *
   * Bewusst ein Prädikat und KEIN Budget wie `compensatingHashes` — die beiden
   * beantworten verschiedene Fragen. Das Budget fragt „wandert der Inhalt in diesem
   * Lauf mit?"; ein Transfer ist eine Mengenbilanz, N eingehende Dateien können
   * höchstens N Löschungen decken. Hier lautet die Frage „existiert der Inhalt danach
   * überhaupt noch?" — das ist eine Eigenschaft des Inhalts, keine verbrauchbare
   * Ressource. Eine überlebende Kopie macht beliebig viele Dubletten-Pfade löschbar,
   * ohne dass Inhalt verloren geht.
   *
   * Realer Auslöser (17.08.2026): ein Ordner wurde lokal verschoben, lag auf dem Server
   * aber in ZWEI alten Kopien. Das Budget aus `toUpload` deckte nur eine davon — die
   * zweite blieb „unerklärt", 207 Stück, und die Bremse blockierte den Voll-Sync zwei
   * Tage lang. Ausweg war nur der rote Erzwingen-Knopf. Von 396 Löschungen waren 388
   * nachweisbar Verschiebungen: der Inhalt lag lokal Byte-für-Byte am neuen Ort.
   *
   * Preis, bewusst in Kauf genommen: ein Ordner mit N inhaltsgleichen Notizen (leere
   * Notizen, identische Vorlagen) läuft durch, sobald eine Kopie woanders überlebt. Das
   * kostet Pfade, keinen Inhalt — und beide Richtungen sind umkehrbar (lokal
   * `.sync-trash`, auf dem Server 90 Tage Soft-Delete). Ein zwei Tage stehender Sync
   * ist der teurere Fehler.
   */
  contentSurvives?: (hash: string) => boolean
}): DeletionAssessment {
  const { deletions, totalFiles, hashOf, isIntentional, contentSurvives } = params

  // Multiset: Hash → wie viele Löschungen dieser Hash noch decken kann.
  const budget = new Map<string, number>()
  for (const hash of params.compensatingHashes) {
    budget.set(hash, (budget.get(hash) ?? 0) + 1)
  }

  const renames: string[] = []
  const preserved: string[] = []
  const intentional: string[] = []
  const unmatched: string[] = []

  for (const filePath of deletions) {
    if (isIntentional?.(filePath)) {
      intentional.push(filePath)
      continue
    }
    const hash = hashOf(filePath)
    if (hash && contentSurvives?.(hash)) {
      preserved.push(filePath)
      continue
    }
    const left = hash ? budget.get(hash) ?? 0 : 0
    if (hash && left > 0) {
      budget.set(hash, left - 1)
      renames.push(filePath)
    } else {
      unmatched.push(filePath)
    }
  }

  if (unmatched.length >= DELETION_GUARD.ABSOLUTE) {
    return { renames, preserved, intentional, unmatched, blocked: true, reason: 'absolute' }
  }

  if (
    totalFiles > 0 &&
    unmatched.length >= DELETION_GUARD.MIN_FOR_RATIO &&
    unmatched.length / totalFiles > DELETION_GUARD.RATIO
  ) {
    return { renames, preserved, intentional, unmatched, blocked: true, reason: 'ratio' }
  }

  return { renames, preserved, intentional, unmatched, blocked: false, reason: null }
}

/**
 * Vom Nutzer bestätigte Löschabsichten. Einzelne Dateien stehen als exakter Pfad,
 * gelöschte Ordner als Pfad-Präfix — sonst müsste beim Löschen eines Ordners mit
 * 400 Dateien jeder einzelne Pfad einzeln vermerkt werden.
 */
export interface ConfirmedDeletions {
  paths: Record<string, number>
  prefixes: Record<string, number>
}

/** Trägt bestätigte Löschungen in ein Manifest ein (rein, ohne fs). */
export function addConfirmedDeletions(
  manifest: FileManifest,
  relativePaths: string[],
  kind: 'file' | 'directory',
  now: number
): void {
  if (!manifest.confirmedDeletions) manifest.confirmedDeletions = { paths: {}, prefixes: {} }
  for (const raw of relativePaths) {
    const rel = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    if (!rel) continue
    if (kind === 'directory') manifest.confirmedDeletions.prefixes[`${rel}/`] = now
    else manifest.confirmedDeletions.paths[rel] = now
  }
}

/**
 * Schreibt die Löschabsicht direkt ins Manifest auf der Platte — für den Fall, dass
 * gerade KEINE Sync-Engine läuft (Sync abgeschaltet, oder App frisch gestartet und
 * `sync-restore` noch nicht durch). Ohne diesen Weg wäre die Bestätigung verloren und
 * die Löschbremse würde beim späteren Aktivieren erneut anschlagen.
 *
 * Läuft eine Engine, MUSS stattdessen deren Methode benutzt werden: sie hält das
 * Manifest im Speicher und würde diese Datei beim nächsten Speichern überschreiben.
 */
export async function recordConfirmedDeletions(
  vaultPath: string,
  relativePaths: string[],
  kind: 'file' | 'directory'
): Promise<void> {
  if (relativePaths.length === 0) return
  const manifest = await loadManifest(vaultPath)
  if (!manifest) return  // Vault war nie im Sync — es gibt nichts zu vermerken.
  addConfirmedDeletions(manifest, relativePaths, kind, Date.now())
  await saveManifest(vaultPath, manifest)
}

export function isConfirmedDeletion(filePath: string, confirmed?: ConfirmedDeletions): boolean {
  if (!confirmed) return false
  if (confirmed.paths[filePath] !== undefined) return true
  for (const prefix of Object.keys(confirmed.prefixes)) {
    if (filePath.startsWith(prefix)) return true
  }
  return false
}

const MANIFEST_FILE = '.mindgraph/sync-manifest.json'

export async function loadManifest(vaultPath: string): Promise<FileManifest | null> {
  try {
    const manifestPath = path.join(vaultPath, MANIFEST_FILE)
    const content = await fs.readFile(manifestPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function saveManifest(
  vaultPath: string,
  manifest: FileManifest
): Promise<void> {
  const manifestPath = path.join(vaultPath, MANIFEST_FILE)
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
}
