---
title: "Als Claude für Qwen programmierte — der Phantom-Termin von Leipzig"
subtitle: "Meine App MindGraph Notes habe ich mit Claude Code gebaut. Die Prompts, die Claude schrieb, waren perfekt — für Claude. Für ein 8B-Ollama-Modell waren sie eine Falle."
author: Jochen Leeder
date: 2026-06-02
created: 2026-06-02 19:00:00
modified: 2026-06-02 19:00:00
tags:
  - ki
  - llm
  - lokale-ki
  - ollama
  - mindgraph-notes
  - claude-code
  - softwareentwicklung
  - debugging
  - few-shot
  - prompt-engineering
  - email
  - blog
status: publish
type: post
summary: "Claude Code schrieb die Prompts für MindGraph Notes. Die Few-Shot-Beispiele darin sahen perfekt aus — für ein Frontier-Modell. Für mein 8B-Ollama-Modell wurden sie zur Kopiervorlage. Ein erfundener Termin („Fortbildung Leipzig") tauchte wochenlang in jeder Mail-Analyse auf. Es war keine Halluzination — es war ein Blinder Fleck der KI-gestützten Entwicklung."
categories:
  - KI
  - Softwareentwicklung
  - MindGraph Notes
---

![Header](2026-06-02-phantom-termin-leipzig-header.png)

> [!abstract] Zusammenfassung
> Ich habe MindGraph Notes mit Claude Code gebaut. Claude schrieb die Analyse-Prompts fürs Mailmodul — mit konkreten Few-Shot-Beispielen, wie es die Prompt-Engineering-Lehrbücher empfehlen. Was ich übersah: Claude schreibt Prompts auf Claude-Niveau. Die Beispiele waren perfekt für ein Modell, das Vorlagen von Inhalten trennen kann. Für ein 8B-Ollama-Modell auf meinem Mac waren sie eine Kopiervorlage. „Fortbildung Leipzig, 23.06., 14:00" stand wochenlang in jeder Mail-Analyse — weil das Beispiel es so vorschrieb. Der Fehler saß nicht im Ollama-Modell. Er saß im unsichtbaren Gefälle zwischen dem, womit ich baue, und dem, wofür ich baue.

## Einleitung

MindGraph Notes, die App, an der ich seit Januar arbeite, analysiert E-Mails lokal auf dem Rechner. Kein Cloud-Modell, kein API-Key, kein Datenabfluss. Ein 8B-Qwen-Modell unter Ollama auf einem Mac Mini. Gebaut habe ich die App mit Claude Code — einem KI-Assistenten, der auf einem der leistungsfähigsten Modelle der Welt läuft.

Vor ein paar Wochen öffnete ich eine Notiz, die mein Mailmodul automatisch angelegt hatte. Darin stand ein Task: **„Fortbildung Leipzig, 23.06., 14:00"**. Das klang konkret. Das klang nach etwas, das ich irgendwann eingetragen haben musste.

Nur: Es gab keine Fortbildung in Leipzig. Keine Mail, die davon sprach. Keine Erinnerung. Die Notiz stammte aus einer Nachricht von Gerrit, der fragte, ob ich ihm einen fehlenden OER-Kalenderlink schicken könne. Nichts mit Fortbildung. Nichts mit Leipzig.

Ich löschte den Task. Am nächsten Tag: wieder da. Gleicher Termin, gleicher Ort, gleiche Uhrzeit. Meine eigene App erfand denselben Termin immer und immer wieder.

Das ist die Geschichte, wie ich herausfand, dass der Fehler nicht im Ollama-Modell lag — sondern im unsichtbaren Gefälle zwischen dem Modell, mit dem ich die Software schreibe, und dem Modell, für das ich sie schreibe.

## Die falsche Fährte

Meine erste Diagnose war naheliegend: **Das Modell halluziniert.** Kleine lokale Modelle, 4 bis 8 Milliarden Parameter — irgendwas läuft da schief. Immerhin ist das nicht Claude oder GPT-4, das ist gemma4 auf einem Mac mit 8 GB RAM. Die Deutung ist bequem und passt zu allem, was man über lokale Modelle liest.

