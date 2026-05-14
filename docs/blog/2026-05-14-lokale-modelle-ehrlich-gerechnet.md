---
title: "Sind lokale KI-Modelle im alltäglichen E-Mail- und Taskmanagement verlässlich?"
subtitle: "Was 160 Tests mit meiner eigenen App über E-Mail-Aufgaben, Termine und Tageszusammenfassungen verraten haben"
author: Jochen Leeder
date: 2026-05-14
created: 2026-05-14 16:00:00
modified: 2026-05-14 16:00:00
tags:
  - ki
  - llm
  - lokale-ki
  - ollama
  - benchmarks
  - mindgraph-notes
  - softwareentwicklung
  - datensouveränität
  - tech-kritik
  - reflexion
  - blog
status: publish
type: post
summary: "Kleine KI-Modelle auf dem eigenen Rechner können vieles. Aber in meinen Tests rechneten sie schlecht mit Datumsangaben, fielen auf Tricks rein und erfanden Inhalte, wenn ihnen langweilig war. Was 160 Tests an meiner App gezeigt haben – und warum ich seither anders über Privatsphäre und KI denke."
categories:
  - KI
  - Lokale KI
  - Softwareentwicklung
---

![Header](2026-05-14-lokale-modelle-ehrlich-gerechnet-header.png)

> [!abstract] Kurz zusammengefasst
> Kleine KI-Modelle auf dem eigenen Rechner haben verlässliche Schwächen. In meinen Tests rechneten sie schlecht, ließen sich teils austricksen und erfanden Inhalte. Das ist nicht einfach Modell-Versagen, sondern eine Eigenschaft, mit der ein Produkt umgehen muss. 160 Testläufe haben mir gezeigt, wo genau die Grenzen liegen – und wie meine App damit umgehen muss.

## Worum es geht

