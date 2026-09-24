# Agent-Tab: Umsetzung der Auftragskarte (Paket A)

## Aufgabe

Prüfung der Umsetzung, adversarial. Paket A baut die Auftragskarte aus dem Claude-Design-Entwurf
„Agent Redesign“, Runde 2 (Zustände 4a–4g), unter Einhaltung der Findings F01–F21 aus
`docs/codex-collab/agent-auftragskarte-quellen.md`. Paket B (Ergebnis-Karte mit „Verwendete
Unterlagen“, F06–F09) ist NICHT Teil dieser Prüfung.

Stand: HEAD `bfb9c032` plus uncommittete Änderungen. Im Arbeitsbaum liegen außerdem zwei unabhängige
Test-Reparaturen für die Linux-CI (`app/src/renderer/utils/modules.ts` navigator-Guard,
`app/src/main/noteAgent/computerControl.test.ts` macOS-Skip) — bitte mitprüfen, sie sind klein.

Bitte prüfen:
- Stimmt jede sichtbare Aussage der Karte mit dem Code? (Lesebereich, Datenwege, Sofortwirkung,
  Befugnis-Kombinationen, Gedächtnis-Zustand, Bilder, Startknopf-Priorität)
- Zustandslogik der Schalter (modOff/setup/locked/on/off), Reset-Verhalten, Kombination mit Main-Sperren
  (`index.ts:4481,4504`), macOnly.
- Cloud-Erkennung: OpenRouter/LLMBase-Route vs. Ollama `…:cloud` per Name (`isCloudModel`); LM Studio.
- Neue IPC: Sicherheit (`isTrustedSender`, `assertApprovedVault`), Schlüssel verlässt den Main nicht.
- Gedächtnis-Schwelle identisch zu `readAgentMemory`? Refresh nach „Merken“/Lauf/Fokus.
- Regressionen gegenüber vorher: entfernte Hinweise (ComputerArmedHint, Web-Flow-Hinweise, Cloud-Hinweis
  bei Anhängen), Wirkungsbilanz (`compose`), Vergleichskampagne, ⌘↩, Tastatur/Screenreader.
- CSS: Tokens, dunkles Thema, schmale Breite, Picker-Überlauf.

## Kontext/Anker

- `app/src/renderer/components/Agent/AgentView.tsx` (neu geschrieben): `HAS_MAC_TOOLS` :41,
  `PermToggle` ~:56–89, Cloud-Erkennung :125–133, Bilder :166–175, Gedächtnis :177–205, Befugnis-Zustände
  :239–251, `submit` :253–281, `pickLocalModel` :283, Startknopf :302, Render ab ~:314
- `app/src/renderer/utils/i18n/agentCard.ts` (neu) — Wortlaut DE/EN; eingestreut in `translations.ts:4,12,3364`
- `app/src/main/noteAgent/skillsLoader.ts:200` — `agentMemoryStatus`
- `app/src/main/index.ts:4977` — IPC `note-agent-memory-status`; `:7273` — IPC `image-gen-has-key`
- `app/src/main/preload.ts`, `app/src/shared/types.ts` — `noteAgentMemoryStatus`, `imageGenHasKey`
- `app/src/renderer/styles/index.css:21407` ff. — Auftragskarte-CSS
- Vorher-Stand: `git diff -- app/src/renderer/components/Agent/AgentView.tsx`
- Main-Laufstart zum Abgleich: `app/src/main/index.ts` `note-agent-run` (~:4460–4680)

Geprüft von Claude: typecheck, build grün; Tests grün bis auf bekannten Timeout-Wackler
`shellExecution.test.ts`. In der Dev-App (Test-Vault, eigenes Profil) per Screenshot: leer, Auftrag ohne
Ziel, bereit mit Shell+Rechner, dunkles Thema; Picker-Überlauf dabei gefunden und behoben. Nicht gesehen:
Cloud-Zustand, Bilder, Gedächtnis gefüllt/gekürzt, Web an, Modul aus, Windows.

## Codex-Findings

### F01 — „Modul einschalten“ führt zu einer nicht vorhandenen Einstellung
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:66
Status: [OFFEN]
Bei `modOff` bietet `PermToggle` „Einschalten“ und ruft für Web/Shell/Rechner `openSettingsAt('ai-webresearch'/'ai-agentshell'/'ai-agentcomputer')` auf (`AgentView.tsx:446–470`). Diese Anker werden im KI-Tab aber nur gerendert, wenn das jeweilige Modul bereits an ist (`Settings.tsx:1779–1789`). Gerade im ausgeschalteten Zustand landet der Einsteiger also auf einem KI-Tab ohne die angekündigte Schaltfläche. Das Modul muss zuerst im Modul-Tab aktiviert werden.
Vorschlag: Für `modOff` gezielt den Modul-Tab mit dem betreffenden Modul öffnen oder dort direkt einschalten; die KI-Anker erst für `setup` verwenden. Den Übergang Modul aus → an → Einrichtung im UI prüfen.

### F02 — Interne Befugnisse können dem sichtbaren Zustand widersprechen
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:241
Status: [OFFEN]
`webArmed` wird bei Tab-/Vault-Wechsel oder ausgeschaltetem Web-Modul nicht zurückgesetzt (anders als Shell/Rechner in `:115–116`). Wird Web erst aktiviert und dann das Modul ausgeschaltet, zeigt der Schalter `modOff`, aber `allOff` ist falsch und bei noch vorhandener Konfiguration bleibt das Web-Datenweg-Etikett sichtbar (`:249,511–513`); `submit` sendet dagegen `webResearch: false` (`:275`). Analog bleibt `computerArmed` beim Entfernen des letzten freigegebenen Vorgangs wahr: Der Schalter zeigt `setup`, die Karte kündigt sofortiges Handeln an und der Main lehnt den Lauf ab (`:243–249,307–309,276`; `index.ts:4519–4520`).
Vorschlag: Arm-Zustände beim Verlust von Modul/Konfiguration/Vorgängen zurücksetzen oder die gesamte Anzeige und `submit` aus einem einzigen effektiven Befugniszustand ableiten. Diese Übergänge gezielt prüfen.

### F03 — „Auf diesem Rechner“ ist weiterhin eine ungeprüfte Lokalitätszusage
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:130
Status: [OFFEN]
Die Karte kennzeichnet nur Namen mit `:cloud`/`-cloud` als Cloud (`modelCompatibility.ts:1039–1048`) und zeigt sonst „Auf diesem Rechner über Ollama/LM Studio“ (`AgentView.tsx:507–510`; `agentCard.ts:53`). Der Agent-Handler nutzt nicht `resolveLocalModel`; Ollama kann ein Modell mit neutralem Namen über `remote_model`/`remote_host` extern ausführen (`main/rag/localModel.ts:1–12,94–117`; `index.ts:4554–4578`). Bei LM Studio wird ein Modellname mit Cloud-Suffix sogar als „Cloud über Ollama“ etikettiert, obwohl der gewählte Backend-Weg LM Studio ist (`AgentView.tsx:130–133`). F02 aus dem Planreview ist damit im sichtbaren Wortlaut nicht eingehalten.
Vorschlag: „Über Ollama/LM Studio – Ausführungsort nicht geprüft“ verwenden, bis der konkrete Agent-Laufweg geprüft wird. Cloud-Suffix nur beim Ollama-Backend als Ollama-Cloud etikettieren; LM-Studio-Routing separat behandeln.

### F04 — „Lokales Modell wählen“ kann Cloud stehenlassen
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:283
Status: [OFFEN]
`pickLocalModel` setzt zunächst nur den expliziten Cloud-Provider zurück. Ist `effectiveModel` selbst ein Cloud-Tag und die Modellliste leer oder enthält nur Cloud-Tags, findet `models.find` nichts und `effectiveModel` bleibt Cloud (`:283–288`). Der Knopf verspricht also einen vollzogenen Wechsel, obwohl nach dem Klick weiterhin das Cloud-Etikett und derselbe mögliche Datenweg bestehen. Zudem beweist ein nicht mit `-cloud` endender Tag noch kein lokales Modell (F03).
Vorschlag: Bei fehlendem nachweislich lokalen Kandidaten den Modellpicker bzw. die Einrichtung öffnen und „kein lokales Modell verfügbar“ anzeigen. Den Knopf nur als Auswahlhandlung bezeichnen, solange die Lokalität nicht geprüft ist.

