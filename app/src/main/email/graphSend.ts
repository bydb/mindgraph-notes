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

import * as fs from 'fs/promises'
import { buildOutgoingMail, renderRawMessage, findMissingAttachments, type OutgoingMailInput } from './outgoing'

const GRAPH_SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail'

/**
 * Eigene Obergrenze für den MIME-Rohtext. Eine allgemeine Grenze von Microsoft
 * lässt sich nicht messen (sie hängt am Mandanten); 20 MB Anhang (27 MB Rohtext)
 * gingen im Testmandanten durch. 25 MB Rohtext entsprechen rund 18 MB Anhang.
 */
export const GRAPH_SEND_MAX_BYTES = 25 * 1024 * 1024
/** Großzügig: 27 MB brauchten gemessen rund elf Sekunden. Gilt bis die Antwort samt Fehlertext gelesen ist. */
export const GRAPH_SEND_TIMEOUT_MS = 180_000
/**
 * So lange darf die Suche nach der Gesendet-Kopie die Erfolgsmeldung aufhalten. Die Mail ist dann
 * längst angenommen; ein hängender IMAP-Befehl darf den Erfolg nicht zurückhalten (Codex F17).
 */
export const GRAPH_LOCATE_TIMEOUT_MS = 12_000
/** Base64 im MIME-Rohtext: 4 Zeichen je 3 Bytes plus Zeilenumbrüche. Konservativ gerundet. */
const MIME_ATTACHMENT_FACTOR = 1.37

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
  /**
   * Sucht die von Graph abgelegte Kopie im Gesendet-Ordner. Darf scheitern oder nichts finden.
   * `signal` wird ausgelöst, wenn die Frist abläuft: die Suche soll dann ihre Verbindung schließen
   * und nicht weiterlaufen (Codex F33).
   */
  locateSentCopy?: (accountId: string, messageId: string, signal: AbortSignal) => Promise<{ mailbox?: string; uid?: number }>
  fetch?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
  locateTimeoutMs?: number
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

  // Größe VOR dem Aufbau abschätzen: der Rohtext hält alle Anhänge im Arbeitsspeicher, und für
  // die Anfrage kommt eine Base64-Kopie dazu. Ein sehr großer Anhang soll hier scheitern, nicht
  // erst nach dem Einlesen (Codex F21). Die genaue Prüfung am fertigen Rohtext bleibt unten.
  const maxBytes = deps.maxBytes ?? GRAPH_SEND_MAX_BYTES
  let attachmentBytes = 0
  for (const path of [...(input.attachments || []).map(a => a.path), ...(input.signatureImagePath ? [input.signatureImagePath] : [])]) {
    try {
      attachmentBytes += (await fs.stat(path)).size
    } catch { /* fehlendes Signaturbild wird beim Aufbau ausgelassen */ }
  }
  const estimated = Math.ceil(attachmentBytes * MIME_ATTACHMENT_FACTOR) + Buffer.byteLength(input.body || '', 'utf8') * 2
  if (estimated > maxBytes) {
    return fail(`Die Mail ist mit rund ${mb(estimated)} MB zu groß für den Versand über Microsoft (Grenze ${mb(maxBytes)} MB einschließlich Anhängen). Bitte Anhänge verkleinern oder aufteilen.`)
  }

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

  if (raw.length > maxBytes) {
    return fail(`Die Mail ist mit ${mb(raw.length)} MB zu groß für den Versand über Microsoft (Grenze ${mb(maxBytes)} MB einschließlich Anhängen). Bitte Anhänge verkleinern oder aufteilen.`)
  }

  const doFetch = deps.fetch ?? fetch
  const controller = new AbortController()
  // Die Frist gilt für die ganze Anfrage einschließlich des Lesens einer Fehlerantwort (Codex F24).
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? GRAPH_SEND_TIMEOUT_MS)
  let status: number
  let code = ''
  try {
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
    }
    status = response.status
    if (status !== 202) {
      // Der Fehlertext dient nur dem Codewort. Kommt er nicht (rechtzeitig), zählt der Status allein.
      try {
        const parsed = JSON.parse((await response.text()).slice(0, 20_000)) as { error?: { code?: unknown } }
        // Nur das Codewort — die Fehlernachricht von Graph kann Adressen tragen.
        if (typeof parsed?.error?.code === 'string' && /^[A-Za-z0-9_.]{1,60}$/.test(parsed.error.code)) code = parsed.error.code
      } catch { /* kein JSON, abgebrochen oder Frist erreicht */ }
    }
  } finally {
    clearTimeout(timer)
  }

  if (status !== 202) {
    const suffix = ` (${status}${code ? ` ${code}` : ''})`
    if (status === 401) return fail(`Für dieses Konto ist eine neue Anmeldung bei Microsoft nötig.${suffix}`)
    if (status === 403) return fail(`Microsoft hat das Senden abgelehnt. Mögliche Ursache: fehlende Zustimmung oder eine Richtlinie deiner Organisation.${suffix}`)
    if (status === 413) return fail(`Die Mail ist zu groß für dieses Postfach.${suffix}`)
    if (status === 429) return fail(`Microsoft nimmt gerade keine weiteren Mails von diesem Konto an. Bitte später erneut senden.${suffix}`)
    if (status >= 500) {
      // Serverfehler nach vollständig übertragener Anfrage: Annahme ist nicht ausgeschlossen.
      return fail(`Unklar, ob die Mail gesendet wurde: Microsoft meldete einen Serverfehler${suffix}. Bitte prüfe den Ordner „Gesendet“, bevor du erneut sendest.`, { uncertain: true, messageId })
    }
    return fail(`Microsoft hat die Mail nicht angenommen.${suffix}`)
  }

  // Angenommen. Die Kopie im Gesendet-Ordner suchen ist Zugabe mit harter Frist: scheitert oder
  // hängt sie, gilt der Versand trotzdem sofort als Erfolg, und der nächste Abruf gleicht ab.
  let located: { mailbox?: string; uid?: number } = {}
  if (deps.locateSentCopy) {
    let giveUp: ReturnType<typeof setTimeout> | undefined
    const stopSearch = new AbortController()
    try {
      const search = deps.locateSentCopy(input.accountId, messageId, stopSearch.signal)
      search.catch(() => undefined) // ein spätes Scheitern nach der Frist darf nicht unbehandelt bleiben
      located = await Promise.race([
        search,
        new Promise<{ mailbox?: string; uid?: number }>(resolve => {
          giveUp = setTimeout(() => { stopSearch.abort(); resolve({}) }, deps.locateTimeoutMs ?? GRAPH_LOCATE_TIMEOUT_MS)
        })
      ])
    } catch { /* bleibt leer */ } finally {
      if (giveUp) clearTimeout(giveUp)
    }
  }
  return { success: true, transport: 'graph', messageId, sentMailbox: located.mailbox, sentUid: located.uid }
}
