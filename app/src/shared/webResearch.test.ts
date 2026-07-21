import { describe, it, expect } from 'vitest'
import {
  normalizeWebUrl,
  hostnameFromUrl,
  isPrivateIp,
  isForbiddenHostname,
  extractUrlsFromInstruction,
  parseSearxngResults,
  parseLinkupResults,
  normalizeQuery,
  isQueryTooLong,
  isSearchAllowedInPhase,
  mergeDeterministicSources,
  sanitizeSourceTitle,
  isWebResearchConfigComplete,
  WEB_QUERY_MAX_CHARS,
  MAX_USER_URLS,
  MAX_HITS_PER_SEARCH,
  WEB_SNIPPET_MAX_CHARS
} from './webResearch'

describe('normalizeWebUrl', () => {
  it('akzeptiert http/https und verwirft das Fragment', () => {
    expect(normalizeWebUrl('https://Example.com/a/b?x=1#frag')).toBe('https://example.com/a/b?x=1')
    expect(normalizeWebUrl('http://foo.com')).toBe('http://foo.com/')
  })

  it('vereinheitlicht den Wurzelpfad, unterscheidet aber Unterpfade', () => {
    expect(normalizeWebUrl('https://host')).toBe(normalizeWebUrl('https://host/'))
    expect(normalizeWebUrl('https://host/foo')).not.toBe(normalizeWebUrl('https://host/foo/'))
  })

  it('lehnt eingebettete Credentials ab (SSRF-Trick)', () => {
    expect(normalizeWebUrl('http://user:pass@example.com/')).toBeNull()
    expect(normalizeWebUrl('http://admin@example.com/')).toBeNull()
  })

  it('lehnt Nicht-http(s)-Schemata und Müll ab', () => {
    expect(normalizeWebUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeWebUrl('ftp://host/x')).toBeNull()
    expect(normalizeWebUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeWebUrl('nicht mal eine url')).toBeNull()
    expect(normalizeWebUrl('')).toBeNull()
  })

  it('lehnt zu lange URLs ab', () => {
    expect(normalizeWebUrl('https://host/' + 'a'.repeat(3000))).toBeNull()
  })
})

describe('isPrivateIp — IPv4', () => {
  it('blockt Loopback, RFC1918, Link-local, CGNAT, 0/8', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.255',
      '192.168.1.1', '169.254.1.1', '100.64.0.1', '100.127.255.255', '0.0.0.0', '198.18.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('blockt Multicast, reserviert und Broadcast', () => {
    for (const ip of ['224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('blockt Doku-/Benchmark-/6to4-Anycast-Netze (nur global routbar erlauben)', () => {
    for (const ip of ['192.0.2.1', '198.51.100.1', '203.0.113.1', '192.0.0.1', '192.88.99.1']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('erlaubt öffentliche v4-Adressen', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '100.63.0.1', '100.128.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(false)
    }
  })

  it('behandelt kaputte v4 fail-closed', () => {
    expect(isPrivateIp('999.1.1.1')).toBe(true)
    expect(isPrivateIp('1.2.3')).toBe(true)
    expect(isPrivateIp('')).toBe(true)
  })
})

describe('isPrivateIp — IPv6', () => {
  it('blockt Loopback, unspezifiziert, ULA, Link-local, Site-local, Multicast', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fec0::1', 'ff02::1']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('blockt Doku (2001:db8::/32), 6to4 (2002::/16) und IPv4-compatible (::/96)', () => {
    for (const ip of ['2001:db8::1', '2002:7f00:1::', '::7f00:1', '::8.8.8.8']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('blockt IPv4-mapped v6, das auf private v4 zeigt (auch Hex-Schreibweise)', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true)      // = 127.0.0.1, wie Node es normalisiert
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true)
    expect(isPrivateIp('::ffff:0a00:1')).toBe(true)      // = 10.0.0.1
  })

  it('blockt NAT64-eingebettete private v4', () => {
    expect(isPrivateIp('64:ff9b::7f00:1')).toBe(true)    // 64:ff9b::127.0.0.1
  })

  it('erlaubt öffentliche v6 und öffentlich-gemappte v4', () => {
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false)
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false)
  })

  it('behandelt kaputte v6 fail-closed', () => {
    expect(isPrivateIp('::gg')).toBe(true)
    expect(isPrivateIp('1::2::3')).toBe(true)
  })
})

