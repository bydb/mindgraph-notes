# Schwerpunkt beim Einrichten („Agent zuerst“ und andere Arbeitsweisen)

## Aufgabe

**Anlass (04.10.2026):** Der Notiz-Agent ist die Funktion, die bei Nutzern am stärksten polarisiert.
Andere Funktionen fallen daneben kaum auf. Neue Nutzer sehen beim ersten Start trotzdem einen
Dateibaum mit Editor und eine Titelleiste mit gleichrangigen Knöpfen (Editor, Split, Brain, Dashboard,
Workflow, Agent). Wer wegen des Agenten kommt, muss ihn erst suchen. Wer nur Notizen will, sieht
viele Extras.

**Ziel:** Beim Einrichten (und später jederzeit) wählt der Nutzer einen **Schwerpunkt**. Er bestimmt,
wo die App startet und was im Vordergrund steht. Ausgeschaltet wird dadurch nichts.

## Kontext/Anker (geprüft)

- `IntentStep` im Onboarding fragt nach einem von sieben **Personen-Profilen**
  (`UserProfile = 'office' | 'student' | 'researcher' | 'professional' | 'writer' | 'developer' | 'viewer'`,
  `uiStore.ts:33`).
- `applyProfileDefaults` (`uiStore.ts:1552`) schaltet einmalig Module an oder aus
  (Flashcards, Zotero, Mail, Dashboard …). Den Agenten erwähnt kein Profil.
- `userProfile` wird gespeichert (`persistedKeys`), aber außer `Onboarding.tsx` liest es niemand.
  In den Einstellungen gibt es keinen Weg zurück. Ein Fehlgriff beim ersten Start lässt sich nur über
  die einzelnen Modul-Schalter korrigieren.
- Der Agent-Tab (`AgentView.tsx`) ist bereits brauchbar als Startfläche: Auftragskarte mit
  Vorbedingungs-Zeilen, Beispielaufträge im leeren Zustand (`agent-card-examples`, mit `need`
  pro Beispiel), Modellweg-Anzeige. Erreichbar über den festen Titelleisten-Knopf
  (`App.tsx:1337`, ohne Modul-Gate), die Befehlspalette, das Ordner-Kontextmenü und die Hilfe.
- Tabs werden nicht persistiert (`tabStore.ts` ohne Persistenz). Was beim Start offen ist, entscheidet
  heute der Initial-Load in `App.tsx` (Notizauswahl → Editor-Tab, `App.tsx:811ff.`), danach ggf. das
  Morning Briefing (`App.tsx:414`).

## Entwurf (Rev. 3, nach Codex-Runde 2 — vom Nutzer freigegeben: nur `notes` und `agent`, F16 vorgezogen)

Rev. 1 sah vier Schwerpunkte, eine beim Start eingeklappte Sidebar und ein neues „Mehr“-Menü vor.
Alle drei sind gestrichen (F01, F03, F04, F10). Was bleibt:

### 1. Feld `workFocus`, getrennt von `userProfile`

```ts
export type WorkFocus = 'notes' | 'agent'
workFocus: WorkFocus   // Default 'notes' = heutiges Verhalten
```

- In `persistedKeys`. Beim Laden normalisiert eine reine Funktion `normalizeWorkFocus(raw)` in
  `shared/workFocus.ts` jeden unbekannten oder fehlenden Wert auf `'notes'` (F13). Getestet: fehlend,
  `'office'` (künftige/alte ID), Zahl, `null`.
- `userProfile` bleibt eine **optionale Voreinstellung** (Module, E-Mail-Schritt, Starter-Vault,
  Dashboard-Widgets) und wird nicht aus `workFocus` abgeleitet (F05). Ein Schwerpunktwechsel schaltet
  nie Module aus oder ein und ändert keine Seitenleiste.

### 2. Was `agent` anders macht — genau zwei Dinge

1. **Startansicht:** Die App öffnet nach dem Laden des Vaults den Agent-Tab und macht ihn aktiv.
2. **Titelleiste:** Der vorhandene Agent-Knopf (`App.tsx:1337`) bekommt die betonte Darstellung
   (Klasse `is-focus`, mit Text auch unterhalb 1300 px, wo die übrigen Knöpfe nur Icons zeigen,
   `index.css:561-575`) und steht als erster Knopf nach dem Trenner der View-Modi. Kein Knopf
   verschwindet, kein neues Menü. Das vorhandene Überlaufmenü bleibt unverändert; sein Eintrag
   heißt bereits „Veranstaltungen“ (`translations.ts:3061`), eine Verwechslung mit dem Notiz-Agenten
   entsteht also nicht.

Bei `notes` ist alles wie heute. Die Sidebar ist in beiden Schwerpunkten unangetastet; ihre
gespeicherte Sichtbarkeit (`sidebarVisible`, persistiert) bleibt die Wahl des Nutzers.

### 3. Startansicht: einmal pro App-Start, zentral in `App.tsx` (F02, F15, F17, F18, F21, F22)

Rev. 2 wollte den Sprung am Ende von `loadLastVault` einlösen. Das trägt nicht: die Willkommen-Auswahl
öffnet ihren Tab erst über einen späteren Effekt (F15), ⌘O lädt über einen eigenen Weg (F17), der
Ladeschutz kann den Sprung verschlucken oder verspäten (F18, F21). Rev. 3:

- **Semantik: nur beim Prozessstart.** Kein Sprung bei Vault-Wechsel, nach erneutem Onboarding oder
  nach Umstellen der Einstellung in derselben Sitzung (F22). So steht es auch in Einstellungen und
  Onboarding: „gilt ab dem nächsten Start“.
- **Status des Startladens** (F27, F28): transientes Feld `initialVaultLoad: 'pending' | 'ready' |
  'none' | 'failed'` im notesStore (nicht persistiert, Start `'pending'`). Gesetzt **ausschließlich** von
  `loadLastVault`, genau einmal pro Prozess: `'none'` wenn kein gespeicherter Vault, `'failed'` im
  `catch`, `'ready'` nach `setNotes` + `loadGraphData` — und nur, wenn `useNotesStore.getState().vaultPath`
  dann noch dem geladenen Ziel entspricht (sonst `'failed'`, weil inzwischen über ⌘O ein anderer
  Vault geöffnet wurde). `handleOpenVault` fasst den Status nie an. Der ältere Datenwettlauf zwischen
  beiden Ladewegen (F28, Notizen/Watcher) besteht heute schon und wird hier nicht gelöst.
- **Einlösen in `App.tsx`:** ein Effekt auf `initialVaultLoad`. Sobald er nicht mehr `'pending'` ist,
  wird genau einmal entschieden (Merker per `useRef`): nur bei `'ready'` und `workFocus === 'agent'`
  `setViewMode('editor')` + `openAgentTab()`. `'none'`/`'failed'` schließen die Entscheidung ohne
  Sprung ab — ein später manuell geöffneter Vault springt nie (F27).
- **Willkommen-Notiz bei `agent`:** `loadLastVault` öffnet sie dann nicht automatisch
  (`welcomeNotePending` wird trotzdem verbraucht). Der Agent-Tab ist beim ersten Start die Begrüßung,
  die Notiz bleibt im Vault. Damit gibt es beim Start keine konkurrierende Notizauswahl (F15).
  *Prüfpunkt Codex:* gibt es weitere automatische `selectNote`-Aufrufe beim Start (Tagesnotiz,
  Lesezeichen, Wiederherstellung), die den Agent-Tab verdrängen?
- Die ausgeblendete Sidebar verhindert das Laden nicht mehr (F16, vorgezogen, siehe unten).
- Das Morning Briefing bleibt ein Overlay darüber (`App.tsx:412-417`).

### 4. Onboarding

- Neuer Schritt **„Womit möchten Sie hauptsächlich arbeiten?“** mit zwei Karten (SVG-Icon, ein Satz
  Nutzen, keine Emojis): „Notizen und Wissen“ / „Aufträge an den Agenten“. Er steht **vor** dem
  Profil-Schritt. Der Profil-Schritt bleibt und wird als „optional: Voreinstellungen für …“ beschriftet.
