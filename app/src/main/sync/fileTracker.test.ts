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
    expect(isSyncable('.mindgraph/emails.json')).toBe(true)
    expect(isSyncable('.attachments/datei.bin')).toBe(true)
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
    expect(isSyncable('.mindgraph/emails.json')).toBe(true)
    expect(isSyncable('.mindgraph/contacts.json')).toBe(true)
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