### F05 — Bild- und Gedächtnisstatus können nach einem Vault- oder Schlüsselwechsel veralten
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:168
Status: [OFFEN]
`imageGenHasKey()` läuft nur beim Wechsel von `imageModule` (`:169–174`). Wird der Google-Schlüssel bei aktiviertem Modul gespeichert oder gelöscht, bleibt „Bilder möglich“ bis zum Remount alt, während der Main beim Laufstart den aktuellen Key liest (`index.ts:4637–4646`). Das Gedächtnis wird zwar bei Laufphase, Fokus und „Merken“ nachgeladen (`AgentView.tsx:180–188,564–568`), aber ältere asynchrone Antworten werden bei Vault-Wechsel nicht verworfen: `refreshMemory` setzt ungeprüft `setMemory` (`:180–183`). Ein später eintreffender Status des alten Vaults kann „Wird berücksichtigt“ im neuen leeren Vault anzeigen. Die Schwelle `trim().length > MAX_MEMORY_CHARS` stimmt dagegen mit `readAgentMemory` überein (`skillsLoader.ts:182–193,200–209`).
Vorschlag: Bildstatus bei Fokus/Key-Änderung/Laufstart aktualisieren; beide Statusanfragen an Vault bzw. Anfragegeneration binden und alte Antworten ignorieren. Den Bildstatus bei Ladefehler nicht still als „kein Key“ interpretieren.

### F06 — Entfernte Rechner-Hilfe nahm eine entscheidende Einschränkung mit
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:480
Status: [OFFEN]
Die neue Karte listet die im Renderer konfigurierten Rechner-Vorgänge als `Rechner: {verbs}` und sagt „Handelt sofort“/„fragt einmal um Freigabe“ (`:307–309,480–485`). `ComputerArmedHint` erklärte zusätzlich, dass die Freigabe nur eine Möglichkeit und kein Ablaufplan ist, das Modell den tatsächlichen Vorgang entscheidet, der Main unbrauchbare Vorgänge (z.B. Drucken ohne Drucker) erst vor dem Dialog aussortiert und Mail nur als Entwurf entsteht (`ComputerArmedHint.tsx:30–38`). Genau diese Unterscheidung fehlt jetzt. Der Main prüft ausführbare Vorgänge tatsächlich später (`computerControl.ts:119–160`; `index.ts:4721–4745`).
Vorschlag: Die Rechnerzeile mit „Freigegeben: …; was davon geschieht, entscheidet der Agent“ und „tatsächlich ausführbar wird vor der Startfreigabe geprüft“ ergänzen; bei Mail-Vorgang „nur Entwurf, nie gesendet“ sichtbar erhalten.

### F07 — Web- und Cloud-Hinweise verlieren konkrete Unterlagen und Seiteninhalte
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:507
Status: [OFFEN]
Die alte Cloud-Warnung im `ContextAttachmentRow` wird durch `cloudSelected={false}` unterdrückt (`AgentView.tsx:365–374`; `ContextAttachmentRow.tsx:137–139`). Der Ersatz sagt nur „Auftrag und gelesene Unterlagen“, obwohl auch per `note_search` gefundene Auszüge, `note_read`-Notizen, Skill-/Gedächtnistext und bei Web+Cloud abgerufene Seiten zum Modell gelangen (`loop.ts:100–109,150–160,233–247`; `skills.ts:1069–1112`). Das Web-Etikett nennt lediglich die ausgehenden Suchanfragen (`agentCard.ts:55`); der frühere Web-Hinweis unterschied lokale Seitenauswertung von Seiteninhalten an das Cloud-Modell (`translations.ts:1200–1201`). Für Personendaten und Web+Cloud wird der aktuelle Datenweg damit zu eng beschrieben.
Vorschlag: Bei Cloud ausdrücklich „Auftrag, gelesene Anhänge/Vault-Notizen und Werkzeugergebnisse“ nennen; bei Web+Cloud zusätzlich „abgerufene Seiteninhalte an <Cloud-Provider>“. Beim reinen Web-Lauf Suchanbieter und lokale Seitenauswertung getrennt anzeigen.

### F08 — Neue Status-IPC für Bildschlüssel prüft den Aufrufer nicht
Schwere: niedrig
Stelle: app/src/main/index.ts:7273
Status: [OFFEN]
`note-agent-memory-status` prüft `isTrustedSender` und `assertApprovedVault` (`index.ts:4977–4983`); die Gedächtnis-Schwelle selbst ist korrekt. `image-gen-has-key` hat dagegen keinen `event`-Parameter und keinen `isTrustedSender`-Check (`index.ts:7273–7276`). Es gibt nur ein Boolean zurück, keinen Schlüssel, aber ein fremder Renderer könnte damit den Einrichtungszustand abfragen. Dass ältere Bild-IPC ebenfalls ungeschützt sind (`:7261–7269`), ist kein Grund, die neue Schnittstelle so einzuführen.
Vorschlag: `event` entgegennehmen und bei nicht vertrauenswürdigem Sender `false` zurückgeben; den Schlüssel wie bisher ausschließlich im Main lesen.

### F09 — Startknopf und Tastaturhinweis decken nicht alle Sperrgründe ab
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:301
Status: [OFFEN]
Die gewünschte Priorität Auftrag vor Zielordner ist umgesetzt (`:302–305`), ebenso `compose.take()`, Vergleichsfall und ⌘/Ctrl+Enter (`:325,329,278–279`). Aber `canRun` verlangt zusätzlich `vaultPath`, während `buttonLabel` bei vorhandenem Auftrag/Ziel dennoch „Starten“ sagt (`:234–237,301–305`); der deaktivierte Knopf erklärt diesen Fall nicht. Das sichtbare Tastaturkürzel zeigt stets ⌘↩ (`:552–554`), obwohl der Handler auch Ctrl+Enter unterstützt und die App auf Windows/Linux läuft. Die neue Textarea hat nur einen Platzhalter, kein dauerhaftes Label oder `aria-label` (`:320–334`); die gesperrten Befugnis-Buttons erklären den Grund nur über `title`, nicht zuverlässig für Screenreader (`:76–84`).
Vorschlag: Fehlenden Vault/Modellbereitschaft in der Startlogik benennen; „⌘↩“ nur auf macOS, sonst „Ctrl+Enter“. Textarea fest beschriften und Sperrgrund als sichtbaren bzw. per `aria-describedby` verbundenen Text ausgeben.

### F10 — Kartenraster wird bei schmaler Breite zusammengedrückt
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:21479
Status: [OFFEN]
Für `.agent-card-row` bleiben auch unter 640 px drei Spalten `96px minmax(0,1fr) auto` plus 32 px Innenabstand und 24 px Spaltenabstand (`:21479–21487`). Die Ablagezeile hat rechts einen nicht umbrechenden Ordnerknopf (`AgentView.tsx:396–405`; `index.css:21506–21518`). Bei 320 px Fensterbreite und 24 px Außenrand pro Seite (`index.css:21387–21394`) bleiben für den mittleren Inhalt nur wenige Pixel; Fehltext und voller Pfad werden unlesbar. Die Media Query passt allein das Beispielraster an (`:21457–21458`). Die Picker-Rechtsausrichtung (`:21502–21504`) behebt nur den Popup-Überlauf.
Vorschlag: Für schmale Agent-Tab-Breiten Zeilen auf Label über Inhalt/Aktion umbrechen und die Fußzeile ebenfalls stapeln; Zielordner-Picker und Modellliste dabei visuell prüfen.

### F11 — Linux-CI-Reparaturen sind plausibel, Drucktests bleiben umgebungsabhängig
Schwere: niedrig
Stelle: app/src/main/noteAgent/computerControl.test.ts:61
Status: [OFFEN]
Der `navigator`-Guard in `modules.ts:24–28` verhindert den Importfehler in Node ohne Browser-Global. Der zusätzliche `if (!onMac) return` beim Null-Vorgänge-Test passt zur realen Prüf-Reihenfolge in `authorizeComputer` (`computerControl.ts:183–189`) und lässt den Nicht-Mac-Ablehnungstest bestehen (`computerControl.test.ts:75–82`). Gezielter Lauf hier: `npx vitest run src/main/noteAgent/computerControl.test.ts src/renderer/utils/modules.test.ts` — Modultests bestanden, aber zwei bestehende Mac-Drucktests scheiterten, weil `usableComputerVerbs` auf diesem Mac mangels Standarddrucker `print` entfernt (`computerControl.ts:123–155`; Testzeilen `:180–185,336–345`). Das ist keine Folge der beiden Linux-Änderungen, widerlegt aber „Tests grün bis auf shellExecution“ für diese Umgebung.
Vorschlag: Druckerabhängigkeit in diesen Tests injizieren oder die betroffenen Erwartungen an die Verfügbarkeit koppeln; Linux-CI-Skip und Navigator-Guard beibehalten.

