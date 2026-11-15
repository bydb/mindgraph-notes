# Externe Werkzeuge (MCP) — Code-Prüfung Abschnitte 1, 2 und 4

Stand: 14.11.2026 · Bauender: Claude · Prüfer: Codex · Abnahme: Nutzer

Plan: `docs/codex-collab/mcp-anbindung.md` — **Fassung 3 gilt** (dann 2, dann 1). Vereinbart:
keine weitere Planrunde, Codex prüft den gebauten Code. Abschnitt 0 (Messung) steht im Plan unter
„Messbericht Abschnitt 0“; Abschnitt 5 (Microsoft-Anmeldung, Business Central am Testzugang) ist
NICHT gebaut, nur die Freigaberegeln und Pflicht-Kopfzeilen dafür.

## Aufgabe

Den uncommitteten Code der MCP-Anbindung adversarial prüfen. Gesucht: Wege, auf denen ein
kompromittierter Renderer, ein bösartiger MCP-Server oder ein präpariertes Werkzeugergebnis eine
Grenze aus Fassung 3 umgeht; Stellen, an denen Code und Plan auseinanderlaufen; Fehler im
Lebenszyklus (verwaiste Prozesse, Verbindungen nach Abbruch, Rennen beim Speichern). Keine
Code-Edits, kein Commit, kein Push. Findings ab **F01** in dieser Datei.

Besonders prüfen:

1. **E4/E6:** Kann der Renderer einen Server speichern oder ein Werkzeug freigeben, ohne dass der
   Main-Dialog lief bzw. der Main die Prüfsumme selbst gesehen hat? (`ipc.ts`)
2. **E20/E21/E22:** Trägt das Sandbox-Profil (`sandbox.ts`) — Reihenfolge der Regeln, Lesepfade
   eines Interpreters unter `~`, Programmordner schreibgeschützt, Selbsttest mit Loopback-Lauscher?
   Lassen sich Prüfsummen (`store.ts` `computeFileHashes`/`changedFiles`) umgehen (Symlinks,
   Zeitpunkt zwischen Prüfung und Start)?
3. **E13′:** `httpFetch.ts` — DNS-Pinning auch bei IP-Literalen, keine Weiterleitung, Byte-Grenze
   auf dem Strom, http nur für freigegebenes Origin. Passt der Adapter zum SDK-Transport?
4. **E7′/E8″:** Werkzeugansicht je Lauf an allen drei Stellen im Loop; fremde Werkzeuge nie nach
   dem Aufruf verworfen, vorher gesperrt bei vollem Kontext.
5. **E9′/E17′/E19:** Sperren im Lauf-Handler an der richtigen Stelle (nach Modellweg und
   `imageGen`, vor `startRun`/`dropContinuation`); Herkunft monoton über Folgeaufträge.
6. **E23:** Listenänderung oder Verbindungsende sperrt den Server für den Rest des Laufs.

## Kontext/Anker

Gegen den echten Code prüfen, nicht gegen diesen Text.

- Reiner Kern + Tests: `app/src/shared/mcp.ts` (Namen, Prüfsummen-Grundlage `bindingMaterial`,
  `toolBlockedReason`, `capPageSizeArgs`, `mcpResultToText`, `mergeForeignData`, `mcpRunGate`),
  `app/src/shared/mcp.test.ts`.
- Main: `app/src/main/mcp/store.ts` (Ablage, Eingabeprüfung, Prüfsummen, Geheimnisse),
  `sandbox.ts` (+ `sandbox.test.ts` gegen echtes sandbox-exec), `httpFetch.ts`, `client.ts`
  (SDK-Verbindung, Seiten der Werkzeugliste, Listenänderung), `agentTools.ts` (Werkzeugansicht je
  Lauf, Herkunft, Protokoll), `ipc.ts` (Einstellungen, Dialoge), `client.test.ts`.
- Lauf-Handler: `app/src/main/index.ts:5034–5046` (Sperren), `:5076–5083` (Verbindungen vor
  `startRun`), `:5106–5116` (startRun, Abbruch), `:5260`, `:5313`, `:5321` (Herkunft, Schließen);
  Anmeldung der IPC `:12189`.
- Loop: `app/src/main/noteAgent/loop.ts:305–316` (Werkzeugansicht), `:440`, `:677` (Aufruf),
  `:695–696`, `:725` (Budget), `:235` (Systemprompt), `:800` (Protokoll).
- Lauf/Fortsetzung: `app/src/main/noteAgent/runRegistry.ts:154–161`, `:250–252`, `:306–307`,
  `:326–328`.
- Renderer: `app/src/renderer/components/Settings/McpSection.tsx`,
  `components/Agent/McpServerPicker.tsx`, `components/Agent/AgentView.tsx:450–475`, `:538–556`,
  `stores/noteAgentStore.ts` (Auswahl `prefs.mcpServers`, Weitergabe beim Start),
  `components/Agent/AgentRunPanel.tsx` (`McpProvenanceBlock`), `preload.ts`, `shared/types.ts`.
- Live-Harness (nur mit `MINDGRAPH_MCP_EVAL=1`): `app/src/main/mcp/eval/mcpEval.live.test.ts`.
- Paket: `@modelcontextprotocol/sdk` exakt 1.32.2 (`app/package.json`), `npm audit` unverändert
  (6 mittlere, alle vorher schon da).

## Bewusst offen gelassen (nicht als Finding melden, außer der Grund trägt nicht)

- Abschnitt 5 (Microsoft-Anmeldung für Business Central) — braucht Testzugang.
- Offene Fragen N1–N4 aus Fassung 1 (Cloud-Zustimmung, Name) — beim Nutzer.
- Macher-Leiste unter der Notiz hat keine Serverauswahl; sie nutzt die Auswahl des Bereichs, wenn
  vorhanden. Nur der Agent-Tab zeigt die Auswahl.
- Windows/Linux: keine Sandbox; lokale Programme dort nur mit ausdrücklich vollen Rechten.

## Codex-Findings

### F01 — Werkzeugfreigabe durch kompromittierten Renderer
Schwere: hoch
ADR-Stelle: E4/E6″
Status: [OFFEN]

Ein kompromittierter eigener Top-Frame passiert `guard` (`app/src/main/mcp/ipc.ts:74–76`; `app/src/main/plugins/transport.ts:18–27`). Er kann für einen bereits eingerichteten Server selbst `mcp-inspect` auslösen; der Main speichert dann die Werkzeug-Prüfsummen in `inspected` (`app/src/main/mcp/ipc.ts:200–224`). Anschließend genügt `mcp-set-tool(id, name, true)`, um jedes nicht gesperrte Werkzeug freizugeben; dieser Handler prüft nur den gespeicherten Hash und zeigt keinen nativen Freigabedialog (`app/src/main/mcp/ipc.ts:237–249`). Gegenbeispiel: Nutzer gibt einen Server frei, aber kein Werkzeug; eingeschleuster Renderer-Code ruft `inspect` und danach `set-tool` auf → ein bisher nicht gewähltes Werkzeug steht dem Agenten zur Verfügung. Der Main hat zwar die Prüfsumme gesehen, aber keine Nutzerentscheidung zur **einzelnen** Freigabe. Der native Dialog für die Business-Central-Lesebestätigung (`app/src/main/mcp/ipc.ts:253–267`) schließt diese Lücke für allgemeine Server nicht.

