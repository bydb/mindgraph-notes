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

  it('trägt Absender, Empfänger, CC und Antwort-Kopfzeilen', async () => {
    const input = base()
    input.cc = [{ name: '', address: 'cc@example.org' }]
    input.inReplyTo = '<alt@example.org>'
    const { mailOptions } = await buildOutgoingMail(input, html)
    const raw = (await renderRawMessage(mailOptions)).toString()
    expect(raw).toMatch(/^From: Max Muster <max@example\.org>$/m)
    expect(raw).toMatch(/^To: Erika Beispiel <erika@example\.org>$/m)
    expect(raw).toMatch(/^Cc: cc@example\.org$/m)
    expect(raw).toMatch(/^In-Reply-To: <alt@example\.org>$/m)
    expect(raw).toMatch(/^References: <alt@example\.org>$/m)
  })

  it('ist keine byte-gleiche Kopie: zwei Läufe unterscheiden sich in den MIME-Grenzen, nicht in der Message-ID (Codex F02)', async () => {
    const input = base()
    input.attachments = [{ path: attachmentPath, filename: 'bericht.txt' }]
    const { mailOptions, messageId } = await buildOutgoingMail(input, html)
    const first = (await renderRawMessage(mailOptions)).toString()
    const second = (await renderRawMessage(mailOptions)).toString()
    expect(first).toContain(`Message-ID: ${messageId}`)
    expect(second).toContain(`Message-ID: ${messageId}`)
    expect(first).not.toBe(second)
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

  // Gegenstück: So serialisiert nodemailer für einen normalen Transport (SMTP).
  // Die Blindkopie steht nur im Umschlag, nicht in den Kopfzeilen.
  it('normaler Transportweg: Bcc nur im Umschlag, keine Kopfzeile', async () => {
    const nodemailer = await import('nodemailer')
    const input = base()
    input.bcc = [{ name: '', address: 'bcc@example.org' }]
    const { mailOptions } = await buildOutgoingMail(input, html)
    const captured = await new Promise<{ raw: string; to: string[] }>((resolve, reject) => {
      const transport = nodemailer.default.createTransport({
        name: 'probe',
        version: '1',
        send(mail: { message: { createReadStream(): NodeJS.ReadableStream; getEnvelope(): { to: string[] } } }, done: (err: Error | null, info?: unknown) => void) {
          const chunks: Buffer[] = []
          const stream = mail.message.createReadStream()
          stream.on('data', (d: Buffer) => chunks.push(Buffer.from(d)))
          stream.on('error', reject)
          stream.on('end', () => {
            resolve({ raw: Buffer.concat(chunks).toString(), to: mail.message.getEnvelope().to })
            done(null, {})
          })
        }
      } as never)
      transport.sendMail(mailOptions).catch(reject)
    })
    expect(captured.raw).not.toMatch(/^Bcc:/mi)
    expect(captured.raw).not.toContain('bcc@example.org')
    expect(captured.to).toEqual(['erika@example.org', 'bcc@example.org'])
  })
})

describe('Bilder im Text', () => {
  const ID = 'a1b2c3d4e5f6'
  const withImage = (body: string): OutgoingMailInput => ({
    ...base(),
    body,
    attachments: [
      { path: attachmentPath, filename: 'bericht.txt' },
      { path: signaturePath, filename: 'www.foto *neu*.png', inlineId: ID, width: 1600 }
    ]
  })

  it('bettet ein Bild mit Platzhalter über eine Content-ID an seiner Stelle ein', async () => {
    const { mailOptions } = await buildOutgoingMail(withImage(`Oben\n![www.foto *neu*.png](bild:${ID})\nUnten`), html)
    const out = String(mailOptions.html)
    expect(out).toMatch(/Oben<br><img src="cid:mg-inline-a1b2c3d4e5f6" alt="www\.foto \*neu\*\.png" width="640"[^>]*><br>Unten/)
    expect(out).not.toContain('bild:')
    expect(out).not.toContain('MGINLINE')
    expect(mailOptions.attachments).toEqual([
      { filename: 'bericht.txt', path: attachmentPath },
      { filename: 'www.foto *neu*.png', path: signaturePath, cid: 'mg-inline-a1b2c3d4e5f6', contentDisposition: 'inline', contentType: 'image/png' }
    ])
    expect(mailOptions.text).toBe('Oben\n[Bild: www.foto *neu*.png]\nUnten')
  })

  it('lässt ein Bild weg, dessen Platzhalter gelöscht wurde', async () => {
    const { mailOptions } = await buildOutgoingMail(withImage('Nur Text'), html)
    expect(mailOptions.attachments).toEqual([{ filename: 'bericht.txt', path: attachmentPath }])
    expect(String(mailOptions.html)).not.toContain('<img')
  })

  it('entfernt einen Platzhalter ohne zugehöriges Bild aus HTML und Reintext', async () => {
    const { mailOptions } = await buildOutgoingMail({ ...base(), body: 'A ![weg](bild:ffffffffffff) B' }, html)
    expect(mailOptions.html).toBe('<div>A  B</div>')
    expect(mailOptions.text).toBe('A  B')
  })

  it('schützt die Beschriftung im alt-Attribut', async () => {
    const input = withImage(`![a"><script>x](bild:${ID})`)
    const { mailOptions } = await buildOutgoingMail(input, html)
    expect(String(mailOptions.html)).toContain('alt="a&quot;&gt;&lt;script&gt;x"')
  })

  it('legt das Bild im Rohtext als eingebetteten Teil mit Content-ID ab', async () => {
    const { mailOptions } = await buildOutgoingMail(withImage(`![foto](bild:${ID})`), html)
    const raw = (await renderRawMessage(mailOptions)).toString()
    expect(raw).toContain('multipart/related')
    expect(raw).toContain('Content-ID: <mg-inline-a1b2c3d4e5f6>')
    expect(raw).toMatch(/Content-Disposition: inline/)
  })
})

describe('Bildart eingebetteter Bilder', () => {
  it('setzt die Bildart ausdrücklich, statt sie nur aus dem Namen abzuleiten', async () => {
    const id = 'c0ffee00c0ff'
    const { mailOptions } = await buildOutgoingMail({
      ...base(),
      body: `![scan](bild:${id})`,
      attachments: [{ path: signaturePath, filename: 'scan.pdf', inlineId: id }]
    }, html)
    expect((mailOptions.attachments as Array<{ contentType?: string }>)[0].contentType).toBe('image/png')
    const raw = (await renderRawMessage(mailOptions)).toString()
    expect(raw).toMatch(/Content-Type: image\/png; name=scan\.pdf/)
  })
})
