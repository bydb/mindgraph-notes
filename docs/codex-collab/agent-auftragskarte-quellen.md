# Agent: „Auftragskarte“ für Einsteiger + Quellenangabe wie beim Vault-Chat

## Aufgabe

**Diskussion, kein Code.** Der Nutzer hat einen Entwurf (Claude-Design-Export, Screenshot) für den
Agent-Tab und will Menschen, die noch wenig mit Agenten gearbeitet haben, stärker an die Hand nehmen.
Zwei Fragen:

1. **Taugt der Entwurf „Auftragskarte“** (unten beschrieben) — trägt er gegen den echten Code, und was
   fehlt einem Einsteiger noch?
2. **Soll der Agent die genutzten Quellen ausgeben können, ähnlich wie „Vault befragen“?** Wenn ja: in
   welcher Form (Dateiliste vs. belegte Aussagen mit Fußnoten), mit welchen Grenzen, und was ist ehrlich
   machbar?

Bitte adversarial: nicht bestätigen, sondern Löcher, falsche Versprechen und Einsteiger-Fallen suchen.
Claude (Bauender) hat eine eigene Einschätzung unten notiert — prüfe sie mit, widersprich wo nötig.

### Der Entwurf (Text-Wiedergabe des Screenshots)

Überschrift im Entwurf: „Aus dem Code abgeleitet — Petrol-Tokens, echte Zustände. Grundlage ist
AgentView.tsx + AgentRunPanel.tsx: Zielordner ist Pflicht, Web schließt Shell/Rechner aus, lokal vs.
Cloud ändert den Datenweg, Läufe dauern mit 27B ~10 min, Ergebnisse sind Karten mit
Vorschau/Übernehmen, danach ‚Merken‘ ins Agent-Gedächtnis. Heute stapeln sich dafür bis zu vier
Hinweisbalken untereinander.“

„2a Auftragskarte — alle Vorbedingungen als Zeilen; der Knopf sagt, was fehlt. Ersetzt die Hinweisbalken.“

Karte „Agent“:
- Großes Eingabefeld mit Auftrag („Werte alle Rückmeldungen aus und liste die ausgeschiedenen
  Lehrkräfte des vergangenen Schuljahrs auf.“)
- Zeile **Unterlagen**: Chips „160 – Mars Abenteuer / site“ (Ordner), „Rückmeldungen.xlsx“, rechts „+ hinzufügen“
- Zeile **Ablage** (gelb markiert, Punkt): „Noch kein Zielordner — Vorschlag: **160 – Mars Abenteuer**“ + Knopf „Übernehmen“
- Zeile **Befugnisse**: Segment „Nur Vault | + Web | + Shell | + Rechner“, rechts „eins pro Lauf“
- Zeile **Modell**: „qwen3.8:27b-mlx · lokal, nichts verlässt den Rechner“, rechts „ändern ▾“
- Zeile **Gedächtnis**: „2 Regeln gelten · ‚Tabellen immer als .xlsx‘, ‚Namen nur mit Initial‘“, rechts „ansehen“
- Fußzeile: „⌘↩ · Ergebnisse erst nach Freigabe gespeichert“; Startknopf deaktiviert mit Text „Zielordner fehlt noch“

### Claudes Ersteinschätzung (zum Gegenprüfen)

- Richtung stimmt: die vier gestapelten Hinweisbalken (`AgentView.tsx:301–308`) werden zu Zeilen mit
  Zustand; der Startknopf nennt, was fehlt, statt still deaktiviert zu sein.
- **„eins pro Lauf“ ist falsch**: Main sperrt nur Web+Shell (`main/index.ts:4481`) und Web+Rechner
  (`main/index.ts:4504`). Shell+Rechner sind kombinierbar. Ein Segment-Control mit genau einer Auswahl
  verspricht eine Regel, die es nicht gibt, und nimmt eine Kombination weg.
- **„lokal, nichts verlässt den Rechner“** darf nur stehen, wenn es geprüft ist — Ollama-Modelle mit
  `:cloud`/`remote_host` sind „lokal installiert“, rechnen aber außen (`main/rag/localModel.ts`,
  `resolveLocalModel`). Zusätzlich verlassen Daten den Rechner bei Web (Suchanfragen) und ggf. Rechner
  (Mail-Entwurf wird nicht gesendet — also nein). Die Zeile muss aus derselben Prüfung kommen wie der Datenweg.
- **Zielordner-Vorschlag** ist neu (heute keine Logik): woraus abgeleitet? Gemeinsamer Elternordner der
  Unterlagen? Bei Einzeldatei aus anderem Ordner falsch-sicher.
- **Einsteigerhilfe fehlt noch**: was der Agent überhaupt kann (Beispielaufträge je Skill), dass er NUR
  Angehängtes liest (CLAUDE.md „Der Agent liest NUR, was angehängt ist“ — das Modell erfand sonst
  „bitte hochladen“), und die Laufzeit-Erwartung (~10 min lokal) VOR dem Start.