Also tauschte ich das Modell. Gemma raus, qwen rein. Vielleicht liegt es am Anbieter.

Der Bug blieb. Fortbildung Leipzig. 23.06. 14:00. Exakt derselbe Termin.

Das hätte mich stutzig machen sollen. Halluzinationen sind Zufallsprodukte — mal dies, mal das, nicht wochenlang dieselbe Zeichenkette. Aber ich war in der „das Modell ist zu klein"-Denke gefangen. Genau hier würden die meisten aufgeben und sagen: Lokale Modelle taugen halt nichts für E-Mail-Analyse. Nimm halt doch die ChatGPT-API.

Ich gab fast auf.

## Die Spur im Prompt

Irgendwann kam die Intuition, die alles gedreht hat: **Immer derselbe Wert — das kann keine Halluzination sein. Das muss irgendwo im Code stehen.**

Es stand im Code. Genauer: im Prompt. Der Analyse-Prompt fürs Mailmodul endete mit einem fertig ausgefüllten Beispiel-JSON. Ein Few-Shot-Beispiel, wie es jedes Prompt-Engineering-Tutorial empfiehlt:

```json
{"relevant":true,"relevanceScore":85,"sentiment":"neutral","summary":"Zusammenfassung auf Deutsch","matchedCriteria":["Termine & Fristen","Veranstaltungen"],"extractedInfo":["Termin: 2026-06-23 14:00","Ort: Leipzig"],"categories":["Fortbildung"],"needsReply":true,"replyUrgency":"medium","suggestedActions":[{"action":"Termin: Fortbildung Leipzig","date":"2026-06-23","time":"14:00"},{"action":"Anmelden","date":"2026-06-01","time":""}]}
```

Da war er. Der Phantom-Termin. „Fortbildung Leipzig", „2026-06-23 14:00" — jedes Wort, jedes Datum, jede Uhrzeit stand seit Wochen unverändert in meinem Prompt. Und das Ollama-Modell hat es treu zurückkopiert — für jede Mail, für die es keine bessere Idee hatte.

An der Stelle war der Bug technisch erklärt. Aber die eigentlich interessante Frage kam erst danach: Wer hatte diesen Prompt geschrieben?

## Wer hat das geschrieben?

Ich habe das Beispiel-JSON nicht selbst in den Prompt getippt. **Claude Code hat es geschrieben.**

Ich hatte Claude den Auftrag gegeben: „Schreib einen Analyse-Prompt fürs Mailmodul, der JSON ausgibt." Claude schrieb einen soliden Prompt mit klaren Instruktionen — und setzte als Service ein vollständiges Few-Shot-Beispiel drunter. Das ist gute Praxis. Das machen die Prompt-Engineering-Tutorials genau so. Ich habe den Code reviewt und dachte: Solide Arbeit.

Was ich nicht bedacht habe: **Claude schreibt Prompts auf Claude-Niveau.** Wenn Claude ein Few-Shot-Beispiel sieht, versteht es: „Ah, das ist das Schema. Ich soll das Format übernehmen, aber die Werte aus der eigentlichen Eingabe füllen." Claude abstrahiert. Claude trennt Vorlage von Inhalt.

Ein 8B-Ollama-Modell tut das nicht. Es sieht ein ausgefülltes JSON — und pattern-matcht. Es kopiert die Literale. Je konkreter das Beispiel, desto wahrscheinlicher die Kopie. Aus Claudes Sicht war das Beispiel-JSON eine Formatvorlage. Aus Qwens Sicht war es die richtige Antwort, die man abliefern kann, wenn man die Mail nicht richtig versteht.

Das ist der Blinde Fleck. Nicht: „Das Modell ist zu schlecht." Sondern: **Das Werkzeug, mit dem ich baue, operiert auf einem fundamental anderen Niveau als das Werkzeug, für das ich baue.** Claude nimmt an, das Zielmodell könne Vorlagen verstehen — weil Claude selbst es kann. Und ich habe nicht widersprochen.

