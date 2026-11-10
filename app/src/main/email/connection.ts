// Verbindungsoptionen für IMAP an EINER Stelle.
//
// Bis 10.11.2026 setzte jede der acht Verbindungsstellen in ipc.ts ihr eigenes
// Options-Objekt zusammen. Dieser Helfer erzeugt genau dasselbe Objekt; er ist
// die Stelle, an der später eine zweite Anmeldeart (Zugangsmarke statt Passwort)
// ankommt, ohne dass acht Aufrufer geändert werden müssen
// (docs/codex-collab/microsoft-365-anbindung.md, Abschnitt 1).
//
// Seit dem Abruf mit Zugangsmarke (Microsoft 365) nimmt der Helfer statt eines
// Passworts auch `{ accessToken }` und baut daraus die XOAUTH2-Anmeldung.
//
// Bewusst NICHT hier: Passwort laden, Zeitlimits festlegen, Fehler behandeln,
// Ereignis-Listener. Das unterscheidet sich je Aufrufer und bleibt dort.

export interface ImapEndpoint {
  host: string
  port: number
  tls: boolean
  user: string
}

export interface ImapTimeouts {
  socketTimeout: number
  greetingTimeout: number
}

/** Passwort oder Zugangsmarke (OAuth, XOAUTH2). */
export type ImapSecret = string | { accessToken: string }

export interface ImapConnectionOptions {
  host: string
  port: number
  secure: boolean
  auth: { user: string; pass: string } | { user: string; accessToken: string }
  logger: false
  socketTimeout: number
  greetingTimeout: number
}

export function buildImapOptions(endpoint: ImapEndpoint, secret: ImapSecret, timeouts: ImapTimeouts): ImapConnectionOptions {
  return {
    host: endpoint.host,
    port: endpoint.port,
    secure: endpoint.tls,
    auth: typeof secret === 'string'
      ? { user: endpoint.user, pass: secret }
      : { user: endpoint.user, accessToken: secret.accessToken },
    logger: false,
    socketTimeout: timeouts.socketTimeout,
    greetingTimeout: timeouts.greetingTimeout
  }
}