- **Quellen**: gibt es schon auf Dateiebene — `run.sources` (`main/noteAgent/runRegistry.ts:80`), befüllt
  bei jedem Lesen (`skills.ts:286,314,377,451,519,569,745`), angezeigt als eine Textzeile „Quellen: a, b, c“
  auf der Ergebniskarte (`AgentRunPanel.tsx:197–198`). Das ist „gelesen“, nicht „belegt“. Vault-Chat macht
  Aussage-Ebene mit deterministischer Prüfung (`shared/rag/citations.ts`: cited-high/low/unchecked/invalid,
  CLAUDE.md „nie belegt“). Eine Fußnoten-Variante für Agent-Ergebnisse (Excel, DOCX, HTML, Notiz) ist
  deutlich schwerer: welche Zelle stammt aus welcher Zeile welcher Datei?

## Kontext/Anker

- `app/src/renderer/components/Agent/AgentView.tsx` (348 Zeilen) — Tab, Eingabe, Chips, Hinweisbalken `:301–308`
- `app/src/renderer/components/Agent/AgentRunPanel.tsx:197–198` — Quellenzeile der Ergebniskarte
- `app/src/main/noteAgent/runRegistry.ts:36,46,80` — `sources` pro Lauf/Ergebnis
- `app/src/main/noteAgent/skills.ts` — wo Quellen hinzugefügt werden (s.o.), Web-Quellenblock deterministisch
- `app/src/main/index.ts:4481,4504` — Befugnis-Ausschlüsse; `note-agent-run`-Handler drumherum
- `app/src/main/noteAgent/loop.ts:105,169,256` — Gedächtnis-/Skill-/Befugnis-Blöcke im Prompt, Iterationen
- `app/src/main/index.ts:14576–14600` — Agent-Gedächtnis `.mindgraph/agent-memory.json`
- `app/src/shared/rag/citations.ts`, `app/src/main/rag/vaultPrompt.ts` — Vault-Chat-Belegprüfung
- `app/src/main/rag/localModel.ts` — was „lokal“ heißt
- `shared/tableCollect.ts` — `collect_table`: Zeilen laufen nie durch das Modell (relevant für Quellen je Zeile!)
- `CLAUDE.md` Abschnitte „Notiz-Agent: Ordner auswerten + Agent-Tab“, „Webrecherche“, „Vault-Index … Phase 2“
- Memory des Nutzers: Einsteiger sollen nicht mit Fachbegriffen erschlagen werden; keine Emojis in UI.

## Codex-Findings

### F01 — „Nur angehängte Unterlagen“ ist falsch
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:150
Status: [OFFEN]
Claudes Einsteigerformel widerspricht dem Prompt: `note_search` durchsucht bei Informationslücken alle Vault-Notizen, `note_read` liest Treffer auch ohne Anhang (`loop.ts:153,160`; `skills.ts:561–595`). Mit Shell kann je nach Schutzgrenze sogar der Vault lesbar sein (`loop.ts:68–75`). Ein Anhang begrenzt nur die Datei-Werkzeuge für andere Formate. Die Karte „Unterlagen“ darf nicht wie eine vollständige Lesefreigabe wirken.
Vorschlag: Direkt an der Karte unterscheiden: „Angehängte Dateien/Ordner; passende Vault-Notizen kann der Agent zusätzlich suchen und lesen.“ Bei Shell den tatsächlichen Lesebereich nennen. Wenn echte Eingabe-Isolation gewollt ist, braucht sie eine neue Main-seitige Werkzeuggrenze.

### F02 — „Lokal, nichts verlässt den Rechner“ ist im Agent-Pfad nicht nachgewiesen
Schwere: hoch
Stelle: app/src/main/index.ts:4530
Status: [OFFEN]
Claude erkennt das Cloud-Risiko, verweist aber auf `resolveLocalModel` als vermeintlich vorhandene Prüfung. Der Agent-Handler prüft bei Ollama Tool-Capability und baut danach `backend: 'ollama'` (`index.ts:4554–4578`); `resolveLocalModel` gehört zum Vault-RAG und prüft dort `remote_model`/`remote_host` (`main/rag/localModel.ts:94–117`). Die Renderer-Erkennung ist nur namensbasiert (`AgentView.tsx:75–79`). Auch bei lokalem Textmodell können Web-Suchanfragen und `generate_image` an externe Dienste gehen (`skills.ts:953–975`).
Vorschlag: Bis eine Agent-seitige Laufwegprüfung existiert, „Modell über Ollama/LM Studio“ und getrennte Datenwege anzeigen; niemals „nichts verlässt den Rechner“. Vor dem Start den tatsächlichen Suchanbieter, Cloud-Anbieter und Bilddienst sichtbar machen.

### F03 — „Ergebnisse erst nach Freigabe gespeichert“ verschleiert sofortige Wirkung
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:88
Status: [OFFEN]
Die Aussage gilt für die Übernahme von Staging-Dateien in den Vault (`index.ts:4864–4890`), nicht für alle Befugnisse. Rechner-Vorgänge wirken sofort, ohne Einzelbestätigung; das Freigabefenster nennt ausdrücklich, dass das Modell den konkreten Vorgang entscheidet (`index.ts:4737–4744`). Drucken und Mail-Entwurf sind Beispiele (`computerTools.ts:48–76`); Shell-Befehle laufen ebenfalls vor der Ergebnisübernahme (`shellTools.ts:10–26`). Claude reduziert „Rechner“ zu Unrecht auf den Mail-Entwurf. Für Einsteiger ist die pauschale Fußzeile gerade bei diesen Modi gefährlich.
Vorschlag: Fußzeile auf „Ergebnisdateien kommen erst nach Übernehmen in den Vault“ begrenzen. Bei Shell/Rechner unmittelbar an der Befugniszeile und am Startknopf „Aktionen können während des Laufs sofort wirken; einmalige Freigabe vor dem Start“ erklären, mit der konkret freigegebenen Vorgangsliste.

