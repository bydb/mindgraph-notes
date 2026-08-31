// Regressionstests für die reine Sync-Entscheidungslogik (diffManifests,
// isSyncable, isTombstoned). Kein fs/Netz — die fs-behafteten Funktionen
// (buildManifest, load/saveManifest, walkDirectory) sind hier bewusst ausgespart.
// diffManifests ist der Kern: seine toDeleteLocal/toDeleteRemote-Arrays füttern
// den Mass-Deletion-SAFETY-Check im syncEngine. Kippt die Klassifikation still,
// werden entweder Dateien fälschlich gelöscht oder gelöschte re-uploadet.
import { describe, it, expect } from 'vitest'
import {
  isSyncable,
  isTombstoned,
  diffManifests,
  assessDeletions,
  isConfirmedDeletion,
  DELETION_GUARD,
  type FileManifest,
  type FileInfo
} from './fileTracker'

function file(hash: string, opts: Partial<FileInfo> = {}): FileInfo {
  return { hash, size: 10, modifiedAt: 1000, syncedAt: null, ...opts }
}

function manifest(files: Record<string, FileInfo>, extra: Partial<FileManifest> = {}): FileManifest {
  return { files, lastSyncTime: 0, vaultId: 'mg-test', ...extra }
}

describe('isSyncable', () => {
  it('synct Markdown und unterstützte Medien im Root', () => {
    expect(isSyncable('Notiz.md')).toBe(true)
    expect(isSyncable('ordner/bild.png')).toBe(true)
    expect(isSyncable('a/b/c.canvas')).toBe(true)
    expect(isSyncable('doc.pdf')).toBe(true)
  })

  it('schließt OS-Müll und temporäre Dateien aus', () => {
    expect(isSyncable('.DS_Store')).toBe(false)
    expect(isSyncable('ordner/Thumbs.db')).toBe(false)
    expect(isSyncable('entwurf.tmp')).toBe(false)
    expect(isSyncable('~$temp.md')).toBe(false)
  })

  it('schließt Sync-Konflikt-Kopien aus (sonst Endlos-Vermehrung)', () => {
    expect(isSyncable('Notiz.sync-conflict-2026-06-24.md')).toBe(false)
  })

  it('schließt gerätelokale .mindgraph-Ableitungen aus (Backups, RAG, Caches, Manifest)', () => {
    expect(isSyncable('.mindgraph/backups/2026-06-24/Notiz.md.123.bak')).toBe(false)
    expect(isSyncable('.mindgraph/rag/projektA/embeddings.json')).toBe(false)
    expect(isSyncable('.mindgraph/sync-manifest.json')).toBe(false)
    expect(isSyncable('.mindgraph/notes-cache.json')).toBe(false)
  })

  it('synct echte .mindgraph-Daten (z.B. emails.json) und .attachments', () => {
    // Die Mailliste ab Fassung 2. Sie MUSS synchronisiert werden — der Sync
    // vereinigt sie inzwischen (syncEngine.downloadEmailStore), statt sie zu
    // ersetzen.
    expect(isSyncable('.mindgraph/email-store.json')).toBe(true)
    // Die ALTE Mailliste dagegen nicht mehr: Sie ist die Arbeitsdatei von
    // Geräten mit älterer Fassung und wird hier nur einmal gelesen. Ein Download
    // würde sie überschreiben, bevor sie übernommen ist.
    expect(isSyncable('.mindgraph/emails.json')).toBe(false)
    expect(isSyncable('.attachments/datei.bin')).toBe(true)
  })

  it('schließt Agent-Staging komplett aus — unbestätigte Outputs bleiben lokal (F03)', () => {
    expect(isSyncable('.mindgraph/agent-staging/run-123/Entwurf.md')).toBe(false)
    expect(isSyncable('.mindgraph/agent-staging/run-123/Zuordnung.xlsx')).toBe(false)
    expect(isSyncable('.mindgraph/agent-staging/run-123/Bericht.pdf')).toBe(false)
    expect(isSyncable('.mindgraph\\agent-staging\\run-123\\Entwurf.md')).toBe(false)
  })

  it('schließt unbekannte Endungen im Root aus', () => {
    expect(isSyncable('skript.exe')).toBe(false)
    expect(isSyncable('daten.csv')).toBe(false)
  })

  it('respektiert benutzerdefinierte Exclude-Endungen', () => {
    expect(isSyncable('foto.png', { folders: [], extensions: ['png'] })).toBe(false)
    expect(isSyncable('foto.png', { folders: [], extensions: ['.png'] })).toBe(false)
  })

  it('respektiert benutzerdefinierte Exclude-Ordner an beliebiger Tiefe', () => {
    expect(isSyncable('privat/geheim.md', { folders: ['privat'], extensions: [] })).toBe(false)
    expect(isSyncable('a/b/privat/x.md', { folders: ['privat'], extensions: [] })).toBe(false)
    expect(isSyncable('oeffentlich/x.md', { folders: ['privat'], extensions: [] })).toBe(true)
  })

  it('behandelt Windows-Backslash-Pfade wie POSIX-Pfade', () => {
    expect(isSyncable('.mindgraph\\backups\\x.bak')).toBe(false)
    expect(isSyncable('.trash\\geloescht.md')).toBe(false)
  })
})

