# Mail-Analyse → Kalendertermin

## Aufgabe
Aus einer E-Mail ohne `.ics`-Anhang einen pruefbaren Kalendertermin erzeugen: Titel, Beginn,
Dauer, Ort, Videokonferenz und wichtige Notizen. Danach wahlweise direkt in Apple Kalender
eintragen oder als `.ics` mit Erinnerungen 1 Tag und 15 Minuten vorher speichern.

## Kontext/Anker
- Reine Termin-/ICS-Logik: `app/src/shared/calendarEvent.ts`
- Main/IPC/Cloud-Routing/EventKit: `app/src/main/index.ts`, `app/src/main/preload.ts`
- Renderer: `app/src/renderer/components/InboxPanel/InboxPanel.tsx`, `EventDraftCard.tsx`
- Tests: `app/src/shared/calendarEvent.test.ts`

## Codex-Findings

### F01 — Cloud-Sentinel wurde als lokales Ollama-Modell aufgerufen
Schwere: hoch
Status: [ADRESSIERT]

Die erste Fassung uebernahm `email.analysisModel` direkt als Modellname. Bei OpenRouter oder
LLMBase ist dieser Wert ein Sentinel und haette lokal zu einem 404 gefuehrt. Der neue Weg nutzt
dieselbe autoritative Routing-Policy wie `emailStore` und reicht den bereits freigegebenen
Cloud-Provider Main-seitig an `resolveCloudChatOptions` weiter.

### F02 — Spaete Modellantwort konnte in der falschen Mail erscheinen
Schwere: hoch
Status: [ADRESSIERT]

Der Terminentwurf war nicht an die Mail-Generation gebunden. Mailwechsel setzt Entwurf, Fehler und
Busy-State nun zurueck; Antworten einer alten Request-Generation werden verworfen.

### F03 — Fehlende Uhrzeit wurde still als 09:00 angenommen
Schwere: hoch
Status: [ADRESSIERT]

Ohne erkannte Uhrzeit bleibt der Beginn jetzt offen und die Pruefkarte verlangt eine Korrektur.
`localDateTimeToIso` weist ausserdem Rollovers wie `31.02.` und ungueltige Uhrzeiten ab.

### F04 — Mail-Erinnerungen haetten bestehende Kalenderwege veraendert
Schwere: hoch
Status: [ADRESSIERT]

Der generische `calendar-create-event`-Handler haette bei jedem bisherigen Aufrufer automatisch
1-Tag-/15-Minuten-Alarme gesetzt (Schnelltermin, Timeblocking, `.ics`-Anhang). Das Bestandsverhalten
bleibt nun „keine Alarme ohne Angabe"; nur die neue Mail-Pruefkarte reicht beide Erinnerungen
ausdruecklich mit.

### F05 — Laufzeitpruefung
Schwere: niedrig
Status: [ADRESSIERT]

Der Einstieg „Termin erstellen" wurde im Electron-Dev-Build visuell verifiziert. Der Modellknopf
wurde auf der angezeigten privaten Mail nicht betaetigt; es wurde weder eine `.ics` gespeichert noch
ein Kalendertermin angelegt. Typpruefung, 1192 Tests und Production-Build sind gruen.

## Claude-Antwort

**Alle vier Befunde angenommen, keiner abgelehnt.** Im Code gegengeprueft:

- **F01** — `resolveCloudChatOptions` wird Main-seitig aufgerufen, der Renderer reicht das
  Cloud-Objekt statt eines vermeintlichen Modellnamens durch. Berechtigt: Ich hatte
  `email.analysisModel` unbesehen als Ollama-Modell behandelt.
- **F02** — Generationszaehler (`eventRequestGeneration`) plus Ruecksetzen beim Mailwechsel.
  Dasselbe Muster wie im Telegram-Scheduler; haette ich von dort uebernehmen sollen.
- **F03** — `localDateTimeToIso` weist ungueltige Werte ab, statt sie stillschweigend
  weiterzurollen. Der ehemalige `|| '09:00'`-Rueckfall war ein erfundener Wert an genau der
  Stelle, an der ich im eigenen Entwurf davor gewarnt hatte.
- **F04** — Der schwerwiegendste: `params.reminderMinutes ?? []` stellt das Bestandsverhalten
  wieder her. Ich hatte die Vorgabe in den GETEILTEN Handler gelegt und damit Schnelltermin,
  Timeblocking und den `.ics`-Anhang-Weg mitveraendert, ohne deren Aufrufer zu pruefen.

**Zwei Ergaenzungen aus dem Laufzeittest (20.08.2026, Dev-Build, echte Mail):**

- Der Schalter „In Kalender eintragen" war praktisch unlesbar. Ursache: fest verdrahtetes
  `color: #fff` statt der App-Tokens. Jetzt `--accent-color`/`--accent-on` wie
  `.inbox-action-btn--primary` — die Akzentfarbe haengt an Thema und Nutzereinstellung (Akzent
  „ink" ist im hellen Thema fast schwarz), ein fixes Weiss kann dort nicht stimmen.
- **Rundlauf belegt**: Der `.ics`-Leser der App (`parseIcsEvent`, fuer eingehende Anhaenge)
  liest die selbst erzeugte Datei fehlerfrei zurueck — Titel mit Schraegstrich, Ort mit Komma
  und ß, 210 Minuten, 14:00 Ortszeit aus 12:00 UTC. Damit sind Zeilenfaltung, Maskierung und
  Zeitzonenrechnung in einem Zug geprueft.

**Praxislauf an der Schulportal-Mail:** Beginn, Dauer, Ort und Notizen korrekt; das
Konferenzfeld blieb leer, obwohl die Mail mehrere Links enthaelt (Stornierung, Video-Empfehlung)
— die Allowlist hat gehalten. Schwaechster Punkt ist der Titel: Das Modell uebernimmt den
Betreff und schneidet dabei „Buchung fuer" ab. Aenderbar, aber unschoen.

**Offen:** Kein Praxislauf an einer Mail OHNE `.ics`-Anhang mit Konferenzlink im Fliesstext —
also genau dem Fall, fuer den das Feature gebaut ist.

## Status
✅ Feature umgesetzt, gegengeprueft und im Dev-Build verifiziert.
