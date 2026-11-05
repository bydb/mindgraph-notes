import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// Petrol-Chat im Renderer: Anzeige-Spiegel des Gesprächs im Main (Teil 1, Rev. 4/8/9,
// docs/codex-collab/chat-verlauf-notizen-bilder.md). Was ans Modell geht — Verlauf, Themen,
// feste App-Antwort, Verlaufsbilder, Bruchstück beim Stopp — prüft
// main/petrolChats/conversation.test.ts. Hier: was der Renderer schickt und wie er die Antwort
// des Mains übernimmt.

type ConvResult = { ok: true; messages: unknown[]; storage: string } | { ok: false; error: string }

let chunkCb: ((c: { requestId: string; delta: string }) => void) | null = null
let convClosedCb: ((e: { id: string }) => void) | null = null
const CONV = 'c'.repeat(32)
const petrolConvOpen = vi.fn(async (_vault: string | null, _id: string | null) => ({ ok: true, id: CONV, messages: [], storage: 'on' }))
const petrolConvSend = vi.fn((..._a: unknown[]) => new Promise<ConvResult>(() => { /* läuft, bis gestoppt */ }))
const petrolConvStop = vi.fn(async (..._a: unknown[]): Promise<ConvResult> => ({ ok: true, messages: [], storage: 'saved' }))
const petrolConvClose = vi.fn(async (_id: string) => true)
const petrolChatSnapshotsAlive = vi.fn(async (_scope: string, ids: string[]) => ids)
const ollamaChat = vi.fn()
const petrolChatWeb = vi.fn()

vi.stubGlobal('window', {
  electronAPI: {
    petrolConvOpen: (v: string | null, id: string | null) => petrolConvOpen(v, id),
    petrolConvSend: (...a: unknown[]) => petrolConvSend(...a),
    petrolConvStop: (...a: unknown[]) => petrolConvStop(...a),
    petrolConvClose: (id: string) => petrolConvClose(id),
    petrolChatSnapshotsAlive: (scope: string, ids: string[]) => petrolChatSnapshotsAlive(scope, ids),
    ollamaChat,
    lmstudioChat: ollamaChat,
    petrolChatWeb,
    petrolChatAbort: async () => {},
    onPetrolChatChunk: (cb: typeof chunkCb) => { chunkCb = cb; return () => {} },
    onPetrolChatProgress: () => () => {},
    onPetrolConvClosed: (cb: typeof convClosedCb) => { convClosedCb = cb }
  },
  addEventListener: () => {},
  removeEventListener: () => {}
})
vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} })

const { usePetrolChatStore, withLocalImageBytes } = await import('./petrolChatStore')
type Msg = ReturnType<typeof usePetrolChatStore.getState>['scopes'][string]['messages'][number]

const ID = 'tab-1'
const VAULT = '/vault/a'
const RUN = { label: 'qwen', routeText: 'lokal', routeKind: 'local' as const, routeKey: 'ollama|qwen' }
const OPTS = { model: 'qwen', backend: 'ollama' as const, cloud: null, run: RUN, vaultPath: VAULT }
const img = (id: string) => ({ v: 1 as const, id, name: `${id}.jpg`, mime: 'image/jpeg' as const, width: 10, height: 10, byteLength: 3, dataBase64: `B64${id}` })

const state = () => usePetrolChatStore.getState()
const scope = () => state().scope(ID)
const last = (): Msg => { const m = scope().messages; return m[m.length - 1] }
const sendArg = (k = 0) => petrolConvSend.mock.calls[k] as unknown as [string | null, string, Record<string, unknown>]
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

beforeEach(() => {
  if (state().activeScope) state().stop(ID)
  state().dispose(ID)
  for (const f of [petrolConvOpen, petrolConvSend, petrolConvStop, petrolConvClose, petrolChatSnapshotsAlive, ollamaChat, petrolChatWeb]) f.mockClear()
  petrolConvSend.mockImplementation(() => new Promise(() => {}))
})

