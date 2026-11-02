import { describe, it, expect, vi, beforeEach } from 'vitest'

// Themenbrücke im Petrol-Chat (docs/codex-collab/chat-webthema-im-verlauf.md): Ablauf im Store.
// F09 — ein gestopptes Bruchstück einer Antwort mit Themenkontext behält den Hinweis.
// F10 — „deine letzte Antwort“ zeigt auf die letzte SICHTBARE Antwort, nicht auf eine ältere Webantwort.

let chunkCb: ((c: { requestId: string; delta: string }) => void) | null = null
const ollamaChat = vi.fn((..._a: unknown[]) => new Promise<{ success: boolean; response?: string }>(() => { /* läuft, bis gestoppt */ }))
const petrolChatWeb = vi.fn((..._a: unknown[]) => new Promise(() => { /* läuft */ }))
const petrolChatSnapshotsDrop = vi.fn(async () => true)
const petrolChatSnapshotsAlive = vi.fn(async (_scope: string, ids: string[]) => ids)

vi.stubGlobal('window', {
  electronAPI: {
    ollamaChat: (...a: unknown[]) => ollamaChat(...a),
    lmstudioChat: () => new Promise(() => {}),
    petrolChatWeb,
    petrolChatSnapshotsDrop,
    petrolChatSnapshotsAlive: (scope: string, ids: string[]) => petrolChatSnapshotsAlive(scope, ids),
    petrolChatAbort: async () => {},
    onPetrolChatChunk: (cb: typeof chunkCb) => { chunkCb = cb; return () => {} },
    onPetrolChatProgress: () => () => {}
  },
  addEventListener: () => {},
  removeEventListener: () => {}
})
vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} })

const { usePetrolChatStore } = await import('./petrolChatStore')
type Msg = ReturnType<typeof usePetrolChatStore.getState>['scopes'][string]['messages'][number]

const ID = 'tab-1'
const RUN = { label: 'qwen', routeText: 'lokal', routeKind: 'local' as const, routeKey: 'ollama|qwen' }
const OPTS = { model: 'qwen', backend: 'ollama' as const, cloud: null, run: RUN }
const webExchange: Msg[] = [
  { role: 'user', content: 'Wer war Ernest Rutherford?', origin: 'web', webQuery: 'Rutherford', at: 1 },
  { role: 'assistant', content: 'Physiker [1].', origin: 'web', model: 'qwen', at: 2,
    web: { kind: 'answer', answer: 'Physiker [1].', sources: [], report: { usedSources: [1], sentences: [] } } as unknown as Msg['web'] }
]

function seed(messages: Msg[]): void {
  usePetrolChatStore.setState({ scopes: { [ID]: { ...usePetrolChatStore.getState().scope(ID), messages } }, activeScope: null })
}
const last = (): Msg => { const m = usePetrolChatStore.getState().scope(ID).messages; return m[m.length - 1] }

beforeEach(() => {
  ollamaChat.mockClear()
  petrolChatWeb.mockClear()
  petrolChatSnapshotsDrop.mockClear()
  if (usePetrolChatStore.getState().activeScope) usePetrolChatStore.getState().stop(ID)
})

describe('Petrol-Chat: Themenbrücke im Store', () => {
  it('gestopptes Bruchstück mit Themenkontext behält den Hinweis (F09)', async () => {
    seed(webExchange)
    void usePetrolChatStore.getState().send(ID, 'Frag mich dazu ab', OPTS)
    await Promise.resolve()
    expect(ollamaChat).toHaveBeenCalledTimes(1)
    const req = ollamaChat.mock.calls[0][6] as string
    chunkCb?.({ requestId: req, delta: 'Erste Frage: ' })
    usePetrolChatStore.getState().stop(ID)
    expect(last()).toMatchObject({ role: 'assistant', stopped: true, webTopicsUsed: 1 })
  })

  it('nach gestoppter normaler Antwort meint „deine letzte Antwort“ diese (F10)', async () => {
    seed([...webExchange,
      { role: 'user', content: 'Erzähl mehr', at: 3 },
      { role: 'assistant', content: 'Er wurde in Neuseeland', stopped: true, at: 4 }])
    void usePetrolChatStore.getState().send(ID, 'Erkläre deine letzte Antwort genauer', OPTS)
    await Promise.resolve()
    expect(ollamaChat).toHaveBeenCalledTimes(1)
    expect(last().appNote).toBeUndefined()
  })

  it('nach der festen App-Antwort bleibt „deine letzte Antwort“ beim Webbezug (F10)', async () => {
    seed([...webExchange,
      { role: 'user', content: 'Was stand in Quelle 1?', origin: 'web', at: 3 },
      { role: 'assistant', content: '', origin: 'web', appNote: 'old-web-source', at: 4 }])
    await usePetrolChatStore.getState().send(ID, 'Erkläre deine letzte Antwort genauer', OPTS)
    expect(ollamaChat).not.toHaveBeenCalled()
    expect(last().appNote).toBe('old-web-source')
  })

  it('„Was stand in der 1. Quelle?“ geht nicht ans Modell (F08)', async () => {
    seed(webExchange)
    await usePetrolChatStore.getState().send(ID, 'Was stand in der 1. Quelle?', OPTS)
    expect(ollamaChat).not.toHaveBeenCalled()
    expect(last().appNote).toBe('old-web-source')
  })
})


