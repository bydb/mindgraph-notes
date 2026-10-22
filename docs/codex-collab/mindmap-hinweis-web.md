# Mindmap-Hinweis bei Webrecherche

## Aufgabe

Uncommittete Änderung prüfen (Stand: HEAD be09801e plus Arbeitsbaum).

Anlass (21.10.2026, real): Ein Nutzer mit Version 1.0 hat den Skill „Mindmap" installiert und einen Auftrag „Mindmap …" mit eingeschaltetem Globus (Webrecherche) gestartet. Im Web-Lauf entfernt `loop.ts` das Werkzeug `write_excalidraw` (kein Platz für den Quellenblock). Heraus kam eine Markdown-Notiz; den Grund nannte nur das Modell, vage („Werkzeug stand nicht zur Verfügung").

Änderung, zwei Teile:
1. **Nach dem Lauf**: deterministischer Hinweis in der Abschlussnachricht bzw. Fehlermeldung, analog zum bestehenden PowerPoint-Hinweis. Ausgelöst durch geladenen Skill mit `write_excalidraw` im Text ODER durch „Mindmap" im Auftragstext. Grund je nach Lage: Web an / Werkzeug nicht erlaubt / Modell hat es nicht erfolgreich aufgerufen.
2. **Vor dem Start**: Hinweis unter dem Web-Schalter (Agent-Karte und Macher-Leiste), wenn Web an ist und der Auftrag „Mindmap" enthält. Nur Hinweis, keine Startsperre.

Bitte adversarial prüfen: Korrektheit, falsche oder fehlende Hinweise (Fortsetzungsläufe, Web-Lauf ohne Write, Kombination mit dem PowerPoint-Hinweis, Abbrüche), Fehlalarme der Worterkennung, Wortlaut (DE/EN, Ton passend zu den übrigen Karten-Texten mit „du"), Testabdeckung.

## Kontext/Anker

- `app/src/shared/mindmapIntent.ts:10` — `asksForMindmap` (Regex `/mind[\s-]?map/i`), Tests `app/src/shared/mindmapIntent.test.ts`
- `app/src/main/noteAgent/loop.ts:257` — Web-Lauf entfernt `write_excalidraw`
- `app/src/main/noteAgent/loop.ts:267-294` — `pptxHint`, neu `mindmapHint`, `formatHint` verbindet beide
- `app/src/main/noteAgent/loop.ts:295-304` — `withFormatHint` / `failWithHint`; Aufrufer `:365`, `:398`, `:415`, `:429`, `:506`, `:511`
- `app/src/main/noteAgent/loop.ts:307-311` — Fortsetzungslauf (`continuation`)
- `app/src/main/noteAgent/runRegistry.ts:98` — `expectedMindmapSkill`
- `app/src/main/noteAgent/skills.ts:705-706` — `use_skill` setzt `expectedPptxSkill`/`expectedMindmapSkill`
- `app/src/main/noteAgent/loopWeb.test.ts:170-205` — neue Tests
- `app/src/renderer/components/Agent/AgentView.tsx:457`, `:789` — Vorab-Hinweis Agent-Karte
- `app/src/renderer/components/Editor/AiActionBar.tsx:419` — Vorab-Hinweis Macher-Leiste
- `app/src/renderer/utils/i18n/agentCard.ts:121`, `:245` — Text `agentCard.mindmapNoWeb`
- Vorbild: PowerPoint-Hinweis (CLAUDE.md „Kein stiller Formatwechsel"), Skill `app/resources/starter-skills/mindmap/SKILL.md`

## Codex-Findings

### F01 — Fortsetzung meldet den verworfenen Mindmap-Wunsch erneut
Schwere: mittel
datei:zeile: `app/src/main/index.ts:4840-4843`, `app/src/main/noteAgent/loop.ts:280-292`, `app/src/main/noteAgent/loop.ts:307-313`
Status: [OFFEN]
Bei „Antworten und weitermachen“ setzt Main `run.instruction` aus ursprünglichem Auftrag und Nachtrag zusammen. Der neue Hinweis prüft diesen Gesamttext, auch wenn der Nachtrag die Mindmap ausdrücklich abwählt („Stattdessen nur eine Notiz“). Weil der Loop im Folgelauf nur den Nachtrag als neue Nutzerantwort sendet, kann er korrekt eine Markdown-Notiz erzeugen und trotzdem am Ende melden, die verlangte Mindmap fehle. Die neuen Tests in `app/src/main/noteAgent/loopWeb.test.ts:168-200` decken keinen Folgelauf ab.
Vorschlag: Den aktuellen Formatwunsch im Folgelauf getrennt erfassen beziehungsweise eine ausdrückliche Abwahl berücksichtigen; einen Test mit ursprünglichem Mindmap-Auftrag und abweichendem Nachtrag ergänzen.

### F02 — Wortsuche deutet auch verneinte oder längere Wörter als Formatwunsch
Schwere: mittel
datei:zeile: `app/src/shared/mindmapIntent.ts:10-12`, `app/src/renderer/components/Agent/AgentView.tsx:457`, `app/src/main/noteAgent/loop.ts:281-286`
Status: [OFFEN]
`/mind[\s-]?map/i` findet auch „Bitte **keine** Mindmap, nur eine Notiz“ und das Präfix in „Mindmappe“. Dadurch warnt die Karte vor Web und die Abschlussnachricht behauptet nach einer korrekt erzeugten Notiz, der Auftrag verlange eine Mindmap. Die Tests in `app/src/shared/mindmapIntent.test.ts:5-15` prüfen nur positive Beispiele und fachfremde Wörter, keine Verneinung oder Wortgrenzen.
Vorschlag: Wortgrenzen und naheliegende Negationen oder Alternativen für den Hinweis berücksichtigen und diese Fälle testen.

### F03 — Geladener Skill wird ohne Prüfung seines Formatwunsches zur Mindmap-Pflicht
Schwere: mittel
datei:zeile: `app/src/main/noteAgent/skills.ts:689-706`, `app/src/main/noteAgent/loop.ts:280-286`
Status: [OFFEN]
`use_skill` setzt `expectedMindmapSkill`, sobald der Anleitungstext irgendwo `write_excalidraw` erwähnt. Ein Skill kann das Werkzeug etwa als nicht zu nutzende Alternative oder in einem Beispiel erwähnen; auch ein zur Orientierung geladener Skill muss nicht das gewünschte Endformat bestimmen. Danach hat der Skill-Name Vorrang vor dem Auftragstext, und der Hinweis behauptet ungeprüft, dieser Skill **verlange** eine Mindmap. Bei mehreren geladenen Skills überschreibt der letzte Treffer zudem den Namen. Der konkrete Starter-Skill verlangt das Werkzeug tatsächlich (`app/resources/starter-skills/mindmap/SKILL.md:15-16`), die allgemeine Erkennung gilt aber für alle installierten Skills.
Vorschlag: Formatpflicht enger aus Skill-Metadaten oder einem expliziten Signal ableiten; bei bloßer Texterwähnung nicht „verlangt“ behaupten.

### F04 — Modell- und Abbruchfehler umgehen den versprochenen Fehlermeldungs-Hinweis
Schwere: mittel
datei:zeile: `app/src/main/noteAgent/loop.ts:295-303`, `app/src/main/noteAgent/loop.ts:368-377`, `app/src/main/index.ts:5007-5044`
Status: [OFFEN]
Nur die ausdrücklich mit `failWithHint` geworfenen Fehler enthalten den Mindmap-Grund. `chatWithTools` kann selbst werfen; auch Abbruch und erkannte Kontextkürzung werfen direkt. Main übernimmt diese Fehlermeldung ohne erneuten Formathinweis. Nach einem Mindmap-Weblauf, der etwa wegen Modell-Timeout scheitert, sieht der Nutzer daher nur die allgemeine Zeitüberschreitung und erfährt nicht, dass `write_excalidraw` in diesem Lauf ohnehin fehlte. `app/src/main/noteAgent/loopWeb.test.ts:202-209` testet nur den vorgegebenen Web-Leerlauf für PowerPoint, keinen solchen Fehlerpfad für Mindmaps.
Vorschlag: Den Formathinweis an einer gemeinsamen Abschluss-/Fehlergrenze anfügen; bewusstes Nutzer-Abbrechen gegebenenfalls davon ausnehmen. Einen Test mit geworfenem Modellfehler ergänzen.

## Claude-Antwort

Freigabe durch den Nutzer am 22.10.2026: F01 und F02 umsetzen, F03 und F04 offen lassen.

- **F01 [ADRESSIERT]** — Nachgemessen: `main/index.ts:4841` setzt `instruction` aus altem Auftrag + Nachtrag zusammen, der Fortsetzungslauf hat eigene, leere `results`. Hatte der erste Lauf die Mindmap schon erzeugt, meldete die Fortsetzung sie als fehlend. `mindmapHint` prüft bei `params.continuation` jetzt nur `continuation.answer` (`loop.ts:281-286`). Test „prüft bei einer Fortsetzung nur den Nachtrag“ in `loopWeb.test.ts`.
- **F02 [ADRESSIERT]** — `asksForMindmap` verlangt Wortgrenzen (`\bmind[\s-]?maps?\b`) und überspringt Treffer mit Verneinung höchstens zwei Wörter davor (kein*/ohne/statt/anstatt/stattdessen/nicht/no/not/without/instead of). Ein späterer, nicht verneinter Treffer zählt weiter. Tests für Verneinung, späteren echten Wunsch und „Mindmappe“.
- **F03 [OFFEN]** — Trägt im Prinzip. Dieselbe Regel gilt seit 01.10.2026 für `expectedPptxSkill`; der mitgelieferte Mindmap-Skill verlangt das Werkzeug tatsächlich. Nutzerentscheidung: zurückgestellt, bei Bedarf für beide Formate gemeinsam lösen.
- **F04 [OFFEN]** — Trägt: Fehler aus `chatWithTools`, Abbruch und Kontextkürzung werfen ohne `failWithHint`. Gilt genauso für PowerPoint. Der Hauptfall (Web an) ist jetzt vor dem Start abgedeckt. Nutzerentscheidung: zurückgestellt, bei Bedarf an einer gemeinsamen Fehlergrenze für beide Formate.

Belege: `npm run typecheck` grün; `npm run test` 2857 grün, 1 rot in `shellExecution.test.ts` (Umgebungsprobe, Zeitgrenze unter Last) — einzeln dreimal grün, unabhängig von dieser Änderung.

## Status

F01, F02 umgesetzt; F03, F04 offen (zurückgestellt). Abnahme durch den Nutzer ausstehend.
