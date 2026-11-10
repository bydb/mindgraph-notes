import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { buildOutgoingMail, renderRawMessage, type OutgoingMailInput } from './outgoing'

const html = (body: string): string => `<div>${body.replace(/\n/g, '<br>')}</div>`

let dir = ''
let attachmentPath = ''
let signaturePath = ''

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-outgoing-'))
  attachmentPath = path.join(dir, 'bericht.txt')
  signaturePath = path.join(dir, 'logo.png')
  await fs.writeFile(attachmentPath, 'Inhalt des Anhangs')
  await fs.writeFile(signaturePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
})

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const base = (): OutgoingMailInput => ({
  to: [{ name: 'Erika Beispiel', address: 'erika@example.org' }],
  subject: 'Testbetreff',
  body: 'Hallo\n--\nGruss',
  account: { smtpHost: 'smtp.example.org', user: 'postfach', name: 'Max Muster', fromAddress: 'max@example.org' }
})

describe('buildOutgoingMail', () => {
  it('setzt Absender, Umschlag, Empfänger und eine eigene Message-ID', async () => {
    const { mailOptions, messageId } = await buildOutgoingMail(base(), html)
    expect(mailOptions.from).toEqual({ name: 'Max Muster', address: 'max@example.org' })
    expect(mailOptions.sender).toBe('max@example.org')
    expect(mailOptions.envelope).toEqual({ from: 'max@example.org', to: ['erika@example.org'] })
    expect(mailOptions.to).toEqual([{ name: 'Erika Beispiel', address: 'erika@example.org' }])
    expect(mailOptions.subject).toBe('Testbetreff')
    expect(mailOptions.text).toBe('Hallo\n--\nGruss')
    expect(messageId).toMatch(/^<[0-9a-f-]{36}@example\.org>$/)
    expect(mailOptions.messageId).toBe(messageId)
    expect(mailOptions.cc).toBeUndefined()
    expect(mailOptions.bcc).toBeUndefined()
    expect(mailOptions.inReplyTo).toBeUndefined()
  })

  it('nimmt ohne fromAddress den Benutzernamen und ohne Namen die nackte Adresse', async () => {
    const input = base()
    input.account = { smtpHost: 'smtp.example.org', user: 'nutzer@example.net' }
    input.to = [{ name: '', address: 'a@example.org' }]
    const { mailOptions, messageId } = await buildOutgoingMail(input, html)
    expect(mailOptions.from).toBe('nutzer@example.net')
    expect(mailOptions.to).toEqual(['a@example.org'])
    expect(messageId.endsWith('@example.net>')).toBe(true)
  })

  it('führt CC und BCC im Umschlag und als eigene Felder', async () => {
    const input = base()
    input.cc = [{ name: '', address: 'cc@example.org' }]
    input.bcc = [{ name: 'Blind', address: 'bcc@example.org' }]
    const { mailOptions } = await buildOutgoingMail(input, html)
    expect((mailOptions.envelope as { to: string[] }).to).toEqual(['erika@example.org', 'cc@example.org', 'bcc@example.org'])
    expect(mailOptions.cc).toEqual(['cc@example.org'])
    expect(mailOptions.bcc).toEqual([{ name: 'Blind', address: 'bcc@example.org' }])
  })

  it('setzt Antwort-Kopfzeilen, References fällt auf In-Reply-To zurück', async () => {
    const input = base()
    input.inReplyTo = '<alt@example.org>'
    const { mailOptions } = await buildOutgoingMail(input, html)
    expect(mailOptions.inReplyTo).toBe('<alt@example.org>')
    expect(mailOptions.references).toBe('<alt@example.org>')
    input.references = '<a@example.org> <alt@example.org>'
    expect((await buildOutgoingMail(input, html)).mailOptions.references).toBe('<a@example.org> <alt@example.org>')
  })

  it('hängt Dateien an und bettet das Signaturbild nach dem Trennstrich ein', async () => {
    const input = base()
    input.attachments = [{ path: attachmentPath, filename: 'bericht.txt' }]
    input.signatureImagePath = signaturePath
    const { mailOptions } = await buildOutgoingMail(input, html)
    expect(mailOptions.attachments).toEqual([
      { filename: 'bericht.txt', path: attachmentPath },
      { filename: 'signature.png', path: signaturePath, cid: 'signature-image' }
    ])
    const body = String(mailOptions.html)
    expect(body.indexOf('--<br>')).toBeLessThan(body.indexOf('cid:signature-image'))
    expect(body.indexOf('cid:signature-image')).toBeLessThan(body.indexOf('Gruss'))
  })

  it('lässt ein fehlendes Signaturbild still aus', async () => {
    const input = base()
    input.signatureImagePath = path.join(dir, 'gibt-es-nicht.png')
    const { mailOptions } = await buildOutgoingMail(input, html)
    expect(mailOptions.attachments).toEqual([])
    expect(String(mailOptions.html)).not.toContain('cid:signature-image')
  })
})

describe('renderRawMessage', () => {
  it('liefert die Mail mit derselben Message-ID und dem Anhang', async () => {
    const input = base()
    input.attachments = [{ path: attachmentPath, filename: 'bericht.txt' }]
    const { mailOptions, messageId } = await buildOutgoingMail(input, html)
    const raw = (await renderRawMessage(mailOptions)).toString()
    expect(raw).toContain(`Message-ID: ${messageId}`)
    expect(raw).toContain('Subject: Testbetreff')
    expect(raw).toContain('filename=bericht.txt')
    expect(raw.includes('\r\n')).toBe(false)
  })

  // Hält den Istzustand fest, an dem die Entscheidung über einen MIME-Versand
  // hängt (Codex F18): Die Blindkopie steht im Rohtext.
  it('enthält die Bcc-Kopfzeile — der Rohtext ist kein fertiger Versandtext', async () => {
    const input = base()
    input.bcc = [{ name: '', address: 'bcc@example.org' }]
    const { mailOptions } = await buildOutgoingMail(input, html)
    const raw = (await renderRawMessage(mailOptions)).toString()
    expect(raw).toMatch(/^Bcc: bcc@example\.org$/m)
  })
})