describe('isForbiddenHostname', () => {
  it('blockt localhost und interne TLDs', () => {
    for (const h of ['localhost', 'foo.localhost', 'router.local', 'db.internal', 'x.home.arpa']) {
      expect(isForbiddenHostname(h), h).toBe(true)
    }
  })

  it('blockt auch mit FQDN-Wurzelpunkt (trailing dot)', () => {
    for (const h of ['localhost.', 'router.local.', 'db.internal.']) {
      expect(isForbiddenHostname(h), h).toBe(true)
    }
  })

  it('blockt private IP-Literale (v4 und v6)', () => {
    expect(isForbiddenHostname('127.0.0.1')).toBe(true)
    expect(isForbiddenHostname('192.168.0.5')).toBe(true)
    expect(isForbiddenHostname('[::1]')).toBe(true)
    expect(isForbiddenHostname('::1')).toBe(true)
  })

  it('erlaubt normale DNS-Namen und öffentliche Literale (DNS-Check folgt im Main)', () => {
    expect(isForbiddenHostname('example.com')).toBe(false)
    expect(isForbiddenHostname('sub.domain.co.uk')).toBe(false)
    expect(isForbiddenHostname('8.8.8.8')).toBe(false)
  })
})

describe('extractUrlsFromInstruction', () => {
  it('zieht URLs aus dem Auftrag, schneidet Satzzeichen ab', () => {
    const urls = extractUrlsFromInstruction('Fasse https://example.com/artikel zusammen, siehe auch http://test.org.')
    expect(urls).toEqual(['https://example.com/artikel', 'http://test.org/'])
  })

  it('behält balancierte Klammern, trimmt unbalancierte', () => {
    expect(extractUrlsFromInstruction('siehe https://de.wikipedia.org/wiki/Funktion_(Mathematik) hier'))
      .toEqual(['https://de.wikipedia.org/wiki/Funktion_(Mathematik)'])
    expect(extractUrlsFromInstruction('(https://example.com) auch'))
      .toEqual(['https://example.com/'])
  })

  it('verwirft private/interne Hosts (auch mit trailing dot)', () => {
    const urls = extractUrlsFromInstruction('lokal http://localhost:8080/x, intern http://192.168.1.1/y, FQDN http://localhost./ aber https://echt.com/z')
    expect(urls).toEqual(['https://echt.com/z'])
  })

  it('dedupliziert und deckelt auf MAX_USER_URLS', () => {
    const many = Array.from({ length: 10 }, (_, i) => `https://site${i}.com/`).join(' ')
    expect(extractUrlsFromInstruction(many + ' https://site0.com/').length).toBe(MAX_USER_URLS)
  })

  it('leerer/URL-freier Text → []', () => {
    expect(extractUrlsFromInstruction('nur Text, keine Adresse')).toEqual([])
    expect(extractUrlsFromInstruction('')).toEqual([])
  })
})

describe('parseSearxngResults', () => {
  it('mappt echte SearXNG-Antwort auf Hits', () => {
    const json = {
      query: 'test',
      results: [
        { title: 'Erster Treffer', url: 'https://a.example/1', content: 'Ein   Snippet\nmit  Umbruch' },
        { title: 'Zweiter', url: 'http://b.example/2', content: 'noch einer' }
      ]
    }
    const hits = parseSearxngResults(json)
    expect(hits).toEqual([
      { title: 'Erster Treffer', url: 'https://a.example/1', snippet: 'Ein Snippet mit Umbruch' },
      { title: 'Zweiter', url: 'http://b.example/2', snippet: 'noch einer' }
    ])
  })

  it('verwirft Treffer mit unbrauchbarer URL, deckelt auf MAX_HITS_PER_SEARCH', () => {
    const results = [{ title: 'bad', url: 'ftp://x/y', content: 'c' }]
    for (let i = 0; i < 20; i++) results.push({ title: `t${i}`, url: `https://ok${i}.com/`, content: 'c' })
    const hits = parseSearxngResults({ results })
    expect(hits.length).toBe(MAX_HITS_PER_SEARCH)
    expect(hits.every(h => h.url.startsWith('https://ok'))).toBe(true)
  })

  it('robuste Rückgabe bei kaputter/leerer Eingabe', () => {
    expect(parseSearxngResults(null)).toEqual([])
    expect(parseSearxngResults({})).toEqual([])
    expect(parseSearxngResults({ results: 'nope' })).toEqual([])
    expect(parseSearxngResults('<html>keine json</html>')).toEqual([])
  })

  it('kappt überlange Snippets', () => {
    const hits = parseSearxngResults({ results: [{ title: 't', url: 'https://a.com/', content: 'x'.repeat(2000) }] })
    expect(hits[0].snippet.length).toBe(WEB_SNIPPET_MAX_CHARS)
  })
})

