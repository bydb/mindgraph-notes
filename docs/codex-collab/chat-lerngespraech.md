# Lerngespräch: sich mit Petrol einem neuen Thema nähern

Stand: Entwurf, 25.10.2026, Claude. Noch kein Code. Prüfung durch Codex und Entscheidungen des Nutzers stehen aus.

## Aufgabe

### Ausgangslage (Nutzer, 25.10.2026, sinngemäß)

> Ein Chat, mit dem man sich einem neuen Thema nähert und aus dem später ein Auftrag werden kann. Er soll
> sich wirklich wie ein Gespräch anfühlen. Weil die App auch in der Bildung genutzt wird, soll man damit
> lernen und sich weiterbilden können. Chat und Auftrag kürzen viel ab. Analog arbeite ich anders: Ich schreibe
> mein Wissen in Notizen auf, lese und annotiere Papers und arbeite dann klassisch von vorne nach hinten
> weiter, bis ein Ergebnis da ist, das aus meinem Wissen entstanden ist. Mein eigener kognitiver Anteil ist
> dabei sehr hoch. Dieser neue Weg soll sich anders anfühlen.

### Kernfrage

Wie bekommt der Petrol-Chat eine Arbeitsweise, in der **die Person das Denken tut** und das Modell
Gesprächspartner, Lotse und Prüfer ist? Und wie wird aus so einem Gespräch ein Auftrag, ohne dass der
Auftrag die eigene Arbeit nachträglich ersetzt?

### Was „anders empfunden“ heißen soll (Arbeitsdefinition)

Der jetzige Chat ist ein **Antwortweg**: Man fragt und bekommt fertigen Text. Der neue Weg soll ein
**Denkweg** sein:

1. Am Ende steht **ein Text der Person**, nicht ein Verlauf des Modells.
2. Man sieht jederzeit, **was man selbst formuliert hat** und was übernommen wurde.
3. Das Gespräch geht in kleinen Schritten. Es fragt zurück, lässt erst einmal selbst versuchen und
   prüft das Verständnis. Die fertige Antwort bekommt man trotzdem, wenn man sie ausdrücklich will.
   Bevormundung ist kein Ziel.
4. Der Übergang zum Auftrag baut auf **dem eigenen Stand** auf (eigene Gliederung, eigene Fragen, eigene
   Notiz) und nicht auf dem Chatverlauf.

## Kontext/Anker

### Was es schon gibt

- **Petrol-Chat, Stufe 1:**
  - Systemtext: `app/src/main/llm/petrolChatPrompt.ts:12` (`PETROL_CHAT_SYSTEM_PROMPT`).
  - Verwendung: `app/src/main/index.ts:6528` und `:7447`.
  - Oberfläche: `app/src/renderer/components/Agent/PetrolChat.tsx` (823 Zeilen).
  - Verlauf: `app/src/renderer/stores/petrolChatStore.ts`. Er liegt nur im Speicher; Tab schließen
    verwirft ihn.
- **Sokratischer Modus und Prüfer-Modus („grill“) im Notiz-Chat:** `app/src/main/index.ts:6496` und
  `:6510`, doppelt bei `:7415` und `:7429`. Beide hängen an Notizkontext (`${context}`). Der sokratische
  Prompt ist starr („IMMER genau EINE Rückfrage“, „NIEMALS die Antwort“). Das trägt kein Gespräch über
  ein Thema, das man noch gar nicht kennt: Wer nichts weiß, kann auf Rückfragen nicht antworten.
- **Websuche mit Quellenprüfung im Chat:**
  - Umsetzung: `main/llm/petrolWebChat.ts`, `shared/webChat.ts`.
  - Nachfrage zu einer Antwort: `petrolWebFollowUp.ts`.
  - Übergabe „Im Agenten neu recherchieren …“: `PetrolChat.tsx:420` (`applyResearch`).
  - Übergabe „Notiz mit Petrol ausarbeiten …“: `PetrolChat.tsx:392–403` (`makeTaskText`/`applyMakeTask`).
- **Speichern als Notiz:** `PetrolChat.tsx:326` (`saveAsNote`, exklusiv über `write-file-new`).
- **Karteikarten und Spaced Repetition:** `renderer/stores/flashcardStore.ts:44` (`addFlashcard(s)`).
- **Vault-Index (lokal, mit Belegen):** `main/rag/vaultRetrieve.ts`, Werkzeug `vault_search`. Damit
  ließen sich eigene Notizen und annotierte Papers in das Gespräch holen, wenn die Person das ausdrücklich
  will.
- **Leitwerte (Memory „Vision & Leitwerte“):**
  - Mensch im Zentrum, KI schlägt vor, ruhige Oberfläche, lokal zuerst.
  - Strategie „prüfbarer Arbeitsablauf“: Herkunft sichtbar machen.

