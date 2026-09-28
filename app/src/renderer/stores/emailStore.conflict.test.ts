import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EmailStoreLoadResult, EmailStoreSaveResult } from '../../shared/types'

// Der Fehler, gegen den diese Tests stehen: Zwei Geräte am selben Sync-Vault
// überschrieben sich `emails.json` gegenseitig komplett — wer zuletzt speicherte,
// gewann, und die Mails des anderen waren weg (docs/email-store-multi-device-plan.md).
// Der Renderer muss deshalb auf einer Revision aufbauen, eine Ablehnung aushalten
// UND seinen eigenen Stand dabei behalten.

const emailLoad = vi.fn<(vaultPath: string) => Promise<EmailStoreLoadResult | null>>()
const emailSave = vi.fn<(vaultPath: string, data: unknown, baseRevision?: string | null) => Promise<EmailStoreSaveResult>>()

vi.stubGlobal('window', {
  electronAPI: {
    emailLoad: (v: string) => emailLoad(v),
    emailSave: (v: string, d: unknown, r?: string | null) => emailSave(v, d, r)
  }
})

const { useEmailStore } = await import('./emailStore')

const VAULT = '/vault'

function mail(id: string): Record<string, unknown> {
  return { id, accountId: 'a1', from: { name: '', address: 'x@y.z' }, subject: id, date: '2026-08-30T10:00:00.000Z', bodyText: '', flags: [] }
}

function ladeAntwort(ids: string[], revision: string): EmailStoreLoadResult {
  return { emails: ids.map(mail) as never, lastFetchedAt: {}, revision, retainDays: 30 }
}

beforeEach(() => {
  emailLoad.mockReset()
  emailSave.mockReset()
  useEmailStore.setState({ emails: [], lastFetchedAt: {}, storeRevision: null, storeConflict: null })
})

describe('Revision mitführen', () => {
  it('merkt sich die Revision beim Laden und schickt sie beim Speichern mit', async () => {
    emailLoad.mockResolvedValue(ladeAntwort(['a'], 'rev-1'))
    emailSave.mockResolvedValue({ success: true, revision: 'rev-2' })

    await useEmailStore.getState().loadEmails(VAULT, true)
    expect(useEmailStore.getState().storeRevision).toBe('rev-1')

    await useEmailStore.getState().saveEmails(VAULT)
    expect(emailSave).toHaveBeenCalledWith(VAULT, expect.anything(), 'rev-1')
    expect(useEmailStore.getState().storeRevision).toBe('rev-2')
  })

  it('speichert ohne Basis, solange nie geladen wurde (leerer Erststart)', async () => {
    emailSave.mockResolvedValue({ success: true, revision: 'rev-1' })
    await useEmailStore.getState().saveEmails(VAULT)
    expect(emailSave).toHaveBeenCalledWith(VAULT, expect.anything(), null)
  })
})

describe('eingearbeiteter Fremdstand', () => {
  it('lädt nach, damit die eingearbeiteten Mails auch sichtbar werden', async () => {
    emailLoad.mockResolvedValue(ladeAntwort(['a'], 'rev-1'))
    await useEmailStore.getState().loadEmails(VAULT, true)

    emailSave.mockResolvedValue({ success: true, merged: true, revision: 'rev-2' })
    emailLoad.mockResolvedValue(ladeAntwort(['a', 'vom-anderen-geraet'], 'rev-2'))
    await useEmailStore.getState().saveEmails(VAULT)

    expect(useEmailStore.getState().emails.map(e => e.id)).toEqual(['a', 'vom-anderen-geraet'])
    expect(useEmailStore.getState().storeConflict).toBeNull()
  })

  it('lädt bei einem glatten Schreibvorgang NICHT nach', async () => {
    emailLoad.mockResolvedValue(ladeAntwort(['a'], 'rev-1'))
    await useEmailStore.getState().loadEmails(VAULT, true)
    emailLoad.mockClear()

    emailSave.mockResolvedValue({ success: true, merged: false, revision: 'rev-2' })
    await useEmailStore.getState().saveEmails(VAULT)

    expect(emailLoad).not.toHaveBeenCalled()
    expect(useEmailStore.getState().storeRevision).toBe('rev-2')
  })
})

describe('abgelehntes Speichern (beschädigte Datei)', () => {
  beforeEach(() => {
    emailLoad.mockResolvedValue(ladeAntwort(['a'], 'rev-1'))
    emailSave.mockResolvedValue({ success: false, conflict: true, revision: 'fremd', error: 'geändert' })
  })

  it('behält den eigenen Stand — er wird NICHT still verworfen', async () => {
    await useEmailStore.getState().loadEmails(VAULT, true)
    // Lokale Änderung, die noch nirgends gespeichert ist.
    useEmailStore.setState({ emails: [...useEmailStore.getState().emails, mail('lokal') as never] })

    await useEmailStore.getState().saveEmails(VAULT)

    expect(useEmailStore.getState().emails.map(e => e.id)).toEqual(['a', 'lokal'])
    expect(useEmailStore.getState().storeConflict).not.toBeNull()
  })

  it('lässt die Basisrevision stehen — sie ist weiterhin die Basis des Stands im Speicher', async () => {
    await useEmailStore.getState().loadEmails(VAULT, true)
    await useEmailStore.getState().saveEmails(VAULT)
    expect(useEmailStore.getState().storeRevision).toBe('rev-1')
  })

  it('zählt weitere abgelehnte Versuche, statt den Hinweis zurückzusetzen', async () => {
    await useEmailStore.getState().loadEmails(VAULT, true)
    await useEmailStore.getState().saveEmails(VAULT)
    await useEmailStore.getState().saveEmails(VAULT)
    expect(useEmailStore.getState().storeConflict?.rejectedWrites).toBe(2)
  })
})

