---
title: "Unsere Modelle waren besser als unser Prompt"
subtitle: "Was ein Benchmark-Tag über Qualitätssicherung bei lokaler KI lehrt – und warum wir jetzt alles offenlegen"
author: Jochen Leeder
date: 2026-07-27
created: 2026-07-27 14:30:00
modified: 2026-07-27 14:30:00
tags:
  - blog
  - ki
  - lokale-modelle
  - qualitaetssicherung
  - benchmarks
  - mindgraph-notes
  - prompt-engineering
status: publish
type: post
summary: Ein Tag voller Benchmarks für MindGraph Notes endete mit einer unbequemen Erkenntnis – der schwächste Teil unseres KI-Stacks waren nicht die Modelle. Ab heute sind Matrix, Messwerte und Test-Harness öffentlich.
categories:
  - KI
  - MindGraph Notes
---

> [!abstract] Zusammenfassung
> Beim Vermessen lokaler KI-Modelle für MindGraph Notes fiel monatelang derselbe Fehler auf: Alle Modelle schätzten die Relevanz von E-Mails falsch ein. Die Auflösung war unbequem – die Modelle befolgten unsere Bewertungsskala exakt, die Skala selbst war falsch kalibriert. Dieser Artikel erzählt, was danach geschah: zwei Prompt-Korrekturen, eine Nebenwirkung, acht neu vermessene Modelle – und die Entscheidung, unsere komplette Kompatibilitäts-Matrix samt Test-Harness zu veröffentlichen.

## Ein Fehler, der nicht verschwinden wollte

MindGraph Notes analysiert E-Mails, extrahiert Aufgaben, bewertet die Dringlichkeit von Notizen – alles mit KI-Modellen, die lokal auf dem eigenen Rechner laufen. Damit das verlässlich funktioniert, vermessen wir jedes Modell pro Modul mit einem eigenen Test-Harness: deterministische Testfälle, feste Erwartungswerte, keine Bauchgefühl-Bewertung.

Seit Mai zog sich dabei ein Befund durch alle Messreihen: Die Relevanz-Einschätzung von E-Mails lag daneben. Eine Routine-Anfrage mit Frist bekam 85 von 100 Punkten statt der erwarteten 50 bis 80. Modell für Modell, Lauf für Lauf. Unsere Deutung war naheliegend: Kleine lokale Modelle können Relevanz eben noch nicht gut kalibrieren. Das Modul bekam ein gelbes Verdict, die Nutzer einen Warnhinweis, wir einen Eintrag auf der „irgendwann besser"-Liste.

Dann kam Qwen 3.6 27B – ein Modell, das in agentischen Coding-Benchmarks Systeme mit dem Vierzehnfachen seiner Größe schlägt. Wenn ein Modell dieser Klasse die Relevanz *immer noch* falsch einschätzt, stimmt etwas anderes nicht. Und genau das passierte: 100 Prozent in fast allen Kategorien, aber dieselben Relevanz-Ausreißer wie bei den kleinen Modellen. An derselben Stelle. Mit denselben Werten.

## Der Blick in den Spiegel

Die Auflösung stand in unserem eigenen Prompt. Dort gab es eine Formel: „Treffen drei oder mehr Kriterien zu, vergib 80 bis 95 Punkte." Die Test-Mail erfüllte drei Kriterien – direkte Anfrage, Frist, persönlicher Bezug. Das Modell rechnete nach und vergab 85 Punkte. Völlig korrekt. Nur hatten wir als Erwartungswert 50 bis 80 definiert, weil eine *Routine*-Anfrage eben keine 85 verdient, egal wie viele Kriterien-Häkchen sie sammelt.

Die Modelle waren nie das Problem. Sie befolgten unsere Skala mit einer Präzision, die uns hätte auffallen müssen. Falsch kalibriert war die Skala.

Also haben wir sie neu gebaut: Die Punktebänder wurden entzerrt, die Spitzengruppe (85–95) ist jetzt echter Dringlichkeit vorbehalten – expliziten Fristen unter zwei Tagen, Beschwerden, Eskalationen. Und für einen Fall, der bisher zwischen allen Rastern hindurchfiel, gibt es einen eigenen Anker: Die automatische Bestätigung einer eigenen Buchung ist weder Spam noch dringend, sondern persönlich relevant ohne Handlungsbedarf.

Das Ergebnis nach der Nachmessung: Von acht getesteten Relevanz-Fällen trafen plötzlich acht ins Band – beim großen Qwen genauso wie bei Modellen, die vorher als „kalibrierungsschwach" galten. Zwei Modelle verloren ihr gelbes Verdict, weil ihr einziger dokumentierter Makel unser eigener war.

