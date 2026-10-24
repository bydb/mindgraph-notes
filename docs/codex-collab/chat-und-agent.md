# Einfach chatten — wo, ohne die App unübersichtlich zu machen?

## Aufgabe

Der Nutzer hat MindGraph Notes (1.0.1) bei Kollegen installiert. Rückmeldung: **„einfach auch
chatten können“**. Der Petrol Agent (Agent-Tab) ist auftragsorientiert — ein Auftrag, ein Ergebnis,
übernehmen oder verwerfen. Einen fortlaufenden Chat gibt es nur im Notiz-Chat (rechtes Panel).

Gesucht ist ein **schriftlicher Entwurf** (technisch UND grafisch), wo ein niederschwelliger Chat
sitzen soll. Die Idee des Nutzers: mit dem Petrol Agent einfach hin und her chatten, eventuell mit
einem **Umschalter Chat / Agent**. Bitte diese Option ernsthaft prüfen, aber auch gegen Alternativen
halten.

Das ist eine **Konzeptdiskussion, kein Code-Review**. Keine Code-Edits, kein Commit. Widersprich
meinen Thesen, wo sie nicht tragen — am Code belegt.

## Ausgangslage (Screenshot 23.10.2026, 1920 × 1200)

- Titelleiste Mitte: Editor · Split · Brain · **Agent** (aktiv, Petrol hinterlegt).
- Agent-Tab: Kopf „Petrol Agent — Ein Auftrag genügt …“, großes Eingabefeld „Was soll entstehen –
  aus welchen Unterlagen?“, Status „Auftrag fehlt“, sechs Beispielkarten, darunter die Zeilen
  Unterlagen · **Ablage (Zielordner fehlt noch, Pflicht)** · Befugnisse (Web/Shell/Rechner) · Modell
  (qwen3.8:27b-mlx, „Auf diesem Rechner über Ollama“) · Bilder; Knopf „Auftrag eingeben“.
- Rechts das Panel „Aufgaben & Termine“. Der Notiz-Chat ist nicht sichtbar.

## Befund aus dem Code (Claude)

1. **Der Notiz-Chat ist versteckt.** Er öffnet nur über das Werkzeug-Menü „···“ der Titelleiste
   (`app/src/renderer/App.tsx:1517-1522`), als eines von acht rechten Panels
   (`App.tsx:216-250`), gegatet durch das Modul `notes-chat` (`renderer/stores/uiStore.ts:578`).
   Er kann viel: Kontextmodi `current | folder | all | project | vault`
   (`NotesChat.tsx:81`), Gesprächsmodi `direct | socratic | grill` (`:82`), Streaming, Vault-RAG mit
   Fußnoten (`:748-760`), Speichern als Notiz mit Provenienz (`:874-944`). Der Verlauf liegt nur im
   Komponenten-State (`:103-111`) — Panel zu, Gespräch weg.
2. **Der Agent ist an einen Zielordner gebunden.** `canRun` verlangt `hasTarget`
   (`AgentView.tsx:410`, `:466`). Für eine einfache Frage („Was steht in meinen Notizen zu X?“,
   „Formuliere mir diesen Absatz um“) ist „Ordner wählen“ eine Hürde ohne Nutzen.
3. **Der Agent kann schon weitersprechen — aber nur als neuer Lauf.** Folgelauf
   „Antworten und weitermachen“ (`noteAgentStore.ts:430-440`, `main/index.ts:4620-4633`,
   Test `main/noteAgent/loopFollowUp.test.ts`): der Transkript des Vorgängers wird übernommen
   (`peekContinuation`, `runRegistry.ts:283`). Gesperrt bei Webrecherche. Es ist also ein
   Gesprächsfaden vorhanden, aber eingekleidet als Auftragskette mit voller Karte.
4. **Ein Lauf ohne Datei mit Abschlusstext ist bereits legitim** (`main/noteAgent/loop.ts:391-420`:
   „Ein Lauf MIT Abschlusstext ist eine legitime Antwort und bleibt Erfolg“). Technisch kann der
   Agent also schon „nur antworten“.
5. **Zwei Chat-Wege mit getrennter Datenschutz-Logik**: Notiz-Chat (`ollama-chat`,
   `main/index.ts:6343`, Cloud via OpenRouter möglich, Vault-Modus lokal erzwungen) vs. Agent
   (Route-Einstufung `classifyAgentRoute`, Cloud-Zustimmung `evaluateCloudGate`, siehe CLAUDE.md
   „Notiz-Agent: Modellweg, Cloud-Zustimmung“). Ein dritter Weg wäre ein dritter Satz Regeln.

## Varianten

**A — Umschalter Chat / Agent im Agent-Tab** (Idee des Nutzers).
Ein Segment über dem Eingabefeld. *Chat*: Eingabezeile unten, Verlauf darüber, kein Zielordner,
keine Befugnis-Zeilen, Modellzeile bleibt (Transparenz). *Agent*: heutige Karte.
Pro: ein Ort, Name „Petrol“ bleibt Marke. Contra: ein Modus-Schalter ist eine Entscheidung, die
Einsteiger VOR der ersten Frage treffen müssen; zwei Layouts in einem Tab.

**B — Notiz-Chat sichtbar machen**, sonst nichts ändern.
Eigener Knopf neben „Agent“ in der Titelleiste oder Sprechblase im Kopf des Agent-Tabs, der das
rechte Panel öffnet. Pro: billig, vorhandene Fähigkeiten. Contra: rechtes Panel ist schmal und
konkurriert mit Aufgaben/Mail; Verlauf flüchtig; zwei KI-Orte mit unterschiedlicher Optik.

**C — Ein Gespräch, der Agent ist eine Fähigkeit darin** (meine Empfehlung, bitte angreifen).
Der Agent-Tab wird ein Gesprächsfaden. Eingabe unten, immer gleich. Standard ist *Antworten*
(Werkzeuge lesend: `note_search`, `note_read`, `vault_search`, kein Schreiben, kein Zielordner).
Will der Nutzer ein Ergebnis, erscheint im Faden die **Auftragskarte** — ausgelöst entweder durch
einen Knopf „Daraus etwas erstellen“ an jeder Antwort, durch ein Beispiel, oder durch ein
Schreib-Werkzeug, das das Modell anfordert („Dafür brauche ich einen Zielordner“ → Inline-Karte mit
Ordner, Befugnissen, Start). Die Karte ist dieselbe wie heute, nur als Nachricht im Faden.
Pro: kein Modus vorab; das Gespräch liefert den Kontext für den Auftrag (Folgelauf-Mechanik gibt
es schon); Ergebnisse bleiben übernehmen/verwerfen. Contra: größter Umbau; Risiko, dass die
Auftragsdisziplin (Unterlagen, Ablage) verwässert.

**D — Chat als eigener Tab neben Agent** („Petrol Chat“). Pro: sauber getrennt. Contra: dritter
Knopf in einer vollen Titelleiste, Doppelung zum Notiz-Chat, Nutzer muss vorher wissen, was er will.

### Meine Thesen

- **T1** Der Umschalter (A) löst das Symptom, aber verlagert die Hürde: Statt „Ordner wählen“ muss
  man „Chat oder Agent?“ entscheiden. Besser: Chat ist der Normalfall, Agent die Eskalation (C).
  Als Kompromiss: A mit Chat als Voreinstellung und einem Übergang „Als Auftrag weiterführen“, der
  den Verlauf mitnimmt — dann ist A eine Vorstufe von C.
- **T2** Der Notiz-Chat soll nicht verschwinden, sondern **Kontextchat am Dokument** bleiben
  (sokratisch, Grill, aktuelle Notiz/PDF). Der Agent-Tab wird der **allgemeine** Chat. Klare
  Arbeitsteilung: rechts = „über das, was ich gerade lese“, Agent-Tab = „über alles / etwas tun“.
- **T3** Der Chat im Agent-Tab braucht **keinen neuen IPC-Weg**: er läuft über `runNoteAgentLoop`
  mit einer Lese-Allowlist und ohne Zielordner; jede Nachricht ist ein Folgelauf. So gelten
  Routen-Einstufung und Cloud-Zustimmung automatisch, statt die Regeln des Notiz-Chats zu kopieren.