### Was die Lernforschung dazu sagt

Das ist bewusst knapp gehalten und nennt nur Befunde, auf die sich das Design stützt. Es ist keine Literaturarbeit.

- **Generieren schlägt Lesen** (Generation Effect, Slamecka & Graf 1978): Was man selbst formuliert, behält man besser.
- **Abrufen schlägt Wiederlesen** (Testing Effect, Roediger & Karpicke 2006): Abfragen ist Lernen und
  nicht nur Kontrolle.
- **Selbsterklären** (Chi u. a. 1994) und **erwünschte Erschwernisse** (Bjork): Was sich leicht anfühlt,
  wird oft schlecht behalten.
- **ICAP** (Chi & Wylie 2014): Interaktiv vor konstruktiv vor aktiv vor passiv. Fertige Chatantworten lesen ist „passiv“.
- **KI-spezifisch:** Bastani u. a. (PNAS 2025, „Generative AI without guardrails can harm learning“)
  untersuchten Mathematik an Gymnasien.
  - Freier GPT-Zugang verbesserte die Übungsleistung, verschlechterte aber die Prüfungsleistung ohne KI.
  - Eine Tutor-Variante mit Leitplanken (Hinweise statt Lösungen) hob diesen Schaden weitgehend auf.
  - Das ist die stärkste mir bekannte Einzelstudie für genau diese Frage. Übertragbarkeit auf
    Erwachsenenbildung und Wissensarbeit: offen.

**Folgerung für das Design:** Nicht die Antwort verweigern, sondern die **Reihenfolge** ändern. Erst
selbst versuchen, dann Hilfe. Erst eigene Formulierung, dann Abgleich.

## Entwurf

### 1. Ein Gesprächsmodus „Erkunden“ neben dem normalen Chat

Er ist ein Schalter im Chat (Arbeitsname **„Erkunden“**, alternativ „Lernen“ oder „Selbst denken“). Er ist
kein dritter Tab-Modus neben Chat | Auftrag. Er verändert drei Dinge:

**a) Haltung des Modells (eigener Systemtext `PETROL_EXPLORE_PROMPT`).** Es arbeitet in Phasen, aber
ohne sie aufzusagen:

1. **Ankommen.** Zu Beginn gibt es eine Frage zu Ziel und Vorwissen: „Wofür brauchst du das, was weißt du schon?“
   - Überspringbar.
   - Die Antwort steuert die Tiefe des Gesprächs.
2. **Landkarte.** Es gibt einen groben Überblick in 3 bis 5 Teilgebieten, kurz und als Angebot („Womit
   willst du anfangen?“), nicht als Vortrag.
3. **Kleine Schritte.** Pro Antwort kommt **ein** Gedanke, höchstens etwa 150 Wörter. Danach folgt ein
   Denkanstoß:
   - eine Vorhersagefrage („Was vermutest du, passiert, wenn …?“),
   - eine Bitte um eigene Worte
   - oder ein Beispiel zum Prüfen.
4. **Erst versuchen lassen.** Bei Verständnisfragen kommt zuerst ein Hinweis, auf Wunsch die Erklärung.
   - „Sag es mir einfach“ wirkt immer, ohne Belehrung.
   - Das ist die Leitplanke aus Bastani u. a.: Hinweis vor Lösung, aber keine Verweigerung.
5. **Zurückspiegeln.** Formuliert die Person etwas in eigenen Worten, bekommt sie eine ehrliche Rückmeldung:
   - was trägt,
   - was ungenau ist,
   - was fehlt.
   - Kein Lob-Geplänkel (wie im Prüfer-Modus).
6. **Unsicherheit benennen.** Es gelten die Regeln von Stufe 1 (nichts erfinden). Für Fakten, Zahlen
   und Zitate verweist das Modell auf den Globus oder die eigenen Unterlagen.

**b) Länge und Rhythmus.** Kürzere Antworten und genau eine Frage am Ende. Das fühlt sich wie ein Gespräch an,
nicht wie ein Nachschlagewerk.

**c) Sichtbare Haltung in der Oberfläche.**
- Statuszeile „Erkunden: Petrol fragt zurück und lässt dich zuerst selbst überlegen.“
- Andere Beispielkarten:
  - „Ich will verstehen, wie …“
  - „Erklär mir die Grundbegriffe von …“
  - „Prüf mein Verständnis von …“
  - „Ich lese gerade ein Paper über …“

### 2. „Meine Notiz“ neben dem Gespräch

Das ist das Kernstück, das den Weg anders anfühlen lässt.

- Rechts neben dem Gespräch liegt eine **schmale Notizfläche der Person**, auf breiten Fenstern daneben,
  auf schmalen als Reiter.
  - Dort schreibt die Person ihren Stand mit: Begriffe, eigene Erklärungen, offene Fragen.
  - Das ist das analoge Notizbuch neben dem Gesprächspartner.