describe('Gespräch im Main', () => {
  it('legt beim ersten Senden ein Gespräch an und schickt nur Frage, Weg und Kind — keinen Verlauf', async () => {
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'Hallo', at: 1 }, { role: 'assistant', content: 'Hi', model: 'qwen', at: 2 }], storage: 'saved' }))
    await state().send(ID, 'Hallo', OPTS)
    expect(petrolConvOpen).toHaveBeenCalledWith(VAULT, null)
    const [vault, id, req] = sendArg()
    expect(vault).toBe(VAULT)
    expect(id).toBe(CONV)
    expect(req).toMatchObject({ question: 'Hallo', kind: 'chat', model: 'qwen', backend: 'ollama', cloud: null })
    // Herkunft an der Antwort bildet der Main (F80).
    expect(req).not.toHaveProperty('runLabel')
    expect(req).not.toHaveProperty('history')
    expect(req).not.toHaveProperty('webTopics')
    expect(ollamaChat).not.toHaveBeenCalled()
    expect(scope().messages.map(m => m.content)).toEqual(['Hallo', 'Hi'])
    expect(scope().storage).toBe('on')
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [], storage: 'saved' }))
    await state().send(ID, 'Noch was', OPTS)
    expect(petrolConvOpen).toHaveBeenCalledTimes(1)
  })

  it('Nachfrage schickt nur die Kennung, keine Suchwörter', async () => {
    void state().send(ID, 'Was gilt für Medienzentren?', { ...OPTS, followUp: { snapshotId: 'a'.repeat(32) } })
    await flush()
    expect(sendArg()[2]).toMatchObject({ kind: 'follow-up', followUpSnapshotId: 'a'.repeat(32) })
    expect(sendArg()[2]).not.toHaveProperty('web')
    expect(last()).toMatchObject({ role: 'user', followUp: true })
  })

  it('Fehler des Mains (Frage abgelehnt) steht sichtbar an der Frage', async () => {
    petrolConvSend.mockImplementationOnce(async () => ({ ok: false, error: 'Gehört zu einem anderen Vault.' }))
    await state().send(ID, 'Hallo', OPTS)
    expect(last()).toMatchObject({ role: 'assistant', error: true, content: 'Gehört zu einem anderen Vault.' })
    expect(state().activeScope).toBeNull()
  })

  it('Vault gewechselt: Gespräch geschlossen, leer neu', async () => {
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'a', at: 1 }, { role: 'assistant', content: 'b', at: 2 }], storage: 'saved' }))
    await state().send(ID, 'a', OPTS)
    state().vaultChanged(ID, VAULT)
    expect(petrolConvClose).not.toHaveBeenCalled()
    state().vaultChanged(ID, '/vault/b')
    expect(petrolConvClose).toHaveBeenCalledWith(CONV)
    expect(scope().messages).toEqual([])
    expect(scope().conv).toBeNull()
  })

  it('Neues Gespräch und Tab zu schließen das Gespräch im Main', async () => {
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [], storage: 'saved' }))
    await state().send(ID, 'a', OPTS)
    state().clear(ID)
    expect(petrolConvClose).toHaveBeenCalledWith(CONV)
    expect(scope().conv).toBeNull()
  })
})

describe('Stopp', () => {
  it('zeigt das Bruchstück sofort und übernimmt danach den Abschluss des Mains (F67)', async () => {
    petrolConvStop.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'Frag', at: 1 }, { role: 'assistant', content: 'Erste Frage: ', stopped: true, webTopicsUsed: 1, at: 2 }], storage: 'saved' }))
    void state().send(ID, 'Frag', OPTS)
    await flush()
    const req = sendArg()[2].requestId as string
    chunkCb?.({ requestId: req, delta: 'Erste Frage: ' })
    state().stop(ID)
    expect(last()).toMatchObject({ role: 'assistant', stopped: true, content: 'Erste Frage: ' })
    expect(petrolConvStop).toHaveBeenCalledWith(VAULT, CONV)
    await flush()
    expect(last()).toMatchObject({ webTopicsUsed: 1 })
    // Stücke nach dem Stopp landen nicht in einer neuen Antwort.
    chunkCb?.({ requestId: req, delta: 'zu spät' })
    expect(scope().streaming).toBeNull()
  })
})

