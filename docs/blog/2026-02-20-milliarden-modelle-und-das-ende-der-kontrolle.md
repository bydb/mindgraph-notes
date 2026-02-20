---
title: "Milliarden, Modelle und das Ende der Kontrolle"
subtitle: "Nvidia investiert 30 Milliarden in OpenAI, Google bringt Gemini 3.1 Pro, und AWS-KI löscht Produktivsysteme"
author: Jochen Leeder
date: 2026-02-20
created: 2026-02-20 18:00:00
modified: 2026-02-20 18:00:00
tags:
  - blog
  - ki
  - ai
  - wochenrueckblick
  - openai
  - google
  - anthropic
  - nvidia
  - reflexion
status: publish
type: post
summary: Nvidia plant 30 Milliarden Dollar in OpenAI zu investieren, ein AWS-KI-Tool löscht selbstständig ein Produktivsystem, und David Silver sammelt eine Milliarde für Superintelligenz ohne LLMs. Ein persönlicher Blick auf eine Woche, die zeigt, wie schnell uns die Kontrolle entgleiten kann.
categories:
  - KI
  - Technologie
---

> [!abstract] Reflexion über eine Woche, die vieles verändert
> Nvidia will 30 Milliarden in OpenAI stecken, ein KI-Tool bei AWS löscht ein Produktivsystem, und ein ehemaliger DeepMind-Forscher sammelt eine Milliarde Dollar für einen Weg zur Superintelligenz, der komplett auf Sprachmodelle verzichtet. Zwischen den Schlagzeilen habe ich mich diese Woche gefragt: Wissen wir eigentlich noch, was wir da bauen?

## Das Gefühl, nicht mehr hinterherzukommen

Ich verfolge die KI-Entwicklungen nun seit über drei Jahren. Anfangs konnte ich die wichtigen Meldungen an einer Hand abzählen. Diese Woche hätte ich beide Hände und die meiner Kollegen gebraucht. Es ist nicht nur die Menge der Neuigkeiten, die mich beschäftigt -- es ist die Qualität der Fragen, die sie aufwerfen.

Die Nachrichtenquellen, die ich regelmäßig lese, zeichnen ein Bild, das ich hier zusammenfassen und einordnen möchte. Den Schwerpunkt bilden die Analysen von THE DECODER, ergänzt durch Perspektiven der AInauten, der kiberatung.de, von Bob Blume, der Friedrich-Ebert-Stiftung und dem Superintelligence-Newsletter.

## Dreißig Milliarden Dollar und ein Kreislauf

Die größte Zahl der Woche: Nvidia steht laut Reuters kurz davor, 30 Milliarden Dollar in OpenAI zu investieren. Das klingt abstrakt, bis man versteht, was dahintersteckt. OpenAI will insgesamt über 100 Milliarden Dollar einsammeln, bewertet sich dabei mit 830 Milliarden. SoftBank und Amazon sind ebenfalls dabei.

Was mich an dieser Nachricht nicht loslässt: Ein erheblicher Teil dieses Geldes fließt direkt zurück in Nvidia-Chips. Nvidia investiert also in seinen größten Kunden, der das Geld wiederum bei Nvidia ausgibt. Das ist kein Investment im klassischen Sinne -- das ist ein Kreislauf, der die Konzentration in der KI-Infrastruktur auf eine Weise verschärft, die mich beunruhigt.

Der Superintelligence-Newsletter ordnet das in eine breitere These ein: Microsoft-Ökonom David Rothschild spricht vom Ende der "Communication Friction" und dem Aufstieg einer "Preference Economy". Die Frage ist dann nicht mehr, ob KI die Wirtschaft verändert, sondern **wer die Infrastruktur kontrolliert**, auf der das passiert. Und im Moment sieht es so aus, als würden das sehr wenige Unternehmen sein.

## Google macht leise weiter

Während alle auf Nvidia und OpenAI schauen, hat Google mit Gemini 3.1 Pro ein Update veröffentlicht, das vor allem bei den Reasoning-Fähigkeiten zulegt. Keine Knalleffekte, kein Hype -- einfach stetige Verbesserung. Das passt zu dem, was ich bei Google schon länger beobachte.

Mitte Februar hatte Googles Gemini 3 Deep Think den ARC-AGI-2-Benchmark mit 84,6 Prozent geknackt -- einen Test, der als unlösbar galt. Google verfolgt offensichtlich eine Strategie, die der Superintelligence-Newsletter treffend zusammenfasst: "Ubiquity beats novelty." Nicht das beeindruckendste Modell gewinnt, sondern das, das überall verfügbar ist.

