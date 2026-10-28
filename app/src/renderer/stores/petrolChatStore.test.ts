import { describe, it, expect, vi, beforeEach } from 'vitest'

// Themenbrücke im Petrol-Chat (docs/codex-collab/chat-webthema-im-verlauf.md): Ablauf im Store.
// F09 — ein gestopptes Bruchstück einer Antwort mit Themenkontext behält den Hinweis.
// F10 — „deine letzte Antwort“ zeigt auf die letzte SICHTBARE Antwort, nicht auf eine ältere Webantwort.

let chunkCb: ((c: { requestId: string; delta: string }) => void) | null = null
const ollamaChat = vi.fn((..._a: unknown[]) => new Promise<{ success: boolean; response?: string }>(() => { /* läuft, bis gestoppt */ }))
const petrolChatWeb = vi.fn((..._a: unknown[]) => new Promise(() => { /* läuft */ }))
const petrolChatSnapshotsDrop = vi.fn(async () => true)

vi.stubGlobal('window', {
  electronAPI: {
    ollamaChat: (...a: unknown[]) => ollamaChat(...a),
    lmstudioChat: () => new Promise(() => {}),
    petrolChatWeb,
    petrolChatSnapshotsDrop,
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
