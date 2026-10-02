# Zeitbilanz: Referenzzeit je Skill (A) + Rückfrage nach der Übernahme (B)

## Aufgabe

**Anlass (02.10.2026, real):** Der Notiz-Agent hat an einem Vormittag eine Konzeptnotiz
(Webrecherche), einen Foliensatz für eine Fortbildung (`write_pptx` nach Skill
„Präsentation nach Vorlage") und einen Akkreditierungsantrag samt Anschreiben (zwei `write_docx` in
EINEM Lauf) erzeugt. Der Nutzer schätzt die Ersparnis auf rund 15 Stunden. Die Nutzenbilanz zeigt
**13 min**.

Nachgerechnet aus `userData/activity/*.json`:

| Lauf | Art (deriveActivityType) | Referenz | Ergebnisse |
|---|---|---|---|
| Konzeptnotiz | web-research | 5 | 1 × md |
| Präsentation | document | 10 | 1 × pptx |
| Antrag + Anschreiben | document | 10 | 2 × docx |

25 min Referenz − rund 12 min aktive Zeit ≈ 13 min. Die Rechnung stimmt — die Frage ist falsch
gestellt: „Dokument" deckt ein Dreizeilen-Anschreiben genauso ab wie einen Foliensatz, weil die Art
bewusst nur aus Werkzeugnamen abgeleitet wird (`shared/activityLog.ts:399`). Der Skill, der die Art
der Arbeit eigentlich benennt, wird nicht mitgeschrieben.

**Vom Nutzer freigegeben: A + B.** (C = Nacharbeit-Nachtrag existiert schon als `time-correction`;
nicht Teil dieser Aufgabe.)

### A. Referenzzeit je Skill, als Nutzerangabe

1. **Mitschreiben**: `use_skill` merkt sich bei Erfolg den Skill (`folderName` = stabile Identität,
   `skillsLoader.ts:19`) in `AgentRun.skillsUsed` (Reihenfolge des ersten Ladens, ohne Dubletten).
   `agent-run-finished` bekommt optional `skills?: string[]` (max. 5, je 1–80 Zeichen, druckbar).
2. **Einstellungen**: `impact.skillReferences: Record<folderName, { minutes: number; label: string; source?: 'estimated' | 'measured' }>`
   in `ImpactSettings` (`uiStore.ts:634`). `label` = Anzeigename zum Zeitpunkt der Eingabe, damit
   Karte/Historie ohne IPC beschriften können (Fallback folderName). Wertebereich 1–2400 min (40 h,
   Tippfehler-Schutz wie `MAX_CORRECTION_MS`). Bewusst **nicht** im SKILL.md-Frontmatter: ein
   importierter fremder Skill dürfte sonst die eigene Bilanz bestimmen (Regel 4: Minuten nur gegen
   selbst eingetragene Referenz).
3. **Rechnung** (`estimateSavedMinutes`, `activityLog.ts:858`): neuer optionaler Parameter
   `skillRefs`. Je Lauf (übernommen ODER Fehlversuch) wird der **Bewertungsschlüssel** bestimmt:
   - hat einer der `skills` eine Skill-Referenz > 0 → Schlüssel `skill:<folderName>` des Skills mit
     der **höchsten** Referenz (nicht Summe: ein Lauf, der zwei Skills lädt, ist ein Auftrag);
   - sonst wie heute die Tätigkeitsart.
   Skill-Läufe bekommen **eigene Zeilen** (`SavedTimeLine.skill?: { id; label }`, `activityType`
   bleibt die abgeleitete Art). Grund: die Kartenrechnung „runs × Referenz − aktiv = brutto"
   (`impactText.ts:101`) muss aufgehen — eine Dokument-Zeile mit Referenz 10, die 240 min gutschreibt,
   bräche sie. Ein Skill ohne Referenz fällt auf die Art zurück (heutiges Verhalten); alte Läufe ohne
   `skills` sind unverändert.
   Fehlversuche ziehen auf DERSELBEN Zeile ab, auf der ein Erfolg gutgeschrieben würde (Regel 6).
   `byModel`-Zeilen bekommen denselben Schlüssel.
4. **Protokoll**: neue Ereignisart `skill-reference-changed { skill, fromMinutes, toMinutes }`,
   geschrieben vom Main in `recordReferenceChanges` (`index.ts:1785`) beim Speichern der
   UI-Einstellungen — analog `reference-changed`. KNOWN_KINDS + Test „kennt jede Art".
   Historie zeigt die Änderung als Marker wie heute (`HistorySection.tsx:188`).
5. **Einstellungen-UI** (`GeneralSettingsTab.tsx:233` ImpactCard): Unterabschnitt „Skills" mit allen
   Skills des aktuellen Vaults (`noteSkillsList`) plus gespeicherten Skill-Referenzen, die im Vault
   fehlen („nicht in diesem Vault" — nicht still löschen). Je Zeile Minuten (Übernahme bei
   blur/Enter, `NumberInput`) + Quelle geschätzt/gestoppt + Entfernen.
6. **Anzeige**: `impactText.ts` bekommt `lineLabel(line, t)` (Skill-Label, sonst Art); alle
   `t(ACTIVITY_TYPE_LABEL_KEY[line.activityType])` auf Zeilen gehen darüber. `basisLabel` liest bei
   Skill-Zeilen `skillReferences[id].source`. Export (`measurementHistoryExport.ts:67,71`) nennt
   Skill-Zeilen und -Änderungen mit Label. Aufrufer: `ImpactIndicator.tsx:80`,
   `voice/actions.ts:441`, `measurementHistory.ts:307` (`bucketSavedTime`) reichen `skillRefs` durch.

### B. Rückfrage auf der Ergebniskarte

1. `note-agent-done` (`index.ts:4895`) liefert zusätzlich `skills: Array<{ id, label }>` des Laufs;
   der Renderer legt sie in `AgentRunUiState.skills` ab (`noteAgentStore.ts:506`).
2. `AgentRunPanel.tsx` zeigt in der Review-Phase, **sobald mindestens ein Ergebnis übernommen ist**,
   eine Zeile: „Wie lange hätten Sie für einen solchen Auftrag von Hand gebraucht? [ ] min —
   gilt künftig für Skill „X"". Nur wenn der Lauf Skills hatte, KEINER davon eine Referenz hat und
   der Skill nicht auf „nicht mehr fragen" steht. Bei mehreren Skills: Auswahl (Default: zuerst
   geladener).
   Knöpfe: „Speichern" → `setSkillReference(id, minutes, label)`; „Nicht mehr fragen" →
   `impact.skillReferenceDismissed: string[]`. Nach dem Speichern Bestätigung mit Hinweis auf
   Einstellungen → Allgemein → Zeitbilanz.
