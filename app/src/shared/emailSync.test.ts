import { describe, it, expect } from 'vitest'
import { diffKnownMessages } from './emailSync'

const scope = { accountId: 'a', folder: 'INBOX', sinceIso: '2026-09-01T00:00:00.000Z' }
const inWindow = '2026-09-05T10:00:00.000Z'

describe('diffKnownMessages', () => {
  it('nichts geändert → keine Updates', () => {
    const known = [{ id: 'm1', accountId: 'a', folder: 'INBOX', uid: 5, flags: ['\\Seen'], date: inWindow }]
    expect(diffKnownMessages(known, [{ messageId: 'm1', uid: 5, flags: ['\\Seen'] }], scope)).toEqual([])
  })

  it('extern gelesen: Flags werden übernommen', () => {
    const known = [{ id: 'm1', accountId: 'a', folder: 'INBOX', uid: 5, flags: [], date: inWindow }]
    expect(diffKnownMessages(known, [{ messageId: 'm1', uid: 5, flags: ['\\Seen'] }], scope))
      .toEqual([{ id: 'm1', flags: ['\\Seen'] }])
  })

  it('Flag-Reihenfolge ist egal', () => {
    const known = [{ id: 'm1', accountId: 'a', folder: 'INBOX', uid: 5, flags: ['\\Flagged', '\\Seen'], date: inWindow }]
    expect(diffKnownMessages(known, [{ messageId: 'm1', uid: 5, flags: ['\\Seen', '\\Flagged'] }], scope)).toEqual([])
  })

  it('extern verschoben: Ordner und UID werden nachgezogen', () => {
    const known = [{ id: 'm1', accountId: 'a', folder: 'INBOX', uid: 5, flags: ['\\Seen'], date: inWindow }]
    const archive = { ...scope, folder: 'Archiv' }
    expect(diffKnownMessages(known, [{ messageId: 'm1', uid: 77, flags: ['\\Seen'] }], archive))
      .toEqual([{ id: 'm1', folder: 'Archiv', uid: 77 }])
  })

  it('UID wird auch im selben Ordner korrigiert (alte Gesendet-Kopie mit uid 0)', () => {
    const known = [{ id: 'm1', accountId: 'a', folder: 'INBOX', uid: 0, flags: ['\\Seen'], date: inWindow, sent: true }]
    expect(diffKnownMessages(known, [{ messageId: 'm1', uid: 42, flags: ['\\Seen'] }], scope))
      .toEqual([{ id: 'm1', uid: 42 }])
  })

  it('Kandidat aus einem fremden Konto verändert den Datensatz nicht', () => {
    const known = [{ id: 'm1', accountId: 'a', folder: 'INBOX', uid: 5, flags: [], date: inWindow }]
    const foreign = { accountId: 'b', folder: 'Archive', sinceIso: scope.sinceIso }
    expect(diffKnownMessages(known, [{ messageId: 'm1', uid: 88, flags: ['\\Seen'] }], foreign)).toEqual([])
  })

  it('Reply-To wird bei bereits importierten Mails nachgetragen, vorhandenes bleibt', () => {
    const known = [
      { id: 'm1', accountId: 'a', folder: 'INBOX', uid: 5, flags: [], date: inWindow },
      { id: 'm2', accountId: 'a', folder: 'INBOX', uid: 6, flags: [], date: inWindow, replyTo: [{ name: '', address: 'alt@example.org' }] }
    ]
    const candidates = [
      { messageId: 'm1', uid: 5, flags: [], replyTo: [{ name: 'Formular', address: 'form@example.org' }] },
      { messageId: 'm2', uid: 6, flags: [], replyTo: [{ name: '', address: 'neu@example.org' }] }
    ]
    expect(diffKnownMessages(known, candidates, scope))
      .toEqual([{ id: 'm1', replyTo: [{ name: 'Formular', address: 'form@example.org' }] }])
  })

  it('extern gelöscht: Mail im Fenster fehlt → nur markieren, nicht löschen', () => {
    const known = [
      { id: 'm1', accountId: 'a', folder: 'INBOX', flags: [], date: inWindow },
      { id: 'm2', accountId: 'a', folder: 'INBOX', uid: 6, flags: [], date: inWindow }
    ]
    expect(diffKnownMessages(known, [{ messageId: 'm2', uid: 6, flags: [] }], scope))
      .toEqual([{ id: 'm1', missingOnServer: true }])
  })

  it('Mails außerhalb des Fensters, anderer Konten oder Ordner gelten nie als verschwunden', () => {
    const known = [
      { id: 'alt', accountId: 'a', folder: 'INBOX', date: '2026-08-01T00:00:00.000Z' },
      { id: 'fremd', accountId: 'b', folder: 'INBOX', date: inWindow },
      { id: 'woanders', accountId: 'a', folder: 'Archiv', date: inWindow },
      { id: 'ohneDatum', accountId: 'a', folder: 'INBOX' }
    ]
    expect(diffKnownMessages(known, [], scope)).toEqual([])
  })

  it('bereits als verschwunden markiert: keine zweite Markierung', () => {
    const known = [{ id: 'm1', accountId: 'a', folder: 'INBOX', date: inWindow, missingOnServer: true }]
    expect(diffKnownMessages(known, [], scope)).toEqual([])
  })

  it('wieder aufgetaucht: Markierung wird zurückgenommen', () => {
    const known = [{ id: 'm1', accountId: 'a', folder: 'INBOX', uid: 5, flags: ['\\Seen'], date: inWindow, missingOnServer: true }]
    expect(diffKnownMessages(known, [{ messageId: 'm1', uid: 5, flags: ['\\Seen'] }], scope))
      .toEqual([{ id: 'm1', missingOnServer: false }])
  })

  it('Legacy-Mail ohne folder-Feld zählt als INBOX', () => {
    const known = [{ id: 'm1', accountId: 'a', uid: 5, flags: [], date: inWindow }]
    expect(diffKnownMessages(known, [{ messageId: 'm1', uid: 5, flags: [] }], scope)).toEqual([])
    expect(diffKnownMessages(known, [], scope)).toEqual([{ id: 'm1', missingOnServer: true }])
  })
})
