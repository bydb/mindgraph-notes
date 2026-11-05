import { describe, it, expect } from 'vitest'
import type { PetrolChatMessage } from './petrolChat'
import type { WebChatResult } from './webChat'
import {
  buildStoredChat,
  chatHeader,
  chatTitle,
  imageIdsIn,
  isChatExpired,
  normalizeRetention,
  parseStoredChat,
  restoreMessage,
  sanitizeChatTitle,
  STORED_CHAT_VERSION,
  StoredChatError,
  toStoredMessage,
  trimToTurns
} from './petrolChatStored'

// Datenvertrag gespeicherter Gespräche (Rev. 2 Punkt 1, Rev. 3 Punkt 9, Rev. 8 Schritt 1).

const CHAT_ID = 'a'.repeat(32)

const source = (n: number) => ({
  n, title: `Seite ${n}`, url: `https://example.org/${n}`, host: 'example.org', fetchedAt: '2026-11-04T10:00:00Z',
  excerpt: `GEHEIMER AUSZUG ${n}`, originalChars: 1200, truncated: false, titleFromPage: true
})

const webResult: WebChatResult = {
  kind: 'answer',
  answer: 'Antwort [1].',
  sources: [source(1), source(2)],
  report: {
    refs: [{ n: 1, start: 8, end: 11, valid: true }],
    sentences: [{ start: 0, end: 12, refs: [1], status: 'cited-high', coverage: 0.8, quotes: [] }],
    usedSources: [1],
    summary: { sentences: 1, cited: 1, uncited: 0, low: 0, invalidRefs: 0, quotesNotFound: 0, unchecked: 0 }
  },
  extras: [{ missingNumbers: [], negation: false }],
  failures: [{ host: 'x.org', reason: 'timeout' }],
  notFetched: 2,
  provenance: { searchProvider: 'brave', searchOk: true, fetchAttempts: 3, fetchOk: 2, contactedHosts: ['example.org', 'x.org'], route: 'local', routeLabel: 'qwen' },
  snapshotId: 'f'.repeat(32)
}

const image = { v: 1 as const, id: 'img-1', name: 'whiteboard.jpg', mime: 'image/jpeg' as const, width: 1600, height: 1200, byteLength: 4, dataBase64: 'AAAA' }

const conversation: PetrolChatMessage[] = [
  { role: 'user', content: 'Was steht auf dem Whiteboard?', images: [image], imageDelivery: { 'img-1': { kind: 'image', route: 'local', target: 'qwen3.5:4b' } }, imageRecipients: { 'img-1': ['qwen3.5:4b'] }, at: 1000 },
  { role: 'assistant', content: 'Drei Punkte.', model: 'qwen3.5:4b', at: 2000 },
  { role: 'user', content: 'Wer war Rutherford?', origin: 'web', webQuery: 'Rutherford', at: 3000 },
  { role: 'assistant', content: 'Antwort [1].', origin: 'web', model: 'qwen3.5:4b', web: webResult, at: 4000 },
  { role: 'user', content: 'Und wann?', origin: 'web', followUp: true, followUpSnapshotId: 'f'.repeat(32), at: 5000 },
  { role: 'assistant', content: 'Bruchstück', origin: 'web', stopped: true, model: 'qwen3.5:4b', webPartial: { sources: [source(3)], failures: [], notFetched: 0 }, at: 6000 }
]

