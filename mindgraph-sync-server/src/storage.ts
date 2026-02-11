import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'sync.db')

let db: Database.Database

export function initDatabase(): void {
  const dir = path.dirname(DB_PATH)
  const fs = require('fs')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      vault_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      iv BLOB NOT NULL,
      auth_tag BLOB NOT NULL,
      encrypted_data BLOB NOT NULL,
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      modified_at INTEGER NOT NULL,
      original_path TEXT NOT NULL DEFAULT '',
      uploaded_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (vault_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS vault_meta (
      vault_id TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (unixepoch()),
      last_activity INTEGER DEFAULT (unixepoch()),
      total_size INTEGER DEFAULT 0
    );
  `)
}

export function registerVault(vaultId: string): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO vault_meta (vault_id) VALUES (?)
  `)
  stmt.run(vaultId)

  db.prepare(`
    UPDATE vault_meta SET last_activity = unixepoch() WHERE vault_id = ?
  `).run(vaultId)
}

export function getManifest(
  vaultId: string
): Record<string, { hash: string; size: number; modifiedAt: number }> {
  const rows = db.prepare(`
    SELECT file_path, file_hash, file_size, modified_at, original_path
    FROM files WHERE vault_id = ?
  `).all(vaultId) as Array<{
    file_path: string
    file_hash: string
    file_size: number
    modified_at: number
    original_path: string
  }>

  const manifest: Record<string, { hash: string; size: number; modifiedAt: number }> = {}
  for (const row of rows) {
    const key = row.original_path || row.file_path
    manifest[key] = {
      hash: row.file_hash,
      size: row.file_size,
      modifiedAt: row.modified_at
    }
  }
  return manifest
}

export function storeFile(
  vaultId: string,
  filePath: string,
  iv: Buffer,
  authTag: Buffer,
  encryptedData: Buffer,
  fileHash: string,
  fileSize: number,
  modifiedAt: number,
  originalPath: string
): void {
  // Check vault size limit (500 MB)
  const meta = db.prepare('SELECT total_size FROM vault_meta WHERE vault_id = ?').get(vaultId) as
    | { total_size: number }
    | undefined

  const currentSize = meta?.total_size || 0
  if (currentSize + encryptedData.length > 500 * 1024 * 1024) {
    throw new Error('Vault storage limit exceeded (500 MB)')
  }

  // Check single file size limit (50 MB)
  if (encryptedData.length > 50 * 1024 * 1024) {
    throw new Error('File size limit exceeded (50 MB)')
  }

  // Get old file size for delta calculation
  const oldFile = db.prepare(
    'SELECT file_size FROM files WHERE vault_id = ? AND file_path = ?'
  ).get(vaultId, filePath) as { file_size: number } | undefined
  const oldSize = oldFile?.file_size || 0

  db.prepare(`
    INSERT OR REPLACE INTO files (vault_id, file_path, iv, auth_tag, encrypted_data, file_hash, file_size, modified_at, original_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(vaultId, filePath, iv, authTag, encryptedData, fileHash, fileSize, modifiedAt, originalPath)

  db.prepare(`
    UPDATE vault_meta SET total_size = total_size - ? + ?, last_activity = unixepoch() WHERE vault_id = ?
  `).run(oldSize, encryptedData.length, vaultId)
}

export function getFile(
  vaultId: string,
  filePath: string
): { iv: Buffer; authTag: Buffer; encryptedData: Buffer } | null {
  const row = db.prepare(`
    SELECT iv, auth_tag, encrypted_data FROM files WHERE vault_id = ? AND file_path = ?
  `).get(vaultId, filePath) as
    | { iv: Buffer; auth_tag: Buffer; encrypted_data: Buffer }
    | undefined

  if (!row) return null
  return {
    iv: row.iv,
    authTag: row.auth_tag,
    encryptedData: row.encrypted_data
  }
}

export function deleteFile(vaultId: string, filePath: string): void {
  const oldFile = db.prepare(
    'SELECT file_size FROM files WHERE vault_id = ? AND file_path = ?'
  ).get(vaultId, filePath) as { file_size: number } | undefined

  db.prepare('DELETE FROM files WHERE vault_id = ? AND file_path = ?').run(vaultId, filePath)

  if (oldFile) {
    db.prepare(`
      UPDATE vault_meta SET total_size = MAX(0, total_size - ?), last_activity = unixepoch() WHERE vault_id = ?
    `).run(oldFile.file_size, vaultId)
  }
}

export function closeDatabase(): void {
  if (db) db.close()
}