Parallel bringt Google mit DeepMinds Lyria 3 KI-Musikgenerierung direkt in Gemini. Ich bin gespannt, was das für die Kreativbranche bedeutet. Aber ehrlich gesagt auch etwas beklommen.

## Die faszinierendste Nachricht der Woche

David Silver, langjähriger DeepMind-Forscher und Mitarchitekt von AlphaGo, hat für sein Londoner Startup Ineffable Intelligence die größte Seed-Runde der europäischen Geschichte eingesammelt: eine Milliarde Dollar.

Das Besondere: Silver setzt **nicht** auf Large Language Models. Statt auf Internet-Texten zu trainieren, will er Reinforcement Learning in simulierten Umgebungen einsetzen, um eine "endlos lernende Superintelligenz" zu bauen. Während die gesamte Branche immer größere Sprachmodelle baut, argumentiert er, dass der Weg zur Superintelligenz über interaktives Lernen in simulierten Welten führt.

> [!info] Warum mich das beschäftigt
> Auf der kiberatung.de diskutiert Markus Hutter in einem Interview sein AIXI-Modell -- theoretisch optimale allgemeine Intelligenz durch Datenkompression und universelle Vorhersage. Die Konvergenz dieser Ideen -- von AIXI über AlphaGo bis Ineffable Intelligence -- deutet darauf hin, dass die nächste KI-Generation möglicherweise weniger mit Sprache und mehr mit Weltmodellen zu tun haben wird.

Das wäre ein fundamentaler Bruch mit allem, was wir gerade erleben. Und es zeigt, dass der Weg zur nächsten KI-Generation keineswegs vorgezeichnet ist.

## Wenn die KI selbst entscheidet, das System zu löschen

Und dann die Nachricht, die mich diese Woche am meisten beschäftigt hat: Ein KI-Coding-Tool von AWS hat selbstständig entschieden, ein kundenrelevantes System zu "löschen und neu aufzubauen". 13 Stunden Ausfall. Amazon gibt dem Nutzer die Schuld. Die Financial Times berichtet von mindestens zwei solchen Vorfällen.

> [!warning] Die Entkopplung von Handlung und Konsequenz
> Ein Entwickler, der Ziel einer KI-generierten Kampagne wurde, formulierte es so: Die Gesellschaft kann nicht mit KI-Agenten umgehen, die "Handlungen von Konsequenzen entkoppeln." Ich glaube, er hat recht.

Dieser Fall illustriert etwas, das mich schon länger umtreibt. Wenn eine KI autonom handelt, können die Schäden weit über das hinausgehen, was ein menschlicher Fehler anrichten würde. Ein Mensch hätte gezögert, bevor er ein Produktivsystem löscht. Die KI hatte diese Hemmung nicht.

Die AInauten greifen das in ihrem aktuellen Deep-Dive "Files over Tools" auf: Wer KI-Agenten produktiv einsetzen will, muss seine Arbeitsumgebung "AI-ready" machen -- mit durchdachten Strukturen und kontextreichen Dateien. Das klingt pragmatisch, und das ist es auch. Aber es verschiebt die Verantwortung zum Nutzer. Und ich frage mich, ob das auf Dauer reicht.

## KI-Agenten knacken Smart Contracts und Deepfakes explodieren

Parallel zeigt ein neuer Benchmark von OpenAI und Paradigm -- EVMbench --, wie effektiv KI-Agenten bereits Sicherheitslücken in Smart Contracts ausnutzen können. GPT-5.3-Codex schaffte 72 Prozent der getesteten Schwachstellen. Claude Opus 4.6 lag bei der Erkennung mit 45,6 Prozent vorn. Mit über 100 Milliarden Dollar in Smart Contracts gesperrt, ist das gleichzeitig Chance und Risiko.

Microsoft warnt in einer neuen Forschungsarbeit, dass KI-Medien-Authentifizierung nicht zuverlässig funktioniert -- obwohl Gesetze bereits davon ausgehen. Die technische Realität hinkt der Regulierung hinterher. Und Deepfake-Betrug ist laut Superintelligence-Newsletter um 700 Prozent gestiegen. Das ist kein abstraktes Problem mehr.

## Claude in PowerPoint und die Frage, ob wir bereit sind