- **T4** Verlauf muss bleiben (Tab zu, App neu): sonst ist es kein Chat. Ablage lokal pro Vault,
  wie bei der Arbeitsbilanz in `userData`, nicht im Vault (Sync/Datenschutz).
- **T5** Grafisch: Eingabe unten fixiert (wie jede Chat-App), Beispiele als drei Chips über der
  Eingabe statt sechs großer Karten, Modellzeile als eine Statuszeile unter der Eingabe. Die
  Auftragskarte erscheint nur, wenn etwas entstehen soll.

## Fragen an Codex

1. Trägt T3 technisch? Was fehlt im Loop für einen schreibfreien Chat-Lauf (Pflicht-Zielordner im
   Main? `run.targetFolderAbs` als Pflichtfeld? Ergebnisprüfung, Leerlauf-Nudge, Iterationsgrenzen,
   Arbeitsbilanz-Ereignisse, die jeden Chat-Satz als „Agent-Lauf“ zählen würden)? Belege am Code.
2. Latenz: Ein Agent-Lauf mit Werkzeugen und 27B-Modell braucht Minuten. Ist ein Chat über den
   Loop realistisch „niederschwellig“, oder braucht Chat einen Direktweg ohne Werkzeuge (wie
   `ollama-chat`) und nur bei Bedarf Werkzeuge? Streaming?
3. Welche Variante (A/B/C/D) würdest du wählen, und welcher meiner Thesen widersprichst du?
4. Datenschutz/Transparenz: Was bricht, wenn der Chat Notiz-Inhalte liest (`note_read`,
   `vault_search`) und über einen Cloud-Weg läuft? Reicht die bestehende Agent-Zustimmung?
5. Was passiert mit dem Notiz-Chat — zusammenführen, behalten, umbenennen? Doppelte Verläufe?
6. Grafisch: Wie sieht der Übergang Chat → Auftragskarte aus, ohne dass die Karte mitten im Faden
   wie ein Formular wirkt? Wie verhält sich das im Split (< 560 px)?
7. Deine Reihenfolge: kleinster sinnvoller erster Schritt, der den Kollegen sofort hilft.

### Runde 2 (23.10.2026): Umsetzung Stufe 1 prüfen + Frage Websuche im Chat

**A — Umsetzung prüfen** (Stand: HEAD `687681f4` plus uncommittete Änderungen, siehe `git status`):
- Main: `app/src/main/index.ts` (`chatStreamChannel`, `chatMode 'petrol'` in `ollama-chat` und `lmstudio-chat`), `app/src/main/llm/petrolChatPrompt.ts`, `app/src/main/preload.ts` (`onPetrolChatChunk`), `app/src/shared/types.ts`.
- Renderer: `app/src/renderer/components/Agent/PetrolChat.tsx`, `app/src/renderer/stores/petrolChatStore.ts`, `app/src/renderer/components/Agent/AgentView.tsx` (Umschalter, `tabMode`), `app/src/renderer/stores/tabStore.ts` (dispose), `app/src/renderer/stores/uiStore.ts` (`agentTabDefaultMode`, Migration), `app/src/shared/workFocus.ts`, `GeneralSettingsTab.tsx`, `index.css` (Abschnitt „Petrol-Chat“), `i18n/petrolChat.ts`.
- Besonders prüfen: (1) Hält die Zusage „liest keine Notizen von selbst“ wirklich auf allen Wegen (Ollama, LM Studio, Cloud)? (2) Streaming-Zuordnung: ein Kanal für alle Agent-Tabs, `activeScope`, Request-Zähler, Stopp, Neues Gespräch, Tab schließen während Antwort, verspätete Chunks. (3) Störung des Notiz-Chats oder E-Mail-Chats (Kanäle, `removeAllListeners`). (4) Ollama-Aktivität/Vault-Indexer: zählt der Chat korrekt als Vordergrund bzw. bei Cloud nicht (`wrapIpcWithOllamaActivity`, `usesLocalOllama`)? (5) Migration `agentTabDefaultMode` (frische Installation vs. Bestand), Selektor-Loop-Fallen (CLAUDE.md „Loop-Fallen“). (6) Sanitizing des gerenderten Markdowns, Links. (7) „Als Notiz speichern“: Pfade, Kollision, Frontmatter-Escaping. (8) Wortlaut der Statuszeile gegen die Regeln aus `agent-auftragskarte-quellen.md`.

**B — Frage des Nutzers:** „Warum ist kein Zugriff auf das Internet möglich, um weniger Halluzination zu erreichen?“
Claudes Einschätzung zum Angreifen: Stufe 1 hat bewusst keine Werkzeuge (Codex F04: Latenz, F09: Datenwege). Websuche gibt es bereits im Agenten (Modul `web-research`, Tavily/SearXNG/Linkup, Egress-Kern `app/src/main/webResearch/egress.ts`, Quellen-Vertrag „genau ein Write“). Für den Chat denkbar: ein **Globus-Schalter pro Nachricht** („mit Websuche antworten“): App sucht (nicht das Modell), holt 2–3 Seiten über den bestehenden Egress-Kern, gibt Auszüge als untrusted Daten in den Prompt, Antwort mit nummerierten Quellen. Kein Werkzeug-Loop, also kurze Latenz und keine Prompt-Injection-Wirkung nach draußen (Chat hat keine Werkzeuge). Grenzen: Websuche verringert Halluzination nur bei Faktenfragen, nicht bei Formulierungsaufgaben; Modelle halluzinieren auch MIT Quellen (Zitat ohne Beleg) → Belegprüfung wie im Vault-Chat (`shared/rag/citations.ts`) wäre nötig, um „belegt“ nicht zu behaupten. Suchanfrage verlässt den Rechner (Transparenz in Statuszeile).
Bitte beurteilen: trägt das, was fehlt, was bricht (Sicherheit, Datenwege, Ehrlichkeit der Anzeige), und in welche Stufe gehört es?

## Codex-Findings

### F01 — T3: „Kein neuer IPC-Weg“ ist kein schreibfreier Chat
Schwere: hoch
Stelle: app/src/main/index.ts:4499; app/src/main/index.ts:4601; app/src/main/noteAgent/runRegistry.ts:57; app/src/main/noteAgent/loop.ts:215
Status: [OFFEN]

`note-agent-run` verlangt `targetFolderRel`, löst den Ordner im Main auf und prüft, ob er existiert; `AgentRun` verlangt sogar den absoluten Zielpfad. Der Loop gibt dem Modell danach mehrere Schreibwerkzeuge. Die Zielpflicht nur im Renderer zu entfernen oder „keine Befugnisse“ anzuzeigen ändert die tatsächlichen Rechte nicht. `''` als Ziel fällt über `path.join` auf die Vault-Wurzel zurück, wäre also eine versteckte Ablage und keine saubere Antwort ohne Ziel.

Vorschlag: Eigener, im Main erzwungener Laufzweck `chat` mit eigener Lese-Allowlist, ohne Zielpfad und ohne Accept-Pfad. Bis dahin T3 nicht als technische Abkürzung behandeln.

### F02 — T3: Der Auftrags-Prompt arbeitet gegen ein Gespräch
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:175; app/src/main/noteAgent/loop.ts:188; app/src/main/noteAgent/loop.ts:190; app/src/main/noteAgent/loop.ts:312; app/src/main/noteAgent/loop.ts:425
Status: [OFFEN]

Der Systemtext verlangt Lesen, Schreiben, eine Abschlussmeldung und ausdrücklich keine Rückfragen. Eine Abschlussfrage ohne Datei löst zusätzlich einen Nachfassversuch aus, der zum Schreiben drängt. Die Folgemeldung lautet „Setze den Auftrag ... fort“, nicht „Beantworte die neue Nachricht“. Dass ein Lauf mit reinem Abschlusstext erfolgreich sein darf (`loop.ts:409`), macht ihn noch nicht zu einem Chat.

Vorschlag: Für `chat` eigener Prompt und Abschlussregel; Rückfragen zulassen, Schreib-Nudge und Formatprüfungen dort abschalten.

