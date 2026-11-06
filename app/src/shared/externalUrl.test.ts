import { describe, expect, it } from 'vitest'
import { isOpenableExternalUrl } from './externalUrl'

describe('isOpenableExternalUrl', () => {
  it('lässt http(s) und mailto zu', () => {
    expect(isOpenableExternalUrl('https://bdkparfums.com/en/pages/stores')).toBe(true)
    expect(isOpenableExternalUrl('http://example.com')).toBe(true)
    expect(isOpenableExternalUrl('HTTPS://Example.com/x?y=1#z')).toBe(true)
    expect(isOpenableExternalUrl('mailto:info@example.com')).toBe(true)
  })

  it('sperrt andere Schemata, Unzerlegbares, Leerraum und Nicht-Text', () => {
    for (const u of ['file:///etc/passwd', 'javascript:alert(1)', 'mindgraph-preview://vault/x', 'smb://server/share', 'https://', 'nur text', 'https://a.de/ x', 'https://a.de/\nx', '']) {
      expect(isOpenableExternalUrl(u), u).toBe(false)
    }
    expect(isOpenableExternalUrl(undefined)).toBe(false)
    expect(isOpenableExternalUrl({ toString: () => 'https://a.de' })).toBe(false)
  })

  it('sperrt übergroße Adressen', () => {
    expect(isOpenableExternalUrl('https://a.de/' + 'x'.repeat(9000))).toBe(false)
  })
})
