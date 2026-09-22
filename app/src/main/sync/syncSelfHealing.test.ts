/**
 * Selbstheilung unlesbarer Serverkopien — über ZWEI Geräte am selben Relay.
 *
 * Anlass (22.09.2026, real): Auf einem neuen Rechner scheiterten 194 Downloads, alle mit
 * „Decryption failed". Die Kopien auf dem Server waren mit einem anderen Schlüssel
 * verschlüsselt oder beschädigt; der Mac hatte dieselben Dateien intakt, lud sie aber nie
 * neu hoch — Prüfsummen stimmten ja überein. Ohne Zutun heilte das nie, und derselbe Fehler
 * liegt seit 06.08.2026 als „einzelne unlesbare Blobs" im Code vermerkt.
 *
 * Der Weg, der hier geprüft wird: Gerät ohne Kopie meldet „unlesbar" → Relay merkt es →
 * Gerät MIT intakter Kopie gleicher Prüfsumme lädt neu hoch → erstes Gerät bekommt sie.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { hashPath, hashContent } from './crypto'
import { FakeRelay, PASSPHRASE, VAULT_ID } from './testRelay'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false }
}))

const { SyncEngine } = await import('./syncEngine')

const NOTIZ = 'Zettelkasten/📕 - Geistloses Wiederholen.md'
const INHALT = 'Eine Notiz, die auf dem Server unlesbar liegt.'

describe('Selbstheilung unlesbarer Serverkopien', () => {
  let relay: FakeRelay
  let vaultOhne: string   // Gerät A: kennt die Datei nicht (neuer Rechner)
  let vaultMit: string    // Gerät B: hat sie intakt (der Mac)
  let engineA: InstanceType<typeof SyncEngine>
  let engineB: InstanceType<typeof SyncEngine>

  beforeEach(async () => {
    relay = await FakeRelay.start()
    vaultOhne = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-heil-a-'))
    vaultMit = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-heil-b-'))
    engineA = new SyncEngine()
    engineB = new SyncEngine()

    // Auf dem Server liegt die Datei BESCHÄDIGT, im Manifest mit der korrekten Prüfsumme
    // des echten Inhalts — genau die Lage des Anlassfalls.
    relay.seed(NOTIZ, INHALT, 1000, true)

    // Gerät B hat denselben Inhalt intakt auf der Platte.
    await fs.mkdir(path.dirname(path.join(vaultMit, NOTIZ)), { recursive: true })
    await fs.writeFile(path.join(vaultMit, NOTIZ), INHALT)
  })

  afterEach(async () => {
    engineA?.disconnect(); engineB?.disconnect()
    await engineA?.flushLog(); await engineB?.flushLog()
    await relay?.stop()
    if (vaultOhne) await fs.rm(vaultOhne, { recursive: true, force: true })
    if (vaultMit) await fs.rm(vaultMit, { recursive: true, force: true })
  })

  const lauf = async (engine: InstanceType<typeof SyncEngine>, vault: string) => {
    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    return engine.sync()
  }

  it('heilt über zwei Geräte: melden, neu hochladen, ankommen', async () => {
    // 1. Gerät A scheitert und MELDET.
    const a1 = await lauf(engineA, vaultOhne)
    expect(a1.failures?.[0]?.reason).toMatch(/Decryption failed/)
    expect(relay.unreadableReports).toEqual([NOTIZ])

    // 2. Gerät B sieht die Meldung und lädt seine intakte Kopie neu hoch.
    const b1 = await lauf(engineB, vaultMit)
    expect(b1.success).toBe(true)
    expect(relay.unreadable.size).toBe(0)   // Markierung ist verbraucht

    // 3. Gerät A bekommt die Datei jetzt — ohne Zutun.
    const a2 = await engineA.sync()
    expect(a2.success).toBe(true)
    const gelandet = await fs.readFile(path.join(vaultOhne, NOTIZ), 'utf-8')
    expect(gelandet).toBe(INHALT)
  })

  it('repariert NICHT mit einem abweichenden lokalen Stand', async () => {
    // Die Sicherung der ganzen Mechanik: Ersetzen darf nur, wessen Prüfsumme mit der im
    // Server-Manifest übereinstimmt. Hier hat Gerät B einen ANDEREN und ÄLTEREN Stand —
    // der Server ist neuer. Ohne die Prüfsummen-Bedingung hätte die Reparatur den
    // neueren Serverstand mit dem älteren lokalen überschrieben.
    relay.files.clear()
    relay.seed(NOTIZ, INHALT, 4_000_000_000_000, true)   // Server ist deutlich neuer
    await fs.writeFile(path.join(vaultMit, NOTIZ), 'Ein ANDERER, älterer Stand')

    await lauf(engineA, vaultOhne)
    expect(relay.unreadableReports).toEqual([NOTIZ])
    const serverVorher = relay.files.get(hashPath(NOTIZ))!.data

    const b1 = await lauf(engineB, vaultMit)
    // Kein Upload durch die Reparatur: die Serverkopie ist unverändert …
    expect(relay.files.get(hashPath(NOTIZ))!.data).toBe(serverVorher)
    // … es bleibt ein ungelöster Konflikt, und die Markierung steht weiter.
    expect(b1.failures?.some(f => f.path === NOTIZ && f.kind === 'conflict')).toBe(true)
    expect(relay.unreadable.has(NOTIZ)).toBe(true)
  })

  it('meldet nichts an einen Relay, der das Feld nicht kennt', async () => {
    // Ältere Serverfassungen schicken `unreadable` nicht. Dann darf der Client auch nicht
    // melden — eine unbekannte Nachricht beantwortet der alte Server mit einem pfadlosen
    // Fehler, und der trifft jeden wartenden Upload.
    relay.manifestOhneUnreadable = true
    const a1 = await lauf(engineA, vaultOhne)
    expect(a1.failures?.[0]?.reason).toMatch(/Decryption failed/)
    expect(relay.unreadableReports).toEqual([])
  })

  it('nimmt keine Meldung an, deren Prüfsumme nicht mehr die aktuelle ist', async () => {
    // Verspätete Meldung über eine längst ersetzte Kopie darf die neue nicht markieren.
    await lauf(engineA, vaultOhne)
    relay.unreadable.clear(); relay.unreadableReports.length = 0
    relay.seed(NOTIZ, 'Inzwischen ersetzt', 2000)   // neue Prüfsumme auf dem Server

    const gespeichert = relay.files.get(hashPath(NOTIZ))
    expect(gespeichert?.hash).toBe(hashContent(Buffer.from('Inzwischen ersetzt')))
    await engineA.sync()   // meldet erneut, jetzt mit der NEUEN Prüfsumme des Manifests
    // Der Inhalt ist lesbar → gar keine Meldung.
    expect(relay.unreadableReports).toEqual([])
  })
})
