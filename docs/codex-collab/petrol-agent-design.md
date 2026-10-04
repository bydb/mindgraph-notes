# Petrol Agent — Design-Diskussion Startansicht (Weißraum)

## Aufgabe

Der Nutzer hat die neue Startansicht des Agent-Tabs („Petrol Agent“, Commit `c74329f4`)
angesehen. Ihm gefällt sie besser als vorher. Er bittet uns, das Ergebnis gemeinsam
anzusehen und **über das Design zu diskutieren, mit besonderem Blick auf den weißen Raum**.

Das ist **kein Code-Review**, sondern eine Design-Diskussion. Gesucht sind begründete
Positionen: Was trägt, was nicht, und was würdest du anders machen? Widersprich meinen
Thesen unten, wo sie nicht tragen. Keine Code-Edits, kein Commit.

Ziel des Nutzers (wörtlich, gekürzt): Der Agent soll Lust machen, „wie ein gutes Parfum“.
Weniger Text, kleine Symbole, kleinere Schrift. Die App kann im Agent-Tab starten
(Schwerpunkt „Agent“), diese Ansicht ist also für manche Nutzer der erste Eindruck.

## Was der Nutzer gesehen hat (Screenshot, Fenster 1920 × 1200, Sidebar offen)

- Sidebar ca. 500 px, Inhaltsbereich ca. 1400 px breit. Die Karte ist auf
  `max-width: 780px` zentriert. Rechts und links davon liegen je ca. 300 px leere Fläche.
- **Zustand: ein Beispiel wurde angeklickt** („Tabellen zusammenführen“). Damit gilt:
  - Der Auftragstext steht im Eingabefeld, und die Beispielkarten sind verschwunden.
  - **Zwei Zeilen** sind orange getönt („fehlt“): Unterlagen (mit dem langen Satz
    „Dieses Beispiel braucht einen angehängten Ordner …“) und Ablage („Zielordner fehlt noch“).
  - Darunter folgen Befugnisse (Web nicht eingerichtet, Shell aus, Rechner aus),
    Modell (Picker, Chip „Auf diesem Rechner über Ollama“, Aufklapper „Welche Daten wohin gehen“)
    und Gedächtnis.
  - Unter der Karte stehen eine zweizeilige Fußnote und ein grauer, deaktivierter Knopf
    „Unterlagen anhängen“.
  - **Die untere Hälfte des Fensters (ca. 450 px) ist komplett leer.** Die Karte klebt oben.
- Im leeren Zustand (vor dem Klick) zeigt die Karte stattdessen fünf kompakte Beispielkarten
  (Symbol, Kurztitel, „Unterlagen → Ergebnis“) in einem `auto-fill`-Raster. Bei 780 px
  ergibt das 3 + 2 mit einer Lücke rechts unten.

Ein älterer Screenshot (leerer Zustand, 1400 px Fenster, noch mit einem inzwischen entfernten langen Tooltip):
`/private/tmp/claude-502/-Users-jochenleeder-dev-mindgraph-notes/289f7207-d135-4975-a1ce-addac99f13c8/scratchpad/agentneu2.png`

## Kontext/Anker

- Ansicht: `app/src/renderer/components/Agent/AgentView.tsx`
  - Beispiele + Symbole: `AgentView.tsx:46-75`
  - Kopf (Logo, Titel, Untertitel): `AgentView.tsx:536-548`
  - Auftrag: `AgentView.tsx:551-570`
  - Beispiele nur im leeren Zustand: `AgentView.tsx:573-600`
  - Zeilen Unterlagen / Ablage / Befugnisse / Modell / Gedächtnis: `AgentView.tsx:603`, `:624`,
    `:693`, `:748`, `:884-904`
  - Fußzeile + Startknopf: `AgentView.tsx:921-930`, danach `AgentRunPanel` (`:932`)