- **Direktweg „Vault öffnen“** (`Onboarding.tsx:63-75`, F06, F19): der gewählte Pfad wird nur im
  Onboarding-Zustand gehalten; danach erscheint der Schwerpunkt-Schritt allein (ohne Profil, ohne
  KI-Schritt). **Erst „Weiter“** ruft `finishWithVault` (`setLastVault`) auf, wartet darauf, und setzt
  dann `workFocus`, `welcomeNotePending` und `onboardingCompleted`. `set-last-vault` wirft bei
  Fehler und liefert sonst `true` (`main/index.ts:1749-1760`); der Direktweg fängt den Fehler ab und
  lässt den Assistenten mit Meldung offen (F26). Der heutige Wizard-Abschluss, der Fehler schluckt
  (`Onboarding.tsx:44-60`), wird dabei angeglichen.
- **Erneutes Onboarding — beide Einstiege** (⇧⌘O `App.tsx:1042-1049` und Hilfe-Knopf
  `HelpGuide.tsx:271-280`, F14, F21): beide rufen künftig dieselbe Funktion `restartOnboarding()` im
  uiStore. Sie setzt `onboardingCompleted`/`userProfile` wie heute zurück, `workFocus` **nicht**. Der
  Schritt wählt den gespeicherten Wert vor; gespeichert wird nur bei „Weiter“. Nach Abschluss im
  bereits geladenen Vault passiert kein Sprung (Semantik §3).
  Richtigstellung (F25): Der Assistent hat **keinen** Schließen-Weg (`Onboarding.tsx`, `WelcomeScreen.tsx`).
  „Abbrechen“ heißt App beenden; beim nächsten Start öffnet er wieder (`App.tsx:406-410`), Profil und
  Abschlussstatus sind dann zurückgesetzt — wie heute. Das bleibt so; ein Schließen-Knopf mit
  Zurückrollen wäre eine eigene Aufgabe.
- Missionen (`MissionsStep.tsx`, F11, F23): bei `agent` steht als erste Mission die **Textzeile**
  „Ersten Auftrag an den Agenten geben“, ohne Klick — die Missionen sind heute nicht klickbar, und der
  Agent-Tab öffnet sich ohnehin beim Start. Die Mission „Klick auf Dashboard in der Titelleiste“
  bleibt wahr, weil kein Knopf wandert.

### 5. Hardware-Hinweis bei `agent` (F07, F20)

- Im KI-Schritt, nur bei `agent`. Bewertet wird das **voraussichtliche Standardmodell des Agenten**:
  Modul-Override `note-agent` → `selectedModel` (dieselbe Präzedenz wie `AgentView.tsx:176`, in eine
  geteilte Funktion gezogen). Die Beschriftung sagt das ausdrücklich („mit dem Standardmodell“). Eine
  Cloud-Auswahl im Agent-Tab (Tab-Prefs, `AgentView.tsx:169`) kennt das Onboarding nicht und behauptet
  deshalb keinen Weg für sie.
- Zwei getrennte Aussagen, nie vermischt:
  - **Rechner:** Arbeitsspeicher aus der vorhandenen Abfrage (`App.tsx:~395`). Wenig Speicher → „Auf
    diesem Rechner dauern Aufträge mit einem lokalen Modell mehrere Minuten.“
  - **Weg:** aus der Route-Vorprüfung (`note-agent-route-preflight`) für das Standardmodell. `cloud` →
    „Dieses Modell rechnet bei …“; `unverified`/LM Studio → keine Aussage über Geschwindigkeit.
- **KI aus** (`ollama.enabled === false`): der Agent-Tab zeigt heute nur eine Sperrseite
  (`AgentView.tsx:477-485`). Diese Seite bekommt einen Knopf „KI einrichten“ (öffnet Einstellungen → KI).
- **Kein Modell gewählt** (F29, der häufigere Fall: frische Installation hat `ollama.enabled: true`,
  aber `selectedModel: ''`, `uiStore.ts:1035-1037`; Direktweg überspringt den KI-Schritt): leeres
  effektives Modell ohne Cloud-Route wird eine eigene Zeile der Auftragskarte („Kein Modell gewählt ·
  KI einrichten →“), und `canRun` (`AgentView.tsx:426`) verlangt ein Modell. Gilt für alle Nutzer, nicht
  nur für `agent`.
- Keine Sperre, keine Voreinstellung eines Cloud-Anbieters, keine Zustimmung im Onboarding — die läuft
  weiter über die Auftragskarte bzw. Einstellungen (`noteAgentCloudConsentVersion`). Ein `green` in
  der Matrix wird nicht als „schnell“ dargestellt.

### 6. Beispielaufträge (F09)

- Heute hat genau ein Beispiel `need: 'none'` (`AgentView.tsx:53`). Es kommt ein zweites dazu. Beide
  werden gegen den deutschen und den englischen Starter-Vault **manuell** ausgeführt; nur Aufträge,
  die dort ohne Anhang und ohne Web ein belegtes Ergebnis liefern, bleiben stehen. Office- und
  Demo-Vault werden mitgeprüft, falls dieselben Beispiele dort erscheinen.

### 7. Einstellungen

- Einstellungen → Allgemein, ganz oben: Karte „Schwerpunkt“ mit `Segmented` (`Notizen` / `Agent`).
  Hinweis: „Bestimmt, womit die App startet, und hebt den Agent-Knopf hervor. Es wird nichts
  ausgeschaltet. Die Startansicht gilt ab dem nächsten App-Start.“ Die Hervorhebung wirkt sofort.
- Texte in `utils/i18n/settingsPages.ts` (Einstellungen) bzw. `onboarding.*` (Assistent), DE und EN.

## Vorgezogen und umgesetzt: F16 (ausgeblendete Sidebar → kein Vault)

Bestehender Fehler, unabhängig vom Schwerpunkt, vom Nutzer vorgezogen. **Nachgestellt** in der Dev-App
mit eigenem Profil (`sidebarVisible: false`, Vault `~/MindGraph-Modelltest-Vault`): Statusleiste
„Kein Vault | 0 Notizen“.

Änderung:
- `App.tsx` (Sidebar-Hülle): die Hülle um `<Sidebar>` ist immer gerendert, bei `!sidebarVisible` mit
  `display: none`; nur der Trenner hängt an `sidebarVisible`. `Sidebar` rendert sich bei
  `!sidebarVisible` schon heute selbst zu `null` (`Sidebar.tsx`, `if (!sidebarVisible) return null`),
  ihre Effekte (Vault-Laden, ⌘N/⌘O, `mindgraph:newNote`) laufen damit aber weiter. Nebenwirkung: die
  Sidebar wird beim Ein-/Ausblenden nicht mehr neu gemountet.
- `Sidebar.tsx`, Dialog „Neue Notiz“: wird per `createPortal` am `document.body` gerendert und bei
  ausgeblendeter Sidebar als einziges Element zurückgegeben. Grund: die Hülle ist dann `display: none`;
  ⌘N, Befehlspalette (`App.tsx:1173`) und Sprachbefehl (`App.tsx:1240`) hätten den Dialog unsichtbar
  geöffnet. Vorher taten diese Wege bei ausgeblendeter Sidebar gar nichts. (Erste Fassung blendete die
  Sidebar ein und überschrieb damit die gespeicherte Wahl — F24, ersetzt.)
- `styles/index.css` `.new-note-dialog`: `transform: translate(-50%, -50%)` entfernt. Rest einer
  früheren absoluten Positionierung (seit dem ersten Commit); im Flex-zentrierten Overlay schob es den
  Dialog nach links oben.

Beleg nach der Änderung (Dev-App, CDP): ausgeblendet „MindGraph-Modelltest-Vault | 68 Notizen“;
Einblenden zeigt Dateibaum und Trenner, Ausblenden entfernt beide, gespeichertes `sidebarVisible`
bleibt `false`. Dialog bei ausgeblendeter Sidebar: sichtbar, Kind von `body`, Fokus im Eingabefeld,
mittig (Mitte 700/300 bei 1400×600), Escape schließt, Sidebar bleibt zu, gespeichert `false`. Bei
eingeblendeter Sidebar: ein Overlay, mittig, „Abbrechen“ schließt, Sidebar bleibt offen. `npm run typecheck` grün; `npm run test` 2594/2595 grün, ein wackelnder Test
(`shellExecution.test.ts` Umgebungsprobe, scheitert in 2 von 4 Läufen auch ohne Bezug zur Änderung).

## Bewusst nicht Teil dieser Aufgabe

- Schwerpunkte „Büro“ und „Lernen“ (F04 — Inbox/Flashcards sind Panels, kein Tab; eigener Entwurf, falls
  überhaupt).
- Seitenleiste je Schwerpunkt ein-/ausklappen (F01/F03). Das Vault-Laden bleibt in der Sidebar; durch
  F16 läuft es jetzt auch bei ausgeblendeter Sidebar.
