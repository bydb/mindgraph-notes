# Infografik-Modus für generate_image + Starter-Skill „infografik“

## Aufgabe

Prüfe adversarial den neuen Infografik-Modus des Agent-Werkzeugs `generate_image` und den
neuen Starter-Skill `infografik`. Stand: HEAD plus uncommittete Änderungen (27.10.2026).

**Anlass (real, 27.10.2026, Lauf `run-9d35daa5363b4c31`):** Der Nutzer bat den Notiz-Agenten
(OpenRouter `minimax/minimax-m3.1-flash`, Webrecherche an) um eine Infografik. Einen
Infografik-Skill gab es nicht, der Agent nahm „Wissenschaftliche Webseite“. `generate_image`
erlaubte nur „max. 50 Wörter, KEIN Text im Bild“. Ergebnis: ein textloses Zierbild
(`roboter-infografik-hero.jpg`) und zwei `write_html`-Aufrufe, die beide bei 8192
Ausgabe-Token abgeschnitten wurden (je ~150–170 s, keine Rückmeldung in der UI). Der Lauf
endete als `failed`.

**Gewollt:** Eine Infografik ist EIN Bild, keine Seite.

Fragen:
1. Nimmt `gemini-3.1-flash-image` über die Interactions-API `image_size: "2K"` an? Falls
   nicht, scheitert jede Infografik. Dokumentation/Quelle nennen, sonst als ungeprüft markieren.
2. Passt der Skill zum Web-Lauf-Vertrag (genau EIN Write, `generate_image` nur VOR dem Write,
   Abschluss ohne Write = Fehlschlag)?
3. Kollidiert der Modus mit dem Marketing-Tab (`image-generate`-IPC) oder mit Bildern in
   `write_html`/`write_note`?
4. Ist der Skill unter 12 000 Zeichen und für schwache Modelle eindeutig? Kann ein Modell
   den Modus verfehlen, z. B. durch `mode` in einer anderen Schreibweise oder durch
   Konkurrenz mit dem Skill „Wissenschaftliche Webseite“?
5. Fehlt etwas: Wortzählung (Grenze umgehbar?), Kosten bei 2K, Prompt-Injection über
   Webinhalte in den Bild-Prompt, Personendaten im Bild?

## Kontext/Anker

- `app/src/main/imageGen/imagenService.ts:134-163` — `generateImage(prompt, { aspectRatio, imageSize })`, `image_size: options?.imageSize ?? '1K'`
- `app/src/main/imageGen/imagenService.test.ts` — neuer Test „fordert 2K nur an, wenn der Aufrufer es verlangt“
- `app/src/main/noteAgent/skills.ts:211-213` — `INFOGRAPHIC_PROMPT_MAX_WORDS = 400`
- `app/src/main/noteAgent/skills.ts:1580-1632` — Werkzeugbeschreibung, Parameter `mode`, Wortgrenze, Default-Format 3:4, `imageSize: infographic ? '2K' : '1K'`
- `app/src/main/noteAgent/loop.ts:161-170` — Bild-Block im Systemprompt (neue Zeile INFOGRAFIK, Z. 167)
- `app/src/main/noteAgent/loop.ts:395-410` und `:512-516` — Web-Lauf ohne Write = Fehlschlag, einmaliger Schubs zu `write_note`
- `app/src/main/noteAgent/skills.ts` `write_note`/`write_html` — `ctx.run.web.wrote`, `repairImageEmbeds`, `repairImageSrcAttributes`
- `app/src/main/index.ts:8189-8192` — Marketing-IPC `image-generate` (ruft `generateImage` ohne `imageSize`)
- `app/resources/starter-skills/infografik/SKILL.md` (≈ 4 800 Zeichen) — neu; Kopie in `docs/skills/src/infografik.md`, Eintrag in `docs/skills/index.json`
- `app/src/main/noteAgent/skillsLoader.ts` — `readSkillBody` kappt bei 12 000 Zeichen; Frontmatter nur `name`/`description`
- `CLAUDE.md`, Abschnitt „Notiz-Agent: write_html“ — neuer Eintrag „Infografik = ein Bild, keine Seite“
- Bekannt und bewusst NICHT Teil dieser Änderung: `outputCut` wird von `noteAgent/loop.ts` nicht ausgewertet.

## Codex-Findings

