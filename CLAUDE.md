# MindGraph Notes

Obsidian-ähnliche Markdown-Notiz-App mit Wissensgraph, Flashcards, Spaced Repetition, Agent-Features und E2E-verschlüsseltem Sync.

## Tech Stack

- **Electron** + **electron-vite** + **React 19** + **TypeScript**
- **CodeMirror 6** als Markdown-Editor
- **Zustand** für State Management (13 Stores)
- **markdown-it** für Rendering
- **xterm.js + node-pty** für integriertes Terminal
- **imapflow + mailparser + nodemailer + Ollama** für Email-Client (Empfang, Analyse, Versand)
- CSS mit globalen Variablen (kein CSS-in-JS Framework)

## Projektstruktur

```
app/
├── src/
│   ├── main/            # Electron Main Process
│   │   ├── index.ts     # IPC-Handler (~6000 Zeilen)
│   │   ├── preload.ts  # contextBridge API
│   │   ├── edooboxService.ts  # edoobox API-Client
│   │   ├── marketingService.ts # WordPress REST API Client
│   │   ├── formularParser.ts  # DOCX-Akkreditierungsformular-Parser
│   │   └── sync/       # E2E Sync (crypto, fileTracker, syncEngine)
│   ├── renderer/
│       ├── components/  # React-Komponenten
│       │   ├── Editor/  # MarkdownEditor + CodeMirror Extensions
│       │   ├── Sidebar/ # FileTree, Suche
│       │   ├── Canvas/  # Graph View (React Flow)
│       │   ├── Flashcards/ Quiz/ # Lern-Features
│       │   ├── InboxPanel/  # Smart Email Client (Inbox, Compose, KI-Chat)
│       │   ├── AgentPanel/  # Veranstaltungs-Agent (edoobox) + Marketing
│       │   ├── Terminal/    # Integriertes Terminal (xterm.js + PTY)
│       │   ├── NotesChat/ SmartConnectionsPanel/ ZoteroSearch/ ...
│       │   └── Settings/ Onboarding/ ...
│       ├── stores/      # Zustand Stores
│       ├── styles/      # index.css (globale Styles + Variablen)
│       └── utils/       # Hilfsfunktionen (translations, sanitize, emailContextBuilder)
│   └── shared/           # Geteilte Types/Utilities (Main <-> Renderer)
├── resources/           # Bundled Assets (Starter-Vaults, Icons)
└── package.json
docs/                    # Website (mindgraph-notes.de)
mindgraph-sync-server/   # Separater Sync-Server (Docker)
```

## Befehle

```bash
cd app
npm run dev          # Entwicklungsserver starten
npm run build        # Production Build (electron-vite build)
npm run preview      # Preview von gebauten Assets
npm run start        # Gebaute App starten
npm run pack         # Unpacked Build erzeugen
npm run dist         # Installer erstellen (electron-builder)
npm run dist:mac     # Nur macOS Installer
```

## Architektur-Patterns

### IPC-Kommunikation
Neuer IPC-Handler: `ipcMain.handle()` in `main/index.ts` + `contextBridge.exposeInMainWorld()` in `preload.ts`.

### State Management (Zustand)
- **uiStore**: UI-Einstellungen, persisted via `persistedKeys` Array
- **notesStore**: Notizen, Vault-Daten
- **tabStore**: Tab-Verwaltung
- **graphStore**: Graph-Canvas Positionen, Edges
- **flashcardStore / quizStore**: Lern-Features
- **dataviewStore**: Dataview-Query-Ergebnisse
- **bookmarkStore**: Lesezeichen
- **reminderStore**: Erinnerungen für Tasks
- **syncStore**: Sync-Status (localStorage, key: `mindgraph-sync`)
- **emailStore**: Email-Abruf, Analyse, Compose, KI-Chat, Senden
- **agentStore**: Veranstaltungs-Import, edoobox-Push, Marketing, Status-Tracking
- **contactStore**: Kontakt-Aggregation (Email + edoobox + Vault)
- Selektoren: `useShallow` aus `zustand/react/shallow` verwenden

### Modals
Boolean-State in uiStore, `if (!open) return null` im Component.

### Übersetzungen
Dot-notation Keys in `translations.ts`, `useTranslation()` Hook.

### CSS
Globale Variablen in `styles/index.css`. Komponenten-CSS ist colocated.

