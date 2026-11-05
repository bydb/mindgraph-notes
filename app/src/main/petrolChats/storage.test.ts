import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { PetrolChatStorage, ChatStorageError, CHAT_FILE_MAX_BYTES, matchesImage, vaultKey, type ChatCrypto, type ChatStorageUnavailable } from './storage'
import { buildStoredChat, restoreMessage } from '../../shared/petrolChatStored'
import type { PetrolChatMessage } from '../../shared/petrolChat'

// Ablage gespeicherter Gespräche (Rev. 2 Punkt 2, Rev. 8 Schritt 2).

function seg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2
  return [0xff, marker, len >> 8, len & 0xff, ...payload]
}
function jpeg(opts: { app1?: boolean } = {}): string {
  const sof = seg(0xc0, [8, 0, 10, 0, 20, 1, 1, 0x11, 0])
  const app1 = seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0])
  const sos = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]
  return Buffer.from([0xff, 0xd8, ...(opts.app1 ? app1 : []), ...sof, ...sos]).toString('base64')
}
const IMG = jpeg()
const IMG_LEN = Buffer.from(IMG, 'base64').length

/** Umkehrbare Testverschlüsselung mit Kennung — Klartext darf nie in einer Datei stehen. */
class FakeCrypto implements ChatCrypto {
  reason: ChatStorageUnavailable | null = null
  key = 7
  encrypt(plain: string): Buffer {
    const b = Buffer.from(plain, 'utf-8')
    return Buffer.concat([Buffer.from('ENC'), Buffer.from(b.map(x => x ^ this.key))])
  }
  decrypt(data: Buffer): string {
    if (data.subarray(0, 3).toString() !== 'ENC') throw new Error('kein Chiffrat')
    return Buffer.from(data.subarray(3).map(x => x ^ this.key)).toString('utf-8')
  }
  unavailableReason() { return this.reason }
}

let base: string
let crypto: FakeCrypto
let now: number
let seq: number
let store: PetrolChatStorage
const VAULT = '/Users/x/Vault'
const DAY = 24 * 60 * 60 * 1000

const id = (n: number) => n.toString(16).padStart(32, '0')

function chat(n: number, msgs: PetrolChatMessage[], createdAt = now) {
  return buildStoredChat({ id: id(n), createdAt }, msgs, now)
}
const turn = (q: string, at: number): PetrolChatMessage[] => [
  { role: 'user', content: q, at },
  { role: 'assistant', content: `Antwort auf ${q}`, model: 'qwen', at: at + 1 }
]
const withImage = (at: number): PetrolChatMessage[] => [
  { role: 'user', content: 'Was steht hier?', images: [{ v: 1, id: 'img-a', name: 'foto.jpg', mime: 'image/jpeg', width: 20, height: 10, byteLength: IMG_LEN, dataBase64: IMG }], at },
  { role: 'assistant', content: 'Text', at: at + 1 }
]

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-petrol-chats-'))
  crypto = new FakeCrypto()
  now = 100 * DAY
  seq = 0
  store = new PetrolChatStorage(base, crypto, () => now, () => (++seq).toString(16).padStart(32, 'a'))
})
afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

async function allFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(p, ...(await allFiles(p)))
    else out.push(p)
  }
  return out
}

