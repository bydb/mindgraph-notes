# Agent: Kontextfenster, Lese-Abdeckung, neue Auftragskarte, Chat-Stil, Gedächtnis-Regeln

## Aufgabe

Adversariale Prüfung aller Änderungen vom 24./25.11.2026:

1. **Fünf Commits auf `master` seit `17b51445`** (`git log 17b51445..HEAD`, `git diff 17b51445..HEAD`):
   - `42f823f8` Kontextfenster lokaler Agentenläufe einstellbar
   - `286bdbb8` Lese-Abdeckung bei angehobenem Fenster, Umlaut-Dateinamen (NFC), Zeitüberschreitungs-Meldung
   - `138c9710` Auftragskarte neu (eine Spalte, Menüs, Quelle/Ziel getrennt)
   - `3d6a7c1a` Petrol Chat im Stil der Auftragskarte
   - `00bdeeb5` Changelog-Eintrag („Unveröffentlicht“)
2. **Noch nicht committet** (`git diff`, plus zwei neue Dateien): Agent-Gedächtnis — Regeln im
   Modell-Menü zeigen und einzeln entfernen; Prompt-Wortlaut „wenn sie zu diesem Auftrag passt“ statt
   „immer einhalten“.

Nicht bestätigen, sondern Löcher suchen. Kein Code-Edit, kein Commit, kein Push.

### Schwerpunkte

- **Sicherheit der neuen IPC-Handler:** `note-agent-context-info` (nur Abfragen am lokalen Ollama?
  Kann ein Renderer damit etwas über nicht-lokale Modelle erfahren oder Netzaufrufe auslösen?) und
  `note-agent-memory-remove` (Pfadprüfung, Schreiben über `writeFileSafe`, kann der Renderer damit
  beliebige Zeilen aus beliebigen Dateien entfernen? Verknüpfung als Gedächtnis-Notiz?).
- **Datenwege und Sichtbarkeit vor dem Start:** Die Bedingungen des Laufs stehen jetzt in zwei
  Aufklappmenüs. Laut `.claude/rules/note-agent.md` muss sichtbar bleiben: Cloud-Weg mit Empfänger,
  fehlende Zustimmung/Freigabe, ungeprüfter Rechenort, und die Zeile „Bilder im Anhang“ (daran hängt
  die Freigabe von `describe_image` in Web-Läufen). Reicht `autoOpen` + Zusammenfassungszeile dafür?
  Gibt es Zustände, in denen etwas Pflichtiges hinter dem Menü verschwindet (z. B. Bild-Hinweis nur
  als „sieht Bilder an“ in der Zeile, Google-Bild-Prompt-Hinweis, MCP-Sperrgrund ohne Tooltip)?
- **Websuche-Zeile im Chat:** auf einen Satz gekürzt, Langfassung nur als `title`. Fällt damit eine
  Angabe weg, die Codex F11 (alle Datenwege vor dem Senden) verlangt hat?
- **Lese-Abdeckung im Loop:** Rundenlimit (`iteration <= maxIterations - 3`), Zusammenspiel mit
  „letzte Runde: nur noch write_*“, mit `nudgedForWrite`, mit Folgeläufen (`coverageAsked` wird
  vererbt), mit `collectedFolders`/`folder_digest`, mit Web-Läufen (ausgeschlossen?), mit Bildern
  ohne OCR/Bildsicht. Kann ein Lauf dadurch ohne Ergebnis enden, der vorher eines hatte?
- **NFC-Vergleich von Dateinamen** in `findFolderFile`: Kann er zwei verschiedene Dateien
  zusammenfallen lassen (Mehrdeutigkeit statt Fehler)? Gilt dasselbe Problem an anderen Stellen
  (`readImageForAgent`, `read_attachment`, `note_read`, Zielordner)?
- **Rundenzahl 30 bei angehobenem lokalem Fenster** — ohne Messung im Kontext-Harness eingeführt
  (`.claude/rules/note-agent.md` verlangt Messung vor Änderungen an der Rundenzahl).