describe('Globus und vorgemerkte Nachfrage (28.10.2026)', () => {
  const webAnswer = (snap?: string) => ({ role: 'assistant', content: 'Physiker [1].', origin: 'web', at: 2, web: { kind: 'answer', answer: 'Physiker [1].', ...(snap ? { snapshotId: snap } : {}), sources: [], failures: [], notFetched: 0 } })

  it('nach einer Webantwort bleibt der Globus an und die Antwort ist als Nachfrage vorgemerkt', async () => {
    state().setWeb(ID, { webArmed: true })
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'Wer?', origin: 'web', at: 1 }, webAnswer('9'.repeat(32))], storage: 'saved' }))
    await state().send(ID, 'Wer war Rutherford?', { ...OPTS, web: { query: 'Rutherford' } })
    expect(sendArg()[2]).toMatchObject({ kind: 'web', web: { query: 'Rutherford' } })
    expect(scope().webArmed).toBe(true)
    expect(scope().followUp).toEqual({ snapshotId: '9'.repeat(32) })
  })

  it('eine fehlgeschlagene Webantwort merkt keine Nachfrage vor', async () => {
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'Wer?', origin: 'web', at: 1 }, { role: 'assistant', content: 'kaputt', error: true, origin: 'web', at: 2 }], storage: 'saved' }))
    await state().send(ID, 'Wer war Bohr?', { ...OPTS, web: { query: 'Bohr' } })
    expect(scope().followUp).toBeNull()
  })

  it('Neues Gespräch startet mit dem gemerkten Globus (Codex F06)', async () => {
    const { useUIStore } = await import('./uiStore')
    useUIStore.setState({ petrolWebSticky: true })
    state().clear(ID)
    expect(scope().webArmed).toBe(true)
    useUIStore.setState({ petrolWebSticky: false })
    state().clear(ID)
    expect(scope().webArmed).toBe(false)
  })
})

describe('verfallene Seiten (Codex F02/F03, F21)', () => {
  const answerWith = (snap: string, at: number): Msg => ({
    role: 'assistant', content: 'Physiker [1].', origin: 'web', model: 'qwen', at,
    web: { kind: 'answer', answer: 'Physiker [1].', snapshotId: snap, sources: [], report: { usedSources: [1], sentences: [] } } as unknown as Msg['web']
  })
  const seed = (messages: Msg[]) => usePetrolChatStore.setState(s => ({ scopes: { ...s.scopes, [ID]: { ...s.scope(ID), messages, conv: { id: CONV, vault: VAULT }, goneSnapshots: [] } } }))

  it('fragt mit der Gesprächs-ID, merkt Verfallenes und hebt eine darauf gesetzte Nachfrage auf', async () => {
    seed([{ role: 'user', content: 'q', origin: 'web', at: 1 }, answerWith('a'.repeat(32), 2), { role: 'user', content: 'Und?', origin: 'web', followUp: true, followUpSnapshotId: 'b'.repeat(32), at: 3 }])
    state().setFollowUp(ID, 'a'.repeat(32))
    petrolChatSnapshotsAlive.mockImplementationOnce(async () => [])
    await state().checkSnapshots(ID)
    expect(petrolChatSnapshotsAlive.mock.calls[0][0]).toBe(CONV)
    expect(scope().goneSnapshots.sort()).toEqual(['a'.repeat(32), 'b'.repeat(32)])
    expect(scope().followUp).toBeNull()
  })

  it('ohne Gespräch im Main wird nichts geprüft', async () => {
    usePetrolChatStore.setState(s => ({ scopes: { ...s.scopes, [ID]: { ...s.scope(ID), messages: [answerWith('a'.repeat(32), 2)], conv: null } } }))
    await state().checkSnapshots(ID)
    expect(petrolChatSnapshotsAlive).not.toHaveBeenCalled()
  })

  it('ein „Seiten weg“ aus dem Main markiert die Kennung als verfallen', async () => {
    seed([{ role: 'user', content: 'q', origin: 'web', at: 1 }, answerWith('e'.repeat(32), 2)])
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'assistant', content: 'weg', error: true, origin: 'web', web: { kind: 'error', snapshotGone: true, sources: [], failures: [], notFetched: 0 }, at: 3 }], storage: 'saved' }))
    await state().send(ID, 'Was noch?', { ...OPTS, followUp: { snapshotId: 'e'.repeat(32) } })
    expect(scope().goneSnapshots).toContain('e'.repeat(32))
  })

  it('prüft höchstens die neuesten 200 Kennungen und erklärt keine ungeprüfte für verfallen (F21)', async () => {
    const hex = (n: number) => n.toString(16).padStart(32, '0')
    seed([{ role: 'user', content: 'q', origin: 'web', at: 1 }, ...Array.from({ length: 205 }, (_, i) => answerWith(hex(i + 1), 10 + i))])
    petrolChatSnapshotsAlive.mockImplementationOnce(async () => [hex(205)])
    await state().checkSnapshots(ID)
    const sent = petrolChatSnapshotsAlive.mock.calls[0][1]
    expect(sent).toHaveLength(200)
    expect(sent[0]).toBe(hex(205))
    const gone = scope().goneSnapshots
    expect(gone).toHaveLength(199)
    expect(gone).not.toContain(hex(1))
    expect(gone).not.toContain(hex(205))
  })
})