- Neues Überlaufmenü oder Umsortieren mehrerer Knöpfe (F10).
- „Letzte Ergebnisse“ im Agent-Tab (F08): braucht eine neue, vault-gebundene, persistente Liste
  (finaler `relPath` nach Übernahme, Titel, Format, Zeit). Eigener Folgeschritt.
- Kein Umbau von `applyProfileDefaults`, keine Telemetrie zum gewählten Schwerpunkt.

## Reihenfolge

1. (erledigt) F16.
2. `shared/workFocus.ts` (`normalizeWorkFocus`, geteilte Agent-Modell-Präzedenz) + Tests.
3. uiStore-Feld + `restartOnboarding()` + Einstellungs-Karte + hervorgehobener Agent-Knopf.
4. `vaultReadyPath` in beiden Ladewegen + Einlösen in `App.tsx`; Willkommen-Notiz bei `agent` aus.
5. Onboarding: Schwerpunkt-Schritt, Direktweg mit aufgeschobenem `setLastVault`, Missionszeile,
   Hardware-Hinweis, Knopf „KI einrichten“ auf der Sperrseite.
6. Zweites `none`-Beispiel, manuell gegen Starter-Vaults geprüft.
7. GUI-Gegenprobe per CDP: frisches Profil × beide Schwerpunkte × beide Onboarding-Wege; Bestandsprofil
   ohne Feld; Sidebar gespeichert aus; ⌘O-Wechsel (kein Sprung); erneutes Onboarding über ⇧⌘O und
   Hilfe; **aktiver** Tab nach abgeschlossenem Render geprüft, nicht nur seine Existenz.

## Fragen an Codex (Runde 3)

1. Trägt §3 (Signal `vaultReadyPath` in beiden Ladewegen, Einlösen einmal pro Prozess in `App.tsx`,
   keine Willkommen-Auswahl bei `agent`)? Gibt es weitere automatische Notiz- oder Tab-Aktivierungen
   beim Start, die den Agent-Tab verdrängen?
2. Direktweg mit aufgeschobenem `setLastVault`: Lücken beim Abbrechen, Schließen, Fehler?
3. F16-Code (siehe `git diff app/src`): Nebenwirkungen der dauerhaft gemounteten Sidebar —
   Doppel-Listener, Watcher, Fokus/Tab-Reihenfolge, Plugin-Slots, Ressourcenverbrauch, Barrierefreiheit
   (Elemente unter `display: none`), das automatische Einblenden in `handleNewNote`.
4. Übersehene Folgen der Rev. 3.

## Codex-Findings

### F01 — Eingeklappte Sidebar verhindert den Vault-Start
Schwere: kritisch
Stelle: app/src/renderer/App.tsx:1547
Status: [OFFEN]
`Sidebar` wird nur bei `sidebarVisible` gemountet; genau dort läuft das automatische Laden des letzten Vaults (`app/src/renderer/components/Sidebar/Sidebar.tsx:291-306`, `:382-383`). Setzt `agent` die Sidebar vor diesem Mount auf `false`, bleibt der Vault ungeladen. Die geplante Startansicht kann dann keinen Vault-Kontext nutzen. Auch beim Aufklappen wird der Ladevorgang erst verspätet angestoßen.
Vorschlag: Vault-Lebenszyklus aus `Sidebar` in einen immer gemounteten Controller verlagern; erst nach abgeschlossener Vault-Ladung die Startansicht aktivieren. Start mit eingeklappter Sidebar und Vault-Wechsel gezielt prüfen.

### F02 — Startansicht kollidiert mit asynchroner Notizauswahl
Schwere: hoch
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:345
Status: [OFFEN]
Die Notizen werden nach Tree-Anzeige asynchron geladen; nach Onboarding setzt `welcomeNotePending` ausdrücklich eine Notizauswahl (`app/src/renderer/components/Sidebar/Sidebar.tsx:357-367`). Jede neue Auswahl öffnet in `App` einen Editor-Tab und macht ihn aktiv (`app/src/renderer/App.tsx:787-829`). Ein vor oder während des Ladens geöffneter Agent-/Dashboard-Tab kann so wieder verdrängt werden. Eine persistierte „zuletzt geöffnete Notiz“ gibt es in `tabStore` nicht (`app/src/renderer/stores/tabStore.ts:88-93`); der reale konkurrierende Pfad ist die Willkommen-Notiz und jede spätere bewusste Auswahl.
Vorschlag: Startfokus an das Ende des Vault-Ladevorgangs einschließlich Willkommen-Auswahl hängen und pro Start/Vault-Wechsel genau einmal anwenden. Den Willkommen-Tab bei `agent` entweder im Hintergrund öffnen oder die Priorität ausdrücklich festlegen. Briefing bleibt als Overlay unabhängig (`app/src/renderer/App.tsx:412-417`).

### F03 — „Nur beim Start einklappen“ widerspricht der Persistenz
Schwere: hoch
Stelle: app/src/renderer/stores/uiStore.ts:1298
Status: [OFFEN]
`sidebarVisible` steht in `persistedKeys`; `toggleSidebar` schreibt unmittelbar in den Store (`app/src/renderer/stores/uiStore.ts:1356`), dessen Autosave persistierte Schlüssel speichert (`app/src/renderer/stores/uiStore.ts:1952-1961`). Es gibt keine vorhandene nichtpersistierende Setzfunktion. Ein `setState({sidebarVisible:false})` beim Start wird ebenfalls gespeichert und überschreibt die bewusste Nutzerwahl. Zudem würde ein für `agent` dauerhaft `false` gespeicherter Wert beim Wechsel zu `notes` weiter gelten.
Vorschlag: Gespeicherte Nutzerpräferenz und sitzungsbezogenen Start-Override getrennt modellieren; ein expliziter Sidebar-Klick beendet den Override für die Sitzung. `notes` muss die gespeicherte Präferenz respektieren, statt „offen“ zu erzwingen.

### F04 — Office und Learning sind keine einzelnen Start-Tabs
Schwere: hoch
Stelle: app/src/renderer/App.tsx:1637
Status: [OFFEN]
Inbox und Flashcards sind rechte Panels, nicht `TabType` (`app/src/renderer/stores/tabStore.ts:4-14`); sie belegen den sekundären Bereich und priorisieren andere offene Panels (`app/src/renderer/App.tsx:1640-1652`). `office` braucht also Dashboard-Tab **plus** Inbox-Panel, `learning` einen definierten Hauptbereich **plus** Flashcards-Panel. Das vorgeschlagene `FocusLayout.startView` kann diese Kombinationen nicht ausdrücken. Bei `office` ohne Mail ist Dashboard als Rückfall ebenfalls ungültig, wenn `dashboard.enabled` aus ist (`app/src/renderer/App.tsx:1298-1316`).
Vorschlag: Reinen Plan für Haupttab und optionales rechtes Panel zurückgeben; Rückfall für jede Kombination deaktivierter Module definieren und die Panels beim Vault-Wechsel nicht per Toggle schließen (`app/src/renderer/App.tsx:200-225`).

### F05 — Zweite Wahl im Onboarding hat funktionale Nebenwirkungen
Schwere: hoch
Stelle: app/src/renderer/components/Onboarding/Onboarding.tsx:79
Status: [OFFEN]
Das Profil steuert mehr als Modul-Voreinstellungen: Office/Professional bekommen einen zusätzlichen E-Mail-Schritt (`app/src/renderer/components/Onboarding/Onboarding.tsx:14-17`, `:107-114`), Office erhält einen anderen Starter-Vault (`app/src/renderer/components/Onboarding/steps/IntentStep.tsx:142-147`), und der Dashboard-Schritt setzt profilabhängige Widgets (`app/src/renderer/components/Onboarding/steps/DashboardStep.tsx:25-56`). `agent` plus Office bzw. Viewer kann deshalb zu anderer Vault-Basis oder abgeschaltetem Dashboard führen; Viewer deaktiviert zahlreiche Module (`app/src/renderer/stores/uiStore.ts:1620-1643`). Den Profil-Schritt einfach zu streichen verliert diese Entscheidungen.
Vorschlag: Zwei Entscheidungen nur behalten, wenn der Profil-Schritt klar als optionale Voreinstellung erklärt wird und Konflikte im Ablauf behandelt werden. Für `agent` einen eindeutigen Starter-Vault und eine eindeutige E-Mail-/Dashboard-Frage festlegen; Profil nicht still aus `workFocus` ableiten.

