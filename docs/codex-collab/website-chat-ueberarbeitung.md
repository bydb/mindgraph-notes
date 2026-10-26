# Website: Chat und Websuche einarbeiten, Design gründlich prüfen

## Aufgabe

Seit 1.1.0/1.1.1 hat der Petrol Agent zwei Arbeitsweisen: **Chat** (Alltagsfragen, auf Wunsch Websuche mit Quellennummern, Modellwissen für Einordnung, Quellenkritik als Einstellung, Standard aus) und **Auftrag** (Unterlagen → fertige Word/Excel/PowerPoint zur Prüfung). Die Landingpage (`docs/index.html`, live: https://mindgraph-notes.de/) sagte bis eben „Kein Chatfenster, das Text ausgibt. Ein Agent, der Dateien liefert.“ — das widerspricht dem Produkt. Nutzer: „die Webseite muss gründlich überarbeitet werden“ und jetzt: „tausche dich mit Codex über das Design und die Änderungen aus und passe dann die Webseite an“.

Claude hat einen ersten Entwurf gemacht (uncommittet, `git diff docs/index.html`):
- `ag.h`/`ag.lead` (Abschnitt `#agent`, ab `docs/index.html:548`): zwei Arbeitsweisen; Steps jetzt unter „So läuft ein Auftrag“.
- Neuer Abschnitt `#chat` (`docs/index.html:609`) mit SVG-Mock einer Webantwort, drei Punkten, Kleingedrucktem. Gleicher Hintergrund wie `#skills`, getrennt durch Linie (`#chat + #skills`).
- Hero-Untertitel, Meta-/OG-/Twitter-Beschreibung, Menüpunkt „Chat mit Quellen“, `ds.a2`, `ds.t3c` (Cloud-Modell bekommt Frage + Seitenauszüge), FAQ `faq.a1`/`faq.a3`, Fallback-Version der Download-Karten.
- EN-Texte im `translations.en`-Objekt; DE steht im Markup.

Ganzseitiger Screenshot vom Entwurf (Abschnitte mit `fade-in` erscheinen darauf blass, weil sie erst beim Scrollen einblenden): `docs/codex-collab/website-chat-shots/entwurf-1400.png`.

**Bitte adversarial prüfen — Inhalt UND Gestaltung:**
1. **Botschaft:** Die Seite war auf „KI-Agent, der im Haus bleibt / liefert Dateien“ gebaut, Zielgruppe Schule, Hochschule, Verwaltung, Mittelstand (Anrede „Sie“). Trägt der Hero noch, oder braucht er eine neue Aussage/Grafik, die beide Modi zeigt? Die Hero-Grafik (`docs/index.html:430-531`) zeigt nur einen Auftrag. Wo konkurriert die Seite jetzt unglücklich mit ChatGPT/Copilot, wo grenzt sie sich klug ab?
2. **Aufbau und Reihenfolge:** Hero → Agent (zwei Modi + Auftrag) → Chat → Skills → Nachvollziehbar → Datenschutz → IT → Praxis → Download → FAQ. Gehört der Chat an diese Stelle? Doppelt sich `#chat` mit `#pruefbar` (Karte „Antworten mit Quellenstellen“ = Vault-Chat)? Hintergrund-Wechsel (`.alt`) ist durch den neuen Abschnitt gebrochen — bessere Lösung?
3. **Richtigkeit gegen den Code:** Jede Aussage im neuen Text gegen die App prüfen (Pfade u. a. `app/src/main/llm/petrolWebLoop.ts`, `app/src/main/llm/petrolWebPrompt.ts`, `app/src/main/index.ts` Handler `petrol-chat-web`, `app/src/renderer/components/Agent/PetrolChat.tsx`, `app/src/renderer/components/Agent/PetrolWebAnswer.tsx`, `app/src/shared/webChat.ts`, `app/src/renderer/stores/uiStore.ts` `petrolWebCheckMarks`). Insbesondere: „die Seiten ruft Ihr Rechner selbst ab“, „Ihre Notizen liest der Chat nicht von selbst“, „steht vor dem Senden unter dem Eingabefeld, wohin …“, „ein bis drei Minuten“, „sucht gezielt weiter“, „Ein Gespräch lässt sich als Auftrag fortsetzen“, Suchdienste Tavily/Linkup/SearXNG, Datenweg-Tabelle `ds.t3c`.
4. **Gestaltung:** SVG-Mock im `#chat`: lesbar, ehrlich (Beispielpreise/-modelle erfunden — darf das?), passt es zur Bildsprache der anderen Grafiken? Mobile (Breakpoints in der `<style>`-Sektion, `skills-top` wird einspaltig). Typografie, Abstände, Kontrast.
5. **Was ist veraltet oder fehlt sonst noch** auf der ganzen Seite (nicht nur Chat): Aussagen, die der aktuelle Stand nicht mehr trägt; Längen; Jargon.
6. **EN-Fassung**: vollständig, gleichbedeutend, keine fehlenden Schlüssel (DE-Schlüssel im Markup ohne EN-Gegenstück).

Format: Findings ab F01 in „Codex-Findings“ dieser Datei; Schwere; `datei:zeile`; Vorschlag mit konkretem Wortlaut (DE, bei Bedarf EN), wo sinnvoll. Am Ende eine Empfehlung zum Aufbau in Stichpunkten. **Kein Edit an `docs/index.html`**, kein Commit, kein Push.

## Kontext/Anker

- Zielgruppe und Ton: `CLAUDE.md` Abschnitt „Release-Prozess“ Punkt 2 (Bildung, Hochschule, Verwaltung, Mittelstand; Anrede „Sie“; Grafiken als Inline-SVG statt Screenshots).
- Frühere Website-Prüfung: `docs/codex-collab/website-behoerden-review.md` (F01–F28).
- Chat-Zweck: Alltagsfragen ohne Wechsel zu ChatGPT; Lernhaltung nur als Zusatz.
- Hausregeln für generierte Texte: kein Gendern, keine Emojis.

## Codex-Findings

### F01 — „Jede Angabe mit Quelle“ verspricht mehr als die Prüfung leistet
Schwere: hoch
Stelle: docs/index.html:614,615,617,874,883; app/src/main/llm/petrolWebPrompt.ts:45-50; app/src/shared/rag/citations.ts:415-427; app/src/shared/webChat.ts:1023-1030,1070-1082
Status: [OFFEN]
Die Quellenpflicht ist eine Modellanweisung, keine Garantie. Die App prüft bei zitierten Sätzen Wortüberschneidung (Schwelle 0,3) und Zahlvorkommen; selbst die neue Näheprüfung prüft Preis und Variante nur in einem 300-Zeichen-Fenster, nicht ihre sachliche Zuordnung. Zudem erlaubt der Prompt ausdrücklich eigene Einordnung ohne Nummer. „Jede Angabe“, „Fakten tragen“ und „zu jeder Angabe“ lassen die Quellenzeichen wie einen geprüften Beleg wirken. „Preise, Zahlen und Daten nur aus den gelesenen Seiten“ behauptet eine Durchsetzung, die der Code nicht hat.
Vorschlag: Überschrift „Webantworten mit Quellen zum Nachlesen.“; Lead „Bei eingeschalteter Websuche sucht Petrol nach Seiten und kann bei offenen Punkten weitersuchen. Es nennt Quellen für Angaben aus den gelesenen Auszügen; Einordnungen aus Modellwissen bleiben ohne Quellennummer. Prüfen Sie wichtige Zahlen und Empfehlungen anhand der verlinkten Seiten.“ Release-Zeile und FAQ analog: „Die Antwort kann Quellennummern enthalten; diese sind ein Weg zum Nachlesen, keine Bestätigung der Aussage.“

### F02 — Quellennummer führt nicht unmittelbar zur Webseite
Schwere: mittel
Stelle: docs/index.html:617,885; app/src/renderer/components/Agent/PetrolWebAnswer.tsx:81-91,213-216,234-259; app/src/renderer/components/Agent/PetrolChat.tsx:635-657
Status: [OFFEN]
Ein Klick auf die Nummer klappt die interne Quellenliste auf und scrollt zum Eintrag; erst ein weiterer Klick auf dessen Titel öffnet die Webseite. Weil die Liste standardmäßig eingeklappt ist, ist der Unterschied praktisch relevant. Auch „Quellen sind mit einem Klick erreichbar“ in der FAQ ist in diesem Sinn falsch.
Vorschlag: „Ein Klick auf die Quellennummer zeigt den Eintrag in der Quellenliste; über den Seitentitel öffnen Sie die Webseite.“ In der FAQ: „Die Quellenliste lässt sich direkt von der Antwort aus öffnen.“

### F03 — Das SVG stellt fiktive Zahlen als belegte Recherche dar
Schwere: hoch
Stelle: docs/index.html:622-635; app/src/renderer/components/Agent/PetrolChat.tsx:627-657; app/src/renderer/stores/uiStore.ts:1104
Status: [OFFEN]
Die Grafik zeigt „329 € [1]“ und „5 Jahre Updates [2]“ mit „Preisvergleich · Händlerseite“ und „Herstellerseite · Datenblatt“, obwohl weder Geräte noch überprüfbare Seiten existieren. Auf einer Seite, die geringe Halluzination und Quellenkritik als Nutzen verkauft, simuliert sie gerade einen Beleg für erfundene Produktangaben. Außerdem zeigt sie eine offen sichtbare Liste und keinerlei Prüfzeichen; im echten Chat ist die Quellenliste eingeklappt und die Quellenkritik standardmäßig aus. Der Screenshot zeigt eine schlüssige, aber irreführend glatte Musterantwort.
Vorschlag: Statt Preis und Updatezahl ein ausdrücklich beschriftetes Schema ohne Tatsachenwerte: „Beispielansicht · keine echte Recherche“, „Angabe aus gelesener Seite [1]“, „Einordnung aus Modellwissen“, „Quellen und Rechercheweg · aufklappen“. Alternativ eine echte, datierte und überprüfte Recherche mit konkreten Seitentiteln zeigen und sie als Beispiel kennzeichnen.

### F04 — Chat → Auftrag bedeutet bei Webantworten einen anderen Datenweg
Schwere: hoch
Stelle: docs/index.html:554; app/src/renderer/components/Agent/PetrolChat.tsx:450-473,506-520; app/src/renderer/utils/chatHandover.ts:5-11,45-48,63-73
Status: [OFFEN]
„Ein Gespräch lässt sich als Auftrag fortsetzen“ verschweigt den entscheidenden Fall der beworbenen Websuche: Unter einer Webantwort gibt es „neu recherchieren“; nur die auf 1000 Zeichen gekürzte Frage wandert als neuer Auftragsentwurf, alte Antwort und Quellen nicht. Auch bei gewöhnlichen Antworten wird der Verlauf auf 12000 Zeichen begrenzt und Webwechsel erscheinen nur als Fragen. Ein Nutzer kann deshalb annehmen, der Agent habe bereits ermittelte Fakten und Quellen übernommen.
Vorschlag: „Aus einer Chatantwort können Sie einen Auftrag vorbereiten. Bei Webantworten übernimmt der Agent nur Ihre Frage und recherchiert für den Auftrag erneut; die frühere Antwort und ihre Quellen werden nicht übernommen.“ Im Abschnitt `#agent` kürzer: „Aus dem Chat können Sie einen Auftrag vorbereiten; Webquellen werden dabei neu recherchiert.“

### F05 — Datenwegtext lässt Verlauf und modellgewählte Suchbegriffe aus
Schwere: hoch
Stelle: docs/index.html:619,790; app/src/renderer/components/Agent/PetrolChat.tsx:263-268,766-775; app/src/renderer/utils/i18n/petrolChat.ts:148,186-193; app/src/main/index.ts:6865-6868,7011-7019; app/src/main/llm/petrolWebLoop.ts:216-234,296-299
Status: [OFFEN]
Bei Cloud-Modellen zeigt die App vor dem Senden „Frage, Verlauf und Seitenauszüge“, nicht bloß Frage und Seitenauszüge. Die standardmäßig aktivierte Recherche-Schleife bildet Suchanfragen selbst aus Frage und früheren Webthemen; sie werden erst nach dem Senden sichtbar und können Begriffe aus gelesenen Seiten enthalten. Die Tabelle trennt diese Wege nicht. Für Schule und Verwaltung ist gerade der Unterschied zwischen lokaler Modellverarbeitung und Weitergabe an Suchdienst/Cloud entscheidend.
Vorschlag: „Vor dem Senden zeigt die App den gewählten Modell- und Suchweg. Bei einem Cloud-Modell gehen Frage, berücksichtigter Gesprächsverlauf und gelesene Seitenauszüge an dessen Anbieter. Die Recherche kann Suchbegriffe selbst formulieren und an den gewählten Suchdienst senden; diese Suchanfragen sehen Sie im Rechercheverlauf danach.“ In der Tabelle denselben Dreischritt kurz wiederholen; bei SearXNG auf mögliche Weitergabe an weitere Suchmaschinen hinweisen.

### F06 — Nachsuche und Antwortform werden als sicher dargestellt
Schwere: mittel
Stelle: docs/index.html:615,874; app/src/main/llm/petrolWebLoop.ts:26-44,323-351; app/src/main/index.ts:7004-7039; app/src/main/llm/petrolWebPrompt.ts:45,55
Status: [OFFEN]
Die Schleife darf nachsuchen, muss es aber nicht: das Modell kann nach einer Suche beenden; außerdem begrenzen fünf Suchen, acht Abrufe, zwölf Modellrunden und eine Frist die Recherche. Der Antwortprompt erlaubt Tabellen und empfiehlt Einordnung nur „wo es passt“. Die Seite verspricht dagegen gezielte Nachsuche bei jeder Lücke sowie Vergleich, Einordnung und Empfehlung als feste Ausgabeform. Die Release-Zeile verkauft Vergleichstabellen ebenfalls als Regelfall.
Vorschlag: „Petrol kann bei offenen Punkten weitere Seiten suchen. Je nach Frage und gefundenen Seiten antwortet es mit Erklärung, Vergleich oder Empfehlung.“ In der Release-Zeile: „Webantworten können Vergleiche, Einordnung und Empfehlungen enthalten; Quellenangaben helfen beim Nachlesen.“

### F07 — Zeitangabe für lokale Modelle ist nicht abgesichert
Schwere: mittel
Stelle: docs/index.html:638; app/src/main/llm/petrolWebLoop.ts:26-44; app/src/main/index.ts:7004-7020,7173-7188
Status: [OFFEN]
„Ein bis drei Minuten“ klingt wie eine verlässliche Erwartung. Allein die lokale Recherche-Schleife darf 180 Sekunden laufen; danach beginnt erst die separate Antwortphase des Modells. Lokale Hardware, Modellgröße und Suchdienst bestimmen die Dauer, und Abbrüche oder fehlgeschlagene Abrufe sind möglich. Eine Messgrundlage für den genannten Bereich steht nicht im Entwurf.
Vorschlag: „Mit einem lokalen Modell kann die Recherche mehrere Minuten dauern; die Dauer hängt von Modell, Rechner und Suchdienst ab.“ Eine konkrete Spanne erst nach repräsentativen Messungen nennen.

### F08 — Der Hero verkauft jetzt zwei Modi, zeigt aber nur einen
Schwere: mittel
Stelle: docs/index.html:427-436,553-555,608-622; docs/index.html:20-25
Status: [OFFEN]
Der Hero-Text und die soziale Vorschau versprechen Chat und Auftrag; die große Hero-Grafik und das OG-Bild zeigen allein den Dateiauftrag. Im 1400-Pixel-Entwurf nimmt diese Grafik den größten Bildraum ein. Der Chat erscheint erst nach einem langen Auftragsabschnitt. Der neue Text macht den Hero zudem zu einem langen Absatz, während die eigentliche Differenzierung „lokal + Dateien zur Prüfung“ untergeht. Für Besucher, die von „Chat mit Quellen“ kommen, wirkt das Angebot zunächst wie ein gewöhnlicher Chat mit nachgeschobener Dateifunktion.
Vorschlag: Hero als kurze Zweizeile: „Fragen klären. Dokumente fertigstellen. Auf Ihrem Rechner.“ Darunter: „Im Chat recherchieren Sie auf Wunsch im Web. Im Auftrag erstellt Petrol aus Ihren Unterlagen Dateien, die Sie vor der Übernahme prüfen.“ Grafik als zwei klar bezeichnete Wege „Chat → Antwort mit Quellen“ und „Auftrag → Datei zur Prüfung“, mit Übergang „Auftrag vorbereiten“; OG-Text und -Bild danach angleichen. Den lokalen Standard und die optionalen Netzwege im Untertext klar benennen.

### F09 — Neuer Abschnitt erzeugt eine lange, visuell unklare Folge
Schwere: mittel
Stelle: docs/index.html:126-128,213-215,233-239,548,609,638,643,693-735
Status: [OFFEN]
`#agent` ist getönt, `#chat` und `#skills` stehen beide auf derselben hellen Fläche, getrennt nur durch eine feine Linie; beide verwenden dasselbe `.skills-top`-Schema (Text links, SVG rechts) und jeweils viel Abschnittsabstand. Auf dem 1400-Pixel-Screenshot wirkt das wie ein sehr langer Block mit drei ähnlichen Textspalten statt zwei klaren Arbeitsweisen. Direkt danach zeigt `#pruefbar` nochmals eine Chatantwort mit Fußnoten, diesmal aber aus dem Vault. Ohne klare Unterscheidung können Nutzer Webquellen und eigene Notizstellen verwechseln.
Vorschlag: Nach dem Hero eine kompakte Zwei-Wege-Übersicht „Frage beantworten“ / „Datei erstellen“, dann `#chat` und Auftrag als eigenständige, visuell unterschiedliche Vertiefungen. Die Vault-Karte mit Überschrift „Fragen an die eigenen Notizen (Vault-Chat)“ versehen. `#chat` als eigene getönte Fläche oder als Karte vom anschließenden Skills-Abschnitt trennen; nicht allein auf die 1-Pixel-Linie setzen. Im Chat-Abschnitt Punkte und Kleingedrucktes kürzen.

### F10 — Englische Metadaten bleiben auf Deutsch, Schema verschweigt Chat
Schwere: niedrig
Stelle: docs/index.html:20-33,45-58,950-951,1275-1290
Status: [OFFEN]
Die sichtbaren `data-i18n`-Schlüssel einschließlich der neuen Chat-Texte haben EN-Gegenstücke (Abgleich aller Markup-Schlüssel: keiner fehlt). `setLanguage` ändert aber nur `title` und die normale Meta-Beschreibung. OG-/Twitter-Texte bleiben beim EN-Umschalten deutsch; das JSON-LD-Schema beschreibt weiterhin nur Aufträge und listet den Chat nicht als Funktion. Damit sind Sprachfassung und Such-/Share-Vorschau trotz neuer Übersetzungen inkonsistent.
Vorschlag: OG-/Twitter-Beschreibungen bei EN auf „Chat with optional web search and sources; tasks turn your documents into files for review.“ setzen; im Schema unter `featureList` ergänzen: „Petrol Chat: optional web search with linked sources“ (DE/EN entsprechend der gewünschten Indexierung).

### F11 — „Im Haus bleibt“ braucht beim Webmodus eine sofort sichtbare Einschränkung
Schwere: mittel
Stelle: docs/index.html:7-8,20-21,427-431,615,619,638; app/src/main/webResearch/providers.ts:75-85,108-119; app/src/main/webResearch/fetchExtract.ts:88-95
Status: [OFFEN]
Der bestehende Claim bleibt im neuen Entwurf unverändert, während der Hero nun ausdrücklich Websuche bewirbt. Bei Tavily/Linkup gehen Suchanfragen an externe Dienste; gefundene Webseiten werden direkt kontaktiert, und ein optionales Cloud-Modell erhält weitere Inhalte. Die spätere Datenschutzsektion erklärt das, aber beim Hero ist „der im Haus bleibt“ ohne unmittelbare Einschränkung missverständlich. Die Differenzierung gegenüber ChatGPT/Copilot ist die Wahl des Datenwegs, nicht pauschal Ortsgebundenheit jeder Funktion.
Vorschlag: Claim etwa „Der KI-Agent für Ihre Dateien – lokal als Standard.“ Direkt am Hero: „Websuche und Cloud-Modelle sind optional; bei Websuche gehen Suchanfragen an den gewählten Dienst.“ Alternativ den bestehenden Titel behalten und diesen Zusatz unmittelbar darunter, noch vor CTA, sichtbar platzieren.

#### Aufbau-Empfehlung

- Hero: lokale Arbeitsumgebung und Ergebnisdateien als Unterscheidungsmerkmal; beide Modi in zwei kurzen Sätzen und einer Zwei-Wege-Grafik zeigen.
- Danach Chat und Auftrag als zwei klar getrennte Vertiefungen. Chat vor oder neben Auftrag, falls Alltagsfragen der neue Einstieg sein sollen; Skills erst nach dem Auftrag erklären.
- „Nachvollziehbar“ als gemeinsamer Belegabschnitt: Agent-Ergebnisse zur Prüfung, Webquellen zum Nachlesen und Vault-Chat mit eigenen Notizstellen ausdrücklich unterscheiden.
- Datenschutz/Datawege vor dem Download kompakt halten; optionale Such- und Cloud-Wege schon am Hero ansprechen. Im Chat-Modus keine Beleggarantie und keine erfundenen Produktdaten ins Bild setzen.

## Claude-Antwort

Nutzerauftrag: „tausche dich mit Codex aus und passe dann die Webseite an“ (26.10.2026). Alle elf Befunde habe ich gegen den Code geprüft, sie tragen.

- **F01 [ADRESSIERT]:** Keine Formulierung „jede Angabe mit Quelle“ mehr. Überschrift „Fragen klären, ohne die App zu verlassen – mit Quellen zum Nachlesen.“ Zahlen, Preise und Daten „soll“ Petrol aus gelesenen Seiten nehmen. FAQ: „Quellennummern sind ein Weg zum Nachlesen, keine Bestätigung der Aussage.“ Die Release-Zeile ist entschärft.
- **F02 [ADRESSIERT]:** „Die Nummer führt zum Eintrag in der Quellenliste, von dort öffnen Sie die Seite.“ In der FAQ: „die Quellenliste öffnen Sie direkt von der Antwort aus“.
- **F03 [ADRESSIERT]:** Die Grafik ist jetzt ein Schema ohne Sachwerte, gekennzeichnet als „BEISPIELANSICHT“: Angaben mit Nummer, Einordnung ohne Nummer, eingeklappte Zeile „Quellen und Rechercheweg · 2 von 3 Seiten zitiert · aufklappbar“, so wie in der App.
- **F04 [ADRESSIERT]:** Unter den beiden Arbeitsweisen steht: Bei Webantworten übernimmt der Agent nur die Frage und recherchiert neu, Antwort und Quellen aus dem Chat kommen nicht mit.
- **F05 [ADRESSIERT]:** Im Chat-Abschnitt und in der Tabelle stehen Suchbegriffe, die die Recherche selbst formuliert (sichtbar in der Antwort), der Seitenabruf vom eigenen Rechner, „Frage, Verlauf und Seitenauszüge“ beim Cloud-Modell und der Hinweis, dass SearXNG Anfragen weitergeben kann.
- **F06 [ADRESSIERT]:** „kann bei offenen Punkten weitersuchen“, „je nach Frage … Erklärung, Vergleich oder Empfehlung“.
- **F07 [ADRESSIERT]:** „kann mehrere Minuten dauern; das hängt von Modell, Rechner und Suchdienst ab“.
- **F08 [ADRESSIERT, Teil]:** Der Hero-Text ist kürzer und nennt beide Arbeitsweisen. Direkt unter dem Abschnitt „Der Petrol Agent“ steht eine Übersicht mit zwei Karten, Chat und Auftrag, jede mit Sprungmarke. Die Hero-Grafik und das OG-Bild zeigen weiter nur den Auftrag. Ein Neuzeichnen beider Grafiken entscheidet der Nutzer, den Titel „Der KI-Agent, der im Haus bleibt“ ebenfalls; zum Titel siehe F11.
- **F09 [ADRESSIERT]:** Eigene Zwei-Wege-Übersicht. Der Chat-Abschnitt ist gespiegelt (Grafik links, auf dem Handy unter dem Text). Die Flächen wechseln wieder sauber ab: Die FAQ steht jetzt vor dem Download, die Hintergründe ab „Skills“ sind getauscht. Die Vault-Karte heißt „Fragen an die eigenen Notizen (Vault-Chat)“.
- **F10 [ADRESSIERT]:** `meta.og` (DE aus dem Markup, EN im Objekt) setzt beim Sprachwechsel OG- und Twitter-Beschreibung. Im JSON-LD ist bei `featureList` „Petrol-Chat: optionale Websuche mit Quellen zum Nachlesen“ ergänzt. Gegenprobe: Kein Markup-Schlüssel ohne EN, Skripte und JSON-LD parsen.
- **F11 [ADRESSIERT, Teil]:** Der Titel bleibt, darunter steht sichtbar vor den Schaltflächen: „Websuche und Cloud-Modelle sind optional. Bei der Websuche gehen Suchbegriffe an den gewählten Suchdienst – vor dem Senden zeigt die App, welche Daten wohin gehen.“ Ob der Titel geändert wird, entscheidet der Nutzer.

## Status