- **Zeitüberschreitungs-Meldung** bei angehobenem Fenster: stimmt die Aussage in allen Fällen
  (z. B. Web-/MCP-Lauf mit 64k-Standard, der nicht vom Nutzer angehoben wurde)?
- **Entfernte CSS-Regeln** des alten zweispaltigen Rasters und die zusammengeführten Blöcke: tote
  oder fehlende Regeln, Zustände, die jetzt ungestylt sind (laufender Lauf, Übergabe aus dem Chat,
  schmal, Macher-Leiste unter der Notiz, die dieselben Klassen nutzt?).
- **Gedächtnis:** `removeMemoryRule` (genau eine Zeile, sonst nichts), Anzeige bei sehr vielen/langen
  Regeln, Verhalten wenn die Notiz gerade im Editor offen ist (Lesen-Modus-Autosave überschreibt?),
  neuer Prompt-Wortlaut (öffnet er dem Modell eine Hintertür, bestätigte Regeln zu ignorieren?).

## Kontext/Anker

Gemessen im echten Lauf (Test-Instanz, `qwen3.8:27b-mlx`, 65 536 Token, 16 Dateien): Lese-Abdeckung
griff, rund 42 Minuten, letzte Runde lief in die 20-Minuten-Zeitüberschreitung. Details in
`.claude/rules/note-agent.md` (Abschnitt „Modellweg, Cloud-Zustimmung und Datenwege“, Punkte
„Kontextfenster lokaler Läufe ist einstellbar“, „Lese-Abdeckung“, „Auftragskarte, Fassung 11/2026“).

**Kontextfenster**
- `app/src/shared/agentContext.ts` (ganz) — Stufen, `chooseAgentContext`, `agentContextNote`
- `app/src/main/noteAgent/localContext.ts` (ganz) — `/api/show`, `/api/ps`
- `app/src/main/noteAgent/ipc.ts:330` — Handler `note-agent-context-info`
- `app/src/main/noteAgent/ipc.ts:504` — Wert lesen, auf Modellmaximum begrenzen, `contextNote`
- `app/src/main/noteAgent/loop.ts:443` — `runDefaultNumCtx`, `numCtx: Math.max(...)`
- `app/src/main/noteAgent/loop.ts:509` — `raisedLocalWindow` → 30 Runden
- `app/src/renderer/components/Settings/AgentContextCard.tsx`, `app/src/renderer/components/Agent/ContextWindowRow.tsx`

**Lese-Abdeckung und Korrekturen**
- `app/src/shared/folderCoverage.ts` (ganz)
- `app/src/main/noteAgent/loop.ts:481` — `readWholeFolder`, Zusatz im Systemprompt
- `app/src/main/noteAgent/loop.ts:807` — Rückfrage vor dem ersten Schreibversuch
- `app/src/main/noteAgent/contextFiles.ts:629` — `listAllFolderFiles`
- `app/src/main/noteAgent/contextFiles.ts:656` — NFC-Vergleich in `findFolderFile`
- `app/src/main/noteAgent/runRegistry.ts:298` — `recordFolderFileRead`, Vererbung an Folgeläufe
- `app/src/main/noteAgent/skills.ts:618` — angesehenes Bild zählt mit
- `app/src/main/noteAgent/ipc.ts:882` — Zeitüberschreitungs-Meldung bei angehobenem Fenster

**Auftragskarte**
- `app/src/renderer/components/Agent/AgentView.tsx:665` — `autoOpen` (was fest sichtbar bleibt)
- `app/src/renderer/components/Agent/AgentView.tsx:666` — `summaryPerms`, `permsText`, `modelText`
- `app/src/renderer/components/Agent/AgentView.tsx:684` — `modelFixed`, Menü öffnen/schließen (Einfangphase)
- `app/src/renderer/components/Agent/AgentView.tsx:701` — `tryStart` (Lücken erst nach Startversuch)
- `app/src/renderer/components/Shared/ContextAttachmentRow.tsx` — `label`, `addTitle`, `iconOnly`, Aufklapprichtung
- `app/src/renderer/styles/index.css:24073` — Stilblock Auftragskarte