### F12 — Vorübergehend fehlende Einrichtung kann Befugnisse ohne neuen Klick reaktivieren
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:265
Status: [OFFEN]
Die wirksamen Zustände speisen Anzeige und `submit` jetzt gemeinsam (`:265–275,292–309`), und der Web-Modulwechsel setzt `webArmed` zurück (`:124–126`). Für Änderungen der Einrichtung gilt das nicht: Ist Web angefragt und `webConfigured` wird vorübergehend falsch, zeigt die Karte `setup`, `webOn` wird falsch, `webArmed` bleibt aber wahr. Sobald die Konfiguration wieder vollständig ist, wird Web ohne erneuten Lauf-Schalter-Klick wieder `on`. Gleiches gilt für `computerArmed`, wenn die letzte Freigabe entfernt und später wieder gesetzt wird (`:264,267,271`). Das widerspricht dem sichtbaren Zwischenzustand „Nicht eingerichtet“ und kann den Datenweg bzw. sofortige Rechnerwirkung unerwartet zurückbringen.
Vorschlag: Bei Verlust von Web-Konfiguration bzw. letztem Rechner-Vorgang die jeweilige Lauf-Freigabe löschen; Wiederherstellung der Einrichtung muss einen neuen bewussten Klick erfordern. Übergänge `on → setup → eingerichtet` gezielt testen.

### F13 — Modul-Deep-Link scheitert bei aktivem Modulfilter
Schwere: mittel
Stelle: app/src/renderer/components/Settings/Settings.tsx:535
Status: [OFFEN]
Der neue `data-settings-anchor` sitzt korrekt auf jeder gerenderten Modulzeile (`:538–546`), und `openPermSetup` springt bei `modOff` zum Modul-Tab (`AgentView.tsx:53–60`). Der Modul-Tab hält aber einen eigenen Filter `all | active | setup`; bei `active` werden ausgeschaltete Module, bei `setup` ebenfalls ausgeschaltete Module aus dem DOM entfernt (`Settings.tsx:526–536,634–649`). Der Anker-Sucher macht bei fehlendem Element still nichts (`Settings.tsx:945–956`). Wenn der Modul-Tab mit einem solchen Filter bereits gemountet ist, führt „Einschalten“ wieder zu keiner sichtbaren Zielzeile. Die Katalog-Suche/-Kategorie betrifft dagegen nur `visibleCatalog` (`Settings.tsx:477–479`) und ist für diese Kernmodule kein zusätzliches Hindernis.
Vorschlag: Beim externen Modul-Anker zuerst `filter='all'` setzen oder ein gezieltes Modul unabhängig vom Filter sichtbar machen; erst nach dem Rendern scrollen. Anker unter `active` und `setup` prüfen.

### F14 — Container-Query versetzt den Zielordner-Picker über den linken Rand
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:21629
Status: [OFFEN]
Unter 560 px wird die Ablagezeile einspaltig und der Picker-Wrapper `justify-self: start` (`:21629–21635`). Die weiterhin geltende Regel `.agent-card .ai-bar-context-picker.agent-card-picker { right: 0; left: auto; }` (`:21502–21504`) richtet den 320-px-Picker nun an einem links stehenden, deutlich schmaleren Knopf rechtsbündig aus. Der größte Teil des Popups ragt links aus der Karte; `.agent-view` ist ein Scroll-Container (`:21382–21385`), sodass das Suchfeld oder Treffer dort abgeschnitten bzw. horizontal verschoben werden können. Die Prüfung bei 470 px zeigt nicht die Grenze bei kleinen Split-Breiten.
Vorschlag: Im einspaltigen Zustand Picker links am Wrapper ausrichten (`left:0; right:auto`) und Breite an die verfügbare Containerbreite deckeln; bei 320–560 px mit offenem Picker visuell prüfen.

### F15 — Modellliste bleibt beim Backendwechsel alt; „lokal wählen“ kann falsches Modell setzen
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:146
Status: [OFFEN]
Der Effekt zum Nachladen der Modelle bricht ab, sobald `models.length > 0` (`:146–160`), auch wenn `ollama.backend` oder `lmStudioPort` wechselt. Der neue `pickLocalModel` sucht dann im alten Array und setzt dessen ersten Namen als `localModel` für das inzwischen andere Backend (`:319–325,302–304`). Auch der Picker zeigt alte Optionen (`:541–549`). Mit einem Modul-Override als `current` wird beim Wegschalten eines Cloud-Providers lediglich der Override übernommen, ohne zu prüfen, ob er im aktiven Backend existiert (`:321–325`). Der Lauf kann so an einem nicht verfügbaren Modell scheitern, obwohl die Karte „lokales Modell wählen“ angeboten hat.
Vorschlag: Modellliste beim Backend-/Portwechsel leeren und neu laden; den gewählten Kandidaten an das aktive Backend binden. Einen Override nur als lokales Ziel verwenden, wenn er in der aktuellen Liste auflösbar ist; andernfalls Modellwahl verlangen.

### F16 — Statusabfragen verhindern alte Antworten, aber zeigen alten Status während Vault-/Key-Wechsel
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:193
Status: [OFFEN]
Die Anfragezähler verhindern verspätete Antworten alter Anfragen (`:180–202`). Bei Wechsel von einem gefüllten zu einem leeren Vault bleibt `memory` jedoch zunächst auf dem alten Zustand; `refreshMemory` setzt bei vorhandenem `vaultPath` nicht sofort zurück (`:195–203`). Bis zur neuen Antwort — bei IPC-Fehler unbegrenzt — steht „Wird berücksichtigt“ samt „ansehen“ für den falschen Vault; `openMemoryNote` nimmt dafür bereits den neuen Vault-Pfad (`:210–225`). Beim Google-Key bleiben nach fehlgeschlagener Aktualisierung ebenso `imageKey=true` und die Aussage „Bilder möglich“, obwohl der Zustand laut Kommentar unbekannt ist (`:181–189,577–581`). Fokus/Phasenwechsel decken zudem eine Schlüsseländerung in den Einstellungen derselben fokussierten App nicht zwingend ab.
Vorschlag: Status an Vault-/Key-Identität binden und während der Prüfung „wird geprüft“ zeigen; bei Fehler „Status unbekannt“ statt alte Zusage. Für Schlüsseländerungen ein explizites Änderungsereignis oder Aktualisierung beim Zurückkehren aus den Einstellungen verwenden.

### F17 — Sperrgrund unterschlägt Rechner bei Shell+Rechner
Schwere: niedrig
Stelle: app/src/renderer/components/Agent/AgentView.tsx:273
Status: [OFFEN]
Wenn Shell und Rechner zusammen aktiv sind, ist Web gesperrt. `webLockedBy` wählt dann immer nur „Shell“ (`:273`); der sichtbare und per `aria-describedby` verknüpfte Grund lautet „Shell ist an – Web ist dann gesperrt“ (`:276–281,489–521`). Das ist nicht falsch, aber unvollständig: Nach Ausschalten der Shell bleibt Web wegen Rechner weiter gesperrt, was für Tastatur-/Screenreader-Nutzer wie ein wirkungsloser Schalter wirken kann. In Gegenrichtung (Web an) listet der gemeinsame Grund beide gesperrten Schalter korrekt.
Vorschlag: Beide aktiven Gegenspieler im Web-Sperrgrund nennen oder den Grund aus `shellOn` und `computerOn` dynamisch zusammensetzen.

### F18 — Bildstatus bleibt während erneuter Schlüsselprüfung positiv
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:190
Status: [OFFEN]
Nachprüfung Runde 3 zu F16: Der Fehlerpfad und der Anfragezähler tragen (`:194–196`), ebenso das `settingsClosed`-Ereignis beim Schließen des Settings-Dialogs (`App.tsx:1854–1864`). `refreshImageKey` setzt vor der neuen IPC-Antwort aber keinen Prüfzustand. Wird ein vorhandener Google-Schlüssel in den Einstellungen gelöscht, zeigt die Karte nach dem Schließen weiter „Bilder möglich“ (`AgentView.tsx:609–613`), bis die Antwort eintrifft. Bei hängender Anfrage kann das unbegrenzt dauern. Beim Gedächtnis wird der Vault-Wechsel erst im passiven Effekt `:216` auf „wird geprüft“ gesetzt; der erste Render mit neuem `vaultPath` kann noch den alten Status samt „ansehen“ zeigen (`:618–630`), auch wenn der Klick durch die Vault-Prüfung in `openMemoryNote` abgefangen wird (`:227–230`). Der lokale `MemoryState`-Typ ist dagegen gültig und kein eigenes Problem.
Vorschlag: Bildstatus beim Start jeder Abfrage auf „wird geprüft“/„Stand unbekannt“ setzen. Gedächtnis-Anzeige direkt aus `memory.vault === vaultPath` ableiten, damit auch vor dem Effekt kein fremder Vault-Status erscheint.