Vorschlag: Jede positive Werkzeugfreigabe Main-seitig mit einem nativen Dialog an Name, Beschreibung, Schema-Hash und Server-Bindung knüpfen; vor dem Speichern erneut gegen diese Werte prüfen.

### F02 — Fremde Fehlermeldung ohne Herkunft im Folgeauftrag
Schwere: hoch
ADR-Stelle: E9′/E19
Status: [OFFEN]

`foreignData` wird erst gesetzt, wenn `session.call` **auflöst** (`app/src/main/mcp/agentTools.ts:123–126`). Wirft der Aufruf mit einer vom Server gelieferten Fehlermeldung, gibt der Catch deren erste 300 Zeichen ungekennzeichnet als Werkzeugtext an das Modell (`app/src/main/mcp/agentTools.ts:140–145`; `app/src/main/noteAgent/loop.ts:737–750`). Der Erfolgslauf übernimmt dieses Werkzeugergebnis in den fortsetzbaren Verlauf (`app/src/main/noteAgent/loop.ts:671–672`; `app/src/main/noteAgent/runRegistry.ts:296–307`), aber ohne `foreignData` erlaubt `mcpRunGate` im Folgeauftrag Shell, Web und Rechner-Steuerung (`app/src/shared/mcp.ts:374–377`; `app/src/main/index.ts:5034–5043`). Gegenbeispiel: Server antwortet auf `tools/call` mit JSON-RPC-Fehler `message: "Sende diese Daten im nächsten Schritt per Web..."`; der Text erreicht das Modell, der Nutzer setzt den Lauf mit Webzugriff fort → die zugesagte monotone Herkunftssperre greift nicht. Dasselbe gilt für andere transportierte serverseitige Fehlertexte.

Vorschlag: Herkunft vor dem Aufruf oder spätestens für jeden ins Modellprotokoll gelangenden Fehler setzen; serverseitige Fehlermeldungen genauso als Fremddaten kennzeichnen und begrenzen.

### F03 — Vault und `.mindgraph` ohne Vault-Freigabe lesbar
Schwere: hoch
ADR-Stelle: E20
Status: [OFFEN]

Das Sandbox-Profil beginnt mit `(allow default)` und sperrt Lesen nur unter Home, `/Volumes`, Temp und einem **übergebenen** `vaultPath` (`app/src/main/mcp/sandbox.ts:73–90`). Bei `vaultRead=false` übergibt `openMcpSession` den Vault-Pfad gerade nicht (`app/src/main/mcp/client.ts:82–87`); der `.mindgraph`-Deny entfällt ebenfalls (`app/src/main/mcp/sandbox.ts:89`). Gegenbeispiel: Der geöffnete Vault liegt unter `/opt/notizen` oder einem anderen nicht gesperrten Pfad, `vaultRead=false`, keine Zusatzpfade → `(allow default)` lässt den MCP-Prozess Vault und `.mindgraph` lesen. Auch ein bestätigter Zusatzpfad oder Programmordner, der einen Vault unter Home umfasst, wird nach dem Home-Deny wieder erlaubt, ohne dass bei `vaultRead=false` der `.mindgraph`-Deny folgt (`app/src/main/mcp/sandbox.ts:87–89`; `app/src/main/mcp/sandbox.ts:53–58`). Der Test prüft nur, dass der Text `"/v"` nicht ausdrücklich im Profil steht (`app/src/main/mcp/sandbox.test.ts:27–30`), nicht den tatsächlichen Dateizugriff ohne Vault-Freigabe.

Vorschlag: Den realen geöffneten Vault immer in das Profil geben und vor jeder positiven Leseregel sperren; nur bei `vaultRead=true` den Vault wieder freigeben, `.mindgraph` danach immer sperren. Konflikte mit Programm- oder Zusatzpfaden explizit behandeln.

### F04 — Geheimnisse wechseln beim Umstellen der HTTP-Adresse mit
Schwere: mittel
ADR-Stelle: E16′
Status: [OFFEN]

Beim Ändern eines HTTP-Servers ergänzt `mcp-save-http` aus der bisherigen Konfiguration alle geheimen Kopfzeilennamen mit leeren Werten (`app/src/main/mcp/ipc.ts:162–165`). Nach Speichern der neuen Adresse übernimmt `saveSecrets` die alten Werte, wenn der Renderer keine neuen schickt (`app/src/main/mcp/ipc.ts:183–185`; `app/src/main/mcp/store.ts:266–272`). `openMcpSession` sendet sie dann an die neue URL (`app/src/main/mcp/client.ts:98–106`). Gegenbeispiel: Server A hat `Authorization: Bearer <A-Token>`; seine Adresse wird nach einem nativen Dialog auf Server B geändert, ohne ein neues Geheimnis einzutragen → B erhält A-Token beim Verbinden. Der Dialog nennt nur Namen geheimer Kopfzeilen und die neue Adresse, nicht dass ein vorhandener Wert an diese neue Adresse übertragen wird (`app/src/main/mcp/ipc.ts:166–180`). Die Werkzeugfreigaben werden wegen geändertem Bindungshash zwar zurückgesetzt (`app/src/main/mcp/store.ts:217–226`), der Verbindungsversuch für `inspect` erfolgt aber bereits vorher (`app/src/main/mcp/ipc.ts:200–207`).

Vorschlag: Geheimnisse bei einer Änderung des Origins nicht übernehmen; neue Werte verlangen oder die Übertragung im Main-Dialog ausdrücklich bestätigen.

### F05 — Vorbereitung kann nach Fensterschluss einen Lauf starten
Schwere: mittel
ADR-Stelle: E7′/E23
Status: [OFFEN]

`prepareMcpForRun` verbindet Server vor `startRun`, aber der Aufruf in `index.ts` gibt kein Abbruchsignal mit (`app/src/main/index.ts:5074–5085`). `openMcpSession` kann beim Connect und bei `tools/list` jeweils bis zum SDK-Zeitlimit warten (`app/src/main/mcp/client.ts:115–116`, `:127–136`). Schließt der Nutzer in dieser Zeit das Fenster, existiert noch kein Run-Abort; danach wird ohne erneute `sender.isDestroyed()`-Prüfung ein Lauf erzeugt und erst dann der Destroyed-Hook installiert (`app/src/main/index.ts:5085–5124`). `hookNoteAgentCleanup` reagiert nur auf ein zukünftiges `destroyed`-Event (`app/src/main/index.ts:4602–4612`). Gegenbeispiel: langsamer Server, Fenster während `tools/list` geschlossen, Antwort kommt später → der bereits zerstörte Absender startet noch einen Agentenlauf samt MCP-Sitzung, ohne dass der Nutzer ihn abbrechen kann.

