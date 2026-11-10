import { describe, it, expect } from 'vitest'
import { isMicrosoftAccountId, chooseSendTransport } from './emailAccountKind'

const MS = 'ms-0123456789abcdef01234567'
const MS2 = 'ms-fedcba9876543210fedcba98'
const PW = 'email-1794334994978'

describe('isMicrosoftAccountId', () => {
  it('erkennt nur die abgeleitete Form', () => {
    expect(isMicrosoftAccountId(MS)).toBe(true)
    for (const other of [PW, 'ms-kurz', 'MS-0123456789abcdef01234567', 'ms-0123456789ABCDEF01234567', `x${MS}`, `${MS}x`, '', undefined, null, 42, {}]) {
      expect(isMicrosoftAccountId(other)).toBe(false)
    }
  })
})

describe('chooseSendTransport', () => {
  it('Passwort-Konto: SMTP', () => {
    expect(chooseSendTransport(PW, PW)).toBe('smtp')
    expect(chooseSendTransport(PW, undefined)).toBe('smtp')
    expect(chooseSendTransport('email-1', 'email-2')).toBe('smtp') // Altverhalten, hier nicht verschärft
  })

  it('Microsoft-Konto: Graph — mit gleicher oder ohne eingebettete ID', () => {
    expect(chooseSendTransport(MS, MS)).toBe('graph')
    expect(chooseSendTransport(MS, undefined)).toBe('graph')
    expect(chooseSendTransport(MS, null)).toBe('graph')
    expect(chooseSendTransport(MS, '')).toBe('graph')
  })

  it('ein Microsoft-Konto erreicht nie SMTP, egal auf welchem der beiden Wege es hereinkommt', () => {
    for (const [a, b] of [[MS, PW], [PW, MS], [MS, MS2], [undefined, MS], ['', MS], [MS, 'irgendwas'], [MS, 42]] as Array<[unknown, unknown]>) {
      expect(chooseSendTransport(a, b), JSON.stringify([a, b])).toBe('mismatch')
    }
  })
})