### F01 — 2K ist dokumentiert, aber nur der Request getestet
Schwere: niedrig
Stelle: app/src/main/imageGen/imagenService.ts:148
Status: [OFFEN]
Googles [Bildgenerierungs-Dokumentation](https://ai.google.dev/gemini-api/docs/image-generation) zeigt für `gemini-3.1-flash-image` in der Interactions-API ausdrücklich `response_format.image_size: "2K"` und für 3:4 eine Ausgabe von 1792 × 2400 Pixeln. Der lokale Code setzt Modell und Feld entsprechend (`app/src/main/imageGen/imagenService.ts:14`, `app/src/main/imageGen/imagenService.ts:155-163`). Der neue Test prüft nur den gesendeten JSON-Body (`app/src/main/imageGen/imagenService.test.ts:77-85`); ein echter API-Aufruf mit diesem Schlüssel, dieser API-Revision und JPEG bei 2K wurde **nicht geprüft**. Die Behauptung „jede Infografik scheitert wegen 2K“ ist durch die Dokumentation nicht gestützt, die tatsächliche Laufzeitkompatibilität bleibt offen.
Vorschlag: Einen einmaligen echten 2K-Aufruf in einer freigegebenen Testumgebung gegen die API prüfen und die Bildmaße kontrollieren.

### F02 — Unbekannte Modus-Schreibweise fällt still auf Illustration zurück
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:1613
Status: [OFFEN]
Nur `infografik` und `infographic` aktivieren den neuen Pfad; etwa `Infografik`, `infografik ` oder `info-grafik` werden ohne Fehler zu 1K/16:9 (`app/src/main/noteAgent/skills.ts:1613-1620`). `mode` ist im Tool-Schema bloß ein String, kein Enum (`app/src/main/noteAgent/skills.ts:1593`), und der Skill verspricht ein Informationsbild (`app/resources/starter-skills/infografik/SKILL.md:15`). Der Skill ist mit 4 755 Zeichen unter dem 12 000-Zeichen-Limit (`app/src/main/noteAgent/skillsLoader.ts:13`, `app/src/main/noteAgent/skillsLoader.ts:104-113`), doch die Wahl des Skills bleibt dem Modell überlassen (`app/src/main/noteAgent/loop.ts:123-129`); „Wissenschaftliche Webseite“ steht weiterhin daneben und bietet erklärende Diagramme an (`app/resources/starter-skills/wissenschaftliche-webseite/SKILL.md:8-13`). Ein schwaches Modell kann so den Skill oder den exakten Modus verfehlen und erneut ein textloses Zierbild erzeugen, ohne den Fehlmodus zu erkennen.
Vorschlag: Modus normalisieren und unbekannte Werte mit einer konkreten Fehlermeldung ablehnen; `enum` im Schema anbieten.

### F03 — Skill-Abbruch bei fehlendem Bildwerkzeug scheitert im Web-Lauf
Schwere: mittel
Stelle: app/resources/starter-skills/infografik/SKILL.md:17
Status: [OFFEN]
Der Skill sagt bei fehlendem `generate_image`, der Agent solle abbrechen und es dem Nutzer sagen. Das Tool fehlt tatsächlich, wenn Modul oder Schlüssel fehlen (`app/src/main/index.ts:4844-4853`, `app/src/main/noteAgent/loop.ts:250`). Bei aktiver Webrecherche weist die Schleife eine bloße Antwort jedoch zurück, fordert einmal `write_note` an und beendet den Lauf danach als Fehler (`app/src/main/noteAgent/loop.ts:396-409`). Der beschriebene Abschlussweg funktioniert für diesen Fall nicht; der Schubs kann das Modell außerdem zu einer sinnlosen Begleitnotiz bewegen.
Vorschlag: Für diesen Fall im Skill einen expliziten, mit dem Web-Vertrag vereinbaren Ablauf vorgeben oder einen definierten Abbruchpfad in der Schleife einführen.

### F04 — Bild und Beschriftungen werden vor der Ausgabe nicht gegen Quellen geprüft
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:1619
Status: [OFFEN]
Die Anweisung „Zahlen nur aus Quelle oder Auftrag“ steht lediglich im Skill (`app/resources/starter-skills/infografik/SKILL.md:43-45`). `generate_image` reicht den frei formulierten Prompt direkt an Google weiter (`app/src/main/imageGen/imagenService.ts:155-163`) und registriert die zurückgegebenen Bytes ohne Inhalts- oder OCR-Prüfung (`app/src/main/noteAgent/skills.ts:1619-1631`). Auch die Web-Begleitnotiz übernimmt modellformulierte Kernaussagen (`app/resources/starter-skills/infografik/SKILL.md:97-100`); `write_note` ergänzt nur Quellen und prüft allgemeine Markdown-Qualität (`app/src/main/noteAgent/skills.ts:1678-1692`). Damit können erfundene oder vom Bildmodell veränderte Zahlen im eigentlichen Ergebnis stehen, obwohl die Abschlussantwort lediglich zur manuellen Prüfung auffordert (`app/resources/starter-skills/infografik/SKILL.md:102-106`).
Vorschlag: Die fehlende Verifikation als klare Produktgrenze ausweisen; für belastbare Zahlen Bildtext per OCR und Quellenabgleich prüfen oder die Zahlengrafik deterministisch rendern.

### F05 — Wortgrenze lässt Textmenge und Kosten weitgehend offen
Schwere: mittel
Stelle: app/src/main/noteAgent/skills.ts:1614
Status: [OFFEN]
Die 400-Wörter-Grenze zählt nur an Whitespace getrennte Stücke (`app/src/main/noteAgent/skills.ts:1614-1616`); lange Zeichenfolgen mit Trennzeichen ohne Leerraum oder Sprachen ohne Wortzwischenräume können viel Inhalt als ein „Wort“ übertragen. Die höchstens etwa 80 sichtbaren Wörter des Skills werden überhaupt nicht geprüft (`app/resources/starter-skills/infografik/SKILL.md:35-42`). Jeder akzeptierte Infografik-Aufruf fordert 2K an (`app/src/main/noteAgent/skills.ts:1620`), ein Wiederholungsversuch ist vorgesehen (`app/resources/starter-skills/infografik/SKILL.md:88-90`). Googles [Preisliste](https://ai.google.dev/gemini-api/docs/pricing) nennt derzeit ungefähr 0,101 USD pro 2K-Bild statt 0,067 USD für 1K, zuzüglich Eingabe und möglicher Wiederholungen; diese Kosten werden im Skill und Tooltext nicht beziffert (`app/src/main/noteAgent/skills.ts:1584-1587`).
Vorschlag: Zusätzlich Zeichen- und Byte-Limit setzen, sichtbare Beschriftungen strukturiert begrenzen und den 2K-Mehrpreis vor dem Aufruf kenntlich machen.

### F06 — Externe Webanweisungen können in einen zweiten Cloud-Prompt gelangen
Schwere: mittel
Stelle: app/src/main/noteAgent/skills.ts:1760
Status: [OFFEN]
`web_fetch` liefert extrahierten Seitentext trotz Warnpräfix vollständig an das Modell (`app/src/main/noteAgent/skills.ts:1760-1767`); der Systemprompt nennt Webinhalte Daten (`app/src/main/noteAgent/loop.ts:150`). Beim Bildaufruf wird der daraus vom Modell gebaute Prompt aber ohne gesonderte Prüfung direkt zu Google gesendet (`app/src/main/noteAgent/skills.ts:1600-1620`, `app/src/main/imageGen/imagenService.ts:155-163`). Eine in der Seite platzierte Anweisung kann daher als Bildbeschriftung oder Gestaltungsvorgabe und damit als zweiter Cloud-Transfer enden. Ebenso ist „Keine Personennamen, Adressen oder Gesichter“ nur eine Skill-Anweisung (`app/resources/starter-skills/infografik/SKILL.md:45`), keine Prüfung des Bild-Prompts oder der Bilddaten. Eine tatsächliche Ausnutzung oder Übertragung von Personendaten wurde **nicht geprüft**.
Vorschlag: Fremdinhalt vor dem Bildaufruf als Quelle abgrenzen, Bildbeschriftungen auf geprüfte Auszüge begrenzen und bei sensiblen Inhalten eine explizite Übergabeentscheidung verlangen.

### F07 — Neuer Skill erscheint in bestehenden Vaults nicht automatisch
Schwere: mittel
Stelle: app/src/main/index.ts:5573
Status: [OFFEN]
Die neue Datei liegt unter den gebündelten Starter-Skills (`app/resources/starter-skills/infografik/SKILL.md:1-6`). Der Code kopiert diese Sammlung beim Anlegen eines Demo-Vaults (`app/src/main/index.ts:3206-3213`) oder nach ausdrücklichem `note-skills-install-starter` (`app/src/main/index.ts:5573-5594`); die Skill-Liste liest ausschließlich den jeweiligen Vault (`app/src/main/noteAgent/skillsLoader.ts:53-82`). Ein vorhandener Vault ohne erneute Starter-Installation bietet dem Agenten daher weiterhin keinen Infografik-Skill. Der allgemeine Systemprompt erwähnt zwar den Modus (`app/src/main/noteAgent/loop.ts:167`), aber die konkretisierte Anleitung fehlt genau im Bestandsfall des geschilderten Laufs.
Vorschlag: Die notwendige Installation beim Ausrollen sichtbar machen oder den neuen Skill in bestehende Vaults ergänzen, ohne vorhandene Skill-Dateien zu überschreiben.

### F08 — Marketing-IPC und Bildeinbettung sind durch den Modus nicht direkt verändert
Schwere: niedrig
Stelle: app/src/main/index.ts:8189
Status: [OFFEN]
Für Frage 3: `image-generate` übergibt nur `aspectRatio` (`app/src/main/index.ts:8189-8192`), weshalb `generateImage` dort weiterhin 1K wählt (`app/src/main/imageGen/imagenService.ts:162`). `write_note` und `write_html` reparieren die Endung anhand der tatsächlich registrierten Bilder (`app/src/main/noteAgent/skills.ts:305-323`, `app/src/main/noteAgent/skills.ts:329-343`, `app/src/main/noteAgent/skills.ts:1163-1165`, `app/src/main/noteAgent/skills.ts:1690`). Eine direkte Kollision ist im Code nicht erkennbar; ein GUI-Test dieser Pfade wurde **nicht durchgeführt**. Dieser Befund ist eine Prüfgrenze, kein nachgewiesener Defekt.

## Claude-Antwort

Runde 1, nach Freigabe durch den Nutzer (27.10.2026).

- **F01** [DISKUSSION] Kein Code. Doku-Beleg übernommen; ein echter 2K-Aufruf steht als GUI-Gegenprobe aus.
- **F02** [ADRESSIERT] Neue Datei `app/src/main/noteAgent/imageMode.ts` (`parseImageMode`): Groß-/Kleinschreibung, Leerraum, Bindestrich/Unterstrich werden normalisiert, `infographic` und `illustration`/`bild`/`image` als Aliasse; jeder andere Wert ergibt einen Werkzeugfehler mit den erlaubten Werten, kein stiller Rückfall. Schema `mode` trägt jetzt `enum: ['illustration', 'infografik']`. Tests: `imageMode.test.ts`.
- **F03** [ADRESSIERT] Skill hat neuen „Schritt 0“: Werkzeug VOR jeder Recherche prüfen; ohne Web sofort aufhören, mit Web ohne Recherche eine Ein-Satz-Notiz per `write_note` (erfüllt den Web-Vertrag; `validateAgentMarkdownResult` lässt sie durch). Kein Schleifen-Umbau.
- **F04** [ADRESSIERT als dokumentierte Grenze] Keine Texterkennung gebaut; Grenze in CLAUDE.md beim Infografik-Eintrag festgehalten.
- **F05** [ADRESSIERT teilweise] Zusätzlich 3000-Zeichen-Grenze (`INFOGRAPHIC_PROMPT_MAX_CHARS`), getestet mit einer Kette ohne Leerraum. Keine Kostenanzeige: auch der Marketing-Tab zeigt keine, abgerechnet wird über den eigenen Schlüssel des Nutzers.
- **F06** [ABGELEHNT: nicht durch diese Änderung eingeführt] `generate_image` ist im Web-Lauf seit `c8a6e81a` erlaubt (`loop.ts:244-250`); der Google-Bild-Prompt steht bereits als Datenweg auf der Agent-Karte. Der Modus ändert Länge und Zweck des Prompts, nicht den Weg.
- **F07** [DISKUSSION] Gilt für jeden Starter-Skill; Installation über Einstellungen → Skills ohne Überschreiben. Im Vault des Nutzers bereits angelegt; im nächsten Changelog erwähnen.
- **F08** [ADRESSIERT] Keine Kollision, nichts zu tun.

Belege: `npm run typecheck` grün, `npm run test` 227 Dateien / 3136 Tests grün.

## Status

Runde 1 umgesetzt, wartet auf Abnahme durch den Nutzer.