### Canvas (React Flow)
- `GraphCanvas.tsx` rendert Node-Daten aus `useNotesStore().notes`.
- **Wichtig**: Notizen kommen beim Initial-Load oft aus dem Cache mit `content: ''` (siehe `Sidebar.tsx`, Performance-Optimierung).
- Für Features, die echten Markdown-Inhalt brauchen (Callouts, Tasks, externe Links), muss Content bei Bedarf nachgeladen werden (`readFilesBatch` + `updateNote`).
- Anzeige-Toggles in `uiStore`: `canvasShowTags`, `canvasShowLinks`, `canvasShowImages`, `canvasShowSummaries`, `canvasCompactMode`.
- Callout-Zusammenfassungen auf Karten werden auf maximal 100 Wörter begrenzt und die Kartenhöhe dynamisch berechnet.

## Sicherheit

- **HTML-Sanitization**: Immer `sanitizeHtml()` / `sanitizeSvg()` / `escapeHtml()` aus `utils/sanitize.ts`
- **Mermaid**: `securityLevel: 'strict'`
- **KaTeX**: `trust: false`
- Keine `dangerouslySetInnerHTML` ohne Sanitization

## Editor (CodeMirror 6)

Extensions liegen in `Editor/extensions/`:
- `languageTool/` – Grammatik/Rechtschreibprüfung (LanguageTool API)
- `dataview/` – Dataview-Abfragen
- `livePreview/` – Live Preview (Decorators, Widgets, Theme)
- `imageHandling.ts` – Drag & Drop Bilder
- `markdownFolding.ts` – Faltbare Code-Blöcke, Callouts, Frontmatter

Click-Handler für Decorations: `view.posAtCoords()` + StateField-Lookup nutzen (kein DOM-Traversal mit `closest()`).

## Release-Prozess

1. Version in `app/package.json` bumpen
2. Download-Links in `docs/index.html` aktualisieren (Version in JSON-LD Schema)
3. `CHANGELOG.md` aktualisieren
4. Commit: `"Bump version to X.X.XX-beta"`
5. Tag: `git tag vX.X.XX-beta && git push origin vX.X.XX-beta`
6. GitHub Actions baut automatisch:
   - macOS (arm64+x64) — signiert + notarisiert
   - Linux (AppImage+deb+snap)
   - Windows (exe)
7. Release wird automatisch auf GitHub erstellt via `softprops/action-gh-release`
8. Snap wird automatisch zum Snap Store (edge channel) hochgeladen

Oder: `/release` Command verwenden.

## Apple Code Signing & Notarization

- **Developer ID Application**: Jochen Rudolf Leeder (Team ID: `2MA34D4SN6`)
- **Zertifikat Hash**: `5442E85C0D83043BDDA07C31F76DFC8130DFFE5C` (G2 Sub-CA)
- **Hardened Runtime**: `app/entitlements.mac.plist` (JIT, unsigned exec memory, disable library validation, network, files)
- **Notarization**: via `xcrun notarytool submit` als separater CI-Step (nicht electron-builder `notarize: true` — das hängt sich auf)
- **`notarize: false`** in `app/package.json` `build.mac` — Notarization wird separat gemacht
- **`continue-on-error: true`** auf Notarization-Step, damit signierte DMGs auch ohne Notarization hochgeladen werden
- **GitHub Secrets**: `CSC_LINK` (Base64 .p12), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (.p8 Inhalt), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`
- **App Store Connect API Key**: Im CI als `.p8`-Datei geschrieben nach `$HOME/private_keys/`, nach Build gelöscht
- **Lessons Learned**:
  - electron-builder `notarize: true` hängt endlos → `xcrun notarytool` direkt verwenden
  - `APPLE_API_KEY` muss als Dateipfad gesetzt werden, nicht als Inhalt
  - `~` wird in GitHub Actions Env-Vars nicht expandiert → `$HOME` verwenden
  - Neue Developer-Accounts: erste Notarization dauert Stunden, danach 5-15 Min

## Snap Store

- **Snap Name**: `mindgraph-notes` (registriert auf snapcraft.io)
- **Confinement**: `classic` (in `app/package.json` `build.snap`)
- **CI-Token**: `SNAPCRAFT_STORE_CREDENTIALS` GitHub Secret
- **Nur x64**: Snapcraft kann nicht arm64 auf amd64 cross-kompilieren
- **`continue-on-error: true`** auf Snap-Publish-Step
- **Channel**: `edge` (automatisch bei Tag-Push)
- Token erneuern: `snapcraft export-login --snaps=mindgraph-notes --channels=edge,beta,stable --expires YYYY-MM-DD -`

## Sync (E2E verschlüsselt)

- Zero-Knowledge via WebSocket Relay (`wss://sync.mindgraph-notes.de`)
- AES-256-GCM, scrypt Key-Derivation
- Module: `app/src/main/sync/` (crypto.ts, fileTracker.ts, syncEngine.ts)
- Passphrase lokal via `electron.safeStorage`, wird nie zum Server gesendet
- Konfliktstrategie: neuerer Timestamp gewinnt, ältere als `.sync-conflict-YYYY-MM-DD`
- Mass-Deletion-Schutz: >10% und >=10 Dateien → SAFETY-Fehler, `sync(force=true)` überspringt Check
- Force Sync UI: Button in Settings bei SAFETY-Fehlern, ruft `triggerSync(true)` auf
- **Tombstones**: Server speichert Löschungen (`deleted_at`), Client prüft bei `diffManifests()` ob Datei auf Server gelöscht wurde → verhindert Re-Upload gelöschter Dateien
- **`getDeletedManifest()`** in `mindgraph-sync-server/src/storage.ts` liefert gelöschte Dateien
- **`lastServerTombstones`** in `syncEngine.ts` wird an `diffManifests()` übergeben