### F19 — Nach fehlgeschlagener Modellabfrage gibt es keinen erneuten Ladeversuch
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:153
Status: [OFFEN]
Nachprüfung Runde 3 zu F15: Backend-/Portwechsel leert Liste und Tab-Auswahl; `pickLocalModel` prüft auch den Modul-Override gegen die Liste (`:155–163,341–350`). Schlägt `ollamaModels`/`lmstudioModels` jedoch fehl oder liefert keinen Array, bleibt `loadedSource` alt und die Liste leer (`:163–166`). Da sich danach keine Effekt-Abhängigkeit ändert, erfolgt kein Retry beim nächsten Fokus oder Öffnen der Modellwahl. Die Karte kann dauerhaft „Kein Modell ohne Cloud-Kennung gefunden“ melden, obwohl nur die Abfrage ausgefallen ist (`:344–348,597`).
Vorschlag: Ladefehler separat von „keine Modelle vorhanden“ darstellen und eine erneute Abfrage anbieten bzw. bei Fokus/erneutem Öffnen auslösen; Modellwahl bis zur Antwort als ungeprüft kennzeichnen.

### F20 — Verwaltungsbeispiel verspricht „alle Tabellen“ trotz Auswahl und Grenzen
Schwere: mittel
Stelle: app/src/renderer/utils/i18n/agentCard.ts:15
Status: [OFFEN]
Nachprüfung der neuen Beispiele: `collect_table` kann gewünschte Spalten einschließlich automatischer `Quelldatei` zu einer Excel-Datei zusammenführen (`skills.ts:394–419,433–459,613–650`). Das Beispiel ist damit für gleichartige Excel-/CSV-Tabellen möglich. Die Spaltennamen muss das Modell aber vorgeben; fehlende Spalten werden leer (`shared/tableCollect.ts:300–345`). Ohne `sheet` wird nur das erste Tabellenblatt genommen (`shared/tableCollect.ts:350–355`), nur direkte `.xlsx`/`.csv`/`.txt`-Dateien kommen infrage und bei 300 Dateien oder 20.000 Zeilen wird gekappt (`contextFiles.ts:775–800,852–885`). „Alle Tabellen“ ist deshalb selbst bei einem angehängten Ordner keine verlässliche Zusage. Die Problemdateien stehen immerhin im zweiten Excel-Blatt (`skills.ts:640–650`).
Vorschlag: „Führe gleichartig aufgebaute Excel-/CSV-Tabellen im angehängten Ordner zusammen. Prüfe die Spalten Name, Datum und Betrag; zeige nicht übernommene Dateien/Zeilen an.“ Als Unterlagen deutlich „Tabellen mit passenden Spalten auf dem ersten Blatt“ nennen.

### F21 — Angebotsvergleich setzt lesbaren Text und kleine Datenmenge voraus
Schwere: mittel
Stelle: app/src/renderer/utils/i18n/agentCard.ts:19
Status: [OFFEN]
PDF/Word-Anhänge sind über `read_attachment` oder im Ordner über `read_context_file` lesbar und `write_xlsx(rows)` kann die Vergleichstabelle erzeugen (`skills.ts:270–293,326–345,613–663`). Die Extraktion ist aber begrenzt: PDF höchstens 50 Seiten, Einzeldatei höchstens 15.000 Zeichen, Ordner-Massenlesen höchstens 20 Dateien/30.000 Zeichen (`contextFiles.ts:59–65,513–535,663–700`); Scan-PDF ohne Textebene wird abgewiesen (`contextFiles.ts:531–534`). Es gibt keinen deterministischen Extraktor für Preis/Lieferzeit/Gewährleistung: Das Modell muss jedes Angebot lesen, deuten und jede `rows`-Zeile selbst liefern. Bei vielen oder langen Angeboten kann die Tabelle unvollständig sein, ohne dass `write_xlsx(rows)` dies prüft. „Lass das Feld leer und vermerke es“ benennt zudem keine Spalte für den Vermerk.
Vorschlag: Beispiel auf „wenige, textlesbare Angebote“ begrenzen, eine Spalte „Fehlende Angaben/Prüfbedarf“ verlangen und den Nutzer auffordern, jede Angebotszeile vor Übernahme zu prüfen.

### F22 — Wissensbeispiel verwechselt Suchtreffer mit „alles“ und Links mit Belegen
Schwere: hoch
Stelle: app/src/renderer/utils/i18n/agentCard.ts:23
Status: [OFFEN]
`note_search` liefert pro Anfrage nur die besten höchstens 20 Treffer mit insgesamt 6.000 Zeichen Auszug (`telegram/agent/tools/notes.ts:46–76`); `note_read` liest Markdown-Notizen nur bis 8.000 Zeichen (`:81–102`). Der Agent hat außerhalb eines Ordner-Laufs höchstens 12 Iterationen (`noteAgent/loop.ts:16–19,256–263`). Er kann relevante Notizen suchen, lesen und in einer Notiz nennen, aber „alles zum Thema“ im ganzen Vault nicht verlässlich erfassen. `write_note` prüft weder die Vollständigkeit noch die inhaltliche Zuordnung von gesetzten Links; „verlinke die Notizen, die du dafür gelesen hast“ darf nicht als Beleg jeder Aussage verstanden werden (`skills.ts:991–1027`).
Vorschlag: „Suche relevante Notizen … fasse zusammen, was du gefunden und gelesen hast. Nenne die Pfade dieser Notizen; kennzeichne offene Fragen.“ Eine Leseliste ausdrücklich nicht als Aussagebeleg ausgeben.

### F23 — Protokollbeispiel hat keinen gesicherten Datums- und Aufgabenfilter
Schwere: mittel
Stelle: app/src/renderer/utils/i18n/agentCard.ts:27
Status: [OFFEN]
Ein Ordner mit `.md`-Protokollen ist als Anhang lesbar (`loop.ts:197–205`; `skills.ts:326–345`). Das Manifest enthält Dateinamen/Metadaten, aber keinen geprüften Sitzungszeitraum (`contextFiles.ts:331–365`); `read_context_file` liest Text abschnittsweise und höchstens 15.000 Zeichen pro Aufruf (`contextFiles.ts:478–495`). Ob ein Protokoll zwischen dem 1. und 30. September liegt und ob eine Aufgabe noch offen ist, entscheidet das Modell aus dem gelesenen Text; es gibt dafür keinen deterministischen Filter. Bei vielen oder langen Protokollen begrenzt zudem das 20-Iterationen-Budget den Durchlauf (`loop.ts:21–24,256`). Am heutigen 23. September 2026 liegt das Ende des Beispiels sogar noch in der Zukunft. Damit kann „Erledigtes weglassen“ still falsche Auslassungen erzeugen.
Vorschlag: Zeitraum bis zu einem bereits erreichten Datum wählen; „Prüfe die angehängten Protokolle und liste ausdrücklich als offen erkennbare Aufgaben mit Name/Frist, fehlende Angaben als offen markieren“ formulieren. Bei vielen Dateien Vollständigkeitsprüfung der gelesenen Protokolle verlangen.

### F24 — Erfolgreicher Modell-Retry lässt die Fehlmeldung stehen
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:369
Status: [OFFEN]
Nachprüfung Runde 4 zu F19: Der Retry-Effekt hat keine eigene Endlosschleife; `modelsRetry` steigt nur durch Fokus oder Klick (`:177–182,369`), und ein Erfolg setzt `modelsFailed` zurück (`:168`). Klickt der Nutzer nach einem Ladefehler bei aktiver Cloud-Route auf „Lokales Modell wählen“, setzt `pickLocalModel` jedoch `noLocalModel='notLoaded'` und stößt den Retry an (`:369`). Nach erfolgreichem Laden bleibt dieser Hinweis unter dem Cloud-Knopf stehen (`:620`), denn er wird nur beim Verlassen der Cloud-Route gelöscht (`:361`). Die Modellliste ist dann geladen, während die Karte weiter „Die Modellliste konnte nicht geladen werden“ sagt. Außerdem bleibt `modelsFailed` beim Backendwechsel bis zur Antwort des neuen Backends zunächst als Fehler des neuen Backends sichtbar (`:154–176,602`).
Vorschlag: `noLocalModel` nach erfolgreicher Modellabfrage und bei Quellenwechsel löschen; den Fehlerzustand an `modelsSource` binden oder beim Start einer neuen Quellenabfrage auf „lädt“ setzen.

