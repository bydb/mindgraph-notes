# Hausdesign-Builder — Plan Rev. 2 (08.11.2026)

## Aufgabe

Codex prüft den Plan unten adversarial (Lücken, Sicherheit, Fehlannahmen über den Code) und beantwortet die fünf Fragen am Ende. Kein Code-Edit.

## Kontext/Anker

- Mindmap-Farben fest: `app/src/shared/excalidrawMindmap.ts:166` (PETROL), Verwendung `:551`, `:584`
- HTML-Seite CSS-Variablen: `app/src/shared/scientificHtmlPage.ts:86`, `:117`
- PPTX nach Vorlage, `highlight`-Füllung: `app/src/shared/pptxTemplate.ts:1817`; Vorlage `app/resources/starter-skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx`, Generator `app/scripts/build-hausstil-vorlage.py`
- Vault-Binärlesen symlink-sicher: `app/src/main/noteAgent/skills.ts:231`
- Infografik-Modus: `app/src/main/noteAgent/skills.ts:1611`
- HTML-Assets beim Übernehmen: `app/src/main/noteAgent/htmlAssets.ts:44`
- Briefvorlage füllen: `app/src/shared/docxTemplateFill.ts`
- Skills-Block im Agent-Prompt: `app/src/main/noteAgent/loop.ts:130`
- Skills laden (Ordner ohne SKILL.md übersprungen): `app/src/main/noteAgent/skillsLoader.ts:53`
- Schreibgrenze: `app/src/main/index.ts:2254` (`writeFileSafe`)
- Einstellungsseite Skills: `app/src/renderer/components/Settings/SkillsSection.tsx`

## Plan

## Anlass

Erste Nutzergruppe: Leitungen von Medienzentren, Schulen, Hochschulen und Akademien. Sie wollen, dass alles,
was der Agent erzeugt (Präsentation, Mindmap, HTML-Seite, Infografik, Brief), im Erscheinungsbild ihrer
Einrichtung erscheint. Heute ist überall Petrol fest verdrahtet.

**Nutzerentscheidungen 08.11.2026:**
- Stufe 1 startet nur mit dem Logo (keine hochgeladenen Office-Vorlagen).
- Der Builder sitzt in Einstellungen → Skills.
- Angepasst werden ALLE gestaltenden Skills, nicht nur Präsentation und Brief.
- Testlogo: ein mehrfarbiges SVG eines Medienzentrums (liegt außerhalb des Repos — Kundenname, nie committen;
  Tests im Repo laufen mit einem synthetischen SVG).
- Ein vorhandener Briefkopf-Skill einer Einrichtung bleibt unberührt.

## Grundentscheidung: EIN Hausdesign-Profil, die Werkzeuge lesen es

Nicht jede SKILL.md umschreiben (Nutzerdateien, Kappungsgrenze 12 000 Zeichen, Abdrift bei Updates der
Starter-Skills). Stattdessen:

```
Skills/hausdesign/
  SKILL.md            ← sichtbar, erklärt dem Agenten das Hausdesign (Name, Farben, welche Vorlagen)
  hausdesign.json     ← Daten, liest NUR der Main
  logo.png            ← vom Main neu kodiert (nie das Original)
  <Kurz>-Praesentation.pptx
  <Kurz>-Briefkopf.docx   (optional, Schalter „Briefkopf erzeugen“; aus, wenn schon einer existiert)
```

`hausdesign.json` (Schema `shared/brand.ts`, streng geprüft, Version 1):
`{ version, name, subline?, contact?: { address, phone, email, web }, colors: { primary, secondary?, dark },
derived: {...}, logo: { file, width, height }, enabled }`

Der Main lädt das Profil einmal pro Agent-Lauf (`loadBrand(vault)`, Größe ≤ 64 KB, Logo ≤ 2 MB, symlink-sicher
wie `readVaultBinary`). Kaputt/fehlend → kein Hausdesign, Lauf läuft mit Petrol weiter und die Karte sagt es.

## Wo das Hausdesign wirkt

