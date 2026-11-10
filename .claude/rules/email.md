---
paths:
  - "app/src/renderer/components/InboxPanel/**"
  - "app/src/renderer/stores/emailStore*"
  - "app/src/renderer/stores/contactStore*"
  - "app/src/shared/email*"
  - "app/src/main/email/**"
  - "app/src/renderer/utils/emailContextBuilder*"
  - "app/src/shared/localRunRisk*"
---

# Smart Email Client

> Ausgelagert aus CLAUDE.md am 09.11.2026. Wird nur geladen, wenn Dateien aus den obigen Pfaden gelesen werden.

## Smart Email Client

## Wo der Code liegt
- **Alle `email-*`-Handler stehen in `main/email/ipc.ts`** (seit 10.11.2026, vorher `main/index.ts`), angemeldet über `registerEmailIpc(deps)`. Ausnahme: `email-extract-event` steht weiter in `index.ts` beim Kalender.
- Neun Stellen öffnen eine Mailverbindung (acht `new ImapFlow`, ein `createTransport`). Die acht IMAP-Stellen holen ihre Optionen aus `buildImapOptions` (`main/email/connection.ts`, getestet) — eine neue IMAP-Verbindung nie mit eigenem Options-Objekt bauen. Passwortabfrage, Zeitlimits und Fehlerbehandlung bleiben je Aufrufer.
- **Aufbau einer ausgehenden Mail** liegt in `main/email/outgoing.ts` (getestet): `buildOutgoingMail` liefert die nodemailer-Optionen samt fester Message-ID, `renderRawMessage` die RFC-822-Bytes. Der Transportweg (`email-send`) ändert nichts am Aussehen der Mail. **Der Rohtext enthält die `Bcc:`-Kopfzeile** — nur der SMTP-Versand lässt sie weg. Gelingt die Ablage im Gesendet-Ordner, trägt die Kopie auf dem Server sie also (die lokale Gesendet-Mail der App kennt Bcc gar nicht). Der Rohtext ist außerdem keine byte-gleiche Kopie des Versands: er wird ein zweites Mal serialisiert, gleich ist nur die Message-ID. Als Versandtext darf der Rohtext erst dienen, wenn gemessen ist, dass Empfänger die Zeile nicht sehen (Codex F18).
- **Logs im Mailcode ohne Personenbezug** (seit 10.11.2026): Fehlertexte durch `redactForLog`, Mails nur als `mailRef(id)` (`shared/logRedaction.ts`, getestet). Kein Betreff, kein Notiz-Dateiname (trägt Absender und Zusammenfassung), keine Message-ID, kein Rohtext einer Modellantwort. Die Einstellungen (samt Konten) werden im `uiStore` nicht mehr ausgegeben.
- **Konto-IDs werden geprüft, bevor daraus ein Pfad wird** (`main/email/credentialPath.ts`, getestet): nur Buchstaben, Ziffern, `-`, `_`. Vorher zeigte `email-load-password` mit einer ID wie `x/../openrouter` auf eine andere Geheimnisdatei und gab deren Klartext an den Renderer (behoben 10.11.2026). Jeder neue Handler, der aus einer Renderer-ID einen Dateinamen bildet, braucht dieselbe Prüfung.
- **Microsoft-Anmeldung** liegt in `main/email/microsoftAuth.ts` (MSAL; Tests mit nachgebauter Bibliothek, die echte Abläufe NICHT belegen). Regeln: nichts beim Import (MSAL per `import()` beim ersten Aufruf); Marken und Kontobindung nur verschlüsselt im Unterordner `userData/microsoft-auth/` — bewusst außerhalb von `email-<id>.enc`, damit die Passwort-Handler sie nicht adressieren können — und **nie über IPC**. **Die Kontoart folgt aus der Form der ID** (`ms-` + 24 Hex, `isMicrosoftAccountId`): für solche IDs gibt es kein Passwort (weder lesen noch schreiben), und fehlt oder verdirbt die Ablage, heißt der Zustand `reauth-required` bzw. `storage-unreadable`, nie „Passwortkonto“. Unlesbare Ablage wird nie überschrieben. Die ID wird aus Mandant und `oid`-Claim abgeleitet (nicht aus `localAccountId` allein — das kann `sub` sein). Server/Port/TLS/Benutzer für den Abruf kommen aus `getImapAuth`. Unter Linux zählt das Backend `basic_text` nicht als Verschlüsselung. **`@azure/msal-node` ist exakt verankert** (bewusst eine mindestens zwei Wochen alte Version; nach jedem Update `npm audit`). IPC: `email-microsoft-login|cancel-login|status|logout`. **Die acht IMAP-Handler und `email-send` fragen die Kontoart noch nicht ab** — das ist Plan-Abschnitt 5/6; bis dahin scheitert ein Microsoft-Konto dort mit „Kein Passwort gespeichert“.
- **Microsoft-365-Anbindung** (Abruf über IMAP mit OAuth, Versand über Graph): Plan, Messungen und zwei Codex-Runden in `docs/codex-collab/microsoft-365-anbindung.md`. Dort stehen die harten Regeln (Kontoart im Main gebunden, Verbindungsangaben des Renderers für Microsoft-Konten ignorieren, BCC-Messung vor dem Versand-Bau).