describe('toStoredMessage', () => {
  it('lässt Auszüge, Kennungen und Bildbytes weg', () => {
    const stored = conversation.map(toStoredMessage)
    const json = JSON.stringify(stored)
    expect(json).not.toContain('GEHEIMER AUSZUG')
    expect(json).not.toContain('f'.repeat(32))
    expect(json).not.toContain('AAAA')
    expect(json).not.toContain('excerpt')
    expect(json).not.toContain('snapshotId')
    expect(json).not.toContain('dataBase64')
  })

  it('macht aus Kennungen Merkmale (Rev. 3 Punkt 9)', () => {
    const stored = conversation.map(toStoredMessage)
    expect(stored[3].hadSnapshot).toBe(true)
    expect(stored[4].wasFollowUp).toBe(true)
    expect(stored[4].followUp).toBe(true)
    expect(stored[2].hadSnapshot).toBeUndefined()
  })

  it('übernimmt kein unbekanntes Laufzeitfeld (F01)', () => {
    const m = { role: 'user', content: 'x', at: 1, neuesGeheimfeld: 'Mailtext' } as unknown as PetrolChatMessage
    expect(JSON.stringify(toStoredMessage(m))).not.toContain('Mailtext')
  })

  it('behält Anzeige-Angaben: Quellen ohne Auszug, Prüfbericht, Bildmarke, Bruchstück', () => {
    const stored = conversation.map(toStoredMessage)
    expect(stored[3].web?.sources[0]).toEqual({ n: 1, title: 'Seite 1', url: 'https://example.org/1', host: 'example.org', fetchedAt: '2026-11-04T10:00:00Z', originalChars: 1200, truncated: false, titleFromPage: true })
    expect(stored[3].web?.report?.usedSources).toEqual([1])
    expect(stored[0].images?.[0]).toEqual({ v: 1, id: 'img-1', name: 'whiteboard.jpg', mime: 'image/jpeg', width: 1600, height: 1200, byteLength: 4 })
    expect(stored[5].stopped).toBe(true)
    expect(stored[5].webPartial?.sources[0].title).toBe('Seite 3')
  })
})

describe('parseStoredChat', () => {
  const chat = () => JSON.parse(JSON.stringify(buildStoredChat({ id: CHAT_ID, createdAt: 500 }, conversation, 9999)))

  it('nimmt ein selbst geschriebenes Gespräch an', () => {
    const parsed = parseStoredChat(chat())
    expect(parsed).not.toBeNull()
    expect(parsed!.messages).toHaveLength(6)
    expect(parsed!.version).toBe(STORED_CHAT_VERSION)
  })

  it('lehnt das ganze Gespräch ab, wenn eine Nachricht ungültig ist', () => {
    const c = chat()
    c.messages[1].role = 'system'
    expect(parseStoredChat(c)).toBeNull()
  })

  it('lehnt unbekannte Felder ab — auch einen Auszug, der doch auf der Platte landete', () => {
    const c = chat()
    c.messages[3].web.sources[0].excerpt = 'Auszug'
    expect(parseStoredChat(c)).toBeNull()
    const d = chat()
    d.messages[0].extra = 1
    expect(parseStoredChat(d)).toBeNull()
  })

  it('lehnt falsche Kennungen und Versionen ab', () => {
    expect(parseStoredChat({ ...chat(), id: '../x' })).toBeNull()
    expect(parseStoredChat({ ...chat(), version: 2 })).toBeNull()
    const c = chat()
    c.messages[0].images[0].id = '../../etc'
    expect(parseStoredChat(c)).toBeNull()
  })

  it('lehnt Bildbytes im JSON ab', () => {
    const c = chat()
    c.messages[0].images[0].dataBase64 = 'AAAA'
    expect(parseStoredChat(c)).toBeNull()
  })

  it('lehnt Nicht-Objekte ab', () => {
    expect(parseStoredChat(null)).toBeNull()
    expect(parseStoredChat('x')).toBeNull()
    expect(parseStoredChat([])).toBeNull()
  })
})

describe('restoreMessage', () => {
  it('setzt Auszüge leer, behält Merkmale, holt Bildbytes', () => {
    const stored = conversation.map(toStoredMessage)
    const back = stored.map(m => restoreMessage(m, id => (id === 'img-1' ? 'BBBB' : null)))
    expect(back[3].web?.sources[0].excerpt).toBe('')
    expect(back[3].web?.snapshotId).toBeUndefined()
    expect(back[3].hadSnapshot).toBe(true)
    expect(back[4].followUpSnapshotId).toBeUndefined()
    expect(back[4].wasFollowUp).toBe(true)
    expect(back[0].images?.[0].dataBase64).toBe('BBBB')
    expect(back[5].webPartial?.sources[0].excerpt).toBe('')
  })

  it('fehlende Bilddatei: kein Bild mit leeren Bytes, sondern benannt (F63)', () => {
    const back = restoreMessage(toStoredMessage(conversation[0]), () => null)
    expect(back.images).toBeUndefined()
    expect(back.imagesMissing).toEqual([{ v: 1, id: 'img-1', name: 'whiteboard.jpg', mime: 'image/jpeg', width: 1600, height: 1200, byteLength: 4 }])
    // Gespeichert bleibt es ein Bild (F71): Kommt die Datei wieder, ist es beim Laden wieder da.
    const again = toStoredMessage(back)
    expect(again.images?.[0].id).toBe('img-1')
    expect(again).not.toHaveProperty('imagesMissing')
    expect(restoreMessage(again, () => 'AAAA').images?.[0].dataBase64).toBe('AAAA')
  })

  it('Rundreise bleibt stabil (speichern → laden → speichern)', () => {
    const once = conversation.map(toStoredMessage)
    const twice = once.map(m => toStoredMessage(restoreMessage(m, () => 'AAAA')))
    expect(twice).toEqual(once)
  })
})