describe('Speichern und Laden', () => {
  it('Rundreise mit Bild; Ordner je Vault und Gespräch', async () => {
    const c = chat(1, withImage(now - 10))
    expect(await store.save(VAULT, c, { 'img-a': IMG })).toBe(true)
    const dir = path.join(base, vaultKey(VAULT), id(1))
    expect((await fs.readdir(dir)).sort()).toEqual(['chat.json.enc', 'media'])
    expect(await fs.readdir(path.join(dir, 'media'))).toEqual(['img-a.jpg.enc'])
    const r = await store.load(VAULT, id(1))
    expect(r.kind).toBe('chat')
    if (r.kind !== 'chat') return
    expect(r.chat).toEqual(c)
    expect(r.images).toEqual({ 'img-a': IMG })
    expect(restoreMessage(r.chat.messages[0], i => r.images[i] ?? null).images?.[0].dataBase64).toBe(IMG)
  })

  it('kein Klartext und kein Bild unverschlüsselt auf der Platte', async () => {
    await store.save(VAULT, chat(1, withImage(now)), { 'img-a': IMG })
    for (const f of await allFiles(base)) {
      const st = await fs.stat(f)
      if (st.isDirectory()) continue
      const raw = await fs.readFile(f)
      expect(raw.subarray(0, 3).toString()).toBe('ENC')
      expect(raw.includes(Buffer.from('Was steht hier'))).toBe(false)
      expect(raw.includes(Buffer.from(IMG))).toBe(false)
    }
  })

  it('Rechte: Ordner 0700, Dateien 0600, keine Temp-Reste', async () => {
    await store.save(VAULT, chat(1, withImage(now)), { 'img-a': IMG })
    for (const f of await allFiles(base)) {
      const st = await fs.stat(f)
      expect(st.mode & 0o777).toBe(st.isDirectory() ? 0o700 : 0o600)
      expect(f.endsWith('.tmp')).toBe(false)
    }
  })

  it('schreibt nur bei geändertem Inhalt — auch nach Neustart der Ablage', async () => {
    const c = chat(1, turn('a', now))
    expect(await store.save(VAULT, c, {})).toBe(true)
    expect(await store.save(VAULT, c, {})).toBe(false)
    const fresh = new PetrolChatStorage(base, crypto, () => now)
    expect(await fresh.save(VAULT, c, {})).toBe(false)
    expect(await fresh.save(VAULT, chat(1, [...turn('a', now), ...turn('b', now + 5)]), {})).toBe(true)
  })

  it('parallele Speicherungen desselben Gesprächs laufen nacheinander, die letzte gilt', async () => {
    const a = chat(1, turn('a', now))
    const b = chat(1, [...turn('a', now), ...turn('b', now + 5)])
    await Promise.all([store.save(VAULT, a, {}), store.save(VAULT, b, {})])
    const r = await store.load(VAULT, id(1))
    expect(r.kind === 'chat' && r.chat.messages.length).toBe(4)
  })

  it('Bild ohne Bytes oder mit Metadaten wird nicht geschrieben und fehlt beim Laden (F63)', async () => {
    await store.save(VAULT, chat(1, withImage(now)), {})
    const r = await store.load(VAULT, id(1))
    expect(r.kind === 'chat' && r.images).toEqual({})
    if (r.kind === 'chat') expect(restoreMessage(r.chat.messages[0], i => r.images[i] ?? null).imagesMissing?.[0].id).toBe('img-a')
    await store.save(VAULT, chat(2, withImage(now)), { 'img-a': jpeg({ app1: true }) })
    const r2 = await store.load(VAULT, id(2))
    expect(r2.kind === 'chat' && r2.images).toEqual({})
  })

  it('kaputte Bilddatei gilt als fehlend, nicht als Gespräch „nicht lesbar“', async () => {
    await store.save(VAULT, chat(1, withImage(now)), { 'img-a': IMG })
    await fs.writeFile(path.join(base, vaultKey(VAULT), id(1), 'media', 'img-a.jpg.enc'), 'Müll')
    const r = await store.load(VAULT, id(1))
    expect(r.kind).toBe('chat')
    expect(r.kind === 'chat' && r.images).toEqual({})
  })

  it('Vaults sind getrennt', async () => {
    await store.save(VAULT, chat(1, turn('a', now)), {})
    expect((await store.list('/Users/x/Anderer')).length).toBe(0)
    expect((await store.load('/Users/x/Anderer', id(1))).kind).toBe('missing')
  })

  it('lehnt ungültige IDs ab, bevor ein Pfad gebaut wird', async () => {
    await expect(store.load(VAULT, '../../etc')).rejects.toBeInstanceOf(ChatStorageError)
    await expect(store.delete(VAULT, '..')).rejects.toBeInstanceOf(ChatStorageError)
  })

  it('lehnt ein Gespräch außerhalb des Vertrags ab', async () => {
    const bad = { ...chat(1, turn('a', now)), title: 5 } as unknown as ReturnType<typeof chat>
    await expect(store.save(VAULT, bad, {})).rejects.toMatchObject({ code: 'invalid-chat' })
  })
})