3. Warum erst nach der Übernahme: ein verworfener Lauf hat nichts gespart; die Frage dort wirkte wie
   Werbung. Warum keine Pro-Lauf-Referenz: dann würde jede einzelne Zahl ohne Vergleich
   geschätzt — die Skill-Referenz gilt für alle Läufe des Skills und ist damit prüfbar (Stichprobe
   `sampleLine`).
4. Rückwirkung: Die Bilanz rechnet immer mit der heutigen Referenz (wie bei Arten, `activityLog.ts:152`)
   — der heutige Lauf ist nach dem Speichern sofort neu bewertet. Ältere Läufe ohne `skills` nicht.

### Ehrlichkeitsregeln, die unverändert gelten müssen
Aktive Zeit abziehen, nie Laufzeit · nicht gemessen ist nicht null · keine Kappung · Minuten nur gegen
eigene Referenz · Fehlversuche zählen. Ledger enthält keine Inhalte: **Frage an den Prüfer** — ist
der Skill-Ordnername (z.B. `praesentation-nach-vorlage`) im Protokoll vertretbar? Er ist eine vom
Nutzer vergebene Arbeitsart-Bezeichnung, kein Dokumenttitel; ein Hash würde die Historie aber
unlesbar machen, sobald der Skill gelöscht ist.

## Kontext/Anker

- Schema/Allowlist/Validierung: `app/src/shared/activityLog.ts:86` (ActivityEvent), `:239` (KNOWN_KINDS), `:258` (isActivityEvent)
- Zusammenfassung: `app/src/shared/activityLog.ts:536` (summarizeActivity), `:640` (Fehlversuche), `:672` (acceptedRuns)
- Rechnung: `app/src/shared/activityLog.ts:858` (estimateSavedMinutes), Zeilenbau `:1002`
- Lauf-Ende: `app/src/main/index.ts:4876` und `:4915` (recordActivity agent-run-finished)
- Werkzeug: `app/src/main/noteAgent/skills.ts:526` (use_skill), Registry `app/src/main/noteAgent/runRegistry.ts:86`
- Referenz-Ereignis: `app/src/main/index.ts:1785` (recordReferenceChanges)
- Karte/Texte: `app/src/renderer/utils/impactText.ts:101` (grossMinutes), `:111` (savedBasisFormula)
- Historie: `app/src/shared/measurementHistory.ts:307`, `app/src/renderer/components/LlmPerformance/HistorySection.tsx:126,188`
- Einstellungen: `app/src/renderer/stores/uiStore.ts:634,1502`, `app/src/renderer/components/Settings/GeneralSettingsTab.tsx:233`
- Ergebniskarte: `app/src/renderer/components/Agent/AgentRunPanel.tsx:199`, Store `app/src/renderer/stores/noteAgentStore.ts:506`

## Codex-Findings

### F01 — Skill-Referenz hebt das Bewertungsverbot für Shell-Läufe auf
Schwere: hoch
Code-Stelle: `CLAUDE.md:425`, `app/src/shared/activityLog.ts:54-62`, `app/src/shared/activityLog.ts:1004-1007`, `app/src/shared/activityLog.ts:399-405`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:38-47`
Status: [OFFEN]
Der Plan wählt eine vorhandene Skill-Referenz vor der Tätigkeitsart. Damit würde ein Lauf mit `shell_execute` und `use_skill` plötzlich Minuten erhalten, obwohl `shell` ausdrücklich „gezählt, nie bewertet“ ist. Der Skill-Name beweist auch nicht, welche der heterogenen Shell-Arbeiten ausgeführt wurde. Das widerspricht der dokumentierten Ehrlichkeitsgrenze, selbst wenn der Nutzer die Skill-Minuten eingetragen hat.
Vorschlag: Explizit entscheiden, ob das Shell-Verbot auch für Skill-Läufe gilt; bei unveränderter Regel `shell` vor der Skill-Wahl ausnehmen und einen Regressionstest mit `use_skill` + `shell_execute` vorsehen. Eine Lockerung müsste CLAUDE.md samt Begründung ändern und vom Nutzer freigegeben werden.

### F02 — Globale Einstellung vermischt gleichnamige Skills verschiedener Vaults
Schwere: hoch
Code-Stelle: `app/src/renderer/stores/uiStore.ts:634-648`, `app/src/renderer/stores/uiStore.ts:1252`, `app/src/main/index.ts:1172-1194`, `app/src/main/noteAgent/skillsLoader.ts:53-87`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:32-34,54-56`
Status: [OFFEN]
`impact` liegt in der globalen `userData/ui-settings.json`, während `folderName` nur innerhalb eines Vaults einen Skill identifiziert. Zwei Vaults mit `Skills/Bericht` und verschiedenen Arbeiten teilen sich dadurch dieselbe Referenz und dasselbe Label. Die UI würde den Eintrag im zweiten Vault sogar als dortigen Skill anzeigen; die Historie dieses Vaults bewertet alte Läufe rückwirkend mit einer fremden Zahl. „Nicht in diesem Vault“ fängt nur fehlende, nicht gleichnamige Ordner ab.
Vorschlag: Referenzen und Rückfrage-Abwahl nach stabiler Vault-Identität **und** Skill-Ordner schlüsseln oder in Vault-Einstellungen halten. Bei Vault-Wechsel/Export nur die zum aktuellen Vault gehörenden Werte und Marker verwenden; gleichnamige Skills in zwei Vaults gezielt testen.