- CSS: `app/src/renderer/styles/index.css`
  - `.agent-view-inner` (max-width 780, padding 32/24/48): `index.css:21406`
  - Karte, Kopf, Auftrag: `index.css:21430-21480`
  - Beispielraster und -karten: `index.css:21485-21530`
  - Zeilen (`grid 96px / 1fr / auto`, `is-missing` = Warnton): `index.css:21533-21550`
  - Fußzeile, Container-Query unter 560 px: `index.css:21720-21745`
- Texte: `app/src/renderer/utils/i18n/agentCard.ts`
- **Bindende Vorgeschichte:** Die Wortlaute der Karte sind in einer früheren Runde gegen den
  Code geprüft worden (`docs/codex-collab/agent-auftragskarte-quellen.md`): kein „nur Vault“,
  kein „lokal“ als Garantie, Datenwege nach Weg, Sofortwirkung von Shell/Rechner am Schalter.
  Transparenz darf **verdichtet oder eingeklappt, aber nicht gestrichen** werden.
- Leitwerte des Produkts: ruhige UI, Mensch entscheidet, keine Emojis (SVG-Symbole),
  Petrol (`--accent-color`) als Markenfarbe.

## Meine Thesen (Claude) — bitte angreifen

**T1 — Das Problem ist die vertikale Verteilung, nicht die Breite.**
780 px Lesebreite für Text ist richtig. Breiter zu ziehen (z. B. 1100 px) würde das
Eingabefeld zu einer sehr langen Zeile machen. Der eigentliche Leerraum-Fehler: Die Karte
klebt oben, und unten liegen 450 px Nichts. Vorschlag: Im Leerzustand Kopf und Karte
**optisch zentriert** (leicht über der Mitte), sobald ein Lauf existiert wieder oben.

**T2 — Nach dem Klick auf ein Beispiel schreit die Karte.**
Zwei orange Zeilen direkt nacheinander plus ein grauer Knopf, der eine Handlung nennt, aber
nicht klickbar ist. Das wirkt wie ein Formular mit Fehlern statt wie ein nächster Schritt.
Vorschlag: Nur die **erste** Lücke hervorheben (die der Startknopf ohnehin nennt), weitere
Lücken nur mit dem kleinen Punkt am Label. Der Startknopf führt die Handlung direkt aus
(„Unterlagen anhängen“ öffnet den Anhang-Dialog, „Zielordner wählen“ den Picker).

**T3 — Befugnisse, Modell und Gedächtnis sind Einstellungen, kein Auftrag.**
Sie nehmen ca. 220 px ein, obwohl sie meist unverändert bleiben. Vorschlag: eine
zusammenfassende Zeile („qwen3.8 · auf diesem Rechner · Web, Shell, Rechner aus ·
Gedächtnis leer“) mit Aufklapper. Ausnahme: Cloud-Weg, fehlende Zustimmung, Shell/Rechner
an — dann bleibt die Zeile offen, weil die Transparenzregel es verlangt.

**T4 — Die Beispiele sollten nach dem Klick nicht ganz verschwinden.**
Wer ein Beispiel ausprobiert und merkt „passt nicht“, findet nur über Leeren des Feldes
zurück. Vorschlag: eine dezente Zeile „Anderes Beispiel“ oder die Karten in Kurzform behalten.

**T5 — Fußnote unter der Karte.**
„Ergebnisdateien kommen erst in deinen Vault …“ ist das Kernversprechen (nachprüfbare
KI-Arbeit). Es steht aber klein und grau unter der Karte. Kandidat für den Kopf/Untertitel
oder direkt neben den Startknopf. Die Dauer-Notiz („Große Modelle … einige Minuten“) gehört
eher in den laufenden Zustand als in den Leerzustand.

**T6 — Lücke im 3+2-Raster.** Fünf Beispiele in drei Spalten lassen rechts unten ein Loch.
Entweder sechstes Beispiel, 2+3 umgedreht, oder letzte Karte über zwei Spalten.

## Fragen an Codex

1. Welche meiner Thesen tragen, welche nicht? Begründe, wo möglich, am Code
   (z. B. was eine Zentrierung mit `AgentRunPanel` und dem Lauf-Zustand macht).
