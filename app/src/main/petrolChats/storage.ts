// Ablage gespeicherter Petrol-Gespräche (Teil 1, Rev. 2 Punkt 2, Rev. 8 Schritt 2,
// docs/codex-collab/chat-verlauf-notizen-bilder.md).
//
// userData/petrol-chats/<sha256(vault)[0..16]>/<gespräch-id>/chat.json.enc
//                                                         /media/<bild-id>.jpg.enc
//
// - NICHT im Vault: Der Vault wird synchronisiert und indexiert. Ein Gespräch mit Mail-Inhalt soll
//   weder über den Sync-Server wandern noch im Vault-Chat als Treffer auftauchen.
// - Ein Ordner je Gespräch: Löschen, Aufbewahrung und „alle löschen“ entfernen immer den ganzen
//   Ordner samt Bildern (F13).
// - JSON UND Bilder verschlüsselt (`ChatCrypto`, in der App `safeStorage`). Ordner 0700, Dateien
//   0600. Ohne Schlüssel wird nicht gespeichert — nie ein Klartext-Rückfall (F14). Was sich nicht
//   entschlüsseln oder nicht als Gespräch lesen lässt, gilt als „nicht lesbar“ und wird nur zum
//   Löschen angeboten, nie überschrieben.
// - Schreiben atomar (Temp-Datei + fsync + Rename + fsync des Ordners, F76), nur bei geändertem
//   Inhalt. ALLE Schreibvorgänge eines Vaults laufen über eine Kette (F72): „alle löschen“ kann
//   sich so nicht mit einem Speichern überholen.
//
// Das Modul kennt Electron nicht: Schlüssel, Uhr und ID-Quelle werden eingespielt (Tests).
// Der Aufrufer übergibt den per `realpath` KANONISCHEN, genehmigten Vault-Pfad (Rev. 9 Punkt 26,
// F73) — derselbe Vault über einen Symlink hätte sonst eine zweite Gesprächsliste.

