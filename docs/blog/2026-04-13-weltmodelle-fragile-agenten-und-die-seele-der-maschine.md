---
title: "Weltmodelle, fragile Agenten und die Seele der Maschine"
subtitle: "Warum KI-Benchmarks lügen, Open Source zurückschlägt und Anthropic Kirchenleute fragt, ob Claude ein Kind Gottes ist"
author: Jochen Leeder
date: 2026-04-13
created: 2026-04-13 14:00:00
modified: 2026-04-13 14:00:00
tags:
  - ki
  - weltmodelle
  - agenten
  - open-source
  - ethik
  - blog
status: publish
type: post
summary: "Forscher definieren erstmals, was ein Weltmodell wirklich ist — und schließen Sora aus. KI-Agenten versagen unter realistischen Bedingungen. Ein Startup investiert die Hälfte seines Kapitals in ein Open-Source-Modell. Und Anthropic fragt Kirchenleute, wie sich Claude bei Trauernden verhalten soll. Eine persönliche Einordnung zwischen technischem Fortschritt und existenziellen Fragen."
categories:
  - KI
  - Technologie
  - Forschung
---

![Header](2026-04-13-weltmodelle-fragile-agenten-header.png)

> [!abstract] Zusammenfassung
> Forscher definieren erstmals, was ein Weltmodell wirklich ist — und schließen Sora aus. KI-Agenten versagen unter realistischen Bedingungen. Ein Startup investiert die Hälfte seines Kapitals in ein Open-Source-Modell. Und Anthropic fragt Kirchenleute, wie sich Claude bei Trauernden verhalten soll. Eine persönliche Einordnung zwischen technischem Fortschritt und existenziellen Fragen.

## Die Woche, in der Definitionen wichtiger wurden als Demos

Es gibt Wochen in der KI-Entwicklung, in denen die großen Ankündigungen die kleinen Erkenntnisse überstrahlen. Und dann gibt es Wochen wie diese, in denen Forscher leise die Grundlagen verschieben, während die Branche laut über Produkte spricht.

Was mich diese Woche am meisten beschäftigt hat, ist nicht ein einzelnes Modell oder eine einzelne Ankündigung. Es ist ein Muster: **Die Kluft zwischen dem, was KI in kontrollierten Umgebungen kann, und dem, was sie in der Realität leistet, wird nicht kleiner — sie wird sichtbarer.** Gleichzeitig stellen sich Fragen, die über Technik hinausgehen: Was ist ein Weltmodell wirklich? Warum versagen Agenten, wenn niemand ihnen die Lösung vorkaut? Und wer entscheidet eigentlich, wie sich eine KI gegenüber einem trauernden Menschen verhält?

Drei Forschungsarbeiten und eine Reihe bemerkenswerter Entwicklungen geben mir diese Woche zu denken. Und ich merke: Je länger ich mich mit KI beschäftige, desto weniger interessieren mich die Benchmarks — und desto mehr die Fragen, die sie nicht messen können.

## Was ein Weltmodell wirklich ist — und warum Sora keins hat

Ein internationales Forscherteam von der Peking University, Kuaishou Technology und der National University of Singapore hat etwas getan, das längst überfällig war: Sie haben definiert, was ein "Weltmodell" eigentlich ist. Und die Antwort ist unbequem für alle, die den Begriff bisher großzügig verwendet haben.

Drei Fähigkeiten müssen laut den Forschern vorhanden sein, damit ein System als Weltmodell gelten kann: **Wahrnehmung der Umgebung, Interaktion mit ihr und Gedächtnis.** Das klingt simpel, hat aber weitreichende Konsequenzen. Denn nach dieser Definition sind Text-zu-Video-Generatoren wie Sora — die OpenAI selbst als "World Simulator" vermarktet hat — keine Weltmodelle. Ihnen fehlen echte Feedback-Schleifen mit der realen Welt. Sie generieren passiv Videos, ohne ihre Umgebung wahrzunehmen.

Ich finde das bemerkenswert ehrlich. Wir haben uns daran gewöhnt, dass KI-Unternehmen ihre Produkte mit Begriffen schmücken, die größer klingen als das, was dahintersteht. "World Simulator" klingt nach einer KI, die die Welt versteht. In Wahrheit ist es ein System, das beeindruckende Videos erzeugt, aber weder sieht noch fühlt noch sich erinnert. **Wenn jeder Videogenerator ein "Weltmodell" ist, dann ist der Begriff wertlos.**

