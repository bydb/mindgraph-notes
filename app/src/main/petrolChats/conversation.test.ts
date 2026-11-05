import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { PetrolConversations, type ChatRunInput, type ChatRunResult, type SendRequest, type TurnTap, type WebRunInput, type WebRunResult } from './conversation'
import { PetrolChatStorage, type ChatCrypto } from './storage'
import type { ChatImage } from '../../shared/chatImages'
import type { WebChatResult } from '../../shared/webChat'

// Der Main führt das Gespräch (Rev. 4 Punkt 12, Rev. 8 Schritt 3, Rev. 9 Punkt 26/27).

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

const plainCrypto: ChatCrypto = {
  unavailableReason: () => null,
  encrypt: s => Buffer.from(`ENC${s}`),
  decrypt: b => { const t = b.toString(); if (!t.startsWith('ENC')) throw new Error('x'); return t.slice(3) }
}

function seg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2
  return [0xff, marker, len >> 8, len & 0xff, ...payload]
}
const JPEG = Buffer.from([0xff, 0xd8, ...seg(0xc0, [8, 0, 10, 0, 20, 1, 1, 0x11, 0]), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9])
const img = (id: string): ChatImage => ({ v: 1, id, name: `${id}.jpg`, mime: 'image/jpeg', width: 20, height: 10, byteLength: JPEG.length, dataBase64: JPEG.toString('base64') })

const VAULT = '/vault/a'
const SENDER = 7
let base: string
let clock: number
let seq: number
let chatCalls: ChatRunInput[]
let webCalls: WebRunInput[]
let chatImpl: (i: ChatRunInput, tap: TurnTap) => Promise<ChatRunResult>
let webImpl: (i: WebRunInput, tap: TurnTap) => Promise<WebRunResult>
let aborted: string[]
let dropped: string[]
let storage: PetrolChatStorage
let convs: PetrolConversations

/** `create` kann scheitern (Löschen läuft, F88); in Tests muss es klappen. */
function created(c: PetrolConversations, sender: number, vault: string | null) {
  const r = c.create(sender, vault)
  if (!r.ok) throw new Error(r.error)
  return r
}

const REQ = (over: Partial<SendRequest> = {}): SendRequest => ({
  requestId: `r${++seq}`, question: 'Frage', kind: 'chat', model: 'qwen', backend: 'ollama', cloud: null, ...over
})

const webAnswer = (snapshotId = 'f'.repeat(32)): WebChatResult => ({
  kind: 'answer', answer: 'Physiker [1].', sources: [{ n: 1, title: 'T', url: 'https://e.org', host: 'e.org', fetchedAt: 'x', excerpt: 'AUSZUG', originalChars: 10, truncated: false }],
  report: { refs: [], sentences: [], usedSources: [1], summary: { sentences: 1, cited: 1, uncited: 0, low: 0, invalidRefs: 0, quotesNotFound: 0, unchecked: 0 } },
  failures: [], notFetched: 0, provenance: { searchProvider: 'x', searchOk: true, fetchAttempts: 1, fetchOk: 1, contactedHosts: ['e.org'], route: 'local', routeLabel: 'qwen' }, snapshotId
})

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-petrol-conv-'))
  clock = 1_000_000
  seq = 0
  chatCalls = []
  webCalls = []
  aborted = []
  dropped = []
  chatImpl = async () => ({ success: true, response: 'Antwort' })
  webImpl = async () => ({ success: true, result: webAnswer() })
  let n = 0
  storage = new PetrolChatStorage(base, plainCrypto, () => clock, () => (++n).toString(16).padStart(32, '0'))
  convs = new PetrolConversations({
    storage,
    runChat: (i, t) => { chatCalls.push(i); return chatImpl(i, t) },
    runWeb: (i, t) => { webCalls.push(i); return webImpl(i, t) },
    abort: (_s, r) => { aborted.push(r) },
    dropSnapshots: (_s, scope) => { dropped.push(scope) },
    now: () => ++clock
  })
})
afterEach(async () => { await fs.rm(base, { recursive: true, force: true }) })

