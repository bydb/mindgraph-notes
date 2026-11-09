---
paths:
  - ".github/**"
  - "app/package.json"
  - "app/entitlements*"
  - "app/scripts/build-signer.mjs"
---

# Code Signing, Notarisierung, Snap

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Apple Code Signing & Notarization

- **Developer ID Application**: Jochen Rudolf Leeder (Team ID: `2MA34D4SN6`)
- **Zertifikat Hash**: `5442E85C0D83043BDDA07C31F76DFC8130DFFE5C` (G2 Sub-CA)
- **Hardened Runtime**: `app/entitlements.mac.plist` (JIT, unsigned exec memory, disable library validation, network, files)
- **Notarization**: via `xcrun notarytool submit` als separater CI-Step (nicht electron-builder `notarize: true` — das hängt sich auf)
- **`notarize: false`** in `app/package.json` `build.mac` — Notarization wird separat gemacht
- **`continue-on-error: true`** auf Notarization-Step, damit signierte DMGs auch ohne Notarization hochgeladen werden
- **GitHub Secrets**: `CSC_LINK` (Base64 .p12), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (.p8 Inhalt), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID` (letzteres liest `build.yml` derzeit nicht, Stand 09.11.2026)
- **App Store Connect API Key**: Im CI als `.p8`-Datei geschrieben nach `$HOME/private_keys/`, nach Build gelöscht
- **Lessons Learned**:
  - electron-builder `notarize: true` hängt endlos → `xcrun notarytool` direkt verwenden
  - `APPLE_API_KEY` muss als Dateipfad gesetzt werden, nicht als Inhalt
  - `~` wird in GitHub Actions Env-Vars nicht expandiert → `$HOME` verwenden
  - Neue Developer-Accounts: erste Notarization dauert Stunden, danach 5-15 Min

## Windows Code Signing (Certum SimplySign)

- **Anlass (16.09.2026)**: ein Konzern-Einkauf prüft die App; Windows-Builds waren bis dahin unsigniert. In Konzern-Umgebungen startet die Client-Verwaltung unsignierte Programme gar nicht erst — Signierung ist dort Eintrittskarte, nicht Kosmetik.
- **Zertifikat**: Certum „Standard Code Signing in the Cloud" auf die natürliche Person (Bestellung 17.09.2026, 1 Jahr, ~249 € brutto). Kein Azure Artifact Signing: in der EU nur für eingetragene Organisationen, Einzelpersonen nur USA/Kanada. Kein EV: seit 2024 ohne SmartScreen-Vorschuss. Der Schlüssel liegt in Certums Cloud-HSM; SimplySign Desktop stellt ihn als Smartcard-Zertifikat im Speicher `CurrentUser\My` bereit, signtool sieht eine Smartcard.
- **CI** (`build.yml`, Job `build-windows`): Action `dismine/windows-app-signing-setup-action` (auf Commit gepinnt, Quelle gelesen) installiert SimplySign Desktop 9.4.4.92 (URL gepinnt — die Anmeldung bedient das Login-Fenster per Tastatur, ein neues Fenster bricht sie), erzeugt aus dem TOTP-Geheimnis den Einmalcode, meldet an und wartet auf das Zertifikat. Danach signiert electron-builder selbst App-Exe, DLLs, Uninstaller, Setup und portable Exe. Der Thumbprint kommt NUR per CLI (`--config.win.signtoolOptions.certificateSha1`), nie in die package.json — ein lokales `npm run dist` ohne Zertifikat bleibt unsigniert lauffähig.
- **GitHub Secrets**: `CERTUM_USERNAME` (SimplySign-Login), `CERTUM_OTP_URI` (vollständiger `otpauth://`-Link vom Einrichtungs-QR-Code — Langzeitgeheimnis, ersetzt die Handy-App), `CERTUM_KEY_ID` (SHA-1-Thumbprint des Zertifikats). Ohne Secrets baut die CI unsigniert, **ein Tag-Build ohne Secrets bricht ab** — analog zur Notarisierungspflicht beim Mac.
- **`win.signtoolOptions.publisherName` muss exakt dem CN des Zertifikats entsprechen und darf danach nie wieder wechseln**: electron-updater vergleicht vor jedem Update den CN des Installers mit diesem Wert (`app-update.yml`); ein Wechsel hieße, dass jede installierte Version das nächste Update ablehnt, und die SmartScreen-Reputation fängt bei null an. Der Schritt „Signaturen prüfen" erzwingt die Gleichheit (plus Status `Valid` und Zeitstempel) — schlägt er fehl, fällt das Release.
- **Der SimplySign-Pin muss die aktuelle Version sein** (real 17.09.2026): eine ältere zeigt beim Start „Neue Version gefunden“, und je nach Timing tippt die Action Benutzername und Code ins falsche Fenster — im Log steht dann nur „Credential rejected 5 times“, obwohl die Zugangsdaten stimmen. Erkennbar an `Modal popup … size=479x408` (das IST das Login-Fenster) oder `[initial detection] Visible windows: 0`. Der Schritt „SimplySign-Version prüfen“ bricht deshalb vor der Anmeldung ab, sobald Certum eine neuere Version anbietet: Pin anheben, mit `only_windows=true` testen. Fehlversuche nicht blind wiederholen — sie zählen bei Certum gegen das Konto.
- **Nur SHA-256, Zeitstempel `http://time.certum.pl`** (RFC 3161). Kein SHA-1-Doppelsignieren (Windows 7 ist tot, halbiert den Verbrauch am 5000er-Monatslimit).
- **Testlauf ohne Release**: Actions → „Build and Release" → „Run workflow" mit `only_windows=true` (überspringt macOS/Linux). Ergebnis in den Datei-Eigenschaften → Digitale Signaturen kontrollieren.
- **SmartScreen bleibt trotzdem**: ein frisch signiertes Zertifikat hat null Reputation, der Hinweis „Windows hat den PC geschützt" verschwindet erst mit Download-Volumen — auch bei EV. Nicht als Signierfehler deuten.
- **Erneuerung**: Certum stellt seit 27.02.2026 maximal 459 Tage aus. Neues Zertifikat = neuer Thumbprint → `CERTUM_KEY_ID` tauschen; der CN muss identisch bleiben (siehe oben).

## Snap Store

- **Snap Name**: `mindgraph-notes` (registriert auf snapcraft.io)
- **Confinement**: `classic` (in `app/package.json` `build.snap`)
- **CI-Token**: `SNAPCRAFT_STORE_CREDENTIALS` GitHub Secret
- **Nur x64**: Snapcraft kann nicht arm64 auf amd64 cross-kompilieren
- **`continue-on-error: true`** auf Snap-Publish-Step
- **Channel**: `edge` (automatisch bei Tag-Push)
- Token erneuern: `snapcraft export-login --snaps=mindgraph-notes --channels=edge,beta,stable --expires YYYY-MM-DD -`
