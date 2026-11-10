import { describe, it, expect } from 'vitest'
import * as path from 'path'
import { emailCredentialFileName, isSafeEmailAccountId, isMicrosoftAccountId } from './credentialPath'

describe('emailCredentialFileName', () => {
  it('nimmt die IDs, die die App vergibt', () => {
    expect(emailCredentialFileName('email-1794334994978')).toBe('email-email-1794334994978.enc')
    expect(emailCredentialFileName('Konto_2-b')).toBe('email-Konto_2-b.enc')
  })

  it('weist alles ab, was aus dem Profilordner oder auf eine andere Geheimnisdatei zeigen könnte', () => {
    const profile = path.join(path.sep, 'profil')
    for (const id of [
      'x/../openrouter', '../openrouter', '..', '.', 'x/../../andere/datei', 'x\\..\\openrouter',
      'a/b', 'a\\b', '/etc/passwd', 'C:\\x', 'a.b', 'a b', 'a\0b', 'ä', '', '-x', '_x', 'a'.repeat(81)
    ]) {
      expect(isSafeEmailAccountId(id), JSON.stringify(id)).toBe(false)
      expect(() => emailCredentialFileName(id), JSON.stringify(id)).toThrow()
    }
    // Jede erlaubte ID bleibt eine Datei direkt im Profilordner.
    for (const id of ['email-1', 'a', 'A9_-z']) {
      const full = path.join(profile, emailCredentialFileName(id))
      expect(path.dirname(full)).toBe(profile)
      expect(path.basename(full).startsWith('email-')).toBe(true)
    }
  })

  it('weist Werte ab, die keine Zeichenkette sind', () => {
    for (const id of [undefined, null, 42, {}, [], ['email-1'], { toString: () => 'email-1' }]) {
      expect(isSafeEmailAccountId(id)).toBe(false)
      expect(() => emailCredentialFileName(id)).toThrow()
    }
  })

  it('gibt für Microsoft-Konten keinen Passwortpfad heraus (Codex F02)', () => {
    const id = 'ms-0123456789abcdef01234567'
    expect(isMicrosoftAccountId(id)).toBe(true)
    expect(() => emailCredentialFileName(id)).toThrow()
    // knapp daneben ist ein gewöhnliches Konto
    for (const other of ['ms-0123456789abcdef0123456', 'ms-0123456789ABCDEF01234567', 'email-ms-0123456789abcdef01234567', 'ms-']) {
      expect(isMicrosoftAccountId(other)).toBe(false)
    }
    expect(emailCredentialFileName('ms-kurz')).toBe('email-ms-kurz.enc')
  })
})