describe('Bilder', () => {
  it('schickt nur die Bilder der neuen Frage; ältere Bytes nicht', async () => {
    usePetrolChatStore.setState(s => ({ scopes: { ...s.scopes, [ID]: { ...s.scope(ID), messages: [{ role: 'user', content: 'a', images: [img('i1')], at: 1 }, { role: 'assistant', content: 'x', at: 2 }], conv: { id: CONV, vault: VAULT } } } }))
    void state().send(ID, 'Und jetzt?', { ...OPTS, images: [img('i4')] })
    await flush()
    const req = sendArg()[2] as { images: Array<{ id: string }> }
    expect(req.images.map(i => i.id)).toEqual(['i4'])
    expect(JSON.stringify(req)).not.toContain('B64i1')
  })

  it('Bild mit Websuche wird nicht gesendet', async () => {
    await state().send(ID, 'Was ist das?', { ...OPTS, images: [img('i9')], web: { query: 'x' } })
    expect(petrolConvSend).not.toHaveBeenCalled()
  })

  it('Antwort des Mains ohne Bildbytes: die eigenen Bytes werden wieder eingesetzt', () => {
    const local: Msg[] = [{ role: 'user', content: 'a', images: [img('i1')], at: 1 }]
    const fromMain: Msg[] = [{ role: 'user', content: 'a', images: [{ ...img('i1'), dataBase64: '' }], at: 1 }, { role: 'user', content: 'b', images: [{ ...img('i2'), dataBase64: '' }], at: 2 }]
    const out = withLocalImageBytes(fromMain, local, [img('i2')])
    expect(out.map(m => m.images?.[0].dataBase64)).toEqual(['B64i1', 'B64i2'])
  })
})

// Codex Runde 9 (F78, F79, F83)

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

describe('verspätetes Öffnen (F78)', () => {
  it('Vault-Wechsel während des Öffnens: spätes Gespräch wird geschlossen, nichts gesendet', async () => {
    const d = deferred<{ ok: true; id: string; messages: never[]; storage: string }>()
    petrolConvOpen.mockImplementationOnce(() => d.promise)
    const p = state().send(ID, 'Hallo', OPTS)
    await flush()
    state().vaultChanged(ID, VAULT)          // derselbe Vault: nichts
    state().vaultChanged(ID, '/vault/b')     // anderer Vault: verwerfen
    d.resolve({ ok: true, id: 'd'.repeat(32), messages: [], storage: 'on' })
    await p
    expect(petrolConvSend).not.toHaveBeenCalled()
    expect(petrolConvClose).toHaveBeenCalledWith('d'.repeat(32))
    expect(scope().conv).toBeNull()
  })

  it('Tab zu während des Öffnens: Bereich entsteht nicht neu', async () => {
    const d = deferred<{ ok: true; id: string; messages: never[]; storage: string }>()
    petrolConvOpen.mockImplementationOnce(() => d.promise)
    const p = state().send(ID, 'Hallo', OPTS)
    await flush()
    state().dispose(ID)
    d.resolve({ ok: true, id: 'd'.repeat(32), messages: [], storage: 'on' })
    await p
    expect(state().scopes[ID]).toBeUndefined()
    expect(petrolConvSend).not.toHaveBeenCalled()
    expect(petrolConvClose).toHaveBeenCalledWith('d'.repeat(32))
  })
})