describe('Verlauf baut der Main', () => {
  it('schickt den eigenen Verlauf ohne Webwechsel und ohne Unfertiges', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Eins' }))
    webImpl = async () => ({ success: true, result: webAnswer() })
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Web', kind: 'web', web: { query: 'web' } }))
    chatImpl = async () => ({ success: false, error: 'kaputt' })
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Scheitert' }))
    chatImpl = async () => ({ success: true, response: 'ok' })
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Zwei' }))
    expect(chatCalls.at(-1)!.messages).toEqual([
      { role: 'user', content: 'Eins' }, { role: 'assistant', content: 'Antwort' }, { role: 'user', content: 'Zwei' }
    ])
    // Themenfrage aus dem erfolgreichen Webwechsel geht als Thema mit, nicht als Verlauf.
    expect(chatCalls.at(-1)!.webTopics).toEqual([{ text: 'Web', clipped: false }])
  })

  it('Websuche bekommt Verlauf, Themen und die Gesprächs-ID als Bereich der Auszüge', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Eins' }))
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Wer war Rutherford?', kind: 'web', web: { query: 'Rutherford' } }))
    expect(webCalls[0]).toMatchObject({ scopeId: id, query: 'Rutherford', history: [{ role: 'user', content: 'Eins' }, { role: 'assistant', content: 'Antwort' }] })
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Und wann?', kind: 'follow-up', followUpSnapshotId: 'f'.repeat(32) }))
    expect(webCalls[1]).toMatchObject({ scopeId: id, snapshotId: 'f'.repeat(32), query: '' })
    expect(webCalls[1].webTopics).toBeUndefined()
  })

  it('„Was stand in der 1. Quelle?“ geht nicht ans Modell (F08)', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Wer war Rutherford?', kind: 'web', web: { query: 'Rutherford' } }))
    const r = await convs.send(SENDER, VAULT, id, REQ({ question: 'Was stand in der 1. Quelle?' }))
    expect(chatCalls).toHaveLength(0)
    expect(r.ok && r.messages.at(-1)).toMatchObject({ appNote: 'old-web-source', origin: 'web' })
  })
})

describe('Vault-Bindung (F66)', () => {
  it('lehnt einen anderen Vault und eine unbekannte ID ab', async () => {
    const { id } = created(convs, SENDER, VAULT)
    expect(await convs.send(SENDER, '/vault/b', id, REQ())).toMatchObject({ ok: false })
    expect(await convs.send(SENDER, VAULT, 'a'.repeat(32), REQ())).toMatchObject({ ok: false })
    expect(await convs.send(SENDER + 1, VAULT, id, REQ())).toMatchObject({ ok: false })
    expect(await convs.open(SENDER, '/vault/b', id)).toMatchObject({ ok: false })
    expect(chatCalls).toHaveLength(0)
  })
  it('eine zweite Frage während einer laufenden wird abgelehnt', async () => {
    const d = deferred<ChatRunResult>()
    chatImpl = () => d.promise
    const { id } = created(convs, SENDER, VAULT)
    const first = convs.send(SENDER, VAULT, id, REQ())
    expect(await convs.send(SENDER, VAULT, id, REQ())).toMatchObject({ ok: false })
    d.resolve({ success: true, response: 'x' })
    await first
  })
})