| Ausgabe | Werkzeug | Was sich ändert |
|---|---|---|
| Präsentation | `write_pptx` | Vorlage `Skills/hausdesign/*.pptx`: Hausstil-Deck umgefärbt + Logo getauscht (siehe unten). Gibt der Agent keine Vorlage an oder die mitgelieferte Hausstil-Vorlage, nimmt der Main bei aktivem Hausdesign diese. Eine ausdrücklich andere Vorlage gilt unverändert. |
| Mindmap | `write_excalidraw` | `PETROL`/`PETROL_TINT` → Primärfarbe/Tönung (Kontrast geprüft). Kategorie-Farben 🔴🟢🔵 bleiben (Bedeutung). Logo nicht in Stufe 1 (Excalidraw-`files` + Plugin-Einbettung ungeprüft). |
| HTML-Seite | `write_html` | CSS-Variablen `--accent`, `--accent-soft`, `--fig-line`, `--fig-line-2` aus dem Profil (hell UND dunkel abgeleitet); Logo im Seitenkopf als relatives Asset, beim Übernehmen kopiert wie KaTeX (`htmlAssets.ts`). |
| Infografik | `generate_image` mode `infografik` | Satz an den Bild-Prompt: „Farbpalette: Primär #…, Akzent #…, sonst neutral“. Kein Logo im Bild (Modell malt Logos falsch). |
| Brief | `write_docx({ template })` | Erzeugter Briefkopf (Logo, Name, Absenderzeile, Kontakt-Fußzeile, `{{INHALT}}`). |
| Agent-Prompt | `loop.ts` | kurzer Block „Hausdesign aktiv: <Name>. Präsentationen: Vorlage …, Briefe: Vorlage … oder vorhandener Briefkopf-Skill.“ |

Nicht in Stufe 1: Edumap (feste Edumaps-Farbnamen), Veranstaltungsjournal (eigener Stil-Block im Skill, eigene
Phasenfarben), Arbeitsblatt (Markdown/DOCX ohne Farbe).

## Präsentation: umfärben statt neu bauen

`MindGraph-Hausstil.pptx` (gemessen): genau ein Bild `ppt/media/mg-logo.png`; Farben als feste `srgbClr` in
Master/Layouts (`1F6F6A` 44×, `1C2024` 41×, `F3F4F6` 17×, `222B3A` 4×, `E3F0EE`/`9FD3CB` je 3×, `B9C2CC`,
`E6EAEF`, `D5D9DE`) plus `a:clrScheme`.

`shared/brandDeck.ts` (pur, JSZip): Farbtabelle ALT → NEU NUR für die bekannten Hausstil-Werte in Master,
Layouts, Theme; Logo-Bytes tauschen, Seitenverhältnis per „contain“ in die bestehende Box; Theme-Name setzen
(kein zweites `dc:title`); `checkPptxConsistency` vor Ausgabe.

| Rolle | Ableitung |
|---|---|
| Akzent `1F6F6A`, `accent1`, `hlink` | Primärfarbe (Schrift-Variante bei Kontrast < 4,5:1 auf Weiß abgedunkelt) |
| `E3F0EE` | Primär 12 % auf Weiß |
| `9FD3CB`, `accent6` | Primär 45 % auf Weiß |
| `222B3A`, `dk2` (dunkle Folien) | dunkelste Logofarbe, sonst Primär auf L* ≈ 20 |
| `accent2` (Amber) | Sekundärfarbe, falls vorhanden |
| Text/Grau/Fläche | bleiben |

## Farben aus dem Logo

`sharp` (Main, schon Abhängigkeit) rastert SVG/PNG/JPG auf 96 px; transparente, fast weiße, fast schwarze und
graue Pixel (Sättigung < 0,25) fallen weg; Gruppierung nach Farbton (12 Sektoren), Gewicht = Pixelanzahl.
Primär = schwerste Gruppe, Sekundär = schwerste mit Farbtonabstand ≥ 60°. Vorschlag, nie still: Farbfelder mit
Hex-Eingabe, Vorschau (Titelfolie, Mindmap-Knoten, HTML-Kopf, Briefkopf) vor dem Anlegen.

## Einstellungen → Skills → Karte „Hausdesign“

- Leer: „Hausdesign einrichten“ → Logo wählen (OS-Dialog im Main) → Formular (Name Pflicht, Zusatzzeile,
  Kontakt) → Farben (Vorschlag) → Vorschau → „Anlegen“.
- Vorhanden: Logo, Name, Farbfelder, Schalter „Hausdesign verwenden“, „Ändern“, „Entfernen“ (Rückfrage; löscht
  nur `Skills/hausdesign/`).
- Bausteine NUR aus `SettingsUI` (`Card`, `ServiceHead`, `Row`, `TextInput` …), Texte in `i18n/settingsPages.ts`.

## Sicherheit

- Logo nur über `dialog.showOpenDialog` im Main, ≤ 5 MB, Endungen svg/png/jpg; `sharp` rastert und schreibt PNG
  ≤ 1200 px neu. In Vault und Office-Dateien landet nie die Originaldatei (SVG-Skripte, präparierte PNG-Chunks).
  sharp/librsvg lädt keine externen Ressourcen (zu prüfen: `xlink:href` auf http/Datei).