describe('Titel, Kopf und Aufbewahrung', () => {
  it('Titel = erste Frage, gekürzt', () => {
    expect(chatTitle([{ role: 'user', content: '  Hallo\n\nWelt ' }])).toBe('Hallo Welt')
    expect(chatTitle([])).toBe('Neues Gespräch')
    const t = chatTitle([{ role: 'user', content: 'x'.repeat(200) }])
    expect(t.length).toBe(60)
    expect(t.endsWith('…')).toBe(true)
  })

  it('umbenannter Titel bleibt, sonst folgt er der ersten Frage', () => {
    expect(buildStoredChat({ id: CHAT_ID, createdAt: 1, title: 'Mein Titel', titleEdited: true }, conversation, 9).title).toBe('Mein Titel')
    expect(buildStoredChat({ id: CHAT_ID, createdAt: 1, title: 'Alt' }, conversation, 9).title).toBe('Was steht auf dem Whiteboard?')
  })

  it('updatedAt = letzte Nachricht, Modell = letzte Antwort', () => {
    const c = buildStoredChat({ id: CHAT_ID, createdAt: 500 }, conversation, 9999)
    expect(c.updatedAt).toBe(6000)
    expect(c.model).toBe('qwen3.5:4b')
    expect(chatHeader(c)).not.toHaveProperty('messages')
    expect(buildStoredChat({ id: CHAT_ID, createdAt: 500 }, [], 9999).updatedAt).toBe(9999)
  })

  it('Umbenennen: Steuerzeichen raus, nie leer', () => {
    expect(sanitizeChatTitle(' a\u0000b\n c ')).toBe('a b c')
    expect(sanitizeChatTitle('   ')).toBeNull()
    expect(sanitizeChatTitle(3)).toBeNull()
  })

  it('Aufbewahrung', () => {
    const day = 24 * 60 * 60 * 1000
    expect(isChatExpired(0, 90, 91 * day)).toBe(true)
    expect(isChatExpired(0, 90, 89 * day)).toBe(false)
    expect(isChatExpired(0, 0, 10_000 * day)).toBe(false)
    expect(normalizeRetention(365)).toBe(365)
    expect(normalizeRetention(7)).toBe(90)
    expect(normalizeRetention(undefined)).toBe(90)
  })

  it('Bild-IDs eines Gesprächs', () => {
    expect(imageIdsIn(conversation)).toEqual(['img-1'])
  })
})

// Codex Runde 7 (F59, F60, F64, F65, F68)

const deepInfo = {
  queries: [{ text: 'rutherford', origin: 'plan', ok: true, hits: 5 }],
  rejected: [], limited: ['budget'], candidates: 5, picked: 2, searches: 1, fetches: 2, maxPages: 3,
  unused: [], terms: { missing: [], similar: [] },
  hits: [{ title: 'T', host: 'example.org', url: 'https://example.org', round: 1, status: 'read' }]
}