### F06 — Direkter Vault-Einstieg überspringt den neuen Schwerpunkt-Schritt
Schwere: mittel
Stelle: app/src/renderer/components/Onboarding/WelcomeScreen.tsx:54
Status: [OFFEN]
„Vault öffnen“ geht direkt zu `handleOpenVaultDirect` und setzt `onboardingCompleted`, ohne `IntentStep`, KI-Schritt oder den geplanten Schwerpunkt zu durchlaufen (`app/src/renderer/components/Onboarding/Onboarding.tsx:63-75`, `:94-99`). So erreicht ein neuer Nutzer mit bestehendem Vault die Wahl beim Einrichten nie.
Vorschlag: Schwerpunktwahl auch auf dem Direktpfad anbieten oder diesen Pfad bewusst mit `notes` abschließen und die spätere Änderung an dieser Stelle sichtbar erklären.

### F07 — Hardware-Satz prüft womöglich das falsche Modell
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:174
Status: [OFFEN]
Der Agent verwendet Auswahl im Tab, dann `ollama.moduleModelOverrides['note-agent']`, dann das globale Modell (`app/src/renderer/components/Agent/AgentView.tsx:174-181`). Der bestehende KI-Schritt setzt nur `ollama.selectedModel` und sogar automatisch das erste Ollama-Modell (`app/src/renderer/components/Onboarding/steps/AIStep.tsx:61-70`, `:93-95`). Eine Warnung auf Basis des dort sichtbaren Modells kann deshalb den tatsächlichen Agent-Weg verfehlen. Ein grünes Qualitätsurteil ist zudem kein Laufzeit- oder RAM-Nachweis; der Agent-Weg wird erst im Main verlässlich eingestuft (`app/src/renderer/components/Agent/AgentView.tsx:184-185`, `CLAUDE.md:374-377`).
Vorschlag: Den effektiven Agent-Modellweg aus derselben Präzedenz und der bestehenden Route-Vorprüfung ableiten; RAM- und Qualitätswarnung getrennt formulieren, unbekannte/Cloud-/LM-Studio-Wege nicht als lokal schnell klassifizieren. Keine automatische Cloud-Aktivierung oder stillschweigende Zustimmung.

### F08 — Ledger und Run-Registry tragen keinen Ergebnis-Pfad
Schwere: hoch
Stelle: app/src/shared/activityLog.ts:137
Status: [OFFEN]
`agent-run-finished` speichert nur Lauf-Metadaten und Ergebnisanzahl (`app/src/shared/activityLog.ts:108-135`); `agent-result-accepted` enthält Lauf-ID, Format und Zeiten, aber weder Titel noch Zielpfad (`app/src/shared/activityLog.ts:137-152`). Die Übernahme erzeugt den tatsächlichen, ggf. umbenannten `relPath` erst danach und gibt ihn nur dem Renderer zurück (`app/src/main/index.ts:5053-5056`, `:5085-5096`). Die `runRegistry` ist eine flüchtige Map mit Retention und wird nach verbrauchten Ergebnissen gepruned (`app/src/main/noteAgent/runRegistry.ts:128-152`, `:299-302`). Für „Letzte Ergebnisse“ reicht beides nach Neustart nicht.
Vorschlag: Kleine persistente, vault-gebundene Liste **nach erfolgreicher Übernahme** schreiben, mit finalem relativem Pfad, Titel/Format/Zeit; bei Anzeige Pfad innerhalb des aktuellen Vaults validieren, Existenz prüfen und Löschung/Renaming behandeln. Nur Metadaten speichern, keine Staging-Pfade oder Lauf-Inhalte.

### F09 — „Mindestens zwei Beispiele ohne Unterlagen“ ist nicht eingelöst
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:50
Status: [OFFEN]
Die vorhandenen vier Beispiele haben `need: folder`, `files2`, `none`, `web`; es gibt genau **ein** `none`-Beispiel (`app/src/renderer/components/Agent/AgentView.tsx:50-55`). Dieses sucht nach „Datenschutz bei Cloud-Diensten“ (`app/src/renderer/utils/i18n/agentCard.ts:24-25`), während der normale Starter-Vault als Quelle für den Einstieg gewählt wird (`app/src/renderer/components/Onboarding/steps/IntentStep.tsx:142-147`); ein belegbares Ergebnis darf daher erst nach Prüfung der konkreten Starter-Dateien behauptet werden. Der Web-Fall benötigt ausdrücklich Web-Freigabe (`app/src/renderer/components/Agent/AgentView.tsx:46-49`).
Vorschlag: Zwei neue `none`-Aufträge je DE/EN-Starter-Vault mit bekannten Quellen und klarem Ergebnis definieren; beide ohne Zusatzfreigaben manuell laufen lassen. Auch den Office- und Demo-Vault prüfen, falls sie im Agent-Pfad angeboten bleiben.

### F10 — Ein zweites „Mehr“ kann Knöpfe und Status verstecken
Schwere: mittel
Stelle: app/src/renderer/App.tsx:1446
Status: [OFFEN]
Rechts existiert bereits ein „Weitere Werkzeuge“-Menü (`app/src/renderer/App.tsx:1446-1465`) mit u.a. Flashcards und einem **anderen** „Agenten“: Veranstaltungen aus dem Edoobox-Plugin (`app/src/renderer/App.tsx:1498-1508`; `app/src/renderer/utils/translations.ts:3061`). Die feste mittlere Schaltfläche ist dagegen der Notiz-Agent (`app/src/renderer/App.tsx:1335-1345`). Werden mittlere Knöpfe in ein neues „Mehr“ verschoben, entstehen zwei gleichnamige Menüs und eine leicht verwechselbare Agent-Bezeichnung; dynamische Modul-Gates und Badges rechts (`app/src/renderer/App.tsx:1416-1445`) sind in `TitlebarItem[]` nicht erfasst.
Vorschlag: Vorhandenes Überlaufmenü gezielt erweitern oder die Menüs eindeutig benennen. Notiz-Agent und Veranstaltungen sprachlich trennen; aktive Zustände, Zähler, Modul-Gates und Plugin-Sichtbarkeit bei jeder Position erhalten.

### F11 — Hilfe und Missionen versprechen feste Wege
Schwere: mittel
Stelle: app/src/renderer/utils/translations.ts:2778
Status: [OFFEN]
Die Mission fordert wörtlich „Klick auf Dashboard in der Titelleiste“ (`app/src/renderer/utils/translations.ts:2777-2778`, EN `:6146-6147`); bei einem Fokus, der Dashboard ins Überlaufmenü schiebt, wird diese Anweisung falsch. `MissionsStep` zeigt diese statische Liste unabhängig vom Profil und Schwerpunkt (`app/src/renderer/components/Onboarding/steps/MissionsStep.tsx:15-69`, `:89-109`). `HelpGuide` nutzt dagegen Aktions-IDs für Agent/Dashboard/Workflow (`app/src/renderer/components/Onboarding/HelpGuide.tsx:99-117`), also keine feste Knopfposition; seine Texte und die Hilfegrafik bleiben dennoch auf Erreichbarkeit zu prüfen.
Vorschlag: Missionen nach Schwerpunkt bzw. tatsächlicher Knopfposition formulieren und einen Agent-Erstauftrag für `agent` anbieten; DE/EN-Texte sowie Hilfe-Aktionen gegen das neue Menü prüfen.

### F12 — Plattformfilter und schmale Fenster fehlen im Layout-Vertrag
Schwere: mittel
Stelle: app/src/renderer/utils/modules.ts:30
Status: [OFFEN]
`agent-shell` und `agent-computer` sind `macOnly` (`app/src/renderer/stores/uiStore.ts:591-592`); die zentrale Modulliste filtert sie auf Windows/Linux aus und `isModuleEnabled` liefert dort false (`app/src/renderer/utils/modules.ts:30-45`, `:75-80`). Ein eigenes `EnabledModules` für `focusLayout` kann das übergehen. Zudem ist die Titelleiste ab 1300 px auf Icon-Only umgestellt, weil sie sonst überläuft (`app/src/renderer/styles/index.css:561-575`); neue primäre Knöpfe können die Breite erneut sprengen. Präsentationsmodus verändert global Animationen (`app/src/renderer/styles/index.css:22574-22576`), nicht die Knopfposition.
Vorschlag: Modulverfügbarkeit über die bestehende Plattformlogik beziehen; Layout mit 800/1000/1300 px und allen optionalen Knöpfen prüfen. Präsentationsmodus als CSS-Regressionsfall in die GUI-Gegenprobe aufnehmen.