**Chat**
- `app/src/renderer/components/Agent/PetrolChat.tsx:392` — `webPathExtra` (kurze Websuche-Zeile)
- `app/src/renderer/components/Agent/PetrolChat.tsx:1204` — Fußzeile mit Modellwahl
- `app/src/renderer/utils/i18n/petrolChat.ts` — `webLoopConsentShort`, `webDeepConsentShort`
- `app/src/renderer/styles/index.css:24203` — Stilblock Chat

**Gedächtnis (uncommittet)**
- `app/src/shared/agentMemoryRules.ts` + `.test.ts` (neu)
- `app/src/main/noteAgent/skillsLoader.ts:280` — `agentMemoryWithoutRule`, erweitertes `agentMemoryStatus`
- `app/src/main/noteAgent/ipc.ts:1082` — Handler `note-agent-memory-remove`
- `app/src/main/noteAgent/loop.ts:192` — neuer Wortlaut des Gedächtnisblocks
- `app/src/renderer/components/Agent/AgentView.tsx:1227` — Regelliste im Modell-Menü

## Codex-Findings

### F01 — Gedächtnis-Symlink umgeht die Bindung an die Gedächtnis-Notiz
Schwere: hoch
Stelle: app/src/main/noteAgent/skillsLoader.ts:266; app/src/main/noteAgent/skillsLoader.ts:280; app/src/main/noteAgent/ipc.ts:1087; app/src/main/index.ts:1491; app/src/main/index.ts:2492
Status: [OFFEN]

`agentMemoryStatus` und `agentMemoryWithoutRule` lesen `Skills/Agent-Gedächtnis.md` vor jeder kanonischen Pfadprüfung. Ist diese Notiz ein Symlink nach außerhalb, liefert der Status bis zu 40 passende Aufzählungszeilen aus der fremden Datei an den Renderer; der Entfernen-Handler liest sie ebenfalls, bevor `assertSafePath` das Schreiben ablehnt. Zeigt der Symlink auf eine andere Datei **innerhalb** eines freigegebenen Vaults, akzeptiert `assertSafePath` deren kanonischen Pfad und `writeFileSafe` überschreibt genau diese Datei. Bei einem Ziel ohne `.md` entfällt sogar die Markdown-Sperre samt Sicherung. Die feste Zeichenfolge des nominellen Pfads begrenzt den tatsächlichen Lese- und Schreibort somit nicht.

Vorschlag: Den kanonischen Zielpfad vor dem Lesen prüfen und für Status, Entfernen und Schreiben ausdrücklich an die erwartete Gedächtnis-Datei binden; Symlinks an diesem Ort ablehnen.

### F02 — Entfernen kann gleichzeitige Notizänderungen überschreiben
Schwere: hoch
Stelle: app/src/main/noteAgent/skillsLoader.ts:283; app/src/main/noteAgent/ipc.ts:1087; app/src/main/noteAgent/ipc.ts:1090; app/src/main/index.ts:2500
Status: [OFFEN]

Die vollständige Ersatzfassung wird vor der Schreibsperre aus der Datei berechnet. Speichert der Editor oder ein anderer Vorgang zwischen diesem Lesen und `writeFileSafe`, schreibt der Handler die alte Fassung ohne die zwischenzeitlichen Änderungen zurück. Der vorhandene `updateMarkdownSafe`-Weg hält gerade für diesen Fall Lesen, Änderung und Schreiben unter derselben Notiz-Sperre.

Vorschlag: Regelvergleich und Entfernen innerhalb von `updateMarkdownSafe` auf der dort frisch gelesenen Fassung ausführen.