### F25 — Fehlender Anhang sperrt Beispiele mit Pflicht-Unterlagen nicht
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:438
Status: [OFFEN]
Nachprüfung Runde 4 zu F20–F23: Die Texte für Beschaffung und Wissensrecherche sind mit den heutigen Werkzeugen in der beschriebenen begrenzten Form machbar; bei Verwaltung bleiben passende Spalten auf dem ersten Blatt Voraussetzung (`shared/tableCollect.ts:300–355`). Das neue Schulbeispiel verlangt ausdrücklich angehängtes Material als Grundlage (`agentCard.ts:27–29`), aber ein Beispielklick setzt nur den Auftragstext (`AgentView.tsx:427–445`), und `canRun` prüft keinen Anhang (`:294–296`). Dasselbe gilt für Verwaltung und Beschaffung. Der Agent-Prompt erlaubt bei fehlender Datei nur den Hinweis, sie als Kontext anzuhängen (`noteAgent/loop.ts:150–154`); er kann den versprochenen quellengestützten Auftrag so nicht ausführen. Die Unterlagen-Zeile zeigt zwar „Noch nichts angehängt“ (`AgentView.tsx:452–467`), der Startknopf bleibt dennoch bereit.
Vorschlag: Bei diesen Beispielaufträgen den fehlenden Anhang vor Start als konkrete Lücke anzeigen oder den Beispieltext konditional formulieren („Wenn Material angehängt ist …“). Für das Arbeitsblatt ohne Anhang einen eigenständigen Auftrag ohne „als Grundlage“ anbieten.

### F26 — Arbeitsblatt ohne Vorlage gilt nur ohne passende Skill-Anleitung
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:158
Status: [OFFEN]
`write_docx(file_name, markdown)` kann einen Einstiegstext, fünf Aufgaben und einen Lösungsteil in **einer** Word-Datei erzeugen (`skills.ts:676–709,756–766`; `office/officeService.ts:252–313`). Claudes pauschaler Nachtrag „Erzeugung über write_docx ohne Vorlage“ übersieht die bindende Reihenfolge: Passt eine Vault-Skill, muss der Agent zuerst `use_skill` laden und deren Anleitung befolgen (`loop.ts:95–101,156–162`). Schreibt die Skill eine Vorlage vor, verlangt derselbe Prompt `write_docx` **mit** `template`; bei einer Formular-Skill kann sogar `fill_docx_form` der richtige Weg sein (`loop.ts:162,207–212`). Der Skill-Body ist zudem bei 12.000 Zeichen gekappt (`skillsLoader.ts:103–113`), sodass nicht jede Anweisung sicher beim Modell ankommt. Das Beispiel ist als einfache Word-Erstellung ohne passende Skill lösbar, aber kein verlässliches Versprechen einer vorlagenlosen Umsetzung in jedem Vault.
Vorschlag: Den Nachtrag auf „ohne passende Skill/Vorlagenvorgabe über write_docx ohne Vorlage“ einschränken; bei aktiver passender Skill deren Anforderungen als maßgeblich behandeln und Kürzung sichtbar machen.

### F27 — Zweites DOCX wird nicht technisch abgelehnt; Seitenwechsel fehlt
Schwere: niedrig
Stelle: app/src/main/noteAgent/runRegistry.ts:235
Status: [OFFEN]
Claudes Begründung zum Schulbeispiel („ein zweites DOCX würde abgelehnt“) ist als Codebehauptung falsch: `registerResult` fügt jedes während des Laufs erzeugte Ergebnis hinzu und prüft weder Format noch Anzahl (`:235–242`); `write_docx` ruft es für die erzeugte Datei auf (`skills.ts:756–772`). „Jedes Format nur einmal“ ist eine **Prompt-Regel** (`loop.ts:162`), keine deterministische Sperre. Der gewählte „Lösungsteil am Ende“ passt zu einer Datei und ist ehrlich, garantiert aber keine eigene Lösungsseite: der Markdown→DOCX-Konverter bildet Überschriften und Absätze ab, kennt in diesem Pfad keinen Seitenumbruch (`office/officeService.ts:252–345`).
Vorschlag: In der Antwort von einer Agent-Anweisung statt technischer Ablehnung sprechen. Den Beispieltext bei „Lösungsteil am Ende“ belassen; falls ein abtrennbarer Lösungsteil gewünscht ist, braucht der DOCX-Pfad eine explizite Seitenwechsel-Funktion.

### F28 — Schließen während der Schlüssel-Löschung kann Bildstatus dauerhaft veralten lassen
Schwere: mittel
Stelle: app/src/renderer/components/Settings/ImageGenerationSection.tsx:48
Status: [OFFEN]
Nachprüfung Runde 4 zu F18: `settingsClosed` setzt den Bildstatus korrekt auf „wird geprüft“, **wenn** die Schlüsseländerung abgeschlossen ist (`AgentView.tsx:203–213,238–247`). `remove` wartet jedoch asynchron auf `imageGenDeleteKey` und setzt währenddessen kein `busy` (`ImageGenerationSection.tsx:48–55`); der Settings-Dialog kann geschlossen werden, bevor die Löschung im Main fertig ist. Dann kann `imageGenHasKey` noch den alten Schlüssel sehen (`index.ts:7273–7281`) und „Bilder möglich“ zurückmelden. Nach dem späteren Löschen gibt es kein weiteres Schlüsseländerungsereignis; bis Fokuswechsel oder Laufphasenwechsel bleibt die Aussage falsch. Beim Speichern besteht derselbe Wettlauf, obwohl `busy` das SecretField sperrt (`ImageGenerationSection.tsx:32–45`), denn es sperrt nicht das Schließen des Dialogs.
Vorschlag: Nach erfolgreichem Speichern/Löschen ein Änderungsereignis auslösen und den Agent-Status darauf neu prüfen, oder den Settings-Dialog bis zum Abschluss der Schlüsseloperation am Schließen hindern. Den Fall „Löschen klicken → sofort schließen“ gezielt prüfen.

### F29 — Arbeitsblatt-Beispiel scheitert mit der vorhandenen Skill ohne Web
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:45
Status: [OFFEN]
Nachprüfung Runde 5 zu F26: Das neutrale Ergebnis-Etikett „Arbeitsblatt zum Drucken“ trifft HTML/PDF wie DOCX besser (`agentCard.ts:27–29`). Die Behauptung im Code-Kommentar, **jedes** Beispiel sei ohne Web lösbar (`AgentView.tsx:44–52`), ist für den Vault mit aktivierter „Arbeitsblatt“-Skill falsch. Der Agent lädt passende Skills zuerst (`noteAgent/loop.ts:95–101,156–162`; `index.ts:4606–4607`). Diese Skill verlangt `web_search` und `web_fetch` und verbietet bei fehlenden Werkzeugen ausdrücklich jedes Arbeitsblatt und jeden Schreibaufruf (`resources/starter-skills/arbeitsblatt/SKILL.md:14–22`). Beide Werkzeuge gibt es nur bei aktiviertem Web-Lauf (`noteAgent/loop.ts:225–229`); die Karte setzt Web für das Beispiel nicht selbst an (`AgentView.tsx:360`). Da Web standardmäßig aus ist, ist nach Klick auf das Beispiel und sonst vollständig ausgefüllter Karte „Starten“ möglich, aber der Skill-konforme Lauf liefert nur die Aufforderung, den Globus einzuschalten. Ohne Bundesland darf die Skill zwar schreiben, muss den fehlenden Lehrplanbezug nennen (`SKILL.md:47–62`); Klasse 7 und Photosynthese sind also keine Platzhalter, die das Web-Erfordernis ersetzen.
Vorschlag: Beim Arbeitsblatt-Beispiel sichtbar „Webrecherche erforderlich, wenn die Arbeitsblatt-Skill aktiv ist“ anzeigen und den Startzustand darauf abstimmen; alternativ ein Schulbeispiel wählen, das nicht unter diese Skill fällt. Die allgemeine „ohne Web“-Zusage entfernen oder konditionieren.

### F30 — `needsDocs` prüft Anzahl, aber nicht die benötigte Unterlagenart
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:305
Status: [OFFEN]
Nachprüfung Runde 5 zu F25: Der fehlende Anhang wird bei unverändertem Verwaltungs- oder Beschaffungsbeispiel jetzt sichtbar und sperrt den Start (`:305–306,395–401,469–486`). Bereits **ein beliebiger** Anhang hebt die Sperre auf. Für das Verwaltungsbeispiel wird `collect_table` aber nur bei einem Ordner-Anhang angeboten (`noteAgent/loop.ts:197–205`), und es verarbeitet darin nur direkte Tabellen-Dateien (`contextFiles.ts:775–783`). Für den Vergleich werden mehrere lesbare Angebote benötigt (`agentCard.ts:18–20`), während die Karte nach einem einzelnen oder fachfremden Anhang schon „Starten“ zeigt. Ein Attach-Fehler ohne erfolgreichen Anhang bleibt dagegen korrekt gesperrt; der Sprachwechsel hebt die Sperre nicht auf, weil gespeicherter Beispieltext und Auftragstext gleich bleiben.
Vorschlag: Für Beispiel 1 einen Ordner mit passenden Tabellen, für Beispiel 2 mindestens zwei unterstützte Angebotsdateien als Voraussetzung prüfen oder den Knopf nur als allgemeinen Start mit sichtbarer Unterlagenwarnung freigeben. `needsDocs` nicht als vollständige Erfüllung der Beispiel-Voraussetzungen darstellen.