## Empfang & Analyse (IMAP + Ollama)
- IMAP-Abruf via `imapflow`, Parsing via `mailparser` (dynamic imports in `main/email/ipc.ts`)
- Ollama-Analyse: Relevanz (0-100), Sentiment, Zusammenfassung, extrahierte Infos, Aufgaben, `needsReply`, `replyUrgency`
- Analyse-Prompt enthält Inhalt der `Email-Instruktionen.md` aus dem Vault als Relevanzkriterien
- Gewichtung: 1 Kriterium → 50-65%, 2 → 65-80%, 3+ oder direkte Rückfrage → 80-95%
- Prompt-Injection-Schutz: Sanitization von Mail-Body vor Ollama-Aufruf
- Anhang-Erkennung: `hasAttachments` + `attachmentNames` aus `parsed.attachments`
- Notiz-Erstellung: Relevante Mails → Markdown-Notizen in konfigurierbarem Ordner (default: `‼️📧 - emails/`) mit Frontmatter, Aufgaben (`@[[YYYY-MM-DD]]`)
- Passwörter via `electron.safeStorage`, nie im Klartext gespeichert
- Persistenz: `{vault}/.mindgraph/emails.json`

## Versand (SMTP + nodemailer + IMAP-Sent-Append)
- SMTP-Senden via `nodemailer` (dynamic import in `main/email/ipc.ts`, IPC: `email-send`)
- Account-Settings: `smtpHost`, `smtpPort`, `smtpTls`, `fromAddress` (volle Absender-Adresse), `name` (Anzeigename)
- HTML-Email: Body wird zu HTML konvertiert. **Link-Konverter** erkennt 4 Varianten: Markdown-Links `[Text](https://url)`, Markdown-Mailto, nackte URLs, nackte E-Mail-Adressen. Negative Lookbehinds verhindern Doppel-Linking innerhalb bereits gerenderter Tags.
- Signatur: Text (`signature`) + optionales Bild (`signatureImagePath`) als CID-Attachment eingebettet
- Signatur-Bild: Wird nach `{vault}/.mindgraph/signature-image.ext` kopiert, IPC: `email-select-signature-image`, `email-load-signature-image`
- Gesendete Emails werden in `emailStore.emails` mit `sent: true` getrackt
- **IMAP-Sent-Append** (v0.6.37): nach erfolgreichem `sendMail` baut nodemailer per `streamTransport` einen RFC-822-Buffer, imapflow lädt Kopie in den `\Sent`-Folder hoch. Sent-Folder-Detection via SPECIAL-USE-Flag (RFC 6154) mit Fallbacks auf bekannte Namen (`INBOX.Sent`, `Gesendet`, `INBOX.Gesendet`, `Sent Items`, `Gesendete Objekte`). **Konsistente `Message-ID`** zwischen SMTP und IMAP-Kopie. Fehler beim Append kippt Send-Erfolg nicht — gelbe Warnung unter grünem Status.