### F13 — Deep-Merge ist keine Validierung von `workFocus`
Schwere: mittel
Stelle: app/src/renderer/stores/uiStore.ts:1658
Status: [OFFEN]
Der Deep-Merge übernimmt gespeicherte skalare Werte unverändert (`app/src/renderer/stores/uiStore.ts:1658-1675`); `initializeUISettings` filtert nur auf `persistedKeys` und setzt danach den Store (`app/src/renderer/stores/uiStore.ts:1685-1700`, `:1918`). Eine alte, manuell geänderte oder künftige unbekannte Schwerpunkt-ID könnte zur Laufzeit in `focusLayout` landen. Die Aussage „Bestehende Installationen bekommen notes“ gilt nur bei fehlendem Feld.
Vorschlag: Beim Laden und in der reinen Ableitung unbekannte Werte auf `notes` normalisieren; diesen Migrationsfall testen.

### F14 — Schwerpunktwechsel und Onboarding-Neustart brauchen klare Semantik
Schwere: mittel
Stelle: app/src/renderer/App.tsx:1042
Status: [OFFEN]
Der vorhandene Shortcut zum erneuten Onboarding setzt `userProfile` zurück (`app/src/renderer/App.tsx:1042-1049`), während `Onboarding` seine lokale Auswahl beim Öffnen ebenfalls leert (`app/src/renderer/components/Onboarding/Onboarding.tsx:26-32`). Wenn `workFocus` nicht ausdrücklich berücksichtigt wird, kann ein erneuter Durchlauf eine gespeicherte Wahl unsichtbar behalten oder ungewollt überschreiben. Die neue Einstellung wirkt laut Entwurf sofort auf die Titelleiste, aber erst beim nächsten Start auf die Startansicht; ohne Kennzeichnung kann der Nutzer nach Wiederöffnen des Assistenten zwei unterschiedliche Zustände sehen.
Vorschlag: Bestehenden Fokus beim erneuten Onboarding vorauswählen und nur bei bewusster Änderung speichern; Abbruch darf ihn nicht ändern. Den Neustart-Hinweis in Einstellungen und Onboarding konsistent anzeigen.

### F15 — F02: Reihenfolge im Lader garantiert keinen aktiven Agent-Tab
Schwere: hoch
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:360
Status: [OFFEN]
Die Antwort auf F02 verlegt `openAgentTab()` hinter `selectNote(welcomeNote.id)` im selben asynchronen Lader (`app/src/renderer/components/Sidebar/Sidebar.tsx:360-367`). `selectNote` erhöht den Selection-Nonce (`app/src/renderer/stores/notesStore.ts:217-229`); erst der separate React-Effekt in `App` reagiert darauf und ruft `openEditorTab` auf, sobald die Notiz im Store liegt (`app/src/renderer/App.tsx:797-829`). Damit kann die spätere Effekt-Ausführung den zuvor aktivierten Agent-Tab wieder durch den Editor verdrängen. Die bloße Reihenfolge zweier Store-Aufrufe im Lader löst F02 nicht sicher.
Vorschlag: Den Willkommen-Editor synchron über `openEditorTab` öffnen und die Auswahl-Synchronisation vor dem Agent-Öffnen konsumieren, oder den Fokus erst nach bestätigter Verarbeitung der Auswahl setzen. Ein GUI-Test muss den **aktiven** Tab nach abgeschlossenem React-Flush prüfen, nicht nur dessen Existenz.

### F16 — F01 bleibt für gespeicherte, ausgeblendete Sidebars offen
Schwere: hoch
Stelle: app/src/renderer/App.tsx:1547
Status: [OFFEN]
Rev. 2 klappt die Sidebar selbst nicht mehr ein, doch `sidebarVisible` ist gespeichert (`app/src/renderer/stores/uiStore.ts:1298`) und Nutzer können sie über den Titelknopf ausblenden (`app/src/renderer/App.tsx:1253-1261`). Beim nächsten Start wird `Sidebar` dann nicht gemountet (`app/src/renderer/App.tsx:1547-1556`), also läuft `loadLastVault` nicht (`app/src/renderer/components/Sidebar/Sidebar.tsx:291-306`). Für genau diese gültige Nutzerkonfiguration verspricht Rev. 2 trotzdem „App öffnet nach dem Laden des Vaults den Agent-Tab“; `AgentView` meldet ohne Vault selbst eine fehlende Voraussetzung (`app/src/renderer/components/Agent/AgentView.tsx:487-496`). Die Antwort auf F01 nimmt nur den neuen Auslöser weg, nicht den für Bestandsnutzer erreichbaren Fehler.
Vorschlag: Vault-Start unabhängig vom Sidebar-Mount ausführen oder die Sidebar bei `agent` vor dem Start sichtbar machen **ohne** die gespeicherte Wahl zu überschreiben. Den Testfall „gespeicherte Sidebar aus, Schwerpunkt Agent“ ergänzen.

### F17 — Frage 1: Manuelles „Vault öffnen“ umgeht `loadLastVault`
Schwere: hoch
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:121
Status: [OFFEN]
Der Sidebar-Knopf und `⌘O` nutzen `handleOpenVault` (`app/src/renderer/components/Sidebar/Sidebar.tsx:385-396`, `:449`). Dieser Weg räumt auf, setzt `vaultPath`, lädt Tree/Notizen/Graph und startet den Watcher selbst (`app/src/renderer/components/Sidebar/Sidebar.tsx:127-158`); er ruft `loadLastVault` nicht auf. Der Effekt `loadLastVault` prüft nach `vaultPath`-Änderung `if (vaultPath === targetVault) return` (`app/src/renderer/components/Sidebar/Sidebar.tsx:312-313`); zugleich setzt `notesStore.setVaultPath` den letzten Vault asynchron (`app/src/renderer/stores/notesStore.ts:82-87`). Ein nur dort eingelöstes `startFocusPending` greift beim manuellen Wechsel daher nicht verlässlich und kann für einen späteren Ladevorgang stehen bleiben.
Vorschlag: Beide Ladewege in einen gemeinsamen Abschluss mit explizitem Ziel-Vault und Ladekennung führen. Pending nur für genau diesen erfolgreichen Ladevorgang verbrauchen; Abbruch/Fehler löschen oder gezielt weiterführen.

### F18 — Frage 1: Effekt-Abhängigkeit und Fehlerpfad brauchen einen Einmal-Schutz
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:293
Status: [OFFEN]
`loadLastVault` läuft bei Änderungen von `onboardingCompleted` **und** `vaultPath` (`app/src/renderer/components/Sidebar/Sidebar.tsx:382-383`). `setVaultPath(targetVault)` geschieht vor Tree-/Notiz-Ladung (`:327-350`), worauf ein zweiter Effektlauf durch `isLoadingRef` bzw. Gleichheit abgewiesen wird (`:300-315`). Der Guard wird nach erfolgreichem Laden nicht zurückgesetzt; bei einem Fehler bleibt er ebenfalls gesetzt (`:375-379`). Ein neues Pending-Flag, das allein „pro Vault-Wechsel“ gesetzt/gelöscht wird, kann deshalb bei Fehler, Wiederöffnung desselben Vaults oder erneutem Onboarding eine falsche spätere Aktivierung auslösen.
Vorschlag: Das Flag als Lade-Token mit Vault-Pfad führen und nur beim erfolgreichen Abschluss des passenden Ladevorgangs einlösen; für Fehler und identischen Vault eine definierte Behandlung vorsehen. `openAgentTab` idempotent zu machen (`app/src/renderer/stores/tabStore.ts:225-234`) verhindert nur doppelte Tabs, nicht unerwartetes erneutes Aktivieren.

### F19 — Frage 2: Direktweg muss `setLastVault` bis zur Bestätigung aufschieben
Schwere: hoch
Stelle: app/src/renderer/components/Onboarding/Onboarding.tsx:63
Status: [OFFEN]
Im heutigen Direktweg wird `finishWithVault(result)` schon unmittelbar nach dem Dateidialog ausgeführt (`app/src/renderer/components/Onboarding/Onboarding.tsx:63-70`); diese Funktion schreibt den letzten Vault dauerhaft (`:40-42`). Rev. 2 schiebt danach einen abbrechbaren Schwerpunkt-Schritt ein. Bleibt der frühe Aufruf erhalten, ändert bereits die bloße Vault-Auswahl den nächsten App-Start, obwohl der Nutzer den neuen Schritt abbricht. Für die erste Einrichtung ist kein sofortiger Lade-Konflikt nötig: `Sidebar` wartet auf `onboardingCompleted` (`app/src/renderer/components/Sidebar/Sidebar.tsx:291-298`).
Vorschlag: Im Direktweg den gewählten Pfad nur lokal halten; erst beim bestätigten Abschluss `setLastVault` abwarten, dann `onboardingCompleted` setzen. Abbruch darf weder letzten Vault noch Schwerpunkt verändern; Fehler beim Speichern dürfen den Assistenten nicht als abgeschlossen markieren.

