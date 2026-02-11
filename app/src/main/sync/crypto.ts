import crypto from 'crypto'

const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export function generateVaultId(): string {
  const bytes = crypto.randomBytes(8)
  const hex = bytes.toString('hex')
  return `mg-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`
}

export function deriveKey(passphrase: string, vaultId: string): Buffer {
  const salt = crypto.createHash('sha256').update(vaultId).digest()
  return crypto.scryptSync(passphrase, salt, KEY_LENGTH, SCRYPT_PARAMS)
}

export function encryptFile(
  plaintext: Buffer,
  key: Buffer
): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  })
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv, tag, ciphertext: encrypted }
}

export function decryptFile(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  tag: Buffer
): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  })
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function hashContent(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

export function hashPath(relativePath: string): string {
  return crypto.createHash('sha256').update(relativePath).digest('hex')
}