describe('verschachtelte Felder (F59)', () => {
  it('nimmt auch verschachtelt nur bekannte Felder mit', () => {
    const web = {
      ...webResult,
      deep: { ...deepInfo, excerpt: 'AUSZUG-DEEP', hits: [{ ...deepInfo.hits[0], excerpt: 'AUSZUG-HIT' }] },
      report: { ...webResult.report!, snapshotId: 'KENNUNG-REPORT', sentences: [{ ...webResult.report!.sentences[0], excerpt: 'AUSZUG-SATZ' }] },
      extras: [{ missingNumbers: [], negation: false, dataBase64: 'BYTES-EXTRA' }],
      provenance: { ...webResult.provenance, snapshotId: 'KENNUNG-PROV' },
      skipped: [{ host: 'deepl.com', category: 'translator', count: 1, excerpt: 'AUSZUG-SKIP' }]
    } as unknown as WebChatResult
    const msg = { role: 'assistant', content: 'x', at: 1, web, imageDelivery: { 'img-1': { kind: 'image', route: 'local', target: 'q', dataBase64: 'BYTES-DELIVERY' } } } as unknown as PetrolChatMessage
    const json = JSON.stringify(toStoredMessage(msg))
    for (const bad of ['AUSZUG-DEEP', 'AUSZUG-HIT', 'KENNUNG-REPORT', 'AUSZUG-SATZ', 'BYTES-EXTRA', 'KENNUNG-PROV', 'AUSZUG-SKIP', 'BYTES-DELIVERY']) expect(json).not.toContain(bad)
    expect(json).toContain('rutherford')
  })

  it('gebautes Gespräch mit gründlicher Suche lädt wieder', () => {
    const msgs: PetrolChatMessage[] = [conversation[2], { ...conversation[3], web: { ...webResult, deep: deepInfo } as unknown as WebChatResult }]
    const c = buildStoredChat({ id: CHAT_ID, createdAt: 1 }, msgs, 9)
    expect(parseStoredChat(JSON.parse(JSON.stringify(c)))?.messages[1].web?.deep?.queries[0].text).toBe('rutherford')
  })
})

describe('verschachtelte Prüfung beim Laden (F60)', () => {
  const answer = (web: Record<string, unknown>) => ({
    version: 1, id: CHAT_ID, title: 't', createdAt: 1, updatedAt: 1,
    messages: [{ role: 'user', content: 'q', at: 1 }, { role: 'assistant', content: 'x', at: 2, web: { ...JSON.parse(JSON.stringify(toStoredMessage(conversation[3]).web)), ...web } }]
  })
  it('gültige Webantwort lädt', () => {
    expect(parseStoredChat(answer({}))).not.toBeNull()
  })
  it.each([
    ['deep leer', { deep: {} }],
    ['extras mit null', { extras: [null] }],
    ['Satz null', { report: { refs: [], sentences: [null], usedSources: [], summary: {} } }],
    ['Zusammenfassung leer', { report: { refs: [], sentences: [], usedSources: [], summary: {} } }],
    ['falscher Status', { report: { ...webResult.report!, sentences: [{ ...webResult.report!.sentences[0], status: 'belegt' }] } }],
    ['übersprungen ohne Kategorie', { skipped: [{ host: 'x', count: 1 }] }]
  ])('lehnt ab: %s', (_name, web) => {
    expect(parseStoredChat(answer(web))).toBeNull()
  })
})

describe('geerbte Schlüssel (F68)', () => {
  const base = () => JSON.stringify(buildStoredChat({ id: CHAT_ID, createdAt: 500 }, conversation, 9999))
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])('lehnt %s am Kopf, an Nachricht und Quelle ab', key => {
    const inject = (json: string, at: string) => json.replace(at, `${at}"${key}":{"excerpt":"x"},`)
    expect(parseStoredChat(JSON.parse(inject(base(), '{')))).toBeNull()
    expect(parseStoredChat(JSON.parse(inject(base(), '"messages":[{')))).toBeNull()
    expect(parseStoredChat(JSON.parse(inject(base(), '"sources":[{')))).toBeNull()
  })
  it('Bildschlüssel in imageDelivery müssen Bild-IDs sein', () => {
    const c = JSON.parse(base())
    c.messages[0].imageDelivery = JSON.parse('{"__proto__":{"kind":"rejected","reason":"x"}}')
    expect(parseStoredChat(c)).toBeNull()
    const d = JSON.parse(base())
    d.messages[0].images[0].id = '__proto__'
    expect(parseStoredChat(d)).toBeNull()
  })
})