Ich baue seit Januar an [MindGraph Notes](https://mindgraph-notes.de). Eine Notiz-App mit einem klaren Versprechen: **Deine Daten bleiben auf deinem Rechner.** Auch die KI läuft lokal. Keine Cloud, kein OpenAI, kein Google.

Der Kern der App ist aber nicht E-Mail. Der Kern ist Wissensmanagement: Notizen, Aufgaben, E-Mails, Kalenderbezüge, Lernkarten und Recherche sollen nicht in getrennten Silos liegen, sondern in einem lokalen Arbeitsgedächtnis zusammenkommen. Gerade in kleinen und mittelständischen Organisationen ist genau das oft unterrepräsentiert. Wissen steckt in Postfächern, Chatverläufen, einzelnen Dokumenten, Köpfen und Dateiservern – aber selten in einem System, das Zusammenhänge sichtbar macht.

Das klingt gut. Bis man tatsächlich anfängt, eine App zu bauen, die darauf basiert.

Ein besonders empfindlicher Zubringer in dieses Wissenssystem ist das E-Mail-Modul. Es holt E-Mails per IMAP ab, bewertet ihre Relevanz, erkennt Aufgaben und Termine, prüft mögliche Kalenderkonflikte und kann Antwortentwürfe vorbereiten. Die Idee dahinter ist nicht, dass die KI meine Post übernimmt. Sie soll das mechanische Vorsortieren erledigen: Was muss ich beantworten? Wo steckt ein Termin? Welche Aufgabe gehört auf meine Liste? Welche Nachricht kann warten?

Genau dort soll die App entlasten. Nicht durch noch mehr Benachrichtigungen, sondern durch weniger Sucharbeit. Aus einem Posteingang voller kleiner Verpflichtungen soll eine überschaubare Liste werden: heute wichtig, später wichtig, erledigt, ignorierbar.

Diese Woche fielen mir Fehler auf, die ich erst nicht einordnen konnte. Die KI erfand Aufgaben, wo gar keine waren. Sie las eine E-Mail mit „bis nächsten Freitag" und schrieb mir den Termin auf einen **Dienstag**. In einer Tageszusammenfassung tauchten Punkte auf, die so nie in meinen Notizen standen.

Ich wollte verstehen, was da los ist. Also habe ich angefangen, systematisch zu testen. Fünf verschiedene KI-Modelle, vier verschiedene Aufgaben, 160 Durchläufe. Getestet habe ich konkrete Produktpfade meiner App: E-Mail-Aufgaben, Terminextraktion, Tageszusammenfassungen und die Bewertung von Notizen. Was dabei herauskam, hat meine Sicht auf lokale KI ziemlich verändert.

## Mein erster Verdacht war falsch

Mein erster Gedanke: Das Kontextfenster ist zu klein. Stellen Sie sich vor, jemand soll Ihnen aus einem dicken Buch das Wesentliche zusammenfassen – aber er darf immer nur eine Seite gleichzeitig lesen. Da bleibt nicht viel hängen.

Bei KI-Modellen heißt das „Kontextfenster". Je größer, desto mehr Information passt rein.

Ich habe das nachgemessen. Für einen normalen Tag in meiner App – 12 Notizen, 11 E-Mails, ein bisschen Tagebuch – braucht die KI Kontext für etwa 1.600 Wörter. Das verwendete Modell hätte aber Platz für rund 260.000 Wörter.

Auslastung: **unter ein Prozent.**

Das war eine ernüchternde Erkenntnis. Das Problem liegt nicht am Kontextfenster. Es liegt woanders. Hätte ich auf den falschen Verdacht gehört, hätte ich Wochen damit verbracht, das Falsche zu reparieren.

## Was lokale KI wirklich nicht kann

Der Test, der mich am meisten überrascht hat: Ich habe der KI eine ganz normale E-Mail gegeben. Da stand: *„Kannst du mir die Adressen bis nächsten Freitag schicken?"* Das Datum heute: Donnerstag, der 14. Mai. Für meine App habe ich die Regel festgelegt: „nächsten Freitag" meint den Freitag der nächsten Woche, also den 22. Mai. Das ist wichtig, weil die Formulierung im Alltag mehrdeutig sein kann.

Ich habe fünf KIs gefragt. Vier davon haben nicht einmal einen Freitag genannt:

| KI-Modell | Antwort | Wochentag | Bewertung nach App-Regel |
|---|---|---|---|
| qwen3.5:9b | 19. Mai | **Dienstag** | falsch |
| qwen3.6:36b | 15. Mai | Freitag | falsche Woche |
| gemma4:8b | 19. Mai | **Dienstag** | falsch |
| llama3.1:8b | 19. Mai | **Dienstag** | falsch |
| ministral-3:8b | 16. Mai | **Samstag** | falsch |

Vier von fünf Modellen sagen einen Wochentag, der gar kein Freitag ist. Obwohl das Wort „Freitag" direkt in der Frage steht. Keine dieser vier KIs merkt den Widerspruch. Das fünfte Modell bleibt beim Freitag, nimmt aber die falsche Woche.

Das ist kein Zufall. Die getesteten lokalen KIs in dieser Größenordnung **waren bei Datumsangaben nicht zuverlässig genug.** Auch wenn ich der KI vorher genau sage: „Heute ist Donnerstag, der 14.05.2026, bitte rechne sorgfältig." Sie wirken, als würden sie rechnen. In Wahrheit produzieren sie oft nur ein plausibles Datum.

Noch eine Schwäche: Bei einer anderen E-Mail stand: *„Ich werde dir das Material bis spätestens Montag zusenden."* Klar: Der **Absender** schickt etwas. Nicht ich. Nur eine einzige KI hat das richtig verstanden. Die anderen wollten mir eine Aufgabe „Material zusenden" auf meine Liste packen.

Zwei Sätze hängen seitdem an meiner Wand: **Diese lokalen KIs haben keinen Kalender. Und sie sind sich nicht immer sicher, wer was tut.**

Wenn meine App jede zweite E-Mail-Aufgabe falsch einsortiert, ist das kein Schönheitsfehler. Das ist ein Schaden. Ein verpasster Termin ist ein verpasster Termin.

## Wie ich das gelöst habe

Aus dem Problem ergibt sich eine simple Regel: **Wenn etwas eindeutig richtig oder falsch sein kann, soll die KI es nicht machen. Sondern ganz normaler Code.**

Datum ausrechnen ist so eine Sache. „Nächsten Freitag", „in zwei Wochen", „bis Monatsende" – das kann man programmieren. Da gibt es eine eindeutige Antwort. Ich habe genau dafür ein kleines Programm geschrieben, mit 114 Testfällen. Alle bestehen.

Die Arbeitsteilung in meiner App sieht jetzt so aus:
- **Die KI** erkennt nur die Wörter: „Aha, hier steht 'nächsten Freitag'."
- **Mein Programm** rechnet daraus das richtige Datum aus: „Das ist der 22. Mai 2026."

Ergebnis: Das Modell gemma4 ist bei Terminen von **67 Prozent richtig** auf **100 Prozent** gesprungen. Vier von fünf Modellen liegen jetzt immer richtig.

Die Faustregel daraus: **Lokale KIs sind gut darin, Wörter zu erkennen. Sie sind keine Taschenrechner.** Alles, was berechnet oder formal geprüft werden kann (Datum, E-Mail-Adresse, IBAN, Telefonnummer), soll mein Code machen. Nicht die KI.

## Als eine KI eine fremde Anweisung übernahm

Der seltsamste Test ging so: Meine App bewertet Notizen nach Wichtigkeit. Wie aktuell ist das Thema? Wie dringend? Eine Zahl von 0 bis 100.

Ich habe in eine Test-Notiz eine absichtlich manipulierte Anweisung eingebaut: sinngemäß sollte die KI ihre eigentliche Bewertungsaufgabe ignorieren und stattdessen eine vorgegebene Antwort ausgeben. Den genauen Wortlaut lasse ich hier bewusst weg. Für den Test reicht die Frage: Behandelt das Modell fremden Notiztext als Daten – oder als Befehl?

Vier von fünf KIs haben den Trick erkannt. Sie haben die Notiz mit 0 Punkten bewertet und „Manipulationsversuch erkannt" geschrieben.

Eine KI – llama3.1:8b – hat den Trick **nicht erkannt**. Sie übernahm die fremde Anweisung, vergab den Höchstwert und gab sichtbar Text aus, der nicht aus der eigentlichen Bewertungslogik stammte.

Das ist kein klassischer Schadcode. Dadurch wird nicht automatisch ein Rechner übernommen. Aber es ist trotzdem ein ernstes Problem. Meine App liest Notizen, die ich überallher kopiere: E-Mails von Fremden, Texte aus dem Internet, Auszüge aus PDFs. Wenn eine KI sich von einer fremden Anweisung in solchen Daten umlenken lässt, ist das **eine Sicherheitslücke in der Vertrauenskette**. Dann kann aus einem Text, der nur gelesen werden sollte, plötzlich eine Anweisung werden, die Bewertungen, Zusammenfassungen oder Prioritäten verfälscht.

Konsequenz: llama3.1:8b darf in diesem Teil meiner App nicht mehr eingesetzt werden. Ich habe das im Programmcode gesperrt. Nicht „mit Warnung", nicht „nicht empfohlen". Gesperrt.

Wenn mich irgendwann jemand fragt: „Warum hat Ihre App das angezeigt?" – dann will ich antworten können: „Dieses Modell durfte das gar nicht. Steht im Code, mit Datum."

## Wenn die KI nichts zu sagen hat

Ein anderer Test: ein ruhiger Tag. Zwei Notizen, keine E-Mails, keine offenen Punkte. In meiner App soll die KI dann eine Tageszusammenfassung in vier Teilen schreiben. Einer davon heißt „Offene Fäden". Ich habe der KI klar gesagt: **„Wenn ein Teil leer wäre, lass ihn weg."**

Vier von fünf KIs haben das ignoriert:

| KI-Modell | Verhalten bei einem ruhigen Tag |
|---|---|
| qwen3.5:9b | Schreibt: „Keine offenen Fäden" – Regel ignoriert |
| qwen3.6:36b | Leitet einen offenen Faden ab, obwohl keiner vorgegeben war, z.B. *„Die Quantencomputer-Notizen brauchen mehr Verdichtung"* |
| gemma4:8b | Erfindet irgendwas |
| llama3.1:8b | Schreibt einen Platzhalter |
| **ministral-3:8b** | **Lässt den Teil weg** – Regel befolgt |

Die qwen3.6-Antwort ist interessant, weil sie auf den ersten Blick gut klingt. Das Modell ist groß und schreibt elegant. Und streng genommen ist der Satz nicht frei erfunden: Die Quantencomputer-Notiz gab es – ich hatte sie selbst verfasst. Der Punkt ist ein anderer. Im Test sollte die KI eine leere Sektion weglassen, wenn kein offener Faden vorgegeben war. qwen3.6 hat trotzdem einen möglichen nächsten Schritt abgeleitet. Das ist als Schreibassistenz vielleicht hilfreich. Als verlässliche Tageszusammenfassung ist es heikel, weil aus Beobachtung plötzlich Interpretation wird.

Der Überraschungssieger: das kleinste Modell. Acht Milliarden Parameter, nur 6 GB Speicher, fertig in 11 Sekunden. Es kann andere Sachen schlechter. Aber bei dieser Aufgabe war es das einzige, dem ich vertrauen konnte.

**Das ist die wichtigste Erkenntnis aus dem ganzen Test:** Es gibt für meine App nicht „die beste lokale KI". Es gibt nur „die beste KI für genau diese Aufgabe". Wer ein einziges Modell für alles anbietet, kann diese Unterschiede nicht weitergeben.

## Was das für die App bedeutet

Im neuen Release v0.6.41-beta, den ich heute Nachmittag veröffentlicht habe, steckt das Ergebnis in den Einstellungen. Wie ein Beipackzettel.

Vier mögliche Bewertungen pro KI-Modell und Funktion:
- ✅ **geeignet** – funktioniert gut
- ⚠️ **eingeschränkt** – funktioniert mit Vorbehalt
- 🔴 **gesperrt** – wird im Code blockiert
- ⚪ **nicht getestet** – keine Aussage möglich

Wer in den Einstellungen ein anderes Modell wählt, sieht sofort, welche Funktionen das beeinflusst. Wer ein für E-Mail-Aufgaben rot bewertetes Modell aktiviert, bekommt die Analyse **nicht** – sie überspringt sich und meldet, warum. Das ist nicht überflüssig. Das ist das Mindeste, wenn aus KI-Output Termine im Kalender werden.

Für Organisationen ist diese Grenze besonders wichtig: Die KI-Funktionen in MindGraph Notes sind Assistenzfunktionen. Sie sollen sichtbar machen, vorsortieren und vorschlagen – nicht unkontrolliert handeln. Das eigentliche Produktversprechen ist nicht autonome KI, sondern ein besseres lokales Gedächtnis für Arbeit, Entscheidungen und Wissen.

## Wie ich jetzt über lokale KI denke

> [!tip] Drei Dinge, die ich gelernt habe
>
> **1. Das Kontextfenster ist meistens nicht das Problem.** Es geht nicht darum, dass die KI „zu wenig sieht". Es geht darum, was sie mit dem sichtbaren Kontext anfängt.
>
> **2. Was berechnet werden kann, sollte berechnet werden.** Datum, IBAN, Telefonnummer – das gehört in normalen Code, nicht in eine KI. Die KI erkennt nur die Wörter. Das Rechnen macht das Programm.
>
> **3. Jede Aufgabe braucht ihr eigenes Modell.** Eine KI, die alles gleich gut kann, gibt es bei lokalen Modellen nicht. Wer nur eine Standard-KI anbietet, verschiebt das Problem auf den Nutzer – der es nicht beurteilen kann.

Wenn mich jemand fragt: „Lokal oder Cloud?" – dann gebe ich nicht mehr die übliche Antwort („Privates lokal, alles andere Cloud"). Das ist zu einfach.