### F20 — F07/Frage 3: Modell-Präzedenz allein bildet den Laufweg nicht ab
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:169
Status: [OFFEN]
Beim tatsächlichen Agent-Start übergibt `AgentView` neben `effectiveModel` auch `activeCloudRoute` aus den **Tab-Prefs** (`app/src/renderer/components/Agent/AgentView.tsx:169-177`, `:428-450`); die Main-Vorprüfung nimmt diese Cloud-Route als separaten Parameter und priorisiert sie vor `params.model` (`app/src/main/index.ts:4557-4564`). Bei erneutem Onboarding kann ein vorhandener Agent-Tab diese Auswahl behalten (`app/src/renderer/stores/noteAgentStore.ts:105-109`; `app/src/renderer/stores/tabStore.ts:225-234`). Der nur aus Modul-Override und globalem Modell errechnete Hinweis in Rev. 2 kann dann „lokal“ zeigen, obwohl der später wiederverwendete Tab Cloud startet. Außerdem zeigt `AgentView` bei `ollama.enabled === false` nur eine Sperrseite statt der beschriebenen Auftragskarte (`app/src/renderer/components/Agent/AgentView.tsx:477-485`), was beim Direktweg ohne KI-Schritt oder nach „Später einrichten“ vorkommen kann (`app/src/renderer/components/Onboarding/steps/AIStep.tsx:88-91`).
Vorschlag: Hardware-/Weg-Hinweis ausdrücklich als **voraussichtlichen Standard ohne Tab-Auswahl** kennzeichnen; bei Wiederholung vorhandene Tab-Prefs berücksichtigen oder keine konkrete Route behaupten. Im Direktweg und nach KI-Überspringen eine sichtbare Einrichtungsaktion für den Agenten vorsehen.

### F21 — F14: Neustart über die Hilfe ist im Plan übersehen
Schwere: mittel
Stelle: app/src/renderer/components/Onboarding/HelpGuide.tsx:271
Status: [OFFEN]
Neben `⇧⌘O` startet auch der Hilfe-Guide den Assistenten neu und setzt `onboardingCompleted` sowie `userProfile` zurück (`app/src/renderer/components/Onboarding/HelpGuide.tsx:271-280`). Rev. 2 nennt nur die Shortcut-Stelle (`app/src/renderer/App.tsx:1042-1049`). Wenn die Fokus-Vorauswahl und das Speichern nur im Shortcut-Pfad vorbereitet werden, verhält sich der Hilfe-Knopf anders; wenn die Logik zentral in `Onboarding` liegt, sollte der Plan das explizit festhalten. Außerdem kann ein erneuter Durchlauf ohne Vault-Wechsel wegen des Gleichheits-Guards in `loadLastVault` keinen Startfokus erneut einlösen (`app/src/renderer/components/Sidebar/Sidebar.tsx:312-313`).
Vorschlag: Beide Neustart-Einstiege über dieselbe Onboarding-Initialisierung führen. Bestehenden Schwerpunkt ohne Änderung erhalten und das Verhalten nach Abschluss im bereits geladenen Vault ausdrücklich definieren.

### F22 — Rev. 2 widerspricht sich beim Wirksamwerden der Startansicht
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:312
Status: [OFFEN]
§3 von Rev. 2 verspricht den Agent-Start bei **jedem Vault-Wechsel**, §7 erklärt in den Einstellungen „Die Startansicht gilt ab dem nächsten Start“. Der manuelle Wechsel ist bereits ein eigener Ladevorgang (`app/src/renderer/components/Sidebar/Sidebar.tsx:121-158`), und bei gleichem Vault gibt es einen Skip (`:312-313`). Nutzer können daher nach dem Umstellen noch in derselben Sitzung einen anderen Vault öffnen und einen Agent-Sprung erleben, obwohl der Einstellungstext nur den nächsten App-Start ankündigt.
Vorschlag: Eine Semantik wählen: entweder nur beim Prozessstart, oder „beim nächsten App-Start und beim Öffnen eines anderen Vaults“ in Einstellung und Onboarding sagen. Direktweg und erneutes Onboarding entsprechend behandeln.

### F23 — Neue Mission braucht mehr als einen Textwechsel
Schwere: mittel
Stelle: app/src/renderer/components/Onboarding/steps/MissionsStep.tsx:89
Status: [OFFEN]
Die Missionen sind derzeit statische `div`-Zeilen ohne Aktion; die `missions`-Daten enthalten nur ID/Icon und optional Shortcut (`app/src/renderer/components/Onboarding/steps/MissionsStep.tsx:15-69`, `:89-109`). Rev. 2 sagt, die neue Agent-Mission habe eine „Aktion öffnet den Agent-Tab“. Wird nur eine erste Zeile ergänzt, entsteht eine scheinbar klickbare Anweisung ohne Handler. Vor Abschluss liegt außerdem das Onboarding-Overlay über `App` (`app/src/renderer/App.tsx:1886-1889`), sodass ein dahinter geöffneter Tab noch nicht als Ergebnis sichtbar ist.
Vorschlag: Aktion erst nach Abschluss des Onboardings ausführen oder den Eintrag ausdrücklich als nicht klickbare nächste Aufgabe formulieren. Für klickbare Missionen Button-Semantik, Tastaturzugang und Abschluss-Reihenfolge festlegen.

### F24 — F16-Code überschreibt die gespeicherte Sidebar-Wahl bei „Neue Notiz“
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:174
Status: [OFFEN]
Der vorgezogene Patch behebt das Laden bei ausgeblendeter Sidebar: `Sidebar` bleibt gemountet (`app/src/renderer/App.tsx:1547-1553`), der Vault-Ladeeffekt kann laufen (`app/src/renderer/components/Sidebar/Sidebar.tsx:294-385`), und der frühe `return null` macht versteckte Sidebar-Inhalte samt Dialog für die Barrierefreiheit unsichtbar (`:414-416`). Der neue `handleNewNote` ruft jedoch `toggleSidebar()` auf (`:167-177`). `sidebarVisible` ist persistiert (`app/src/renderer/stores/uiStore.ts:1298`), Store-Änderungen werden automatisch gespeichert (`:2010-2025`). Nach `⌘N`/Palette/Sprachbefehl bleibt die Sidebar also auch nach dem Dialog und nach dem nächsten Start sichtbar, obwohl §2 von Rev. 3 ihre gespeicherte Sichtbarkeit als Nutzerwahl zusagt. Das ist eine reale Nebenwirkung des F16-Fixes.
Vorschlag: Den Dialog außerhalb der Sidebar als globales Modal rendern oder den vorherigen Sichtbarkeitswert nach Dialogschluss gezielt wiederherstellen, ohne einen zwischenzeitlichen Nutzer-Klick zu übersteuern. Den Fall „Sidebar gespeichert aus → Neue Notiz → Abbrechen/Erstellen → Neustart“ prüfen.

### F25 — F21: Abbruch eines erneut gestarteten Onboardings bleibt dauerhaft wirksam
Schwere: hoch
Stelle: app/src/renderer/stores/uiStore.ts:1308
Status: [OFFEN]
Rev. 3 will `restartOnboarding()` für Shortcut und Hilfe zentralisieren, dabei aber `onboardingCompleted` und `userProfile` schon **beim Öffnen** wie bisher zurücksetzen (`app/src/renderer/App.tsx:1042-1049`, `app/src/renderer/components/Onboarding/HelpGuide.tsx:271-280`). Beide Felder werden persistiert (`app/src/renderer/stores/uiStore.ts:1308-1309`); jede Änderung wird gespeichert (`:2010-2025`). Schließt oder bricht der Nutzer den neu gestarteten Assistenten ab, kann zwar `workFocus` gleich bleiben, doch der Abschlussstatus steht auf `false` und das Profil ist weg. Beim nächsten Prozessstart öffnet `App` den Assistenten wieder (`app/src/renderer/App.tsx:406-410`). Damit trägt die Antwort auf F21/F14 („Abbruch ändert nichts“) nur für `workFocus`, nicht für den Einrichtungszustand.
Vorschlag: Beim Wiederöffnen den bisherigen Abschlussstatus und das Profil bis zur bestätigten Fertigstellung unverändert lassen oder bei Abbruch atomar zurückrollen. Auch Schließen der App mitten im erneut gestarteten Assistenten testen.