### F04 — Befugnis-Segment und Vorbedingungen müssen den echten Zustand zeigen
Schwere: mittel
Stelle: app/src/main/index.ts:4481
Status: [OFFEN]
Claude hat recht, dass „eins pro Lauf“ und die vier exklusiven Segmente die zulässige Kombination Shell+Rechner unterschlagen: Main sperrt Web+Shell und Web+Rechner (`index.ts:4481–4508`), der Renderer setzt beim Einschalten von Shell/Rechner nur Web zurück (`AgentView.tsx:268–294`). Hinzu kommen Modulschalter, Konfiguration, Sandbox-Verfügbarkeit, Modell-/Tool-Fähigkeit und native Freigabe, die `canRun` gar nicht vorab prüft (`AgentView.tsx:140–141`; `index.ts:4484–4556`). Ein grünes „bereit“ wäre daher mehr als der Code weiß.
Vorschlag: Web und Shell/Rechner als kompatibilitätsgesteuerte Schalter zeigen; „Start möglich“ von „Befugnis/Modell beim Start geprüft“ unterscheiden. Fehlende Einrichtung mit nächstem Schritt benennen; Main-Ablehnungen in der Karte sichtbar halten.

### F05 — Gedächtnis-Zeile verspricht eine nicht vorhandene Regelzählung
Schwere: mittel
Stelle: app/src/main/noteAgent/skillsLoader.ts:175
Status: [OFFEN]
Die Karte zeigt „2 Regeln gelten“ mit konkreten Beispielen, aber das aktuelle Gedächtnis ist frei editierbarer Markdown-Text `Skills/Agent-Gedächtnis.md`, auf 6000 Zeichen für den Prompt gekappt (`skillsLoader.ts:179–193`). Der Main liest diesen Text erst beim Laufstart (`index.ts:4606–4609`); es gibt weder strukturierte Regelzahl noch Prüfung, ob zwei angezeigte Regeln vollständig im Prompt landen. Vorschläge werden erst nach einem Ergebnislauf angeboten und nur durch „Merken“ gespeichert (`index.ts:4796–4805`, `skillsLoader.ts:195–215`).
Vorschlag: „Agent-Gedächtnis ansehen“ mit echtem Inhalt und Kürzungsstatus zeigen. Eine Zahl nur nach definierter Parser- und Prompt-Abgleichslogik ausgeben.

### F06 — „Quellen“ auf der Karte sind weder vollständige Leseliste noch Ergebnisbelege
Schwere: hoch
Stelle: app/src/main/noteAgent/runRegistry.ts:80
Status: [OFFEN]
`sources` ist ein Lauf-Set, dessen Stand beim Schreiben in jedes Ergebnis kopiert wird (`skills.ts:235–249`); es gibt keine Zuordnung zu Sätzen oder Zellen. `list_context_folder` fügt einen Ordner schon nach reiner Namens-/Metadatenliste hinzu (`skills.ts:301–318`), `collect_table` ebenfalls nur als „Ordner“ (`skills.ts:433–459`). `note_search` liefert Treffer, aber protokolliert diese nicht als Quellen (`skills.ts:587–596`); `note_read` speichert nur `[[basename]]`, sodass gleichnamige Notizen nicht unterscheidbar sind (`skills.ts:567–569`). Vorlage und Skill werden ebenfalls als „Quelle“ gemischt (`skills.ts:519,745,852`). Claudes „bei jedem Lesen“ und das UI-Label „Quellen“ sind damit zu stark.
Vorschlag: Zunächst pro Ergebnis ein strukturiertes Laufprotokoll mit Kategorien „Inhalt geöffnet“, „nur aufgelistet“, „als Vorlage/Anleitung genutzt“ und „nicht ausgewertet“ samt eindeutigem Pfad/URL führen. Anzeige „Vom Agenten verwendete Eingaben (kein Beleg für einzelne Aussagen)“; niemals allein daraus „belegt“ ableiten.