## Smart Email Client

### Empfang & Analyse (IMAP + Ollama)
- IMAP-Abruf via `imapflow`, Parsing via `mailparser` (dynamic imports in main/index.ts)
- Ollama-Analyse: Relevanz (0-100), Sentiment, Zusammenfassung, extrahierte Infos, Aufgaben, `needsReply`, `replyUrgency`
- Analyse-Prompt enthält Inhalt der `Email-Instruktionen.md` aus dem Vault als Relevanzkriterien
- Gewichtung: 1 Kriterium → 50-65%, 2 → 65-80%, 3+ oder direkte Rückfrage → 80-95%
- Prompt-Injection-Schutz: Sanitization von Mail-Body vor Ollama-Aufruf
- Anhang-Erkennung: `hasAttachments` + `attachmentNames` aus `parsed.attachments`
- Notiz-Erstellung: Relevante Mails → Markdown-Notizen in konfigurierbarem Ordner (default: `‼️📧 - emails/`) mit Frontmatter, Aufgaben (`@[[YYYY-MM-DD]]`)
- Passwörter via `electron.safeStorage`, nie im Klartext gespeichert
- Persistenz: `{vault}/.mindgraph/emails.json`

### Versand (SMTP + nodemailer)
- SMTP-Senden via `nodemailer` (dynamic import in main/index.ts, IPC: `email-send`)
- Account-Settings: `smtpHost`, `smtpPort`, `smtpTls`, `fromAddress` (volle Absender-Adresse), `name` (Anzeigename)
- HTML-Email: Body wird zu HTML konvertiert (Zeilenumbrüche → `<br>`)
- Signatur: Text (`signature`) + optionales Bild (`signatureImagePath`) als CID-Attachment eingebettet
- Signatur-Bild: Wird nach `{vault}/.mindgraph/signature-image.ext` kopiert, IPC: `email-select-signature-image`, `email-load-signature-image`
- Gesendete Emails werden in `emailStore.emails` mit `sent: true` getrackt

### KI-Chat & Kontext-Engine
- **EmailAIChatView.tsx**: Chat-Interface mit Ollama-Streaming (nutzt bestehenden `ollama-chat` IPC-Handler)
- **emailContextBuilder.ts**: Sammelt Kontext aus 7 Quellen:
  1. Email-Inhalt + Analyse
  2. Kontakt-Historie (letzte 10 Emails mit diesem Kontakt)
  3. Kontakt-Profil aus `contactStore` (Name, Buchungen, Vault-Erwähnungen)
  4. Relevante Vault-Notizen (Keyword-basierte Suche in Titel + Tags + Content)
  5. edoobox-Veranstaltungen (Buchungen des Kontakts + Keyword-Match)
  6. Offene Tasks aus dem Vault
  7. Max 30.000 Zeichen mit proportionaler Kürzung
- **Entwurf-Generator**: KI-Antwort → "Als Antwort verwenden" → ComposeView mit vorausgefüllten Reply-Headers + Signatur

### Kontakt-Aggregation
- **contactStore.ts**: Mergt Kontakte aus 3 Quellen (Email from/to, edoobox Bookings, Vault Wikilinks/Email-Regex)
- Autocomplete in ComposeView mit Source-Indikatoren (📧📅📝)
- Kontakt-Profil in Detail-View (Email-Anzahl, Buchungen, Vault-Notizen)

