---
title: "Mythos, Tokenizer und das Monopol der Rechenleistung"
subtitle: "Wie Benchmark-Siege, Shrinkflation-Vorwürfe und Infrastruktur-Konzentration die KI-Landschaft im April 2026 neu ordnen"
author: Jochen Leeder
date: 2026-04-20
created: 2026-04-20 09:00:00
modified: 2026-04-20 09:00:00
tags:
  - ki
  - llm
  - anthropic
  - openai
  - infrastruktur
  - sicherheit
  - blog
status: publish
type: post
summary: "Claude Opus 4.7 schlägt GPT-5.4 in Benchmarks, doch Entwickler sprechen von einem entschuldigenden Upgrade. Anthropics Mythos-Modell ist so mächtig, dass die NSA Verhandlungen trotz Blacklist aufnimmt. Ein neuer Tokenizer erhöht die API-Kosten heimlich um 35 Prozent. Und fünf Firmen kontrollieren inzwischen 71 Prozent der globalen KI-Rechenleistung. Was diese Woche über die Machtverhältnisse in der KI-Welt verrät."
categories:
  - KI
  - Technologie
  - Analyse
---

![Header](2026-04-20-mythos-tokenizer-header.png)

> [!abstract] Zusammenfassung
> Claude Opus 4.7 schlägt GPT-5.4 in Benchmarks, doch Entwickler sprechen von einem entschuldigenden Upgrade. Anthropics Mythos-Modell ist so mächtig, dass die NSA Verhandlungen trotz Blacklist aufnimmt. Ein neuer Tokenizer erhöht die API-Kosten heimlich um 35 Prozent. Und fünf Firmen kontrollieren inzwischen 71 Prozent der globalen KI-Rechenleistung. Was diese Woche über die Machtverhältnisse in der KI-Welt verrät.

## Die Woche der leisen Verschiebungen

Es gibt Wochen in der KI-Entwicklung, in denen ein neues Modell angekündigt wird und die Industrie jubelt. Und es gibt Wochen, in denen ein neues Modell angekündigt wird und die Industrie stockt. Diese Woche gehört zur zweiten Sorte.

Anthropic hat Claude Opus 4.7 veröffentlicht. Auf dem Papier ein Triumph: SWE-bench Pro mit 64,3 Prozent, deutlich vor GPT-5.4 mit 57,7 Prozent und Gemini 3.1 Pro mit 54,2 Prozent. Die Vision-Auflösung mehr als verdreifacht, agentische Workflows um 14 Prozent verbessert. Alles Zahlen, die in einem normalen Jahr Schlagzeilen gemacht hätten.

Aber 2026 ist kein normales Jahr. Und Power-User reagieren auf den Launch nicht mit Begeisterung, sondern mit einem misstrauischen Blick. Der AI-Newsletter *Superintelligence* bringt die Stimmung mit einem Titel auf den Punkt, der viel über den Moment sagt: **"Opus 4.7: Upgrade oder Entschuldigung?"**

Was mich an dieser Woche beschäftigt, sind nicht die Benchmarks selbst. Es sind die vier Geschichten, die sich gleichzeitig entfalten und zusammen ein Bild zeichnen, das unbequemer ist als jede einzelne Nachricht: ein Vertrauensverlust zwischen Entwicklern und Anbietern, ein Modell, das zu mächtig für die Öffentlichkeit ist, eine heimliche Preiserhöhung und eine Rechenkonzentration, die niemand mehr leugnen kann.

## Opus 4.7 und die Shrinkflation-Vorwürfe

Fangen wir mit den Fakten an. Claude Opus 4.7 wurde am 16. April 2026 veröffentlicht. Verfügbar über die Claude API, Amazon Bedrock, Google Cloud Vertex AI und Microsoft Foundry. Preise unverändert: fünf Dollar pro Million Input-Tokens, 25 Dollar pro Million Output-Tokens. Auf SWE-bench Pro legt das Modell von 53,4 auf 64,3 Prozent zu, auf SWE-bench Verified von 80,8 auf 87,6 Prozent. Bei Tool-Use (MCP-Atlas) führt Opus 4.7 mit 9,2 Punkten Vorsprung vor GPT-5.4. Bei GPQA Diamond liegen alle drei Top-Modelle im Rauschbereich um 94 Prozent. Nur bei Web-Recherche (BrowseComp) hat GPT-5.4 einen klaren Vorsprung.

