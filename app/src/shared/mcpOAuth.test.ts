import { describe, it, expect } from 'vitest'
import {
  endpointsFromMetadata, sameEndpoints, assertOAuthSpec, protectedResourceMetadataUrls, authorizationServerMetadataUrls,
  loopbackRedirectUri, buildAuthorizeUrl, assertAuthorizeUrl, parseCallback, parseTokenResponse, tokenFresh, McpOAuthError
} from './mcpOAuth'

// Gemessene Metadaten von mcp.plaud.ai (15.11.2026).
const PLAUD_META = {
  issuer: 'https://mcp.plaud.ai/', authorization_endpoint: 'https://mcp.plaud.ai/authorize', token_endpoint: 'https://mcp.plaud.ai/token',
  registration_endpoint: 'https://mcp.plaud.ai/register', code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none']
}
const MCP = 'https://mcp.plaud.ai/mcp'

describe('endpointsFromMetadata — Regel „gleiches Origin“ (E26′)', () => {
  it('nimmt Endpunkte auf dem Origin der MCP-Adresse an', () => {
    const e = endpointsFromMetadata(MCP, PLAUD_META)
    expect(e.tokenEndpoint).toBe('https://mcp.plaud.ai/token')
  })
  it('lehnt eine fremde Anmeldeseite ab (F20)', () => {
    expect(() => endpointsFromMetadata(MCP, { ...PLAUD_META, authorization_endpoint: 'https://login.evil.example/authorize' })).toThrow(/andere Adresse/)
  })
  it('lehnt eine fremde Markenausgabe ab, auch bei passendem Issuer (F21)', () => {
    expect(() => endpointsFromMetadata(MCP, { ...PLAUD_META, token_endpoint: 'https://mcp.plaud.ai.evil.example/token' })).toThrow(McpOAuthError)
  })
  it('lehnt einen fremden Issuer ab', () => {
    expect(() => endpointsFromMetadata(MCP, { ...PLAUD_META, issuer: 'https://app.asana.com' })).toThrow(/andere Adresse/)
  })
  it('lehnt einen anderen Port als anderes Origin ab', () => {
    expect(() => endpointsFromMetadata(MCP, { ...PLAUD_META, token_endpoint: 'https://mcp.plaud.ai:8443/token' })).toThrow(/andere Adresse/)
  })
  it('verlangt Registrierung, PKCE S256 und öffentlichen Client', () => {
    expect(() => endpointsFromMetadata(MCP, { ...PLAUD_META, registration_endpoint: undefined })).toThrow(/Registrierung/)
    expect(() => endpointsFromMetadata(MCP, { ...PLAUD_META, code_challenge_methods_supported: ['plain'] })).toThrow(/PKCE/)
    expect(() => endpointsFromMetadata(MCP, { ...PLAUD_META, token_endpoint_auth_methods_supported: ['client_secret_post'] })).toThrow(/Geheimnis/)
  })
  it('lehnt http und Zugangsdaten in Adressen ab', () => {
    expect(() => endpointsFromMetadata(MCP, { ...PLAUD_META, token_endpoint: 'http://mcp.plaud.ai/token' })).toThrow(/https/)
    expect(() => endpointsFromMetadata(MCP, { ...PLAUD_META, token_endpoint: 'https://a:b@mcp.plaud.ai/token' })).toThrow(/Zugangsdaten/)
  })
})

describe('sameEndpoints / assertOAuthSpec', () => {
  it('vergleicht Issuer ohne Schrägstrich am Ende', () => {
    const a = endpointsFromMetadata(MCP, PLAUD_META)
    expect(sameEndpoints(a, { ...a, issuer: 'https://mcp.plaud.ai' })).toBe(true)
    expect(sameEndpoints(a, { ...a, tokenEndpoint: 'https://mcp.plaud.ai/token2' })).toBe(false)
  })
  it('prüft eine gespeicherte Spezifikation gegen die Adresse', () => {
    const endpoints = endpointsFromMetadata(MCP, PLAUD_META)
    expect(() => assertOAuthSpec(MCP, { endpoints, resource: MCP, scopes: [] })).not.toThrow()
    expect(() => assertOAuthSpec('https://mcp.notion.com/mcp', { endpoints, resource: 'https://mcp.notion.com/mcp', scopes: [] })).toThrow(/liegt nicht/)
    expect(() => assertOAuthSpec(MCP, { endpoints, resource: 'https://mcp.plaud.ai/other', scopes: [] })).toThrow(/resource/)
    expect(() => assertOAuthSpec(MCP, { endpoints, resource: MCP, scopes: ['a b'] })).toThrow(/scope/)
  })
})

