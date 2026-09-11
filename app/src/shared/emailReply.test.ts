import { describe, it, expect } from 'vitest'
import { collectOwnAddresses, collectReplyAllRecipients, resolveReplyAccountId, resolveReplyTarget } from './emailReply'

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

describe('resolveReplyAccountId', () => {
  const accounts = [{ id: 'a' }, { id: 'b' }]

  it('nimmt das Konto, auf dem die Mail ankam — nicht das erste', () => {
    expect(resolveReplyAccountId({ accountId: 'b' }, accounts)).toBe('b')
  })

  it('fällt auf das erste Konto zurück, wenn das Ursprungskonto gelöscht wurde', () => {
    expect(resolveReplyAccountId({ accountId: 'weg' }, accounts)).toBe('a')
    expect(resolveReplyAccountId({}, accounts)).toBe('a')
  })

  it('ohne Konten: leer', () => {
    expect(resolveReplyAccountId({ accountId: 'a' }, [])).toBe('')
  })
})

describe('resolveReplyTarget', () => {
  const list = { name: 'Formular', address: 'noreply@example.org' }
  const person = { name: 'Person', address: 'person@example.org' }

  it('ohne Reply-To: Absender, keine Umleitung', () => {
    expect(resolveReplyTarget({ from: alice })).toEqual({ to: [alice] })
    expect(resolveReplyTarget({ from: alice, replyTo: [] })).toEqual({ to: [alice] })
  })

  it('Reply-To vor From, Umleitung wird gemeldet', () => {
    const r = resolveReplyTarget({ from: list, replyTo: [person] })
    expect(r.to).toEqual([person])
    expect(r.redirect).toEqual({ replyTo: 'person@example.org', from: 'noreply@example.org' })
  })

  it('Reply-To gleich From (nur andere Schreibweise): keine Umleitung', () => {
    const r = resolveReplyTarget({ from: alice, replyTo: [{ name: '', address: 'ALICE@example.org ' }] })
    expect(r).toEqual({ to: [alice] })
  })

  it('Reply-To ohne Adresse zählt nicht', () => {
    expect(resolveReplyTarget({ from: alice, replyTo: [{ name: 'leer', address: '' }] })).toEqual({ to: [alice] })
  })

  it('mehrere Reply-To-Adressen bleiben alle erhalten', () => {
    const r = resolveReplyTarget({ from: list, replyTo: [person, bob] })
    expect(r.to).toEqual([person, bob])
    expect(r.redirect?.replyTo).toBe('person@example.org, bob@example.org')
  })
})

describe('collectReplyAllRecipients mit Reply-To', () => {
  const own = new Set(['ich@example.org'])
  const list = { name: 'Formular', address: 'noreply@example.org' }

  it('An = Reply-To statt Absender, übrige An-Empfänger bleiben', () => {
    const { to, cc } = collectReplyAllRecipients({ from: list, replyTo: [alice], to: [me, bob], cc: [carol] }, own)
    expect(to.map(r => r.address)).toEqual(['alice@example.org', 'bob@example.org'])
    expect(cc.map(r => r.address)).toEqual(['carol@example.org'])
  })

  it('Reply-To auf mich selbst: fällt auf das Antwortziel zurück, nicht leer', () => {
    const { to } = collectReplyAllRecipients({ from: list, replyTo: [me], to: [] }, own)
    expect(to).toEqual([me])
  })
})