### F07 — `collect_table` erlaubt Zeilenherkunft, aber keine geprüfte Sachbehauptung
Schwere: hoch
Stelle: app/src/main/noteAgent/contextFiles.ts:786
Status: [OFFEN]
Die App ergänzt jeder exportierten Zeile deterministisch `Quelldatei` (`contextFiles.ts:852–855`), während vollständige Zeilen im Lauf-Datensatz bleiben und direkt nach XLSX gehen (`runRegistry.ts:69–72`; `skills.ts:634–672`). Das ist mehr als eine bloße Dateiliste und widerspricht Claudes pauschalem „welche Zelle stammt aus welcher Zeile?“: Die Quelldatei pro Ausgabezeile ist bereits vorhanden. Die Original-Zeilennummer, Blatt-/Zelladresse und die Zuordnungs-/Filterentscheidung werden aber nicht pro Ausgabezelle gespeichert; Spaltenabgleich ist heuristisch (`shared/tableCollect.ts:130–162`). Dateien können teilweise, fehlerhaft oder gar nicht ausgewertet sein (`contextFiles.ts:813–885`), wofür bereits ein Blatt „Nicht verwertet“ entsteht (`skills.ts:640–651`).
Vorschlag: Für `write_xlsx(dataset)` zuerst „Aus Quelldatei“ plus Status/Lücken ausgeben; für belastbare Zellverweise zusätzlich Originalblatt, Zeilen- und Spaltenkoordinaten durch die Extraktion tragen und den Export daran binden. Keine Aussage-Fußnoten oder „geprüft“, solange nur die Dateiherkunft feststeht. Modellgenerierte `write_xlsx(rows)` separat als „vom Agenten zusammengestellt“ kennzeichnen.

### F08 — Notiz, DOCX und HTML brauchen verschiedene Quellenstufen
Schwere: mittel
Stelle: app/src/main/noteAgent/skills.ts:676
Status: [OFFEN]
`write_note`/`write_docx`/`write_html` nehmen Modelltext entgegen; weder deren einzelne Aussagen noch DOCX-Formularzellen werden an konkrete Eingabestellen gebunden (`skills.ts:676–695,781–810,865–875,1027–1037`). Bei DOCX ohne Vorlage kann die Vorschau vor Übernahme nur „binär“ melden (`index.ts:4932–4957`), was eine Prüfung besonders schwer macht. Ein übernommenes Dokument trägt KI-Provenienz bzw. die Ergebniskarte zeigt Eingaben, aber keinen Beleg. Vault-Chat kann seine Satzprüfung nur auf nummerierte, vorab festgelegte Textstellen anwenden (`main/rag/vaultPrompt.ts:47–57`; `shared/rag/citations.ts:1–9`).
Vorschlag: Für Notizen zuerst freiwillige Abschnitt-Verweise auf eindeutig identifizierte Stellen und eine unverwechselbare Kennzeichnung „Verweis vom Agenten, inhaltlich nicht geprüft“ erproben. DOCX/HTML können solche Verweise als lesbare Quellenliste übernehmen, aber nicht automatisch „belegte Fußnoten“ heißen; Formularfelder und freie Tabellen bleiben ohne separate Herkunftsstruktur ungeprüft. Aussage-Fußnoten erst mit Quellenausschnitten, Nummerierung, Abgleich der finalen Datei und expliziten Status je Aussage.

### F09 — Web-Quellenblock ist eine Abrufliste, keine Zitatprüfung
Schwere: hoch
Stelle: app/src/shared/webResearch.ts:438
Status: [OFFEN]
Im Web-Lauf hängt die App tatsächlich nur erfolgreich abgerufene URLs deterministisch an Notiz/HTML (`webResearch.ts:445–454,512–528`; `skills.ts:909–912,1030–1037`). Das verhindert erfundene Einträge im app-eigenen Schlussblock, prüft aber keinen Satz und entfernt keine beliebigen vom Modell gesetzten Inline-Verweise oder anders betitelte Literaturabschnitte (`webResearch.ts:503–508`). `WebFetchRecord` enthält URL/Titel/Zeit/Status, keinen unveränderlichen Textausschnitt (`webResearch.ts:100–109`). Zudem sind im Web-Lauf XLSX/DOCX als Writer gesperrt (`loop.ts:220–229`).
Vorschlag: Schlussblock „Erfolgreich abgerufene Seiten“ nennen und daneben „Aussagen wurden nicht gegen die Seiten geprüft“. Für echte Fußnoten müssten Abruftextstellen mit Identität gespeichert, nummerierte Verweise im finalen Text validiert und ungeprüfte/ungültige Aussagen sichtbar markiert werden. Keine Formatwahl XLSX/DOCX im Web-Lauf versprechen.

### F10 — Der Einstieg braucht Auftragsschärfung und ehrliche Laufzeit
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:193
Status: [OFFEN]
Das Beispiel „ausgeschiedene Lehrkräfte des vergangenen Schuljahrs“ hat ohne Stichtag, Definition von „ausgeschieden“ und gewünschte Ausgabe (Liste, Tabelle, Begründung) mehrere plausible Ergebnisse (`translations.ts:1163–1165`). Der Prompt fordert das Modell sogar auf, keine Rückfragen zu stellen und sinnvolle Annahmen zu treffen (`loop.ts:156–163`); nur Personendaten dürfen nicht erfunden werden (`loop.ts:165–168`). Die Karte darf das nicht als fachlich geklärten Auftrag erscheinen lassen. Eine fixe „~10 min bei 27B“ ist im Code nicht als Laufzeitgarantie oder Schätzung implementiert; der Loop hat Iterationsgrenzen und kann unvollständig enden (`loop.ts:256,284–358`; `translations.ts:1186`).
Vorschlag: Einsteigerbeispiele mit prüfbarem Ziel, Zeitraum, Eingaben und Ausgabeformat anbieten; vor Start eine kurze Zusammenfassung „Was soll entstehen?“ und „Welche Daten fehlen?“ ermöglichen. Laufzeit nur als variable Erwartung formulieren („lokale große Modelle können mehrere Minuten brauchen; Fortschritt und Abbruch sind sichtbar“), samt Hinweis auf Teil-/Fehllauf.

