// Versand über Microsoft Graph für Microsoft-365-Konten.
// Plan und Messungen: docs/codex-collab/microsoft-365-anbindung.md (Abschnitt 6, E9/E10/E13–E16).
//
// Was hier gilt:
//
// - EIN Transportweg: diese Funktion schickt genau eine Anfrage an Graph und
//   kennt weder Passwort noch SMTP. Der Aufrufer zweigt für Microsoft-Konten
//   hierher ab, bevor er irgendetwas für SMTP anfasst.
// - Absender, Anzeigename und der Hostteil der Message-ID kommen aus der
//   Anmeldung im Main (deps.getGraphToken), nie aus den Angaben des Renderers.
// - Versandtext ist der MIME-Rohtext MIT `Bcc:`-Zeile. Gemessen am 10.11.2026
//   (innerhalb eines Mandanten und an einen fremden Server): Graph stellt die
//   Blindkopie zu und entfernt die Zeile; ohne die Zeile käme die Blindkopie
//   nicht an. Die Gesendet-Kopie legt Graph selbst ab — kein IMAP-Append.
// - 202 heißt „von Microsoft angenommen“, nicht „zugestellt“.
// - Bricht die Verbindung nach dem Absenden ab, ist offen, ob die Mail
//   hinausging. Das ist ein eigener Zustand (`uncertain`), nie eine
//   automatische Wiederholung.

import { buildOutgoingMail, renderRawMessage, findMissingAttachments, type OutgoingMailInput } from './outgoing'

const GRAPH_SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail'

/**
 * Eigene Obergrenze für den MIME-Rohtext. Eine allgemeine Grenze von Microsoft
 * lässt sich nicht messen (sie hängt am Mandanten); 20 MB Anhang (27 MB Rohtext)
 * gingen im Testmandanten durch. 25 MB Rohtext entsprechen rund 18 MB Anhang.
 */
export const GRAPH_SEND_MAX_BYTES = 25 * 1024 * 1024
/** Großzügig: 27 MB brauchten gemessen rund elf Sekunden. */
export const GRAPH_SEND_TIMEOUT_MS = 180_000

export interface GraphSendInput {
  accountId: string
  to: { name: string; address: string }[]
  cc?: { name: string; address: string }[]
  bcc?: { name: string; address: string }[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string
  signatureImagePath?: string
  attachments?: { path: string; filename: string }[]
}

export interface GraphSendDeps {
  /** Wirft, wenn das Konto nicht (mehr) senden darf. */
  getGraphToken: (accountId: string) => Promise<{ accessToken: string; username: string; displayName?: string }>
  renderEmailHtml: (body: string) => string
  /** Macht aus einem Anmeldefehler eine Meldung für die Oberfläche. */
  describeAuthError: (error: unknown) => string
  /** Sucht die von Graph abgelegte Kopie im Gesendet-Ordner. Darf scheitern oder nichts finden. */
  locateSentCopy?: (accountId: string, messageId: string) => Promise<{ mailbox?: string; uid?: number }>
  fetch?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
}

export interface GraphSendResult {
  success: boolean
  transport: 'graph'
  messageId?: string
  error?: string
  /** true: unklar, ob die Mail hinausging — nicht automatisch wiederholen. */
  uncertain?: boolean
  sentMailbox?: string
  sentUid?: number
}

const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',')

// Fehler, bei denen sicher nichts abgeschickt wurde: die Verbindung kam gar nicht zustande.
const NOT_SENT_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ERR_INVALID_URL'])

function networkErrorCode(error: unknown): string {
  const e = error as { code?: string; cause?: { code?: string } } | null
  return String(e?.cause?.code || e?.code || '')
}