### F31 — Tab-Wechsel verwirft Auftrag und Beispielbindung
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:120
Status: [OFFEN]
`instruction` und `pickedExample` liegen nur im lokalen React-State (`:120–123`). `App.tsx:1580–1585` rendert `AgentView` ausschließlich bei aktivem Agent-Tab; der Wechsel auf eine Notiz unmountet die Komponente, Rückkehr initialisiert beide Werte neu. Der Store bewahrt Anhänge, Zielordner und Laufergebnis dagegen pro Tab (`noteAgentStore.ts:71–82`; `tabStore.ts:328–332`). So verschwinden ein noch nicht gestarteter Beispiel- oder Freitextauftrag und seine Unterlagen-Voraussetzung bei einem normalen Tab-Wechsel, während seine Anhänge stehen bleiben. Nach einem Lauf bleibt die Beispielbindung dagegen während derselben Mount-Phase bestehen und kann bei erneut fehlenden Anhängen wieder sperren; das ist kein eigener Defekt.
Vorschlag: Auftragsentwurf und Beispielkennung im Agent-Scope speichern oder `AgentView` beim bloßen Tab-Wechsel gemountet halten; Schließen des Agent-Tabs soll den Scope weiterhin löschen. Wechsel Agent → Notiz → Agent mit ungesendetem Beispiel prüfen.

### F32 — Arbeitsblatt-Webpflicht gilt auch ohne Arbeitsblatt-Skill
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:52
Status: [OFFEN]
Nachprüfung Runde 6 zu F29: Im Vault mit aktivierter „Arbeitsblatt“-Skill trägt die neue Web-Sperre: Die Skill bricht ohne `web_search`/`web_fetch` ab (`resources/starter-skills/arbeitsblatt/SKILL.md:14–22`), und die Karte lässt bei unverändertem Beispieltext nur mit wirksamem `webOn` starten (`AgentView.tsx:337–343`). Die Karte prüft aber nicht, ob diese Skill im aktuellen Vault überhaupt vorhanden und aktiviert ist. `need:'web'` ist für das Beispiel fest eingebaut (`AgentView.tsx:48–52`), während der Main aktivierte Skills pro Vault erst beim Laufstart ermittelt (`index.ts:4606–4607`). In einem Vault ohne diese Skill könnte das Beispiel als einfaches Arbeitsblatt über `write_docx` ohne Web entstehen (`noteAgent/skills.ts:676–709,756–766`); die Karte sperrt es dennoch und behauptet „braucht Web“ (`agentCard.ts:30,92–93`). Nach Deaktivieren der Skill bleibt die Sperre ebenfalls bestehen.
Vorschlag: Die Webpflicht an die tatsächlich aktivierte Arbeitsblatt-Skill binden oder das Beispiel ausdrücklich als Recherche-Arbeitsblatt mit Webquelle formulieren, sodass die Pflicht auch ohne Skill aus dem Auftrag folgt.

### F33 — „Web einschalten“ benennt bei Modul aus oder fehlender Einrichtung den falschen Schritt
Schwere: niedrig
Stelle: app/src/renderer/components/Agent/AgentView.tsx:409
Status: [OFFEN]
Für das Arbeitsblatt setzt jedes `!webOn` den Startknopf auf „Web einschalten“ (`:342,405–411`), obwohl `webState` bei deaktiviertem Modul `modOff` und bei fehlendem Suchanbieter/Schlüssel `setup` ist (`:318–322`). In diesen Zuständen gibt es noch keinen einschaltbaren Web-Schalter: Die tatsächliche Aktion liegt beim separaten `PermToggle` „Einschalten“ im Modul-Tab bzw. „Einrichten“ im KI-Tab (`:561–573`; `:59–65`). Der Startknopf ist deaktiviert und führt selbst nirgendwohin. Der Hinweis „Schalte Web ein“ (`agentCard.ts:92`) erklärt diese beiden Fälle ebenfalls nicht.
Vorschlag: Den ersten fehlenden Web-Schritt nach `webState` benennen („Web-Modul einschalten“ / „Web einrichten“ / „Web für diesen Lauf einschalten“) und den zugehörigen Link oder Schalter eindeutig hervorheben.

### F34 — Erhaltener Entwurf verliert die Formulierungszeit beim Tab-Wechsel
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:300
Status: [OFFEN]
Nachprüfung Runde 6 zu F31: `draft` und `pickedExample` bleiben nun im Tab-Scope erhalten (`noteAgentStore.ts:83–93,332–336`), `disposeScope` entfernt beides beim Schließen (`:448–459`), und die Macher-Leiste nutzt andere Scope-IDs und ihren eigenen Eingabestatus (`MarkdownEditor.tsx:1080–1087`; `AiActionBar.tsx:103–117`). `compose` bleibt jedoch ein lokaler Hook (`AgentView.tsx:300`): Er startet beim Beispielklick oder Tippen (`:435–436,459–462`), während der Entwurf überlebt. Der Wechsel auf einen anderen Tab unmountet `AgentView` (`App.tsx:1580–1585`); `useComposeMeasurement` hat keine Unmount-Bereinigung und hält den alten `ActiveTimer` weiter in der globalen `live`-Menge (`activeTimeTracker.ts:13,59–78,86–99`). Beim Zurückkehren hat der neue Hook keinen Timer: Start ohne weiteren Tastendruck liefert `instructionMs=0`, mit neuem Tippen zählt nur die Zeit nach Rückkehr (`AgentView.tsx:372`). Der alte Timer bleibt zudem bis zum Fensterende registriert.
Vorschlag: Die Messung wie den Entwurf pro Agent-Scope erhalten oder beim Unmount sauber beenden und den Zwischenstand mitnehmen; `useComposeMeasurement` braucht eine Cleanup-Regel. Agent → anderer Tab → Agent → Start mit und ohne weiteres Tippen prüfen.

### F35 — Neuer Start ersetzt noch offene Ergebnis-Karten im Agent-Tab
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:304
Status: [OFFEN]
Abschließender Gesamtblick: `busy` gilt nur für `running`/`starting`, nicht für `review` (`:304`). Nach einem erfolgreichen Lauf bleiben Entwurf und Zielordner erhalten; der Startknopf heißt wieder „Starten“ und ist aktiv (`:305–343,405–411,699–710`). Ein Klick startet einen neuen Main-Lauf, weil nur ein **laufender** Vorgänger blockiert wird (`main/noteAgent/runRegistry.ts:145–165`). Der Renderer ersetzt dann `scope.run` vollständig durch den neuen Zustand (`noteAgentStore.ts:338–380`), obwohl die alten Ergebnis-Karten noch `pending` sein können. Der Main behält diese alten Ergebnisse zwar vorerst, aber ihre `runId`/`resultId` sind aus dem Scope verschwunden; die Karte bietet kein Übernehmen oder Verwerfen mehr (`noteAgentStore.ts:390–436`). Das kann erzeugte Arbeit aus der sichtbaren Oberfläche verlieren, gerade wenn der Entwurf für einen zweiten Durchlauf erhalten bleibt.
Vorschlag: Start bei offenen Review-Karten sperren oder diese vor einem neuen Lauf ausdrücklich entscheiden/als separate Laufhistorie sichtbar halten. Das ist vor einem Commit von Paket A zu beheben und mit „Ergebnis erzeugen → ohne Übernahme erneut Starten“ zu prüfen.

### F36 — Beschaffungsbeispiel akzeptiert einen Ordner ohne zwei lesbare Angebote
Schwere: niedrig
Stelle: app/src/renderer/components/Agent/AgentView.tsx:338
Status: [OFFEN]
Nachprüfung Runde 6 zu F30: Die Formprüfung ist gegenüber „irgendein Anhang“ besser: Verwaltung braucht jetzt einen Ordner; Beschaffung braucht zwei Einzeldateien **oder irgendeinen Ordner** (`:338–340`). Ein Ordner mit nur einem Angebot oder mit fachfremden Dateien erfüllt damit `files2`, ebenso zwei `.xlsx`-Dateien, obwohl die Beispielunterlagen „wenige Angebote als PDF oder Word, kein Scan“ sagen (`agentCard.ts:19–20`). `read_context_file` kann zwar Ordnerdateien lesen, aber die Karte hat weder zwei Angebote noch das Format geprüft (`noteAgent/loop.ts:197–205`). Claudes „keine Inhaltsprüfung“ erklärt semantische Unsicherheit, nicht diese verfügbaren Metadaten über Typ und Zahl.
Vorschlag: Einzelanhänge mindestens nach PDF/DOCX zählen; bei Ordnern die Voraussetzung nur als ungeprüft kennzeichnen oder eine leichte Manifest-Prüfung vor „bereit“ ausführen.

