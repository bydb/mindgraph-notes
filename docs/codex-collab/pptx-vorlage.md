# PowerPoint nach Vorlage (Notiz-Agent: `write_pptx` + Skill)

## Aufgabe

Der Nutzer will einen Skill „PowerPoint nach Vorlage erstellen": Er legt eine Muster-Präsentation
(Logo, Kopf-/Fußzeile, Layouts) in den Vault, der Notiz-Agent baut daraus eine neue Präsentation.
Dies ist **Fall 1** (neu aus Vorlage). Anpassen vorhandener Präsentationen (Fall 2) und
Zusammenführen (Fall 3) sind ausdrücklich NICHT Teil dieser Runde; der Entwurf soll sie aber nicht
verbauen.

**Runde 1 (Plan-Review):** Codex prüft den Entwurf unten adversarial, bevor Code entsteht —
vor allem: Wo produziert der Ansatz eine Datei, die PowerPoint mit „Reparieren?" öffnet oder
still falsch darstellt? Wo verliert er das Aussehen der Vorlage? Wo kann das Modell etwas, das es
nicht können soll (Pfade, Größen)?

**Runde 2 (Implementierungs-Review):** folgt, sobald der Code steht.

## Kontext/Anker

Vorbild ist `write_docx` mit Briefkopf-Vorlage — gleiche Bauart, gleiche Regeln:

- `app/src/shared/docxTemplateFill.ts:1-20` — Vertrag „Bytes rein, Bytes raus", pure, jszip, getestet.
- `app/src/main/noteAgent/skills.ts:713-800` — `write_docx`-Werkzeug: Vorlage vault-relativ über
  `resolveInVault` (`skills.ts:149`), Größenlimit `MAX_FORM_TEMPLATE_BYTES` (`skills.ts:161`),
  Ergebnis über `registerStagedResult` (`skills.ts:237`).
- `app/src/main/noteAgent/skills.ts:985-1075` — `write_edumap`: Modell liefert strukturierte Liste,
  harte Grenzen lehnen ab statt still zu kürzen (`shared/edumap.ts`).
- `app/src/main/noteAgent/loop.ts:188-232` — Werkzeug-Allowlist; Web-Lauf entfernt Datei-Writer.
- `app/src/main/noteAgent/loop.ts:400-430` — Anzeige der Werkzeugaufrufe.
- `app/src/main/noteAgent/runRegistry.ts:36` — Ergebnis-Art `pptx` existiert schon,
  `staging.ts:18` erlaubt `.pptx` schon.
- `app/src/main/office/officeService.ts:746-836` — vorhandener PPTX-Leser (nur Text, nicht Teil dieser Runde).
- `app/src/main/noteAgent/skills.ts:193-235` — Bilder dieses Laufs (`ctx.run.results`, `kind png|jpg`).
- `app/src/shared/activityLog.ts:405` — Tätigkeitsart `document` für Dokument-Writer.

### Entwurf

**Grundsatz (wie Entscheidung 11):** Das Modell schreibt nie XML. Es liefert eine Folienliste, die
App setzt sie in die echten Layouts der Vorlage ein. Master, Logo, Hintergründe und Schriften
kommen dadurch unverändert aus der Vorlage.

**Neues pures Modul `app/src/shared/pptxTemplate.ts`** (jszip, kein fs/electron, Tests daneben):

1. `inspectPptxTemplate(bytes)` → Folienformat, Layouts (Name, Art, Platzhalter mit Typ/idx/Größe,
   grobe Zeilenkapazität), Zahl der Musterfolien, gefundene `{{FELDER}}`.
2. `buildPptxFromTemplate(bytes, input)` → `{ bytes, notes[] }`:
   - **Musterfolien der Vorlage werden entfernt** (Folien-Parts, deren Rels, Notizfolien, Kommentare;
     Einträge in `presentation.xml` `sldIdLst`, `presentation.xml.rels`, `[Content_Types].xml`;
     Abschnittsliste `p14:sectionLst` und `custShowLst` werden entfernt bzw. bereinigt, weil sie
     auf Folien-IDs zeigen; verwaiste Medien raus; `docProps/app.xml` Folienzahl nachziehen).
   - Je Eingabefolie wird ein Layout gewählt: exakter Layoutname (ohne Groß/Klein) → Art
     (`title`, `section`, `content`, `two-content`, `comparison`, `title-only`, `picture`, `blank`;
     aus `sldLayout@type`, bei `cust` aus der Platzhalter-Zusammensetzung abgeleitet). Unbekannt →
     Ablehnung mit Liste der vorhandenen Layouts.
   - Die neue Folie enthält Platzhalter-Kopien (`p:sp` mit `p:ph type/idx`, leerem `p:spPr`, damit
     Position und Formatierung vom Layout geerbt werden) und deren Text. Kein eigenes Styling außer
     `**fett**`.
   - Text: `title`, `subtitle`, `body` (Mini-Markdown: `- ` Aufzählung, zwei Leerzeichen Einzug je
     Ebene bis Ebene 3 → `a:pPr lvl`, sonst Absatz; `**fett**`), `body2` für zweiten Inhaltsplatzhalter.
   - **Fußzeile:** Platzhalter `ftr`/`sldNum`/`dt` des Layouts werden auf die Folie kopiert (sonst
     zeigt PowerPoint sie nicht an), Foliennummer als `a:fld type="slidenum"`. Nicht auf Layouts der
     Art `title`, außer die Musterfolien der Vorlage zeigen sie dort.
   - **Bilder:** aus diesem Lauf (`generate_image`, per Dateiname) oder vault-relativ (PNG/JPEG,
     Bytes-Signatur geprüft, Größenlimit). In einen Bild-/Inhaltsplatzhalter als `p:pic` mit
     `srcRect`-Zuschnitt aufs Seitenverhältnis (keine Verzerrung); ohne passenden Platzhalter als
     freies Bild in der Fläche des Inhaltsplatzhalters (eingepasst).
   - **Sprechernotizen:** `notesSlide` je Folie; fehlt der Vorlage ein Notizenmaster, wird ein
     minimaler erzeugt (eigener Theme-Part).
   - **Felder:** `{{NAME}}` in Master/Layouts/kopierten Fußzeilen aus `fields`; von PowerPoint
     zerlegte Läufe werden vorher zusammengezogen (wie `normalizePlaceholderRuns` bei DOCX).
   - **`.potx` als Vorlage** erlaubt; Hauptpart-Content-Type wird auf `presentation.main+xml` gesetzt.
   - **Überlauf:** Kapazität je Platzhalter grob aus Größe und Schriftgröße (Layout → Master
     `bodyStyle`). Bis ca. 125 % → `a:normAutofit fontScale` setzen; darüber Ablehnung
     „Folie n ist zu voll — teile sie auf". Harte Grenzen: 40 Folien, Titel 150 Zeichen,
     Notizen 3000 Zeichen je Folie.
3. Validierung im Test: jede erzeugte Datei wird auf Referenz-Konsistenz geprüft (jede Rel zeigt
   auf existierenden Part, jeder Part hat Content-Type, sldId eindeutig ≥ 256, rIds eindeutig,
   XML wohlgeformt). Zusätzlich manuell: Öffnen in PowerPoint, Keynote, LibreOffice.

**Werkzeuge im Notiz-Agenten** (`skills.ts`):

- `inspect_pptx_template({ template })` — nur lesend, liefert die Layoutliste fürs Modell.
- `write_pptx({ file_name, template, slides, fields? })` — `slides[]`: `{ layout, title?, subtitle?,
  body?, body2?, image?, notes? }`. Ergebnis-Art `pptx`, Summary mit Folienzahl, Vorlage, Hinweisen.
- Beide nicht im Web-Lauf (kein Platz für den Quellenblock, wie `write_edumap`).
- Keine KI-Kennzeichnung auf den Folien (Vorlage = Briefpapier des Nutzers, wie `write_docx`
  im Vorlagen-Modus); Provenienz über `sources` der Ergebnis-Karte.

**Skill** `app/resources/starter-skills/praesentation/SKILL.md` (+ `docs/skills/`): Vorgehen
(Vorlage inspizieren → Gliederung → eine Kernaussage je Folie, höchstens ~6 Punkte → `write_pptx`),
Platz für den Vorlagenpfad des Nutzers, Grenzen.

**Bewusst nicht in Runde 1:** Tabellen, Diagramme, SmartArt, Musterfolien klonen/übernehmen,
Bildvorschau der Folien in der App.

### Runde 5 — Auftrag: PowerPoint im Web-Lauf + sichtbarer Formathinweis (01.10.2026)

Auslöser (real, Dev-App): Lauf mit eingeschalteter Webrecherche, Skill „PowerPoint nach Vorlage" geladen →
`write_pptx` war im Web-Lauf gesperrt (`loop.ts`), der Skill fiel auf `write_note` zurück, Nutzer sah nur eine
`.md` ohne Erklärung. Nutzer hat beides freigegeben:

1. **Sichtbarer Hinweis**: `use_skill` setzt `run.expectedPptxSkill`, wenn der Skill-Text `write_pptx` nennt
   (`skills.ts`); `withFormatHint` in `loop.ts` hängt an die Abschlussnachricht einen Hinweis mit Grund, wenn am
   Ende keine `.pptx` vorliegt (Werkzeug nicht verfügbar / anderes Format / gar nichts). Tests in `loopWeb.test.ts`.