describe('ohne Schlüssel und nicht lesbar', () => {
  it('ohne Schlüssel wird nicht gespeichert, nie Klartext', async () => {
    crypto.reason = 'basic-text'
    expect(store.unavailableReason()).toBe('basic-text')
    await expect(store.save(VAULT, chat(1, turn('a', now)), {})).rejects.toMatchObject({ code: 'basic-text' })
    expect(await allFiles(base)).toEqual([])
  })

  it('fremder Schlüssel: Gespräch „nicht lesbar“, gelistet, nicht überschrieben, löschbar', async () => {
    await store.save(VAULT, chat(1, turn('a', now)), {})
    const other = new FakeCrypto()
    other.key = 9
    const s2 = new PetrolChatStorage(base, Object.assign(other, { decrypt: () => { throw new Error('Schlüssel') } }), () => now)
    expect(await s2.list(VAULT)).toEqual([{ kind: 'unreadable', id: id(1), modifiedAt: expect.any(Number) }])
    expect((await s2.load(VAULT, id(1))).kind).toBe('unreadable')
    await expect(s2.save(VAULT, chat(1, turn('neu', now)), {})).rejects.toMatchObject({ code: 'unreadable' })
    await s2.delete(VAULT, id(1))
    expect(await s2.list(VAULT)).toEqual([])
  })

  it('Datei mit ungültigem Inhalt oder falscher ID im Kopf: nicht lesbar', async () => {
    await store.save(VAULT, chat(1, turn('a', now)), {})
    const dir2 = path.join(base, vaultKey(VAULT), id(2))
    await fs.mkdir(dir2)
    await fs.copyFile(path.join(base, vaultKey(VAULT), id(1), 'chat.json.enc'), path.join(dir2, 'chat.json.enc'))
    expect((await store.load(VAULT, id(2))).kind).toBe('unreadable')
    await fs.writeFile(path.join(base, vaultKey(VAULT), id(1), 'chat.json.enc'), crypto.encrypt('{"version":1}'))
    expect((await store.load(VAULT, id(1))).kind).toBe('unreadable')
  })
})

describe('Liste, Löschen, Aufräumen', () => {
  it('Liste neueste oben, nur Köpfe', async () => {
    await store.save(VAULT, chat(1, turn('alt', now - 100)), {})
    await store.save(VAULT, chat(2, turn('neu', now)), {})
    const l = await store.list(VAULT)
    expect(l.map(e => (e.kind === 'chat' ? e.header.title : ''))).toEqual(['neu', 'alt'])
    expect(l[0].kind === 'chat' && 'messages' in l[0].header).toBe(false)
  })

  it('alle löschen entfernt den Vault-Ordner', async () => {
    await store.save(VAULT, chat(1, withImage(now)), { 'img-a': IMG })
    await store.save(VAULT, chat(2, turn('b', now)), {})
    await store.deleteAll(VAULT)
    expect(await fs.readdir(base)).toEqual([])
  })

  it('räumt Abgelaufene, Absturzreste, fremde Einträge, Temp-Dateien und verwaiste Bilder auf', async () => {
    await store.save(VAULT, chat(1, turn('alt', now - 91 * DAY), now - 91 * DAY), {})
    await store.save(VAULT, chat(2, withImage(now)), { 'img-a': IMG })
    await store.save(VAULT, chat(3, turn('offen, alt', now - 200 * DAY), now - 200 * DAY), {})
    const vdir = path.join(base, vaultKey(VAULT))
    await fs.mkdir(path.join(vdir, id(4)))                         // Absturzrest ohne chat.json.enc
    await fs.mkdir(path.join(vdir, 'fremd'))                       // kein Gesprächsordner
    await fs.writeFile(path.join(vdir, id(2), 'chat.json.enc.x.tmp'), 'x')
    await fs.writeFile(path.join(vdir, id(2), 'media', 'img-alt.jpg.enc'), 'x')
    const r = await store.cleanup(VAULT, 90, new Set([id(3)]))
    expect(r).toEqual({ expired: 1, leftovers: 2, orphanFiles: 2 })
    expect((await fs.readdir(vdir)).sort()).toEqual([id(2), id(3)])
    expect(await fs.readdir(path.join(vdir, id(2), 'media'))).toEqual(['img-a.jpg.enc'])
  })

  it('„nie löschen“ behält alles; nicht Lesbares läuft nach Dateizeit ab', async () => {
    await store.save(VAULT, chat(1, turn('alt', now - 400 * DAY), now - 400 * DAY), {})
    expect((await store.cleanup(VAULT, 0)).expired).toBe(0)
    const file = path.join(base, vaultKey(VAULT), id(1), 'chat.json.enc')
    await fs.writeFile(file, 'kaputt')
    const old = new Date(now - 100 * DAY)
    await fs.utimes(file, old, old)
    expect((await store.cleanup(VAULT, 90)).expired).toBe(1)
  })
})

