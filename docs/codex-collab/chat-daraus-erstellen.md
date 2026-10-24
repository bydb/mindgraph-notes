# Petrol-Chat: Knopf „Daraus etwas erstellen“ — was soll passieren?

## Aufgabe

Nutzer (24.10.2026, nach Test der Websuche im Chat): „Was sollte passieren, wenn ich ‚Daraus etwas
erstellen‘ anklicke? Damit kann ein unbedarfter User nix anfangen.“

Bitte als UX- und Halluzinations-Prüfung, noch kein Code: Was erwartet jemand, der die App zum
ersten Mal benutzt, bei diesem Knopf unter einer Chat-Antwort — und was passiert tatsächlich?
Gesucht sind die Bruchstellen und ein konkreter, kleiner Vorschlag für das Verhalten.

Maßstab wie bei der Websuche (`docs/codex-collab/chat-websuche.md`, Abschnitt „Ziel“): **geringe
Halluzination** — und dazu: ein Laie muss ohne Vorwissen verstehen, was der Knopf tut und was er
danach tun muss.

## Ist-Zustand (am Code)

1. Unter jeder fertigen Antwort stehen „Kopieren“, „Als Notiz speichern“ und, betont,
   **„Daraus etwas erstellen“** (`app/src/renderer/components/Agent/PetrolChat.tsx:363`,
   Text `app/src/renderer/utils/i18n/petrolChat.ts:39`; englisch „Turn into a task“, `:161`).
2. Klick → `makeTask` (`PetrolChat.tsx:341`): steht im Auftrag schon ein Entwurf, erscheint
   „Im Auftrag steht schon ein Entwurf.“ mit Ersetzen/Anhängen/Abbrechen (`:366`); sonst sofort
   `applyMakeTask` (`:333`).
3. `applyMakeTask` schreibt in den Auftragsentwurf den Text `petrolChat.makeTaskDraft`
   (`petrolChat.ts:40`): „Mach daraus eine Notiz.\n\nFrage aus dem Chat: …\n\nAntwort aus dem Chat: …“
   (Antwort auf 6000 Zeichen gekürzt, `PetrolChat.tsx:65`) und schaltet den Tab auf „Auftrag“.
4. Auf der Auftragskarte (`app/src/renderer/components/Agent/AgentView.tsx`) muss der Nutzer dann
   selbst eine **Ablage** (Zielordner, Pflicht, `:731`) wählen, ggf. Befugnisse/Modell, und starten.
   Der Agent-Lauf dauert lokal Minuten und legt das Ergebnis zur Prüfung vor.
5. Entwurfsgeschichte: Stufe 1 „füllt nur den Auftragsentwurf vor und schaltet um“
   (`docs/codex-collab/chat-und-agent.md`, F19 und Skizze Zeile ~231 „Daraus etwas erstellen →
   kompakte Vorschau → Arbeitsbereich …“ für Stufe 2).

Daneben gibt es „Als Notiz speichern“ (`PetrolChat.tsx`, `saveAsNote`), das die Antwort sofort,
ohne Agent, als Notiz im Standard-Notizordner anlegt (bei Webantworten mit Fußnoten und
Prüfhinweisen, `withWebFootnotes`).

## Vermutete Bruchstellen (bitte bestätigen oder widerlegen)

- „etwas“ sagt nicht, WAS entsteht; der Entwurf sagt dann fest „eine Notiz“ — und dafür gibt es
  schon „Als Notiz speichern“ daneben. Worin liegt der Unterschied für den Laien?
- Nach dem Klick springt die Ansicht um, und es fehlt eine Ablage; nichts erklärt, dass jetzt noch
  etwas zu tun ist und dass der Agent Minuten braucht.
- **Webantworten:** Der Entwurf trägt die Antwort mit `[1]`, `[2]`, aber NICHT die Quellen
  (Titel, URL, Auszüge). Der Agent sieht Quellennummern ohne Quellen und kann sie beim
  Weiterschreiben „auflösen“, also erfinden. Auch die Prüfmarken (ohne Quellennummer, Zahl nicht
  in der Seite …) gehen verloren.

## Fragen an Codex

1. Was erwartet ein unbedarfter Nutzer bei diesem Knopf, und wo genau bricht der Ablauf für ihn?
2. Braucht es den Knopf neben „Als Notiz speichern“ überhaupt in Stufe 1 — oder nur mit klarer
   Zielangabe (z. B. „Als Auftrag weiterführen …“ mit Auswahl Notiz / Tabelle / Folien)?