describe('Stopp schließt den Wechsel im Main ab (F67)', () => {
  it('Bruchstück aus den Textstücken, genau einmal; spätes Ergebnis ändert nichts', async () => {
    const d = deferred<ChatRunResult>()
    chatImpl = (_i, tap) => { tap.chunk('Halb'); tap.chunk('e Antwort'); return d.promise }
    const { id } = created(convs, SENDER, VAULT)
    const running = convs.send(SENDER, VAULT, id, REQ({ requestId: 'stopme' }))
    await Promise.resolve()
    const stopped = await convs.stop(SENDER, VAULT, id)
    expect(aborted).toEqual(['stopme'])
    expect(stopped.ok && stopped.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Halbe Antwort', stopped: true })
    expect((await convs.stop(SENDER, VAULT, id)).ok).toBe(true)
    d.resolve({ success: true, response: 'Volle Antwort, zu spät' })
    const late = await running
    expect(late.ok && late.messages.map(m => m.content)).toEqual(['Frage', 'Halbe Antwort'])
  })

  it('Stopp vor dem ersten Wort markiert die Frage', async () => {
    chatImpl = () => new Promise(() => {})
    const { id } = created(convs, SENDER, VAULT)
    void convs.send(SENDER, VAULT, id, REQ())
    await Promise.resolve()
    const r = await convs.stop(SENDER, VAULT, id)
    expect(r.ok && r.messages).toEqual([expect.objectContaining({ role: 'user', stopped: true })])
  })

  it('Web-Stopp behält Quellen aus dem Fortschritt; gründlich: später gesendete Suchanfragen werden nachgetragen', async () => {
    const d = deferred<WebRunResult>()
    webImpl = (_i, tap) => {
      tap.progress({ phase: 'search', query: 'erste' })
      tap.progress({ phase: 'model', sources: webAnswer().sources, failures: [{ host: 'x.org', reason: 'timeout' }], notFetched: 2 })
      tap.chunk('Teil')
      return d.promise
    }
    const { id } = created(convs, SENDER, VAULT)
    const running = convs.send(SENDER, VAULT, id, REQ({ question: 'Tief', kind: 'web', web: { query: 'Tief', deep: true } }))
    await Promise.resolve()
    const r = await convs.stop(SENDER, VAULT, id)
    expect(r.ok && r.messages[0].webSentQueries).toEqual(['erste'])
    expect(r.ok && r.messages[1]).toMatchObject({ stopped: true, origin: 'web', content: 'Teil', webPartial: { notFetched: 2, failures: [{ host: 'x.org', reason: 'timeout' }] } })
    d.resolve({ success: true, result: { ...webAnswer(), kind: 'stopped', deep: { queries: [{ text: 'erste', origin: 'plan', ok: true, hits: 1 }, { text: 'zweite', origin: 'plan', ok: true, hits: 1 }] } as unknown as WebChatResult['deep'] } })
    const late = await running
    expect(late.ok && late.messages[0].webSentQueries).toEqual(['erste', 'zweite'])
    expect(late.ok && late.messages[1].content).toBe('Teil')
  })

  it('Stopp mit Themenkontext und weggelassenen Bildern behält beide Hinweise (F09, F57)', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Wer war Rutherford?', kind: 'web', web: { query: 'Rutherford' } }))
    for (const n of [1, 2, 3]) await convs.send(SENDER, VAULT, id, REQ({ question: `Bild ${n}`, images: [img(`img-${n}`)] }))
    chatImpl = (_i, tap) => { tap.chunk('Bruch'); return new Promise(() => {}) }
    void convs.send(SENDER, VAULT, id, REQ({ question: 'Weiter', images: [img('img-4')] }))
    await Promise.resolve()
    const r = await convs.stop(SENDER, VAULT, id)
    expect(r.ok && r.messages.at(-1)).toMatchObject({ stopped: true, webTopicsUsed: 1, imagesDropped: 1 })
  })
})

