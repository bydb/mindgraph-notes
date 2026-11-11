// Aufbau einer ausgehenden Mail, getrennt vom Transportweg.
//
// Am 10.11.2026 wörtlich aus dem email-send-Handler (ipc.ts) herausgezogen
// (docs/codex-collab/microsoft-365-anbindung.md, Abschnitt 2, Codex F26):
// Wer die Mail wie verschickt (SMTP heute, später Graph), soll nichts daran
// ändern, wie sie aussieht. buildOutgoingMail() liefert die nodemailer-Optionen
// samt fester Message-ID, renderRawMessage() daraus die RFC-822-Bytes.
import * as path from 'path'
import * as fs from 'fs/promises'
import { inlineTokensToPlainText, replaceInlineTokens, splitInlineAttachments } from '../../shared/emailInlineImages'

/** Anhang eines Entwurfs. Mit `inlineId` ist es ein Bild im Text (Platzhalter `![…](bild:<id>)`). */
export interface OutgoingAttachment {
  path: string
  filename: string
  inlineId?: string
  /** Pixelbreite des Bildes, falls bekannt — begrenzt die Anzeigebreite. */
  width?: number
}

/** Breiter wird ein Bild im Text nicht gezeigt; Retina-Screenshots haben doppelt so viele Pixel. */
export const INLINE_IMAGE_MAX_WIDTH = 640

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** `<img>` für ein Bild im Text. Die feste Breite braucht Outlook, das `max-width` übergeht. */
export function inlineImageTag(src: string, label: string, width?: number): string {
  const shown = width && width > 0 ? Math.min(Math.round(width), INLINE_IMAGE_MAX_WIDTH) : 0
  const widthAttr = shown ? ` width="${shown}"` : ''
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(label)}"${widthAttr} style="display:block; max-width:100%; height:auto; margin:8px 0;" />`
}

/**
 * Rendert den Text zu HTML und setzt für jeden Bild-Platzhalter das Tag aus
 * `tagFor` ein. Die Platzhalter werden VOR dem Rendern gegen eine neutrale
 * Marke getauscht: sonst liefe der Dateiname durch Hervorhebung, Verlinkung
 * und Bereinigung (ein Name wie `www.x.png` würde zum Link). `tagFor` liefert
 * `null` für unbekannte Kennungen — der Platzhalter verschwindet dann.
 */
export function renderBodyWithInlineImages(
  body: string,
  renderEmailHtml: (body: string) => string,
  tagFor: (inlineId: string, label: string) => string | null,
  nonce: string
): string {
  const tags: string[] = []
  const marked = replaceInlineTokens(body, (id, label) => {
    const tag = tagFor(id, label)
    if (tag === null) return ''
    tags.push(tag)
    return `MGINLINE${nonce}N${tags.length - 1}E`
  })
  const html = renderEmailHtml(marked)
  if (tags.length === 0) return html
  return html.replace(new RegExp(`MGINLINE${nonce}N(\\d+)E`, 'g'), (_m, index: string) => tags[Number(index)] || '')
}

export const inlineImageCid = (inlineId: string): string => `mg-inline-${inlineId}`

export interface OutgoingMailInput {
  to: { name: string; address: string }[]
  cc?: { name: string; address: string }[]
  bcc?: { name: string; address: string }[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string
  account: {
    /** Nur für SMTP-Konten; dient dort als letzter Rückfall für den Hostteil der Message-ID. */
    smtpHost?: string
    user: string
    name?: string
    fromAddress?: string
  }
  signatureImagePath?: string
  attachments?: OutgoingAttachment[]
}

/** Dateinamen der Anhänge, die nicht (mehr) lesbar sind. Vor JEDEM Versand prüfen. */
export async function findMissingAttachments(attachments: { path: string; filename: string }[] | undefined): Promise<string[]> {
  const missing: string[] = []
  for (const att of attachments || []) {
    try {
      await fs.access(att.path)
    } catch {
      missing.push(att.filename || path.basename(att.path))
    }
  }
  return missing
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
  // Bilder im Text: nur was einen Platzhalter hat, geht mit — eingebettet über
  // eine Content-ID. Ein Bild ohne Platzhalter hat der Nutzer aus dem Text
  // gelöscht; es wird weder eingebettet noch angehängt.
  const { inline, regular } = splitInlineAttachments(composeData.body, composeData.attachments)
  const inlineById = new Map(inline.map(att => [att.inlineId as string, att]))
  const { randomUUID } = await import('crypto')
  let htmlBody = renderBodyWithInlineImages(
    composeData.body,
    renderEmailHtml,
    (id, label) => {
      const att = inlineById.get(id)
      return att ? inlineImageTag(`cid:${inlineImageCid(id)}`, label || att.filename, att.width) : null
    },
    randomUUID().replace(/-/g, '')
  )

  // Signatur-Bild als CID-Attachment einbetten
  const attachments: Array<{ filename: string; path: string; cid?: string; contentDisposition?: 'inline' }> = []

  // File-Anhaenge hinzufuegen (Existenz ist oben bereits geprueft)
  for (const att of regular) {
    attachments.push({ filename: att.filename, path: att.path })
  }
  for (const att of inline) {
    attachments.push({ filename: att.filename, path: att.path, cid: inlineImageCid(att.inlineId as string), contentDisposition: 'inline' })
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
    // Reintext-Fassung: lesbarer Hinweis statt Platzhalter.
    text: inlineTokensToPlainText(composeData.body, inlineById.keys()),
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