Das sind beeindruckende Zahlen. Und doch beschreibt die Community das neue Modell nicht als Fortschritt, sondern als **"un-nerfed 4.6"** — also als Wiederherstellung einer Leistung, die zuvor heimlich abgebaut worden sei. Was war passiert?

In den Wochen vor dem Launch hatten immer mehr Entwickler öffentlich dokumentiert, dass Claude Opus 4.6 schlechter geworden sei. Eine Analyse von 6.800 Sessions kam zu dem Schluss, dass die "Reasoning-Tiefe" um 67 Prozent eingebrochen sei. Ein viel geteilter Retest zeigte den Absturz von Platz zwei mit 83,3 Prozent Genauigkeit auf Platz zehn mit 68,3 Prozent. Die Community prägte einen Begriff dafür: **"AI Shrinkflation"** — gleicher Preis, weniger Leistung.

> [!warning] Das Muster der stillen Verschlechterung
> Entwickler werfen Anthropic vor, Modelle nach dem Launch unauffällig zu beschneiden. Gleicher API-Name, gleicher Preis, aber weniger Rechenaufwand pro Anfrage. Anthropic bestreitet das in dieser Form, räumt aber ein, den Default-"Effort"-Level auf "medium" gesenkt zu haben — kommuniziert, nicht heimlich, so die offizielle Darstellung.

Boris Cherny, der bei Anthropic Claude Code leitet, reagierte schließlich auf ein offenes GitHub-Issue und stellte klar: Es habe keine heimlichen Nerfs gegeben, wohl aber eine Anpassung der Default-Parameter zugunsten geringerer Token-Kosten. Diese Anpassung sei kommuniziert worden. Die Entwickler-Community ließ sich davon nur teilweise beruhigen. Denn selbst wenn die offizielle Erklärung stimmt, bleibt eine Frage: **Wenn das Standardverhalten eines Modells sich ohne Vorwarnung ändert, was bedeutet das für Produkte, die darauf aufbauen?**

Ich erkenne dieses Muster aus meiner eigenen Arbeit. Wer KI in produktive Anwendungen integriert, baut auf Vertrauen auf. Man verlässt sich darauf, dass ein Modell heute ähnlich reagiert wie gestern. Diese Annahme ist fundamental, und sie wird durch solche Vorgänge erschüttert. Das ist kein technisches Problem. Es ist ein Vertrauensproblem.

## Mythos: Das Modell, das nicht veröffentlicht werden soll

Während Opus 4.7 die Schlagzeilen bestimmt, liegt die eigentlich interessantere Geschichte eine Schicht darunter. Anthropic hat Opus 4.7 selbst als "weniger breit einsetzbar" als ein anderes, nicht öffentliches Modell beschrieben: **Claude Mythos Preview.**

Mythos ist kein Produkt. Es ist ein Forschungsmodell, das laut Anthropic einen "fundamentalen Sprung" in den Fähigkeiten markiert — insbesondere im Bereich Cybersecurity. Das Modell hat tausende High-Security-Schwachstellen gefunden, einige davon über 20 Jahre alt. Es kann autonom Zero-Day-Exploits schreiben. Fortune bezeichnet es als "step change in capabilities". Axios berichtet, dass Anthropic das Modell zurückhält, weil seine Hacking-Fähigkeiten zu mächtig seien.

Stattdessen gibt es ein Programm namens **Project Glasswing**: Über 50 ausgewählte Organisationen — zwölf große Technologie-Unternehmen und über 40 Betreiber kritischer Software — erhalten Zugang zu Mythos, zusammen mit Credits im Wert von über 100 Millionen Dollar. Das Ziel: Defensive Härtung, bevor die Offensive aufholt.