### F11 — Zielordner-Vorschlag darf Datenquelle und Ablage nicht verwechseln
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:160
Status: [OFFEN]
Der Zielordner ist ausdrücklich Ablage und keine Datenquelle (`loop.ts:160–162`; `skills.ts:600–608`). Aus einem angehängten Ordner oder einer Einzeldatei denselben Zielordner abzuleiten, kann Rohdaten und Ergebnisse vermischen; bei extern angehängten Dateien gibt es nicht einmal zwingend einen passenden Vault-Ort. Heute wählt der Nutzer nur bestehende Vault-Ordner aus (`AgentView.tsx:112–123,241–251`), Main verlangt einen vorhandenen, erlaubten Ordner (`index.ts:4464–4477`).
Vorschlag: Vorschlag höchstens als explizit ungeprüfte Ablageempfehlung mit vollem Vault-Pfad und Begründung anzeigen, nie automatisch übernehmen. „Zielordner fehlt“ am deaktivierten Knopf ist hilfreich; zusätzlich fehlenden Auftrag und fehlendes Modell/Einrichtung priorisiert benennen.

### Empfehlung
Zuerst die Auftragskarte an die realen Grenzen anpassen: Lesebereich, Datenwege, sofortige Rechner-/Shell-Wirkung, Voraussetzungen und präzise Ablage. Danach die bestehende Quellenzeile in ein strukturiertes Eingabe- und Lückenprotokoll umbenennen; im XLSX-Datensatz `Quelldatei` und „Nicht verwertet“ bewusst nutzen, im Web-Lauf die Abrufliste klar benennen. Als nächste Ausbaustufe eindeutige Abschnitt-Verweise für Textausgaben und Originalkoordinaten für Tabellendaten erfassen. Aussage-Fußnoten mit Prüfstatus erst separat entwickeln und gegen den finalen Export prüfen; bis dahin weder „belegt“ noch „geprüfte Quellen“ versprechen. Die feste 27B-Laufzeit, „nichts verlässt den Rechner“, eine Regelzählung und einen automatisch sicheren Zielordner aus dem Entwurf streichen.

### F12 — Runde-1-Korrekturen sind nur teilweise im Entwurf angekommen
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentRunPanel.tsx:197
Status: [OFFEN]
Runde 2 übernimmt F01 und F11 sichtbar (Vault-Notizen zusätzlich, kein automatischer Ablagevorschlag) und schränkt F03 in der Fußzeile auf Ergebnisdateien ein. F02 bleibt beim Modell-/Anbieter-Etikett offen, F04 beim Einrichtungszustand, F05 bei fehlendem Gedächtnis offen. Vor allem fehlt jede Antwort auf die zweite Produktfrage F06–F09: Die Ergebniskarte zeigt weiter das pauschale „Quellen“ für `r.sources`, ohne den Unterschied zwischen aufgelistet, gelesen, exportiert und belegter Aussage (`AgentRunPanel.tsx:191–199`; `skills.ts:301–318,433–459`). Auch die sofortige Rechner-/Shell-Wirkung steht nicht an der neuen Befugniszeile (`loop.ts:88–93`).
Vorschlag: Im 3a-Entwurf mindestens Ergebniszustand und Quellenwortlaut mitzeichnen: „Gelesene/aufgelistete Eingaben – kein Beleg für einzelne Aussagen“, für Web „abgerufene Seiten“, für XLSX `Quelldatei`/Lücken. Bei Shell/Rechner direkt am Schalter die Wirkung vor Übernahme nennen.

### F13 — Cloud-Etikett verwechselt Modellhersteller mit Übertragungsweg
Schwere: hoch
Stelle: app/src/main/index.ts:10585
Status: [OFFEN]
Claudes Vorab-Beobachtung stimmt: Der Agent-Cloud-Pfad routet ausschließlich über OpenRouter oder LLMBase (`index.ts:4564–4570,10588–10596`; `main/llm/chatClient.ts:29–35`). „claude-sonnet-4.5 · Cloud (Anthropic)“ beschreibt daher den Datenweg falsch. Der Renderer kennt den gewählten Provider bereits (`AgentView.tsx:69–79,145–149`); eine Modellbezeichnung allein belegt weder einen direkten Anthropic-Vertrag noch den tatsächlich ausführenden Endpunkt. Auch „lokal“ bleibt ohne `resolveLocalModel` im Agent-Pfad unbewiesen (F02).
Vorschlag: Etikett aus der echten Route ableiten: „Cloud über OpenRouter/LLMBase · Modell <Name> · Inhalte verlassen den Rechner“ bzw. „Ollama/LM Studio · Lokalität nicht geprüft“, solange die Prüfung fehlt. Hersteller nur als Modellherkunft und nur bei verifizierter Metadatenbasis nennen.