describe('Petrol-Chat: Nachfrage aus eingefrorenen Auszügen', () => {
  const SNAP = 'a'.repeat(32)

  it('schickt nur die Kennung und den Gesprächsbereich, keine Suchwörter', async () => {
    seed([{ role: 'user', content: 'normal', at: 1 }, { role: 'assistant', content: 'antwort', at: 2 }, ...webExchange])
    void usePetrolChatStore.getState().send(ID, 'Was gilt für Medienzentren?', { ...OPTS, followUp: { snapshotId: SNAP } })
    await Promise.resolve()
    expect(petrolChatWeb).toHaveBeenCalledTimes(1)
    expect(ollamaChat).not.toHaveBeenCalled()
    const arg = petrolChatWeb.mock.calls[0][0] as { snapshotId?: string; scopeId?: string; query?: string; webTopics?: unknown; history: { content: string }[] }
    expect(arg.snapshotId).toBe(SNAP)
    expect(arg.scopeId).toBe(ID)
    expect(arg.query).toBe('')
    expect(arg.webTopics).toBeUndefined()
    expect(arg.history.map(m => m.content)).toEqual(['normal', 'antwort'])
    expect(last().role).toBe('user')
    expect(last().followUpSnapshotId).toBe(SNAP)
  })

  it('„Was stand in Quelle 1?“ geht mit gewählter Nachfrage an den Main, nicht in die feste Absage', async () => {
    seed(webExchange)
    void usePetrolChatStore.getState().send(ID, 'Was stand in Quelle 1?', { ...OPTS, followUp: { snapshotId: SNAP } })
    await Promise.resolve()
    expect(petrolChatWeb).toHaveBeenCalledTimes(1)
    expect(last().appNote).toBeUndefined()
  })

  it('Neues Gespräch verwirft die Snapshots dieses Bereichs', () => {
    usePetrolChatStore.getState().clear(ID)
    expect(petrolChatSnapshotsDrop).toHaveBeenCalledWith(ID)
  })
})

describe('Petrol-Chat: Globus bleibt an, Nachfrage knüpft von selbst an (28.10.2026)', () => {
  it('nach einer Webantwort bleibt der Globus an und die Antwort ist als Nachfrage vorgemerkt', async () => {
    seed([])
    usePetrolChatStore.getState().setWeb(ID, { webArmed: true })
    petrolChatWeb.mockImplementationOnce(async () => ({ success: true, result: { kind: 'answer', answer: 'Physiker [1].', snapshotId: 'snap-9', sources: [], failures: [], notFetched: 0, report: { usedSources: [1], sentences: [] } } }))
    await usePetrolChatStore.getState().send(ID, 'Wer war Rutherford?', { ...OPTS, web: { query: 'Rutherford' } })
    const sc = usePetrolChatStore.getState().scope(ID)
    expect(sc.webArmed).toBe(true)
    expect(sc.followUp).toEqual({ snapshotId: 'snap-9' })
  })
  it('Neues Gespräch startet mit dem gemerkten Globus (Codex F06)', async () => {
    const { useUIStore } = await import('./uiStore')
    useUIStore.setState({ petrolWebSticky: true })
    usePetrolChatStore.getState().clear(ID)
    expect(usePetrolChatStore.getState().scope(ID).webArmed).toBe(true)
    useUIStore.setState({ petrolWebSticky: false })
    usePetrolChatStore.getState().clear(ID)
    expect(usePetrolChatStore.getState().scope(ID).webArmed).toBe(false)
  })
  it('eine fehlgeschlagene Webantwort merkt keine Nachfrage vor', async () => {
    seed([])
    usePetrolChatStore.getState().setFollowUp(ID, null)
    petrolChatWeb.mockImplementationOnce(async () => ({ success: false, error: 'kaputt' }))
    await usePetrolChatStore.getState().send(ID, 'Wer war Bohr?', { ...OPTS, web: { query: 'Bohr' } })
    expect(usePetrolChatStore.getState().scope(ID).followUp).toBeNull()
  })
})