Das allein wäre eine bemerkenswerte Nachricht. Aber die Geschichte geht weiter. Axios meldete am 19. April, dass die NSA trotz einer Blacklist Verhandlungen über den Zugang zu Mythos aufgenommen hat. Das Weiße Haus, zitiert in einem Bericht vom 16. April, verhandelt direkt mit Anthropic. Ein Modell, das zu gefährlich für die Öffentlichkeit ist, wird offenbar doch für Geheimdienste interessant genug, um Richtlinien zu überdenken.

> [!tip] Die neue Logik der KI-Freigabe
> Die Industrie bewegt sich von der Frage "Wie machen wir das Modell öffentlich verfügbar?" zu "Wer bekommt Zugang — und unter welchen Bedingungen?". Exklusiver Zugang, abgestufte Sicherheitsstufen und Ko-Operationen mit Staaten lösen das Prinzip der offenen API ab.

Diese Verschiebung sollte man nicht übersehen. Das Modell der "API für alle, die zahlen können" war das Fundament der KI-Ökonomie der letzten Jahre. Wenn Anthropic sein bestes Modell bewusst zurückhält und es stattdessen in einem geschlossenen Kreis verteilt, dann ist das nicht nur eine Sicherheitsentscheidung. Es ist eine strategische Entscheidung darüber, wer über die Anwendung der stärksten KI-Systeme verfügt.

## Die unsichtbare Preiserhöhung

Während die großen Linien neu gezogen werden, läuft im Hintergrund eine Veränderung, die auf jeden Entwickler direkt durchschlägt. Opus 4.7 verwendet einen neuen Tokenizer. Derselbe Text wird bei diesem Modell in bis zu 35 Prozent mehr Tokens zerlegt als beim Vorgänger. Die Preise pro Token bleiben gleich — was bedeutet: **Die effektiven Kosten steigen um bis zu 35 Prozent, ohne dass die Preisliste sich ändert.**

Ein konkretes Beispiel von finout.io: Ein Produktions-Workload, der zuvor 100 Millionen Tokens pro Tag verarbeitete und 500 Dollar kostete, zahlt jetzt 675 Dollar pro Tag — für dieselbe Arbeit. byteiota dokumentiert bei einem System-Prompt sogar einen Faktor von 1,46 gegenüber Opus 4.6.

Das ist, betriebswirtschaftlich gesehen, eine Preiserhöhung. Sie wird nur nicht so genannt. Und sie trifft vor allem jene, die KI-Kosten in Businesspläne kalkuliert haben und sich auf die offizielle Preisliste verlassen. Für Prompt-Caching gibt es eine Ausnahme — stabile System-Prompts können weiter günstig wiederverwendet werden. Aber der Durchschnittsfall wird teurer.

Ich finde das aus einem bestimmten Grund wichtig: Es zeigt, wie wenig wir über die ökonomische Realität hinter den offiziellen Preisen wissen. Ein Tokenizer ist eine technische Designentscheidung. Aber seine Konsequenzen sind ökonomisch. Und solange Anbieter beides kombinieren können — den technischen Hebel und die Hoheit über die Preiskommunikation — haben Entwickler kaum Mittel, sich zu wehren.

## Die stille Konzentration der Rechenleistung

Hinter diesen Einzelgeschichten steht eine Zahl, die das eigentliche Fundament der Branche beschreibt. Laut einer Analyse von *Superintelligence* vom 18. April kontrollieren inzwischen **fünf Firmen 71 Prozent der globalen KI-Rechenleistung.** Der eigentliche Engpass sei nicht mehr die Verfügbarkeit von Chips, sondern die Erzeugung von Strom.

Das erklärt, warum Microsoft in Narvik, Norwegen, 30.000 Nvidia Vera Rubin Chips mietet — in einer Anlage, die ursprünglich für OpenAI vorgesehen war. Warum OpenAI seine europäischen Stargate-Pläne auf 600 Milliarden Dollar bis 2030 zusammenstreichen musste. Warum das Londoner Rechenzentrum an Google geht. Es geht nicht mehr um die Frage, wer Chips kaufen kann. Es geht um die Frage, wer Zugang zu günstiger, stabiler Energie hat.