describe('isTombstoned', () => {
  it('false ohne Manifest', () => {
    expect(isTombstoned('a.md', undefined)).toBe(false)
  })

  it('erkennt exakte Tombstones', () => {
    const m = manifest({}, { tombstones: { 'geloescht.md': 123 } })
    expect(isTombstoned('geloescht.md', m)).toBe(true)
    expect(isTombstoned('andere.md', m)).toBe(false)
  })

  it('erkennt Prefix-Tombstones (gelöschte Ordner)', () => {
    const m = manifest({}, { tombstonePrefixes: { 'alterOrdner/': 123 } })
    expect(isTombstoned('alterOrdner/tief/x.md', m)).toBe(true)
    expect(isTombstoned('andererOrdner/x.md', m)).toBe(false)
  })
})

describe('diffManifests', () => {
  it('neue lokale Datei → Upload', () => {
    const local = manifest({ 'neu.md': file('h1') })
    const remote = manifest({})
    const diff = diffManifests(local, remote)
    expect(diff.toUpload).toEqual(['neu.md'])
    expect(diff.toDeleteLocal).toEqual([])
  })

  it('neue Remote-Datei → Download', () => {
    const local = manifest({})
    const remote = manifest({ 'remote.md': file('h2') })
    const diff = diffManifests(local, remote)
    expect(diff.toDownload).toEqual(['remote.md'])
  })

  it('lokal vorhanden + bereits gesynct + remote weg → lokal löschen', () => {
    const local = manifest({ 'weg.md': file('h1', { syncedAt: 500 }) })
    const remote = manifest({})
    const diff = diffManifests(local, remote)
    expect(diff.toDeleteLocal).toEqual(['weg.md'])
    expect(diff.toUpload).toEqual([])
  })

  it('REGRESSION: frisch gejointes Gerät (syncedAt null), aber Server-Tombstone → lokal löschen statt re-uploaden', () => {
    // Ohne diesen Pfad würde ein zweites Gerät vom Erstuser gelöschte Dateien
    // wieder hochladen ("Zombie-Dateien").
    const local = manifest({ 'vomServerGeloescht.md': file('h1', { syncedAt: null }) })
    const remote = manifest({})
    const serverTombstones = { 'vomServerGeloescht.md': { deletedAt: 999 } }
    const diff = diffManifests(local, remote, undefined, serverTombstones)
    expect(diff.toDeleteLocal).toEqual(['vomServerGeloescht.md'])
    expect(diff.toUpload).toEqual([])
  })

  it('remote vorhanden, vorher lokal gesynct + jetzt lokal gelöscht → remote löschen', () => {
    const local = manifest({})
    const remote = manifest({ 'lokalGeloescht.md': file('h1') })
    const previousLocal = manifest({ 'lokalGeloescht.md': file('h1', { syncedAt: 500 }) })
    const diff = diffManifests(local, remote, previousLocal)
    expect(diff.toDeleteRemote).toEqual(['lokalGeloescht.md'])
    expect(diff.toDownload).toEqual([])
  })

  it('remote vorhanden, im previousLocal als Tombstone markiert → remote löschen', () => {
    const local = manifest({})
    const remote = manifest({ 'ordner/x.md': file('h1') })
    const previousLocal = manifest({}, { tombstonePrefixes: { 'ordner/': 123 } })
    const diff = diffManifests(local, remote, previousLocal)
    expect(diff.toDeleteRemote).toEqual(['ordner/x.md'])
  })

  it('identische Hashes → keine Aktion, setzt aber syncedAt für künftige Löscherkennung', () => {
    const localFile = file('same', { syncedAt: null })
    const local = manifest({ 'gleich.md': localFile })
    const remote = manifest({ 'gleich.md': file('same') })
    const diff = diffManifests(local, remote)
    expect(diff.toUpload).toEqual([])
    expect(diff.toDownload).toEqual([])
    expect(diff.conflicts).toEqual([])
    // Mutation: syncedAt wird gesetzt, damit spätere Diffs ohne Server-Tombstone
    // eine lokale Löschung erkennen können.
    expect(localFile.syncedAt).not.toBeNull()
  })

  it('beide Seiten geändert → Konflikt', () => {
    const local = manifest({ 'streit.md': file('lokal', { syncedAt: 500, modifiedAt: 600 }) })
    const remote = manifest({ 'streit.md': file('remote', { modifiedAt: 700 }) })
    const diff = diffManifests(local, remote)
    expect(diff.conflicts).toEqual(['streit.md'])
  })

  it('nur lokal geändert → Upload', () => {
    const local = manifest({ 'x.md': file('neu', { syncedAt: 500, modifiedAt: 600 }) })
    const remote = manifest({ 'x.md': file('alt', { modifiedAt: 400 }) })
    const diff = diffManifests(local, remote)
    expect(diff.toUpload).toEqual(['x.md'])
  })

  it('nur remote geändert → Download', () => {
    const local = manifest({ 'x.md': file('alt', { syncedAt: 600, modifiedAt: 500 }) })
    const remote = manifest({ 'x.md': file('neu', { modifiedAt: 700 }) })
    const diff = diffManifests(local, remote)
    expect(diff.toDownload).toEqual(['x.md'])
  })

  // Der Datenverlust-Fall, der real Aufgaben-Häkchen zurückgesetzt hat (09.06.2026):
  // pushFile lud Stand A hoch, wartete bis zu 30 s auf das Server-Ack und stempelte
  // DANACH den inzwischen weitergeschriebenen Stand B als "synchronisiert". Damit galt
  // `modifiedAt > syncedAt` als falsch — Stand B war als lokale Änderung unsichtbar und
  // der Server-Stand A wurde still darübergeschrieben (ohne Backup, ohne Konfliktkopie).
  // syncedHash macht die Frage "hat sich lokal etwas geändert?" unabhängig von Uhrzeiten.
  it('REGRESSION: lokal nach dem Upload weitergeschrieben → Upload, NIE stiller Download', () => {
    // syncedHash = 'stand-a' (das, was der Server bestätigt hat),
    // lokal liegt inzwischen 'stand-b', dessen mtime aber VOR dem syncedAt-Stempel liegt.
    const local = manifest({
      'journal.md': file('stand-b', { syncedAt: 900, modifiedAt: 800, syncedHash: 'stand-a' })
    })
    const remote = manifest({ 'journal.md': file('stand-a', { modifiedAt: 700 }) })
    const diff = diffManifests(local, remote)
    expect(diff.toUpload).toEqual(['journal.md'])
    expect(diff.toDownload).toEqual([])
  })

  it('syncedHash: lokal unverändert, Server geändert → Download', () => {
    const local = manifest({
      'x.md': file('bestaetigt', { syncedAt: 900, modifiedAt: 950, syncedHash: 'bestaetigt' })
    })
    const remote = manifest({ 'x.md': file('server-neu', { modifiedAt: 100 }) })
    const diff = diffManifests(local, remote)
    // modifiedAt (950) > syncedAt (900) hätte hier fälschlich "lokal geändert" gesagt,
    // obwohl der Inhalt identisch zum bestätigten Stand ist (z.B. Speichern ohne Änderung).
    expect(diff.toDownload).toEqual(['x.md'])
    expect(diff.conflicts).toEqual([])
  })

  it('syncedHash: beide Seiten weg vom bestätigten Stand → Konflikt', () => {
    const local = manifest({
      'x.md': file('lokal-neu', { syncedAt: 900, modifiedAt: 800, syncedHash: 'basis' })
    })
    const remote = manifest({ 'x.md': file('remote-neu', { modifiedAt: 100 }) })
    const diff = diffManifests(local, remote)
    expect(diff.conflicts).toEqual(['x.md'])
  })

  it('ohne syncedHash (Manifest aus einer älteren Version) bleibt die Zeitstempel-Regel gültig', () => {
    const local = manifest({ 'x.md': file('neu', { syncedAt: 500, modifiedAt: 600 }) })
    const remote = manifest({ 'x.md': file('alt', { modifiedAt: 400 }) })
    expect(diffManifests(local, remote).toUpload).toEqual(['x.md'])

    const local2 = manifest({ 'y.md': file('alt', { syncedAt: 600, modifiedAt: 500 }) })
    const remote2 = manifest({ 'y.md': file('neu', { modifiedAt: 700 }) })
    expect(diffManifests(local2, remote2).toDownload).toEqual(['y.md'])
  })

  it('identische Hashes setzen syncedHash, damit die Uhrzeit-Regel ab dann nicht mehr greift', () => {
    const localFile = file('same', { syncedAt: null })
    const diff = diffManifests(manifest({ 'gleich.md': localFile }), manifest({ 'gleich.md': file('same') }))
    expect(diff.toUpload).toEqual([])
    expect(localFile.syncedHash).toBe('same')
  })

  it('füttert den Mass-Deletion-SAFETY-Check: leeres Remote-Manifest → alle gesyncten Dateien in toDeleteLocal', () => {
    // Szenario, gegen das der SAFETY-Check (deleteRatio > 0.1 && >= 10) schützt:
    // Server liefert (z.B. wegen Verbindungsproblem) ein leeres Manifest.
    const files: Record<string, FileInfo> = {}
    for (let i = 0; i < 20; i++) files[`n${i}.md`] = file(`h${i}`, { syncedAt: 500 })
    const diff = diffManifests(manifest(files), manifest({}))
    expect(diff.toDeleteLocal.length).toBe(20)
    expect(diff.toUpload.length).toBe(0)
  })
})