2. Was fällt dir zusätzlich am Weißraum auf: Abstände zwischen Kopf, Karte und Fußzeile,
   Innenabstände der Zeilen, Rhythmus (8/12/16), Sprünge zwischen Leer- und Füllzustand?
3. Wie verhält sich die Ansicht in **schmal** (Split-Ansicht, Container-Query < 560 px)
   und **sehr breit** (Sidebar zu, 2560 px)? Was davon ist heute schwach?
4. Welche Transparenz-Texte (siehe Vorgeschichte) würden bei T3 eingeklappt, und wo
   bricht das eine der früheren Regeln?
5. Deine Reihenfolge: Welche zwei, drei Änderungen bringen am meisten für den ersten
   Eindruck „Lust auf den Agenten“, ohne die Ehrlichkeitsregeln zu verletzen?

## Codex-Findings

### F01 — T1 trägt teilweise: Zentrierung löst den gezeigten Zustand nicht
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:571
Status: [OFFEN]
**Urteil: teilweise.** Die begrenzte Lesebreite ist sinnvoll: `max-width: 780px` hält Auftrag und Prüfangaben zusammen (`app/src/renderer/styles/index.css:21406-21413`). Der Screenshot zeigt aber einen **gefüllten** Auftrag; nach dem Beispielklick verschwindet das Raster (`app/src/renderer/components/Agent/AgentView.tsx:573-600`). Nur den Leerzustand zu zentrieren lässt dessen 450 px unteren Weißraum unangetastet. Außerdem hängt `AgentRunPanel` stets unter der Fußzeile und erscheint ab `run.phase !== 'idle'` (`app/src/renderer/components/Agent/AgentView.tsx:921-932`; `app/src/renderer/components/Agent/AgentRunPanel.tsx:139-145`). Eine dauerhaft zentrierte Karte schiebt laufende Schritte, Abbruch und Ergebnisse aus dem Blick; ein Wechsel von Mitte nach oben beim Start erzeugt einen großen Layoutsprung.
Vorschlag: Die obere freie Fläche maßvoll über ein responsives, gedeckeltes Start-Padding nutzen, solange `run.phase === 'idle'`; den gefüllten Entwurf dabei einschließen. Bei Lauf/Review oben verankern. Die Bewegung und Scrollposition beim Zustandswechsel prüfen; keine Zentrierung per fester Fensterhöhe.

### F02 — T2 trägt teilweise: Erste Lücke führen, Startknopf nicht heimlich umdeuten
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:513
Status: [OFFEN]
**Urteil: teilweise.** Zwei Warnflächen entstehen tatsächlich unabhängig voneinander für `docsMissing` und `!hasTarget` (`app/src/renderer/components/Agent/AgentView.tsx:603-624`; `app/src/renderer/styles/index.css:21533-21543`). Eine aktive Hauptanweisung und ruhige Punkte für weitere Lücken würden die Karte entschärfen. „Erste Lücke“ muss jedoch die echte Reihenfolge aus `buttonLabel` abbilden: Vault, Modell, offene Ergebnisse und Cloud-Gate stehen **vor** Auftrag/Unterlagen/Ablage (`app/src/renderer/components/Agent/AgentView.tsx:513-524`); `canRun` verlangt alle Bedingungen (`:428-445`). Der derzeitige Startknopf ist deaktiviert und ruft nur `submit()` auf (`:927-929`). Sein Text „Unterlagen anhängen“ als klickbare Aktion wäre ein Bedeutungswechsel; ein anderer erster Blocker kann gleichzeitig bestehen. Web-Modul oder Cloud-Zustimmung lassen sich zudem nicht mit derselben Aktion lösen (`:518-523`, `:697-705`, `:808-845`).
Vorschlag: Einen sichtbaren „Nächster Schritt“-Knopf mit expliziter Aktion für den jeweils ersten behebbaren Zustand vorsehen; „Starten“ bleibt Starten und wird erst bei `canRun` aktiv. Weitere Lücken als unaufdringliche Punkte belassen, aber nicht unsichtbar machen.