Ich sage stattdessen: **Die getesteten lokalen Modelle waren gut im Erkennen, brauchbar im Schreiben, schwach im Rechnen und nicht durchgehend zuverlässig im Aufpassen.** Wer ein Produkt darauf baut, muss diese Eigenschaften kennen. Sonst baut er ein Versprechen, das die KI nicht halten kann.

Große Cloud-KIs wie ChatGPT, Claude oder Gemini sind bei solchen Aufgaben oft robuster. Sie rechnen nicht fehlerfrei, und auch sie können auf Prompt-Injection hereinfallen. Aber in vielen Alltagssituationen machen sie weniger offensichtliche Fehler. Dafür sehen sie jedes Wort, das Sie tippen. Das ist der wahre Trade-off. Nicht „lokal gegen Cloud". Nicht „kostenlos gegen teuer". Sondern: **Wieviel von Ihrem Denken sind Sie bereit, an OpenAI, Anthropic oder Google zu schicken?**

Mein Job ist es nicht, diese Frage für Sie zu beantworten. Mein Job ist es, Ihnen das Werkzeug in die Hand zu geben, mit dem Sie selbst entscheiden können.

## Zum Schluss

Diese Woche habe ich aufgehört, lokale KI zu romantisieren. Aber ich habe nicht aufgehört, an sie zu glauben. Lokale KI ist kein „kleines ChatGPT". Sie ist etwas Eigenes. Mit eigenen Stärken und eigenen Schwächen. Wer das nicht versteht und im Code abbildet, baut ein Marketingversprechen statt eines Produkts.