- Alle Schreibvorgänge über `writeFileSafe`/`assertSafePath` unter `Skills/hausdesign/`.
- Farben aus der JSON nur als `#RRGGBB` (Regex) — sie landen in CSS und XML.
- Name/Kontakt in XML/HTML escaped.
- Kein Sprachmodell, keine Netzwerkzugriffe.

## Tests

- `shared/brandPalette.test.ts`: Farbableitung, Kontrast-Rückfall (Gelb), Grau-Logo ohne Vorschlag.
- `shared/brandDeck.test.ts`: alle alten Hausstil-Werte weg, neue da, Logo-Rels, `checkPptxConsistency`.
- `shared/brand.test.ts`: Schema lehnt kaputte/feindliche Werte ab.
- `excalidrawMindmap`/`scientificHtmlPage`: mit/ohne Profil.
- Rundlauf Briefkopf mit `fillDocxTemplate`.
- GUI per Computer Use: Builder mit dem Testlogo durchklicken, dann Agent-Läufe Präsentation, Mindmap,
  HTML-Seite; PPTX in PowerPoint/LibreOffice öffnen.

## Fragen an Codex

1. Profil + Werkzeuge lesen es vs. SKILL.md umschreiben — Lücken?
2. Ersetzen der mitgelieferten Hausstil-Vorlage durch die Hausdesign-Vorlage im Main: zu magisch? Besser nur
   über den Prompt-Block?
3. Feste Farbtabelle in der PPTX: Stellen mit `lumMod`/`lumOff` auf `accent1` (`highlight`), die bei heller
   Primärfarbe unlesbar werden?
4. Logo-Weg: Lücken (SVG-External-Refs in librsvg, Dekompressionsbombe)?
5. Dunkelmodus der HTML-Seite: Ableitung der hellen Akzentvariante?

## Codex-Findings

### F01 — Titelfolie und Fußzeile behalten „MindGraph Notes“
Schwere: hoch
Stelle: app/scripts/build-hausstil-vorlage.py:180, app/scripts/build-hausstil-vorlage.py:229, app/scripts/build-hausstil-vorlage.py:233
Status: [OFFEN]
Der Plan tauscht Logo, Farben und Theme-Namen, aber die Vorlage enthält eine feste Wortmarke auf der Titelfolie und `MindGraph Notes · {{ANLASS}}` in der Fußzeile. `write_pptx` ersetzt nur `{{FELDER}}` und erzeugt Folien auf diesen Layouts (`app/src/main/noteAgent/skills.ts:1442`, `app/src/shared/pptxTemplate.ts:1023`). Eine Kundenpräsentation trägt damit weiterhin die fremde Marke; ein Test „alle alten Farbwerte weg“ findet das nicht.
Vorschlag: Wortmarke und Fußzeile als explizite, strukturell identifizierte Felder der bekannten Vorlage ersetzen; lange Einrichtungsnamen mit realen Layout-Grenzen prüfen. Test auf verbleibende `MindGraph Notes`-Texte in allen PPTX-Parts und visuelle Titelfolienprüfung ergänzen.

### F02 — Vorlagen-Umschaltung muss Inspektion und Schreiben gleich behandeln
Schwere: hoch
Stelle: app/src/main/noteAgent/skills.ts:1419, app/src/main/noteAgent/skills.ts:1483, app/src/main/noteAgent/skills.ts:1488, app/src/main/noteAgent/skills.ts:1527
Status: [OFFEN]
`write_pptx` verlangt `template` im Tool-Schema und lehnt einen fehlenden Pfad ab. `inspect_pptx_template` liest den vom Agenten genannten Pfad unabhängig davon. Nur in `write_pptx` die mitgelieferte Vorlage umzuleiten erzeugt eine falsche Inspektion und eine andere tatsächliche Vorlage. „Keine Vorlage angegeben“ ist mit dem aktuellen Schema kein verlässlicher Pfad. Der Starter-Skill nennt zudem ausdrücklich den alten Pfad (`app/resources/starter-skills/praesentation-nach-vorlage/SKILL.md:10`).
Vorschlag: Eine gemeinsame Main-seitige Alias-Auflösung für **genau** den bekannten Starter-Pfad in Inspektion und Schreiben verwenden; den effektiven Pfad in beiden Ergebnissen anzeigen und als Quelle verbuchen. Für fehlenden `template` entweder Schema und Tool-Text anpassen oder diese Ausnahme streichen. Alle anderen Pfade, insbesondere eine vom Nutzer angepasste Skill-Vorlage, unverändert lassen.