describe('offener Konflikt sperrt das stille Nachladen', () => {
  it('überfährt bei laufendem Konflikt nicht den Stand im Speicher', async () => {
    emailLoad.mockResolvedValue(ladeAntwort(['a'], 'rev-1'))
    emailSave.mockResolvedValue({ success: false, conflict: true, revision: 'fremd', error: 'geändert' })

    await useEmailStore.getState().loadEmails(VAULT, true)
    useEmailStore.setState({ emails: [...useEmailStore.getState().emails, mail('lokal') as never] })
    await useEmailStore.getState().saveEmails(VAULT)

    // Der Auto-Abruf ruft loadEmails im Minutentakt. Ohne Sperre wäre 'lokal'
    // hier wortlos weg — genau das stille Verwerfen, das nicht passieren darf.
    emailLoad.mockResolvedValue(ladeAntwort(['a', 'fremd'], 'rev-9'))
    await useEmailStore.getState().loadEmails(VAULT, true)

    expect(useEmailStore.getState().emails.map(e => e.id)).toEqual(['a', 'lokal'])
    expect(useEmailStore.getState().storeConflict).not.toBeNull()
  })

  it('übernimmt den fremden Stand erst auf ausdrücklichen Wunsch', async () => {
    emailLoad.mockResolvedValue(ladeAntwort(['a'], 'rev-1'))
    emailSave.mockResolvedValue({ success: false, conflict: true, revision: 'fremd', error: 'geändert' })

    await useEmailStore.getState().loadEmails(VAULT, true)
    useEmailStore.setState({ emails: [...useEmailStore.getState().emails, mail('lokal') as never] })
    await useEmailStore.getState().saveEmails(VAULT)

    emailLoad.mockResolvedValue(ladeAntwort(['a', 'fremd'], 'rev-9'))
    await useEmailStore.getState().reloadAfterStoreConflict(VAULT)

    expect(useEmailStore.getState().emails.map(e => e.id)).toEqual(['a', 'fremd'])
    expect(useEmailStore.getState().storeRevision).toBe('rev-9')
    expect(useEmailStore.getState().storeConflict).toBeNull()
  })
})

describe('schnelles Abhaken bündelt das Speichern', () => {
  // Real 25.09.2026: rund 20 schnelle Klicks im „Zu beantworten“-Widget, je Klick
  // die ganze Mailliste (38 MB) im Main-Prozess — „heap out of memory“.
  function analysiert(id: string): Record<string, unknown> {
    return { ...mail(id), analysis: { relevanceScore: 80, needsReply: true } }
  }

  it('lässt höchstens einen Vorgang laufen und schreibt die restlichen Klicks in EINEM Folgevorgang', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    emailLoad.mockResolvedValue({ ...ladeAntwort([], 'rev-1'), emails: ids.map(analysiert) as never })
    await useEmailStore.getState().loadEmails(VAULT, true)
    emailLoad.mockClear()

    let freigeben: () => void = () => {}
    let n = 0
    emailSave.mockImplementation(async () => {
      n++
      if (n === 1) await new Promise<void>(r => { freigeben = r })
      return { success: true, merged: false, revision: `rev-${n + 1}` }
    })

    const klicks = ids.map(id => useEmailStore.getState().markReplyHandled(VAULT, id, true))
    await Promise.resolve()
    expect(emailSave).toHaveBeenCalledTimes(1)
    freigeben()
    await Promise.all(klicks)

    expect(emailSave).toHaveBeenCalledTimes(2)
    // Der Folgevorgang baut auf der Revision des ersten auf — kein Scheinkonflikt, kein Nachladen.
    expect(emailSave.mock.calls[1][2]).toBe('rev-2')
    expect(emailLoad).not.toHaveBeenCalled()
    // …und er trägt ALLE Häkchen, auch die, die während des ersten Vorgangs kamen.
    const geschrieben = (emailSave.mock.calls[1][1] as { emails: Array<{ id: string; analysis?: { replyHandled?: boolean } }> }).emails
    expect(geschrieben.filter(e => e.analysis?.replyHandled).map(e => e.id)).toEqual(ids)
  })

  it('speichert nach einem abgeschlossenen Vorgang wieder sofort', async () => {
    emailSave.mockResolvedValue({ success: true, revision: 'rev-2' })
    await useEmailStore.getState().saveEmails(VAULT)
    await useEmailStore.getState().saveEmails(VAULT)
    expect(emailSave).toHaveBeenCalledTimes(2)
  })

  it('ein fehlgeschlagener Vorgang blockiert die nächsten nicht', async () => {
    emailSave.mockRejectedValueOnce(new Error('IPC weg')).mockResolvedValue({ success: true, revision: 'rev-2' })
    await useEmailStore.getState().saveEmails(VAULT)
    await useEmailStore.getState().saveEmails(VAULT)
    expect(emailSave).toHaveBeenCalledTimes(2)
    expect(useEmailStore.getState().storeRevision).toBe('rev-2')
  })
})