- **Herkunft pro Absatz:**
  - Selbst Getipptes ist „eigen“.
  - Was per Knopf aus einer Petrol-Antwort übernommen wird, landet als markiertes Zitat
    (`> [Petrol] …` oder ein Callout „Von Petrol übernommen“).
  - So bleibt sichtbar, was die eigene Leistung ist. Das schließt an die vorhandene KI-Provenienz an.
- **Kein Zähler, der bewertet.** Eine Anzeige „Eigenanteil 73 %“ ist verlockend, misst aber Wörter, nicht
  Denken, und lädt zum Spielen ein. Vorschlag: nur die Kennzeichnung im Text, keine Prozentzahl.
  (Entscheidung E4.)
- **Speichern** als normale Notiz im Vault, wie gewohnt:
  - Frontmatter mit Thema und Datum, optional `type: lerngespraech`.
  - Kein Transkript, sondern **die Notiz der Person**.
  - Das Gespräch kann als eingeklappter Anhang mitkommen (Entscheidung E5).
- **Das Modell sieht die Notiz nur, wenn die Person es will:**
  - Knopf „Petrol soll meine Notiz lesen“.
  - Dann bekommt das Modell genau diesen Text, gerahmt als Nutzertext.
  - Damit sind möglich: „Prüf, ob das stimmt“, „Was fehlt noch?“, „Frag mich dazu ab“.
  - Die Zusage „liest keine Notizen von selbst“ bleibt wahr, weil es eine ausdrückliche Handlung ist.
  - Die Statuszeile muss das sagen.

### 3. Abfragen und Wiederholen: an vorhandene Karteikarten anschließen

- **„Frag mich ab“ im Gespräch:**
  - Das Modell stellt Fragen zu dem, was besprochen wurde und in „Meine Notiz“ steht.
  - Es deckt erst nach der eigenen Antwort auf.
  - Das ist der Prüfer-Modus, aber gegen die eigene Notiz statt gegen eine fremde.
- **Karteikarten:**
  - Die Person formuliert Karten selbst. Petrol darf vorschlagen, die Person übernimmt einzeln.
  - Die Karten gehen über `addFlashcards` in die vorhandene Wiederholung.
  - So kommt das Thema in den nächsten Tagen wieder, ohne neuen Mechanismus.
  - Vorgeschlagene Karten tragen die Herkunft „vorgeschlagen“.

### 4. Lesen und Annotieren einbinden statt ersetzen

Analoges Arbeiten heißt auch: Papers lesen. Der Chat soll dahin führen, nicht davon weg.

- **Leseaufträge statt Zusammenfassung.**
  - Mit Globus schlägt Petrol Seiten vor: „Lies auf dieser Seite den Abschnitt über X, dann erzähl mir,
    was du davon mitnimmst.“
  - Die Antwort darauf geht ins Gespräch und in die Notiz.
  - Die geprüfte Webantwort bleibt verfügbar, wenn man sie will.
- **Eigene Unterlagen:** Im Vault annotierte Papers (Lesemodus-Annotationen, Zotero-Notizen) kann die
  Person ausdrücklich einbeziehen:
  - „Sprich mit mir über meine Notizen zu …“
  - Das läuft über den Vault-Index, lokal, mit Belegstelle.
  - Das ist eine spätere Stufe, weil damit Notizinhalt ins Modell geht und der Cloud-Weg mitgedacht
    werden muss (siehe Stufe-1-Entscheidung F09 in `chat-und-agent.md`).

### 5. Vom Gespräch zum Auftrag: auf dem eigenen Stand aufbauen

Der Auftrag kürzt ab, das ist gewollt. Er soll aber **die eigene Arbeit weiterführen, nicht ersetzen**.

- Knopf **„Aus meiner Notiz einen Auftrag machen …“**.
  - Der Auftragsentwurf enthält die Gliederung, die Fragen und die Begriffe aus „Meine Notiz“, nicht den
    Chatverlauf.
  - Vorgeschlagene Formulierung: „Arbeite auf Grundlage meiner Notiz. Behalte meine Gliederung und
    meine Formulierungen. Ergänze nur, was ich als offene Frage markiert habe, und kennzeichne alles
    Ergänzte.“
- **Ergebnis als Vorschlag** wie immer: Karte, Übernehmen oder Verwerfen.
  - Neu wäre: Das Ergebnis zeigt, was aus der eigenen Notiz stammt und was der Agent ergänzt hat.
  - Ob das technisch zuverlässig geht (Wortabgleich wie bei `analyzeCitations`), ist offen. Es gehört
    in eine eigene Stufe.
- Der Agent bekommt die Notiz als **angehängte Datei** über den vorhandenen Weg. Der Datenweg ist auf
  der Karte sichtbar.

### Was bewusst nicht vorgesehen ist