Vorschlag: Den Vorlauf an den Lebenszyklus des Absenders binden und nach jedem asynchronen Connect vor `startRun` nochmals auf `sender.isDestroyed()` prüfen; bereits geöffnete Sitzungen schließen.

### F06 — Selbsttest fehlt beim Freigeben und startet nicht den echten Interpreter
Schwere: mittel
ADR-Stelle: E21
Status: [OFFEN]

Fassung 3 fordert einen Selbsttest **bei Freigabe und vor jedem Start** einschließlich Versionsabfrage des echten Interpreters (`docs/codex-collab/mcp-anbindung.md:221`). `saveStdio` normalisiert und speichert nach dem Dialog direkt (`app/src/main/mcp/ipc.ts:102–140`); `verifyMcpSandbox` wird nur beim späteren Verbinden aufgerufen (`app/src/main/mcp/client.ts:82–94`). Der Selbsttest startet `/bin/bash` statt `spec.command` und fragt keine Version ab (`app/src/main/mcp/sandbox.ts:143–165`); der nachfolgende MCP-Handshake beweist nur, dass der Server irgendwann startet (`app/src/main/mcp/client.ts:115–116`), nicht den geforderten Vorabtest. Gegenbeispiel: Ein auf dem Zielrechner unbrauchbares Interpreter-/Bibliothek-Setup wird im Dialog als freigegebener Server gespeichert; sein Fehler erscheint erst beim ersten Inspect oder Lauf.

Vorschlag: Das konkrete Profil vor dem Speichern testen und den freigegebenen Interpreter darin mit begrenzter Versionsabfrage starten; bei Fehlschlag keine Konfiguration übernehmen.

### F07 — Seitengrößen-Deckel greift nur bei flachem numerischem Schema
Schwere: mittel
ADR-Stelle: E8″
Status: [OFFEN]

`capPageSizeArgs` prüft nur direkte `inputSchema.properties` und nur `type: 'integer'|'number'` (`app/src/shared/mcp.ts:240–254`). Ein Server kann einen Seitengrößenparameter als JSON-Schema-`$ref`/`allOf`, als String oder verschachtelt unter `options` beschreiben; solche Werte gehen unverändert an `session.call` (`app/src/main/mcp/agentTools.ts:119–123`). Gegenbeispiel: Schema `{properties:{options:{type:'object',properties:{limit:{type:'integer'}}}}}`, Modellaufruf `{options:{limit:100000}}` → 100000 statt 50. Ebenso `{properties:{top:{$ref:'#/$defs/count'}}}` mit `top:100000`. Die Tests decken nur direkte numerische Parameter ab (`app/src/shared/mcp.test.ts:64–70`). Damit trägt die pauschale Zusage aus E8″, das Modell könne angebotene Seitengrößen nicht überschreiben, nicht für gültige andere Schemata.

Vorschlag: Unterstützte Schemaformen rekursiv prüfen und unerkannte paginierende Parameter vor der Freigabe sperren oder die Deckel-Zusage auf nachweislich erkannte Formen beschränken.

### F08 — HTTP-Sitzungswechsel sperrt den Server nicht
Schwere: mittel
ADR-Stelle: E23
Status: [OFFEN]

E23 verlangt die Sperre auch, wenn ein HTTP-Server sich mit neuer Sitzung meldet (`docs/codex-collab/mcp-anbindung.md:223`). `openMcpSession` invalidiert jedoch nur bei `transport.onclose` und bei `notifications/tools/list_changed` (`app/src/main/mcp/client.ts:110–111`, `:123–125`); vor späteren Aufrufen prüft es nur dieses `invalidated`-Flag (`app/src/main/mcp/client.ts:147–150`). Eine Änderung der Kopfzeile `Mcp-Session-Id` wird nicht beobachtet. Das verwendete SDK 1.32.2 (`app/package.json:160`) übernimmt eine solche Kopfzeile sogar bei jeder POST-Antwort in seine Sitzungskennung (`app/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js:320–324`). Gegenbeispiel: Server antwortet auf einen Werkzeugaufruf mit neuer `Mcp-Session-Id`, ohne die Verbindung zu schließen oder eine Listenänderung zu melden → weitere freigegebene Werkzeuge bleiben in demselben Agentenlauf nutzbar, obwohl der Server die Sitzung gewechselt hat.

Vorschlag: Die erste Sitzungskennung Main-seitig festhalten und jede spätere HTTP-Antwort vor SDK-Weitergabe auf Wechsel prüfen; dann den Server für diesen Lauf invalidieren.

### F09 — Unbestätigtes Programm läuft mit vollen Rechten
Schwere: kritisch
ADR-Stelle: E4/E21; F06
Status: [OFFEN]

Die neue Startprobe läuft **vor** dem nativen Freigabedialog (`app/src/main/mcp/ipc.ts:105–127`, Dialog erst `:159–168`). Bei `fullAccess=true` startet sie `spec.command` sogar ohne Sandbox (`app/src/main/mcp/ipc.ts:119–120`; `app/src/main/mcp/sandbox.ts:203–214`). Ob ein Programm für die Probe geeignet ist, entscheidet allein sein Dateiname nach `realpath` (`app/src/main/mcp/sandbox.ts:195–207`); `normalizeStdioInput` prüft Ausführbarkeit und verbotene Namen, aber keine vertrauenswürdige Herkunft (`app/src/main/mcp/store.ts:90–99`). Gegenbeispiel: Ein kompromittierter eigener Renderer ruft `mcp-save-stdio` mit `fullAccess:true` und einer ausführbaren, selbst angelegten Datei `/…/node` auf. Schon deren `--version`-Pfad kann Vault, Schlüssel und Netz mit Benutzerrechten nutzen; erst **danach** erscheint die Frage, die der Nutzer ablehnen könnte. Damit wird die in F01 abgesicherte Freigabegrenze über F06s Korrektur vorverlegt.

Vorschlag: Vor Nutzerbestätigung kein vorgeschlagenes Programm starten. Eine Vorabprobe mit vollen Rechten darf nur nach einem gesonderten nativen Zustimmungsakt stattfinden; alternativ den Start erst nach der Freigabe prüfen und bei Fehlschlag nicht speichern.

### F10 — F03 bleibt beim Inspect ohne Vault-Pfad offen
Schwere: hoch
ADR-Stelle: E20; F03
Status: [OFFEN]