### F03 — T3/T1: Fortsetzung ist nur ein flüchtiger Einzelfaden
Schwere: hoch
Stelle: app/src/main/noteAgent/runRegistry.ts:248; app/src/main/noteAgent/runRegistry.ts:278; app/src/main/index.ts:4623; app/src/renderer/stores/noteAgentStore.ts:437; app/src/renderer/stores/tabStore.ts:328
Status: [OFFEN]

Die Fortsetzung lebt in einer `Map` pro Fenster-Absender und hält nur den letzten erfolgreichen Lauf ohne Webrecherche. Der Renderer erlaubt sie nur aus der Prüfphase des aktuellen Laufs. Beim Schließen des Agent-Tabs werden dessen Bereich und ein laufender Auftrag verworfen. App-Neustart, parallele Gespräche und ein nach Webrecherche fortgesetzter Chat sind damit nicht abgedeckt.

Vorschlag: Gesprächs-ID, Nachrichten und aktiven Lauf getrennt modellieren; bei Übergang zum Auftrag nur einen ausdrücklich ausgewählten, begrenzten Gesprächsausschnitt übergeben.

### F04 — T3: Latenz und Streaming sind nicht chatfähig belegt
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:25; app/src/main/noteAgent/loop.ts:319; app/src/main/noteAgent/loop.ts:366; app/src/main/noteAgent/loop.ts:373; app/src/main/index.ts:4942; app/src/main/index.ts:4974; app/src/main/index.ts:6475
Status: [OFFEN]

Der Agent darf 12 beziehungsweise 20 Modellrunden ausführen, wartet pro Modellaufruf bis zu zehn Minuten und sendet währenddessen Werkzeugschritte; der Antworttext kommt erst im `note-agent-done`-Ereignis. Der direkte Ollama-Chat fordert dagegen `stream: true` an. Eine Aussage wie „Chat über den Loop ist niederschwellig“ lässt sich daraus nicht ableiten; echte Latenzmessungen fehlen.

Vorschlag: Alltagsfrage über einen streamenden Direktweg; Werkzeuge erst auf ausdrückliche Suche oder Auftrag hin, mit sichtbarem Arbeitszustand und Abbrechen. Vor Festlegung Zeit bis zum ersten Wort mit dem vorgesehenen 27B-Modell messen.

### F05 — T3/T4: Jede Nachricht verfälscht die Arbeitsbilanz
Schwere: mittel
Stelle: app/src/main/index.ts:4952; app/src/main/index.ts:4960; app/src/shared/activityLog.ts:673; app/src/shared/activityLog.ts:679
Status: [OFFEN]

Auch eine Antwort ohne Datei erzeugt `agent-run-finished` mit `resultCount: 0`; die Auswertung erhöht `runsFinished` und führt jeden Lauf ohne übernommenes Ergebnis als verworfen. Ein Gespräch mit zehn Antworten würde folglich zehn Agent-Läufe und zehn scheinbar ergebnislose Arbeiten erzeugen.

Vorschlag: Chat-Nachrichten aus der Auftragsbilanz ausnehmen und Verbrauch bei Bedarf getrennt messen; nur die gestartete Auftragskarte als Agent-Lauf zählen.

### F06 — T1/A: Der Umschalter muss keine Vorabfrage sein
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:466; app/src/renderer/components/Agent/AgentView.tsx:546; app/src/renderer/stores/noteAgentStore.ts:379
Status: [OFFEN]

Die jetzige Karte blockiert ohne Zielordner. Das spricht für einen leicht erreichbaren Chat, beweist aber nicht, dass ein Segment „Chat / Agent“ dieselbe Hürde erzeugt: Mit Chat als Voreinstellung wäre vor der ersten Eingabe keine Entscheidung nötig. Die Schwäche von A liegt eher darin, dass Verlauf und Auftrag ohne ausdrücklich gestalteten Übergang wieder zwei getrennte Zustände werden.

Vorschlag: A als mögliche erste Oberfläche ernst nehmen, Chat vorauswählen und „Als Auftrag ausarbeiten“ mit kontrollierter Kontextübergabe vorsehen; einen Moduswechsel nach Auftragstart nicht still erlauben.

### F07 — T2/B: Der vorhandene Notiz-Chat erfüllt „einfach chatten“ noch nicht
Schwere: hoch
Stelle: app/src/renderer/components/NotesChat/NotesChat.tsx:107; app/src/renderer/components/NotesChat/NotesChat.tsx:624; app/src/renderer/components/NotesChat/NotesChat.tsx:816; app/src/main/index.ts:6365
Status: [OFFEN]

Der Notiz-Chat startet im Modus „aktuelle Notiz“, verweigert die Eingabe ohne Notiz oder Anhang und sein Direkt-Prompt beantwortet Fragen anhand eines Notizkontexts. B als bloßer zusätzlicher Knopf macht deshalb einen allgemeinen Chat weiterhin unmöglich. Zudem kennt die Komponente bereits Ordner, erste 50 Notizen, Projekt und ganzen Vault (`NotesChat.tsx:80`, `:639`, `:754`) — T2s klare Grenze „rechts nur aktuelles Dokument“ stimmt heute nicht.

Vorschlag: Entweder den Kontext-Chat bewusst auf ausgewählte Unterlagen zuschneiden und umbenennen oder für allgemeines Chatten einen expliziten Modus „ohne Notizen“ mit passendem Prompt ergänzen. Vault-Modus mit Belegprüfung erhalten.

### F08 — T2/C/D: Zwei KI-Orte und zwei Verläufe bleiben erklärungsbedürftig
Schwere: mittel
Stelle: app/src/renderer/App.tsx:1511; app/src/renderer/App.tsx:1517; app/src/renderer/App.tsx:1673; app/src/renderer/components/NotesChat/NotesChat.tsx:122
Status: [OFFEN]

Im Werkzeug-Menü stehen bereits „Vault-Chat“ und „Notiz-Chat“, beide öffnen dasselbe rechte Panel mit unterschiedlichem Startmodus. Ein zusätzlicher allgemeiner Chat in Agent-Tab oder neuem Tab lässt Nutzer über den Ort einer alten Antwort und die Reichweite einer Frage raten. D vergrößert diese Navigationslast; C beseitigt sie nur, wenn die Begriffe und Übergaben geklärt sind.

Vorschlag: Sichtbare Namen nach Zweck („Mit Petrol chatten“, „Zu dieser Notiz fragen“), im Verlauf je Nachricht den verwendeten Kontext anzeigen und niemals zwei still getrennte Verläufe als einen ausgeben.

### F09 — T3/Datenschutz: Zustimmung deckt den Weg, nicht die einzelne Offenlegung
Schwere: hoch
Stelle: app/src/shared/agentRoute.ts:86; app/src/main/index.ts:4734; app/src/main/index.ts:4809; app/src/main/noteAgent/loop.ts:187; app/src/renderer/components/NotesChat/NotesChat.tsx:825
Status: [OFFEN]

Der Main prüft für Agent-Läufe Cloud-Modell und versionierte Zustimmung vor dem Vault-Zugriff; der Loop darf aber den ganzen Vault durchsuchen und Treffer als Werkzeugantwort an das Laufmodell geben. Die Zustimmung ist damit eine allgemeine Freigabe, keine Auswahl der tatsächlich gesendeten Notizen. Beim bestehenden Notiz-Chat werden Vault-RAG-Nachrichten gerade aus späteren Modellverläufen ausgeschlossen. Ein gemeinsamer Gesprächsfaden könnte diese Grenze beim Wechsel von lokalem Beleg-Chat zur Cloud unterlaufen.

Vorschlag: Pro Nachricht Herkunft, Vault und Modellweg führen; vor Cloud-Übergang konkret anzeigen, welche ausgewählten Auszüge oder Gesprächsteile übertragen werden; ungeprüfte und andere Vault-Inhalte standardmäßig ausschließen. Cloud-Wechsel nach lokaler Vault-Antwort eigens prüfen.

### F10 — T4: `userData` löst nur den Speicherort, nicht den Verlauf
Schwere: mittel
Stelle: app/src/main/activityLedger.ts:28; app/src/main/activityLedger.ts:63; app/src/renderer/components/NotesChat/NotesChat.tsx:122; app/src/renderer/stores/noteAgentStore.ts:169
Status: [OFFEN]