describe('Petrol-Chat: verfallene Seiten (Codex F02/F03, chat-verlauf-notizen-bilder.md)', () => {
  const answerWith = (snap: string, at: number): Msg => ({
    role: 'assistant', content: 'Physiker [1].', origin: 'web', model: 'qwen', at,
    web: { kind: 'answer', answer: 'Physiker [1].', snapshotId: snap, sources: [], report: { usedSources: [1], sentences: [] } } as unknown as Msg['web']
  })

  it('merkt sich, was der Main nicht mehr hält, und hebt eine darauf gesetzte Nachfrage auf', async () => {
    seed([webExchange[0], answerWith('a'.repeat(32), 2), { role: 'user', content: 'Und?', origin: 'web', followUp: true, followUpSnapshotId: 'b'.repeat(32), at: 3 }])
    usePetrolChatStore.getState().setFollowUp(ID, 'a'.repeat(32))
    petrolChatSnapshotsAlive.mockImplementationOnce(async () => [])
    await usePetrolChatStore.getState().checkSnapshots(ID)
    const sc = usePetrolChatStore.getState().scope(ID)
    expect(sc.goneSnapshots.sort()).toEqual(['a'.repeat(32), 'b'.repeat(32)])
    expect(sc.followUp).toBeNull()
  })

  it('lässt eine noch abrufbare Nachfrage stehen und fragt Verfallenes nicht erneut ab', async () => {
    seed([webExchange[0], answerWith('c'.repeat(32), 2), answerWith('d'.repeat(32), 4)])
    usePetrolChatStore.setState(s => ({ scopes: { ...s.scopes, [ID]: { ...s.scopes[ID], goneSnapshots: ['c'.repeat(32)] } } }))
    usePetrolChatStore.getState().setFollowUp(ID, 'd'.repeat(32))
    petrolChatSnapshotsAlive.mockClear()
    await usePetrolChatStore.getState().checkSnapshots(ID)
    expect(petrolChatSnapshotsAlive).toHaveBeenCalledWith(ID, ['d'.repeat(32)])
    expect(usePetrolChatStore.getState().scope(ID).followUp).toEqual({ snapshotId: 'd'.repeat(32) })
  })

  it('ein „Seiten weg“ aus dem Main markiert die Kennung als verfallen', async () => {
    seed([webExchange[0], answerWith('e'.repeat(32), 2)])
    petrolChatWeb.mockImplementationOnce(async () => ({ success: true, result: { kind: 'error', error: 'weg', snapshotGone: true, sources: [], failures: [], notFetched: 0 } }))
    await usePetrolChatStore.getState().send(ID, 'Was noch?', { ...OPTS, followUp: { snapshotId: 'e'.repeat(32) } })
    expect(usePetrolChatStore.getState().scope(ID).goneSnapshots).toContain('e'.repeat(32))
  })

  it('prüft höchstens die neuesten 200 Kennungen und erklärt keine ungeprüfte für verfallen (F21)', async () => {
    const hex = (n: number) => n.toString(16).padStart(32, '0')
    seed([webExchange[0], ...Array.from({ length: 205 }, (_, i) => answerWith(hex(i + 1), 10 + i))])
    usePetrolChatStore.setState(st => ({ scopes: { ...st.scopes, [ID]: { ...st.scopes[ID], goneSnapshots: [] } } }))
    petrolChatSnapshotsAlive.mockClear()
    petrolChatSnapshotsAlive.mockImplementationOnce(async () => [hex(205)])
    await usePetrolChatStore.getState().checkSnapshots(ID)
    const sent = petrolChatSnapshotsAlive.mock.calls[0][1]
    expect(sent).toHaveLength(200)
    expect(sent[0]).toBe(hex(205))
    const gone = usePetrolChatStore.getState().scope(ID).goneSnapshots
    expect(gone).toHaveLength(199)
    expect(gone).not.toContain(hex(1))
    expect(gone).not.toContain(hex(205))
  })

  it('Neues Gespräch vergisst die Liste', () => {
    usePetrolChatStore.setState(s => ({ scopes: { ...s.scopes, [ID]: { ...s.scopes[ID], goneSnapshots: ['f'.repeat(32)] } } }))
    usePetrolChatStore.getState().clear(ID)
    expect(usePetrolChatStore.getState().scope(ID).goneSnapshots).toEqual([])
  })
})