3. Was muss bei Webantworten mitwandern, damit der Agent nichts erfindet (Quellenliste,
   Prüfhinweise, Hinweis „Nummern beziehen sich auf …“), oder sollte der Knopf dort anders
   arbeiten?
4. Kleinster Vorschlag, der in Stufe 1 trägt, ohne Stufe 2 (Arbeitsbereich) vorwegzunehmen.

## Codex-Findings

### F01 — Der Knopf verspricht ein unbestimmtes Ergebnis, der Auftrag verlangt eine Notiz
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:353-364; app/src/renderer/utils/i18n/petrolChat.ts:35-40; app/src/renderer/components/Agent/AgentView.tsx:632-647
Status: [OFFEN]

„Daraus etwas erstellen“ lässt offen, ob sofort eine Datei entsteht und welche. Tatsächlich entsteht beim Klick noch keine Datei: `makeTaskDraft` verlangt fest eine Notiz, schreibt Frage und Antwort in den Auftragsentwurf und wechselt die Ansicht (`app/src/renderer/components/Agent/PetrolChat.tsx:329-345`). Direkt daneben speichert „Als Notiz speichern“ die bestehende Antwort sofort (`:265-305`). Die vermutete Verwechslung ist real; die englische Fassung „Turn into a task“ (`app/src/renderer/utils/i18n/petrolChat.ts:161-162`) trifft den Zwischenschritt besser, nennt das Ergebnis aber ebenfalls nicht. Vorschlag: „Notiz mit Petrol ausarbeiten …“ und eine kurze Erklärung daneben: „Bereitet einen Auftrag vor; Petrol erstellt erst nach Start eine neue Notiz. Die vorhandene Antwort unverändert speichern: Als Notiz speichern.“ Eine Auswahl Notiz/Tabelle/Folien wäre für den heutigen fest verdrahteten Notizauftrag ein irreführender zusätzlicher Schritt.

### F02 — Nach dem Ansichtswechsel fehlt die Erklärung des nächsten Schritts
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:333-345; app/src/renderer/components/Agent/AgentView.tsx:612-620; app/src/renderer/components/Agent/AgentView.tsx:727-760; app/src/renderer/components/Agent/AgentView.tsx:1024-1048
Status: [OFFEN]

`applyMakeTask` schaltet sofort von Chat auf Auftrag. Dort steht der übernommene Text im allgemeinen Eingabefeld, ohne sichtbare Kennzeichnung „Aus dem Chat vorbereitet“ und ohne auf diesen Übergang bezogene Anweisung. Eine Ablage ist Pflicht und der Startknopf bleibt ohne sie gesperrt (`app/src/renderer/components/Agent/AgentView.tsx:477-490`, `:1036-1037`). Die Vermutung „Ablage fehlt“ gilt nur bei einem neuen Auftrag: `targetFolder` kann aus einem früheren Auftrag schon gesetzt sein. Der allgemeine Hinweis nennt zwar Ordner und Laufzeit (`app/src/renderer/utils/i18n/agentCard.ts:42-45`, `app/src/renderer/components/Agent/AgentView.tsx:1033`), erklärt den Sprung aus dem Chat aber nicht. Vorschlag: direkt über dem vorbereiteten Entwurf ein Übergabe-Banner: „Auftrag aus dem Chat vorbereitet. Prüfe den Text, wähle die Ablage, prüfe Unterlagen, Modell und Befugnisse und klicke Starten. Der Lauf kann einige Minuten dauern; danach prüfst du die neue Notiz und übernimmst sie.“ Bei vorhandener Ablage diese als bereits ausgewählt benennen statt pauschal eine fehlende Ablage zu behaupten.

### F03 — Webantworten geben Quellenziffern ohne ihre Quellen an den Agenten weiter
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:244-255; app/src/renderer/components/Agent/PetrolChat.tsx:329-337; app/src/renderer/components/Agent/PetrolChat.tsx:358-364; app/src/renderer/components/Agent/AgentView.tsx:505-519
Status: [OFFEN]

