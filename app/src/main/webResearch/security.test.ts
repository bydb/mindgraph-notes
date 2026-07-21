// Sicherheits-Tests für den Webrecherche-Egress (Codex-Finding 8). Deckt die pur/injizierbar
// testbaren Kernentscheidungen ab: gepinnte Auflösung (kein Rebinding-Fenster), Redirect-
// Regel, Adress-Auswahl, sowie die lokale Extraktion (synchron/kein Netzzugriff, selektiver
// Escape). Netzwerk-Ganzpfad-Fälle (Timeout/Dekompressions-Bombe live) deckt der GUI-/
// Integrationstest in Phase 5. Bewusste Ausnahme von „main/ nicht in der Dauer-Suite"
// (Präzedenz: noteAgent/security.test.ts).

import { describe, it, expect } from 'vitest'
import http from 'node:http'
import zlib from 'node:zlib'
import { selectPublicAddress, isRedirectAllowed, createValidatingLookup, safeFetch, type ResolveAll } from './egress'
import { fetchAndExtract, buildTurndown } from './fetchExtract'

function startLoopbackServer(handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      resolve({ port, close: () => new Promise<void>((r) => server.close(() => r())) })
    })
  })
}

describe('selectPublicAddress', () => {
  it('wählt die erste global routbare Adresse', () => {
    expect(selectPublicAddress([{ address: '10.0.0.1', family: 4 }, { address: '8.8.8.8', family: 4 }]))
      .toEqual({ address: '8.8.8.8', family: 4 })
  })

  it('gibt null, wenn ALLE Adressen privat/gesperrt sind', () => {
    expect(selectPublicAddress([{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }])).toBeNull()
    expect(selectPublicAddress([{ address: '192.0.2.1', family: 4 }])).toBeNull() // TEST-NET-1
    expect(selectPublicAddress([])).toBeNull()
  })
})

describe('isRedirectAllowed', () => {
  it('erlaubt same-host und http→https-Upgrade', () => {
    expect(isRedirectAllowed('http://a.com/x', 'http://a.com/y')).toBe(true)
    expect(isRedirectAllowed('http://a.com/x', 'https://a.com/y')).toBe(true)
    expect(isRedirectAllowed('https://a.com/x', 'https://a.com/y?z=1')).toBe(true)
  })

  it('lehnt Cross-Host und Protokoll-Downgrade ab (SSRF-Umweg)', () => {
    expect(isRedirectAllowed('https://a.com/x', 'https://evil.com/y')).toBe(false)
    expect(isRedirectAllowed('https://a.com/x', 'http://a.com/y')).toBe(false)
    expect(isRedirectAllowed('https://a.com/x', 'file:///etc/passwd')).toBe(false)
    expect(isRedirectAllowed('kaputt', 'https://a.com')).toBe(false)
  })
})