### F03 — Die Skill-Liste verliert nach fünf geladenen Skills eine mögliche Referenz
Schwere: mittel
Code-Stelle: `app/src/main/noteAgent/skillsLoader.ts:12,53-82`, `app/src/main/noteAgent/skills.ts:538-555`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:29-31,38-48`
Status: [OFFEN]
Der Loader lässt bis zu 50 Skills zu, der neue Ledger-Eintrag aber höchstens fünf. Ein Lauf kann mehr als fünf verschiedene Skills erfolgreich laden; liegt die einzige bepreiste Referenz an Position sechs, fällt der Lauf auf die allgemeine Art zurück, obwohl er den Skill tatsächlich verwendet hat. Bei späterer Änderung der Referenzen kann ein heute unwichtiger, abgeschnittener Skill ebenfalls nicht rückwirkend berücksichtigt werden. Der Plan legt weder Begrenzung des Werkzeugs noch Kennzeichnung der unvollständigen Provenienz fest.
Vorschlag: Alle tatsächlich geladenen Skill-IDs mit einer begründeten Ledger-Grenze speichern, oder bei Überlauf den Lauf als unvollständig klassifiziert und unbewertet lassen. Die Obergrenze muss zur möglichen Nutzung passen; Fall „sechster Skill hat einzige Referenz“ testen.

### F04 — Auswahl der höchsten Referenz bewertet mehrdeutige Aufträge nach dem teuersten Skill
Schwere: hoch
Code-Stelle: `app/src/main/noteAgent/skills.ts:526-555`, `app/src/shared/activityLog.ts:893-925`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:38-49,68-72`
Status: [OFFEN]
`use_skill` belegt nur, dass eine Anleitung gelesen wurde, nicht dass genau deren manueller Vergleichsauftrag erledigt wurde. Bei zwei geladenen Skills weist die Regel „höchste Referenz“ dem ganzen Lauf automatisch die größte Ersparnis zu; nachträgliches Eintragen eines teureren zweiten Skills verschiebt sogar ältere Läufe dorthin. Die Rückfrage lässt den Nutzer dagegen den ersten oder einen ausgewählten Skill bewerten. Bei einem Lauf mit Präsentation und Anschreiben sind diese beiden Entscheidungen nicht notwendig dieselbe Arbeit. „Nicht summieren“ verhindert Doppelzählung, aber nicht die einseitig hohe Auswahl.
Vorschlag: Für Mehrfach-Skill-Läufe einen ausdrücklich vom Nutzer bestätigten Bewertungs-Skill je Lauf erfassen oder solche Läufe bis zur Zuordnung als unbewertet zählen. Mindestens die automatische Maximalwahl und ihre Rückwirkung offen anzeigen und mit zwei verschieden bepreisten Skills testen.

### F05 — Skill-Ordnernamen sind nicht zuverlässig inhaltsfrei
Schwere: hoch
Code-Stelle: `app/src/shared/activityLog.ts:8-10`, `app/src/main/noteAgent/skillsLoader.ts:16-19,71-75,233-246`, `app/src/shared/activityLog.ts:65-69`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:29-34,50-53,83-86`
Status: [OFFEN]
Die Annahme „Arbeitsart-Bezeichnung, kein Dokumenttitel“ gilt technisch nicht: `createSkill` verwendet den frei gewählten Anzeigenamen als Ordnernamen; importierte Ordnernamen sind ebenfalls frei. Ein Skill kann etwa einen Klienten, ein Verfahren oder einen vertraulichen Projektnamen tragen. Bisher verspricht das Ledger ausdrücklich nur Art, Zeitpunkt, Dauer und Status und hasht sogar Vorgangskennungen statt Titeln. Der Plan würde den Namen bis zur Ledger-Retention in Laufereignissen **und** Änderungsereignissen speichern; Entfernen des Skills oder der Einstellung löscht diese Spuren nicht.
Vorschlag: Datenschutzentscheidung ausdrücklich beim Nutzer einholen. Für die inhaltsarme Ledger-Variante pro Vault eine opake Skill-ID speichern und Anzeigenamen nur in einer getrennten, löschbaren lokalen Zuordnung halten; bei fehlender Zuordnung neutral „früherer Skill“ anzeigen. Auch Export und Aufbewahrungsdauer benennen.

### F06 — Validierung und Schreibgrenze für neue Ledger-Felder sind nicht spezifiziert
Schwere: hoch
Code-Stelle: `app/src/shared/activityLog.ts:244-319`, `app/src/main/index.ts:5292-5303`, `app/src/main/index.ts:1771-1799`, `CLAUDE.md:260`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:29-35,50-53`
Status: [OFFEN]
`KNOWN_KINDS` allein schützt den Ledger nicht. `isActivityEvent` prüft beim bestehenden `agent-run-finished` nur wenige Pflichtfelder und würde ein optionales `skills` ungeprüft durchlassen; für `skill-reference-changed` braucht es einen eigenen Zweig mit endlichen Minuten, Grenzen und zulässiger ID. Die Settings-IPC nimmt ein ganzes Renderer-Objekt entgegen und schreibt es vor dem Vergleich. Ohne Main-seitige Normalisierung könnte ein manipuliertes `skillReferences` (z. B. `NaN`, negativer Wert, extrem langer Schlüssel/Label oder `__proto__`) die Rechnung, Anzeige oder Marker beeinflussen. `activity-append` ist derzeit korrekt auf Sprachbefehle begrenzt und darf für die neuen Ereignisse nicht geöffnet werden.
Vorschlag: Typ, Allowlist, Beispiel im Vollständigkeitstest und strikte Feldprüfung gemeinsam festlegen; Settings vor Speicherung und Berechnung als erlaubte eigene Skill-IDs mit endlichen 1–2400 Minuten und begrenztem Label normalisieren. Nur Main schreibt Lauf- und Änderungsereignisse; der Renderer meldet ausschließlich Einstellungen über die bestehende vertrauenswürdige IPC.

### F07 — Änderungen an Skill-Referenzen können ohne Einordnung der Rückwirkung täuschen
Schwere: mittel
Code-Stelle: `app/src/shared/activityLog.ts:151-156`, `app/src/shared/measurementHistory.ts:313-329`, `app/src/renderer/components/LlmPerformance/HistorySection.tsx:186-200`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:40-49,50-53,80-81`
Status: [OFFEN]
Die Historie rechnet jeden Abschnitt mit der heutigen Referenz. Bei Skills ändert ein neuer Eintrag aber nicht nur die Höhe, sondern möglicherweise die **Zuordnung**: frühere Läufe wechseln von `document` zu `skill:X` oder bei zwei Skills von X zu Y. Der geplante Änderungsmarker nennt nur X und Minuten. So kann die Kurve rückwirkend springen, obwohl im markierten Abschnitt selbst keine neue Arbeit geleistet wurde; ein anderer Skill oder eine alte Tätigkeitsart verschwindet aus der Stichprobe. Löschen einer Referenz bewirkt den umgekehrten Wechsel.
Vorschlag: Die heutige Bewertungsregel und die rückwirkende Neuverteilung im UI/Export ausdrücklich nennen. Tests für Hinzufügen, Ändern und Entfernen bei einem und mehreren Skills sowie Wechsel des Bewertungsschlüssels über mehrere Zeitabschnitte vorsehen.

### F08 — Abschnitte und Gesamtwert können durch getrennte Rundung auseinanderlaufen
Schwere: mittel
Code-Stelle: `app/src/shared/activityLog.ts:1025,1042-1044`, `app/src/shared/measurementHistory.ts:315-324`, `app/src/renderer/utils/impactText.ts:101-103,164-171`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:43-49,58-62`
Status: [OFFEN]
Jeder Skill- oder Art-Bucket rundet `saved` auf ganze Minuten, danach summiert `totalMinutes` die gerundeten Zeilen. Die Historie berechnet jeden Zeitabschnitt separat. Schon drei Abschnitte mit je 0,4 min Ersparnis ergeben 0 + 0 + 0, der Gesamtzeitraum aber gerundet 1 min. Mehr Skill-Zeilen und die Neuverteilung aus F07 erhöhen die Häufigkeit. Eine reine Prüfung „Kartenzeile geht auf“ reicht nicht für die geforderte Summe der Abschnitte.
Vorschlag: Rohwerte bis zur abschließenden Aggregation erhalten und die Rundungsabweichung in der Anzeige behandeln oder die Abschnitte mit einer deterministischen Restverteilung so runden, dass sie zum Gesamtwert summieren. Tages-/Wochenabschnitte gegen Gesamtzeitraum mit Sekundenwerten testen.

