---
id: app-sync-backups
keywords: [sync, synchronisation, backup, gerät, geräte, e2e, verschlüsselt, passphrase, mobile, ipad, datenverlust, sicherung]
---

# Sync und Backups

## E2E-Sync zwischen Geräten

MindGraph syncronisiert deinen Vault verschlüsselt zwischen mehreren
Geräten (Desktop, Mobile) — Zero-Knowledge, AES-256-GCM. Der Server
sieht **nur Chiffrate**, niemals Klartext.

Einrichten: Settings → Sync. Wähle eine Passphrase (lokal in
safeStorage gespeichert, wird **nie** zum Server geschickt) und einen
Aktivierungs-Code. Auf dem zweiten Gerät: dieselbe Passphrase + Vault-ID
eingeben → Initial-Sync läuft.

Auto-Sync-Intervall einstellbar (z.B. alle 2 Min). Konflikt-Strategie:
neuerer Timestamp gewinnt, ältere Version als `.sync-conflict-…`-Datei
abgelegt.

## Mass-Deletion-Schutz

Wenn ein Sync >10% und mindestens 10 Dateien löschen würde, blockt
MindGraph mit einem SAFETY-Fehler. Du kannst per "Force Sync"-Button
trotzdem erzwingen — bewusster Schritt.

## Automatische Backups (lokal)

Vor jedem Schreibvorgang auf eine `.md`-Datei legt MindGraph eine Kopie
in `<vault>/.mindgraph/backups/JJJJ-MM-TT/<relpath>/<datei>.<ts>.bak`
ab. Backups werden vom Sync **ausgeschlossen** — sie bleiben lokal.

Zusätzlich: Leere Writes auf nicht-leere Markdown-Dateien werden hart
blockiert — verhindert versehentliches Löschen über kaputte Editor-Pfade.

## Was nicht in den Sync wandert

- `.mindgraph/backups/` — lokal
- `.mindgraph/embeddings-*.json` — Cache, wird pro Gerät neu gebaut
- `.mindgraph/notes-cache.json` — Cache
- Was in `excludePatterns` in den Sync-Settings steht