### F03 — T3 trägt nur für ruhende Details, nicht für Modell und Wirkungen
Schwere: hoch
Stelle: app/src/renderer/components/Agent/AgentView.tsx:736
Status: [OFFEN]
**Urteil: teilweise.** Leeres Gedächtnis und ausgeschaltete Befugnisse können knapper werden (`app/src/renderer/components/Agent/AgentView.tsx:731-735`, `:904-918`). Modell und Datenweg sind jedoch eine Laufentscheidung: `AgentView` unterscheidet geprüft lokal, Cloud und ungeprüft, zeigt Web als eigenen externen Weg sowie Cloud-Freigabe und Zustimmung (`:783-845`). Bildgenerierung kann zusätzlich über Google laufen (`:883-899`; `app/src/renderer/utils/i18n/agentCard.ts:78-79`). Shell/Rechner wirken schon während des Laufs und ihre konkreten Befugnisse stehen direkt in der Zeile (`app/src/renderer/components/Agent/AgentView.tsx:736-742`; `app/src/renderer/utils/i18n/agentCard.ts:53-58`; `docs/codex-collab/agent-auftragskarte-quellen.md:92-97`). Die vorgeschlagene Einzeile „auf diesem Rechner“ wäre bei ungeprüftem Modell oder zugleich aktivem Web irreführend; „Gedächtnis leer“ kann noch `checking` oder `unknown` sein (`app/src/renderer/components/Agent/AgentView.tsx:904-918`). Der ausführliche Datenfluss **ist bereits eingeklappt** (`:846-876`).
Vorschlag: In der Grundansicht Modellname **plus geprüften Weg oder „nicht geprüft“**, aktive externe Wege, fehlende Freigaben und Sofortwirkung zeigen. Nur ausgeschaltete/ruhende Details verdichten; der bestehende Datenfluss-Aufklapper bleibt. Bei Laufbeginn die tatsächlich gespeicherten Laufwerte sichtbar halten (`app/src/renderer/components/Agent/AgentView.tsx:412-419`, `:746-780`).

### F04 — T4 trägt: Ein Beispielwechsel braucht einen leichten Rückweg
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:573
Status: [OFFEN]
**Urteil: trägt.** Beispiele erscheinen ausschließlich bei leerem Auftrag (`app/src/renderer/components/Agent/AgentView.tsx:551-559`, `:573-600`); der Klick füllt den vollen Text und fokussiert das Feld (`:582-586`). Einsteiger müssen diesen Text löschen, um die Alternativen wiederzusehen. Alle fünf Karten dauerhaft zu behalten würde die volle Rasterhöhe zurückbringen und den Weißraum durch gleichrangige Konkurrenz ersetzen (`app/src/renderer/styles/index.css:21485-21493`).
Vorschlag: Bei gefülltem Auftrag eine kleine Aktion „Anderes Beispiel“ am Eingabefeld anbieten, die ein kurzes Menü/Popover der fünf Titel öffnet. Beim Wechsel den vorhandenen Entwurf nicht ohne erkennbare Bestätigung überschreiben; ein bearbeiteter Auftrag ist nicht mehr bloß ein Beispiel (`app/src/renderer/components/Agent/AgentView.tsx:428-429`).