describe('createValidatingLookup (Pinning + Origin-Freigabe)', () => {
  const fakeResolver = (addrs: Array<{ address: string; family: number }>): ResolveAll =>
    ((_host, _opts, cb) => cb(null, addrs)) as ResolveAll
  const doLookup = (lookup: ReturnType<typeof createValidatingLookup>, host: string) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address?: unknown; family?: unknown }>((resolve) => {
      lookup(host, { all: false }, (err, address, family) => resolve({ err, address, family }))
    })

  it('gibt dem Socket die geprüfte öffentliche Adresse (single-shot)', async () => {
    const lookup = createValidatingLookup({ requestOrigin: 'https://example.com' }, fakeResolver([{ address: '93.184.216.34', family: 4 }]))
    const out = await doLookup(lookup, 'example.com')
    expect(out.address).toBe('93.184.216.34')
    expect(out.family).toBe(4)
  })

  it('blockt, wenn der Host nur auf private Adressen auflöst (ohne Freigabe)', async () => {
    const lookup = createValidatingLookup({ requestOrigin: 'https://metadata.internal' }, fakeResolver([{ address: '169.254.169.254', family: 4 }]))
    expect((await doLookup(lookup, 'metadata.internal')).err?.code).toBe('ESSRFBLOCKED')
  })

  it('wählt bei gemischter Auflösung die öffentliche Adresse (Split-Horizon-Trick)', async () => {
    const lookup = createValidatingLookup({ requestOrigin: 'https://mixed.example' }, fakeResolver([{ address: '10.0.0.5', family: 4 }, { address: '1.1.1.1', family: 4 }]))
    expect((await doLookup(lookup, 'mixed.example')).address).toBe('1.1.1.1')
  })

  it('freigegebenes exaktes Origin darf privat auflösen', async () => {
    const lookup = createValidatingLookup(
      { requestOrigin: 'http://searx.lan:8080', approvedPrivateOrigin: 'http://searx.lan:8080' },
      fakeResolver([{ address: '192.168.1.9', family: 4 }])
    )
    expect((await doLookup(lookup, 'searx.lan')).address).toBe('192.168.1.9')
  })

  it('P1: DNS-Name, der auf privat wechselt, wird OHNE passende Origin-Freigabe geblockt', async () => {
    // „öffentlich aussehender" Name, der (per Rebind) privat auflöst, aber das Request-Origin
    // entspricht NICHT dem freigegebenen Origin → blockiert.
    const lookup = createValidatingLookup(
      { requestOrigin: 'http://searx.example.com', approvedPrivateOrigin: 'http://searx.lan:8080' },
      fakeResolver([{ address: '127.0.0.1', family: 4 }])
    )
    expect((await doLookup(lookup, 'searx.example.com')).err?.code).toBe('ESSRFBLOCKED')
  })

  it('P1: Freigabe für Origin A schaltet Origin B nicht frei (Port-/Scheme-genau)', async () => {
    const lookup = createValidatingLookup(
      { requestOrigin: 'http://searx.lan:9999', approvedPrivateOrigin: 'http://searx.lan:8080' },
      fakeResolver([{ address: '192.168.1.9', family: 4 }])
    )
    expect((await doLookup(lookup, 'searx.lan')).err?.code).toBe('ESSRFBLOCKED')
  })
})

describe('fetchAndExtract — lokale Extraktion (kein Netzzugriff, selektiver Escape)', () => {
  it('defuddle-Core.parse() ist synchron (kein async Extractor → kein Drittabruf)', async () => {
    const Defuddle = (await import('defuddle')).default
    const { parseHTML } = await import('linkedom')
    const { document } = parseHTML('<article><h1>T</h1><p>Inhalt hier drin.</p></article>')
    const result = new Defuddle(document, { url: 'https://example.com/a' }).parse()
    // parse() gibt synchron ein Objekt zurück (keine Promise) — belegt: keine Netz-Await.
    expect(typeof (result as { then?: unknown }).then).toBe('undefined')
    expect(result.content).toContain('Inhalt')
  })

  it('PRODUKTIONS-Escape (buildTurndown) lässt [ ] \\ _ unangetastet, escapt * und Listen', () => {
    const md = buildTurndown().turndown('<p>Ein [[Wikilink]] und _Unterstrich_ und Pfad C:\\x</p>')
    expect(md).toContain('[[Wikilink]]')
    expect(md).toContain('_Unterstrich_')
    expect(md).toContain('C:\\x')
    // Emphasis + nummerierte Listen bleiben escaped (turndown-Default, korrekt):
    expect(buildTurndown().turndown('<p>*Stern*</p>')).toContain('\\*Stern\\*')
    expect(buildTurndown().turndown('<p>1. Punkt</p>')).toContain('1\\. Punkt')
  })

  it('bekannte Grenze: literaler Backslash direkt vor * ergibt \\\\* (Wikilink-Sicherheit hat Vorrang)', () => {
    // Der literale Backslash bleibt unescaped (Wikilink-Regel). Steht er unmittelbar vor einem
    // escapten Stern, entsteht \\* — bewusst akzeptiert (Backslash-vor-Stern ist in Webinhalten
    // extrem selten; Wikilink-Integrität \[ \] hat Vorrang, ohne Backslash-Escaping unlösbar).
    expect(buildTurndown().turndown('<p>a\\*b</p>')).toContain('\\\\*')
  })

  it('fetchAndExtract ist als Funktion exportiert (Signatur-Rauchtest)', () => {
    expect(typeof fetchAndExtract).toBe('function')
  })
})