### F03 — „Genau eine Zeile“ verändert den übrigen Notizinhalt
Schwere: mittel
Stelle: app/src/shared/agentMemoryRules.ts:46; app/src/shared/agentMemoryRules.ts:52; app/src/shared/agentMemoryRules.ts:58
Status: [OFFEN]

Nach `splice` entfernt die Funktion **alle** aufeinanderfolgenden Leerzeilen im gesamten Dokument, streicht mit `/\s+$/` sämtlichen Leerraum am Dateiende und vereinheitlicht gemischte Zeilenenden. Auch weit entfernte Absätze ändern sich dadurch, obwohl nur die gewählte Regelzeile verschwinden sollte. Der Test prüft ausdrücklich, dass Dreifach-Leerzeilen verschwinden, und verdeckt damit die Abweichung.

### F04 — Regelliste verschweigt Einträge und kann Regeln zeigen, die der Lauf nicht erhält
Schwere: mittel
Stelle: app/src/main/noteAgent/skillsLoader.ts:253; app/src/main/noteAgent/skillsLoader.ts:273; app/src/renderer/components/Agent/AgentView.tsx:1225
Status: [OFFEN]

Die Karte zeigt ohne Gesamtzahl oder „weitere Regeln“-Hinweis nur die ersten 40 Bullet-Zeilen, obwohl die Notiz mehr enthalten darf. Umgekehrt parst der Status die **ganze** Datei, während `readAgentMemory` den Prompt nach 6.000 Zeichen kappt: Ein in der Karte angezeigter Punkt hinter dieser Grenze kann im konkreten Lauf fehlen. `memLong` warnt nur allgemein vor Kürzung und ordnet sie keiner Regel zu. Damit ist die versprochene Sichtbarkeit dessen, was der Lauf bekommt, nicht zuverlässig.

### F05 — Bildinhalt in Web-Suchanfragen bleibt vor Start hinter dem Menü
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:665; app/src/renderer/components/Agent/AgentView.tsx:679; app/src/renderer/components/Agent/AgentView.tsx:1186; app/src/renderer/utils/i18n/agentCard.ts:121
Status: [OFFEN]

Bei lokalem Modell, aktivierter Webrecherche und möglicher Bildsicht ist `autoOpen` falsch. Die sichtbare Kurzzeile sagt nur „sieht Bilder an“; der freigaberelevante Hinweis, dass Bildinhalt in Suchanfragen einfließen kann, steht ausschließlich in der geschlossenen Modell-Karte (`imageViewWeb`, zusätzlich im dortigen `<details>`). Der Startknopf bleibt zugänglich. Die bisher ausdrücklich an diese sichtbare Zeile gebundene Freigabe von `describe_image` in Web-Läufen wird damit nicht mehr vor dem Start informiert angezeigt.

### F06 — Google-Bild-Prompt ist bei lokalem Modell unsichtbar
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:665; app/src/renderer/components/Agent/AgentView.tsx:1210; app/src/renderer/utils/i18n/agentCard.ts:125
Status: [OFFEN]

Wenn Bildgenerierung möglich ist, der Modellweg aber lokal bleibt, öffnet sich die Modell-Karte nicht automatisch. Weder die Modell-Zusammenfassung noch die Befugnis-Zusammenfassung nennt Google. Der Hinweis, dass ein vom Agenten erzeugter Bild-Prompt Angaben aus Auftrag, Notizen und Anhängen an Google senden kann, erscheint erst nach manuellem Öffnen des Modell-Menüs.

### F07 — Befugnis-Zusammenfassung zeigt während des Laufs künftige statt laufender Rechte
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:666; app/src/renderer/components/Agent/AgentView.tsx:669; app/src/renderer/components/Agent/AgentView.tsx:579; app/src/renderer/components/Agent/AgentView.tsx:949
Status: [OFFEN]

