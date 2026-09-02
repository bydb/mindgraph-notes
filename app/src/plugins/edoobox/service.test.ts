import { describe, it, expect } from 'vitest'
import { describeAuthFailure, EdooboxService } from './service'

// Der Fall, der das ausgelöst hat: dieselben Schlüssel liefen auf dem Mac, unter Windows kam
// „Authentication failed (401): Details unterdrückt". Ohne den Antworttext war nicht zu sagen, ob
// edoobox oder ein Proxy geantwortet hat. Die Anmeldeantwort enthält keine Teilnehmerdaten —
// sie darf gezeigt werden.

describe('describeAuthFailure', () => {
  it('zeigt den edoobox-Fehlertext auch ohne Debug-Modus und nennt die typischen Ursachen', () => {
    const msg = describeAuthFailure(401, '{"error":"ED80001","message":"invalid credentials"}')
    expect(msg).toContain('401')
    expect(msg).toContain('ED80001')
    expect(msg).toContain('abgelehnt')
    expect(msg).not.toContain('unterdrückt')
  })

  it('erkennt eine HTML-Seite als Antwort eines Proxys statt edoobox', () => {
    const msg = describeAuthFailure(401, '<!DOCTYPE html><html><head><title>Proxy Authentication</title></head><body>…</body></html>' + 'x'.repeat(300))
    expect(msg).toContain('Server returned HTML instead of JSON')
    expect(msg).toContain('Proxy Authentication')
    expect(msg).toContain('Proxy oder Webfilter')
  })

  it('entfernt Key und Secret, falls der Server sie zurückspiegelt', () => {
    const msg = describeAuthFailure(400, 'key abc123 unknown for secret s3cr3t', ['abc123', 's3cr3t'])
    expect(msg).not.toContain('abc123')
    expect(msg).not.toContain('s3cr3t')
    expect(msg).toContain('[entfernt]')
  })

  it('benennt eine leere Antwort als solche', () => {
    expect(describeAuthFailure(502, '   ')).toContain('(leere Antwort)')
  })
})

describe('EdooboxService Anmeldung', () => {
  it('trimmt Key und Secret vor dem Senden und wirft bei 401 die lesbare Meldung', async () => {
    let sentBody = ''
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      sentBody = String(init?.body ?? '')
      return new Response('{"error":"ED80001"}', { status: 401 })
    }
    const service = new EdooboxService('https://app1.edoobox.com', ' key\r\n', 'secret \n', fetchImpl, 'v2')
    await expect(service.checkConnection()).rejects.toThrow(/Authentication failed \(401\): .*ED80001/)
    const body = JSON.parse(sentBody) as { key: string; secret: string; expire: string }
    expect(body.key).toBe('key')
    expect(body.secret).toBe('secret')
    expect(body.expire).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
  })
})