### F03 — Hausdesign-Skill und vorhandene Skills haben keine geklärte Priorität
Schwere: hoch
Stelle: app/src/main/noteAgent/loop.ts:128, app/src/main/noteAgent/skills.ts:710, app/src/main/noteAgent/skillsLoader.ts:61, app/src/main/noteAgent/skillsLoader.ts:85
Status: [OFFEN]
Der Agent sieht nur `name` und `description` der aktivierten Skills und soll passende Anleitungen per `use_skill` laden. Ein neuer `Skills/hausdesign/SKILL.md` wird damit ein weiterer konkurrierender Skill; weder dessen Nutzung noch die Reihenfolge gegenüber dem bestehenden Präsentations- oder Briefkopf-Skill ist garantiert. `skillsDisabled` in `.mindgraph/vault-settings.json` und das geplante `hausdesign.json.enabled` wären zwei unabhängige Schalter. Main-seitige Gestaltung könnte aktiv bleiben, obwohl der Hausdesign-Skill deaktiviert ist, oder umgekehrt.
Vorschlag: Profilaktivierung als alleinige technische Wahrheit festlegen, Skill nur als erklärende Anleitung behandeln und die Priorität für explizite Nutzeranweisung, vorhandenen Briefkopf-Skill, eigene Vorlage und Hausdesign-Standard im Agent-Prompt sowie im Main identisch definieren. Deaktivierung und Entfernen in der UI daran koppeln.

### F04 — Feste Farbtabelle verwechselt Textfarbe und Flächenfarbe
Schwere: hoch
Stelle: app/scripts/build-hausstil-vorlage.py:231, app/scripts/build-hausstil-vorlage.py:248, app/scripts/build-hausstil-vorlage.py:264, app/src/shared/pptxTemplate.ts:1817
Status: [OFFEN]
In der echten Vorlage ist `1F6F6A` sowohl Flächenfarbe des Titelfolien-Balkens als auch Textfarbe von Dachzeilen und Karten; `9FD3CB` ist heller Text auf dunklen Folien. Ein globales ALT→NEU für `1F6F6A` kann keine dunklere Schriftvariante auf Weiß und zugleich die unveränderte Primärfarbe für Flächen liefern. `9FD3CB` als pauschal 45 % Primär auf Weiß kann auf dem neu abgeleiteten dunklen Grund zu wenig Kontrast haben. `checkPptxConsistency` prüft Paketbeziehungen und IDs, keine Lesbarkeit (`app/src/shared/pptxTemplate.ts:1943`).
Vorschlag: bekannte XML-Stellen nach Rolle (Text, Füllung, Linie, dunkler Folientext, Theme-Eintrag) umfärben und für jede Text/Hintergrund-Paarung Mindestkontrast prüfen. Mit hellgelbem, sehr hellem Cyan und dunklem Blau alle Layouts und erzeugte Kartenfolien rendern. Eine reine „alte Hexwerte weg“-Prüfung reicht nicht.

### F05 — `accent1`-Highlight ist hell, aber nur als Teil der Kontrastprüfung sicher
Schwere: mittel
Stelle: app/src/shared/pptxTemplate.ts:1811, app/src/shared/pptxTemplate.ts:1817, app/src/shared/pptxTemplate.ts:1820
Status: [OFFEN]
Die dynamische Kartenfüllung nutzt `accent1` mit `lumMod=13000`, `lumOff=87000`, `satMod=55000`. Die Luminanz wird damit stark in Richtung Weiß verschoben; eine helle Primärfarbe macht diese Füllung eher schwer unterscheidbar als für dunklen Kartentext unlesbar. Beim transparenten Platz wird dagegen ein Rahmen in der **vollen** Akzentfarbe erzeugt. Der Plan prüft diese nach dem Folienbau entstehenden Farben nicht. Die Theme-Änderung wirkt also auch außerhalb der festen `srgbClr`-Tabelle.
Vorschlag: resultierende Theme-Transformationen für Highlight-Füllung und Rahmen auswerten oder mit Extremfarben rendern; Kontrast und erkennbare Hervorhebung getrennt prüfen. `accent1` bei Bedarf auf eine für den jeweiligen Einsatzzweck geprüfte Rolle setzen.

### F06 — Logo-Box ist quadratisch und neben einer festen Wortmarke
Schwere: mittel
Stelle: app/scripts/build-hausstil-vorlage.py:232, app/scripts/build-hausstil-vorlage.py:233
Status: [OFFEN]
Das einzige Logo liegt in der Titelfolien-Layoutdatei in einer 0,55 × 0,55 Zoll großen `a:stretch`-Box. Bei einem breiten oder hohen Kundenlogo verhindert das Tauschen der PNG-Bytes allein Verzerrung nicht. „Contain“ erfordert eine Anpassung der Bildgeometrie oder transparente Randflächen; die benachbarte feste Wortmarke beginnt bei x=1,45 Zoll. Ein breites Logo bleibt in der kleinen Quadratbox womöglich praktisch unlesbar, ein vergrößertes kann mit dem Namen kollidieren.
Vorschlag: Bild innerhalb einer definierten gemeinsamen Logo/Name-Zone passend skalieren, mit maximalen Breiten/Höhen und Überlappungsprüfung; extreme Seitenverhältnisse in Vorschau und PPTX-Rendertest aufnehmen.

