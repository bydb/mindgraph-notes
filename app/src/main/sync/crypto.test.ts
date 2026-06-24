// Regressionstests für die E2E-Krypto. Bewusst pur (Node-`crypto`, kein fs/Netz)
// und genau deshalb testbar. Diese Funktionen liegen auf dem irreversiblen Pfad:
// kippt deriveKey/encrypt/decrypt still, werden Nutzerdaten unentschlüsselbar oder
// das Tag-Tampering-Veto fällt aus. Die Tests pinnen das beobachtbare Verhalten.
import { describe, it, expect } from 'vitest'
import {
  generateVaultId,
  deriveKey,
  encryptFile,
  decryptFile,
  hashContent,
  hashPath
} from './crypto'

const PASSPHRASE = 'correct horse battery staple'
const VAULT_ID = 'mg-1111-2222-3333-4444-5555-6666-7777-8888'

describe('generateVaultId', () => {
  it('erzeugt das mg-Format mit 8 Vierergruppen Hex', () => {
    const id = generateVaultId()
    expect(id).toMatch(/^mg(-[0-9a-f]{4}){8}$/)
  })

  it('ist praktisch eindeutig (128 Bit Zufall)', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateVaultId()))
    expect(ids.size).toBe(200)
  })
})

describe('deriveKey', () => {
  it('liefert einen 32-Byte-Schlüssel (AES-256)', () => {
    const key = deriveKey(PASSPHRASE, VAULT_ID)
    expect(key).toBeInstanceOf(Buffer)
    expect(key.length).toBe(32)
  })

  it('ist deterministisch — gleiche Passphrase + vaultId → gleicher Key', () => {
    // Das ist die Bedingung für Multi-Device-Join: zwei Geräte müssen aus
    // demselben Salt (= sha256(vaultId)) denselben Key ableiten.
    const a = deriveKey(PASSPHRASE, VAULT_ID)
    const b = deriveKey(PASSPHRASE, VAULT_ID)
    expect(a.equals(b)).toBe(true)
  })

  it('andere Passphrase → anderer Key', () => {
    const a = deriveKey(PASSPHRASE, VAULT_ID)
    const b = deriveKey(PASSPHRASE + 'x', VAULT_ID)
    expect(a.equals(b)).toBe(false)
  })

  it('anderer vaultId → anderer Key (vaultId steckt als Salt drin)', () => {
    const a = deriveKey(PASSPHRASE, VAULT_ID)
    const b = deriveKey(PASSPHRASE, 'mg-9999-0000-0000-0000-0000-0000-0000-0000')
    expect(a.equals(b)).toBe(false)
  })

  it('akzeptiert kurze Legacy-8-Byte-vaultIds rückwärtskompatibel', () => {
    // MEMORY/Code-Kommentar: alte 8-Byte-IDs bleiben gültig und leiten
    // unverändert denselben Key ab — kein Migrations-/Re-Encryption-Bedarf.
    const legacyId = 'mg-1111-2222-3333-4444'
    const a = deriveKey(PASSPHRASE, legacyId)
    const b = deriveKey(PASSPHRASE, legacyId)
    expect(a.length).toBe(32)
    expect(a.equals(b)).toBe(true)
  })
})

describe('encryptFile / decryptFile', () => {
  const key = deriveKey(PASSPHRASE, VAULT_ID)
  const plaintext = Buffer.from('# Geheime Notiz\n\nMit Umlauten: äöü und Emoji 🔴', 'utf-8')

  it('Roundtrip stellt das Plaintext bytegenau wieder her', () => {
    const { iv, tag, ciphertext } = encryptFile(plaintext, key)
    const recovered = decryptFile(ciphertext, key, iv, tag)
    expect(recovered.equals(plaintext)).toBe(true)
  })

  it('erzeugt pro Aufruf eine frische IV (kein Nonce-Reuse)', () => {
    // IV-Wiederverwendung bei GCM ist katastrophal — gleiche Eingabe muss
    // unterschiedliche IV + Ciphertext liefern.
    const a = encryptFile(plaintext, key)
    const b = encryptFile(plaintext, key)
    expect(a.iv.equals(b.iv)).toBe(false)
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
    expect(a.iv.length).toBe(12)
    expect(a.tag.length).toBe(16)
  })

  it('verschlüsselt leere Buffer korrekt', () => {
    const empty = Buffer.alloc(0)
    const { iv, tag, ciphertext } = encryptFile(empty, key)
    const recovered = decryptFile(ciphertext, key, iv, tag)
    expect(recovered.length).toBe(0)
  })

  it('falscher Schlüssel → Entschlüsselung wirft (GCM-Auth schlägt fehl)', () => {
    const { iv, tag, ciphertext } = encryptFile(plaintext, key)
    const wrongKey = deriveKey('falsche passphrase', VAULT_ID)
    expect(() => decryptFile(ciphertext, wrongKey, iv, tag)).toThrow()
  })

  it('manipulierter Ciphertext → wirft (Integritätsschutz)', () => {
    const { iv, tag, ciphertext } = encryptFile(plaintext, key)
    const tampered = Buffer.from(ciphertext)
    tampered[0] ^= 0xff
    expect(() => decryptFile(tampered, key, iv, tag)).toThrow()
  })

  it('manipuliertes Auth-Tag → wirft', () => {
    const { iv, tag, ciphertext } = encryptFile(plaintext, key)
    const tampered = Buffer.from(tag)
    tampered[0] ^= 0xff
    expect(() => decryptFile(ciphertext, key, iv, tampered)).toThrow()
  })

  it('falsche IV → wirft', () => {
    const { tag, ciphertext } = encryptFile(plaintext, key)
    const wrongIv = Buffer.alloc(12, 7)
    expect(() => decryptFile(ciphertext, key, wrongIv, tag)).toThrow()
  })
})

describe('hashContent / hashPath', () => {
  it('hashContent ist deterministisch und liefert 64 Hex-Zeichen (sha256)', () => {
    const data = Buffer.from('hallo welt')
    expect(hashContent(data)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashContent(data)).toBe(hashContent(Buffer.from('hallo welt')))
  })

  it('hashContent unterscheidet unterschiedliche Inhalte', () => {
    expect(hashContent(Buffer.from('a'))).not.toBe(hashContent(Buffer.from('b')))
  })

  it('hashPath ist deterministisch pro Pfad', () => {
    expect(hashPath('foo/bar.md')).toBe(hashPath('foo/bar.md'))
    expect(hashPath('foo/bar.md')).not.toBe(hashPath('foo/baz.md'))
  })
})