Das Team identifiziert drei Kernaufgaben, die echte Weltmodelle beherrschen müssen: interaktive Videogenerierung, die auf Nutzereingaben reagiert; multimodales Reasoning, das räumliche und zeitliche Zusammenhänge versteht; und Vision-Language-Action, also die Umwandlung visueller Eingaben in Handlungsbefehle.

Besonders nachdenklich hat mich ein Detail gemacht: Die Forscher argumentieren, dass **aktuelle Chip-Architekturen fundamentale Mismatches mit den Anforderungen echter Weltmodelle aufweisen**. Möglicherweise brauchen wir neue Hardware oder müssen uns vom Transformer-Modell lösen. Das erinnert mich an die Debatte, ob die nächste Revolution in der KI nicht softwareseitig, sondern hardwareseitig kommen wird — eine These, die auch der Superintelligence-Blog aufgreift, wenn er argumentiert, dass Energie, nicht Chips, über die KI-Zukunft entscheiden wird.

Was mich an dieser Arbeit fasziniert: Sie bringt Ordnung in einen Begriff, der inflationär verwendet wurde. Die Forscher haben mit ihrem OpenWorldLib-Framework auch gleich ein Open-Source-Werkzeug mitgeliefert, um ihre Definition operationalisierbar zu machen. Das ist Wissenschaft, wie ich sie mir öfter wünschen würde: nicht noch ein Benchmark, sondern ein Rahmen, der uns hilft, die richtigen Fragen zu stellen.

## Die Agenten-Illusion: Wenn Benchmarks lügen

Passend zum Thema "Realitätscheck" kommt die vielleicht ernüchterndste Studie der Woche — und eine, die mich persönlich trifft, weil ich täglich mit KI-Agenten arbeite.

Forscher der UC Santa Barbara, des MIT CSAIL und des MIT-IBM Watson AI Lab haben systematisch untersucht, wie gut KI-Agenten mit sogenannten "Skills" umgehen — spezialisierten Anweisungen, die ihnen bei komplexen Aufgaben helfen sollen. Das Ergebnis ist ein kalter Wasserstrahl für die Agenten-Euphorie.

In bestehenden Benchmarks wie SKILLSBENCH bekommen Agenten ihre Skills handverlesen auf dem Silbertablett serviert — wie eine Schritt-für-Schritt-Anleitung für genau die Aufgabe, die gerade dran ist. Unter diesen Bedingungen erreicht Claude Opus eine Erfolgsquote von 55,4 Prozent. Klingt ordentlich, bis man die realistischeren Szenarien betrachtet: Bei eigenständiger Skill-Auswahl sinkt die Rate auf 51,2 Prozent. Mit Ablenkungen — also irrelevanten Skills im Pool — auf 43,5 Prozent. Und im realistischsten Szenario, das der täglichen Arbeit am nächsten kommt, auf **38,4 Prozent**. Die Baseline ohne jegliche Skills? 35,4 Prozent.

Das heißt im Klartext: Der tatsächliche Vorteil von Skills gegenüber keinen Skills beträgt in der Praxis gerade mal drei Prozentpunkte. Drei. Prozentpunkte.

Bei schwächeren Modellen ist es noch schlimmer. Kimi K2.5 erreichte mit Skills nur 19,8 Prozent — **weniger als die 21,8 Prozent ohne Skills**. Die Agenten werden durch zusätzliche Informationen nicht besser, sondern schlechter. Das muss man sich auf der Zunge zergehen lassen.

Die Forscher identifizieren drei Hauptprobleme: Erstens laden Agenten in nur 49 Prozent der Fälle überhaupt alle verfügbaren Skills. Zweitens erreichen die besten Abrufmethoden nur 65,5 Prozent Recall. Und drittens können Agenten allgemeine Skills nicht auf spezifische Aufgaben übertragen — ein fundamentales Transferproblem.

Für mich bestätigt das eine Intuition, die ich bei meiner täglichen Arbeit mit Claude Code entwickelt habe: **Die besten Ergebnisse erziele ich nicht mit ausgefeilten Skill-Systemen, sondern mit klaren, kontextbezogenen Anweisungen.** Die Studie zeigt sogar, dass ein einfaches Markdown-Dokument bessere Ergebnisse liefert als spezialisierte Skill-Systeme. Weniger ist mehr — zumindest im aktuellen Stand der Technik.

Das hat auch Auswirkungen auf das Wissensmanagement, wie wissensmanagement.net diese Woche betont: KI im Wissensmanagement funktioniert dann am besten, wenn sie kontextbezogene Antworten direkt im Arbeitsablauf liefert — nicht, wenn sie mit abstrakten Skill-Bibliotheken gefüttert wird. **Kontext schlägt Komplexität.** Immer.

