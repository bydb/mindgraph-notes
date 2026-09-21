/**
 * Was ein Lauf über seine Fehlschläge PREISGIBT.
 *
 * Anlass (09/2026, real): Beim Erstabgleich eines Zweitgeräts scheiterten rund 200
 * Downloads. Sichtbar war davon genau EINER — die Meldung nannte `failures[0]` und
 * dahinter „…". Welche Dateien fehlten, stand nirgends: das Protokoll lag nur im
 * Arbeitsspeicher des Renderers, gedeckelt auf 200 Einträge, und überschrieb sich bei
 * 200 Fehlschlägen selbst. Ein Neustart löschte den Rest.
 *
 * Hier wird deshalb dreierlei festgenagelt: die Liste ist VOLLSTÄNDIG, die Kurzmeldung
 * nennt mehr als eine Datei und sagt, wo der Rest steht, und auf der Platte liegt eine
 * Zeile je Fehlschlag.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { FakeRelay, PASSPHRASE, VAULT_ID } from './testRelay'

/** Alles, was die Engine an die Fenster schickt — der einzige Weg, auf dem ein Lauf, den
 *  niemand aufgerufen hat (Auto-Sync), die Oberfläche erreicht. */
const gesendet = vi.hoisted(() => [] as Array<{ kanal: string; daten: Record<string, unknown> }>)

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{
      webContents: {
        send: (kanal: string, daten: Record<string, unknown>) => { gesendet.push({ kanal, daten }) }
      }
    }]
  },
  safeStorage: { isEncryptionAvailable: () => false }
}))

const { SyncEngine } = await import('./syncEngine')

const SYNC_LOG_REL_PATH = '.mindgraph/sync-log.txt'
const SYNC_LOG_PREVIOUS_REL_PATH = '.mindgraph/sync-log.1.txt'