describe('Bilder', () => {
  it('ältere Bildbytes kommen aus dem Main, nie vom Renderer; Empfänger sammeln sich', async () => {
    chatImpl = async i => ({ success: true, response: 'ok', imageDelivery: Object.fromEntries(i.images.map(w => [w.id, { kind: 'image' as const, route: 'local' as const, target: 'qwen' }])) })
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Bild', images: [img('img-a')] }))
    const r = await convs.send(SENDER, VAULT, id, REQ({ question: 'Und?' }))
    expect(chatCalls[1].images.map(w => w.id)).toEqual(['img-a'])
    expect(chatCalls[1].messages[0]).toMatchObject({ imageIds: ['img-a'] })
    expect(r.ok && r.messages[0].imageRecipients).toEqual({ 'img-a': ['qwen'] })
  })

  it('Verlaufsregel: letzte Frage alle, davor die neuesten zwei; Hinweis im Text, nie der Dateiname', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'a', images: [img('i1'), img('i2')] }))
    await convs.send(SENDER, VAULT, id, REQ({ question: 'b', images: [img('i3')] }))
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Und jetzt?', images: [img('i4')] }))
    const call = chatCalls.at(-1)!
    expect(call.messages.map(m => m.imageIds ?? [])).toEqual([['i2'], [], ['i3'], [], ['i4']])
    expect(call.messages[0].content).toContain('Die Antwort darauf beruht auf dem Bild')
    expect(call.images.map(w => w.id).sort()).toEqual(['i2', 'i3', 'i4'])
    expect(JSON.stringify(call)).not.toContain('.jpg')
  })

  it('Bild mit Websuche wird abgelehnt', async () => {
    const { id } = created(convs, SENDER, VAULT)
    expect(await convs.send(SENDER, VAULT, id, REQ({ kind: 'web', web: { query: 'x' }, images: [img('img-a')] }))).toMatchObject({ ok: false })
  })

  it('„Erneut senden“ mit demselben Bild geht; eine Kennung für ein anderes Bild nicht (Rev. 9 Punkt 27)', async () => {
    chatImpl = async () => ({ success: false, error: 'weg' })
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ images: [img('img-a')] }))
    chatImpl = async () => ({ success: true, response: 'ok' })
    expect((await convs.send(SENDER, VAULT, id, REQ({ images: [img('img-a')] }))).ok).toBe(true)
    expect(await convs.send(SENDER, VAULT, id, REQ({ images: [{ ...img('img-a'), width: 30 }] }))).toMatchObject({ ok: false })
    expect(await convs.send(SENDER, VAULT, id, REQ({ images: [{ ...img('x'), id: '__proto__' }] }))).toMatchObject({ ok: false })
  })
})