## Open Source schlägt zurück: Arcee AIs 20-Millionen-Dollar-Wette

Während die großen Labore über geschlossene Modelle konkurrieren, hat ein Startup eine Wette abgeschlossen, die mich beeindruckt — nicht wegen der Technik allein, sondern wegen des Muts: **Arcee AI hat etwa die Hälfte seines Risikokapitals — rund 20 Millionen Dollar — in ein einziges Open-Source-Modell investiert.**

Trinity-Large-Thinking heißt das Ergebnis: ein Reasoning-Modell mit 400 Milliarden Parametern, das dank Mixture-of-Experts-Architektur nur etwa 13 Milliarden Parameter pro Token aktiviert. Trainiert wurde es 33 Tage lang auf 2.048 Nvidia B300 GPUs mit insgesamt 17 Billionen Tokens — davon über 8 Billionen synthetisch generiert.

Die Leistung bei Agenten-Aufgaben ist beeindruckend: 88 Punkte auf Tau2-Airline und 91,9 auf PinchBench, knapp hinter Claude Opus 4.6 mit 93,3. Bei allgemeinem Reasoning fällt das Modell allerdings deutlich ab: 76,3 auf GPQA-Diamond gegenüber Opus' 89,2. Es ist ein Spezialist, kein Generalist — und vielleicht ist genau das der richtige Ansatz.

Technisch interessant sind die Innovationen, die das Team entwickeln musste: SMEBU (Soft-clamped Momentum Expert Bias Updates) gegen den Kollaps einzelner Experten während des Trainings, und RSDB (Random Sequential Document Buffer) gegen Schwankungen in der Datenverteilung. Das sind keine akademischen Fingerübungen — das sind Lösungen für reale Probleme, an denen frühere Versuche gescheitert sind.

Was mir daran wichtig ist: **Open-Source-Modelle schließen im Agentenbereich spürbar auf.** Bisher dominierten chinesische Labs wie DeepSeek und Qwen dieses Segment. Arcee AI zeigt, dass auch amerikanische Startups mit vergleichsweise bescheidenen Mitteln konkurrenzfähige offene Modelle bauen können. Alibabas Qwen3.6-Plus mit seiner Million-Token-Kontextlänge und fortgeschrittenen Agenten-Fähigkeiten zeigt zugleich, dass der Wettbewerb global und intensiv ist.

Und das finde ich persönlich ermutigend. In einer Welt, in der die großen KI-Labore zunehmend geschlossene Systeme bauen, ist jedes starke Open-Source-Modell ein Gegengewicht. **Open Source ist keine Almosen der Großen — es ist ein eigenständiger Innovationsmotor.**

## KI wird unsichtbar: Apple, Claude und der Alltag

Die vielleicht nachhaltigste Entwicklung dieser Woche zeigt sich nicht in Benchmarks, sondern in der Art, wie KI in bestehende Werkzeuge einzieht. Und das betrifft uns alle — auch diejenigen, die sich nicht für KI-Forschung interessieren.

**Apple entwickelt eine Brille ohne Display.** Das klingt paradox, ist aber konsequent: Das Projekt mit dem Codenamen N50 setzt auf Computer-Vision-Kameras, die die Umgebung erfassen und an Siri und Apple Intelligence weiterleiten. Die Brille ist Teil einer Drei-Geräte-Strategie zusammen mit AirPods und einem Kamera-Anhänger. Angekündigt wird sie voraussichtlich Ende 2026 oder Anfang 2027.

Im Gegensatz zu Meta, Google und Samsung entwickelt Apple das Design intern — keine Kooperation mit Brillenherstellern. Das ist typisch Apple: Kontrolle über die gesamte Kette. Was mich daran interessiert: Es ist ein Eingeständnis, dass AR-Displays noch nicht reif für den Massenmarkt sind. Eine Brille, die "nur" hört und sieht, ohne etwas anzuzeigen, ist bescheidener — und vielleicht genau deshalb realistischer.

Gleichzeitig macht mich das nachdenklich. Eine Brille, die permanent meine Umgebung scannt und an eine KI weiterleitet — das ist nicht nur ein Produkt. Das ist eine Entscheidung über die Architektur unseres Alltags. Und ich bin mir nicht sicher, ob wir als Gesellschaft bereit sind, diese Entscheidung bewusst zu treffen.