Nach dem Start setzt `submit` `shellArmed` und `computerArmed` zurück. Die zugeklappte Zusammenfassung verwendet trotz `running` weiterhin `shellOn`, `computerOn` und `mcpOn` aus den aktuellen Einstellungen; nur Web verwendet `runWeb`. So kann neben „Agent arbeitet“ „Befugnisse: keine“ stehen, obwohl der laufende Agent Shell oder Rechner-Steuerung hat. Die Schalter im geöffneten Menü verwenden dagegen `runShell` und `runComputer`.

### F08 — Chat-Kurzzeile nennt beim lokalen Weblauf nicht alle Empfänger
Schwere: mittel
Stelle: app/src/renderer/components/Agent/PetrolChat.tsx:392; app/src/renderer/components/Agent/PetrolChat.tsx:1095; app/src/renderer/components/Agent/PetrolChat.tsx:1100; app/src/renderer/utils/i18n/petrolChat.ts:228
Status: [OFFEN]

Bei „gründlich“ und „automatisch“ nennt die sichtbare Zeile nur die Suchanfragen an den Suchanbieter. Die Angabe „Seiten von diesem Rechner“ sowie die Grenzen von Suchen und Seitenabrufen stehen nur im nativen `title` eines `<span>`; dieser Text ist weder dauerhaft sichtbar noch per Tastatur fokussierbar. Die frühere Zusage „alle Datenwege vor dem Senden“ wird für diesen Modus auf einen Maus-Tooltip reduziert.

### F09 — Gleichnamige Dateien in Unterordnern gelten zugleich als gelesen
Schwere: hoch
Stelle: app/src/shared/folderCoverage.ts:36; app/src/shared/folderCoverage.ts:40; app/src/main/noteAgent/contextFiles.ts:647
Status: [OFFEN]

Die Abdeckung bildet aus **jedem** gelesenen Pfad dessen Basename und überspringt dann jede Datei mit diesem Namen. Nach dem Lesen von `A/bericht.md` gilt daher auch `B/bericht.md` als gelesen. Der eigentliche Dateileser behandelt einen bloßen mehrdeutigen Namen dagegen als Fehler; die Abdeckung führt diese Eindeutigkeit nicht mit. Der erste Schreibversuch kann ohne Rückfrage durchgehen, obwohl eine der beiden Quellen ungelesen ist.

### F10 — Teilweise oder verworfene Leseergebnisse zählen als vollständige Datei
Schwere: hoch
Stelle: app/src/main/noteAgent/contextFiles.ts:763; app/src/main/noteAgent/contextFiles.ts:770; app/src/main/noteAgent/skills.ts:553; app/src/main/noteAgent/skills.ts:563; app/src/main/noteAgent/loop.ts:845
Status: [OFFEN]

`read_context_file` kann mit `offset`/`max_rows` nur einen Ausschnitt liefern und kappt Text standardmäßig nach 400 Zeilen; `res.truncated` wird beim Markieren nicht berücksichtigt. Schon dieser Teilaufruf setzt `folderFilesRead` für die ganze Datei. Zudem erfolgt die Markierung **vor** der Loop-Budgetprüfung: Wird das Werkzeugergebnis dort durch „Ergebnis wäre zu groß“ ersetzt, bleibt die Datei trotzdem als gelesen markiert. Die Abdeckung prüft somit erfolgreiche Werkzeugausführung statt beim Modell angekommenen vollständigen Inhalt.

### F11 — `collect_table` nimmt auch nicht gesammelte Dateien aus der Abdeckung
Schwere: mittel
Stelle: app/src/main/noteAgent/skills.ts:682; app/src/main/noteAgent/skills.ts:699; app/src/shared/folderCoverage.ts:29; app/src/main/noteAgent/loop.ts:822
Status: [OFFEN]

Nach einem erfolgreichen `collect_table` landet der **ganze Ordner** in `collectedFolders`; `unreadFolderFiles` entfernt ihn vollständig. `collect_table` verarbeitet jedoch Tabellen, nicht die PDF-, Word-, Markdown- oder Bilddateien desselben Ordners. Bei einem Auftrag über einen gemischten Ordner darf der Agent deshalb ohne Rückfrage schreiben, obwohl diese übrigen Dateien nie gelesen wurden.