describe('Petrol-Chat: Bilder (Rev. 7 Punkt 20)', () => {
  const img = (id: string) => ({ v: 1 as const, id, name: `${id}.jpg`, mime: 'image/jpeg' as const, width: 10, height: 10, byteLength: 3, dataBase64: `B64${id}` })

  it('schickt Verweise und nur die Bytes der mitgehenden Bilder, nie den Dateinamen', async () => {
    seed([
      { role: 'user', content: 'a', images: [img('i1'), img('i2')], at: 1 },
      { role: 'assistant', content: 'x', at: 2 },
      { role: 'user', content: 'b', images: [img('i3')], at: 3 },
      { role: 'assistant', content: 'y', at: 4 }
    ])
    void usePetrolChatStore.getState().send(ID, 'Und jetzt?', { ...OPTS, images: [img('i4')] })
    await Promise.resolve()
    const [, messages, , , , , , , wire] = ollamaChat.mock.calls[0] as unknown as [unknown, Array<{ content: string; imageIds?: string[] }>, unknown, unknown, unknown, unknown, unknown, unknown, Array<{ id: string; dataBase64: string }>]
    expect(messages.map(m => m.imageIds ?? [])).toEqual([['i2'], [], ['i3'], [], ['i4']])
    expect(messages[0].content).toContain('Die Antwort darauf beruht auf dem Bild')
    expect(wire.map(w => w.id).sort()).toEqual(['i2', 'i3', 'i4'])
    expect(JSON.stringify(ollamaChat.mock.calls[0])).not.toContain('.jpg')
    expect(last().images?.[0].id).toBe('i4')
  })

  it('Bild mit Websuche wird nicht gesendet', async () => {
    seed([])
    await usePetrolChatStore.getState().send(ID, 'Was ist das?', { ...OPTS, images: [img('i9')], web: { query: 'x' } })
    expect(petrolChatWeb).not.toHaveBeenCalled()
    expect(ollamaChat).not.toHaveBeenCalled()
  })

  it('Stopp behält den Hinweis auf nicht mitgeschickte ältere Bilder (F57)', async () => {
    seed([
      { role: 'user', content: 'a', images: [img('i1'), img('i2'), img('i3')], at: 1 },
      { role: 'assistant', content: 'x', at: 2 }
    ])
    void usePetrolChatStore.getState().send(ID, 'Und?', OPTS)
    await Promise.resolve()
    const req = ollamaChat.mock.calls[0][6] as string
    chunkCb?.({ requestId: req, delta: 'Teil' })
    usePetrolChatStore.getState().stop(ID)
    expect(last()).toMatchObject({ role: 'assistant', stopped: true, imagesDropped: 1 })
  })

  it('Empfänger sammeln sich an der Bildmarke; weggelassene Verlaufsbilder mit Grund (02.11.2026)', async () => {
    seed([
      { role: 'user', content: 'a', images: [img('h1')], imageDelivery: { h1: { kind: 'image', route: 'local', target: 'qwen' } }, imageRecipients: { h1: ['qwen'] }, at: 1 },
      { role: 'assistant', content: 'x', at: 2 }
    ])
    ollamaChat.mockImplementationOnce(async () => ({ success: true, response: 'ok', imageDelivery: { h1: { kind: 'image', route: 'cloud', target: 'OpenRouter · m' } } }))
    await usePetrolChatStore.getState().send(ID, 'Und?', OPTS)
    const q = usePetrolChatStore.getState().scope(ID).messages[0]
    expect(q.imageRecipients?.h1).toEqual(['qwen', 'OpenRouter · m'])

    ollamaChat.mockImplementationOnce(async () => ({ success: true, response: 'ok', imageDelivery: { h1: { kind: 'history-dropped', reason: 'nicht freigegeben' } } }))
    await usePetrolChatStore.getState().send(ID, 'Noch was?', OPTS)
    expect(last()).toMatchObject({ role: 'assistant', imagesWithheld: { count: 1, reason: 'nicht freigegeben' } })
  })
})