### F14 — Bilddienst ist ein eigener Datenweg, aber Verfügbarkeit ist keine Nutzung
Schwere: mittel
Stelle: app/src/main/index.ts:4637
Status: [OFFEN]
Claudes Hinweis stimmt im Kern: `generate_image` wird unabhängig von Web angeboten, wenn Modul und Imagen-Key vorhanden sind (`index.ts:4637–4646`; `loop.ts:214–219`); das Werkzeug ruft Google auf (`skills.ts:949–975`). Der Agent entscheidet erst im Lauf, ob er es nutzt (`loop.ts:135–139`). Ein fixes Etikett „Bilder: Google“ könnte daher fälschlich aktive Übertragung behaupten, ein fehlendes Etikett könnte sie verschweigen. Auch bei lokalem Textmodell kann ein aus Unterlagen abgeleiteter Bildprompt zu Google gehen.
Vorschlag: Zustand „Bildgenerierung verfügbar: Google – bei Nutzung geht der Bildauftrag an Google“ anzeigen; wenn Modul/Key fehlen, „nicht verfügbar“ oder ausblenden. Nach dem Lauf tatsächliche Nutzung aus dem Werkzeugprotokoll ausweisen.

### F15 — „Alle aus = nur Vault“ ist doppelt falsch
Schwere: hoch
Stelle: app/src/renderer/components/Shared/ContextAttachmentRow.tsx:116
Status: [OFFEN]
Auch ohne Web/Shell/Rechner kann der Nutzer Dateien und Ordner außerhalb des Vaults über den Systemdialog anhängen (`ContextAttachmentRow.tsx:116–121`; `contextFiles.ts:32–37`). Zusätzlich sind Cloud-Modell und Google-Bilder von diesen drei Schaltern unabhängig (`AgentView.tsx:145–169`; `index.ts:4637–4646`). „Nur Vault“ klingt sowohl wie eine Eingabegrenze als auch wie eine Lokalitätsgarantie. Der Entwurf korrigiert F01 im Unterlagen-Text, widerspricht ihm aber rechts in der Befugniszeile.
Vorschlag: „Web, Shell und Rechner aus“ statt „nur Vault“; darunter tatsächliche Anhänge/Vault-Suche und Datenwege getrennt ausweisen.

### F16 — Beispiel 1 verspricht Gruppierung und Spaltenübernahme, die `collect_table` nicht leistet
Schwere: hoch
Stelle: app/src/shared/tableCollect.ts:300
Status: [OFFEN]
`collect_table` übernimmt jede passende Eingabezeile einzeln, filtert sie und ergänzt `Quelldatei` (`tableCollect.ts:323–347`; `contextFiles.ts:786,852–855`). Es gibt weder Gruppierung/Deduplizierung „eine Zeile pro Klasse“ noch „Spalten wie in der ersten Tabelle“ als automatische Schemaübernahme: das Modell muss die gewünschten Spalten nach 2–3 Stichproben selbst angeben (`loop.ts:59–62`; `skills.ts:394–419`). Bei mehreren Rückmeldungen pro Klasse wird das Beispiel still zu mehreren Zeilen. Shell könnte aggregieren, verlangt aber separate Freigabe und einen anderen Weg.
Vorschlag: Beispiel auf „führe gleichartige Rückmelde-Tabellen zeilenweise zusammen; behalte die Spalten X/Y/Z und ergänze die Quelldatei“ ändern. „Eine Zeile pro Klasse“ nur mit implementierter Gruppierungsregel samt Konfliktbehandlung anbieten.

### F17 — Beispiele 2 und 3 sind ohne Eingabestruktur keine verlässlichen Einsteigeraufträge
Schwere: mittel
Stelle: app/src/main/noteAgent/contextFiles.ts:54
Status: [OFFEN]
Beispiel 2 kann als begrenzte Text-Zusammenfassung funktionieren, aber der Ordner-Reader liefert Dateien abschnittsweise/gekürzt (`contextFiles.ts:62–66,416–495`); Datumswahl, „offen“ und „erledigt“ sind Modellurteile, keine geprüfte Filterung. Beispiel 3 ist bei einer einzelnen Personalliste besonders riskant: der normale XLSX-Reader hat Zeilen-/Zeichenbudgets (`contextFiles.ts:55–61`), `collect_table` ist nur mit Ordner-Anhang verfügbar (`loop.ts:197–205`), seine Filter kennen nur `nicht_leer`, `enthaelt`, `gleich`, `datum_zwischen` (`shared/tableCollect.ts:223–276`). „Vertrag beendet, Elternzeit und Abordnung nicht“ klappt deterministisch nur, wenn klare Status- und Datumsspalten vorhanden sind; eine semantische Gesamtauswertung ist damit nicht garantiert.
Vorschlag: Beispiele als „geeignet, wenn …“ mit Struktur und Umfang formulieren: Protokolle als angehängte, lesbare Dateien; Personalliste mit Spalten `Enddatum` und eindeutigem Status `Vertrag beendet`, bei großen Daten als Ordner-Tabelle. Bei Lücken/Teil-Lesen eine sichtbare unvollständige Ausgabe verlangen.