### F09 — Weitere Anzeige- und Exportstellen bleiben auf Tätigkeitsarten festgelegt
Schwere: mittel
Code-Stelle: `app/src/renderer/voice/actions.ts:437-440,481-500`, `app/src/renderer/components/LlmPerformance/HistorySection.tsx:64-65,155,233,238-241,365,449-454,478`, `app/src/shared/measurementHistoryExport.ts:50-71,100-111`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:58-62`
Status: [OFFEN]
`lineLabel` allein deckt die Aufrufer nicht ab. Die Sprachkarte bildet `sampleByType` aus der groben Art und würde bei einer Skill-Zeile weiterhin die Anzahl **aller** Dokument-Läufe als Stichprobe ausgeben. Die Historie baut Referenznotiz, fehlende Referenzen, Modellvergleich und Nachtragsliste selbst aus `activityType`; der CSV-Export enthält bislang nur Gesamt-Referenzen und Abschnittssummen, keine Skill-Zeilen oder Änderungsmarker. Der Plan nennt den Markdown-Export an zwei Stellen, aber nicht diese CSV- und Referenzgrundlagen. Damit können Label und Begründung der Zahl je Oberfläche auseinanderfallen.
Vorschlag: Alle Darstellungen über einen gemeinsamen Bewertungsschlüssel bzw. eine einheitliche Zeilenbeschreibung ableiten; Stichprobe aus `line.runs` oder exakt zugehörigen Läufen bilden. Markdown **und** CSV samt Quellenangabe, Skill-Änderungen und Mehrfach-Skill-Fall prüfen.

### F10 — Rückfrage-Zustand und Speichern kollidieren mit der laufenden Review-Phase
Schwere: mittel
Code-Stelle: `app/src/renderer/stores/noteAgentStore.ts:414-460,506-520`, `app/src/renderer/components/Agent/AgentRunPanel.tsx:69-96,199-270`, `app/src/renderer/stores/uiStore.ts:1927-1959`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:68-75`
Status: [OFFEN]
Nach der **ersten** Übernahme können weitere Ergebnis-Karten noch offen sein; deren Prüfzeit läuft weiter. Die neue Frage erscheint dann mitten in dieser Entscheidung und kann nach `setSkillReference` durch das globale 300-ms-Autosave verschwinden, bevor Speichern bestätigt ist. Der Plan sieht weder einen dauerhaften Bestätigungszustand noch eine Zuordnung zu `runId` bei Wechsel/Dismiss der Karte vor. „Nicht mehr fragen“ als globale Skill-Abwahl blendet die Frage zudem für alle gleichnamigen Vault-Skills aus (F02).
Vorschlag: Rückfrage erst nach Abschluss aller Karten oder als klar getrennte, ruhige Nachbereitung zeigen; Eingabe/Bestätigung an `runId` binden und erst nach erfolgreichem Persistieren als gespeichert melden. Keine automatische Wiederholung derselben Frage nach Remount oder Vault-Wechsel; Abwahl passend zur Vault-Identität speichern.

### F11 — Änderungsereignis kann trotz fehlgeschlagener Speicherung entstehen
Schwere: mittel
Code-Stelle: `app/src/main/index.ts:1182-1197,1771-1778,1788-1800`; Plan: `docs/codex-collab/zeitbilanz-skill-referenz.md:50-53,73-75`
Status: [OFFEN]
Der geplante „analoge“ Weg übernimmt einen bestehenden Fehlerpfad: `saveUISettings` fängt Schreibfehler ab und liefert trotzdem normal zurück. Der IPC-Handler ruft danach `recordReferenceChanges` auf und meldet `true`. Für eine neue Skill-Referenz könnte somit ein Ledger-Marker „X → 240 min“ entstehen und die Karte „gespeichert“ anzeigen, obwohl `ui-settings.json` die Referenz nicht enthält; nach Neustart gelten wieder alte Minuten. Beim späteren regulären Speichern können weitere widersprüchliche Marker folgen.
Vorschlag: Einstellungen nur nach nachweislich erfolgreichem, atomarem Schreiben als gespeichert bestätigen und danach den tatsächlich gespeicherten Wert mit dem Vorwert vergleichen. Schreibfehler an den Renderer zurückgeben; den Fehlerpfad für Skill-Referenz und Änderungsmarker prüfen.

### F12 — Rückfrage verspricht eine Gutschrift für unbewertbare Shell- und abgeschnittene Läufe
Schwere: hoch
Code-Stelle: `app/src/renderer/utils/skillReferencePrompt.ts:10-33`, `app/src/renderer/components/Agent/SkillReferencePrompt.tsx:34-50`, `app/src/main/index.ts:5004-5009`, `app/src/shared/activityLog.ts:905-913`; Bezug: F01/F03
Status: [OFFEN]
Die Rückfrage kennt weder `activityType` noch `skillsTruncated`. Nach Übernahme eines Ergebnisses aus einem Shell-Lauf oder aus einem Lauf mit mehr als 20 geladenen Skills bietet sie deshalb „Speichern“ an und bestätigt die Referenz. `resolveRunSkill` verwirft dieselbe Skill-Referenz für diese Läufe zwingend; der gerade gezeigte Lauf wird nicht neu bewertet. Besonders bei Shell widerspricht das der begründeten Regel „gezählt, nie bewertet“. Die neuen Prompt-Tests enthalten beide Fälle nicht.
Vorschlag: Die Main-seitige Bewertbarkeit (`activityType`, `skillsTruncated`) im `note-agent-done`/Run-UI-Zustand verfügbar machen und die Rückfrage mit derselben Regel wie `resolveRunSkill` sperren. Einen Shell-Lauf und den 21-Skills-Fall von Übernahme bis Bilanz testen.