## Few-Shot-Leakage — die Fehlerklasse, die nicht im Modell sitzt

An dieser Stelle muss ich drei Begriffe sauber auseinanderziehen, weil mir das selbst erst zu spät klar wurde:

- **Halluzination**: Das Modell erfindet etwas, das weder in der Eingabe noch im Prompt steht. Frei erfunden.
- **Few-Shot-Leakage**: Das Modell kopiert ein konkretes Literal aus dem Prompt-Beispiel in den Output. Nicht erfunden — abgeschrieben.
- **App-Bug**: Daten gehen im Parser verloren. Das Modell hat korrekt gearbeitet, aber mein Code hat den Output verworfen.

Drei völlig verschiedene Fehlerklassen. Drei völlig verschiedene Lösungen. Eine Halluzination bekämpft man mit Modell-Tausch oder Temperatur-Senkung. Few-Shot-Leakage bekämpft man, indem man die konkreten Werte aus dem Prompt-Beispiel entfernt. Ein App-Bug braucht einen Code-Fix.

Und genau hier liegt der Haken, wenn man mit Claude Code für Ollama baut: **Claude unterscheidet diese drei Fehlerklassen nicht von sich aus.** Claude produziert Few-Shot-Beispiele, die für Claude sicher wären — und ich als Entwickler muss erkennen, dass sie es für Qwen nicht sind.

Das ist keine Kritik an Claude. Es ist die Natur des Gefälles. Das stärkere Werkzeug produziert Code, der das schwächere Werkzeug überfordert — nicht, weil der Code schlecht ist, sondern weil er die Fähigkeiten des stärkeren Werkzeugs stillschweigend voraussetzt.

## Der Fix

Die Lösung war im Nachhinein offensichtlich: **Keine echten Werte in Few-Shot-Beispiele. Platzhalter statt Leipzig.**

Aus dem konkreten Beispiel wurde ein Schema:

```json
{"relevant":<true|false>,"relevanceScore":<0-100>,"sentiment":"<positiv|neutral|negativ>","summary":"<Zusammenfassung auf Deutsch>","matchedCriteria":["<Kriterium aus der Liste>"],"extractedInfo":["<extrahiertes Detail aus der Mail>"],"categories":["<Kategorie>"],"needsReply":<true|false>,"replyUrgency":"<niedrig|medium|hoch>","suggestedActions":[{"action":"<konkrete Aktion aus der Mail>","date":"<YYYY-MM-DD>","time":"<HH:MM>"}]}
```

Dazu ein explizites Label: *„AUSGABEFORMAT (NUR Schema — die `<Platzhalter>` NICHT abschreiben)"*. Und eine Warnzeile: *„Alle Werte MÜSSEN aus dem E-Mail-Text stammen, erfinde nichts."*

Die spitzen Klammern sind nicht dekorativ. Selbst wenn das Modell den Platzhalter trotzdem kopiert — was bei den kleinsten Modellen immer noch passiert —, steht da `<Zusammenfassung auf Deutsch>` im Output. Ein sichtbarer Platzhalter, kein echt aussehender Fake-Termin. **Gnädiges Scheitern.** Der Nutzer sieht sofort: Hier ist etwas schiefgegangen. Der Parser erkennt `<...>` und verwirft es, statt es als echten Termin in den Kalender zu schreiben.

Und das ist die neue Prompt-Regel, die ich Claude Code seither explizit mitgebe: **„Das Zielmodell ist ein 4–8B Ollama-Modell, nicht du. Verwende NIE konkrete Werte in Beispielen. Nutze `<Platzhalter>`. Füge eine Warnzeile ein: 'Werte MÜSSEN aus der Eingabe stammen.'"**

Seit ich das tue, hat Claude mir keinen einzigen Prompt mehr mit konkreten Beispiel-Werten geschrieben. Der Assistent passt sich an — wenn man ihm sagt, für wen er schreibt.