export async function sendViaGraph(input: GraphSendInput, deps: GraphSendDeps): Promise<GraphSendResult> {
  const fail = (error: string, extra: Partial<GraphSendResult> = {}): GraphSendResult => ({ success: false, transport: 'graph', error, ...extra })

  const missing = await findMissingAttachments(input.attachments)
  if (missing.length > 0) return fail(`Anhang nicht gefunden: ${missing.join(', ')}`)

  let token: { accessToken: string; username: string; displayName?: string }
  try {
    token = await deps.getGraphToken(input.accountId)
  } catch (error) {
    return fail(deps.describeAuthError(error))
  }

  // Absender ausschließlich aus der Anmeldung.
  const mailInput: OutgoingMailInput = {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body: input.body,
    inReplyTo: input.inReplyTo,
    references: input.references,
    signatureImagePath: input.signatureImagePath,
    attachments: input.attachments,
    account: { user: token.username, name: token.displayName, fromAddress: token.username }
  }
  const { mailOptions, messageId } = await buildOutgoingMail(mailInput, deps.renderEmailHtml)
  const raw = await renderRawMessage(mailOptions)

  const maxBytes = deps.maxBytes ?? GRAPH_SEND_MAX_BYTES
  if (raw.length > maxBytes) {
    return fail(`Die Mail ist mit ${mb(raw.length)} MB zu groß für den Versand über Microsoft (Grenze ${mb(maxBytes)} MB einschließlich Anhängen). Bitte Anhänge verkleinern oder aufteilen.`)
  }

  const doFetch = deps.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? GRAPH_SEND_TIMEOUT_MS)
  let response: Response
  try {
    response = await doFetch(GRAPH_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'text/plain' },
      body: raw.toString('base64'),
      signal: controller.signal
    })
  } catch (error) {
    if (NOT_SENT_CODES.has(networkErrorCode(error))) {
      return fail('Microsoft ist nicht erreichbar. Die Mail wurde nicht gesendet. Bitte prüfe die Netzverbindung.')
    }
    // Zeitlimit oder Abbruch mitten in der Übertragung: Microsoft kann die Mail schon angenommen haben.
    return fail('Unklar, ob die Mail gesendet wurde: Die Verbindung zu Microsoft brach ab. Bitte prüfe den Ordner „Gesendet“, bevor du erneut sendest. Der Entwurf bleibt erhalten.', { uncertain: true, messageId })
  } finally {
    clearTimeout(timer)
  }

  if (response.status !== 202) {
    let code = ''
    try {
      const parsed = JSON.parse(await response.text()) as { error?: { code?: unknown } }
      // Nur das Codewort — die Fehlernachricht von Graph kann Adressen tragen.
      if (typeof parsed?.error?.code === 'string' && /^[A-Za-z0-9_.]{1,60}$/.test(parsed.error.code)) code = parsed.error.code
    } catch { /* kein JSON */ }
    const suffix = ` (${response.status}${code ? ` ${code}` : ''})`
    if (response.status === 401) return fail(`Für dieses Konto ist eine neue Anmeldung bei Microsoft nötig.${suffix}`)
    if (response.status === 403) return fail(`Microsoft hat das Senden abgelehnt. Mögliche Ursache: fehlende Zustimmung oder eine Richtlinie deiner Organisation.${suffix}`)
    if (response.status === 413) return fail(`Die Mail ist zu groß für dieses Postfach.${suffix}`)
    if (response.status === 429) return fail(`Microsoft nimmt gerade keine weiteren Mails von diesem Konto an. Bitte später erneut senden.${suffix}`)
    if (response.status >= 500) {
      // Serverfehler nach vollständig übertragener Anfrage: Annahme ist nicht ausgeschlossen.
      return fail(`Unklar, ob die Mail gesendet wurde: Microsoft meldete einen Serverfehler${suffix}. Bitte prüfe den Ordner „Gesendet“, bevor du erneut sendest.`, { uncertain: true, messageId })
    }
    return fail(`Microsoft hat die Mail nicht angenommen.${suffix}`)
  }

  // Angenommen. Die Kopie im Gesendet-Ordner suchen ist Zugabe: scheitert es, gleicht der nächste Abruf ab.
  let located: { mailbox?: string; uid?: number } = {}
  if (deps.locateSentCopy) {
    try {
      located = await deps.locateSentCopy(input.accountId, messageId)
    } catch { /* bleibt leer */ }
  }
  return { success: true, transport: 'graph', messageId, sentMailbox: located.mailbox, sentUid: located.uid }
}