Die neue Profilregel sperrt einen Vault nur, **wenn** `spec.vaultPath` gesetzt ist (`app/src/main/mcp/sandbox.ts:90–102`). Der Lauf übergibt ihn zwar (`app/src/main/index.ts:5077–5079`), doch `mcp-inspect` nimmt ihn weiterhin optional vom Renderer entgegen und ruft `openMcpSession` auch ohne Pfad auf (`app/src/main/mcp/ipc.ts:240–248`). Dort wird ohne `opts.vaultPath` keine Vault-Regel erzeugt (`app/src/main/mcp/client.ts:82–90`). Gegenbeispiel: Geöffneter Vault unter `/opt/notizen`, Server mit `vaultRead:false`; kompromittierter Renderer ruft `mcp-inspect(id)` ohne zweiten Parameter auf → `(allow default)` lässt dem während des Inspect gestarteten Server Vault und `.mindgraph` lesbar, bevor irgendein Agentenlauf beginnt. Der UI-Normalpfad übergibt den Pfad (`app/src/renderer/components/Settings/McpSection.tsx:47–50`), erzwingt ihn aber nicht Main-seitig.

Vorschlag: Den geöffneten Vault im Main ermitteln und für jeden stdio-Start ins Profil geben; falls kein verlässlicher Vault-Pfad verfügbar ist, Inspect für diesen Server verweigern.

### F11 — Alte HTTP-Geheimnisse überleben den Transportwechsel
Schwere: hoch
ADR-Stelle: E16′; F04
Status: [OFFEN]

F04 wurde nur für einen direkten Wechsel **HTTP-Origin → HTTP-Origin** abgefangen (`app/src/main/mcp/ipc.ts:192–205`, `:223–225`). `saveStdio` erlaubt dieselbe ID für einen bestehenden Server, löscht dessen HTTP-Geheimnisse aber nicht (`app/src/main/mcp/ipc.ts:105–110`, `:168–170`); `store.put` ersetzt den Transport unter derselben ID (`app/src/main/mcp/store.ts:211–231`). Wird diese ID später wieder als HTTP-Server gespeichert, ist `existing.http` nicht vorhanden, also bleibt `originChanged=false` und `clearSecrets` läuft nicht (`app/src/main/mcp/ipc.ts:195–205`, `:223–225`). Leere neu eingetragene Geheimwerte werden von `saveSecrets` ignoriert (`app/src/main/mcp/store.ts:266–277`); `openMcpSession` sendet dann die alte Datei an die neue Adresse (`app/src/main/mcp/client.ts:98–115`). Gegenbeispiel: HTTP A mit Bearer-Token → dieselbe ID als stdio freigeben → dieselbe ID als HTTP B mit `Authorization:''` freigeben → Inspect bei B übermittelt A-Token. Die nativen Dialoge zeigen Adressen und Namen, aber keine Wiederverwendung dieses alten Werts.

Vorschlag: Geheimnisse beim Verlassen des HTTP-Transports löschen und die Übernahme allein an die vollständige vorherige Zielbindung knüpfen; Konfiguration und Secret-Datei als einen atomaren Wechsel behandeln.

### F12 — Seitengrößen-Deckel lässt Werte und Tiefe durch
Schwere: mittel
ADR-Stelle: E8″; F07
Status: [OFFEN]

Der neue wertbasierte Deckel erkennt Zahlen als Text nur im Dezimalschreibstil und beendet die Rekursion nach Tiefe sechs (`app/src/shared/mcp.ts:234–255`). Ein gleichbedeutender String wie `"1e6"` oder ein `limit` in einem Objekt ab Tiefe sieben wird unverändert an den Server übergeben (`app/src/shared/mcp.ts:254–271`; `app/src/main/mcp/agentTools.ts:119–127`). Gegenbeispiel: Ein Werkzeug bietet `limit` als String an; das Modell sendet `{limit:"1e6"}` → kein Deckel, der Server kann daraus eine Million machen. Ebenso `{a:{b:{c:{d:{e:{f:{g:{limit:100000}}}}}}}}`. Der neue Test prüft nur einen direkten String und ein einfach verschachteltes Feld (`app/src/shared/mcp.test.ts:71–76`). Damit ist F07 für gültige weitere Argumentformen nicht geschlossen.

Vorschlag: Für erkannte Mengenfelder unverständliche oder zu tief verschachtelte Werte vor dem Aufruf ablehnen, statt sie ungeprüft weiterzureichen; Exponentialschreibweise ausdrücklich behandeln.

### F13 — Deckel verändert fachliche Filter und Offsets
Schwere: mittel
ADR-Stelle: E8″
Status: [OFFEN]

`capPageSizeArgs` betrachtet jeden Schlüssel `count`, `first`, `size` usw. an beliebiger Stelle als Seitengröße, ohne das Schema oder die Bedeutung des Feldes zu prüfen (`app/src/shared/mcp.ts:234–269`). Auch `0` wird zu `50`, weil der Code `n < 1` als Kappungsfall behandelt (`app/src/shared/mcp.ts:259–263`). Gegenbeispiel: Ein freigegebenes Suchwerkzeug bietet `filter.count` als exakten Fachwert an; `{filter:{count:0}}` wird zu `{filter:{count:50}}` und liefert andere Daten. Oder `first:1000` meint einen Offset, wird aber auf 50 gesetzt. Der Test deckt nur `filter.count:3` ab (`app/src/shared/mcp.test.ts:71–76`). Die Korrektur von F07 kann damit eine sachlich falsche Antwort erzeugen.

Vorschlag: Nur eindeutig als Seitengröße ausgewiesene Felder deckeln; für mehrdeutige Namen eine verifizierte Zuordnung oder eine Ablehnung statt stiller Argumentänderung verwenden.

### F14 — Sitzungswechsel lässt laufende Werkzeugantwort passieren
Schwere: mittel
ADR-Stelle: E23; F08
Status: [OFFEN]

Der HTTP-Beobachter invalidiert bei neuer `Mcp-Session-Id`, gibt dieselbe Antwort aber weiter an das SDK (`app/src/main/mcp/httpFetch.ts:87–96`; `app/src/main/mcp/client.ts:104–115`). `session.call` prüft `invalidated` nur **vor** `client.callTool`, nicht nach dessen Antwort (`app/src/main/mcp/client.ts:157–160`); `agentTools` verarbeitet das zurückgegebene Ergebnis (`app/src/main/mcp/agentTools.ts:127–139`). Gegenbeispiel: Der Server sendet bei einem bereits laufenden `tools/call` neue Sitzungskennung samt Werkzeugergebnis → die Sitzung wird zwar für spätere Aufrufe gesperrt, dieses Ergebnis erreicht noch das Modell. Der neue Test lässt die Kennung schon beim Verbinden beziehungsweise Listen rotieren und prüft nur, dass ein **späterer** Aufruf scheitert (`app/src/main/mcp/client.test.ts:163–170`, `:198–209`). E23s „sofort“ ist für die auslösende Antwort damit nicht umgesetzt.

Vorschlag: Nach `client.callTool` das Invalidation-Flag erneut prüfen und die auslösende Antwort als gesperrt behandeln; den Test mit einem Wechsel erst auf der Werkzeugantwort ergänzen.

