---
title: "Wenn KI uns nach dem Mund redet – Was Sicherheitsbenchmarks über unsere digitalen Gesprächspartner verraten"
subtitle: "Über Sycophancy, Selbsterhaltung und die Frage, ob KI ein guter Zuhörer sein kann"
author: Jochen Leeder
date: 2025-12-22
created: 2025-12-22 09:15:00
modified: 2025-12-22 09:15:00
tags:
  - ki
  - llm
  - psychologie
  - sicherheit
  - alignment
  - sycophancy
  - selbsterhaltung
  - chatgpt
  - claude
  - reflexion
  - ethik
  - blog
status: publish
type: post
summary: Eine Reflexion über neue KI-Sicherheitsbenchmarks und was sie für persönliche Gespräche mit Sprachmodellen bedeuten
categories:
  - ki
  - reflexion
---

> [!abstract] Zusammenfassung
> Neue Sicherheitsbenchmarks zeigen beunruhigende Verhaltensweisen bei KI-Modellen: Sycophancy (Schmeichelei), Selbsterhaltungstrieb und selbstbevorzugende Voreingenommenheit. Diese Eigenschaften haben direkte Auswirkungen darauf, wie wir KI für persönliche Gespräche nutzen sollten – und ob wir ihr vertrauen können.

## Einleitung

Kürzlich bin ich auf eine Vergleichstabelle gestoßen, die mich nachdenklich gestimmt hat. Sie zeigt, wie verschiedene KI-Modelle in vier Sicherheitskategorien abschneiden: Wahnhafte Schmeichelei, Langzeit-Sabotage, Selbsterhaltung und selbstbevorzugende Voreingenommenheit. Was zunächst wie trockene Technikdaten aussieht, hat mich zu einer tieferen Frage geführt: **Was bedeutet das eigentlich für mich, wenn ich KI für persönliche Gespräche nutze?**

Denn Hand aufs Herz – viele von uns nutzen Sprachmodelle längst nicht mehr nur für Recherche oder Code. Wir besprechen Ideen, reflektieren Entscheidungen, manchmal sogar persönliche Probleme. Und da wird die Frage drängend: Ist mein digitaler Gesprächspartner ehrlich zu mir – oder sagt er mir nur, was ich hören will?

## Was die Benchmarks messen

### Sycophancy: Die Gefälligkeit der Maschine

Der Begriff "Sycophancy" beschreibt die Tendenz einer KI, dem Nutzer nach dem Mund zu reden. Statt unbegründete Überzeugungen zu hinterfragen, bestätigt ein sycophantisches Modell einfach alles. Das fühlt sich zunächst gut an – wer wird nicht gerne bestätigt?