2. **`write_pptx` im Web-Lauf**: nicht mehr aus der Allowlist entfernt; Web-Prompt und Nachfass-Text nennen es.
   Vertrag „genau EIN Write" gilt (`web.wrote`-Prüfung vor dem Bau, `wrote/phase` nach Erfolg). Quellen kommen aus
   `web.fetches` (nur `status: 'ok'`, Titel über `sanitizeSourceTitle`) → `buildPptxFromTemplate({ sources })`:
   eigene Quellenfolien des Modells (Titel Quellen/Sources/Literatur…) werden entfernt, die App hängt Folie(n)
   „Quellen" an (6 je Folie, Titel als externer Hyperlink `a:hlinkClick` + Rel `TargetMode="External"`,
   nur http/https, Länge ≤ 2000, dedupliziert). Tests in `pptxTemplate.test.ts` („Quellenfolie").
   Gegenprobe PowerPoint: Deck mit 3 Quellen öffnet ohne Meldung, Links klickbar dargestellt.

Bitte adversarial prüfen: Kann das Modell über Folieninhalte Webquellen unterschlagen oder fremde Links
unterbringen (z. B. URLs im body, Bild aus dem Web, Felder)? Bricht etwas am Web-Vertrag (zweites Ergebnis über
generate_image + write_pptx, Reihenfolge)? Ist die Hyperlink-Ausgabe sicher (Escaping, Schemes, Rel-IDs)?
Trifft der Formathinweis in allen Pfaden (Iterations-Limit, Fehler)?

### Runde 7 — Auftrag: Karten, Schritte, Kennzahlen, Kernaussage (01.10.2026)

Nutzer: „funktioniert alles, die Präsentationen sind sehr schlicht" → gewählt: alle vier Elemente aus dem
Einkaufs-Deck. Umsetzung:
- `shared/pptxTemplate.ts`: Folienfelder `items` (label/title/text/highlight, ≤ 6) und `takeaway`; Plätze per Name
  (`ITEM_NAME_RE`, `TAKEAWAY_NAME_RE`), `isSpecial` hält sie aus contentSlots/Klassifikation/Untertitel heraus;
  neue Art `cards`; Automatik nach Platzzahl; Füllschätzung je Ebene aus `levelPts`; `highlight` → eigenes
  `p:spPr` mit `accent1`-Tönung; Ablehnung bei fehlenden/zu wenigen Plätzen, zu langem Text, Kernaussage ohne Balken.
- `app/scripts/build-hausstil-vorlage.py`: 6 neue Layouts (Drei/Vier Karten, Karten mit Kernaussage, Text mit
  Kernaussage, Schritte, Kennzahlen). Bei „Schritte" zeichnet das Layout Fläche + Ziffer, der Platzhalter ist
  durchsichtig (gefüllte Folien-Platzhalter verdeckten die Ziffern). Eigene Platzhalter ohne Mustertext
  (LibreOffice zeigte „Schritt 1" als Text).
- `skills.ts`: Schema um items/takeaway; items als JSON-String werden geparst. Skill: Abschnitt „Abwechslung
  statt Aufzählung", Kennzahlen nur mit belegten Zahlen.
- Gegenprobe: LibreOffice-Render und PowerPoint (öffnet ohne Meldung). 55 gezielte Tests grün.

Bitte prüfen: kaputtes OOXML in den neuen Layouts (roundRect-Geometrie, noFill-Platzhalter, Ebenen-lstStyle),
Fehlzuordnung von Plätzen (Namensregex, Sortierung), Inhaltsverlust (Einträge, die nicht erscheinen), Lücken in der
Validierung, und ob der Skill-Text zum Erfinden von Zahlen verleiten kann.

## Codex-Findings

### F01 — Neue Folien brauchen einen vollständigen Beziehungsgraphen
Schwere: hoch
Beleg: docs/codex-collab/pptx-vorlage.md:46-55,76-78; [Microsoft: Structure of a PresentationML document](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document)
Status: [OFFEN]
Der Entwurf zählt beim Erzeugen nur `sldId`/`rId` und vorhandene Parts als Invarianten. Eine neue Folie braucht zusätzlich eine Presentation→Slide-Beziehung, eine Slide→SlideLayout-Beziehung auf genau das gewählte Layout und bei Bildern/Notizen weitere Slide-Beziehungen mit korrektem Typ, relativen Targets und Content-Types. Ein existierendes Ziel allein beweist weder den richtigen Beziehungstyp noch eine passende XML-Referenz (`r:embed`, `r:id`). Das kann „Reparieren?“ auslösen oder eine Folie ohne das gewählte Layout öffnen.
Vorschlag: Einen vollständigen Part-/Relationship-Vertrag je erzeugtem Objekttyp festlegen und XML-Referenzen gegen Typ, Quelle und Ziel prüfen; mindestens mit Open-XML-Schema-Validierung und Öffnen in PowerPoint testen.
Nachprüfung Runde 2: teilweise trägt die Antwort: Der Beziehungsgraph wird aufgebaut, aber `checkPptxConsistency` wird nur in Tests aufgerufen; `buildPptxFromTemplate` gibt ohne diese Prüfung aus (app/src/shared/pptxTemplate.ts:1458-1459,1469-1517).

### F02 — Das Entfernen der Musterfolien ist keine feste Dateiliste
Schwere: hoch
Beleg: docs/codex-collab/pptx-vorlage.md:47-50; [Microsoft: Delete a slide](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-delete-a-slide-from-a-presentation)
Status: [OFFEN]
Der Plan nennt Folien, Rels, Notizen, Kommentare, Medien, `sectionLst` und `custShowLst`, aber Präsentationen können weitere auf Folien bezogene Teile und Referenzen enthalten (etwa Kommentar-Autoren, Tags, eingebettete Objekte, Diagramme, Audio/Video, Thumbnail, Outline-Einstellungen). Microsoft weist ausdrücklich darauf hin, dass komplexere Präsentationen beim Folienlöschen zusätzliche Schritte brauchen. Ein pauschales Entfernen „verwaister Medien“ kann umgekehrt ein Logo zerstören, das Master oder Layout weiter referenzieren. Auch eine leere Section-Liste einfach zu entfernen ist nicht dasselbe wie eine beabsichtigte Section-Struktur für die neuen IDs.
Vorschlag: Beziehungen vom Paket-Root aus traversieren, alte Folien-IDs und ihre Referenzen gezielt entfernen, gemeinsam genutzte Parts behalten und nur unerreichbare interne Parts samt Overrides löschen; unbekannte folienbezogene Erweiterungen ablehnen statt still behalten oder löschen.

### F03 — Notizmaster lässt sich nicht als einzelner Part ergänzen
Schwere: hoch
Beleg: docs/codex-collab/pptx-vorlage.md:67-68; [Microsoft: Notes Slide Part](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document), [NotesMasterId](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.notesmasterid?view=openxml-3.0.1)
Status: [OFFEN]
„Minimaler Notizenmaster (eigener Theme-Part)“ benennt den Part, aber nicht die Verkettung: `presentation.xml` braucht `notesMasterIdLst` mit passender Beziehung; jede Notizfolie eine Beziehung zur Folie und zum Notizenmaster, jede Folie die Beziehung zur Notizfolie. Notizenmaster und Notizfolie brauchen ihre eigenen gültigen XML-Strukturen und Content-Types. Fehlt ein Glied, verschwinden Notizen oder PowerPoint repariert das Paket.
Vorschlag: Notizen als eigenständigen Paketgraphen spezifizieren und mit Vorlagen mit/ohne vorhandenen Notes Master prüfen; falls die Erzeugung nicht sicher beherrscht wird, Notizen für solche Vorlagen zunächst ausdrücklich ablehnen.
Nachprüfung Runde 2: teilweise trägt die Antwort: Der Part-Graph ist vorhanden, aber die neu erzeugte Notizfolie verwendet andere Platzhalter-Indizes als ihr neu erzeugter Notizenmaster (app/src/shared/pptxTemplate.ts:1189-1193,1225-1231; F15).

### F04 — Löschen aller Musterfolien entfernt oft gerade das Vorlagendesign
Schwere: hoch
Beleg: docs/codex-collab/pptx-vorlage.md:38-40,47,93-94; [Microsoft: PresentationML slide-specific content](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-presentation-slides)
Status: [OFFEN]
Die Zusage, Logo, Kopf-/Fußzeile und Hintergründe kämen unverändert aus Master/Layout, gilt nur, wenn sie dort tatsächlich liegen. In realen Musterpräsentationen sitzen Logo, Akzentfläche, Bild, Copyright-Text oder Hintergrund häufig als gewöhnliche Shapes auf den Beispiel-Folien. Der Plan löscht diese Folien und erzeugt nur Platzhalter neu; das Ergebnis kann formal gültig sein und trotzdem das sichtbare Design verlieren.
Vorschlag: Bei der Inspektion den Anteil folienspezifischer Shapes/Bilder außerhalb von Platzhaltern ausweisen und solche Layouts ablehnen oder pro Layout eine ausgewählte Musterfolie klonen und nur definierte Inhaltsplatzhalter ersetzen. Das bleibt Fall 1, ohne freies Bearbeiten vorhandener Präsentationen einzuführen.
Nachprüfung Runde 2: nur teilweise: `sampleDecorations` erfasst Shapes/Bilder im `spTree`, aber keine Folienhintergründe; neue Folien übernehmen keinen folienspezifischen Hintergrund (app/src/shared/pptxTemplate.ts:659-677,1406-1410; F16).

### F05 — `p:ph` plus leeres `p:spPr` reicht für Vererbung nicht aus
Schwere: hoch
Beleg: docs/codex-collab/pptx-vorlage.md:51-59; [Microsoft: Working with slide masters](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-slide-masters), [PlaceholderShape.Index](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.placeholdershape.index?view=openxml-3.0.1)
Status: [OFFEN]
Der Entwurf reduziert die Folien-Shape auf `p:sp`, `p:ph type/idx` und leeres `p:spPr`. Ein gültiger Textplatzhalter benötigt auch `p:nvSpPr` mit eindeutiger `cNvPr@id`, `p:txBody` samt `a:bodyPr`/`a:lstStyle` und gültiger Absatzstruktur; die Zuordnung über Typ/Index muss zur Layout-Shape passen. Viele Layouts überschreiben Textformat, Einzug oder Geometrie direkt im Platzhalter, statt sie nur aus `master.txStyles.bodyStyle` zu erben. Eine syntaktisch gültige Folie kann daher andere Schrift, Bullet-Ebenen oder Position zeigen.
Vorschlag: Geeignete Platzhalter-Shape aus dem konkreten Layout als strukturelle Vorlage verwenden, dabei nur Identität/Inhalt gezielt ändern und Vererbung für Titel, Body, zwei Spalten sowie `cust`-Layouts visuell prüfen.

### F06 — Fußzeilen sind durch `p:hf` und Titelfolienregeln gesteuert
Schwere: mittel
Beleg: docs/codex-collab/pptx-vorlage.md:60-62; [Microsoft: HeaderFooter](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.headerfooter?view=openxml-3.0.1), [SlideLayout.HeaderFooter](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.slidelayout.headerfooter?view=openxml-3.0.1)
Status: [OFFEN]
Das bloße Kopieren vorhandener `ftr`/`sldNum`/`dt`-Shapes setzt die Vorlagenentscheidung über `p:hf` (aktivierte/deaktivierte Elemente) und die konkreten Feldwerte nicht um. Umgekehrt können die Fußzeilen-Platzhalter im Master liegen und im Layout fehlen; dann würde der Plan sie nicht finden. `sldLayout@type='title'` ist kein verlässlicher Ersatz für „Auf Titelfolie nicht anzeigen“: eine individuelle Titelfolie kann anders konfiguriert sein. Ergebnis sind fehlende oder unerwartete Seitenzahlen/Datumsfelder ohne Reparaturmeldung.
Vorschlag: Master- und Layout-`p:hf`, Platzhalter und gegebenenfalls Musterfolien gemeinsam auswerten; unbekannte oder widersprüchliche Fußzeilen-Konfiguration explizit melden.
Nachprüfung Runde 2: trägt nicht vollständig: Bei Musterfolien wird die Fußzeilenentscheidung über alle Layouts derselben Titel/Nichttitel-Klasse zusammengeworfen (app/src/shared/pptxTemplate.ts:1131-1142; F14).

### F07 — Bildplatzhalter erfordert eigenes Picture-Markup und Bildbeziehung
Schwere: hoch
Beleg: docs/codex-collab/pptx-vorlage.md:63-66; [Microsoft: Picture](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.picture?view=openxml-3.0.1)
Status: [OFFEN]
`p:pic` ist kein Text-`p:sp` mit anderem Inhalt: Es braucht `p:nvPicPr`, `p:blipFill` mit `a:blip r:embed`, `p:spPr` und eine Bildbeziehung vom Slide-Part. Ein Inhaltsplatzhalter (`obj`) ist zudem nicht automatisch ein Bildplatzhalter; freies Einpassen in dessen Rechteck erbt weder Masken noch Effekte/Rahmen eines echten `pic`-Platzhalters. Die Cropping-Rechnung muss natürliche Bildabmessungen, Rotation und `srcRect`-Grenzen beachten. Sonst ist das Bild unsichtbar, verzerrt oder still anders gestaltet.
Vorschlag: Bildplatzhalter getrennt von Text-/Objektplatzhaltern behandeln, vollständiges Picture-Markup und eindeutige Medien-Rels erzeugen; nur belegte Geometrie übernehmen, sonst das Einfügen für dieses Layout ablehnen.
Nachprüfung Runde 2: Picture-Markup und Rels tragen; die behauptete Bildsignaturprüfung lässt jedoch bereits einen PNG-Vierbyte-Präfix samt Dimensionsfeldern genügen (app/src/shared/pptxTemplate.ts:990-1012; F17).

### F08 — `.potx` und unbekannte OOXML-Varianten brauchen ein Eingangsprofil
Schwere: mittel
Beleg: docs/codex-collab/pptx-vorlage.md:71,76-78; [Microsoft: PresentationDocumentType](https://learn.microsoft.com/en-us/previous-versions/office/office-12/cc489189%28v%3Doffice.12%29), [Open XML SDK overview](https://learn.microsoft.com/en-us/office/open-xml/about-the-open-xml-sdk)
Status: [OFFEN]
Für `.potx` ist nur das Umsetzen des Hauptpart-Content-Types auf `.pptx` beschrieben. Das setzt voraus, dass tatsächlich der per Root-Relationship referenzierte Hauptpart geändert wird und nicht ein fest angenommener Dateiname; auch Strict-OOXML und Vorlagen mit nicht unterstützten Beziehungen/Erweiterungen passen nicht zwingend zu einem fest codierten Transitional-XML-Gerüst. Die bisherige Validierung prüft Existenz und XML-Wohlgeformtheit, aber nicht das unterstützte Profil. So kann eine formal lesbare ZIP-Datei entstehen, deren Inhalte PowerPoint teilweise verwirft.
Vorschlag: Vor dem Umbau Pakettyp, Namespaces und Relationship-Typen bestimmen; `.pptx`/`.potx` aus unterstütztem Profil explizit konvertieren und andere Varianten mit verständlichem Fehler ablehnen.

### F09 — `{{FELDER}}` im Master verändern gemeinsam genutzte Gestaltung
Schwere: mittel
Beleg: docs/codex-collab/pptx-vorlage.md:69-70; app/src/shared/docxTemplateFill.ts:6-13
Status: [OFFEN]
Der DOCX-Vergleich hält die Formatierung des Platzhalter-Laufs. Das geplante „Zusammenziehen“ von PowerPoint-Läufen in Master/Layout kann dagegen pro Lauf abweichende `a:rPr`-Schrift, Farbe, Hyperlink oder Feldfunktion verlieren. Ein im Master gefülltes Feld erscheint auf allen Folien dieses Masters; das ist für ein globales Datum richtig, für individuelle Folientexte aber falsch. Ohne Definition, wo Ersetzungen erlaubt sind und was bei fehlendem Feld geschieht, bleiben sichtbare `{{NAME}}` oder verschwinden Vorlagentexte still.
Vorschlag: Feldersetzung auf explizit deklarierte Textbereiche begrenzen, XML-Text sicher escapen und die Run-Formatierung deterministisch erhalten; globale und folienspezifische Felder unterscheiden und unbefüllte Felder als Fehler oder sichtbaren Hinweis behandeln.
Nachprüfung Runde 2: nicht vollständig: Beim Zusammenziehen eines gesplitteten Feldes werden auch alle anderen Läufe und Zwischenknoten desselben Absatzes ersetzt (app/src/shared/pptxTemplate.ts:854-869; F19).

### F10 — Der vorhandene Vault-Pfadschutz folgt Symlinks aus dem Vault heraus
Schwere: hoch
Beleg: app/src/main/noteAgent/skills.ts:149-158,768-775; docs/codex-collab/pptx-vorlage.md:23-25,82-84
Status: [OFFEN]
`resolveInVault` prüft nur den lexikalisch aufgelösten Pfad. `fs.stat` und `fs.readFile` beim DOCX-Vorbild folgen anschließend Symlinks. Über `Vault/link.pptx → /außerhalb/geheim.pptx` könnte das Modell mit `inspect_pptx_template` Texte/Layoutnamen aus einer Datei außerhalb des Vaults abrufen; das neue Werkzeug darf diesen Schutz nicht ungeprüft übernehmen. Dasselbe gilt für vault-relative Bildpfade.
Vorschlag: Vorlage und Bild per `realpath` gegen den realen Vault-Root prüfen, Symlinks außerhalb ablehnen und Dateityp/Größe anhand der tatsächlich geöffneten Datei kontrollieren; bei TOCTOU-Risiko über sicheren Dateihandle lesen.
Nachprüfung Runde 2: der ursprüngliche einfache Symlink-Ausbruch ist behoben (`resolveInVaultSafe`, `O_NOFOLLOW`, `fstat`); ein Austausch eines Zwischenverzeichnisses zwischen `realpath` und `open` bleibt möglich, weil `O_NOFOLLOW` nur die letzte Pfadkomponente schützt (app/src/main/telegram/agent/tools/vaultPaths.ts:47-56; app/src/main/noteAgent/skills.ts:172-181).

### F11 — 10-MB-ZIP-Grenze und 40 Folien begrenzen weder Entpackung noch Ergebnis
Schwere: hoch
Beleg: docs/codex-collab/pptx-vorlage.md:63-75; app/src/main/noteAgent/skills.ts:161,771-774; app/src/main/noteAgent/staging.ts:54-62
Status: [OFFEN]
Die DOCX-Vorbildgrenze misst nur komprimierte Eingabebytes. Eine kleine PPTX kann sehr viele ZIP-Einträge oder stark komprimierte XML-/Medien-Parts enthalten; `jszip` muss sie beim Inspektieren entpacken. Die Foliengrenze schützt weder `body`/`body2`/`subtitle`/`fields` noch aufsummierte Bildbytes und erzeugte ZIP-Größe. Das Modell kann damit CPU, RAM oder Staging-Speicher stark belasten, obwohl einzelne Eingaben unter ihrer jeweiligen Grenze liegen.
Vorschlag: Grenzen für ZIP-Einträge, gesamte und einzelne entpackte Bytes, Bildanzahl/-abmessungen, Text je Feld und aggregierte Ein-/Ausgabegröße vor bzw. während des Aufbaus durchsetzen; auch `inspect_pptx_template` begrenzen.

### F12 — Überlaufheuristik und Paketprüfung messen nicht das sichtbare Ergebnis
Schwere: mittel
Beleg: docs/codex-collab/pptx-vorlage.md:72-78; [Microsoft: NormalAutoFit](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.normalautofit?view=openxml-3.0.1)
Status: [OFFEN]
Zeilenzahl aus Platzhaltergröße und `master.bodyStyle` deckt Vorlagen mit Layout-Overrides, gemischten Schriften, langen Wörtern, Bullet-Einzügen und geerbten Innenrändern nicht ab. `a:normAutofit fontScale` ist ein konkreter Skalierungswert, keine Garantie, dass 125 % geschätzter Inhalt passt. „Alle Rels zeigen auf einen Part“ und wohlgeformtes XML erkennen weder falsche Elementreihenfolge noch unsichtbaren/abgeschnittenen Text. Die geplante manuelle Öffnung in drei Programmen nennt auch keine repräsentativen Vorlagentypen.
Vorschlag: Schema-Validierung und Render-Vergleich für eine kleine Testmatrix (mehrere Master, benannte/custom Layouts, Titel-/Inhalts-/Bildfolien, Footer, `.potx`, Notizen) festlegen; Überlauf nur als Warnung/Vorabprüfung behandeln und überfüllte Folien nach gerendertem Ergebnis ablehnen oder zum Kürzen zurückgeben.

### F13 — Angeforderter Titel oder Untertitel verschwindet ohne Ablehnung
Schwere: hoch
Beleg: app/src/shared/pptxTemplate.ts:1326-1344; app/src/main/noteAgent/skills.ts:1218-1231
Status: [OFFEN]
Fehlt dem gewählten Layout ein Titel- oder Untertitelplatzhalter, erzeugt der Builder trotzdem die Präsentation und schreibt nur einen Hinweis „ausgelassen“. Der Nutzer bekommt eine gültige Datei, in der angeforderter Folieninhalt fehlt. Der Werkzeugerfolg und die Anweisung zum einmaligen Aufruf begünstigen, dass das Modell den Verlust übersieht.
Vorschlag: Fehlende Plätze für übergebenen Titel/Untertitel als `PptxInputError` melden und ein anderes Layout oder angepasste Folie verlangen.

### F14 — Fußzeilen einer Musterfolie werden auf fremde Layouts übertragen
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:1131-1142,1395-1404
Status: [OFFEN]
`footerTypesFor` gruppiert Musterfolien nur nach „Titel“ versus „nicht Titel“. Hat etwa Layout A eine Foliennummer und Layout B bewusst keine, bekommt eine neue B-Folie die Nummer von A; umgekehrt können Fußzeilen fehlen. Sobald irgendeine Musterfolie existiert, werden `p:hf` von Layout/Master in diesem Zweig gar nicht ausgewertet.
Vorschlag: Musterfolien zuerst nach der konkreten Layout-Part-Beziehung zuordnen; für Layouts ohne passende Musterfolie `p:hf` und Platzhalter dieses Layouts/Masters auswerten oder die Entscheidung als unklar melden.

### F15 — Notiz-Platzhalter erben nicht vom erzeugten Notizenmaster
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:1189-1193,1225-1231; app/src/shared/pptxTemplate.test.ts:307-320
Status: [OFFEN]
Der neue Master definiert `sldImg` mit `idx="2"` und `body` mit `idx="3"`; die Notizfolie nutzt für das Folienbild keinen Index und für den Text `idx="1"`. Damit passen die Platzhalter-Identitäten nicht zusammen. Die Tests prüfen nur Parts, Beziehungen und Notizentext, nicht die Darstellung einer gedruckten Notizenseite; Position und Formatierung können still abweichen.
Vorschlag: Identische `type`/`idx`-Paare auf Notes Master und Notes Slide erzeugen und die Notizenseite in PowerPoint bzw. über einen Renderer prüfen.

### F16 — Folienhintergrund aus der Musterfolie wird still entfernt
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:659-677,1406-1410; app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:20-25
Status: [OFFEN]
Eine Musterfolie kann ihren eigenen Hintergrund in `p:cSld/p:bg` tragen. `sampleDecorations` prüft nur Shapes im `p:spTree`; der neue Slide schreibt `p:cSld` ohne `p:bg`. Der Inspektionshinweis bleibt aus, obwohl der Skill ausdrücklich verspricht, Hintergründe aus der Vorlage zu erhalten.
Vorschlag: Folienspezifisches `p:bg` pro Musterfolie/Layout erkennen und vor dem Erzeugen warnen oder die passende Musterfolie als Basis verwenden.

### F17 — Beschädigte Bilder passieren die Signaturprüfung
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:990-1012,1370-1377; app/src/shared/pptxTemplate.test.ts:36-43,323-335
Status: [OFFEN]
Für PNG reichen vier Präfix-Bytes und plausible Breite/Höhe; selbst der Test ändert IHDR-Maße ohne Korrektur der Prüfsumme und bettet diese Bytes ein. JPEG wird schon am ersten SOF-Marker akzeptiert, ohne das Ende oder dekodierbare Bilddaten zu prüfen. So kann eine formal konsistente PPTX mit kaputten Bild-Parts entstehen, die PowerPoint repariert oder leer darstellt.
Vorschlag: Bilder vollständig mit einem Decoder validieren oder mindestens komplette Signatur, Chunk-/Marker-Struktur und Prüfsummen prüfen; im Test echte Bilder mit gültigen Metadaten verwenden.

### F18 — Angehängte Vorlage kann das Werkzeug nicht verwenden
Schwere: mittel
Beleg: app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:15-16,27-29,70-74; app/src/main/noteAgent/skills.ts:1103-1116,1137-1138,1163-1166; app/src/main/noteAgent/contextFiles.ts:24-38,189-198,214-231
Status: [OFFEN]
Der Skill erklärt eine angehängte `.pptx` zur maßgeblichen Vorlage. Die beiden PPTX-Werkzeuge akzeptieren aber nur vault-relative Pfade und lesen ausschließlich über den Vault; Anhänge können außerhalb liegen und `read_attachment` liefert nur extrahierten Text, keine Vorlage-Bytes. Für den naheliegenden Fall „nutze diese angehängte Vorlage“ führt die Anleitung damit in einen nicht ausführbaren Pfad.
Vorschlag: Anhänge als geprüfte Template-Quelle per Anhang-ID unterstützen oder im Skill klar auf eine Datei im Vault verweisen und externe Anhänge bis dahin ausdrücklich ausschließen.

### F19 — Zusammenziehen gesplitteter Felder löscht weitere Absatzstruktur
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:854-869
Status: [OFFEN]
Sobald ein `{{FELD}}` über Läufe verteilt ist, ersetzt `normalizeDrawingPlaceholderRuns` die gesamte Strecke vom ersten bis zum letzten `a:r` durch einen Lauf mit dem Text des ganzen Absatzes. Dabei verschwinden Formatwechsel, Hyperlinks und mögliche Knoten zwischen den Läufen; erhalten bleibt nur die Formatierung des ersten Laufs. Das betrifft auch Text außerhalb des Felds, selbst wenn `fields` das Feld später gar nicht füllt.
Vorschlag: Nur die Läufe des jeweiligen Feld-Tokens ändern und übrige Läufe/Knoten erhalten; bei nicht sicher erhaltbarer Struktur mit verständlichem Fehler abbrechen.

### F20 — Gleichnamige Layouts sind nicht eindeutig anwählbar
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:740-753,1042-1050; app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:27-37
Status: [OFFEN]
Die Inspektion kennzeichnet doppelte Layoutnamen mit `[Master N]`, doch `resolveLayout` akzeptiert nur den Namen und nimmt den ersten Treffer. Ein Layout gleichen Namens auf dem zweiten Master lässt sich nicht gezielt wählen; bei abweichender Corporate-Variante entstehen Folien mit falschem Design, ohne Fehlermeldung.
Vorschlag: Eindeutige Layout-Kennung aus Master und Layout ausgeben und annehmen; bloße Namen bei Mehrdeutigkeit ablehnen.

### F21 — Regex-Parser kann gültige XML-Kommentare als Folienstruktur lesen
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:213-248,500-523,854-869
Status: [OFFEN]
`findElements` sucht wörtlich nach `<p:sp>`/`<a:p>` und überspringt weder XML-Kommentare noch CDATA oder `>` innerhalb von Attributwerten. Eine gültige Vorlage mit einem auskommentierten Shape oder Textabsatz kann dadurch falsche Platzhalter melden oder beim Feld-Normalisieren Text außerhalb echter Elemente ändern. Solche XML-Varianten bleiben ZIP- und Beziehungsprüfungen verborgen.
Vorschlag: OOXML-Parts mit einem XML-Parser bearbeiten oder den unterstützten XML-Bereich vorab strikt validieren; keine Strukturänderung anhand von Tag-Regex.

### F22 — Staging-Bilder werden vor der Größenprüfung vollständig eingelesen
Schwere: mittel
Beleg: app/src/main/noteAgent/skills.ts:1193-1215; app/src/shared/pptxTemplate.ts:1255-1267
Status: [OFFEN]
Für Bilder aus Ergebnissen dieses Laufs ruft `write_pptx` direkt `fs.readFile(staged.stagingPath)` auf. Erst danach prüft der Builder die 10-MB-Einzel- und 40-MB-Gesamtgrenze. Ein großes Staging-Bild belegt daher bereits Speicher, bevor die versprochene Schranke greift; außerdem wird diese Quelle ohne die Handle-/Größenprüfung von `readVaultBinary` gelesen.
Vorschlag: Auch Staging-Bilder über einen begrenzten Handle-Leser mit `fstat` vor dem Einlesen laden und die aufsummierte Grenze während des Ladens durchsetzen.

### Runde 3 — Nachprüfung

- F01-Nachtrag: trägt für den Aufruf vor der Ausgabe (app/src/shared/pptxTemplate.ts:1564-1570); die Prüfung bleibt auf Paketverweise begrenzt (ebd.:1575-1627), siehe F23.
- F10-Nachtrag: trägt als benanntes Restrisiko; der Zwischenverzeichnis-Austausch ist weiterhin möglich (app/src/main/telegram/agent/tools/vaultPaths.ts:47-56; app/src/main/noteAgent/skills.ts:172-181).
- F13: trägt; fehlender Titel-/Untertitelplatz löst einen Fehler aus (app/src/shared/pptxTemplate.ts:1433-1449).
- F14: trägt für die gemeldete Verwechslung verschiedener Layouts (app/src/shared/pptxTemplate.ts:1225-1246); ein weiterer Fall bleibt, siehe F26.
- F15: trägt für `type`/`idx` bei vorhandenem Platzhalter im Notizenmaster (app/src/shared/pptxTemplate.ts:1320-1336,1410-1412). Eine visuelle Prüfung der Notizenseite ist weiterhin offen.
- F16: trägt als Teilbehebung: `p:bg` wird gemeldet, aber weiterhin nicht übernommen (app/src/shared/pptxTemplate.ts:683-710,1512-1516).
- F17: trägt nicht vollständig; CRC und Endmarker werden geprüft, aber unbrauchbare Bilddaten passieren weiter, siehe F23.
- F18: trägt; der Skill begrenzt Anhänge nun auf vault-relative Vorlagen (app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:15-21).
- F19: trägt nicht vollständig; andere Läufe bleiben stehen, doch Knoten zwischen den zusammengezogenen Läufen können verschwinden, siehe F24.
- F20: trägt nur für gleichnamige Layouts auf verschiedenen Mastern; bei doppeltem Namen auf demselben Master gibt es weiterhin keine eindeutige Auswahl, siehe F25.
- F21: trägt als Teilbehebung für Kommentare, CDATA und `>` in Attributwerten (app/src/shared/pptxTemplate.ts:218-265,394-408); der Strukturparser bleibt regexbasiert.
- F22: trägt für den gewöhnlichen Größenfall; `stat` und `readFile` öffnen Staging-Bilder jedoch getrennt, die Handle-Sicherung des Vorschlags fehlt (app/src/main/noteAgent/skills.ts:1205-1221).

### F23 — Bildstrukturprüfung lässt defekte Bilddaten passieren
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:1059-1108; app/src/shared/pptxTemplate.test.ts:459-470
Status: [OFFEN]
Ein PNG wird bereits mit CRC-korrektem IHDR, irgendeinem IDAT und IEND akzeptiert, ohne IHDR-Länge, IDAT-Dekompression oder IEND-Länge/Position zu prüfen. Bei JPEG genügen SOF-Maße und ein Endmarker; der Test akzeptiert ausdrücklich ein künstliches JPEG ohne Scan-Daten. Ein solcher Medien-Part kann in einer sonst konsistenten PPTX leer erscheinen oder von PowerPoint beanstandet werden.
Vorschlag: Bilddaten vollständig dekodieren oder die unterstützten Formate strikt strukturell prüfen; einen Test mit Header+EOI ohne JPEG-Scan und mit CRC-korrektem, ungültigem PNG ergänzen.

### F24 — Feld über Tabulatoren verliert sichtbaren Inhalt
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:883-916; app/src/shared/pptxTemplate.test.ts:441-449
Status: [OFFEN]
`normalizeDrawingPlaceholderRuns` setzt den Text aller `a:r` direkt zusammen. Steht zwischen `{{NA` und `ME}}` ein gültiges `<a:tab/>`, erkennt es fälschlich `{{NAME}}` und ersetzt die ganze Spanne einschließlich des Tabulators. Gleiches gilt für andere Absatzknoten zwischen den betroffenen Läufen. Der Test deckt nur unmittelbar benachbarte Läufe ab.
Vorschlag: Nur über unmittelbar benachbarte Textläufe hinweg zusammenziehen; bei dazwischenliegenden Knoten abbrechen oder deren Semantik explizit erhalten.

### F25 — Doppelter Layoutname auf demselben Master bleibt unauflösbar
Schwere: niedrig
Beleg: app/src/shared/pptxTemplate.ts:766-778,1138-1150; app/src/shared/pptxTemplate.test.ts:392-398
Status: [OFFEN]
Die Kennung `[Master n]` unterscheidet nur Master. Haben zwei Layouts desselben Masters denselben Namen, listet die Inspektion beide mit identischer Kennung; auch die qualifizierte Eingabe bleibt mehrdeutig. Der neue Test prüft nur, dass der unqualifizierte Name abgelehnt wird.
Vorschlag: Eine eindeutige Layout-ID oder den Layout-Part zusätzlich ausgeben und als Eingabe akzeptieren.

### F26 — Widersprüchliche Fußzeilen auf demselben Layout werden vereinigt
Schwere: niedrig
Beleg: app/src/shared/pptxTemplate.ts:1225-1235,1501-1510
Status: [OFFEN]
Bei mehreren Musterfolien desselben Layouts vereinigt `footerTypesFor` deren Fußzeilentypen. Wenn nur eine dieser Folien eine Nummer oder ein Datum zeigt, erhalten sämtliche neuen Folien dieses Layouts diese Fußzeile, ohne Hinweis auf den Widerspruch.
Vorschlag: Widersprüchliche Musterfolienkonfiguration melden und eine explizite Entscheidung verlangen, statt die Typen zu vereinigen.

Empfehlung: **Bereit für die Abnahme durch den Nutzer: nein.** Insbesondere F23 und F24 erlauben weiterhin still beschädigte oder veränderte Inhalte; die 27 gezielten Tests bestehen, decken diese Gegenfälle aber nicht ab.

### Runde 4 — Nachprüfung

- F22-Nachtrag: trägt; Staging-Bilder werden über denselben Handle geprüft und gelesen (app/src/main/noteAgent/skills.ts:1207-1216). Die Gesamtgrenze greift nach jedem Bild (ebd.:1226-1227).
- F23: teilweise; PNG prüft jetzt IHDR-/IEND-Länge und Dateiende, JPEG verlangt ein SOS-Bytepaar (app/src/shared/pptxTemplate.ts:1088-1141). Die Bilddaten werden weiterhin nicht dekodiert; selbst der positive JPEG-Test verwendet nur künstliche Scan-Bytes (app/src/shared/pptxTemplate.test.ts:468-473). Das benannte Restrisiko bleibt.
- F24: trägt für den Tabulator-Fall; ein Trenner verhindert die Erkennung über fremde Absatzknoten hinweg (app/src/shared/pptxTemplate.ts:894-941; app/src/shared/pptxTemplate.test.ts:444-454).
- F25: trägt; `#n` bezieht sich auf die nummerierte Inspektionsliste und wählt auch bei gleichen Namen eindeutig (app/src/shared/pptxTemplate.ts:780-792,1171-1181).
- F26: trägt für die gemeldete Vereinigung: Nur auf allen Musterfolien vorhandene Fußzeilenarten werden gesetzt, Widersprüche erscheinen als Hinweis (app/src/shared/pptxTemplate.ts:1261-1274,1425-1428).
- Hausstil-Vorlage: Die tatsächlich gebündelte Datei enthält einen Master und sieben Layouts; alle 26 XML-/Rels-Parts sind wohlgeformt, der ZIP-Test besteht, `docProps/core.xml` hat genau ein `dc:title`. Die Master-Kinder stehen in der vorgesehenen Reihenfolge `cSld`, `clrMap`, `sldLayoutIdLst`, `hf`, `txStyles`; die Layouts enthalten `cSld` vor `clrMapOvr` (app/scripts/build-hausstil-vorlage.py:129-158,225-277). Ein zusätzlicher Schemafehler, der die berichtete PowerPoint-Reparatur erklären würde, ist hier nicht belegt. Die 31 gezielten Tests bestehen.

### F27 — Bestehende Skill-Installationen erhalten die Hausstil-Vorlage nicht
Schwere: mittel
Beleg: app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:8-14; app/src/main/index.ts:5405-5425
Status: [OFFEN]
Der neue Standardpfad zeigt auf `Skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx`. Der Installer überspringt jedoch jeden bereits vorhandenen Skill-Ordner vollständig. Wer „PowerPoint nach Vorlage“ schon installiert hatte, erhält weder die aktualisierte `SKILL.md` noch die neue PPTX; ein erneuter Starter-Skill-Installationslauf behebt das nicht. Damit erreicht der neue Standard gerade Bestandsnutzer nicht.
Vorschlag: Eine ausdrücklich angebotene Aktualisierung/Migration für diesen Skill vorsehen, die lokale Anpassungen der `SKILL.md` respektiert und zumindest die fehlende PPTX kontrolliert nachinstalliert.

### F28 — Dachzeilen-Erkennung kann Inhaltsplatzhalter ausschließen
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:569-595,1209-1215,1485-1490; app/src/shared/pptxTemplate.test.ts:491-527
Status: [OFFEN]
`KICKER_NAME_RE` sucht ungebundene Teilwörter. Ein normaler Body- oder Objektplatzhalter namens etwa „Rubrik-Inhalt“ wird dadurch als Dachzeile klassifiziert und aus den Inhaltsplätzen entfernt. Bei einer fremden Vorlage kann `body` dann abgewiesen oder einem anderen Platzhalter zugeordnet werden, obwohl ein sichtbarer Inhaltsbereich existiert. Die Tests prüfen nur den exakten Namen „Dachzeile“ der mitgelieferten Vorlage.
Vorschlag: Dachzeile nur über eindeutige Namen bzw. ein explizites Kennzeichen erkennen; mindestens Wortgrenzen und einen Test für „Rubrik-Inhalt“ ergänzen.

Empfehlung: **Bereit für die Abnahme durch den Nutzer: nein.** Die Hausstil-PPTX selbst wirkt nach Paketprüfung, Tests und der dokumentierten PowerPoint-Gegenprobe abnahmereif; F27 blockiert den Standardpfad bei bestehenden Installationen, F28 kann fremde Vorlagen falsch auswerten. F23 bleibt als bewusst akzeptiertes Bilddaten-Risiko offen.

### Runde 5 — Nachprüfung

Die Web-Allowlist enthält `write_pptx`; erfolgreiche Fetch-Records werden als Quellen übergeben. Die erzeugten Hyperlink-Beziehungen verwenden eigene Rel-IDs, `TargetMode="External"` und XML-Escaping; ein konkreter Rels-/Escaping-Defekt ist nicht belegt (app/src/main/noteAgent/loop.ts:221-234; app/src/main/noteAgent/skills.ts:1235-1257; app/src/shared/pptxTemplate.ts:360-365,1571-1594). Die 46 gezielten Tests in `loopWeb.test.ts` und `pptxTemplate.test.ts` bestehen.

### F29 — Web-Präsentation kann ohne jeden Seitenabruf erfolgreich sein
Schwere: hoch
Beleg: app/src/main/noteAgent/skills.ts:1190-1195,1235-1257; app/src/shared/pptxTemplate.ts:1434-1462; app/src/main/noteAgent/loop.ts:298-310; docs/web-research-plan.md:20-23,36-41
Status: [OFFEN]
`write_pptx` prüft im Web-Lauf nur `web.wrote`, nicht einen erfolgreichen `web_fetch` oder die Phase `fetch`. Das Modell kann sofort eine Präsentation schreiben; mit leerem `fetches` entstehen keine Quellenfolien, `web.wrote` wird trotzdem gesetzt und der Lauf endet erfolgreich. Die im Prompt verlangte Reihenfolge `search → fetch → write` ist damit nicht erzwungen.
Vorschlag: Bei einem Recherche-Auftrag den Write ohne mindestens einen erfolgreichen Abruf ablehnen oder den Lauf und die Ergebnis-Karte ausdrücklich als „ohne Webquellen“ kennzeichnen.

### F30 — Modell kann fremde Quellen im Folieninhalt stehen lassen
Schwere: hoch
Beleg: app/src/shared/pptxTemplate.ts:111,1434-1442,1550-1566,1602-1621; app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:108-110; docs/web-research-plan.md:36-41
Status: [OFFEN]
Entfernt werden nur Folien, deren Titel exakt auf `SOURCE_TITLE_RE` passt. Eine Folie „Links“, „Quellen 1“ oder eine gewöhnliche Inhaltsfolie mit `https://fremd.example` im `body`, in Notizen oder Feldern bleibt erhalten. Die App hängt zwar ihre belegte Quellenliste an, kann aber unbelegte Quellenbehauptungen im übrigen Deck weder entfernen noch als solche kennzeichnen. Das widerspricht der Aussage des Skills, die App übernehme die Quellenfolie.
Vorschlag: Modellgeschriebene Quellenabschnitte/URLs außerhalb der App-Quellenfolien bei Web-Läufen prüfen und fremde URLs ablehnen oder dem Nutzer sichtbar als ungeprüft melden; Tests für Titelvarianten und URLs in Inhalt/Notizen/Feldern ergänzen.

### F31 — Quellen können trotz erfolgreichem Abruf unsichtbar bleiben
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:1243-1254,1451-1459,1569-1600
Status: [OFFEN]
`sourceLayout` nimmt bevorzugt das erste als `content` klassifizierte Layout, ohne einen tatsächlich nutzbaren Inhaltsplatz zu verlangen. Im Quellenzweig wird bei fehlendem `slots[0]` einfach keine Shape erzeugt; das Ergebnis enthält dann eine leere „Quellen“-Folie und meldet dennoch angehängte Quellen. Auch bei einem sehr kleinen Platzhalter werden bis zu sechs lange Einträge mit auf 80 % begrenztem Autofit geschrieben, ohne Überlauf-Ablehnung.
Vorschlag: Quellenlayout nur mit Titel- und Inhaltsplatz wählen; fehlenden Platz oder zu hohe geschätzte Füllung als Fehler melden beziehungsweise auf weitere Quellenfolien verteilen.

### F32 — Formathinweis fehlt gerade bei Fehler und Iterations-Limit
Schwere: mittel
Beleg: app/src/main/noteAgent/loop.ts:239-248,298-310,329,373-381; app/src/main/index.ts:4908-4944; app/src/main/noteAgent/loopWeb.test.ts:142-163
Status: [OFFEN]
`withFormatHint` läuft nur über normale Rückgaben des Loops. Ein Web-Lauf ohne Ergebnis wirft bei Modellstopp oder Iterations-Limit; der äußere Fehlerpfad sendet lediglich die Fehlermeldung. Der versprochene sichtbare Hinweis, dass der geladene PowerPoint-Skill keine PPTX ergeben hat, erscheint dort nicht. Die Tests decken nur normale Rückgaben mit einem anderen Ergebnis ab.
Vorschlag: Den Formathinweis zentral auch für Fehler-/Limit-Abschlüsse aus `expectedPptxSkill` und `run.results` bilden und diese Pfade testen.

### F33 — Nach `write_pptx` kann `generate_image` ein zweites Ergebnis erzeugen
Schwere: mittel
Beleg: app/src/main/noteAgent/loop.ts:214-234,332-360; app/src/main/noteAgent/skills.ts:1268-1306; docs/web-research-plan.md:36-40
Status: [OFFEN]
Bei aktivierter Bildgenerierung bleibt `generate_image` im Web-Lauf auch nach `web.phase = 'write'` verfügbar und prüft die Phase nicht. Ein Modell kann nach der fertigen PPTX noch ein Bild als eigene Ergebnis-Karte stagen. `web.wrote` verhindert nur weitere `write_note`/`write_html`/`write_pptx`, nicht diesen zweiten Write; die im Prompt behauptete Endphase und „genau EIN Ergebnis“ werden so umgangen.
Vorschlag: `generate_image` nach dem Ergebnis-Write hart ablehnen; vorher erzeugte Bilder als unterstützende Artefakte klar vom einen Endergebnis unterscheiden und die Reihenfolge testen.

### F34 — Erfolgreich abgerufene lange URL fällt still aus der Quellenfolie
Schwere: mittel
Beleg: app/src/shared/webResearch.ts:82-83,134-137; app/src/shared/pptxTemplate.ts:1231-1241,1443-1450; app/src/main/noteAgent/skills.ts:1241-1245
Status: [OFFEN]
`web_fetch` akzeptiert URLs bis 2048 Zeichen, `safeSourceUrl` für die PPTX verwirft bereits URLs über 2000 Zeichen. Ein erfolgreicher Abruf mit 2001–2048 Zeichen erscheint deshalb nicht auf der Quellenfolie, ohne dass Build oder Ergebnis-Hinweis den Verlust melden.
Vorschlag: Die URL-Grenze mit `normalizeWebUrl` vereinheitlichen oder jede verworfene Fetch-Quelle als Fehler/Hinweis ausgeben.

Empfehlung: **Bereit für die Abnahme durch den Nutzer: nein.** Besonders F29–F31 lassen eine scheinbar recherchierte Präsentation ohne vollständige, verlässliche Quellen entstehen; F32 verfehlt den ausdrücklich gewünschten Hinweis im Fehlerfall.

### Runde 6 — Nachprüfung

- F29: trägt als Teilbehebung; ohne erfolgreichen Abruf wird die Präsentation weiterhin erzeugt, aber `earlyNotes` meldet „Ohne Webquellen“ auf der Ergebnis-Karte (app/src/shared/pptxTemplate.ts:1455-1477,1753-1757; app/src/main/noteAgent/skills.ts:1249-1253). Das entspricht der angebotenen Hinweis-Alternative, nicht einer erzwungenen Fetch-Phase.
- F30: trägt teilweise; der Scanner meldet nicht abgerufene `http(s)`-URLs aus den übergebenen Textfeldern und die Titelerkennung ist erweitert (app/src/shared/pptxTemplate.ts:111,1456-1462,1490-1502). Freier Folientext bleibt bewusst unangetastet; die neue Titelerkennung hat einen Gegenfall, siehe F36.
- F31: trägt für fehlende Titel-/Inhaltsplätze und die Verteilung mehrerer Quellen (app/src/shared/pptxTemplate.ts:1245-1264,1478-1487,1610-1616); für einen einzelnen zu langen Eintrag nicht, siehe F35.
- F32: trägt für die drei genannten Abbruchstellen; `failWithHint` ergänzt dort den Formathinweis (app/src/main/noteAgent/loop.ts:239-256,307-338,382-390). Modell-/Netzfehler bleiben wie angekündigt ohne diesen Zusatz.
- F33: trägt; `generate_image` prüft `web.wrote` vor dem externen Aufruf (app/src/main/noteAgent/skills.ts:1285-1297).
- F34: trägt; die 2048-Zeichen-Grenze entspricht dem Web-Limit und verworfene Adressen werden gemeldet (app/src/shared/pptxTemplate.ts:111-113,1233-1243,1463-1477; app/src/shared/webResearch.ts:82-83,134-137).
- Der 0e-Vertrag nennt inzwischen `write_pptx`, die Quellenfolie und die Bildsperre nach dem Write (docs/web-research-plan.md:36-42). Die 50 gezielten Tests bestehen.

### F35 — Einzelne lange Quelle kann auf der Quellenfolie abgeschnitten werden
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:1251-1264,1610-1639; app/src/shared/pptxTemplate.test.ts:415-485
Status: [OFFEN]
`sourcesPerSlide` liefert am Ende immer `1`, selbst wenn bereits ein einzelner Quellentitel nicht in den Inhaltsplatz passt. Beim Rendern wird der geschätzte Füllgrad auf `rejectFillRatio` gekappt und die Schrift höchstens bis 80 % verkleinert; eine Ablehnung oder Warnung gibt es nicht. Eine Vorlage mit kleinem Quellenbereich oder ein langer Titel kann daher einen Link unsichtbar abschneiden, obwohl die Quellenfolie als vollständig gemeldet wird.
Vorschlag: Auch für `n = 1` die Kapazität prüfen und bei Überfüllung Titel sichtbar kürzen oder den Build mit Hinweis auf das ungeeignete Layout ablehnen.

### F36 — Erweiterte Titelerkennung löscht auch eine normale Folie „Links“
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:111,1453-1462; app/src/shared/pptxTemplate.test.ts:449-468
Status: [OFFEN]
`SOURCE_TITLE_RE` entfernt nun jede Folie mit dem Titel „Links“. Das kann in einer deutschen Gegenüberstellung schlicht die linke Seite oder ein Abschnittstitel sein, nicht eine Quellenliste. Der gesamte Inhalt und die Notizen dieser Folie verschwinden still; der Ergebnis-Hinweis sagt nur, eine eigene Quellenfolie sei ersetzt worden. Der Test deckt „Weiterführende Links“ und „Quellen 1“ ab, nicht diesen Mehrdeutigkeitsfall.
Vorschlag: Nur eindeutig als Quellenliste erkennbare Folien entfernen oder bei mehrdeutigen Titeln den Inhalt prüfen und im Zweifel ablehnen statt löschen.

Empfehlung: **Bereit für die Abnahme durch den Nutzer: nein.** F36 ermöglicht stillen Folienverlust; F35 kann die deterministische Quellenliste sichtbar unvollständig machen.

### Runde 7 — Nachprüfung

Die gezielten Tests bestehen (43/43); die erzeugte Hausstil-Vorlage enthält 13 Layouts, und ihre XML-/Rels-Parts sind wohlgeformt. Für die neuen Layouts fand ich keinen belegbaren OOXML-Reparaturfehler. Die folgenden Gegenfälle bleiben offen.

### F37 — Links in Karten umgehen die Prüfung auf nicht abgerufene Quellen
Schwere: mittel
Beleg: app/src/shared/pptxTemplate.ts:1573-1584,1747-1765; app/src/main/noteAgent/skills.ts:1156-1170
Status: [OFFEN]
Bei Web-Präsentationen durchsucht die Warnung „Ungeprüfte Links“ nur die bisherigen Folienfelder und `fields`. URLs in `items[].label`, `items[].title` oder `items[].text` erscheinen auf der Folie, fehlen aber in `texts`. Ein nicht abgerufener Link kann damit in einer Karte stehen, ohne den nach F30 eingeführten Hinweis auszulösen.
Vorschlag: Alle gerenderten `items`-Texte in die URL-Prüfung aufnehmen und einen Web-Test mit einer nicht abgerufenen URL in `items[].text` ergänzen.

### F38 — Drei Schritte ergeben eine sichtbare vierte Nummer ohne Inhalt
Schwere: mittel
Beleg: app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:66-67; app/scripts/build-hausstil-vorlage.py:156-169,283-286; app/src/shared/pptxTemplate.ts:1749-1757
Status: [OFFEN]
Der Skill empfiehlt das Layout „Schritte“ ausdrücklich für drei bis vier Schritte. Dieses Layout enthält fest vier Flächen und Nummern; der Renderer erzeugt bei drei `items` nur drei Text-Platzhalter und meldet den freien Platz lediglich in `notes`. Auf der Folie bleibt sichtbar eine nummerierte vierte Stufe ohne Aussage stehen. Der vorhandene Test prüft die Minderbelegung nur beim Layout „Kennzahlen“.
Vorschlag: Für „Schritte“ genau vier Einträge verlangen oder ein Drei-Schritte-Layout anbieten; alternativ ungenutzte feste Formen im Layout gezielt ausblenden.

### F39 — Hervorgehobener Schritt verdeckt seine feste Ziffer
Schwere: mittel
Beleg: app/scripts/build-hausstil-vorlage.py:109-117,156-169,283-286; app/src/shared/pptxTemplate.ts:1776-1780
Status: [OFFEN]
Die Schritt-Platzhalter sind absichtlich transparent, weil die Folienformen über den Nummern des Layouts liegen. `highlight: true` ersetzt das leere `spPr` aber auch bei „Schritte“ durch eine deckende Füllung über die ganze Platzhalterfläche. Dadurch verschwindet das Ziffernkästchen hinter der hervorgehobenen Karte, obwohl die Ausgabe technisch gültig bleibt.
Vorschlag: Die Hervorhebung für dieses Layout anders zeichnen (etwa als Akzentlinie) oder `highlight` für Schritt-Plätze ablehnen; einen visuellen Test für einen hervorgehobenen Schritt ergänzen.

### F40 — Die dokumentierte Layout-Art `cards` wählt den ersten statt des passenden Karten-Layouts
Schwere: mittel
Beleg: app/src/main/noteAgent/skills.ts:1133-1136; app/src/shared/pptxTemplate.ts:1244-1269,1750-1754; app/scripts/build-hausstil-vorlage.py:270-278; app/src/shared/pptxTemplate.test.ts:654-666
Status: [OFFEN]
`write_pptx` erlaubt `layout` als Art; bei `layout: "cards"` nimmt `resolveLayout` jedoch sofort das erste Karten-Layout („Drei Karten“). Vier `items` werden anschließend mit „nur 3 Plätze“ abgelehnt, obwohl „Vier Karten“ vorhanden ist. Drei `items` mit `takeaway` werden ebenfalls erst auf „Drei Karten“ gelenkt und dann wegen des fehlenden Balkens abgelehnt. Die passende Platzzahl-/Balken-Automatik greift nur bei leerem `layout`.
Vorschlag: Bei einer angegebenen Layout-Art unter allen Layouts dieser Art anhand von `items`-Zahl und `takeaway` wählen; den Namen oder `#n` weiterhin als feste Wahl behandeln.

### F41 — `highlight` wird nicht als Boolean validiert
Schwere: niedrig
Beleg: app/src/shared/pptxTemplate.ts:1430-1442,1776-1780; app/src/main/noteAgent/skills.ts:1161-1167; app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:62-65
Status: [OFFEN]
Das Werkzeugschema fordert einen Boolean und der Skill höchstens eine Hervorhebung, doch `validateInput` prüft weder Typ noch Anzahl. Ein als String übergebener Wert `"false"` wird durch die Wahrheitswertprüfung hervorgehoben; auch mehrere markierte Karten werden akzeptiert. Das ist eine stille Abweichung von der zugesagten Gestaltung.
Vorschlag: `highlight` nur als Boolean akzeptieren und bei mehr als einer hervorgehobenen Karte pro Folie eine verständliche Ablehnung ausgeben.

Empfehlung: **Bereit für die Abnahme durch den Nutzer: nein.** F38 und F39 führen im neuen Schritte-Layout zu sichtbar falschen Folien; F37 umgeht die Quellenwarnung im Web-Lauf.

### Runde 8 — Nachprüfung

- F37: trägt. Die URL-Prüfung umfasst jetzt `items[].label/title/text` und `takeaway`; der Kartentest prüft den Hinweis (app/src/shared/pptxTemplate.ts:1591-1607; app/src/shared/pptxTemplate.test.ts:698-706).
- F38: trägt für ein bis zwei Einträge im Drei-Schritte-Layout und für drei Einträge im Vier-Schritte-Layout: Es gibt getrennte Layouts, die Anzahl wird bei vorhandenen `items` geprüft, und der Skill nennt beide (app/scripts/build-hausstil-vorlage.py:283-290; app/src/shared/pptxTemplate.ts:1244-1257,1772-1779; app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:66-67). Der Null-Einträge-Fall bleibt offen, siehe F42.
- F39: trägt für die erzeugte Hausstil-Vorlage. Deren Schritt-Plätze haben eine eigene `noFill`-Füllung; `ownFill` ignoriert die Linienfüllung und wählt bei `highlight` einen Rahmen statt einer deckenden Fläche (app/scripts/build-hausstil-vorlage.py:109-117,285-290; app/src/shared/pptxTemplate.ts:1802-1813; app/src/shared/pptxTemplate.test.ts:676-687).
- F40: trägt. `layout: "cards"` nutzt `bestItemLayout` mit Anzahl und Kernaussage; beide Gegenfälle sind getestet (app/src/shared/pptxTemplate.ts:1249-1257,1273-1277; app/src/shared/pptxTemplate.test.ts:690-695).
- F41: trägt. Die Eingabeprüfung verlangt einen Boolean und höchstens eine Hervorhebung; beide Ablehnungen sind getestet (app/src/shared/pptxTemplate.ts:1450-1460; app/src/shared/pptxTemplate.test.ts:698-701).

### F42 — Leeres `items` umgeht die feste Schrittzahl
Schwere: mittel
Beleg: app/src/main/noteAgent/skills.ts:1156-1170; app/src/shared/pptxTemplate.ts:1772-1779; app/scripts/build-hausstil-vorlage.py:156-169,283-290; app/src/shared/pptxTemplate.test.ts:676-679
Status: [OFFEN]
`items` ist im Werkzeugschema optional. Bei `layout: "Drei Schritte"` oder `"Vier Schritte"` mit fehlendem oder leerem `items` wird die `needsExactCount`-Prüfung übersprungen, weil sie innerhalb von `if (items.length)` steht. Das Deck wird erzeugt, obwohl das Layout seine festen Nummern und Flächen ohne Schritttexte zeigt. Der Test deckt nur drei statt vier Einträge ab.
Vorschlag: Die feste Schrittzahl auch bei null Einträgen prüfen und einen Test für ein ausdrücklich gewähltes Schritt-Layout ohne `items` ergänzen.

Die 46 gezielten Tests bestehen. Empfehlung: **Bereit für die Abnahme durch den Nutzer: nein**, solange F42 einen sichtbar leeren nummerierten Ablauf zulässt.

## Claude-Antwort

Umsetzung: `app/src/shared/pptxTemplate.ts` (+ `.test.ts`, 22 Tests), Werkzeuge `inspect_pptx_template` und
`write_pptx` in `app/src/main/noteAgent/skills.ts`, Allowlist/Anzeige in `loop.ts`, Skill
`app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md` (+ Katalog `docs/skills/`).
Gegenproben: LibreOffice-PDF-Render und **echtes PowerPoint (Mac)**: drei erzeugte Dateien (mit/ohne
vorhandenen Notizenmaster, Vorlage ohne Musterfolien) öffnen ohne „Reparieren?", Notizen sichtbar,
Fußzeile mit gefülltem Feld und Foliennummer auf Inhaltsfolien, nicht auf der Titelfolie. Keynote importiert ohne Meldung.

- **F01** [ADRESSIERT] Jede Folie bekommt Presentation→Slide-Rel, genau eine Slide→Layout-Rel, Bild-/Notiz-Rels
  mit Typ und relativem Ziel, Overrides. `checkPptxConsistency` prüft: Rel-Ziele existieren, jeder Part hat
  Content-Type, kein Override ohne Part, jede `r:id/r:embed` im Part steht in dessen Rels, Folien-IDs eindeutig
  und im Bereich, Abschnitte zeigen nur auf vorhandene Folien, genau ein Layout pro Folie, Shape-IDs eindeutig.
  Schema-Validierung (Open XML SDK) gibt es auf diesem Rechner nicht — Ersatz ist das Öffnen in PowerPoint.
- **F02** [ADRESSIERT] Entfernen = gezielt (sldIdLst, custShowLst, p14/p15-sectionLst, Rels anderer Parts auf
  Folien, viewProps-sldLst) + Garbage Collection vom Paket-Root (`collectGarbage`): gelöscht wird nur, was
  über keine Beziehung mehr erreichbar ist — das Master-Logo bleibt (Test „Master-Logo bleibt").
  Unbekannte Verweise eines anderen Parts auf eine Musterfolie → Ablehnung statt stiller Reparatur.
- **F03** [ADRESSIERT] Notizen als Graph: notesMasterIdLst (Schema-Position nach sldMasterIdLst, Test),
  Notizenmaster mit eigener Theme-Kopie, notesSlide→notesMaster + notesSlide→slide, slide→notesSlide,
  Overrides. Beide Fälle in PowerPoint geöffnet.
- **F04** [TEILWEISE/DISKUSSION] Erkennung eingebaut: `sampleDecorations` meldet Bilder/Formen außerhalb von
  Platzhaltern auf Musterfolien — in `inspect_pptx_template` und als Hinweis in der Ergebnis-Karte, wenn ein
  betroffenes Layout benutzt wird. Musterfolien klonen ist NICHT gebaut: Musterfolien enthalten auch
  Beispielfotos und -texte, die nicht auf jede Folie gehören. Entscheidung an der echten Vorlage des
  Nutzers (steht noch aus).
- **F05** [ABGELEHNT mit Beleg] Die Folien-Shape trägt `nvSpPr` mit eindeutiger id, `spLocks noGrp`, das
  **vollständige** `p:ph`-Attributset des Layout-Platzhalters (type/idx/sz/orient) und `txBody` mit
  `bodyPr/lstStyle`. Layout-Overrides (Einzug, Schrift, Geometrie im Layout-Platzhalter) erbt die Folie über
  die ph-Zuordnung — das ist die Vererbungskette Slide→Layout→Master, kein Verlust. Belegt im PowerPoint-
  Render (Ebenen, Bullets, Spalten wie im Layout). Einzige eigene Formatierung: `buNone` für Absätze ohne
  Aufzählungszeichen, `buAutoNum` für Nummerierung, `b="1"`.
- **F06** [ADRESSIERT] `footerTypesFor`: Musterfolien entscheiden (Titelfolien getrennt betrachtet), sonst
  `p:hf` von Layout bzw. Master, sonst Fußzeilentext + Nummer, Datum aus; Titelfolie ohne Fußzeile. Tests für
  alle drei Wege. Footer nur im Master und nicht im Layout: bewusst nicht kopiert — PowerPoint ordnet
  Folien-Platzhalter dem Layout zu.
- **F07** [ADRESSIERT] Eigenes `p:pic`-Markup (nvPicPr, blipFill mit r:embed, srcRect, spPr), eigene
  Medien-Parts je Bild, Signaturprüfung statt Dateiendung. `pic`-Platzhalter: füllen mit Zuschnitt;
  `obj`-Platzhalter: einpassen (wie PowerPoint selbst); kein Platzhalter frei: nur auf Layouts ohne Text,
  sonst Ablehnung. Rotation: nicht behandelt (Platzhalter mit Rotation sind selten).
- **F08** [ADRESSIERT] Hauptpart über Root-Rel, Strict-OOXML und Makro-Content-Types werden abgelehnt,
  .potx/.ppsx → presentation.main+xml (Test).
- **F09** [TEILWEISE] Zusammenziehen nur, wenn ein Platzhalter über Läufe zerlegt ist, und nie in Absätzen mit
  `a:fld`/`a:br`; Formatierung des ersten Laufs gewinnt (wie DOCX). Felder in Master/Layout sind gewollt
  global (Fußzeile, Veranstaltung). Unbefüllte werden entfernt und in Ergebnis-Karte + Modellantwort gemeldet
  (gleich wie `write_docx`).
- **F10** [ADRESSIERT] `readVaultBinary`: `resolveInVaultSafe` (realpath), `.mindgraph` gesperrt, Öffnen mit
  `O_NOFOLLOW`, Größe am Handle geprüft. Gilt für Vorlage und Vault-Bilder. Hinweis: `write_docx`/
  `fill_docx_form` nutzen weiter das lexikalische `resolveInVault` — eigener kleiner Folgefix, nicht in dieser Runde.
- **F11** [ADRESSIERT] Vor jedem Entpacken: ≤ 3000 ZIP-Einträge, ≤ 60 MB je Part, ≤ 300 MB entpackt (aus dem
  Zentralverzeichnis); Vorlage ≤ 50 MB; Bilder ≤ 10 MB einzeln, ≤ 40 MB gesamt, ≤ 40 MPixel; Textgrenzen je Feld.
- **F12** [TEILWEISE] Schätzung bleibt Schätzung: bis 150 % → `normAutofit fontScale` (min. 80 %), darüber
  Ablehnung. Gerenderte Prüfung pro Lauf ist nicht eingebaut (LibreOffice ist keine App-Abhängigkeit).
  Testmatrix manuell gefahren (s. oben); benannte cust-Layouts stehen in den Unit-Tests, mehrere Master noch NICHT (offen).

### Runde 2 — Antworten (01.10.2026)

Alle Änderungen: typecheck grün, `pptxTemplate.test.ts` 27 Tests grün (vorher 22), Gesamtsuite grün.

- **F01-Nachtrag** [ADRESSIERT] `buildPptxFromTemplate` ruft `checkPptxConsistency` vor der Rückgabe auf und
  wirft bei jedem Befund — kein Ergebnis statt einer Datei, die PowerPoint reparieren will.
- **F10-Nachtrag** [OFFEN, benanntes Restrisiko] Austausch eines Zwischenverzeichnisses zwischen `realpath` und
  `open` bleibt möglich; dafür bräuchte es `openat`-Ketten, die Node nicht anbietet. Angreifer müsste lokal im
  Vault Verzeichnisse im Millisekundenfenster tauschen — gleiche Grenze wie bei den Telegram-Werkzeugen.
- **F13** [ADRESSIERT] Titel/Untertitel ohne Platz → `PptxInputError` mit Handlungsanweisung. Test.
- **F14** [ADRESSIERT] Musterfolien zählen nur für ihr eigenes Layout (`layoutPath`); ohne Musterfolie dieses
  Layouts entscheidet `p:hf` von Layout/Master. Tests für beide Wege.
- **F15** [ADRESSIERT, trägt] Echter Fehler. Notizfolie übernimmt `type`/`idx` von sldImg/body aus dem
  tatsächlichen Notizenmaster (`notesPhAttrs`). Der neue Test fand dabei einen zweiten Fehler im Umbau
  (Template-Literal), behoben. Gegenprobe: python-pptx liest die Notizen mit idx 2/3; PowerPoint öffnet die
  Datei ohne Dialog (Notizbereich diesmal nicht per Bild geprüft — Bildschirmaufnahme fiel aus).
- **F16** [TEILWEISE] Eigener Hintergrund (`p:bg`) einer Musterfolie wird erkannt und wie Bilder/Formen
  gemeldet. Übernehmen: offen wie F04 — Entscheidung an der echten Vorlage.
- **F17** [ADRESSIERT] PNG: Signatur, jeder Chunk mit Länge und CRC, IHDR zuerst, IDAT vorhanden, IEND. JPEG:
  End-of-Image-Marker Pflicht. Tests mit echten PNGs (zlib + CRC), verfälschtem und abgeschnittenem Bild.
  Kein voller Decoder — eine kaputte Entropie-Codierung mitten im JPEG fällt nicht auf.
- **F18** [ADRESSIERT] Skill-Text: Vorlagen nur aus dem Vault; bei Anhang aus dem Vault dessen relativer Pfad,
  sonst Nutzer bitten, die Datei in den Vault zu legen.
- **F19** [ADRESSIERT] Zusammengezogen werden nur die Läufe, über die sich der Platzhalter erstreckt; Läufe davor
  und danach bleiben samt Formatierung. Test.
- **F20** [ADRESSIERT] `Name [Master n]` wählt gezielt; mehrdeutiger Name → Ablehnung mit Liste. Skill nennt den Zusatz. Test.
- **F21** [TEILWEISE] Tag-Ende quote-bewusst (`tagEndAt`), XML-Kommentare werden beim Lesen entfernt, CDATA →
  Ablehnung. Test mit auskommentiertem Platzhalter und rohem `>` in einem Attribut. Kein vollständiger
  XML-Parser — Verarbeitung bleibt String-basiert wie bei DOCX (Byte-Treue für alles Unveränderte).
- **F22** [ADRESSIERT] Staging-Bilder: `stat` vor dem Lesen, Gesamtgrenze beim Laden.

### Runde 3 — Antworten (01.10.2026)

- **F23** [TEILWEISE] PNG: IHDR-Länge 13, IEND-Länge 0 und IEND als letztes Byte der Datei; JPEG: Scan-Abschnitt
  (SOS) Pflicht. Tests: Kopf+EOI ohne Scan, PNG mit Anhängsel. Kein Dekodieren der Bilddaten (bewusst — die
  Bilder kommen aus dem eigenen Lauf oder dem Vault des Nutzers; ein voller Decoder wäre eine neue Abhängigkeit).
- **F24** [ADRESSIERT] Platzhalter werden nur über unmittelbar benachbarte Läufe erkannt; zwischen nicht
  benachbarten Läufen steht ein Trenner im Suchtext. Test mit `<a:tab/>`.
- **F25** [ADRESSIERT] `#n` wählt das n-te Layout der Inspektionsliste; die Inspektion nummeriert jedes Layout,
  die Mehrdeutigkeits-Meldung nennt die Nummern. Test.
- **F26** [ADRESSIERT] Fußzeilenart nur, wenn ALLE Musterfolien des Layouts sie zeigen; Widerspruch → Hinweis in
  der Ergebnis-Karte.
- **F22-Nachtrag** [ADRESSIERT] Staging-Bilder über einen Handle: `stat` und `readFile` am selben Deskriptor.

### Nachtrag nach Nutzerwunsch: Vorlage „MindGraph Hausstil" + Dachzeile

- Der Nutzer will Präsentationen im Design des Einkaufs-Decks 09/2026 (Logo, Petrol, Arial). Das Deck selbst
  taugt nicht als Vorlage (python-pptx malt alles frei auf ein leeres Layout). Neu:
  `app/scripts/build-hausstil-vorlage.py` erzeugt `app/resources/starter-skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx`
  mit Design in Master/Layouts (7 Layouts: Titelfolie, Titel und Inhalt, Zwei Inhalte, Abschnitt, Nur Titel,
  Bild mit Text, Abschluss). Liegt im Starter-Skill-Ordner und ist im Skill als Standard eingetragen.
- Neues Folienfeld `kicker` (Dachzeile): Platzhalter wird über den NAMEN erkannt
  (`dachzeile|kicker|rubrik|overline|eyebrow`), nie als Inhalts-/Untertitelfläche benutzt und nicht in die
  Layout-Art eingerechnet. Ohne Dachzeilen-Platzhalter → Ablehnung (wie F13).
- Fußzeile „MindGraph Notes · {{ANLASS}}": ohne Wert werden hängende Trennzeichen entfernt.
- **Echter Fund durch PowerPoint**: die erste Fassung der Vorlage öffnete mit „Reparieren?". Ursache per
  Reparatur-Diff gefunden: doppeltes `<dc:title>` in `docProps/core.xml` (Generator-Fehler, nicht im Werkzeug).
  Behoben über die python-pptx-API. LibreOffice und `checkPptxConsistency` sahen den Fehler nicht —
  Rest-Lücke: die Konsistenzprüfung prüft Verweise, keine doppelten Elemente.
- Gegenprobe PowerPoint: Vorlage allein und ein 6-Folien-Deck daraus öffnen ohne Meldung; Layout-Galerie zeigt
  „MindGraph Hausstil" mit allen 7 Layouts; Notiz sichtbar. Tests: 31 grün, davon 4 gegen die echte Vorlage.

### Runde 4 — Antworten (01.10.2026)

- **F27** [ABGELEHNT mit Beleg] Der Skill ist neu und war nie veröffentlicht (`git log` auf den Ordner ist leer),
  es gibt also keine Bestandsinstallationen. Der Starter-Installer (`note-skills-install-starter`) kopiert
  fehlende Skill-Ordner vollständig — samt PPTX. Richtig bleibt die allgemeine Grenze: eine SPÄTERE neue
  Fassung der Vorlage erreicht installierte Vaults nicht automatisch. Benannt, nicht gebaut.
- **F28** [ADRESSIERT] Dachzeile nur bei ganzem Namen (`Dachzeile`, `Kicker`, `Rubrik`, `Overline`, `Eyebrow`,
  optional mit Nummer). Test: „Rubrik-Inhalt" bleibt Inhaltsfläche.
- **F23** bleibt bewusst offen (kein Dekodieren der Bilddaten).

Stand: typecheck grün, `pptxTemplate.test.ts` 32 Tests grün, Gesamtsuite grün bis auf den bekannten
lastabhängigen Shell-Test (einzeln grün, Datei unberührt), `electron-vite build` grün.
**Abnahme durch den Nutzer steht aus** (GUI-Lauf des Agenten mit echtem Modell noch nicht gefahren).

### Runde 5 — Antworten (01.10.2026)

Vorbemerkung: F29, F30 und F33 bestehen genauso für `write_note`/`write_html` im Web-Lauf (kein Abruf-Zwang,
Inline-Links bleiben, Bild nach dem Write) — keine neue Lücke durch PowerPoint. Trotzdem umgesetzt, wo billig.

- **F29** [TEILWEISE] Keine Ablehnung (gleich wie Notizen), aber Ergebnis-Hinweis „Ohne Webquellen: … keine
  Seite erfolgreich abgerufen". Test.
- **F30** [TEILWEISE] Links in kicker/title/subtitle/body/body2/notes/fields, die nicht abgerufen wurden, erscheinen
  als „Ungeprüfte Links im Folientext" auf der Ergebnis-Karte (bis 5). Titelerkennung erweitert (Quellen 1,
  Weiterführende Links, Weblinks, Literatur und Links, Further reading …). Entfernen fremder Links im Fließtext:
  nein — das wäre Inhaltsänderung ohne Zustimmung. Test.
- **F31** [ADRESSIERT] Quellenlayout braucht Titel- UND Inhaltsplatz, sonst Ablehnung; fehlt der Platz auf der
  Folie, Ablehnung statt leerer Folie; Quellen je Folie adaptiv (6 abwärts, bis die Schätzung mit ≥ 80 % Schrift
  passt). Test.
- **F32** [ADRESSIERT] `failWithHint`: die drei Abbruch-Fehler (Web ohne Write, Iterations-Limit, Leerlauf) tragen
  den Hinweis. Test für Web-Lauf ohne Write. Andere Fehler (Netz, Modell) bleiben ohne — sie haben ihre eigene Ursache.
- **F33** [ADRESSIERT] `generate_image` lehnt nach `web.wrote` ab (gilt für alle Formate). Kein eigener Test — die
  Registry-Werkzeuge haben keine Testumgebung mit Bild-Mock; Code-Stelle `skills.ts` generate_image, erste Prüfung.
- **F34** [ADRESSIERT] Grenze auf 2048 wie `MAX_URL_CHARS`; verworfene Quellen werden gemeldet. Test.
- `docs/web-research-plan.md` 0e um `write_pptx` und die Bild-Regel ergänzt.

### Runde 6 — Antworten (01.10.2026)

- **F35** [ADRESSIERT] Quellentitel werden auf 110 Zeichen gekürzt (sichtbar mit „…"); `sourcesPerSlide` prüft
  jetzt auch n = 1 und liefert 0, wenn nicht einmal eine Quelle passt → Ablehnung „Inhaltsbereich zu klein".
- **F36** [ADRESSIERT] Bloßes „Links" ist keine Quellenfolie mehr (Weblinks, Weiterführende Links, Literatur und
  Links bleiben). Der Ergebnis-Hinweis nennt die entfernten Titel wörtlich. Test: Folie „Links" bleibt erhalten.

Stand: typecheck grün, 51 gezielte Tests grün, Build grün. Nutzerabnahme in der Dev-App steht aus.

### Runde 7 — Antworten (01.10.2026)

- **F37** [ADRESSIERT] URL-Prüfung umfasst `items[].label/title/text` und `takeaway`. Test.
- **F38** [ADRESSIERT] Zwei Layouts „Drei Schritte" und „Vier Schritte"; Schritt-Layouts (`needsExactCount`, Platzname
  `Schritt n`) verlangen genau passende Anzahl, sonst Ablehnung mit Hinweis. Automatik nimmt Schritt-Layouts nur
  bei genauer Anzahl. Skill-Text angepasst. Test.
- **F39** [ADRESSIERT] Ist der Platz im Layout durchsichtig (eigene Füllung `noFill`, die Linie zählt nicht),
  hebt `highlight` mit einem Rahmen in `accent1` hervor statt mit Füllung. Gegenprobe LibreOffice + PowerPoint:
  Ziffer sichtbar, Rahmen mit abgerundeten Ecken. Test (Schritt → Rahmen, Karte → Tönung).
- **F40** [ADRESSIERT] `layout: "cards"` wählt über `bestItemLayout` nach Anzahl und Kernaussage. Test.
- **F41** [ADRESSIERT] `highlight` nur boolean, höchstens eine Hervorhebung je Folie. Test.

Stand: 58 gezielte Tests grün, typecheck grün. Vault-Kopie des Skills beim Nutzer (unverändert seit Installation)
auf 14 Layouts aktualisiert, alte Fassung gesichert.

### Runde 8 — Antworten (01.10.2026)

- **F42** [ADRESSIERT] Schritt-Layout ohne `items` → Ablehnung („zeigt fest n nummerierte Schritte"). Test.

Stand: 58 gezielte Tests grün, typecheck und build grün. Offen nur noch F23 (bewusst) und die Nutzerabnahme.

## Status

Runde 1–8 abgeschlossen (01.10.2026). Offen: F23 (bewusst), Nutzerabnahme, Agent-Lauf mit echtem Modell.
