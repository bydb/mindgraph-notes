import { describe, it, expect } from 'vitest'
import { buildImapOptions } from './connection'

describe('buildImapOptions', () => {
  it('erzeugt genau das Objekt, das die Aufrufer bis 10.11.2026 selbst gebaut haben', () => {
    const options = buildImapOptions(
      { host: 'imap.example.org', port: 993, tls: true, user: 'postfach' },
      'geheim',
      { socketTimeout: 15000, greetingTimeout: 10000 }
    )
    // toStrictEqual: auch kein zusätzlicher Schlüssel und keine andere Reihenfolge der Bedeutung.
    expect(options).toStrictEqual({
      host: 'imap.example.org',
      port: 993,
      secure: true,
      auth: { user: 'postfach', pass: 'geheim' },
      logger: false,
      socketTimeout: 15000,
      greetingTimeout: 10000
    })
    expect(Object.keys(options)).toEqual(['host', 'port', 'secure', 'auth', 'logger', 'socketTimeout', 'greetingTimeout'])
  })

  it('reicht TLS aus und die Zeitlimits des Aufrufers unverändert durch', () => {
    const options = buildImapOptions(
      { host: 'h', port: 143, tls: false, user: 'u' },
      'p',
      { socketTimeout: 30000, greetingTimeout: 15000 }
    )
    expect(options.secure).toBe(false)
    expect(options.port).toBe(143)
    expect(options.socketTimeout).toBe(30000)
    expect(options.greetingTimeout).toBe(15000)
  })

  it('baut mit einer Zugangsmarke die OAuth-Anmeldung und nie ein Passwortfeld', () => {
    const options = buildImapOptions(
      { host: 'outlook.office365.com', port: 993, tls: true, user: 'erika@schule.example' },
      { accessToken: 'marke' },
      { socketTimeout: 30000, greetingTimeout: 15000 }
    )
    expect(options.auth).toStrictEqual({ user: 'erika@schule.example', accessToken: 'marke' })
    expect('pass' in options.auth).toBe(false)
    expect(options.secure).toBe(true)
  })
})
