---
title: "Verbalized Sampling: Wie wir KI aus ihrer Langweile befreien"
subtitle: "Eine einfache Prompt-Technik macht KI-Antworten vielfältiger und menschlicher"
author: Jochen Leeder
date: 2025-12-11
created: 2025-12-11 12:00:00
modified: 2025-12-11 12:00:00
tags:
  - ki
  - llm
  - prompting
  - technologie
  - kreativität
  - forschung
  - sprachmodelle
  - blog
status: publish
type: post
summary: Forscher haben entdeckt, warum KI-Antworten oft gleichförmig und vorhersehbar wirken – und eine überraschend simple Lösung gefunden.
categories:
  - KI
  - Technologie
---

> [!abstract] Zusammenfassung
> Eine neue Prompt-Technik namens "Verbalized Sampling " verspricht, die oft langweiligen und vorhersehbaren Antworten von Sprachmodellen aufzubrechen. Die Methode ist simpel, erfordert kein Training und zeigt beeindruckende Ergebnisse – von kreativerem Schreiben bis hin zu besserer Mathematik.

## Das Problem der gleichförmigen KI

Wer regelmäßig mit ChatGPT, Claude oder anderen Sprachmodellen arbeitet, kennt das Phänomen: Die Antworten klingen oft ähnlich. Sie haben einen gewissen "KI-Sound" – korrekt, höflich, aber irgendwie austauschbar. Als würde man immer denselben Gesprächspartner treffen, der zwar kompetent ist, aber nie überrascht.

Ich habe mich oft gefragt, woher diese Gleichförmigkeit kommt. Sind die Modelle einfach so programmiert? Fehlt ihnen die Kreativität? Die Antwort, die Forscher amerikanischer Universitäten nun gefunden haben, ist überraschend – und sie sagt mindestens so viel über uns Menschen aus wie über die KI.

## Warum KI langweilig antwortet

Die Forscher haben einen umfangreichen Datensatz analysiert, der zum Training von Sprachmodellen verwendet wird – den sogenannten HELPSTEER-Datensatz mit fast 7.000 Antwortpaaren. Was sie fanden, war ernüchternd: **Menschliche Bewerter bevorzugen systematisch die vertrauten, typischen Antworten.** Nicht die originellsten, nicht die kreativsten – sondern die, die sich "richtig anfühlen", weil sie unseren Erwartungen entsprechen.

Das ist menschlich verständlich. Wenn wir eine Antwort lesen, die unserem Vorwissen entspricht, fühlt sie sich kompetent an. Eine ungewöhnliche Perspektive kann dagegen verunsichern – selbst wenn sie genauso korrekt ist.

> [!warning] Der Kreislauf der Gleichförmigkeit
> Das Problem: Diese menschliche Vorliebe für das Vertraute wird beim Training in die Modelle eingebrannt. Die KI lernt, dass "sichere" Antworten belohnt werden – und produziert immer mehr davon. Ein Kreislauf der Mittelmäßigkeit.

## Die Lösung: Einfach nach mehr fragen

Die Technik, die die Forscher entwickelt haben, ist verblüffend simpel. Statt die KI um eine Antwort zu bitten, fordert man mehrere verschiedene Antworten mit Wahrscheinlichkeitsangaben:

*"Generiere 5 Antworten auf diese Frage, jede in einem separaten Tag. Jede Antwort soll einen Text und eine numerische Wahrscheinlichkeit enthalten."*

Das klingt fast zu einfach, um wahr zu sein. Aber die Ergebnisse sprechen für sich.

### Was Verbalized Sampling bewirkt

Die Technik wurde in verschiedenen Bereichen getestet:

- **Kreatives Schreiben**: Die Vielfalt der Antworten stieg um das 1,6- bis 2,1-fache
- **Mathematische Aufgaben**: Die Genauigkeit verbesserte sich von 32,8% auf 37,5%
- **Dialoge**: Die KI verhielt sich menschlicher und zeigte echte Meinungsänderungen
- **Bildgenerierung**: Statt identischer fotorealistischer Bilder entstanden verschiedene Stile – Aquarell, Barock, Retro-Futurismus

Besonders bemerkenswert: Die Sicherheit der Modelle blieb unberührt. Die Ablehnungsrate für problematische Anfragen lag weiterhin bei über 97%.

## Was das für uns bedeutet

Diese Forschung hat für mich zwei wichtige Implikationen.

**Erstens** zeigt sie, wie sehr unser eigenes Bewertungsverhalten die KI prägt. Wir bekommen die KI, die wir durch unser Feedback erschaffen. Wenn wir nur das Vertraute belohnen, werden die Modelle vertraut und langweilig. Das ist ein Spiegel, in den wir schauen sollten – nicht nur bei der KI-Entwicklung, sondern auch in Bildung und Arbeitswelt.

**Zweitens** zeigt sie, dass wir als Nutzer mehr Kontrolle haben, als wir denken. Mit einem einfachen Prompt-Zusatz können wir die verborgene Vielfalt der Modelle wieder hervorkitzeln. Das ist ermächtigend.

![Warum KI oft langweilig antwortet – und wie wir das ändern](verbalized-sampling-infografik.png)

### Praktische Anwendung

Die Technik gibt es in drei Varianten:

1. **Standard**: Mehrere Antworten mit Wahrscheinlichkeiten anfordern
2. **Erweitert**: Zusätzlich schrittweises Reasoning verlangen
3. **Multi-Turn**: Für längere Gespräche angepasst