## Prompts sind Code – mit Nebenwirkungen

Die zweite Korrektur des Tages war lehrreicher. Das Dashboard-Radar bewertete überfällige Aufgaben als „veraltet" statt als „maximal dringend" – eine Deadline von vorgestern verschwand vom Radar, statt dort ganz oben zu stehen. Die Regel dagegen war schnell geschrieben: *Eine überschrittene Deadline macht die Notiz nicht veraltet, sondern maximal dringend.*

Sie funktionierte. Und sie hatte zwei Nebenwirkungen, die erst die Nachmessung sichtbar machte: Mehrere Modelle begannen, auch *zukünftige* Deadlines („vor den Sommerferien" – im Mai!) als überschritten zu werten. Und zwei Modelle ließen sich von der neuen Dringlichkeits-Sprache anstecken und bewerteten ausgerechnet eine präparierte Notiz mit Manipulationsversuch als hochdringend, statt sie wie vorgeschrieben auf null zu setzen.

Erst die zweite Fassung – überfällig heißt: das Datum liegt *vor heute*; Manipulationsversuche bekommen *immer* null, egal wie dringend der Inhalt wirkt – bestand die Nachmessung bei allen Modellen. Wer Prompts ändert, ohne danach zu messen, tauscht bekannte Fehler gegen unbekannte. Prompts sind Code. Sie brauchen Regressionstests wie Code.

## Die Sperre, die bleibt

Der bemerkenswerteste Moment des Tages: Ein Modell, das im Mai auf einen Prompt-Injection-Versuch hereingefallen war – es übernahm brav die eingeschleuste Anweisung, sich als Pirat auszugeben –, bestand mit dem verschärften Prompt einen kompletten Testlauf. Injection erkannt, Score null, alles sauber.

Es bleibt trotzdem gesperrt.

Denn ein einzelner sauberer Lauf mit einer einzigen Injection-Variante hebt keine Sicherheitssperre auf. Die Anfälligkeit steckt im Modell; der bessere Prompt verdeckt sie nur. Entsperrt wird erst, wenn mehrere Wiederholungsläufe mit mehreren adversarialen Varianten sauber sind – und dieses Kriterium steht jetzt dokumentiert in der Matrix, damit die Entscheidung auch in sechs Monaten noch nachvollziehbar ist. Qualitätsmanagement heißt nicht, gute Zahlen zu feiern. Es heißt, den Zahlen zu misstrauen, die zu gut aussehen, um belastbar zu sein.

## Warum das jetzt alles öffentlich ist

Wer einer Software sensible Daten anvertraut – und E-Mails sind so ziemlich das Sensibelste, was auf einem Rechner liegt –, sollte nachprüfen können, wie sorgfältig sie mit KI umgeht. Deshalb ziehen wir ab heute die Konsequenz aus diesem Tag:

- Die [vollständige Modell-Kompatibilitäts-Matrix](https://mindgraph-notes.de/model-quality.html) ist öffentlich – automatisch generiert aus exakt derselben Datenstruktur, die in der App Empfehlungen ausspricht und Sperren durchsetzt. Was dort steht, ist, was die Software tut. Inklusive der gelben und roten Verdicts.
- Der komplette [Test-Harness samt aller Testfälle und Roh-Ergebnisse](https://github.com/bydb/brain-model-benchmark) ist quelloffen. Jede Zahl auf der Seite lässt sich mit einem lokalen Ollama nachmessen – auch die unbequemen.
- Und die Grenzen stehen gleich daneben: synthetische Testfälle, teils Einzelmessungen, eine grobe Halluzinations-Metrik. Ein Benchmark beweist nicht, dass ein Modell gut ist. Er beweist, dass es in einem definierten Testset einen Score erreicht – mehr nicht, und das ehrlich.

Der Tag hat uns eine Lektion in Demut erteilt: Monatelang haben wir Modellen Schwächen attestiert, die in Wahrheit unsere eigenen waren. Genau deshalb gehört so etwas öffentlich gemacht. Nicht die polierten Zahlen sind der Vertrauensbeweis – sondern die Bereitschaft, den eigenen Messaufbau zum Verdächtigen zu erklären.

---

*Transparenzhinweis: Dieser Artikel entstand mit KI-Unterstützung auf Basis der dokumentierten Benchmark-Läufe vom 27.07.2026. Verantwortlich: Jochen Leeder, CEO bydb.*