describe('parseLinkupResults', () => {
  it('mappt Linkup searchResults (name→title) auf Hits', () => {
    const json = {
      results: [
        { type: 'text', name: 'Linkup-Titel', url: 'https://c.example/', content: 'Inhalt' }
      ]
    }
    expect(parseLinkupResults(json)).toEqual([
      { title: 'Linkup-Titel', url: 'https://c.example/', snippet: 'Inhalt' }
    ])
  })

  it('überspringt Nicht-Text-Treffer (type: image)', () => {
    const json = {
      results: [
        { type: 'image', name: 'Bild', url: 'https://img.example/pic.jpg' },
        { type: 'text', name: 'Text', url: 'https://c.example/', content: 'Inhalt' }
      ]
    }
    expect(parseLinkupResults(json)).toEqual([
      { title: 'Text', url: 'https://c.example/', snippet: 'Inhalt' }
    ])
  })

  it('robuste Rückgabe bei kaputter Eingabe', () => {
    expect(parseLinkupResults(null)).toEqual([])
    expect(parseLinkupResults({ results: [{ name: 'x', url: 'nope' }] })).toEqual([])
  })
})

describe('normalizeQuery / isQueryTooLong', () => {
  it('normalizeQuery trimmt nur, kürzt nicht', () => {
    expect(normalizeQuery('  hallo  ')).toBe('hallo')
    expect(normalizeQuery('q'.repeat(400)).length).toBe(400)   // keine stille Kürzung
  })

  it('isQueryTooLong zählt Codepoints (Emoji zählt als 1) und lehnt Überlänge ab', () => {
    expect(isQueryTooLong('kurz')).toBe(false)
    expect(isQueryTooLong('q'.repeat(WEB_QUERY_MAX_CHARS))).toBe(false)
    expect(isQueryTooLong('q'.repeat(WEB_QUERY_MAX_CHARS + 1))).toBe(true)
    // 250 Emojis = 250 Codepoints (aber 500 UTF-16-Einheiten) → gerade noch erlaubt
    expect(isQueryTooLong('😀'.repeat(WEB_QUERY_MAX_CHARS))).toBe(false)
    expect(isQueryTooLong('😀'.repeat(WEB_QUERY_MAX_CHARS + 1))).toBe(true)
  })
})

describe('isSearchAllowedInPhase (Zustandsmaschine)', () => {
  it('Suche nur in der search-Phase', () => {
    expect(isSearchAllowedInPhase('search')).toBe(true)
    expect(isSearchAllowedInPhase('fetch')).toBe(false)
    expect(isSearchAllowedInPhase('write')).toBe(false)
  })
})

describe('isWebResearchConfigComplete', () => {
  it('SearXNG braucht eine gültige Basis-URL', () => {
    expect(isWebResearchConfigComplete({ provider: 'searxng', searxngUrl: 'https://searx.example/' })).toBe(true)
    expect(isWebResearchConfigComplete({ provider: 'searxng', searxngUrl: '' })).toBe(false)
    expect(isWebResearchConfigComplete({ provider: 'searxng', searxngUrl: 'kaputt' })).toBe(false)
  })

  it('Linkup ist config-seitig vollständig (Key prüft der Main)', () => {
    expect(isWebResearchConfigComplete({ provider: 'linkup', searxngUrl: '' })).toBe(true)
  })

  it('undefined → false', () => {
    expect(isWebResearchConfigComplete(undefined)).toBe(false)
  })
})

