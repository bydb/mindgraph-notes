import { describe, it, expect } from 'vitest'
import { MCP_CATALOG, catalogEntry, matchCatalogEntry, parseForeignMcpConfig } from './mcpCatalog'
import { endpointsFromMetadata, assertOAuthSpec } from './mcpOAuth'
import { isValidServerId, serverIdFromLabel } from './mcp'

describe('Katalog', () => {
  it('jeder OAuth-Eintrag erfüllt die Regel „gleiches Origin“', () => {
    for (const e of MCP_CATALOG.filter(x => x.kind === 'oauth')) {
      expect(() => assertOAuthSpec(e.url!, { endpoints: e.oauth!.endpoints, resource: new URL(e.url!).toString(), scopes: e.oauth!.scopes })).not.toThrow()
      expect(() => endpointsFromMetadata(e.url!, {
        issuer: e.oauth!.endpoints.issuer, authorization_endpoint: e.oauth!.endpoints.authorizationEndpoint,
        token_endpoint: e.oauth!.endpoints.tokenEndpoint, registration_endpoint: e.oauth!.endpoints.registrationEndpoint,
        code_challenge_methods_supported: ['S256']
      })).not.toThrow()
    }
  })
  it('IDs sind eindeutig und ergeben gültige Server-Kennungen', () => {
    expect(new Set(MCP_CATALOG.map(e => e.id)).size).toBe(MCP_CATALOG.length)
    for (const e of MCP_CATALOG) expect(isValidServerId(serverIdFromLabel(e.name))).toBe(true)
  })
  it('Plaud ist als Personendaten markiert', () => {
    expect(catalogEntry('plaud')?.personalData).toBe(true)
    expect(catalogEntry('nope')).toBeUndefined()
    expect(catalogEntry(42)).toBeUndefined()
  })
})

describe('Übernahme aus anderen Programmen (E32′)', () => {
  it('erkennt Plaud am Paketnamen, auch mit Version', () => {
    expect(matchCatalogEntry({ command: 'npx', args: ['-y', '@plaud-ai/mcp@latest'] })).toBe('plaud')
  })
  it('erkennt Netz-Dienste am Host, auch über mcp-remote', () => {
    expect(matchCatalogEntry({ command: 'npx', args: ['mcp-remote', 'https://mcp.notion.com/mcp'] })).toBe('notion')
    expect(matchCatalogEntry({ type: 'http', url: 'https://mcp.linear.app/sse' })).toBe('linear')
  })
  it('erkennt keine ähnlich klingenden Hosts oder http', () => {
    expect(matchCatalogEntry({ url: 'https://mcp.notion.com.evil.example/mcp' })).toBeNull()
    expect(matchCatalogEntry({ url: 'http://mcp.notion.com/mcp' })).toBeNull()
    expect(matchCatalogEntry({ command: '/usr/bin/plaud' })).toBeNull()
  })
  it('liefert nur Katalog-IDs und Namen, nie Befehle oder Geheimnisse (F30)', () => {
    const r = parseForeignMcpConfig(JSON.stringify({
      mcpServers: {
        plaud: { command: 'npx', args: ['-y', '@plaud-ai/mcp'], env: { PLAUD_TOKEN: 'geheim' } },
        notion: { command: 'npx', args: ['mcp-remote', 'https://mcp.notion.com/mcp'] },
        notion2: { url: 'https://mcp.notion.com/mcp' },
        eigenes: { command: '/opt/x/server' }
      }
    }))
    expect(r).toEqual({ found: ['plaud', 'notion'], unmatched: ['eigenes'] })
    expect(JSON.stringify(r)).not.toContain('geheim')
  })
  it('liest auch das VS-Code-Format und meldet kaputte Dateien', () => {
    expect(parseForeignMcpConfig(JSON.stringify({ servers: { a: { url: 'https://mcp.atlassian.com/v1/sse' } } })).found).toEqual(['atlassian'])
    expect(() => parseForeignMcpConfig('{')).toThrow(/JSON/)
    expect(() => parseForeignMcpConfig('{}')).toThrow(/keine MCP-Server/)
  })
})