### F12 — Ein `folder_digest` schaltet die Abdeckung für alle Ordner aus
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:817; app/src/main/noteAgent/skills.ts:770; app/src/main/noteAgent/loop.ts:841
Status: [OFFEN]

Die Ausnahme prüft nur global `run.toolsUsed.has('folder_digest')`, nicht welchen Ordner der Aufruf ausgewertet hat. Wird bei zwei Anhängen nur Ordner A per `folder_digest` bearbeitet, entfällt die Lese-Abdeckung auch für den ungelesenen Ordner B. Dessen Dateien werden bei einem Schreibversuch nicht mehr genannt.

### F13 — Ein einmaliger Inventarfehler oder Folgeauftrag verbraucht die Abdeckungsprüfung
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:817; app/src/main/noteAgent/loop.ts:820; app/src/main/noteAgent/loop.ts:821; app/src/main/noteAgent/runRegistry.ts:328; app/src/main/noteAgent/runRegistry.ts:370
Status: [OFFEN]

`coverageAsked` wird bereits vor der Inventarabfrage gesetzt; ein Fehler von `listAllFolderFiles` wird still zu `[]` und damit zu „nichts zu prüfen“. Die Prüfung kommt in diesem Lauf nicht zurück. Der Zustand wird zudem in Folgeläufe vererbt: Auch nach neuer Nutzeranweisung oder neuem Dateistand im angehängten Ordner gibt es keinen ersten Schreibaufschub mehr. Beides schwächt gerade die Kontrollstelle, die unvollständige Ordnerergebnisse verhindern soll.

### F14 — Zurückgestellter Schreibversuch kann ohne Datei als Erfolg enden
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:825; app/src/main/noteAgent/loop.ts:828; app/src/main/noteAgent/loop.ts:730; app/src/main/noteAgent/loop.ts:775
Status: [OFFEN]

Die Abdeckung ersetzt den ersten erfolgreichen Schreibaufruf durch eine Werkzeugantwort. Wenn das Modell danach statt eines weiteren Schreibaufrufs einen nichtleeren Abschlusstext ausgibt, akzeptiert der Nicht-Web-Zweig diesen als Erfolg, obwohl `run.results` leer blieb und der angeforderte Datei-Output nie entstand. Die einmalige Schreib-Zurückstellung hat damit einen neuen Pfad „ohne Ergebnisdatei, trotzdem erfolgreich“; der Web-Zweig hat eine ausdrückliche Write-Pflicht, dieser Zweig nicht.

### F15 — NFC-/Kleinschreibvergleich wählt bei Kollision die erste Datei
Schwere: mittel
Stelle: app/src/main/noteAgent/contextFiles.ts:656; app/src/main/noteAgent/contextFiles.ts:657; app/src/main/noteAgent/contextFiles.ts:660
Status: [OFFEN]

Für den vollständigen relativen Pfad benutzt `findFolderFile` nach erfolglosem bytegenauem Treffer `files.find(same)`. Gibt es auf einem passenden Dateisystem zwei Namen, die erst nach NFC-Normalisierung oder Kleinschreibung gleich werden, nimmt es still den ersten Inventareintrag. Nur die Basename-Suche prüft mehrere Treffer. Der Umlaut-Fix kann so eine andere Datei liefern als die angeforderte; bei mehrdeutigen normalisierten Pfaden sollte er denselben Fehler wie die Basename-Suche ausgeben.

### F16 — Modellmaximum unter dem Standard wird ignoriert
Schwere: mittel
Stelle: app/src/shared/agentContext.ts:26; app/src/shared/agentContext.ts:55; app/src/main/noteAgent/ipc.ts:512; app/src/main/noteAgent/loop.ts:456
Status: [OFFEN]