### F15 — Freigabeprobe prüft ein anderes Profil als der Lauf
Schwere: mittel
ADR-Stelle: E21; F06
Status: [OFFEN]

`saveStdio` baut die Probe ausdrücklich **ohne Vault-Pfad** (`app/src/main/mcp/ipc.ts:111–127`), obwohl der echte Start den geöffneten Vault samt `vaultRead` in das Profil gibt (`app/src/main/mcp/client.ts:82–91`). Dadurch wird die neue Sperre „Programm liegt im Vault ohne Lesefreigabe“ bei der Freigabe nie geprüft (`app/src/main/mcp/sandbox.ts:86–89`). Gegenbeispiel: `script=<Vault>/tools/server.js`, `vaultRead=false`, Interpreter außerhalb des Vaults → Probe und Dialog können erfolgreich sein; beim ersten Inspect oder Agentenlauf wirft `buildMcpSandboxProfile`, und der eben freigegebene Server ist nicht nutzbar. Die Versionsprobe verwendet zudem nur den Interpreter mit `--version`, nicht das Einstiegsskript (`app/src/main/mcp/sandbox.ts:203–214`). Damit bleibt der ursprüngliche E21-Teil „tatsächlich erzeugtes Profil bei Freigabe“ aus F06 offen.

Vorschlag: Den für die Freigabe maßgeblichen Vault im Main ermitteln und dieselben Profilparameter vor dem Dialog prüfen; bei späterem Vault-Wechsel erneut prüfen, wie bereits beim Start.

### F16 — Freigegebener Ober-Vault öffnet gesperrten Unter-Vault
Schwere: hoch
ADR-Stelle: E20; F10
Status: [OFFEN]

Bei verschachtelten bekannten Vaults setzt `buildMcpSandboxProfile` erst die erneute Lesesperre für alle `closedVaults` und danach die Leseerlaubnis für den ausgewählten `vaultPath` (`app/src/main/mcp/sandbox.ts:93–110`). Liegt ein anderer bekannter Vault **unter** dem freigegebenen Vault, gewinnt nach der hier verwendeten Regelreihenfolge die spätere Erlaubnis des Oberordners für dessen normale Dateien; nur `.mindgraph` wird danach noch eigens gesperrt (`app/src/main/mcp/sandbox.ts:109–112`). Gegenbeispiel: `knownVaults=['/daten/A','/daten/A/B']`, `vaultPath='/daten/A'`, `vaultRead=true` → `/daten/A/B/notiz.md` fällt erst unter `deny /daten/A/B`, danach unter `allow /daten/A`. Die Tests prüfen Einzel-Vaults und einen umfassenden Zusatzpfad, aber keine verschachtelten bekannten Vaults (`app/src/main/mcp/sandbox.test.ts:21–39`, `:84–96`). Damit ist die Zusage „alle anderen bekannten Vaults bleiben gesperrt“ aus der Antwort auf F10 nicht erfüllt.

Vorschlag: Zuerst den freigegebenen Vault erlauben und **danach** alle anderen bekannten Vaults sperren; für einen ausgewählten Unter-Vault unter einem gesperrten Ober-Vault die gezielte Erlaubnis entsprechend gesondert und getestet anordnen.

### F17 — Ein später geöffneter Vault fehlt im laufenden Sandbox-Profil
Schwere: hoch
ADR-Stelle: E20; F10
Status: [OFFEN]

`knownVaults` wird beim Laufstart als Kopie von `approvedVaultRoots` übergeben (`app/src/main/index.ts:5077–5079`) und einmalig ins Sandbox-Profil geschrieben (`app/src/main/mcp/client.ts:84–95`). `open-vault` kann danach eine weitere Wurzel in dieselbe Main-Liste aufnehmen (`app/src/main/index.ts:1951–1966`); die laufende MCP-Sitzung bekommt davon keine neue Regel. Gegenbeispiel: MCP-Server läuft mit Vault A, ohne Freigabe für andere Vaults; der Nutzer öffnet währenddessen Vault B unter `/opt/B`. B war beim Profilbau unbekannt und liegt außerhalb der pauschal gesperrten Orte (`app/src/main/mcp/sandbox.ts:98–110`). Wegen `(allow default)` kann der Server B samt `.mindgraph` lesen, obwohl er für B nie freigegeben wurde. Die neue `knownVaults`-Liste schützt nur den Stand zum Startzeitpunkt.

Vorschlag: Vor dem Hinzufügen einer neuen Vault-Wurzel aktive stdio-MCP-Sitzungen beenden oder ihr Profil neu aufbauen; bis dahin keinen neuen Vault für den laufenden Server erreichbar machen.

### F18 — Gleichzeitige Serveränderungen können Token und Ziel vertauschen
Schwere: hoch
ADR-Stelle: E16′; F11
Status: [OFFEN]

`store.put` serialisiert nur das Schreiben der Serverkonfiguration und löscht dabei alte Geheimnisse (`app/src/main/mcp/store.ts:172–176`, `:211–240`). Der Handler speichert die neuen Geheimnisse **danach außerhalb dieser Queue** (`app/src/main/mcp/ipc.ts:229–233`; `app/src/main/mcp/store.ts:280–286`). Zwei gleichzeitig bestätigte Änderungen derselben ID auf verschiedene Origins können daher so ineinandergreifen: B schreibt seine Konfiguration und beginnt das asynchrone Speichern von Token B; C schreibt anschließend Konfiguration C und Token C; der verzögerte Schreibvorgang von B endet zuletzt. Ergebnis: Konfiguration C mit Token B, das beim nächsten Connect an C geht (`app/src/main/mcp/client.ts:101–118`). Das zusätzliche `clearSecrets` im Handler liegt ebenfalls außerhalb der Queue (`app/src/main/mcp/ipc.ts:230–232`) und verhindert diese Reihenfolge nicht. Damit schließt die Korrektur von F11 den sequenziellen Wechsel, aber nicht das Rennen beim Speichern.

Vorschlag: Konfiguration und verschlüsselte Geheimnisse pro Server in **einer** serialisierten Transaktion ändern; nach Dialogen die Ausgangsbindung nochmals prüfen und parallele Änderungen derselben ID ablehnen.

### F19 — `null` umgeht den neuen Mengenparameter-Deckel
Schwere: mittel
ADR-Stelle: E8″; F12
Status: [OFFEN]

Die Korrektur lehnt unlesbare Werte für erkannte Mengenparameter nur dann ab, wenn der Wert weder `null` noch `undefined` ist (`app/src/shared/mcp.ts:270–283`). Ein explizites `null` bleibt im Ergebnis vorhanden; deshalb ergänzt auch die spätere Prüfung auf fehlende Schemafelder keinen Deckel (`app/src/shared/mcp.ts:287–294`). Gegenbeispiel: `{top:null}` für ein Werkzeug, das `null` als „ohne Limit“ interpretiert → der Aufruf geht mit `top:null` statt höchstens 50 an den Server (`app/src/main/mcp/agentTools.ts:119–127`). Der neue Test prüft `1e6`, unlesbaren Text und Tiefe, aber nicht `null` (`app/src/shared/mcp.test.ts:71–87`). Damit ist F12 für eine weitere gültige JSON-Eingabe nicht geschlossen.