- **Keine Gamification:** keine Punkte, Abzeichen, Serien. Das passt nicht zur ruhigen Oberfläche und
  verschiebt das Ziel vom Verstehen zum Sammeln.
- **Kein Zwang:** Es gibt keinen Lehrer-Modus, der Antworten sperrt. Wer die Antwort will, bekommt sie
  mit einem Satz. Ausnahme wäre ein späterer, ausdrücklich eingerichteter Prüfungsmodus für Lehrkräfte,
  der hier nicht vorgesehen ist.
- **Keine Bewertung der Person:** Rückmeldungen beziehen sich auf Aussagen, nicht auf die Person. Ein
  Urteil gibt es nur auf Wunsch („Bilanz“), wie im Prüfer-Modus.

## Stufen (Vorschlag)

| Stufe | Inhalt | Voraussetzung |
|---|---|---|
| **E1** | Schalter „Erkunden“, eigener Systemtext, Statuszeile und Beispielkarten, kürzere Antworten | keine; nur Prompt und Oberfläche |
| **E2** | „Meine Notiz“ neben dem Gespräch: Herkunft pro Absatz, Übernehmen als Zitat, Speichern, „Petrol soll meine Notiz lesen“ | E1 |
| **E3** | „Frag mich ab“ gegen die eigene Notiz, Karteikarten selbst formulieren oder vorgeschlagen übernehmen | E2 |
| **E4** | Auftrag aus der eigenen Notiz, Ergebnis mit Kennzeichnung „aus deiner Notiz / ergänzt“ | E2, Stufe 2 von `chat-und-agent.md` |
| **E5** | Eigene Unterlagen (Vault-Index) ins Gespräch holen, Leseaufträge mit Globus | E2, Datenweg-Klärung für Cloud |

**Gespräch fortsetzen:** Ohne gespeicherten Verlauf endet das Lerngespräch mit dem Tab. Für ein Thema, an
dem man über Tage arbeitet, ist das zu wenig. „Meine Notiz“ (E2) ist hier der dauerhafte Anker: Man kann
am nächsten Tag mit der Notiz weitermachen. Ein gespeicherter Chatverlauf (Stufe 2 in
`chat-und-agent.md`) wäre danach ein eigenes Thema.

## Messen, bevor es als „funktioniert“ gilt

Memory: Erst messen, dann tunen.

- **Prompttreue mit dem lokalen Standardmodell** (qwen3.8:27b) und einem kleinen Modell (qwen3.5:4b):
  - 10 Einstiege, je 3 Gesprächszüge, mit einem Skript gegen Ollama.
  - Gezählt wird: Antwortlänge, genau eine Frage am Ende, keine fertige Lösung vor dem Versuch, „Sag es
    mir einfach“ wird befolgt.
  - Eine Messgröße, die im Skript zählbar ist, und kein Bauchgefühl.
- **Gesprächsgefühl:** Das misst kein Skript. Es braucht eine Probe durch den Nutzer und, wenn möglich,
  durch eine Lehrkraft oder einen Studierenden mit einem echten neuen Thema.
- **Lernwirkung:** In der App nicht messbar. Das wird auch nicht behauptet. Wenn die Website oder der
  Changelog etwas sagen, dann nur „unterstützt Lernstrategien wie Selbsterklären und Abfragen“ und kein
  „man lernt besser“.

## Offene Entscheidungen (Nutzer)

- **E1 Name und Ort:** Schalter im Chat („Erkunden“/„Lernen“/„Selbst denken“) oder eigener dritter Modus
  im Umschalter?
- **E2 Standard:** Startet ein neuer Chat in der normalen oder in der Erkunden-Haltung? Gibt es eine
  Einstellung für Bildungsinstallationen?
- **E3 Strenge:** Hinweis vor Lösung als Voreinstellung, mit „Sag es mir einfach“ als Ausweg (Vorschlag)?
  Oder strikt sokratisch wie der bestehende Modus?
- **E4 Eigenanteil:** nur Kennzeichnung im Text (Vorschlag) oder zusätzlich eine Zahl?
- **E5 Was wird gespeichert:** nur „Meine Notiz“ (Vorschlag) oder die Notiz plus Gesprächsverlauf
  eingeklappt?
- **E6 Reihenfolge:** E1 und E2 zusammen bauen (Vorschlag: E1 allein fühlt sich nur wie ein anderer
  Prompt an, erst „Meine Notiz“ macht den Weg anders) oder E1 zuerst zum Ausprobieren?

## Codex-Findings

<!-- Codex schreibt hier. -->

## Claude-Antwort

<!-- Claude antwortet hier je Finding. -->

## Status

Entwurf, 25.10.2026. Wartet auf die Entscheidungen E1 bis E6 und eine Codex-Prüfung des Entwurfs. Kein Code.