// Regression 2026-07-02: embeddings-bge-m3-latest.json (83 MB) wurde als .mindgraph/*.json
// gesynct, sprengte nach base64 (×4/3 ≈ 106 MiB) das 100-MiB-ws-maxPayload des Servers →
// Server killte die Verbindung, Auto-Sync retryte dieselbe Datei alle 5 min (Endlosschleife,
// "Upload acknowledgment timeout"). Zwei Verteidigungslinien: Embedding-Caches sind vom Sync
// ausgeschlossen (gerätelokal ableitbar), und diffManifests hält übergroße Dateien generell
// aus der Upload-Queue heraus.
describe('isSyncable — Embedding-Caches', () => {
  it('schließt .mindgraph/embeddings-*.json vom Sync aus', () => {
    expect(isSyncable('.mindgraph/embeddings-bge-m3-latest.json')).toBe(false)
    expect(isSyncable('.mindgraph/embeddings-nomic-embed-text-latest.json')).toBe(false)
    expect(isSyncable('.mindgraph\\embeddings-mxbai-embed-large-latest.json')).toBe(false)
  })

  it('lässt andere .mindgraph-JSONs unberührt', () => {
    expect(isSyncable('.mindgraph/email-store.json')).toBe(true)
    expect(isSyncable('.mindgraph/contacts.json')).toBe(true)
  })
})