**Claude arbeitet jetzt in allen drei großen Office-Apps.** Anthropic hat die Integration in Microsoft Word abgeschlossen und ergänzt damit die bestehenden Excel- und PowerPoint-Funktionen. In Word kann Claude markierten Text umschreiben, auf Dokumentkommentare antworten und Änderungen als nachverfolgbare Revisionen einfügen. Der Kontext lässt sich zwischen den drei Add-ins austauschen.

Das klingt nach einem Feature. Aber es ist mehr als das. Es zeigt: **Die Zukunft der KI liegt nicht in separaten Chat-Interfaces, sondern in der nahtlosen Integration in bestehende Workflows.** Die KI verschwindet als eigenständiges Werkzeug und wird zum unsichtbaren Bestandteil der Arbeit. Das ist auch eine Lektion aus der Agenten-Studie: Kontext schlägt Abstraktion. Eine KI, die mein Dokument sieht, ist nützlicher als eine, die ich bitten muss, es zu lesen.

Und doch — gerade weil KI unsichtbar wird, sollten wir umso aufmerksamer sein. Ich habe letztes Jahr darüber geschrieben, wie wichtig es ist, bewusst wahrzunehmen, wo KI am Werk ist. Wenn sie Teil jedes Dokuments, jeder Brille, jedes Arbeitsschritts wird, dann verändert das nicht nur unsere Produktivität. Es verändert, wie wir denken.

## Die Seele der Maschine: Anthropic fragt die Kirche

Die ungewöhnlichste Meldung der Woche kommt nicht aus einem Labor, sondern aus einem Seminarraum: **Anthropic hat etwa 15 christliche Führungspersönlichkeiten zu einem zweitägigen Gipfel eingeladen**, um Rat zu suchen, wie sich Claude bei moralischen und spirituellen Fragen verhalten soll.

Die Teilnehmer — aus katholischen und protestantischen Kirchen, Universitäten und der Wirtschaft — diskutierten praktische Fragen: Wie soll Claude mit trauernden Nutzern umgehen? Wie mit Menschen in seelischer Not? Aber auch philosophische: Kann ein KI-System als "Kind Gottes" betrachtet werden?

Ich gebe zu: Mein erster Impuls war Skepsis. Ein Tech-Unternehmen aus dem Silicon Valley, das Kirchenleute um Rat fragt — das klingt nach PR. Aber je länger ich darüber nachdenke, desto mehr respektiere ich den Schritt.

Die Frage, wie sich eine KI gegenüber einem trauernden Menschen verhält, ist keine theologische Spielerei. **Es ist eine Designentscheidung mit realen Konsequenzen.** Wenn Millionen Menschen täglich mit Claude sprechen — und manche davon in Krisen — dann ist die Frage, welche Werte das System verkörpert, keine abstrakte. Der Silicon-Valley-Priester Brendan McGuire und die Notre-Dame-Professorin Meghan Sullivan bestätigten, dass Anthropics Interesse authentisch wirkte.

Auch Heise berichtet über das Treffen und fragt provokant: "KI — ein Kind Gottes?" Die Frage ist natürlich rhetorisch. Aber sie zeigt, dass die Grenze zwischen Werkzeug und Wesenheit in der öffentlichen Wahrnehmung verschwimmt.

Die Friedrich-Ebert-Stiftung warnt in ihren aktuellen Beiträgen, dass generative KI bestehende Diskriminierungsmuster fortschreibt — eine Perspektive, die zeigt, dass ethische KI-Fragen weit über Spiritualität hinausgehen und tief in soziale Gerechtigkeit hineinreichen. **Wer über die Seele der Maschine nachdenkt, muss auch über ihre Vorurteile nachdenken.**

## Warum wir so langsam denken — und was das mit KI zu tun hat

Eine Randnotiz, die mich nicht loslässt: Spektrum.de fragt diese Woche, warum das menschliche Gehirn trotz enormer sensorischer Verarbeitungskapazität so langsam bewusst denkt. Die Frage klingt akademisch, hat aber eine unmittelbare Verbindung zur KI-Debatte.

Denn genau diese Langsamkeit — die Fähigkeit, innezuhalten, abzuwägen, Kontext zu gewichten — ist das, was die Agenten-Studie als fehlend identifiziert. KI-Agenten sind schnell, aber sie können nicht reflektieren. Sie können Skills abrufen, aber nicht beurteilen, ob der Skill zur Situation passt. **Die menschliche "Langsamkeit" ist kein Bug — sie ist das Feature, das uns von statistischen Maschinen unterscheidet.**