// Codex Runde 8 (F70–F76)

const chatFile = (n: number) => path.join(base, vaultKey(VAULT), id(n), 'chat.json.enc')
const mediaFile = (n: number) => path.join(base, vaultKey(VAULT), id(n), 'media', 'img-a.jpg.enc')

describe('„unverändert“ nur bei unveränderter Datei (F70)', () => {
  it('beschädigte Datei nach dem Speichern: dieselbe Instanz überschreibt nicht und meldet nicht „unverändert“', async () => {
    const c = chat(1, turn('a', now))
    await store.save(VAULT, c, {})
    await fs.writeFile(chatFile(1), 'kaputt')
    await expect(store.save(VAULT, c, {})).rejects.toMatchObject({ code: 'unreadable' })
    await expect(store.save(VAULT, chat(1, [...turn('a', now), ...turn('b', now + 5)]), {})).rejects.toMatchObject({ code: 'unreadable' })
    expect((await fs.readFile(chatFile(1))).toString()).toBe('kaputt')
  })
  it('Schlüsselwechsel nach dem Speichern: nicht überschrieben', async () => {
    const c = chat(1, turn('a', now))
    await store.save(VAULT, c, {})
    const before = await fs.readFile(chatFile(1))
    crypto.key = 11
    await fs.writeFile(chatFile(1), Buffer.concat([before, Buffer.from(' ')]))   // andere Größe/Zeit
    await expect(store.save(VAULT, chat(1, [...turn('a', now), ...turn('b', now + 5)]), {})).rejects.toMatchObject({ code: 'unreadable' })
  })
})

describe('Bilder nachtragen und nie verlieren (F71)', () => {
  it('erst ohne Bytes gespeichert, dann mit: Bild wird nachgetragen, auch bei unverändertem Gespräch', async () => {
    const c = chat(1, withImage(now))
    await store.save(VAULT, c, {})
    expect(await store.save(VAULT, c, { 'img-a': IMG })).toBe(true)
    const r = await store.load(VAULT, id(1))
    expect(r.kind === 'chat' && r.images).toEqual({ 'img-a': IMG })
    expect(await store.save(VAULT, c, { 'img-a': IMG })).toBe(false)
  })
  it('vorübergehender Lesefehler: nach Laden und Speichern bleibt die Datei, das Bild kommt wieder', async () => {
    await store.save(VAULT, chat(1, withImage(now)), { 'img-a': IMG })
    const good = await fs.readFile(mediaFile(1))
    await fs.writeFile(mediaFile(1), 'gerade nicht lesbar')
    const r = await store.load(VAULT, id(1))
    if (r.kind !== 'chat') throw new Error('nicht geladen')
    const msgs = r.chat.messages.map(m => restoreMessage(m, i => r.images[i] ?? null))
    expect(msgs[0].imagesMissing?.[0].id).toBe('img-a')
    await store.save(VAULT, buildStoredChat({ id: id(1), createdAt: r.chat.createdAt }, [...msgs, ...turn('weiter', now + 5)], now), {})
    expect((await store.cleanup(VAULT, 90)).orphanFiles).toBe(0)
    await fs.writeFile(mediaFile(1), good)
    const again = await store.load(VAULT, id(1))
    expect(again.kind === 'chat' && again.images).toEqual({ 'img-a': IMG })
  })
  it('kaputte Datei wird durch passende Bytes ersetzt', async () => {
    await store.save(VAULT, chat(1, withImage(now)), { 'img-a': IMG })
    await fs.writeFile(mediaFile(1), 'kaputt')
    expect(await store.save(VAULT, chat(1, withImage(now)), { 'img-a': IMG })).toBe(true)
    const r = await store.load(VAULT, id(1))
    expect(r.kind === 'chat' && r.images).toEqual({ 'img-a': IMG })
  })
})