describe('diffManifests — die alte Mailliste wird in Ruhe gelassen', () => {
  const LEGACY = '.mindgraph/emails.json'

  it('löscht sie NICHT auf dem Server, nur weil diese Fassung sie nicht mehr führt', () => {
    // Das aktualisierte Gerät listet sie nicht mehr. Ohne Schutz wäre das für
    // diffManifests „vom Nutzer gelöscht" → Löschung auf dem Server → und das
    // noch nicht aktualisierte Gerät löscht sie daraufhin bei sich. Genau
    // dessen Arbeitsdatei.
    const local = { files: {}, lastSyncTime: 0, vaultId: 'v' }
    const remote = { files: { [LEGACY]: { hash: 'h', size: 10, modifiedAt: 2000, syncedAt: null } }, lastSyncTime: 0, vaultId: 'v' }
    const previous = { files: { [LEGACY]: { hash: 'h', size: 10, modifiedAt: 1000, syncedAt: 500 } }, lastSyncTime: 0, vaultId: 'v' }

    const diff = diffManifests(local, remote, previous)

    expect(diff.toDeleteRemote).not.toContain(LEGACY)
    expect(diff.toDownload).not.toContain(LEGACY)
  })

  it('lädt sie auch nicht herunter — sonst überschriebe der Sync den Altbestand vor der Übernahme', () => {
    const local = { files: {}, lastSyncTime: 0, vaultId: 'v' }
    const remote = { files: { [LEGACY]: { hash: 'h', size: 10, modifiedAt: 2000, syncedAt: null } }, lastSyncTime: 0, vaultId: 'v' }

    const diff = diffManifests(local, remote)

    expect(diff.toDownload).not.toContain(LEGACY)
    expect(diff.toDeleteRemote).not.toContain(LEGACY)
  })
})

