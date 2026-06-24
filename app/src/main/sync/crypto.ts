import crypto from 'crypto'

const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export function generateVaultId(): string {
  // 16 Byte (128 Bit) Zufall. Der sha256(vaultId) dient als scrypt-Salt (s. deriveKey):
  // der vaultId wird im Klartext zum Relay übertragen, ein Salt darf öffentlich sein,
  // muss aber unvorhersehbar + eindeutig sein. Mit nur 8 Byte (64 Bit) war der Salt-Raum
  // klein genug für gezielte Vorberechnung gegen einen bekannten vaultId — 128 Bit schließt das.
  // Bestehende kürzere 8-Byte-IDs bleiben gültig und leiten unverändert denselben Key ab
  // (kein Migrations-/Re-Encryption-Bedarf).
  const bytes = crypto.randomBytes(16)
  const hex = bytes.toString('hex') // 32 hex chars
  const g = (i: number) => hex.slice(i * 4, i * 4 + 4)
  return `mg-${g(0)}-${g(1)}-${g(2)}-${g(3)}-${g(4)}-${g(5)}-${g(6)}-${g(7)}`
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