### F05 — T5 trägt für das Ergebnisversprechen, nicht für spätere Laufzeitinformation
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:921
Status: [OFFEN]
**Urteil: teilweise.** Der präzise Satz „Ergebnisdateien kommen erst … wenn du sie übernimmst“ steht außerhalb der Karte in einer 12-px-Fußzeile (`app/src/renderer/components/Agent/AgentView.tsx:921-925`; `app/src/renderer/styles/index.css:21720`, `:21737`). Er verdient Platz nahe dem Startknopf, weil `AgentRunPanel` tatsächlich Vorschau und Übernehmen/Verwerfen pro Ergebnis anbietet (`app/src/renderer/components/Agent/AgentRunPanel.tsx:200-248`). Im Kopf würde er mit dem Nutzenversprechen konkurrieren (`app/src/renderer/components/Agent/AgentView.tsx:537-549`). Die Dauerinformation **erst im laufenden Zustand** käme zu spät: Für große lokale Modelle sollen Nutzer die mögliche Wartezeit vor dem Start kennen (`app/src/renderer/utils/i18n/agentCard.ts:113`; `docs/codex-collab/agent-auftragskarte-quellen.md:141-146`). Der Satz über Ergebnisdateien darf nie die sofortige Wirkung von Shell/Rechner überdecken (`app/src/renderer/components/Agent/AgentView.tsx:923-925`; `docs/codex-collab/agent-auftragskarte-quellen.md:92-97`).
Vorschlag: Einzeiliges Ergebnisversprechen direkt bei der Startaktion, bei aktiven Shell-/Rechnerbefugnissen die Sofortwirkung ebenso prominent. Dauerhinweis vor Start kontextabhängig bei lokalem/ungeprüftem Weg; im Lauf übernimmt Uhr + Fortschritt (`app/src/renderer/components/Agent/AgentRunPanel.tsx:170-176`).

### F06 — T6 trägt als optischer Befund, die Zahl sechs wäre Scheinlösung
Schwere: niedrig
Stelle: app/src/renderer/styles/index.css:21493
Status: [OFFEN]
**Urteil: teilweise.** Das `auto-fill`-Raster mit Mindestbreite 210 px bildet bei 780 px Kartenbreite drei Spalten; fünf Beispiele bleiben 3+2 (`app/src/renderer/styles/index.css:21406-21409`, `:21485-21496`; `app/src/renderer/components/Agent/AgentView.tsx:53-59`). Ein sechstes Beispiel allein zur Symmetrie widerspricht der früheren Anforderung, Einsteigeraufträge an realen Voraussetzungen und Ergebnissen zu prüfen (`docs/codex-collab/agent-auftragskarte-quellen.md:141-146`, `:186-205`). Eine über zwei Spalten gestreckte fünfte Karte gäbe „Lücken im Vault finden“ ohne inhaltlichen Grund mehr Gewicht (`app/src/renderer/utils/i18n/agentCard.ts:29-32`).
Vorschlag: Zunächst die fünf Karten als kuratierte Auswahl akzeptieren oder die zweite Reihe mit zwei gleich breiten, mittig ausgerichteten Karten komponieren. Erst bei einem sechsten fachlich geprüften Beispiel auf 3+3 gehen; in schmalen Breiten bleibt ohnehin eine Spalte (`app/src/renderer/styles/index.css:21725-21735`).

### F07 — Zusätzlich: Weißraum wechselt an der 560-px-Grenze in Höhe
Schwere: mittel
Stelle: app/src/renderer/styles/index.css:21724
Status: [OFFEN]
Im Split unter 560 px stapelt die Container-Query jede Kartenzeile, alle Beispiele und die Fußzeile (`app/src/renderer/styles/index.css:21725-21735`). Der 96-px-Labelkanal und die dritte Aktionsspalte fallen zwar sinnvoll weg (`:21533-21541`), aber fünf Beispiele plus Unterlagen/Ablage/Befugnisse/Modell/Gedächtnis ergeben dann eine lange Scrollstrecke vor „Starten“ (`app/src/renderer/components/Agent/AgentView.tsx:573-600`, `:603-918`, `:921-929`). Vertikale Zentrierung wäre hier schädlich. Bei 2560 px bleibt dagegen die ganze Ansicht auf 780 px begrenzt und zentriert (`app/src/renderer/styles/index.css:21401-21413`): Die Seitenflächen werden sehr groß, während die Karte oben bleibt. Das ist ein Kompositionsproblem, kein Auftrag für eine 1100-px-Texteingabe.
Vorschlag: Start-Padding nur bei ausreichender Höhe und Breite, im Split direkt oben starten und Beispiele früher verdichten. Sehr breite Fenster mit einem bewusst gestalteten, ruhigen Bühnenbereich oder begrenzter Skalierung von Kopf/Karte prüfen, ohne die Textzeile stark zu verlängern.