## Claude-Antwort

Runde 1 nachgeprüft (u.a. `Settings.tsx:1781` KI-Karten nur bei aktivem Modul; `computerControl.test.ts` bei
Claude 38/38 grün — F11-Drucktests scheitern nur ohne Standarddrucker). Nutzerfreigabe: F01–F10 umsetzen, F11 lassen.

### F01 — [ADRESSIERT]
`openPermSetup`: Modul aus → `{tab:'modules', anchor:'module-<id>'}`, nicht eingerichtet → KI-Anker. Modulzeilen
tragen dafür `data-settings-anchor="module-<id>"` (`Settings.tsx`, `module-row`). In der Dev-App geprüft:
Anker `module-agent-shell` gefunden, gescrollt, aufgeblitzt.

### F02 — [ADRESSIERT]
Wirksamer Zustand `webOn/shellOn/computerOn` (angefragt UND Modul UND Einrichtung/Vorgänge UND Plattform) speist
Schalter, Etiketten, Sofortwirkung, „alle aus“ und `submit`. `webArmed` wird wie Shell/Rechner bei Tab-, Vault-
und Modulwechsel zurückgesetzt.

### F03 — [ADRESSIERT]
Etikett „Über {Ollama|LM Studio} · Ausführungsort nicht geprüft“; Cloud-Suffix nur beim Ollama-Backend
(„Cloud über Ollama (Cloud)“), bei LM Studio nie. Laufzeit-Hinweis ohne „auf diesem Rechner“.

### F04 — [ADRESSIERT]
`pickLocalModel` wechselt nur, wenn ein Modell ohne Cloud-Kennung existiert; sonst Hinweis `agentCard.noLocalModel`.

### F05 — [ADRESSIERT]
Bild- und Gedächtnisstatus mit Anfragezähler (nur jüngste Antwort zählt), Refresh bei Laufphase und Fensterfokus;
Ladefehler beim Bildstatus lässt den letzten Stand stehen statt „kein Schlüssel“.

### F06 — [ADRESSIERT]
Sofortwirkungs-Box: „Rechner, freigegeben: …“, „Ob davon etwas geschieht, entscheidet der Agent … prüft die App
beim Start“, bei Mail-Entwurf „nur sichtbarer Entwurf, nie gesendet“.

### F07 — [ADRESSIERT]
Cloud-Hinweis nennt Auftrag, gelesene Anhänge, selbst gefundene Vault-Notizen und Werkzeugergebnisse; bei Web+Cloud
zusätzlich Seiteninhalte. Web-Etikett: „Suche und Seitenabrufe verlassen den Rechner“.

### F08 — [ADRESSIERT]
`image-gen-has-key` prüft `isTrustedSender`, sonst `false`.

### F09 — [ADRESSIERT]
Knopf „Kein Vault geöffnet“ vor Auftrag/Ziel; Kürzel `⌘↩` nur auf macOS, sonst `Ctrl+Enter`; Textarea mit
`aria-label`; Sperrgrund als sichtbarer Text, per `aria-describedby` an gesperrte Schalter gebunden.

### F10 — [ADRESSIERT]
Container-Query auf `.agent-view-inner` (≤ 560 px): Zeilen einspaltig, Beispiele einspaltig, Fußzeile gestapelt.
In der Dev-App bei 470 px Breite per Screenshot geprüft.

### F11 — [OFFEN, bewusst]
Linux-Reparaturen bleiben; Druckerabhängigkeit der Mac-Drucktests als eigene kleine Aufgabe.

Nachweis: typecheck, build grün; Tests 2456/2456 grün (1 übersprungen). Nicht gesehen: Cloud-Zustand, Bilder,
Gedächtnis gefüllt/gekürzt, Web an/gesperrt mit Grund, Windows.

### Runde 2 — Antworten (Nutzerfreigabe: F12–F17 umsetzen)

### F12 — [ADRESSIERT]
Anfrage verfällt mit der Einrichtung: `webArmed` → false, sobald die Web-Konfiguration geladen UND unvollständig
ist; `computerArmed` → false bei null freigegebenen Vorgängen. Rückkehr der Einrichtung braucht einen neuen Klick.

### F13 — [ADRESSIERT]
`ModulesTab` bekommt `focusAnchor` (= `initialAnchor` bei offenem Dialog) und setzt bei `module-*` den Filter auf
„alle“. Dev-App: Filter „Aktiv“ gewählt (Bildmodul ausgeblendet), Dialog geschlossen, Sprung zu
`module-image-generation` → Filter „Alle“, Zeile gefunden, aufgeblitzt. Grenze: derselbe Anker ein zweites Mal bei
durchgehend offenem Dialog löst nicht neu aus — aus dem Agent-Tab nicht erreichbar, der Dialog liegt darüber.

### F14 — [ADRESSIERT]
Im einspaltigen Zustand Picker linksbündig, `max-width: calc(100cqw - 32px)`. Dev-App bei 470 und 340 px
gemessen: Picker liegt vollständig innerhalb der Karte.

### F15 — [ADRESSIERT]
Modellliste an `backend:port` gebunden; Wechsel leert Liste und Tab-Auswahl und lädt neu. `pickLocalModel`
übernimmt nur Modelle aus der aktuellen Liste (auch den Override nur, wenn er dort vorkommt).

### F16 — [ADRESSIERT]
Gedächtnis: Vault-Wechsel zeigt sofort „wird geprüft …“, Fehler „Stand unbekannt“, „ansehen“ nur bei
gefüllt/gekürzt und passendem Vault. Bilder: dreiwertig ja/nein/unbekannt, bei unbekannt eigene Zeile ohne Zusage.
Neu-Abfrage zusätzlich bei `mindgraph:settingsClosed` (App.tsx sendet es beim Schließen der Einstellungen).

### F17 — [ADRESSIERT]
Web-Sperrgrund nennt alle aktiven Gegenspieler („Shell / Rechner ist an – Web ist dann gesperrt“).

Nachweis: typecheck, build grün; Tests 2456/2456 (1 übersprungen).

### Runde 3 — neue Beispiele (Nutzerwunsch: weniger schullastig)
Vier Beispiele, je eines pro Arbeitsfeld, mit Kategorie-Etikett über dem Text (`agentCard.ex1Cat`…`ex4Cat`,
`AgentView.tsx` `EXAMPLES`, CSS `.agent-card-example-cat`):
1. Verwaltung — „Führe alle Tabellen im angehängten Ordner zu einer Excel-Liste zusammen. Behalte die Spalten Name,
   Datum und Betrag und vermerke, aus welcher Datei jede Zeile stammt.“ · Ordner mit gleichartigen Tabellen · Excel-Liste
2. Beschaffung — „Vergleiche die angehängten Angebote in einer Excel-Tabelle: Anbieter, Preis netto, Lieferzeit,
   Gewährleistung. Fehlt eine Angabe, lass das Feld leer und vermerke es.“ · Angebote als PDF oder Word · Vergleichstabelle
3. Wissensrecherche — „Suche in meinen Notizen alles zum Thema Datenschutz bei Cloud-Diensten und fasse den Stand in
   einer Notiz zusammen. Verlinke die Notizen, die du dafür gelesen hast.“ · keine – der Agent sucht im Vault · Notiz
4. Schule — „Fasse die Protokolle der Fachkonferenz vom 1. bis 30. September 2026 zu einer Notiz zusammen: offene
   Aufgaben mit Name und Frist, Erledigtes weglassen.“ · Ordner mit Protokoll-Notizen · Notiz
Absicht: jedes Beispiel ohne Web und Shell mit den heutigen Werkzeugen lösbar (collect_table; read_attachment für
PDF/DOCX + write_xlsx(rows); note_search/note_read + write_note; Ordner-Anhang mit .md).

### Runde 3 — Antworten (Nutzerfreigabe: F18–F23 umsetzen)

### F18 — [ADRESSIERT]
Bildstatus vierwertig (ja/nein/unbekannt/wird geprüft); nach `mindgraph:settingsClosed` sofort „wird geprüft“, bis
die Antwort da ist. Gedächtnis-Anzeige aus `memory.vault === vaultPath` abgeleitet — auch im ersten Render nach
Vault-Wechsel kein fremder Stand.