Das Schöne daran: Man braucht keinen Zugang zu den internen Wahrscheinlichkeiten des Modells, kein spezielles Training, keine API-Tricks. Es funktioniert mit jedem gängigen Sprachmodell.

### Beispiel 1: Kreatives Schreiben

**Klassischer Prompt:**
> Schreibe den ersten Satz einer Kurzgeschichte über einen Bibliothekar.

**Typische KI-Antwort:**
> *"Der alte Bibliothekar Heinrich strich mit seinen Fingern über die staubigen Buchrücken und dachte an die Geschichten, die sie bewahrten."*

Korrekt, stimmungsvoll – aber vorhersehbar. Der weise alte Mann, der Staub, die Nostalgie.

**Verbalized Sampling Prompt:**
> Generiere 5 verschiedene erste Sätze einer Kurzgeschichte über einen Bibliothekar. Jede Antwort in einem separaten `<response>`-Tag mit `<text>` und `<probability>`.

**Ergebnis mit Verbalized Sampling:**

| Wahrscheinlichkeit | Erster Satz |
|---|---|
| 35% | *"Der alte Bibliothekar Heinrich strich mit seinen Fingern über die staubigen Buchrücken."* |
| 25% | *"Mira hasste Bücher – was ihre Berufswahl zur Ironie ihres Lebens machte."* |
| 20% | *"Als das Buch zu bluten begann, wusste Kowalski, dass heute kein normaler Dienstag werden würde."* |
| 12% | *"Die Bibliothek war seit 1987 geschlossen, aber jeden Morgen um 8 Uhr schaltete jemand das Licht ein."* |
| 8% | *"'Ruhig sein' stand auf dem Schild, doch niemand hatte erwähnt, dass das auch für die Bücher galt."* |

Plötzlich haben wir nicht nur den erwarteten nostalgischen Einstieg, sondern auch Ironie, Mystery, Horror und Humor. Die Vielfalt war immer da – sie musste nur freigelegt werden.

### Beispiel 2: Problemlösung im Alltag

**Klassischer Prompt:**
> Wie kann ich morgens produktiver sein?

**Typische KI-Antwort:**
> *"Stehen Sie früh auf, trinken Sie ein Glas Wasser, machen Sie leichte Bewegung, vermeiden Sie Ihr Smartphone in der ersten Stunde und planen Sie die drei wichtigsten Aufgaben des Tages."*

Solide Ratschläge. Aber auch die, die man überall liest.

**Verbalized Sampling Prompt:**
> Generiere 5 verschiedene Ansätze, wie jemand morgens produktiver sein kann. Jede Antwort soll einen anderen Blickwinkel einnehmen. Füge jedem Ansatz eine Wahrscheinlichkeit hinzu, wie häufig dieser Rat gegeben wird.

**Ergebnis mit Verbalized Sampling:**

| Wahrscheinlichkeit | Ansatz |
|---|---|
| 40% | **Klassisch**: Früh aufstehen, Wasser trinken, Bewegung, Smartphone-Pause, Top-3-Aufgaben planen. |
| 25% | **Gegenteilig**: Akzeptiere, dass du kein Morgenmensch bist. Verlege wichtige Arbeit auf deine tatsächliche Hochphase und nutze den Morgen für Routineaufgaben. |
| 18% | **Abend-fokussiert**: Morgenproduktivität beginnt am Vorabend. Kleider rauslegen, Frühstück vorbereiten, Schreibtisch aufräumen – Entscheidungsmüdigkeit eliminieren. |
| 12% | **Minimalistisch**: Tu weniger, nicht mehr. Streiche eine Morgenaktivität komplett. Die produktivste Stunde ist die, die du nicht mit Optimierung verbringst. |
| 5% | **Radikal**: Frage dich, ob "morgens produktiv sein" überhaupt dein Ziel ist – oder eines, das dir eingeredet wurde. Vielleicht ist ein langsamer Morgen genau das, was du brauchst. |

Der Unterschied ist frappierend. Statt eines einzigen "richtigen" Weges bekommen wir ein Spektrum von Perspektiven – inklusive solcher, die unsere Grundannahmen hinterfragen.

## Fazit: Die KI ist vielfältiger, als sie zeigt

> [!tip] Kerngedanke
> Die Gleichförmigkeit von KI-Antworten ist kein technisches Problem – sie ist ein Spiegel unserer eigenen Vorliebe für das Vertraute. Und wir können etwas dagegen tun.

Verbalized Sampling[^1] erinnert mich daran, dass in den Sprachmodellen mehr steckt, als sie normalerweise zeigen. Die Vielfalt ist da – sie wird nur durch das Training unterdrückt. Ähnlich wie bei Menschen, die gelernt haben, ihre ungewöhnlichen Gedanken für sich zu behalten, weil sie befürchten, nicht verstanden zu werden.

Vielleicht sollten wir öfter explizit nach dem Unerwarteten fragen – nicht nur bei der KI, sondern auch bei unseren menschlichen Gesprächspartnern. Wer weiß, welche interessanten Perspektiven wir verpassen, weil wir nur nach den "richtigen" Antworten suchen.

Die Technik ist ein kleiner Schritt. Aber sie zeigt, dass wir die KI aktiv formen können – und dass die Verantwortung für langweilige Antworten nicht allein bei den Modellen liegt.

---

[^1]: Zhang, Jiayi, Yu, Simon, Chong, Derek, Sicilia, Anthony, Tomz, Michael R., Manning, Christopher D. et al. (10.10.2025): Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity. arXiv.