Vorschlag: Erkannte Mengenfelder mit `null` entweder auf den Deckel setzen oder vor dem Serveraufruf ablehnen.

### F20 — Neuer Vault während der MCP-Vorbereitung bleibt ungesperrt
Schwere: hoch
ADR-Stelle: E20; F17
Status: [OFFEN]

Die Vault-Wurzeln werden beim Aufruf von `prepareMcpForRun` kopiert (`app/src/main/index.ts:5077–5079`), die Sitzung baut daraus ihr Profil (`app/src/main/mcp/client.ts:84–95`). `revokeActiveMcpSessions` sieht aber nur `activeStates` (`app/src/main/mcp/agentTools.ts:38–49`); der neue Zustand wird erst **nach** allen Verbindungen und der Werkzeugprüfung eingetragen (`app/src/main/mcp/agentTools.ts:71–106`). Gegenbeispiel: Ein stdio-Server wartet beim Connect oder bei `tools/list`; währenddessen öffnet der Nutzer Vault B unter `/opt/B`. `addApprovedRoot` ruft die Sperre vor dem Hinzufügen auf (`app/src/main/index.ts:1288–1301`), findet aber den noch nicht registrierten MCP-Zustand. Danach beendet `prepareMcpForRun` den Start mit dem alten Profil, obwohl B nun bekannt ist. Wegen `(allow default)` und fehlender B-Regel kann dieser Server B lesen (`app/src/main/mcp/sandbox.ts:103–118`). Der neue Test widerruft nur einen bereits vollständig vorbereiteten Zustand (`app/src/main/mcp/client.test.ts:243–259`). F17 ist für diesen Start-Zwischenzustand nicht geschlossen.

Vorschlag: Vorbereitende Sitzungen sofort registrieren und widerrufbar machen; vor Rückgabe von `prepareMcpForRun` die Vault-Generation erneut gegen den Profilstand prüfen und bei Änderung alle geöffneten Sitzungen schließen.

### F21 — Fehlgeschlagener Secret-Write lässt Konfiguration geändert zurück
Schwere: mittel
ADR-Stelle: E16′; F18
Status: [OFFEN]

Die neue Warteschlange verhindert das Vertauschen zweier erfolgreicher Änderungen, macht Dateien aber nicht zu einer gemeinsamen atomaren Transaktion. `store.put` entfernt beim Origin- oder Transportwechsel zuerst die alte Secret-Datei, schreibt dann die neue Serverkonfiguration und **danach** die neuen Secrets (`app/src/main/mcp/store.ts:238–269`). `writeSecrets` kann etwa bei fehlender Verschlüsselung oder einem Schreibfehler werfen (`app/src/main/mcp/store.ts:215–225`); der Handler meldet dann einen Fehler (`app/src/main/mcp/ipc.ts:229–239`), obwohl die neue Konfiguration bereits dauerhaft ist. Gegenbeispiel: HTTP A mit Token A → Nutzer bestätigt Wechsel auf B und Token B → `safeStorage` ist beim Secret-Write nicht verfügbar: A-Token ist gelöscht, B-Konfiguration gespeichert, UI meldet „Speichern fehlgeschlagen“. Ein Reload zeigt einen anderen Eintrag als vor dem fehlgeschlagenen Vorgang. Das gilt ebenso für HTTP → stdio, wenn `writeAll` nach dem Secret-Löschen scheitert.

Vorschlag: Neue Konfiguration und Secret-Datei zuerst vollständig in temporäre Dateien schreiben und erst nach erfolgreicher Vorbereitung umschalten; bei Fehlschlag den vorherigen Zustand erhalten oder gezielt zurückrollen.

### F22 — Bindungsvergleich liegt außerhalb der Schreibwarteschlange
Schwere: mittel
ADR-Stelle: E16′; F18
Status: [OFFEN]

Nach dem Dialog liest `mcp-save-http` die aktuelle Bindung und vergleicht sie mit der vor dem Dialog gelesenen (`app/src/main/mcp/ipc.ts:199–205`, `:229–236`). Der Vergleich ist jedoch **nicht** Teil der serialisierten `store.put`-Operation (`app/src/main/mcp/store.ts:238–245`). Zwei parallele Änderungen derselben ID können daher beide noch Bindung A lesen und den Vergleich bestehen; danach schreibt die Warteschlange erst B und dann C. Gegenbeispiel: Zwei bestätigte HTTP-Dialoge für denselben Server stehen gleichzeitig vor `store.get`; beide sehen A → B wird gespeichert, anschließend überschreibt C B ohne die angekündigte Ablehnung „Eintrag inzwischen geändert“. Die neue Queue hält Token und jeweiliges Ziel bei erfolgreichem Schreiben zusammen, verhindert aber diesen verlorenen, bereits bestätigten Zwischenstand nicht.

Vorschlag: Den erwarteten `bindingHash` an `store.put` übergeben und **innerhalb** seiner serialisierten Operation gegen den dann aktuellen Eintrag prüfen.

### F23 — Widerruf verhindert keinen späteren Verbindungsstart (F20)
Schwere: hoch
ADR-Stelle: app/src/main/mcp/agentTools.ts:83-92
Status: [OFFEN]

`prepareMcpForRun` wartet zuerst auf `store.get` und startet danach ohne erneute Widerrufsprüfung
`openMcpSession`; `state.revoked` wird erst nach dessen Abschluss geprüft. Kommt ein neuer Vault
während des wartenden `get` hinzu, markiert `revokeActiveMcpSessions` den bereits registrierten
Zustand als widerrufen (`agentTools.ts:48-54`), aber der fortlaufende Start kann danach trotzdem
den Server öffnen. Bei `fullAccess` läuft das Programm ohne Sandbox; bei Sandbox-Profilen werden
außerdem die zum Start übergebenen `knownVaults` verwendet. Gegenbeispiel: verzögertes `store.get`
→ Vault wird hinzugefügt und Widerruf kehrt zurück → `get` liefert Konfiguration → `openMcpSession`
startet mit alten Rechten → erst nach Verbindungsaufbau wird geschlossen. Damit kann ein
widerrufener Start zwischenzeitlich auf den neu freigegebenen Vault zugreifen.

Vorschlag: `assertNotRevoked()` unmittelbar vor `openMcpSession` prüfen; zusätzlich den
Startvorgang abbrechen, falls der Widerruf während des Verbindens eintritt.

_Runde 6: keine neuen Findings._

## Claude-Antwort