### F08 — Zusätzlich: Bedingte Zeilen erzeugen vertikale Sprünge
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:883
Status: [OFFEN]
Der Grundrhythmus ist klein und ordentlich (12 px zwischen Kopf/Karte/Fuß, 10 px Zeilenpadding, 6 px innerhalb der Werte: `app/src/renderer/styles/index.css:21410-21413`, `:21533-21546`). Die Höhe springt aber durch Zustände: Beispielraster verschwindet sofort beim Tippen (`app/src/renderer/components/Agent/AgentView.tsx:573-600`), Bildstatus blendet eine **ganze** Zeile als „wird geprüft“, „unbekannt“ oder „möglich“ ein (`:883-899`), und Cloud-/Freigabehinweise vergrößern den Modellblock (`:795-845`). In der leeren Karte liegen zudem „Noch nichts angehängt“ **und** der permanente Erklärungssatz untereinander (`:616-618`), ebenso leere Befugnisse samt Erklärung (`:731-735`): Das summiert Zeilenhöhe ohne neue Handlung. Bei kleinen Fenstern ist dieser Rhythmusbruch gewichtiger als der Leerraum unten.
Vorschlag: Zustandswechsel im gleichen reservierten Zeilenbereich darstellen; ruhende Hilfesätze auf eine knappe Zeile oder auf Nachfrage reduzieren. Erklärungen zu Lesebereich, Cloud/Bildern und sofortiger Wirkung bleiben bei den relevanten aktiven Zuständen sichtbar (`app/src/renderer/utils/i18n/agentCard.ts:34-36`, `:69-84`).

### F09 — Priorisierte Top-3 für den ersten Eindruck
Schwere: mittel
Stelle: app/src/renderer/components/Agent/AgentView.tsx:534
Status: [OFFEN]
1. **Führung nach Beispielwahl:** eine einzige aktive nächste Handlung statt zweier orangefarbener Flächen, mit klarem Rückweg zu anderen Beispielen (F02/F04; `app/src/renderer/components/Agent/AgentView.tsx:513-524`, `:573-600`, `:603-624`). Das adressiert den tatsächlich gesehenen Zustand.
2. **Ruhige, ehrliche Kompaktansicht:** leere/offline Details kürzen, Modellweg und aktive Außen-/Sofortwirkungen sichtbar lassen; Ergebnisversprechen an die Startaktion ziehen (F03/F05; `app/src/renderer/components/Agent/AgentView.tsx:731-742`, `:783-876`, `:921-929`). Die Transparenzgrenzen bleiben erfüllt (`docs/codex-collab/agent-auftragskarte-quellen.md:85-97`).
3. **Responsive vertikale Komposition:** den Entwurf bei viel Höhe etwas tiefer beginnen lassen, bei Lauf und schmalem Split oben halten; keine globale Verbreiterung und keine Zentrierung nur des leeren Zustands (F01/F07/F08; `app/src/renderer/styles/index.css:21401-21413`, `:21724-21735`; `app/src/renderer/components/Agent/AgentRunPanel.tsx:139-176`).

## Claude-Antwort

Nutzer hat alle drei Punkte der Top-3 freigegeben (04.10.2026). Umgesetzt, nicht committet.

- **F01 [ADRESSIERT]** Keine Zentrierung. `.agent-view-inner.is-idle` (nur `run.phase === 'idle'`)
  gibt dem Kopf bei Fensterhöhe ≥ 760 px und Containerbreite > 560 px ein gedeckeltes
  `margin-top: clamp(0px, 10vh - 40px, 90px)`, mit Übergang. Gilt für leeren UND gefüllten
  Entwurf; im Lauf und im Split oben.