### F19 — [ADRESSIERT]
Ladefehler der Modellliste als eigener Zustand (`modelsFailed`), Hinweis unter der Modellauswahl, Neuversuch bei
Fensterfokus; `pickLocalModel` meldet „Modellliste nicht geladen“ statt „kein lokales Modell“ und stößt Neuversuch an.

### F20–F23 — [ADRESSIERT] Beispieltexte
1. Verwaltung: „gleich aufgebauten Excel- oder CSV-Tabellen … Spalten Name, Datum und Betrag, Quelldatei je Zeile,
   Dateien auflisten, die nicht passten“ · Unterlagen „Ordner mit gleich aufgebauten Tabellen“.
2. Beschaffung: Spalte „Fehlt / prüfen“ · Unterlagen „wenige Angebote als PDF oder Word, kein Scan“.
3. Wissensrecherche: „Suche … nach …, fasse zusammen, was du gefunden hast. Nenne am Ende die Notizen, die du gelesen
   hast, und was offen bleibt.“ — kein „alles“, keine Beleg-Andeutung.
4. Schule: kein fester Zeitraum mehr (veraltet nicht); „Aufgaben, die als offen erkennbar sind … Fehlt eine Angabe,
   markiere sie.“
Bewusst nicht in die Beispiele: Blatt-/Dateigrenzen von collect_table und Seitengrenzen der PDF-Extraktion — die
gehören in Fehlermeldungen/Ergebnis-Karte (Paket B), nicht in einen Einsteiger-Beispieltext.

Nachweis: typecheck, build grün; Tests grün bis auf den bekannten Timeout-Wackler `shellExecution.test.ts`.

### Nachtrag Runde 3 — Schul-Beispiel ersetzt (Nutzerwunsch)
Statt Protokoll-Zusammenfassung jetzt Arbeitsblatt: „Erstelle ein Arbeitsblatt für Klasse 7 zum Thema Photosynthese:
kurzer Einstiegstext, fünf Aufgaben mit steigendem Anspruch und am Ende ein Lösungsteil. Nutze das angehängte Material
als Grundlage.“ · Unterlagen „Unterrichtsmaterial oder Notizen zum Thema“ · Ergebnis „Word-Arbeitsblatt“.
„Lösungsteil“ statt „getrenntes Lösungsblatt“, weil pro Lauf jedes Format nur einmal geschrieben werden darf — ein
zweites DOCX würde abgelehnt. Erzeugung über `write_docx` ohne Vorlage.

### Runde 4 — Antworten (Nutzerfreigabe: F24, F25, F28 umsetzen; F26/F27 richtigstellen)

### F24 — [ADRESSIERT]
Start einer neuen Quellenabfrage setzt `modelsFailed` zurück; Erfolg löscht einen „nicht geladen“-Hinweis.

### F25 — [ADRESSIERT]
Beispiele tragen `needsDocs` (Verwaltung, Beschaffung ja; Wissensrecherche, Arbeitsblatt nein). Solange der
Auftragstext unverändert dem gewählten Beispiel entspricht und nichts angehängt ist: Zeile „Unterlagen“ gelb mit
Hinweis, Startknopf „Unterlagen anhängen“, `canRun` false. Eigener Text bremst nicht. Arbeitsblatt jetzt „Wenn
Material angehängt ist, nutze es als Grundlage“, Unterlagen „optional“. Dev-App geprüft (Verwaltung: gelb +
„Unterlagen anhängen“; Arbeitsblatt: keine Sperre).

### F26 — [ADRESSIERT, Richtigstellung]
Mein Nachtrag „write_docx ohne Vorlage“ war zu pauschal: Passt eine Vault-Skill, lädt der Agent sie zuerst und
deren Vorgaben gelten. Beim Nutzer erzeugt die Skill „Arbeitsblatt“ eine HTML-Seite (im Code-Editor als PDF
exportierbar). Deshalb Ergebnis-Etikett neutral „Arbeitsblatt zum Drucken“ statt „Word-Arbeitsblatt“.

### F27 — [ADRESSIERT, Richtigstellung]
Stimmt: `registerResult` prüft weder Format noch Anzahl, „jedes Format nur einmal“ ist eine Prompt-Regel, keine
Sperre. Beispieltext bleibt bei „Lösungsteil am Ende“; einen Seitenumbruch verspricht er nicht.

### F28 — [ADRESSIERT]
`ImageGenerationSection` sendet nach erfolgreichem Speichern/Löschen `mindgraph:imageKeyChanged`; der Agent-Tab
prüft darauf neu (Zustand „wird geprüft“ bis zur Antwort).

Nachweis: typecheck, build grün; Tests grün (ggf. bekannter Timeout-Wackler `shellExecution.test.ts`).

### Runde 5 — Antworten (Nutzerfreigabe: F29–F31 umsetzen)

### F29 — [ADRESSIERT]
Bestätigt am echten Vault: `~/2026/Skills/arbeitsblatt/SKILL.md` verlangt web_search/web_fetch und bricht ohne ab.
Beispiel jetzt „… für Klasse 7 in Hessen …“ (Lehrplanbezug der Skill) mit Etikett „braucht Web“. Voraussetzung
`need: 'web'`: solange der Text unverändert ist und Web nicht wirksam an, Zeile „Befugnisse“ gelb mit Hinweis,
Startknopf „Web einschalten“, `canRun` false. Kommentar „alle ohne Web lösbar“ entfernt.

### F30 — [ADRESSIERT]
`need` statt `needsDocs`: Verwaltung `folder` (Ordner-Anhang Pflicht, collect_table), Beschaffung `files2`
(≥ 2 Datei-Anhänge oder ein Ordner). Hinweistexte nennen genau das. Weiterhin keine Inhaltsprüfung der Dateien —
das bleibt Sache des Laufs.

### F31 — [ADRESSIERT]
`draft` und `pickedExample` liegen im `noteAgentStore`-Scope (Tab-ID) statt im Komponenten-State; `disposeScope`
beim Schließen des Tabs räumt sie mit ab. Dev-App: Beispiel gewählt → Dashboard → zurück: Text und Sperre erhalten.

Nachweis: typecheck, build grün; Tests grün (ggf. bekannter Timeout-Wackler).

### Runde 6 — Antworten (Nutzerfreigabe: F32–F36 umsetzen)

### F35 — [ADRESSIERT]
`resultsPending` (Phase review + mindestens eine Karte `pending`) sperrt den Start; Knopf „Erst offene Ergebnisse
übernehmen oder verwerfen“. Dev-App mit gezielt gesetztem Store-Zustand geprüft: offen → gesperrt mit diesem Text;
verworfen → „Starten ⌘↩“, aktiv. Vorbestehend seit vor Paket A, durch den erhaltenen Entwurf wahrscheinlicher.

### F34 — [ADRESSIERT]
`useComposeMeasurement(key?)`: Aushängen beendet den Messer immer (kein Hängenbleiben in `live`); mit Schlüssel
(Agent-Tab: Tab-ID) wird der Zwischenstand gesichert und bei `take()` addiert. Zeit auf anderen Tabs zählt nicht.
`disposeScope` verwirft den Stand (`dropComposeMeasurement`). Macher-Leiste unverändert (ohne Schlüssel).
Nicht per Dev-App gemessen — `take()` passiert erst beim echten Start.

### F32 — [ADRESSIERT]
Beispiel formuliert die Webpflicht selbst: „Recherchiere im Web und erstelle ein Arbeitsblatt … am Ende ein
Lösungsteil und die verwendeten Quellen.“ Damit gilt `need:'web'` unabhängig davon, ob die Arbeitsblatt-Skill im
Vault liegt.

### F33 — [ADRESSIERT]
Knopf und Hinweis nach `webState`: „Web-Modul einschalten“ / „Web einrichten“ / „Web einschalten“.

### F36 — [ADRESSIERT]
Als Angebot zählen nur PDF/DOCX-Anhänge (≥ 2); ein Ordner wird zugelassen, sein Inhalt nicht geprüft.

Nachweis: typecheck, build grün; Tests grün (ggf. bekannter Timeout-Wackler).

## Status

Review angefragt 23.09.2026. Runde 1: 11 Findings, F01–F10 nach Freigabe umgesetzt, F11 offen. Runde 2: F12–F17 nach Freigabe umgesetzt. Runde 3: F18–F23 nach Freigabe umgesetzt. Runde 4: F24/F25/F28 umgesetzt, F26/F27 richtiggestellt. Runde 5: F29–F31 umgesetzt. Runde 6: F32–F36 umgesetzt.