describe('Metadaten-Adressen', () => {
  it('Schutz-Metadaten erst mit Pfad, dann am Origin', () => {
    expect(protectedResourceMetadataUrls('https://mcp.notion.com/mcp')).toEqual([
      'https://mcp.notion.com/.well-known/oauth-protected-resource/mcp', 'https://mcp.notion.com/.well-known/oauth-protected-resource'
    ])
    expect(protectedResourceMetadataUrls('https://mcp.hubspot.com/')).toEqual(['https://mcp.hubspot.com/.well-known/oauth-protected-resource'])
  })
  it('Anmeldeserver-Metadaten nach RFC 8414', () => {
    expect(authorizationServerMetadataUrls('https://mcp.plaud.ai/')).toEqual(['https://mcp.plaud.ai/.well-known/oauth-authorization-server'])
    expect(authorizationServerMetadataUrls('https://github.com/login/oauth')[0]).toBe('https://github.com/.well-known/oauth-authorization-server/login/oauth')
  })
})

describe('Anmeldeadresse', () => {
  const endpoints = endpointsFromMetadata(MCP, PLAUD_META)
  const redirectUri = loopbackRedirectUri(53682)
  const url = buildAuthorizeUrl(endpoints, { clientId: 'c1', redirectUri, state: 's', codeChallenge: 'x', resource: MCP, scopes: [] })
  it('wird nur geöffnet, wenn sie genau passt', () => {
    expect(() => assertAuthorizeUrl(url, endpoints, 'c1', redirectUri)).not.toThrow()
    expect(new URL(url).searchParams.get('resource')).toBe(MCP)
    expect(new URL(url).searchParams.has('scope')).toBe(false)
  })
  it('lehnt anderen Client, anderen Rückruf, anderes Ziel oder fehlendes S256 ab', () => {
    expect(() => assertAuthorizeUrl(url, endpoints, 'c2', redirectUri)).toThrow()
    expect(() => assertAuthorizeUrl(url, endpoints, 'c1', loopbackRedirectUri(53683))).toThrow()
    expect(() => assertAuthorizeUrl(url.replace('mcp.plaud.ai', 'evil.example'), endpoints, 'c1', redirectUri)).toThrow()
    expect(() => assertAuthorizeUrl(url.replace('code_challenge_method=S256', 'code_challenge_method=plain'), endpoints, 'c1', redirectUri)).toThrow()
    const localhost = buildAuthorizeUrl(endpoints, { clientId: 'c1', redirectUri: 'http://localhost:53682/callback', state: 's', codeChallenge: 'x', resource: MCP, scopes: [] })
    expect(() => assertAuthorizeUrl(localhost, endpoints, 'c1', 'http://localhost:53682/callback')).toThrow()
  })
  it('Rückruf-Port im sinnvollen Bereich', () => {
    expect(() => loopbackRedirectUri(80)).toThrow()
  })
})

describe('parseCallback', () => {
  it('liefert den Code bei passendem state', () => {
    expect(parseCallback('/callback?code=abc&state=s1', 's1')).toBe('abc')
  })
  it('lehnt falschen state, Fehler des Dienstes und fremde Pfade ab', () => {
    expect(() => parseCallback('/callback?code=abc&state=x', 's1')).toThrow(/gehört nicht/)
    expect(() => parseCallback('/callback?error=access_denied&state=s1', 's1')).toThrow(/abgelehnt/)
    expect(() => parseCallback('/favicon.ico', 's1')).toThrow(/Unbekannter/)
    expect(() => parseCallback('/callback?state=s1', 's1')).toThrow(/keinen Anmeldecode/)
  })
})

describe('parseTokenResponse / tokenFresh', () => {
  it('liest Marke, Ablauf und Erneuerung', () => {
    const t = parseTokenResponse({ access_token: 'a', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' }, 1000)
    expect(t).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 1000 + 3_600_000 })
    expect(tokenFresh(t, 1000)).toBe(true)
    expect(tokenFresh(t, 1000 + 3_600_000 - 30_000)).toBe(false)
  })
  it('behält die alte Erneuerungsmarke, wenn keine neue kommt', () => {
    expect(parseTokenResponse({ access_token: 'a' }, 0, 'old').refreshToken).toBe('old')
  })
  it('invalid_grant heißt neu anmelden; fremde Markentypen werden abgelehnt', () => {
    expect(() => parseTokenResponse({ error: 'invalid_grant' }, 0)).toThrow(/neu anmelden/)
    expect(() => parseTokenResponse({ access_token: 'a', token_type: 'mac' }, 0)).toThrow(/Markentyp/)
    expect(() => parseTokenResponse({}, 0)).toThrow(/keine Marke/)
  })
})