Beim Audit fand ich dasselbe Muster in zwei weiteren Prompts: Quiz-Fragen und Quiz-Empfehlungen. Claude hatte beide geschrieben, beide mit konkreten Beispielen. Gleiche Fehlerklasse, gleicher Fix: `<Platzhalter>` rein. Die restlichen Prompts — Brain, Telegram, Workflows — waren sauber. Da hatte Claude offenbar zufällig keine Beispiele eingebaut.

## Der zweite Bug, der sich versteckt hat

Während ich den Leipzig-Bug suchte, fiel mir auf, dass qwen in meinen Tests genauer wirkte als gemma — mehr extrahierte Termine, mehr erkannte Tasks. Ich hielt das lange für einen echten Qualitätsunterschied. War es aber nicht.

Der Parser für `extractedInfo` prüfte mit `Array.isArray()`. qwen lieferte ein flaches Array — sauber. Gemma lieferte ein verschachteltes Array (`[["Termin: ..."]]`). Geschrieben hatte den Parser — natürlich — Claude Code. Die Prüfung war korrekt für flache Arrays. Sie war blind für verschachtelte.

Der Parser verwarf gemmas korrekte Daten still. Kein Fehler, keine Warnung, einfach weg. Das erzeugte den falschen Eindruck, qwen sei das präzisere Modell. In Wahrheit produzierte es nur ein Format, das zufällig durch die Prüfung kam.

Das Muster ist dasselbe: **Claude schrieb Code, der eine implizite Annahme über die JSON-Disziplin des Zielmodells machte.** Claude selbst produziert immer flache Arrays. Claude nahm an, Qwen tue das auch. Qwen tat es. Gemma nicht. Wieder das Gefälle.

Die Korrektur war einfach (`Array.isArray` rekursiv prüfen). Die Lektion sitzt tiefer: **Jede Parser-Annahme ist eine Modell-Annahme.** Wer für lokale Modelle baut, muss die JSON-Outputs mehrerer Modelle gegentesten — nicht nur des einen, das zufällig ins Schema passt.

## Warum ich das alles überhaupt mache

Spätestens hier fragt sich jeder: Warum nicht einfach GPT-4 per API? Warum dieser Aufwand mit Ollama-Modellen, die offensichtlich nicht mithalten können?

Die Antwort ist der Grund, warum MindGraph Notes existiert: **E-Mail-Inhalte verlassen den Rechner nie.** Kein Cloud-Modell, kein API-Key, nicht einmal Ollamas `-cloud`-Variante. Die Brain-Funktion ist auf `localhost:11434` fest verdrahtet — nicht als Setting, sondern als Code-Eigenschaft. Wer die App nutzt, dessen Mails laufen durch ein lokales Modell oder gar nicht.

Das ist das Versprechen. Und es hat einen Preis: Ich entwickle mit einem der leistungsfähigsten KI-Modelle der Welt — und deploye auf einem 8B-Modell auf einem Mac Mini. Dazwischen liegt ein Gefälle, das ich ständig im Kopf halten muss.

Der Leipzig-Bug ist ein Produkt genau dieses Gefälles. Claude schrieb den Code, als wäre Claude das Ziel. Ich reviewte den Code mit denselben Augen. Und der Qwen auf meinem Mac machte, was 8B-Modelle halt machen: Er schrieb ab.

Die Einschränkung ist die Wurzel des Problems. Und sie ist es wert. Aber sie zwingt mich zu einer Disziplin, die bei reiner Cloud-Entwicklung nicht nötig wäre: **Ich muss meinem eigenen Entwicklungs-Werkzeug explizit sagen, für welches schwächere Werkzeug es baut.**

## Was das für KI-gestützte Entwicklung bedeutet

Das ist der Punkt, der über diesen einen Bug hinausgeht.

Ich glaube, wir werden in den nächsten Jahren sehr viel Software sehen, die mit Frontier-Modellen gebaut wird, aber auf kleineren, lokalen Modellen läuft. Edge-KI. On-Device. Privacy-first. Der Use Case ist offensichtlich, die Nachfrage wird kommen.

Und in all diesen Projekten wird dasselbe passieren: Der Assistent schreibt Code auf dem Niveau seiner eigenen Fähigkeiten. Der Entwickler reviewt und sieht soliden Code. Das Zielmodell scheitert — nicht, weil die Software schlecht ist, sondern weil sie Annahmen über die Modell-Kapazität macht, die nur für das Entwicklungs-Werkzeug gelten.