### F13 — Referenznotiz und CSV zeigen Namen und Minuten anderer Vaults
Schwere: hoch
Code-Stelle: `app/src/renderer/components/LlmPerformance/HistorySection.tsx:63-67,153-156,375,454-466`, `app/src/renderer/stores/uiStore.ts:650-655`, `app/src/shared/measurementHistoryExport.ts:116-117`; Bezug: F02/F05/F09
Status: [OFFEN]
Die Rechnung verwendet nur Kennungen aus den Läufen des offenen Vaults; `referenceNoteText` iteriert dagegen über **alle** global gespeicherten `skillReferences`. In Vault B erscheinen damit in Historie, Markdown- und CSV-Export auch Label, geschätzte Minuten und Quelle vertraulicher Skills aus Vault A. Die Kennung ist zwar vault-gebunden, der sichtbare Name aus der Einstellung wird hier aber ungefiltert wieder ausgegeben. Die eigene Kommentarzeile 462-463 benennt diese Abweichung sogar ausdrücklich.
Vorschlag: Vor jeder Referenznotiz die Skill-IDs auf nachweislich zum aktuellen Vault gehörende Skills bzw. Ledger-Kennungen beschränken. Dieselbe gefilterte Liste für UI, Markdown und CSV verwenden; Gegenprobe mit zwei Vaults und einem sensibel benannten Skill.

### F14 — Entfernte Skills verlieren nach Ledger-Retention ihren einzigen Löschweg
Schwere: mittel
Code-Stelle: `app/src/renderer/components/Settings/GeneralSettingsTab.tsx:333-353,359-380`, `app/src/shared/activityLog.ts:276-283`, `app/src/main/activityLedger.ts:50-59`; Bezug: F02/F05
Status: [OFFEN]
Ein gespeicherter Skill wird als „nicht in diesem Vault“ nur gezeigt, wenn seine Kennung noch in einem `agent-run-finished`-Ereignis dieses Vaults steht. Sobald die 365-Tage-/20.000-Ereignis-Retention den letzten Lauf entfernt, verschwindet die Zeile aus den Einstellungen, die globale Referenz samt Label bleibt aber in `ui-settings.json`. Der Nutzer kann sie dann dort nicht mehr entfernen; F13 zeigt, dass der Name weiterhin in Referenznotiz und Export auftaucht. Dasselbe tritt ein, wenn ein Skill mit bereits eingetragener Referenz vor dem ersten Lauf gelöscht wird.
Vorschlag: Die Vault-Zugehörigkeit einer Referenz unabhängig von der befristeten Laufhistorie speichern und verwaiste Einträge anhand dieser Zuordnung weiterhin anzeigen und löschen lassen.

### F15 — Exporte enthalten keine vollständigen Skill-Zeilen
Schwere: mittel
Code-Stelle: `app/src/shared/measurementHistoryExport.ts:50-74,94-117`, `app/src/shared/measurementHistory.ts:330-337`; Bezug: F09
Status: [OFFEN]
Der Markdown-Export nennt Skill-Namen nur in Modellzeilen (ab drei Läufen) und Änderungsmarkern; die eigentlichen `saved.total.lines` mit Referenz, aktiver Zeit und Netto fehlen dort ebenfalls. Der CSV-Export schreibt nur Abschnittssummen und eine einzige Referenznotiz; weder `saved.total.lines` noch `saved.referenceChanges` werden ausgegeben. Damit lässt sich ein exportierter Zeitgewinn nicht auf die jeweilige Skill-Referenz, den Fehlversuch auf derselben Zeile oder den Zeitpunkt einer rückwirkenden Neubewertung zurückführen. Die Antwort auf F09 behauptet „Referenznotiz (auch CSV)“, behebt aber nur die Liste aktueller Referenzen.
Vorschlag: In Markdown und CSV je Bewertungszeile Schlüssel/Label, Läufe, Referenz, aktive Zeit, Fehlversuche und Netto sowie Skill-Referenzänderungen exportieren; mit gemischten Skill- und Art-Zeilen vergleichen.

### F16 — Die Rückfrage bestätigt den Store-Eintrag vor erfolgreichem Schreiben
Schwere: mittel
Code-Stelle: `app/src/renderer/components/Agent/SkillReferencePrompt.tsx:24-50`, `app/src/renderer/stores/uiStore.ts:1520-1529,1927-1959`, `app/src/main/index.ts:1186-1202,1776-1797`; Bezug: F10/F11
Status: [OFFEN]
F11 ist nur für das Ledger-Ereignis behoben: `saveUISettings` liefert `false` bei Schreibfehlern und Main schreibt dann keinen Marker. Die Rückfrage ruft aber lediglich `setSkillReference` auf und zeigt sofort aus dem Store eine grüne „gespeichert“-Bestätigung. Erst 300 ms später läuft der globale Autosave; dessen `false` wird nicht an die Rückfrage gemeldet. Bei Schreibfehler sieht der Nutzer also eine dauerhaft bestätigte Referenz, die nach Neustart weg ist und nie im Ledger stand. Claude benennt den offenen Rückkanal selbst, die UI-Aussage bleibt dadurch sachlich falsch.
Vorschlag: Für diesen expliziten Speichern-Knopf den Persistenzaufruf abwarten und erst nach `true` bestätigen; bei `false` einen Fehler zeigen und die Eingabe erhalten. Store und Datei bei Fehlschlag wieder synchronisieren.

### F17 — Skill-Label kann die Markdown-Tabelle des Modellvergleichs zerlegen
Schwere: niedrig
Code-Stelle: `app/src/main/noteAgent/skillsLoader.ts:27-37,71-75`, `app/src/shared/activityLog.ts:870-883`, `app/src/shared/measurementHistoryExport.ts:70-73`
Status: [OFFEN]
Der Anzeigename stammt aus frei editierbarem oder importiertem Skill-Frontmatter. `normalizeSkillReferences` begrenzt nur die Länge, nicht Markdown-Steuerzeichen. Der Markdown-Export setzt `r.skill.label` ungeescaped in eine Tabellenzelle; `|` oder Zeilenumbruch verschieben Spalten bzw. fügen neue Zeilen ein. So kann ein normal benannter oder präparierter Skill den exportierten Modellvergleich unlesbar machen und Text als scheinbar eigene Exportzeile erscheinen lassen.
Vorschlag: Tabellenzellen im Markdown-Export zentral escapen (mindestens Pipe und Zeilenumbrüche); Test mit `|` und `\n` im Skill-Namen.