## KI-Chat & Kontext-Engine
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
- **Cloud für den E-Mail-Assistenten (seit 28.10.2026, Nutzerentscheidung)**: vorher im Main hart auf lokal gezwungen — auf 8-GB-Rechnern ohne Grafikkarte fror der Entwurf mit qwen3.5:4b das System ein, ohne Ausweg. Jetzt Cloud-Feature `email-draft` (Einstellungen → Cloud-Anbieter, eigener Rückfragetext mit allen Datenarten). Der Main prüft `isEmailDraftCloudAllowed` (Freigabe + genau das eingestellte Modell, aus `ui-settings.json`); ohne Freigabe Fehler, nie stiller lokaler Lauf. Mit Cloud geht standardmäßig nur `LEAN_EMAIL_CONTEXT` hinaus (Mail, Analyse, Verlauf mit dem Kontakt); Notizen, Aufgaben, Termine, Buchungen nur per Schalter im Assistenten. Lokal warnt `assessLocalRunRisk` (`shared/localRunRisk.ts`) schon bei „knapp“ (Modell + 4 GB ≥ RAM), nicht erst bei „passt nicht“. Brain bleibt fest lokal.

## Kontakt-Aggregation
- **contactStore.ts**: Mergt Kontakte aus 4 Quellen (Email from/to, edoobox Bookings, Vault Wikilinks/Email-Regex, persistenter Kontakt-Speicher)
- **Persistenter Kontakt-Speicher** `{vault}/.mindgraph/contacts.json`: Empfänger gesendeter Mails werden in `email-load` **vor** dem retainDays-Pruning und in `email-save` geharvestet (`harvestSentRecipients` in `main/email/ipc.ts`) — sonst verschwinden selten angeschriebene Adressen nach 30 Tagen aus dem Compose-Autocomplete. IPC: `email-contacts-load`
- Autocomplete in ComposeView mit Source-Indikatoren (📧📅📝)
- Kontakt-Profil in Detail-View (Email-Anzahl, Buchungen, Vault-Notizen)

## UI (InboxPanel)
- View-Switcher: Liste | Detail | Compose | KI-Chat (über Header-Buttons "Neu" + "KI")
- Detail-View: Analyse + "Antwort erwartet"-Badge (rot/orange/blau) + Anhang-Info + "Original anzeigen"-Toggle + Reply/Discuss-Buttons + "Erledigt"-Toggle
- **Schreibfenster `ComposeWindow.tsx` (seit 09.11.2026)**: schwebt per `createPortal`, ist aber **nicht modal** — die Ebene hat `pointer-events: none`, nur das Fenster fängt Klicks. Vorher sperrte eine Vollflächen-Abdeckung die App, aus Petrol-Chat/Agent ließ sich nichts kopieren. Verschiebbar (Kopfzeile), Größe per Griff, Verkleinern zur Leiste unten rechts (ComposeView bleibt dabei gemountet). **Gemountet in `App.tsx`, nicht im InboxPanel** — sonst baut jeder Panelwechsel das Fenster ab. Startgröße beim Öffnen berechnen, nicht beim Mount (App-Fenster ist beim Start noch klein). Jeder neue Entwurf (Neu/Antworten/Weiterleiten/Entwurf öffnen) ruft zuerst `retireOpenCompose()` im Store. ⌘W im Fenster schließt die Mail, nicht den Tab.
- **Empfänger An/CC/BCC**: `shared/emailRecipients.ts` (`parseRecipientList`, getestet). Das einzeilige `<input>` verschluckt beim Einfügen die Zeilenumbrüche — `onPaste` liest deshalb `clipboardData` selbst. Trenner Umbruch/`,`/`;`, Tab = Leerraum (Tabellenzeile `Name<Tab>Adresse`), `"Müller, Hans" <…>` bleibt ganz. Ungültiges bleibt im Feld stehen und sperrt den Versand; `email-send` im Main prüft jede Adresse ein zweites Mal und gibt Namen als `{name, address}` an nodemailer.
- Settings: **Eigener Settings-Tab „Email"** (seit v0.5.32) — vorher unter „Agenten" versteckt. Mit Briefumschlag-Icon, nur sichtbar bei aktivem `email`-Modul. IMAP + SMTP pro Account, Absender-Adresse, Signatur (Text + Bild-Upload).
- **`replyHandled`** auf Mails (persistent in `emails.json` als `analysis.replyHandled`) — übersteht KI-Reanalyse. Hover-Häkchen im „Zu beantworten"-Widget setzt es.
