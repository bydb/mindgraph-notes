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
- **Oberfläche für Microsoft-Konten**: `Settings/EmailMicrosoftAccounts.tsx` (Konto-Karte, Zeile „Mit Microsoft anmelden“, Aufklapper für eine eigene App-Registrierung). Die Seite unterscheidet Kontoarten mit `isMicrosoftAccountId(account.id)` aus `shared/emailAccountKind.ts`, nie über das Feld `auth` (das ist nur Anzeige). Ein Microsoft-Konto hat keine Server-, Port- oder Passwortfelder; „Entfernen“ meldet zuerst ab. Texte in `utils/i18n/settingsPages.ts` unter `settings.email.ms.*`, Anrede „du“. Gegenproben nur im Testprofil (`~/dev/mindgraph-test/start.sh`), nie im Produktiv-Vault. Das Onboarding (`Onboarding/steps/EmailSetupStep.tsx`) nutzt für den Reiter „Microsoft 365“ denselben Hook `useMicrosoftSignIn` und zeigt dort keine Passwortfelder; private Outlook.com-Adressen sind ausdrücklich nicht unterstützt (Anmeldung nur für Organisationskonten).
- **Microsoft-Anmeldung** liegt in `main/email/microsoftAuth.ts` (MSAL; Tests mit nachgebauter Bibliothek, die echte Abläufe NICHT belegen). Regeln: nichts beim Import (MSAL per `import()` beim ersten Aufruf); Marken und Kontobindung nur verschlüsselt im Unterordner `userData/microsoft-auth/` — bewusst außerhalb von `email-<id>.enc`, damit die Passwort-Handler sie nicht adressieren können — und **nie über IPC**. **Die Kontoart folgt aus der Form der ID** (`ms-` + 24 Hex, `isMicrosoftAccountId`): für solche IDs gibt es kein Passwort (weder lesen noch schreiben), und fehlt oder verdirbt die Ablage, heißt der Zustand `reauth-required` bzw. `storage-unreadable`, nie „Passwortkonto“. Unlesbare Ablage wird nie überschrieben. Die ID wird aus Mandant und `oid`-Claim abgeleitet (nicht aus `localAccountId` allein — das kann `sub` sein). Server/Port/TLS/Benutzer für den Abruf kommen aus `getImapAuth`. Unter Linux zählt das Backend `basic_text` nicht als Verschlüsselung. **`@azure/msal-node` ist exakt verankert** (bewusst eine mindestens zwei Wochen alte Version; nach jedem Update `npm audit`). IPC: `email-microsoft-login|cancel-login|status|logout|reset-storage`. „Erneut anmelden“ einer Karte schickt `expectedAccountId` mit — ein anderes Konto wird dann nicht gebunden (`account-mismatch`). In der Oberfläche gibt es EINEN Anmeldezustand für alle Karten (der Main lässt nur eine Anmeldung zu). `resetStorage` ist der bewusste Ausweg bei unlesbarer Ablage und verschiebt nur, löscht nie. Der Widerrufszähler muss VOR dem Lesen der Bindung erfasst werden. **Abruf:** alle sieben IMAP-Abrufwege holen ihre Anmeldung über `resolveImapLogin(accountId, endpoint)` in `ipc.ts` — für Microsoft-Konten Zugangsmarke plus fester Server aus dem Main, die Verbindungsangaben des Renderers werden verworfen (ein neuer IMAP-Zugang MUSS diesen Helfer nutzen, nie `loadEmailPassword` direkt). **Versand:** `email-send` zweigt für Microsoft-Konten ganz oben nach `sendViaGraph` (`main/email/graphSend.ts`, getestet) ab und kehrt nie in den SMTP-Zweig zurück. Absender und Anzeigename kommen aus der Anmeldung im Main, `composeData.account` wird dort nicht gelesen. Versandtext ist der MIME-Rohtext MIT `Bcc:`-Zeile an `POST /me/sendMail` — gemessen: Graph stellt die Blindkopie zu und entfernt die Zeile, auch an fremde Server; OHNE die Zeile käme die Blindkopie nicht an. 202 heißt „an Microsoft übergeben“, nicht zugestellt (eigener Text im Erfolgsbanner). Abbruch nach dem Absenden oder Serverfehler = `uncertain`, nie automatisch wiederholen; der Entwurf bleibt. Eigene Größengrenze `GRAPH_SEND_MAX_BYTES`. Die Gesendet-Kopie legt Graph selbst ab; `locateMicrosoftSentCopy` sucht sie per IMAP über die Message-ID und liefert Ordner und UID. Der IMAP-Gesendet-Append bleibt Passwortkonten vorbehalten.
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
- **Bilder im Mailtext (seit 11.11.2026)**: Dateien lassen sich ins Schreibfenster ziehen oder mit ⌘V einfügen. Bilder (PNG/JPEG/GIF/WebP, am Dateianfang erkannt) stehen im Textfeld als Platzhalter `![Name](bild:<inlineId>)` an der Cursorstelle, alles andere wird gewöhnlicher Anhang. Platzhalter-Logik in `shared/emailInlineImages.ts` (getestet). **Der Renderer schickt Bytes, keinen Pfad** (`email-stage-compose-files`): ein Screenshot liegt oft nur in einem Wegwerf-Ordner oder gar nicht auf der Platte, der Main kopiert sofort nach `userData/forward-attachments/` (dasselbe Verzeichnis wie beim Weiterleiten — Entfernen, Verwerfen und Aufräumen nach dem Senden greifen darüber). **Ein Bild ohne Platzhalter geht nicht mit** (weder eingebettet noch als Anhang): `splitInlineAttachments` in `buildOutgoingMail`, `sendableAttachments` im Store. Beim Versand wird der Platzhalter VOR `renderEmailHtml` gegen eine neutrale Marke getauscht (`renderBodyWithInlineImages`), sonst liefe der Dateiname durch Verlinkung und Bereinigung; eingebettet per Content-ID `mg-inline-<id>`, feste Breite höchstens 640 (Outlook übergeht `max-width`). Die Vorschau (`email-render-html`) setzt `data:`-Adressen ein und liest **nur aus dem Zwischenverzeichnis und nur echte Bilder** — der Pfad kommt aus dem Renderer. Einfügen greift nur ohne `text/plain` in der Zwischenablage (Word/Excel legen dem Text ein Bild bei). **Ein Platzhalter ohne Bild sperrt den Versand** (`findBrokenInlineTokens`, im Fenster und im Main) — sonst fiele das Bild still weg. Die Rechtschreibprüfung überspringt Treffer in Platzhaltern (`inlineTokenRanges`) und verwirft ihr Ergebnis, wenn sich der Text während der Prüfung geändert hat. Solange eine Übernahme läuft, ist Senden gesperrt. Grenzen einer Ablage (20 Dateien, 30 MiB je Datei, 100 MiB gesamt) stehen einmal in `shared/emailInlineImages.ts` und gelten vor dem Lesen im Fenster wie vor dem Schreiben im Main. Codex-Runde: `docs/codex-collab/email-bilder-im-text.md`.
- **Empfänger An/CC/BCC**: `shared/emailRecipients.ts` (`parseRecipientList`, getestet). Das einzeilige `<input>` verschluckt beim Einfügen die Zeilenumbrüche — `onPaste` liest deshalb `clipboardData` selbst. Trenner Umbruch/`,`/`;`, Tab = Leerraum (Tabellenzeile `Name<Tab>Adresse`), `"Müller, Hans" <…>` bleibt ganz. Ungültiges bleibt im Feld stehen und sperrt den Versand; `email-send` im Main prüft jede Adresse ein zweites Mal und gibt Namen als `{name, address}` an nodemailer.
- Settings: **Eigener Settings-Tab „Email"** (seit v0.5.32) — vorher unter „Agenten" versteckt. Mit Briefumschlag-Icon, nur sichtbar bei aktivem `email`-Modul. IMAP + SMTP pro Account, Absender-Adresse, Signatur (Text + Bild-Upload).
- **`replyHandled`** auf Mails (persistent in `emails.json` als `analysis.replyHandled`) — übersteht KI-Reanalyse. Hover-Häkchen im „Zu beantworten"-Widget setzt es.
