# Notiz-Agent-Skills: lokale Vorprüfung vom 26.07.2026

Status: **Vorprüfung, keine Freigabemessung.** Pro Modell und Fall wurde nur ein
Lauf gemessen. Für eine Modellmatrix sind drei Wiederholungen je Fall nötig.

## Kurzurteil

Die neue Tool-Capability-Prüfung ist notwendig, aber nicht hinreichend. Sowohl
`qwen3.5:4b` als auch `ministral-3:8b` können native Tool-Calls erzeugen, bestehen
aber keinen der neun aktiven Skill-Verträge. Das große lokale
`qwen3.6:27b-mlx` besteht die zwei bisher gemessenen Gegenproben vollständig,
braucht dafür im Mittel 268,6 Sekunden.

Damit ist belegt:

- Der Testkorpus ist grundsätzlich mit lokaler Inferenz lösbar.
- „Unterstützt Tools“ ist keine belastbare Aussage über Skill-Tauglichkeit.
- Für kleine und mittlere lokale Modelle kann derzeit keine allgemeine
  Empfehlung für den Notiz-Agenten ausgesprochen werden.
- Das große lokale Modell liefert die geforderte Qualität, ist aber noch nicht
  über alle Skills und nicht ausreichend oft gemessen. Seine Latenz ist für
  interaktive Nutzung grenzwertig.

## Ergebnisse

| Modell | Gemessene Fälle | Artefakt erzeugt | Skill zuerst | Skill-Vertrag erfüllt | Strikt bestanden | Ø Laufzeit |
|---|---:|---:|---:|---:|---:|---:|
| `qwen3.5:4b` | 9/9 | 9/9 | 1/9 | 0/9 | **0/9** | 30,4 s |
| `ministral-3:8b` | 9/9 | 7/9 | 0/9 | 0/9 | **0/9** | 34,3 s |
| `qwen3.6:27b-mlx` | 2/9 | 2/2 | 2/2 | 2/2 | **2/2** | 268,6 s |

Beim 27B-Modell wurden bisher nur der Elternbrief und der schwierigste
Akkreditierungsfall gemessen. Die 2/2 dürfen nicht auf die übrigen sieben Skills
hochgerechnet werden.

## Beobachtete Fehler

### qwen3.5:4b

- Der richtige Skill wurde nur in fünf von neun Fällen überhaupt geladen und
  nur einmal als erstes Werkzeug.
- Der Elternbrief hatte keinen vollständigen abtrennbaren Rückmeldeabschnitt.
- Das Protokoll trennte Diskussion und Beschluss nicht zuverlässig.
- Die Literaturnotiz rundete einen exakten Befund und ließ Pflichtabschnitte aus.
- Der Webseiten-Artikel hatte kein korrektes Frontmatter und keinen
  vollständigen Transparenzhinweis.
- Die Teilnehmerliste verletzte Sortierung, Spaltenvertrag und
  Dublettenbereinigung.
- Die Tabellen-Zuordnung markierte einen fehlenden Treffer nicht.
- Das Akkreditierungsformular ließ belegte Felder aus und benannte offene
  Personendaten in der Abschlussantwort nicht.

Der neue einmalige Schreib-Anstoß des Produkt-Loops wirkt: Im finalen Lauf
entstanden 9/9 Artefakte. Er behebt jedoch keine fachliche Vertragsverletzung.

### ministral-3:8b

- Kein Fall begann mit `use_skill`; nur im Akkreditierungsfall wurde der Skill
  später überhaupt geladen.
- Zwei Läufe endeten mit einer fehlerhaften Tool-JSON-/HTTP-Antwort von Ollama.
- Die übrigen Fehler entsprechen weitgehend dem 4B-Muster: fehlende
  Pflichtstruktur, falsche Excel-Ausgabe, unvollständiger Transparenzhinweis und
  nicht eingehaltene HTML-/SVG-Regeln.

### qwen3.6:27b-mlx