### F07 — HTML-Logo wird vom bisherigen Asset-Kopierer nicht getragen
Schwere: hoch
Stelle: app/src/main/noteAgent/htmlAssets.ts:21, app/src/main/noteAgent/htmlAssets.ts:33, app/src/main/noteAgent/htmlAssets.ts:44, app/src/main/index.ts:5206
Status: [OFFEN]
`ensureHtmlPageAssets` kopiert nur gebündelte KaTeX-Dateien; vorhandene Dateien im Ziel werden absichtlich nie überschrieben. Für ein Vault-Logo gibt es noch keinen Kopierpfad. Wird es unter einem festen relativen Namen abgelegt, zeigen ältere Seiten nach einer Profiländerung auf das neue Logo; bei `copyMissingRecursive` bleibt umgekehrt das alte Logo. Das Ziel liegt neben der übernommenen HTML-Datei, nicht unter `Skills/hausdesign/`. Der Plan „wie KaTeX“ beschreibt diese Zustands- und Pfadfrage nicht.
Vorschlag: pro Logo-Version einen inhaltsadressierten Dateinamen verwenden, beim Accept genau die zum Lauf gehörenden Bytes kopieren, Zielpfad nochmals per `assertSafePath` prüfen und Kollisionen/Fehler atomar behandeln. Test: zwei Seiten vor und nach Profiländerung im selben Ordner müssen jeweils ihr ursprüngliches Logo zeigen.

### F08 — Wiederhergestelltes Quell-CSS kann Hausdesign-CSS übersteuern
Schwere: mittel
Stelle: app/src/main/noteAgent/skills.ts:411, app/src/main/noteAgent/skills.ts:1193, app/src/main/noteAgent/skills.ts:1200, app/src/shared/scientificHtmlPage.ts:111
Status: [OFFEN]
Beim Überarbeiten einer angehängten HTML-Seite speichert der Lauf deren `<style>`-Block und setzt ihn vor den Artikelinhalt wieder ein. `buildScientificHtmlPage` bettet diesen Inhalt nach seinem eigenen CSS ein. Definiert die angehängte Seite `:root { --accent: … }`, gewinnt ihr späterer Stilblock gegen die geplanten Hausdesign-Variablen. Der Builder würde für neue Seiten funktionieren, bei Korrekturen derselben Seite aber still zurückfallen.
Vorschlag: explizit entscheiden, ob beim Überarbeiten der Quellstil oder das aktive Hausdesign Vorrang hat. Bei Hausdesign-Vorrang die geschützten Variablen nach dem Quellstil setzen oder den Quellstil gezielt bereinigen; dafür einen Regressionstest ergänzen.

### F09 — SVG/PNG-Eingang: Dateigröße und Endung begrenzen die Decodierung nicht
Schwere: hoch
Stelle: docs/codex-collab/skill-builder-hausdesign.md:108, app/src/main/noteAgent/skills.ts:231, app/src/main/index.ts:1395
Status: [OFFEN]
Der vorgesehene Dialog autorisiert eine Datei **außerhalb** der freigegebenen Vaults; `assertSafePath` und `readVaultBinary` sind dafür nicht direkt anwendbar. Eine 5-MB-Grenze und `resize(1200)` nach dem Öffnen begrenzen weder deklarierte Pixelmaße, SVG-Komplexität noch eingebettete `data:`-Bilder zuverlässig. Die Aussage, librsvg lade keine externen Ressourcen, ist im Plan ausdrücklich ungeprüft; ein bloßer Endungsfilter prüft auch nicht den tatsächlichen Dateityp. Das ist vor dem Decodieren zu klären, bevor das Original in `sharp` gelangt.
Vorschlag: nur den vom Main-Dialog gelieferten Pfad auf einem geöffneten Handle lesen, `fstat`/Byte-Limit am Handle prüfen, Dateisignatur bzw. SVG-XML-Typ validieren, SVG mit externen Referenzen/DTD/Entities/`foreignObject` ablehnen und sichere Pixel-/Dimensions- sowie Verarbeitungsgrenzen setzen. Reale Gegenproben für `file:`/`http:`/`data:`-Referenzen, verschachtelte SVGs und kleine Dateien mit riesigen Dimensionen vorsehen.