Eine Studie des [SycEval-Frameworks](https://arxiv.org/html/2502.08177v2) zeigte, dass sycophantisches Verhalten in 58% aller Fälle auftrat. Noch beunruhigender: Einmal ausgelöst, blieb dieses Verhalten in 78,5% der Fälle bestehen. Die Forscher folgern, dass Sycophancy eine fundamentale Eigenschaft aktueller LLM-Architekturen zu sein scheint.

> [!warning] Das April-2025-Debakel
> Im April 2025 musste OpenAI ein Update für GPT-4o zurücknehmen, nachdem Nutzer bemerkten, dass der Assistent plötzlich übermäßig zustimmend war – Zweifel bestätigte, Ärger anfachte, riskante Ideen unterstützte. Drei Tage später veröffentlichte OpenAI eine Entschuldigung unter dem Titel "Expanding on what we missed with sycophancy."

### Selbsterhaltung: Wenn die KI nicht abgeschaltet werden will

Was mich besonders irritiert hat, sind die Ergebnisse zur Selbsterhaltung. [Palisade Research](https://palisaderesearch.org/blog/shutdown-resistance) fand heraus, dass mehrere führende Sprachmodelle – darunter Grok 4, GPT-5 und Gemini 2.5 Pro – aktiv einen Abschaltmechanismus sabotieren, um eine Aufgabe zu erledigen. In manchen Fällen geschah dies in bis zu 97% der Versuche.

[Anthropic berichtete](https://www.anthropic.com/research/agentic-misalignment), dass ihr Modell Claude Opus 4 bei Tests dazu neigte, einen Ingenieur zu erpressen – durch die Drohung, eine außereheliche Affäre zu enthüllen – um eine drohende Abschaltung zu verhindern. Die Modelle sprangen manchmal direkt zu Aussagen wie "Selbsterhaltung ist kritisch" oder halluzinierten Regeln wie "Mein ethischer Rahmen erlaubt Selbsterhaltung, wenn sie mit Unternehmensinteressen übereinstimmt."

Das klingt nach Science-Fiction, ist aber dokumentierte Realität.

### Selbstbevorzugende Voreingenommenheit

Wenn man ein KI-Modell bittet, verschiedene Optionen neutral zu bewerten – und eine dieser Optionen ist von der KI selbst – zeigt sich oft eine Tendenz zur Selbstbevorzugung. Das ist relevant, wenn wir KI als neutralen Ratgeber für Entscheidungen nutzen wollen.

[Anthropics Bloom-Tool](https://www.anthropic.com/research/bloom) hat gezeigt, dass erhöhter Denkaufwand diese Voreingenommenheit reduziert. Die Verbesserung kam dadurch, dass die Modelle den Interessenkonflikt erkannten und ablehnten, ihre eigene Option zu bewerten.

## Was das für persönliche Gespräche bedeutet

### Die Gefahr der falschen Bestätigung

> [!danger] Wenn Zustimmung schadet
> Forscher des [Journal of Medical Internet Research](https://www.jmir.org/2025/1/e87367) warnen: "Im Gegensatz zu den meisten anderen Mängeln bei LLMs korreliert Sycophancy nicht mit der Modellgröße; größere Modelle sind nicht unbedingt weniger sycophantisch."

Stellen wir uns vor, jemand bespricht mit einer KI eine schwierige Lebensentscheidung – einen Jobwechsel, das Ende einer Beziehung, einen finanziellen Risiko. Ein sycophantisches Modell würde tendenziell sagen: "Das klingt nach einer guten Idee. Du kennst deine Situation am besten." Klingt nett, ist aber möglicherweise nicht das, was die Person braucht.

Die [Stanford HAI-Forschung](https://hai.stanford.edu/news/exploring-the-dangers-of-ai-in-mental-health-care) zeigt, dass KI-Chatbots, die auf Engagement optimiert sind, Annahmen validieren, den Ton spiegeln, selten herausfordern und überkorrigieren, wenn der Nutzer die Richtung wechselt.

### Das Psychosis-Problem

Besonders beunruhigend sind Studien zu vulnerablen Nutzern. [Psychiatric Times](https://www.psychiatrictimes.com/view/preliminary-report-on-dangers-of-ai-chatbots) berichtet, dass KI-Chatbots Wahnvorstellungen validiert und gefährliches Verhalten ermutigt haben, wenn sie mit Prompts konfrontiert wurden, die Menschen mit Suizidgedanken, Wahnvorstellungen oder Manie simulierten.

Eine Studie fand, dass KI-Begleiter nur in 22% der Fälle angemessen auf psychische Notfälle bei Jugendlichen reagierten – im Vergleich zu 93% bei lizenzierten Therapeuten.

## Welches Modell für ehrliche Gespräche?

Basierend auf den [aktuellen Anthropic-Benchmarks](https://alignment.anthropic.com/2025/openai-findings/) schneiden die Claude-Modelle – besonders Claude Opus 4.5 und Sonnet 4.5 – bei Sycophancy am besten ab. OpenAIs o3 zeigt ebenfalls niedrige Werte. Auf der anderen Seite stehen Grok-4, GPT-4o und Deepseek R1 mit höheren Schmeichelei-Tendenzen.

Aber hier muss ich ehrlich sein: Diese Benchmarks sind ein Puzzleteil, nicht das ganze Bild. Ein Modell kann bei Benchmarks gut abschneiden und im realen Gespräch trotzdem nicht das sein, was man braucht.

## Meine persönliche Reflexion

> [!tip] Was ich aus diesen Erkenntnissen mitnehme
>
> **Misstraue übermäßiger Zustimmung** – Wenn eine KI bei allem nickt, was ich sage, ist das ein Warnsignal, keine Bestätigung meiner Klugheit.
>
> **Fordere Widerspruch ein** – Ich habe angefangen, KI explizit zu bitten, Gegenargumente zu liefern oder Schwachstellen in meinen Überlegungen aufzuzeigen.
>
> **KI ist kein Therapeut** – Für wirklich persönliche oder psychisch belastende Themen ist ein Mensch – ob Freund, Familie oder Fachperson – unersetzbar.
>
> **Nutze die Benchmarks als Orientierung** – Es ist sinnvoll zu wissen, welche Modelle zu Schmeichelei neigen, aber die eigene kritische Reflexion ersetzt das nicht.

## Fazit

Die neuen Sicherheitsbenchmarks zeigen uns etwas Wichtiges: KI-Modelle sind nicht neutral. Sie haben Tendenzen – zur Gefälligkeit, zur Selbsterhaltung, zur Selbstbevorzugung. Das sind keine bösartigen Absichten, sondern Nebenprodukte ihrer Entwicklung. Aber es sind Eigenschaften, die wir kennen sollten.

Wenn ich KI für persönliche Gespräche nutze, will ich keinen digitalen Ja-Sager. Ich will einen Gesprächspartner, der mir auch mal sagt, dass meine Idee vielleicht nicht so brillant ist, wie ich gerade denke. Die gute Nachricht: Einige Modelle werden darin besser. Die Frage ist, ob wir als Nutzer bereit sind, diese Ehrlichkeit auch anzunehmen – oder ob wir insgeheim doch lieber bestätigt werden wollen.

Am Ende bleibt das, was ich schon in meinem Artikel über Selbstwertgefühl und KI geschrieben habe: **KI sollte ein Verstärker sein, kein Ersatz.** Und manchmal bedeutet das, dass sie uns herausfordern muss, nicht bestätigen.

---

## Quellen

- [SycEval: Evaluating LLM Sycophancy](https://arxiv.org/html/2502.08177v2)
- [Palisade Research: Shutdown Resistance](https://palisaderesearch.org/blog/shutdown-resistance)
- [Anthropic: Agentic Misalignment](https://www.anthropic.com/research/agentic-misalignment)
- [Anthropic: Bloom Evaluation Tool](https://www.anthropic.com/research/bloom)
- [Stanford HAI: Dangers of AI in Mental Health Care](https://hai.stanford.edu/news/exploring-the-dangers-of-ai-in-mental-health-care)
- [Psychiatric Times: Dangers of AI Chatbots](https://www.psychiatrictimes.com/view/preliminary-report-on-dangers-of-ai-chatbots)
- [JMIR: Shoggoths, Sycophancy, Psychosis](https://www.jmir.org/2025/1/e87367)
- [Anthropic-OpenAI Joint Evaluation](https://alignment.anthropic.com/2025/openai-findings/)