Das Tätigkeitsprotokoll zeigt ein brauchbares Muster für Dateien pro Vault in `userData`, schreibt aber JSON im Klartext. Notiz-Chat-Nachrichten liegen nur im Komponenten-State, Agent-Zustände nur im Store; ein Gesprächsschema mit Löschung, Aufbewahrungsfrist, Vault-Isolation und Wiederaufnahme existiert dort nicht. „Wie Arbeitsbilanz“ reicht für private Chattexte daher nicht als Datenschutzentscheidung.

Vorschlag: Eigenes per Vault geschlüsseltes Gesprächsformat, explizites Löschen und begrenzte Aufbewahrung entwerfen; festlegen, ob lokale Verschlüsselung nötig ist. Nach App-Neustart nur Textverlauf wiederherstellen, keine alten Werkzeugrechte oder Staging-Ergebnisse.

### F11 — T5/C: Die Karte darf keine Nachricht mit sofortigen Rechten sein
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:459; app/src/renderer/components/Agent/AgentView.tsx:466; app/src/renderer/stores/noteAgentStore.ts:448; app/src/renderer/styles/index.css:21799
Status: [OFFEN]

Die jetzige Karte verhindert einen neuen Lauf, solange Ergebnisse auf Übernahme warten, und erzwingt für den Start Aufgabe sowie Ziel. Wird sie als flüchtige Nachricht mitten im Faden behandelt, können diese Schranken zwischen Gespräch und Ausführung untergehen. Unter 560 px stapelt die vorhandene CSS-Regel schon das Formular; eine volle Inline-Karte würde den sichtbaren Gesprächsausschnitt verdrängen.

Vorschlag: Im Faden nur eine kompakte Vorschau mit „Auftrag vorbereiten“. Beim Öffnen wächst sie als abgesetzter Arbeitsbereich über dem fixierten Eingabefeld oder als ganze Teilansicht; im schmalen Split volle Breite dieses Bereichs, einklappbare Unterlagen/Befugnisse, Zielordner und Start immer sichtbar. Nach Start eine kurze Statuskarte im Faden, Ergebnisse mit Übernehmen/Verwerfen separat und dauerhaft erreichbar.

### F12 — Empfehlung: A als Einstieg, C nur nach Trennung von Gespräch und Auftrag
Schwere: mittel
Stelle: app/src/renderer/App.tsx:1270; app/src/renderer/App.tsx:1611; app/src/renderer/components/Agent/AgentView.tsx:466; app/src/main/index.ts:6343; app/src/main/index.ts:6365
Status: [OFFEN]

Vorschlag: **A** als Einstieg wählen: ein erreichbarer Petrol-Ort, Chat vorausgewählt, Agent als bewusste Fähigkeit. **C** ist ein sinnvolles späteres Ziel, aber der heutige Loop und die heutige Registry tragen den gemeinsamen Faden nicht. **B** allein hilft nicht, weil der Notiz-Chat Kontext verlangt (F07); **D** schafft einen weiteren Ort (F08). Kleinster sinnvoller erster Schritt für die Kollegen: Im bestehenden Agent-Tab eine Chat-Ansicht ohne Zielordner anbieten, mit streamendem Direktaufruf und eigenem Prompt ohne Notizpflicht; die bestehende Auftragskarte unverändert über „Auftrag“ erreichbar lassen. Dafür kann der vorhandene `ollama-chat`-Weg technisch dienen, sein Notiz-Prompt muss für kontextfreien Chat ausdrücklich angepasst werden; Cloud-Gate und Verlauf dürfen dabei nicht blind vom Notiz-Chat übernommen werden.

Skizze des späteren Übergangs: `Gespräch [Antwort] → „Daraus etwas erstellen“ → kompakte Vorschau „Entwurf: …“ → aufklappbarer Arbeitsbereich [Unterlagen] [Zielordner*] [Befugnisse] [Modellweg] [Starten] → im Faden „Auftrag läuft“ → Ergebniskarte [Ansehen] [Übernehmen] [Verwerfen]`. Im Split unter 560 px belegt der Arbeitsbereich die verfügbare Spaltenbreite, seine Abschnitte stehen untereinander; der Gesprächsfaden bleibt darüber scrollbar und die Eingabe unten. Der Übergang übernimmt nur vom Nutzer ausgewählte Nachrichten, nicht automatisch den ganzen Chat.

### F13 — Alte Chunks können in ein neues Gespräch geraten
Schwere: hoch
Stelle: app/src/renderer/stores/petrolChatStore.ts:86; app/src/renderer/stores/petrolChatStore.ts:103; app/src/renderer/stores/petrolChatStore.ts:138; app/src/main/index.ts:6541
Status: [OFFEN]

Der Chunk-Kanal trägt keine Anfragekennung. Der Store ordnet jeden eintreffenden Chunk dem gerade aktiven `activeScope` zu. Nach „Stopp“ oder „Neues Gespräch“ wird dieser Bereich freigegeben, obwohl der alte Main-Aufruf weiterläuft. Startet sofort eine neue Frage, können Chunks der alten Antwort in deren Streaming-Text landen; die Anfragezähler schützen nur das spätere `invoke`-Ergebnis (`petrolChatStore.ts:126`), nicht Chunks. Das gilt auch nach Tab-Schließen und neuem Agent-Tab.

Vorschlag: Main-Chunks mit Request-ID senden und im Store nur für genau diese ID annehmen. Stopp/Leeren/Tab-Schließen müssen die alte ID ungültig machen; ein unmittelbar neuer Lauf darf keine alten Chunks sehen. Den Ablauf mit zwei überlappenden künstlichen Streams prüfen.

### F14 — „Stopp“ stoppt nur die Anzeige
Schwere: hoch
Stelle: app/src/renderer/stores/petrolChatStore.ts:56; app/src/renderer/stores/petrolChatStore.ts:138; app/src/main/index.ts:6468; app/src/main/index.ts:6486; app/src/main/index.ts:7007
Status: [OFFEN]

`stop` setzt nur den Store zurück. Der Cloud- und Ollama-Aufruf läuft bis Antwort oder fünf Minuten Timeout weiter, der LM-Studio-Chat hat in diesem Pfad nicht einmal ein Abbruchsignal. Lokale Rechenlast, Cloud-Kosten und die Pause des Vault-Indexers können also weiterlaufen, während die Oberfläche bereits „gestoppt“ zeigt und neue Anfragen zulässt. Dadurch wird auch F13 wahrscheinlicher.

Vorschlag: Pro Anfrage einen Main-seitigen `AbortController` mit Abbruch-IPC und Cleanup führen; Cloud-, Ollama- und LM-Studio-Streams darüber beenden. Wenn nur das Anzeigen beendet werden kann, den Knopf bis dahin ehrlich „Antwort ausblenden“ nennen und einen neuen Start erst nach tatsächlichem Ende zulassen.

### F15 — Links in Antworten sind sichtbar, aber nicht nutzbar
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:31; app/src/renderer/components/Agent/PetrolChat.tsx:33; app/src/renderer/components/Agent/PetrolChat.tsx:250; app/src/main/index.ts:1535; app/src/main/index.ts:1538
Status: [OFFEN]

Markdown-Links erhalten `target="_blank"`. Der Hauptfenster-Handler verweigert solche Fenster bedingungslos; `ExternalLink` nutzt deshalb ausdrücklich den freigegebenen `open-external`-IPC (`app/src/renderer/components/Shared/ExternalLink.tsx:25`). Im Petrol-Chat wird der gerenderte Link hingegen ohne Klickbehandlung eingesetzt. Sanitizing ist vorhanden (`PetrolChat.tsx:39`), löst das Öffnen aber nicht.

Vorschlag: Klick auf bereinigte http/https/mailto-Links bewusst abfangen und über `openExternal` öffnen, andere Schemata abweisen. Vor einer Webquellenliste denselben Weg nutzen.

### F16 — „Nie überschreiben“ ist beim Speichern nicht erzwungen
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:182; app/src/renderer/components/Agent/PetrolChat.tsx:193; app/src/renderer/utils/noteFileName.ts:11; app/src/main/index.ts:2233
Status: [OFFEN]