### F26 — F19: `setLastVault` meldet Erfolg als Rückgabewert
Schwere: mittel
Stelle: app/src/shared/types.ts:732
Status: [OFFEN]
Die Direktweg-Antwort verspricht: Fehler beim Speichern hält den Assistenten offen. Der bestehende Helfer `finishWithVault` wartet aber nur auf `setLastVault`, ohne dessen boolesches Resultat zu prüfen (`app/src/renderer/components/Onboarding/Onboarding.tsx:40-42`); das IPC ist als `Promise<boolean>` typisiert (`app/src/shared/types.ts:732`), und der Main liefert bei Erfolg ausdrücklich `true` (`app/src/main/index.ts:1749-1760`). Wird der Helfer unverändert übernommen, zählt ein aufgelöstes `false` als Erfolg. Der heutige vollständige Onboarding-Abschluss schluckt darüber hinaus Ausnahmen und fährt fort (`app/src/renderer/components/Onboarding/Onboarding.tsx:44-60`).
Vorschlag: `finishWithVault` auf `Promise<boolean>` ändern; nur bei `true` Schwerpunkt und `onboardingCompleted` setzen. `false` und Reject mit sichtbarer Fehlermeldung behandeln; den alten Wizard-Abschluss bei derselben Gelegenheit angleichen.

### F27 — „Erster erfolgreicher Vault“ ist nicht gleich „beim Prozessstart“
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:313
Status: [OFFEN]
§3 nennt als Einlösebedingung den **ersten nicht-leeren** `vaultReadyPath` pro `App`-Instanz. `loadLastVault` kann ohne gespeicherten Vault sofort zurückkehren (`app/src/renderer/components/Sidebar/Sidebar.tsx:303-316`) oder beim Laden scheitern (`:379-382`). Der Nutzer kann später im selben Prozess über „Vault öffnen“ einen Vault laden (`:121-158`, `:452`). Das wäre dann der erste erfolgreiche Ready-Wert und öffnete den Agenten zu einem beliebigen späteren Zeitpunkt, obwohl Rev. 3 ausdrücklich „nur beim Prozessstart; kein Sprung bei Vault-Wechsel“ festlegt. Auch ein nach einem fehlgeschlagenen Start manuell gewählter Vault fällt darunter.
Vorschlag: Die Startentscheidung an einen ausdrücklich begrenzten Initial-Ladevorgang koppeln. „Kein gespeicherter Vault“ und initialer Ladefehler müssen die Entscheidung abschließen; ein späterer manueller Wechsel darf keinen Startsprung auslösen.

### F28 — `vaultReadyPath` braucht eine Ladekennung gegen veraltete Abschlüsse
Schwere: hoch
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:332
Status: [OFFEN]
Der automatische Lader setzt `vaultPath` vor mehreren asynchronen Schritten und erst danach Notizen/Graph/Watcher (`app/src/renderer/components/Sidebar/Sidebar.tsx:332-378`). `handleOpenVault` kann währenddessen einen anderen Vault öffnen, alte Tabs/Notizen leeren und selbst asynchron laden (`:127-158`). Beide Wege haben aktuell weder Abbruch noch eine gemeinsame Ladekennung. Wenn Rev. 3 am jeweiligen Ende `vaultReadyPath` schreibt, kann der ältere Lader zuletzt den Ready-Pfad und Vault-Daten des falschen Vaults setzen. Der zentrale `App`-Effekt würde dann den ersten falschen Abschluss als Prozessstart verbrauchen; ein Pfadvergleich erst im UI reicht nicht, wenn die alten `setNotes`-/Watcher-Schritte bereits liefen.
Vorschlag: Beide Ladewege über eine gemeinsame Generation/Abort-Grenze koordinieren. Vor jedem Store-Commit und Ready-Signal prüfen, ob der Ladevorgang noch der aktuelle ist; Watcher nur für den aktuellen Vault starten.

### F29 — F20: Direktweg ohne Modell erreicht die neue Sperrseite nicht
Schwere: hoch
Stelle: app/src/renderer/stores/uiStore.ts:1035
Status: [OFFEN]
Rev. 3 überspringt im Direktweg den KI-Schritt und ergänzt einen „KI einrichten“-Knopf nur für `ollama.enabled === false`. Bei einer frischen Installation steht `ollama.enabled` aber auf `true`, während `selectedModel` und der `note-agent`-Override leer sind (`app/src/renderer/stores/uiStore.ts:1035-1049`). `AgentView` zeigt die Sperrseite ausschließlich bei `!ollama.enabled` (`app/src/renderer/components/Agent/AgentView.tsx:477-485`). Der Direktweg kann folglich mit leerem Modell auf der scheinbar nutzbaren Auftragskarte landen; `canRun` prüft Vault, Ziel, Aufgabe und Freigaben, aber kein `effectiveModel` (`app/src/renderer/components/Agent/AgentView.tsx:425-447`). Die Antwort auf F20 deckt diesen Hauptfall nicht ab.
Vorschlag: Leeres oder nicht verfügbares effektives Modell als eigene, sichtbare Einrichtungs-Voraussetzung behandeln, auch wenn `ollama.enabled` wahr ist. Startknopf bis zur gültigen Modellwahl sperren und den KI-Einstieg dort anbieten; Direktweg ohne vorhandenes Modell explizit testen.

### F30 — Versteckter Dialog kann im Onboarding den Fokus stehlen
Schwere: hoch
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:404
Status: [OFFEN]
Durch das dauerhafte Mounten von `Sidebar` auch bei `sidebarVisible === false` (`app/src/renderer/App.tsx:1547-1553`) ist ihr globaler `⌘N`-Handler nun in diesem Zustand aktiv (`app/src/renderer/components/Sidebar/Sidebar.tsx:386-410`). Der Handler prüft weder `onboardingOpen` noch einen anderen modalen Zustand (`:386-399`). Bei erneutem Onboarding mit bereits geladenem Vault öffnet `⌘N` deshalb das Portal (`:168-175`, `:416-442`). Dessen Overlay hat `z-index: 1000` (`app/src/renderer/styles/index.css:6768-6779`), das Onboarding `z-index: 10000` (`app/src/renderer/components/Onboarding/Onboarding.css:2-10`): Der Dialog ist unsichtbar, sein `autoFocus`-Eingabefeld (`app/src/renderer/components/Sidebar/Sidebar.tsx:419-430`) kann aber die Tastatureingabe übernehmen. Ohne geladenen Vault ruft `⌘N` stattdessen den OS-Vault-Dialog auf (`app/src/renderer/components/Sidebar/Sidebar.tsx:168-171`); `⌘O` tut das unabhängig vom Vault (`:395-397`). Beide umgehen den geführten Onboarding-Pfad.
Vorschlag: Sidebar-Kürzel nur ausführen, wenn kein Onboarding/anderes blockierendes Modal offen ist; alternativ den globalen Tastatur-Handler zentral bei `App` anhand des modalen Zustands steuern. Den Fall „Sidebar gespeichert aus → Onboarding offen → ⌘N/⌘O“ prüfen.

### F31 — Portal gibt den Fokus nach dem Schließen nicht zurück
Schwere: mittel
Stelle: app/src/renderer/components/Sidebar/Sidebar.tsx:425
Status: [OFFEN]
Der neue Portal-Weg ist erstmals auch bei ausgeblendeter Sidebar benutzbar. Beim Öffnen fokussiert er das Eingabefeld (`app/src/renderer/components/Sidebar/Sidebar.tsx:419-430`); Abbrechen, Escape und Klick auf den Hintergrund setzen nur `newNoteDialogOpen` auf `false` (`:417`, `:425-435`), und auch der Erfolgspfad schließt nur den Dialog (`:178-205`). Es wird weder das zuvor fokussierte Element gemerkt noch nach dem Unmount des Portals dorthin zurückfokussiert. Wer `⌘N` aus dem Editor bei ausgeblendeter Sidebar nutzt und abbricht, verliert damit die Schreibposition als Tastaturziel; ein nächster Tastendruck landet nicht zuverlässig wieder im Editor.
Vorschlag: Beim Öffnen `document.activeElement` speichern und nach jedem Schließpfad dorthin zurückfokussieren, falls es noch verbunden ist. Dialog semantisch als `role="dialog"`/`aria-modal="true"` auszeichnen und Tab-Fokus während der Öffnung darin halten.