describe('Speichern und Öffnen', () => {
  it('nach jedem Wechsel gespeichert; geöffnet ohne Auszüge und Kennungen, Bilder mit Bytes', async () => {
    const { id } = created(convs, SENDER, VAULT)
    const r1 = await convs.send(SENDER, VAULT, id, REQ({ question: 'Bild', images: [img('img-a')] }))
    expect(r1.ok && r1.storage).toBe('saved')
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Wer war Rutherford?', kind: 'web', web: { query: 'Rutherford' } }))
    const loadImage = vi.spyOn(storage, 'loadImage')
    const fresh = new PetrolConversations({ storage, runChat: async () => ({ success: true }), runWeb: async () => ({ success: true }), abort: () => {}, dropSnapshots: () => {} })
    const o = await fresh.open(SENDER, VAULT, id)
    expect(o.ok).toBe(true)
    if (!o.ok) return
    expect(o.messages).toHaveLength(4)
    // Bilder bei Bedarf (F91): Öffnen liest keine Bilddatei, die Marke bleibt ein Bild ohne Bytes.
    expect(loadImage).not.toHaveBeenCalled()
    expect(o.messages[0].images?.[0]).toMatchObject({ id: 'img-a', dataBase64: '' })
    expect(await fresh.imageBytes(SENDER, VAULT, id, 'img-a')).toBe(JPEG.toString('base64'))
    expect(loadImage).toHaveBeenCalledTimes(1)
    await fresh.imageBytes(SENDER, VAULT, id, 'img-a')
    expect(loadImage).toHaveBeenCalledTimes(1)
    loadImage.mockRestore()
    expect(o.messages[3]).toMatchObject({ hadSnapshot: true })
    expect(o.messages[3].web?.snapshotId).toBeUndefined()
    expect(o.messages[3].web?.sources[0].excerpt).toBe('')
    expect(o.title).toBe('Bild')
  })

  it('ohne Vault nur im Speicher', async () => {
    const { id, storage: st } = created(convs, SENDER, null)
    expect(st).toBe('memory')
    const r = await convs.send(SENDER, null, id, REQ())
    expect(r.ok && r.storage).toBe('memory')
    expect(await fs.readdir(base)).toEqual([])
  })

  it('Schließen stoppt eine laufende Antwort, speichert sie und verwirft die Auszüge des Gesprächs', async () => {
    chatImpl = (_i, tap) => { tap.chunk('Teil'); return new Promise(() => {}) }
    const { id } = created(convs, SENDER, VAULT)
    void convs.send(SENDER, VAULT, id, REQ())
    await Promise.resolve()
    await convs.close(SENDER, id)
    expect(dropped).toEqual([id])
    const again = await convs.open(SENDER, VAULT, id)
    expect(again.ok && again.messages.at(-1)).toMatchObject({ content: 'Teil', stopped: true })
  })

  it('Speicherfehler beendet das Gespräch nicht', async () => {
    const log = vi.fn()
    const broken = new PetrolConversations({
      storage: { ...storage, unavailableReason: () => null, newChatId: () => 'b'.repeat(32), load: storage.load.bind(storage), loadImage: storage.loadImage.bind(storage), save: async () => { throw new Error('Platte voll') } },
      runChat: async () => ({ success: true, response: 'ok' }), runWeb: async () => ({ success: true }), abort: () => {}, dropSnapshots: () => {}, log
    })
    const { id } = created(broken, SENDER, VAULT)
    const r = await broken.send(SENDER, VAULT, id, REQ())
    expect(r.ok && r.storage).toBe('failed')
    expect(r.ok && r.messages.at(-1)?.content).toBe('ok')
    expect(log).toHaveBeenCalled()
  })
})

describe('Herkunft an der Antwort bildet der Main (F80)', () => {
  it('Cloud-Weg: Anbieter und Modell aus dem gewählten Weg; ein mitgeschicktes Label zählt nicht', async () => {
    const { id } = created(convs, SENDER, VAULT)
    const r = await convs.send(SENDER, VAULT, id, { ...REQ({ cloud: { model: 'anthropic/claude-haiku-5.5', provider: 'openrouter' } }), runLabel: 'qwen lokal' } as SendRequest)
    expect(r.ok && r.messages.at(-1)?.model).toMatch(/^OpenRouter · /)
    const local = await convs.send(SENDER, VAULT, id, REQ())
    expect(local.ok && local.messages.at(-1)?.model).toBe('qwen')
  })
  it('parseSendRequest übernimmt kein runLabel', async () => {
    const { parseSendRequest } = await import('./conversation')
    const r = parseSendRequest({ requestId: 'x', question: 'q', kind: 'chat', model: 'm', backend: 'ollama', cloud: null, runLabel: 'gefälscht' })
    expect(r).not.toHaveProperty('runLabel')
  })
})