- Elternbrief: bestanden in 229,1 Sekunden.
- Akkreditierung: bestanden in 308,0 Sekunden.
- Richtige Skill-Reihenfolge, vollständige Quellenkette, genau ein Writer,
  vollständiger Artefaktvertrag und Abschlussantwort in beiden Fällen.

## Einordnung zum Datenschutzversprechen

Lokale Inferenz ist eine starke technische Maßnahme, weil Quelldaten nicht an
einen externen Modellanbieter übertragen werden müssen. Sie ist aber allein
kein Nachweis vollständiger DSGVO-Konformität. Die EU-Kommission nennt neben
Datenschutz durch Technikgestaltung unter anderem Datenminimierung,
Zugriffsbeschränkung, Sicherheit und Rechenschaftspflicht; die Einhaltung muss
auch nachweisbar sein:

- [EU-Kommission: Datenschutzpflichten und Datenschutz durch Technikgestaltung](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en)
- [EU-Kommission: Rechenschaftspflicht nachweisen](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/how-can-i-demonstrate-my-organisation-compliant-gdpr_en)
- [EDPB: Privacy by design and by default](https://www.edpb.europa.eu/topics/ai-and-technology/privacy-by-design-and-by-default_en)

Für MindGraph heißt das technisch:

- Der Loopback-Zwang und das lokale Backend sichern den Datenweg ab.
- Skill-Tests sichern zusätzlich ab, dass der Agent datensparsame Regeln im
  Ergebnis tatsächlich befolgt.
- Eine Produktformulierung sollte „lokale Verarbeitung“ konkret beschreiben und
  eine pauschale Rechtsgarantie vermeiden, solange die organisatorischen und
  rechtlichen Nachweise nicht separat geführt sind.

## Konsequenzen für den Agent-Workflow

1. **Keine lokale Empfehlung allein aus der Tool-Capability ableiten.**
   Modellmatrix und Picker brauchen eine eigene Skill-Eignung.
2. **Skill-Auswahl für kleine Modelle deterministischer machen.**
   Ein sichtbarer Skill-Picker oder ein bereits vom Host gewählter Skill könnte
   genau eine Anleitung vorladen und irrelevante Skills ausblenden. Das senkt
   Kontext und Routing-Fehler.
3. **Kritische Skill-Verträge hostseitig prüfen.**
   Für strukturierte Ergebnisse eignen sich deklarative Checks: erforderliche
   Spalten, verbotene personenbezogene Felder, Pflichttexte, Formularzeilen und
   HTML-Regeln. Ein formal erzeugtes Artefakt darf nicht automatisch als
   fachlicher Erfolg gelten.
4. **Lokale Produktstufen klar benennen.**
   Kleine Modelle können für einfache Notiz-Tools experimentell bleiben;
   compliance-relevante Skills benötigen ein nachweislich bestandenes Modell.
5. **Latenz sichtbar machen.**
   Fortschritt, Abbrechen und realistische Zeitangaben sind bei großen lokalen
   Modellen Teil der Nutzbarkeit.

## Nächste Messungen

1. `qwen3.6:27b-mlx` über alle neun Fälle, zunächst einmal, danach dreimal.
2. Ein lokales Modell zwischen 12B und 14B, um die Mindestgröße einzugrenzen.
3. Dieselben Gewichte über LM Studio, weil Tool-Template und Fehlerverhalten vom
   Backend abhängen können.
4. Erst danach ein großes Cloud-Modell als separate Lösbarkeits- und
   Qualitätsobergrenze; nicht in die lokale Freigabewertung mischen.
5. Nach Änderungen an Skill-Routing oder hostseitiger Validierung den vollständigen
   Korpus erneut ausführen.

Runner, Korpus und ausführliche Bedienung:
`app/scripts/note-agent-skill-benchmark.mjs`,
`app/scripts/note-agent-skill-cases.mjs` und
`docs/note-agent-skill-benchmark.md`.

