import { describe, it, expect } from 'vitest'
import { redactForLog, mailRef } from './logRedaction'

describe('redactForLog', () => {
  it('ersetzt Adressen in Serverfehlern', () => {
    const out = redactForLog('550 5.1.1 <max.muster@schule.example>: Recipient address rejected, sender anna@amt.example.org')
    expect(out).not.toContain('max.muster')
    expect(out).not.toContain('amt.example.org')
    expect(out).toContain('550 5.1.1')
    expect(out).toContain('Recipient address rejected')
  })

  it('ersetzt Message-IDs in spitzen Klammern als Ganzes', () => {
    expect(redactForLog('Sent <d8e801ec-71e1@mail.example.org> ok')).toBe('Sent <message-id> ok')
  })

  it('ersetzt Zugangsmarken, auch als JSON-Feld', () => {
    const jwt = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJodHRwczovL2dyYXBoIn0.c2lnbmF0dXJl'
    expect(redactForLog(`Authorization: Bearer ${jwt}`)).not.toContain('eyJ0eXAi')
    const json = redactForLog({ error: 'invalid_grant', refresh_token: '0.AXoA1234567890abcdefghijklmnop' })
    expect(json).toContain('invalid_grant')
    expect(json).not.toContain('1234567890abcdef')
  })

  it('nimmt bei Fehlerobjekten den Stack und bereinigt ihn', () => {
    const err = new Error('getaddrinfo ENOTFOUND imap.example.org for user@example.org')
    const out = redactForLog(err)
    expect(out).toContain('ENOTFOUND imap.example.org')
    expect(out).not.toContain('user@example.org')
    expect(out).toContain('logRedaction.test')
  })

  it('lässt Text ohne Personenbezug unverändert', () => {
    expect(redactForLog('Login is disabled')).toBe('Login is disabled')
    expect(redactForLog('connect ETIMEDOUT 52.97.1.2:993')).toBe('connect ETIMEDOUT 52.97.1.2:993')
  })

  it('kürzt sehr lange Texte', () => {
    const out = redactForLog('x'.repeat(5000))
    expect(out.length).toBeLessThan(2100)
    expect(out.endsWith('(gekürzt)')).toBe(true)
  })

  it('kommt mit null, undefined und zyklischen Objekten zurecht', () => {
    expect(redactForLog(null)).toBe('null')
    expect(redactForLog(undefined)).toBe('undefined')
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    expect(typeof redactForLog(cyc)).toBe('string')
  })
})

describe('mailRef', () => {
  it('ist stabil, kurz und verrät die Kennung nicht', () => {
    const id = '<855AAEE4-BAA3-43F8@schule.example>'
    expect(mailRef(id)).toBe(mailRef(id))
    expect(mailRef(id)).toMatch(/^mail#[0-9a-f]{8}$/)
    expect(mailRef(id)).not.toContain('schule')
  })

  it('unterscheidet verschiedene Mails', () => {
    expect(mailRef('<a@example.org>')).not.toBe(mailRef('<b@example.org>'))
  })

  it('verträgt leere Eingaben', () => {
    expect(mailRef(undefined)).toMatch(/^mail#[0-9a-f]{8}$/)
  })
})
