import { describe, it, expect } from 'vitest'
import { redactForLog, firstSentenceForLog, mailRef, folderRef } from './logRedaction'

describe('redactForLog', () => {
  it('ersetzt Adressen in Serverfehlern', () => {
    const out = redactForLog('550 5.1.1 <max.muster@schule.example>: Recipient address rejected, sender anna@amt.example.org')
    expect(out).not.toContain('max.muster')
    expect(out).not.toContain('amt.example.org')
    expect(out).toContain('550 5.1.1')
    expect(out).toContain('address rejected')
  })

  it('ersetzt Klammerformen mit @ als Ganzes (Adresse oder Message-ID)', () => {
    expect(redactForLog('gesendet <d8e801ec-71e1@mail.example.org> ok')).toBe('gesendet <kennung> ok')
  })

  it('erfasst Umlaute im lokalen Teil und in der Domain vollständig (Codex F04)', () => {
    expect(redactForLog('max@büro.de')).toBe('<adresse>')
    expect(redactForLog('büro@schule.de')).toBe('<adresse>')
    expect(redactForLog('Fehler bei jörg.müller@straße.example!')).not.toMatch(/jörg|müller|straße/)
  })

  it('erfasst URL-kodierte Adressen (Codex F04)', () => {
    expect(redactForLog('GET /users/max%40schule.de/messages')).not.toContain('schule')
  })

  it('entfernt den Anzeigenamen vor einer Klammeradresse (Codex F04)', () => {
    expect(redactForLog('Müller <büro@schule.de>')).not.toContain('Müller')
    expect(redactForLog('rejected: "Müller, Hans" <h.mueller@amt.example>')).not.toMatch(/Müller|Hans|mueller/)
    expect(redactForLog('to Anna Maria Beispiel <a@b.example> failed')).not.toMatch(/Anna|Maria|Beispiel/)
  })

  it('ersetzt Zugangsmarken in mehreren Schreibweisen (Codex F05)', () => {
    const jwt = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJodHRwczovL2dyYXBoIn0.c2lnbmF0dXJl'
    expect(redactForLog(`Authorization: Bearer ${jwt}`)).not.toContain('eyJ0eXAi')
    expect(redactForLog('Authorization: Basic dXNlcjpwYXNzd29yZA==')).toBe('Authorization: Basic <marke>')
    expect(redactForLog('Authorization: Bearer abcdefghijklmnop%2Fsecret')).toBe('Authorization: Bearer <marke>')
    expect(redactForLog('token=0.AXoA1234567890%2Ffoo%2Bbar&x=1')).toBe('token=<marke>&x=1')
    const json = redactForLog({ error: 'invalid_grant', refresh_token: '0.AXoA1234567890abcdefghijklmnop' })
    expect(json).toContain('invalid_grant')
    expect(json).not.toContain('1234567890abcdef')
    expect(redactForLog('http://localhost:5000/?code=0.AbCdEf123456&state=xyz')).toContain('code=<marke>&state=xyz')
  })

  it('lässt Fehlercodes und Text ohne Personenbezug lesbar (Codex F05)', () => {
    expect(redactForLog('code: 1234567890123456')).toBe('code: 1234567890123456')
    expect(redactForLog('Login is disabled')).toBe('Login is disabled')
    expect(redactForLog('connect ETIMEDOUT 52.97.1.2:993')).toBe('connect ETIMEDOUT 52.97.1.2:993')
    expect(redactForLog('getaddrinfo ENOTFOUND imap.example.org')).toBe('getaddrinfo ENOTFOUND imap.example.org')
  })

  it('nimmt bei Fehlerobjekten den Stack und bereinigt ihn', () => {
    const err = new Error('getaddrinfo ENOTFOUND imap.example.org for user@example.org')
    const out = redactForLog(err)
    expect(out).toContain('ENOTFOUND imap.example.org')
    expect(out).not.toContain('user@example.org')
    expect(out).toContain('logRedaction.test')
  })

  it('kürzt sehr lange Texte', () => {
    const out = redactForLog('x'.repeat(5000))
    expect(out.length).toBeLessThan(2100)
    expect(out.endsWith('(gekürzt)')).toBe(true)
  })

  it('bleibt bei langen Texten ohne @ schnell (Codex F06)', () => {
    for (const text of ['a'.repeat(200_000), 'wort '.repeat(40_000), '<'.repeat(100_000), `${'a'.repeat(100_000)}@`]) {
      const start = performance.now()
      redactForLog(text)
      expect(performance.now() - start).toBeLessThan(100)
    }
  })

  it('kommt mit null, undefined und zyklischen Objekten zurecht', () => {
    expect(redactForLog(null)).toBe('null')
    expect(redactForLog(undefined)).toBe('undefined')
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    expect(typeof redactForLog(cyc)).toBe('string')
  })
})

describe('firstSentenceForLog', () => {
  it('schneidet hinter dem ersten Satz ab — kein Rest einer Modellantwort (Codex F01)', () => {
    const uiError = 'Antwort von „gpt-oss" war kein gültiges JSON. Reasoning-Modelle (z.B. gpt-oss) liefern oft Fließtext — bitte ein Instruct-Modell wählen. Antwort: Sehr geehrte Frau Beispiel, anbei'
    const out = firstSentenceForLog(uiError)
    expect(out).toBe('Antwort von „gpt-oss" war kein gültiges JSON.')
  })

  it('trennt nicht an Punkten in Modellnamen', () => {
    expect(firstSentenceForLog('Antwort von „qwen3.5:4b" war kein gültiges JSON. Rest')).toBe('Antwort von „qwen3.5:4b" war kein gültiges JSON.')
  })

  it('begrenzt Texte ohne Satzende', () => {
    expect(firstSentenceForLog('x'.repeat(500)).length).toBeLessThanOrEqual(161)
  })
})

describe('mailRef', () => {
  it('ist stabil, kurz und zeigt die Kennung nicht', () => {
    const id = '<855AAEE4-BAA3-43F8@schule.example>'
    expect(mailRef(id)).toBe(mailRef(id))
    expect(mailRef(id)).toMatch(/^mail#[0-9a-f]{8}$/)
    expect(mailRef(id)).not.toContain('schule')
  })

  it('kennzeichnet fehlende Kennungen ausdrücklich (Codex F07)', () => {
    expect(mailRef(undefined)).toBe('mail#unbekannt')
    expect(mailRef('')).toBe('mail#unbekannt')
  })
})

describe('folderRef', () => {
  it('lässt Standardordner lesbar', () => {
    for (const f of ['INBOX', 'Gesendet', 'Sent Items', 'INBOX.Gesendet', 'Gesendete Elemente', 'Papierkorb']) {
      expect(folderRef(f)).toBe(f)
    }
  })

  it('ersetzt eigene Ordnernamen durch eine Kennung (Codex F03)', () => {
    expect(folderRef('Personal/Müller Disziplinarsache')).toMatch(/^ordner#[0-9a-f]{8}$/)
    expect(folderRef('DW')).toMatch(/^ordner#[0-9a-f]{8}$/)
    expect(folderRef('INBOX.Bewerbung Beispiel')).not.toContain('Beispiel')
    expect(folderRef(undefined)).toBe('ordner#unbekannt')
  })
})