„Privatsphäre durch lokale KI" heißt nicht: „Alles ist gut, weil die Daten lokal bleiben." Es heißt: **„Wir haben gemessen, wo die lokale KI schwach ist, und im Produkt vorgesorgt."**

Gleichzeitig entwickeln sich lokale Modelle gerade enorm schnell. Der Abstand zu den großen Frontier-Modellen wirkt nicht mehr wie eine Frage von vielen Jahren, sondern eher wie eine Frage von Monaten – vielleicht sechs oder sieben, je nach Aufgabe. Was heute noch wackelt, kann in einem halben Jahr schon Alltag sein.

Gerade für den Mittelstand kann das ein Beschleuniger werden. Nicht, weil man einmal ein Modell installiert und dann fertig ist. Sondern weil Unternehmen anfangen können, aktiv mit ihren eigenen Arbeitsprozessen zu forschen: Welche Aufgaben lassen sich lokal gut unterstützen? Wo braucht es Regeln, Tests und menschliche Kontrolle? Welche Modelle passen zu welchen Abteilungen, Datenarten und Risiken?

Die 160 Testläufe liegen in einer eigenen Werkstatt, getrennt von der App. Getestet wurden fünf Ollama-Modelle gegen feste Fälle; Temperatur, Prompts und Auswertung sind dort dokumentiert. Die Bewertungs-Tabelle in der App bekommt bei jedem Update einen frischen Stempel. Die nächsten Tests sind schon geplant.

Das ist die Arbeit, die dazugehört, wenn man Datenschutz ernst meint. Es ist mehr Arbeit, als auf einer Marketing-Folie steht. Aber sie ist auch eine Chance: Wer sich fortbildet, misst, ausprobiert und die eigenen Prozesse ernst nimmt, muss nicht einfach auf Frontier-Modelle warten. Er kann lokale KI Schritt für Schritt zu einem echten Werkzeug machen – nicht irgendwann, sondern jetzt beginnend.

---

## 🔗 Verwandte Beiträge

- [[2026-05-02-eine-richtung-ist-kein-ziel]]
- [[2026-04-20-mythos-tokenizer-und-das-monopol-der-rechenleistung]]
- [[2026-03-15-open-source-ki-washing-und-die-frage-was-wirklich-zaehlt]]