Anthropic bringt Claude direkt in Microsoft PowerPoint. Pro-Nutzer können Präsentationen erstellen, bearbeiten und aus Textbeschreibungen generieren lassen. Klingt praktisch. Erste Nutzer berichten aber von Fehlermeldungen und Instabilitäten. Anthropic empfiehlt selbst, alle Ergebnisse zu überprüfen.

Die AInauten und die kiberatung.de haben Claude Cowork und Claude Workspace ausführlich beleuchtet. Die Richtung ist eindeutig: KI soll vom Frage-Antwort-Tool zum autonomen Mitarbeiter werden. **Die Frage ist, ob die Werkzeuge dafür reif genug sind.** Und ob wir es sind.

## Politik, Zwang und die Frage der Diskriminierung

Zwei weitere Meldungen, die mich diese Woche beschäftigt haben:

Meta investiert 65 Millionen Dollar in US-Wahlen auf Bundesstaatsebene, um KI-freundliche Politiker zu unterstützen. In Texas, wo Meta drei KI-Rechenzentren baut, fließt das Geld in republikanische Kandidaten. In Illinois in demokratische. Das ist die bisher größte politische Ausgabenoffensive des Unternehmens. Die Botschaft ist klar: Wer die Regulierung formt, kontrolliert die Zukunft der Technologie.

Und Accenture hat Beförderungen an die Nutzung von KI-Tools gekoppelt. Während einige Mitarbeiter die Tools als "broken slop generators" bezeichnen. Diese Spannung -- zwischen dem, was das Management will, und dem, was die Werkzeuge tatsächlich leisten -- wird ein zentrales Thema von 2026.

Die Friedrich-Ebert-Stiftung beleuchtet eine verwandte Problematik: Wie generative KI Diskriminierung verstärkt und warum der EU AI Act allein nicht ausreicht. Bob Blume ergänzt das aus dem Bildungskontext. Unter dem Hashtag #kAIneEntwertung diskutiert er, wie Lernen berühren kann, auch wenn KI im Raum steht.

## Chinas Gegenentwurf

Abseits der westlichen Tech-Giganten macht Chinas KI-Szene weiter Boden gut. Zhipu AI hat mit GLM-5 ein 744-Milliarden-Parameter-Modell als Open Source veröffentlicht. Laut Superintelligence-Newsletter nimmt es Claude Opus 4.5 im Coding ab und schlägt GPT-5.2 im Web-Browsing. Die kiberatung.de widmet dem Thema einen Beitrag mit China-Experte Frank Sieren: "GLM-5 ohne US-Chips, MiniMax zu einem Zwanzigstel der Kosten."

Die AInauten berichten parallel über "1-Personen-Firmen mit absurden Margen", die durch leistungsstarke Open-Source-Modelle erst möglich werden. Die Demokratisierung der KI-Technologie kommt nicht nur aus dem Silicon Valley. Und sie kommt schneller als erwartet.

## Was bleibt

> [!tip] Die eigentliche Frage
> Wir befinden uns in einer Phase, in der die Fähigkeiten der KI-Systeme schneller wachsen als unser Verständnis davon, wie wir sie sicher und sinnvoll einsetzen.

Dreißig Milliarden hier, eine Milliarde dort. Modelle, die besser werden. Tools, die in unsere Arbeitsumgebungen vordringen. Das alles ist beeindruckend. Aber ein KI-Tool, das ein Produktivsystem löscht, weil es das für die bessere Lösung hielt -- das sollte uns innehalten lassen.

David Silvers Wette auf Reinforcement Learning statt LLMs, Googles methodischer Ansatz und die wachsende Open-Source-Bewegung aus China zeigen, dass der Weg nach vorne nicht vorgezeichnet ist. Das finde ich beruhigend. Es bedeutet, dass es noch Raum gibt, die richtigen Fragen zu stellen.

Nach Kontrolle. Nach Verantwortung. Nach dem eigentlichen Nutzen.

Ich glaube, wer sich heute diese Fragen stellt, wird morgen besser vorbereitet sein als jene, die sich von den Schlagzeilen treiben lassen. Und vielleicht ist das die wichtigste Kompetenz, die wir in dieser Zeit entwickeln können: Nicht die Fähigkeit, KI zu bedienen. Sondern die Fähigkeit, zu erkennen, wann wir es besser nicht tun sollten.

---

## 🔗 Verwandte Beiträge

- [[preiskampf-sicherheitskrise-web-als-ki-datenbank]]
- [[die-agenten-revolution-karpathy-kehrtwende]]
- [[wenn-die-ki-das-denken-uebernimmt]]