describe('diffManifests — maxUploadSize', () => {
  const LIMIT = 64 * 1024 * 1024

  it('hält übergroße neue Dateien aus toUpload heraus und meldet sie als skippedTooLarge', () => {
    const local = manifest({
      'riesig.pdf': file('h1', { size: 90 * 1024 * 1024 }),
      'klein.md': file('h2')
    })
    const diff = diffManifests(local, manifest({}), undefined, undefined, LIMIT)
    expect(diff.toUpload).toEqual(['klein.md'])
    expect(diff.skippedTooLarge).toEqual(['riesig.pdf'])
  })

  it('hält übergroße lokal geänderte Dateien aus toUpload heraus', () => {
    const local = manifest({ 'riesig.pdf': file('neu', { size: 90 * 1024 * 1024, syncedAt: 500, modifiedAt: 600 }) })
    const remote = manifest({ 'riesig.pdf': file('alt', { modifiedAt: 400 }) })
    const diff = diffManifests(local, remote, undefined, undefined, LIMIT)
    expect(diff.toUpload).toEqual([])
    expect(diff.skippedTooLarge).toEqual(['riesig.pdf'])
  })

  it('lässt übergroße Dateien nicht über den Konflikt-Pfad zum Upload durch (lokal bleibt erhalten)', () => {
    // beide Seiten geändert = Konflikt; Konfliktauflösung würde bei neuerem lokalen Stand
    // uploaden → gleiche Endlosschleife. Konservativ: weder Upload noch Download, nur melden.
    const local = manifest({ 'riesig.pdf': file('lokal', { size: 90 * 1024 * 1024, syncedAt: 500, modifiedAt: 600 }) })
    const remote = manifest({ 'riesig.pdf': file('remote', { modifiedAt: 700 }) })
    const diff = diffManifests(local, remote, undefined, undefined, LIMIT)
    expect(diff.conflicts).toEqual([])
    expect(diff.toUpload).toEqual([])
    expect(diff.toDownload).toEqual([])
    expect(diff.skippedTooLarge).toEqual(['riesig.pdf'])
  })

  it('Downloads bleiben von der Größen-Schranke unberührt (nur remote geändert)', () => {
    const local = manifest({ 'riesig.pdf': file('alt', { size: 90 * 1024 * 1024, syncedAt: 600, modifiedAt: 500 }) })
    const remote = manifest({ 'riesig.pdf': file('neu', { modifiedAt: 700 }) })
    const diff = diffManifests(local, remote, undefined, undefined, LIMIT)
    expect(diff.toDownload).toEqual(['riesig.pdf'])
    expect(diff.skippedTooLarge).toEqual([])
  })

  it('ohne maxUploadSize bleibt das Verhalten unverändert', () => {
    const local = manifest({ 'riesig.pdf': file('h1', { size: 90 * 1024 * 1024 }) })
    const diff = diffManifests(local, manifest({}))
    expect(diff.toUpload).toEqual(['riesig.pdf'])
    expect(diff.skippedTooLarge).toEqual([])
  })
})