### UI (InboxPanel)
- View-Switcher: Liste | Detail | Compose | KI-Chat (über Header-Buttons "Neu" + "KI")
- Detail-View: Analyse + "Antwort erwartet"-Badge (rot/orange/blau) + Anhang-Info + "Original anzeigen"-Toggle + Reply/Discuss-Buttons
- ComposeView: Apple-Mail-Stil (Felder mit Trennlinien), Empfänger-Autocomplete, Signatur-Bild-Vorschau, Senden-Button
- Settings: Im **Agenten-Tab** — IMAP + SMTP pro Account, Absender-Adresse, Signatur (Text + Bild-Upload)

## edoobox-Agent

- Akkreditierungsformulare (.docx) importieren → Veranstaltungsdaten automatisch parsen → an edoobox API senden
- **formularParser.ts**: Extrahiert Titel, Termine, Referenten, Ort, Preis, Kontakt, Teilnehmer aus DOCX
- **edooboxService.ts**: API-Client für edoobox (v1 Query-Params, v2 JWT), Webhook-Support (Zapier)
- **marketingService.ts**: WordPress REST API Client (Posts erstellen, Medien uploaden)
- **AgentPanel.tsx**: UI mit Tabs: Import | Dashboard | Marketing
- **agentStore.ts**: Zustand Store für Events, Dashboard-Offers, Bookings, Marketing
- Dashboard: Occupancy-Charts, Teilnehmerlisten, Neuanmeldungen
- Marketing-Tab: WP Publishing, Ollama Content-Generierung, Google Imagen Bilder
- Settings im **Agenten-Tab**: API Key/Secret via `electron.safeStorage`
- Credentials: `edooboxSaveCredentials` / `edooboxLoadCredentials` IPC-Handler

## reMarkable-Integration (USB)

- USB-Verbindung über `http://10.11.99.1` (reMarkable "USB web interface")
- Main-Module: `app/src/main/remarkable/` (`service.ts`, `transports/usb.ts`, `types.ts`)
- IPC-Handler in `main/index.ts`:
  - `remarkable-usb-check`
  - `remarkable-usb-debug-info`
  - `remarkable-list-documents`
  - `remarkable-download-document`
  - `remarkable-upload-pdf`
  - `remarkable-optimize-pdf`
- Renderer-UI: `app/src/renderer/components/Sidebar/RemarkablePanel.tsx`
- Features: Dokumente browsen/importieren, PDF exportieren, **Optimieren + Export** (Ghostscript/qpdf Fallback)
- Stabilität: Upload-Flow enthält Reachability-Checks + Retry-Logik (wichtig für reMarkable Paper Move)
- Branding: reMarkable-Logo in `app/src/renderer/assets/remarkable-logo.png`

## Terminal (xterm.js + PTY)

- Integriertes Terminal via `node-pty` (Main) + `@xterm/xterm` (Renderer)
- Smart AI-Tool Detection: prüft `opencode` (bevorzugt) → `claude` (Fallback) via `checkCommandExists`
- Windows-Support: prüft zusätzlich WSL (`wsl opencode` / `wsl claude`) und nutzt gefundene CLI direkt
- Erweiterter PATH in `main/index.ts` (sowohl `terminal-create` als auch `check-command-exists`): enthält `/opt/homebrew/bin`, `~/.local/bin`, `~/.cargo/bin`, `~/.opencode/bin`, `~/.nvm/...`
- Bei neuen CLI-Tools: Pfad in **beiden** `additionalPaths`-Arrays in `main/index.ts` ergänzen
- **Terminal-Reset**: `handleRestart()` muss Mouse-Tracking-Modi deaktivieren (`\x1b[?1000l` etc.) und `term.reset()` aufrufen (nicht nur `clear()`), sonst werden Escape-Sequenzen als Klartext angezeigt nach Programmen wie opencode/claude

## Website (docs/index.html)

- Einsprachige HTML-Datei mit JS-basierter i18n (DE/EN)
- Übersetzungen als `translations` Objekt im `<script>`-Block
- JSON-LD Schema mit `softwareVersion` — muss bei Release aktualisiert werden
- Download verlinkt auf `https://github.com/bydb/mindgraph-notes/releases/latest`
- Alpha-Signup-Formular wurde in v0.3.0-beta durch direkte Download-Links ersetzt