describe('Geladene Gespräche (Schritt 4+5, Rev. 9 Punkt 28/29)', () => {
  it('Öffnen markiert Nachrichten als geladen; Bildbytes gibt es einzeln, nur für Bilder dieses Gesprächs', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Bild', images: [img('img-a')] }))
    await convs.close(SENDER, id)
    const o = await convs.open(SENDER, VAULT, id)
    expect(o.ok && o.messages.every(m => m.restored)).toBe(true)
    expect(await convs.imageBytes(SENDER, VAULT, id, 'img-a')).toBe(JPEG.toString('base64'))
    expect(await convs.imageBytes(SENDER, VAULT, id, 'img-b')).toBeNull()
    expect(await convs.imageBytes(SENDER, '/vault/b', id, 'img-a')).toBeNull()
    expect(await convs.imageBytes(SENDER + 1, VAULT, id, 'img-a')).toBeNull()
  })

  it('„Erneut senden“ ohne Bytes: der Main nimmt sein eigenes Bild; ein unbekanntes ohne Bytes wird abgelehnt', async () => {
    chatImpl = async () => ({ success: false, error: 'weg' })
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Bild', images: [img('img-a')] }))
    chatImpl = async () => ({ success: true, response: 'ok' })
    const r = await convs.send(SENDER, VAULT, id, REQ({ question: 'Bild', images: [{ ...img('img-a'), dataBase64: '' }] }))
    expect(r.ok).toBe(true)
    expect(chatCalls.at(-1)!.images[0].dataBase64).toBe(JPEG.toString('base64'))
    expect(await convs.send(SENDER, VAULT, id, REQ({ images: [{ ...img('img-z'), dataBase64: '' }] }))).toMatchObject({ ok: false })
  })

  it('closeEverywhere schließt das Gespräch in jedem Fenster', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ())
    await convs.open(SENDER + 1, VAULT, id)
    await convs.closeEverywhere(VAULT, id)
    expect(convs.isOpen(SENDER, id)).toBe(false)
    expect(convs.isOpen(SENDER + 1, id)).toBe(false)
  })

  it('Umbenennen bleibt; leer folgt der Titel wieder der ersten Frage', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Erste Frage' }))
    await convs.rename(SENDER, VAULT, id, 'Mein Titel')
    await convs.close(SENDER, id)
    expect((await convs.open(SENDER, VAULT, id)).ok && (await storage.list(VAULT))[0]).toMatchObject({ header: { title: 'Mein Titel', titleEdited: true } })
    await convs.rename(SENDER, VAULT, id, null)
    expect((await storage.list(VAULT))[0]).toMatchObject({ header: { title: 'Erste Frage' } })
  })
})