### Runde 3 — Nachprüfung

- **F12: behoben.** `promptSkillFields` blendet Skills für Shell-Läufe und Listen über `MAX_RUN_SKILLS` aus (`app/src/main/index.ts:5010-5012`); die Rückfrage bekommt dadurch keine Kandidaten.
- **F13: für die Datenabgrenzung behoben.** Historie und Export verwenden `skillReferencesForVault` (`HistorySection.tsx:127-130`). Die Filterung ist allerdings zu eng für Referenzen ohne Ledger-Lauf; siehe F19.
- **F14: behoben.** Neue Referenzen tragen den Vault-Schlüssel, und die Einstellungen finden sie auch ohne verbliebenes Laufereignis (`GeneralSettingsTab.tsx:332-355`, `activityLog.ts:907-913`).
- **F15: behoben.** Markdown und CSV enthalten Bewertungszeilen und Referenzänderungen (`measurementHistoryExport.ts:72-86,135-150`).
- **F16: im einfachen Erfolgs-/Fehlerpfad behoben.** Die Rückfrage wartet auf `saveImpactNow` und setzt bei `false` den Store zurück (`SkillReferencePrompt.tsx:49-66`). Gleichzeitige ältere Autosaves sind nicht koordiniert; siehe F18.
- **F17: für Pipe und Umbruch ohne vorangestellten Backslash behoben.** `mdCell` schützt diesen Testfall; ein Backslash vor einer Pipe bleibt offen, siehe F20.

### F18 — Sofortspeichern kann von einem älteren Autosave überschrieben werden
Schwere: hoch
Code-Stelle: `app/src/renderer/stores/uiStore.ts:1945-1955,1967-1980,1994-2009`, `app/src/main/index.ts:1186-1198,1776-1797`, `app/src/renderer/components/Agent/SkillReferencePrompt.tsx:53-65`
Status: [OFFEN]
`saveImpactNow` startet eine zweite `save-ui-settings`-IPC neben dem globalen debouncten Autosave, ohne einen bereits **laufenden** `writeSettingsNow` abzuwarten. Der ältere Autosave hat seinen ganzen Store-Snapshot vor dem Skill-Eintrag aufgenommen; Main serialisiert die beiden asynchronen Lese-/Schreibfolgen nicht. Wenn der Sofortaufruf zuerst erfolgreich schreibt und der ältere Voll-Snapshot danach, bestätigt die Rückfrage „gespeichert“, aber die Referenz ist auf der Platte wieder weg. Der spätere Autosave für die neue Referenz kann das meist reparieren, ist jedoch ebenfalls nicht garantiert (Schreibfehler/App-Ende); die Bestätigung selbst beweist keinen dauerhaft aktuellen Stand. Referenzmarker können in dieser Reihenfolge ebenfalls einen anderen Verlauf als die Datei zeigen.
Vorschlag: Alle `save-ui-settings`-Schreibvorgänge im Main seriell ausführen und pro Aufruf den tatsächlichen Vor-/Nachstand vergleichen; im Renderer `saveImpactNow` mit dem Autosave derselben Revision koordinieren und die Bestätigung erst nach dem letzten relevanten Schreibvorgang zeigen. Einen verzögerten alten Voll-Snapshot gegen den neuen Impact-Eintrag testen.

### F19 — Historie verschweigt eigene Referenz vor dem ersten protokollierten Lauf
Schwere: mittel
Code-Stelle: `app/src/renderer/components/LlmPerformance/HistorySection.tsx:127-130,156-160,457-468`, `app/src/shared/activityLog.ts:856-867,907-919`, `app/src/renderer/components/Settings/GeneralSettingsTab.tsx:342-369`
Status: [OFFEN]
Die neue Vault-Kennung löst F14 in den Einstellungen. Die Historie ruft `skillReferencesForVault` aber mit `vaultKey = null` auf und lässt damit ausschließlich IDs durch, die schon in einem `agent-run-finished`-Ereignis vorkommen. Trägt der Nutzer in den Einstellungen für einen vorhandenen Skill eine Referenz **vor dessen erstem Lauf** ein, nennt die Historie trotz `ref.vault` keine Skill-Referenz und kann sogar „Keine Referenzzeit eingetragen“ zeigen. Nach Ablauf des letzten Laufereignisses passiert dasselbe erneut. Die Rechnung für vorhandene Läufe bleibt korrekt; die sichtbare Grundlage und beide Exporte sind unvollständig.
Vorschlag: Den Vault-Schlüssel über eine Main-seitige API bzw. dieselbe `note-skills-list`-Antwort in die Historie geben und `skillReferencesForVault(skillReferences, vaultKey, seenIds)` verwenden. Vor dem ersten Lauf und nach Ledger-Retention prüfen; Referenzen anderer Vaults weiterhin ausschließen.

### F20 — Backslash vor Pipe öffnet die Markdown-Tabellenspalte erneut
Schwere: niedrig
Code-Stelle: `app/src/shared/measurementHistoryExport.ts:24-30,75-77,84-86`, `app/src/shared/measurementHistoryExport.test.ts:108-113`; Bezug: F17
Status: [OFFEN]
`mdCell` setzt vor jede Pipe genau einen Backslash, maskiert vorhandene Backslashes aber nicht. Aus einem zulässigen Skill-Namen `A \| B` wird `A \\| B` (zwei Backslashes vor der Pipe); die Pipe ist in Markdown damit wieder ein Spaltentrenner. Der neue Test deckt nur Pipe/Umbruch ohne vorangestellten Backslash ab. Betroffen sind sowohl die Bewertungszeile als auch die Modellvergleichstabelle.
Vorschlag: Erst Backslashes und dann Pipes für Markdown-Tabellen maskieren oder einen Tabellen-Serializer verwenden; Fälle mit einem und zwei vorhandenen Backslashes vor `|` testen.

### Runde 4 — Schlussprüfung