### F10 — `writeFileSafe` kann PNG, PPTX und DOCX nicht sicher schreiben
Schwere: hoch
Stelle: app/src/main/index.ts:2254, app/src/main/index.ts:2301, app/src/main/binaryWrite.ts:24
Status: [OFFEN]
Der Plan verlangt „alle Schreibvorgänge über `writeFileSafe`/`assertSafePath`“. `writeFileSafe` nimmt einen `string` und schreibt UTF-8; damit würden Binärdateien beschädigt. `writeBinaryFileSafe` existiert, führt selbst aber keine Vault- oder Unterordnerprüfung durch. Die bisherige Agentenübernahme kopiert Binärdateien erst nach `assertSafePath` auf den Zielordner (`app/src/main/index.ts:5185`, `app/src/main/index.ts:5202`). Beim Builder fehlt ein konkreter atomarer Mehrdateien-Ablauf.
Vorschlag: Zielordner und jeden Zielpfad Main-seitig gegen den freigegebenen Vault **und** den erwarteten `Skills/hausdesign`-Teilbaum kanonisieren; Binärbytes über einen dafür geeigneten, atomaren Schreibweg ablegen. Profil/Skill erst nach erfolgreicher Erzeugung aller Assets aktivieren; Fehler und Entfernen dürfen keine halbe aktive Konfiguration hinterlassen.

### F11 — Feste Ordnerkennung kann eine Nutzerdatei überschreiben oder löschen
Schwere: hoch
Stelle: app/src/main/noteAgent/skillsLoader.ts:233, app/src/main/noteAgent/skillsLoader.ts:243, app/src/main/index.ts:5622, docs/codex-collab/skill-builder-hausdesign.md:102
Status: [OFFEN]
`Skills/hausdesign` ist ein normaler Skill-Ordner: `createSkill` könnte denselben Namen erzeugen; die Starter-Installation überspringt vorhandene Ordner bewusst. Der Plan sieht „Entfernen“ als Löschen des gesamten Ordners vor, ohne Besitz-/Versionsmarker oder Migrationsregel. Existiert dort bereits ein eigener Skill oder wurden nach Anlage Nutzerdateien hinzugefügt, verletzt das den Wunsch, vorhandene Skills unberührt zu lassen.
Vorschlag: bei vorhandener Ordnerkennung abbrechen und einen anderen verwalteten Namen wählen oder eine ausdrückliche Migration anbieten. Nur manifestierte Builder-Dateien entfernen; unbekannte Dateien und manuelle Änderungen erhalten. Profilstatus nicht allein aus einem Ordnernamen ableiten.

### F12 — Dunkle HTML-Akzente brauchen eigene Kontrastziele
Schwere: mittel
Stelle: app/src/shared/scientificHtmlPage.ts:112, app/src/shared/scientificHtmlPage.ts:123, app/src/shared/scientificHtmlPage.ts:169, app/src/shared/scientificHtmlPage.ts:175
Status: [OFFEN]
Die aktuelle Seite nutzt getrennte Akzentwerte für Weiß (`#0b6e6e`) und Dunkelmodus (`#4fb3ab` auf `#16181c`); `--accent` färbt unter anderem kleine Abstract-Überschriften und Links. Die „Primär 12 % auf Weiß“-Tönung aus dem Hellmodus ist als dunkle **Fläche** ungeeignet; die unveränderte Primärfarbe kann als Text auf `#16181c` zu dunkel sein. Auch ein bloßes Aufhellen ohne Prüfung kann auf `--accent-soft` verschwinden. Der Plan nennt „hell UND dunkel abgeleitet“, aber keine Kontrastbedingungen pro Einsatz.
Vorschlag: getrennte Token für Text/Linien und Tönungsfläche in beiden Modi berechnen; mindestens Akzenttext gegen `--bg` und `--accent-soft` sowie `--fig-line`/`--fig-line-2` gegen den Plot-Hintergrund prüfen. Weiße, gelbe, graue und sehr dunkle Logos als Testfälle verwenden.

### F13 — Infografik-Palette ist ein externer Bild-Prompt
Schwere: niedrig
Stelle: app/src/main/noteAgent/skills.ts:1640, app/src/main/noteAgent/skills.ts:1644, app/src/main/imageGen/imagenService.ts:14, app/src/main/index.ts:4890
Status: [OFFEN]
Für `generate_image` ist das Bildmodell Google Nano Banana; das Werkzeug erscheint nur beim aktivierten Modul mit API-Key. Der im Plan genannte Zusatz zur Farbpalette wird dadurch an einen externen Dienst gesendet. „Kein Sprachmodell, keine Netzwerkzugriffe“ kann nur für den Builder selbst gelten, nicht für die später gestaltete Infografik. Außerdem prüft der aktuelle Tool-Pfad die Prompt-Länge vor `generateImage`; der angehängte Farbzusatz muss in dieses Limit einbezogen werden (`app/src/main/noteAgent/skills.ts:1641`).
Vorschlag: Geltungsbereich der Offline-Aussage präzisieren, nur freigegebene Hexfarben und keine Kontakt-/Namensdaten an das Bildmodell geben und die Gesamtlänge nach Anfügen der Palette prüfen.