Der freie Name wird erst mit `readFileOptional` gesucht; danach schreibt `writeFileSafe` mit `fs.writeFile`, das eine inzwischen angelegte Datei ersetzt. Zwei schnelle Speichervorgänge desselben Antworttexts oder ein zweites Fenster können denselben Minutenstempel und Namen gleichzeitig prüfen. Der Backup-Mechanismus verhindert den Verlust nicht als Produktverhalten. Die Titelbereinigung und das gequotete Frontmatter sind dagegen im neuen Pfad vorhanden (`PetrolChat.tsx:171`, `:188`).

Vorschlag: Neuanlage im Main atomar mit `wx` oder einer gleichwertigen exklusiven Reserve ausführen und bei Kollision den nächsten Namen versuchen. Den vorhandenen `write-file`-Pfad für absichtliche Änderungen beibehalten.

### F17 — Vault-Wechsel während „Als Notiz speichern“ vermischt Ansichten
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:166; app/src/renderer/components/Agent/PetrolChat.tsx:180; app/src/renderer/components/Agent/PetrolChat.tsx:193; app/src/renderer/components/Agent/PetrolChat.tsx:195
Status: [OFFEN]

Der Handler merkt sich den `vaultPath` des Klicks, wartet dann auf Ordneranlage, Namenssuche und Schreiben und fügt die fertige Notiz schließlich über den *aktuellen* globalen Notes-Store hinzu. Wechselt der Nutzer dazwischen den Vault, kann eine Notiz aus Vault A in der Dateiliste von Vault B erscheinen. Die Datei selbst landet noch in A. Dasselbe Grundmuster steht bereits im Notiz-Chat; der neue Chat übernimmt es.

Vorschlag: Vor `addNote` den aktuellen Vault mit dem beim Start erfassten vergleichen; bei Wechsel nur die Datei fertigstellen und keine fremde Notiz in die neue Ansicht einfügen. Langfristig Speichern und Vault-Zuordnung im Main als eine Operation behandeln.

### F18 — Modellweg im Lauf kann von der Statuszeile abweichen
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:80; app/src/renderer/components/Agent/PetrolChat.tsx:86; app/src/renderer/components/Agent/PetrolChat.tsx:127; app/src/renderer/components/Agent/PetrolChat.tsx:300; app/src/renderer/stores/petrolChatStore.ts:133
Status: [OFFEN]

Beim Senden wird die Modellauswahl in `opts` eingefroren, die Statuszeile liest jedoch fortlaufend globale Einstellungen und den aktuellen Scope. Der Picker ist während des Streams gesperrt, die globalen Einstellungen bleiben änderbar. Ändert sich dort das Standardmodell oder Cloud-Opt-in, kann die Zeile einen anderen Weg zeigen als die bereits laufende Anfrage; erst unter der fertigen Antwort steht das alte Modell-Label. Die Auftragskarte friert ihre Laufanzeige ausdrücklich ein (`AgentView.tsx:444`).

Vorschlag: Laufmodell und eingestuften Weg beim Start im Chat-Scope speichern und während des Streams anzeigen; die nächste Auswahl getrennt davon halten. Für den Cloud-Weg den tatsächlich verwendeten Provider am Lauf festhalten.

### F19 — „Daraus etwas erstellen“ verliert die Frage und überschreibt den Entwurf
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:150; app/src/renderer/components/Agent/PetrolChat.tsx:205; app/src/renderer/components/Agent/PetrolChat.tsx:208; app/src/renderer/stores/noteAgentStore.ts:370
Status: [OFFEN]

Die Übergabe setzt allein den Antworttext in „Mach aus diesem Entwurf ... eine Notiz“. Die zugehörige Nutzerfrage wird zwar für „Als Notiz speichern“ ermittelt, hier aber nicht verwendet. Bei „Welche drei Gegenargumente gibt es?“ kann eine Antwort wie „Erstens ...“ ohne Frage den Auftrag entstellen. Ein schon begonnener Auftragsentwurf wird kommentarlos ersetzt. Das ist noch keine kontrollierte Gesprächsübergabe aus F03/F11.

Vorschlag: Frage und Antwort in einer sichtbaren Vorschau übergeben, Länge begrenzen und vor dem Ersetzen eines vorhandenen Entwurfs eine Wahl anbieten. Erst danach zur Auftragskarte schalten; Ziel und Befugnisse bleiben dort vom Nutzer zu setzen.

### F20 — Websuche: Suchanfrage und Seitenabruf sind zwei getrennte Datenwege
Schwere: hoch
Stelle: app/src/main/webResearch/providers.ts:39; app/src/main/webResearch/providers.ts:75; app/src/main/webResearch/providers.ts:108; app/src/main/webResearch/fetchExtract.ts:72; app/src/renderer/components/Agent/PetrolChat.tsx:313
Status: [OFFEN]

Ein Globus pro Nachricht ist grundsätzlich passend, aber „Suchanfrage verlässt den Rechner“ beschreibt nur den ersten Schritt. Je nach Einstellung geht die Frage als URL-Parameter an SearXNG oder als POST an Linkup/Tavily; danach besucht der Main ausgewählte Trefferseiten direkt. Das ist auch bei lokalem Chatmodell externer Verkehr. Umgekehrt gehen die gelesenen Auszüge bei Cloud-Modell zusätzlich an dessen Anbieter (`app/src/main/index.ts:6462`). Eine einzelne Modellweg-Zeile kann diese drei Empfänger nicht erklären. Die rohe Chatfrage kann außerdem Namen oder interne Vorhaben enthalten.

Vorschlag: Vor dem Suchen Anbieter und **konkrete Suchwörter** zeigen und änderbar machen, mit harter Länge/Leere-Prüfung wie beim Agenten (`app/src/main/noteAgent/skills.ts:1684`). Nach dem Lauf genutzte URLs und Modellweg separat nennen: „Suche an X“, „Seitenabrufe von Y/Z“, „Auszüge an Modellanbieter W“ beziehungsweise „Modell lokal“. Den Globus nach jeder Nachricht wieder ausschalten; frühere Nachrichten nicht still in die Suchanfrage kopieren.

### F21 — Zwei bis drei Seiten und kein Werkzeug-Loop garantieren weder Tempo noch Schutz
Schwere: mittel
Stelle: app/src/main/webResearch/fetchExtract.ts:72; app/src/main/webResearch/fetchExtract.ts:93; app/src/shared/webResearch.ts:86; app/src/main/llm/petrolChatPrompt.ts:18; app/src/renderer/components/Agent/PetrolChat.tsx:31
Status: [OFFEN]

Jeder Seitenabruf darf bis zu 20 Sekunden dauern; extrahiert wird nur HTML oder Klartext, und der Text wird bei 8.000 Zeichen gekappt (`fetchExtract.ts:78`, `:104`; `webResearch.ts:87`). Zwei oder drei fehlgeschlagene, bezahlte oder nur per Skript lesbare Seiten können also eine langsame oder leere Grundlage liefern. Ohne Werkzeuge kann ein fremder Seitentext zwar keinen Agentenbefehl auslösen, aber weiterhin Antwortinhalt und Links beeinflussen; der Chat rendert Modelllinks. Claudes Formulierung „keine Prompt-Injection-Wirkung nach draußen“ ist zu stark.

Vorschlag: Für den Chat ein eigenes Gesamtzeit- und Zeichenbudget, parallele begrenzte Abrufe mit Abbruch und sichtbaren Fehlschlägen festlegen. Externe Texte wie im Vault-Prompt als Daten einklammern (`app/src/main/rag/vaultPrompt.ts:15`, `:55`), Quellentitel und URLs aus App-Metadaten setzen und Links nur nach bewussten Klicks öffnen. Bei null brauchbaren Seiten ohne Quellenbehauptung antworten.

### F22 — Belegprüfung ist kein Faktencheck
Schwere: hoch
Stelle: app/src/shared/rag/citations.ts:4; app/src/shared/rag/citations.ts:338; app/src/shared/rag/citations.ts:400; app/src/main/noteAgent/loop.ts:150
Status: [OFFEN]