Drei Dinge habe ich daraus für meinen eigenen Workflow gelernt:

1. **Explizit das Zielmodell nennen.** Claude bekommt seit dem Leipzig-Bug in jedem relevanten Prompt die Info: „Das Ziel ist ein 4–8B Ollama-Modell. Keine konkreten Few-Shot-Werte. Platzhalter statt Beispiele. Parser tolerant, aber nicht blind."
2. **Prompt-Audit gegen die echte Ziel-Hardware.** Kein Prompt geht mehr live, ohne dass ich ihn einmal mit dem tatsächlichen Ollama-Modell auf meinem Mac ausführe und den Output prüfe. Nicht mit Claude simulieren. Mit Qwen.
3. **Parser-Gegentest mit mindestens zwei Modellen.** Seit dem `extractedInfo`-Bug lasse ich jeden neuen Parser gegen gemma und qwen laufen. Was bei einem Modell sauber durchgeht, muss beim anderen noch lange nicht ankommen.

Das kostet Zeit. Aber weniger Zeit, als einem Phantom-Termin zwei Wochen hinterherzujagen.

## Fazit

Der Phantom-Termin von Leipzig war kein Qwen-Bug. Er war kein Claude-Bug. Er war ein **Blinder Fleck im Gefälle zwischen Entwicklungs-Werkzeug und Ziel-Werkzeug.** Claude schrieb, was Claude kann. Qwen machte, was Qwen kann. Ich saß dazwischen und merkte es zwei Wochen nicht.

Sechs Dinge nehme ich mit:

1. **„Halluzination" ist eine zu schnelle Diagnose.** Wer besseres Prompt-Engineering bei Frontier-Modellen gelernt hat, überträgt die Konzepte eins zu eins auf lokale Modelle. Few-Shot ist das offensichtlichste Beispiel. Immer erst klären: erfunden, abgeschrieben oder im Code verloren?
2. **Few-Shot-Beispiele sind für kleine Modelle eine Falle — und Frontier-Assistenten wissen das nicht.** Claude Code schreibt dir Few-Shot-Beispiele, die für Claude sicher wären. Für Qwen sind sie Kopiervorlagen. Du musst es dem Assistenten explizit sagen.
3. **Wenn du mit Claude baust und auf Ollama deployest, rede mit Claude über Ollama.** Nicht: „Schreib einen Prompt." Sondern: „Schreib einen Prompt für ein 8B-Modell, das keine Vorlagen von Inhalten trennen kann. Platzhalter statt Beispiel-Werte. Warnzeile gegen Erfindungen."
4. **Stille Parser-Fehler sehen aus wie Modellfehler.** Wenn Daten verworfen werden, weil der Output eines Modells nicht ins erwartete JSON-Schema passt, wirkt das wie ein schlechtes Modell. Immer gegentesten.
5. **Dem schwachen Modell den Job verkleinern.** Alles, was deterministisch sein kann — Datumsarithmetik, Validierung, Scoring —, gehört in den Code. Das LLM ist nur für Semantik zuständig. Auch diese Architektur muss man Claude explizit vorgeben.
6. **Der Privacy-Zwang ist die Wurzel des Schmerzes — und der Grund, dass er sich lohnt.** Ich könnte das alles mit GPT-4 in einer Stunde lösen. Aber dann würden die Mails durch ein Rechenzentrum laufen. Das ist der Trade-Off. Und ich stehe auf der Seite der Einschränkung.

Der Phantom-Termin von Leipzig war kein Modellfehler. Es war ein Spiegel, in dem ich sehen konnte, was passiert, wenn man dem Werkzeug, mit dem man baut, nicht sagt, für welches Werkzeug man baut.

---

## 🔗 Verwandte Beiträge

- [[2026-05-14-lokale-modelle-ehrlich-gerechnet]]
- [[2026-05-02-eine-richtung-ist-kein-ziel]]
