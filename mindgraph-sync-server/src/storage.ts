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
      deleted_at INTEGER DEFAULT NULL,
      PRIMARY KEY (vault_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS vault_meta (
      vault_id TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (unixepoch()),
      last_activity INTEGER DEFAULT (unixepoch()),
      total_size INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activation_keys (
      key TEXT PRIMARY KEY,
      note TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      used_by_vault TEXT DEFAULT NULL
    );
  `)

  // Migration: add deleted_at column if missing (for existing databases)
  try {
    db.exec(`ALTER TABLE files ADD COLUMN deleted_at INTEGER DEFAULT NULL`)
  } catch {
    // Column already exists — ignore
  }
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
    FROM files WHERE vault_id = ? AND deleted_at IS NULL
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
  // Check vault size limit (5 GB)
  const meta = db.prepare('SELECT total_size FROM vault_meta WHERE vault_id = ?').get(vaultId) as
    | { total_size: number }
    | undefined

  const currentSize = meta?.total_size || 0
  if (currentSize + encryptedData.length > 5 * 1024 * 1024 * 1024) {
    throw new Error('Vault storage limit exceeded (5 GB)')
  }

  // Check single file size limit (100 MB)
  if (encryptedData.length > 100 * 1024 * 1024) {
    throw new Error('File size limit exceeded (100 MB)')
  }

  // Get old file size for delta calculation (including soft-deleted files)
  const oldFile = db.prepare(
    'SELECT file_size, deleted_at FROM files WHERE vault_id = ? AND file_path = ?'
  ).get(vaultId, filePath) as { file_size: number; deleted_at: number | null } | undefined
  const oldSize = oldFile ? (oldFile.deleted_at ? 0 : oldFile.file_size) : 0

  // If file was soft-deleted, hard-delete it first so INSERT OR REPLACE works cleanly
  if (oldFile?.deleted_at) {
    db.prepare('DELETE FROM files WHERE vault_id = ? AND file_path = ?').run(vaultId, filePath)
  }

  db.prepare(`
    INSERT OR REPLACE INTO files (vault_id, file_path, iv, auth_tag, encrypted_data, file_hash, file_size, modified_at, original_path, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
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
    SELECT iv, auth_tag, encrypted_data FROM files WHERE vault_id = ? AND file_path = ? AND deleted_at IS NULL
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
    'SELECT file_size FROM files WHERE vault_id = ? AND file_path = ? AND deleted_at IS NULL'
  ).get(vaultId, filePath) as { file_size: number } | undefined

  // Soft-delete: set deleted_at timestamp instead of removing
  db.prepare(
    'UPDATE files SET deleted_at = unixepoch() WHERE vault_id = ? AND file_path = ? AND deleted_at IS NULL'
  ).run(vaultId, filePath)

  if (oldFile) {
    db.prepare(`
      UPDATE vault_meta SET total_size = MAX(0, total_size - ?), last_activity = unixepoch() WHERE vault_id = ?
    `).run(oldFile.file_size, vaultId)
  }
}

export function getDeletedFiles(vaultId: string): Array<{ path: string; originalPath: string; size: number; deletedAt: number }> {
  const rows = db.prepare(`
    SELECT file_path, original_path, file_size, deleted_at
    FROM files WHERE vault_id = ? AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `).all(vaultId) as Array<{
    file_path: string
    original_path: string
    file_size: number
    deleted_at: number
  }>

  return rows.map(r => ({
    path: r.file_path,
    originalPath: r.original_path || r.file_path,
    size: r.file_size,
    deletedAt: r.deleted_at
  }))
}

export function restoreFile(vaultId: string, filePath: string): boolean {
  const result = db.prepare(
    'UPDATE files SET deleted_at = NULL WHERE vault_id = ? AND file_path = ? AND deleted_at IS NOT NULL'
  ).run(vaultId, filePath)

  if (result.changes > 0) {
    // Re-add file size to vault total
    const file = db.prepare(
      'SELECT file_size FROM files WHERE vault_id = ? AND file_path = ?'
    ).get(vaultId, filePath) as { file_size: number } | undefined

    if (file) {
      db.prepare(
        'UPDATE vault_meta SET total_size = total_size + ?, last_activity = unixepoch() WHERE vault_id = ?'
      ).run(file.file_size, vaultId)
    }
    return true
  }
  return false
}

export function purgeDeletedFiles(): number {
  // Hard-delete files that were soft-deleted more than 7 days ago (604800 seconds)
  const result = db.prepare(
    'DELETE FROM files WHERE deleted_at IS NOT NULL AND deleted_at < unixepoch() - 604800'
  ).run()
  if (result.changes > 0) {
    console.log(`[Storage] Purged ${result.changes} soft-deleted files older than 7 days`)
  }
  return result.changes
}

export function vaultExists(vaultId: string): boolean {
  const row = db.prepare('SELECT 1 FROM vault_meta WHERE vault_id = ?').get(vaultId)
  return !!row
}

export function validateActivationKey(key: string): boolean {
  const row = db.prepare('SELECT 1 FROM activation_keys WHERE key = ? AND active = 1').get(key)
  return !!row
}

export function claimActivationKey(key: string, vaultId: string): void {
  db.prepare('UPDATE activation_keys SET used_by_vault = ? WHERE key = ?').run(vaultId, key)
}

export function addActivationKey(key: string, note: string): void {
  db.prepare('INSERT OR IGNORE INTO activation_keys (key, note) VALUES (?, ?)').run(key, note)
}

export function listActivationKeys(): Array<{ key: string; note: string; active: number; created_at: number; used_by_vault: string | null }> {
  return db.prepare('SELECT key, note, active, created_at, used_by_vault FROM activation_keys ORDER BY created_at DESC').all() as Array<{ key: string; note: string; active: number; created_at: number; used_by_vault: string | null }>
}

export function deactivateActivationKey(key: string): void {
  db.prepare('UPDATE activation_keys SET active = 0 WHERE key = ?').run(key)
}

export function deleteVault(vaultId: string): { filesDeleted: number } {
  const del = db.prepare('DELETE FROM files WHERE vault_id = ?').run(vaultId)
  db.prepare('DELETE FROM vault_meta WHERE vault_id = ?').run(vaultId)
  return { filesDeleted: del.changes }
}

export function listVaults(): Array<{ vault_id: string; created_at: number; last_activity: number; total_size: number; file_count: number }> {
  return db.prepare(`
    SELECT vm.vault_id, vm.created_at, vm.last_activity, vm.total_size,
           (SELECT COUNT(*) FROM files f WHERE f.vault_id = vm.vault_id) as file_count
    FROM vault_meta vm ORDER BY vm.last_activity DESC
  `).all() as Array<{ vault_id: string; created_at: number; last_activity: number; total_size: number; file_count: number }>
}

export function closeDatabase(): void {
  if (db) db.close()
}