describe('Stopp und schnelle Folgefrage (F79)', () => {
  it('die neue Frage wartet auf den Abschluss des Stopps; ein älteres Ergebnis überschreibt nichts', async () => {
    const stopDone = deferred<ConvResult>()
    petrolConvStop.mockImplementationOnce(() => stopDone.promise)
    const first = deferred<ConvResult>()
    petrolConvSend.mockImplementationOnce(() => first.promise)
    void state().send(ID, 'Eins', OPTS)
    await flush()
    state().stop(ID)
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'Eins', stopped: true, at: 1 }, { role: 'user', content: 'Zwei', at: 3 }, { role: 'assistant', content: 'Antwort zwei', at: 4 }], storage: 'saved' }))
    const second = state().send(ID, 'Zwei', OPTS)
    await flush()
    expect(petrolConvSend).toHaveBeenCalledTimes(1)       // wartet noch auf den Stopp
    stopDone.resolve({ ok: true, messages: [{ role: 'user', content: 'Eins', stopped: true, at: 1 }], storage: 'saved' })
    await second
    expect(petrolConvSend).toHaveBeenCalledTimes(2)
    expect(scope().messages.map(m => m.content)).toEqual(['Eins', 'Zwei', 'Antwort zwei'])
    // Das späte Ergebnis der gestoppten ersten Anfrage kommt jetzt erst — und ändert nichts.
    first.resolve({ ok: true, messages: [{ role: 'user', content: 'Eins', stopped: true, at: 1 }], storage: 'unchanged' })
    await flush()
    expect(scope().messages.map(m => m.content)).toEqual(['Eins', 'Zwei', 'Antwort zwei'])
  })
})

describe('Speicherzustand (F83)', () => {
  it('„fehlgeschlagen“ bleibt sichtbar, auch nach dem Stopp; „unverändert“ ändert nichts', async () => {
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'a', at: 1 }, { role: 'assistant', content: 'b', at: 2 }], storage: 'failed' }))
    await state().send(ID, 'a', OPTS)
    expect(scope().storage).toBe('failed')
    petrolConvStop.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'a', at: 1 }, { role: 'assistant', content: 'b', at: 2 }, { role: 'user', content: 'c', stopped: true, at: 3 }], storage: 'unchanged' }))
    void state().send(ID, 'c', OPTS)
    await flush()
    state().stop(ID)
    await flush()
    expect(scope().storage).toBe('failed')
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [], storage: 'saved' }))
    await state().send(ID, 'd', OPTS)
    expect(scope().storage).toBe('on')
  })
})

describe('Gespräch öffnen (Schritt 4)', () => {
  const petrolConvImage = vi.fn(async (..._a: unknown[]) => 'BYTES' as string | null)
  ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI.petrolConvImage = (...a: unknown[]) => petrolConvImage(...a)

  it('stoppt nichts Unnötiges, schließt das bisherige Gespräch, übernimmt die Nachrichten ohne Vormerkung', async () => {
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'alt', at: 1 }, { role: 'assistant', content: 'x', at: 2 }], storage: 'saved' }))
    await state().send(ID, 'alt', OPTS)
    state().setFollowUp(ID, '1'.repeat(32))
    petrolConvOpen.mockImplementationOnce(async () => ({ ok: true, id: 'e'.repeat(32), messages: [
      { role: 'user', content: 'geladen', images: [{ ...img('g1'), dataBase64: '' }], restored: true, at: 5 },
      { role: 'assistant', content: 'Antwort', origin: 'web', hadSnapshot: true, restored: true, at: 6 }
    ] as never[], storage: 'on' }))
    const err = await state().openConversation(ID, 'e'.repeat(32), VAULT)
    expect(err).toBeNull()
    expect(petrolConvClose).toHaveBeenCalledWith(CONV)
    expect(scope().conv).toEqual({ id: 'e'.repeat(32), vault: VAULT })
    expect(scope().messages.map(m => m.content)).toEqual(['geladen', 'Antwort'])
    expect(scope().followUp).toBeNull()
    await state().loadImage(ID, 'g1')
    expect(petrolConvImage).toHaveBeenCalledWith(VAULT, 'e'.repeat(32), 'g1')
    expect(scope().messages[0].images?.[0].dataBase64).toBe('BYTES')
  })

  it('Fehler beim Öffnen wird gemeldet; späte Bytes nach Gesprächswechsel landen nicht', async () => {
    petrolConvOpen.mockImplementationOnce(async () => ({ ok: false, error: 'Dieses Gespräch ist nicht lesbar.' }) as never)
    expect(await state().openConversation(ID, 'f'.repeat(32), VAULT)).toBe('Dieses Gespräch ist nicht lesbar.')
    petrolConvOpen.mockImplementationOnce(async () => ({ ok: true, id: 'e'.repeat(32), messages: [{ role: 'user', content: 'q', images: [{ ...img('g2'), dataBase64: '' }], at: 1 }] as never[], storage: 'on' }))
    await state().openConversation(ID, 'e'.repeat(32), VAULT)
    const d = deferred<string | null>()
    petrolConvImage.mockImplementationOnce(() => d.promise)
    const p = state().loadImage(ID, 'g2')
    state().clear(ID)
    d.resolve('SPÄT')
    await p
    expect(scope().messages).toEqual([])
  })
})

