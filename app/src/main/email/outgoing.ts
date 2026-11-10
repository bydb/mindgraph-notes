// Aufbau einer ausgehenden Mail, getrennt vom Transportweg.
//
// Am 10.11.2026 wörtlich aus dem email-send-Handler (ipc.ts) herausgezogen
// (docs/codex-collab/microsoft-365-anbindung.md, Abschnitt 2, Codex F26):
// Wer die Mail wie verschickt (SMTP heute, später Graph), soll nichts daran
// ändern, wie sie aussieht. buildOutgoingMail() liefert die nodemailer-Optionen
// samt fester Message-ID, renderRawMessage() daraus die RFC-822-Bytes.
import * as path from 'path'
import * as fs from 'fs/promises'

export interface OutgoingMailInput {
  to: { name: string; address: string }[]
  cc?: { name: string; address: string }[]
  bcc?: { name: string; address: string }[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string
  account: {
    smtpHost: string
    user: string
    name?: string
    fromAddress?: string
  }
  signatureImagePath?: string
  attachments?: { path: string; filename: string }[]
}

export interface OutgoingMail {
  mailOptions: Record<string, unknown>
  /** Selbst gesetzte Message-ID — dieselbe für Versand und Gesendet-Kopie. */
  messageId: string
}

/**
 * Baut die Mail. Prüft NICHT, ob Anhänge existieren (das macht der Aufrufer
 * vorher und bricht ab); ein fehlendes Signaturbild wird still ausgelassen.
 */
export async function buildOutgoingMail(
  composeData: OutgoingMailInput,
  renderEmailHtml: (body: string) => string
): Promise<OutgoingMail> {
  const { account } = composeData
  // HTML aus Body generieren: Plain Text/Markdown-Links werden gerendert,
  // explizites HTML aus Body/Signatur wird auf eine sichere E-Mail-Teilmenge reduziert.
  let htmlBody = renderEmailHtml(composeData.body)

  // Signatur-Bild als CID-Attachment einbetten
  const attachments: Array<{ filename: string; path: string; cid?: string }> = []

  // File-Anhaenge hinzufuegen (Existenz ist oben bereits geprueft)
  for (const att of composeData.attachments || []) {
    attachments.push({ filename: att.filename, path: att.path })
  }
  if (composeData.signatureImagePath) {
    try {
      await fs.access(composeData.signatureImagePath)
      const ext = path.extname(composeData.signatureImagePath).toLowerCase()
      attachments.push({
        filename: `signature${ext}`,
        path: composeData.signatureImagePath,
        cid: 'signature-image'
      })
      const imgTag = `<img src="cid:signature-image" width="250" style="display:block; max-width:250px; height:auto;" />`
      // Bild direkt nach dem "--" Trennstrich einfuegen
      const sigMarker = '--<br>'
      const sigDivider = htmlBody.lastIndexOf(sigMarker)
      if (sigDivider !== -1) {
        const afterSig = sigDivider + sigMarker.length
        htmlBody = htmlBody.substring(0, afterSig) + `<br>${imgTag}<br>` + htmlBody.substring(afterSig)
      } else {
        htmlBody += `<br>${imgTag}`
      }
    } catch { /* Bild nicht gefunden, ignorieren */ }
  }

  // fromAddress ist die volle Email-Adresse (user kann nur Username sein)
  const senderAddress = account.fromAddress || account.user
  const mailOptions: Record<string, unknown> = {
    from: account.name ? { name: account.name, address: senderAddress } : senderAddress,
    sender: senderAddress,
    envelope: {
      from: senderAddress,
      to: [
        ...composeData.to.map(r => r.address),
        ...(composeData.cc || []).map(r => r.address),
        ...(composeData.bcc || []).map(r => r.address)
      ]
    },
    // Adressobjekte: nodemailer kodiert Namen mit " oder \\ selbst korrekt (Codex F08).
    to: composeData.to.map(r => r.name ? { name: r.name, address: r.address } : r.address),
    subject: composeData.subject,
    text: composeData.body,
    html: htmlBody,
    attachments
  }

  if (composeData.cc && composeData.cc.length > 0) {
    mailOptions.cc = composeData.cc.map(r => r.name ? { name: r.name, address: r.address } : r.address)
  }
  // BCC: Beim SMTP-Versand stehen die Empfaenger im Umschlag, die Kopfzeile
  // laesst nodemailer dort weg. Im Rohtext aus renderRawMessage() (Gesendet-Kopie)
  // steht `Bcc:` dagegen drin — siehe dort.
  if (composeData.bcc && composeData.bcc.length > 0) {
    mailOptions.bcc = composeData.bcc.map(r => r.name ? { name: r.name, address: r.address } : r.address)
  }
  if (composeData.inReplyTo) {
    mailOptions.inReplyTo = composeData.inReplyTo
    mailOptions.references = composeData.references || composeData.inReplyTo
  }

  // Konsistente Message-ID setzen, damit SMTP-Versand und IMAP-Append dieselbe Mail referenzieren
  const messageIdHost = (account.fromAddress || account.user || account.smtpHost || 'mindgraph').split('@').pop() || 'mindgraph'
  const { randomUUID } = await import('crypto')
  const explicitMessageId = `<${randomUUID()}@${messageIdHost}>`
  mailOptions.messageId = explicitMessageId
  return { mailOptions, messageId: explicitMessageId }
}

/**
 * RFC-822-Bytes aus denselben Optionen (nodemailer streamTransport, Zeilenenden LF).
 *
 * Zwei Dinge, die der Name nicht verrät:
 *
 * 1. KEINE byte-gleiche Kopie des Versands. Der SMTP-Versand serialisiert die
 *    Optionen selbst; dieser Aufruf serialisiert sie ein zweites Mal. Gleich
 *    ist die Message-ID, nicht die MIME-Grenzen — und Anhänge werden erneut
 *    von der Platte gelesen (eine dazwischen geänderte Datei ergibt eine
 *    abweichende Kopie). Beide Wege aus EINEM Rohtext zu speisen wäre falsch,
 *    siehe Punkt 2.
 *
 * 2. Der Rohtext ENTHÄLT die Kopfzeile `Bcc:` (streamTransport setzt keepBcc).
 *    Der normale Versandweg lässt sie weg und führt die Blindkopie-Empfänger
 *    nur im Umschlag (beides per Test belegt). Wird dieser Rohtext erfolgreich
 *    in den Gesendet-Ordner gelegt, trägt die Kopie auf dem Server die Zeile —
 *    üblich für die eigene Kopie. Die lokale Gesendet-Mail der App kennt Bcc
 *    dagegen gar nicht. Als VERSANDTEXT (z.B. MIME an eine Web-Schnittstelle)
 *    darf dieser Rohtext erst dienen, wenn an zugestellten Mails gemessen ist,
 *    dass Empfänger die Zeile nicht sehen (Codex F18, Messung M2).
 */
export async function renderRawMessage(mailOptions: Record<string, unknown>): Promise<Buffer> {
  const nodemailer = await import('nodemailer')
  const rawTransporter = nodemailer.default.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
  const rawInfo = await rawTransporter.sendMail(mailOptions)
  return Buffer.isBuffer(rawInfo.message) ? rawInfo.message : Buffer.from(String(rawInfo.message))
}