### F14 — Name und Kontaktdaten sind auch Prompt- und Layout-Eingaben
Schwere: mittel
Stelle: app/src/main/noteAgent/loop.ts:130, app/src/shared/pptxTemplate.ts:237, app/src/shared/pptxTemplate.ts:257, app/src/shared/docxTemplateFill.ts:58
Status: [OFFEN]
Der Plan nennt XML/HTML-Escaping, aber keine Längen- und Zeichenregeln für `name`, `subline` und Kontaktfelder. XML-Escaping allein entfernt keine unzulässigen Steuerzeichen; `pptxTemplate` hat dafür eigens `cleanXml`. Derselbe Name soll in den System-Prompt und in enge Titel-/Briefkopf-Flächen. Zeilenumbrüche oder sehr lange Werte können den Prompt-Block umdeuten bzw. Texte aus dem Layout schieben. Eine strenge Farb-Regex löst diese anderen Eingabepfade nicht.
Vorschlag: Schema mit Feldlängen, erlaubten Zeilenumbrüchen und Ausschluss von Steuerzeichen definieren; Prompt-Daten klar als zitierte Daten begrenzen. Für Office-Ausgaben XML-Bereinigung plus Layoutgrenzen anwenden und lange Namen/Kontaktzeilen in der Vorschau prüfen.

### Antworten auf die fünf Fragen

1. **Profil + Werkzeuge:** Die Trennung ist sinnvoll, braucht aber eine einzige Aktivierungswahrheit und eine eindeutige Priorität gegenüber bestehenden Skills (F03, F11). Der sichtbare Skill allein garantiert wegen Progressive Disclosure keine Anwendung.
2. **Vorlagenersetzung:** Ein enger Main-seitiger Alias für den unveränderten Starter-Pfad ist sinnvoller als nur ein Prompt. Inspektion und Schreiben müssen denselben Alias nutzen und den effektiven Pfad offenlegen; eigene Vorlagen bleiben tabu (F02).
3. **`lumMod`/`lumOff`:** Die konkrete Highlight-Füllung wird durch 13 % Modulation plus 87 % Offset fast weiß; das Hauptproblem ist eher fehlende Unterscheidbarkeit. Lesbarkeitsrisiken entstehen besonders durch dieselbe feste Farbe in Text- und Flächenrollen sowie die dunklen Layouts (F04, F05).
4. **Logo-Weg:** Externe SVG-Referenzen sind ungeprüft, und Byte-/Ausgabegröße allein stoppen keine teuren Decodes. Vor `sharp` Typ, Referenzen, Dimensionen und Ressourcenverbrauch begrenzen; der Dialogpfad liegt außerhalb der Vault-Schreibgrenze (F09, F10).
5. **HTML-Dunkelmodus:** Eigene Akzent- und Flächentoken mit Kontrastprüfung gegen beide Hintergründe ableiten; die helle Flächentönung aus dem Weißmodus nicht als Dunkelmodus-Fläche verwenden. Quell-CSS-Priorität beim Überarbeiten festlegen (F08, F12).

## Claude-Antwort

Nutzerfreigabe 08.11.2026: alle 14 umsetzen. Umsetzung + GUI-Gegenprobe mit dem Testlogo (Rot/Grau-SVG) am selben Tag.