**Diese Verschiebung hat politische Konsequenzen, die in den Produkt-Launches untergehen.** Wenn Rechenleistung zum Engpass wird und Energie zum Engpass der Rechenleistung, dann wird die KI-Ökonomie zu einer Ökonomie der Standorte. Wer Wasserkraft hat, bekommt Rechenzentren. Wer die Rechenzentren hat, bekommt Modelle. Wer die Modelle hat, bekommt die wirtschaftliche Wertschöpfung. Europa, das keine dieser drei Bedingungen vollständig erfüllt, droht durch die Maschen zu fallen — eine These, die Lars Hinrichs, Gründer von Xing, in anderem Zusammenhang formuliert hat: "Klassische SaaS-Modelle kippen, Europa verliert den KI-Anschluss."

Die Konzentration ist nicht nur geographisch, sie ist auch institutionell. Von fünf Firmen kontrollierte Infrastruktur ist eine andere Marktkonstellation als die kompetitive Landschaft, die viele sich noch bis vor wenigen Jahren vorgestellt hatten. OpenAI warf Anthropic in einem diese Woche durchgesickerten Memo vor, sein ausgewiesenes Jahresvolumen von 30 Milliarden Dollar um acht Milliarden Dollar aufzublähen. Ob stimmt oder nicht — die Tatsache, dass zwei Unternehmen sich gegenseitig mit geleakten Finanzdokumenten angreifen, zeigt, wie eng der Markt oben geworden ist.

## Die Ära der Spezialmodelle beginnt

Am 17. April hat OpenAI ein weiteres Modell vorgestellt, das zum Muster der Woche passt: **GPT-Rosalind**, benannt nach der Entdeckerin der DNA-Struktur Rosalind Franklin. Es ist das erste spezialisierte Modell von OpenAI für Lebenswissenschaften — Genomik, Protein-Engineering, Chemie. Auf dem BixBench-Benchmark für Bioinformatik führt es unter allen Modellen mit veröffentlichten Werten. In sechs von elf LABBench2-Aufgaben schlägt es GPT-5.4.

Aber der entscheidende Punkt ist nicht die Leistung. Es ist der Zugang. GPT-Rosalind ist keine offene API. Es ist ein **Trusted Access Program** für qualifizierte US-Enterprise-Kunden: Amgen, Moderna, das Allen Institute, Thermo Fisher Scientific. Keine öffentliche Verfügbarkeit. Keine Hobby-Entwickler. Kein Studentenzugang.

Das passt zu einem breiteren Muster. GPT-5.4-Cyber, OpenAIs defensives Sicherheitsmodell, ist nur für verifizierte Security-Experten verfügbar. Claude Mythos kommt über Project Glasswing in geschlossenen Zirkeln. Bei Biotech — einem Bereich, in dem KI-Modelle potenziell gefährliche biologische Strukturen vorschlagen können — wird der Zugang noch enger.

> [!tip] Das neue KI-Ökosystem
> - **Generalisten** (Opus 4.7, GPT-5.4): Breit verfügbar, für die Masse
> - **Spezialisten** (Rosalind, 5.4-Cyber): Nur für qualifizierte Fachkunden
> - **Frontier** (Mythos): Nicht öffentlich, nur ausgewählte Partner
> Diese Dreiteilung wird die nächsten Jahre bestimmen.

Für Entwickler bedeutet das eine fundamentale Veränderung. Der Zugang zu dem jeweils "besten" Modell ist keine Frage des Preises mehr. Es ist eine Frage der Zugehörigkeit. Wer im richtigen Konsortium ist, im richtigen Land, im richtigen Unternehmen, bekommt Zugang. Die anderen arbeiten mit den öffentlichen Modellen — die immer besser werden, aber immer hinter einem wachsenden Spalt zurückbleiben.

## Was mich an dieser Woche beschäftigt

Wenn ich alle diese Geschichten nebeneinander lege — Opus 4.7 und Shrinkflation, Mythos und NSA, Tokenizer und Rechenkonzentration, Rosalind und Trusted Access — dann entsteht kein schönes Bild. Es ist ein Bild wachsender Asymmetrien.