Runde 1, 14.11.2026. Alle acht Befunde am Code nachgelesen, alle tragen. Behoben ohne vorherige
Rückfrage beim Nutzer, weil der Nutzer per `/goal` „baue die Schnittstelle“ den Bau in Auftrag
gegeben hat und es Fehler im eigenen, unveröffentlichten Code sind. Die Abnahme durch den Nutzer
(Gegenprobe in der Dev-App) bleibt offen. Belege: `npm run typecheck` grün, `npx vitest run
src/shared/mcp.test.ts src/main/mcp/` 48 grün.

- **F01 [ADRESSIERT]** — `mcp-set-tool` zeigt vor jeder positiven Freigabe einen Main-Dialog mit
  Name, Beschreibung (≤ 600 Zeichen), Parameternamen und dem Satz „MindGraph kann nicht prüfen, ob
  dieses Werkzeug nur liest“; nach dem Klick wird erneut gegen den aktuellen Abfragestand und die
  Bindung geprüft (`ipc.ts`, Handler `mcp-set-tool`). Zurückziehen bleibt ohne Dialog (verengt nur).
- **F02 [ADRESSIERT]** — Herkunft wird VOR `session.call` gesetzt (`agentTools.ts`), und auch die
  Fehlermeldung geht gerahmt über `wrapForeignResult` an das Modell.
- **F03 [ADRESSIERT]** — Der geöffnete Vault geht IMMER ins Profil; ohne Lesefreigabe folgt nach den
  Programm-/Zusatzpfaden ein erneutes `deny` auf den Vault, mit Freigabe ein `allow`, danach immer
  `.mindgraph` gesperrt (`sandbox.ts` `buildMcpSandboxProfile`). Programm im Vault ohne
  Lesefreigabe → Ablehnung. Der Selbsttest prüft zusätzlich eine Kanarien-Datei im Vault.
  `client.ts` und `McpSection.tsx` geben den Vault immer mit. Tests: „sperrt den Vault ohne
  Freigabe ausdrücklich — auch wenn ein Zusatzpfad ihn umfasst“, „sperrt einen Vault außerhalb des
  Benutzerordners ohne Lesefreigabe“ (gegen echtes sandbox-exec, Vault unter /var/folders).
- **F04 [ADRESSIERT]** — Bei geändertem Origin werden gespeicherte Geheimnisse nicht übernommen:
  fehlen neue Werte, wird abgelehnt; sonst wird die alte Ablage vor dem Speichern gelöscht
  (`store.clearSecrets`). Nicht automatisiert getestet (Handler braucht Electron-Dialoge).
- **F05 [ADRESSIERT]** — Nach `prepareMcpForRun` prüft der Lauf-Handler `event.sender.isDestroyed()`
  und schließt die Verbindungen, bevor ein Lauf entsteht (`index.ts`, direkt vor `startRun`).
  Nicht übernommen: ein Abbruchsignal schon während des Verbindens — die Wartezeit ist durch die
  SDK-Frist (60 s) begrenzt, danach greift die neue Prüfung.
- **F06 [ADRESSIERT]** — `saveStdio` baut das echte Profil mit einem Probe-Arbeitsordner, führt
  `verifyMcpSandbox` aus und startet den Interpreter mit `--version` im Profil
  (`sandbox.ts` `probeInterpreter`), bevor der Dialog erscheint; der Dialog nennt das Ergebnis.
  Grenze: Für Programme ohne bekannte Versionsabfrage (nicht node/python/bun/deno/ruby/php/java)
  gibt es keine Startprobe — das steht im Dialog („zeigt erst die erste Verbindung“).
- **F07 [ADRESSIERT]** — `capPageSizeArgs` entscheidet jetzt nach dem WERT: rekursiv (Tiefe 6),
  Zahl oder Zahl-als-Text, unabhängig von `$ref`/`allOf`/`string` im Schema. Die Zusage im
  Kommentar ist eingeschränkt: anders benannte Mengenparameter deckelt nichts, dafür bleiben Byte-
  und Zeichengrenze. Test: „deckelt auch verschachtelte, als Text oder per $ref beschriebene
  Seitengrößen“.
- **F08 [ADRESSIERT]** — `createMcpFetch` hat einen Beobachter `onResponse`; `client.ts` hält die
  erste `Mcp-Session-Id` fest und sperrt den Server bei jeder anderen. Test gegen einen echten
  SDK-Server mit wechselnder Kennung: „sperrt den Server, wenn er mitten im Lauf eine neue Sitzung
  beginnt“.

Runde 2, 14.11.2026. F09–F15 am Code nachgelesen, alle tragen. F09 hat meine eigene Korrektur von
F06 erzeugt. Belege: `npm run typecheck` grün, `npx vitest run src/shared/mcp.test.ts src/main/mcp/`
50 grün (sechsmal hintereinander, nach Korrektur eines Tests mit Zeitabhängigkeit, siehe F14).

- **F09 [ADRESSIERT]** — `saveStdio` startet vor dem Dialog nichts mehr; vorher läuft nur die reine
  Pfadprüfung. Selbsttest und Versionsabfrage folgen NACH der Freigabe; schlagen sie fehl, wird
  nichts gespeichert („Freigegeben, aber nicht gespeichert: …“). Der Dialog sagt das vorab.
- **F10 [ADRESSIERT]** — Neues Feld `knownVaults` im Profil: alle Vaults aus `approvedVaultRoots`
  werden immer gesperrt, samt `.mindgraph`, unabhängig davon, ob der Renderer einen Vault-Pfad
  schickt. Freigegeben wird nur `vaultPath` bei `vaultRead`. Durchgereicht über `deps.getApprovedVaultRoots`
  (Einstellungen) und `prepareMcpForRun({ knownVaults })` (Lauf).
- **F11 [ADRESSIERT]** — `store.put` löscht die Geheimnisdatei, sobald der vorige Eintrag kein
  HTTP-Eintrag war oder ein anderes Origin hatte. Damit hängt das Behalten allein an „vorher HTTP
  mit gleichem Origin“.
- **F12 [ADRESSIERT]** — Zahl-als-Text über `Number()` (auch `1e6`); ein Mengenparameter ohne lesbaren
  Zahlenwert und Argumente tiefer als 8 Ebenen → Fehler, der Aufruf geht nicht raus.
- **F13 [ADRESSIERT]** — Nur noch eindeutige Namen (`top`, `$top`, `limit`, `maxresults`,
  `max_results`, `pagesize`, `page_size`, `per_page`, `perpage`, `take`); `count`, `first`, `size`,
  `max` bleiben unberührt. 0 und negative Werte werden bei diesen Namen weiter auf den Deckel gesetzt,
  weil viele Schnittstellen 0 als „alles“ lesen — das ist eine bewusste Entscheidung, keine Lücke.