// Löschbremse. Die alte Regel verlangte "Anteil > 10 % UND Anzahl >= 10" —
// beide Bedingungen zugleich. Die ersten zwei Tests halten die realen Fälle fest,
// die dadurch still durchliefen.
describe('assessDeletions', () => {
  const H = (p: string) => `hash-${p}`
  const assess = (deletions: string[], totalFiles: number, compensating: string[] = []) =>
    assessDeletions({
      deletions,
      totalFiles,
      hashOf: p => H(p),
      compensatingHashes: new Set(compensating.map(H))
    })

  const many = (n: number, prefix = 'f') => Array.from({ length: n }, (_, i) => `${prefix}${i}.md`)

  it('blockt 49 von 7181 Dateien (0,7 %) — vorher am Anteil vorbeigerutscht', () => {
    const result = assess(many(49), 7181)
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe('absolute')
  })

  it('blockt 9 von 20 Dateien (45 %) — vorher an der Mindestanzahl vorbeigerutscht', () => {
    const result = assess(many(9), 20)
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe('ratio')
  })

  it('lässt Umbenennungen durch: gleicher Inhalt geht im selben Lauf wieder hoch', () => {
    // Der reale Auslöser: 1434 Dateien mit anders codierten Umlauten im Namen.
    const alt = many(60, 'alt')
    const result = assessDeletions({
      deletions: alt,
      totalFiles: 7181,
      hashOf: p => `inhalt-${p.replace('alt', '')}`,
      compensatingHashes: new Set(many(60, 'neu').map(p => `inhalt-${p.replace('neu', '')}`))
    })
    expect(result.blocked).toBe(false)
    expect(result.renames).toHaveLength(60)
    expect(result.unmatched).toEqual([])
  })

  it('zählt nur den unerklärten Rest — Umbenennungen entlasten die Bilanz', () => {
    const result = assessDeletions({
      deletions: [...many(30, 'ren'), 'echt-weg.md'],
      totalFiles: 500,
      hashOf: p => (p === 'echt-weg.md' ? 'einzigartig' : 'wandert-mit'),
      // 30 verschobene Dateien = 30 Uploads mit demselben Inhalt. Die Aufrufstelle im
      // syncEngine baut die Liste aus diff.toUpload, also mit 30 Einträgen.
      compensatingHashes: Array(30).fill('wandert-mit')
    })
    expect(result.blocked).toBe(false)
    expect(result.renames).toHaveLength(30)
    expect(result.unmatched).toEqual(['echt-weg.md'])
  })

  // Die Umbenennungserkennung war ein Set: EIN Hash entschuldigte beliebig viele
  // Löschungen gleichen Inhalts. Bei leeren Notizen oder identischen Vorlagen reicht
  // damit eine einzige neu angelegte Datei, um die Löschbremse komplett auszuhebeln.
  it('REGRESSION: eine kompensierende Datei entschuldigt nur EINE Löschung, nicht 30', () => {
    const result = assessDeletions({
      deletions: many(30, 'leer'),
      totalFiles: 500,
      hashOf: () => 'leerer-inhalt',
      compensatingHashes: ['leerer-inhalt']  // nur EINE neue Datei
    })
    expect(result.renames).toHaveLength(1)
    expect(result.unmatched).toHaveLength(29)
    expect(result.blocked).toBe(true)
  })

  it('deckt teilweise: 10 eingehende Dateien decken 10 von 40 gleichartigen Löschungen', () => {
    const result = assessDeletions({
      deletions: many(40, 'gleich'),
      totalFiles: 500,
      hashOf: () => 'derselbe-inhalt',
      compensatingHashes: Array(10).fill('derselbe-inhalt')
    })
    expect(result.renames).toHaveLength(10)
    expect(result.unmatched).toHaveLength(30)
    expect(result.blocked).toBe(true)
  })

  // Der Nutzer löscht einen großen Ordner, bestätigt den Dialog — und die Bremse
  // blockierte trotzdem. Die Löschung wurde nie auf den Server gezogen, obwohl die
  // Oberfläche "wird beim nächsten Sync nachgezogen" versprach.
  it('REGRESSION: bestätigte Ordnerlöschung (376 Dateien) blockiert nicht mehr', () => {
    const geloescht = many(376, '400 - Archiv/alt/')
    const result = assessDeletions({
      deletions: geloescht,
      totalFiles: 7181,
      hashOf: p => H(p),
      compensatingHashes: [],
      isIntentional: p => isConfirmedDeletion(p, { paths: {}, prefixes: { '400 - Archiv/alt/': 1 } })
    })
    expect(result.blocked).toBe(false)
    expect(result.intentional).toHaveLength(376)
    expect(result.unmatched).toEqual([])
  })

  it('unbestätigte Löschungen laufen weiter durch die Bremse — auch neben bestätigten', () => {
    const result = assessDeletions({
      deletions: [...many(20, 'bestaetigt/'), ...many(30, 'ausserhalb/')],
      totalFiles: 500,
      hashOf: p => H(p),
      compensatingHashes: [],
      isIntentional: p => isConfirmedDeletion(p, { paths: {}, prefixes: { 'bestaetigt/': 1 } })
    })
    expect(result.intentional).toHaveLength(20)
    expect(result.unmatched).toHaveLength(30)
    expect(result.blocked).toBe(true)
  })

  // Realer Fall vom 17.08.2026: ein Ordner wurde lokal verschoben, lag auf dem Server
  // aber in ZWEI alten Kopien. Das Umbenennungs-Budget aus toUpload deckte nur eine
  // davon, die zweite blieb "unerklärt" — 207 Stück, Voll-Sync stand zwei Tage.
  it('REGRESSION: Dublette auf dem Server blockiert nicht mehr, wenn der Inhalt lokal liegt', () => {
    const alteKopieA = many(180, 'alt-a/')
    const alteKopieB = many(180, 'alt-b/')
    const inhalt = (p: string): string => `inhalt-${p.split('/')[1]}`
    const result = assessDeletions({
      deletions: [...alteKopieA, ...alteKopieB],
      totalFiles: 7140,
      hashOf: inhalt,
      // Nur EINE neue Kopie geht hoch — genau deshalb reichte das Budget nicht.
      compensatingHashes: many(180, 'neu/').map(inhalt),
      contentSurvives: h => many(180, 'neu/').map(inhalt).includes(h)
    })
    expect(result.blocked).toBe(false)
    expect(result.preserved).toHaveLength(360)
    expect(result.unmatched).toEqual([])
  })

  it('blockt weiter, wenn der Inhalt NIRGENDS mehr liegt (der eigentliche Schutzfall)', () => {
    // Der Jazz-Ordner: 376 Dateien lokal verschwunden, Inhalt einzigartig.
    const result = assessDeletions({
      deletions: many(376, 'Jazz/'),
      totalFiles: 7181,
      hashOf: p => H(p),
      compensatingHashes: [],
      contentSurvives: () => false
    })
    expect(result.blocked).toBe(true)
    expect(result.preserved).toEqual([])
    expect(result.unmatched).toHaveLength(376)
  })

  it('trennt beide Entlastungen: überlebender Inhalt zählt als preserved, nicht als rename', () => {
    const result = assessDeletions({
      deletions: ['liegt-noch-da.md', 'wandert-mit.md', 'echt-weg.md'],
      totalFiles: 500,
      hashOf: p => `inhalt-${p}`,
      compensatingHashes: ['inhalt-wandert-mit.md'],
      contentSurvives: h => h === 'inhalt-liegt-noch-da.md'
    })
    expect(result.preserved).toEqual(['liegt-noch-da.md'])
    expect(result.renames).toEqual(['wandert-mit.md'])
    expect(result.unmatched).toEqual(['echt-weg.md'])
    expect(result.blocked).toBe(false)
  })

  // Bewusst in Kauf genommen, damit es niemand später "reparariert": anders als das
  // Umbenennungs-Budget ist contentSurvives ein Prädikat, kein Kontingent. Eine
  // überlebende Kopie deckt beliebig viele inhaltsgleiche Pfade. Das kostet Pfade,
  // keinen Inhalt — und beide Richtungen sind umkehrbar (.sync-trash bzw. Soft-Delete).
  it('AKZEPTIERT: eine überlebende Kopie deckt beliebig viele inhaltsgleiche Pfade', () => {
    const result = assessDeletions({
      deletions: many(300, 'leer/'),
      totalFiles: 5000,
      hashOf: () => 'leerer-inhalt',
      compensatingHashes: [],
      contentSurvives: h => h === 'leerer-inhalt'
    })
    expect(result.blocked).toBe(false)
    expect(result.preserved).toHaveLength(300)
  })

  it('bestätigte Löschung schlägt überlebenden Inhalt — die Buchung bleibt eindeutig', () => {
    const result = assessDeletions({
      deletions: ['bestaetigt/weg.md'],
      totalFiles: 500,
      hashOf: () => 'egal',
      compensatingHashes: [],
      contentSurvives: () => true,
      isIntentional: p => isConfirmedDeletion(p, { paths: {}, prefixes: { 'bestaetigt/': 1 } })
    })
    expect(result.intentional).toEqual(['bestaetigt/weg.md'])
    expect(result.preserved).toEqual([])
  })

  it('lässt eine kleine, gewollte Löschung im großen Vault durch', () => {
    expect(assess(many(5), 7000).blocked).toBe(false)
  })

  it('lässt einen winzigen Vault in Ruhe (Mindestanzahl für die Anteilsregel)', () => {
    // 2 von 3 wären 66 %, aber unter MIN_FOR_RATIO — sonst blockiert ein
    // frisch angelegter Vault bei jeder Aufräumaktion.
    expect(assess(many(2), 3).blocked).toBe(false)
  })

  it('greift bei totalFiles = 0 nicht über die Anteilsregel', () => {
    expect(assess(many(3), 0).blocked).toBe(false)
  })

  it('blockt ab der absoluten Grenze auch ohne bekannte Gesamtzahl', () => {
    const result = assess(many(DELETION_GUARD.ABSOLUTE), 0)
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe('absolute')
  })
})