Liegt das von Ollama gemeldete Modellmaximum unter 32.768 Token, liefert die Stufenliste trotzdem 32.768 und `chooseAgentContext` nie einen kleineren Wert. Bei Standardeinstellung fragt der Main das Maximum nicht einmal ab; der Loop sendet stets mindestens 32.768 als `num_ctx` und budgetiert damit. Auch bei angehobenem Nutzerwunsch mit kleinerem Modellmaximum fällt die Wahl nur auf den Standard zurück. Die behauptete Begrenzung auf das Modellmaximum gilt also gerade für kleine Modelle nicht.

### F17 — Zeitüberschreitung nennt bei Web/MCP das falsche Fenster
Schwere: mittel
Stelle: app/src/main/noteAgent/ipc.ts:882; app/src/main/noteAgent/ipc.ts:885; app/src/main/noteAgent/loop.ts:443; app/src/main/noteAgent/loop.ts:456
Status: [OFFEN]

Die Fehlermeldung liest `chatOptions.numCtx` **vor** dem Loop. Bei einem lokalen Web- oder MCP-Lauf mit eingestellten 49.152 Token hebt der Loop das tatsächliche Fenster auf seinen 65.536-Standard; die Meldung behauptet aber, das Modell verarbeite in jeder Runde 49.152 Token und empfiehlt, die Einstellung zu verkleinern. Beim Web-/MCP-Standard von 65.536 ohne angehobene Einstellung ist `raisedWindow` dagegen falsch, sodass sogar die alte Erklärung zu einzelnen Dateien erscheinen kann. Diagnose und Abhilfe sind damit in diesen Läufen nicht an das tatsächlich benutzte Fenster gebunden.

### F18 — Dreißig Runden trotz ausdrücklich offener Messlücke
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:509; app/src/main/noteAgent/loop.ts:510; .claude/rules/note-agent.md:78
Status: [OFFEN]

Jede lokale Einstellung über dem jeweiligen Laufstandard hebt das Limit auf 30 Modellaufrufe. Die Projektregel verlangt vor Änderungen der Rundenzahl eine Messung im Kontext-Harness; dokumentiert ist für das große lokale Fenster bisher ein rund 42-minütiger Lauf, dessen letzte Runde nach dem Schreiben in die Zeitüberschreitung ging, während Trefferquote und Dauer bei gefüllten 64k/128k-Fenstern ausdrücklich ungemessen sind (`.claude/rules/note-agent.md:66-67`). Die zusätzliche Laufzeit- und Timeout-Gefahr der zehn Runden ist damit nicht durch eine Erfolgsverbesserung belegt.

## Claude-Antwort

Runde 1, 25.11.2026. Alle 18 Befunde gegen den Code nachgeprüft: 14 tragen ganz, 4 teilweise
(F08, F13, F14, F16), keiner ist falsch. Der Nutzer hat die Umsetzung freigegeben und entschieden,
das Agent-Gedächtnis abschaltbar zu machen (Standard aus), weil er es als störend empfindet.

- **F01 [ADRESSIERT]** — Die Gedächtnis-Notiz wird ohne Verknüpfungen gelesen (`readMemoryNoteRaw` in
  `skillsLoader.ts`: `O_NOFOLLOW`, `Skills` muss kanonisch im Vault liegen), für Prompt und Karte.
  Der Schreibweg (Entfernen aus der Karte) ist ganz entfallen.
- **F02 [ADRESSIERT]** — Durch Wegfall erledigt: Handler `note-agent-memory-remove`, Preload-Eintrag,
  Typ, `agentMemoryWithoutRule` und `removeMemoryRule` sind gelöscht. Geändert wird in der Notiz.
- **F03 [ADRESSIERT]** — wie F02, die Funktion gibt es nicht mehr.
- **F04 [ADRESSIERT]** — Die Regelliste stammt aus genau dem Text, den der Lauf bekommt; gezeigt
  werden 12, der Rest wird gezählt („und n weitere“), Regeln hinter der Kürzungsgrenze als
  „bekommt der Lauf nicht mehr“.