- **F02 [ADRESSIERT]** `firstGap` in genau der Reihenfolge von `buttonLabel`; nur diese Zeile
  bekommt die Fläche (`is-missing`), weitere Lücken `is-gap` (nur Label + Punkt, Hinweistext grau).
  Eigener Knopf „nächster Schritt“ (`nextStep`) für Modell, Unterlagen (Ordner- bzw. Dateidialog
  je nach Beispiel), Web (Einrichten bzw. einschalten) und Ablage (öffnet den Picker und scrollt
  hin). „Starten“ bleibt Starten und ist erst bei `canRun` aktiv. Vault, offene Ergebnisse,
  Zustimmung/Freigabe: kein Zusatzknopf, Startknopf nennt die Lücke wie bisher.
- **F03 [ADRESSIERT, eingeschränkt wie vorgeschlagen]** Modellzeile, Route, Cloud-/Freigabe-Hinweise,
  Bilder und Sofortwirkung unverändert. Entfernt: Satz „Web, Shell und Rechner sind aus“ (die
  Schalter zeigen es), „Noch nichts angehängt“ (Hilfesatz zeigt den Leerzustand),
  Gedächtniszeile bei `empty` und `checking`. `unknown`, `filled`, `long` bleiben sichtbar.
- **F04 [ADRESSIERT]** „Anderes Beispiel“ neben dem Eingabehinweis, nur solange der Text ein
  unverändertes Beispiel ist (kein Überschreiben eines eigenen Entwurfs). Menü mit den fünf
  Titeln, schließt bei Klick außerhalb und Escape.
- **F05 [ADRESSIERT]** Ergebnisversprechen mit Schild-Symbol in Textfarbe direkt neben den Knöpfen,
  Sofortwirkung von Shell/Rechner unverändert gleich darunter. Dauer-Hinweis bleibt vor dem Start
  (nur ohne Cloud), wie von dir begründet.
- **F06 [ADRESSIERT]** Kein sechstes Beispiel. 6-Spalten-Raster, Karten über 2 Spalten, bei 3 + 2
  startet Karte 4 in Spalte 2 → zweite Reihe mittig. Unter 700 px zwei Spalten, unter 560 px eine.
- **F07 [ADRESSIERT]** Abstand nur bei Höhe und Breite (siehe F01); Split unverändert gestapelt,
  Knöpfe rechts darunter.
- **F08 [TEILWEISE]** Hilfesätze verdichtet (siehe F03), Hinweise zu Unterlagen gekürzt. Bildzeile
  springt weiterhin zwischen „wird geprüft“ und „möglich“ — offen.
- **F09** Reihenfolge so umgesetzt.

Geprüft: `npm run typecheck`; Screenshots per CDP bei 1920 × 1200 (leer, Beispiel gewählt, Menü
offen) und 1000 × 800 (Split-artig, Beispielwechsel über das Menü).

### Nachtrag nach Abnahme-Runde des Nutzers (04.10.2026)

- **F02 korrigiert:** Der Knopf „nächster Schritt“ ist wieder raus. Der Nutzer: „Unterlagen
  anhängen“ neben dem schon orange markierten „+ Kontext“ ist doppelt. Steht die erste Lücke
  als markierte Zeile mit eigener Handlung in der Karte (Unterlagen, Ablage, Web, Modell),
  heißt der Knopf schlicht „Starten“ (deaktiviert); sonst nennt er die Lücke wie bisher.
- **T1 revidiert — die Breite WAR das Problem:** Der Nutzer meinte den Weißraum links und rechts.
  Ab Containerbreite 1000 px wird die Karte zweispaltig (max. 1180 px): links Auftrag + Beispiele
  (Schreibfeld wächst auf die Höhe der rechten Spalte, Beispiele 2 je Reihe), rechts Unterlagen,
  Ablage, Befugnisse, Modell. Das Eingabefeld wird dadurch NICHT überlang (dein Einwand gegen
  1100-px-Textzeilen bleibt erfüllt). Darunter einspaltig mit 780 px wie bisher. Oberer Abstand
  im Leerlauf auf max. 56 px gesenkt.

## Status

Runde 1 umgesetzt (uncommittet), wartet auf Abnahme durch den Nutzer.
