import { describe, it, expect } from 'vitest'
import { collectOwnAddresses, collectReplyAllRecipients } from './emailReply'

const me = { name: 'Ich', address: 'ich@example.org' }
const alice = { name: 'Alice', address: 'alice@example.org' }
const bob = { name: 'Bob', address: 'bob@example.org' }
const carol = { name: '', address: 'carol@example.org' }

describe('collectOwnAddresses', () => {
  it('sammelt user- und fromAddress aller Accounts lowercase', () => {
    const own = collectOwnAddresses([
      { user: 'Ich@Example.org', fromAddress: 'alias@example.org' },
      { user: 'zweit@example.org' }
    ])
    expect(own).toEqual(new Set(['ich@example.org', 'alias@example.org', 'zweit@example.org']))
  })

  it('ignoriert user ohne @ (reiner IMAP-Username)', () => {
    const own = collectOwnAddresses([{ user: 'jleeder', fromAddress: 'ich@example.org' }])
    expect(own).toEqual(new Set(['ich@example.org']))
  })
})

describe('collectReplyAllRecipients', () => {
  const own = new Set(['ich@example.org'])

  it('An = Absender + übrige An-Empfänger ohne mich, CC bleibt CC', () => {
    const { to, cc } = collectReplyAllRecipients(
      { from: alice, to: [me, bob], cc: [carol] },
      own
    )
    expect(to.map(r => r.address)).toEqual(['alice@example.org', 'bob@example.org'])
    expect(cc.map(r => r.address)).toEqual(['carol@example.org'])
  })

  it('dedupliziert über An und CC hinweg (case-insensitiv)', () => {
    const { to, cc } = collectReplyAllRecipients(
      { from: alice, to: [{ name: '', address: 'ALICE@example.org' }, bob], cc: [bob, carol] },
      own
    )
    expect(to.map(r => r.address)).toEqual(['alice@example.org', 'bob@example.org'])
    expect(cc.map(r => r.address)).toEqual(['carol@example.org'])
  })

  it('normale 1:1-Mail: nur der Absender bleibt übrig', () => {
    const { to, cc } = collectReplyAllRecipients({ from: alice, to: [me] }, own)
    expect(to).toEqual([alice])
    expect(cc).toEqual([])
  })

  it('Antwort auf eigene Mail: fällt auf den Absender zurück statt leer zu sein', () => {
    const { to, cc } = collectReplyAllRecipients(
      { from: { name: '', address: 'ich@example.org' }, to: [] },
      own
    )
    expect(to).toEqual([{ name: '', address: 'ich@example.org' }])
    expect(cc).toEqual([])
  })

  it('fehlendes cc-Feld (Legacy-Mails) wird wie leer behandelt', () => {
    const { cc } = collectReplyAllRecipients({ from: alice, to: [me, bob] }, own)
    expect(cc).toEqual([])
  })
})
