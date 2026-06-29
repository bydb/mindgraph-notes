import { describe, it, expect } from 'vitest'
import { OFFICIAL_KEYS, keyringFromSpkiMap, buildKeyring } from './keyring'

describe('OFFICIAL_KEYS — offizieller Produktions-Vertrauensanker', () => {
  const keyId = 'mindgraph-release-2026-01'

  it('enthält den offiziellen Release-Key als ladbaren Ed25519-Public-Key', () => {
    expect(OFFICIAL_KEYS[keyId]).toBeDefined()
    const key = keyringFromSpkiMap(OFFICIAL_KEYS).get(keyId)
    expect(key).toBeDefined()
    expect(key?.asymmetricKeyType).toBe('ed25519')
    expect(key?.type).toBe('public')
  })

  it('Prod-Keyring (isPackaged) kennt den offiziellen Key, ignoriert aber Dev-Keys', () => {
    const keyring = buildKeyring({ isPackaged: true, devKeyringPath: undefined })
    expect(keyring.get(keyId)).toBeDefined()
    expect(keyring.get('dev-2026-06-29')).toBeUndefined()
  })
})