Die Anbieter haben mehr Informationen über ihre Modelle als die Nutzer. Sie können Tokenizer ändern, Default-Parameter anpassen, Modelle zurückhalten oder nur ausgewählt freigeben. Der Markt wird enger. Die Leistung der Spitzenmodelle zieht davon. Der Zugang zur Infrastruktur konzentriert sich auf wenige Standorte mit billiger Energie. Und in dieser Gemengelage wird von Nutzerseite weiter erwartet, dass man "der KI vertraut".

**Vertrauen ist kein Infrastruktur-Feature, das sich einkaufen lässt.** Es muss durch Transparenz und Konsistenz aufgebaut werden. Genau das wird in dieser Woche auf mehreren Ebenen gleichzeitig beschädigt. Die Entwickler-Community merkt es zuerst, weil sie am unmittelbarsten betroffen ist. Aber die gleiche Dynamik wird sich auf Unternehmen ausbreiten, die KI produktiv einsetzen, und am Ende auf Endnutzer, die nie erfahren werden, warum ihr Chatbot heute anders antwortet als gestern.

Hinzu kommt eine zweite Ebene: **KI muss auch transparent bleiben, damit wir ihr vertrauen können.** Wenn ein Modell im April anders antwortet als im Mai, wenn dasselbe Eingabe-Byte plötzlich 35 Prozent teurer wird, wenn das beste Modell nur hinter einer NDA erhältlich ist — dann arbeiten wir nicht mehr mit einem Werkzeug. Wir arbeiten mit einem System, dessen Regeln sich unter uns verschieben.

Die Antwort darauf kann nicht darin bestehen, KI nicht zu nutzen. Sie liegt aber darin, kritisch zu bleiben. Eigene Benchmarks zu führen. Mehrere Anbieter parallel zu beobachten. Bei Kostenrechnungen Puffer einzuplanen. Und bei jedem neuen Launch nicht nur die Benchmark-Zahlen zu lesen, sondern auch die Fußnoten zu den Tokenizer-Änderungen.

## Fazit: Die leise Neuordnung

Diese Woche war keine laute Woche. Kein Modell hat eine Branche revolutioniert. Kein Unternehmen ist gefallen. Und doch ist etwas passiert, das in den nächsten Monaten sichtbar werden wird.

**Die KI-Landschaft teilt sich in drei Zonen auf.** Eine öffentliche Zone mit Generalisten, die immer besser werden, aber immer auch ein Stück weit hinter dem Möglichen zurückbleiben. Eine berufliche Zone mit spezialisierten Modellen, die hinter Qualifikationsbarrieren liegen. Und eine strategische Zone mit Frontier-Modellen, die nicht öffentlich sind und deren Existenz man nur indirekt erfährt.

Gleichzeitig wird die ökonomische Substanz — Rechenleistung, Energie, Kapital — auf wenige Player konzentriert. Die Konkurrenz findet zwischen einer Handvoll Anbietern statt, die sich mit geleakten Memos gegenseitig die Revenue-Zahlen beschädigen. Und die Entwickler-Community, die einmal das Rückgrat dieses Ökosystems war, beobachtet das mit wachsendem Misstrauen.

Was uns bleibt, ist, aufmerksam zu bleiben. Die eigenen Erwartungen zu überprüfen. Benchmarks zu lesen, aber auch die Begleittexte. Vertrauen aufzubauen, wo es verdient ist, und es zu entziehen, wo es gebrochen wird. Und uns daran zu erinnern, dass wir als Nutzer, Entwickler, Lehrende, Forscher nicht nur Empfänger dieser Technologie sind. Wir sind auch diejenigen, die den Kontext bestimmen, in dem sie verwendet wird.

Denn am Ende geht es nicht darum, welches Modell in welchem Benchmark gewinnt. Es geht darum, in welcher Welt wir damit leben wollen.

---

## 🔗 Verwandte Beiträge

- [[2026-04-16-mathematik-werkzeuge-und-die-neue-infrastruktur-der-intelligenz]]
- [[2026-04-13-weltmodelle-fragile-agenten-und-die-seele-der-maschine]]
- [[2026-02-14-preiskampf-sicherheitskrise-web-als-ki-datenbank]]