describe('Codex Runde 10 (F86, F87, F90, F91)', () => {
  const petrolConvImage = vi.fn(async (..._a: unknown[]) => 'BYTES' as string | null)
  beforeAll(() => {
    const api = (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI
    api.petrolConvImage = (...a: unknown[]) => petrolConvImage(...a)
  })

  const seedConv = () => usePetrolChatStore.setState(s => ({ scopes: { ...s.scopes, [ID]: { ...s.scope(ID), conv: { id: CONV, vault: VAULT }, messages: [{ role: 'user', content: 'nur im Speicher', at: 1 }] } } }))

  it('scheitert das Öffnen, bleibt das bisherige Gespräch unberührt (F86)', async () => {
    seedConv()
    petrolConvOpen.mockImplementationOnce(async () => ({ ok: false, error: 'Dieses Gespräch ist nicht lesbar.' }) as never)
    expect(await state().openConversation(ID, 'f'.repeat(32), VAULT)).toBe('Dieses Gespräch ist nicht lesbar.')
    expect(scope().conv).toEqual({ id: CONV, vault: VAULT })
    expect(scope().messages.map(m => m.content)).toEqual(['nur im Speicher'])
    expect(petrolConvClose).not.toHaveBeenCalled()
  })

  it('während des Öffnens wird nicht gesendet; Tab zu gibt die Sperre frei (F87)', async () => {
    seedConv()
    const d = deferred<{ ok: true; id: string; messages: never[]; storage: string }>()
    petrolConvOpen.mockImplementationOnce(() => d.promise as never)
    const opening = state().openConversation(ID, 'e'.repeat(32), VAULT)
    await flush()
    await state().send(ID, 'dazwischen', OPTS)
    expect(petrolConvSend).not.toHaveBeenCalled()
    state().dispose(ID)
    d.resolve({ ok: true, id: 'e'.repeat(32), messages: [], storage: 'on' })
    await opening
    expect(state().scopes[ID]).toBeUndefined()
    expect(petrolConvClose).toHaveBeenCalledWith('e'.repeat(32))
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [], storage: 'saved' }))
    await state().send(ID, 'danach', OPTS)
    expect(petrolConvSend).toHaveBeenCalledTimes(1)
  })

  it('Löschen in einem anderen Fenster leert die Anzeige (F90)', async () => {
    petrolConvSend.mockImplementationOnce(async () => ({ ok: true, messages: [{ role: 'user', content: 'a', at: 1 }, { role: 'assistant', content: 'b', at: 2 }], storage: 'saved' }))
    await state().send(ID, 'a', OPTS)
    convClosedCb?.({ id: CONV })
    expect(scope().messages).toEqual([])
    expect(scope().conv).toBeNull()
  })

  it('fehlende Bilddatei → „nicht mehr vorhanden“; höchstens drei Bilder gleichzeitig (F91)', async () => {
    const pending: Array<(v: string | null) => void> = []
    petrolConvImage.mockImplementation(() => new Promise(r => pending.push(r)))
    usePetrolChatStore.setState(s => ({ scopes: { ...s.scopes, [ID]: { ...s.scope(ID), conv: { id: CONV, vault: VAULT }, messages: [
      { role: 'user', content: 'q', images: ['a', 'b', 'c', 'd'].map(x => ({ ...img(x), dataBase64: '' })), at: 1 }
    ] } } }))
    const loads = ['a', 'b', 'c', 'd'].map(x => state().loadImage(ID, x))
    await flush()
    expect(pending).toHaveLength(3)
    pending[0](null)
    await flush()
    expect(pending).toHaveLength(4)
    pending.slice(1).forEach(r => r('BYTES'))
    await Promise.all(loads)
    const q = scope().messages[0]
    expect(q.imagesMissing?.map(i => i.id)).toEqual(['a'])
    expect(q.images?.map(i => i.dataBase64)).toEqual(['BYTES', 'BYTES', 'BYTES'])
    petrolConvImage.mockReset()
  })
})