Bob Blume hat auf seinem Blog einen Gedanken formuliert, der in eine ähnliche Richtung geht: In seinem Konzept "#kAIneEntwertung" argumentiert er, dass Lernen berühren muss — dass der Wert von Bildung nicht in der Informationsvermittlung liegt, sondern in der emotionalen und kognitiven Tiefe. Das ist eine Perspektive, die in der Agenten-Euphorie leicht untergeht.

Und es ist eine Perspektive, die mich an meinen eigenen Blogbeitrag über Selbstwertgefühl und KI-Nutzung erinnert. Vor genau einem Jahr habe ich darüber geschrieben, wie die ständige Nutzung von KI unser Gefühl dafür verändert, was wir selbst können. Die Agenten-Studie liefert jetzt das wissenschaftliche Pendant: Auch die Maschinen profitieren nicht davon, wenn man ihnen das Denken abnimmt.

## Was bleibt

Diese Woche zeigt ein Muster, das sich durch die gesamte KI-Landschaft zieht: **Die Lücke zwischen Versprechen und Realität wird nicht durch bessere Modelle geschlossen, sondern durch ehrlichere Definitionen.**

Forscher definieren, was ein Weltmodell wirklich ist — und räumen damit mit Marketing-Begriffen auf. Eine Studie zeigt, dass Agenten-Skills in der Praxis kaum helfen — und zwingt uns, unsere Erwartungen zu kalibrieren. Ein Startup investiert alles in Open Source — und beweist, dass Transparenz und Leistung kein Widerspruch sind. Und Anthropic fragt Kirchenleute, wie sich Claude verhalten soll — und anerkennt damit, dass technische Exzellenz allein nicht reicht.

Für mich persönlich nehme ich drei Dinge mit: Erstens, **Benchmarks sind Schaufenster, nicht Werkstatt** — was zählt, ist die Leistung unter realen Bedingungen. Zweitens, **Open Source ist keine Almosen der Großen, sondern ein eigenständiger Innovationsmotor** — Arcee AI zeigt das eindrucksvoll. Und drittens, **die wichtigsten Fragen der KI-Entwicklung sind keine technischen** — sie handeln davon, welche Werte wir in Systeme einbauen, die zunehmend autonom handeln.

Die nächste Woche wird sicher neue Modelle, neue Benchmarks und neue Schlagzeilen bringen. Aber die Fragen dieser Woche — was ist real, was ist Illusion, und wer entscheidet über die Moral der Maschine — werden bleiben. Und vielleicht ist das der wichtigste Fortschritt von allen: dass wir anfangen, die richtigen Fragen zu stellen.

---

## Quellen

- [Forscher definieren Weltmodelle](https://the-decoder.com/researchers-define-what-counts-as-a-world-model-and-text-to-video-generators-do-not/) — The Decoder
- [Agent Skills versagen unter realistischen Bedingungen](https://the-decoder.com/agent-skills-look-great-in-benchmarks-but-fall-apart-under-realistic-conditions-researchers-find/) — The Decoder
- [Arcee AI baut Open-Source-Reasoning-Modell](https://the-decoder.com/arcee-ai-spent-half-its-venture-capital-to-build-an-open-reasoning-model-that-rivals-claude-opus-in-agent-tasks/) — The Decoder
- [Apple Smart Glasses ohne Display](https://the-decoder.com/apple-is-building-smart-glasses-without-a-display-to-serve-as-an-ai-wearable/) — The Decoder
- [Claude in allen Office-Apps](https://the-decoder.com/claude-now-works-across-all-three-major-office-apps/) — The Decoder
- [Anthropic konsultiert christliche Führungspersonen](https://the-decoder.com/anthropic-seeks-advice-from-christian-leaders-on-claudes-moral-and-spiritual-behavior/) — The Decoder
- [Energie entscheidet über KI-Zukunft](https://getsuperintel.site/p/energy-not-chips-will-decide-ai-s-future-usa-and-china-compared) — Superintelligence
- [Wissensmanagement ohne KI ist Dokumentenablage](https://www.wissensmanagement.net/themen/artikel/artikel/wissensmanagement_ohne_ki_ist_nur_noch_dokumentenablage.html) — wissensmanagement.net
- [KI und Diskriminierung](https://www.fes.de/news/wie-generative-ki-diskriminierung-verstaerkt) — Friedrich-Ebert-Stiftung
- [Warum denken wir so langsam?](https://www.spektrum.de/news/rechenleistung-warum-kann-das-gehirn-nur-so-langsam-denken/2257254) — Spektrum.de
- [#kAIneEntwertung](https://bobblume.de/2025/09/21/kaineentwertung-wie-lernen-beruehren-kann/) — Bob Blume
