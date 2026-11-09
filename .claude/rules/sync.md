---
paths:
  - "app/src/main/sync/**"
  - "mindgraph-sync-server/**"
  - "app/src/renderer/stores/syncStore*"
---

# E2E-Sync

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Sync (E2E verschlüsselt)

- Zero-Knowledge via WebSocket Relay (`wss://sync.mindgraph-notes.de`)
- AES-256-GCM, scrypt Key-Derivation
- Module: `app/src/main/sync/` (crypto.ts, fileTracker.ts, syncEngine.ts)
- Passphrase lokal via `electron.safeStorage`, wird nie zum Server gesendet
- Konfliktstrategie: neuerer Timestamp gewinnt, ältere als `.sync-conflict-YYYY-MM-DD`
- **Plaintext-Hash-Vergleich vor Conflict-Erzeugung** (v0.6.2): bevor `.sync-conflict-*`-Datei angelegt wird, wird Remote entschlüsselt und mit lokal verglichen — identischer Inhalt → kein Conflict-File, nur Manifest-Update. Verhindert Phantom-Konflikte.
- Mass-Deletion-Schutz: >10% und >=10 Dateien → SAFETY-Fehler, `sync(force=true)` überspringt Check
- Force Sync UI: Button in Settings bei SAFETY-Fehlern, ruft `triggerSync(true)` auf
- **Tombstones**: Server speichert Löschungen (`deleted_at`), Client prüft bei `diffManifests()` ob Datei auf Server gelöscht wurde → verhindert Re-Upload gelöschter Dateien
- **`getDeletedManifest()`** in `mindgraph-sync-server/src/storage.ts` liefert gelöschte Dateien
- **`lastServerTombstones`** in `syncEngine.ts` wird an `diffManifests()` übergeben
- **Server-Tombstone-Retention**: 90 Tage (v0.3.2+).
- **Activation-Codes atomar claimen** (v0.5.17): Validierung + Claim in einem `UPDATE` mit Bedingung. Vorher zwei parallele Connects konnten denselben Code beanspruchen.
- **Sync-Speicherlimit bei Updates** (v0.5.17): Limit-Vergleich subtrahiert jetzt die alte Größe (`currentSize - oldSize + neueGröße`); legitime Updates nahe am 5-GB-Limit schlagen nicht mehr fehl.
- **Was NICHT in den Sync wandert**: `.mindgraph/backups/` (Auto-Backups), `.mindgraph/embeddings-*.json`, `.mindgraph/notes-cache.json`, die feste Liste `EXCLUDE_PATTERNS` in `fileTracker.ts` und die vom Nutzer gewählten Ausschlüsse (`ExcludeConfig`: Ordner und Dateiendungen, `shouldInclude`).