describe('Fehlerbericht eines Sync-Laufs', () => {
  let relay: FakeRelay
  let vault: string
  let engine: InstanceType<typeof SyncEngine>

  beforeEach(async () => {
    gesendet.length = 0
    relay = await FakeRelay.start()
    vault = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-sync-fail-'))
    engine = new SyncEngine()
  })

  afterEach(async () => {
    // Gegen halb gescheitertes Setup absichern: scheitert `beforeEach` (z.B. weil das
    // Binden des Relays verboten ist), sind die Variablen nicht gesetzt — ein blinder
    // Zugriff hier verdeckte bisher die eigentliche Ursache mit einem Folgefehler.
    engine?.disconnect()
    // disconnect() bringt den letzten Protokollblock nur auf den Weg (asynchron, damit
    // ein toter Mount das Beenden nicht aufhält) — vor dem Löschen des Vaults abwarten.
    await engine?.flushLog()
    await relay?.stop()
    if (vault) await fs.rm(vault, { recursive: true, force: true })
  })

  /** Legt `anzahl` Dateien auf dem Server ab, deren Blobs sich nicht entschlüsseln lassen. */
  function seedDamaged(anzahl: number): string[] {
    const pfade: string[] = []
    for (let i = 1; i <= anzahl; i++) {
      const p = `Notizen/kaputt-${String(i).padStart(3, '0')}.md`
      relay.seed(p, `Inhalt ${i}`, 1000, true)
      pfade.push(p)
    }
    return pfade
  }

  it('meldet JEDE gescheiterte Datei, nicht nur die erste', async () => {
    const erwartet = seedDamaged(12)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    const ergebnis = await engine.sync()

    expect(ergebnis.success).toBe(false)
    expect(ergebnis.failures).toBeDefined()
    expect(ergebnis.failures!.map(f => f.path).sort()).toEqual(erwartet.sort())
    // Jeder Eintrag trägt einen Grund — ohne ihn ist die Liste nur eine längere Zahl.
    for (const f of ergebnis.failures!) {
      expect(f.kind).toBe('download')
      expect(f.reason.length).toBeGreaterThan(0)
    }
  })

  it('nennt in der Kurzmeldung drei Pfade und sagt, wo der Rest steht', async () => {
    seedDamaged(12)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    const ergebnis = await engine.sync()

    const meldung = ergebnis.error ?? ''
    expect(meldung).toContain('12 download(s) failed')
    // Genau der Punkt: mehr als eine Datei steht in der Zeile.
    expect(meldung).toContain('kaputt-001.md')
    expect(meldung).toContain('kaputt-002.md')
    expect(meldung).toContain('kaputt-003.md')
    expect(meldung).toContain('and 9 more')
    expect(meldung).toContain(SYNC_LOG_REL_PATH)
  })

  it('schreibt jeden Fehlschlag in ein Protokoll, das den Neustart überlebt', async () => {
    const erwartet = seedDamaged(12)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    const ergebnis = await engine.sync()

    expect(ergebnis.logFile).toBe(path.join(vault, SYNC_LOG_REL_PATH))
    // Das Anhängen läuft bewusst nebenher, damit es keinen Download ausbremst.
    await engine.flushLog()
    const protokoll = await fs.readFile(path.join(vault, SYNC_LOG_REL_PATH), 'utf-8')
    for (const p of erwartet) {
      expect(protokoll).toContain(`Download failed: ${p}`)
    }
  })

  it('legt das Protokoll dort ab, wo der Sync es nicht wieder einsammelt', async () => {
    // `.txt` unter `.mindgraph` ist nicht syncbar. Läge das Protokoll als `.json` dort,
    // wanderte der Fehlerbericht dieses Rechners auf alle anderen Geräte.
    const { isSyncable } = await import('./fileTracker')
    expect(isSyncable(SYNC_LOG_REL_PATH)).toBe(false)
    expect(isSyncable(SYNC_LOG_PREVIOUS_REL_PATH)).toBe(false)
  })

  it('nennt beide Protokollpfade — die Rotation darf die erste Hälfte nicht verstecken', async () => {
    seedDamaged(2)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    const ergebnis = await engine.sync()

    expect(ergebnis.logFile).toBe(path.join(vault, SYNC_LOG_REL_PATH))
    expect(ergebnis.previousLogFile).toBe(path.join(vault, SYNC_LOG_PREVIOUS_REL_PATH))
  })

  it('bringt beim Trennen den Rest noch auf den Weg, statt ihn wegzuwerfen', async () => {
    // Vertrag nach drei Entwürfen: disconnect() nimmt nichts Neues mehr an, schreibt aber
    // den Puffer noch hinaus — asynchron, damit ein toter Mount das Beenden der App nicht
    // anhält. flushLog() wartet genau diesen letzten Block ab.
    seedDamaged(3)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    await engine.sync()

    engine.disconnect()
    await engine.flushLog()

    const protokoll = await fs.readFile(path.join(vault, SYNC_LOG_REL_PATH), 'utf-8')
    expect(protokoll).toContain('Download failed: Notizen/kaputt-003.md')
  })

  it('schickt die vollständige Liste über den Fortschrittskanal — auch ohne Aufrufer', async () => {
    // Auto-Sync und entprellter Sync starten in der Engine; ihr Rückgabewert verfällt.
    // Was die Oberfläche von so einem Lauf erfährt, MUSS deshalb im Ereignis stehen.
    const erwartet = seedDamaged(12)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    await engine.sync()

    const abschluss = gesendet
      .filter(e => e.kanal === 'sync-progress' && e.daten.status === 'error')
      .at(-1)
    expect(abschluss).toBeDefined()
    const fehlschlaege = abschluss!.daten.failures as Array<{ path: string }>
    expect(fehlschlaege.map(f => f.path).sort()).toEqual(erwartet.sort())
    expect(abschluss!.daten.vaultPath).toBe(vault)
    expect(abschluss!.daten.logFile).toBe(path.join(vault, SYNC_LOG_REL_PATH))
    expect(abschluss!.daten.previousLogFile).toBe(path.join(vault, SYNC_LOG_PREVIOUS_REL_PATH))
  })

  it('weist nie geschriebene Zeilen beim nächsten geglückten Schreiben aus', async () => {
    // Echter Schreibfehler ohne Attrappe: Am Protokollpfad liegt ein ORDNER, das Anhängen
    // scheitert mit EISDIR. Der erste Entwurf verschluckte so einen Block spurlos.
    const logPfad = path.join(vault, SYNC_LOG_REL_PATH)
    await fs.mkdir(logPfad, { recursive: true })
    seedDamaged(4)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    await engine.sync()
    await engine.flushLog()   // scheitert — die Zeilen dieses Blocks sind verloren

    await fs.rmdir(logPfad)   // Hindernis weg
    await engine.sync()       // erzeugt neue Zeilen und stößt das Schreiben wieder an
    await engine.flushLog()

    const protokoll = await fs.readFile(logPfad, 'utf-8')
    expect(protokoll).toMatch(/\[\d+ Protokollzeile\(n\) fehlen hier/)
  })

  it('rotiert, bevor die Datei die Grenze reißt', async () => {
    const logPfad = path.join(vault, SYNC_LOG_REL_PATH)
    await fs.mkdir(path.dirname(logPfad), { recursive: true })
    await fs.writeFile(logPfad, 'a'.repeat(2 * 1024 * 1024))
    seedDamaged(2)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    await engine.sync()
    await engine.flushLog()

    const vorher = await fs.stat(path.join(vault, SYNC_LOG_PREVIOUS_REL_PATH))
    expect(vorher.size).toBe(2 * 1024 * 1024)
    const aktuell = await fs.readFile(logPfad, 'utf-8')
    expect(aktuell.length).toBeLessThan(100_000)
    expect(aktuell).toContain('Download failed: Notizen/kaputt-001.md')
  })

  it('beginnt neu statt weiterzuwachsen, wenn die Rotation scheitert', async () => {
    // Der Vorgängerpfad ist ein nicht leerer Ordner — das Umbenennen muss scheitern. Der
    // erste Entwurf meldete das und hängte dann trotzdem an die zu große Datei an.
    const logPfad = path.join(vault, SYNC_LOG_REL_PATH)
    await fs.mkdir(path.join(vault, SYNC_LOG_PREVIOUS_REL_PATH, 'belegt'), { recursive: true })
    await fs.writeFile(logPfad, 'a'.repeat(2 * 1024 * 1024))
    seedDamaged(2)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    await engine.sync()
    await engine.flushLog()

    const aktuell = await fs.readFile(logPfad, 'utf-8')
    expect(aktuell.length).toBeLessThan(100_000)
    expect(aktuell).toContain('Rotation fehlgeschlagen')
    expect(aktuell).toContain('Download failed: Notizen/kaputt-001.md')
  })

  // Der Überlauf des Puffers ist NICHT hier getestet, sondern deterministisch in
  // logBuffer.test.ts. Über den echten Sync hing er an einer Zeitschranke: Leert der
  // 250-ms-Zeitgeber den Puffer mitten im Lauf, läuft er nie über — unter Volllast ist
  // der Test damit durchgefallen. Eine Zeitschranke, die man verstellen muss, damit der
  // Test grün wird, prüft nichts.
})