## Claude-Antwort

Runde 1, alle 14 Befunde gegen den Code nachgeprüft, alle tragen. Nutzerentscheidung 04.10.2026:
Umfang auf `notes` und `agent` verkleinert. Entwurf als Rev. 2 neu geschrieben.

- **F01** [ADRESSIERT] — Seitenleiste wird nicht mehr eingeklappt (§2). Das Herauslösen des
  Vault-Ladens aus der Sidebar ist ausdrücklich nicht Teil dieser Aufgabe.
- **F02** [ADRESSIERT] — Einlösepunkt am Ende von `loadLastVault` nach der Willkommen-Auswahl,
  transientes `startFocusPending` (§3). Nachprüfung als Frage 1 in Runde 2.
- **F03** [ADRESSIERT] — entfällt mit F01; `sidebarVisible` bleibt Nutzerwahl.
- **F04** [ADRESSIERT] — `office`/`learning` gestrichen.
- **F05** [ADRESSIERT] — Profil bleibt optionale Voreinstellung, nicht aus `workFocus` abgeleitet (§1, §4).
- **F06** [ADRESSIERT] — Direktweg zeigt den Schwerpunkt-Schritt allein (§4). Nachprüfung Frage 2.
- **F07** [ADRESSIERT] — effektives Agent-Modell über geteilte Präzedenz, Rechner- und Weg-Aussage
  getrennt, Route-Vorprüfung statt Namensregel (§5). Nachprüfung Frage 3.
- **F08** [ADRESSIERT] — „Letzte Ergebnisse“ aus dieser Aufgabe herausgenommen, Folgeschritt mit
  eigener vault-gebundener Liste (Abschnitt „Bewusst nicht“).
- **F09** [ADRESSIERT] — zweites `none`-Beispiel, manuell gegen DE/EN-Starter-Vault (§6).
- **F10** [ADRESSIERT] — kein neues Menü, nur Hervorhebung des vorhandenen Knopfes. Ergänzung: der
  Überlaufeintrag heißt schon „Veranstaltungen“ (`translations.ts:3061`), EN „Events“ (`:6430`) —
  die Verwechslungsgefahr betraf nur den i18n-Schlüssel, nicht die Anzeige.
- **F11** [ADRESSIERT] — Agent-Mission bei `agent`; Dashboard-Mission bleibt wahr, weil kein Knopf wandert.
- **F12** [ADRESSIERT] — `macOnly` irrelevant (kein Modul-Layout mehr); Fensterbreiten in der GUI-Gegenprobe;
  der betonte Knopf behält Text unter 1300 px — Breite dort ist Prüfpunkt.
- **F13** [ADRESSIERT] — `normalizeWorkFocus` mit Tests (§1).
- **F14** [ADRESSIERT] — ⇧⌘O setzt `workFocus` nicht zurück, Vorauswahl, Speichern nur bei „Weiter“;
  Hinweis „gilt ab dem nächsten Start“ in Einstellungen (§4, §7).

Runde 2, alle neun Befunde (F15–F23) gegen den Code nachgeprüft, alle tragen. Nutzerentscheidung
04.10.2026: Rev. 3 wie vorgeschlagen, F16 vorziehen.

- **F15** [ADRESSIERT] — Startsprung nicht mehr im Lader, sondern zentral in `App.tsx` nach
  `vaultReadyPath`; bei `agent` keine automatische Willkommen-Auswahl, also kein konkurrierender
  Editor-Tab (§3). GUI-Gegenprobe prüft den aktiven Tab nach dem Render.
- **F16** [ADRESSIERT] — vorgezogen und umgesetzt (Abschnitt „Vorgezogen“), nachgestellt und mit CDP belegt.
- **F17** [ADRESSIERT] — `vaultReadyPath` in beiden Ladewegen; Sprung ohnehin nur beim Prozessstart.
- **F18** [ADRESSIERT] — kein Pending-Flag mehr; Einmal-Merker in `App.tsx`, Entscheidung beim ersten
  erfolgreichen Laden. Fehler setzen `vaultReadyPath` nicht → kein Sprung.
- **F19** [ADRESSIERT] — `setLastVault` erst bei „Weiter“, Abbruch ändert nichts, Fehler hält den
  Assistenten offen (§4).
- **F20** [ADRESSIERT] — Hinweis als „Standardmodell“ beschriftet, keine Aussage über Tab-Cloud-Auswahl;
  Knopf „KI einrichten“ auf der Sperrseite (§5).
- **F21** [ADRESSIERT] — beide Einstiege über `restartOnboarding()`, `workFocus` bleibt (§4).
- **F22** [ADRESSIERT] — eine Semantik: nur Prozessstart, Texte angeglichen (§3, §7).
- **F23** [ADRESSIERT] — Missionszeile ohne Klick (§4).

Runde 3, sechs Befunde nachgeprüft. Nutzerentscheidung 04.10.2026: F24 im Code beheben, F25–F29 in den
Plan, danach nur noch kurzes Gegenlesen des F24-Fixes.

- **F24** [ADRESSIERT] — Einblenden entfernt; Dialog als Portal am `body`. In der Dev-App belegt
  (Abschnitt „Vorgezogen“). Dabei gefunden und behoben: verschobener Dialog durch altes `transform`.
- **F25** [ADRESSIERT] — trägt, ist aber heutiges Verhalten: der Assistent hat keinen Schließen-Weg,
  Abbruch = App beenden. Plan richtiggestellt; `workFocus` bleibt bis „Weiter“, Profil/Abschluss
  verhalten sich wie heute. Schließen-Knopf mit Zurückrollen ist nicht Teil dieser Aufgabe.
- **F26** [ADRESSIERT] — teilweise: `set-last-vault` liefert nie `false`, es wirft oder gibt `true`
  (`main/index.ts:1749-1760`). Der berechtigte Kern (verschluckte Fehler) ist in §4 aufgenommen.
- **F27** [ADRESSIERT] — Startlade-Status `none`/`failed` schließt die Entscheidung ab (§3).
- **F28** [ADRESSIERT] — Status nur aus `loadLastVault`, `ready` nur bei unverändertem `vaultPath` (§3).
  Der Datenwettlauf der beiden Ladewege besteht schon heute und bleibt außerhalb dieser Aufgabe.
- **F29** [ADRESSIERT] — fehlendes Modell als eigene Voraussetzung, `canRun` verlangt ein Modell (§5).

Runde 4 (Code-Gegenlesen F16/F24), zwei Befunde, beide nachgeprüft. Beide bestehen schon heute bei
sichtbarer Sidebar (sie ist auch unter dem Onboarding gemountet); der F16-Fix dehnt sie auf
ausgeblendete Sidebars aus. Nutzerfreigabe 04.10.2026: beheben.

- **F30** [ADRESSIERT] — `handleKeyDown` der Sidebar kehrt bei `onboardingOpen` sofort zurück (⌘N und ⌘O).
  Dev-App: ⇧⌘O öffnet den Assistenten, danach ⌘N → kein Dialog.
- **F31** [ADRESSIERT] — `cancelNewNoteDialog` gibt den Fokus an das vorher fokussierte Element zurück
  (Abbrechen, Escape, Hintergrund); nach dem Erstellen nicht, dann gehört er der neuen Notiz. Dialog trägt
  `role="dialog"`, `aria-modal="true"`, `aria-label`. Fokusfalle bewusst nicht (ein Feld, zwei Knöpfe).
  Dev-App: Fokus auf Titelleisten-Knopf → ⌘N → Eingabefeld fokussiert → Escape bzw. Hintergrundklick →
  Fokus wieder auf dem Knopf.

## Status

Runden 1–4 (F01–F31) beantwortet. F16 umgesetzt inkl. F24, F30, F31 (uncommittet): `npm run typecheck`
grün, `npm run build` grün, `npm run test` 2594/2595 — der eine Ausfall ist `shellExecution.test.ts`
(Umgebungsprobe), scheitert nur unter Last der Gesamtsuite, einzeln 4/4 grün, Hauptprozess-Code ohne
Bezug zur Änderung. Dev-App-Gegenproben siehe Abschnitt „Vorgezogen“ und F30/F31.
Der Schwerpunkt selbst (Rev. 3) ist geplant, aber noch nicht gebaut.