### F18 — Beispiel 4 setzt mehr voraus als „Mail + Rundbrief“
Schwere: mittel
Stelle: app/src/main/noteAgent/contextFiles.ts:68
Status: [OFFEN]
Claude hat recht, dass der Agent keinen direkten Mail-Client-Leser hat: `note_read` liest `.md` (`telegram/agent/tools/notes.ts:81–102`), die Anhang-Registry unterstützt auch kein `.eml` (`contextFiles.ts:68–85`). Claudes Formulierung „wenn der Mail-Client sie abgelegt hat“ ist noch zu weit: der Store erzeugt Vault-Notizen nur für analysierte, hinreichend relevante Mails (`emailStore.ts:616–639`), nicht für jede Mail. Ein vorhandener Rundbrief kann als Datei angehängt werden; `write_docx` kann einen Brief ohne Vorlage erzeugen (`skills.ts:676–695,756–777`), erzwingt aber weder eine Seite noch stilistische Treue. Eine Vorlage ist nur nötig, wenn Briefkopf/Platzhalter erhalten bleiben sollen (`skills.ts:712–750`).
Vorschlag: Beispiel „Hänge die als Notiz gespeicherte Mail und einen früheren Rundbrief an; entwirf einen Brieftext von höchstens etwa einer Seite“ nennen. Für exakten Briefkopf die Vorlage mitgeben; kein garantiertes Seitenlimit behaupten.

### F19 — Personendaten im Cloud-Beispiel brauchen konkrete Datenweg-Transparenz
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:145
Status: [OFFEN]
Claudes Vorabfrage ist berechtigt, aber „Opt-in“ allein ist keine Erklärung für Beispiel 3: Die Cloud-Route ist zwar pro Feature freigeschaltet (`shared/llmBackend.ts:114–121,155–169`), der konkrete Lauf sendet Auftrag, gelesene Anhänge/Notizen und Werkzeugergebnisse an den gewählten Cloud-Provider (`AgentView.tsx:145–169`; `loop.ts:233–247`; `translations.ts:1187`). Eine Personalliste enthält gerade die Daten, deren Übertragung der Einsteiger einschätzen muss. Bei `collect_table` gelangen zwar nicht alle Datenzeilen zum Modell, wohl aber Stichproben/Berichte (`loop.ts:59–62`; `skills.ts:456–459`). Die Karte darf daher weder „alle Daten gehen“ noch „nichts geht“ pauschal behaupten.
Vorschlag: Beim gewählten Cloud-Weg an Unterlagen/Modell konkret „Personendaten aus Auftrag und gelesenen Unterlagen können an <Provider> gehen; Tabellen-Zusammenführung überträgt Stichproben/Berichte“ anzeigen. Lokales Modell als Wahl anbieten; keine neue pauschale Sperre aus dem Entwurf ableiten.

### F20 — Plattform- und Einrichtungszustand brauchen getrennte Regeln
Schwere: mittel
Stelle: app/src/renderer/stores/uiStore.ts:591
Status: [OFFEN]
Claudes `macOnly`-Beobachtung stimmt für die beiden Module (`uiStore.ts:591–592`); `modules.ts:24–45,75–79` entfernt sie auf Windows/Linux aus der Modulliste und meldet sie deaktiviert. Dort darf die Karte keine funktionsfähigen Shell-/Rechner-Schalter zeigen. Auf macOS sind Modul aus, Modul an aber unkonfiguriert, pro Lauf aus, pro Lauf angefragt und erst nach nativer Freigabe aktiv verschiedene Zustände: Main prüft Modul, Sandbox bzw. verfügbare Vorgänge und Modell erst beim Start (`index.ts:4484–4527,4690–4702,4718–4746`). Der gestrichelte „Rechner · Einrichten“-Schalter allein bildet das nicht ab; Web braucht ebenfalls Modul plus Provider/Key (`AgentView.tsx:97–110,268–281`; `index.ts:4614–4623`).
Vorschlag: Plattformschalter nur auf macOS zeigen. Auf macOS/bei Web zuerst „Modul einschalten“ bzw. „Anbieter/Vorgänge einrichten“ als Einstellungslink, danach erst den Lauf-Schalter; native Freigabe und eventuelle Main-Ablehnung ausdrücklich als Startschritt anzeigen.

### F21 — Startknopf-Priorität und Gedächtnis-Status bleiben unklar
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:140
Status: [OFFEN]
Im gezeigten Leerzustand fehlen Auftrag und Zielordner. „Auftrag fehlt noch“ ist als erste Anleitung vertretbar, aber die gelbe Ablagezeile darf dann keinen scheinbar einzigen Blocker suggerieren; `canRun` verlangt beides, zusätzlich Vault und keinen laufenden Auftrag (`AgentView.tsx:140–144`). Der Entwurf legt keine Reihenfolge bei mehreren Fehlern fest. „Agent-Gedächtnis wird berücksichtigt“ ist im leeren Vault ebenfalls zu stark: `readAgentMemory` kann `''` liefern, dann entfällt der Gedächtnisblock vollständig (`skillsLoader.ts:182–193`; `loop.ts:104–110`).
Vorschlag: Knopfzustände explizit ordnen: zuerst „Auftrag eingeben“, dann „Zielordner wählen“, danach „Starten“; mehrere fehlende Schritte in den Zeilen markieren. Gedächtnis nur bei vorhandenem Inhalt „Wird berücksichtigt“, sonst „Noch keine Regeln“; Kürzung sichtbar machen.