describe('safeFetch — Egress-Ganzpfad gegen Loopback-Server (Streaming-Cap, Zeitlimit, Status)', () => {
  const approved = (port: number) => `http://127.0.0.1:${port}`

  it('ohne Origin-Freigabe ist 127.0.0.1 gesperrt (SSRF-Zaun)', async () => {
    await expect(safeFetch('http://127.0.0.1:9/', { timeoutMs: 2000, maxBytes: 1000 }))
      .rejects.toThrow(/SSRF/)
  })

  it('kappt entpackte Bytes bei gzip (Dekompressionsbomben-Schutz)', async () => {
    const gz = zlib.gzipSync(Buffer.alloc(200_000, 0x61)) // 200 KB → wenige Byte komprimiert
    const srv = await startLoopbackServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' })
      res.end(gz)
    })
    try {
      const r = await safeFetch(`http://127.0.0.1:${srv.port}/`, {
        timeoutMs: 5000, maxBytes: 1000, approvedPrivateOrigin: approved(srv.port), acceptContentTypes: ['text/html']
      })
      expect(r.truncated).toBe(true)
      expect(r.body.length).toBeLessThanOrEqual(1000)
    } finally { await srv.close() }
  })

  it('kappt unkomprimierte Übergröße', async () => {
    const srv = await startLoopbackServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(Buffer.alloc(50_000, 0x62))
    })
    try {
      const r = await safeFetch(`http://127.0.0.1:${srv.port}/`, {
        timeoutMs: 5000, maxBytes: 1000, approvedPrivateOrigin: approved(srv.port)
      })
      expect(r.truncated).toBe(true)
      expect(r.body.length).toBeLessThanOrEqual(1000)
    } finally { await srv.close() }
  })

  it('setzt truncated NICHT bei exakt maxBytes (> statt >=)', async () => {
    const srv = await startLoopbackServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(Buffer.alloc(1000, 0x63))
    })
    try {
      const r = await safeFetch(`http://127.0.0.1:${srv.port}/`, {
        timeoutMs: 5000, maxBytes: 1000, approvedPrivateOrigin: approved(srv.port)
      })
      expect(r.body.length).toBe(1000)
      expect(r.truncated).toBe(false)
    } finally { await srv.close() }
  })

  it('bricht bei Trickle-Antwort am Gesamt-Zeitlimit ab (nicht nur Inaktivität)', async () => {
    let iv: ReturnType<typeof setInterval> | undefined
    const srv = await startLoopbackServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      iv = setInterval(() => { try { res.write('x') } catch { /* geschlossen */ } }, 30) // nie enden
      res.on('close', () => { if (iv) clearInterval(iv) })
    })
    try {
      await expect(safeFetch(`http://127.0.0.1:${srv.port}/`, {
        timeoutMs: 200, maxBytes: 5_000_000, approvedPrivateOrigin: approved(srv.port), acceptContentTypes: ['text/html']
      })).rejects.toThrow(/Zeit/)
    } finally { if (iv) clearInterval(iv); await srv.close() }
  })

  it('P1: endloser Redirect-Body hängt nicht (Body wird verworfen, Hop-Limit greift)', async () => {
    const intervals: Array<ReturnType<typeof setInterval>> = []
    const srv = await startLoopbackServer((_req, res) => {
      res.writeHead(302, { Location: '/', 'Content-Type': 'text/html' }) // Selbst-Redirect
      const iv = setInterval(() => { try { res.write('x') } catch { /* geschlossen */ } }, 20)
      intervals.push(iv)
      res.on('close', () => clearInterval(iv))
    })
    try {
      await expect(safeFetch(`http://127.0.0.1:${srv.port}/`, {
        timeoutMs: 3000, maxBytes: 1_000_000, approvedPrivateOrigin: approved(srv.port), acceptContentTypes: ['text/html']
      })).rejects.toThrow(/Weiterleitung/)
    } finally { intervals.forEach(clearInterval); await srv.close() }
  })

  it('reicht HTTP-Status durch (404 wird nicht als Erfolg getarnt)', async () => {
    const srv = await startLoopbackServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/html' })
      res.end('<html>weg</html>')
    })
    try {
      const r = await safeFetch(`http://127.0.0.1:${srv.port}/`, {
        timeoutMs: 5000, maxBytes: 100_000, approvedPrivateOrigin: approved(srv.port), acceptContentTypes: ['text/html']
      })
      expect(r.status).toBe(404) // fetchAndExtract lehnt Nicht-2xx danach ab
    } finally { await srv.close() }
  })
})
