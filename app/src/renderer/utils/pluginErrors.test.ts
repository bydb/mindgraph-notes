import { describe, it, expect } from 'vitest'
import { pluginErrorKey, pluginErrorText } from './pluginErrors'

describe('pluginErrorKey', () => {
  it('mappt bekannte Codes auf Übersetzungs-Keys', () => {
    expect(pluginErrorKey('sig-mismatch')).toBe('plugins.error.signature')
    expect(pluginErrorKey('sig-unknown-key')).toBe('plugins.error.signatureKey')
    expect(pluginErrorKey('incompatible-app')).toBe('plugins.error.incompatibleApp')
    expect(pluginErrorKey('redirect-blocked')).toBe('plugins.error.redirect')
    expect(pluginErrorKey('rate-limited')).toBe('plugins.error.rateLimited')
  })
  it('liefert undefined für unbekannte/leere Codes', () => {
    expect(pluginErrorKey('nope')).toBeUndefined()
    expect(pluginErrorKey(undefined)).toBeUndefined()
    expect(pluginErrorKey(null)).toBeUndefined()
    expect(pluginErrorKey('')).toBeUndefined()
  })
})

describe('pluginErrorText', () => {
  const t = (k: string) => `T:${k}`
  it('bekannter Code → Übersetzung', () => {
    expect(pluginErrorText(t, 'sig-mismatch')).toBe('T:plugins.error.signature')
  })
  it('unbekannter Code → rohe Fallback-Message', () => {
    expect(pluginErrorText(t, 'nope', 'Roher Fehler')).toBe('Roher Fehler')
    expect(pluginErrorText(t, undefined, 'Netzwerk weg')).toBe('Netzwerk weg')
  })
  it('kein Code, kein/leerer Fallback → unbekannt-Key', () => {
    expect(pluginErrorText(t, undefined)).toBe('T:plugins.error.unknown')
    expect(pluginErrorText(t, null, '   ')).toBe('T:plugins.error.unknown')
  })
})