describe('Wechselgrenzen (F64)', () => {
  it('kürzt nie zwischen Frage und Antwort', () => {
    const msgs = Array.from({ length: 2001 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant' as const, content: String(i), at: i }))
    const t = trimToTurns(msgs)
    expect(t[0].role).toBe('user')
    expect(t.length).toBeLessThanOrEqual(2000)
  })
  it('gebautes langes Gespräch beginnt mit einer Frage und lädt', () => {
    const msgs: PetrolChatMessage[] = []
    for (let i = 0; i < 1001; i++) {
      if (i % 7 === 3) msgs.push({ role: 'user', content: `gestoppt ${i}`, stopped: true, at: i * 10 })
      msgs.push({ role: 'user', content: `F${i}`, at: i * 10 + 1 })
      msgs.push({ role: 'assistant', content: `A${i}`, ...(i % 5 === 0 ? { error: true } : {}), at: i * 10 + 2 })
    }
    const c = buildStoredChat({ id: CHAT_ID, createdAt: 0 }, msgs, 1)
    expect(c.messages[0].role).toBe('user')
    expect(parseStoredChat(JSON.parse(JSON.stringify(c)))).not.toBeNull()
  })
  it('lehnt eine Antwort am Anfang und zwei Antworten hintereinander ab', () => {
    const head = { version: 1, id: CHAT_ID, title: 't', createdAt: 1, updatedAt: 1 }
    expect(parseStoredChat({ ...head, messages: [{ role: 'assistant', content: 'a', at: 1 }] })).toBeNull()
    expect(parseStoredChat({ ...head, messages: [{ role: 'user', content: 'q', at: 1 }, { role: 'assistant', content: 'a', at: 2 }, { role: 'assistant', content: 'b', at: 3 }] })).toBeNull()
    expect(parseStoredChat({ ...head, messages: [{ role: 'user', content: 'q', at: 1, stopped: true }, { role: 'user', content: 'q2', at: 2 }, { role: 'assistant', content: 'a', at: 3 }] })).not.toBeNull()
    // Zwei Fragen hintereinander ohne Stopp: die erste stünde als offene Frage im Verlauf (F69).
    expect(parseStoredChat({ ...head, messages: [{ role: 'user', content: 'q', at: 1 }, { role: 'user', content: 'q2', at: 2 }, { role: 'assistant', content: 'a', at: 3 }] })).toBeNull()
    expect(parseStoredChat({ ...head, messages: [{ role: 'user', content: 'q', at: 1 }] })).not.toBeNull()
  })
})

describe('doppelte Bild-IDs (F65, F77)', () => {
  const second: PetrolChatMessage[] = [{ role: 'user', content: 'noch eins', images: [{ ...image, byteLength: 99, dataBase64: 'CCCC' }], at: 7000 }]
  it('„Erneut senden“ mit demselben Bild ist EIN geteiltes Bild (F77)', () => {
    const retry: PetrolChatMessage[] = [
      { role: 'user', content: 'Was steht hier?', images: [image], at: 1 },
      { role: 'assistant', content: 'Modell nicht erreichbar', error: true, at: 2 },
      { role: 'user', content: 'Was steht hier?', images: [image], at: 3 },
      { role: 'assistant', content: 'Drei Punkte.', at: 4 }
    ]
    const c = buildStoredChat({ id: CHAT_ID, createdAt: 1 }, retry, 9)
    expect(parseStoredChat(JSON.parse(JSON.stringify(c)))).not.toBeNull()
    expect(imageIdsIn(c.messages)).toEqual(['img-1'])
  })
  it('Bauen wirft, wenn unter einer ID zwei verschiedene Bilder stehen', () => {
    expect(() => buildStoredChat({ id: CHAT_ID, createdAt: 1 }, [...conversation, ...second], 9)).toThrow(StoredChatError)
  })
  it('Laden lehnt ab', () => {
    const c = JSON.parse(JSON.stringify(buildStoredChat({ id: CHAT_ID, createdAt: 1 }, conversation, 9)))
    c.messages.push({ role: 'user', content: 'noch eins', images: [{ ...c.messages[0].images[0], width: 800 }], at: 7000 })
    expect(parseStoredChat(c)).toBeNull()
  })
})

describe('Anheften und Archivieren (Nutzer 05.11.2026)', () => {
  it('Merkmale gehen in Kopf und Datei und laden wieder; ohne Merkmale bleibt es wie bisher', () => {
    const c = buildStoredChat({ id: CHAT_ID, createdAt: 1, pinned: true, archived: true }, conversation, 9)
    expect(chatHeader(c)).toMatchObject({ pinned: true, archived: true })
    expect(parseStoredChat(JSON.parse(JSON.stringify(c)))).toMatchObject({ pinned: true, archived: true })
    const plain = buildStoredChat({ id: CHAT_ID, createdAt: 1 }, conversation, 9)
    expect(plain).not.toHaveProperty('pinned')
    expect(plain).not.toHaveProperty('archived')
    expect(parseStoredChat({ ...JSON.parse(JSON.stringify(plain)), pinned: false })).toBeNull()
  })
})