import { createHash, randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { base64ToBytes, CHAT_IMAGE_MAX_BYTES, inspectJpeg } from '../../shared/chatImages'
import {
  CHAT_ID_RE,
  chatHeader,
  imageMetaIn,
  isChatExpired,
  isStoredImageId,
  parseStoredChat,
  type ChatRetentionDays,
  type StoredChat,
  type StoredChatHeader,
  type StoredChatImage
} from '../../shared/petrolChatStored'

/** Verschlüsselung — in der App `safeStorage` (`electronChatCrypto`). */
export interface ChatCrypto {
  /** null = verfügbar; sonst der Grund, warum nicht gespeichert wird. */
  unavailableReason(): ChatStorageUnavailable | null
  encrypt(plain: string): Buffer
  /** Wirft, wenn der Schlüssel nicht passt oder die Daten kaputt sind. */
  decrypt(data: Buffer): string
}

/** no-encryption = kein Schlüsselspeicher; basic-text = Linux ohne Passwortspeicher (Hyprland). */
export type ChatStorageUnavailable = 'no-encryption' | 'basic-text'

export type ChatListEntry =
  | { kind: 'chat'; header: StoredChatHeader }
  | { kind: 'unreadable'; id: string; modifiedAt: number }

export type ChatLoadResult =
  | { kind: 'chat'; chat: StoredChat; images: Record<string, string> }
  | { kind: 'unreadable' }
  | { kind: 'missing' }

export interface ChatCleanupResult {
  expired: number
  /** Ordner ohne `chat.json.enc` (Absturzreste) und fremde Einträge. */
  leftovers: number
  /** Bilddateien ohne Verweis im Gespräch und liegengebliebene Temp-Dateien. */
  orphanFiles: number
}

const CHAT_FILE = 'chat.json.enc'
const MEDIA_DIR = 'media'
const MEDIA_EXT = '.jpg.enc'
const DIR_MODE = 0o700
const FILE_MODE = 0o600
/**
 * Obergrenze der verschlüsselten Gesprächsdatei (F75). `decryptString` läuft synchron im Main;
 * eine riesige Datei blockierte beim Öffnen der Liste die App. 2000 Nachrichten mit Prüfbericht
 * liegen weit darunter. Größer = nicht speichern bzw. „nicht lesbar“.
 */
export const CHAT_FILE_MAX_BYTES = 16 * 1024 * 1024
/** Bild verschlüsselt: Base64 (4/3) plus Kopf des Schlüssels. */
const MEDIA_FILE_MAX_BYTES = Math.ceil((CHAT_IMAGE_MAX_BYTES * 4) / 3) + 64 * 1024

export function vaultKey(vaultPath: string): string {
  return createHash('sha256').update(vaultPath).digest('hex').slice(0, 16)
}

export class ChatStorageError extends Error {
  constructor(readonly code: ChatStorageUnavailable | 'invalid-id' | 'unreadable' | 'invalid-chat' | 'too-large', message: string) {
    super(message)
  }
}

/** Was zuletzt geschrieben wurde — „unverändert“ gilt nur, solange die Datei genau diese ist (F70). */
interface WrittenState {
  hash: string
  size: number
  mtimeMs: number
}

export class PetrolChatStorage {
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly written = new Map<string, WrittenState>()

  constructor(
    private readonly baseDir: string,
    private readonly crypto: ChatCrypto,
    private readonly now: () => number = Date.now,
    private readonly randomId: () => string = () => randomBytes(16).toString('hex')
  ) {}

  /** null = es wird gespeichert; sonst der Grund für die Liste („nicht gespeichert, weil …“). */
  unavailableReason(): ChatStorageUnavailable | null {
    try {
      return this.crypto.unavailableReason()
    } catch {
      return 'no-encryption'
    }
  }

  /** Neue Gesprächs-ID — vergibt nur der Main. */
  newChatId(): string {
    const id = this.randomId()
    if (!CHAT_ID_RE.test(id)) throw new ChatStorageError('invalid-id', 'Gesprächs-ID ungültig.')
    return id
  }

  vaultDir(vaultPath: string): string {
    return path.join(this.baseDir, vaultKey(vaultPath))
  }

  private chatDir(vaultPath: string, id: string): string {
    if (!CHAT_ID_RE.test(id)) throw new ChatStorageError('invalid-id', 'Gesprächs-ID ungültig.')
    return path.join(this.vaultDir(vaultPath), id)
  }

  private mediaFile(dir: string, imageId: string): string {
    if (!isStoredImageId(imageId)) throw new ChatStorageError('invalid-id', 'Bild-ID ungültig.')
    return path.join(dir, MEDIA_DIR, `${imageId}${MEDIA_EXT}`)
  }

  private requireCrypto(): void {
    const reason = this.unavailableReason()
    if (reason) throw new ChatStorageError(reason, 'Gespräche werden auf diesem Rechner nicht gespeichert.')
  }

  /** Eine Kette je Vault für alle Schreibvorgänge (F72). Lesen läuft daneben. */
  private enqueue<T>(vaultPath: string, job: () => Promise<T>): Promise<T> {
    const key = this.vaultDir(vaultPath)
    const previous = this.queues.get(key) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(job)
    const tail = next.catch(() => undefined)
    this.queues.set(key, tail)
    void tail.then(() => { if (this.queues.get(key) === tail) this.queues.delete(key) })
    return next
  }

  /** Alle Gespräche eines Vaults, neueste oben. Nicht lesbare stehen mit Änderungszeit dabei. */
  async list(vaultPath: string): Promise<ChatListEntry[]> {
    const names = await readdirSafe(this.vaultDir(vaultPath))
    const out: ChatListEntry[] = []
    for (const id of names) {
      if (!CHAT_ID_RE.test(id)) continue
      const r = await this.readChat(vaultPath, id)
      if (r.kind === 'chat') out.push({ kind: 'chat', header: chatHeader(r.chat) })
      else if (r.kind === 'unreadable') out.push({ kind: 'unreadable', id, modifiedAt: r.modifiedAt })
    }
    const at = (e: ChatListEntry) => (e.kind === 'chat' ? e.header.updatedAt : e.modifiedAt)
    return out.sort((a, b) => at(b) - at(a))
  }

  /** Gespräch samt Bildbytes. Ein fehlendes, kaputtes oder unpassendes Bild fehlt in `images` (F63, F74). */
  async load(vaultPath: string, id: string, opts: { media?: boolean } = {}): Promise<ChatLoadResult> {
    const dir = this.chatDir(vaultPath, id)
    const r = await this.readChat(vaultPath, id)
    if (r.kind !== 'chat') return r.kind === 'unreadable' ? { kind: 'unreadable' } : { kind: 'missing' }
    const images: Record<string, string> = {}
    // Ohne Medien: die Bilder liest erst `loadImage`, wenn eines gebraucht wird (F91).
    if (opts.media === false) return { kind: 'chat', chat: r.chat, images }
    for (const meta of imageMetaIn(r.chat.messages).meta.values()) {
      const data = await this.readMedia(dir, meta)
      if (data) images[meta.id] = data
    }
    return { kind: 'chat', chat: r.chat, images }
  }

  /** Ein einzelnes Bild eines Gesprächs — nur, wenn es zu den Angaben passt (F74). */
  async loadImage(vaultPath: string, id: string, meta: StoredChatImage): Promise<string | null> {
    return this.readMedia(this.chatDir(vaultPath, id), meta)
  }

  /**
   * Schreibt Gespräch und Bilder. Ein Bild wird geschrieben, wenn seine Datei fehlt oder nicht
   * (mehr) zu seinen Angaben passt UND `images` passende Bytes liefert (F71) — eine Datei wird
   * also nur durch nachweislich dasselbe Bild ersetzt. Ein als „nicht lesbar“ vorgefundenes
   * Gespräch wird nie überschrieben.
   * Rückgabe: true = etwas geschrieben, false = alles unverändert.
   */
  async save(vaultPath: string, chat: StoredChat, images: Readonly<Record<string, string>>): Promise<boolean> {
    const dir = this.chatDir(vaultPath, chat.id)
    return this.enqueue(vaultPath, async () => {
      this.requireCrypto()
      if (!parseStoredChat(chat)) throw new ChatStorageError('invalid-chat', 'Gespräch entspricht nicht dem Speicherformat.')
      const plain = JSON.stringify(chat)
      const encrypted = this.crypto.encrypt(plain)
      if (encrypted.length > CHAT_FILE_MAX_BYTES) throw new ChatStorageError('too-large', 'Gespräch ist zu groß zum Speichern.')
      const hash = createHash('sha256').update(plain).digest('hex')
      const file = path.join(dir, CHAT_FILE)

      // Unverändert? Nur, wenn die Datei noch genau die zuletzt geschriebene ist; sonst neu lesen (F70).
      let chatUnchanged = false
      const st = await statSafe(file)
      if (st) {
        const w = this.written.get(dir)
        if (w && w.size === st.size && w.mtimeMs === st.mtimeMs) {
          chatUnchanged = w.hash === hash
        } else {
          const prev = await this.readChat(vaultPath, chat.id)
          if (prev.kind === 'unreadable') throw new ChatStorageError('unreadable', 'Gespeichertes Gespräch ist nicht lesbar und wird nicht überschrieben.')
          if (prev.kind === 'chat' && JSON.stringify(prev.chat) === plain) {
            chatUnchanged = true
            this.written.set(dir, { hash, size: st.size, mtimeMs: st.mtimeMs })
          }
        }
      }

      // Bilder zuerst (auch bei unverändertem Gespräch): Ein Gespräch verweist nie auf ein Bild,
      // das noch nicht liegt, und ein fehlendes Bild lässt sich nachtragen (F71).
      let wrote = false
      const metas = [...imageMetaIn(chat.messages).meta.values()]
      for (const meta of metas) {
        const data = images[meta.id]
        if (!data || !matchesImage(data, meta)) continue
        const target = this.mediaFile(dir, meta.id)
        if (await this.readMedia(dir, meta)) continue
        await ensureDir(this.vaultDir(vaultPath))
        await ensureDir(dir)
        await ensureDir(path.join(dir, MEDIA_DIR))
        await writeAtomic(target, this.crypto.encrypt(data), this.randomId())
        wrote = true
      }
      if (chatUnchanged) return wrote

      await ensureDir(this.vaultDir(vaultPath))
      await ensureDir(dir)
      await writeAtomic(file, encrypted, this.randomId())
      const after = await fs.stat(file)
      this.written.set(dir, { hash, size: after.size, mtimeMs: after.mtimeMs })
      return true
    })
  }

  /** Ein Gespräch samt Bildern löschen — auch ein nicht lesbares. */
  async delete(vaultPath: string, id: string): Promise<void> {
    const dir = this.chatDir(vaultPath, id)
    return this.enqueue(vaultPath, async () => {
      await fs.rm(dir, { recursive: true, force: true })
      this.written.delete(dir)
    })
  }

  /** Alle Gespräche dieses Vaults löschen — in derselben Kette wie jedes Speichern (F72). */
  async deleteAll(vaultPath: string): Promise<void> {
    const vdir = this.vaultDir(vaultPath)
    return this.enqueue(vaultPath, async () => {
      await fs.rm(vdir, { recursive: true, force: true })
      for (const k of [...this.written.keys()]) if (path.dirname(k) === vdir) this.written.delete(k)
    })
  }

  /**
   * Aufräumen eines Vaults (beim ersten Zugriff nach dem Start). Offene Gespräche (`openIds`)
   * werden nicht angefasst. Nicht lesbare laufen nach ihrer Dateizeit ab; ihre Bilder bleiben,
   * solange das Gespräch bleibt (ohne Lesen ist kein Verweis entscheidbar).
   */
  async cleanup(vaultPath: string, retention: ChatRetentionDays, openIds: ReadonlySet<string> = new Set()): Promise<ChatCleanupResult> {
    return this.enqueue(vaultPath, async () => {
      const result: ChatCleanupResult = { expired: 0, leftovers: 0, orphanFiles: 0 }
      const vdir = this.vaultDir(vaultPath)
      const now = this.now()
      for (const name of await readdirSafe(vdir)) {
        const full = path.join(vdir, name)
        if (!CHAT_ID_RE.test(name)) {
          await fs.rm(full, { recursive: true, force: true })
          result.leftovers++
          continue
        }
        if (openIds.has(name)) continue
        if (!(await statSafe(path.join(full, CHAT_FILE)))) {
          await fs.rm(full, { recursive: true, force: true })
          this.written.delete(full)
          result.leftovers++
          continue
        }
        const r = await this.readChat(vaultPath, name)
        const updatedAt = r.kind === 'chat' ? r.chat.updatedAt : r.kind === 'unreadable' ? r.modifiedAt : now
        // Angeheftete Gespräche löscht die Aufbewahrung nicht (Nutzer 05.11.2026).
        const pinned = r.kind === 'chat' && r.chat.pinned === true && r.chat.archived !== true
        if (!pinned && isChatExpired(updatedAt, retention, now)) {
          await fs.rm(full, { recursive: true, force: true })
          this.written.delete(full)
          result.expired++
          continue
        }
        for (const f of await readdirSafe(full)) {
          if (f !== CHAT_FILE && f !== MEDIA_DIR) {
            await fs.rm(path.join(full, f), { recursive: true, force: true })
            result.orphanFiles++
          }
        }
        if (r.kind !== 'chat') continue
        const keep = new Set([...imageMetaIn(r.chat.messages).meta.keys()].map(i => `${i}${MEDIA_EXT}`))
        const mdir = path.join(full, MEDIA_DIR)
        for (const f of await readdirSafe(mdir)) {
          if (!keep.has(f)) {
            await fs.rm(path.join(mdir, f), { recursive: true, force: true })
            result.orphanFiles++
          }
        }
      }
      return result
    })
  }

  private async readChat(vaultPath: string, id: string): Promise<{ kind: 'chat'; chat: StoredChat } | { kind: 'unreadable'; modifiedAt: number } | { kind: 'missing' }> {
    const file = path.join(this.chatDir(vaultPath, id), CHAT_FILE)
    const st = await statSafe(file)
    if (!st) return { kind: 'missing' }
    const modifiedAt = st.mtimeMs
    // Schlüssel und Größe vor dem Lesen prüfen (F75).
    if (this.unavailableReason() || st.size > CHAT_FILE_MAX_BYTES) return { kind: 'unreadable', modifiedAt }
    try {
      const chat = parseStoredChat(JSON.parse(this.crypto.decrypt(await fs.readFile(file))))
      // Ein Gespräch, dessen Kopf eine andere ID nennt, liegt im falschen Ordner.
      if (!chat || chat.id !== id) return { kind: 'unreadable', modifiedAt }
      return { kind: 'chat', chat }
    } catch {
      return { kind: 'unreadable', modifiedAt }
    }
  }

  /** Bildbytes nur, wenn sie genau zu den gespeicherten Angaben passen (F74). */
  private async readMedia(dir: string, meta: StoredChatImage): Promise<string | null> {
    try {
      const file = this.mediaFile(dir, meta.id)
      const st = await statSafe(file)
      if (!st || st.size > MEDIA_FILE_MAX_BYTES || this.unavailableReason()) return null
      const data = this.crypto.decrypt(await fs.readFile(file))
      return matchesImage(data, meta) ? data : null
    } catch {
      return null
    }
  }
}

/**
 * Bytes passen zum Bild: JPEG ohne Metadatenblöcke, Länge = `byteLength` (höchstens 3 MB),
 * Maße aus dem JPEG-Kopf = gespeicherte Maße (F74). Ein anderes Bild unter derselben ID fällt so auf.
 */
export function matchesImage(b64: string, meta: StoredChatImage): boolean {
  if (b64.length > Math.ceil((CHAT_IMAGE_MAX_BYTES * 4) / 3) + 4) return false
  const bytes = base64ToBytes(b64)
  if (!bytes || bytes.length !== meta.byteLength || bytes.length > CHAT_IMAGE_MAX_BYTES) return false
  const info = inspectJpeg(bytes)
  return !!info && !info.hasMetadata && info.width === meta.width && info.height === meta.height
}

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

async function statSafe(file: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const st = await fs.stat(file)
    return st.isFile() ? { size: st.size, mtimeMs: st.mtimeMs } : null
  } catch {
    return null
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: DIR_MODE })
  // mkdir beachtet die umask und lässt bestehende Ordner unverändert.
  await fs.chmod(dir, DIR_MODE)
}

/** Ordner auf die Platte bringen, damit ein Rename einen Stromausfall übersteht (F76). */
async function syncDir(dir: string): Promise<void> {
  let fh: import('fs').promises.FileHandle | null = null
  try {
    fh = await fs.open(dir, 'r')
    await fh.sync()
  } catch {
    // Nicht jedes Dateisystem erlaubt fsync auf Ordnern (Windows) — dann bleibt es beim Rename.
  } finally {
    await fh?.close().catch(() => undefined)
  }
}

async function writeAtomic(file: string, data: Buffer, suffix: string): Promise<void> {
  const tmp = `${file}.${suffix}.tmp`
  let fh: import('fs').promises.FileHandle | null = null
  try {
    fh = await fs.open(tmp, 'w', FILE_MODE)
    await fh.writeFile(data)
    await fh.chmod(FILE_MODE)
    await fh.sync()
    await fh.close()
    fh = null
    await fs.rename(tmp, file)
    await syncDir(path.dirname(file))
  } catch (e) {
    await fh?.close().catch(() => undefined)
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}