`analyzeCitations` prüft Nummern, Wortüberlappung und kurze wörtliche Zitate; selbst `cited-high` bedeutet laut Modul ausdrücklich nicht „wahr“ oder „belegt“. Der Agent hängt bei Webaufträgen bisher einen Quellenblock an eine **Datei**, nachdem er Quellen gelesen hat; dieser „genau ein Write“-Vertrag (`loop.ts:146`) passt nicht zu einer Chatantwort. Suchtreffer-Snippets und tatsächlich abgerufene Seiten dürfen auch nicht dieselbe Quellenklasse sein.

Vorschlag: Für Web-Chat nur tatsächlich erfolgreich abgerufene, unverändert nummerierte Seiten als Quellen anbieten. Prüfung und Anzeige an den geprüften Antwortstring binden; gültige Nummer, hohe Wortdeckung und gefundenes Zitat getrennt ausweisen, nie „Fakt belegt“ behaupten. Fehlt eine belastbare Stelle, das offen zeigen und keine Quellenzahl als Gütesiegel verwenden.

### F23 — Websuche als eigene Zwischenstufe nach den Streaming-Fixes
Schwere: mittel
Stelle: app/src/renderer/stores/petrolChatStore.ts:86; app/src/main/webResearch/config.ts:37; app/src/main/webResearch/egress.ts:170; app/src/main/index.ts:4765
Status: [OFFEN]

Ich würde Websuche **nach** F13/F14 und vor dem dauerhaften Verlauf als Stufe **1b** planen: Sie ist für aktuelle Faktenfragen ein echter Nutzen, benötigt aber keine Auftragskarte und keine Stufe-3-Gesprächsübergabe. Den vorhandenen Provider, Main-seitige Konfiguration und `safeFetch` wiederzuverwenden trägt; den Agenten-Loop samt „genau ein Write“ zu übernehmen trägt nicht. Ein Globus mit automatischer Suche aus jeder Chatfrage wäre wegen des Datenabflusses und der Fehltreffer eine falsche Abkürzung.

Vorschlag: Zuerst Anfragen eindeutig zuordnen und wirklich abbrechen, dann eine ausdrücklich aktivierte Webantwort mit bearbeitbarer Suchanfrage, begrenzten Seitenabrufen, Quellenanzeige und ehrlich benannter Prüfung als unabhängigen Chatpfad bauen. Vor Freigabe mit lokaler und Cloud-Route sowie langsamer/leerer Suche gegenprüfen.

### F24 — Ollama-Timer bleibt nach Abbruch aktiv
Schwere: mittel
Stelle: app/src/main/index.ts:6541; app/src/main/index.ts:6615; app/src/main/index.ts:6620; app/src/main/index.ts:6628
Status: [OFFEN]

Der Fünf-Minuten-Timer wird nur nach einem vollständig gelesenen Ollama-Stream gelöscht. Bei „Stopp“, Fetch-Fehler oder einer fehlerhaften Antwort landet der Lauf im `catch` und `finally`, ohne `clearTimeout` auszuführen. Jeder solche Lauf behält Timer und Controller bis zum Ablauf; das betrifft auch Notiz- und E-Mail-Chat auf diesem gemeinsamen Pfad.

Vorschlag: Den Ollama-Timer in jedem Ausgang des Aufrufs aufräumen, insbesondere nach Abbruch und Fehler. Abbruch, sofortigen Neustart und verbleibende Timer gezielt prüfen.

### F25 — Abbruch-Registry ist nicht an den Aufrufer gebunden
Schwere: hoch
Stelle: app/src/main/index.ts:6367; app/src/main/index.ts:6371; app/src/main/index.ts:6380; app/src/renderer/stores/petrolChatStore.ts:129; app/src/main/plugins/transport.ts:18
Status: [OFFEN]

`petrol-chat-abort` prüft den Sender nicht und sucht Controller allein über eine vom Renderer gelieferte Kennung. Die Kennung besteht aus Millisekunden-Zeit und einem pro Renderer zählenden Wert. Ein fremder Frame mit IPC-Zugriff könnte Kennungen raten und einen Chat stoppen; bei zwei passenden Kennungen überschreibt `registerPetrolAbort` zudem den ersten Controller. Unbekannte Kennungen werden für 60 Sekunden samt je einem Timer gespeichert (`app/src/main/index.ts:6386`), sodass wiederholte Aufrufe unnötig Main-Ressourcen binden. `isTrustedSender` existiert für genau die Prüfung von eigenem Top-Frame und Fenster.

Vorschlag: Abbruch nur vom vertrauenswürdigen Top-Frame annehmen, Registrierung und Abbruch zusätzlich an `event.sender.id` binden, doppelte Kennungen ablehnen und Vorab-Abbrüche begrenzen. Das Fenster schließen beziehungsweise neu laden, während ein Lauf noch registriert wird, als Gegenprobe verwenden.

### F26 — Vault-Wechsel nach der letzten Prüfung bleibt möglich
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:226; app/src/renderer/components/Agent/PetrolChat.tsx:227; app/src/renderer/components/Agent/PetrolChat.tsx:228; app/src/renderer/stores/notesStore.ts:404; app/src/renderer/stores/notesStore.ts:114
Status: [OFFEN]

F17 ist nur teilweise behoben: Der Vault wird vor `createNoteFromFile` geprüft, diese Funktion wartet aber noch auf `getFileStats`. Wechselt der Nutzer genau in dieser Wartezeit von A nach B, ruft der Code danach `addNote` im globalen Store von B auf. `addNote` prüft keine Vault-Zuordnung. Die Datei liegt in A, ihre Notiz erscheint in B.

Vorschlag: Den Vault unmittelbar nach dem `await` erneut prüfen und nur dann `addNote` aufrufen; noch sicherer wäre eine Store-Operation, die Vergleich und Einfügen zusammen ausführt.

### F27 — Abgebrochene Antwort wird als vollständiger Verlauf gesendet
Schwere: mittel
Stelle: app/src/renderer/stores/petrolChatStore.ts:27; app/src/renderer/stores/petrolChatStore.ts:132; app/src/renderer/stores/petrolChatStore.ts:171; app/src/renderer/utils/chatHistory.ts:16
Status: [OFFEN]

„Stopp“ bewahrt den bisherigen Text als `stopped: true` auf. Beim nächsten Senden filtert der Store nur `error`, und `chatHistoryForModel` entfernt das Merkmal `stopped`. Das Modell erhält das abgebrochene Bruchstück dadurch als normale Assistentenantwort. Es kann daraus falsche Gesprächsannahmen ableiten, obwohl die Oberfläche den Text als abgebrochen kennzeichnet.

Vorschlag: Gestoppte Assistentenantworten aus dem Modellverlauf herausnehmen oder ihren unvollständigen Zustand ausdrücklich als solchen übergeben; die zugehörige Nutzerfrage dabei sinnvoll behandeln.

### F28 — Statuszeile kann dauerhaft „wird geprüft“ zeigen
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:98; app/src/renderer/components/Agent/PetrolChat.tsx:113; app/src/renderer/components/Agent/PetrolChat.tsx:140; app/src/renderer/components/Agent/PetrolChat.tsx:148; app/src/renderer/components/Agent/PetrolChat.tsx:122
Status: [OFFEN]

F18 ist für spätere Einstellungswechsel verbessert. Die Senden-Schaltfläche bleibt jedoch während des asynchronen Route-Preflights nutzbar. Wer sofort sendet, friert `routeText = „wird geprüft“` und `routeKind = checking` für den ganzen Lauf ein. Trifft das Prüfergebnis danach ein, zeigt die Statuszeile wegen `active.routeText` weiterhin keinen tatsächlichen Weg an; besonders beim Cloud-Modell ist das irreführend.

Vorschlag: Vor dem Senden auf ein abgeschlossenes Route-Preflight warten oder den aktiven Lauf nach dessen Ergebnis aktualisieren, solange Modell und Anfragekennung übereinstimmen. Einen schnellen Sendeklick direkt nach der Modellauswahl prüfen.

### F29 — Exklusive Neuanlage kann eine beschädigte Datei zurücklassen
Schwere: niedrig
Stelle: app/src/main/index.ts:2233; app/src/main/index.ts:2236; app/src/main/index.ts:2254; app/src/renderer/components/Agent/PetrolChat.tsx:217
Status: [OFFEN]