describe('Codex Runde 10 (F88, F89, F91, F94)', () => {
  it('Löschen sperrt das Öffnen; ein spätes Ergebnis legt ein gelöschtes Gespräch nicht wieder an (F88)', async () => {
    const d = deferred<WebRunResult>()
    webImpl = (_i, tap) => { tap.progress({ query: 'eins' }); return d.promise }
    const { id } = created(convs, SENDER, VAULT)
    const running = convs.send(SENDER, VAULT, id, REQ({ question: 'Tief', kind: 'web', web: { query: 'Tief', deep: true } }))
    await Promise.resolve()
    convs.beginDelete(VAULT, id)
    expect(await convs.open(SENDER + 1, VAULT, id)).toMatchObject({ ok: false })
    await convs.closeEverywhere(VAULT, id)
    await storage.delete(VAULT, id)
    convs.endDelete(VAULT, id)
    d.resolve({ success: true, result: { ...webAnswer(), kind: 'stopped', deep: { queries: [{ text: 'eins', origin: 'plan', ok: true, hits: 1 }, { text: 'zwei', origin: 'plan', ok: true, hits: 1 }] } as unknown as WebChatResult['deep'] } })
    await running
    await new Promise(r => setTimeout(r, 20))
    expect((await storage.list(VAULT)).map(e => e.kind === 'chat' ? e.header.id : e.id)).not.toContain(id)
    convs.beginDelete(VAULT, null)
    expect(convs.create(SENDER, VAULT)).toMatchObject({ ok: false })
    convs.endDelete(VAULT, null)
  })

  it('ein Gespräch ist nur in einem Fenster offen; Umbenennen geht über dessen Kopie (F89)', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Erste' }))
    expect(await convs.open(SENDER + 1, VAULT, id)).toMatchObject({ ok: false, error: expect.stringContaining('anderen Fenster') })
    expect(convs.openSender(VAULT, id)).toBe(SENDER)
    await convs.rename(SENDER, VAULT, id, 'Neu')
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Zweite' }))
    const l = await storage.list(VAULT)
    expect(l[0]).toMatchObject({ header: { title: 'Neu' } })
    const o = await storage.load(VAULT, id)
    expect(o.kind === 'chat' && o.chat.messages.length).toBe(4)
  })

  it('geladenes Gespräch: Verlaufsbild erst beim Senden von der Platte; fehlende Datei → imagesMissing (F91)', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Bild', images: [img('img-a')] }))
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Bild 2', images: [img('img-b')] }))
    await convs.close(SENDER, id)
    const spy = vi.spyOn(storage, 'loadImage')
    await convs.open(SENDER, VAULT, id)
    expect(spy).not.toHaveBeenCalled()
    await fs.rm(path.join(base, (await import('./storage')).vaultKey(VAULT), id, 'media', 'img-b.jpg.enc'))
    const r = await convs.send(SENDER, VAULT, id, REQ({ question: 'Und?' }))
    // img-a geht mit (von der Platte), img-b fehlt → nichts wird gesendet, ehrlicher Fehler.
    expect(spy).toHaveBeenCalled()
    expect(r.ok && r.messages.at(-1)).toMatchObject({ error: true, content: expect.stringContaining('nicht mehr lesbar') })
    expect(await convs.imageBytes(SENDER, VAULT, id, 'img-b')).toBeNull()
    const o = await convs.open(SENDER, VAULT, id)
    expect(o.ok && o.messages.find(m => m.content === 'Bild 2')?.imagesMissing?.[0].id).toBe('img-b')
    spy.mockRestore()
  })

  it('bekannte Bild-ID: der Main nimmt seine eigenen Bytes, nie mitgeschickte andere (F94)', async () => {
    chatImpl = async () => ({ success: false, error: 'weg' })
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Bild', images: [img('img-a')] }))
    chatImpl = async () => ({ success: true, response: 'ok' })
    const other = Buffer.from(JPEG); other[other.length - 3] = 0x77
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Bild', images: [{ ...img('img-a'), dataBase64: other.toString('base64') }] }))
    expect(chatCalls.at(-1)!.images[0].dataBase64).toBe(JPEG.toString('base64'))
  })
})

describe('update: Titel, Anheften, Archivieren', () => {
  it('Merkmale werden gespeichert und überstehen Schließen und Öffnen; fehlende Felder bleiben', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Frage' }))
    await convs.update(SENDER, VAULT, id, { pinned: true })
    await convs.update(SENDER, VAULT, id, { archived: true })
    await convs.update(SENDER, VAULT, id, { title: 'Titel' })
    // Archivieren hat das Anheften gelöst (Design F14).
    expect((await storage.list(VAULT))[0]).toMatchObject({ header: { archived: true, title: 'Titel' } })
    await convs.close(SENDER, id)
    await convs.open(SENDER, VAULT, id)
    await convs.update(SENDER, VAULT, id, { archived: false })
    await convs.update(SENDER, VAULT, id, { pinned: true })
    expect((await storage.list(VAULT))[0]).toMatchObject({ header: { pinned: true, title: 'Titel' } })
    expect((await storage.list(VAULT))[0]).not.toMatchObject({ header: { archived: true } })
  })
})

describe('Design F14: Archivieren löst das Anheften', () => {
  it('ein angeheftetes Gespräch verliert beim Archivieren das Anheften und läuft danach normal ab', async () => {
    const { id } = created(convs, SENDER, VAULT)
    await convs.send(SENDER, VAULT, id, REQ({ question: 'Frage' }))
    await convs.update(SENDER, VAULT, id, { pinned: true })
    await convs.update(SENDER, VAULT, id, { archived: true })
    const h = (await storage.list(VAULT))[0]
    expect(h).toMatchObject({ header: { archived: true } })
    expect(h.kind === 'chat' && h.header.pinned).toBeFalsy()
  })
})