describe('mergeDeterministicSources', () => {
  const rec = (url: string, title: string, status: 'ok' | 'failed' = 'ok') => ({
    requestedUrl: url, finalUrl: url, redirectChain: [url], title, fetchedAt: '2026-07-20T10:00:00.000Z', status
  })

  it('hängt nur erfolgreich abgerufene, deduplizierte Quellen an', () => {
    const md = mergeDeterministicSources('Text.', [
      rec('https://a.com/1', 'Titel A'),
      rec('https://a.com/1', 'Titel A (dup)'),
      rec('https://b.com/2', 'Titel B'),
      rec('https://c.com/3', 'Fehlversuch', 'failed')
    ])
    expect(md).toContain('## Quellen')
    expect(md).toContain('- [Titel A](https://a.com/1) — abgerufen am 2026-07-20')
    expect(md).toContain('- [Titel B](https://b.com/2) — abgerufen am 2026-07-20')
    expect(md).not.toContain('c.com/3')           // Fehlversuch nicht als Quelle
    expect(md.match(/a\.com\/1/g)?.length).toBe(1) // dedupliziert
  })

  it('ersetzt einen vom Modell selbst geschriebenen Quellenblock', () => {
    const md = mergeDeterministicSources('Inhalt.\n\n## Quellen\n\n- [erfunden](https://fake.example/) — halluziniert', [
      rec('https://real.com/x', 'Echt')
    ])
    expect(md).not.toContain('fake.example')
    expect(md).toContain('https://real.com/x')
    expect(md.match(/## Quellen/g)?.length).toBe(1)
  })

  it('ohne erfolgreiche Fetches keinen Quellenblock', () => {
    expect(mergeDeterministicSources('Nur Text.', [rec('https://x.com/', 'X', 'failed')])).not.toContain('## Quellen')
  })

  it('entschärft eckige Klammern im Titel (Link-Text)', () => {
    const md = mergeDeterministicSources('T', [rec('https://x.com/', 'A [B] C')])
    expect(md).toContain('[A B C](https://x.com/)')
  })

  it('P1: ein manipulierter Titel kann KEINE zusätzliche (anklickbare) Quelle injizieren', () => {
    // Realer Angriff aus dem <title>: Zeilenumbruch + Listen-/Link-/Autolink-Syntax.
    const evil = 'Legitim\n- <https://evil.example/>\n[klick](https://evil2.example/)'
    const md = mergeDeterministicSources('Inhalt.', [rec('https://gut.example/', evil)])
    const quellen = md.slice(md.indexOf('## Quellen'))
    // Genau EIN Listeneintrag (die echte Quelle) — der Zeilenumbruch erzeugt keinen neuen:
    expect(quellen.match(/^- /gm)?.length).toBe(1)
    // Genau EIN Markdown-Link, und dessen href ist die ECHTE Quelle (nicht evil):
    expect(quellen.match(/\]\(https?:\/\//g)?.length).toBe(1)
    expect(quellen).toContain('](https://gut.example/)')
    // Keine Autolink-Syntax und keine Klammer-Link-Syntax auf evil-Ziele:
    expect(quellen).not.toContain('<https://')
    expect(quellen).not.toContain('](https://evil')
  })
})

describe('sanitizeSourceTitle', () => {
  it('reduziert auf eine Zeile und entfernt Markdown-/HTML-Steuerzeichen', () => {
    expect(sanitizeSourceTitle('Zeile1\nZeile2')).toBe('Zeile1 Zeile2')
    expect(sanitizeSourceTitle('a [b] <c> `d` \\e')).toBe('a b c d e')
    expect(sanitizeSourceTitle('  viel   Abstand \t hier  ')).toBe('viel Abstand hier')
  })

  it('leerer/kaputter Titel → leerer String', () => {
    expect(sanitizeSourceTitle('')).toBe('')
    expect(sanitizeSourceTitle('\n\n')).toBe('')
  })
})

describe('hostnameFromUrl', () => {
  it('liefert lowercase-Host ohne v6-Klammern', () => {
    expect(hostnameFromUrl('https://Example.COM/x')).toBe('example.com')
    expect(hostnameFromUrl('http://[::1]/')).toBe('::1')
    expect(hostnameFromUrl('kaputt')).toBeNull()
  })
})