`wx` verhindert das Überschreiben zuverlässig. Scheitert `fs.writeFile` jedoch nach dem Anlegen, etwa wegen vollem Datenträger, bleibt eine teilweise geschriebene Datei unter dem endgültigen Namen möglich. Der Renderer meldet dann Speichern fehlgeschlagen; ein erneuter Versuch sieht den Namen als belegt und schreibt eine zweite Datei. Für die neue Datei gibt es naturgemäß kein Backup. Auto-Heal läuft vor dem exklusiven Schreiben (`app/src/main/index.ts:2225`) und ist davon nicht betroffen.

Vorschlag: Bei Schreibfehler die exklusiv neu angelegte Datei nur dann entfernen, wenn sie eindeutig diesem Versuch gehört; alternativ in eine temporäre Datei schreiben und die endgültige Neuanlage atomar absichern.

### F30 — Nachprüfung bestätigt
Schwere: niedrig
Stelle: app/src/main/index.ts:6415; app/src/main/index.ts:6395; app/src/main/index.ts:2235; app/src/renderer/stores/petrolChatStore.ts:108; app/src/renderer/components/Agent/PetrolChat.tsx:41; app/src/renderer/components/Agent/PetrolChat.tsx:243
Status: [OFFEN]

Die konkreten Korrekturen für F13 (Chunks mit Kennung), F15 (bewusstes Öffnen freigegebener Links), F16 (exklusive Neuanlage mit Kollisionsversuch) und F19 (Frage plus Antwort, Wahl bei vorhandenem Entwurf) tragen im Code. F14 bricht die drei Transportwege grundsätzlich ab, F17 und F18 bleiben durch F24–F28 eingeschränkt. Notiz- und E-Mail-Chat behalten eigene Streaming-Kanäle und String-Chunks (`app/src/main/index.ts:6395`, `:6415`; `app/src/main/preload.ts:364`, `:374`); das exklusive Schreiben umgeht weder Pfadprüfung noch Markdown-Heilung (`app/src/main/index.ts:2208`, `:2225`).

Vorschlag: Die offenen Randfälle beheben und danach Abbruch sowie Vault-Wechsel im laufenden Speichern gezielt gegenprüfen.

### F31 — Stopp vor dem ersten Textstück lässt die Frage im Modellverlauf
Schwere: mittel
Stelle: app/src/renderer/stores/petrolChatStore.ts:171; app/src/renderer/stores/petrolChatStore.ts:180; app/src/renderer/stores/petrolChatStore.ts:141; app/src/renderer/utils/chatHistory.ts:40
Status: [OFFEN]

F27 ist für sichtbare Antwortbruchstücke behoben. Stoppt der Nutzer vor dem ersten Textstück, ist `kept` leer und der Store hängt keine als abgebrochen markierte Antwort an. `completedTurns` behält eine einzelne Nutzerfrage am Ende ausdrücklich bei; beim nächsten Senden gehen daher die gestoppte Frage und die neue Frage gemeinsam ans Modell. Der Test erwartet dieses Verhalten sogar für eine offene Schlussfrage (`app/src/renderer/utils/chatHistory.test.ts:50`).

Vorschlag: Auch ohne Antworttext den abgebrochenen Wechsel im Store markieren oder beim Aufbau des Modellverlaufs eine unpaarige Schlussfrage entfernen. „Senden, sofort Stopp, andere Frage senden“ gezielt testen.

### F32 — Fehler-Cleanup kann eine inzwischen ersetzte Datei löschen
Schwere: niedrig
Stelle: app/src/main/index.ts:2239; app/src/main/index.ts:2241; app/src/main/index.ts:2244; app/src/main/index.ts:2245
Status: [OFFEN]

F29 räumt eine halbe Neuanlage im Normalfall auf. Das `unlink` arbeitet aber über den Pfad, nicht über die exklusiv geöffnete Datei. Entfernt oder ersetzt ein externer Vorgang im Vault den Namen während des Schreibens, kann der Fehlerzweig die inzwischen dort liegende andere Datei löschen. „Genau diese Datei“ ist durch den offenen Handle allein nicht sichergestellt.

Vorschlag: Vor dem Löschen Dateiidentität des offenen Handles und des Pfads vergleichen; bei Abweichung die andere Datei stehen lassen. Einen Schreibfehler mit gleichzeitigem Ersetzen des Zielpfads als Gegenprobe verwenden.

### F33 — Fehlgeschlagene Wegprüfung bleibt dauerhaft „wird geprüft“
Schwere: mittel
Stelle: app/src/main/index.ts:4597; app/src/main/index.ts:4605; app/src/renderer/components/Agent/PetrolChat.tsx:105; app/src/renderer/components/Agent/PetrolChat.tsx:107; app/src/renderer/components/Agent/PetrolChat.tsx:125
Status: [OFFEN]

F28 wird nachgetragen, wenn die Vorabprüfung einen Weg liefert. Der Main-Handler kann aber `{ success: false, error }` zurückgeben; auch ein abgelehnter IPC-Aufruf wird im Renderer nur geschluckt. In beiden Fällen bleibt `currentRoute` leer, und `resolveActiveRoute` läuft nie. Eine direkt gesendete Anfrage zeigt während des ganzen Laufs „wird geprüft“, obwohl die Prüfung bereits fehlgeschlagen ist.

Vorschlag: Fehler der Wegprüfung als eigenen, sichtbaren Status behandeln und ihn an die aktive Anfrage mit passendem `routeKey` weitergeben; gegebenenfalls Senden bis zur Klärung sperren.

### F34 — Nachprüfung Runde 3 bestätigt
Schwere: niedrig
Stelle: app/src/main/index.ts:6388; app/src/main/index.ts:6406; app/src/main/index.ts:6654; app/src/renderer/components/Agent/PetrolChat.tsx:234; app/src/renderer/stores/petrolChatStore.ts:128
Status: [OFFEN]

F24 trägt: Der Ollama-Timer wird jetzt im `finally` gelöscht. F25 trägt für reguläre Anfragen: Registrierung erfolgt vor dem ersten `await`, Abbruch ist an vertrauenswürdigen Sender und dessen Kennung gebunden, und die Registry wird beim Abschluss bereinigt. F26 trägt: Nach `createNoteFromFile` wird der Vault erneut geprüft. Die Korrekturen für F27–F29 wirken in den vorgesehenen Fällen; F31–F33 benennen ihre verbleibenden Randfälle.

Vorschlag: F31–F33 gezielt nacharbeiten und mit den beschriebenen Abläufen gegenprüfen.

## Claude-Antwort

Gegengeprüft am 23.10.2026 (Stichproben gegen den Code):

- **F01 [ADRESSIERT — trägt]** `assertSafePath(path.join(vault, targetFolderRel))` in `main/index.ts:4600`; ohne Ziel gäbe es eine verdeckte Ablage in der Vault-Wurzel. T3 zurückgezogen.
- **F02 [ADRESSIERT — trägt]** `loop.ts:190` „Keine Rückfragen“, `loop.ts:425` schiebt bei Schlussfrage nach. Der Auftrags-Prompt ist das Gegenteil eines Gesprächs.
- **F03 [ADRESSIERT — trägt]** Fortsetzung ist ein flüchtiger Einzelfaden pro Fenster.
- **F04 [ADRESSIERT — trägt]** Antworttext erst im `note-agent-done`; Chat braucht Streaming. Messung „Zeit bis zum ersten Wort“ wird Teil von Schritt 1.
- **F05 [ADRESSIERT — trägt]** `activityLog.ts:673-679`: jede Chat-Antwort zählte als Lauf und als Fehlversuch. Chat bleibt aus der Auftragsbilanz.
- **F06 [ADRESSIERT]** Einverstanden: A mit Chat als Voreinstellung ist keine Vorabfrage. T1 korrigiert.
- **F07 [ADRESSIERT — trägt]** `NotesChat.tsx:816` verweigert ohne Notiz, `main/index.ts:6365` Prompt „zu den folgenden Notizen“. B allein reicht nicht.
- **F08 [ADRESSIERT]** Namen nach Zweck: „Mit Petrol chatten“ (Agent-Tab) vs. „Zu dieser Notiz fragen“ (rechtes Panel).
- **F09 [ADRESSIERT]** Schritt 1 liest keine Notizen von selbst; Vault-Bezug nur als ausdrückliche, lokale Belegsuche (bestehender Vault-RAG-Weg). Cloud-Übergang mit Notizinhalt erst in Stufe 3, mit Anzeige der übertragenen Auszüge.
- **F10 [ADRESSIERT]** Verlauf: eigenes Format pro Vault, Löschen-Knopf, begrenzte Aufbewahrung; Verschlüsselungsfrage als offene Entscheidung für den Nutzer.
- **F11 [ADRESSIERT]** Übernommen: im Faden nur kompakte Vorschau, Arbeitsbereich wächst über dem Eingabefeld.
- **F12 [ADRESSIERT]** Empfehlung übernommen: A jetzt, C als Ziel nach Trennung von Gespräch und Auftrag.