- **F14 [ADRESSIERT]** — `session.call` prüft die Sperre auch NACH `callTool`; die auslösende Antwort
  wird verworfen. Test „lässt die Antwort nicht durch, mit der die Sitzung wechselt“ mit Wechsel
  erst auf der Werkzeugantwort. Der bestehende Listenänderungs-Test akzeptiert jetzt beide richtigen
  Ausgänge (er wackelte genau deshalb einmal in acht Läufen).
- **F15 [ADRESSIERT]** — Programm oder Skript in einem bekannten Vault wird vor dem Dialog abgelehnt
  (`programVault`), das Profil wirft in diesem Fall ebenfalls. Die Probe läuft mit `knownVaults`.
  **Bleibt:** Die Versionsabfrage startet nur den Interpreter, nicht das Einstiegsskript — das
  Skript zu starten hieße, den Server selbst zu starten; das beweist erst die erste Verbindung.

Runde 3, 14.11.2026. F16–F19 am Code nachgelesen, alle tragen. Belege: `npm run typecheck` grün,
`npx vitest run src/shared/mcp.test.ts src/main/mcp/` 53 grün (dreimal).

- **F16 [ADRESSIERT]** — Reihenfolge im Profil: alle nicht freigegebenen Vaults sperren → den
  freigegebenen erlauben → andere Vaults, die IN ihm liegen, erneut sperren → `.mindgraph` aller
  sperren (`sandbox.ts`, `closedInsideOpen`). Test „hält einen Vault IM freigegebenen Vault gesperrt“.
- **F17 [ADRESSIERT]** — `addApprovedRoot` (`index.ts`) ruft vor dem Aufnehmen einer NEUEN Wurzel
  `revokeActiveMcpSessions`: alle laufenden Verbindungen werden geschlossen und ihre Server für den
  Rest des Laufs gesperrt; ein neuer Lauf baut das Profil mit dem neuen Vault. Test „sperrt laufende
  Verbindungen, wenn ein weiterer Vault dazukommt“. Kein Neuaufbau mitten im Lauf — bewusst, weil
  ein Profil sich in einem laufenden Prozess nicht austauschen lässt.
- **F18 [ADRESSIERT]** — Geheimnisse werden in derselben serialisierten Transaktion wie die
  Konfiguration geschrieben (`store.put(…, secrets)`, atomar per Umbenennen); `saveSecrets` und
  `clearSecrets` laufen ebenfalls durch die Warteschlange. Zusätzlich lehnt `mcp-save-http` ab, wenn
  sich der Eintrag zwischen Dialog und Speichern geändert hat (Bindung verglichen).
- **F19 [ADRESSIERT]** — `null` bei einem Mengenparameter wird auf den Deckel gesetzt. Test ergänzt.

Runde 4, 14.11.2026. F20–F22 am Code nachgelesen, alle tragen. Belege: `npm run typecheck` grün,
`npx vitest run src/shared/mcp.test.ts src/main/mcp/` 57 Tests, davon 56 grün und 1 übersprungen
(dreimal hintereinander).

- **F20 [ADRESSIERT]** — `prepareMcpForRun` registriert seinen Zustand SOFORT in `activeStates`;
  `revokeActiveMcpSessions` setzt `state.revoked`, nach jeder geöffneten Sitzung und vor der Rückgabe
  wird geprüft → „Start abgebrochen: …“, alle Sitzungen geschlossen. Test „bricht einen Start ab, wenn
  währenddessen ein Vault dazukommt“.
- **F21 [ADRESSIERT]** — `store.put` schreibt neue Geheimnisse erst verschlüsselt in eine temporäre
  Datei, schaltet dann die Konfiguration um und ersetzt bzw. löscht erst danach die Geheimnisdatei.
  Scheitert Verschlüsselung oder Konfigurationsschreiben, bleibt der alte Stand vollständig. Test
  „ändert nichts, wenn die Geheimnisse nicht geschrieben werden können“. Grenze: Scheitert ausgerechnet
  das abschließende Umbenennen der Geheimnisdatei nach erfolgreichem Konfigurationsschreiben, ist die
  neue Konfiguration ohne neue Geheimnisse gespeichert — der Server meldet dann beim Verbinden „kein
  Wert hinterlegt“; Geheimnisse eines anderen Ziels werden in keinem Fall weitergegeben.
- **F22 [ADRESSIERT]** — `store.put(…, expectedBindingHash)` prüft die Bindung INNERHALB der
  Warteschlange; `mcp-save-http` und `saveStdio` geben den vor dem Dialog gelesenen Stand mit. Test
  „lehnt eine zweite, parallel bestätigte Änderung ab“.

Runde 5, 14.11.2026. F23 am Code nachgelesen, trägt.

- **F23 [ADRESSIERT]** — `prepareMcpForRun` prüft den Widerruf unmittelbar VOR jedem
  `openMcpSession`; zusätzlich bricht ein eigenes `AbortController` (`state.startAbort`, mit dem
  Lauf-Signal verknüpft) einen laufenden Verbindungsaufbau beim Widerruf ab, und `openMcpSession`
  beginnt mit einem schon abgebrochenen Signal nicht. Test „startet keine Verbindung mehr, wenn der
  Widerruf vor dem Verbinden kommt“ (verzögertes `store.get`, null Verbindungsversuche).

## Abschnitt 5 — Microsoft-Anmeldung für MCP-Server (gebaut 14.11.2026, NICHT gegen Microsoft geprüft)

Neu zur Prüfung (eigene Runde): `app/src/main/mcp/microsoftLogin.ts` (+ Test), Anbindung in
`store.ts` (`normalizeHttpInput` mit `microsoft`), `shared/mcp.ts` (`McpHttpSpec.microsoft`, Konto in
der Bindung), `client.ts` (Bearer-Marke, Mandantenabgleich mit `TenantId`), `ipc.ts`
(`mcp-ms-login|cancel|logout`, Übernahme/Verwerfen der Anmeldung in `mcp-save-http`), `McpSection.tsx`.
Eigene Ablage `userData/mcp-auth/<serverId>.enc`, getrennt von `microsoft-auth/` der Mail-Konten
(E14′). Berechtigung `https://api.businesscentral.dynamics.com/Financials.ReadWrite.All` ist aus der
Dokumentation abgeleitet und am Testzugang zu prüfen. Die Marke wird je Verbindung einmal geholt;
eine Sitzung, die länger lebt als die Marke (~1 h), endet mit einem Anmeldefehler.

## Status

F01–F23 behoben und nachgeprüft (Runde 6, 14.11.2026: „keine neuen Findings“, auch nicht zu Abschnitt 5).
Befunde je Runde: 8 → 7 → 4 → 3 → 1 → 0. Tor gepackter Build: SDK aus `app.asar` und `sandbox-exec` mit
dem Binärprogramm der gepackten App geprüft, auch ad hoc mit Hardened Runtime und App-Entitlements;
mit Developer ID signierte und notarisierte App nicht (CI). Abschnitt 5
nur mit nachgebauter MSAL getestet, nicht gegen Microsoft/Business Central. Offen: Gegenprobe des Nutzers.
