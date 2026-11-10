# Entwurf: MindGraph Notes mit Microsoft 365 – Hinweise für die Administration

Stand: 10.11.2026 · Entwurf von Claude, noch nicht veröffentlicht, noch nicht vom Nutzer abgenommen.
Gehört zu Plan-Abschnitt 7 (`microsoft-365-anbindung.md`, E11). Jede Aussage unten ist entweder am
Code belegt oder am Testmandanten gemessen; wo das nicht gilt, steht es dabei. Ort der
Veröffentlichung (Website, Hilfe in der App) ist offen.

---

## Worum es geht

MindGraph Notes ist ein Programm für Notizen und Wissensarbeit, das auf dem Rechner des Nutzers
läuft. Es kann ein Postfach bei Microsoft 365 einbinden: Mails abrufen, lokal
auswerten und beantworten. Dafür meldet sich die Person im Browser bei Microsoft an. In den meisten
Organisationen muss die Administration die Anwendung vorher einmal freigeben – sonst sieht die
Person die Meldung „Administratorgenehmigung erforderlich“.

## Welche Rechte die Anwendung anfragt

Ausschließlich **delegierte** Rechte. Die Anwendung handelt immer als die angemeldete Person und
erreicht nur deren eigenes Postfach. Es gibt keine Anwendungsrechte und keinen Zugriff auf fremde
Postfächer.

| Recht | Wozu |
|---|---|
| `User.Read` | Name und Anmeldename der angemeldeten Person lesen |
| `offline_access` | angemeldet bleiben, ohne bei jedem Start neu anzumelden |
| `IMAP.AccessAsUser.All` (Exchange Online) | Mails des eigenen Postfachs über IMAP abrufen, als gelesen markieren, verschieben |
| `Mail.Send` (Microsoft Graph) | Mails im Namen der angemeldeten Person senden |

Nicht angefragt werden: Kalender, Kontakte, Dateien, Teams, SharePoint, Verzeichnisdaten.

## Was die Anwendung technisch voraussetzt

- **IMAP muss für das Postfach eingeschaltet sein.** Der Abruf läuft über IMAP mit moderner
  Anmeldung (OAuth). Ist IMAP im Mandanten oder für das Postfach abgeschaltet, kann MindGraph Notes
  keine Mails abrufen.
- **Die klassische SMTP-Anmeldung wird nicht gebraucht.** Der Versand läuft über Microsoft Graph.
  Der Mandantenschalter „SMTP-Anmeldung deaktiviert“ kann so bleiben.
- Anmeldung: öffentlicher Client ohne Geheimnis, Authorization Code mit PKCE, Systembrowser,
  Rückweg `http://localhost` auf dem Rechner der Person.

## Wohin die Daten gehen

- **Mails:** direkt zwischen dem Rechner der Person und Microsoft. Es gibt keinen Server des
  Herstellers dazwischen.
- **Anmeldung:** Die Zugangsmarken liegen verschlüsselt im Benutzerprofil auf dem Rechner (über
  die Schlüsselverwaltung des Betriebssystems). Das Passwort sieht die Anwendung nie.
- **Ablage:** Abgerufene Mails werden in einem Ordner auf dem Rechner gespeichert, den die Person
  selbst wählt.
- **Auswertung:** Standard ist ein Sprachmodell, das auf dem Rechner selbst läuft.
- **Was den Rechner nur verlässt, wenn die Person es ausdrücklich einschaltet:**
  - ein Ende-zu-Ende-verschlüsselter Abgleich des Notiz-Ordners zwischen den eigenen Geräten,
  - die Auswertung oder das Entwerfen von Antworten über einen Cloud-Anbieter; dafür verlangt die
    Anwendung eine eigene Zustimmung mit Auflistung der betroffenen Daten.
- **Protokolle:** Die Anwendung schreibt keine eigene Protokolldatei. Ausgaben in der Konsole
  werden gefiltert (Adressen, Betreffzeilen und Zugangsmarken werden ersetzt); eine vollständige
  Garantie ist das nicht.

## Weg 1: Die mitgelieferte Anwendung freigeben

1. Ein Administrator startet MindGraph Notes, öffnet Einstellungen →
   E-Mail und wählt „Mit Microsoft anmelden“.
2. Im Zustimmungsfenster von Microsoft den Haken bei „Zustimmung im Namen Ihrer Organisation
   erteilen“ setzen und bestätigen.
3. Danach können sich alle Personen der Organisation ohne weitere Rückfrage anmelden. Jede erreicht
   nur ihr eigenes Postfach.

Zurücknehmen: im Entra Admin Center unter „Unternehmens-Apps“ die Anwendung „MindGraph Notes“
löschen oder die Zuweisung auf bestimmte Personen beschränken.

Hinweis: Microsoft zeigt die Anwendung derzeit als **„nicht überprüft“** an, weil der Herausgeber
noch nicht bei Microsoft verifiziert ist.

## Weg 2: Eine eigene App-Registrierung verwenden

Für Organisationen, die nur selbst registrierte Anwendungen zulassen.

1. Im Entra Admin Center unter „App-Registrierungen“ eine neue Registrierung anlegen.
   Kontotyp: nur dieser Mandant.
2. Umleitungs-URI: Plattform „Öffentlicher Client/nativ (mobil und Desktop)“, Wert
   `http://localhost`.
3. Unter „API-Berechtigungen“ die vier delegierten Rechte aus der Tabelle oben hinzufügen und die
   Administratorzustimmung erteilen.
4. Die Anwendungs-ID (Client-ID) und die Domain oder ID des Mandanten an die Nutzer
   weitergeben. Sie tragen beides in MindGraph Notes unter Einstellungen → E-Mail →
   „Eigene App-Registrierung der Organisation“ ein.

## Grenzen des heutigen Stands

- Nur Konten von Organisationen in der weltweiten Microsoft-Cloud. Private Outlook.com-Adressen und
  nationale Clouds werden nicht unterstützt.
- Keine Funktionspostfächer, kein Kalender, kein SharePoint.

---

## Für den Nutzer: was an diesem Entwurf nicht belegt ist

- **Weg 1** ist am Testmandanten gemessen (Administrator stimmt für die Organisation zu, danach
  kommen normale Konten ohne Rückfrage durch).
- **Weg 2** ist in dieser Form **nicht ausprobiert**: Unsere Registrierung ist für mehrere Mandanten
  angelegt, und die Rechte wurden bei der Anmeldung angefragt, nicht im Portal eingetragen. Die
  Felder für eigene Anwendungs-ID und Mandant sind gebaut und getestet (mit nachgebauter
  Bibliothek), aber nie gegen eine echte zweite Registrierung gelaufen.
- **„IMAP muss eingeschaltet sein“** folgt aus dem Aufbau; einen Mandanten mit abgeschaltetem IMAP
  haben wir nicht gesehen.
- **Beschränkung auf bestimmte Personen** in „Unternehmens-Apps“ ist eine Funktion von Entra, die
  ich nicht geprüft habe.
- Die Aussagen zu Abgleich und Cloud-Auswertung stützen sich auf `CLAUDE.md` und
  `.claude/rules/email.md`, nicht auf eine neue Prüfung.
- Vor einer Veröffentlichung: die vier Rechte fest in der App-Registrierung eintragen, damit
  Administratoren sie im Portal sehen; klären, ob und wann der Herausgeber verifiziert wird.