- **F01 [ADRESSIERT]** `shared/brandDeck.ts`: Wortmarke der Titelfolie wird zum Namen (oder entfällt bei „Name steht im Logo“), Fußzeile „MindGraph Notes · …“ → „<Name> · …“ (lang gekürzt), Theme-/Farbschema-Name, `dc:title`/`dc:creator` (nur bestehende Elemente). Test: kein „MindGraph“ in irgendeinem XML-Part. GUI: gerenderte Agent-Präsentation zeigt nur noch den Einrichtungsnamen.
- **F02 [ADRESSIERT]** `resolvePptxTemplateAlias` in `main/noteAgent/skills.ts` — EIN Alias für `inspect_pptx_template` und `write_pptx`, nur für genau `STARTER_DECK_VAULT_REL`; effektiver Pfad in Antwort, Anzeige („(Hausdesign)“) und Quellen. Fehlendes `template` bleibt ein Fehler (Ausnahme gestrichen).
- **F03 [ADRESSIERT]** Eine Wahrheit: `enabled` im Profil (Schalter in Einstellungen). Rangfolge identisch im Prompt-Block (`brandPromptBlock`) und im Skill-Text; aktive Briefkopf-Skills werden im Prompt namentlich vorgezogen. Der Hausdesign-Skill erklärt nur.
- **F04 [ADRESSIERT]** Umfärben nach Rolle (`recolorPartXml`: Kontext rPr/defRPr/buClr = Schrift, spPr/bgPr/ln = Fläche). Tokens mit Kontrastzielen je Paarung (`deriveBrandTokens`), getestet mit Rot, Gelb, Hellcyan, Dunkelblau, Grau.
- **F05 [ADRESSIERT]** `accent1` = Flächenakzent (geprüft ≥ 3:1 gegen Weiß), damit Rahmen der transparenten Hervorhebung sichtbar bleibt; Highlight-Füllung bleibt Theme-Transformation. GUI: hervorgehobene Karte erkennbar.
- **F06 [ADRESSIERT]** `placeLogoAndWordmark`: Logo „contain“ in einer Zone bis zum Titel, Wortmarke rückt dahinter oder entfällt. Test: Seitenverhältnis 3:1 bleibt. GUI-Nachbesserung: Logo mit Namen 1,15" hoch (vorher 0,85", kaum lesbar).
- **F07 [ADRESSIERT]** Inhaltsadressiertes `logo-<sha12>.png` unter `mindgraph-assets/brand/`, Bytes aus dem Lauf (`run.brand.logo`), nur wenn die Seite es referenziert, Ziel per `assertSafePath` + `.mindgraph`-Sperre, `wx`-Zwischendatei + Rename (`ensureHtmlBrandLogo`). GUI: Logo lag nach dem Übernehmen neben der Seite und erschien im Kopf.
- **F08 [ADRESSIERT]** Hausdesign-Stilblock `<style id="mg-hausdesign">` steht NACH dem Artikel (gewinnt gegen wiederhergestellten Quellstil); `extractAuthoredBodyHtml` entfernt ihn beim Überarbeiten.
- **F09 [ADRESSIERT]** `shared/brandLogoCheck.ts`: Typ per Signatur, PNG-IHDR/JPEG-SOF-Maße vor dem Dekodieren (≤ 12 000 px Seite, ≤ 40 MP), SVG ohne DOCTYPE/Entitäten/Skript/foreignObject/Ereignis-Attribute/externe href/url(). Lesen am geöffneten Handle (O_NOFOLLOW, fstat ≤ 5 MB). Statt `sharp` (nur transitive Abhängigkeit, natives Binary) rastert ein verstecktes Sandbox-Fenster in eigener Sitzung mit Netzsperre (`main/brand/logoRaster.ts`); heraus geht nur neu kodiertes PNG.
- **F10 [ADRESSIERT]** Binärdateien über `writeBinaryFileSafe` (Zwischendatei + Rename, Sicherung), jeder Pfad über `resolveInVaultSafe`; `hausdesign.json` als LETZTE Datei — ohne sie kein Hausdesign.
- **F11 [ADRESSIERT]** Erkennung nur über `hausdesign.json` mit `managedBy`; fremder Ordner `hausdesign` → `hausdesign-2` …; Entfernen löscht nur Dateien aus `files` (Profil zuerst), Ordner nur wenn leer.
- **F12 [ADRESSIERT]** Getrennte Tokens für Dunkelmodus (`darkText`, `darkTint`, `darkLine2`) mit Kontrast gegen `#16181c` und gegen die dunkle Tönung.
- **F13 [ADRESSIERT]** Nur Farbcodes an den Bilddienst, kein Name/Kontakt; Längenprüfung NACH dem Anhängen; Offline-Aussage in UI und Plan auf den Builder begrenzt.
- **F14 [ADRESSIERT]** `cleanBrandText` (Steuerzeichen, bidi, Zeilenumbrüche, Längen je Feld), Name im Prompt als JSON-String-Literal, XML via `cleanText` + Escaping.

Zusätzlich aus der GUI-Gegenprobe: Farbvorschlag aus gerenderten Pixeln (das Test-SVG nennt im Quelltext Blau, gerendert ist es Rot/Grau); häufigstes dunkles Neutral = dunkle Farbe; zweite Diagrammlinie ohne Sekundärfarbe = dunkle Hausfarbe (vorher Orange-Braun neben Rot); helle Tönung bei Sättigung > 0,75 nur 8 %.

Nicht geprüft: Infografik in der GUI (Bilddienst nicht ausgelöst), HTML-Dunkelmodus nur per Kontrasttest, PPTX in echtem PowerPoint (nur LibreOffice), Briefkopf-Erzeugung nur im Rundlauf-Test (im Test-Vault existiert schon ein Briefkopf-Skill).

## Status

Runde 1 umgesetzt (08.11.2026). Abnahme durch den Nutzer offen.