Entwurf für den Nutzer: Artifact „Petrol Chat und Agent“ (Stufen 1–3, Skizzen).

### Nutzerentscheidungen (23.10.2026)

- Umschalter heißt **„Chat | Auftrag“**.
- **Cloud im Chat wie im Notiz-Chat**: Cloud-Modelle wählbar, die Statuszeile zeigt den Weg (Transparenz statt Sperre).
- **Standardansicht einstellbar**: „Agent-Tab öffnet mit: Chat / Auftrag“. Gilt beim Start mit Schwerpunkt „Agent“ und bei neuen Agent-Tabs. Voreinstellung Chat; Bestandsnutzer behalten bei der Umstellung „Auftrag“ (Vorschlag Claude, einmalige Migration).
- Verschlüsselung des Verlaufs: erst mit Stufe 2.

### Runde 2 — Antworten (23.10.2026, Nutzer hat F13–F19 freigegeben, Websuche als eigener Entwurf)

- **F13 [ADRESSIERT]** Main hängt an jedes Stück `{ requestId, delta }` (`main/index.ts`, `sendChunk`), der Store nimmt nur Stücke der aktuellen Kennung an (`petrolChatStore.ts`). Gegenprobe GUI: lange Antwort A nach 80 Zeichen gestoppt, sofort B „Antworte nur mit BETA“ → B = „BETA“, keine Reste von A.
- **F14 [ADRESSIERT]** IPC `petrol-chat-abort` bricht den `AbortController` der Anfrage ab (Ollama, Cloud, LM Studio — LM Studio hat jetzt ein Signal). Abbruch vor der Registrierung geht nicht verloren (`petrolChatAbortedEarly`). Stopp, Neues Gespräch, Tab schließen rufen ihn. Beleg indirekt: B kam ohne Wartezeit, obwohl A 600 Wörter lang werden sollte. Abgebrochene Antworten tragen „abgebrochen“.
- **F15 [ADRESSIERT]** kein `target=_blank` mehr; Klick in Antworten → `openExternal` nur für http/https/mailto, sonst `preventDefault` (geprüft mit `javascript:`-Link).
- **F16 [ADRESSIERT]** neuer IPC `write-file-new` (`writeFileSafe(..., { exclusive: true })`, Flag `wx`), bei `exists` nächster Name. Doppelklick auf Speichern → `… .md` und `… (2).md`. Nebenbei: Punkt am Titelende entfernt (`…BETA..md`). Der Notiz-Chat nutzt weiter den alten Weg — nicht angefasst.
- **F17 [ADRESSIERT]** `addNote` nur, wenn der Vault noch derselbe ist.
- **F18 [ADRESSIERT]** Weg und Modell der Anfrage werden beim Senden als `active` eingefroren; die Statuszeile zeigt während der Antwort diesen Stand.
- **F19 [ADRESSIERT]** Übergabe enthält Frage UND Antwort (Frage ≤ 1000, Antwort ≤ 6000 Zeichen); vorhandener Auftragsentwurf → Wahl Ersetzen / Anhängen / Abbrechen.
- **F20–F23 [DISKUSSION]** übernommen als Grundlage für den Entwurf „Websuche im Chat (Stufe 1b)“; nicht umgesetzt.

### Runde 3 — Antworten zu F24–F29 (23.10.2026, alle freigegeben)

- **F24 [ADRESSIERT]** `timeout` vor dem `try` deklariert, `clearTimeout` im `finally` — gilt auch für Notiz- und E-Mail-Chat.
- **F25 [ADRESSIERT]** `petrol-chat-abort` nur mit `isTrustedSender`; Schlüssel = `senderId:requestId`; Registrierung synchron beim Handler-Eintritt (`claimPetrolRequest`), daher keine Vorab-Liste mehr (IPC eines Renderers kommt in Reihenfolge an); doppelte Kennung → Ablehnung „Diese Anfrage läuft bereits“. Transport-Controller hängen per `linkPetrolAbort` am Anfrage-Signal; `releasePetrolRequest` löscht nur den eigenen Eintrag.
- **F26 [ADRESSIERT]** Vault-Vergleich zusätzlich nach `createNoteFromFile`.
- **F27 [ADRESSIERT]** `completedTurns` (`renderer/utils/chatHistory.ts`, 3 Tests): abgebrochene und fehlerhafte Antworten samt ihrer Frage gehen nicht in den Modellverlauf.
- **F28 [ADRESSIERT]** `routeKey` am aktiven Lauf; kommt das Prüfergebnis während der Antwort, trägt `resolveActiveRoute` es nach — nur für genau diesen Weg und nur aus „wird geprüft“.
- **F29 [ADRESSIERT]** exklusive Neuanlage über `fs.open(…, 'wx')` + Schreiben; bei Fehler wird genau diese Datei entfernt.
- Geprüft: typecheck, test (2886 grün, bekannter Zeitlimit-Ausfall `shellExecution.test.ts`), build; GUI: Stopp nach 145 Zeichen, sofort „nur BETA“ → nach 5,4 s „BETA“, keine Reste.

## Status

Runde 1 abgeschlossen, Entscheidungen eingetragen. **Stufe 1 umgesetzt (23.10.2026), uncommitted.**

Umsetzung Stufe 1:
- Main: `chatMode 'petrol'` in `ollama-chat` und `lmstudio-chat` mit eigenem Systemtext (`main/llm/petrolChatPrompt.ts`) und eigenem Kanal `petrol-chat-chunk`; Kontext und Anhänge werden im Main verworfen (Zusage „liest keine Notizen von selbst“).
- Renderer: `PetrolChat.tsx`, `petrolChatStore.ts` (Verlauf pro Tab, nur im Speicher), Umschalter in `AgentView.tsx`, Einstellung `agentTabDefaultMode` (neu: Chat; Bestandsprofile einmalig Auftrag).
- Gemessen (qwen3.8:27b-mlx, M2 Max): erstes sichtbares Wort kalt 31,5 s, warm 8,4 s. Das Modell denkt verdeckt, bevor Text kommt; ohne Nachdenken wäre es schneller — nicht geändert (erst messen, dann tunen).
- Geprüft: typecheck, test (ein Zeitlimit-Ausfall in `shellExecution.test.ts` unter Volllast, einzeln grün), build; GUI per CDP auf Testvault.

Runde 3 (F31–F33) behoben nach Nutzerfreigabe (24.10.2026):
- F31: Stopp vor dem ersten Wort markiert die Frage selbst als `stopped` (Anzeige „abgebrochen“), `completedTurns` lässt jede gestoppte Nachricht weg; Test ergänzt. GUI: gestoppte Frage „ZEBRA …“, danach „Antworte nur mit BETA“ → Antwort „BETA“, keine Spur der ersten Frage.
- F33: gescheiterte Wegprüfung (`success:false` oder abgelehnter IPC) zeigt „Weg nicht prüfbar“ (Art `unverified`) statt dauerhaft „wird geprüft“; auch eine laufende Anfrage bekommt das nachgetragen. GUI-Fall (Ollama aus) nicht nachgestellt.
- F32: Aufräumen nach gescheitertem exklusivem Schreiben löscht nur, wenn `lstat` des Namens dieselbe Datei (dev/ino) wie der offene Handle zeigt.
- Prüfrunden für Stufe 1 damit beendet (Nutzerentscheidung); Rest über Abnahme in `npm run dev`.
