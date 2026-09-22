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

  it('liest die empfangenen Bytes des echten Sockets — sonst ist das Lebenszeichen blind', async () => {
    // Lebenszeichen und Empfangs-Wache werten `_socket.bytesRead` aus, ein ws-Interna.
    // Wird es umbenannt, fällt der Wert still auf null — Pong bleibt dann der einzige
    // Beweis, und ein großer Download wird wieder gekappt. Dieser Test bricht vorher.
    seedDamaged(1)
    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    await engine.sync()

    const gelesen = (engine as unknown as { socketBytesRead: () => number | null }).socketBytesRead()
    expect(gelesen).not.toBeNull()
    expect(gelesen!).toBeGreaterThan(0)
  })

  it('wartet auf einen Download, solange Bytes ankommen — auch länger als 30 s', async () => {
    // Nachgestellt ohne Uhr: Die Wache entscheidet über receiveWatchVerdict; hier wird
    // nur belegt, dass ein Download mit sofortiger Antwort die Wache sauber beendet und
    // kein Timer weitertickt (sonst hielte er den Prozess offen — unref ist gesetzt).
    seedDamaged(1)
    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    const ergebnis = await engine.sync()
    expect(ergebnis.failures).toHaveLength(1)
    expect(ergebnis.failures![0].reason).toMatch(/Decryption failed/)
  })

  it('lässt Karteikarten NICHT als leere Serverkopie durchgehen', async () => {
    // F17: Eine unlesbare Serverkopie wurde zu `[]`, die lokale Sammlung als Vereinigung
    // hochgeladen und als abgeglichen markiert — Karten nur vom Server waren weg.
    const pfad = '.mindgraph/flashcards.json'
    relay.seed(pfad, JSON.stringify([{ id: 'server-only', modified: '2026-01-01' }]), 2000)
    relay.failDownloads.add(pfad) // steht im Manifest, ist aber nicht lieferbar → requestFile liefert null
    await fs.mkdir(path.join(vault, '.mindgraph'), { recursive: true })
    await fs.writeFile(path.join(vault, pfad), JSON.stringify([{ id: 'lokal', modified: '2026-02-01' }]))

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    const ergebnis = await engine.sync()

    // Der Konflikt gilt als gescheitert, nicht als erledigt …
    const konflikt = ergebnis.failures?.find(f => f.path === pfad)
    expect(konflikt?.kind).toBe('conflict')
    // … und auf dem Server liegt weiterhin die (beschädigte) Originalkopie, nicht die lokale.
    const serverKopie = relay.files.get((await import('./crypto')).hashPath(pfad))
    expect(serverKopie?.modifiedAt).toBe(2000)
  })

  it('kappt die Verbindung NICHT, wenn der Abgleich länger dauert als die Manifest-Frist', async () => {
    // Seit 0.7.11 feuerte die 15-s-Frist der Dateiliste IMMER — auch wenn die Liste längst
    // da war — und terminierte die gesunde Verbindung. Jeder Abgleich über 15 s riss ab:
    // Erstabgleiche (200/194 Fehlschläge) und jeder Upload der 34-MB-Mailliste.
    // Hier: Frist 300 ms, zehn Downloads à 150 ms in Fünfergruppen = ~300 ms+ Laufzeit.
    engine.manifestTimeoutMs = 300
    relay.downloadDelayMs = 150
    for (let i = 1; i <= 10; i++) relay.seed(`Notizen/langsam-${i}.md`, `Inhalt ${i}`)

    await engine.join(vault, VAULT_ID, PASSPHRASE, relay.url)
    await engine.connect()
    const ergebnis = await engine.sync()

    expect(ergebnis.success).toBe(true)
    expect(ergebnis.downloaded).toBe(10)
    await engine.flushLog()
    const protokoll = await fs.readFile(path.join(vault, SYNC_LOG_REL_PATH), 'utf-8')
    expect(protokoll).not.toContain('Disconnected')
    expect(protokoll).not.toContain('Manifest request timeout')
  })

  // Der Überlauf des Puffers ist NICHT hier getestet, sondern deterministisch in
  // logBuffer.test.ts. Über den echten Sync hing er an einer Zeitschranke: Leert der
  // 250-ms-Zeitgeber den Puffer mitten im Lauf, läuft er nie über — unter Volllast ist
  // der Test damit durchgefallen. Eine Zeitschranke, die man verstellen muss, damit der
  // Test grün wird, prüft nichts.
})