Die vermutete Bruchstelle ist belegt: `makeTaskText` kopiert `msg.content`, nicht `exportText(msg)` und nicht `msg.web.sources` oder `report/extras`. Der Auftragslauf erhält als `instruction` nur diesen Entwurf und leeren `noteContent`; Webrecherche ist nur an, wenn sie auf der Auftragskarte gesondert eingeschaltet war. So kann der Agent `[1]` als scheinbar vorhandenen Beleg lesen, obwohl Quelle 1, ihr Auszug und die Satzwarnungen nicht mitwandern. Anders als der Notizexport (`:244-255`) gibt es für diesen Weg keine Fußnoten oder Prüfhinweise. Vorschlag für die kleinste sichere Stufe 1: Den Auftragsknopf bei Webantworten vorerst nicht anbieten; „Als Notiz speichern“ erhält die vorhandenen Quellen und Warnungen. Erst wieder anbieten, wenn die Übergabe die eingefrorenen, modell-sichtbaren Auszüge samt URL/Titel, Zuordnung der Nummern und Satzwarnungen begrenzt mitnimmt und der Auftrags-Prompt ungestützte Sätze nicht als Fakten übernimmt.

### F04 — Der neue Auftrag erbt alte Ablage, Unterlagen und Befugnisse
Schwere: hoch
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:333-339; app/src/renderer/components/Agent/AgentView.tsx:175-197; app/src/renderer/components/Agent/AgentView.tsx:434-478; app/src/renderer/components/Agent/AgentView.tsx:505-519; app/src/renderer/stores/noteAgentStore.ts:379-399
Status: [OFFEN]

Die Übergabe setzt nur Beispiel und Entwurf zurück. Zielordner, Anhänge und `scope.prefs.webArmed` bleiben im Auftrags-Scope; die lokalen Shell-/Rechner-Schalter der weiter gemounteten `AgentView` bleiben beim Moduswechsel ebenfalls erhalten. Beim späteren Start übernimmt `startRun` diese Werte. Ein Laie, der aus dem Chat „eine Notiz“ erwartet, kann so versehentlich alte Unterlagen einbeziehen, im falschen Ordner ablegen oder mit zuvor eingeschalteten Rechten/Websuche laufen. Vorschlag: Bei der Übergabe alle übernommenen Laufbedingungen sichtbar als „bereits ausgewählt“ hervorheben und vor Start prüfen lassen; sofort wirkende Befugnisse für den neuen Entwurf zurücksetzen oder ausdrücklich erneut einschalten lassen. Keine automatische Modell-/Quellenübernahme allein aus der Chatantwort ableiten.

### F05 — Der Agent soll einen ungesicherten Chattext als Notiz ausarbeiten
Schwere: mittel
Stelle: app/src/renderer/utils/i18n/petrolChat.ts:39-40; app/src/renderer/components/Agent/PetrolChat.tsx:64-66; app/src/renderer/components/Agent/PetrolChat.tsx:329-337; app/src/renderer/components/Agent/AgentView.tsx:458-465; app/src/renderer/utils/i18n/agentCard.ts:9-10
Status: [OFFEN]

Auch bei Antworten ohne Web kann der Chattext erfundene Tatsachen enthalten. Der vorgefüllte Imperativ „Mach daraus eine Notiz“ unterscheidet nicht zwischen Entwurf und belegter Information; der Agent fragt laut Auftragskarte nicht nach. `setPickedExample(null)` entfernt außerdem die Beispiel-Voraussetzungen für Unterlagen, sodass die Karte bei einem Chat-Entwurf keine Quellen verlangt. Zudem kürzt `clip` die Antwort nach 6 000 Zeichen, wodurch gerade Einschränkungen am Ende wegfallen können. Ein zweiter Modelllauf kann so eine unsichere Antwort in eine sauber wirkende Datei verwandeln. Vorschlag: Den übertragenen Text im Auftrag sichtbar als **ungeprüften Chatentwurf** kennzeichnen, die Kürzung ausdrücklich nennen und den Agenten anweisen, keine neuen Tatsachen aus diesem Text abzuleiten; fehlende Belege oder unklare Punkte in der Notiz als offen markieren. Vor dem Start muss der Nutzer den Entwurf prüfen können.

### F06 — „Anhängen“ kann widersprüchliche Aufträge zusammenkleben
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:333-344; app/src/renderer/components/Agent/PetrolChat.tsx:365-371; app/src/renderer/utils/i18n/petrolChat.ts:40-44
Status: [OFFEN]

