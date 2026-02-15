import fs from 'fs/promises'
import path from 'path'
import { hashContent } from './crypto'

export interface FileInfo {
  hash: string
  size: number
  modifiedAt: number
  syncedAt: number | null
}

export interface FileManifest {
  files: Record<string, FileInfo>
  lastSyncTime: number
  vaultId: string
}

const EXCLUDE_PATTERNS = [
  '.DS_Store',
  'Thumbs.db',
  '*.tmp',
  '~*',
  '.mindgraph/sync-manifest.json',
  '.trash'
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

function shouldExclude(relativePath: string, fileName: string): boolean {
  if (EXCLUDE_PATTERNS.includes(fileName)) return true
  if (relativePath === '.mindgraph/sync-manifest.json') return true
  if (relativePath.startsWith('.trash/') || relativePath.startsWith('.trash\\')) return true
  if (fileName.startsWith('~')) return true
  if (fileName.endsWith('.tmp')) return true
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

async function walkDirectory(
  dirPath: string,
  basePath: string,
  files: Map<string, { absPath: string }>,
  excludeConfig?: ExcludeConfig
): Promise<void> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
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
        syncedAt: null
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
}

export function diffManifests(
  local: FileManifest,
  remote: FileManifest,
  previousLocal?: FileManifest
): ManifestDiff {
  const toUpload: string[] = []
  const toDownload: string[] = []
  const conflicts: string[] = []
  const toDeleteLocal: string[] = []
  const toDeleteRemote: string[] = []

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
      } else {
        // New local file, upload
        toUpload.push(filePath)
      }
    } else if (!localFile && remoteFile) {
      // Only exists remotely — was it previously synced locally and then deleted by the user?
      const previousFile = previousLocal?.files[filePath]
      if (previousFile && previousFile.syncedAt !== null) {
        // File was synced before but deleted locally → delete on server
        toDeleteRemote.push(filePath)
      } else {
        // New remote file, download
        toDownload.push(filePath)
      }
    } else if (localFile && remoteFile) {
      if (localFile.hash === remoteFile.hash) {
        // Identical, nothing to do
        continue
      }

      const localChanged = localFile.syncedAt === null || localFile.modifiedAt > localFile.syncedAt
      const remoteChanged = remoteFile.modifiedAt > (localFile.syncedAt || 0)

      if (localChanged && remoteChanged) {
        // Both changed = conflict
        conflicts.push(filePath)
      } else if (localChanged) {
        toUpload.push(filePath)
      } else {
        toDownload.push(filePath)
      }
    }
  }

  return { toUpload, toDownload, conflicts, toDeleteLocal, toDeleteRemote }
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