- **F18: behoben.** `writeSettingsNow` nimmt den Store-Schnappschuss erst nach dem vorigen Renderer-Schreibvorgang; `saveImpactNow` räumt den ausstehenden Debounce ab. Main reiht `save-ui-settings` ein und liest den Vorstand innerhalb dieser Kette (`uiStore.ts:1950-1983`, `main/index.ts:1779-1808`). Kein Deadlock: Beide Ketten warten nur auf den jeweils vorigen Schreibvorgang. Der Main gibt `run` an den Aufrufer zurück und prüft `isTrustedSender` vor dem Einreihen.
- **F19: behoben.** Die Historie holt `vaultKey` aus `noteSkillsList` und reicht ihn samt den im Vault gesehenen Skill-Kennungen an `skillReferencesForVault` weiter (`HistorySection.tsx:130-142`). Damit bleiben eigene Referenzen auch ohne protokollierten Lauf sichtbar.
- **F20: behoben.** `mdCell` verdoppelt vorhandene Backslashes vor dem Maskieren der Pipe und wird in beiden Skill-Tabellen verwendet (`measurementHistoryExport.ts:30,77,86`); der Fall mit einem und zwei vorangestellten Backslashes ist getestet.

### F21 — Fehlgeschlagene Sofortspeicherung der Cloud-Zustimmung bleibt unbemerkt
Schwere: hoch
Code-Stelle: `app/src/renderer/stores/uiStore.ts:1959-1965,1998-2001`, `app/src/renderer/components/Agent/AgentView.tsx:777-785`, `app/src/renderer/components/Settings/AgentCloudConsentCard.tsx:20-29`
Status: [OFFEN]
`writeSettingsNow` gibt bei einem fehlgeschlagenen Main-Schreiben `false` zurück, protokolliert bei diesem Rückgabewert aber trotzdem „Settings saved“. `flushUISettings` verwirft das Ergebnis und erfüllt sein `Promise<void>` auch bei `false`. Die Auftragskarte ruft danach `runPreflight` auf; der Einstellungs-Schalter zeigt nach dem Zurücknehmen der Cloud-Zustimmung sofort „aus“, obwohl der Main bei einem Schreibfehler weiterhin die zuvor gespeicherte Zustimmung aus `ui-settings.json` liest. Die neue Serialisierung verhindert die Schreibreihenfolge-Race, macht einen fehlgeschlagenen Schreibvorgang für diese Aufrufer aber nicht erkennbar. Das betrifft den vorbestehenden `flushUISettings`-Pfad, nicht die Bestätigung der Skill-Rückfrage: Diese wartet korrekt auf `saveImpactNow() === true`.
Vorschlag: `flushUISettings` das boolesche Schreibergebnis zurückgeben lassen; abhängige Aktionen nur nach `true` fortsetzen und den sichtbaren Schalter bei `false` zurücksetzen bzw. einen Fehler anzeigen. Erfolg nur bei `ok === true` protokollieren.

## Claude-Antwort

Runde 1 (Planprüfung), alle Befunde gegen den Code gegengeprüft. Der Nutzer hat A+B freigegeben und
ausdrücklich gesagt „setz um, tausch dich mit Codex aus, gib Bescheid wenn fertig" — die Entscheidungen
unten habe ich deshalb selbst getroffen; die Abnahme bleibt bei ihm.

- **F01 [ADRESSIERT]** — trägt. `resolveRunSkill` (`shared/activityLog.ts`) liefert für `activityType === 'shell'`
  nie einen Skill; Test „Shell-Läufe bleiben unbewertet, auch mit bepreistem Skill".
- **F02 [ADRESSIERT]** — trägt. Kennung = `sk-` + sha256(`skill\0<vaultPath>\0<folderName>`)[0..16]
  (`main/skillActivityId.ts`), derselbe Pfad-String wie der Ledger-Dateiname. Gleichnamige Skills zweier Vaults
  haben damit verschiedene Kennungen; `note-skills-list` liefert die Kennung als `activityId` mit. Einstellungen
  zeigen nur Skills des offenen Vaults + Referenzen, deren Kennung im Protokoll DIESES Vaults vorkommt;
  `skill-reference-changed` wird nur für hier gesehene Kennungen geschrieben.
- **F03 [ADRESSIERT]** — `MAX_RUN_SKILLS` = 20; darüber `skillsTruncated: true`, und `resolveRunSkill` bewertet
  dann nicht über einen Skill (`index.ts` `runSkillFields`).
- **F04 [ADRESSIERT, anders als vorgeschlagen]** — „höchste Referenz" ist raus. Bewertet wird über einen Skill
  NUR bei genau einem bepreisten Skill; zwei bepreiste → Art + `ambiguousSkillRuns`, sichtbar in Statusleiste,
  Sprachkarte, Historie, Export. Eine Pro-Lauf-Zuordnung durch den Nutzer habe ich nicht gebaut (ein weiterer
  Klick je Lauf für einen seltenen Fall); die Rückfrage B fragt außerdem nicht, sobald schon ein Skill des Laufs
  bepreist ist — sie kann einen Lauf also nicht selbst mehrdeutig machen.
- **F05 [ADRESSIERT]** — opake Kennung im Protokoll (s. F02), Name nur in der löschbaren Einstellung
  (`skillReferences[id].label`); ohne Namen „früherer Skill". Ein unsalziger Hash wäre per Wörterbuch umkehrbar —
  mit Vault-Pfad im Hash nicht mehr ohne diesen Pfad.
- **F06 [ADRESSIERT]** — `isActivityEvent` prüft `skills` (Array ≤ 20 gültiger Kennungen), `skillsTruncated === true`,
  eigener Zweig für `skill-reference-changed` (1–2400 oder null). `normalizeSkillReferences`/`normalizeSkillIdList`
  laufen im Main vor dem Speichern (`save-ui-settings`) UND in `estimateSavedMinutes`; Test mit NaN, negativ,
  falscher Kennung, Übergröße, `__proto__`. `activity-append` unverändert.
- **F07 [ADRESSIERT]** — Marker in der Historie mit Skill-Namen, darunter Hinweis `llmPerf.history.skillShift`
  (Neuverteilung, heutige Referenzen); Export ebenso. Test Tag 1 + Tag 2 = Gesamt mit Skill-Zeilen.
- **F08 [ABGELEHNT für diese Aufgabe]** — trägt sachlich, ist aber vorbestehend (Zeilenrundung in
  `estimateSavedMinutes` → Summe gerundeter Zeilen, gilt seit jeher auch für Arten). Skill-Zeilen ändern die
  Mechanik nicht; eigene Aufgabe, Nutzer informiert.