describe('eine Kette je Vault (F72)', () => {
  it('„alle löschen“ und gleichzeitiges Speichern: Reihenfolge gilt, nichts meldet „gespeichert“ und ist weg', async () => {
    await store.save(VAULT, chat(1, turn('a', now)), {})
    const before = store.save(VAULT, chat(2, turn('vorher', now)), {})
    const wipe = store.deleteAll(VAULT)
    const after = store.save(VAULT, chat(3, turn('nachher', now)), {})
    await Promise.all([before, wipe, after])
    const l = await store.list(VAULT)
    expect(l.map(e => (e.kind === 'chat' ? e.header.id : ''))).toEqual([id(3)])
  })
})

describe('Bildbytes passen zu den Angaben (F74)', () => {
  const meta = { v: 1 as const, id: 'img-a', name: 'x', mime: 'image/jpeg' as const, width: 20, height: 10, byteLength: IMG_LEN }
  it('Maße, Länge, Metadaten', () => {
    expect(matchesImage(IMG, meta)).toBe(true)
    expect(matchesImage(IMG, { ...meta, width: 21 })).toBe(false)
    expect(matchesImage(IMG, { ...meta, byteLength: IMG_LEN + 1 })).toBe(false)
    expect(matchesImage(jpeg({ app1: true }), { ...meta, byteLength: Buffer.from(jpeg({ app1: true }), 'base64').length })).toBe(false)
    expect(matchesImage('A'.repeat(5_000_000), meta)).toBe(false)
  })
  it('unpassende Bytes werden nicht geschrieben; ein vertauschtes Bild auf der Platte fehlt beim Laden', async () => {
    const wrongSize = jpeg({ app1: true })
    await store.save(VAULT, chat(1, withImage(now)), { 'img-a': wrongSize })
    expect(await fs.readdir(path.join(base, vaultKey(VAULT), id(1)))).toEqual(['chat.json.enc'])
    await store.save(VAULT, chat(2, withImage(now)), { 'img-a': IMG })
    // Ein Bild mit anderen Maßen unter derselben ID:
    const swapped = Buffer.from(IMG, 'base64')
    swapped[swapped.indexOf(Buffer.from([0xff, 0xc0])) + 8] = 30
    await fs.writeFile(mediaFile(2), crypto.encrypt(swapped.toString('base64')))
    const r = await store.load(VAULT, id(2))
    expect(r.kind === 'chat' && r.images).toEqual({})
  })
})

describe('Größe vor dem Lesen (F75)', () => {
  it('übergroße Gesprächsdatei gilt als nicht lesbar', async () => {
    await store.save(VAULT, chat(1, turn('a', now)), {})
    await fs.truncate(chatFile(1), CHAT_FILE_MAX_BYTES + 1)
    expect((await store.load(VAULT, id(1))).kind).toBe('unreadable')
  })
  it('ein zu großes Gespräch wird nicht gespeichert', async () => {
    const big = chat(1, turn('x'.repeat(CHAT_FILE_MAX_BYTES), now))
    await expect(store.save(VAULT, big, {})).rejects.toMatchObject({ code: 'too-large' })
  })
})

describe('Aufbewahrung und Anheften (Nutzer 05.11.2026)', () => {
  it('angeheftete Gespräche laufen nicht ab, archivierte schon', async () => {
    const old = now - 200 * DAY
    await store.save(VAULT, buildStoredChat({ id: id(1), createdAt: old, pinned: true }, turn('angeheftet', old), old), {})
    await store.save(VAULT, buildStoredChat({ id: id(2), createdAt: old, archived: true }, turn('archiviert', old), old), {})
    const r = await store.cleanup(VAULT, 90)
    expect(r.expired).toBe(1)
    expect((await store.list(VAULT)).map(e => e.kind === 'chat' ? e.header.id : e.id)).toEqual([id(1)])
  })
})

describe('Design F14: angeheftet UND archiviert (alte Datei) läuft ab', () => {
  it('die Ausnahme gilt nur für angeheftete, nicht archivierte Gespräche', async () => {
    const old = now - 200 * DAY
    await store.save(VAULT, buildStoredChat({ id: id(1), createdAt: old, pinned: true, archived: true }, turn('beides', old), old), {})
    expect((await store.cleanup(VAULT, 90)).expired).toBe(1)
  })
})