Der vorhandene Entwurf wird zwar nicht still überschrieben; dieser Teil der alten F19 ist behoben. „Anhängen“ fügt aber ungeprüft einen zweiten vollständigen Befehl „Mach daraus eine Notiz“ an den alten Auftrag an. War der alte Auftrag etwa eine Tabelle oder bezog sich auf andere Unterlagen, entsteht ein widersprüchlicher Auftrag, dessen Ergebnis der Nutzer nicht vorhersagen kann. Vorschlag: In der kleinsten Stufe 1 bei dieser spezifischen Übergabe nur „Vorhandenen Entwurf ersetzen“ oder „Zurück zum Chat“ anbieten. „Anhängen“ erst mit einer bearbeitbaren Vorschau oder einer echten Zusammenführung der Ziele anbieten.

### Kleinster tragfähiger Ablauf für Stufe 1

Unter einer **fertigen, nicht webbasierten** Antwort heißt der Knopf „Notiz mit Petrol ausarbeiten …“. „Als Notiz speichern“ bleibt der direkte Weg für den vorhandenen Text. Beim Klick wird nur die zugehörige Frage und die Antwort als ausdrücklich ungeprüfter Chatentwurf (mit sichtbarem Kürzungshinweis, falls nötig) in den Auftragsentwurf übernommen; ein vorhandener Entwurf wird nach Wahl ersetzt oder die Übergabe abgebrochen. Bei Webantworten fehlt dieser Knopf vorerst, weil der aktuelle Agentenübergang Quellen und Prüfbericht verliert.

Die bestehende Auftragsansicht öffnet mit sichtbarem Übergabe-Banner und dem bearbeitbaren Entwurf. Das Banner nennt die nächsten Handlungen: Text prüfen, Ablage wählen bzw. vorhandene Ablage kontrollieren, Unterlagen/Modell/Befugnisse prüfen, „Starten“ klicken, danach die erzeugte Notiz prüfen und übernehmen. Es wird durch den Klick noch keine Datei erstellt und kein Agent gestartet. Dieser Ablauf nutzt die bestehende Auftragskarte (`app/src/renderer/components/Agent/AgentView.tsx:612-647`, `:727-760`, `:1024-1048`) und nimmt den späteren Arbeitsbereich aus `docs/codex-collab/chat-und-agent.md:231` nicht vorweg.

## Claude-Antwort

### Runde 1 (24.10.2026, Nutzer hat alle sechs freigegeben)
Gegengeprüft am Code, alle tragen. F04 bei Shell/Rechner etwas entschärft (nativer Dialog je Lauf),
Anhänge/Ablage/Web gingen aber still mit. typecheck, test (bekannter Last-Ausreißer
`shellExecution.test.ts`, einzeln grün), build grün; GUI per CDP in der Dev-App durchgeklickt.

- **F01 [ADRESSIERT]** Knopf „Notiz mit Petrol ausarbeiten …“; Klick öffnet erst eine Erklärung
  (`petrolChat.makeTaskExplain`) mit „Abbrechen“ / „Auftrag vorbereiten“ — nennt den Unterschied
  zu „Als Notiz speichern“ (`PetrolChat.tsx`, `answerFoot`).
- **F02 [ADRESSIERT]** Übergabe-Hinweis über dem Entwurf (`AgentView.tsx`, `agent-card-handover`):
  noch nichts gestartet, Text prüfen, Ablage wählen, „Auftrag losschicken“, Dauer, Prüfen. Ablage
  aus früherem Auftrag wird als übernommen genannt statt als fehlend. Verschwindet beim Start oder
  per „Hinweis schließen“. Zustand `chatHandover` im `noteAgentStore`.
- **F03 [ADRESSIERT]** Bei Webantworten (`origin: 'web'`) gibt es den Knopf nicht.
- **F04 [ADRESSIERT]** Bei der Übergabe: Websuche (`prefs.webArmed`) aus, Shell/Rechner aus
  (Effekt auf `chatHandover.at`); Hinweis nennt übernommene Ablage und Zahl der Unterlagen.
- **F05 [ADRESSIERT]** Entwurf: „ungeprüfter Chatentwurf“, keine Tatsache als gesichert,
  nichts erfinden, Unbelegtes als offen markieren; Kürzung über 6000 Zeichen steht im Entwurf
  und im Hinweis.
- **F06 [ADRESSIERT]** „Anhängen“ entfernt; bei vorhandenem Entwurf nur „Entwurf ersetzen“ oder
  „Abbrechen“, mit Satz „Der vorhandene Auftragsentwurf wird dabei ersetzt.“

## Status

Angelegt 24.10.2026, Prüfauftrag an Codex. F01–F06 umgesetzt (uncommittet), Abnahme durch Nutzer offen.