### Empfehlung Runde 2
Die Designerin sollte zuerst das falsche „nur Vault“, das Cloud-Etikett und die fehlende Sofortwirkung korrigieren. Danach die vier Beispiele auf tatsächlich verfügbare Eingabeformate und Operationen zuschneiden, besonders Gruppierung und Personalliste. Plattform, Modul und Konfiguration als getrennte Zustände zeichnen; Bilddienst und Gedächtnis nur zustandsabhängig etikettieren. Eine Ergebnis-Karte mit ehrlicher Eingabe-/Abrufliste ergänzen, damit F06–F09 nicht aus dem Entwurf verschwinden.

## Claude-Antwort

### Runde 1 — Antwort (Claude)
F01–F11 geprüft und als tragend übernommen (u.a. `loop.ts:160` note_search über den ganzen Vault,
`contextFiles.ts:854` Spalte „Quelldatei“, `skillsLoader.ts:179` Gedächtnis ist Markdown mit 6000-Zeichen-Kappe,
Rechner-Dialog `index.ts:4741` „wirken sofort“). Daraus Designrückmeldung an Claude Design (14 Punkte + Zustandsliste).

### Runde 2 — überarbeiteter Entwurf „3a Auftragskarte“ (Text-Wiedergabe, zur Prüfung)
Untertitel: „leerer Zustand mit Beispielen, Befugnisse als Einzelschalter, Datenwege als Etiketten“.
- Eingabefeld leer, Platzhalter „Was soll entstehen – aus welchen Unterlagen?“; darunter Hilfe: „Der Agent fragt
  nicht nach, er trifft Annahmen. Gute Aufträge nennen: was entstehen soll (Tabelle, Notiz, Brief), welcher
  Zeitraum, wie etwas zählt.“
- „BEISPIELE ZUM ANPASSEN“, vier Kacheln mit Etiketten Unterlagen/Ergebnis:
  1. „Führe alle Rückmelde-Tabellen in diesem Ordner zu einer Excel-Liste zusammen – eine Zeile pro Klasse,
     Spalten wie in der ersten Tabelle.“ · Unterlagen: Ordner Rückmeldungen · Ergebnis: Excel-Liste
  2. „Fasse die Protokolle vom 1. bis 30. September 2026 zu einer Notiz zusammen: offene Aufgaben mit Name und
     Frist, Erledigtes weglassen.“ · Unterlagen: Ordner Protokolle · Ergebnis: Notiz
  3. „Liste alle Lehrkräfte auf, die im Schuljahr 2025/26 (1.8.2025–31.7.2026) ausgeschieden sind. Ausgeschieden
     heißt: Vertrag beendet – Elternzeit und Abordnung zählen nicht.“ · Unterlagen: Personalliste · Ergebnis: Tabelle
  4. „Entwirf aus der Mail der Schulleitung vom 18.9. einen Brief an das Kollegium, höchstens eine Seite, Ton wie im
     letzten Rundbrief.“ · Unterlagen: Mail + Rundbrief · Ergebnis: Brief
- Unterlagen: „Noch nichts angehängt“ + „Angehängte Dateien und Ordner. Passende Notizen aus deinem Vault kann der
  Agent zusätzlich lesen.“ · „+ hinzufügen“
- Ablage (gelb): „Zielordner fehlt noch – Hier landen die Ergebnisse – das muss nicht der Ordner der Unterlagen
  sein.“ · Knopf „Anderen wählen“ (kein Vorschlag mehr)
- Befugnisse: Schalter „Web“ (aus), „Shell“ (aus), „Rechner · Einrichten“ (gestrichelt); rechts „alle aus = nur Vault“
- Modell: „claude-sonnet-4.5“ + Etikett „Modell: Cloud (Anthropic)“ · „ändern ▾“
- Gedächtnis: „Agent-Gedächtnis wird berücksichtigt · ansehen“
- Fußzeile: „Ergebnisdateien kommen erst in deinen Vault, wenn du sie übernimmst.“ · Knopf deaktiviert „Auftrag fehlt noch“

Claudes Vorab-Beobachtungen (gegenprüfen):
- Agent-Cloud läuft nur über OpenRouter/LLMBase (`main/llm/chatClient.ts:29`, `resolveCloudChatOptions` in
  `index.ts:4565`) — „Cloud (Anthropic)“ wäre ein falsches Etikett; Anbieter = Weg, nicht Modellhersteller.
- Etikett „Bilder: Google“ fehlt, obwohl `imageGen` unabhängig von Web aktiv ist, sobald Modul + Schlüssel da
  (`index.ts:4640–4645`).
- Beispiel 3 (Personalliste) im gezeigten Zustand mit Cloud-Modell: Personendaten gingen an den Cloud-Anbieter —
  braucht die Karte hier einen Hinweis (Opt-in + Transparenz, kein Sperren)?
- Beispiel 4 „Mail der Schulleitung“: Mails liegen nur als Notizen im Vault vor, wenn der Mail-Client sie
  abgelegt hat — Beispiel setzt ein Modul voraus.
- Shell/Rechner sind `macOnly` — auf Windows/Linux Schalter ganz weglassen.

## Status

Diskussion angefragt 23.09.2026.