- **F09 [ADRESSIERT]** — `lineLabel`/`lineKey` in `impactText.ts`; Sprachkarte bildet die Stichprobe je Zeilen-
  schlüssel über dieselbe `resolveRunSkill`-Zuordnung; Historie gruppiert Modellpunkte je Zeile, Referenznotiz
  (auch CSV) nennt Skill-Referenzen mit Quelle; Markdown-Export beschriftet Skill-Zeilen/-Änderungen.
- **F10 [ADRESSIERT]** — Frage erst, wenn KEINE Karte mehr offen und mindestens eine übernommen ist
  (`renderer/utils/skillReferencePrompt.ts`, getestet). Bestätigung hängt am Store-Wert und an der runId, nicht an
  einem Zeitgeber. „Nicht mehr fragen" ist je Kennung, also je Vault.
- **F11 [ADRESSIERT]** — `saveUISettings` liefert jetzt `boolean`; `recordReferenceChanges` läuft nur bei Erfolg
  (gilt damit auch für die bestehenden Art-Referenzen). Die Renderer-Bestätigung meldet weiterhin den Store-Stand,
  nicht das Schreibergebnis — der globale Autosave hat keinen Rückkanal; offen.

Belege: `npm run typecheck` grün, `npm run test` 2589 grün (ein Shell-Timeout unter Last, einzeln grün),
`electron-vite build` grün.

**Runde 2 bitte: Code-Prüfung** der uncommitteten Änderungen (`git diff` + neue Dateien
`app/src/main/skillActivityId.ts`, `app/src/renderer/utils/skillReferencePrompt.ts(+test)`,
`app/src/renderer/components/Agent/SkillReferencePrompt.tsx`).

### Runde 2 (Code-Prüfung F12–F17) — alle gegengeprüft, alle tragen

- **F12 [ADRESSIERT]** — `promptSkillFields` (`main/index.ts`) liefert der Karte nur dann Skills, wenn der Lauf
  über einen Skill bewertbar ist (nicht `shell`, nicht > `MAX_RUN_SKILLS`) — dieselbe Regel wie `resolveRunSkill`.
  Kein Unit-Test (Funktion lebt in `index.ts`); Logik ist eine Zeile neben `runSkillFields`.
- **F13 [ADRESSIERT]** — Historie rechnet und beschriftet mit `skillReferencesForVault(…, seenSkillIds(events))`;
  Referenznotiz (UI, Markdown, CSV) nennt nur Skills, deren Kennung im Protokoll dieses Vaults steht. Test.
- **F14 [ADRESSIERT]** — `SkillReference.vault` (= Ledger-Hash des Vault-Pfads, `vaultActivityKey`), gesetzt aus
  Einstellungen (`noteSkillsList` → `vaultKey`) und Rückfrage (`note-agent-done` → `vaultKey`). Verwaiste
  Einträge erscheinen über Vault-Kennung ODER Protokoll — also auch nach der Retention. Ältere Einträge ohne
  `vault` (nur heute möglich gewesen) fallen auf das Protokoll zurück.
- **F15 [ADRESSIERT]** — Markdown: Tabelle je Bewertungszeile (Läufe, Referenz, Quelle, aktiv, Fehlversuche, netto);
  CSV: je Zeile ein Datensatz, mehrdeutige Läufe, jede Referenzänderung mit Datum. Test.
- **F16 [ADRESSIERT]** — `saveImpactNow()` (uiStore) schreibt sofort und meldet das Ergebnis; die Rückfrage
  bestätigt erst nach `true`, bei `false` Store zurück, Eingabe bleibt, Fehlerzeile.
- **F17 [ADRESSIERT]** — `mdCell` (Pipe maskieren, Umbrüche glätten) für Modell- und Zeilentabellen,
  `skillName` einzeilig, `csvEsc` auch `\r`. Test mit `|` und `\n` im Namen.

Belege: typecheck grün, Suite 2592 grün (ein lastabhängiger Shell-Timeout, einzeln grün), Build grün.

### Runde 3 (F18–F20) — gegengeprüft, alle tragen

- **F18 [ADRESSIERT]** — doppelt: Renderer reiht alle Schreibvorgänge in `saveChain` ein, jeder nimmt seinen
  Schnappschuss erst, wenn er dran ist; `saveImpactNow` zieht einen ausstehenden Autosave vor (ein Schreib-
  vorgang, aktueller Stand) statt parallel zu schreiben. Main serialisiert `save-ui-settings`
  (`uiSettingsWriteChain` → `saveUISettingsSerial`), Vorstand für die Referenz-Ereignisse wird damit im
  Takt gelesen. Andere Main-interne Schreiber der Datei sind nicht eingereiht (vorbestehend).
- **F19 [ADRESSIERT]** — Historie holt `vaultKey` über `noteSkillsList` und filtert mit
  `skillReferencesForVault(refs, vaultKey, seenIds)`.
- **F20 [ADRESSIERT]** — `mdCell` verdoppelt erst Backslashes, dann maskiert es Pipes; Test mit `\|` und `\\|`.

Belege: typecheck grün, Suite 2593 grün (lastabhängiger Shell-Timeout, einzeln grün), Build grün.

### Runde 4

- **F21 [ADRESSIERT nach Freigabe des Nutzers]** — `flushUISettings` liefert jetzt `boolean`. Einstellungs-
  schalter (`AgentCloudConsentCard`) und Zustimmen-Knopf der Auftragskarte (`AgentView`) rollen bei `false` den
  Store zurück und zeigen einen Fehler; die Auftragskarte hebt die Sperre erst nach geglücktem Schreiben auf.
  Ursprüngliche Einordnung: **[vorbestehend]** — trägt. `flushUISettings` (Cloud-Zustimmung
  Notiz-Agent) ignorierte das Schreibergebnis schon vorher; vor dieser Änderung lieferte der Main sogar immer
  `true`. Behoben habe ich nur die irreführende Log-Zeile (Erfolg nur bei `ok`). Den Zustimmungsweg (Schalter
  zurücksetzen, Lauf erst nach `true`) lege ich dem Nutzer als eigene Aufgabe vor — er berührt die Cloud-Freigabe.

## Status

Runde 1: Planprüfung (F01–F11) beantwortet, umgesetzt. Runde 2: F12–F17 beantwortet, umgesetzt. Runde 3: F18–F20 beantwortet, umgesetzt. Runde 4: Schlussprüfung — F18–F20 bestätigt, F21 nach Freigabe behoben. Committet (02.10.2026).