- **F05 [ADRESSIERT]** — „Bilder im Anhang: Bildinhalt kann in Suchanfragen einfließen“ steht bei
  Websuche + Bild-/Ordner-Anhang + Bildsicht zusätzlich offen unter der Karte (`noteImageViewWeb`).
- **F06 [ABGELEHNT: Nutzerentscheidung]** — Der Befund trägt, und der Hinweis stand kurz offen unter
  der Karte. Der Nutzer hat ihn wieder entfernen lassen: Er erschien bei jedem Auftrag, lenkte ab
  und war für neue Nutzer nicht verständlich. Der Hinweis bleibt im Modell-Menü („Bilder“) und unter
  „Welche Daten wohin gehen“.
- **F07 [ADRESSIERT]** — Die Befugnisse-Zeile nutzt während des Laufs `runShell`, `runComputer`,
  `run.mcpServers`.
- **F08 [ADRESSIERT]** (trägt teilweise) — „Seiten von diesem Rechner“ ist wieder sichtbar. Die
  Obergrenzen (Suchen/Seiten) bleiben im Tooltip: sie sind kein Empfänger.
- **F09 [ADRESSIERT]** — Der reine Dateiname zählt nur, wenn er im Ordner einmal vorkommt, und nur,
  wenn das Modell ihn ohne Pfad angab. Test ergänzt.
- **F10 [ADRESSIERT]** — Als gelesen zählt nur die ganze Datei (kein `offset`/`max_rows`/`sheet`,
  nicht `truncated`); ersetzt der Loop ein Ergebnis als „zu groß“, wird die Datei wieder vergessen
  (`forgetFolderFileRead`).
- **F11 [ADRESSIERT]** — `collect_table` nimmt nur Tabellen (xlsx/csv) des Ordners aus der Abdeckung.
- **F12 [ADRESSIERT]** — `folder_digest` deckt nur den Ordner ab, den es ganz ausgewertet hat
  (`run.digestedFolders`; nicht bei subfolder/Zeitraum/Dateiarten).
- **F13 [ADRESSIERT]** (trägt teilweise) — `coverageAsked` wird erst nach gelungener Bestandsaufnahme
  gesetzt. Die Vererbung an Folgeläufe bleibt Absicht: eine Rückfrage je Auftragskette.
- **F14 [ADRESSIERT]** (trägt teilweise) — Endet das Modell nach der Rückfrage mit Text statt Datei,
  fasst der Loop einmal nach (`nudgedAfterCoverage`). „Text ohne Datei ist Erfolg“ gab es vorher schon.
- **F15 [DISKUSSION]** — Trägt, selten; Kleinschreibung verhielt sich vor heute schon so. Nicht
  umgesetzt, in `.claude/rules/note-agent.md` als offen vermerkt.
- **F16 [DISKUSSION]** (trägt teilweise) — Verhalten wie vor dem Regler (immer 32 768). Die
  Formulierung „auf das Modellmaximum begrenzt“ stimmt für Modelle unter 32k nicht; in den Regeln
  richtiggestellt, Code unverändert.
- **F17 [ADRESSIERT]** — Die Meldung rechnet mit dem wirklich benutzten Fenster
  (`agentRunDefaultNumCtx`, eine Quelle für Loop und Meldung) und gilt nur bei über dem
  Laufstandard angehobenem Fenster.
- **F18 [ADRESSIERT]** — Zurück auf 20 Runden; in den Regeln als nicht gemessen vermerkt.

Belege: `npm run typecheck` grün; `vitest run src/shared src/main/noteAgent` 2699 bestanden.
Nicht geprüft: ein echter Lauf mit den Loop-Korrekturen (F10, F12, F13, F14).

## Status

Runde 1 angefragt und beantwortet am 25.11.2026. F15 und F16 offen (Diskussion). Abnahme durch den Nutzer steht aus.
