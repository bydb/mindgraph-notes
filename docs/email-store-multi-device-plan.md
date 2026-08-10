# Mailliste auf mehreren Geräten — Befund und Vorschlag

Stand: 2026-08-10. Anlass: Eine Mail (Annette Pitters, 07.08.2026 15:31) lag im
Postfach, ihre Notiz mit Aufgaben lag im Vault — in der Mailliste der App fehlte
sie. Kein Einzelfall, sondern ein wiederkehrendes Muster.

Dieses Dokument beschreibt nur den zweiten von zwei Befunden. Der erste (der
Abruf übersprang Mails dauerhaft) ist behoben, siehe
`shared/emailFetchWindow.ts`.

## Was beobachtet wurde

- Die fehlende Mail steht in **keiner** Fassung von `.mindgraph/emails.json` —
  weder in der aktuellen noch in den beiden Konflikt-Kopien vom 06. und 07.08.
- Ihre Notiz existiert und liegt in `/2026/emails/`. Dieses Gerät schreibt
  Mail-Notizen laut Einstellung nach `‼️📧 - emails`.
- Im Vault liegen **drei** Mail-Notiz-Ordner nebeneinander: `‼️📧 - emails`
  (487 Notizen), ` - emails` (17), `emails` (12). Die beiden kleinen wurden im
  selben Zeitraum beschrieben wie der große, nicht davor.
- Es existieren Sync-Konflikt-Dateien `emails.sync-conflict-2026-08-06.json` und
  `-2026-08-07.json`.
- `emails.json` enthält Mails eines zweiten Kontos (`email-1786001135873`), das
  auf diesem Gerät nicht eingerichtet ist.
- Die Konflikt-Kopie vom 06.08. enthält 198 Mails ab dem 06.07.; die aktuelle
  Datei enthält 186 ab dem 08.07. Es sind also Mails **verschwunden**.

## Warum die Notiz überlebt und die Mail nicht

Notizen sind einzelne Dateien. Der Sync führt zwei Geräte zusammen, indem er
Dateien einzeln abgleicht — beide Notizen überleben, gegebenenfalls in
verschiedenen Ordnern, weil der Zielordner eine **geräte-lokale** Einstellung
ist (`uiStore`, localStorage; Dev- und installierte App haben ohnehin getrennte
Profile).

Die Mailliste ist **eine einzige Datei**, die jedes Gerät vollständig neu
schreibt:

```ts
// main/index.ts, ipcMain.handle('email-save')
await fs.writeFile(emailsPath, JSON.stringify(data, null, 2), 'utf-8')
```

Es gibt kein Lesen-Ändern-Schreiben und keine Vereinigung. Der Renderer hält die
komplette Liste im Speicher und schreibt sie als Ganzes zurück. Wer zuletzt
speichert, gewinnt; alles, was das andere Gerät zwischenzeitlich geholt hat,
fällt aus der Liste.

## Zwei weitere Schärfen, die dasselbe verstärken

1. **`retainDays` schneidet beim Laden und schreibt zurück.** `email-load`
   kürzt die Liste anhand der **lokalen** Einstellung und speichert das Ergebnis
   sofort. Ein Gerät mit 30 Tagen kappt damit die 60-Tage-Historie des anderen —
   still, ohne Abruf, allein durchs Öffnen.
2. **Der Abruf-Merker `lastFetchedAt` steckt in derselben Datei.** Er ist damit
   geräteübergreifend. Das ist im heutigen Entwurf *tragend*: Holt Gerät A eine
   Mail und rückt den Merker vor, holt Gerät B sie nie selbst — es verlässt sich
   darauf, sie über die synchronisierte Liste zu bekommen. Genau diese Kopplung
   macht den Verlust total: Geht die Liste verloren, ist die Mail für **beide**
   Geräte unerreichbar, obwohl sie auf dem Server liegt.

Punkt 2 ist der Grund, warum „Datei einfach aus dem Sync nehmen" nicht ohne
Weiteres funktioniert.

## Vorschläge

### A — Vereinigen statt Überschreiben (empfohlen)

`email-save` liest die Datei vor dem Schreiben, vereinigt sie über die Mail-ID
mit dem übergebenen Stand und schreibt das Ergebnis. Regeln:

- **Mail vorhanden in genau einer Seite** → übernehmen. Behebt den gemeldeten
  Fall unmittelbar.
- **Beidseitig vorhanden** → Feld für Feld: eine vorhandene Analyse schlägt
  „noch nicht analysiert"; bei zwei Analysen gewinnt die jüngere (`ki-datum`
  liegt bereits im Frontmatter der Notiz, in der Mail selbst `analysis.model`).
  Nutzer-gesetzte Marken (`replyHandled`, `noteCreated`) sind **oder**-verknüpft
  — einmal erledigt bleibt erledigt.
- **Löschen** braucht eine eigene Spur. Ohne sie kehrt eine gelöschte Mail beim
  nächsten Abgleich zurück. Vorschlag: Grabstein-Liste analog zum Sync-Server
  (`deleted_at` je ID, Aufbewahrung = `retainDays`).
- **`lastFetchedAt` wird pro Gerät geführt**, nicht mehr global vereinigt —
  sonst hebt der Merker des einen Geräts den Rückstand des anderen auf. Das
  bedeutet: jedes Gerät holt künftig selbst. Doppelte Analysekosten sind der
  Preis; dafür ist keine Mail mehr auf ein einzelnes Gerät angewiesen.
- **`retainDays`-Kürzung beim Laden entfällt** oder wird auf „nur anzeigen"
  umgestellt. Eine Anzeigeeinstellung darf keine Daten löschen.

Aufwand: mittel. Risiko: beherrschbar, weil `emails.json` reine Zwischendaten
sind — die Notizen im Vault bleiben die Wahrheit.

### B — Datei pro Gerät

`emails-<deviceId>.json` je Gerät, die Anzeige führt beim Laden zusammen.
Schreibkonflikte verschwinden vollständig, weil nie zwei Geräte dieselbe Datei
schreiben.

Nachteil: Analysen werden doppelt gerechnet (jedes Gerät analysiert seine
eigenen Mails), und die Zusammenführung wandert in den Renderer — dieselbe
Vereinigungslogik wie in A, nur an anderer Stelle. Löschen wird einfacher, das
Duplikat-Problem in der Anzeige dafür sichtbar.

### C — Nur absichern, nicht vereinigen

Vor dem Schreiben prüfen, ob sich die Datei seit dem Laden geändert hat
(Zeitstempel oder Hash). Wenn ja: nicht schreiben, neu laden, Nutzer informieren.

Verhindert den stillen Verlust, löst ihn aber nicht auf — bei zwei aktiven
Geräten wird eine Seite regelmäßig abgewiesen. Sinnvoll als Sofortmaßnahme,
nicht als Ziel.

## Empfehlung

**A**, mit **C** als Zwischenschritt, falls A nicht sofort gebaut wird. Die
Grabstein-Spur ist der aufwendigste Teil und sollte vor dem Rest entworfen
werden — ohne sie tauscht man stillen Verlust gegen stille Wiederkehr.

## Was vorher zu klären ist

- Gibt es tatsächlich zwei aktive Installationen auf demselben Vault, oder
  stammen die Fremd-Ordner von der Dev-App? Der zweite Kontoeintrag in
  `emails.json` spricht für ein echtes Zweitgerät.
- Sollen die Notizen aus ` - emails` und `emails` in den Hauptordner
  zurückgeführt werden? Das ist Aufräumen, kein Fix — aber solange die Ordner
  existieren, verteilen sich Aufgaben und Backlinks auf drei Orte.
